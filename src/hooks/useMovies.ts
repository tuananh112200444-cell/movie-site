import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchNewMovies, fetchMoviesByType, fetchMoviesByCategory } from '../services/movieApi';
import type { Movie, MovieListResponse } from '../types/movie';

/* ─── In-memory hook cache (TTL = 5 phút) ─── */
interface HookCacheEntry { movies: Movie[]; totalPages: number; ts: number }
const hookCache = new Map<string, HookCacheEntry>();
const HOOK_CACHE_TTL = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 36;
function getHookCache(key: string): HookCacheEntry | null {
  const entry = hookCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > HOOK_CACHE_TTL) { hookCache.delete(key); return null; }
  return entry;
}

function setHookCache(key: string, movies: Movie[], totalPages: number): void {
  hookCache.set(key, { movies, totalPages, ts: Date.now() });
}

// Helper: lấy totalPages từ kết quả đầu tiên thành công
function extractTotalPages(results: PromiseSettledResult<MovieListResponse>[]): number {
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.pagination?.totalPages) {
      return r.value.pagination.totalPages;
    }
  }
  return 1;
}

// Helper: gom movie từ tất cả kết quả thành công
function extractMovies(results: PromiseSettledResult<MovieListResponse>[]): Movie[] {
  return results
    .filter((r): r is PromiseFulfilledResult<MovieListResponse> => r.status === 'fulfilled')
    .flatMap((r) => r.value.items ?? []);
}

function getMovieKey(movie: Movie): string {
  return movie._id || movie.slug || `${movie.name}-${movie.year ?? ''}`;
}

function getModifiedTime(movie: Movie): number {
  return new Date(movie.modified?.time ?? 0).getTime() || 0;
}

function dedupeAndSortNewest(movies: Movie[]): Movie[] {
  const seen = new Set<string>();
  return movies
    .filter((movie) => {
      const key = getMovieKey(movie);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const byYear = (b.year ?? 0) - (a.year ?? 0);
      if (byYear !== 0) return byYear;
      return getModifiedTime(b) - getModifiedTime(a);
    });
}

function isEpisodicBadge(value?: string): boolean {
  const text = (value ?? '').toLowerCase().trim();
  if (!text) return false;
  return /^t[aậ]p\s*\d+/.test(text) || /^ep(isode)?\s*\d+/.test(text);
}

function isSingleLikeMovie(movie: Movie): boolean {
  const type = String(movie.type ?? '').toLowerCase();
  if (type === 'series' || type === 'phim-bo' || type === 'tvshows' || type === 'tv-shows') return false;
  if (isEpisodicBadge(movie.episode_current)) return false;
  const currentEpisode = Number((movie as unknown as { current_episode?: unknown }).current_episode ?? 0);
  const totalEpisodes = Number((movie as unknown as { total_episodes?: unknown }).total_episodes ?? 0);
  if (currentEpisode > 1 || totalEpisodes > 1) return false;
  return true;
}

function filterMoviesForType(movies: Movie[], type: string): Movie[] {
  if (type !== 'phim-le') return movies;
  return movies.filter(isSingleLikeMovie);
}

function pageSlice<T>(items: T[], page: number): T[] {
  const start = (page - 1) * DEFAULT_PAGE_SIZE;
  return items.slice(start, start + DEFAULT_PAGE_SIZE);
}

function inferTotalPages(totalPages: number, itemCount: number, page: number, pagesToLoad: number): number {
  const loadedUntil = page + pagesToLoad - 1;
  if (itemCount >= DEFAULT_PAGE_SIZE * pagesToLoad) {
    return Math.max(totalPages, loadedUntil + 1);
  }
  return Math.max(totalPages, loadedUntil);
}
export function useNewMovies(initialPage = 1, pagesToLoad = 1) {
  const cacheKey = `new_${initialPage}_${pagesToLoad}_v2`;
  const cached = getHookCache(cacheKey);
  const [movies, setMovies] = useState<Movie[]>(cached?.movies ?? []);
  const [loading, setLoading] = useState(!cached);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(cached?.totalPages ?? 1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMovies = useCallback(async (page: number, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const promises = Array.from({ length: pagesToLoad }, (_, i) =>
        fetchNewMovies(page + i)
      );
      const results = await Promise.allSettled(promises);
      const allMovies = extractMovies(results);
      const tp = inferTotalPages(extractTotalPages(results), allMovies.length, page, pagesToLoad);

      if (append) setMovies((prev) => [...prev, ...allMovies]);
      else setMovies(allMovies);

      setTotalPages(tp);
      setHasMore((page + pagesToLoad - 1) < tp);
      setCurrentPage(page + pagesToLoad);
      if (!append) setHookCache(cacheKey, allMovies, tp);
    } catch {
      /* silent — lỗi API không cần log production */
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [pagesToLoad]);

  useEffect(() => {
    loadMovies(initialPage);
  }, [initialPage, loadMovies]);

  const refresh = useCallback(() => {
    loadMovies(initialPage);
  }, [initialPage, loadMovies]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) loadMovies(currentPage, true);
  }, [currentPage, hasMore, loadingMore, loadMovies]);

  return { movies, loading, refresh, loadMore, hasMore, loadingMore, totalPages };
}

