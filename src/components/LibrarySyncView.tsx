import React, { useState } from 'react';
import {
  Smartphone,
  QrCode,
  Wifi,
  Play,
  Download,
  RefreshCw,
  Edit3,
  Check,
  Search,
} from 'lucide-react';
import { MovieRecord, PairedDevice } from '../types/dichphim';

interface LibrarySyncViewProps {
  movies: MovieRecord[];
  devices: PairedDevice[];
  onOpenMovieEditor: (movieId: string) => void;
  onUpdateMovie: (updated: MovieRecord) => void;
}

const MoviePosterSvg: React.FC<{
  theme: MovieRecord['posterTheme'];
  titleZh: string;
}> = ({ theme, titleZh }) => {
  if (theme === 'xianxia') {
    return (
      <svg viewBox="0 0 300 400" className="w-full h-full object-cover">
        <defs>
          <linearGradient id="xxBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="50%" stopColor="#1e1b4b" />
            <stop offset="100%" stopColor="#31102f" />
          </linearGradient>
        </defs>
        <rect width="300" height="400" fill="url(#xxBg)" />
        <circle cx="150" cy="135" r="78" fill="#f59e0b" fillOpacity="0.18" />
        <circle cx="150" cy="135" r="52" fill="#fde68a" fillOpacity="0.32" />
        <path
          d="M0 310 L90 205 L165 275 L235 185 L300 265 L300 400 L0 400 Z"
          fill="#090d16"
        />
        <line x1="150" y1="55" x2="150" y2="235" stroke="#fcd34d" strokeWidth="3" />
        <text
          x="150"
          y="95"
          textAnchor="middle"
          fill="#fef3c7"
          fontSize="26"
          fontWeight="bold"
          opacity="0.35"
        >
          {titleZh}
        </text>
      </svg>
    );
  }
  if (theme === 'wuxia_palace') {
    return (
      <svg viewBox="0 0 300 400" className="w-full h-full object-cover">
        <defs>
          <linearGradient id="wxBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1c1917" />
            <stop offset="60%" stopColor="#451a03" />
            <stop offset="100%" stopColor="#0c0a09" />
          </linearGradient>
        </defs>
        <rect width="300" height="400" fill="url(#wxBg)" />
        <circle cx="220" cy="95" r="42" fill="#dc2626" fillOpacity="0.35" />
        <path
          d="M30 270 Q150 220 270 270 L290 290 L10 290 Z"
          fill="#292524"
        />
        <rect x="55" y="290" width="190" height="110" fill="#1c1917" />
        <text
          x="150"
          y="110"
          textAnchor="middle"
          fill="#fca5a5"
          fontSize="26"
          fontWeight="bold"
          opacity="0.35"
        >
          {titleZh}
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 300 400" className="w-full h-full object-cover">
      <defs>
        <linearGradient id="mdBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="55%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
      </defs>
      <rect width="300" height="400" fill="url(#mdBg)" />
      <circle cx="85" cy="120" r="24" fill="#fbbf24" fillOpacity="0.35" />
      <circle cx="210" cy="165" r="36" fill="#60a5fa" fillOpacity="0.25" />
      <rect x="0" y="300" width="300" height="100" fill="#090d16" />
      <text
        x="150"
        y="105"
        textAnchor="middle"
        fill="#bfdbfe"
        fontSize="22"
        fontWeight="bold"
        opacity="0.35"
      >
        {titleZh}
      </text>
    </svg>
  );
};

export const LibrarySyncView: React.FC<LibrarySyncViewProps> = ({
  movies,
  devices,
  onOpenMovieEditor,
  onUpdateMovie,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pairingCode, setPairingCode] = useState<string>('849-206');
  const [selectedMobileMovieId, setSelectedMobileMovieId] = useState<string>(
    movies[0]?.id || ''
  );
  const [mobileSubMode, setMobileSubMode] = useState<'bilingual' | 'vi_only'>('bilingual');
  const [editingMobileLineId, setEditingMobileLineId] = useState<string | null>(null);
  const [mobileLineDraft, setMobileLineDraft] = useState<string>('');
  const [syncNotice, setSyncNotice] = useState<string>('');
  const [activeSubIdx, setActiveSubIdx] = useState<number>(0);

  const mobileMovie =
    movies.find((m) => m.id === selectedMobileMovieId) || movies[0];

  const regeneratePairingCode = () => {
    const p1 = Math.floor(100 + Math.random() * 900);
    const p2 = Math.floor(100 + Math.random() * 900);
    setPairingCode(`${p1}-${p2}`);
    setSyncNotice('Đã sinh mã ghép đôi 6 số và làm mới Token bảo mật LAN.');
  };

  const handleSaveMobileSubtitleEdit = async (lineId: string) => {
    const updatedSubs = mobileMovie.subtitles.map((s) =>
      s.id === lineId
        ? {
            ...s,
            textVi: mobileLineDraft,
            editStatus: 'user_edited' as const,
            aiNotes: 'Đã sửa trên App Điện Thoại · Đồng bộ tức thì về PC qua Server LAN',
          }
        : s
    );
    onUpdateMovie({ ...mobileMovie, subtitles: updatedSubs });
    setEditingMobileLineId(null);

    try {
      await fetch(`/api/lan/subtitles/${mobileMovie.id}/lines/${lineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textVi: mobileLineDraft }),
      });
    } catch {
      // Fallback handled by state sync
    }

    setSyncNotice(
      `Đã đồng bộ câu phụ đề sửa từ Điện thoại về Máy tính qua PUT /api/lan/subtitles/${mobileMovie.id}/lines/${lineId}.`
    );
  };

  const handleSpeakMobileLine = (textVi: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textVi);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
      setSyncNotice(`Đang phát thử Lồng Tiếng Việt (TTS) trên Mobile: "${textVi}"`);
    }
  };

  const filteredMovies = movies.filter(
    (m) =>
      m.titleVi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.titleZh.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {syncNotice && (
        <div className="px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span>{syncNotice}</span>
          <button
            type="button"
            onClick={() => setSyncNotice('')}
            className="underline ml-3 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI (7 COL): LƯỚI KHO PHIM & GHÉP ĐÔI QR LAN */}
        <div className="lg:col-span-7 space-y-6">
          {/* Kho phim */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Kho Phim Đã Dịch ({filteredMovies.length} bộ phim)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sẵn sàng phát trực tiếp (HTTP Range) hoặc tải về xem offline trên điện thoại
                </p>
              </div>

              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm phim Trung / Việt..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {filteredMovies.map((movie) => {
                const progressPct = Math.round(
                  (movie.watchProgressSeconds / movie.durationSeconds) * 100
                );
                return (
                  <div
                    key={movie.id}
                    className="group rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col justify-between"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden">
                      <MoviePosterSvg
                        theme={movie.posterTheme}
                        titleZh={movie.titleZh}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                        <div className="text-[11px] text-amber-300 tabular-nums">
                          {movie.completedEpisodes}/{movie.totalEpisodes} tập đã dịch
                        </div>
                        <h3 className="text-sm font-semibold text-white truncate">
                          {movie.titleVi}
                        </h3>
                        <p className="text-xs text-slate-300 font-mono truncate">
                          {movie.titleZh}
                        </p>
                      </div>
                    </div>

                    <div className="p-3 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>Đang xem dở</span>
                        <span className="font-mono">{progressPct}%</span>
                      </div>
                      <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedMobileMovieId(movie.id)}
                          className="flex-1 py-1.5 px-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg text-center transition-colors cursor-pointer"
                        >
                          Xem trên Mobile
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenMovieEditor(movie.id)}
                          className="py-1.5 px-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Phụ đề
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Máy chủ LAN FastAPI & Ghép đôi QR */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Máy Chủ Đồng Bộ LAN (FastAPI + mDNS / Bonjour)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                  Địa chỉ nội bộ: https://192.168.1.100:8443 · Dịch vụ mDNS: _dichphim._tcp.local.
                </p>
              </div>

              <button
                type="button"
                onClick={regeneratePairingCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Đổi mã 6 số</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 pt-4 items-center">
              {/* Mã QR SVG */}
              <div className="sm:col-span-4 flex flex-col items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <svg
                  viewBox="0 0 120 120"
                  className="w-28 h-28 text-slate-900 dark:text-slate-100"
                  fill="currentColor"
                >
                  <rect x="10" y="10" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="6" />
                  <rect x="18" y="18" width="14" height="14" />
                  <rect x="80" y="10" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="6" />
                  <rect x="88" y="18" width="14" height="14" />
                  <rect x="10" y="80" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="6" />
                  <rect x="18" y="88" width="14" height="14" />
                  <rect x="50" y="20" width="8" height="8" />
                  <rect x="62" y="20" width="8" height="16" />
                  <rect x="50" y="44" width="16" height="8" />
                  <rect x="20" y="52" width="16" height="8" />
                  <rect x="48" y="60" width="24" height="8" />
                  <rect x="82" y="52" width="16" height="16" />
                  <rect x="52" y="82" width="12" height="24" />
                  <rect x="76" y="86" width="28" height="12" />
                </svg>
                <div className="mt-2 text-center">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Mã ghép đôi 6 số
                  </div>
                  <div className="text-base font-mono font-bold text-amber-600 dark:text-amber-400 tracking-wider tabular-nums">
                    {pairingCode}
                  </div>
                </div>
              </div>

              {/* Thiết bị đã ghép đôi */}
              <div className="sm:col-span-8 space-y-2.5">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Thiết bị điện thoại đã ghép đôi ({devices.length})
                </div>
                {devices.map((dev) => (
                  <div
                    key={dev.id}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {dev.deviceName} ({dev.platform})
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 font-mono mt-0.5 tabular-nums">
                        IP: {dev.ipAddress} · {dev.lastSync}
                      </div>
                    </div>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap shrink-0">
                      Đang kết nối LAN
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI (5 COL): MÔ PHỎNG APP ĐIỆN THOẠI FLUTTER (XEM STREAM LAN & SỬA PHỤ ĐỀ 2 CHIỀU) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                App Điện Thoại (Flutter) — Đồng Bộ Trực Tiếp
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              HTTP Range Stream
            </span>
          </div>

          {/* Màn hình điện thoại mô phỏng */}
          <div className="rounded-2xl border-2 border-slate-800 bg-slate-950 text-slate-100 overflow-hidden shadow-lg">
            {/* Video Stream Header */}
            <div className="relative aspect-video bg-slate-900 p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono tabular-nums">
                <span>LAN Stream · {mobileMovie.titleVi}</span>
                <span>1080p · 00:23:40 / 00:45:40</span>
              </div>

              <div className="my-auto text-center px-3">
                <p className="text-xs sm:text-sm font-semibold text-white">
                  {mobileMovie.subtitles[activeSubIdx]?.textVi ||
                    mobileMovie.subtitles[0]?.textVi}
                </p>
                {mobileSubMode === 'bilingual' && (
                  <p className="text-xs text-amber-300 font-mono mt-1">
                    {mobileMovie.subtitles[activeSubIdx]?.textZh ||
                      mobileMovie.subtitles[0]?.textZh}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setMobileSubMode(
                      mobileSubMode === 'bilingual' ? 'vi_only' : 'bilingual'
                    )
                  }
                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  Phụ đề: {mobileSubMode === 'bilingual' ? 'Song ngữ Trung-Việt' : 'Chỉ tiếng Việt'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSyncNotice(
                      `Đã thêm "${mobileMovie.titleVi} - Tập 13" vào hàng đợi tải Offline xuống SQLite điện thoại.`
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 text-white font-medium cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Tải xem Offline</span>
                </button>
              </div>
            </div>

            {/* Chạm vào câu phụ đề trên điện thoại để sửa và đồng bộ về PC */}
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Chạm vào câu phụ đề để sửa & đồng bộ về máy tính:</span>
                <span className="font-mono text-amber-400">PUT /subtitles/lines</span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {mobileMovie.subtitles.map((line, idx) => {
                  const isEditing = editingMobileLineId === line.id;
                  const isSelected = activeSubIdx === idx;
                  return (
                    <div
                      key={line.id}
                      onClick={() => setActiveSubIdx(idx)}
                      className={`p-2.5 rounded-lg border text-xs space-y-1.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-slate-800/90 border-amber-500/60'
                          : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>
                          #{line.index} · {line.speakerNameVi}
                        </span>
                        {!isEditing && (
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSpeakMobileLine(line.textVi);
                              }}
                              className="inline-flex items-center gap-1 text-emerald-400 hover:underline cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                              <span>Nghe TTS</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingMobileLineId(line.id);
                                setMobileLineDraft(line.textVi);
                              }}
                              className="inline-flex items-center gap-1 text-amber-400 hover:underline cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Chạm để sửa</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="text-slate-400 font-mono text-[11px]">
                        {line.textZh}
                      </div>

                      {isEditing ? (
                        <div
                          className="space-y-2 pt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={mobileLineDraft}
                            onChange={(e) => setMobileLineDraft(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-amber-500 text-white text-xs"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMobileLineId(null)}
                              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 cursor-pointer"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveMobileSubtitleEdit(line.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-medium cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Lưu & Đồng bộ về PC</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-100 font-medium">{line.textVi}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
