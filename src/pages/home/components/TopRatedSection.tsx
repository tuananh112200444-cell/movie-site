import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, ChevronRight, ImageOff, Play, Sparkles, Star } from 'lucide-react';
import { useImageFallback } from '../../../hooks/useImageFallback';
import { fetchMoviesByCategory, getImageUrl, getPortraitImagePaths } from '../../../services/movieApi';
import type { MovieItem } from '../../../types/movie';
import { preloadMoviePosters } from '../../../utils/imagePreloader';
import { trackMovieClick } from '../../../utils/analytics';

interface TopRatedSectionProps {
  initialMovies?: MovieItem[];
  loading?: boolean;
  limit?: number;
}

interface RatedCardProps {
  movie: MovieItem;
  rank: number;
}

function getEpisodeBadge(value?: string): string {
  if (!value) return '';
  const normalized = value.toLowerCase().trim();
  if (normalized === 'full' || normalized === 'full hd') return 'FULL';
  if (normalized.startsWith('hoàn tất')) {
    return value.replace(/hoàn tất\s*/i, '').replace(/[()]/g, '').trim() || 'FULL';
  }
  return value;
}

function getRankStyle(rank: number): { badge: string; border: string; glow: string; label: string } {
  if (rank === 1) {
    return {
      badge: 'from-amber-200 via-yellow-400 to-orange-500 text-[#321400]',
      border: 'border-amber-300/50',
      glow: 'shadow-[0_18px_52px_-30px_rgba(251,191,36,0.88)]',
      label: 'Lựa chọn số 1',
    };
  }
  if (rank === 2) {
    return {
      badge: 'from-slate-100 via-slate-300 to-slate-500 text-slate-950',
      border: 'border-slate-300/30',
      glow: 'shadow-[0_18px_48px_-32px_rgba(203,213,225,0.7)]',
      label: 'Nổi bật',
    };
  }
  if (rank === 3) {
    return {
      badge: 'from-orange-300 via-orange-500 to-amber-700 text-[#2a1004]',
      border: 'border-orange-400/35',
      glow: 'shadow-[0_18px_48px_-32px_rgba(251,146,60,0.7)]',
      label: 'Nổi bật',
    };
  }
  return {
    badge: 'from-white/90 to-white/60 text-[#151722]',
    border: 'border-white/[0.1]',
    glow: 'shadow-[0_16px_44px_-34px_rgba(0,0,0,0.9)]',
    label: 'Đề cử',
  };
}

