-- ============================================================================
-- DỊCHPHIM AI - CƠ SỞ DỮ LIỆU TRUNG TÂM (SQLite 3.45+ / SQLAlchemy 2.0)
-- Hỗ trợ: Quản lý Kho phim, Hàng đợi đa luồng có Checkpoint, Phụ đề song ngữ,
-- Hồ sơ ngữ cảnh phim (Nhân vật, Quan hệ xưng hô, Từ điển Hán-Việt), Đồng bộ LAN
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- 1. BẢNG MOVIES (BỘ PHIM / SERIES)
CREATE TABLE IF NOT EXISTS movies (
    id TEXT PRIMARY KEY,                              -- UUID v4
    title_zh TEXT NOT NULL,                           -- Tên gốc tiếng Trung (VD: 长月烬明)
    title_vi TEXT NOT NULL,                           -- Tên dịch tiếng Việt (VD: Trường Nguyệt Tẫn Minh)
    title_pinyin TEXT,                                -- Phiên âm Pinyin
    genre TEXT NOT NULL DEFAULT 'co_trang',           -- co_trang | kiem_hiep | tien_hiep | ngon_tinh | hien_dai | hai | hanh_dong
    era TEXT NOT NULL DEFAULT 'co_dai',               -- co_dai | dan_quoc | hien_dai | huyen_huyen
    translation_style TEXT NOT NULL DEFAULT 'muot_ma',-- sat_nghia | muot_ma | hai_huoc | trang_trong
    synopsis TEXT,                                    -- Tóm tắt cốt truyện phục vụ ngữ cảnh dịch
    cover_image_path TEXT,                            -- Đường dẫn ảnh bìa (tự chụp frame hoặc người dùng chọn)
    folder_path TEXT,                                 -- Thư mục gốc trên ổ cứng máy tính
    total_episodes INTEGER NOT NULL DEFAULT 1,        -- Tổng số tập dự kiến
    profile_analyzed INTEGER NOT NULL DEFAULT 0,      -- 0: Chưa phân tích AI, 1: Đã có Hồ sơ phim
    pronoun_rules_json TEXT,                          -- Quy tắc xưng hô chung theo bối cảnh (JSON)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. BẢNG EPISODES (TẬP PHIM)
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,                              -- UUID v4
    movie_id TEXT NOT NULL,                           -- FK -> movies.id
    episode_number INTEGER NOT NULL DEFAULT 1,        -- Số thứ tự tập (nhận diện từ Tap01, E02, 第3集...)
    title TEXT NOT NULL,                              -- Tiêu đề tập (VD: Tập 01 - Đại Điện Luận Kiếm)
    source_video_path TEXT NOT NULL,                  -- Đường dẫn file video gốc
    exported_video_path TEXT,                         -- Đường dẫn video đã gắn sub / lồng tiếng
    audio_wav_path TEXT,                              -- Đường dẫn file WAV 16kHz mono trích xuất
    vocals_wav_path TEXT,                             -- Đường dẫn file giọng nói đã tách nhạc nền (Demucs)
    duration_seconds REAL NOT NULL DEFAULT 0.0,       -- Thời lượng video (giây)
    video_codec TEXT,                                 -- h264, hevc, av1...
    resolution TEXT,                                  -- 1920x1080, 3840x2160...
    fps REAL,                                         -- Số khung hình/giây
    file_size_bytes INTEGER DEFAULT 0,                -- Dung lượng file gốc
    file_hash_sha256 TEXT,                            -- Mã băm dùng để kiểm tra cache không xử lý lại
    status TEXT NOT NULL DEFAULT 'pending',           -- pending | processing | completed | failed
    subtitle_line_count INTEGER NOT NULL DEFAULT 0,   -- Tổng số câu phụ đề
    low_confidence_count INTEGER NOT NULL DEFAULT 0,  -- Số câu có độ tự tin thấp (< 0.75) cần rà soát
    has_tts_audio INTEGER NOT NULL DEFAULT 0,         -- 0: Chưa lồng tiếng, 1: Đã có track lồng tiếng Việt
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    UNIQUE(movie_id, episode_number)
);

