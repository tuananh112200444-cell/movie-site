import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getPosterUrl, getImageUrl, fetchMoviesByType } from '../../../services/movieApi';
import { isImagePreloaded, markImagePreloaded } from '../../../utils/imagePreloader';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import type { MovieItem } from '../../../types/movie';
import { HOME_POSTER_ITEM_CLASS } from './homePosterSizing';
import { useImageFallback } from '../../../hooks/useImageFallback';

/* ── Helpers ── */
function getViewerCount(rank: number): string {
  const base = [28600, 21200, 16500, 12900, 9800, 7600, 5400, 4100, 3100, 2200];
  const count = (base[rank] ?? 1500) + Math.floor(Math.sin(rank * 9.7) * 600 + 600);
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'Vừa xong';
  if (diff < 60) return `${diff} phút trước`;
  if (diff < 1440) return `${Math.floor(diff / 60)} giờ trước`;
  return `${Math.floor(diff / 1440)} ngày trước`;
}

function getEpInfo(ep?: string): { label: string; color: 'green' | 'blue' | 'amber' } {
  if (!ep) return { label: 'Xem Ngay', color: 'green' };
  const s = ep.toLowerCase().trim();
  if (s === 'full' || s === 'full hd') return { label: 'FULL HD', color: 'green' };
  if (s.startsWith('hoàn tất')) return { label: ep.replace(/hoàn tất/i, 'Xong').trim(), color: 'green' };
  return { label: ep, color: 'blue' };
}

