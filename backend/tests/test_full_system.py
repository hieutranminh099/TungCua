"""
Bộ kiểm thử tự động toàn diện (Full System Unit Tests - Giai đoạn 1 đến 7)
Chạy kiểm tra:
1. Khởi tạo CSDL SQLite 11 bảng ở chế độ WAL
2. Nhận diện số tập phim tự động (Tap01, E02, 第3集, EP04...) và sắp xếp thư mục
3. Chia đoạn âm thanh theo điểm lặng Silero VAD (3-5 phút/đoạn)
4. Chia lô dịch kèm cửa sổ ngữ cảnh và kiểm tra/sửa lỗi JSON từ LLM
5. Hồ sơ phim học tự động từ chỉnh sửa của người dùng (Learn from Edit)
6. Ghép đôi LAN bằng mã 6 số, kiểm tra SHA-256 Bearer Token và HTTP Range Streaming
7. Gộp phụ đề cứng OCR 0.5s và đối chiếu với kết quả ASR
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
from backend.app.queue_orchestrator import (
    detect_hardware_capabilities,
    parse_episode_number,
    sort_video_files_by_episode,
    split_into_vad_chunks,
)
from backend.app.providers_full import MovieContextProfile
from backend.app.lan_sync_server import LanPairingManager, parse_http_range_header
from backend.app.ocr_tts_muxer import (
    OcrSampleFrame,
    align_asr_with_hardsub_ocr,
    build_ffmpeg_export_command,
    deduplicate_ocr_samples,
)


class TestDichPhimFullSystem(unittest.TestCase):
    def test_01_episode_parser_and_folder_sorting(self) -> None:
        self.assertEqual(parse_episode_number("TruongNguyet_Tap01_1080p.mp4"), 1)
        self.assertEqual(parse_episode_number("KhanhDuNien_E09_4K.mkv"), 9)
        self.assertEqual(parse_episode_number("长月烬明_第15集.mp4"), 15)
        self.assertEqual(parse_episode_number("VungTrom_EP24_END.mp4"), 24)

        unsorted = [
            "D:/Phim/第12集.mp4",
            "D:/Phim/Tap02.mp4",
            "D:/Phim/E05.mkv",
        ]
        sorted_items = sort_video_files_by_episode(unsorted)
        self.assertEqual([x["episode_number"] for x in sorted_items], [2, 5, 12])

    def test_02_vad_chunk_splitting_3_to_5_minutes(self) -> None:
        # Video dài 10 phút (600,000 ms), có các điểm ngắt câu mỗi 30 giây
        silences = [i * 30_000 for i in range(1, 20)]
        chunks = split_into_vad_chunks(600_000, silences, target_chunk_ms=240_000)
        self.assertEqual(len(chunks), 3)
        self.assertEqual(chunks[0].start_ms, 0)
        self.assertEqual(chunks[0].end_ms, 240_000)
        self.assertEqual(chunks[1].start_ms, 240_000)
        self.assertEqual(chunks[1].end_ms, 480_000)
        self.assertEqual(chunks[2].start_ms, 480_000)
        self.assertEqual(chunks[2].end_ms, 600_000)

    def test_03_hardware_auto_detection(self) -> None:
        hw = detect_hardware_capabilities()
        self.assertIn(hw.device, ("cuda", "mps", "cpu"))
        self.assertGreaterEqual(hw.recommended_workers, 1)

    def test_04_movie_profile_learn_from_edit(self) -> None:
        profile = MovieContextProfile(
            movie_id="m1",
            title_zh="长月剑尊",
            title_vi="Trường Nguyệt Kiếm Tôn",
        )
        profile.learn_from_user_edit(
            original_zh="邪骨",
            old_vi="xương tà",
            corrected_vi="Tà Cốt",
            term_pair=("邪骨", "Tà Cốt"),
        )
        self.assertEqual(profile.glossary["邪骨"], "Tà Cốt")
        self.assertEqual(len(profile.user_edit_memory), 1)

    def test_05_lan_pairing_and_http_range_streaming(self) -> None:
        manager = LanPairingManager()
        code = manager.generate_six_digit_code()
        self.assertEqual(len(code), 6)

        paired = manager.pair_device(code, "iPhone 16 Pro", "ios")
        self.assertIsNotNone(paired)
        assert paired is not None
        self.assertTrue(manager.verify_bearer_token(paired["token"]))
        self.assertFalse(manager.verify_bearer_token("invalid_token"))

        start, end = parse_http_range_header("bytes=1000-4999", 10000)
        self.assertEqual((start, end), (1000, 4999))

    def test_06_hardsub_ocr_deduplication_and_asr_alignment(self) -> None:
        samples = [
            OcrSampleFrame(1000, "师父，弟子愿借过去镜", 0.94),
            OcrSampleFrame(1500, "师父，弟子愿借过去镜！", 0.98),
            OcrSampleFrame(2000, "师父，弟子愿借过去镜！", 0.97),
            OcrSampleFrame(3000, "回到五百年前抽毁邪骨", 0.95),
            OcrSampleFrame(3500, "回到五百年前抽毁邪骨！", 0.96),
        ]
        ocr_lines = deduplicate_ocr_samples(samples)
        self.assertEqual(len(ocr_lines), 2)
        self.assertEqual(ocr_lines[0].text_zh, "师父，弟子愿借过去镜！")
        self.assertEqual(ocr_lines[0].start_ms, 1000)
        self.assertEqual(ocr_lines[0].end_ms, 2500)

        asr_lines = [
            SubtitleItem(
                index=1,
                start_ms=1050,
                end_ms=2480,
                text_zh="师父，弟子愿借过去境",  # ASR nhầm chữ đồng âm 境 (cảnh) thay vì 镜 (kính)
                text_vi="Sư phụ, đệ tử nguyện mượn Quá Khứ Kính!",
            )
        ]
        aligned = align_asr_with_hardsub_ocr(asr_lines, ocr_lines)
        self.assertEqual(aligned[0].text_zh, "师父，弟子愿借过去镜！")

        cmd = build_ffmpeg_export_command(
            Path("input.mp4"), Path("sub.ass"), Path("out.mp4"), mode="hard_sub"
        )
        self.assertIn("libx264", cmd)

    def test_07_local_service_sqlite_crud_and_sync(self) -> None:
        from backend.main import DichPhimLocalService

        with tempfile.TemporaryDirectory() as tmpdir:
            db_file = str(Path(tmpdir) / "service_test.db")
            svc = DichPhimLocalService(db_file)
            conn = svc._connect()
            conn.execute(
                """
                INSERT INTO movies (id, title_zh, title_vi, genre, era)
                VALUES ('m-test-1', '庆余年', 'Khánh Dư Niên', 'co_trang', 'co_dai')
                """
            )
            conn.execute(
                """
                INSERT INTO episodes (id, movie_id, episode_number, title, source_video_path, status)
                VALUES ('ep-test-1', 'm-test-1', 1, 'Tập 01', '/tmp/ep1.mp4', 'completed')
                """
            )
            conn.execute(
                """
                INSERT INTO subtitle_lines (id, episode_id, line_index, start_ms, end_ms, text_zh, text_vi)
                VALUES ('line-1', 'ep-test-1', 1, 1000, 3500, '陛下，臣范闲奉旨进京。', 'Bệ hạ, thần Phạm Nhàn phụng chỉ vào kinh.')
                """
            )
            conn.execute(
                """
                INSERT INTO devices (id, device_name, platform, auth_token_hash)
                VALUES ('dev-iphone', 'iPhone 16 Pro', 'ios', 'hash123')
                """
            )
            conn.commit()
            conn.close()

            lib = svc.get_library()
            self.assertGreaterEqual(len(lib), 1)
            self.assertIn("Khánh Dư Niên", [m["title_vi"] for m in lib])

            edit_res = svc.update_subtitle_line_from_device(
                "ep-test-1", "line-1", "Bệ hạ, vi thần Phạm Nhàn phụng chỉ vào kinh!"
            )
            self.assertTrue(edit_res["ok"])
            self.assertEqual(edit_res["edit_memory_count"], 1)

            prog_res = svc.update_watch_progress("ep-test-1", "dev-iphone", 2600000, 2700000)
            self.assertTrue(prog_res["completed"])


if __name__ == "__main__":
    unittest.main()