-- 3. BẢNG CHARACTERS (DANH SÁCH NHÂN VẬT TRONG HỒ SƠ PHIM - ĐẶT TRƯỚC SUBTITLE_LINES ĐỂ THAM CHIẾU FK)
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,                              -- UUID v4
    movie_id TEXT NOT NULL,                           -- FK -> movies.id
    name_zh TEXT NOT NULL,                            -- Tên tiếng Trung (VD: 澹台烬)
    name_vi TEXT NOT NULL,                            -- Tên dịch chuẩn Hán-Việt / Phiên âm (VD: Đạm Đài Tẫn)
    gender TEXT NOT NULL DEFAULT 'unknown',           -- male | female | unknown
    estimated_age TEXT,                               -- VD: "20-25 tuổi", "Trưởng lão 500 tuổi"
    role TEXT NOT NULL DEFAULT 'supporting',          -- protagonist | antagonist | supporting | minor
    self_pronoun_default TEXT NOT NULL DEFAULT 'ta',  -- Ngôi tự xưng mặc định (ta, bổn tọa, tại hạ, tôi, anh, em...)
    address_others_default TEXT DEFAULT 'ngươi',      -- Ngôi gọi chung mặc định
    personality_and_tone TEXT,                        -- Tính cách & giọng điệu (VD: Lạnh lùng, uy nghiêm, dùng từ cổ điển)
    tts_voice_id TEXT DEFAULT 'vi-VN-NamMinhNeural',  -- Giọng đọc TTS gán riêng cho nhân vật
    is_user_verified INTEGER NOT NULL DEFAULT 0,      -- 1: Người dùng đã chốt không cho AI tự ý đổi
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    UNIQUE(movie_id, name_zh)
);

