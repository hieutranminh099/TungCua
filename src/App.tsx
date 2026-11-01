import React, { useEffect, useState } from 'react';
import {
  Sun,
  Moon,
  Layers,
  Subtitles,
  BookUser,
  Library,
  Settings,
  FileCode2,
  Download,
  Smartphone,
  X,
} from 'lucide-react';
import {
  INITIAL_JOBS,
  INITIAL_MOVIES,
  INITIAL_PAIRED_DEVICES,
} from './data/initialData';
import { MovieRecord, PairedDevice, TranslationStyle, VideoJob } from './types/dichphim';
import { WorkQueueView } from './components/WorkQueueView';
import { SubtitleEditorView } from './components/SubtitleEditorView';
import { MovieProfileView } from './components/MovieProfileView';
import { LibrarySyncView } from './components/LibrarySyncView';
import { SettingsView } from './components/SettingsView';
import { PhaseBlueprintView } from './components/PhaseBlueprintView';
import { usePWAInstall } from './hooks/usePWAInstall';

type ActiveSection =
  | 'queue'
  | 'editor'
  | 'profile'
  | 'library'
  | 'settings'
  | 'blueprint';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>('queue');
  const [jobs, setJobs] = useState<VideoJob[]>(INITIAL_JOBS);
  const [movies, setMovies] = useState<MovieRecord[]>(INITIAL_MOVIES);
  const [devices, setDevices] = useState<PairedDevice[]>(INITIAL_PAIRED_DEVICES);
  const [selectedMovieId, setSelectedMovieId] = useState<string>(
    INITIAL_MOVIES[0].id
  );
  const [defaultStyle, setDefaultStyle] = useState<TranslationStyle>('muot_ma');
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Nạp trạng thái đồng bộ từ Server khi khởi động để PC và Điện thoại luôn đồng nhất
  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.state) {
          if (Array.isArray(data.state.movies) && data.state.movies.length > 0) {
            setMovies(data.state.movies);
          }
          if (Array.isArray(data.state.devices) && data.state.devices.length > 0) {
            setDevices(data.state.devices);
          }
        }
      })
      .catch(() => {});
  }, []);

  const persistStateToServer = (
    nextMovies: MovieRecord[],
    nextJobs: VideoJob[],
    nextDevices: PairedDevice[]
  ) => {
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        movies: nextMovies,
        jobs: nextJobs,
        devices: nextDevices,
      }),
    }).catch(() => {});
  };

  const handleUpdateMovie = (updated: MovieRecord) => {
    setMovies((prev) => {
      const next = prev.map((m) => (m.id === updated.id ? updated : m));
      persistStateToServer(next, jobs, devices);
      return next;
    });
  };

  const handleOpenInEditor = (movieId: string) => {
    setSelectedMovieId(movieId);
    setActiveSection('editor');
  };

  const handleExportSystemLog = () => {
    const now = new Date().toISOString();
    const logContent = [
      `====================================================================`,
      `DỊCHPHIM AI — NHẬT KÝ HỆ THỐNG & CHẨN ĐOÁN (${now})`,
      `Số bộ phim trong Kho: ${movies.length} | Số công việc Hàng đợi: ${jobs.length}`,
      `Thiết bị ghép đôi LAN: ${devices.map((d) => d.deviceName).join(', ')}`,
      `====================================================================`,
      ...jobs.map(
        (j) =>
          `[${j.status.toUpperCase()}] ${j.fileName} | Tập ${j.episodeNumber} | Tiến độ: ${j.overallProgress}% | Bước: ${j.currentStepCode}`
      ),
    ].join('\n');

    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dichphim_ai_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 pb-20 md:pb-0">
      {/* TOP BAR CONTRACT: 3 Zones separated by gap-8 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#queue"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('queue');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          DịchPhim AI
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a
            href="#queue"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('queue');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'queue'
                ? 'text-amber-600 dark:text-amber-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Hàng đợi
          </a>
          <a
            href="#editor"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('editor');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'editor'
                ? 'text-amber-600 dark:text-amber-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Chỉnh sửa phụ đề
          </a>
          <a
            href="#profile"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('profile');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'profile'
                ? 'text-amber-600 dark:text-amber-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Hồ sơ phim
          </a>
          <a
            href="#library"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('library');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'library'
                ? 'text-amber-600 dark:text-amber-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Kho phim & Điện thoại
          </a>
          <a
            href="#settings"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('settings');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'settings'
                ? 'text-amber-600 dark:text-amber-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Cài đặt
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          {!isInstalled ? (
            <button
              type="button"
              onClick={async () => {
                if (isInstallable) {
                  await install();
                } else {
                  setShowInstallModal(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Cài App PC / Điện Thoại</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Giao diện Sáng</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-700" />
                  <span>Giao diện Tối</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Thanh công cụ phụ (Workspace Toolbar) cho phép bật/tắt Sáng/Tối & mở Mã nguồn GĐ 0 -> 7 */}
      <div className="bg-white dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800/80 px-6 py-2">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
            <span>
              Trạng thái: <strong className="text-emerald-600 dark:text-emerald-400">Đã sẵn sàng trên cả Máy tính & Điện thoại</strong>
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveSection('blueprint')}
              className={`inline-flex items-center gap-1 font-medium cursor-pointer ${
                activeSection === 'blueprint'
                  ? 'text-amber-600 dark:text-amber-400 underline'
                  : 'text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Xem & Tải Trọn Bộ Mã Nguồn (Giai đoạn 0 → 7)</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Chuyển sang nền Sáng</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Chuyển sang nền Tối</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* WORKSPACE CANVAS */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeSection === 'queue' && (
          <WorkQueueView
            jobs={jobs}
            setJobs={setJobs}
            onOpenInEditor={handleOpenInEditor}
          />
        )}

        {activeSection === 'editor' && (
          <SubtitleEditorView
            movies={movies}
            selectedMovieId={selectedMovieId}
            setSelectedMovieId={setSelectedMovieId}
            onUpdateMovie={handleUpdateMovie}
          />
        )}

        {activeSection === 'profile' && (
          <MovieProfileView
            movies={movies}
            selectedMovieId={selectedMovieId}
            setSelectedMovieId={setSelectedMovieId}
            onUpdateMovie={handleUpdateMovie}
          />
        )}

        {activeSection === 'library' && (
          <LibrarySyncView
            movies={movies}
            devices={devices}
            onOpenMovieEditor={handleOpenInEditor}
            onUpdateMovie={handleUpdateMovie}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsView
            defaultStyle={defaultStyle}
            onChangeDefaultStyle={setDefaultStyle}
            onExportSystemLog={handleExportSystemLog}
          />
        )}

        {activeSection === 'blueprint' && <PhaseBlueprintView />}
      </main>

      {/* THANH ĐIỀU HƯỚNG ĐÁY MÀN HÌNH CHO ĐIỆN THOẠI (ONE-HANDED THUMB NAVIGATION >= 44x44px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center h-16">
        {(
          [
            { id: 'queue', label: 'Hàng đợi', icon: Layers },
            { id: 'editor', label: 'Sửa Sub', icon: Subtitles },
            { id: 'profile', label: 'Hồ sơ', icon: BookUser },
            { id: 'library', label: 'Kho phim', icon: Library },
            { id: 'settings', label: 'Cài đặt', icon: Settings },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
                active
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-1 whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modal Hướng dẫn Cài đặt App lên Máy tính & Điện thoại */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Cài Đặt DịchPhim AI Lên Máy Tính & Điện Thoại
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  1. Trên Máy tính (Windows / macOS — Chrome hoặc Edge)
                </div>
                <p>
                  Nhấn vào biểu tượng <strong>Cài đặt DịchPhim AI</strong> ở góc phải thanh địa chỉ trình duyệt (hoặc mở tab mới để cài dạng cửa sổ Desktop độc lập).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  2. Trên Điện thoại iPhone / iPad (iOS Safari) & Android
                </div>
                <p>
                  Mở đường dẫn ứng dụng trên điện thoại $\rightarrow$ Nhấn nút <strong>Chia sẻ (Share)</strong> hoặc menu 3 chấm $\rightarrow$ Chọn <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>. Giao diện tự động chuyển sang chế độ 1 tay và đồng bộ trực tiếp với máy tính!
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowInstallModal(false);
                  setActiveSection('blueprint');
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Tải mã nguồn Python / Flutter
              </button>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