function RatedMovieCard({ movie, rank }: RatedCardProps) {
  const { primary: primaryImage, fallback: fallbackImage } = getPortraitImagePaths(movie);
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(
    primaryImage,
    fallbackImage,
    false,
    420,
    86,
    { preferredAspect: 'portrait' },
  );
  const rankStyle = getRankStyle(rank);
  const episode = getEpisodeBadge(movie.episode_current);

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug || '')}`}
      aria-label={`Đề cử ${rank}: ${movie.name}`}
      className={`group relative min-w-0 overflow-hidden rounded-2xl border bg-[#11141d] ${rankStyle.border} ${rankStyle.glow} transition duration-300 hover:-translate-y-1 hover:border-amber-200/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300`}
      onClick={() => trackMovieClick(movie.slug || '', movie.name || '', 'home')}
    >
      <div className="relative aspect-[2/3] min-h-[224px] overflow-hidden bg-[#171b27] sm:min-h-0">
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
          className={`h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.045] ${loaded && !hasError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={onLoad}
          onError={onError}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#080a10] via-[#080a10]/18 to-black/20" />
        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-[linear-gradient(to_top,rgba(7,9,14,0.99),rgba(7,9,14,0.72)_48%,transparent)]" />

        <div className="absolute left-2 top-2 flex items-center gap-1.5 sm:left-2.5 sm:top-2.5">
          <span className={`grid h-9 min-w-9 place-items-center rounded-xl bg-gradient-to-br px-1.5 text-base font-black leading-none shadow-lg sm:h-10 sm:min-w-10 sm:text-lg ${rankStyle.badge}`}>
            {String(rank).padStart(2, '0')}
          </span>
          {rank <= 3 && (
            <span className="hidden rounded-full border border-white/15 bg-black/60 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-white/85 backdrop-blur-sm sm:inline-flex">
              {rankStyle.label}
            </span>
          )}
        </div>

        {movie.quality && (
          <span className="absolute right-2 top-2 rounded-md border border-white/15 bg-black/65 px-1.5 py-1 text-[9px] font-black uppercase text-white backdrop-blur-sm sm:right-2.5 sm:top-2.5">
            {movie.quality}
          </span>
        )}

        <div className="absolute inset-0 grid place-items-center opacity-0 transition duration-300 group-hover:opacity-100">
          <span className="grid h-11 w-11 scale-75 place-items-center rounded-full border border-white/35 bg-white/20 text-white shadow-xl backdrop-blur-md transition duration-300 group-hover:scale-100">
            <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
          <div className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-amber-300/90 sm:text-[10px]">
            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
            KhoPhim đề cử
          </div>
          <h4 className="line-clamp-2 min-h-[2.35rem] text-[13px] font-black leading-[1.18] text-white drop-shadow-md sm:text-[14px] lg:text-[15px]">
            {movie.name}
          </h4>
          {movie.origin_name && (
            <p className="mt-1 hidden truncate text-[10px] text-white/45 sm:block">
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

function RatedCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035]">
      <div className="aspect-[2/3] min-h-[224px] animate-pulse bg-white/[0.055] sm:min-h-0" />
    </div>
  );
}

function RatedMobileCard({ movie, rank }: RatedCardProps) {
  const { primary, fallback } = getPortraitImagePaths(movie);
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(
    primary, fallback, false, 360, 84, { preferredAspect: 'portrait' },
  );

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug || '')}`}
      className="kp-rated-mini"
      onClick={() => trackMovieClick(movie.slug || '', movie.name || '', 'home')}
    >
      <span className="kp-rated-mini-art">
        {!loaded && !hasError && <span className="skeleton absolute inset-0" aria-hidden="true" />}
        {hasError ? <ImageOff className="h-6 w-6 text-white/30" aria-hidden="true" /> : (
          <img src={currentSrc} alt="" loading="lazy" decoding="async" onLoad={onLoad} onError={onError} className={loaded ? 'opacity-100' : 'opacity-0'} />
        )}
        <span className="kp-rated-mini-rank" aria-hidden="true">{String(rank).padStart(2, '0')}</span>
        {movie.quality && <span className="kp-rated-mini-quality">{movie.quality}</span>}
      </span>
      <span className="kp-rated-mini-title">{movie.name}</span>
    </Link>
  );
}

export default function TopRatedSection({ initialMovies = [], loading = false, limit = 10 }: TopRatedSectionProps) {
  // DeferredHomeSection already mounts this component only near the viewport.
  // A second zero-height IntersectionObserver here could never intersect on
  // mobile and silently removed the complete rated shelf.
  return <TopRatedContent initialMovies={initialMovies} loading={loading} limit={limit} />;
}

