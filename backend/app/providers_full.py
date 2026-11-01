"""
DịchPhim AI — Giai đoạn 3:
Lớp trừu tượng TranslationProvider (hỗ trợ Gemini, Claude, OpenAI, Ollama Local),
Lưu API Key mã hóa trong Keychain hệ điều hành, Dịch theo ngữ cảnh 2 lượt (Pass 1 & Pass 2),
Đánh dấu độ tự tin (Confidence Score) và Học tự động từ chỉnh sửa của người dùng.
"""

from __future__ import annotations

import abc
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from backend.app.pipeline_mvp import (
    SubtitleItem,
    TranslationBatch,
    parse_and_validate_llm_json,
)


# ============================================================================
# 1. QUẢN LÝ API KEY TRONG KEYCHAIN HỆ ĐIỀU HÀNH
# ============================================================================
SERVICE_NAME = "DichPhimAI_Keychain"


def save_api_key_securely(provider: str, api_key: str) -> bool:
    """Lưu API key đã mã hóa vào Windows Credential Locker / macOS Keychain / Linux SecretService."""
    try:
        import keyring  # type: ignore
        keyring.set_password(SERVICE_NAME, provider.lower(), api_key.strip())
        return True
    except Exception:
        return False


def get_api_key_securely(provider: str, env_fallback: str = "GEMINI_API_KEY") -> str:
    """Đọc API key từ Keychain hệ điều hành, nếu không có thì đọc từ biến môi trường."""
    import os
    try:
        import keyring  # type: ignore
        stored = keyring.get_password(SERVICE_NAME, provider.lower())
        if stored:
            return stored
    except Exception:
        pass
    return os.environ.get(env_fallback, "")


# ============================================================================
# 2. HỒ SƠ PHIM (MOVIE PROFILE) & HỌC TỪ CHỈNH SỬA
# ============================================================================
@dataclass
class MovieContextProfile:
    movie_id: str
    title_zh: str
    title_vi: str
    genre: str = "tien_hiep"
    era: str = "co_dai"
    translation_style: str = "muot_ma"
    synopsis: str = ""
    addressing_rules: str = ""
    characters: List[Dict[str, str]] = field(default_factory=list)
    relationships: List[Dict[str, str]] = field(default_factory=list)
    glossary: Dict[str, str] = field(default_factory=dict)
    user_edit_memory: List[Dict[str, str]] = field(default_factory=list)

    def learn_from_user_edit(
        self, original_zh: str, old_vi: str, corrected_vi: str, term_pair: Optional[tuple[str, str]] = None
    ) -> None:
        """
        Khi người dùng sửa câu dịch hoặc thuật ngữ, lưu lại vào Hồ sơ phim
        để áp dụng tự động cho các lô và các tập tiếp theo của cùng bộ phim.
        """
        if term_pair:
            zh_term, vi_term = term_pair
            self.glossary[zh_term.strip()] = vi_term.strip()

        self.user_edit_memory.append(
            {
                "text_zh": original_zh.strip(),
                "old_vi": old_vi.strip(),
                "corrected_vi": corrected_vi.strip(),
            }
        )
        # Giữ tối đa 50 mẫu chỉnh sửa gần nhất để đính kèm vào Few-Shot Prompt
        if len(self.user_edit_memory) > 50:
            self.user_edit_memory = self.user_edit_memory[-50:]

    def to_prompt_block(self) -> str:
        return json.dumps(
            {
                "title_zh": self.title_zh,
                "title_vi": self.title_vi,
                "genre": self.genre,
                "era": self.era,
                "style": self.translation_style,
                "synopsis": self.synopsis,
                "addressing_rules": self.addressing_rules,
                "characters": self.characters,
                "relationships": self.relationships,
                "glossary_fixed_terms": self.glossary,
                "recent_user_corrections": self.user_edit_memory[-10:],
            },
            ensure_ascii=False,
            indent=2,
        )


