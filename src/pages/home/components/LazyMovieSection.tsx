import { useRef, useEffect, useState } from 'react';
import MovieSection from './MovieSection';
import type { ComponentProps } from 'react';
import type { Movie } from '../../../types/movie';
import { HOME_POSTER_ITEM_CLASS } from './homePosterSizing';
import { fetchMoviesByCategory } from '../../../services/movieApi';

const carouselItemClass = HOME_POSTER_ITEM_CLASS;

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

function shouldTriggerImmediately(sectionIndex: number, hasData: boolean) {
  return isMobileViewport() && hasData && sectionIndex <= 1;
}

type SectionProps = Omit<ComponentProps<typeof MovieSection>, 'movies' | 'loading'>;

interface LazyMovieSectionProps extends SectionProps {
  fetchType: 'type' | 'country';
  fetchKey: string;
  limit?: number;
  rootMargin?: string;
  sectionIndex?: number;
  rows?: number;
  theme?: ComponentProps<typeof MovieSection>['theme'];
  movies?: Movie[];
  loading?: boolean;
}

export default function LazyMovieSection({
  fetchType,
  fetchKey,
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
  const hasData = Boolean(propMovies?.length);
  const [triggered, setTriggered] = useState(() => shouldTriggerImmediately(sectionIndex, hasData));
  const [fallbackMovies, setFallbackMovies] = useState<Movie[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    if (shouldTriggerImmediately(sectionIndex, hasData)) {
      setTriggered(true);
    }
  }, [hasData, sectionIndex]);

  useEffect(() => {
    const el = ref.current;
    if (!el || triggered) return;
    const observerRootMargin = isMobileViewport() ? '480px' : rootMargin;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTriggered(true);
          observer.disconnect();
        }
      },
      { rootMargin: observerRootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [triggered, rootMargin]);

  useEffect(() => {
    setFallbackMovies([]);
    setFallbackLoading(false);
    setFallbackAttempted(false);
  }, [fetchKey, fetchType]);

  useEffect(() => {
    if (!triggered || hasData || propLoading || fallbackAttempted) return;

    let cancelled = false;
    setFallbackAttempted(true);
    setFallbackLoading(true);

    fetchMoviesByCategory({
      ...(fetchType === 'country' ? { country: fetchKey } : { type: fetchKey }),
      page: 1,
      sortField: 'modified.time',
      sortType: 'desc',
    })
      .then((res) => {
        if (cancelled) return;
        const items = (res.items ?? [])
          .filter((movie) => (movie.episode_current ?? '').toLowerCase().trim() !== 'trailer')
          .slice(0, limit);
        setFallbackMovies(items as Movie[]);
      })
      .catch(() => {
        if (!cancelled) setFallbackMovies([]);
      })
      .finally(() => {
        if (!cancelled) setFallbackLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackAttempted, fetchKey, fetchType, hasData, limit, propLoading, triggered]);

  const prioritizeFirstRow = sectionIndex === 0;
  const sectionMovies = hasData ? (propMovies ?? []) : fallbackMovies;
  const sectionLoading = Boolean(propLoading) || fallbackLoading;

  return (
    <div ref={ref}>
      {triggered ? (
        <MovieSection
          {...sectionProps}
          movies={sectionMovies.slice(0, limit)}
          loading={sectionLoading}
          prioritizeFirstRow={prioritizeFirstRow}
          theme={theme}
        />
      ) : (
        <SectionPlaceholder title={sectionProps.title} cols={sectionProps.cols ?? 6} rows={rows} theme={theme} />
      )}
    </div>
  );
}

function SectionPlaceholder({
  title: _title,
  cols = 6,
  rows = 1,
  theme,
}: {
  title: string;
  cols?: number;
  rows?: number;
  theme?: ComponentProps<typeof MovieSection>['theme'];
}) {
  const themeColors: Record<string, { border: string; glow: string }> = {
    cinematic: { border: 'border-amber-500/[0.06]', glow: 'via-amber-500/25' },
    trending: { border: 'border-fuchsia-500/[0.06]', glow: 'via-fuchsia-500/25' },
    anime: { border: 'border-sky-400/[0.06]', glow: 'via-sky-400/25' },
    broadcast: { border: 'border-emerald-500/[0.06]', glow: 'via-emerald-500/25' },
    kdrama: { border: 'border-rose-500/[0.06]', glow: 'via-rose-500/25' },
    oriental: { border: 'border-red-500/[0.06]', glow: 'via-red-500/25' },
    tropical: { border: 'border-lime-500/[0.06]', glow: 'via-lime-500/25' },
    hollywood: { border: 'border-yellow-500/[0.06]', glow: 'via-yellow-500/25' },
  };
  const t = themeColors[theme ?? 'cinematic'] ?? themeColors.cinematic;

  return (
    <div className="mb-10 md:mb-14">
      <div className={`relative border-t ${t.border} pt-1`}>
        <div className={`pointer-events-none absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent ${t.glow} to-transparent`} />

        <div className="mb-4 flex items-center gap-3">
          <div className="h-7 w-7 flex-shrink-0 rounded-md skeleton" />
          <div className="min-w-0 flex-1">
            <div className="mb-2 h-5 w-48 rounded skeleton" />
          </div>
          <div className="h-8 w-20 flex-shrink-0 rounded-md skeleton" />
        </div>

        <div className="grid grid-cols-3 gap-x-2 gap-y-4 pb-3 md:hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] rounded-lg skeleton" />
              <div className="mt-2 h-3 w-3/4 rounded skeleton" />
              <div className="mt-1 h-2.5 w-1/2 rounded skeleton" />
            </div>
          ))}
        </div>

        <div className="hidden snap-x snap-mandatory gap-3 overflow-hidden pb-2 md:flex md:gap-4">
          {Array.from({ length: Math.max(cols * rows, 8) }).map((_, i) => (
            <div key={i} className={carouselItemClass}>
              <div className="aspect-[2/3] rounded-lg skeleton" />
              <div className="mt-2 h-3 w-3/4 rounded skeleton" />
              <div className="mt-1 h-2.5 w-1/2 rounded skeleton" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
