/**
 * Prefetch lazy route chunks + API data trước khi user click.
 * Chiến lược:
 * - Dùng requestIdleCallback để không block main thread
 * - Dedup: mỗi route chỉ prefetch 1 lần
 * - Hover delay 120ms: tránh prefetch khi user chỉ lướt qua
 */

const prefetched = new Set<string>();

const routeImports: Record<string, () => Promise<unknown>> = {
  '/search':          () => import('../pages/search/page'),
  '/filter':          () => import('../pages/filter/page'),
  '/phim':            () => import('../pages/movie-detail/page'),
  '/phim-le':         () => import('../pages/movie-list/page'),
  '/phim-bo':         () => import('../pages/movie-list/page'),
  '/phim-chieu-rap':  () => import('../pages/movie-list/page'),
  '/phim-han-quoc':   () => import('../pages/movie-list/page'),
  '/phim-trung-quoc': () => import('../pages/movie-list/page'),
  '/phim-thai-lan':   () => import('../pages/movie-list/page'),
  '/phim-au-my':      () => import('../pages/movie-list/page'),
  '/phim-nhat-ban':   () => import('../pages/movie-list/page'),
  '/phim-viet-nam':   () => import('../pages/movie-list/page'),
  '/hoat-hinh':       () => import('../pages/movie-list/page'),
  '/tv-shows':        () => import('../pages/movie-list/page'),
  '/yeu-thich':       () => import('../pages/favorites/page'),
  '/about':           () => import('../pages/about/page'),
  '/policy':          () => import('../pages/policy/page'),
};

/** Prefetch JS chunk — idempotent, runs in idle time */
export function prefetchRoute(path: string): void {
  const key = '/' + path.split('/')[1];
  if (prefetched.has(key)) return;
  const imp = routeImports[key];
  if (!imp) return;
  prefetched.add(key);

  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => imp().catch(() => {}), { timeout: 3000 });
  } else {
    setTimeout(() => imp().catch(() => {}), 300);
  }
}

/**
 * Prefetch tất cả routes quan trọng sau khi trang đã load xong.
 * Gọi 1 lần duy nhất sau khi hero render xong (~3s).
 */
export function prefetchCriticalRoutes(): void {
  const criticalRoutes = ['/phim', '/search', '/filter', '/phim-le', '/phim-bo', '/phim-han-quoc'];
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return;

  const startPrefetch = () => {
    criticalRoutes.forEach((route, index) => {
      setTimeout(() => prefetchRoute(route), index * 700);
    });
  };

  if (document.readyState === 'complete') {
    setTimeout(startPrefetch, 8000);
    return;
  }

  window.addEventListener('load', () => {
    setTimeout(startPrefetch, 8000);
  }, { once: true });
}

/** Prefetch movie detail API data khi hover card */
const prefetchedSlugs = new Set<string>();
const hoverTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeDetailPrefetches = new Set<string>();
const MAX_ACTIVE_DETAIL_PREFETCHES = 2;
// Route chunks remain warm, but speculative detail API reads are paused while
// the catalogue database is under sustained IO pressure.
const PREFETCH_MOVIE_DETAIL_DATA_ENABLED = false;

function prefetchMovieDetailApi(slug: string): void {
  if (activeDetailPrefetches.size >= MAX_ACTIVE_DETAIL_PREFETCHES) return;

  activeDetailPrefetches.add(slug);
  // Use the same data function as the click path so the six-hour in-memory
  // detail cache is actually warm. The old /api prefetch could receive the SPA
  // HTML fallback and never helped fetchMovieDetail's separate Supabase URL.
  void import('../services/movieApi')
    .then(({ fetchMovieDetail }) => fetchMovieDetail(slug, false))
    .catch(() => {})
    .finally(() => {
      activeDetailPrefetches.delete(slug);
    });
}

export function prefetchMovieDetail(slug: string): void {
  if (!slug || prefetchedSlugs.has(slug)) return;

  // MovieCard already waits 120ms before calling this helper. Keep only a very
  // small extra debounce so deliberate hover warms the exact click path.
  const timer = setTimeout(() => {
    prefetchedSlugs.add(slug);
    hoverTimers.delete(slug);
    // Keep the lazy route warm without turning card hovers into database work.
    prefetchRoute('/phim/slug');
    if (PREFETCH_MOVIE_DETAIL_DATA_ENABLED) prefetchMovieDetailApi(slug);
  }, 80);

  hoverTimers.set(slug, timer);
}

/** Hủy prefetch nếu mouse rời đi trước khi timer chạy */
export function cancelPrefetchMovieDetail(slug: string): void {
  const timer = hoverTimers.get(slug);
  if (timer) {
    clearTimeout(timer);
    hoverTimers.delete(slug);
    prefetchedSlugs.delete(slug);
  }
}