function TopRatedContent({ initialMovies = [], loading: parentLoading = false, limit = 10 }: TopRatedSectionProps) {
  const [movies, setMovies] = useState<MovieItem[]>(initialMovies.slice(0, limit));
  const [loading, setLoading] = useState(parentLoading && initialMovies.length === 0);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    if (initialMovies.length > 0) {
      const filtered = initialMovies
        .filter((movie) => (movie.episode_current ?? '').toLowerCase().trim() !== 'trailer')
        .slice(0, limit);
      setMovies(filtered);
      setLoading(false);
      preloadMoviePosters(filtered.slice(0, 4), getImageUrl, {
        batchSize: 2,
        delayBetweenBatches: 250,
        delayBetweenImages: 40,
      });
      return;
    }

    if (parentLoading) {
      setLoading(true);
      return;
    }

    if (!import.meta.env.DEV) {
      let cancelled = false;
      setLoading(true);
      fetch('/top-rated-fallback.json', { cache: 'default' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('top-rated fallback unavailable')))
        .then((payload: { movies?: MovieItem[] }) => {
          if (cancelled) return;
          const fallbackMovies = (payload.movies ?? [])
            .filter((movie) => movie.slug && movie.name && (movie.poster_url || movie.thumb_url))
            .slice(0, limit);
          setMovies(fallbackMovies);
          preloadMoviePosters(fallbackMovies.slice(0, 4), getImageUrl, {
            batchSize: 2,
            delayBetweenBatches: 250,
            delayBetweenImages: 40,
          });
        })
        .catch(() => { if (!cancelled) setMovies([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }

    setLoading(true);
    Promise.allSettled([
      fetchMoviesByCategory({ category: 'hanh-dong', page: 1 }),
      fetchMoviesByCategory({ category: 'tinh-cam', page: 1 }),
    ]).then((results) => {
      const all: MovieItem[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled') all.push(...(result.value.items ?? []));
      });
      const filtered = all
        .filter((movie) => (movie.episode_current ?? '').toLowerCase().trim() !== 'trailer')
        .sort((a, b) => (b.tmdb_popularity ?? 0) - (a.tmdb_popularity ?? 0) || (b.year ?? 0) - (a.year ?? 0))
        .slice(0, limit);
      setMovies(filtered);
      preloadMoviePosters(filtered.slice(0, 4), getImageUrl, {
        batchSize: 2,
        delayBetweenBatches: 250,
        delayBetweenImages: 40,
      });
    }).finally(() => setLoading(false));
  }, [initialMovies, limit, parentLoading]);

  if (!loading && movies.length === 0) return null;

  return (
    <section className="mb-8 md:mb-12" aria-labelledby="top-rated-title">
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-amber-200/15 bg-[radial-gradient(circle_at_9%_22%,rgba(251,191,36,0.18),transparent_34%),radial-gradient(circle_at_88%_15%,rgba(139,92,246,0.13),transparent_30%),linear-gradient(115deg,rgba(20,22,31,0.98),rgba(10,12,19,0.97))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5 lg:mb-5 lg:rounded-3xl lg:p-6">
        <div className="pointer-events-none absolute -right-5 -top-14 select-none text-[116px] font-black leading-none text-white/[0.025] sm:text-[148px]" aria-hidden="true">
          ★
        </div>
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-200 via-yellow-400 to-orange-500 text-[#371600] shadow-[0_10px_30px_-12px_rgba(251,191,36,0.95)] sm:h-14 sm:w-14">
              <Award className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/85 sm:text-[10px]">
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                KhoPhim tuyển chọn
              </div>
              <h3 id="top-rated-title" className="text-xl font-black leading-tight tracking-[-0.025em] text-white sm:text-2xl lg:text-[1.85rem]">
                Phim Được Đánh Giá Cao
              </h3>
              <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-white/48 sm:text-xs">
                Tuyển chọn từ dữ liệu độ phổ biến thực và danh mục phim đang phát trên KhoPhim
              </p>
            </div>
          </div>

          <div className="flex w-fit flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-violet-200 sm:text-[10px]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Tuyển chọn định kỳ
            </span>
            <Link
              to="/filter"
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-[10px] font-bold text-white/65 transition hover:border-amber-300/30 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              Xem thêm
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <div className="kp-rated-mini-grid md:hidden" aria-label="Phim được KhoPhim đánh giá cao trên điện thoại">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="kp-rated-mini-art skeleton" aria-hidden="true" />)
          : movies.slice(0, mobileExpanded ? limit : 6).map((movie, index) => (
              <RatedMobileCard key={movie._id || movie.slug} movie={movie} rank={index + 1} />
            ))}
      </div>
      {!loading && movies.length > 6 && (
        <button type="button" className="kp-pocket-more mt-2 md:hidden" onClick={() => setMobileExpanded((value) => !value)} aria-expanded={mobileExpanded}>
          {mobileExpanded ? 'Thu gọn' : `Xem thêm ${Math.min(limit - 6, movies.length - 6)} phim đề cử`}
          <i className={mobileExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} aria-hidden="true" />
        </button>
      )}
      <div className="hidden grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid lg:grid-cols-5 lg:gap-4" aria-label={`${limit} phim được KhoPhim đánh giá cao`}>
        {loading
          ? Array.from({ length: limit }).map((_, index) => <RatedCardSkeleton key={index} />)
          : movies.slice(0, limit).map((movie, index) => (
              <RatedMovieCard key={movie._id || movie.slug} movie={movie} rank={index + 1} />
            ))}
      </div>
    </section>
  );
}
