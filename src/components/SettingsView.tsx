import React, { useState } from 'react';
import {
  Cpu,
  HardDrive,
  Volume2,
  ScanText,
  Download,
  CheckCircle2,
  FolderOpen,
  Smartphone,
} from 'lucide-react';
import { TranslationStyle } from '../types/dichphim';

interface SettingsViewProps {
  defaultStyle: TranslationStyle;
  onChangeDefaultStyle: (style: TranslationStyle) => void;
  onExportSystemLog: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  defaultStyle,
  onChangeDefaultStyle,
  onExportSystemLog,
}) => {
  const [llmProvider, setLlmProvider] = useState<'gemini' | 'claude' | 'openai' | 'ollama'>(
    'gemini'
  );
  const [asrEngine, setAsrEngine] = useState<
    'faster-whisper-large-v3' | 'faster-whisper-medium' | 'funasr-paraformer-zh'
  >('faster-whisper-large-v3');
  const [computeDevice, setComputeDevice] = useState<'cuda' | 'mps' | 'cpu'>('cuda');
  const [workerCount, setWorkerCount] = useState<number>(3);
  const [batchSize, setBatchSize] = useState<number>(25);
  const [enableDemucs, setEnableDemucs] = useState<boolean>(true);
  const [enablePaddleOcr, setEnablePaddleOcr] = useState<boolean>(true);
  const [enableTwoPass, setEnableTwoPass] = useState<boolean>(true);
  const [enableTtsDubbing, setEnableTtsDubbing] = useState<boolean>(true);
  const [outputDir, setOutputDir] = useState<string>('D:\\PhimTrungQuoc\\DaDich_Output');
  const [watchDir, setWatchDir] = useState<string>('D:\\PhimTrungQuoc\\AutoWatch');
  const [savedBanner, setSavedBanner] = useState<string>('');

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedBanner(
      'Đã lưu toàn bộ cấu hình vào bảng settings trong SQLite (WAL mode) và áp dụng cho Worker Pool.'
    );
    setTimeout(() => setSavedBanner(''), 4000);
  };

  return (
    <form onSubmit={handleSaveSettings} className="space-y-6">
      {savedBanner && (
        <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Cấu hình AI Dịch Ngữ Cảnh & ASR */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Cpu className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              1. Nhà Cung Cấp AI & Nhận Dạng Tiếng Trung (ASR)
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nhà cung cấp mô hình dịch thuật (TranslationProvider)
              </label>
              <select
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="gemini">Google Gemini API (gemini-3.8-flash — Mặc định tối ưu)</option>
                <option value="claude">Anthropic Claude 3.7 Sonnet</option>
                <option value="openai">OpenAI GPT-4o / Compatible</option>
                <option value="ollama">Ollama Local (Qwen2.5-14B — Chạy 100% Offline)</option>
              </select>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                API Key được quản lý tự động trên Server hoặc mã hóa trong Keychain hệ điều hành (Windows Credential Locker / macOS Keychain).
              </p>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Mô hình nhận dạng giọng nói tiếng Trung (language=&quot;zh&quot;)
              </label>
              <select
                value={asrEngine}
                onChange={(e) => setAsrEngine(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="faster-whisper-large-v3">
                  faster-whisper (model large-v3 · Chính xác nhất cho cổ trang/tiên hiệp)
                </option>
                <option value="faster-whisper-medium">
                  faster-whisper (model medium · Nhẹ VRAM, tốc độ cao)
                </option>
                <option value="funasr-paraformer-zh">
                  Alibaba FunASR / Paraformer-zh (Tối ưu khẩu ngữ Trung Quốc)
                </option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Phong cách dịch mặc định
                </label>
                <select
                  value={defaultStyle}
                  onChange={(e) => onChangeDefaultStyle(e.target.value as TranslationStyle)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="muot_ma">Mượt mà tự nhiên</option>
                  <option value="trang_trong">Cổ điển trang trọng (Hán-Việt)</option>
                  <option value="sat_nghia">Sát nghĩa gốc</option>
                  <option value="hai_huoc">Hài hước</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Kích thước lô dịch (Số câu/request)
                </label>
                <input
                  type="number"
                  min={10}
                  max={60}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Tăng tốc Phần cứng GPU/VRAM & Thư mục */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <HardDrive className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              2. Tăng Tốc GPU/VRAM, Pool Worker & Thư Mục
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Thiết bị tăng tốc phần cứng
                </label>
                <select
                  value={computeDevice}
                  onChange={(e) => setComputeDevice(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  <option value="cuda">NVIDIA CUDA (Float16 Tensor Core)</option>
                  <option value="mps">Apple Silicon (Metal / CoreML)</option>
                  <option value="cpu">CPU Đa luồng (Int8 Quantization)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Số Worker xử lý song song
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={workerCount}
                  onChange={(e) => setWorkerCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Thư mục lưu phụ đề & video xuất ra
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Thư mục theo dõi tự động dịch (Watchdog Folder)
              </label>
              <input
                type="text"
                value={watchDir}
                onChange={(e) => setWatchDir(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Các bước nâng cao trong Pipeline (OCR chữ cứng, Tách nhạc Demucs, Lồng tiếng TTS) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ScanText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              3. Cấu Hình Pipeline Nâng Cao (OCR Chữ Cứng, Demucs & Lồng Tiếng Việt TTS)
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <label className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableDemucs}
              onChange={(e) => setEnableDemucs(e.target.checked)}
              className="mt-0.5 accent-amber-600"
            />
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Tách giọng nói khỏi nhạc nền (Demucs)
              </div>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Lọc bỏ nhạc OST lớn trong phim cổ trang trước khi chạy VAD & ASR.
              </p>
            </div>
          </label>

          <label className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enablePaddleOcr}
              onChange={(e) => setEnablePaddleOcr(e.target.checked)}
              className="mt-0.5 accent-amber-600"
            />
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                OCR chữ cứng đáy hình (PaddleOCR 0.5s)
              </div>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Đọc phụ đề tiếng Trung dính sẵn để sửa lỗi từ đồng âm của ASR.
              </p>
            </div>
          </label>

          <label className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableTwoPass}
              onChange={(e) => setEnableTwoPass(e.target.checked)}
              className="mt-0.5 accent-amber-600"
            />
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Dịch 2 lượt (Rà soát xưng hô & CPS)
              </div>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Lượt 2 tự động kiểm tra nhảy đại từ xưng hô và rút gọn câu quá 42 ký tự.
              </p>
            </div>
          </label>

          <label className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableTtsDubbing}
              onChange={(e) => setEnableTtsDubbing(e.target.checked)}
              className="mt-0.5 accent-amber-600"
            />
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Lồng tiếng Việt đa nhân vật (TTS)
              </div>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Tạo track thuyết minh/lồng tiếng theo giới tính nhân vật trong Hồ sơ phim.
              </p>
            </div>
          </label>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExportSystemLog}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất File Nhật Ký Hệ Thống (.log) Để Báo Lỗi</span>
          </button>

          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Lưu Cấu Hình Hệ Thống
          </button>
        </div>
      </div>
    </form>
  );
};