# ============================================================================
# 3. LỚP TRỪU TƯỢNG TRANSLATION PROVIDER & CÁC NHÀ CUNG CẤP (GEMINI / OLLAMA...)
# ============================================================================
class TranslationProvider(abc.ABC):
    """
    Lớp trừu tượng cho mọi nhà cung cấp LLM (Gemini, Claude, OpenAI, Ollama).
    Tích hợp tự động thử lại với Exponential Backoff khi gặp Rate Limit hoặc JSON lỗi.
    """

    @abc.abstractmethod
    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        raise NotImplementedError

    def call_with_retry(
        self, system_prompt: str, user_prompt: str, max_retries: int = 3
    ) -> List[dict]:
        delay = 1.5
        last_err: Optional[Exception] = None
        for attempt in range(1, max_retries + 1):
            try:
                raw_response = self.generate_json(system_prompt, user_prompt)
                return parse_and_validate_llm_json(raw_response)
            except Exception as err:
                last_err = err
                if attempt == max_retries:
                    break
                time.sleep(delay)
                delay *= 2.0
        raise RuntimeError(f"Gọi AI dịch thất bại sau {max_retries} lần thử: {last_err}")

    def translate_batch_two_pass(
        self,
        batch: TranslationBatch,
        profile: MovieContextProfile,
        pass1_system_prompt: str,
        pass2_system_prompt: str,
        enable_second_pass: bool = True,
    ) -> List[SubtitleItem]:
        """
        Thực hiện dịch 2 lượt:
        - Lượt 1: Dịch nháp theo Hồ sơ phim + Cửa sổ ngữ cảnh trước/sau.
        - Lượt 2: Rà soát tính nhất quán (đại từ xưng hô, tên riêng Hán-Việt, CPS <= 17).
        """
        pass1_payload = {
            "movie_profile": json.loads(profile.to_prompt_block()),
            "context_before": [
                {"index": x.index, "text_zh": x.text_zh, "text_vi": x.text_vi}
                for x in batch.context_before
            ],
            "target_lines": [
                {
                    "index": x.index,
                    "duration_sec": x.duration_sec,
                    "text_zh": x.text_zh,
                }
                for x in batch.target_lines
            ],
            "context_after": [
                {"index": x.index, "text_zh": x.text_zh} for x in batch.context_after
            ],
        }

        pass1_results = self.call_with_retry(
            pass1_system_prompt, json.dumps(pass1_payload, ensure_ascii=False)
        )
        draft_map = {int(r["index"]): r for r in pass1_results if str(r["index"]).isdigit()}

        for item in batch.target_lines:
            if item.index in draft_map:
                item.text_vi = draft_map[item.index]["text_vi"]
                item.confidence = float(draft_map[item.index]["confidence"])
                item.ai_notes = draft_map[item.index]["ai_notes"]

        if not enable_second_pass:
            return batch.target_lines

        pass2_payload = {
            "movie_profile": json.loads(profile.to_prompt_block()),
            "lines_to_review": [
                {
                    "index": x.index,
                    "duration_sec": x.duration_sec,
                    "text_zh": x.text_zh,
                    "text_vi_draft": x.text_vi,
                    "current_cps": x.cps,
                }
                for x in batch.target_lines
            ],
        }
        pass2_results = self.call_with_retry(
            pass2_system_prompt, json.dumps(pass2_payload, ensure_ascii=False)
        )
        review_map = {int(r["index"]): r for r in pass2_results if str(r["index"]).isdigit()}

        for item in batch.target_lines:
            if item.index in review_map:
                item.text_vi = review_map[item.index]["text_vi"]
                item.confidence = float(review_map[item.index]["confidence"])
                item.ai_notes = review_map[item.index]["ai_notes"]

        return batch.target_lines


class GeminiTranslationProvider(TranslationProvider):
    """Nhà cung cấp dịch mặc định sử dụng Google GenAI SDK (gemini-3.8-flash)."""

    def __init__(self, api_key: Optional[str] = None, model_name: str = "gemini-3.8-flash"):
        self.api_key = api_key or get_api_key_securely("gemini", "GEMINI_API_KEY")
        self.model_name = model_name

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore

        client = genai.Client(api_key=self.api_key)
        response = client.models.generate_content(
            model=self.model_name,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
            ),
        )
        return response.text or "[]"


class OllamaLocalProvider(TranslationProvider):
    """Nhà cung cấp mô hình cục bộ qua Ollama (chạy hoàn toàn Offline không cần Internet)."""

    def __init__(self, base_url: str = "http://127.0.0.1:11434", model_name: str = "qwen2.5:14b"):
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        import urllib.request

        payload = json.dumps(
            {
                "model": self.model_name,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "format": "json",
                "stream": False,
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return body.get("message", {}).get("content", "[]")
