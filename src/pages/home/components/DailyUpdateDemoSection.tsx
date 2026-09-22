import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock3 } from 'lucide-react';
import { useImageFallback } from '../../../hooks/useImageFallback';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { fetchLatestReleaseMovies, getPortraitImagePaths } from '../../../services/movieApi';
import type { MovieItem } from '../../../types/movie';
import { movieDetailUrl } from '../../../utils/slugEncoder';

type UpdateFilter = 'all' | 'episode' | 'new' | 'completed';

const FILTERS: Array<{ key: UpdateFilter; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'episode', label: 'Tập mới' },
  { key: 'new', label: 'Phim mới' },
  { key: 'completed', label: 'Hoàn tất' },
];

function updateTimestamp(movie: MovieItem): number {
  const values = [
    movie.last_episode_change_at,
    movie.modified?.time,
    movie.published_at,
    movie.created_at,
  ];
  for (const value of values) {
    const timestamp = Date.parse(String(value || ''));
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function dayKey(timestamp: number): string {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

function timeLabel(timestamp: number): string {
  if (!timestamp) return 'Mới cập nhật';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return 'Vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} giờ trước`;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(timestamp));
}

function isCompleted(movie: MovieItem): boolean {
  return /hoàn tất|hoan tat|full|end/i.test(movie.episode_current || '');
}

function isEpisodeUpdate(movie: MovieItem): boolean {
  return Boolean(movie.current_episode || /tập\s*\d+|tap\s*\d+/i.test(movie.episode_current || ''));
}

function isNewMovie(movie: MovieItem): boolean {
  const createdAt = Date.parse(String(movie.created_at || movie.published_at || ''));
  return Number.isFinite(createdAt) && dayKey(createdAt) === dayKey(Date.now());
}

function matchesFilter(movie: MovieItem, filter: UpdateFilter): boolean {
  return filter === 'all' || updateKind(movie) === filter;
}

function updateKind(movie: MovieItem): Exclude<UpdateFilter, 'all'> {
  if (isNewMovie(movie)) return 'new';
  if (isCompleted(movie)) return 'completed';
  if (isEpisodeUpdate(movie)) return 'episode';
  return 'episode';
}

function episodeLabel(movie: MovieItem): string {
  if (movie.episode_current) return movie.episode_current;
  if (movie.current_episode) return `Tập ${movie.current_episode}`;
  return movie.type === 'single' ? 'Full' : 'Mới cập nhật';
}

const KIND_CLASS = {
  episode: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  new: 'border-red-400/25 bg-red-400/10 text-red-300',
  completed: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
} as const;

function updateBadgeLabel(movie: MovieItem, kind: Exclude<UpdateFilter, 'all'>): string {
  if (kind === 'new') return 'Phim mới';
  return episodeLabel(movie);
}

function UpdatePoster({ movie }: { movie: MovieItem }) {
  const paths = getPortraitImagePaths(movie);
  const image = useImageFallback(paths.primary, paths.fallback, false, 112, 78, {
    preferredAspect: 'portrait',
    includeOriginalFallback: false,
    minimumWidth: 112,
  });
  const initial = movie.name.trim().charAt(0).toLocaleUpperCase('vi-VN') || 'K';
  return (
    <div className="relative aspect-[2/3] w-[58px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#151923] sm:w-[68px]">
      <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#242a38] to-[#10131a] text-lg font-black text-white/18" aria-hidden="true">
        {initial}
      </span>
      {!image.loaded && !image.hasError && <span className="absolute inset-0 skeleton" aria-hidden="true" />}
      <img
        src={image.currentSrc}
        alt=""
        width={160}
        height={240}
        loading="lazy"
        fetchPriority="low"
        decoding="async"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${image.loaded && !image.hasError ? 'opacity-100' : 'opacity-0'}`}
        onLoad={image.onLoad}
        onError={image.onError}
      />
    </div>
  );
}

function UpdateRow({ movie }: { movie: MovieItem }) {
  const timestamp = updateTimestamp(movie);
  const kind = updateKind(movie);
  return (
    <Link
      to={movieDetailUrl(movie.slug)}
      className="group relative flex min-h-[108px] items-center gap-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 transition-[border-color,background-color,transform] hover:border-white/15 hover:bg-white/[0.045] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 md:hover:-translate-y-0.5"
    >
      <UpdatePoster movie={movie} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[13px] font-black leading-[18px] text-white transition-colors group-hover:text-red-300 sm:text-sm sm:leading-5">
          {movie.name}
        </span>
        <span className="mt-1 line-clamp-1 text-[9px] uppercase tracking-[0.08em] text-white/32 sm:text-[10px]">
          {movie.origin_name || movie.country?.[0]?.name || 'KhoPhim'}
        </span>
        <span className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          <span className={`max-w-[152px] truncate rounded-md border px-1.5 py-0.5 text-[9px] font-black ${KIND_CLASS[kind]}`}>
            {updateBadgeLabel(movie, kind)}
          </span>
          {movie.quality && (
            <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold text-white/55">
              {movie.quality}
            </span>
          )}
        </span>
        <span className="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold text-white/38 sm:text-[10px]">
          <Clock3 className="h-3 w-3" aria-hidden="true" /> {timeLabel(timestamp)}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/20 transition-transform group-hover:translate-x-1 group-hover:text-red-300" aria-hidden="true" />
    </Link>
  );
}

export default function DailyUpdateDemoSection({
  movies = [],
  loading = false,
  compact = false,
}: {
  movies?: MovieItem[];
  loading?: boolean;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<UpdateFilter>('all');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTablet = useMediaQuery('(min-width: 640px)');
  const [liveMovies, setLiveMovies] = useState<MovieItem[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchLatestReleaseMovies(1, 'episode_updates'),
      fetchLatestReleaseMovies(1, 'new'),
    ]).then((responses) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const merged = responses.flatMap((response) => response.status ? response.items : []).filter((movie) => {
        const key = movie.slug || movie._id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setLiveMovies(merged);
    }).catch(() => {
      if (!cancelled) setLiveMovies([]);
    }).finally(() => {
      if (!cancelled) setLiveLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Avoid painting fallback posters and replacing them a moment later with the
  // live feed. That used to download two image sets for the same section.
  const sourceMovies = liveLoading ? [] : (liveMovies.length > 0 ? liveMovies : movies);
  const sortedMovies = useMemo(
    () => [...sourceMovies].filter((movie) => movie.slug).sort((a, b) => updateTimestamp(b) - updateTimestamp(a)),
    [sourceMovies],
  );
  const today = dayKey(Date.now());
  const todayMovies = sortedMovies.filter((movie) => dayKey(updateTimestamp(movie)) === today);
  const dailyMovies = todayMovies.length > 0 ? todayMovies : sortedMovies;
  const todayCount = todayMovies.length;
  const counts = {
    all: dailyMovies.length,
    episode: dailyMovies.filter((movie) => matchesFilter(movie, 'episode')).length,
    new: dailyMovies.filter((movie) => matchesFilter(movie, 'new')).length,
    completed: dailyMovies.filter((movie) => matchesFilter(movie, 'completed')).length,
  };
  const filtered = dailyMovies.filter((movie) => matchesFilter(movie, filter));
  const visible = filtered.slice(0, compact
    ? (isDesktop ? 6 : 4)
    : (isDesktop ? 9 : isTablet ? 6 : 5));
  const dateLabel = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());

  if ((loading || liveLoading) && sourceMovies.length === 0) {
    return <div className={`${compact ? 'h-[460px]' : 'h-[720px] sm:h-[640px]'} animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]`} />;
  }
  if (dailyMovies.length === 0) return null;

  return (
    <section data-testid="daily-update-demo" className="mb-6 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0e15] shadow-[0_18px_55px_rgba(0,0,0,0.26)] sm:mb-8">
      <div className="relative overflow-hidden border-b border-white/[0.08] px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-red-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-400/20 bg-red-500/10 text-red-300 sm:h-12 sm:w-12">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-black tracking-tight text-white sm:text-2xl lg:text-3xl">Cập nhật hôm nay</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live
                </span>
              </div>
              <p className="mt-1 text-[11px] text-white/42 sm:text-xs">
                <span className="sm:hidden">{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())}</span>
                <span className="hidden capitalize sm:inline">{dateLabel}</span>
                <span> · Cập nhật liên tục mỗi ngày</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-sky-400/15 bg-sky-400/[0.07] px-3.5">
              <span className="text-xl font-black text-white sm:text-2xl">{counts.episode}</span>
              <span className="text-[9px] font-bold uppercase leading-3 tracking-wider text-white/42">Tập mới</span>
            </div>
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-red-400/15 bg-red-500/[0.07] px-3.5">
              <span className="text-xl font-black text-white sm:text-2xl">{counts.new}</span>
              <span className="text-[9px] font-bold uppercase leading-3 tracking-wider text-white/42">Phim mới</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-white/[0.07] px-3 py-2.5 sm:gap-2 sm:px-6 sm:py-3" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            aria-pressed={filter === item.key}
            className={`min-h-10 shrink-0 rounded-full px-3 text-[11px] font-black transition-colors sm:px-4 sm:text-xs ${filter === item.key ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-white/50 hover:text-white'}`}
          >
            {item.label} <span className={filter === item.key ? 'text-black/70' : 'text-white/45'}>{counts[item.key]}</span>
          </button>
        ))}
      </div>

      <div className="p-3 sm:p-4">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <span className="text-[10px] font-black uppercase tracking-[0.13em] text-white/45">Mới nhất trước</span>
          <span className="text-[10px] text-white/28">{todayCount > 0 ? `${todayCount} cập nhật hôm nay` : 'Các cập nhật gần nhất'}</span>
        </div>
        {visible.length > 0 ? (
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
            {visible.map((movie) => <UpdateRow key={`${movie._id}-${movie.slug}`} movie={movie} />)}
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.08] px-4 py-10 text-center text-sm text-white/35">Chưa có phim phù hợp bộ lọc này.</div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-white/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <p className="daily-update-note text-[10px] leading-5 text-white/35">Thời gian và trạng thái tập được lấy từ dữ liệu cập nhật thực tế của từng phim.</p>
        <Link to="/phim-moi-cap-nhat" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black text-white transition-colors hover:bg-white/10">
          Xem toàn bộ cập nhật <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
