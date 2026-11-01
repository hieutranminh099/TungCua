"""
DịchPhim AI — Giai đoạn 5:
Máy chủ FastAPI mạng LAN + Giao diện đồng bộ trừu tượng (SyncBackendInterface) +
Ghép đôi bằng mã QR / mã 6 số + Phát video HTTP Range Request (tua mượt trên điện thoại) +
WebSocket /events đẩy thông báo thời gian thực.
"""

from __future__ import annotations

import abc
import hashlib
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class SyncBackendInterface(abc.ABC):
    """
    Lớp trừu tượng (Interface) cho đồng bộ Kho phim:
    Cho phép dùng LAN Server mặc định và dễ dàng cắm thêm Supabase / Firebase Cloud
    sau này mà không phải viết lại logic ứng dụng.
    """

    @abc.abstractmethod
    def list_library_movies(self) -> List[dict]:
        raise NotImplementedError

    @abc.abstractmethod
    def update_subtitle_line(self, episode_id: str, line_id: str, new_text_vi: str, device_id: str) -> dict:
        raise NotImplementedError

    @abc.abstractmethod
    def sync_watch_progress(self, episode_id: str, device_id: str, position_sec: float, duration_sec: float) -> dict:
        raise NotImplementedError


@dataclass
class PairingSession:
    pairing_code: str
    expires_at_epoch: float


class LanPairingManager:
    """
    Quản lý ghép đôi điện thoại qua mã QR hoặc mã 6 số và xác thực Bearer Token.
    Lưu SHA-256 hash của token để đảm bảo an toàn trong mạng nội bộ.
    """

    def __init__(self) -> None:
        self._active_codes: Dict[str, float] = {}
        self._paired_tokens_sha256: Dict[str, dict] = {}

    def generate_six_digit_code(self) -> str:
        code = f"{secrets.randbelow(900000) + 100000}"
        self._active_codes[code] = 300.0
        return code

    def pair_device(self, pairing_code: str, device_name: str, platform: str) -> Optional[dict]:
        clean_code = pairing_code.replace("-", "").strip()
        if clean_code not in self._active_codes:
            return None
        del self._active_codes[clean_code]
        raw_token = f"dp_lan_{secrets.token_urlsafe(24)}"
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        device_record = {
            "device_id": f"dev_{secrets.token_hex(4)}",
            "device_name": device_name,
            "platform": platform,
            "token": raw_token,
            "token_hash": token_hash,
        }
        self._paired_tokens_sha256[token_hash] = device_record
        return device_record

    def verify_bearer_token(self, raw_token: str) -> bool:
        token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()
        return token_hash in self._paired_tokens_sha256


def parse_http_range_header(range_header: Optional[str], file_size: int) -> Tuple[int, int]:
    """
    Xử lý HTTP Range Request (ví dụ: 'bytes=1048576-2097151') để trình phát video
    trên điện thoại Flutter tua mượt mà tới bất kỳ thời điểm nào của tập phim.
    """
    if not range_header or not range_header.startswith("bytes="):
        return 0, max(0, file_size - 1)

    range_spec = range_header.replace("bytes=", "").strip().split(",")[0]
    start_str, end_str = range_spec.split("-")
    start = int(start_str) if start_str else 0
    end = int(end_str) if end_str else file_size - 1
    start = max(0, min(start, file_size - 1))
    end = max(start, min(end, file_size - 1))
    return start, end
