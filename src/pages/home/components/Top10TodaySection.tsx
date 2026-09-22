import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, ImageOff, Play, Sparkles, Trophy } from 'lucide-react';
import { useImageFallback } from '../../../hooks/useImageFallback';
import { fetchTop10TodayMovies, getLandscapeImagePaths, getPortraitImagePaths } from '../../../services/movieApi';
import type { MovieItem } from '../../../types/movie';
import { trackMovieClick } from '../../../utils/analytics';

function getEpisodeBadge(value?: string): string {
  if (!value) return '';
  const normalized = value.toLowerCase().trim();
  if (normalized === 'full' || normalized === 'full hd') return 'FULL';
  if (normalized.startsWith('hoàn tất')) {
    return value.replace(/hoàn tất\s*/i, '').replace(/[()]/g, '').trim() || 'FULL';
  }
  return value;
}

function getRankStyle(rank: number): {
  badge: string;
  border: string;
  glow: string;
  label: string;
} {
  if (rank === 1) {
    return {
      badge: 'from-amber-300 via-yellow-400 to-orange-500 text-[#321400]',
      border: 'border-amber-300/55',
      glow: 'shadow-[0_18px_55px_-28px_rgba(251,191,36,0.9)]',
      label: 'Dẫn đầu',
    };
  }
  if (rank === 2) {
    return {
      badge: 'from-slate-100 via-slate-300 to-slate-500 text-slate-950',
      border: 'border-slate-300/35',
      glow: 'shadow-[0_18px_50px_-30px_rgba(203,213,225,0.75)]',
      label: 'Top 3',
    };
  }
  if (rank === 3) {
    return {
      badge: 'from-orange-300 via-orange-500 to-amber-700 text-[#2b1004]',
      border: 'border-orange-400/40',
      glow: 'shadow-[0_18px_50px_-30px_rgba(251,146,60,0.75)]',
      label: 'Top 3',
    };
  }
  return {
    badge: 'from-white/90 to-white/60 text-[#141722]',
    border: 'border-white/[0.11]',
    glow: 'shadow-[0_16px_45px_-34px_rgba(0,0,0,0.9)]',
    label: 'Đang hot',
  };
}

interface RankingCardProps {
  movie: MovieItem;
  rank: number;
}