-- 4. BẢNG RELATIONSHIPS (QUAN HỆ & QUY TẮC XƯNG HÔ CẶP NHÂN VẬT)
CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,                              -- UUID v4
    movie_id TEXT NOT NULL,                           -- FK -> movies.id
    from_character_id TEXT NOT NULL,                  -- Nhân vật A (Người nói)
    to_character_id TEXT NOT NULL,                    -- Nhân vật B (Người nghe)
    relation_type TEXT NOT NULL,                      -- VD: "Sư phụ - Đồ đệ", "Sư huynh - Sư muội", "Kẻ thù", "Vợ chồng"
    pronoun_self TEXT NOT NULL,                       -- A tự xưng với B là gì (VD: "vi sư", "sư huynh", "tại hạ", "anh")
    pronoun_target TEXT NOT NULL,                     -- A gọi B là gì (VD: "đồ nhi", "tiểu sư muội", "các hạ", "em")
    context_note TEXT,                                -- Ghi chú chuyển biến (VD: "Từ tập 15 đổi từ Các hạ/Tại hạ sang Huynh/Muội")
    effective_from_episode INTEGER DEFAULT 1,         -- Áp dụng từ tập mấy
    effective_to_episode INTEGER,                     -- Đến tập mấy (NULL = hết phim)
    is_user_verified INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (from_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (to_character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- 5. BẢNG JOBS (HÀNG ĐỢI CÔNG VIỆC XỬ LÝ VIDEO)
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,                              -- UUID v4
    episode_id TEXT NOT NULL UNIQUE,                  -- FK -> episodes.id
    movie_id TEXT NOT NULL,                           -- FK -> movies.id
    status TEXT NOT NULL DEFAULT 'queued',            -- queued | running | paused | completed | failed | cancelled
    priority INTEGER NOT NULL DEFAULT 50,             -- Độ ưu tiên (1-100, số lớn chạy trước)
    current_step_code TEXT NOT NULL DEFAULT 'EXTRACT_AUDIO', -- Bước hiện tại trong 10 bước pipeline
    overall_progress REAL NOT NULL DEFAULT 0.0,       -- Tiến độ tổng thể (0.0 -> 100.0)
    speed_multiplier REAL DEFAULT 0.0,                -- Tốc độ xử lý so với thời lượng thực (VD: 12.4x)
    eta_seconds INTEGER,                              -- Thời gian ước tính còn lại (giây)
    worker_device TEXT DEFAULT 'auto',                -- cuda | mps | cpu
    asr_model TEXT NOT NULL DEFAULT 'large-v3',       -- large-v3 | medium | paraformer-zh
    llm_provider TEXT NOT NULL DEFAULT 'gemini',      -- gemini | claude | openai | ollama
    llm_model TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
    enable_vocal_separation INTEGER NOT NULL DEFAULT 0,
    enable_hardsub_ocr INTEGER NOT NULL DEFAULT 0,
    enable_two_pass_review INTEGER NOT NULL DEFAULT 1,
    enable_tts_dubbing INTEGER NOT NULL DEFAULT 0,
    export_mode TEXT NOT NULL DEFAULT 'soft_sub',     -- srt_only | soft_sub | hard_sub
    error_code TEXT,                                  -- Mã lỗi (FILE_CORRUPTED, OUT_OF_VRAM, API_QUOTA...)
    error_message_vi TEXT,                            -- Thông báo lỗi tiếng Việt dễ hiểu cho người dùng
    retry_count INTEGER NOT NULL DEFAULT 0,           -- Số lần đã thử lại
    max_retries INTEGER NOT NULL DEFAULT 3,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

-- 6. BẢNG JOB_STEPS (10 BƯỚC PIPELINE & CHECKPOINT PHỤC HỒI KHI GIÁN ĐOẠN)
CREATE TABLE IF NOT EXISTS job_steps (
    id TEXT PRIMARY KEY,                              -- UUID v4
    job_id TEXT NOT NULL,                             -- FK -> jobs.id
    step_order INTEGER NOT NULL,                      -- 1 -> 10
    step_code TEXT NOT NULL,                          -- EXTRACT_AUDIO | VAD_SEGMENT | ASR_TRANSCRIBE | OCR_HARDSUB | AI_MOVIE_PROFILE | AI_CONTEXT_TRANSLATE | GENERATE_SUBTITLES | TTS_DUBBING | EXPORT_VIDEO | LIBRARY_IMPORT
    step_name_vi TEXT NOT NULL,                       -- Tên bước tiếng Việt hiển thị trên UI
    status TEXT NOT NULL DEFAULT 'pending',           -- pending | running | completed | skipped | failed
    progress REAL NOT NULL DEFAULT 0.0,               -- 0.0 -> 100.0
    checkpoint_json TEXT,                             -- Lưu trạng thái dở dang (VD: {"last_completed_batch": 14, "total_batches": 22})
    cache_key TEXT,                                   -- Khóa bộ nhớ đệm của bước này
    error_message_vi TEXT,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    UNIQUE(job_id, step_code)
);

-- 7. BẢNG SUBTITLE_LINES (DÒNG PHỤ ĐỀ GỐC, BẢN DỊCH, ĐIỂM TỰ TIN & TRẠNG THÁI SỬA)
CREATE TABLE IF NOT EXISTS subtitle_lines (
    id TEXT PRIMARY KEY,                              -- UUID v4
    episode_id TEXT NOT NULL,                         -- FK -> episodes.id
    line_index INTEGER NOT NULL,                      -- Số thứ tự câu (1, 2, 3...)
    start_ms INTEGER NOT NULL,                        -- Thời điểm bắt đầu (mili-giây)
    end_ms INTEGER NOT NULL,                          -- Thời điểm kết thúc (mili-giây)
    speaker_id TEXT,                                  -- FK -> characters.id (nếu xác định được người nói)
    speaker_name_hint TEXT,                           -- Gợi ý tên người nói
    source_type TEXT NOT NULL DEFAULT 'ASR',          -- ASR | OCR | MERGED (kết hợp ASR + OCR chữ cứng)
    text_zh TEXT NOT NULL,                            -- Câu gốc tiếng Trung giản thể
    text_pinyin TEXT,                                 -- Phiên âm Pinyin (hỗ trợ xuất phụ đề học tiếng)
    text_vi_draft TEXT,                               -- Bản dịch nháp ở Lượt 1 (Pass 1)
    text_vi TEXT NOT NULL DEFAULT '',                 -- Bản dịch tiếng Việt chính thức (sau Lượt 2 hoặc người dùng sửa)
    confidence REAL NOT NULL DEFAULT 1.0,             -- Điểm tự tin của AI (0.0 -> 1.0; <0.75 cảnh báo cam/đỏ)
    cps REAL NOT NULL DEFAULT 0.0,                    -- Tốc độ đọc (Characters Per Second - chuẩn <= 17 ký tự/s)
    max_line_chars INTEGER NOT NULL DEFAULT 0,        -- Độ dài dòng dài nhất (chuẩn <= 42 ký tự)
    edit_status TEXT NOT NULL DEFAULT 'ai_pass2',     -- raw_asr | ai_pass1 | ai_pass2 | user_edited | locked
    ai_notes TEXT,                                    -- Giải thích của AI về thành ngữ, chơi chữ hoặc xưng hô đã chọn
    tts_audio_segment_path TEXT,                      -- Đường dẫn file âm thanh TTS của riêng câu này
    updated_by_device_id TEXT,                        -- Thiết bị sửa cuối cùng ('desktop' hoặc ID điện thoại)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
    FOREIGN KEY (speaker_id) REFERENCES characters(id) ON DELETE SET NULL,
    UNIQUE(episode_id, line_index)
);

-- 8. BẢNG GLOSSARY (TỪ ĐIỂN TÊN RIÊNG, THUẬT NGỮ, CÔNG PHÁP, THÀNH NGỮ & BỘ NHỚ SỬA LỖI)
CREATE TABLE IF NOT EXISTS glossary (
    id TEXT PRIMARY KEY,                              -- UUID v4
    movie_id TEXT,                                    -- FK -> movies.id (NULL nếu là từ điển toàn cục dùng cho mọi phim)
    term_zh TEXT NOT NULL,                            -- Từ gốc tiếng Trung (VD: 结丹期, 护心麟, 绿茶)
    term_vi TEXT NOT NULL,                            -- Bản dịch cố định (VD: Kết Đan Kỳ, Hộ Tâm Lân, Trà xanh)
    category TEXT NOT NULL DEFAULT 'proper_noun',     -- person | sect | skill | location | cultivation_realm | title | idiom | slang | user_correction
    han_viet_literal TEXT,                            -- Âm Hán-Việt nguyên bản
    usage_note TEXT,                                  -- Ngữ cảnh sử dụng
    source TEXT NOT NULL DEFAULT 'ai_suggested',      -- ai_suggested | user_added | learned_from_edit | imported_dict
    approved INTEGER NOT NULL DEFAULT 1,              -- 0: Đề xuất chờ duyệt, 1: Đã duyệt đưa vào prompt
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

-- 9. BẢNG DEVICES (THIẾT BỊ ĐIỆN THOẠI ĐÃ GHÉP ĐÔI QUA MẠNG LAN)
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,                              -- UUID thiết bị
    device_name TEXT NOT NULL,                        -- VD: "iPhone 16 Pro của Minh", "Samsung S24 Ultra"
    platform TEXT NOT NULL DEFAULT 'android',         -- android | ios
    auth_token_hash TEXT NOT NULL,                    -- SHA-256 hash của Bearer Token sinh ra khi ghép đôi
    pairing_code TEXT,                                -- Mã 6 số tạm thời khi ghép đôi
    last_ip_address TEXT,                             -- IP trong mạng LAN (VD: 192.168.1.45)
    last_sync_at TEXT,                                -- Thời điểm đồng bộ cuối cùng
    is_revoked INTEGER NOT NULL DEFAULT 0,            -- 1: Đã hủy quyền truy cập
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. BẢNG WATCH_PROGRESS (TIẾN ĐỘ XEM PHIM ĐỒNG BỘ HAI CHIỀU MÁY TÍNH <-> ĐIỆN THOẠI)
CREATE TABLE IF NOT EXISTS watch_progress (
    id TEXT PRIMARY KEY,                              -- UUID v4
    episode_id TEXT NOT NULL,                         -- FK -> episodes.id
    device_id TEXT NOT NULL DEFAULT 'desktop_local',  -- 'desktop_local' hoặc FK -> devices.id
    position_seconds REAL NOT NULL DEFAULT 0.0,       -- Vị trí đang xem dở (giây)
    duration_seconds REAL NOT NULL DEFAULT 0.0,       -- Tổng thời lượng tập phim
    completed INTEGER NOT NULL DEFAULT 0,             -- 1: Đã xem xong (> 92% thời lượng)
    preferred_sub_mode TEXT DEFAULT 'vi_only',        -- vi_only | bilingual_zh_vi | zh_only | off
    preferred_audio_track TEXT DEFAULT 'original_zh', -- original_zh | vi_tts_dub
    is_downloaded_offline INTEGER NOT NULL DEFAULT 0, -- 1: Đã tải về bộ nhớ điện thoại để xem offline
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
    UNIQUE(episode_id, device_id)
);

-- 11. BẢNG SETTINGS (CẤU HÌNH HỆ THỐNG)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,                             -- Khóa cấu hình
    value_json TEXT NOT NULL,                         -- Giá trị dạng JSON
    description_vi TEXT,                              -- Mô tả tiếng Việt
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- INDEXES TỐI ƯU TRUY VẤN TỐC ĐỘ CAO
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_episodes_movie_id ON episodes(movie_id, episode_number);
CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_job_steps_job_id ON job_steps(job_id, step_order);
CREATE INDEX IF NOT EXISTS idx_subtitles_episode_time ON subtitle_lines(episode_id, start_ms, end_ms);
CREATE INDEX IF NOT EXISTS idx_subtitles_low_conf ON subtitle_lines(episode_id, confidence) WHERE confidence < 0.75;
CREATE INDEX IF NOT EXISTS idx_characters_movie ON characters(movie_id);
CREATE INDEX IF NOT EXISTS idx_relationships_movie ON relationships(movie_id, from_character_id, to_character_id);
CREATE INDEX IF NOT EXISTS idx_glossary_lookup ON glossary(movie_id, approved, term_zh);
CREATE INDEX IF NOT EXISTS idx_watch_progress_updated ON watch_progress(updated_at DESC);
