# DịchPhim AI — Bản Hoàn Thiện Toàn Diện (Desktop & Mobile Full-Stack)

Kế hoạch này hợp nhất và hoàn thiện toàn bộ các giai đoạn còn lại (Giai đoạn 2 $\rightarrow$ Giai đoạn 7) thành một hệ thống **DịchPhim AI** hoàn chỉnh, có cơ sở dữ liệu lưu bền vững trên máy chủ, xử lý được file video/phụ đề thực tế của người dùng, chạy mượt mà trên cả **Máy tính (Desktop/PWA)** lẫn **Điện thoại (Mobile Touch UI/PWA & Flutter)** và tự động kiểm thử 100% trước khi bàn giao.

## User Review & Critical Decisions

> [!IMPORTANT]
> Để đảm bảo ứng dụng **chạy được thực sự ngay lập tức trên cả máy tính và điện thoại của bạn mà không cần cấu hình phức tạp**, đồng thời vẫn cung cấp trọn bộ mã nguồn gốc (Python FastAPI + Electron + Flutter) cho môi trường local, chúng tôi triển khai kiến trúc kép dưới đây:

- **Confirmed Decision 1 (Chạy thực tế trên Máy tính & Điện thoại)**: Bổ sung chuẩn **Progressive Web App (PWA)** có nút **Cài đặt ứng dụng (Install App)** ngay trên thanh công cụ và giao diện **Mobile Touch tối ưu một tay** (thanh điều hướng đáy màn hình khi mở trên điện thoại) để bạn có thể mở đường dẫn ứng dụng hoặc quét mã QR trên iPhone/Android và cài đặt như ứng dụng thật, đồng bộ dữ liệu thời gian thực với máy tính.
- **Confirmed Decision 2 (Xử lý Video & Phụ đề thật từ thiết bị)**: Cho phép chọn/kéo thả file video thật (`.mp4`, `.webm`, `.mkv`) và file phụ đề (`.srt`) từ máy tính/điện thoại để phát trực tiếp trong trình phát, tự động nhận diện giọng nói / câu thoại tiếng Trung bằng Gemini Multimodal AI (`gemini-3.8-flash`), dịch ngữ cảnh 2 lượt, nghe thử lồng tiếng Việt (TTS) và xuất video/phụ đề hoàn chỉnh.
- **Confirmed Decision 3 (Trọn bộ mã nguồn Giai đoạn 2 $\rightarrow$ 7 có kiểm thử tự động)**: Hoàn thiện toàn bộ Backend Python (Hàng đợi đa luồng, AI Ngữ cảnh 2 lượt, LAN Server HTTP Range, OCR/TTS) + Desktop Electron + Mobile Flutter và chạy bộ kiểm thử tự động đảm bảo 0 lỗi biên dịch hay runtime.

---

## 1. Overview & Core Concept

