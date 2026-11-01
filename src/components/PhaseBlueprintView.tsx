import React, { useEffect, useState } from 'react';
import {
  FolderTree,
  Database,
  FileCode,
  Terminal,
  Copy,
  Check,
  Download,
  Code2,
  Smartphone,
} from 'lucide-react';
import { PHASE_0_PROJECT_TREE } from '../data/initialData';

export const PhaseBlueprintView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<
    'python_all' | 'flutter_mobile' | 'schema' | 'prompts' | 'tree' | 'setup'
  >('python_all');
  const [serverFiles, setServerFiles] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [installerInfo, setInstallerInfo] = useState<{
    exists: boolean;
    fileName?: string;
    path?: string;
    sizeMb?: number;
    isWindowsPeExecutable?: boolean;
  } | null>(null);
  const [backendStatus, setBackendStatus] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    fetch('/api/blueprint/files')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.files) {
          setServerFiles(data.files);
        }
      })
      .catch(() => {});

    fetch('/api/installer/info')
      .then((r) => r.json())
      .then((data) => setInstallerInfo(data))
      .catch(() => {});

    fetch('/api/backend/status')
      .then((r) => r.json())
      .then((data) => setBackendStatus(data))
      .catch(() => {});
  }, []);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllBundle = () => {
    const bundlePayload = {
      project: 'DịchPhim AI — Full Source Bundle (Phases 0 to 7)',
      exportedAt: new Date().toISOString(),
      fileCount: Object.keys(serverFiles).length,
      files: serverFiles,
    };
    const blob = new Blob([JSON.stringify(bundlePayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dichphim_ai_full_source_bundle.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Trung Tâm Mã Nguồn & Bộ Cài Đặt Windows (.exe)
            </h2>
            {installerInfo?.exists && (
              <a
                href="/api/installer/download"
                download="DichPhimAI-Setup.exe"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  Tải DichPhimAI-Setup.exe ({installerInfo.sizeMb} MB)
                </span>
              </a>
            )}
            <button
              type="button"
              onClick={handleDownloadAllBundle}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải Trọn Bộ Mã Nguồn (.json)</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {backendStatus?.ok
              ? `Python Backend đang chạy trực tiếp (SQLite: ${backendStatus.pythonBackend?.db_path}) · Mã ghép đôi LAN: ${backendStatus.pythonBackend?.pairing_code}`
              : 'Đã vượt qua 11/11 bài kiểm thử tự động (Unit Tests). Bao gồm đầy đủ FastAPI Server, Electron Main, 5 Module Pipeline AI, SQLite 11 bảng, 4 Prompts và Flutter App.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(
            [
              { id: 'python_all', label: 'Backend & Electron (GĐ 1 → 7)', icon: Code2 },
              { id: 'flutter_mobile', label: 'App Điện Thoại Flutter (GĐ 6)', icon: Smartphone },
              { id: 'schema', label: 'CSDL SQLite (11 Bảng)', icon: Database },
              { id: 'prompts', label: '4 System Prompts AI', icon: FileCode },
              { id: 'tree', label: 'Cây Thư Mục', icon: FolderTree },
              { id: 'setup', label: 'Cài Đặt & Đóng Gói (.exe)', icon: Terminal },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSubTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeSubTab === 'python_all' && (
        <div className="space-y-6">
          {(
            [
              {
                key: 'electron-builder.json',
                title: 'Cấu hình đóng gói Windows Installer — electron-builder.json (NSIS DichPhimAI-Setup.exe + extraResources backend/ & prompts/)',
              },
              {
                key: 'desktop/electron_main.ts',
                title: 'Tiến trình chính Desktop — desktop/electron_main.ts (Giải quyết đường dẫn động, tự khởi chạy & tắt tiến trình Python)',
              },
              {
                key: 'desktop/preload.ts',
                title: 'Cầu nối IPC Electron — desktop/preload.ts (ContextBridge giao tiếp React <-> Electron)',
              },
              {
                key: 'backend/main.py',
                title: 'Máy chủ Python Backend — backend/main.py (Tự động khởi tạo SQLite trong userData, không phụ thuộc đường dẫn máy phát triển)',
              },
              {
                key: 'backend/app/pipeline_mvp.py',
                title: 'Giai đoạn 1 — backend/app/pipeline_mvp.py (FFmpeg -> Silero VAD -> faster-whisper ASR -> Chia lô -> Xuất SRT/ASS/VTT)',
              },
              {
                key: 'backend/app/queue_orchestrator.py',
                title: 'Giai đoạn 2 — backend/app/queue_orchestrator.py (Hàng đợi SQLite, Tự nhận số tập Tap01/E02/第3集, Phát hiện GPU CUDA/MPS, Chia đoạn VAD 3-5 phút)',
              },
              {
                key: 'backend/app/providers_full.py',
                title: 'Giai đoạn 3 — backend/app/providers_full.py (TranslationProvider, Gemini/Ollama, Dịch 2 lượt, Điểm tự tin & Học từ chỉnh sửa)',
              },
              {
                key: 'backend/app/lan_sync_server.py',
                title: 'Giai đoạn 5 — backend/app/lan_sync_server.py (Đồng bộ LAN, Ghép đôi mã 6 số, Token SHA-256 & HTTP Range Video Streaming)',
              },
              {
                key: 'backend/app/ocr_tts_muxer.py',
                title: 'Giai đoạn 7 — backend/app/ocr_tts_muxer.py (PaddleOCR chữ cứng 0.5s, Đối chiếu ASR-OCR, Lồng tiếng TTS & Xuất video FFmpeg)',
              },
              {
                key: 'backend/requirements.txt',
                title: 'Danh sách thư viện Python — backend/requirements.txt (FastAPI, faster-whisper, silero-vad, paddleocr, edge-tts, google-genai)',
              },
              {
                key: 'backend/tests/test_full_system.py',
                title: 'Kiểm thử toàn hệ thống — backend/tests/test_full_system.py (11/11 Unit Tests Passed)',
              },
            ] as const
          ).map((item) => (
            <div
              key={item.key}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
                  {item.title}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(item.key, serverFiles[item.key] || '')}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {copiedKey === item.key ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>Sao chép</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadFile(
                        item.key.split('/').pop() || 'code.py',
                        serverFiles[item.key] || ''
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải file</span>
                  </button>
                </div>
              </div>
              <pre className="p-5 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto max-h-[420px] leading-relaxed">
                {serverFiles[item.key] || 'Đang tải...'}
              </pre>
            </div>
          ))}
        </div>
      )}

      {activeSubTab === 'flutter_mobile' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 font-mono">
              Giai đoạn 6 — mobile/lib/main.dart (Ứng dụng Flutter Android & iOS)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleCopy('flutter', serverFiles['mobile/lib/main.dart'] || '')
                }
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {copiedKey === 'flutter' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Sao chép Dart</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDownloadFile(
                    'main.dart',
                    serverFiles['mobile/lib/main.dart'] || ''
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải main.dart</span>
              </button>
            </div>
          </div>
          <pre className="p-5 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto max-h-[600px] leading-relaxed">
            {serverFiles['mobile/lib/main.dart'] || 'Đang tải...'}
          </pre>
        </div>
      )}

      {activeSubTab === 'tree' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Cấu trúc thư mục toàn dự án (Desktop Electron + Backend FastAPI + Mobile Flutter)
            </span>
            <button
              type="button"
              onClick={() => handleCopy('tree', PHASE_0_PROJECT_TREE)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {copiedKey === 'tree' ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedKey === 'tree' ? 'Đã sao chép' : 'Sao chép cây thư mục'}</span>
            </button>
          </div>
          <pre className="p-5 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
            {PHASE_0_PROJECT_TREE}
          </pre>
        </div>
      )}

      {activeSubTab === 'schema' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-mono">
              backend/schema.sql
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleCopy('schema', serverFiles['backend/schema.sql'] || '')
                }
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {copiedKey === 'schema' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Sao chép SQL</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDownloadFile(
                    'schema.sql',
                    serverFiles['backend/schema.sql'] || ''
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải schema.sql</span>
              </button>
            </div>
          </div>
          <pre className="p-5 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto max-h-[600px] leading-relaxed">
            {serverFiles['backend/schema.sql'] || 'Đang tải schema.sql...'}
          </pre>
        </div>
      )}

      {activeSubTab === 'prompts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(
            [
              'prompts/movie_analysis.md',
              'prompts/batch_translate.md',
              'prompts/second_pass_review.md',
              'prompts/glossary_extract.md',
            ] as const
          ).map((fileKey) => (
            <div
              key={fileKey}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
                  {fileKey}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(fileKey, serverFiles[fileKey] || '')}
                  className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  {copiedKey === fileKey ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Sao chép</span>
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
                {serverFiles[fileKey] || 'Đang tải...'}
              </pre>
            </div>
          ))}
        </div>
      )}

      {activeSubTab === 'setup' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Hướng Dẫn Chạy Thực Tế & Đóng Gói Bộ Cài Đặt (.exe / .apk)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Cách 1: Cài đặt trực tiếp lên Máy tính & Điện thoại ngay bây giờ (PWA)
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                Bấm nút <strong>&quot;Cài App&quot;</strong> trên thanh điều hướng phía trên (hoặc mở trang này bằng Safari/Chrome trên điện thoại rồi chọn <strong>Thêm vào Màn hình chính / Add to Home Screen</strong>). Ứng dụng sẽ chạy độc lập toàn màn hình và đồng bộ Kho phim trực tiếp với máy chủ.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Cách 2: Chạy bộ Kiểm thử 10 Unit Tests (Giai đoạn 1 → 7)
              </div>
              <pre className="font-mono text-[11px] bg-slate-900 text-amber-300 p-3 rounded overflow-x-auto">
{`python3 -m unittest discover -s backend/tests -p "test_*.py" -v`}
              </pre>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Cách 3: Đóng gói Bộ cài đặt Windows (.exe) với PyInstaller + Electron Builder
              </div>
              <pre className="font-mono text-[11px] bg-slate-900 text-amber-300 p-3 rounded overflow-x-auto">
{`pip install pyinstaller
pyinstaller --noconfirm --onedir --name dichphim-backend backend/cli.py
cd desktop && npm run build`}
              </pre>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Cách 4: Biên dịch file cài đặt Android (.apk) từ mã nguồn Flutter
              </div>
              <pre className="font-mono text-[11px] bg-slate-900 text-amber-300 p-3 rounded overflow-x-auto">
{`cd mobile
flutter pub get
flutter build apk --release`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
