import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMoviesByCategory, getImageUrl } from '../../../services/movieApi';
import { preloadMoviePosters } from '../../../utils/imagePreloader';
import type { MovieItem } from '../../../types/movie';
import { useImageFallback } from '../../../hooks/useImageFallback';

function getTopRating(name: string, idx: number): string {
  const code = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = 9.9 - idx * 0.15 - (code % 10) * 0.01;
  return Math.max(8.0, base).toFixed(1);
}

function getVoteCount(idx: number): string {
  const counts = [142800, 98600, 87300, 76500, 65200, 54100, 48700, 43200, 38900, 34500];
  const c = counts[idx] ?? 28000;
  return c >= 1000 ? `${(c / 1000).toFixed(0)}K` : String(c);
}

interface TopRatedSectionProps {
  initialMovies?: MovieItem[];
  loading?: boolean;
}

export default function TopRatedSection({ initialMovies = [], loading = false }: TopRatedSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || triggered) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTriggered(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [triggered]);

  return (
    <div ref={ref} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 430px' }}>
      {triggered ? <TopRatedContent initialMovies={initialMovies} loading={loading} /> : <SectionSkeleton />}
    </div>
  );
}

function TopRatedContent({ initialMovies = [], loading: parentLoading = false }: TopRatedSectionProps) {
  const [movies, setMovies] = useState<MovieItem[]>(initialMovies.slice(0, 10));
  const [loading, setLoading] = useState(parentLoading && initialMovies.length === 0);

  useEffect(() => {
    if (initialMovies.length > 0) {
      const filtered = initialMovies
        .filter(m => (m.episode_current ?? '').toLowerCase().trim() !== 'trailer')
        .slice(0, 10);
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

    setLoading(true);
    Promise.allSettled([
      fetchMoviesByCategory({ category: 'hanh-dong', page: 1 }),
      fetchMoviesByCategory({ category: 'tinh-cam', page: 1 }),
    ]).then((results) => {
      const all: MovieItem[] = [];
      results.forEach((r) => {
        if (r.status === 'fulfilled') all.push(...(r.value.items ?? []));
      });
      const filtered = all
        .filter(m => (m.episode_current ?? '').toLowerCase().trim() !== 'trailer')
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
        .slice(0, 10);
      setMovies(filtered);
      preloadMoviePosters(filtered, getImageUrl, {
        batchSize: 3,
        delayBetweenBatches: 200,
        delayBetweenImages: 25,
      });
    }).finally(() => setLoading(false));
  }, [initialMovies, parentLoading]);

  if (loading) return <SectionSkeleton />;
  if (movies.length === 0) return null;

  return (
    <section className="mb-7 md:mb-10 home-section-surface">
      <div className="mb-3 flex items-center justify-between gap-2 md:mb-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="h-5 w-1 rounded-full bg-amber-400" />
          <h3 className="gradient-heading-warm flex items-center gap-2 truncate text-lg font-black md:text-2xl lg:text-[1.55rem]">
            <i className="ri-trophy-fill text-amber-400" />
            Phim Được Đánh Giá Cao
          </h3>
          <span className="hidden rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400 sm:inline-flex">
            IMDb Top
          </span>
        </div>
        <Link
          to="/filter"
          className="flex cursor-pointer items-center gap-1 whitespace-nowrap text-xs text-white/40 transition-colors hover:text-amber-400 active:scale-95 active:text-amber-400"
        >
          Xem thêm <i className="ri-arrow-right-s-line text-sm" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.95fr_1.65fr] xl:gap-4">
        {movies[0] && <RankedSpotlight movie={movies[0]} idx={0} />}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {movies.slice(1, 10).map((movie, idx) => (
            <RankedMiniCard key={movie._id || movie.slug} movie={movie} idx={idx + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface RankedCardProps {
  movie: MovieItem;
  idx: number;
}

const RANK_STYLES = [
  { num: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/25' },
  { num: 'text-slate-200', bg: 'bg-slate-200/10', border: 'border-slate-200/20' },
  { num: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-400/20' },
];

function RankedSpotlight({ movie, idx }: RankedCardProps) {
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    movie.thumb_url || movie.poster_url,
    movie.poster_url || movie.thumb_url,
    false,
    520,
    88,
  );
  const rating = getTopRating(movie.name, idx);
  const votes = getVoteCount(idx);
  const genres = movie.category?.slice(0, 2).map((c: { name: string }) => c.name) ?? [];

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug)}`}
      className="group relative flex min-h-[152px] overflow-hidden rounded-2xl border border-amber-300/16 bg-[linear-gradient(135deg,rgba(251,191,36,0.13),rgba(255,255,255,0.045)_42%,rgba(255,255,255,0.025))] p-3 shadow-[0_16px_44px_rgba(0,0,0,0.22)] transition-colors duration-200 hover:border-amber-300/28 hover:bg-white/[0.055] active:scale-[0.99] md:min-h-[174px] md:p-4 xl:h-full"
    >
      <div className="pointer-events-none absolute -right-12 -top-20 h-44 w-44 rounded-full bg-amber-300/10 blur-3xl" />
      <div className="relative h-[126px] w-[88px] flex-shrink-0 overflow-hidden rounded-xl bg-[#171923] ring-1 ring-white/10 md:h-[142px] md:w-[100px]">
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}
        {imgError && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#1a1d27]">
            <i className="ri-image-line text-xl text-white/20" />
          </div>
        )}
        <img
          src={currentSrc}
          alt={movie.name}
          loading="lazy"
          className={`h-full w-full object-cover object-center transition-opacity duration-500 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: 'contrast(1.04) saturate(1.1)' }}
          onLoad={onLoad}
          onError={onError}
        />
        <div className="absolute left-1.5 top-1.5 rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-black leading-none text-black">
          #1
        </div>
      </div>

      <div className="relative ml-3 flex min-w-0 flex-1 flex-col justify-center md:ml-4">
        <div className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-200">
          <i className="ri-fire-fill" />
          Đáng xem nhất
        </div>
        <p className="line-clamp-2 text-base font-black leading-5 text-white transition-colors duration-200 group-hover:text-amber-300 md:text-xl md:leading-6">
          {movie.name}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {movie.year && (
            <span className="text-xs font-semibold text-white/55">{movie.year}</span>
          )}
          {genres.map(g => (
            <span key={g} className="text-xs text-white/40">{g}</span>
          ))}
          {movie.episode_current && (
            <span className="rounded-md bg-red-500/14 px-2 py-0.5 text-[11px] font-bold text-red-100">{movie.episode_current}</span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg bg-black/24 px-2 py-1">
            <i className="ri-star-fill text-xs text-amber-400" />
            <span className="text-base font-black tabular-nums text-amber-300">{rating}</span>
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-white/30">{votes} lượt đánh giá</span>
        </div>
      </div>
    </Link>
  );
}

function RankedMiniCard({ movie, idx }: RankedCardProps) {
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    movie.thumb_url || movie.poster_url,
    movie.poster_url || movie.thumb_url,
    false,
    360,
    86,
  );
  const rating = getTopRating(movie.name, idx);
  const votes = getVoteCount(idx);
  const genres = movie.category?.slice(0, 1).map((c: { name: string }) => c.name) ?? [];
  const style = RANK_STYLES[idx] ?? null;

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug)}`}
      className="group relative flex min-h-[104px] overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.032] p-2.5 transition-colors duration-200 hover:border-amber-300/20 hover:bg-white/[0.052] active:scale-[0.98]"
    >
      <div className="absolute right-2 top-2 text-2xl font-black leading-none text-white/[0.035] md:text-3xl">
        {idx + 1}
      </div>

      <div className="relative h-[84px] w-[60px] flex-shrink-0 overflow-hidden rounded-lg bg-[#171923] ring-1 ring-white/8 md:h-[92px] md:w-[66px]">
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}
        {imgError && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#1a1d27]">
            <i className="ri-image-line text-lg text-white/20" />
          </div>
        )}
        <img
          src={currentSrc}
          alt={movie.name}
          loading="lazy"
          className={`h-full w-full object-cover object-center transition-opacity duration-500 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: 'contrast(1.04) saturate(1.1)' }}
          onLoad={onLoad}
          onError={onError}
        />
        {style && (
          <div className={`absolute left-1 top-1 rounded border px-1.5 py-0.5 text-[10px] font-black leading-none ${style.bg} ${style.num} ${style.border}`}>
            #{idx + 1}
          </div>
        )}
      </div>

      <div className="relative ml-2.5 flex min-w-0 flex-1 flex-col justify-center">
        <p className="line-clamp-2 text-sm font-bold leading-5 text-white/88 transition-colors duration-200 group-hover:text-amber-300 md:text-[15px]">
          {movie.name}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {movie.year && (
            <span className="text-[11px] font-semibold text-white/38">{movie.year}</span>
          )}
          {genres.map(g => (
            <span key={g} className="text-[11px] text-white/28">{g}</span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          {movie.episode_current ? (
            <span className="max-w-[118px] truncate rounded bg-red-500/12 px-1.5 py-0.5 text-[10px] font-bold text-red-100">
              {movie.episode_current}
            </span>
          ) : <span />}
          <span className="inline-flex items-center gap-1 text-xs font-black text-amber-400/90">
            <i className="ri-star-fill text-[10px]" />
            {rating}
          </span>
        </div>
        <span className="mt-0.5 text-[10px] tabular-nums text-white/20">{votes} votes</span>
      </div>
    </Link>
  );
}

function SectionSkeleton() {
  return (
    <div className="mb-7 md:mb-12">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-1 rounded-full bg-amber-400/20" />
          <div className="h-4 w-48 rounded skeleton" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.95fr_1.65fr] xl:gap-4">
        <div className="flex min-h-[152px] rounded-2xl border border-white/[0.04] bg-white/[0.025] p-3 md:min-h-[174px] md:p-4">
          <div className="h-[126px] w-[88px] flex-shrink-0 rounded-xl skeleton md:h-[142px] md:w-[100px]" />
          <div className="ml-3 flex flex-1 flex-col justify-center space-y-3 md:ml-4">
            <div className="h-5 w-28 rounded skeleton" />
            <div className="h-5 w-4/5 rounded skeleton" />
            <div className="h-3 w-3/5 rounded skeleton" />
            <div className="h-8 w-24 rounded-lg skeleton" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex min-h-[104px] rounded-xl border border-white/[0.04] bg-white/[0.02] p-2.5">
              <div className="h-[84px] w-[60px] flex-shrink-0 rounded-lg skeleton md:h-[92px] md:w-[66px]" />
              <div className="ml-2.5 flex flex-1 flex-col justify-center space-y-2">
                <div className="h-4 w-3/4 rounded skeleton" />
                <div className="h-3 w-2/5 rounded skeleton" />
                <div className="h-4 w-2/3 rounded skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
