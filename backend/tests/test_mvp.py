"""
Unit Tests cho các thành phần cốt lõi của DịchPhim AI:
1. Khởi tạo CSDL SQLite (11 bảng + Indexes + WAL)
2. Chia lô dịch kèm cửa sổ ngữ cảnh (5-10 câu trước, 3-5 câu sau)
3. Parse và kiểm tra JSON trả về từ LLM (kể cả khi bọc trong markdown code fence)
4. Ngắt dòng phụ đề (<= 42 ký tự/dòng, tối đa 2 dòng) và xuất SRT/ASS/VTT chuẩn thời gian
"""

import tempfile
import unittest
from pathlib import Path

from backend.init_db import initialize_database
from backend.app.pipeline_mvp import (
    SubtitleItem,
    build_translation_batches,
    export_srt_content,
    format_ass_timestamp,
    format_srt_timestamp,
    format_vtt_timestamp,
    parse_and_validate_llm_json,
    wrap_subtitle_lines,
)


class TestDichPhimCore(unittest.TestCase):
    def test_database_schema_initialization(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test_dichphim.db"
            tables = initialize_database(db_path=db_path)
            expected = {
                "characters",
                "devices",
                "episodes",
                "glossary",
                "job_steps",
                "jobs",
                "movies",
                "relationships",
                "settings",
                "subtitle_lines",
                "watch_progress",
            }
            self.assertTrue(expected.issubset(set(tables)))

    def test_batch_chunker_with_context_window(self) -> None:
        items = [
            SubtitleItem(
                index=i,
                start_ms=i * 2000,
                end_ms=i * 2000 + 1800,
                text_zh=f"第{i}句台词",
            )
            for i in range(1, 16)
        ]
        batches = build_translation_batches(
            items, batch_size=5, context_before_count=3, context_after_count=2
        )
        self.assertEqual(len(batches), 3)
        # Lô 1: không có câu trước, có 5 câu đích, 2 câu sau
        self.assertEqual(len(batches[0].context_before), 0)
        self.assertEqual(len(batches[0].target_lines), 5)
        self.assertEqual(len(batches[0].context_after), 2)
        # Lô 2: có 3 câu trước (câu 3, 4, 5), 5 câu đích (6..10), 2 câu sau (11, 12)
        self.assertEqual([x.index for x in batches[1].context_before], [3, 4, 5])
        self.assertEqual([x.index for x in batches[1].target_lines], [6, 7, 8, 9, 10])
        self.assertEqual([x.index for x in batches[1].context_after], [11, 12])

    def test_parse_llm_json_with_markdown_fence(self) -> None:
        raw_output = """```json
        [
          {
            "index": 1,
            "text_vi": "Sư phụ, đệ tử nguyện mượn Quá Khứ Kính!",
            "confidence": 0.96,
            "ai_notes": "Xưng hô Sư phụ - Đệ tử"
          }
        ]
        ```"""
        parsed = parse_and_validate_llm_json(raw_output)
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["index"], 1)
        self.assertAlmostEqual(parsed[0]["confidence"], 0.96)

    def test_subtitle_wrapping_and_timestamps(self) -> None:
        # Kiểm tra định dạng thời gian khi vượt quá 1 phút (75420 ms = 1 phút 15 giây 420 ms)
        self.assertEqual(format_srt_timestamp(75420), "00:01:15,420")
        self.assertEqual(format_vtt_timestamp(75420), "00:01:15.420")
        self.assertEqual(format_ass_timestamp(75420), "0:01:15.42")

        # Kiểm tra ngắt dòng <= 42 ký tự
        long_vi = "Sư phụ, đệ tử nguyện mượn Quá Khứ Kính về năm trăm năm trước hủy Tà Cốt!"
        wrapped = wrap_subtitle_lines(long_vi, max_chars_per_line=42, max_lines=2)
        lines = wrapped.split("\n")
        self.assertLessEqual(len(lines), 2)
        for line in lines:
            self.assertLessEqual(len(line), 42)

        # Kiểm tra xuất SRT song ngữ
        sample = [
            SubtitleItem(
                index=1,
                start_ms=2000,
                end_ms=5500,
                text_zh="师父，弟子愿借过去镜！",
                text_vi="Sư phụ, đệ tử nguyện mượn Quá Khứ Kính!",
            )
        ]
        srt_text = export_srt_content(sample, bilingual=True)
        self.assertIn("00:00:02,000 --> 00:00:05,500", srt_text)
        self.assertIn("Sư phụ, đệ tử nguyện mượn Quá Khứ Kính!", srt_text)
        self.assertIn("师父，弟子愿借过去镜！", srt_text)


if __name__ == "__main__":
    unittest.main()
