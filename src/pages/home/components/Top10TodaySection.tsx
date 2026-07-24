import { useState, useEffect } from 'react';
import { useImageFallback } from '../../../hooks/useImageFallback';
import { Link } from 'react-router-dom';
import { fetchMoviesByType, fetchNewMovies, getOptimizedImageUrl } from '../../../services/movieApi';
import type { MovieItem } from '../../../types/movie';
import { ImageOff, Play, Sparkles, Trophy } from 'lucide-react';
import { trackMovieClick } from '../../../utils/analytics';

/* ── helpers ── */
function getThumbUrl(path: string): string {
  if (!path) return '';
  return path.startsWith('http') ? path : `https://img.ophim.live/uploads/movies/${path}`;
}

function getEpBadge(ep?: string): string {
  if (!ep) return '';
  const s = ep.toLowerCase().trim();
  if (s === 'full' || s === 'full hd') return 'FULL';
  if (s.startsWith('hoàn tất')) {
    const inner = ep.replace(/hoàn tất\s*/i, '').replace(/[()]/g, '').trim();
    return inner || 'FULL';
  }
  return ep;
}

function getCountryLabel(movie: MovieItem): string {
  const countries = (movie as unknown as { country?: { name: string }[] })?.country ?? [];
  return countries.map(c => c.name).slice(0, 2).join(', ');
}

function getCategoryLabel(movie: MovieItem): string {
  const cats = (movie as unknown as { category?: { name: string }[] })?.category ?? [];
  return cats.slice(0, 2).map(c => c.name).join(' · ');
}

/* ── rank badge ── */
const RANK_CFG: Record<number, { numColor: string; stroke: string; glow: string; border: string }> = {
  1: { numColor: '#FBBF24', stroke: '#92400E', glow: 'rgba(251,191,36,0.25)', border: 'rgba(251,191,36,0.25)' },
  2: { numColor: '#CBD5E1', stroke: '#334155', glow: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.2)' },
  3: { numColor: '#FB923C', stroke: '#7C2D12', glow: 'rgba(251,146,60,0.2)',  border: 'rgba(251,146,60,0.2)'  },
};
const DEFAULT_RANK = { numColor: 'rgba(255,255,255,0.18)', stroke: '#0f172a', glow: 'transparent', border: 'transparent' };

/* ── single card ── */
interface CardProps { movie: MovieItem; rank: number }

function Top10Card({ movie, rank }: CardProps) {
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    getOptimizedImageUrl(movie.thumb_url || movie.poster_url, 520, 88),
    getOptimizedImageUrl(movie.poster_url || movie.thumb_url, 520, 88),
  );
  const epBadge  = getEpBadge(movie.episode_current);
  const country  = getCountryLabel(movie);
  const category = getCategoryLabel(movie);
  const rc       = RANK_CFG[rank] ?? DEFAULT_RANK;
  const isTop3   = rank <= 3;

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug || '')}`}
      className="flex items-stretch gap-0 group cursor-pointer"
      onClick={() => trackMovieClick(movie.slug || '', movie.name || '', 'home')}
    >
      {/* ── Rank number ── */}
      <div
        className="flex-shrink-0 w-[38px] md:w-[46px] flex items-center justify-center"
        style={{ filter: isTop3 ? `drop-shadow(0 0 8px ${rc.glow})` : 'none' }}
      >
        <span
          className="font-black leading-none select-none text-[44px] md:text-[52px]"
          style={{
            color: rc.numColor,
            WebkitTextStroke: `2px ${rc.stroke}`,
            fontFamily: "'Bebas Neue', 'Impact', 'Arial Black', sans-serif",
            letterSpacing: '-1px',
          }}
        >
          {rank}
        </span>
      </div>

      {/* ── Thumbnail ── */}
      <div
        className="flex-shrink-0 relative rounded-lg overflow-hidden w-[120px] md:w-[148px] aspect-video bg-white/5"
        style={{ border: `1px solid ${rc.border}` }}
      >
        {!imgLoaded && !imgError && <div className="absolute inset-0 animate-pulse bg-white/5" />}
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <ImageOff className="h-6 w-6 text-white/20" aria-hidden="true" />
          </div>
        )}
        <img
          src={currentSrc}
          alt={movie.name}
          loading="lazy"
          fetchPriority="low"
          className={`w-full h-full object-cover object-top transition-all duration-300 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: 'contrast(1.04) saturate(1.1)' }}
          onLoad={onLoad}
          onError={onError}
        />

        {/* dark overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors duration-300" />

        {/* play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300">
            <Play className="ml-0.5 h-4 w-4 fill-current text-white" aria-hidden="true" />
          </div>
        </div>

        {/* ep badge bottom-left */}
        {epBadge && (
          <span className="absolute bottom-1.5 left-1.5 z-10 text-[9px] font-bold bg-red-500 text-white px-1.5 py-[3px] rounded leading-none">
            {epBadge}
          </span>
        )}

        {/* quality top-right */}
        {movie.quality && (
          <span className="absolute top-1.5 right-1.5 z-10 text-[9px] font-bold bg-black/75 text-white/90 px-1.5 py-[3px] rounded leading-none border border-white/10">
            {movie.quality}
          </span>
        )}

        {/* top-3 shimmer bar */}
        {isTop3 && (
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: `linear-gradient(90deg, transparent, ${rc.numColor}80, transparent)` }}
          />
        )}
      </div>

      {/* ── Info ── */}
      <div className="flex-1 min-w-0 pl-3 flex flex-col justify-center gap-0.5">
        <p className={`
          text-[13px] md:text-[14px] font-semibold leading-snug line-clamp-2
          transition-colors duration-200
          ${isTop3 ? 'text-white/95 group-hover:text-amber-400' : 'text-white/80 group-hover:text-red-400'}
        `}>
          {movie.name}
        </p>

        {movie.origin_name && (
          <p className="text-[11px] text-white/30 line-clamp-1 mt-0.5">
            {movie.origin_name}
          </p>
        )}

        {/* meta row */}
        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-1.5">
          {movie.year && (
            <span className="text-[10px] font-medium text-white/45 bg-white/5 px-1.5 py-0.5 rounded">
              {movie.year}
            </span>
          )}
          {movie.lang && (
            <span className="text-[10px] font-medium text-sky-400/70 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/15">
              {movie.lang}
            </span>
          )}
          {country && (
            <span className="text-[10px] text-white/35">{country}</span>
          )}
        </div>

        {category && (
          <p className="text-[10px] text-white/25 mt-1 line-clamp-1">{category}</p>
        )}
      </div>
    </Link>
  );
}

