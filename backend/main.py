#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DịchPhim AI — Máy chủ Backend Trung Tâm & Đồng Bộ Kho Phim LAN (Python 3.11+)
Không phụ thuộc vào đường dẫn máy phát triển (Dynamic Path Resolution):
- Tự động thêm thư mục gốc vào sys.path theo vị trí thực tế của file (__file__ / sys._MEIPASS)
- Tự động lưu SQLite dichphim.db vào DICHPHIM_DATA_DIR (%APPDATA%\\DichPhimAI trên Windows)
- Hỗ trợ chạy qua FastAPI/Uvicorn HOẶC HTTP Server chuẩn tích hợp sẵn (Zero-dependency fallback)
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

# Đảm bảo import module nội bộ hoạt động dù khởi chạy từ bất kỳ thư mục làm việc (CWD) nào
CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.init_db import (
    initialize_database,
    resolve_resources_dir,
    resolve_writable_data_dir,
)
from backend.app.lan_sync_server import LanPairingManager, parse_http_range_header
from backend.app.providers_full import MovieContextProfile
from backend.app.queue_orchestrator import (
    detect_hardware_capabilities,
    sort_video_files_by_episode,
)


class DichPhimLocalService:
    """
    Lớp dịch vụ lõi kết nối SQLite với REST API Endpoints (FastAPI & Built-in HTTP Server).
    """

    def __init__(self, db_path: Optional[str] = None):
        if db_path:
            self.db_path = str(db_path)
        else:
            self.db_path = str(resolve_writable_data_dir() / "dichphim.db")

        initialize_database(Path(self.db_path))
        self.pairing_manager = LanPairingManager()
        self.active_pairing_code = self.pairing_manager.generate_six_digit_code()
        self._seed_initial_data_if_empty()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _seed_initial_data_if_empty(self) -> None:
        conn = self._connect()
        try:
            count = conn.execute("SELECT COUNT(*) FROM movies").fetchone()[0]
            if count > 0:
                return
            conn.execute(
                """
                INSERT INTO movies (id, title_zh, title_vi, genre, era, translation_style, synopsis, total_episodes, profile_analyzed)
                VALUES (
                    'movie-xianxia-01',
                    '长月剑尊',
                    'Trường Nguyệt Kiếm Tôn',
                    'tien_hiep',
                    'co_dai',
                    'muot_ma',
                    'Đạm Đài Tẫn mang Tà Cốt suốt 500 năm, đối đầu các tông môn tu tiên tại Đại Điện Hành Dương.',
                    40,
                    1
                )
                """
            )
            conn.execute(
                """
                INSERT INTO episodes (id, movie_id, episode_number, title, source_video_path, duration_seconds, resolution, status, subtitle_line_count)
                VALUES (
                    'ep-xianxia-13',
                    'movie-xianxia-01',
                    13,
                    'Tập 13 - Đại Điện Thẩm Vấn Tà Cốt',
                    'Tap13_TruongNguyetKiemTon_1080p.mp4',
                    2740.0,
                    '1920x1080',
                    'completed',
                    3
                )
                """
            )
            sample_lines = [
                (
                    "line-xx-1",
                    "ep-xianxia-13",
                    1,
                    12400,
                    16100,
                    "师父，弟子黎苏苏愿借过去镜一用，回到五百年前抽毁邪骨！",
                    "Sư phụ, đệ tử Lê Tô Tô nguyện mượn Quá Khứ Kính\nquay về năm trăm năm trước rút hủy Tà Cốt!",
                    0.97,
                ),
                (
                    "line-xx-2",
                    "ep-xianxia-13",
                    2,
                    16500,
                    20200,
                    "放肆！魔神残魂岂是尔等凡胎能够承受？",
                    "Làm càn! Tàn hồn Ma Thần há phải thứ\nphàm thai các ngươi có thể gánh chịu?",
                    0.95,
                ),
                (
                    "line-xx-3",
                    "ep-xianxia-13",
                    3,
                    20800,
                    24600,
                    "本座既已入魔，这三界正道又能奈我何？",
                    "Bổn tọa đã nhập ma, chính đạo tam giới này\nlàm gì được ta?",
                    0.96,
                ),
            ]
            for lid, eid, idx, s_ms, e_ms, t_zh, t_vi, conf in sample_lines:
                conn.execute(
                    """
                    INSERT INTO subtitle_lines (id, episode_id, line_index, start_ms, end_ms, text_zh, text_vi, confidence)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (lid, eid, idx, s_ms, e_ms, t_zh, t_vi, conf),
                )
            conn.commit()
        finally:
            conn.close()

    def get_health(self) -> Dict[str, Any]:
        hw = detect_hardware_capabilities()
        return {
            "ok": True,
            "service": "DịchPhim AI Python Backend",
            "db_path": self.db_path,
            "resources_dir": str(resolve_resources_dir()),
            "pairing_code": self.active_pairing_code,
            "hardware": {
                "device": hw.device,
                "device_name": hw.device_name,
                "vram_gb": hw.vram_gb,
                "recommended_workers": hw.recommended_workers,
            },
        }

    def get_library(self) -> List[Dict[str, Any]]:
        conn = self._connect()
        try:
            rows = conn.execute(
                """
                SELECT m.*,
                       COUNT(e.id) AS episode_count,
                       SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completed_episodes
                FROM movies m
                LEFT JOIN episodes e ON e.movie_id = m.id
                GROUP BY m.id
                ORDER BY m.updated_at DESC
                """
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def get_movie_detail(self, movie_id: str) -> Optional[Dict[str, Any]]:
        conn = self._connect()
        try:
            movie = conn.execute("SELECT * FROM movies WHERE id = ?", (movie_id,)).fetchone()
            if not movie:
                return None
            characters = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM characters WHERE movie_id = ?", (movie_id,)
                ).fetchall()
            ]
            relationships = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM relationships WHERE movie_id = ?", (movie_id,)
                ).fetchall()
            ]
            glossary = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM glossary WHERE movie_id = ?", (movie_id,)
                ).fetchall()
            ]
            episodes = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM episodes WHERE movie_id = ? ORDER BY episode_number ASC",
                    (movie_id,),
                ).fetchall()
            ]
            result = dict(movie)
            result["characters"] = characters
            result["relationships"] = relationships
            result["glossary"] = glossary
            result["episodes"] = episodes
            return result
        finally:
            conn.close()

    def get_episode_subtitles(self, episode_id: str) -> List[Dict[str, Any]]:
        conn = self._connect()
        try:
            rows = conn.execute(
                """
                SELECT * FROM subtitle_lines
                WHERE episode_id = ?
                ORDER BY line_index ASC
                """,
                (episode_id,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def enqueue_batch_files(self, movie_id: str, file_paths: List[str]) -> List[Dict[str, Any]]:
        sorted_files = sort_video_files_by_episode(file_paths)
        conn = self._connect()
        created_jobs: List[Dict[str, Any]] = []
        try:
            for idx, item in enumerate(sorted_files):
                ep_num = int(item["episode_number"])
                file_path_str = str(item.get("path") or item.get("file_path") or "")
                ep_id = f"ep-{movie_id}-{ep_num}"
                job_id = f"job-{movie_id}-{ep_num}"
                conn.execute(
                    """
                    INSERT INTO episodes (id, movie_id, episode_number, title, source_video_path, status)
                    VALUES (?, ?, ?, ?, ?, 'pending')
                    ON CONFLICT(movie_id, episode_number) DO UPDATE SET
                        source_video_path = excluded.source_video_path,
                        updated_at = datetime('now')
                    """,
                    (ep_id, movie_id, ep_num, f"Tập {ep_num:02d}", file_path_str),
                )
                conn.execute(
                    """
                    INSERT INTO jobs (id, episode_id, movie_id, status, priority, current_step_code)
                    VALUES (?, ?, ?, 'queued', ?, 'EXTRACT_AUDIO')
                    ON CONFLICT(episode_id) DO UPDATE SET
                        status = 'queued',
                        updated_at = datetime('now')
                    """,
                    (job_id, ep_id, movie_id, max(10, 90 - idx * 5)),
                )
                created_jobs.append(
                    {
                        "job_id": job_id,
                        "episode_id": ep_id,
                        "episode_number": ep_num,
                        "file_path": file_path_str,
                        "status": "queued",
                    }
                )
            conn.commit()
            return created_jobs
        finally:
            conn.close()

    def update_subtitle_line_from_device(
        self, episode_id: str, line_id: str, new_text_vi: str
    ) -> Dict[str, Any]:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM subtitle_lines WHERE id = ? AND episode_id = ?",
                (line_id, episode_id),
            ).fetchone()
            if not row:
                raise KeyError(f"Không tìm thấy dòng phụ đề {line_id}")

            old_text_vi = row["text_vi"] or ""
            text_zh = row["text_zh"] or ""
            conn.execute(
                """
                UPDATE subtitle_lines
                SET text_vi = ?, edit_status = 'user_edited', updated_at = datetime('now')
                WHERE id = ? AND episode_id = ?
                """,
                (new_text_vi, line_id, episode_id),
            )
            conn.commit()

            profile = MovieContextProfile(
                movie_id=episode_id,
                title_zh=text_zh[:12],
                title_vi="Phim Đồng Bộ LAN",
            )
            profile.learn_from_user_edit(
                original_zh=text_zh,
                old_vi=old_text_vi,
                corrected_vi=new_text_vi,
            )
            return {
                "ok": True,
                "episode_id": episode_id,
                "line_id": line_id,
                "text_vi": new_text_vi,
                "edit_memory_count": len(profile.user_edit_memory),
            }
        finally:
            conn.close()

    def update_watch_progress(
        self, episode_id: str, device_id: str, position_ms: int, duration_ms: int
    ) -> Dict[str, Any]:
        conn = self._connect()
        try:
            pos_sec = round(position_ms / 1000.0, 2)
            dur_sec = round(duration_ms / 1000.0, 2)
            completed = 1 if duration_ms > 0 and (position_ms / duration_ms) >= 0.92 else 0
            conn.execute(
                """
                INSERT INTO watch_progress (id, episode_id, device_id, position_seconds, duration_seconds, completed, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(episode_id, device_id) DO UPDATE SET
                    position_seconds = excluded.position_seconds,
                    duration_seconds = excluded.duration_seconds,
                    completed = excluded.completed,
                    updated_at = datetime('now')
                """,
                (f"wp-{episode_id}-{device_id}", episode_id, device_id, pos_sec, dur_sec, completed),
            )
            conn.commit()
            return {
                "ok": True,
                "episode_id": episode_id,
                "device_id": device_id,
                "position_seconds": pos_sec,
                "completed": bool(completed),
            }
        finally:
            conn.close()


def run_standalone_http_server(service: DichPhimLocalService, host: str, port: int) -> None:
    """
    Máy chủ HTTP đa luồng sử dụng thư viện chuẩn Python (không cần cài đặt pip ngoài).
    Đảm bảo ứng dụng đóng gói .exe luôn khởi chạy được trên mọi máy Windows.
    """

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            pass

        def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def _read_body(self) -> Dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))

        def do_OPTIONS(self) -> None:
            self._send_json(200, {"ok": True})

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            route = parsed.path

            if route == "/health":
                self._send_json(200, service.get_health())
                return

            if route == "/library":
                self._send_json(200, {"ok": True, "movies": service.get_library()})
                return

            m_movie = re.match(r"^/movies/([^/]+)$", route)
            if m_movie:
                detail = service.get_movie_detail(m_movie.group(1))
                if not detail:
                    self._send_json(404, {"ok": False, "error": "Không tìm thấy phim"})
                else:
                    self._send_json(200, {"ok": True, "movie": detail})
                return

            m_sub = re.match(r"^/subtitles/([^/]+)$", route)
            if m_sub:
                ep_id = m_sub.group(1)
                qs = parse_qs(parsed.query)
                bilingual = qs.get("bilingual", ["true"])[0].lower() != "false"
                lines = service.get_episode_subtitles(ep_id)
                self._send_json(
                    200,
                    {"ok": True, "episode_id": ep_id, "bilingual": bilingual, "lines": lines},
                )
                return

            self._send_json(404, {"ok": False, "error": f"Endpoint không tồn tại: {route}"})

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            route = parsed.path
            body = self._read_body()

            if route == "/pair":
                code = str(body.get("code", ""))
                device_name = str(body.get("device_name", "Điện thoại DịchPhim"))
                platform = str(body.get("platform", "android"))
                paired = service.pairing_manager.pair_device(
                    pairing_code=code, device_name=device_name, platform=platform
                )
                if not paired:
                    self._send_json(
                        401,
                        {"ok": False, "error": "Mã ghép đôi 6 số không hợp lệ hoặc đã hết hạn"},
                    )
                    return
                self._send_json(
                    200,
                    {
                        "ok": True,
                        **paired,
                        "client_ip": self.client_address[0] if self.client_address else "127.0.0.1",
                    },
                )
                return

            if route == "/jobs/batch":
                movie_id = str(body.get("movie_id", "movie-xianxia-01"))
                files = list(body.get("files", []))
                jobs = service.enqueue_batch_files(movie_id, files)
                self._send_json(200, {"ok": True, "jobs": jobs})
                return

            self._send_json(404, {"ok": False, "error": f"Endpoint không tồn tại: {route}"})

        def do_PUT(self) -> None:
            parsed = urlparse(self.path)
            route = parsed.path
            body = self._read_body()

            m_edit = re.match(r"^/subtitles/([^/]+)/lines/([^/]+)$", route)
            if m_edit:
                ep_id, line_id = m_edit.group(1), m_edit.group(2)
                new_text_vi = str(body.get("text_vi", "")).strip()
                if not new_text_vi:
                    self._send_json(400, {"ok": False, "error": "Nội dung tiếng Việt trống"})
                    return
                try:
                    res = service.update_subtitle_line_from_device(ep_id, line_id, new_text_vi)
                    self._send_json(200, res)
                except KeyError as exc:
                    self._send_json(404, {"ok": False, "error": str(exc)})
                return

            m_prog = re.match(r"^/progress/([^/]+)$", route)
            if m_prog:
                ep_id = m_prog.group(1)
                dev_id = str(body.get("device_id", "mobile-default"))
                pos_ms = int(body.get("position_ms", 0))
                dur_ms = int(body.get("duration_ms", 2700000))
                res = service.update_watch_progress(ep_id, dev_id, pos_ms, dur_ms)
                self._send_json(200, res)
                return

            self._send_json(404, {"ok": False, "error": f"Endpoint không tồn tại: {route}"})

    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"[DịchPhim AI Backend] Application startup complete on http://{host}:{port}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


def create_fastapi_app(db_path: Optional[str] = None):
    """Khởi tạo ứng dụng FastAPI khi chạy qua Uvicorn."""
    from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
    from fastapi.responses import StreamingResponse

    service = DichPhimLocalService(db_path=db_path)
    app = FastAPI(title="DịchPhim AI Local Backend", version="1.0.0")
    connected_clients: List[WebSocket] = []

    async def broadcast_event(event_type: str, payload: Dict[str, Any]):
        dead_sockets: List[WebSocket] = []
        message = json.dumps({"event": event_type, "data": payload}, ensure_ascii=False)
        for ws in connected_clients:
            try:
                await ws.send_text(message)
            except Exception:
                dead_sockets.append(ws)
        for ws in dead_sockets:
            connected_clients.remove(ws)

    @app.get("/health")
    async def healthcheck():
        return service.get_health()

    @app.get("/library")
    async def list_library():
        return {"ok": True, "movies": service.get_library()}

    @app.get("/movies/{movie_id}")
    async def get_movie(movie_id: str):
        detail = service.get_movie_detail(movie_id)
        if not detail:
            raise HTTPException(status_code=404, detail="Không tìm thấy phim")
        return {"ok": True, "movie": detail}

    @app.get("/subtitles/{episode_id}")
    async def get_subtitles(episode_id: str, bilingual: bool = True):
        lines = service.get_episode_subtitles(episode_id)
        return {"ok": True, "episode_id": episode_id, "bilingual": bilingual, "lines": lines}

    @app.put("/subtitles/{episode_id}/lines/{line_id}")
    async def edit_subtitle_line(episode_id: str, line_id: str, body: Dict[str, Any]):
        new_text_vi = str(body.get("text_vi", "")).strip()
        if not new_text_vi:
            raise HTTPException(status_code=400, detail="Nội dung tiếng Việt không được để trống")
        result = service.update_subtitle_line_from_device(episode_id, line_id, new_text_vi)
        await broadcast_event("subtitle_updated", result)
        return result

    @app.put("/progress/{episode_id}")
    async def sync_progress(episode_id: str, body: Dict[str, Any]):
        device_id = str(body.get("device_id", "mobile-default"))
        position_ms = int(body.get("position_ms", 0))
        duration_ms = int(body.get("duration_ms", 2700000))
        result = service.update_watch_progress(episode_id, device_id, position_ms, duration_ms)
        await broadcast_event("progress_updated", result)
        return result

    @app.post("/pair")
    async def pair_device(body: Dict[str, Any], request: Request):
        code = str(body.get("code", ""))
        device_name = str(body.get("device_name", "Điện thoại DịchPhim"))
        platform = str(body.get("platform", "android"))
        paired = service.pairing_manager.pair_device(
            pairing_code=code, device_name=device_name, platform=platform
        )
        if not paired:
            raise HTTPException(status_code=401, detail="Mã ghép đôi 6 số không hợp lệ hoặc đã hết hạn")
        return {
            "ok": True,
            **paired,
            "client_ip": request.client.host if request.client else "127.0.0.1",
        }

    @app.get("/stream/{episode_id}")
    async def stream_video(episode_id: str, range: Optional[str] = Header(None)):
        conn = service._connect()
        try:
            ep = conn.execute(
                "SELECT source_video_path, file_size_bytes FROM episodes WHERE id = ?",
                (episode_id,),
            ).fetchone()
        finally:
            conn.close()

        if not ep or not os.path.exists(ep["source_video_path"]):
            raise HTTPException(status_code=404, detail="Không tìm thấy file video gốc")

        video_path = ep["source_video_path"]
        file_size = os.path.getsize(video_path)
        start, end = parse_http_range_header(range, file_size)
        chunk_length = end - start + 1

        def iter_file():
            with open(video_path, "rb") as f:
                f.seek(start)
                remaining = chunk_length
                while remaining > 0:
                    data = f.read(min(65536, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_length),
        }
        return StreamingResponse(
            iter_file(),
            status_code=206 if range else 200,
            headers=headers,
            media_type="video/mp4",
        )

    @app.websocket("/events")
    async def websocket_events(websocket: WebSocket):
        await websocket.accept()
        connected_clients.append(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            if websocket in connected_clients:
                connected_clients.remove(websocket)

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="DịchPhim AI Local Python Backend")
    parser.add_argument("--host", default="127.0.0.1", help="Host lắng nghe")
    parser.add_argument("--port", type=int, default=8443, help="Cổng lắng nghe")
    parser.add_argument("--data-dir", default=None, help="Thư mục dữ liệu người dùng (SQLite)")
    parser.add_argument("--resources-dir", default=None, help="Thư mục tài nguyên tĩnh")
    parser.add_argument("--self-test", action="store_true", help="Chạy tự kiểm tra khởi động rồi thoát")
    args = parser.parse_args()

    if args.data_dir:
        os.environ["DICHPHIM_DATA_DIR"] = args.data_dir
    if args.resources_dir:
        os.environ["DICHPHIM_RESOURCES_DIR"] = args.resources_dir

    service = DichPhimLocalService()
    if args.self_test:
        print(json.dumps(service.get_health(), ensure_ascii=False))
        return

    try:
        import uvicorn

        app = create_fastapi_app(service.db_path)
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    except ImportError:
        run_standalone_http_server(service, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
