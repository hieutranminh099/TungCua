"""
DịchPhim AI — Giai đoạn 2:
Hàng đợi nhiều video (Persistent SQLite Job Queue), Tự nhận diện số tập (Tap01, E02, 第3集),
Tự phát hiện GPU (CUDA / Apple Silicon MPS / CPU), Chia nhỏ video theo VAD (3-5 phút/đoạn),
Xử lý song song đa luồng và Phục hồi từ Checkpoint khi gián đoạn.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional


@dataclass
class HardwareProfile:
    device: str                  # "cuda" | "mps" | "cpu"
    device_name: str
    cpu_cores: int
    ram_gb: float
    vram_gb: float
    recommended_asr_model: str   # "large-v3" | "medium"
    recommended_workers: int
    warning_vi: Optional[str] = None


def detect_hardware_capabilities() -> HardwareProfile:
    """
    Tự động phát hiện NVIDIA CUDA, Apple Silicon (MPS), hoặc CPU và đề xuất
    số lượng worker cùng model faster-whisper phù hợp với dung lượng VRAM/RAM.
    """
    cpu_cores = os.cpu_count() or 4
    ram_gb = 16.0
    try:
        import psutil  # type: ignore
        ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    except Exception:
        pass

    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            vram_gb = round(props.total_memory / (1024 ** 3), 1)
            asr_model = "large-v3" if vram_gb >= 6.0 else "medium"
            workers = min(6, max(2, int(vram_gb // 3)))
            return HardwareProfile(
                device="cuda",
                device_name=props.name,
                cpu_cores=cpu_cores,
                ram_gb=ram_gb,
                vram_gb=vram_gb,
                recommended_asr_model=asr_model,
                recommended_workers=workers,
            )
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return HardwareProfile(
                device="mps",
                device_name="Apple Silicon GPU (Metal/MPS)",
                cpu_cores=cpu_cores,
                ram_gb=ram_gb,
                vram_gb=ram_gb,
                recommended_asr_model="large-v3" if ram_gb >= 16 else "medium",
                recommended_workers=3,
            )
    except Exception:
        pass

    return HardwareProfile(
        device="cpu",
        device_name=f"CPU ({cpu_cores} luồng)",
        cpu_cores=cpu_cores,
        ram_gb=ram_gb,
        vram_gb=0.0,
        recommended_asr_model="medium",
        recommended_workers=max(1, min(3, cpu_cores // 2)),
        warning_vi=(
            "Không phát hiện GPU rời (NVIDIA CUDA / Apple Silicon). Hệ thống tự động "
            "chuyển sang chế độ CPU int8 với model 'medium' để đảm bảo tốc độ ổn định."
        ),
    )


def parse_episode_number(filename: str, default_index: int = 1) -> int:
    """
    Tự động nhận biết số tập phim từ tên file:
    Hỗ trợ: Tap01, Tập 02, E03, EP04, 第5集, 第06话, _07.mp4, [08]...
    """
    base = Path(filename).stem
    patterns = [
        r"(?:tap|tập|ep|episode|e)[\s_.-]*0*(\d{1,4})",
        r"第\s*0*(\d{1,4})\s*[集话期]",
        r"[\[\(_\s-]0*(\d{1,3})[\]\)\s_.-]",
        r"0*(\d{1,3})$",
    ]
    for pat in patterns:
        match = re.search(pat, base, flags=re.IGNORECASE)
        if match:
            return int(match.group(1))
    return default_index


def sort_video_files_by_episode(file_paths: List[str]) -> List[Dict[str, object]]:
    """
    Nhận danh sách đường dẫn video khi kéo thả cả thư mục, trích xuất số tập
    và sắp xếp theo đúng thứ tự tăng dần.
    """
    parsed = []
    for idx, p in enumerate(file_paths, start=1):
        ep_num = parse_episode_number(Path(p).name, default_index=idx)
        parsed.append({"path": p, "filename": Path(p).name, "episode_number": ep_num})
    parsed.sort(key=lambda x: (int(x["episode_number"]), str(x["filename"])))
    return parsed


@dataclass
class VadAudioChunk:
    chunk_index: int
    start_ms: int
    end_ms: int

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms


def split_into_vad_chunks(
    total_duration_ms: int,
    silence_points_ms: List[int],
    target_chunk_ms: int = 240_000,  # 4 phút (trong khoảng 3-5 phút)
) -> List[VadAudioChunk]:
    """
    Chia nhỏ video dài thành các đoạn 3-5 phút tại đúng các điểm ngắt câu (VAD silence)
    để xử lý đồng thời rồi ghép lại chuẩn timestamp mà không làm đứt câu thoại.
    """
    if total_duration_ms <= target_chunk_ms:
        return [VadAudioChunk(chunk_index=1, start_ms=0, end_ms=total_duration_ms)]

    chunks: List[VadAudioChunk] = []
    current_start = 0
    sorted_silences = sorted(s for s in silence_points_ms if 0 < s < total_duration_ms)

    while current_start < total_duration_ms:
        ideal_end = current_start + target_chunk_ms
        if ideal_end >= total_duration_ms:
            chunks.append(
                VadAudioChunk(
                    chunk_index=len(chunks) + 1,
                    start_ms=current_start,
                    end_ms=total_duration_ms,
                )
            )
            break

        # Tìm điểm lặng âm gần ideal_end nhất trong khoảng [3 phút, 5 phút]
        min_bound = current_start + 180_000
        max_bound = min(total_duration_ms, current_start + 300_000)
        candidates = [s for s in sorted_silences if min_bound <= s <= max_bound]
        chosen_end = (
            min(candidates, key=lambda s: abs(s - ideal_end))
            if candidates
            else min(total_duration_ms, ideal_end)
        )
        chunks.append(
            VadAudioChunk(
                chunk_index=len(chunks) + 1,
                start_ms=current_start,
                end_ms=chosen_end,
            )
        )
        current_start = chosen_end

    return chunks


class PersistentJobQueue:
    """
    Hàng đợi công việc lưu bền trong SQLite:
    Hỗ trợ thêm, tạm dừng, tiếp tục từ checkpoint, đổi độ ưu tiên, hủy, thử lại khi lỗi.
    """

    def __init__(self, db_path: Path):
        self.db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        return conn

    def save_step_checkpoint(
        self, job_id: str, step_code: str, progress: float, checkpoint_data: dict
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE job_steps
                SET status = 'running',
                    progress = ?,
                    checkpoint_json = ?
                WHERE job_id = ? AND step_code = ?;
                """,
                (
                    progress,
                    json.dumps(checkpoint_data, ensure_ascii=False),
                    job_id,
                    step_code,
                ),
            )
            conn.commit()

    def load_step_checkpoint(self, job_id: str, step_code: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT checkpoint_json FROM job_steps WHERE job_id = ? AND step_code = ?;",
                (job_id, step_code),
            ).fetchone()
            if row and row["checkpoint_json"]:
                return json.loads(row["checkpoint_json"])
        return None