/* ── skeleton ── */
function SkeletonCard() {
  return (
    <div className="flex items-stretch gap-0">
      <div className="flex-shrink-0 w-[38px] md:w-[46px] flex items-center justify-center">
        <div className="w-7 h-10 bg-white/5 rounded animate-pulse" />
      </div>
      <div className="flex-shrink-0 w-[120px] md:w-[148px] aspect-video bg-white/5 rounded-lg animate-pulse" />
      <div className="flex-1 pl-3 flex flex-col justify-center gap-2">
        <div className="h-3.5 bg-white/5 rounded animate-pulse w-5/6" />
        <div className="h-3 bg-white/5 rounded animate-pulse w-2/3" />
        <div className="flex gap-1.5 mt-0.5">
          <div className="h-4 w-10 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-12 bg-white/5 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function MobileTop10Card({ movie, rank }: CardProps) {
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    getOptimizedImageUrl(movie.thumb_url || movie.poster_url, 420, 88),
    getOptimizedImageUrl(movie.poster_url || movie.thumb_url, 420, 88),
  );
  const epBadge = getEpBadge(movie.episode_current);
  const rc = RANK_CFG[rank] ?? DEFAULT_RANK;

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug || '')}`}
      className="group flex w-[292px] flex-shrink-0 snap-start items-center rounded-xl border border-white/[0.07] bg-white/[0.035] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors active:bg-white/[0.07]"
      onClick={() => trackMovieClick(movie.slug || '', movie.name || '', 'home')}
    >
      <span
        className="w-8 flex-shrink-0 text-center text-[34px] font-black leading-none"
        style={{
          color: rc.numColor,
          WebkitTextStroke: `1.5px ${rc.stroke}`,
          fontFamily: "'Bebas Neue', 'Impact', 'Arial Black', sans-serif",
        }}
        aria-label={`Hạng ${rank}`}
      >
        {rank}
      </span>
      <div className="relative ml-1 h-[74px] w-[118px] flex-shrink-0 overflow-hidden rounded-lg bg-white/5" style={{ border: `1px solid ${rc.border}` }}>
        {!imgLoaded && !imgError && <div className="absolute inset-0 animate-pulse bg-white/5" />}
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <ImageOff className="h-5 w-5 text-white/20" aria-hidden="true" />
          </div>
        )}
        <img
          src={currentSrc}
          alt={movie.name}
          loading="lazy"
          fetchPriority="low"
          className={`h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: 'contrast(1.04) saturate(1.1)' }}
          onLoad={onLoad}
          onError={onError}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        {epBadge && (
          <span className="absolute bottom-1.5 left-1.5 text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded">
            {epBadge}
          </span>
        )}
        {movie.quality && (
          <span className="absolute right-1.5 top-1.5 text-[8px] font-bold bg-black/70 text-white/90 px-1.5 py-0.5 rounded">
            {movie.quality}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 pl-2.5">
        <p className="line-clamp-2 text-[12px] font-bold leading-[17px] text-white/90 group-hover:text-amber-300">
          {movie.name}
        </p>
        {movie.origin_name && (
          <p className="mt-0.5 line-clamp-1 text-[9px] text-white/30">{movie.origin_name}</p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 text-[9px]">
          {movie.year ? <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/45">{movie.year}</span> : null}
          {movie.lang ? <span className="line-clamp-1 text-sky-300/75">{movie.lang}</span> : null}
        </div>
      </div>
    </Link>
  );
}

function MobileSkeletonCard() {
  return (
    <div className="h-[94px] w-[292px] flex-shrink-0 rounded-xl bg-white/5 animate-pulse" />
  );
}

/* ── divider between items ── */
function ItemDivider() {
  return <div className="h-px bg-white/[0.04] mx-0" />;
}

/* ── column ── */
interface ColumnProps {
  items: MovieItem[];
  startRank: number;
  loading: boolean;
  skeletonCount: number;
}

function RankColumn({ items, startRank, loading, skeletonCount }: ColumnProps) {
  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
      {loading
        ? Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i}>
              <div className="px-3 py-3 md:py-3.5">
                <SkeletonCard />
              </div>
              {i < skeletonCount - 1 && <ItemDivider />}
            </div>
          ))
        : items.map((movie, idx) => (
            <div key={movie._id}>
              <div className="px-3 py-3 md:py-3.5 hover:bg-white/[0.03] transition-colors duration-200">
                <Top10Card movie={movie} rank={startRank + idx} />
              </div>
              {idx < items.length - 1 && <ItemDivider />}
            </div>
          ))
      }
    </div>
  );
}

