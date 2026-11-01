"""
Script khởi tạo cơ sở dữ liệu SQLite (chế độ WAL) và nạp cấu hình mặc định
cho ứng dụng DịchPhim AI.
Hỗ trợ giải quyết đường dẫn động (Dynamic Path Resolution) khi đóng gói Electron / PyInstaller
để không phụ thuộc vào đường dẫn trên máy phát triển.
"""

import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Optional


def resolve_resources_dir() -> Path:
    """
    Tìm thư mục chứa tài nguyên tĩnh (schema.sql, prompts):
    1. Biến môi trường DICHPHIM_RESOURCES_DIR (do Electron truyền vào từ process.resourcesPath)
    2. Thư mục giải nén tạm của PyInstaller (sys._MEIPASS)
    3. Thư mục chứa file script hiện tại
    """
    env_res = os.environ.get("DICHPHIM_RESOURCES_DIR")
    if env_res:
        candidate = Path(env_res) / "backend"
        if (candidate / "schema.sql").exists():
            return candidate
        if (Path(env_res) / "schema.sql").exists():
            return Path(env_res)

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidate = Path(meipass) / "backend"
        if (candidate / "schema.sql").exists():
            return candidate
        if (Path(meipass) / "schema.sql").exists():
            return Path(meipass)

    return Path(__file__).resolve().parent


def resolve_writable_data_dir() -> Path:
    """
    Tìm thư mục lưu dữ liệu người dùng có quyền ghi (dichphim.db, logs, cache):
    1. Biến môi trường DICHPHIM_DATA_DIR (do Electron truyền vào từ app.getPath('userData'))
    2. Nếu thư mục hiện tại có quyền ghi (chế độ dev), dùng thư mục backend
    3. Nếu cài trong C:\\Program Files (read-only), tự chuyển sang %APPDATA%\\DichPhimAI
    """
    env_data = os.environ.get("DICHPHIM_DATA_DIR")
    if env_data:
        data_path = Path(env_data)
        data_path.mkdir(parents=True, exist_ok=True)
        return data_path

    local_dir = Path(__file__).resolve().parent
    if os.access(local_dir, os.W_OK) and not getattr(sys, "frozen", False):
        return local_dir

    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        fallback = Path(appdata) / "DichPhimAI"
    elif sys.platform == "darwin":
        fallback = Path.home() / "Library" / "Application Support" / "DichPhimAI"
    else:
        fallback = Path.home() / ".local" / "share" / "DichPhimAI"

    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


BASE_DIR = resolve_resources_dir()
DATA_DIR = resolve_writable_data_dir()
SCHEMA_PATH = BASE_DIR / "schema.sql"
DB_PATH = DATA_DIR / "dichphim.db"

DEFAULT_SETTINGS = [
    (
        "llm_provider",
        json.dumps({"provider": "gemini", "model": "gemini-3.8-flash"}, ensure_ascii=False),
        "Nhà cung cấp mô hình ngôn ngữ lớn mặc định để phân tích và dịch ngữ cảnh",
    ),
    (
        "asr_config",
        json.dumps(
            {
                "engine": "faster-whisper",
                "model": "large-v3",
                "language": "zh",
                "compute_type": "float16",
                "vad_filter": True,
            },
            ensure_ascii=False,
        ),
        "Cấu hình nhận dạng giọng nói tiếng Trung",
    ),
    (
        "subtitle_constraints",
        json.dumps(
            {
                "max_chars_per_line": 42,
                "max_lines": 2,
                "max_cps": 17.0,
                "default_style": "muot_ma",
            },
            ensure_ascii=False,
        ),
        "Ràng buộc độ dài dòng và tốc độ đọc phụ đề tiếng Việt",
    ),
    (
        "worker_pool",
        json.dumps(
            {
                "max_parallel_jobs": 3,
                "max_gpu_asr_workers": 1,
                "batch_size_lines": 25,
                "context_before": 8,
                "context_after": 4,
            },
            ensure_ascii=False,
        ),
        "Cấu hình xử lý song song và cửa sổ ngữ cảnh khi dịch lô",
    ),
]


def initialize_database(
    db_path: Optional[Path] = None, schema_path: Optional[Path] = None
) -> list[str]:
    target_db = Path(db_path) if db_path else resolve_writable_data_dir() / "dichphim.db"
    target_schema = Path(schema_path) if schema_path else resolve_resources_dir() / "schema.sql"

    if not target_schema.exists():
        raise FileNotFoundError(f"Không tìm thấy file schema tại: {target_schema}")

    target_db.parent.mkdir(parents=True, exist_ok=True)
    schema_sql = target_schema.read_text(encoding="utf-8")

    conn = sqlite3.connect(str(target_db))
    try:
        conn.executescript(schema_sql)
        cursor = conn.cursor()
        for key, value_json, desc in DEFAULT_SETTINGS:
            cursor.execute(
                """
                INSERT INTO settings (key, value_json, description_vi)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    description_vi = excluded.description_vi,
                    updated_at = datetime('now');
                """,
                (key, value_json, desc),
            )
        conn.commit()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
        )
        tables = [row[0] for row in cursor.fetchall()]
        print(f"[OK] Đã khởi tạo CSDL thành công tại: {target_db}")
        print(f"[OK] Danh sách bảng ({len(tables)}): {', '.join(tables)}")
        return tables
    finally:
        conn.close()


if __name__ == "__main__":
    initialize_database()
