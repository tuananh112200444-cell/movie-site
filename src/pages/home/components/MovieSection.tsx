import { Link } from 'react-router-dom';
import MovieCard from '../../../components/base/MovieCard';
import type { Movie } from '../../../types/movie';
import { useScrollReveal } from '../../../hooks/useScrollReveal';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { HOME_POSTER_ITEM_CLASS } from './homePosterSizing';

interface MovieSectionProps {
  title: string;
  movies: Movie[];
  loading: boolean;
  viewAllLink: string;
  variant?: 'default' | 'rank';
  cols?: number;
  rows?: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  prioritizeFirstRow?: boolean;
  /** Visual theme â€” each section gets a unique look */
  theme?:
    | 'cinematic'
    | 'trending'
    | 'anime'
    | 'broadcast'
    | 'kdrama'
    | 'oriental'
    | 'tropical'
    | 'hollywood';
}

// Map sá»‘ cá»™t â†’ tailwind grid class
const carouselItemClass = HOME_POSTER_ITEM_CLASS;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// THEME DEFINITIONS â€” each section gets a unique visual identity
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ThemeConfig {
  icon: string;
  iconBgFrom: string;
  iconBgTo: string;
  iconBorder: string;
  iconText: string;
  accent: string;
  glowLine: string;
  containerBg: string;
  containerBorder: string;
  headerUnderline: string;
  btnBorder: string;
  btnHoverBorderClass: string;
  btnHoverBg: string;
  btnHoverText: string;
  titleGradient: string;
  boxShadow: string;
  cornerAccent: string;
  containerBorderHover: string;
  boxShadowHover: string;
  glowLineHover: string;
  cornerAccentHover: string;
  glowColor: string;
}

