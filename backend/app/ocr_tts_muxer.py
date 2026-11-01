"""
DịchPhim AI — Giai đoạn 7:
1. OCR chữ cứng (PaddleOCR lấy mẫu mỗi 0.5 giây ở vùng đáy khung hình, gộp trùng lặp, đối chiếu ASR)
2. Phụ đề song ngữ Trung - Việt + Phiên âm Pinyin
3. Lồng tiếng Việt đa nhân vật (TTS) & Trộn vào track âm thanh
4. Xuất video có gắn phụ đề mềm (Softsub) hoặc đốt phụ đề cứng (Hardsub) bằng FFmpeg
"""

from __future__ import annotations

import difflib
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from backend.app.pipeline_mvp import SubtitleItem


@dataclass
class OcrSampleFrame:
    timestamp_ms: int
    text_zh: str
    confidence: float


def deduplicate_ocr_samples(
    samples: List[OcrSampleFrame], similarity_threshold: float = 0.82
) -> List[SubtitleItem]:
    """
    Gộp các mẫu OCR lấy mỗi 0.5 giây (500ms) ở vùng đáy khung hình (bottom 22% ROI)
    thành các dòng phụ đề hoàn chỉnh có start_ms và end_ms chính xác.
    """
    if not samples:
        return []

    merged: List[SubtitleItem] = []
    cur_start = samples[0].timestamp_ms
    cur_end = samples[0].timestamp_ms + 500
    cur_text = samples[0].text_zh.strip()

    for sample in samples[1:]:
        txt = sample.text_zh.strip()
        if not txt:
            continue
        ratio = difflib.SequenceMatcher(None, cur_text, txt).ratio()
        if ratio >= similarity_threshold and (sample.timestamp_ms - cur_end) <= 1000:
            cur_end = sample.timestamp_ms + 500
            if len(txt) > len(cur_text):
                cur_text = txt
        else:
            if cur_text:
                merged.append(
                    SubtitleItem(
                        index=len(merged) + 1,
                        start_ms=cur_start,
                        end_ms=cur_end,
                        text_zh=cur_text,
                    )
                )
            cur_start = sample.timestamp_ms
            cur_end = sample.timestamp_ms + 500
            cur_text = txt

    if cur_text:
        merged.append(
            SubtitleItem(
                index=len(merged) + 1,
                start_ms=cur_start,
                end_ms=cur_end,
                text_zh=cur_text,
            )
        )
    return merged


def align_asr_with_hardsub_ocr(
    asr_items: List[SubtitleItem], ocr_items: List[SubtitleItem]
) -> List[SubtitleItem]:
    """
    Đối chiếu kết quả nhận dạng âm thanh (ASR) với chữ cứng trên hình (OCR):
    Ưu tiên chữ Hán chính xác từ OCR (tránh lỗi từ đồng âm trong tiếng Trung)
    nhưng giữ nguyên mốc thời gian chuẩn xác của ASR.
    """
    aligned: List[SubtitleItem] = []
    for asr in asr_items:
        overlapping = [
            o
            for o in ocr_items
            if min(asr.end_ms, o.end_ms) - max(asr.start_ms, o.start_ms) > 250
        ]
        if overlapping:
            best_ocr = max(
                overlapping,
                key=lambda o: difflib.SequenceMatcher(None, asr.text_zh, o.text_zh).ratio(),
            )
            aligned.append(
                SubtitleItem(
                    index=asr.index,
                    start_ms=asr.start_ms,
                    end_ms=asr.end_ms,
                    text_zh=best_ocr.text_zh,
                    text_vi=asr.text_vi,
                    confidence=max(asr.confidence, 0.95),
                    speaker=asr.speaker,
                    ai_notes="Đã đối chiếu khớp chữ cứng OCR và âm thanh ASR",
                )
            )
        else:
            aligned.append(asr)
    return aligned


def build_ffmpeg_export_command(
    source_video: Path,
    subtitle_file: Path,
    output_video: Path,
    mode: str = "soft_sub",
    dubbed_audio_wav: Optional[Path] = None,
) -> List[str]:
    """
    Tạo lệnh FFmpeg chuẩn để xuất video:
    - mode="soft_sub": Nhúng track phụ đề mềm (copy luồng video gốc, tốc độ cực nhanh)
    - mode="hard_sub": Đốt phụ đề cứng (ASS/SRT) trực tiếp vào khung hình video
    """
    cmd = ["ffmpeg", "-y", "-i", str(source_video)]
    if dubbed_audio_wav and dubbed_audio_wav.exists():
        cmd.extend(["-i", str(dubbed_audio_wav)])

    if mode == "soft_sub":
        cmd.extend(["-i", str(subtitle_file), "-c:v", "copy", "-c:a", "aac", "-c:s", "mov_text"])
        cmd.append(str(output_video))
    else:
        escaped_sub = str(subtitle_file).replace("\\", "/").replace(":", "\\:")
        vf_filter = f"ass='{escaped_sub}'" if subtitle_file.suffix.lower() == ".ass" else f"subtitles='{escaped_sub}'"
        cmd.extend(["-vf", vf_filter, "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac"])
        cmd.append(str(output_video))
    return cmd
