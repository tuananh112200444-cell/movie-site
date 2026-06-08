import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchNewMovies, fetchMoviesByType, fetchMoviesByCategory } from '../services/movieApi';
import type { Movie, MovieListResponse } from '../types/movie';

/* ─── In-memory hook cache (TTL = 5 phút) ─── */
interface HookCacheEntry { movies: Movie[]; totalPages: number; ts: number }
const hookCache = new Map<string, HookCacheEntry>();
const HOOK_CACHE_TTL = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 24;
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

      const promises = Array.from({ length: pagesToLoad }, (_, i) =>
        fetchMoviesByType(type, page + i, sortField, 'desc')
      );
      const results = await Promise.allSettled(promises);
      const allMovies = extractMovies(results);
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