const EP_COLOR = {
  green: 'bg-green-500/20 text-green-400 border-green-500/30',
  blue:  'bg-sky-500/20 text-sky-400 border-sky-500/30',
  amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

interface TopCinemaMoviesSectionProps {
  initialMovies?: MovieItem[];
  loading?: boolean;
}

export default function TopCinemaMoviesSection({ initialMovies = [], loading: parentLoading = false }: TopCinemaMoviesSectionProps) {
  const [movies, setMovies] = useState<MovieItem[]>(initialMovies);
  const [loading, setLoading] = useState(parentLoading && initialMovies.length === 0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const visibleMovies = movies.slice(0, isDesktop ? 20 : 10);

  /* ── Fetch phim chiếu rạp ── */
  useEffect(() => {
    let cancelled = false;
    if (initialMovies.length > 0) {
      const valid = initialMovies.filter(m => {
        const ep = (m.episode_current ?? '').toLowerCase().trim();
        return ep !== 'trailer' && ep !== '';
      });
      setMovies(valid);
      setLoading(false);
      return () => { cancelled = true; };
    }

    if (parentLoading) {
      setLoading(true);
      return () => { cancelled = true; };
    }

    setLoading(true);

    fetchMoviesByType('phim-chieu-rap', 1, 'modified.time', 'desc')
      .then((res) => {
        if (cancelled) return;
        const items = res.items ?? [];
        // Lọc bỏ trailer-only
        const valid = items.filter(m => {
          const ep = (m.episode_current ?? '').toLowerCase().trim();
          return ep !== 'trailer' && ep !== '';
        });
        setMovies(valid);
      })
      .catch(() => {
        if (cancelled) return;
        setMovies([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [initialMovies, parentLoading]);

  const checkScroll = useCallback(() => {
    const el = sliderRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll, movies]);

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = sliderRef.current;
    if (!el) return;
    const cardW = el.querySelector('[data-ccard]')?.clientWidth ?? 200;
    const gap = 12;
    const step = (cardW + gap) * 4;
    el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' });
  }, []);

  if (loading) {
    return (
      <div className="mb-7 md:mb-10 home-section-surface">
        <SectionHeader />
        <div className="flex gap-2.5 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={HOME_POSTER_ITEM_CLASS}>
              <div className="aspect-[2/3] skeleton rounded-xl" />
              <div className="mt-2 h-3.5 skeleton rounded w-5/6" />
              <div className="mt-1.5 h-3 skeleton rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (movies.length === 0) return null;

  return (
    <div className="mb-7 md:mb-10 home-section-surface">
      <SectionHeader count={visibleMovies.length} />

      {/* ── Slider ── */}
      <div className="home-rail-frame relative group/slider">
        {/* Prev */}
        <button
          onClick={() => scroll('left')}
          aria-label="Cuộn danh sách phim chiếu rạp sang trái"
          className={`
            absolute left-0 top-1/2 -translate-y-1/2 z-20
            w-9 h-9 md:w-10 md:h-10 rounded-full
            hidden md:flex items-center justify-center
            bg-black/70 hover:bg-black/90 text-white
            border border-white/10
            transition-all duration-200 cursor-pointer
            -translate-x-1/2
            ${canScrollLeft ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
        >
          <span className="w-5 h-5 flex items-center justify-center">
            <i className="ri-arrow-left-s-line text-lg" />
          </span>
        </button>

        {/* Next */}
        <button
          onClick={() => scroll('right')}
          aria-label="Cuộn danh sách phim chiếu rạp sang phải"
          className={`
            absolute right-0 top-1/2 -translate-y-1/2 z-20
            w-9 h-9 md:w-10 md:h-10 rounded-full
            hidden md:flex items-center justify-center
            bg-black/70 hover:bg-black/90 text-white
            border border-white/10
            transition-all duration-200 cursor-pointer
            translate-x-1/2
            ${canScrollRight ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
        >
          <span className="w-5 h-5 flex items-center justify-center">
            <i className="ri-arrow-right-s-line text-lg" />
          </span>
        </button>

        <div
          ref={sliderRef}
          className="home-rail-scroll flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-smooth pb-8 pt-2 px-0.5 md:gap-3 lg:gap-4 xl:gap-5"
          style={{ scrollbarWidth: 'none' }}
        >
          {visibleMovies.map((movie, idx) => (
            <CinemaCard
              key={`cinema-${movie._id}`}
              movie={movie}
              rank={idx + 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Cinema Card ── */
interface CinemaCardProps {
  movie: MovieItem;
  rank: number;
}

function CinemaCard({ movie, rank }: CinemaCardProps) {
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    movie.poster_url || movie.thumb_url,
    movie.thumb_url || movie.poster_url,
    isImagePreloaded(getImageUrl(movie.poster_url || movie.thumb_url)),
    520,
    88,
  );
  const ep = getEpInfo(movie.episode_current);
  const mTime = movie.modified?.time ?? '';
  const originName = movie.origin_name ?? '';

  const isTop3 = rank <= 3;
  const rankConfig = [
    /* 1 */ {
      bg: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600',
      text: 'text-gray-900',
      size: 'w-9 h-9 md:w-10 md:h-10 text-lg md:text-xl',
      shadow: 'shadow-amber-500/40',
      icon: <i className="ri-vip-crown-fill text-sm md:text-base" />,
    },
    /* 2 */ {
      bg: 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-400',
      text: 'text-gray-800',
      size: 'w-8 h-8 md:w-9 md:h-9 text-base md:text-lg',
      shadow: 'shadow-slate-400/30',
      icon: null,
    },
    /* 3 */ {
      bg: 'bg-gradient-to-br from-orange-400 via-amber-600 to-amber-800',
      text: 'text-white',
      size: 'w-8 h-8 md:w-9 md:h-9 text-base md:text-lg',
      shadow: 'shadow-orange-500/30',
      icon: null,
    },
  ];
  const rc = rankConfig[rank - 1] ?? {
    bg: 'bg-black/70',
    text: 'text-white/70',
    size: 'w-7 h-7 md:w-8 md:h-8 text-sm md:text-base',
    shadow: 'shadow-black/30',
    icon: null,
  };

  return (
    <div data-ccard className={`${HOME_POSTER_ITEM_CLASS} contain-layout`}>
      <Link to={`/phim/${encodeURIComponent(movie.slug || '')}`} className="block cursor-pointer group">
        {/* Poster frame */}
        <div
          className={`
            relative rounded-xl overflow-hidden
            bg-[#16192a] border contain-paint
            transition-[transform,box-shadow,border-color] duration-300 ease-out
            ${isTop3
              ? 'border-amber-500/15 md:hover:border-amber-400/50 md:hover:shadow-2xl md:hover:shadow-amber-500/15'
              : 'border-white/[0.06] md:hover:border-white/[0.25] md:hover:shadow-xl md:hover:shadow-black/50'
            }
            md:hover:-translate-y-1 md:hover:scale-[1.01]
          `}
        >
          <div className="aspect-[2/3] relative overflow-hidden">
            {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton z-[1]" />}
            {imgError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
                <i className="ri-image-line text-white/20 text-3xl" />
              </div>
            )}
            <img
              src={currentSrc}
              alt={movie.name}
              loading="lazy"
              fetchPriority="low"
              className={`
                w-full h-full object-cover object-top
                transition-transform duration-200 ease-out
                ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}
                md:group-hover:scale-105
              `}
              style={{ filter: 'contrast(1.04) saturate(1.1)' }}
              onLoad={() => { onLoad(); markImagePreloaded(currentSrc); }}
              onError={onError}
            />

            {/* Bottom gradient for text */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-[2]" />

            {/* ── Rank Badge (top-left) ── */}
            <div className="absolute top-2 left-2 z-[15]">
              <div
                className={`
                  flex items-center justify-center rounded-lg
                  font-black ${rc.size} ${rc.bg} ${rc.text}
                  border-2 border-gray-900/80 shadow-xl ${rc.shadow}
                  transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  md:group-hover:scale-110
                `}
              >
                {rc.icon ?? <span>{rank}</span>}
              </div>
            </div>

            {/* ── Quality badge (top-right) ── */}
            <div className="absolute top-2 right-2 z-[12] flex flex-col items-end gap-1">
              {movie.quality && (
                <span className="text-[9px] md:text-[10px] font-bold bg-red-500/90 text-white px-1.5 py-0.5 rounded-md shadow-sm">
                  {movie.quality}
                </span>
              )}
            </div>

            {/* ── Cinema label (top-right, below quality) ── */}
            <div className="absolute top-7 right-2 z-[12] hidden sm:block">
              <span className="text-[9px] md:text-[10px] font-bold bg-purple-500/80 text-white px-1.5 py-0.5 rounded-md border border-purple-400/30 shadow-sm">
                <i className="ri-film-line mr-0.5" />
                Chiếu Rạp
              </span>
            </div>

            {/* ── Episode badge (bottom-left) ── */}
            <div className="absolute bottom-2 left-2 z-[12]">
              <span className={`text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md border leading-none ${EP_COLOR[ep.color]}`}>
                {ep.label}
              </span>
            </div>

            {/* ── Views + time (bottom-right) ── */}
            <div className="absolute bottom-2 right-2 z-[12] hidden sm:flex flex-col items-end gap-0.5">
              <span className="text-[9px] md:text-[10px] font-semibold text-white/60 bg-black/40 px-1.5 py-0.5 rounded-md">
                {getViewerCount(rank)} xem
              </span>
              {mTime && (
                <span className="text-[9px] text-green-500/70 hidden md:block">
                  {timeAgo(mTime)}
                </span>
              )}
            </div>

            {/* ── Hover play overlay ── */}
            <div className="absolute inset-0 z-[8] hidden items-center justify-center bg-black/0 transition-colors duration-300 md:flex md:group-hover:bg-black/40">
              <div className="
                w-10 h-10 md:w-11 md:h-11 rounded-full
                bg-white/25
                flex items-center justify-center
                opacity-0 scale-75
                md:group-hover:opacity-100 md:group-hover:scale-100
                transition-[transform,opacity] duration-300 ease-out
              ">
                <i className="ri-play-fill text-white text-lg md:text-xl ml-0.5" />
              </div>
            </div>

            {/* Top shimmer bar for top 3 */}
            {isTop3 && (
              <div className="absolute top-0 left-0 right-0 h-[2px] z-[10] overflow-hidden bg-amber-500/20">
                <div className="h-full w-full bg-gradient-to-r from-transparent via-amber-300/60 to-transparent opacity-0 transition-opacity duration-500 md:group-hover:opacity-100" />
              </div>
            )}
          </div>
        </div>

        {/* ── Info below poster ── */}
        <div className="mt-1.5 flex min-h-[48px] flex-col px-0.5 md:mt-2 md:min-h-[54px]">
          <p className="h-[28px] text-[11px] font-semibold leading-snug text-white/90 line-clamp-2 transition-colors duration-300 group-hover:text-red-400 md:h-[18px] md:text-sm md:line-clamp-1">
            {movie.name}
          </p>
          <p className="mt-0.5 h-[13px] text-[9px] text-white/40 line-clamp-1 md:h-[16px] md:text-[11px]">
            {originName || '\u00a0'}
          </p>
        </div>
      </Link>
    </div>
  );
}

/* ── Section Header ── */
function SectionHeader({ count = 0 }: { count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3 lg:mb-5 gap-2 flex-wrap">
      <div className="flex items-center gap-2 lg:gap-3 flex-wrap">
        <div className="relative">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <i className="ri-movie-2-fill text-white text-base md:text-lg" />
          </div>
          <div className="absolute inset-0 w-8 h-8 md:w-9 md:h-9 rounded-lg bg-purple-500/30 blur-md -z-10" />
        </div>
        <div className="flex flex-col">
          <h3 className="text-lg md:text-2xl lg:text-[1.55rem] font-black text-white flex items-center gap-2">
            Top Phim Chiếu Rạp
          </h3>
          <span className="text-[10px] text-white/30 -mt-0.5">BXH phim chiếu rạp được xem nhiều nhất</span>
        </div>
        <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full uppercase tracking-wide">
          Top {count}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-green-400">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
          LIVE
        </span>
      </div>

      <a
        href="/phim-chieu-rap"
        className="text-xs text-white/40 hover:text-red-400 active:text-red-400 transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer"
      >
        Xem tất cả
        <span className="w-4 h-4 flex items-center justify-center">
          <i className="ri-arrow-right-line" />
        </span>
      </a>
    </div>
  );
}