const themeMap: Record<NonNullable<MovieSectionProps['theme']>, ThemeConfig> = {
  // 1. PHIM Láºº â€” Cinematic Film
  cinematic: {
    icon: 'ri-film-line',
    iconBgFrom: 'from-amber-500/20',
    iconBgTo: 'to-orange-500/10',
    iconBorder: 'border-amber-500/20',
    iconText: 'text-amber-400',
    accent: 'bg-amber-500',
    glowLine: 'via-amber-500/25',
    containerBg: 'from-[#0f1118]/90 via-[#0c0e16]/80 to-[#080a10]/40',
    containerBorder: 'border-amber-500/[0.10]',
    headerUnderline: 'from-amber-500',
    btnBorder: 'border-amber-500/15',
    btnHoverBorderClass: 'hover:border-amber-500/30',
    btnHoverBg: 'bg-amber-500/10',
    btnHoverText: 'hover:text-amber-300',
    titleGradient: 'gradient-heading-warm',
    boxShadow: 'shadow-[0_0_40px_-10px_rgba(245,158,11,0.15),inset_0_1px_0_0_rgba(245,158,11,0.06)]',
    cornerAccent: 'border-amber-500/25',
    containerBorderHover: 'hover:border-amber-500/[0.60]',
    boxShadowHover: 'hover:shadow-[0_0_60px_-6px_rgba(245,158,11,0.55),inset_0_1px_0_0_rgba(245,158,11,0.20)]',
    glowLineHover: 'via-amber-500/80',
    cornerAccentHover: 'border-amber-500/70',
    glowColor: 'rgba(245,158,11,0.40)',
  },
  // 2. PHIM Bá»˜ â€” Trending Fire
  trending: {
    icon: 'ri-fire-line',
    iconBgFrom: 'from-fuchsia-500/20',
    iconBgTo: 'to-pink-500/10',
    iconBorder: 'border-fuchsia-500/20',
    iconText: 'text-fuchsia-400',
    accent: 'bg-fuchsia-500',
    glowLine: 'via-fuchsia-500/25',
    containerBg: 'from-[#120d1a]/90 via-[#0e0a14]/80 to-[#080a10]/40',
    containerBorder: 'border-fuchsia-500/[0.10]',
    headerUnderline: 'from-fuchsia-500',
    btnBorder: 'border-fuchsia-500/15',
    btnHoverBorderClass: 'hover:border-fuchsia-500/30',
    btnHoverBg: 'bg-fuchsia-500/10',
    btnHoverText: 'hover:text-fuchsia-300',
    titleGradient: 'gradient-heading',
    boxShadow: 'shadow-[0_0_40px_-10px_rgba(192,38,211,0.15),inset_0_1px_0_0_rgba(192,38,211,0.06)]',
    cornerAccent: 'border-fuchsia-500/25',
    containerBorderHover: 'hover:border-fuchsia-500/[0.60]',
    boxShadowHover: 'hover:shadow-[0_0_60px_-6px_rgba(192,38,211,0.55),inset_0_1px_0_0_rgba(192,38,211,0.20)]',
    glowLineHover: 'via-fuchsia-500/80',
    cornerAccentHover: 'border-fuchsia-500/70',
    glowColor: 'rgba(192,38,211,0.40)',
  },
  // 3. HOáº T HÃŒNH â€” Soft Anime
  anime: {
    icon: 'ri-sparkling-line',
    iconBgFrom: 'from-sky-400/20',
    iconBgTo: 'to-cyan-400/10',
    iconBorder: 'border-sky-400/20',
    iconText: 'text-sky-300',
    accent: 'bg-sky-400',
    glowLine: 'via-sky-400/25',
    containerBg: 'from-[#0d1118]/90 via-[#0a0d14]/80 to-[#080a10]/40',
    containerBorder: 'border-sky-400/[0.10]',
    headerUnderline: 'from-sky-400',
    btnBorder: 'border-sky-400/15',
    btnHoverBorderClass: 'hover:border-sky-400/30',
    btnHoverBg: 'bg-sky-400/10',
    btnHoverText: 'hover:text-sky-300',
    titleGradient: 'gradient-heading',
    boxShadow: 'shadow-[0_0_40px_-10px_rgba(56,189,248,0.15),inset_0_1px_0_0_rgba(56,189,248,0.06)]',
    cornerAccent: 'border-sky-400/25',
    containerBorderHover: 'hover:border-sky-400/[0.60]',
    boxShadowHover: 'hover:shadow-[0_0_60px_-6px_rgba(56,189,248,0.55),inset_0_1px_0_0_rgba(56,189,248,0.20)]',
    glowLineHover: 'via-sky-400/80',
    cornerAccentHover: 'border-sky-400/70',
    glowColor: 'rgba(56,189,248,0.40)',
  },
  // 4. TV SHOWS â€” Broadcast Signal
  broadcast: {
    icon: 'ri-tv-line',
    iconBgFrom: 'from-emerald-500/20',
    iconBgTo: 'to-teal-500/10',
    iconBorder: 'border-emerald-500/20',
    iconText: 'text-emerald-400',
    accent: 'bg-emerald-500',
    glowLine: 'via-emerald-500/25',
    containerBg: 'from-[#0d1110]/90 via-[#0a0e0c]/80 to-[#080a10]/40',
    containerBorder: 'border-emerald-500/[0.10]',
    headerUnderline: 'from-emerald-500',
    btnBorder: 'border-emerald-500/15',
    btnHoverBorderClass: 'hover:border-emerald-500/30',
    btnHoverBg: 'bg-emerald-500/10',
    btnHoverText: 'hover:text-emerald-300',
    titleGradient: 'gradient-heading',
    boxShadow: 'shadow-[0_0_40px_-10px_rgba(16,185,129,0.15),inset_0_1px_0_0_rgba(16,185,129,0.06)]',
    cornerAccent: 'border-emerald-500/25',
    containerBorderHover: 'hover:border-emerald-500/[0.60]',
    boxShadowHover: 'hover:shadow-[0_0_60px_-6px_rgba(16,185,129,0.55),inset_0_1px_0_0_rgba(16,185,129,0.20)]',
    glowLineHover: 'via-emerald-500/80',
    cornerAccentHover: 'border-emerald-500/70',
    glowColor: 'rgba(16,185,129,0.40)',
  },
  // 5. HÃ€N QUá»C â€” K-Drama Romance
  kdrama: {
    icon: 'ri-heart-3-line',
    iconBgFrom: 'from-rose-500/20',
    iconBgTo: 'to-red-400/10',
    iconBorder: 'border-rose-500/20',
    iconText: 'text-rose-400',
    accent: 'bg-rose-500',
    glowLine: 'via-rose-500/25',
    containerBg: 'from-[#130d10]/90 via-[#0f0a0e]/80 to-[#080a10]/40',
    containerBorder: 'border-rose-500/[0.10]',
    headerUnderline: 'from-rose-500',
    btnBorder: 'border-rose-500/15',
    btnHoverBorderClass: 'hover:border-rose-500/30',
    btnHoverBg: 'bg-rose-500/10',
    btnHoverText: 'hover:text-rose-300',
    titleGradient: 'gradient-heading',
    boxShadow: 'shadow-[0_0_40px_-10px_rgba(244,63,94,0.15),inset_0_1px_0_0_rgba(244,63,94,0.06)]',
    cornerAccent: 'border-rose-500/25',
    containerBorderHover: 'hover:border-rose-500/[0.60]',
    boxShadowHover: 'hover:shadow-[0_0_60px_-6px_rgba(244,63,94,0.55),inset_0_1px_0_0_rgba(244,63,94,0.20)]',
    glowLineHover: 'via-rose-500/80',
    cornerAccentHover: 'border-rose-500/70',
    glowColor: 'rgba(244,63,94,0.40)',
  },
  // 6. TRUNG QUá»C â€” Oriental Classic
  oriental: {
    icon: 'ri-building-3-line',
    iconBgFrom: 'from-red-500/20',
    iconBgTo: 'to-amber-500/10',
    iconBorder: 'border-red-500/20',
    iconText: 'text-red-400',
    accent: 'bg-red-500',
    glowLine: 'via-red-500/25',
    containerBg: 'from-[#130d0d]/90 via-[#100a0a]/80 to-[#080a10]/40',
    containerBorder: 'border-red-500/[0.10]',
    headerUnderline: 'from-red-500',
    btnBorder: 'border-red-500/15',
    btnHoverBorderClass: 'hover:border-red-500/30',
    btnHoverBg: 'bg-red-500/10',
    btnHoverText: 'hover:text-red-300',
    titleGradient: 'gradient-heading-warm',
    boxShadow: 'shadow-[0_0_40px_-10px_rgba(239,68,68,0.15),inset_0_1px_0_0_rgba(239,68,68,0.06)]',
    cornerAccent: 'border-red-500/25',
    containerBorderHover: 'hover:border-red-500/[0.60]',
    boxShadowHover: 'hover:shadow-[0_0_60px_-6px_rgba(239,68,68,0.55),inset_0_1px_0_0_rgba(239,68,68,0.20)]',
    glowLineHover: 'via-red-500/80',
    cornerAccentHover: 'border-red-500/70',
    glowColor: 'rgba(239,68,68,0.40)',
  },
  // 7. THÃI LAN â€” Tropical Vibe
  tropical: {
    icon: 'ri-sun-line',
    iconBgFrom: 'from-lime-500/20',
    iconBgTo: 'to-green-400/10',
    iconBorder: 'border-lime-500/20',
    iconText: 'text-lime-400',
    accent: 'bg-lime-500',
    glowLine: 'via-lime-500/25',
    containerBg: 'from-[#0d110d]/90 via-[#0a0e0a]/80 to-[#080a10]/40',
    containerBorder: 'border-lime-500/[0.10]',
    headerUnderline: 'from-lime-500',
    btnBorder: 'border-lime-500/15',
    btnHoverBorderClass: 'hover:border-lime-500/30',
    btnHoverBg: 'bg-lime-500/10',
    btnHoverText: 'hover:text-lime-300',
    titleGradient: 'gradient-heading',
    boxShadow: 'shadow-[0_0_40px_-10px_rgba(132,204,22,0.15),inset_0_1px_0_0_rgba(132,204,22,0.06)]',
    cornerAccent: 'border-lime-500/25',
    containerBorderHover: 'hover:border-lime-500/[0.60]',
    boxShadowHover: 'hover:shadow-[0_0_60px_-6px_rgba(132,204,22,0.55),inset_0_1px_0_0_rgba(132,204,22,0.20)]',
    glowLineHover: 'via-lime-500/80',
    cornerAccentHover: 'border-lime-500/70',
    glowColor: 'rgba(132,204,22,0.40)',
  },
  // 8. Ã‚U Má»¸ â€” Hollywood Glam
  hollywood: {
    icon: 'ri-star-smile-line',
    iconBgFrom: 'from-yellow-500/20',
    iconBgTo: 'to-amber-500/10',
    iconBorder: 'border-yellow-500/20',
    iconText: 'text-yellow-400',
    accent: 'bg-yellow-500',
    glowLine: 'via-yellow-500/25',
    containerBg: 'from-[#12100d]/90 via-[#0e0c0a]/80 to-[#080a10]/40',
    containerBorder: 'border-yellow-500/[0.10]',
    headerUnderline: 'from-yellow-500',
    btnBorder: 'border-yellow-500/15',
    btnHoverBorderClass: 'hover:border-yellow-500/30',
    btnHoverBg: 'bg-yellow-500/10',
    btnHoverText: 'hover:text-yellow-300',
    titleGradient: 'gradient-heading-warm',
    boxShadow: 'shadow-[0_0_40px_-10px_rgba(234,179,8,0.15),inset_0_1px_0_0_rgba(234,179,8,0.06)]',
    cornerAccent: 'border-yellow-500/25',
    containerBorderHover: 'hover:border-yellow-500/[0.60]',
    boxShadowHover: 'hover:shadow-[0_0_60px_-6px_rgba(234,179,8,0.55),inset_0_1px_0_0_rgba(234,179,8,0.20)]',
    glowLineHover: 'via-yellow-500/80',
    cornerAccentHover: 'border-yellow-500/70',
    glowColor: 'rgba(234,179,8,0.40)',
  },
};

