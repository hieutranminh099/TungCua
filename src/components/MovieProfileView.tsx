import React, { useState } from 'react';
import {
  Sparkles,
  UserPlus,
  BookOpen,
  Check,
  Trash2,
  RefreshCw,
  Users,
  ArrowRight,
} from 'lucide-react';
import { GlossaryEntry, MovieGenre, MovieEra, MovieRecord } from '../types/dichphim';

interface MovieProfileViewProps {
  movies: MovieRecord[];
  selectedMovieId: string;
  setSelectedMovieId: (id: string) => void;
  onUpdateMovie: (updated: MovieRecord) => void;
}

export const MovieProfileView: React.FC<MovieProfileViewProps> = ({
  movies,
  selectedMovieId,
  setSelectedMovieId,
  onUpdateMovie,
}) => {
  const activeMovie = movies.find((m) => m.id === selectedMovieId) || movies[0];

  const [newTermZh, setNewTermZh] = useState<string>('');
  const [newTermVi, setNewTermVi] = useState<string>('');
  const [newTermCategory, setNewTermCategory] =
    useState<GlossaryEntry['category']>('cultivation_realm');
  const [newTermNote, setNewTermNote] = useState<string>('');

  const [newRelFrom, setNewRelFrom] = useState<string>(
    activeMovie.characters[0]?.nameVi || ''
  );
  const [newRelTo, setNewRelTo] = useState<string>(
    activeMovie.characters[1]?.nameVi || ''
  );
  const [newRelType, setNewRelType] = useState<string>('Sư huynh - Sư muội');
  const [newPronounSelf, setNewPronounSelf] = useState<string>('sư huynh');
  const [newPronounTarget, setNewPronounTarget] = useState<string>('tiểu sư muội');

  const [isAnalyzingProfile, setIsAnalyzingProfile] = useState<boolean>(false);
  const [isSuggestingGlossary, setIsSuggestingGlossary] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const handleAddGlossaryTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTermZh.trim() || !newTermVi.trim()) return;
    const entry: GlossaryEntry = {
      id: `gloss-user-${Date.now()}`,
      termZh: newTermZh.trim(),
      termVi: newTermVi.trim(),
      category: newTermCategory,
      hanVietLiteral: newTermVi.trim(),
      usageNote: newTermNote.trim() || 'Thuật ngữ cố định do người dùng thêm',
      source: 'user_added',
      approved: true,
    };
    onUpdateMovie({
      ...activeMovie,
      glossary: [entry, ...activeMovie.glossary],
    });
    setNewTermZh('');
    setNewTermVi('');
    setNewTermNote('');
  };

  const handleAddRelationship = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelFrom.trim() || !newRelTo.trim()) return;
    const rel = {
      id: `rel-${Date.now()}`,
      fromNameVi: newRelFrom.trim(),
      toNameVi: newRelTo.trim(),
      relationType: newRelType.trim(),
      pronounSelf: newPronounSelf.trim(),
      pronounTarget: newPronounTarget.trim(),
      contextNote: 'Áp dụng nhất quán xuyên suốt bộ phim',
    };
    onUpdateMovie({
      ...activeMovie,
      relationships: [...activeMovie.relationships, rel],
    });
  };

  // Gọi AI Phân tích Hồ sơ phim thật (/api/ai/analyze-movie)
  const handleRunAiMovieAnalysis = async () => {
    setIsAnalyzingProfile(true);
    setStatusMessage('Đang gửi mẫu hội thoại tiếng Trung cho Gemini AI để trích xuất Hồ sơ phim...');
    try {
      const response = await fetch('/api/ai/analyze-movie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleZh: activeMovie.titleZh,
          sampleLines: activeMovie.subtitles.map((s) => s.textZh),
        }),
      });
      const data = await response.json();
      if (!data.ok || !data.profile) {
        throw new Error(data.error || 'Không nhận được Hồ sơ phim hợp lệ');
      }

      const p = data.profile;
      const newGlossary: GlossaryEntry[] = Array.isArray(p.glossary)
        ? p.glossary.map((g: any, idx: number) => ({
            id: `gloss-ai-${Date.now()}-${idx}`,
            termZh: g.term_zh || '',
            termVi: g.term_vi || '',
            category: (g.category as GlossaryEntry['category']) || 'skill',
            hanVietLiteral: g.han_viet_literal || g.term_vi || '',
            usageNote: g.usage_note || 'AI trích xuất từ hội thoại',
            source: 'ai_suggested' as const,
            approved: true,
          }))
        : [];

      onUpdateMovie({
        ...activeMovie,
        synopsis: p.synopsis || activeMovie.synopsis,
        addressingGuide: p.addressing_guide || activeMovie.addressingGuide,
        glossary: [
          ...newGlossary.filter(
            (ng) => !activeMovie.glossary.some((eg) => eg.termZh === ng.termZh)
          ),
          ...activeMovie.glossary,
        ],
      });
      setStatusMessage('AI đã cập nhật Hồ sơ phim, Quy tắc xưng hô và Từ điển thuật ngữ.');
    } catch (err: any) {
      setStatusMessage(`Thông báo: ${err?.message || 'Lỗi khi phân tích Hồ sơ phim.'}`);
    } finally {
      setIsAnalyzingProfile(false);
    }
  };

  // Gọi AI Đề xuất Từ điển thuật ngữ mới (/api/ai/suggest-glossary)
  const handleRunSuggestGlossary = async () => {
    setIsSuggestingGlossary(true);
    setStatusMessage('Đang quét lời thoại tiếng Trung để đề xuất thuật ngữ Hán-Việt mới...');
    try {
      const response = await fetch('/api/ai/suggest-glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre: activeMovie.genre,
          era: activeMovie.era,
          lines: activeMovie.subtitles.map((s) => s.textZh),
        }),
      });
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.suggestions)) {
        throw new Error(data.error || 'Không thể trích xuất từ điển');
      }

      const added: GlossaryEntry[] = data.suggestions
        .filter((s: any) => s.term_zh && !activeMovie.glossary.some((g) => g.termZh === s.term_zh))
        .map((s: any, idx: number) => ({
          id: `gloss-sug-${Date.now()}-${idx}`,
          termZh: s.term_zh,
          termVi: s.term_vi,
          category: 'skill' as const,
          hanVietLiteral: s.han_viet_literal || s.term_vi,
          usageNote: s.usage_note || 'Đề xuất mới từ AI (Chờ duyệt)',
          source: 'ai_suggested' as const,
          approved: false,
        }));

      onUpdateMovie({
        ...activeMovie,
        glossary: [...added, ...activeMovie.glossary],
      });
      setStatusMessage(
        added.length > 0
          ? `AI đã đề xuất thêm ${added.length} thuật ngữ mới. Hãy bấm Duyệt để đưa vào Prompt dịch.`
          : 'Tất cả thuật ngữ quan trọng trong đoạn thoại đã có sẵn trong Từ điển.'
      );
    } catch (err: any) {
      setStatusMessage(`Thông báo: ${err?.message || 'Lỗi khi đề xuất từ điển.'}`);
    } finally {
      setIsSuggestingGlossary(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header chọn phim & Phân tích AI */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Hồ sơ ngữ cảnh của bộ phim
            </label>
            <select
              value={activeMovie.id}
              onChange={(e) => setSelectedMovieId(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
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
              Thể loại phim
            </label>
            <select
              value={activeMovie.genre}
              onChange={(e) =>
                onUpdateMovie({ ...activeMovie, genre: e.target.value as MovieGenre })
              }
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="tien_hiep">Tiên hiệp / Huyền huyễn</option>
              <option value="kiem_hiep">Kiếm hiệp / Giang hồ</option>
              <option value="co_trang">Cổ trang / Cung đấu / Quyền mưu</option>
              <option value="ngon_tinh">Ngôn tình / Thanh xuân</option>
              <option value="hien_dai">Hiện đại / Đô thị</option>
              <option value="hai">Hài hước</option>
              <option value="hanh_dong">Hành động / Hình sự</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Bối cảnh thời đại
            </label>
            <select
              value={activeMovie.era}
              onChange={(e) =>
                onUpdateMovie({ ...activeMovie, era: e.target.value as MovieEra })
              }
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="huyen_huyen">Thượng cổ / Tam giới Huyền huyễn</option>
              <option value="co_dai">Phong kiến Cổ đại</option>
              <option value="dan_quoc">Dân quốc</option>
              <option value="hien_dai">Hiện đại</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={isAnalyzingProfile}
            onClick={handleRunAiMovieAnalysis}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isAnalyzingProfile ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>Phân Tích Hồ Sơ Phim Bằng AI</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
          {statusMessage}
        </div>
      )}

      {/* Tóm tắt & Quy tắc xưng hô bắt buộc */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Tóm Tắt Cốt Truyện & Bối Cảnh (Đưa vào mọi Request LLM)
          </h3>
          <textarea
            rows={3}
            value={activeMovie.synopsis}
            onChange={(e) => onUpdateMovie({ ...activeMovie, synopsis: e.target.value })}
            className="w-full text-xs p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Quy Tắc Xưng Hô Theo Thể Loại
          </h3>
          <textarea
            rows={3}
            value={activeMovie.addressingGuide}
            onChange={(e) =>
              onUpdateMovie({ ...activeMovie, addressingGuide: e.target.value })
            }
            className="w-full text-xs p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Danh sách Nhân vật + Ma trận Quan hệ Xưng hô */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Nhân vật */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Danh Sách Nhân Vật ({activeMovie.characters.length})
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Chuẩn hóa tên Hán-Việt & giọng lồng tiếng
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeMovie.characters.map((char) => (
              <div key={char.id} className="py-3 first:pt-0 last:pb-0 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {char.nameVi}{' '}
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      ({char.nameZh})
                    </span>
                  </div>
                  <span className="text-slate-500 dark:text-slate-400">
                    {char.gender} · {char.estimatedAge} · Vai {char.role}
                  </span>
                </div>
                <div className="text-slate-600 dark:text-slate-300">
                  Tự xưng mặc định: <strong className="font-mono">{char.selfPronounDefault}</strong> · Gọi người khác:{' '}
                  <strong className="font-mono">{char.addressOthersDefault}</strong>
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  Tính cách: {char.personalityAndTone} · Giọng TTS: <code className="text-amber-600 dark:text-amber-400">{char.ttsVoiceId}</code>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ma trận Quan hệ Xưng hô cặp nhân vật */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ma Trận Xưng Hô Giữa Từng Cặp Nhân Vật
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Giữ nhất quán xuyên suốt các tập
            </span>
          </div>

          <div className="space-y-2.5 mb-4">
            {activeMovie.relationships.map((rel) => (
              <div
                key={rel.id}
                className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                    <span>{rel.fromNameVi}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                    <span>{rel.toNameVi}</span>
                  </div>
                  <span className="text-slate-500 dark:text-slate-400">{rel.relationType}</span>
                </div>
                <div className="text-slate-700 dark:text-slate-300">
                  Tự xưng: <strong className="text-amber-600 dark:text-amber-400">{rel.pronounSelf}</strong> · Gọi đối phương:{' '}
                  <strong className="text-amber-600 dark:text-amber-400">{rel.pronounTarget}</strong>
                </div>
                {rel.contextNote && (
                  <div className="text-slate-500 dark:text-slate-400 mt-1">
                    Lưu ý cốt truyện: {rel.contextNote}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddRelationship}
            className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs"
          >
            <input
              type="text"
              value={newRelFrom}
              onChange={(e) => setNewRelFrom(e.target.value)}
              placeholder="Người nói..."
              className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
            <input
              type="text"
              value={newRelTo}
              onChange={(e) => setNewRelTo(e.target.value)}
              placeholder="Người nghe..."
              className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
            <input
              type="text"
              value={newPronounSelf}
              onChange={(e) => setNewPronounSelf(e.target.value)}
              placeholder="Tự xưng (VD: ta)"
              className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
            <input
              type="text"
              value={newPronounTarget}
              onChange={(e) => setNewPronounTarget(e.target.value)}
              placeholder="Gọi (VD: nàng)"
              className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white rounded font-medium hover:bg-slate-800 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Thêm</span>
            </button>
          </form>
        </div>
      </div>

      {/* Từ điển Tên riêng, Công pháp, Cảnh giới & Thành ngữ */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Từ Điển Tên Riêng, Thuật Ngữ Hán-Việt & Thành Ngữ ({activeMovie.glossary.length} mục)
            </h3>
          </div>

          <button
            type="button"
            disabled={isSuggestingGlossary}
            onClick={handleRunSuggestGlossary}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isSuggestingGlossary ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>AI Tự Đề Xuất Thuật Ngữ Mới Từ Phụ Đề</span>
          </button>
        </div>

        {/* Form thêm từ mới */}
        <form
          onSubmit={handleAddGlossaryTerm}
          className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-4 mb-4 border-b border-slate-200 dark:border-slate-800 text-xs"
        >
          <input
            type="text"
            value={newTermZh}
            onChange={(e) => setNewTermZh(e.target.value)}
            placeholder="Chữ Hán gốc (VD: 结丹期)"
            className="sm:col-span-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
          />
          <input
            type="text"
            value={newTermVi}
            onChange={(e) => setNewTermVi(e.target.value)}
            placeholder="Bản dịch cố định (VD: Kết Đan Kỳ)"
            className="sm:col-span-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
          <select
            value={newTermCategory}
            onChange={(e) =>
              setNewTermCategory(e.target.value as GlossaryEntry['category'])
            }
            className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          >
            <option value="cultivation_realm">Cảnh giới tu luyện</option>
            <option value="sect">Môn phái / Tổ chức</option>
            <option value="skill">Công pháp / Thần khí</option>
            <option value="person">Tên người</option>
            <option value="location">Địa danh</option>
            <option value="idiom">Thành ngữ / Tiếng lóng</option>
          </select>
          <input
            type="text"
            value={newTermNote}
            onChange={(e) => setNewTermNote(e.target.value)}
            placeholder="Ghi chú ngữ cảnh sử dụng..."
            className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
          <button
            type="submit"
            className="sm:col-span-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Thêm Từ Điển
          </button>
        </form>

        {/* Bảng từ điển */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 font-medium">Từ gốc (Trung)</th>
                <th className="py-2.5 px-3 font-medium">Bản dịch cố định (Việt)</th>
                <th className="py-2.5 px-3 font-medium">Phân loại · Nguồn</th>
                <th className="py-2.5 px-3 font-medium">Ghi chú ngữ cảnh</th>
                <th className="py-2.5 px-3 font-medium text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {activeMovie.glossary.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {item.termZh}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-amber-600 dark:text-amber-400">
                    {item.termVi}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                    {item.category} ·{' '}
                    {item.source === 'learned_from_edit'
                      ? 'Học từ chỉnh sửa'
                      : item.source === 'user_added'
                      ? 'Người dùng thêm'
                      : 'AI đề xuất'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                    {item.usageNote}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {!item.approved ? (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateMovie({
                              ...activeMovie,
                              glossary: activeMovie.glossary.map((g) =>
                                g.id === item.id ? { ...g, approved: true } : g
                              ),
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-medium cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Duyệt</span>
                        </button>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Đã duyệt
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateMovie({
                            ...activeMovie,
                            glossary: activeMovie.glossary.filter((g) => g.id !== item.id),
                          })
                        }
                        className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