function RankingCard({ movie, rank }: RankingCardProps) {
  const { primary: primaryImage, fallback: fallbackImage } = getLandscapeImagePaths(movie);
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(
    primaryImage,
    fallbackImage,
    false,
    520,
    86,
    { preferredAspect: 'landscape' },
  );
  const rankStyle = getRankStyle(rank);
  const episode = getEpisodeBadge(movie.episode_current);

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug || '')}`}
      aria-label={`Hạng ${rank}: ${movie.name}`}
      className={`group relative min-w-0 overflow-hidden rounded-2xl border bg-[#11141d] ${rankStyle.border} ${rankStyle.glow} transition duration-300 hover:-translate-y-1 hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300`}
      onClick={() => trackMovieClick(movie.slug || '', movie.name || '', 'home')}
    >
      <div className="relative aspect-[16/11] min-h-[128px] overflow-hidden bg-[#171b27] sm:min-h-0">
        {!loaded && !hasError && <div className="absolute inset-0 animate-pulse bg-white/[0.055]" />}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#181b25]">
            <ImageOff className="h-7 w-7 text-white/25" aria-hidden="true" />
          </div>
        )}
        <img
          src={currentSrc}
          alt={movie.name}
          loading="lazy"
          fetchPriority="low"
          className={`h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.06] ${loaded && !hasError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={onLoad}
          onError={onError}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#090b11] via-[#090b11]/45 to-black/5" />
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-[linear-gradient(to_top,rgba(7,9,14,0.98),rgba(7,9,14,0.68)_48%,transparent)]" />

        <div className="absolute left-2 top-2 flex items-center gap-1.5 sm:left-2.5 sm:top-2.5">
          <span className={`grid h-9 min-w-9 place-items-center rounded-xl bg-gradient-to-br px-1.5 text-base font-black leading-none shadow-lg sm:h-10 sm:min-w-10 sm:text-lg ${rankStyle.badge}`}>
            {String(rank).padStart(2, '0')}
          </span>
          {rank <= 3 && (
            <span className="hidden rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white/80 backdrop-blur-sm sm:inline-flex">
              {rankStyle.label}
            </span>
          )}
        </div>

        <div className="absolute right-2 top-2 flex items-center gap-1 sm:right-2.5 sm:top-2.5">
          {movie.quality && (
            <span className="rounded-md border border-white/15 bg-black/65 px-1.5 py-1 text-[9px] font-black uppercase text-white backdrop-blur-sm">
              {movie.quality}
            </span>
          )}
        </div>

        <div className="absolute inset-0 grid place-items-center opacity-0 transition duration-300 group-hover:opacity-100">
          <span className="grid h-11 w-11 scale-75 place-items-center rounded-full border border-white/35 bg-white/20 text-white shadow-xl backdrop-blur-md transition duration-300 group-hover:scale-100">
            <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
          <h4 className="line-clamp-2 min-h-[2.35rem] text-[13px] font-black leading-[1.18] text-white drop-shadow-md sm:text-[14px] lg:text-[15px]">
            {movie.name}
          </h4>
          {movie.origin_name && (
            <p className="mt-1 hidden truncate text-[10px] text-white/48 sm:block">
              {movie.origin_name}
            </p>
          )}
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[9px] font-semibold text-white/58 sm:text-[10px]">
            {episode ? (
              <span className="max-w-[4.8rem] truncate rounded bg-red-500 px-1.5 py-0.5 font-black leading-none text-white">
                {episode}
              </span>
            ) : null}
            {movie.year ? <span>{movie.year}</span> : null}
            {movie.year && movie.lang ? <span className="text-white/20">•</span> : null}
            {movie.lang ? <span className="truncate text-sky-300/85">{movie.lang}</span> : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function RankingSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035]">
      <div className="aspect-[16/11] min-h-[128px] animate-pulse bg-white/[0.055] sm:min-h-0" />
    </div>
  );
}

function RankingMobileRow({ movie, rank }: RankingCardProps) {
  const { primary, fallback } = getPortraitImagePaths(movie);
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(
    primary, fallback, false, 180, 82, { preferredAspect: 'portrait' },
  );
  const episode = getEpisodeBadge(movie.episode_current);

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug || '')}`}
      className="kp-chart-row"
      onClick={() => trackMovieClick(movie.slug || '', movie.name || '', 'home')}
    >
      <span className="kp-chart-rank" aria-hidden="true">{String(rank).padStart(2, '0')}</span>
      <span className="kp-chart-art">
        {!loaded && !hasError && <span className="skeleton absolute inset-0" aria-hidden="true" />}
        {hasError ? <ImageOff className="h-5 w-5 text-white/35" aria-hidden="true" /> : (
          <img src={currentSrc} alt="" loading="lazy" decoding="async" onLoad={onLoad} onError={onError} className={loaded ? 'opacity-100' : 'opacity-0'} />
        )}
      </span>
      <span className="kp-chart-copy">
        <span className="kp-chart-title">{movie.name}</span>
        <span className="kp-chart-meta">
          {episode || 'Đang xem nhiều'}
          {movie.quality && <span className="kp-chart-quality">{movie.quality}</span>}
        </span>
      </span>
      <span className="kp-chart-arrow" aria-hidden="true"><i className="ri-arrow-right-up-line" /></span>
    </Link>
  );
}

interface Top10TodaySectionProps {
  initialMovies?: MovieItem[];
  loading?: boolean;
  variant?: 'single' | 'series';
  title?: string;
  subtitle?: string;
}