function getTheme(
  theme: MovieSectionProps['theme']
): ThemeConfig {
  return themeMap[theme ?? 'cinematic'] ?? themeMap.cinematic;
}

export default function MovieSection({
  title,
  movies,
  loading,
  viewAllLink,
  variant = 'default',
  cols = 6,
  rows = 1,
  prioritizeFirstRow = false,
  theme = 'cinematic',
}: MovieSectionProps) {
  const sectionRef = useScrollReveal<HTMLElement>();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const t = getTheme(theme);

  const displayMovies = movies.slice(0, Math.max(cols * rows, 12));

  if (loading && movies.length === 0) {
    return (
      <section className="home-section-surface mb-8 md:mb-12">
        {/* Header Skeleton */}
        <div className="flex items-center gap-3 mb-4 px-1">
          <div className={`w-7 h-7 rounded-md skeleton ${t.iconBorder} flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className="h-5 w-48 skeleton rounded mb-2" />
          </div>
          <div className="h-8 w-20 skeleton rounded-md flex-shrink-0" />
        </div>
        {!isDesktop ? (
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 pb-2 md:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-[2/3] skeleton rounded-lg" />
                <div className="mt-2 h-3 skeleton rounded w-3/4" />
                <div className="mt-1 h-2.5 skeleton rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="home-rail-frame hidden md:block">
            <div className="home-rail-scroll flex snap-x snap-mandatory gap-2.5 overflow-hidden pb-2 md:gap-4">
              {Array.from({ length: Math.max(cols, 8) }).map((_, i) => (
                <div key={i} className={carouselItemClass}>
                  <div className="aspect-[2/3] skeleton rounded-lg" />
                  <div className="mt-2 h-3 skeleton rounded w-3/4" />
                  <div className="mt-1 h-2.5 skeleton rounded w-1/2" />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  if (movies.length === 0) {
    return (
      <section ref={sectionRef} className="home-section-surface group/section mb-7 md:mb-10">
        <div className="reveal mb-3 flex items-center gap-2.5 px-1 md:mb-4">
          <div className={`relative hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br ${t.iconBgFrom} ${t.iconBgTo} ${t.iconBorder} md:flex`}>
            <i className={`${t.icon} ${t.iconText} text-sm`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="truncate text-lg font-black tracking-tight text-white md:text-2xl lg:text-[1.65rem]">
              {title}
            </h3>
            <p className="home-section-eyebrow mt-0.5 hidden md:block">Đang cập nhật danh sách phim mới</p>
          </div>
          <Link
            to={viewAllLink}
            className={`group/btn flex flex-shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.09] bg-white/[0.035] px-3.5 py-2 text-xs font-bold text-white/62 transition-all duration-300 hover:bg-white/[0.08] active:scale-95 active:text-white ${t.btnHoverText}`}
          >
            Xem tất cả
            <i className="ri-arrow-right-line text-xs transition-transform duration-300 group-hover/btn:translate-x-1" />
          </Link>
        </div>

        <Link
          to={viewAllLink}
          className="block rounded-xl border border-white/[0.07] bg-white/[0.035] px-4 py-5 text-center transition-colors active:bg-white/[0.06] md:px-6"
        >
          <p className="text-sm font-semibold text-white/70">Danh sách đang được cập nhật</p>
          <p className="mt-1 text-xs text-white/38">Bấm để xem tất cả phim trong mục này</p>
        </Link>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="home-section-surface group/section mb-6 md:mb-10">
      {/* Header */}
      <div className="reveal mb-3.5 flex items-center gap-2.5 px-0.5 md:mb-5 md:px-1">
        {/* Icon box â€” shape varies by theme */}
        <div className={`relative hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br ${t.iconBgFrom} ${t.iconBgTo} ${t.iconBorder} shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_14px_32px_-22px_rgba(255,255,255,0.75)] md:flex`}>
          <i className={`${t.icon} ${t.iconText} text-sm`} />
          {/* Subtle pulse dot for trending */}
          {theme === 'trending' && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-fuchsia-400 animate-pulse" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className={`truncate text-[1.08rem] font-black tracking-tight text-white md:text-2xl lg:text-[1.68rem] ${t.titleGradient}`}>
              {title}
            </h3>
            <span className="hidden shrink-0 rounded-full border border-white/[0.08] bg-white/[0.045] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 lg:inline-flex">
              Mới cập nhật
            </span>
          </div>
          <p className="home-section-eyebrow mt-1 hidden md:block">Chọn lọc phim mới, rõ ảnh, dễ xem và đang được quan tâm</p>
        </div>

        {/* View All â€” ghost pill with theme hover */}
        <Link
          to={viewAllLink}
          className={`group/btn flex min-h-9 flex-shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.10] bg-white/[0.045] px-3.5 py-2 text-xs font-bold text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:bg-white/[0.09] hover:shadow-[0_12px_30px_-22px_rgba(255,255,255,0.8)] active:scale-95 active:text-white ${t.btnHoverText}`}
        >
          Xem tất cả
          <i className="ri-arrow-right-line text-xs transition-transform duration-300 group-hover/btn:translate-x-1" />
        </Link>
      </div>

      {/* Grid â€” stagger delays tá»« CSS nth-child, khÃ´ng cáº§n inline style */}
      {!isDesktop ? (
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-[1.125rem] pb-2 md:hidden">
          {displayMovies.slice(0, 6).map((movie, index) => (
            <div
              key={`${movie._id}-mobile-${index}`}
              className="min-w-0"
            >
              <MovieCard
                movie={movie}
                rank={variant === 'rank' ? index + 1 : undefined}
                priority={prioritizeFirstRow && index < 3}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="home-rail-frame hidden md:block">
          <div className="home-rail-scroll reveal flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-7 pt-2.5 scrollbar-hide md:gap-4 md:pb-8 lg:gap-4 xl:gap-5">
            {displayMovies.map((movie, index) => (
              <div
                key={`${movie._id}-${index}`}
                className={`stagger-item group/card h-full ${carouselItemClass}`}
              >
                <div className="h-full rounded-lg transition-transform duration-200 ease-out group-hover/card:-translate-y-1">
                  <MovieCard
                    movie={movie}
                    rank={variant === 'rank' ? index + 1 : undefined}
                    priority={prioritizeFirstRow && index < 2}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