- **What It Does**: Hệ thống dịch video và phim từ **tiếng Trung sang tiếng Việt** tốc độ cao theo ngữ cảnh. Ứng dụng tự động phân tích Hồ sơ phim (thể loại cổ trang/tiên hiệp/kiếm hiệp/hiện đại, danh sách nhân vật, ma trận đại từ xưng hô `huynh/đệ/tỷ/muội/bổn tọa/tại hạ` hoặc `anh/em/tôi/cậu`, từ điển thuật ngữ Hán-Việt), thực hiện dịch 2 lượt (dịch nháp kèm cửa sổ ngữ cảnh + rà soát nhất quán & giới hạn tốc độ đọc CPS $\le 17$), hỗ trợ chỉnh sửa phụ đề song ngữ + Pinyin, lồng tiếng Việt đa nhân vật và đồng bộ Kho phim 2 chiều giữa máy tính và điện thoại.
- **Target Audience / Persona**: Người dùng cá nhân yêu thích phim Trung Quốc muốn tự dịch hàng loạt tập phim với chất lượng biên dịch chuyên nghiệp, thao tác kéo thả đơn giản bằng tiếng Việt trên máy tính và thưởng thức/chỉnh sửa phụ đề trực tiếp trên điện thoại.
- **Key Value**: Xóa bỏ hoàn toàn tình trạng dịch máy rời rạc từng câu (nhảy ngôi xưng hô, sai tên Hán-Việt, câu quá dài không kịp đọc) và kết nối liền mạch trải nghiệm xử lý trên máy tính với trải nghiệm xem phim trên di động.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Luồng Xử lý Video Thực tế & Hàng đợi Đa luồng (Giai đoạn 2)**: Người dùng kéo thả file video thực tế hoặc thư mục tập phim vào màn hình Hàng đợi $\rightarrow$ Hệ thống tự nhận diện số tập (`Tap01`, `E02`, `第3集`), lưu vào CSDL, chạy qua 10 bước pipeline có lưu checkpoint phục hồi khi gián đoạn, hiển thị tốc độ xử lý và thời gian còn lại.
  2. **Luồng AI Ngữ cảnh 2 lượt & Học từ chỉnh sửa (Giai đoạn 3 & 4)**: Tại Trình chỉnh sửa phụ đề, người dùng xem video thật bên trái (hỗ trợ phát file video cục bộ vừa tải lên), bấm **AI Phân tích Hồ sơ phim**, **AI Dịch Ngữ Cảnh (Lượt 1)** và **AI Rà soát Nhất quán (Lượt 2)**. Khi người dùng sửa 1 câu hoặc bấm **Học câu này**, hệ thống tự động cập nhật Từ điển bộ phim và áp dụng cho các tập tiếp theo.
  3. **Luồng Phụ đề Song ngữ + Pinyin, Lồng tiếng Việt TTS & Xuất file (Giai đoạn 7)**: Người dùng bật/tắt chế độ hiển thị **Việt + Trung + Pinyin**, bấm nghe thử **Lồng tiếng Việt (TTS)** với giọng đọc gán riêng cho từng nhân vật, và xuất ra file `.srt`, `.ass` (có định dạng màu sắc/kiểu chữ), hoặc `.vtt`.
  4. **Luồng Đồng bộ Kho phim LAN & Trải nghiệm Điện thoại (Giai đoạn 5 & 6)**: Trên máy tính, người dùng mở mã QR hoặc mã ghép đôi 6 số. Trên điện thoại (hoặc chế độ xem Điện thoại trực tiếp), người dùng ghép đôi bằng mã 6 số, duyệt Kho phim ("Đang xem dở", "Mới thêm"), phát video mượt mà, lưu tiến độ xem 2 chiều và chạm vào bất kỳ câu phụ đề nào để sửa trực tiếp.
  5. **Luồng Cài đặt Toàn cục (Settings)**: Quản lý nhà cung cấp AI (Gemini / Claude / OpenAI / Ollama local), chọn mô hình ASR (`faster-whisper large-v3`, `medium`, `Paraformer-zh`), điều chỉnh số luồng Worker theo GPU/VRAM, bật/tắt OCR chữ cứng đáy hình, và xuất file nhật ký hệ thống (`.log`).

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Studio biên tập hậu kỳ điện ảnh hiện đại (High-Craft Cinema Post-Production Suite), hỗ trợ đầy đủ 2 giao diện **Tối (Dark Slate `#020617` / `#0F172A`)** và **Sáng (Crisp Neutral `#F8FAFC` / `#FFFFFF`)**.
  - *Color Palette & Mood*: Tỷ lệ màu 60-30-10 chuẩn xác với nền trung tính sâu, đường viền mảnh `1px`, điểm nhấn **Amber Gold (`#D97706` / `#F59E0B`)** cho các tác vụ AI chủ đạo, **Emerald (`#10B981`)** cho trạng thái đồng bộ/độ tự tin cao ($\ge 75\%$), và **Rose/Amber** cảnh báo các câu có độ tự tin thấp ($< 75\%$) hoặc vượt tốc độ đọc ($\text{CPS} > 17$).
  - *Typography & Hierarchy*: Kết hợp `Plus Jakarta Sans` cho giao diện điều khiển & phụ đề tiếng Việt sắc nét cùng `JetBrains Mono` (`tabular-nums`) cho toàn bộ mốc thời gian (`00:01:15,420`), chỉ số CPS, điểm tự tin và chữ Hán/Pinyin.
  - *Component Styling & Layout*: Trên máy tính sử dụng bố cục rộng `1440px` chia cột cân đối; trên màn hình điện thoại tự động chuyển sang bố cục **Mobile Touch एक-tay** với các nút bấm $\ge 44\times44\text{px}$ và thanh điều hướng cố định dưới đáy màn hình.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Lưu trữ bền vững & Đồng bộ Thời gian thực (Server-Backed State + Local Persistence)**
  - *Chosen Approach*: Kết hợp lưu trữ trạng thái Kho phim, Hàng đợi, Hồ sơ nhân vật, Từ điển và Tiến độ xem ngay trên Backend Server (đồng bộ tức thì giữa nhiều tab/thiết bị mở cùng URL) kết hợp bộ nhớ đệm cục bộ để hoạt động cả khi mất mạng tạm thời.
  - *Why*: Khi bạn mở ứng dụng trên máy tính và dùng điện thoại truy cập cùng địa chỉ ứng dụng, mọi chỉnh sửa phụ đề hoặc tiến độ xem phim trên điện thoại sẽ cập nhật thật sang máy tính ngay lập tức.

