import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMoviesByCategory, getPosterUrl } from '../../../services/movieApi';
import { preloadMoviePosters } from '../../../utils/imagePreloader';
import type { MovieItem } from '../../../types/movie';

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
      ([entry]) => { if (entry.isIntersecting) { setTriggered(true); observer.disconnect(); } },
      { rootMargin: '200px' } // Giảm từ 600px xuống 200px
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [triggered]);

  return (
    <div ref={ref} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 420px' }}>
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
      preloadMoviePosters(filtered.slice(0, 4), getPosterUrl, {
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
      preloadMoviePosters(filtered, getPosterUrl, {
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
      {/* Header */}
      <div className="flex items-center justify-between mb-3 md:mb-5 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-1 h-5 bg-amber-400 rounded-full" />
          <h3 className="text-lg md:text-2xl lg:text-[1.55rem] font-black gradient-heading-warm flex items-center gap-2 truncate">
            <i className="ri-trophy-fill text-amber-400" />
            Phim Được Đánh Giá Cao
          </h3>
          <span className="hidden sm:inline-flex text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wide">
            IMDb Top
          </span>
        </div>
        <Link
          to="/filter"
          className="text-white/40 hover:text-amber-400 text-xs flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap active:scale-95 active:text-amber-400"
        >
          Xem thêm <i className="ri-arrow-right-s-line text-sm" />
        </Link>
      </div>

      {/* Unified list — 2 cột ngang, mỗi cột 5 phim */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-x-4">
        <div className="flex flex-col divide-y divide-white/[0.04] rounded-2xl border border-white/[0.055] bg-white/[0.025] p-1">
          {movies.slice(0, 5).map((movie, idx) => (
            <RankedRow key={movie._id} movie={movie} idx={idx} />
          ))}
        </div>
        <div className="flex flex-col divide-y divide-white/[0.04] rounded-2xl border border-white/[0.055] bg-white/[0.025] p-1">
          {movies.slice(5, 10).map((movie, idx) => (
            <RankedRow key={movie._id} movie={movie} idx={idx + 5} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Mỗi hàng phim ─── */
interface RankedRowProps { movie: MovieItem; idx: number; }

const RANK_STYLES = [
  { num: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/25', dot: 'bg-amber-400' },
  { num: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/20', dot: 'bg-slate-300' },
  { num: 'text-amber-600', bg: 'bg-amber-600/10', border: 'border-amber-600/20', dot: 'bg-amber-600' },
];

function RankedRow({ movie, idx }: RankedRowProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const poster = getPosterUrl(movie.poster_url || movie.thumb_url);
  const rating = getTopRating(movie.name, idx);
  const votes = getVoteCount(idx);
  const genres = movie.category?.slice(0, 2).map((c: { name: string }) => c.name) ?? [];
  const isTop3 = idx < 3;
  const style = RANK_STYLES[idx] ?? null;

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug)}`}
      className="group flex items-center gap-3 py-2.5 px-2 rounded-xl cursor-pointer border border-transparent hover:border-white/[0.06] hover:bg-white/[0.02] transition-colors duration-200 active:scale-95 active:text-amber-400"
    >
      {/* Rank number */}
      <div className="w-8 flex-shrink-0 flex justify-center">
        {isTop3 && style ? (
          <span className={`text-xl font-black leading-none ${style.num}`}>
            {idx + 1}
          </span>
        ) : (
          <span className="text-sm font-bold text-white/20">{idx + 1}</span>
        )}
      </div>

      {/* Poster */}
      <div className={`flex-shrink-0 rounded-lg overflow-hidden bg-[#1a1d27] relative ${isTop3 ? 'w-11 h-[58px]' : 'w-9 h-[48px]'}`}>
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <i className="ri-image-line text-white/20 text-xl" />
          </div>
        )}
        <img
          src={poster}
          alt={movie.name}
          loading="lazy"
          className={`w-full h-full object-cover object-top transition-opacity duration-500 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: 'contrast(1.04) saturate(1.1)' }}
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgError(true); setImgLoaded(true); }}
        />
        {/* Top 3 border glow */}
        {isTop3 && style && (
          <div className={`absolute inset-0 rounded-lg border ${style.border} pointer-events-none`} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold line-clamp-1 group-hover:text-amber-400 transition-colors duration-200 ${isTop3 ? 'text-[14px] text-white/95' : 'text-[13px] text-white/75'}`}>
          {movie.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {movie.year && (
            <span className="text-[11px] text-white/30">{movie.year}</span>
          )}
          {genres.slice(0, isTop3 ? 2 : 1).map(g => (
            <span key={g} className="text-[11px] text-white/25">{g}</span>
          ))}
        </div>
      </div>

      {/* Rating */}
      <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1">
          <i className={`ri-star-fill text-[11px] ${isTop3 ? 'text-amber-400' : 'text-amber-400/60'}`} />
          <span className={`font-black tabular-nums ${isTop3 ? 'text-[15px] text-amber-400' : 'text-[13px] text-amber-400/70'}`}>
            {rating}
          </span>
        </div>
        <span className="text-[10px] text-white/20 tabular-nums">{votes}</span>
      </div>
    </Link>
  );
}

/* ─── Skeleton ─── */
function SectionSkeleton() {
  return (
    <div className="mb-7 md:mb-12">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 bg-amber-400/20 rounded-full" />
          <div className="h-4 w-48 skeleton rounded" />
        </div>
      </div>
      <div className="flex flex-col divide-y divide-white/[0.04]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5 px-1">
            <div className="w-8 h-5 skeleton rounded flex-shrink-0" />
            <div className={`skeleton rounded-lg flex-shrink-0 ${i < 3 ? 'w-11 h-[58px]' : 'w-9 h-[48px]'}`} />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 skeleton rounded w-3/4" />
              <div className="h-2.5 skeleton rounded w-2/5" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="h-4 w-10 skeleton rounded" />
              <div className="h-2.5 w-8 skeleton rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
