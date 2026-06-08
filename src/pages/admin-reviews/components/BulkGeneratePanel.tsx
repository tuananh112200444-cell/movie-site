import { useState, useCallback, useRef, useEffect } from 'react';
import type { MovieInfo, MovieReview } from '@/services/reviewService';
import { generateReview, saveReview, getActiveApiKey, getProvider, getReview } from '@/services/reviewService';

interface BulkGeneratePanelProps {
  movies: MovieInfo[];
  onProgress: (review: MovieReview) => void;
  onRequestApiKey: () => void;
}

type ItemStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped' | 'retrying';

interface BulkStatus {
  slug: string;
  name: string;
  status: ItemStatus;
  error?: string;
  wordCount?: number;
  retryCount?: number;
}

// Delay có thể bị abort
function sleep(ms: number, signal: { aborted: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    const check = setInterval(() => {
      if (signal.aborted) { clearTimeout(t); clearInterval(check); resolve(); }
    }, 100);
    setTimeout(() => clearInterval(check), ms + 200);
  });
}

// Retry với backoff khi bị rate limit / overload
async function generateWithRetry(
  movie: MovieInfo,
  provider: ReturnType<typeof getProvider>,
  apiKey: string,
  maxRetries: number,
  onRetry: (attempt: number, waitSec: number) => void,
  signal: { aborted: boolean }
): Promise<string> {
  const RETRY_DELAYS = [30, 60, 120];
  let lastErr: Error = new Error('Unknown');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) throw new Error('Đã dừng');
    try {
      return await generateReview(movie, provider, apiKey);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message.toLowerCase();
      const isRetryable =
        msg.includes('overload') ||
        msg.includes('quota') ||
        msg.includes('rate') ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('high demand') ||
        msg.includes('temporarily');

      if (!isRetryable || attempt >= maxRetries) throw lastErr;

      const waitSec = RETRY_DELAYS[attempt] ?? 120;
      onRetry(attempt + 1, waitSec);
      await sleep(waitSec * 1000, signal);
    }
  }
  throw lastErr;
}