export default function Top10TodaySection({
  initialMovies = [],
  loading: parentLoading = false,
  variant = 'single',
  title,
  subtitle,
}: Top10TodaySectionProps) {
  const [movies, setMovies] = useState<MovieItem[]>(initialMovies.slice(0, 10));
  const [loading, setLoading] = useState(parentLoading && initialMovies.length === 0);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (initialMovies.length > 0) {
      setMovies(initialMovies
        .filter((movie) => (movie.episode_current ?? '').toLowerCase().trim() !== 'trailer')
        .slice(0, 10));
      setLoading(false);
      return () => { cancelled = true; };
    }

    if (parentLoading) {
      setLoading(true);
      return () => { cancelled = true; };
    }

    setLoading(true);
    fetchTop10TodayMovies({ limit: 10, timeoutMs: 5_000 })
      .then((items) => {
        if (!cancelled) setMovies(items
          .filter((movie) => (movie.episode_current ?? '').toLowerCase().trim() !== 'trailer')
          .slice(0, 10));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialMovies, parentLoading]);

  const isSeries = variant === 'series';

  return (
    <section className="mb-8 md:mb-12" aria-labelledby="top10-today-title">
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-amber-300/15 bg-[radial-gradient(circle_at_8%_20%,rgba(245,158,11,0.18),transparent_34%),linear-gradient(115deg,rgba(20,22,31,0.98),rgba(11,13,20,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5 lg:mb-5 lg:rounded-3xl lg:p-6">
        <div className="pointer-events-none absolute -right-4 -top-12 select-none text-[116px] font-black leading-none text-white/[0.025] sm:text-[148px]" aria-hidden="true">
          10
        </div>
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${isSeries ? 'from-cyan-400 to-violet-600' : 'from-amber-300 via-orange-400 to-red-500'} text-white shadow-[0_10px_30px_-12px_rgba(249,115,22,0.9)] sm:h-14 sm:w-14`}>
              <Trophy className="h-6 w-6 sm:h-7 sm:w-7" fill="currentColor" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/80 sm:text-[10px]">
                <Flame className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                Bảng xếp hạng trong ngày
              </div>
              <h3 id="top10-today-title" className="text-xl font-black leading-tight tracking-[-0.025em] text-white sm:text-2xl lg:text-[1.85rem]">
                {title ?? (isSeries ? 'Top 10 Phim Bộ Hôm Nay' : 'Top 10 Phim Lẻ Hay Nhức Nách')}
              </h3>
              <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-white/48 sm:text-xs">
                {subtitle ?? 'Xếp hạng từ lượt xem thực tế trên KhoPhim trong ngày'}
              </p>
            </div>
          </div>

          <div className="inline-flex w-fit flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-300 sm:text-[10px]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Cập nhật tự động
          </div>
        </div>
      </div>

      <div className="kp-chart-list md:hidden" aria-label="Bảng xếp hạng 10 phim hôm nay">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => <div className="kp-chart-row skeleton" key={index} aria-hidden="true" />)
          : movies.slice(0, mobileExpanded ? 10 : 5).map((movie, index) => (
              <RankingMobileRow key={movie._id || movie.slug} movie={movie} rank={index + 1} />
            ))}
        {!loading && movies.length > 5 && (
          <button type="button" className="kp-pocket-more" onClick={() => setMobileExpanded((value) => !value)} aria-expanded={mobileExpanded}>
            {mobileExpanded ? 'Thu gọn bảng xếp hạng' : 'Xem đủ 10 phim'}
            <i className={mobileExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="hidden grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid lg:grid-cols-5 lg:gap-4" aria-label="Bảng xếp hạng 10 phim hôm nay trên máy tính">
        {loading
          ? Array.from({ length: 10 }).map((_, index) => <RankingSkeleton key={index} />)
          : movies.slice(0, 10).map((movie, index) => (
              <RankingCard key={movie._id || movie.slug} movie={movie} rank={index + 1} />
            ))}
      </div>
    </section>
  );
}
