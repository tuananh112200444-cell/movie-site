import { useState, useCallback } from 'react';
import type { MovieInfo, MovieReview } from '@/services/reviewService';
import { generateReview, saveReview, getActiveApiKey, getProvider } from '@/services/reviewService';

interface ReviewEditorProps {
  movie: MovieInfo;
  existingReview: MovieReview | null;
  onSaved: (review: MovieReview) => void;
  onRequestApiKey: () => void;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function ReviewEditor({ movie, existingReview, onSaved, onRequestApiKey }: ReviewEditorProps) {
  const [content, setContent] = useState(existingReview?.content ?? '');
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const wordCount = countWords(content);
  const provider = getProvider();

  const handleGenerate = useCallback(async () => {
    const apiKey = getActiveApiKey();
    if (!apiKey) {
      onRequestApiKey();
      return;
    }
    setGenerating(true);
    setError('');
    setContent('');
    try {
      await generateReview(movie, provider, apiKey, (text) => {
        setContent(text);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setGenerating(false);
    }
  }, [movie, provider, onRequestApiKey]);

  const handleSave = useCallback(async () => {
    if (!content.trim()) return;
    const review: MovieReview = {
      slug: movie.slug,
      movieName: movie.name,
      originName: movie.origin_name,
      content: content.trim(),
      wordCount: countWords(content),
      generatedAt: existingReview?.generatedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveReview(review);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved(review);
  }, [content, movie, existingReview, onSaved]);

  const providerLabel = provider === 'gemini' ? 'Gemini 2.5 Flash-Lite' : 'OpenAI';
  const providerColor = provider === 'gemini' ? 'text-violet-400 bg-violet-500/10 border-violet-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  const providerIcon = provider === 'gemini' ? 'ri-gemini-line' : 'ri-openai-line';

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-white font-bold text-base">{movie.name}</h3>
          {movie.origin_name && <p className="text-white/40 text-xs mt-0.5">{movie.origin_name}</p>}
        </div>
        <div className="flex items-center gap-2">
          {/* Provider badge */}
          <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border ${providerColor}`}>
            <i className={providerIcon} />
            {providerLabel}
          </span>
          {/* Word count badge */}
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            wordCount >= 700 && wordCount <= 1000
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
              : wordCount > 0
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
              : 'bg-white/5 text-white/30 border border-white/10'
          }`}>
            {wordCount} từ {wordCount >= 700 && wordCount <= 1000 ? '✓' : wordCount > 1000 ? '(quá dài)' : wordCount > 0 ? '(cần thêm)' : ''}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <i className="ri-error-warning-line text-red-400 text-sm mt-0.5 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Textarea */}
      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={generating ? 'Đang tạo review...' : 'Nội dung review sẽ hiển thị ở đây. Nhấn "Tạo Review AI" để bắt đầu, hoặc tự nhập tay.'}
          rows={16}
          className="w-full bg-[#1a1d2e] border border-white/10 rounded-xl px-4 py-3 text-white/80 text-sm leading-relaxed resize-none focus:outline-none focus:border-white/25 placeholder-white/20 font-mono"
        />
        {generating && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-[#1a1d2e] px-2 py-1 rounded-lg">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${provider === 'gemini' ? 'bg-violet-400' : 'bg-emerald-400'}`} />
            <span className={`text-xs ${provider === 'gemini' ? 'text-violet-400' : 'text-emerald-400'}`}>
              {providerLabel} đang viết...
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className={`flex items-center gap-2 px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
            provider === 'gemini'
              ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500'
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
          }`}
        >
          <i className={generating ? 'ri-loader-4-line animate-spin' : 'ri-sparkling-2-line'} />
          {generating ? 'Đang tạo...' : existingReview ? `Tạo lại (${providerLabel})` : `Tạo Review (${providerLabel})`}
        </button>

        <button
          onClick={handleSave}
          disabled={!content.trim() || generating}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
            saved
              ? 'bg-emerald-500 text-white'
              : 'bg-white/10 hover:bg-white/15 text-white disabled:opacity-40 disabled:cursor-not-allowed border border-white/10'
          }`}
        >
          <i className={saved ? 'ri-checkbox-circle-fill' : 'ri-save-line'} />
          {saved ? 'Đã lưu!' : 'Lưu Review'}
        </button>

        {content && (
          <button
            onClick={() => setContent('')}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm rounded-xl transition-all cursor-pointer whitespace-nowrap border border-red-500/15"
          >
            <i className="ri-delete-bin-line" />
            Xóa
          </button>
        )}
      </div>
    </div>
  );
}
