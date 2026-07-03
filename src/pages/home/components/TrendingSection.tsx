import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getOptimizedImageUrl, getPosterUrl } from '../../../services/movieApi';
import { movieDetailUrl } from '../../../utils/slugEncoder';
import { isImagePreloaded, markImagePreloaded } from '../../../utils/imagePreloader';
import { useImageFallback } from '../../../hooks/useImageFallback';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import type { Movie } from '../../../types/movie';
import { HOME_POSTER_ITEM_CLASS } from './homePosterSizing';

/* â”€â”€ Helpers â”€â”€ */
function getViewerCount(rank: number): string {
  const base = [18600, 14200, 11500, 8900, 7200, 5600, 4100, 3200, 2400, 1700];
  const count = (base[rank] ?? 900) + Math.floor(Math.sin(rank * 7.3) * 400 + 400);
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

/** Chuáº©n hoÃ¡ episode_current thÃ nh badge label + mÃ u */
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

/* â”€â”€ Tab filter helpers â”€â”€ */
function isRecentlyUpdated(m: Movie): boolean {
  const t = m.modified?.time;
  if (!t) return false;
  const days = (Date.now() - new Date(t).getTime()) / 86400000;
  return days <= 7;
}
function isSingleMovie(m: Movie): boolean {
  const ep = (m.episode_current ?? '').toLowerCase();
  return ep === 'full' || ep === 'full hd' || m.type === 'single';
}
function isSeriesMovie(m: Movie): boolean {
  const ep = (m.episode_current ?? '').toLowerCase();
  return ep.includes('tập') || m.type === 'series' || (!ep.includes('full') && ep.length > 0);
}
function isKoreanMovie(m: Movie): boolean {
  const countries = (m as unknown as { country?: { name: string; slug: string }[] })?.country ?? [];
  return countries.some(c => c.slug === 'han-quoc' || c.name?.includes('Hàn'));
}

const TABS = [
  { key: 'all',    label: 'Top Hot' },
  { key: 'recent', label: 'Mới Cập Nhật' },
  { key: 'single', label: 'Phim Lẻ' },
  { key: 'series', label: 'Phim Bộ' },
  { key: 'korea',  label: 'Hàn Quốc' },
] as const;

type TabKey = typeof TABS[number]['key'];

interface TrendingSectionProps {
  movies?: Movie[];
  loading?: boolean;
}

export default function TrendingSection({ movies: propMovies, loading: propLoading }: TrendingSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const sliderRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // â”€â”€ CHá»ˆ dÃ¹ng props tá»« home-proxy, KHÃ”NG auto-fetch â”€â”€
  const movies = propMovies ?? [];
  const loading = propLoading ?? false;

  const filtered = useMemo(() => {
    switch (activeTab) {
      case 'all':    return movies;
      case 'recent': return movies.filter(isRecentlyUpdated);
      case 'single': return movies.filter(isSingleMovie);
      case 'series': return movies.filter(isSeriesMovie);
      case 'korea':  return movies.filter(isKoreanMovie);
      default:       return movies;
    }
  }, [movies, activeTab]);
  const visibleMovies = useMemo(
    () => filtered.slice(0, isDesktop ? 40 : 12),
    [filtered, isDesktop],
  );

  const checkScroll = useCallback(() => {
    const el = sliderRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
  }, [filtered, checkScroll]);

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = sliderRef.current;
    if (!el) return;
    const cardW = el.querySelector('[data-tcard]')?.clientWidth ?? 200;
    const gap = 12;
    const step = (cardW + gap) * 4;
    el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' });
  }, []);

  /* â”€â”€ Loading skeleton â”€â”€ */
  if (loading) {
    return (
      <div className="mb-12 home-section-surface">
        <SectionHeader />
        <div className="flex items-center gap-2 mb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map((t) => (
            <div key={t.key} className={`h-8 w-24 skeleton rounded-full ${t.key === 'all' ? 'opacity-100' : 'opacity-40'}`} />
          ))}
        </div>
        <div className="flex gap-3 overflow-hidden">
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
    <div className="mb-11 home-section-surface">
      <SectionHeader count={visibleMovies.length} />

      {/* â”€â”€ Tabs â”€â”€ */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                whitespace-nowrap px-3.5 py-1.5 rounded-md text-sm font-semibold
                transition-all duration-200 cursor-pointer flex-shrink-0
                ${active
                  ? 'bg-white text-black shadow-lg shadow-black/25'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80 border border-white/10'
                }
              `}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* â”€â”€ Slider â”€â”€ */}
      <div className="home-rail-frame relative group/slider">
        {/* Prev */}
        <button
          onClick={() => scroll('left')}
          aria-label="Cuộn danh sách phim thịnh hành sang trái"
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
          aria-label="Cuộn danh sách phim thịnh hành sang phải"
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
          className="home-rail-scroll flex gap-2.5 overflow-x-auto scroll-smooth pb-8 pt-2 px-0.5 lg:gap-4 xl:gap-5"
          style={{ scrollbarWidth: 'none' }}
        >
          {visibleMovies.map((movie, idx) => (
            <TrendingCard
              key={`${activeTab}-${movie._id}`}
              movie={movie}
              rank={idx + 1}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-white/30 text-sm py-8 w-full text-center">
              Không có phim nào trong danh mục này
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* â”€â”€ Trending Card â€” ZERO JS hover state, pure CSS group-hover â”€â”€ */
interface TrendingCardProps {
  movie: Movie;
  rank: number;
}

function TrendingCard({ movie, rank }: TrendingCardProps) {
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    getOptimizedImageUrl(movie.poster_url || movie.thumb_url, 520, 88),
    getOptimizedImageUrl(movie.thumb_url || movie.poster_url, 520, 88),
    isImagePreloaded(getPosterUrl(movie.poster_url || movie.thumb_url)),
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
    <div data-tcard className={`${HOME_POSTER_ITEM_CLASS} contain-layout`}>
      <Link to={`${movieDetailUrl(movie.slug || '')}?source=ophim`} className="block cursor-pointer group">
        {/* Poster frame â€” all hover via CSS group-hover, zero JS re-renders */}
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
                w-full h-full object-cover object-center
                transition-[transform,opacity] duration-300 ease-out
                ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}
                md:group-hover:scale-105
              `}
              style={{ filter: 'contrast(1.04) saturate(1.1)' }}
              onLoad={() => { onLoad(); markImagePreloaded(currentSrc); }}
              onError={onError}
            />

            {/* Bottom gradient for text */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-[2]" />

            {/* â”€â”€ Big Rank Badge (top-left) â”€â”€ */}
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

            {/* â”€â”€ Quality / Lang badges (top-right) â”€â”€ */}
            <div className="absolute top-2 right-2 z-[12] flex flex-col items-end gap-1">
              {movie.quality && (
                <span className="text-[9px] md:text-[10px] font-bold bg-red-500/90 text-white px-1.5 py-0.5 rounded-md shadow-sm">
                  {movie.quality}
                </span>
              )}
              {movie.lang && (
                <span className="text-[9px] md:text-[10px] font-bold bg-black/60 text-white/90 px-1.5 py-0.5 rounded-md border border-white/10">
                  {movie.lang}
                </span>
              )}
            </div>

            {/* â”€â”€ Episode badge (bottom-left) â”€â”€ */}
            <div className="absolute bottom-2 left-2 z-[12]">
              <span className={`text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md border leading-none ${EP_COLOR[ep.color]}`}>
                {ep.label}
              </span>
            </div>

            {/* â”€â”€ Views + time (bottom-right) â”€â”€ */}
            <div className="absolute bottom-2 right-2 z-[12] flex flex-col items-end gap-0.5">
              <span className="text-[9px] md:text-[10px] font-semibold text-white/60 bg-black/40 px-1.5 py-0.5 rounded-md">
                {getViewerCount(rank)} xem
              </span>
              {mTime && (
                <span className="text-[9px] text-green-500/70 hidden md:block">
                  {timeAgo(mTime)}
                </span>
              )}
            </div>

            {/* â”€â”€ Hover play overlay â€” pure CSS group-hover, no JS state â”€â”€ */}
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

        {/* â”€â”€ Info below poster â”€â”€ */}
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

/* â”€â”€ Section Header â”€â”€ */
function SectionHeader({ count }: { count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3 lg:mb-5 gap-2 flex-wrap">
      <div className="flex items-center gap-2 lg:gap-3 flex-wrap">
        <div className="relative">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/20">
            <i className="ri-fire-fill text-white text-base md:text-lg" />
          </div>
          <div className="absolute inset-0 w-8 h-8 md:w-9 md:h-9 rounded-lg bg-red-500/30 blur-md -z-10" />
        </div>
        <div className="flex flex-col">
          <h3 className="text-lg md:text-2xl lg:text-[1.55rem] font-black text-white flex items-center gap-2">
            Top Thịnh Hành
          </h3>
          <span className="text-[10px] text-white/30 -mt-0.5">BXH theo lượt xem tuần qua</span>
        </div>
        {typeof count === 'number' && (
          <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full uppercase tracking-wide">
            Top {count}
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] text-green-400">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
          LIVE
        </span>
      </div>
    </div>
  );
}
