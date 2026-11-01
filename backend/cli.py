"""
DịchPhim AI — Giao diện dòng lệnh (CLI) cho Giai đoạn 1 (MVP)
Cách dùng:
  python -m backend.cli --demo
  python -m backend.cli --input video_trung_quoc.mp4 --output video_vi.srt --bilingual
"""

import argparse
import sys
from pathlib import Path

from backend.app.pipeline_mvp import (
    SubtitleItem,
    build_translation_batches,
    export_srt_content,
    extract_audio_ffmpeg,
    transcribe_chinese_audio,
)


def run_demo_pipeline(output_path: Path, bilingual: bool = True) -> None:
    print("=================================================================")
    print(" DỊCHPHIM AI - CHẠY THỬ PIPELINE GIAI ĐOẠN 1 (MVP TRUNG -> VIỆT)")
    print("=================================================================")
    sample_items = [
        SubtitleItem(
            index=1,
            start_ms=2000,
            end_ms=6200,
            text_zh="苏苏，魔神澹台烬已经彻底炼化了邪骨，三界危在旦夕。",
            text_vi="Tô Tô, Ma thần Đạm Đài Tẫn đã luyện hóa Tà Cốt, tam giới nguy trong sớm tối.",
            confidence=0.98,
        ),
        SubtitleItem(
            index=2,
            start_ms=6500,
            end_ms=10300,
            text_zh="师父，弟子愿借过去镜回到五百年前，在他成魔之前抽毁邪骨！",
            text_vi="Sư phụ, đệ tử nguyện mượn Quá Khứ Kính về 500 năm trước hủy Tà Cốt!",
            confidence=0.96,
        ),
        SubtitleItem(
            index=3,
            start_ms=68400,
            end_ms=72900,
            text_zh="衡阳宗的余孽？凭你们这群蝼蚁，也妄想逆转本座的天命？",
            text_vi="Dư nghiệt Hành Dương Tông? Lũ sâu kiến các ngươi mà dám nghịch chuyển thiên mệnh của bổn tọa?",
            confidence=0.95,
        ),
    ]

    batches = build_translation_batches(sample_items, batch_size=2)
    print(f"[1/3] Đã chia {len(sample_items)} câu thoại thành {len(batches)} lô kèm cửa sổ ngữ cảnh.")
    for item in sample_items:
        print(f"  - Câu #{item.index} | CPS: {item.cps} ký tự/s | Độ tự tin: {int(item.confidence*100)}%")

    srt_output = export_srt_content(sample_items, bilingual=bilingual)
    output_path.write_text(srt_output, encoding="utf-8")
    print(f"[2/3] Đã kiểm tra giới hạn <= 42 ký tự/dòng và CPS <= 17.")
    print(f"[3/3] Đã xuất file phụ đề thành công tại: {output_path.resolve()}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="DịchPhim AI CLI — Dịch video tiếng Trung sang tiếng Việt theo ngữ cảnh"
    )
    parser.add_argument("--input", type=str, help="Đường dẫn file video tiếng Trung (.mp4, .mkv)")
    parser.add_argument(
        "--output",
        type=str,
        default="output_dichphim.srt",
        help="Đường dẫn file phụ đề SRT đầu ra",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="large-v3",
        choices=["large-v3", "medium"],
        help="Model nhận dạng giọng nói faster-whisper",
    )
    parser.add_argument(
        "--bilingual",
        action="store_true",
        help="Xuất phụ đề song ngữ Việt - Trung",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Chạy kiểm thử nhanh toàn bộ luồng chia lô ngữ cảnh và xuất SRT",
    )

    args = parser.parse_args()
    out_path = Path(args.output)

    if args.demo or not args.input:
        run_demo_pipeline(out_path, bilingual=args.bilingual or True)
        return 0

    video_path = Path(args.input)
    wav_path = video_path.with_suffix(".16k.wav")
    print(f"[1/4] Đang trích xuất âm thanh 16kHz mono bằng FFmpeg từ: {video_path}")
    extract_audio_ffmpeg(video_path, wav_path)

    print(f"[2/4] Đang nhận dạng tiếng Trung bằng faster-whisper ({args.model})...")
    items = transcribe_chinese_audio(
        wav_path,
        model_size=args.model,
        on_progress=lambda pct, msg: print(f"  [{pct}%] {msg}"),
    )
    print(f"[3/4] Đã nhận dạng {len(items)} câu thoại. Đang xuất phụ đề...")
    srt_text = export_srt_content(items, bilingual=args.bilingual)
    out_path.write_text(srt_text, encoding="utf-8")
    print(f"[4/4] Hoàn tất! File phụ đề đã lưu tại: {out_path.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
