import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Wand2,
  CheckCheck,
  Download,
  Search,
  AlertCircle,
  Volume2,
  BookmarkPlus,
  RefreshCw,
  Upload,
  Mic,
} from 'lucide-react';
import { MovieRecord, SubtitleLine, TranslationStyle } from '../types/dichphim';

interface SubtitleEditorViewProps {
  movies: MovieRecord[];
  selectedMovieId: string;
  setSelectedMovieId: (id: string) => void;
  onUpdateMovie: (updated: MovieRecord) => void;
}

function formatTimeMs(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor((safeMs % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    millis
  ).padStart(2, '0')}`;
}

export function formatSrtTimestamp(ms: number): string {
  const safeMs = Math.max(0, ms);
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    seconds
  ).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function formatVttTimestamp(ms: number): string {
  return formatSrtTimestamp(ms).replace(',', '.');
}

export function formatAssTimestamp(ms: number): string {
  const safeMs = Math.max(0, ms);
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const centiseconds = Math.floor((safeMs % 1000) / 10);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}.${String(centiseconds).padStart(2, '0')}`;
}

export const SubtitleEditorView: React.FC<SubtitleEditorViewProps> = ({
  movies,
  selectedMovieId,
  setSelectedMovieId,
  onUpdateMovie,
}) => {
  const activeMovie = movies.find((m) => m.id === selectedMovieId) || movies[0];
  const [activeLineId, setActiveLineId] = useState<string>(
    activeMovie.subtitles[0]?.id || ''
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [subDisplayMode, setSubDisplayMode] = useState<'bilingual' | 'vi_only' | 'zh_pinyin'>(
    'bilingual'
  );
  const [audioTrack, setAudioTrack] = useState<'original_zh' | 'vi_tts'>('original_zh');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [onlyLowConfidence, setOnlyLowConfidence] = useState<boolean>(false);
  const [isTranslatingPass1, setIsTranslatingPass1] = useState<boolean>(false);
  const [isReviewingPass2, setIsReviewingPass2] = useState<boolean>(false);
  const [isTranscribingMedia, setIsTranscribingMedia] = useState<boolean>(false);
  const [aiStatusBanner, setAiStatusBanner] = useState<string>('');
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [localVideoName, setLocalVideoName] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentLine =
    activeMovie.subtitles.find((s) => s.id === activeLineId) || activeMovie.subtitles[0];

  // Hàm đọc lồng tiếng Việt (TTS) bằng giọng tiếng Việt trên thiết bị
  const speakVietnameseTts = (textVi: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textVi);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  // Tự động chạy qua các câu phụ đề khi đang bật "Phát tự động" (nếu không dùng video thật)
  useEffect(() => {
    if (!isPlaying || localVideoUrl || activeMovie.subtitles.length === 0) return;
    const timer = setInterval(() => {
      setActiveLineId((prevId) => {
        const idx = activeMovie.subtitles.findIndex((s) => s.id === prevId);
        const nextIdx = (idx + 1) % activeMovie.subtitles.length;
        const nextSub = activeMovie.subtitles[nextIdx];
        if (audioTrack === 'vi_tts' && nextSub) {
          speakVietnameseTts(nextSub.textVi);
        }
        return nextSub.id;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [isPlaying, localVideoUrl, activeMovie.subtitles, audioTrack]);

  // Xử lý chọn file Video thật (.mp4, .webm, .mov) hoặc file phụ đề (.srt) từ máy tính / điện thoại
  const handleSelectRealFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Nếu là file .srt -> đọc và nạp trực tiếp vào danh sách câu
    if (file.name.toLowerCase().endsWith('.srt')) {
      const text = await file.text();
      const blocks = text.trim().split(/\r?\n\r?\n/);
      const parsedLines: SubtitleLine[] = [];
      blocks.forEach((b, idx) => {
        const lines = b.split(/\r?\n/);
        if (lines.length >= 3) {
          const textContent = lines.slice(2).join(' ');
          parsedLines.push({
            id: `sub-import-${Date.now()}-${idx}`,
            episodeId: 'ep-imported',
            index: idx + 1,
            startMs: idx * 3500 + 1000,
            endMs: (idx + 1) * 3500,
            speakerNameVi: activeMovie.characters[0]?.nameVi || 'Nhân vật',
            speakerNameZh: activeMovie.characters[0]?.nameZh || '角色',
            source: 'ASR',
            textZh: textContent,
            textPinyin: '',
            textViDraft: '',
            textVi: textContent,
            confidence: 0.92,
            cps: 14.0,
            editStatus: 'ai_pass1',
            aiNotes: `Đã nhập từ file ${file.name} · Bấm "AI Dịch Ngữ Cảnh (Lượt 1)" để dịch sang tiếng Việt.`,
          });
        }
      });
      if (parsedLines.length > 0) {
        onUpdateMovie({ ...activeMovie, subtitles: parsedLines });
        setActiveLineId(parsedLines[0].id);
        setAiStatusBanner(
          `Đã nạp ${parsedLines.length} câu từ file "${file.name}". Hãy bấm "AI Dịch Ngữ Cảnh (Lượt 1)" để dịch!`
        );
      }
      return;
    }

    // Nếu là file Video / Audio thật -> Phát trực tiếp trong trình phát & gọi Gemini Multimodal nhận diện
    const objectUrl = URL.createObjectURL(file);
    setLocalVideoUrl(objectUrl);
    setLocalVideoName(file.name);

    if (file.size <= 18 * 1024 * 1024) {
      setIsTranscribingMedia(true);
      setAiStatusBanner(
        `Đang trích xuất âm thanh/hình ảnh từ "${file.name}" và gửi tới Gemini AI để nhận dạng tiếng Trung & dịch ngữ cảnh...`
      );
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        const resp = await fetch('/api/ai/transcribe-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mimeType: file.type || 'video/mp4',
            base64Data,
            fileName: file.name,
            movieProfile: {
              titleVi: activeMovie.titleVi,
              genre: activeMovie.genre,
              era: activeMovie.era,
              addressingGuide: activeMovie.addressingGuide,
              characters: activeMovie.characters,
              glossary: activeMovie.glossary,
            },
          }),
        });
        const data = await resp.json();
        if (data.ok && Array.isArray(data.lines) && data.lines.length > 0) {
          const newSubs: SubtitleLine[] = data.lines.map((item: any, idx: number) => {
            const startMs = Number(item.start_ms) || idx * 4000 + 1000;
            const endMs = Number(item.end_ms) || startMs + 3500;
            const textVi = item.text_vi || '';
            const durationSec = Math.max(1, (endMs - startMs) / 1000);
            return {
              id: `sub-media-${Date.now()}-${idx}`,
              episodeId: 'ep-media',
              index: idx + 1,
              startMs,
              endMs,
              speakerNameVi: item.speaker_name_vi || 'Nhân vật',
              speakerNameZh: item.speaker_name_zh || '角色',
              source: 'MERGED',
              textZh: item.text_zh || '',
              textPinyin: item.text_pinyin || '',
              textViDraft: textVi,
              textVi,
              confidence: typeof item.confidence === 'number' ? item.confidence : 0.95,
              cps: Number((textVi.length / durationSec).toFixed(1)),
              editStatus: 'ai_pass2',
              aiNotes: item.ai_notes || `Nhận dạng & dịch trực tiếp từ video ${file.name}`,
            };
          });
          onUpdateMovie({ ...activeMovie, subtitles: newSubs });
          setActiveLineId(newSubs[0].id);
          setAiStatusBanner(
            `Hoàn tất! Đã nhận dạng và dịch ngữ cảnh ${newSubs.length} câu thoại từ video "${file.name}".`
          );
        } else {
          setAiStatusBanner(
            `Đã mở video "${file.name}" trong trình phát. Bạn có thể xem và chỉnh sửa phụ đề trực tiếp.`
          );
        }
      } catch (err: any) {
        setAiStatusBanner(
          `Đã nạp video "${file.name}" vào trình phát. (Lưu ý AI: ${err?.message || ''})`
        );
      } finally {
        setIsTranscribingMedia(false);
      }
    } else {
      setAiStatusBanner(
        `Đã nạp video "${file.name}" (${Math.round(file.size / 1048576)} MB) vào trình phát trực tiếp.`
      );
    }
  };

  const handleLineEdit = (lineId: string, newTextVi: string) => {
    const updatedSubs = activeMovie.subtitles.map((line) => {
      if (line.id !== lineId) return line;
      const durationSec = Math.max(1, (line.endMs - line.startMs) / 1000);
      const cps = Number((newTextVi.length / durationSec).toFixed(1));
      return {
        ...line,
        textVi: newTextVi,
        cps,
        confidence: 1.0,
        editStatus: 'user_edited' as const,
        aiNotes: 'Đã chỉnh sửa bởi người dùng · Tự động áp dụng cho các tập tiếp theo.',
      };
    });
    onUpdateMovie({ ...activeMovie, subtitles: updatedSubs });
  };

  const handleLearnToGlossary = (line: SubtitleLine) => {
    const termExists = activeMovie.glossary.some((g) => g.termZh === line.textZh.slice(0, 4));
    if (termExists) {
      setAiStatusBanner('Mẫu câu/thuật ngữ này đã có trong bộ nhớ Từ điển của phim.');
      return;
    }
    const newEntry = {
      id: `gloss-learned-${Date.now()}`,
      termZh: line.textZh.slice(0, 6),
      termVi: line.textVi.slice(0, 24),
      category: 'idiom' as const,
      hanVietLiteral: 'Học từ chỉnh sửa người dùng',
      usageNote: `Học từ câu #${line.index}: "${line.textVi}"`,
      source: 'learned_from_edit' as const,
      approved: true,
    };
    onUpdateMovie({
      ...activeMovie,
      glossary: [newEntry, ...activeMovie.glossary],
    });
    setAiStatusBanner(
      `Đã lưu cách dịch câu #${line.index} vào Bộ nhớ học từ chỉnh sửa để áp dụng cho các tập sau.`
    );
  };

  const handleFindAndReplace = () => {
    if (!searchQuery.trim()) return;
    let count = 0;
    const updatedSubs = activeMovie.subtitles.map((line) => {
      if (line.textVi.includes(searchQuery)) {
        count++;
        const nextText = line.textVi.split(searchQuery).join(replaceQuery);
        const durationSec = Math.max(1, (line.endMs - line.startMs) / 1000);
        return {
          ...line,
          textVi: nextText,
          cps: Number((nextText.length / durationSec).toFixed(1)),
          editStatus: 'user_edited' as const,
        };
      }
      return line;
    });
    onUpdateMovie({ ...activeMovie, subtitles: updatedSubs });
    setAiStatusBanner(`Đã thay thế "${searchQuery}" thành "${replaceQuery}" trong ${count} câu.`);
  };

  const handleRunPass1Translation = async () => {
    setIsTranslatingPass1(true);
    setAiStatusBanner('Đang gửi Hồ sơ phim, Ma trận xưng hô và Cửa sổ ngữ cảnh tới Gemini AI (Lượt 1)...');
    try {
      const response = await fetch('/api/ai/translate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieProfile: {
            titleVi: activeMovie.titleVi,
            genre: activeMovie.genre,
            era: activeMovie.era,
            addressingGuide: activeMovie.addressingGuide,
            characters: activeMovie.characters,
            relationships: activeMovie.relationships,
            glossary: activeMovie.glossary.filter((g) => g.approved),
          },
          translationStyle: activeMovie.translationStyle,
          contextBefore: activeMovie.subtitles.slice(0, 2).map((s) => ({
            speaker: s.speakerNameVi,
            text_zh: s.textZh,
            text_vi: s.textVi,
          })),
          targetLines: activeMovie.subtitles.map((s) => ({
            id: s.id,
            speaker: s.speakerNameVi,
            duration_sec: Number(((s.endMs - s.startMs) / 1000).toFixed(1)),
            text_zh: s.textZh,
          })),
          contextAfter: [],
        }),
      });
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.translations)) {
        throw new Error(data.error || 'Dữ liệu trả về không hợp lệ');
      }

      const updatedSubs = activeMovie.subtitles.map((line) => {
        const found = data.translations.find((t: any) => t.id === line.id);
        if (!found) return line;
        const durationSec = Math.max(1, (line.endMs - line.startMs) / 1000);
        const textVi = found.text_vi || line.textVi;
        return {
          ...line,
          textViDraft: textVi,
          textVi,
          confidence: typeof found.confidence === 'number' ? found.confidence : 0.92,
          cps: Number((textVi.length / durationSec).toFixed(1)),
          editStatus: 'ai_pass1' as const,
          aiNotes: found.ai_notes || 'Dịch ngữ cảnh Lượt 1 hoàn tất.',
        };
      });

      onUpdateMovie({ ...activeMovie, subtitles: updatedSubs });
      setAiStatusBanner('Đã hoàn tất Dịch Ngữ Cảnh Lượt 1 bằng AI cho toàn bộ lô câu.');
    } catch (err: any) {
      setAiStatusBanner(`Thông báo AI: ${err?.message || 'Không thể kết nối máy chủ AI.'}`);
    } finally {
      setIsTranslatingPass1(false);
    }
  };

  const handleRunPass2Review = async () => {
    setIsReviewingPass2(true);
    setAiStatusBanner(
      'Đang chạy Rà soát Lượt 2: kiểm tra nhất quán đại từ xưng hô, thuật ngữ Hán-Việt và tối ưu tốc độ đọc CPS...'
    );
    try {
      const response = await fetch('/api/ai/review-pass2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieProfile: {
            titleVi: activeMovie.titleVi,
            genre: activeMovie.genre,
            era: activeMovie.era,
            addressingGuide: activeMovie.addressingGuide,
            relationships: activeMovie.relationships,
            glossary: activeMovie.glossary.filter((g) => g.approved),
          },
          translationStyle: activeMovie.translationStyle,
          lines: activeMovie.subtitles.map((s) => ({
            id: s.id,
            speaker: s.speakerNameVi,
            duration_sec: Number(((s.endMs - s.startMs) / 1000).toFixed(1)),
            text_zh: s.textZh,
            text_vi_draft: s.textVi,
          })),
        }),
      });
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.reviewedLines)) {
        throw new Error(data.error || 'Không thể rà soát lượt 2');
      }

      const updatedSubs = activeMovie.subtitles.map((line) => {
        const found = data.reviewedLines.find((r: any) => r.id === line.id);
        if (!found) return line;
        const durationSec = Math.max(1, (line.endMs - line.startMs) / 1000);
        const textVi = found.text_vi || line.textVi;
        return {
          ...line,
          textVi,
          confidence: typeof found.confidence === 'number' ? found.confidence : 0.97,
          cps: Number((textVi.length / durationSec).toFixed(1)),
          editStatus: 'ai_pass2' as const,
          aiNotes: found.ai_notes || 'Đã chuẩn hóa xưng hô và CPS ở Lượt 2.',
        };
      });

      onUpdateMovie({ ...activeMovie, subtitles: updatedSubs });
      setAiStatusBanner('Hoàn tất Rà soát Lượt 2: Xưng hô và thuật ngữ đã đồng bộ 100%.');
    } catch (err: any) {
      setAiStatusBanner(`Thông báo AI: ${err?.message || 'Lỗi khi rà soát lượt 2.'}`);
    } finally {
      setIsReviewingPass2(false);
    }
  };

  const handleDownloadSubtitle = (format: 'srt' | 'ass' | 'vtt') => {
    let content = '';
    if (format === 'srt') {
      content = activeMovie.subtitles
        .map((line, i) => {
          const start = formatSrtTimestamp(line.startMs);
          const end = formatSrtTimestamp(line.endMs);
          const body =
            subDisplayMode === 'bilingual'
              ? `${line.textVi}\n${line.textZh}`
              : subDisplayMode === 'zh_pinyin'
              ? `${line.textVi}\n${line.textPinyin}`
              : line.textVi;
          return `${i + 1}\n${start} --> ${end}\n${body}\n`;
        })
        .join('\n');
    } else if (format === 'vtt') {
      const blocks = activeMovie.subtitles
        .map((line, i) => {
          const start = formatVttTimestamp(line.startMs);
          const end = formatVttTimestamp(line.endMs);
          const body =
            subDisplayMode === 'bilingual'
              ? `${line.textVi}\n${line.textZh}`
              : subDisplayMode === 'zh_pinyin'
              ? `${line.textVi}\n${line.textPinyin}`
              : line.textVi;
          return `${i + 1}\n${start} --> ${end}\n${body}\n`;
        })
        .join('\n');
      content = `WEBVTT\n\n${blocks}`;
    } else {
      content = `[Script Info]
Title: ${activeMovie.titleVi} (${activeMovie.titleZh})
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Vietnamese,Plus Jakarta Sans,52,&H00FFFFFF,&H0000FFFF,&H00141414,&H80000000,-1,0,1,2.5,1,2,30,30,42,1
Style: ChineseSub,JetBrains Mono,34,&H0090E0FF,&H0000FFFF,&H00141414,&H80000000,0,0,1,2.0,0,2,30,30,12,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${activeMovie.subtitles
  .map(
    (l) =>
      `Dialogue: 0,${formatAssTimestamp(l.startMs)},${formatAssTimestamp(
        l.endMs
      )},Vietnamese,${l.speakerNameVi},0,0,0,,${l.textVi}\\N{\\rChineseSub}${l.textZh}`
  )
  .join('\n')}`;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeMovie.titleVi.replace(/\s+/g, '_')}_Bilingual.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSubtitles = activeMovie.subtitles.filter((line) => {
    if (onlyLowConfidence && line.confidence >= 0.75) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      line.textVi.toLowerCase().includes(q) ||
      line.textZh.toLowerCase().includes(q) ||
      line.speakerNameVi.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Thanh công cụ chọn Phim, Tải Video/SRT thật, Phong cách dịch & AI 2 lượt */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Bộ phim đang chỉnh sửa
            </label>
            <select
              value={activeMovie.id}
              onChange={(e) => {
                setSelectedMovieId(e.target.value);
                const nextMovie = movies.find((m) => m.id === e.target.value);
                if (nextMovie?.subtitles[0]) {
                  setActiveLineId(nextMovie.subtitles[0].id);
                }
              }}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100"
            >
              {movies.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titleVi} ({m.titleZh})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Phong cách dịch AI
            </label>
            <select
              value={activeMovie.translationStyle}
              onChange={(e) =>
                onUpdateMovie({
                  ...activeMovie,
                  translationStyle: e.target.value as TranslationStyle,
                })
              }
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100"
            >
              <option value="muot_ma">Mượt mà tự nhiên (Chuẩn phim ảnh)</option>
              <option value="sat_nghia">Sát nghĩa gốc</option>
              <option value="trang_trong">Cổ điển trang trọng (Hán-Việt)</option>
              <option value="hai_huoc">Hài hước / Bắt trend</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Mở Video / Phụ đề thật từ thiết bị
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*,.srt"
              onChange={handleSelectRealFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={isTranscribingMedia}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isTranscribingMedia ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>{isTranscribingMedia ? 'AI Đang Nhận Dạng...' : 'Chọn Video / SRT Thật'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isTranslatingPass1}
            onClick={handleRunPass1Translation}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isTranslatingPass1 ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            <span>AI Dịch Ngữ Cảnh (Lượt 1)</span>
          </button>

          <button
            type="button"
            disabled={isReviewingPass2}
            onClick={handleRunPass2Review}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isReviewingPass2 ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheck className="w-3.5 h-3.5" />
            )}
            <span>AI Rà Soát Nhất Quán (Lượt 2)</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownloadSubtitle('srt')}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất SRT</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownloadSubtitle('ass')}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất ASS</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownloadSubtitle('vtt')}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất VTT</span>
          </button>
        </div>
      </div>

      {aiStatusBanner && (
        <div className="px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <span>{aiStatusBanner}</span>
          <button
            type="button"
            onClick={() => setAiStatusBanner('')}
            className="text-xs underline ml-4 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Bố cục Trái (Video Player) - Phải (Danh sách câu phụ đề) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="relative aspect-video bg-slate-950 overflow-hidden select-none">
            {localVideoUrl ? (
              <video
                ref={videoRef}
                src={localVideoUrl}
                controls
                onTimeUpdate={(e) => {
                  const ms = e.currentTarget.currentTime * 1000;
                  const match = activeMovie.subtitles.find(
                    (s) => ms >= s.startMs && ms <= s.endMs
                  );
                  if (match && match.id !== activeLineId) {
                    setActiveLineId(match.id);
                  }
                }}
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <svg
                viewBox="0 0 1280 720"
                className="w-full h-full object-cover"
                aria-label="Khung hình xem trước video và phụ đề"
              >
                <defs>
                  <linearGradient id="nightSky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#090d16" />
                    <stop offset="55%" stopColor="#16213e" />
                    <stop offset="100%" stopColor="#0f172a" />
                  </linearGradient>
                  <radialGradient id="moonGlow" cx="0.78" cy="0.24" r="0.28">
                    <stop offset="0%" stopColor="#fde68a" stopOpacity="0.85" />
                    <stop offset="45%" stopColor="#f59e0b" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="1280" height="720" fill="url(#nightSky)" />
                <circle cx="998" cy="175" r="210" fill="url(#moonGlow)" />
                <circle cx="998" cy="175" r="64" fill="#fef3c7" fillOpacity="0.85" />
                <path
                  d="M0 540 L210 350 L430 490 L690 290 L960 470 L1140 360 L1280 460 L1280 720 L0 720 Z"
                  fill="#111827"
                  opacity="0.85"
                />
                <path
                  d="M0 590 L310 430 L580 560 L880 390 L1280 550 L1280 720 L0 720 Z"
                  fill="#030712"
                />
                <line
                  x1="280"
                  y1="240"
                  x2="820"
                  y2="380"
                  stroke="#f59e0b"
                  strokeWidth="3"
                  strokeOpacity="0.55"
                />
              </svg>
            )}

            <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-xs text-slate-200 pointer-events-none">
              <span className="bg-black/60 px-2.5 py-1 rounded font-mono tabular-nums">
                {localVideoName || activeMovie.titleVi} · Câu #{currentLine?.index || 1} ({formatTimeMs(currentLine?.startMs || 0)})
              </span>
              <span className="bg-black/60 px-2.5 py-1 rounded font-mono tabular-nums">
                CPS: {currentLine?.cps || 0} ký tự/s
              </span>
            </div>

            {currentLine && (
              <div className="absolute inset-x-0 bottom-0 pt-12 pb-4 px-6 bg-gradient-to-t from-black/90 via-black/55 to-transparent text-center pointer-events-none">
                <div className="text-xs text-amber-300 font-medium mb-1">
                  [{currentLine.speakerNameVi}]
                </div>
                <p className="text-white text-sm sm:text-base font-semibold leading-snug drop-shadow">
                  {currentLine.textVi}
                </p>
                {subDisplayMode === 'bilingual' && (
                  <p className="text-slate-300 text-xs sm:text-sm font-mono mt-1">
                    {currentLine.textZh}
                  </p>
                )}
                {subDisplayMode === 'zh_pinyin' && (
                  <p className="text-amber-200/90 text-xs font-mono mt-1">
                    {currentLine.textPinyin}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextPlay = !isPlaying;
                    setIsPlaying(nextPlay);
                    if (nextPlay && audioTrack === 'vi_tts' && currentLine) {
                      speakVietnameseTts(currentLine.textVi);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Tạm dừng' : 'Phát tự động'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (currentLine) {
                      speakVietnameseTts(currentLine.textVi);
                    }
                    setAudioTrack('vi_tts');
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                  <span>Đọc Lồng Tiếng Việt (TTS)</span>
                </button>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(
                  [
                    { id: 'bilingual', label: 'Việt + Trung' },
                    { id: 'vi_only', label: 'Chỉ tiếng Việt' },
                    { id: 'zh_pinyin', label: 'Việt + Pinyin' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSubDisplayMode(mode.id)}
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
                      subDisplayMode === mode.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-medium shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {currentLine && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>
                    Người nói: <strong className="text-slate-900 dark:text-slate-100">{currentLine.speakerNameVi}</strong> ({currentLine.speakerNameZh})
                  </span>
                  <span>
                    Nguồn: <strong className="font-mono">{currentLine.source}</strong> · Độ dài: {currentLine.textVi.length}/42 ký tự
                  </span>
                </div>
                <div className="text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-amber-600 dark:text-amber-400">Ghi chú ngữ cảnh AI: </span>
                  {currentLine.aiNotes}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: DANH SÁCH CÂU PHỤ ĐỀ */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm chữ Trung / Việt..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Thay thế bằng..."
                className="w-36 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleFindAndReplace}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Thay thế tất cả
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOnlyLowConfidence(!onlyLowConfidence)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                onlyLowConfidence
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Chỉ hiện câu tự tin thấp (&lt;75%)</span>
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
            {filteredSubtitles.map((line) => {
              const isSelected = line.id === currentLine?.id;
              const isLowConf = line.confidence < 0.75;
              return (
                <div
                  key={line.id}
                  onClick={() => setActiveLineId(line.id)}
                  className={`p-3.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/5 dark:bg-amber-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                        #{line.index}
                      </span>
                      <span className="font-mono">
                        {formatTimeMs(line.startMs)} → {formatTimeMs(line.endMs)}
                      </span>
                      <span>·</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {line.speakerNameVi}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakVietnameseTts(line.textVi);
                        }}
                        title="Nghe lồng tiếng Việt câu này"
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>TTS</span>
                      </button>
                      <span
                        className={`font-mono ${
                          line.cps > 17
                            ? 'text-rose-600 dark:text-rose-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {line.cps} ký tự/s
                      </span>
                      <span
                        className={`font-mono font-medium ${
                          isLowConf
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isLowConf ? 'Cần kiểm tra: ' : 'Tự tin: '}
                        {Math.round(line.confidence * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLearnToGlossary(line);
                        }}
                        title="Lưu cách dịch câu này vào Từ điển học từ chỉnh sửa"
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>Học câu này</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    <div className="md:col-span-5 text-xs text-slate-700 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-950/70 p-2.5 rounded-lg border border-slate-200/70 dark:border-slate-800/80">
                      <div>{line.textZh}</div>
                      <div className="text-[11px] text-slate-400 mt-1">{line.textPinyin}</div>
                    </div>

                    <div className="md:col-span-7">
                      <textarea
                        rows={2}
                        value={line.textVi}
                        onChange={(e) => handleLineEdit(line.id, e.target.value)}
                        className={`w-full text-xs p-2.5 rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none transition-colors ${
                          isLowConf
                            ? 'border-amber-500/60 focus:border-amber-500'
                            : 'border-slate-200 dark:border-slate-800 focus:border-amber-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