- **Decision 2: Hỗ trợ Xử lý Video Thực tế + Lồng tiếng TTS Trực tiếp trên Trình duyệt & Server**
  - *Chosen Approach*: Cho phép người dùng chọn file video thật từ máy tính/điện thoại để phát trực tiếp trong khung Video Player, trích xuất âm thanh/khung hình gửi lên endpoint Gemini Multimodal để nhận diện câu thoại tiếng Trung thực tế, đồng thời tích hợp Web Speech synthesis / Server TTS cho phép nghe lồng tiếng Việt đa nhân vật ngay lập tức.
  - *Why*: Giúp ứng dụng không chỉ là bản mô phỏng mà thực sự nhận video thật, dịch thật và phát phụ đề + giọng đọc tiếng Việt thật ngay trên máy của bạn.

---

## 4. Technical Architecture & Data Strategy

- **Architecture & Component Diagram**:

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     DỊCHPHIM AI — UNIFIED FULL-STACK SYSTEM                      │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
        ┌────────────────────────────────┴────────────────────────────────┐
        ▼                                                                 ▼
┌───────────────────────────────────────┐         ┌────────────────────────────────┐
│   GIAO DIỆN MÁY TÍNH & ĐIỆN THOẠI     │         │  BACKEND SERVER & AI PIPELINE  │
│  (React 19 + Tailwind v4 + Vite PWA)  │◄───────►│ (Express + Python MVP/SQLite)  │
├───────────────────────────────────────┤  REST   ├────────────────────────────────┤
│ • Hàng đợi đa luồng (Kéo thả Video)   │  & Sync │ • /api/state (Đồng bộ Kho phim)│
│ • Trình sửa phụ đề + Video Player thật│         │ • /api/ai/transcribe-video     │
│ • Hồ sơ phim (Nhân vật, Xưng hô, Từ)  │         │ • /api/ai/analyze-movie        │
│ • Kho phim & Ghép đôi QR / Mã 6 số    │         │ • /api/ai/translate-batch (L1) │
│ • Giao diện Mobile 1 tay & Nút PWA    │         │ • /api/ai/review-pass2    (L2) │
│ • Cài đặt hệ thống & Trung tâm Mã nguồn│        │ • /api/lan/* (Pair, Progress)  │
└───────────────────────────────────────┘         └───────────────┬────────────────┘
                                                                  │
                                                                  ▼
                                                  ┌────────────────────────────────┐
                                                  │   CƠ SỞ DỮ LIỆU & KIỂM THỬ     │
                                                  │ • SQLite 11 bảng (WAL Mode)    │
                                                  │ • Bộ Unit Tests Python & TS    │
                                                  │ • Trọn bộ gói Electron/Flutter │
                                                  └────────────────────────────────┘
```

- **Data Model & State**:
  - Quản lý đồng nhất 11 thực thể cốt lõi: `movies`, `episodes`, `characters`, `relationships`, `glossary`, `jobs`, `job_steps`, `subtitle_lines`, `devices`, `watch_progress`, và `settings`.
- **Interactive Component & State Mapping**:
  - **Màn hình Hàng đợi (`WorkQueueView`)**: Kéo thả file video thật $\rightarrow$ tạo bản ghi `VideoJob` + đọc thời lượng thực của video $\rightarrow$ chạy tự động qua 10 bước pipeline (hoặc gọi AI nhận diện & dịch trực tiếp) $\rightarrow$ lưu kết quả vào Kho phim.
  - **Trình chỉnh sửa phụ đề (`SubtitleEditorView`)**: Tải video thật lên trình phát $\rightarrow$ đồng bộ thời gian thực `currentTime` của thẻ `<video>` với dòng phụ đề đang hiển thị $\rightarrow$ bấm nghe lồng tiếng Việt (TTS) từng câu hoặc toàn tập $\rightarrow$ sửa trực tiếp, tự tính toán CPS và độ dài dòng $\le 42$ ký tự $\rightarrow$ xuất `.srt`, `.ass`, `.vtt` (Việt, Song ngữ Trung-Việt, hoặc kèm Pinyin).
  - **Màn hình Cài đặt (`SettingsView`)**: Thay đổi cấu hình AI, ASR model, số luồng GPU/CPU, bật/tắt OCR chữ cứng, cấu hình lồng tiếng TTS và xuất file nhật ký hệ thống.
  - **Kho phim & Đồng bộ Điện thoại (`LibrarySyncView`)**: Ghép đôi bằng mã 6 số hoặc QR, đồng bộ trạng thái 2 chiều với máy chủ (`/api/state` & `/api/lan/*`) để điện thoại và máy tính thấy ngay thay đổi của nhau.
