import { useRef, useEffect, useState } from 'react';
import MovieSection from './MovieSection';
import type { ComponentProps } from 'react';
import type { Movie } from '../../../types/movie';
import { HOME_POSTER_ITEM_CLASS } from './homePosterSizing';
import { fetchMoviesByCategory, fetchMoviesByType } from '../../../services/movieApi';
import { Film } from 'lucide-react';

const carouselItemClass = HOME_POSTER_ITEM_CLASS;
const HOME_FALLBACK_URL = '/home-fallback.json';
let staticHomeFallbackPromise: Promise<Record<string, Movie[]>> | null = null;

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

function parseRootMarginPx(rootMargin: string): number {
  const raw = Number.parseInt(rootMargin, 10);
  return Number.isFinite(raw) ? raw : 200;
}

function shouldTriggerImmediately(sectionIndex: number, hasData: boolean) {
  // The discovery, quick-picks and trending blocks already fill the initial
  // mobile viewport. Rendering category shelves immediately made dozens of
  // offscreen posters compete with the hero LCP.
  return !isMobileViewport() && hasData && sectionIndex === 0;
}

function withSectionTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('section fetch timeout')), timeoutMs);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

async function loadStaticHomeFallback(): Promise<Record<string, Movie[]>> {
  if (!staticHomeFallbackPromise) {
    staticHomeFallbackPromise = withSectionTimeout(fetch(HOME_FALLBACK_URL, { cache: 'force-cache' }), 3000)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('home fallback unavailable'))))
      .then((data: { sections?: Record<string, unknown[]> }) => {
        const sections: Record<string, Movie[]> = {};
        for (const [key, items] of Object.entries(data.sections ?? {})) {
          sections[key] = (items ?? []).filter((item) => {
            const movie = item as Partial<Movie>;
            return Boolean(movie.slug && movie.name && (movie.poster_url || movie.thumb_url));
          }) as Movie[];
        }
        return sections;
      })
      .catch(() => ({}));
  }
  return staticHomeFallbackPromise;
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
    // Mobile has less bandwidth and a shorter viewport. A smaller look-ahead
    // prevents several poster shelves from starting together while still
    // preparing the next shelf before it becomes visible.
    const observerRootMargin = isMobileViewport() ? '240px' : rootMargin;
    const marginPx = parseRootMarginPx(observerRootMargin);

    const checkPosition = () => {
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
      // One-way progressive queue: once the visitor reaches or passes this
      // shelf, it must render even if a fast swipe skipped over its bounds.
      if (rect.top <= viewportH + marginPx) {
        setTriggered(true);
      }
    };

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
    checkPosition();
    window.addEventListener('scroll', checkPosition, { passive: true });
    window.addEventListener('resize', checkPosition);
    window.addEventListener('focus', checkPosition);
    window.addEventListener('pageshow', checkPosition);
    window.addEventListener('kp:page-resumed', checkPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', checkPosition);
      window.removeEventListener('resize', checkPosition);
      window.removeEventListener('focus', checkPosition);
      window.removeEventListener('pageshow', checkPosition);
      window.removeEventListener('kp:page-resumed', checkPosition);
    };
  }, [triggered, rootMargin]);

  useEffect(() => {
    setFallbackMovies([]);
    setFallbackLoading(false);
    setFallbackAttempted(false);
  }, [fetchKey, fetchType]);

  useEffect(() => {
    if (!triggered || hasData || fallbackAttempted) return;

    let cancelled = false;
    const safetyTimer = window.setTimeout(() => {
      if (cancelled) return;
      setFallbackMovies([]);
      setFallbackLoading(false);
    }, 9000);

    setFallbackAttempted(true);
    setFallbackLoading(true);

    loadStaticHomeFallback()
      .then((sections) => {
        if (cancelled) return;
        const staticItems = (sections[fetchKey] ?? [])
          .filter((movie) => (movie.episode_current ?? '').toLowerCase().trim() !== 'trailer')
          .slice(0, limit);
        if (staticItems.length > 0) {
          setFallbackMovies(staticItems);
          setFallbackLoading(false);
          return null;
        }

        const fetchPromise = fetchType === 'country'
          ? fetchMoviesByCategory({
              country: fetchKey,
              page: 1,
              sortField: 'modified.time',
              sortType: 'desc',
            })
          : fetchMoviesByType(fetchKey, 1, 'modified.time', 'desc');

        return withSectionTimeout(fetchPromise);
      })
      .then((res) => {
        if (cancelled || !res) return;
        const items = (res.items ?? [])
          .filter((movie) => (movie.episode_current ?? '').toLowerCase().trim() !== 'trailer')
          .slice(0, limit);
        setFallbackMovies(items as Movie[]);
      })
      .catch(() => {
        if (!cancelled) setFallbackMovies([]);
      })
      .finally(() => {
        window.clearTimeout(safetyTimer);
        if (!cancelled) setFallbackLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
    };
  }, [fallbackAttempted, fetchKey, fetchType, hasData, limit, triggered]);

  useEffect(() => {
    if (!triggered || hasData || fallbackMovies.length > 0) return;
    const retryWhenUsable = () => setFallbackAttempted(false);
    window.addEventListener('online', retryWhenUsable);
    window.addEventListener('pageshow', retryWhenUsable);
    window.addEventListener('kp:page-resumed', retryWhenUsable);
    return () => {
      window.removeEventListener('online', retryWhenUsable);
      window.removeEventListener('pageshow', retryWhenUsable);
      window.removeEventListener('kp:page-resumed', retryWhenUsable);
    };
  }, [fallbackMovies.length, hasData, triggered]);

  const prioritizeFirstRow = sectionIndex === 0 && !isMobileViewport();
  const sectionMovies = hasData ? (propMovies ?? []) : fallbackMovies;
  const sectionLoading = hasData ? Boolean(propLoading) : fallbackLoading;

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
  title,
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
    <section className="mb-10 md:mb-14" aria-label={`${title} đang chuẩn bị`}>
      <div className={`relative border-t ${t.border} pt-1`}>
        <div className={`pointer-events-none absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent ${t.glow} to-transparent`} />

        <div className="mb-4 flex items-center gap-2.5 pt-3">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.10] bg-white/[0.045] text-white/70">
            <Film size={15} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[1.08rem] font-black tracking-tight text-white md:text-2xl">{title}</h3>
            <p className="mt-0.5 text-[10px] font-semibold text-white/35 md:text-xs">Đang chuẩn bị danh sách phim</p>
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
    </section>
  );
}
