import { useRef, useEffect, useState } from 'react';
import MovieSection from './MovieSection';
import type { ComponentProps } from 'react';
import type { Movie } from '../../../types/movie';
import { HOME_POSTER_ITEM_CLASS } from './homePosterSizing';

// Map số cột → tailwind grid class (sync with MovieSection.tsx)
const carouselItemClass = HOME_POSTER_ITEM_CLASS;

type SectionProps = Omit<ComponentProps<typeof MovieSection>, 'movies' | 'loading'>;

interface LazyMovieSectionProps extends SectionProps {
  fetchType: 'type' | 'country';
  fetchKey: string;
  limit?: number;
  /** rootMargin for IntersectionObserver — closer sections get larger margin */
  rootMargin?: string;
  /** Thứ tự section từ trên xuống (0 = gần nhất) — section trên tải ảnh trước */
  sectionIndex?: number;
  /** Số hàng hiển thị trong placeholder skeleton */
  rows?: number;
  /** Visual theme forwarded to MovieSection */
  theme?: ComponentProps<typeof MovieSection>['theme'];
  /** Nếu có data từ home-proxy thì render khi scroll gần, không fetch thêm */
  movies?: Movie[];
  /** Loading state từ home-proxy */
  loading?: boolean;
}

export default function LazyMovieSection({
  fetchType: _fetchType,
  fetchKey: _fetchKey,
  limit = 12,
  rootMargin = '200px',
  sectionIndex = 99,
  rows = 1,
  theme,
  movies: propMovies,
  loading: propLoading,
  ...sectionProps
}: LazyMovieSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [triggered, setTriggered] = useState(false);

  // Nếu đã có data từ props (home-proxy), vẫn dùng IntersectionObserver để lazy render
  const hasData = propMovies && propMovies.length > 0;

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
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [triggered, rootMargin]);

  // Section càng gần top → ảnh row đầu càng được ưu tiên
  const prioritizeFirstRow = sectionIndex === 0;

  return (
    <div ref={ref}>
      {triggered ? (
        <MovieSection
          {...sectionProps}
          movies={(propMovies ?? []).slice(0, limit)}
          loading={propLoading ?? false}
          prioritizeFirstRow={prioritizeFirstRow}
          theme={theme}
        />
      ) : (
        <SectionPlaceholder title={sectionProps.title} cols={sectionProps.cols ?? 6} rows={rows} theme={theme} />
      )}
    </div>
  );
}

function SectionPlaceholder({ title, cols = 6, rows = 1, theme }: { title: string; cols?: number; rows?: number; theme?: ComponentProps<typeof MovieSection>['theme'] }) {
  // Resolve theme colors for skeleton placeholder (mirror from MovieSection)
  const themeColors: Record<string, { border: string; glow: string }> = {
    cinematic:  { border: 'border-amber-500/[0.06]', glow: 'via-amber-500/25' },
    trending:   { border: 'border-fuchsia-500/[0.06]', glow: 'via-fuchsia-500/25' },
    anime:      { border: 'border-sky-400/[0.06]', glow: 'via-sky-400/25' },
    broadcast:  { border: 'border-emerald-500/[0.06]', glow: 'via-emerald-500/25' },
    kdrama:     { border: 'border-rose-500/[0.06]', glow: 'via-rose-500/25' },
    oriental:   { border: 'border-red-500/[0.06]', glow: 'via-red-500/25' },
    tropical:   { border: 'border-lime-500/[0.06]', glow: 'via-lime-500/25' },
    hollywood:  { border: 'border-yellow-500/[0.06]', glow: 'via-yellow-500/25' },
  };
  const t = themeColors[theme ?? 'cinematic'] ?? themeColors.cinematic;

  return (
    <div className="mb-10 md:mb-14">
      <div className={`relative border-t ${t.border} pt-1`}>
        {/* Ambient glow top line */}
        <div className={`absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent ${t.glow} to-transparent pointer-events-none`} />

        {/* Skeleton header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-7 h-7 rounded-md skeleton flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="h-5 w-48 skeleton rounded mb-2" />
          </div>
          <div className="h-8 w-20 skeleton rounded-md flex-shrink-0" />
        </div>

        <div className="flex snap-x snap-mandatory gap-3 overflow-hidden pb-2 md:gap-4">
          {Array.from({ length: Math.max(cols * rows, 8) }).map((_, i) => (
            <div key={i} className={carouselItemClass}>
              <div className="aspect-[2/3] skeleton rounded-lg" />
              <div className="mt-2 h-3 skeleton rounded w-3/4" />
              <div className="mt-1 h-2.5 skeleton rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