/* ── main ── */
interface Top10TodaySectionProps {
  initialMovies?: MovieItem[];
  loading?: boolean;
  variant?: 'single' | 'series';
}

export default function Top10TodaySection({
  initialMovies = [],
  loading: parentLoading = false,
  variant = 'single',
}: Top10TodaySectionProps) {
  const [movies, setMovies] = useState<MovieItem[]>(initialMovies.slice(0, 10));
  const [loading, setLoading] = useState(parentLoading && initialMovies.length === 0);

  useEffect(() => {
    let cancelled = false;
    if (initialMovies.length > 0) {
      const filtered = initialMovies
        .filter(m => (m.episode_current ?? '').toLowerCase().trim() !== 'trailer')
        .slice(0, 10);
      setMovies(filtered);
      setLoading(false);
      return () => { cancelled = true; };
    }

    if (parentLoading) {
      setLoading(true);
      return () => { cancelled = true; };
    }

    setLoading(true);
    (variant === 'series'
      ? fetchMoviesByType('phim-bo', 1, 'modified.time', 'desc')
      : fetchNewMovies(1))
      .then((res) => {
        if (!cancelled && res.items?.length) {
          const filtered = res.items
            .filter(m => (m.episode_current ?? '').toLowerCase().trim() !== 'trailer')
            .slice(0, 10);
          setMovies(filtered);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialMovies, parentLoading, variant]);

  const isSeries = variant === 'series';

  return (
    <section className="mb-7 md:mb-12 home-section-surface">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-4 md:mb-5">
        <div className="relative flex-shrink-0">
          <div className={`w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br ${isSeries ? 'from-cyan-400 to-violet-600' : 'from-amber-400 to-orange-600'} flex items-center justify-center`}>
            <Trophy className="h-4 w-4 text-white md:h-[18px] md:w-[18px]" fill="currentColor" aria-hidden="true" />
          </div>
          <div className="absolute inset-0 rounded-lg bg-red-500/40 blur-md -z-10" />
        </div>

        <div className="flex flex-col">
          <h3 className="text-lg md:text-2xl lg:text-[1.55rem] font-black text-white leading-tight">
            {isSeries ? 'Top 10 Phim Bộ Hôm Nay' : 'Top 10 Phim Lẻ Hay Nhức Nách'}
          </h3>
          <span className="text-[10px] text-white/30">
            {isSeries ? 'Những bộ phim đang cuốn người xem quay lại mỗi ngày' : 'Phim xem được, nổi bật và đáng dành thời gian'}
          </span>
        </div>

        <span className="flex items-center gap-1 text-[10px] text-green-400 ml-1">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          TỰ ĐỘNG
        </span>
      </div>

      {/* ── 2-column grid ── */}
      <div className="home-rail-scroll flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-3 scrollbar-hide lg:hidden">
        {loading
          ? Array.from({ length: 10 }).map((_, i) => <MobileSkeletonCard key={i} />)
          : movies.slice(0, 10).map((movie, idx) => (
              <MobileTop10Card key={movie._id} movie={movie} rank={idx + 1} />
            ))}
      </div>

      <div className="hidden lg:grid lg:grid-cols-2 gap-4 xl:gap-5">
        <RankColumn
          items={movies.slice(0, 5)}
          startRank={1}
          loading={loading}
          skeletonCount={5}
        />
        <RankColumn
          items={movies.slice(5, 10)}
          startRank={6}
          loading={loading}
          skeletonCount={5}
        />
      </div>
    </section>
  );
}