export function useMoviesByType(
  type: string,
  initialPage = 1,
  pagesToLoad = 1,
  sortField?: string
) {
  const cacheKey = `type_${type}_${initialPage}_${pagesToLoad}_${sortField ?? 'default'}_v3`;
  const cached = getHookCache(cacheKey);
  const [movies, setMovies] = useState<Movie[]>(cached?.movies ?? []);
  const [loading, setLoading] = useState(!cached);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(cached?.totalPages ?? 1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Reset state khi initialPage thay đổi — đảm bảo không giữ data cũ
  const prevPageRef = useRef(initialPage);
  const prevTypeRef = useRef(type);
  const prevSortRef = useRef(sortField);
  useEffect(() => {
    const pageChanged = prevPageRef.current !== initialPage;
    const typeChanged = prevTypeRef.current !== type;
    const sortChanged = prevSortRef.current !== sortField;
    if (pageChanged || typeChanged || sortChanged) {
      prevPageRef.current = initialPage;
      prevTypeRef.current = type;
      prevSortRef.current = sortField;
      // Reset về trạng thái ban đầu cho page mới
      const newCached = getHookCache(cacheKey);
      setMovies(newCached?.movies ?? []);
      setTotalPages(newCached?.totalPages ?? 1);
      setLoading(!newCached);
      setCurrentPage(initialPage);
      setHasMore(true);
    }
  }, [initialPage, type, sortField, cacheKey]);

  const loadMovies = useCallback(async (page: number, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const stableNewest = sortField === 'year_stable';
      const sourcePagesToLoad = stableNewest
        ? Math.min(Math.max(page + 4, 6), 12)
        : pagesToLoad;
      const sourceStartPage = stableNewest ? 1 : page;
      const sourceSortField = stableNewest ? 'year' : sortField;
      const promises = Array.from({ length: sourcePagesToLoad }, (_, i) =>
        fetchMoviesByType(type, sourceStartPage + i, sourceSortField, 'desc')
      );
      const results = await Promise.allSettled(promises);
      const allMovies = stableNewest
        ? pageSlice(dedupeAndSortNewest(filterMoviesForType(extractMovies(results), type)), page)
        : filterMoviesForType(extractMovies(results), type);
      let tp = inferTotalPages(extractTotalPages(results), allMovies.length, page, pagesToLoad);

      // Fallback: nếu API trả totalPages ≤ 1 nhưng có nhiều items,
      // thử tính lại từ totalItems / totalItemsPerPage
      const firstPagination = results.find(
        (r): r is PromiseFulfilledResult<MovieListResponse> => r.status === 'fulfilled'
      )?.value.pagination;
      if (tp <= 1 && firstPagination && firstPagination.totalItems > 0) {
        const perPage = firstPagination.totalItemsPerPage || 24;
        const calcPages = Math.ceil(firstPagination.totalItems / perPage);
        tp = Math.max(tp, calcPages);
      }

      if (append) setMovies((prev) => [...prev, ...allMovies]);
      else setMovies(allMovies);

      setTotalPages(tp);
      setHasMore((page + pagesToLoad - 1) < tp);
      setCurrentPage(page + pagesToLoad);
      if (!append) setHookCache(cacheKey, allMovies, tp);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [type, pagesToLoad, sortField, cacheKey]);

  useEffect(() => {
    loadMovies(initialPage);
  }, [type, initialPage, loadMovies]);

  const refresh = useCallback(() => {
    loadMovies(initialPage);
  }, [initialPage, loadMovies]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) loadMovies(currentPage, true);
  }, [currentPage, hasMore, loadingMore, loadMovies]);

  return { movies, loading, refresh, loadMore, hasMore, loadingMore, totalPages };
}

export function useMoviesByCountry(country: string, initialPage = 1, pagesToLoad = 1) {
  const cacheKey = `country_${country}_${initialPage}_${pagesToLoad}_v2`;
  const cached = getHookCache(cacheKey);
  const [movies, setMovies] = useState<Movie[]>(cached?.movies ?? []);
  const [loading, setLoading] = useState(!cached);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(cached?.totalPages ?? 1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMovies = useCallback(async (page: number, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const promises = Array.from({ length: pagesToLoad }, (_, i) =>
        fetchMoviesByCategory({ country, page: page + i })
      );
      const results = await Promise.allSettled(promises);
      const allMovies = extractMovies(results);
      const tp = inferTotalPages(extractTotalPages(results), allMovies.length, page, pagesToLoad);

      if (append) setMovies((prev) => [...prev, ...allMovies]);
      else setMovies(allMovies);

      setTotalPages(tp);
      setHasMore((page + pagesToLoad - 1) < tp);
      setCurrentPage(page + pagesToLoad);
      if (!append) setHookCache(cacheKey, allMovies, tp);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [country, pagesToLoad]);

  useEffect(() => {
    loadMovies(initialPage);
  }, [country, initialPage, loadMovies]);

  const refresh = useCallback(() => {
    loadMovies(initialPage);
  }, [initialPage, loadMovies]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) loadMovies(currentPage, true);
  }, [currentPage, hasMore, loadingMore, loadMovies]);

  return { movies, loading, refresh, loadMore, hasMore, loadingMore, totalPages };
}
