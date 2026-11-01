"""
DịchPhim AI — Giai đoạn 1 (MVP Pipeline):
Xử lý 1 video từ đầu đến cuối:
1. Trích âm thanh bằng FFmpeg (16kHz mono WAV)
2. Phát hiện giọng nói (Silero VAD) & Chia đoạn
3. Nhận dạng tiếng Trung (faster-whisper với language="zh")
4. Chia lô kèm cửa sổ ngữ cảnh (5-10 câu trước, 3-5 câu sau) & Dịch bằng LLM JSON
5. Ràng buộc phụ đề (tối đa 42 ký tự/dòng, tối đa 2 dòng, CPS <= 17) & Xuất SRT / ASS / VTT
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable, List, Optional

# Ngăn lỗi xung đột OpenMP trên Windows khi dùng chung torch và ctranslate2
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")


@dataclass
class SubtitleItem:
    index: int
    start_ms: int
    end_ms: int
    text_zh: str
    text_vi: str = ""
    confidence: float = 1.0
    speaker: str = ""
    ai_notes: str = ""

    @property
    def duration_sec(self) -> float:
        return max(0.5, (self.end_ms - self.start_ms) / 1000.0)

    @property
    def cps(self) -> float:
        clean_text = self.text_vi.replace("\n", "")
        return round(len(clean_text) / self.duration_sec, 1)


@dataclass
class TranslationBatch:
    batch_index: int
    context_before: List[SubtitleItem]
    target_lines: List[SubtitleItem]
    context_after: List[SubtitleItem]


# ============================================================================
# BƯỚC 1: TRÍCH XUẤT ÂM THANH (FFmpeg 16kHz Mono WAV)
# ============================================================================
def extract_audio_ffmpeg(video_path: Path, output_wav_path: Path) -> Path:
    """
    Trích xuất âm thanh từ file video sang định dạng WAV 16kHz, 1 kênh (mono)
    tối ưu cho Silero VAD và faster-whisper.
    """
    if not video_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file video đầu vào: {video_path}")

    if shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "Không tìm thấy công cụ FFmpeg trong hệ thống. "
            "Vui lòng cài đặt bằng lệnh: winget install Gyan.FFmpeg"
        )

    output_wav_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        str(output_wav_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg trích xuất âm thanh thất bại:\n{result.stderr}")
    return output_wav_path


# ============================================================================
# BƯỚC 2 & 3: VAD + ASR TIẾNG TRUNG (faster-whisper)
# ============================================================================
def transcribe_chinese_audio(
    wav_path: Path,
    model_size: str = "large-v3",
    device: str = "auto",
    on_progress: Optional[Callable[[int, str], None]] = None,
) -> List[SubtitleItem]:
    """
    Nhận dạng giọng nói tiếng Trung bằng faster-whisper tích hợp Silero VAD.
    Tự động chọn CUDA nếu khả dụng, hoặc lùi về CPU int8 nếu thiếu VRAM.
    """
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Chưa cài đặt thư viện faster-whisper. Hãy chạy: pip install faster-whisper"
        ) from exc

    compute_type = "float16" if device == "cuda" else "int8"
    try:
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
    except Exception:
        # Nếu hết VRAM hoặc không có GPU CUDA, tự động chuyển về CPU int8
        model = WhisperModel("medium", device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        str(wav_path),
        language="zh",
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=400, speech_pad_ms=200),
        word_timestamps=True,
    )

    total_duration = max(1.0, getattr(info, "duration", 100.0))
    items: List[SubtitleItem] = []

    for idx, seg in enumerate(segments, start=1):
        start_ms = int(round(seg.start * 1000))
        end_ms = int(round(seg.end * 1000))
        text_zh = seg.text.strip()
        if not text_zh:
            continue
        items.append(
            SubtitleItem(
                index=len(items) + 1,
                start_ms=start_ms,
                end_ms=max(start_ms + 500, end_ms),
                text_zh=text_zh,
            )
        )
        if on_progress:
            pct = min(99, int((seg.end / total_duration) * 100))
            on_progress(pct, f"Đã nhận dạng câu #{len(items)}: {text_zh[:20]}...")

    return items


# ============================================================================
# BƯỚC 4: CHIA LÔ DỊCH KÈM CỬA SỔ NGỮ CẢNH & PARSE JSON BỀN BỈ
# ============================================================================
def build_translation_batches(
    items: List[SubtitleItem],
    batch_size: int = 20,
    context_before_count: int = 8,
    context_after_count: int = 4,
) -> List[TranslationBatch]:
    """
    Chia danh sách phụ đề thành các lô (batches), mỗi lô đính kèm:
    - context_before: 5-10 câu trước (chỉ để tham khảo ngữ cảnh)
    - target_lines: các câu cần dịch
    - context_after: 3-5 câu sau (chỉ để tham khảo ngữ cảnh)
    """
    if batch_size <= 0:
        raise ValueError("batch_size phải lớn hơn 0")

    batches: List[TranslationBatch] = []
    total = len(items)
    for start_idx in range(0, total, batch_size):
        end_idx = min(total, start_idx + batch_size)
        ctx_start = max(0, start_idx - context_before_count)
        ctx_end = min(total, end_idx + context_after_count)

        batches.append(
            TranslationBatch(
                batch_index=len(batches) + 1,
                context_before=items[ctx_start:start_idx],
                target_lines=items[start_idx:end_idx],
                context_after=items[end_idx:ctx_end],
            )
        )
    return batches


def parse_and_validate_llm_json(raw_text: str) -> List[dict]:
    """
    Làm sạch và kiểm tra JSON trả về từ LLM (kể cả khi LLM bọc trong ```json ... ```).
    Đảm bảo mỗi phần tử có đủ: index/id, text_vi, confidence.
    """
    cleaned = raw_text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    data = json.loads(cleaned)
    if isinstance(data, dict) and "translations" in data:
        data = data["translations"]

    if not isinstance(data, list):
        raise ValueError("Đầu ra LLM JSON phải là một mảng (list) các câu dịch.")

    validated: List[dict] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        line_id = row.get("index", row.get("id"))
        text_vi = str(row.get("text_vi", "")).strip()
        if line_id is None or not text_vi:
            raise ValueError(f"Phần tử JSON thiếu index/id hoặc text_vi: {row}")
        confidence = float(row.get("confidence", 0.9))
        confidence = max(0.0, min(1.0, confidence))
        validated.append(
            {
                "index": int(line_id) if str(line_id).isdigit() else line_id,
                "text_vi": text_vi,
                "confidence": confidence,
                "ai_notes": str(row.get("ai_notes", "")).strip(),
            }
        )
    return validated


# ============================================================================
# BƯỚC 5: ĐỊNH DẠNG DÒNG PHỤ ĐỀ (<= 42 KÝ TỰ/DÒNG, TỐI ĐA 2 DÒNG) & XUẤT SRT/ASS/VTT
# ============================================================================
def wrap_subtitle_lines(text: str, max_chars_per_line: int = 42, max_lines: int = 2) -> str:
    """
    Tự động ngắt dòng cân đối để mỗi dòng không quá 42 ký tự và tối đa 2 dòng.
    """
    words = text.strip().split()
    if not words:
        return ""

    joined = " ".join(words)
    if len(joined) <= max_chars_per_line:
        return joined

    # Tìm vị trí ngắt dòng gần điểm giữa câu nhất sao cho dòng 1 <= max_chars_per_line
    mid = len(joined) // 2
    best_split = -1
    current_len = 0
    for i, w in enumerate(words[:-1]):
        current_len += len(w) + (1 if i > 0 else 0)
        if current_len <= max_chars_per_line:
            best_split = i + 1
            if current_len >= mid:
                break

    if best_split == -1:
        best_split = 1

    line1 = " ".join(words[:best_split])
    line2 = " ".join(words[best_split:])

    if max_lines == 1:
        return joined[:max_chars_per_line]

    if len(line2) > max_chars_per_line:
        line2 = line2[: max_chars_per_line - 1].rstrip() + "…"

    return f"{line1}\n{line2}"


def format_srt_timestamp(ms: int) -> str:
    """Định dạng thời gian chuẩn SubRip (HH:MM:SS,mmm)."""
    if ms < 0:
        ms = 0
    hours = ms // 3_600_000
    rem = ms % 3_600_000
    minutes = rem // 60_000
    rem = rem % 60_000
    seconds = rem // 1_000
    millis = rem % 1_000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def format_vtt_timestamp(ms: int) -> str:
    """Định dạng thời gian chuẩn WebVTT (HH:MM:SS.mmm)."""
    return format_srt_timestamp(ms).replace(",", ".")


def format_ass_timestamp(ms: int) -> str:
    """Định dạng thời gian chuẩn Advanced SubStation Alpha (H:MM:SS.cc)."""
    if ms < 0:
        ms = 0
    hours = ms // 3_600_000
    rem = ms % 3_600_000
    minutes = rem // 60_000
    rem = rem % 60_000
    seconds = rem // 1_000
    centiseconds = (rem % 1_000) // 10
    return f"{hours}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"


def export_srt_content(items: List[SubtitleItem], bilingual: bool = False) -> str:
    blocks: List[str] = []
    for idx, item in enumerate(items, start=1):
        start_str = format_srt_timestamp(item.start_ms)
        end_str = format_srt_timestamp(item.end_ms)
        vi_wrapped = wrap_subtitle_lines(item.text_vi or item.text_zh)
        body = f"{vi_wrapped}\n{item.text_zh}" if bilingual else vi_wrapped
        blocks.append(f"{idx}\n{start_str} --> {end_str}\n{body}\n")
    return "\n".join(blocks)