export default function BulkGeneratePanel({ movies, onProgress, onRequestApiKey }: BulkGeneratePanelProps) {
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<BulkStatus[]>([]);
  const [skipExisting, setSkipExisting] = useState(true);
  const [delayMs, setDelayMs] = useState(5000);
  const [maxRetries, setMaxRetries] = useState(3);
  const [retryInfo, setRetryInfo] = useState<{ slug: string; attempt: number; waitSec: number; remaining: number } | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const abortRef = useRef({ aborted: false });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer khi đang retry
  useEffect(() => {
    if (!retryInfo) return;
    timerRef.current = setInterval(() => {
      setRetryInfo((prev) => {
        if (!prev) return null;
        if (prev.remaining <= 1) { clearInterval(timerRef.current!); return null; }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [retryInfo?.slug, retryInfo?.attempt]);

  const updateStatus = useCallback((slug: string, update: Partial<BulkStatus>) => {
    setStatuses((prev) => prev.map((s) => s.slug === slug ? { ...s, ...update } : s));
  }, []);

  const handleStart = useCallback(async () => {
    const apiKey = getActiveApiKey();
    if (!apiKey) { onRequestApiKey(); return; }

    const provider = getProvider();
    abortRef.current = { aborted: false };
    setRunning(true);
    setRetryInfo(null);
    setDoneCount(0);

    const initial: BulkStatus[] = movies.map((m) => ({
      slug: m.slug,
      name: m.name,
      status: 'pending',
      retryCount: 0,
    }));
    setStatuses(initial);

    let localDone = 0;

    for (const movie of movies) {
      if (abortRef.current.aborted) break;

      // Bỏ qua nếu đã có review trên Supabase
      if (skipExisting) {
        const existing = await getReview(movie.slug);
        if (existing) {
          updateStatus(movie.slug, { status: 'skipped', wordCount: existing.wordCount });
          localDone++;
          setDoneCount(localDone);
          continue;
        }
      }

      updateStatus(movie.slug, { status: 'running' });

      try {
        const content = await generateWithRetry(
          movie,
          provider,
          apiKey,
          maxRetries,
          (attempt, waitSec) => {
            updateStatus(movie.slug, { status: 'retrying', retryCount: attempt });
            setRetryInfo({ slug: movie.slug, attempt, waitSec, remaining: waitSec });
          },
          abortRef.current
        );

        if (abortRef.current.aborted) break;

        const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
        const review: MovieReview = {
          slug: movie.slug,
          movieName: movie.name,
          originName: movie.origin_name,
          content: content.trim(),
          wordCount,
          generatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveReview(review);
        localDone++;
        setDoneCount(localDone);
        updateStatus(movie.slug, { status: 'done', wordCount });
        onProgress(review);
        setRetryInfo(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
        updateStatus(movie.slug, { status: 'error', error: msg });
        setRetryInfo(null);
      }

      if (!abortRef.current.aborted) {
        await sleep(delayMs, abortRef.current);
      }
    }

    setRunning(false);
  }, [movies, skipExisting, delayMs, maxRetries, updateStatus, onProgress, onRequestApiKey]);

  const handleStop = () => {
    abortRef.current.aborted = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setRetryInfo(null);
  };

  const done = statuses.filter((s) => s.status === 'done').length;
  const errors = statuses.filter((s) => s.status === 'error').length;
  const skipped = statuses.filter((s) => s.status === 'skipped').length;
  const retrying = statuses.filter((s) => s.status === 'retrying').length;
  const total = statuses.length;
  const provider = getProvider();

  const estMinutes = Math.ceil(movies.length * (delayMs + 10000) / 60000);

  return (
    <div className="flex flex-col gap-5">

      {/* ── Thống kê tổng quan ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1a1d2e] border border-white/8 rounded-xl px-4 py-3 text-center">
          <p className="text-white font-bold text-lg">{movies.length.toLocaleString()}</p>
          <p className="text-white/30 text-xs mt-0.5">Tổng phim</p>
        </div>
        <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3 text-center">
          <p className="text-emerald-400 font-bold text-lg">{doneCount.toLocaleString()}</p>
          <p className="text-white/30 text-xs mt-0.5">Đã xử lý</p>
        </div>
      </div>

      {/* Supabase badge */}
      <div className="flex items-center gap-2 bg-teal-500/8 border border-teal-500/20 rounded-xl px-4 py-3">
        <i className="ri-cloud-line text-teal-400 text-base flex-shrink-0" />
        <div>
          <p className="text-teal-300 text-sm font-medium">Lưu trực tiếp lên Supabase</p>
          <p className="text-white/40 text-xs mt-0.5">Google crawl được 100% nội dung · Không mất dữ liệu khi đổi thiết bị</p>
        </div>
      </div>

      {/* ── Config ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Skip existing */}
        <button
          onClick={() => setSkipExisting((v) => !v)}
          className="flex items-center gap-3 bg-[#1a1d2e] border border-white/10 rounded-xl px-4 py-3 cursor-pointer text-left"
        >
          <div className={`w-10 h-5 rounded-full transition-all flex-shrink-0 relative ${skipExisting ? 'bg-emerald-500' : 'bg-white/15'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${skipExisting ? 'left-5' : 'left-0.5'}`} />
          </div>
          <div>
            <p className="text-white text-sm font-medium">Bỏ qua phim đã có review</p>
            <p className="text-white/40 text-xs mt-0.5">Kiểm tra Supabase trước khi tạo</p>
          </div>
        </button>

        {/* Delay */}
        <div className="bg-[#1a1d2e] border border-white/10 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-white text-sm font-medium">Delay giữa các phim</p>
            <span className="text-white/60 text-xs font-mono">{delayMs / 1000}s</span>
          </div>
          <input
            type="range" min={3000} max={15000} step={1000}
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            className="w-full accent-violet-500"
          />
          <p className="text-white/25 text-xs mt-1">
            {provider === 'gemini' ? 'Gemini free: tối thiểu 4s (15 req/phút)' : 'OpenAI: 3s là đủ'}
          </p>
        </div>

        {/* Max retries */}
        <div className="bg-[#1a1d2e] border border-white/10 rounded-xl px-4 py-3 sm:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-white text-sm font-medium">Tự động retry khi bị lỗi overload</p>
            <span className="text-violet-400 text-xs font-mono">{maxRetries} lần</span>
          </div>
          <input
            type="range" min={0} max={5} step={1}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
            className="w-full accent-violet-500"
          />
          <p className="text-white/25 text-xs mt-1">
            Khi bị lỗi &quot;overload&quot; hoặc &quot;rate limit&quot; → tự chờ 30s/60s/120s rồi thử lại
          </p>
        </div>
      </div>

      {/* ── Provider + ước tính ── */}
      <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${provider === 'gemini' ? 'bg-violet-500/8 border-violet-500/20' : 'bg-emerald-500/8 border-emerald-500/20'}`}>
        <i className={`text-base mt-0.5 flex-shrink-0 ${provider === 'gemini' ? 'ri-gemini-line text-violet-400' : 'ri-openai-line text-emerald-400'}`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${provider === 'gemini' ? 'text-violet-300' : 'text-emerald-300'}`}>
            {provider === 'gemini' ? 'Gemini 2.5 Flash-Lite' : 'GPT-4o mini'}
            {provider === 'gemini' && <span className="ml-2 text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">Miễn phí</span>}
          </p>
          <p className="text-white/40 text-xs mt-1">
            <strong className="text-white/60">{movies.length.toLocaleString()} phim</strong>
            {' '}· Ước tính <strong className="text-white/60">~{estMinutes > 60 ? `${Math.floor(estMinutes / 60)}h${estMinutes % 60}p` : `${estMinutes} phút`}</strong>
            {provider !== 'gemini' && <span> · Chi phí ~<strong className="text-emerald-300">${(movies.length * 0.002).toFixed(2)} USD</strong></span>}
          </p>
        </div>
      </div>

      {/* ── Retry countdown ── */}
      {retryInfo && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
          <i className="ri-time-line text-amber-400 text-base flex-shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-amber-300 text-sm font-medium">
              Bị rate limit — đang chờ retry lần {retryInfo.attempt}
            </p>
            <p className="text-amber-300/60 text-xs mt-0.5">
              Tiếp tục sau <strong className="text-amber-300">{retryInfo.remaining}s</strong>
              {' '}· Phim: {statuses.find((s) => s.slug === retryInfo.slug)?.name}
            </p>
          </div>
          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
            <span className="text-amber-400 font-bold text-lg font-mono">{retryInfo.remaining}</span>
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="flex gap-2 flex-wrap">
        {!running ? (
          <button
            onClick={handleStart}
            disabled={movies.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-play-fill" />
            {`Bắt đầu (${movies.length.toLocaleString()} phim)`}
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-400 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-stop-fill" />
            Dừng lại
          </button>
        )}
      </div>

      {/* ── Progress ── */}
      {statuses.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-emerald-400 text-sm font-medium">{done} xong</span>
            {retrying > 0 && <span className="text-amber-400 text-sm font-medium animate-pulse">{retrying} đang retry</span>}
            <span className="text-white/30 text-sm">{skipped} bỏ qua</span>
            {errors > 0 && <span className="text-red-400 text-sm">{errors} lỗi</span>}
            <span className="text-white/20 text-sm">/ {total.toLocaleString()}</span>
            {total > 0 && (
              <div className="flex-1 min-w-[100px] h-2 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${((done + skipped) / total) * 100}%` }}
                />
              </div>
            )}
            {total > 0 && (
              <span className="text-white/30 text-xs">
                {Math.round(((done + skipped) / total) * 100)}%
              </span>
            )}
          </div>

          {/* Status list */}
          <div className="max-h-72 overflow-y-auto flex flex-col gap-1 pr-1">
            {statuses
              .filter((s) => s.status === 'running' || s.status === 'retrying' || s.status === 'error' || s.status === 'done')
              .slice(-30)
              .reverse()
              .map((s) => (
                <div key={s.slug} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                  s.status === 'retrying' ? 'bg-amber-500/8 border-amber-500/20' :
                  s.status === 'error' ? 'bg-red-500/8 border-red-500/15' :
                  s.status === 'done' ? 'bg-emerald-500/5 border-emerald-500/10' :
                  'bg-[#1a1d2e] border-white/5'
                }`}>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {s.status === 'running' && <i className="ri-loader-4-line text-violet-400 text-sm animate-spin" />}
                    {s.status === 'retrying' && <i className="ri-time-line text-amber-400 text-sm animate-pulse" />}
                    {s.status === 'done' && <i className="ri-checkbox-circle-fill text-emerald-400 text-sm" />}
                    {s.status === 'error' && <i className="ri-error-warning-fill text-red-400 text-sm" />}
                  </div>
                  <span className="text-white/70 text-sm flex-1 truncate">{s.name}</span>
                  {s.status === 'retrying' && s.retryCount && (
                    <span className="text-amber-400 text-xs flex-shrink-0">retry #{s.retryCount}</span>
                  )}
                  {s.wordCount && <span className="text-white/30 text-xs flex-shrink-0">{s.wordCount} từ</span>}
                  {s.status === 'error' && s.error && (
                    <span className="text-red-400 text-xs flex-shrink-0 truncate max-w-[140px]" title={s.error}>{s.error}</span>
                  )}
                </div>
              ))}
            {statuses.filter((s) => s.status === 'pending').length > 0 && (
              <div className="px-3 py-2 text-white/20 text-xs text-center">
                {statuses.filter((s) => s.status === 'pending').length.toLocaleString()} phim đang chờ...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
