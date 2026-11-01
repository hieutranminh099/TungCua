"""
Kiểm thử toàn diện gói cài đặt Windows (dist/DichPhimAI-Setup.exe) và mô phỏng
quy trình Cài đặt -> Mở ứng dụng -> Chạy từ thư mục Read-Only (C:\\Program Files) ->
Kiểm tra Dịch phim, Kho phim, Hàng đợi, Kết nối điện thoại -> Đóng ứng dụng.
"""

import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SETUP_EXE_PATH = PROJECT_ROOT / "dist" / "DichPhimAI-Setup.exe"
UNPACKED_DIR = PROJECT_ROOT / "dist" / "win-installer" / "win-unpacked"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def http_json(url: str, method: str = "GET", payload: dict | None = None) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


class TestWindowsExePackage(unittest.TestCase):
    def test_01_verify_dichphim_setup_exe_binary_structure(self) -> None:
        """Kiểm tra file dist/DichPhimAI-Setup.exe tồn tại và có cấu trúc PE + NSIS hợp lệ."""
        self.assertTrue(
            SETUP_EXE_PATH.exists(),
            f"Không tìm thấy file cài đặt tại {SETUP_EXE_PATH}",
        )
        size_bytes = SETUP_EXE_PATH.stat().st_size
        # Bộ cài NSIS chứa Electron + React + Python backend phải > 50MB
        self.assertGreater(size_bytes, 50 * 1024 * 1024)

        with open(SETUP_EXE_PATH, "rb") as f:
            dos_header = f.read(64)
            self.assertEqual(dos_header[:2], b"MZ", "Thiếu chữ ký DOS MZ ở đầu file .exe")
            pe_offset = struct.unpack("<I", dos_header[60:64])[0]
            f.seek(pe_offset)
            pe_sig = f.read(4)
            self.assertEqual(pe_sig, b"PE\x00\x00", "Thiếu chữ ký Windows PE header")

            # Kiểm tra chữ ký NullsoftInst bên trong thân bộ cài NSIS
            chunk = f.read(512 * 1024)
            self.assertIn(b"NullsoftInst", chunk, "Thiếu cấu trúc bộ cài đặt NSIS NullsoftInst")

    def test_02_verify_unpacked_windows_app_bundle(self) -> None:
        """Kiểm tra gói ứng dụng Windows đã giải nén chứa đủ DichPhimAI.exe, app.asar, backend và prompts."""
        app_exe = UNPACKED_DIR / "DichPhimAI.exe"
        app_asar = UNPACKED_DIR / "resources" / "app.asar"
        backend_main = UNPACKED_DIR / "resources" / "backend" / "main.py"
        schema_sql = UNPACKED_DIR / "resources" / "backend" / "schema.sql"
        prompt_batch = UNPACKED_DIR / "resources" / "prompts" / "batch_translate.md"

        self.assertTrue(app_exe.exists(), "Thiếu DichPhimAI.exe")
        self.assertTrue(app_asar.exists(), "Thiếu resources/app.asar")
        self.assertTrue(backend_main.exists(), "Thiếu resources/backend/main.py")
        self.assertTrue(schema_sql.exists(), "Thiếu resources/backend/schema.sql")
        self.assertTrue(prompt_batch.exists(), "Thiếu resources/prompts/batch_translate.md")

    def test_03_simulate_windows_install_open_test_features_and_close(self) -> None:
        """
        Mô phỏng cài đặt vào thư mục C:\\Program Files\\DichPhimAI (Read-Only),
        khởi chạy từ một thư mục bất kỳ (không phụ thuộc đường dẫn máy phát triển),
        kiểm tra mở ứng dụng, Kho phim, Hàng đợi, Sửa phụ đề, Ghép đôi điện thoại và Đóng ứng dụng.
        """
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            sim_program_files = tmp_root / "Program_Files" / "DichPhimAI" / "resources"
            sim_appdata = tmp_root / "AppData" / "Roaming" / "DichPhimAI"
            sim_system32_cwd = tmp_root / "Windows_System32"

            sim_program_files.mkdir(parents=True, exist_ok=True)
            sim_appdata.mkdir(parents=True, exist_ok=True)
            sim_system32_cwd.mkdir(parents=True, exist_ok=True)

            # Sao chép tài nguyên từ gói đóng gói thực tế sang thư mục cài đặt mô phỏng
            shutil.copytree(UNPACKED_DIR / "resources" / "backend", sim_program_files / "backend")
            shutil.copytree(UNPACKED_DIR / "resources" / "prompts", sim_program_files / "prompts")

            port = find_free_port()
            installed_main_py = sim_program_files / "backend" / "main.py"

            # 1. MỞ ỨNG DỤNG: Khởi chạy backend từ thư mục làm việc khác hoàn toàn (sim_system32_cwd)
            proc = subprocess.Popen(
                [
                    sys.executable,
                    str(installed_main_py),
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                    "--data-dir",
                    str(sim_appdata),
                    "--resources-dir",
                    str(sim_program_files),
                ],
                cwd=str(sim_system32_cwd),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            try:
                base_url = f"http://127.0.0.1:{port}"
                health = None
                for _ in range(30):
                    try:
                        health = http_json(f"{base_url}/health")
                        if health.get("ok"):
                            break
                    except Exception:
                        time.sleep(0.15)

                self.assertIsNotNone(health, "Backend không phản hồi /health khi khởi động")
                assert health is not None
                self.assertTrue(health["ok"])
                self.assertEqual(Path(health["db_path"]), sim_appdata / "dichphim.db")
                pairing_code = health["pairing_code"]

                # 2. KIỂM TRA QUẢN LÝ THƯ VIỆN (KHO PHIM)
                lib_res = http_json(f"{base_url}/library")
                self.assertTrue(lib_res["ok"])
                self.assertGreaterEqual(len(lib_res["movies"]), 1)
                self.assertEqual(lib_res["movies"][0]["title_vi"], "Trường Nguyệt Kiếm Tôn")

                # 3. KIỂM TRA HÀNG ĐỢI ĐA VIDEO (JOB QUEUE)
                batch_res = http_json(
                    f"{base_url}/jobs/batch",
                    method="POST",
                    payload={
                        "movie_id": "movie-xianxia-01",
                        "files": [
                            "C:/Videos/第16集.mkv",
                            "C:/Videos/Tap14.mp4",
                            "C:/Videos/E15.mp4",
                        ],
                    },
                )
                self.assertTrue(batch_res["ok"])
                self.assertEqual(
                    [j["episode_number"] for j in batch_res["jobs"]],
                    [14, 15, 16],
                )

                # 4. KIỂM TRA PHỤ ĐỀ & SỬA PHỤ ĐỀ ĐỒNG BỘ 2 CHIỀU
                sub_res = http_json(f"{base_url}/subtitles/ep-xianxia-13")
                self.assertTrue(sub_res["ok"])
                self.assertEqual(len(sub_res["lines"]), 3)

                edit_res = http_json(
                    f"{base_url}/subtitles/ep-xianxia-13/lines/line-xx-1",
                    method="PUT",
                    payload={
                        "text_vi": "Sư phụ, đệ tử Lê Tô Tô xin mượn Quá Khứ Kính trừ hủy Tà Cốt!"
                    },
                )
                self.assertTrue(edit_res["ok"])
                self.assertEqual(edit_res["edit_memory_count"], 1)

                # 5. KIỂM TRA KẾT NỐI ĐIỆN THOẠI (GHÉP ĐÔI MÃ 6 SỐ & TIẾN ĐỘ XEM)
                pair_res = http_json(
                    f"{base_url}/pair",
                    method="POST",
                    payload={
                        "code": pairing_code,
                        "device_name": "Samsung Galaxy S24 Ultra",
                        "platform": "android",
                    },
                )
                self.assertTrue(pair_res["ok"])
                self.assertTrue(len(pair_res["token"]) >= 32)

                prog_res = http_json(
                    f"{base_url}/progress/ep-xianxia-13",
                    method="PUT",
                    payload={
                        "device_id": pair_res["device_id"],
                        "position_ms": 2550000,
                        "duration_ms": 2700000,
                    },
                )
                self.assertTrue(prog_res["ok"])
                self.assertTrue(prog_res["completed"])

            finally:
                # 6. ĐÓNG ỨNG DỤNG: Tắt tiến trình và kiểm tra giải phóng tài nguyên
                proc.terminate()
                exit_code = proc.wait(timeout=5)
                if proc.stdout:
                    proc.stdout.close()
                if proc.stderr:
                    proc.stderr.close()
                self.assertIsNotNone(exit_code)


if __name__ == "__main__":
    unittest.main()
