import type { MovieListResponse, MovieDetailResponse, EpisodeServer, EpisodeData, MovieItem, MovieCategory, MovieCountry, MovieDetail, Movie } from '../types/movie';
import { preloadBatch } from '../utils/imagePreloader';
import { mergeMoviesUnique, sortMoviesForSearch } from '../utils/searchRanking';
import { normalizeSearchText } from '../utils/searchHelper';
import { setSmartSessionCache } from '../utils/smartCache';
import { supabase } from '@/lib/supabase';

declare const __IS_PREVIEW__: boolean;

const BASE_URL = 'https://ophim1.com';
export const IMG_BASE = 'https://img.ophim.live/uploads/movies/';

function isAbortLikeError(error: unknown): boolean {
  const err = error as Error | undefined;
  const message = String(err?.message ?? error ?? '').toLowerCase();
  return err?.name === 'AbortError'
    || message.includes('abort')
    || message.includes('signal is aborted')
    || message.includes('request timeout');
}

/* ─── URL helpers ─── */
function isBlvietsubWatchPageUrl(url: string): boolean {
  const raw = String(url || '').replace(/&amp;/g, '&').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return /(^|\.)blvietsub\.com$/i.test(parsed.hostname);
  } catch {
    return /(^|\/\/|[./])blvietsub\.com(\/|$)/i.test(raw);
  }
}

function normalizeDailymotionUrl(url: string): string {
  if (isBlvietsubWatchPageUrl(url)) return '';
  const dm = /^https?:\/\/(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/i.exec(url);
  if (dm) return `https://www.dailymotion.com/embed/video/${dm[1]}`;
  const short = /^https?:\/\/dai\.ly\/([a-zA-Z0-9]+)/i.exec(url);
  if (short) return `https://www.dailymotion.com/embed/video/${short[1]}`;
  return url;
}

/* ════════════════════════════════════════════
   DIRECT FETCH — bypass cache & circuit breaker
   For movie detail only: always get FRESH data
   ════════════════════════════════════════════ */
async function fetchDetailRaw(url: string, timeoutMs = 10000, retries = 2): Promise<Record<string, unknown> | null> {
  let lastErr: Error | undefined;
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Request timeout', 'AbortError')), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`HTTP ${res.status}`);
          if (i < retries) { await sleep(800 * (i + 1)); continue; }
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json() as Record<string, unknown>;
      return data;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < retries && (lastErr.message.includes('timeout') || lastErr.message.includes('fetch') || lastErr.message.includes('network'))) {
        await sleep(800 * (i + 1));
        continue;
      }
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  if (import.meta.env.DEV && !isAbortLikeError(lastErr)) {
    console.warn(`[fetchDetailRaw] Failed after ${retries + 1} attempts: ${url}`, lastErr?.message);
  }
  return null;
}

/* ─═══════════════════════════════════════════
   MOVIE DETAIL — SUPABASE FIRST, OPHIM FALLBACK
   Step 1: Try Supabase (storage).
   Step 2: If empty, call OPhim API directly (source of truth).
   NEVER merge metadata — OPhim and Supabase IDs may differ.
   ════════════════════════════════════════════ */

/* ════════════════════════════════════════════
   DETAIL has playable episodes helper
   ════════════════════════════════════════════ */
function detailHasPlayableEpisodes(detail: MovieDetailResponse | null): boolean {
  if (!detail?.episodes?.length) return false;
  return detail.episodes.some((srv) => srv.server_data?.some((ep) => hasPlayableUrl(ep)) ?? false);
}

/* ════════════════════════════════════════════
   STRICT OPHIM MATCH VALIDATION
   Only merge OPhim episodes if EXACT match:
   - slug matches exactly (case-insensitive, NFC normalized), OR
   - ophim_id matches exactly
   ════════════════════════════════════════════ */
function validateOphimExactMatch(
  ophimResponse: MovieDetailResponse | null,
  expectedSlug: string,
  supabaseMovie?: Record<string, unknown> | null
): boolean {
  if (!ophimResponse?.movie?.slug) return false;

  const ophimSlug = String(ophimResponse.movie.slug).trim().toLowerCase().normalize('NFC');
  const expected = expectedSlug.trim().toLowerCase().normalize('NFC');

  // 1. Exact slug match
  if (ophimSlug === expected) return true;

  // 2. Fuzzy slug match (contains or normalized without year suffix)
  const normalizeSlug = (s: string) => s.replace(/-\d{4}$/, '').replace(/-\d+$/, '').trim();
  if (
    ophimSlug.includes(expected) ||
    expected.includes(ophimSlug) ||
    normalizeSlug(ophimSlug) === normalizeSlug(expected)
  ) return true;

  // 3. ophim_id match (if Supabase has ophim_id)
  const ophimId = String(ophimResponse.movie._id || ophimResponse.movie.ophim_id || '').trim();
  const sbOphimId = supabaseMovie?.ophim_id
    ? String(supabaseMovie.ophim_id).trim()
    : '';
  if (sbOphimId && ophimId && sbOphimId === ophimId) return true;

  // 4. tmdb_id match (if available)
  const sbTmdbId = supabaseMovie?.tmdb_id
    ? String(supabaseMovie.tmdb_id).trim()
    : '';
  const opTmdbId = (ophimResponse.movie as unknown as Record<string, unknown>)?.tmdb_id
    ? String((ophimResponse.movie as unknown as Record<string, unknown>).tmdb_id).trim()
    : '';
  if (sbTmdbId && opTmdbId && sbTmdbId === opTmdbId) return true;

  // No match found
  console.warn(
    `[validateOphimExactMatch] REJECTED: expected slug "${expected}" vs OPhim slug "${ophimSlug}". ophim_id: ${sbOphimId || 'none'} vs ${ophimId || 'none'}. Not a match — episodes will NOT be merged.`
  );
  return false;
}

/* ════════════════════════════════════════════
   MULTI-SOURCE LIST FETCH — aggregate movies
   OPTIMIZED: chỉ gọi 2 nguồn nhanh nhất (OPhim + KKPhim)
   ════════════════════════════════════════════ */
const LIST_SOURCES = [
  { base: 'https://ophim1.com',  name: 'OPhim',   site: 'ophim', timeout: 5000, listEndpoint: '/v1/api/danh-sach/', mirror: 'https://ophim.tv' },
  { base: 'https://phimapi.com', name: 'KKPhim',  site: 'phimapi', timeout: 5000, listEndpoint: '/v1/api/danh-sach/', mirror: 'https://phimapi.net' },
] as const;

export async function fetchNewMoviesMultiSource(page = 1): Promise<MovieListResponse> {
  // Build requests: primary + mirror for each source
  const sourceRequests = LIST_SOURCES.map((src) => {
    const primaryUrl = `${src.base}${src.listEndpoint}phim-moi-cap-nhat?page=${page}`;
    const mirrorUrl = src.mirror ? `${src.mirror}${src.listEndpoint}phim-moi-cap-nhat?page=${page}` : null;
    return { primaryUrl, mirrorUrl, name: src.name, site: src.site, timeout: src.timeout };
  });

  // Try each source: primary first, then mirror if fail
  const sourcePromises = sourceRequests.map(async ({ primaryUrl, mirrorUrl, name, site, timeout }) => {
    try {
      const data = await fetchJSON<Record<string, unknown>>(primaryUrl, timeout);
      return { result: withSourceMetadata(toMovieListResponse(data), site, name), source: name, url: primaryUrl };
    } catch {
      if (mirrorUrl) {
        try {
          const data = await fetchJSON<Record<string, unknown>>(mirrorUrl, timeout * 1.5);
          return { result: withSourceMetadata(toMovieListResponse(data), site, name), source: `${name}-M`, url: mirrorUrl };
        } catch {
          return { result: { status: false, items: [], pagination: { currentPage: page, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 } } as MovieListResponse, source: name, url: primaryUrl };
        }
      }
      return { result: { status: false, items: [], pagination: { currentPage: page, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 } } as MovieListResponse, source: name, url: primaryUrl };
    }
  });

  const sourceResults = await Promise.all(sourcePromises);

  // Sort sources by who has most new movies (totalItems descending) — prioritize fresher sources
  sourceResults.sort((a, b) => {
    const aTotal = a.result.pagination?.totalItems ?? a.result.items?.length ?? 0;
    const bTotal = b.result.pagination?.totalItems ?? b.result.items?.length ?? 0;
    return bTotal - aTotal;
  });

  const allItems: MovieListResponse['items'] = [];
  const seen = new Set<string>();

  // Merge from all sources, best sources first
  for (const { result } of sourceResults) {
    for (const item of result.items ?? []) {
      if (seen.has(item.slug)) continue;
      seen.add(item.slug);
      allItems.push(item);
    }
  }

  // Sort by modified time (newest first)
  allItems.sort((a, b) => {
    const ta = new Date(a.modified?.time ?? 0).getTime();
    const tb = new Date(b.modified?.time ?? 0).getTime();
    return tb - ta;
  });

  // Filter out trailer-only items
  const filteredItems = allItems.filter(
    (item) => (item.episode_current ?? '').toLowerCase().trim() !== 'trailer'
  );

  return {
    status: true,
    items: filteredItems,
    pagination: {
      currentPage: page,
      totalItems: filteredItems.length,
      totalItemsPerPage: 24,
      totalPages: Math.max(1, Math.ceil(filteredItems.length / 24)),
    },
  };
}

/* ════════════════════════════════════════════
   MULTI-SOURCE SEARCH — tìm qua nguồn chính
   OPTIMIZED: chỉ 2 nguồn nhanh nhất để giảm latency
   ════════════════════════════════════════════ */
const SEARCH_SOURCES = [
  { base: 'https://ophim1.com',  name: 'OPhim',  site: 'ophim', timeout: 1400, searchEndpoint: '/v1/api/tim-kiem', mirror: 'https://ophim.tv' },
  { base: 'https://phimapi.com', name: 'KKPhim', site: 'phimapi', timeout: 1400, searchEndpoint: '/v1/api/tim-kiem', mirror: 'https://phimapi.net' },
] as const;

async function fetchSearchJSON<T>(url: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const ttl = resolveTTL(url);
  const cached = getCached<T>(url, ttl);
  if (cached) {
    if (cached.stale) {
      fetchOnce<T>(url, timeoutMs, signal)
        .then((data) => setCached(url, data))
        .catch(() => { /* keep stale cache */ });
    }
    return cached.data;
  }

  const inflightKey = `search:${url}`;
  const inflight = inflightMap.get(inflightKey) as Promise<T> | undefined;
  if (inflight) return inflight;

  const promise = fetchOnce<T>(url, timeoutMs, signal)
    .then((data) => {
      setCached(url, data);
      return data;
    })
    .finally(() => inflightMap.delete(inflightKey));
  inflightMap.set(inflightKey, promise as Promise<unknown>);
  return promise;
}

export async function searchMoviesMultiSource(keyword: string, page = 1, signal?: AbortSignal): Promise<MovieListResponse> {
  if (!keyword.trim()) return { status: true, items: [], pagination: { currentPage: 1, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 } };

  const encoded = encodeURIComponent(keyword.trim());

  // Build requests with mirror fallback
  const sourceRequests = SEARCH_SOURCES.map((src) => {
    const primaryUrl = `${src.base}${src.searchEndpoint}?keyword=${encoded}&page=${page}`;
    const mirrorUrl = src.mirror ? `${src.mirror}${src.searchEndpoint}?keyword=${encoded}&page=${page}` : null;
    return { primaryUrl, mirrorUrl, name: src.name, site: src.site, timeout: src.timeout };
  });

  const sourcePromises = sourceRequests.map(async ({ primaryUrl, mirrorUrl, name, site, timeout }) => {
    try {
      const data = await fetchSearchJSON<Record<string, unknown>>(primaryUrl, timeout, signal);
      return { result: withSourceMetadata(toMovieListResponse(data), site, name), source: name, url: primaryUrl };
    } catch {
      if (mirrorUrl) {
        try {
          const data = await fetchSearchJSON<Record<string, unknown>>(mirrorUrl, Math.min(timeout, 2500), signal);
          return { result: withSourceMetadata(toMovieListResponse(data), site, name), source: `${name}-M`, url: mirrorUrl };
        } catch {
          return { result: { status: false, items: [], pagination: { currentPage: page, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 } } as MovieListResponse, source: name, url: primaryUrl };
        }
      }
      return { result: { status: false, items: [], pagination: { currentPage: page, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 } } as MovieListResponse, source: name, url: primaryUrl };
    }
  });

  const settledSourceResults = await promiseAllSettledWithTimeout(sourcePromises, 2800);
  const sourceResults = settledSourceResults
    .filter((result): result is PromiseFulfilledResult<Awaited<(typeof sourcePromises)[number]>> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (sourceResults.length === 0) {
    return {
      status: true,
      items: [],
      pagination: { currentPage: page, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 },
    };
  }

  // Sort by result count descending — source with most matches first
  sourceResults.sort((a, b) => {
    const aTotal = a.result.pagination?.totalItems ?? a.result.items?.length ?? 0;
    const bTotal = b.result.pagination?.totalItems ?? b.result.items?.length ?? 0;
    return bTotal - aTotal;
  });

  const allItems: MovieListResponse['items'] = [];
  

  for (const { result } of sourceResults) {
    for (const item of result.items ?? []) {
      
      allItems.push(item);
    }
  }
  const rankedItems = sortMoviesForSearch(mergeMoviesUnique(allItems), keyword, 'relevance');

  const bestPagination = sourceResults
    .map(({ result }) => result.pagination)
    .filter(Boolean)
    .sort((a, b) => (b?.totalItems ?? 0) - (a?.totalItems ?? 0))[0];
  const totalItemsPerPage = bestPagination?.totalItemsPerPage || 24;
  const totalItems = Math.max(bestPagination?.totalItems ?? 0, rankedItems.length);
  const totalPages = Math.max(
    bestPagination?.totalPages ?? 1,
    totalItems > 0 ? Math.ceil(totalItems / totalItemsPerPage) : 1,
    rankedItems.length >= totalItemsPerPage ? page + 1 : page,
  );
  return {
    status: true,
    items: rankedItems,
    pagination: {
      currentPage: page,
      totalItems,
      totalItemsPerPage,
      totalPages,
    },
  };
}



/* ════════════════════════════════════════════
   TIERED CACHE SYSTEM  (TTL per endpoint type)
   ════════════════════════════════════════════ */
interface CacheEntry<T> { data: T; ts: number; stale?: boolean }
const apiCache = new Map<string, CacheEntry<unknown>>();

const TTL_CONFIG = {
  trending:    15 * 60 * 1000,  // 15 phút — trending cần cập nhật thường xuyên
  newMovies:   10 * 60 * 1000,  // 10 phút — phim mới cập nhật liên tục
  detail:      6 * 60 * 60 * 1000,  // 6 tiếng  — phim cố định
  search:      5 * 60 * 1000,       // 5 phút   — search thay đổi nhanh
  category:    30 * 60 * 1000,      // 30 phút
  default:     30 * 60 * 1000,       // 30 phút  — fallback
} as const;

function resolveTTL(url: string): number {
  if (url.includes('home-proxy'))         return TTL_CONFIG.newMovies;
  if (url.includes('tim-kiem'))           return TTL_CONFIG.search;
  if (url.includes('phim-moi-cap-nhat'))  return TTL_CONFIG.newMovies;
  if (url.includes('/phim/'))             return TTL_CONFIG.detail;
  if (url.includes('danh-sach/'))       return TTL_CONFIG.category;
  return TTL_CONFIG.default;
}

/* ════════════════════════════════════════════
   sessionStorage cache (survives page reload)
   ════════════════════════════════════════════ */
const SS_KEYS = {
  trending:  'kp_trending_v5',
  newMovies: 'kp_new_movies_v5',
} as const;

const SS_TTL = 30 * 60 * 1000; // 30 phút

function getSSCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.ts > ttl) { sessionStorage.removeItem(key); return null; }
    return entry.data;
  } catch { return null; }
}

function setSSCache<T>(key: string, data: T): void {
  try { setSmartSessionCache(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota exceeded */ }
}

/* ════════════════════════════════════════════
   MEMORY CACHE with stale-while-revalidate
   ════════════════════════════════════════════ */
function getCached<T>(key: string, ttl: number): { data: T; stale: boolean } | null {
  const entry = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  if (age > ttl * 2) { apiCache.delete(key); return null; } // hard expiry = 2×TTL
  return { data: entry.data, stale: age > ttl }; // stale when > TTL
}

function setCached<T>(key: string, data: T): void {
  apiCache.set(key, { data, ts: Date.now() });
}

/* ════════════════════════════════════════════
   CIRCUIT BREAKER  — tạm ngưng gọi API nếu die
   ════════════════════════════════════════════ */
interface CBState {
  failures: number;
  lastFailure: number;
  openUntil: number;
}
const circuitMap = new Map<string, CBState>();
const CB_THRESHOLD = 5;      // 5 lỗi
const CB_WINDOW_MS = 60_000; // trong 60 giây
const CB_OPEN_MS = 120_000;  // ngưng 2 phút

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return 'default'; }
}

function isCircuitOpen(url: string): boolean {
  const domain = getDomain(url);
  const state = circuitMap.get(domain);
  if (!state) return false;
  if (Date.now() < state.openUntil) return true;
  // Tự động half-open sau thời gian mở
  if (Date.now() - state.lastFailure > CB_WINDOW_MS) {
    circuitMap.delete(domain);
    return false;
  }
  return false;
}

function recordSuccess(url: string): void {
  const domain = getDomain(url);
  circuitMap.delete(domain);
}

function recordFailure(url: string): void {
  const domain = getDomain(url);
  const now = Date.now();
  let state = circuitMap.get(domain);
  if (!state || now - state.lastFailure > CB_WINDOW_MS) {
    state = { failures: 1, lastFailure: now, openUntil: 0 };
  } else {
    state.failures += 1;
    state.lastFailure = now;
  }
  if (state.failures >= CB_THRESHOLD) {
    state.openUntil = now + CB_OPEN_MS;
  }
  circuitMap.set(domain, state);
}

/* ════════════════════════════════════════════
   REQUEST DEDUPLICATION
   ════════════════════════════════════════════ */
const inflightMap = new Map<string, Promise<unknown>>();

/* ════════════════════════════════════════════
   FETCH with RETRY + exponential backoff
   ════════════════════════════════════════════ */
const MAX_RETRIES = 1;
const BACKOFF_BASE_MS = 350;

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchOnce<T>(url: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (isCircuitOpen(url)) {
    throw new Error(`Circuit breaker OPEN for ${getDomain(url)} — tạm ngưng gọi API`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Request timeout', 'AbortError'));
  }, timeoutMs);

  // Kết hợp signal ngoài + internal timeout
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      if (res.status >= 500 || res.status === 429) {
        // Retry-able
        throw new Error(`HTTP ${res.status}`);
      }
      throw new Error(`HTTP ${res.status}`); // 4xx — không retry
    }
    const data = await res.json() as T;
    recordSuccess(url);
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function fetchJSON<T>(url: string, timeoutMs = 10000, signal?: AbortSignal): Promise<T> {
  // 1. Memory cache hit (stale OK — sẽ revalidate ngầm)
  const ttl = resolveTTL(url);
  const cached = getCached<T>(url, ttl);
  if (cached && !cached.stale) return cached.data;

  // 2. Deduplication
  const inflight = inflightMap.get(url) as Promise<T> | undefined;
  if (inflight) return inflight;

  // 3. Retry loop
  const attempt = async (): Promise<T> => {
    let lastErr: Error | undefined;
    for (let i = 0; i <= MAX_RETRIES; i++) {
      try {
        const data = await fetchOnce<T>(url, timeoutMs, signal);
        setCached(url, data);
        return data;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const isRetryable =
          lastErr.message.startsWith('HTTP 5') ||
          lastErr.message.startsWith('HTTP 429') ||
          lastErr.message.includes('timeout') ||
          lastErr.message.includes('fetch') ||
          lastErr.message.includes('network');
        if (!isRetryable || i === MAX_RETRIES) break;
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await sleep(BACKOFF_BASE_MS * (2 ** i));
      }
    }
    recordFailure(url);
    throw lastErr ?? new Error(`Failed to fetch ${url}`);
  };

  // 4. Stale-while-revalidate: nếu có cache cũ, trả ngay + refresh ngầm
  if (cached?.stale) {
    // Background revalidation — không đưa vào inflightMap
    // để concurrent requests vẫn nhận stale data ngay lập tức
    attempt()
      .then((data) => { setCached(url, data); })
      .catch(() => { /* revalidate fail — silently keep stale */ });
    return cached.data;
  }

  const promise = attempt().finally(() => inflightMap.delete(url));
  inflightMap.set(url, promise as Promise<unknown>);
  return promise;
}

/* ════════════════════════════════════════════
   IMAGE URL helpers  (giữ nguyên)
   ════════════════════════════════════════════ */
const imgUrlCache = new Map<string, string>();
const FALLBACK_IMG = 'https://readdy.ai/api/search-image?query=professional%20movie%20poster%20dark%20cinematic%20background%20dramatic%20lighting%20film%20noir%20style%20minimal%20elegant%20vertical%20composition&width=300&height=450&seq=fallback99&orientation=portrait';

export function getMovieDisplayName(item: {
  name?: string;
  title_vi?: string;
  title_en?: string;
  title_zh?: string;
  origin_name?: string;
}): string {
  return item.title_vi?.trim()
    || item.name?.trim()
    || item.title_en?.trim()
    || item.title_zh?.trim()
    || item.origin_name?.trim()
    || 'Không tên';
}

export function getImageUrl(path: string): string {
  if (!path) return FALLBACK_IMG;
  const hit = imgUrlCache.get(path);
  if (hit) return hit;
  let url: string;
  if (path.startsWith('http')) {
    url = path;
  } else if (path.startsWith('/')) {
    url = `https://img.ophim.live${path}`;
  } else if (path.includes('uploads/movies/')) {
    url = `https://img.ophim.live/${path}`;
  } else {
    url = `${IMG_BASE}${path}`;
  }
  imgUrlCache.set(path, url);
  return url;
}

/**
 * Optimized image URL for cards and hero images.
 * Desktop gets a denser source for sharper large screens; mobile stays lighter but still retina-friendly.
 */
const OPTIMIZE_ENABLED = true;
export function getOptimizedImageUrl(path: string, width = 360, quality = 82): string {
  const original = getImageUrl(path);
  if (!OPTIMIZE_ENABLED || !original || original === FALLBACK_IMG) return original;
  if (original.includes('wsrv.nl/?url=')) return original;
  // wsrv.nl free image proxy — resize + compress + WebP auto
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth || 1440;
  const dpr = typeof window === 'undefined' ? 1.5 : Math.min(window.devicePixelRatio || 1, 2);
  const isDesktop = viewportWidth >= 1024;
  const density = isDesktop ? Math.max(1.35, Math.min(dpr, 1.65)) : Math.max(1.55, Math.min(dpr, 1.85));
  const maxWidth = isDesktop ? 1680 : 1120;
  const minQuality = isDesktop ? 82 : 78;
  const maxQuality = isDesktop ? 88 : 84;
  const safeWidth = Math.max(320, Math.min(Math.round(width * density), maxWidth));
  const safeQuality = Math.max(minQuality, Math.min(quality, maxQuality));
  const encoded = encodeURIComponent(original);
  return `https://wsrv.nl/?url=${encoded}&w=${safeWidth}&q=${safeQuality}&output=webp&fit=cover&we`;
}

function getOriginalImageFromProxy(url: string): string | null {
  if (!url.includes('wsrv.nl/?url=')) return null;
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('url');
  } catch {
    return null;
  }
}

function isVolatileOphimVodImage(url: string): boolean {
  return /img\.ophim\.live\/uploads\/movies\/upload\/vod\//i.test(url);
}

export function getImageFallbacks(primaryPath?: string, altPath?: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const pushUrl = (url?: string | null) => {
    if (!url || seen.has(url) || isVolatileOphimVodImage(url)) return;
    seen.add(url);
    urls.push(url);
  };
  const addCandidate = (path?: string) => {
    const trimmed = path?.trim();
    if (!trimmed) return;
    const normalized = getImageUrl(trimmed);
    pushUrl(normalized);
    pushUrl(getOriginalImageFromProxy(normalized));
  };

  addCandidate(primaryPath);
  if (altPath?.trim() !== primaryPath?.trim()) addCandidate(altPath);
  if (urls.length === 0 || urls[0] === FALLBACK_IMG) return [FALLBACK_IMG];
  pushUrl(FALLBACK_IMG);
  return urls;
}

export function getOptimizedImageFallbacks(
  primaryPath?: string,
  altPath?: string,
  width = 620,
  quality = 88,
): string[] {
  return getImageFallbacks(primaryPath, altPath).map((url) =>
    url === FALLBACK_IMG ? url : getOptimizedImageUrl(url, width, quality)
  );
}

export function getPosterUrl(path: string): string {
  return getOptimizedImageUrl(path, 620, 88);
}
export function getThumbUrl(path: string): string {
  return getOptimizedImageUrl(path, 1280, 88);
}
export function getFeaturedUrl(path: string): string {
  return getOptimizedImageUrl(path, 1180, 88);
}
export function getHeroUrl(path: string): string {
  return getOptimizedImageUrl(path, 1680, 90);
}

export function getSmallThumbUrl(path: string): string {
  return getOptimizedImageUrl(path, 420, 84);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizeTaxonomy<T extends MovieCategory | MovieCountry>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const name = String(record.name ?? '').trim();
      const slug = String(record.slug ?? '').trim();
      if (!name || !slug) return null;
      return {
        id: String(record.id ?? slug),
        name,
        slug,
      } as T;
    })
    .filter(Boolean) as T[];
}

/* ════════════════════════════════════════════
   RESPONSE parsers  (giữ nguyên)
   ════════════════════════════════════════════ */
function parsePagination(data: Record<string, unknown>): MovieListResponse['pagination'] {
  const nested = asRecord(data.data);
  const nestedParams = asRecord(nested?.params);
  const rootParams = asRecord(data.params);
  let p: Record<string, unknown> | undefined;
  if (asRecord(nestedParams?.pagination)) {
    p = asRecord(nestedParams?.pagination);
  } else if (asRecord(nested?.pagination)) {
    p = asRecord(nested?.pagination);
  } else if (asRecord(data.pagination)) {
    p = asRecord(data.pagination);
  } else if (asRecord(rootParams?.pagination)) {
    p = asRecord(rootParams?.pagination);
  }
  p ??= {};
  const currentPage = Number(p.currentPage ?? p.page ?? 0) || 0;
  const totalItems = Number(p.totalItems ?? 0) || 0;
  const totalItemsPerPage = Number(p.totalItemsPerPage ?? 24) || 24;
  let totalPages = Number(p.totalPages ?? 0) || 0;
  if (!totalPages && totalItems > 0 && totalItemsPerPage > 0) {
    totalPages = Math.ceil(totalItems / totalItemsPerPage);
  }
  totalPages = Math.max(1, totalPages);
  return { currentPage, totalItems, totalItemsPerPage, totalPages };
}

function isExpectedPage(result: MovieListResponse, page: number): boolean {
  const currentPage = Number(result.pagination?.currentPage ?? 0) || 0;
  return currentPage === 0 || currentPage === page;
}

function parseItems(data: Record<string, unknown>): MovieListResponse['items'] {
  const nested = asRecord(data.data);
  const items = nested?.items ?? data.items;
  return Array.isArray(items) ? items as MovieListResponse['items'] : [];
}

function toMovieListResponse(data: Record<string, unknown>): MovieListResponse {
  if ((data as Record<string, unknown>).data) {
    return { status: true, items: parseItems(data), pagination: parsePagination(data) };
  }
  return data as unknown as MovieListResponse;
}
function withSourceMetadata(
  result: MovieListResponse,
  sourceSite: string,
  sourceName: string,
): MovieListResponse {
  return {
    ...result,
    items: (result.items ?? []).map((item) => ({
      ...item,
      source_site: item.source_site || sourceSite,
      source_name: item.source_name || sourceName,
      ophim_id: item.ophim_id || item._id || '',
    })),
  };
}
function withFilteredItemsPagination(
  result: MovieListResponse,
  filteredItems: MovieListResponse['items'],
  page: number,
): MovieListResponse {
  const sourcePagination = result.pagination ?? {
    currentPage: page,
    totalItems: 0,
    totalItemsPerPage: 24,
    totalPages: 1,
  };
  const totalItemsPerPage = sourcePagination.totalItemsPerPage || 24;
  const totalItems = Math.max(sourcePagination.totalItems ?? 0, filteredItems.length);
  const inferredTotalPages = totalItems > 0 ? Math.ceil(totalItems / totalItemsPerPage) : 1;

  return {
    ...result,
    items: filteredItems,
    pagination: {
      ...sourcePagination,
      currentPage: sourcePagination.currentPage || page,
      totalItems,
      totalItemsPerPage,
      totalPages: Math.max(sourcePagination.totalPages ?? 1, inferredTotalPages, 1),
    },
  };
}
/* ════════════════════════════════════════════
   API functions  (giữ signatures, dùng cache tiered)
   ════════════════════════════════════════════ */
function sortListItems(
  items: MovieListResponse['items'],
  sortField?: string,
  sortType: 'asc' | 'desc' = 'desc',
): MovieListResponse['items'] {
  if (!sortField) return items;
  const direction = sortType === 'asc' ? 1 : -1;
  const valueOf = (item: MovieListResponse['items'][number]): number => {
    if (sortField === 'year') return Number(item.year) || 0;
    if (sortField === 'modified.time') return new Date(item.modified?.time ?? 0).getTime() || 0;
    return 0;
  };
  return [...items].sort((a, b) => (valueOf(a) - valueOf(b)) * direction);
}

const SUPABASE_LIST_SELECT = 'id, slug, name, origin_name, title_vi, title_en, title_zh, title_original, normalized_name, thumb_url, poster_url, type, year, quality, lang, episode_current, episode_total, current_episode, total_episodes, schedule_type, release_time, release_day, schedule_timezone, category, country, chieurap, is_published, updated_at, created_at, ophim_id, tmdb_id, source_site, source_name, release_at, next_episode_at, next_episode_name, schedule_note';
const SUPABASE_LIST_PAGE_SIZE = 36;

function typeFilterValues(type?: string): string[] {
  if (!type || type === 'phim-moi-cap-nhat') return [];
  if (type === 'phim-chieu-rap') return [];
  if (type === 'phim-le') return ['single', 'phim-le'];
  if (type === 'phim-bo') return ['series', 'phim-bo'];
  if (type === 'hoat-hinh') return ['hoathinh'];
  if (type === 'tv-shows') return ['tvshows', 'tv-shows'];
  return [type];
}

async function fetchMoviesFromSupabaseList(params: {
  type?: string;
  category?: string;
  country?: string;
  year?: string;
  page?: number;
  keyword?: string;
  sortField?: string;
  sortType?: 'asc' | 'desc';
}): Promise<MovieListResponse | null> {
  if (!ENABLE_SUPABASE_TEXT_SEARCH) return null;
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * SUPABASE_LIST_PAGE_SIZE;
  const to = from + SUPABASE_LIST_PAGE_SIZE - 1;

  try {
    const needsExactCount = Boolean(
      params.type || params.category || params.country || params.year || params.keyword?.trim()
    );
    let query = supabase
      .from('movies')
      .select(SUPABASE_LIST_SELECT, { count: needsExactCount ? 'exact' : 'estimated' })
      .eq('is_published', true);

    if (params.type === 'phim-chieu-rap') {
      query = query.eq('chieurap', true);
    }

    const typeValues = typeFilterValues(params.type);
    if (typeValues.length === 1) {
      query = query.eq('type', typeValues[0]);
    } else if (typeValues.length > 1) {
      query = query.in('type', typeValues);
    }

    if (params.category) query = query.filter('category', 'cs', JSON.stringify([{ slug: params.category }]));
    if (params.country) query = query.filter('country', 'cs', JSON.stringify([{ slug: params.country }]));
    if (params.year) query = query.eq('year', Number(params.year));
    if (params.keyword?.trim()) {
      const safeKw = escapePostgrestIlike(params.keyword.trim());
      const normalizedKw = escapePostgrestIlike(normalizeSearchText(params.keyword.trim()));
      query = query.or([
        `name.ilike.%${safeKw}%`,
        `origin_name.ilike.%${safeKw}%`,
        `title_vi.ilike.%${safeKw}%`,
        `title_en.ilike.%${safeKw}%`,
        `slug.ilike.%${normalizedKw.replace(/\s+/g, '-')}%`,
        `normalized_name.ilike.%${normalizedKw}%`,
      ].join(','));
    }

    const ascending = params.sortType === 'asc';
    if (params.sortField === 'year') {
      query = query
        .order('year', { ascending, nullsFirst: false })
        .order('updated_at', { ascending: false, nullsFirst: false });
    } else {
      query = query.order('updated_at', { ascending, nullsFirst: false });
    }
    query = query.range(from, to);
    const response = await Promise.race([
      query,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6500)),
    ]);
    if (!response) return null;
    const { data, count, error } = response;
    if (error || !data || data.length === 0) return null;

    const items = await enrichMoviesWithSupabaseEpisodeCounts(sortListItems(
      (data as Record<string, unknown>[]).map(toSupabaseMovieItem),
      params.sortField,
      params.sortType,
    ).filter((item) => (item.episode_current ?? '').toLowerCase().trim() !== 'trailer'));
    const totalItems = count ?? items.length;

    return {
      status: true,
      items,
      pagination: {
        currentPage: page,
        totalItems,
        totalItemsPerPage: SUPABASE_LIST_PAGE_SIZE,
        totalPages: Math.max(1, Math.ceil(totalItems / SUPABASE_LIST_PAGE_SIZE)),
      },
    };
  } catch {
    return null;
  }
}

export async function fetchNewMovies(page = 1): Promise<MovieListResponse> {
  const supabaseResult = await fetchMoviesFromSupabaseList({ page, sortField: 'modified.time', sortType: 'desc' });
  if (supabaseResult) return supabaseResult;
  return fetchNewMoviesMultiSource(page);
}

export async function fetchLatestReleaseMovies(page = 1): Promise<MovieListResponse> {
  const supabaseResult = await fetchMoviesFromSupabaseList({ page, sortField: 'year', sortType: 'desc' });
  if (supabaseResult) return supabaseResult;
  const result = await fetchNewMoviesMultiSource(page);
  return {
    ...result,
    items: sortListItems(result.items ?? [], 'year', 'desc'),
  };
}

export async function fetchMoviesByType(
  type: string,
  page = 1,
  sortField?: string,
  sortType: 'asc' | 'desc' = 'desc'
): Promise<MovieListResponse> {
  const supabaseResult = await fetchMoviesFromSupabaseList({ type, page, sortField, sortType });
  if (supabaseResult) return supabaseResult;

  const q = new URLSearchParams({ page: String(page) });
  if (sortField) { q.set('sort_field', sortField); q.set('sort_type', sortType); }

  // OPTIMIZED: chỉ gọi 2 nguồn chính + 1 mirror
  const urls = [
    `https://ophim1.com/v1/api/danh-sach/${type}?${q}`,
    `https://ophim.tv/v1/api/danh-sach/${type}?${q}`,
    `https://phimapi.com/v1/api/danh-sach/${type}?${q}`,
  ];

  const promises = urls.map((url) =>
    fetchJSON<Record<string, unknown>>(url, 6000)
      .then(toMovieListResponse)
      .then((res) => ((res.items?.length ?? 0) > 0 && isExpectedPage(res, page) ? res : null))
      .catch(() => null)
  );

  const result = await raceFirstValidWithTimeout(promises, 6000);
  if (result) {
    // Filter out trailer-only items from list endpoints
    const filteredItems = (result.items ?? []).filter(
      (item) => (item.episode_current ?? '').toLowerCase().trim() !== 'trailer'
    );
    return withFilteredItemsPagination(result, sortListItems(filteredItems, sortField, sortType), page);
  }

  // All failed — return empty
  return { status: false, items: [], pagination: { currentPage: page, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 } };
}

export async function fetchMoviesByCategory(params: {
  type?: string;
  category?: string;
  country?: string;
  year?: string;
  page?: number;
  keyword?: string;
  sortField?: string;
  sortType?: 'asc' | 'desc';
}): Promise<MovieListResponse> {
  const supabaseResult = await fetchMoviesFromSupabaseList(params);
  if (supabaseResult) return supabaseResult;

  const q = new URLSearchParams();
  if (params.category)  q.set('category', params.category);
  if (params.country)   q.set('country', params.country);
  if (params.year)      q.set('year', params.year);
  if (params.keyword)   q.set('keyword', params.keyword);
  if (params.sortField) { q.set('sort_field', params.sortField); q.set('sort_type', params.sortType ?? 'desc'); }
  q.set('page', String(params.page ?? 1));
  const type = params.type ?? 'phim-moi-cap-nhat';

  // OPTIMIZED: chỉ 3 nguồn chính
  const urls = [
    `https://ophim1.com/v1/api/danh-sach/${type}?${q}`,
    `https://ophim.tv/v1/api/danh-sach/${type}?${q}`,
    `https://phimapi.com/v1/api/danh-sach/${type}?${q}`,
  ];

  const promises = urls.map((url) =>
    fetchJSON<Record<string, unknown>>(url, 6000)
      .then(toMovieListResponse)
      .then((res) => ((res.items?.length ?? 0) > 0 && isExpectedPage(res, params.page ?? 1) ? res : null))
      .catch(() => null)
  );

  const result = await raceFirstValidWithTimeout(promises, 6000);
  if (result) {
    // Filter out trailer-only items from list endpoints
    const filteredItems = (result.items ?? []).filter(
      (item) => (item.episode_current ?? '').toLowerCase().trim() !== 'trailer'
    );
    return withFilteredItemsPagination(result, sortListItems(filteredItems, params.sortField, params.sortType), params.page ?? 1);

  }

  return { status: false, items: [], pagination: { currentPage: params.page ?? 1, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 } };
}

export async function searchMovies(keyword: string, page = 1, signal?: AbortSignal): Promise<MovieListResponse> {
  const kw = keyword.trim();
  if (!kw) {
    return { status: true, items: [], pagination: { currentPage: 1, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 } };
  }

  const fallbackApiData: MovieListResponse = {
    status: true,
    items: [],
    pagination: { currentPage: page, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 },
  };
  const supabaseItems = await searchMoviesInSupabase(kw, { limit: 36, timeoutMs: 1600, minLength: 2, signal }).catch(() => []);
  const queerIntent = page === 1 && isQueerSearchIntent(kw);
  const needsExternal = page > 1 || supabaseItems.length < 10 || queerIntent;
  const [apiResult, queerResult] = needsExternal
    ? await Promise.allSettled([
        searchMoviesMultiSource(kw, page, signal),
        page === 1
          ? searchQueerUniverseMovies(kw, { limit: 24, timeoutMs: queerIntent ? 1800 : 1200, minLength: 2, signal })
          : Promise.resolve([]),
      ])
    : [
        { status: 'fulfilled', value: fallbackApiData } as PromiseFulfilledResult<MovieListResponse>,
        { status: 'fulfilled', value: [] } as PromiseFulfilledResult<MovieItem[]>,
      ];

  const apiData = apiResult.status === 'fulfilled' ? apiResult.value : fallbackApiData;
  const queerItems = queerResult.status === 'fulfilled' ? queerResult.value : [];
  const aliasItems = page === 1 && supabaseItems.length === 0
    ? await searchMoviesByAliasInSupabase(kw, { limit: 12 }).catch(() => [])
    : [];
  const items = sortMoviesForSearch(
    mergeMoviesUnique([...(page === 1 ? queerItems : []), ...aliasItems, ...supabaseItems, ...(apiData.items ?? [])]),
    kw,
    'relevance',
  );
  const apiPagination = apiData.pagination ?? { currentPage: page, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 };
  const totalItemsPerPage = apiPagination.totalItemsPerPage || 24;
  const totalItems = Math.max(apiPagination.totalItems ?? 0, items.length);

  return {
    status: true,
    items,
    pagination: {
      ...apiPagination,
      currentPage: page,
      totalItems,
      totalItemsPerPage,
      totalPages: Math.max(
        apiPagination.totalPages ?? 1,
        totalItems > 0 ? Math.ceil(totalItems / totalItemsPerPage) : 1,
        items.length >= totalItemsPerPage ? page + 1 : page,
      ),
    },
  };
}

/* ════════════════════════════════════════════
   Promise.allSettled with timeout — trả về kết quả partial sau timeout
   ════════════════════════════════════════════ */
function promiseAllSettledWithTimeout<T>(promises: Promise<T>[], timeoutMs: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(promises.length).fill({ status: 'rejected', reason: new Error('timeout') } as PromiseRejectedResult);
  let resolvedCount = 0;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(results), timeoutMs);

    promises.forEach((p, i) => {
      p.then(
        (value) => { results[i] = { status: 'fulfilled', value }; resolvedCount++; },
        (reason) => { results[i] = { status: 'rejected', reason }; resolvedCount++; }
      ).finally(() => {
        if (resolvedCount === promises.length) {
          clearTimeout(timer);
          resolve(results);
        }
      });
    });
  });
}

/* ════════════════════════════════════════════
   MOVIE DETAIL — EDGE FUNCTION PROXY (production CORS bypass)
   ════════════════════════════════════════════ */
const FALLBACK_SUPABASE_URL = 'https://dzpddbthdeqbkrcjlzap.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_Mqk6aVxJjetKY8St_20QWA_Wc2zxBd0';
const SUPABASE_URL = typeof import.meta.env !== 'undefined'
  ? ((import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined) ||
     (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
     FALLBACK_SUPABASE_URL)
  : FALLBACK_SUPABASE_URL;
const SUPABASE_ANON_KEY = typeof import.meta.env !== 'undefined'
  ? ((import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
     (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
     FALLBACK_SUPABASE_ANON_KEY)
  : FALLBACK_SUPABASE_ANON_KEY;

const ENABLE_SUPABASE_TEXT_SEARCH =
  typeof import.meta.env === 'undefined' || import.meta.env.VITE_DISABLE_SUPABASE_TEXT_SEARCH !== 'true';
const ENABLE_SUPABASE_SEARCH_RPC =
  typeof import.meta.env !== 'undefined' && import.meta.env.VITE_ENABLE_SUPABASE_SEARCH_RPC === 'true';
async function fetchMovieDetailFromProxy(slug: string, forceRefresh = false): Promise<MovieDetailResponse | null> {
  if (!SUPABASE_URL) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const url = new URL(`${SUPABASE_URL}/functions/v1/movie-detail-proxy`);
    url.searchParams.set('slug', slug);
    if (forceRefresh) url.searchParams.set('refresh', '1');
    const res = await fetch(
      url.toString(),
      {
        signal: controller.signal,
        cache: 'no-store',
      
      }
    );
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[movieApi] Proxy returned ${res.status} for slug=${slug}`);
      return null;
    }
    const data = await res.json() as MovieDetailResponse;
    if (!data?.movie?.slug && !data?.movie?.name) return null;
    return data;
  } catch (e) {
    if (!isAbortLikeError(e)) console.warn('[movieApi] Proxy fetch failed:', e);
    return null;
  }
}

/* ════════════════════════════════════════════
   PARSE OPhim / compatible detail payload
   Supports multiple formats: OPhim v1, flat, phimapi, KKPhim
   fallbackSlug: dùng khi API trả về movie data nhưng không có slug field
   ════════════════════════════════════════════ */
function parseMovieDetailPayload(payload: Record<string, unknown>, fallbackSlug?: string): MovieDetailResponse | null {
  // Try multiple paths to find movie data
  let movieRaw: Record<string, unknown> | undefined;
  let episodesRaw: unknown[] | undefined;

  // Format 1: flat { movie, episodes }
  if (payload.movie && typeof payload.movie === 'object' && !Array.isArray(payload.movie)) {
    movieRaw = payload.movie as Record<string, unknown>;
    episodesRaw = Array.isArray(payload.episodes) ? (payload.episodes as unknown[]) : undefined;
  }

  // Format 2: nested { data: { movie, episodes } } — OPhim v1
  const dataPayload = (payload.data as Record<string, unknown>) || payload;
  if (!movieRaw && dataPayload.movie && typeof dataPayload.movie === 'object' && !Array.isArray(dataPayload.movie)) {
    movieRaw = dataPayload.movie as Record<string, unknown>;
    episodesRaw = Array.isArray(dataPayload.episodes) ? (dataPayload.episodes as unknown[]) : undefined;
  }

  // Format 3: nested { data: { item: { movie, episodes } } } — some APIs
  const itemPayload = (dataPayload.item as Record<string, unknown>) || dataPayload;
  if (!movieRaw && itemPayload.movie && typeof itemPayload.movie === 'object' && !Array.isArray(itemPayload.movie)) {
    movieRaw = itemPayload.movie as Record<string, unknown>;
    episodesRaw = Array.isArray(itemPayload.episodes) ? (itemPayload.episodes as unknown[]) : undefined;
  }
// Format 3b: OPhim v1 detail { data: { item: { ...movie, episodes } } }
  if (
    !movieRaw &&
    dataPayload.item &&
    typeof dataPayload.item === 'object' &&
    !Array.isArray(dataPayload.item)
  ) {
    const flatItem = dataPayload.item as Record<string, unknown>;
    if (flatItem.slug || flatItem.name || flatItem._id || flatItem.id) {
      movieRaw = flatItem;
      episodesRaw = Array.isArray(flatItem.episodes) ? (flatItem.episodes as unknown[]) : undefined;
    }
  }

  // Format 4: { data: { items: [{ ...movie data merged... }] } } — rare list-in-detail
  const itemsPayload = (dataPayload.items as unknown[]) || (payload.items as unknown[]);
  if (!movieRaw && Array.isArray(itemsPayload) && itemsPayload.length > 0) {
    const first = itemsPayload[0] as Record<string, unknown>;
    if (first && first.slug) {
      movieRaw = first;
      episodesRaw = Array.isArray(first.episodes) ? (first.episodes as unknown[]) : undefined;
    }
  }

  // Accept if we have movie name or id — slug is not mandatory (use fallback)
  if (!movieRaw || (!movieRaw.slug && !movieRaw.name && !movieRaw._id && !movieRaw.id)) return null;

  const episodesArray: Record<string, unknown>[] = [];
  if (episodesRaw) {
    for (const srv of episodesRaw) {
      if (srv && typeof srv === 'object') {
        episodesArray.push(srv as Record<string, unknown>);
      }
    }
  }

  const movie: MovieDetail = {
    _id: String(movieRaw._id ?? movieRaw.id ?? ''),
    name: String(movieRaw.name ?? ''),
    slug: String(movieRaw.slug ?? fallbackSlug ?? ''),
    origin_name: String(movieRaw.origin_name ?? ''),
    content: String(movieRaw.content ?? ''),
    type: String(movieRaw.type ?? 'phim-le'),
    status: String(movieRaw.status ?? 'completed'),
    thumb_url: String(movieRaw.thumb_url ?? ''),
    poster_url: String(movieRaw.poster_url ?? ''),
    is_copyright: Boolean(movieRaw.is_copyright ?? false),
    sub_docquyen: Boolean(movieRaw.sub_docquyen ?? false),
    chieurap: Boolean(movieRaw.chieurap ?? false),
    trailer_url: String(movieRaw.trailer_url ?? ''),
    time: String(movieRaw.time ?? ''),
    episode_current: String(movieRaw.episode_current ?? ''),
    episode_total: String(movieRaw.episode_total ?? ''),
    quality: String(movieRaw.quality ?? 'HD'),
    lang: String(movieRaw.lang ?? 'Vietsub'),
    notify: String(movieRaw.notify ?? ''),
    showtimes: String(movieRaw.showtimes ?? ''),
    year: Number(movieRaw.year ?? 0),
    view: Number(movieRaw.view ?? 0),
    ophim_id: String(movieRaw._id ?? movieRaw.id ?? ''),
    modified: { time: new Date().toISOString() },
    actor: Array.isArray(movieRaw.actor) ? (movieRaw.actor as string[]) : [],
    director: Array.isArray(movieRaw.director) ? (movieRaw.director as string[]) : [],
    category: normalizeTaxonomy<MovieCategory>(movieRaw.category),
    country: normalizeTaxonomy<MovieCountry>(movieRaw.country), 
  };

  const episodes: EpisodeServer[] = episodesArray
    .map((srv) => {
      const serverName = String(srv.server_name ?? srv.name ?? 'Nguồn');
      const serverDataRaw = Array.isArray(srv.server_data) ? (srv.server_data as Record<string, unknown>[]) : [];
      const server_data: EpisodeData[] = serverDataRaw
        .map((ep) => ({
          name: String(ep.name ?? ''),
          slug: String(ep.slug ?? ''),
          filename: String(ep.filename ?? ''),
          link_embed: normalizeDailymotionUrl(String(ep.link_embed ?? '')),
          link_m3u8: String(ep.link_m3u8 ?? ''),
          subtitle_url: String(ep.subtitle_url ?? ep.subtitle ?? ''),
        }))
        .filter((ep) => hasPlayableUrl(ep));

      if (!server_data.length) return null;
      return { server_name: serverName, server_data };
    })
    .filter(Boolean) as EpisodeServer[];

  return { status: true, movie, episodes };
}

/* ════════════════════════════════════════════
   MOVIE DETAIL — OPHIM DIRECT (SOURCE OF TRUTH)
   Bypass ALL caches — always fetch fresh.
   OPTIMIZED: chỉ gọi 2 mirrors nhanh nhất
   ════════════════════════════════════════════ */
async function fetchMovieDetailFromOPhim(slug: string, allowSearchFallback = true): Promise<MovieDetailResponse | null> {
  const urls = [
    `https://ophim1.com/v1/api/phim/${encodeURIComponent(slug)}`,
    `https://ophim.tv/v1/api/phim/${encodeURIComponent(slug)}`,
  ];

  // ── Fetch ALL mirrors IN PARALLEL — winner is first valid response ──
  const controllers = urls.map(() => new AbortController());
  const timeout = 4500; // keep detail page responsive when mirrors are slow

  const mirrorPromises = urls.map(async (url, idx) => {
    const ctrl = controllers[idx];
    const timer = setTimeout(() => { try { ctrl.abort(); } catch { /* noop */ } }, timeout);
    try {
      const data = await fetchDetailRaw(url, timeout, 0);
      if (!data) return null;

      const topLevel = data as Record<string, unknown>;
      const payload = (topLevel.data as Record<string, unknown>) || topLevel;
      // Use the requested slug as fallback if API omits slug field
      const result = parseMovieDetailPayload(payload, slug);
      if (result?.movie?._id || result?.movie?.name) {
        // API /phim/${slug} trả về HTTP 200 + movie data → tin tưởng đây là phim đó
        // Chỉ log warn nếu slug mismatch để debug, không reject
        const ophimSlug = String(result.movie.slug || '').trim().toLowerCase().normalize('NFC');
        const expectedSlug = slug.trim().toLowerCase().normalize('NFC');
        if (ophimSlug && ophimSlug !== expectedSlug) {
          console.warn(
            `[fetchMovieDetailFromOPhim] Slug mismatch (accepted): expected "${expectedSlug}" got "${ophimSlug}" from ${new URL(url).hostname}`
          );
        }
        return result;
      }
    } catch (err) {
      console.warn('[fetchMovieDetailFromOPhim] Mirror failed:', new URL(url).hostname, (err as Error).message);
    } finally {
      clearTimeout(timer);
    }
    return null;
  });

  const winner = await raceFirstValidWithTimeout(mirrorPromises, timeout + 500);
  if (winner) {
    // Cancel remaining pending requests
    controllers.forEach((c) => { try { c.abort(); } catch { /* noop */ } });
    return winner;
  }

  // ── Final fallback: search OPhim to discover correct slug ──
  if (allowSearchFallback) {
    const foundSlug = await searchOphimForSlug(slug);
    if (foundSlug) {
      const foundNormalized = foundSlug.trim().toLowerCase().normalize('NFC');
      const expectedNormalized = slug.trim().toLowerCase().normalize('NFC');
      if (foundNormalized !== expectedNormalized) {
        console.warn(`[fetchMovieDetailFromOPhim] Search found different slug "${foundSlug}" for "${slug}" — retrying detail`);
        return fetchMovieDetailFromOPhim(foundSlug, false);
      }
    }
  }

  console.warn('[fetchMovieDetailFromOPhim] ALL OPhim mirrors failed or rejected for slug:', slug);
  return null;
}

/* ════════════════════════════════════════════
   OPHIM SEARCH FALLBACK — find correct slug when detail 404
   ════════════════════════════════════════════ */
async function searchOphimForSlug(keyword: string): Promise<string | null> {
  const urls = [
    `https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=1`,
    `https://ophim.tv/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=1`,
  ];
  const promises = urls.map(async (url) => {
    try {
      const data = await fetchDetailRaw(url, 3500, 0);
      const d = data as Record<string, unknown>;
      const items = (d?.data as Record<string, unknown>)?.items ?? d?.items ?? [];
      if (Array.isArray(items) && items.length > 0) {
        const first = items[0] as Record<string, unknown>;
        if (first.slug) return String(first.slug);
      }
    } catch { /* ignore */ }
  return null;
  });
  return raceFirstValidWithTimeout(promises, 4000);
}

async function searchOphimCandidates(keyword: string, limit = 8): Promise<Record<string, unknown>[]> {
  const urls = [
    `https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=${limit}`,
    `https://ophim.tv/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=${limit}`,
  ];
  const promises = urls.map(async (url) => {
    try {
      const data = await fetchDetailRaw(url, 3500, 0);
      const d = data as Record<string, unknown>;
      const items = (d?.data as Record<string, unknown>)?.items ?? d?.items ?? [];
      return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  });
  const result = await raceFirstValidWithTimeout(
    promises.map((promise) => promise.then((items) => (items.length ? items : null))),
    4000
  );
  return result ?? [];
}

function getComparableMovieNames(movie?: Partial<MovieDetail> | Partial<MovieItem> | null): string[] {
  if (!movie) return [];
  const record = movie as Record<string, unknown>;
  return [
    movie.name,
    movie.origin_name,
    (movie as Partial<MovieItem>).title_vi,
    (movie as Partial<MovieItem>).title_en,
    (movie as Partial<MovieItem>).title_zh,
    record.title_original,
  ]
    .map((value) => normalizeMatchText(String(value || '')))
    .filter(Boolean);
}

function movieNamesMatchExactly(
  source?: Partial<MovieDetail> | Partial<MovieItem> | null,
  candidate?: Partial<MovieDetail> | Partial<MovieItem> | Record<string, unknown> | null
): boolean {
  const sourceNames = new Set(getComparableMovieNames(source));
  if (!sourceNames.size || !candidate) return false;
  return getComparableMovieNames(candidate as Partial<MovieDetail> | Partial<MovieItem>).some((name) => sourceNames.has(name));
}

function markOphimServers(detail: MovieDetailResponse | null): MovieDetailResponse | null {
  if (!detail) return null;
  return {
    ...detail,
    episodes: (detail.episodes ?? []).map((server) => {
      const rawName = server.server_name || 'OPhim';
      const serverName = normalizeServerPriorityText(rawName).includes('OPHIM') ? rawName : `OPhim - ${rawName}`;
      return {
        ...server,
        server_name: serverName,
      };
    }),
  };
}

/* ════════════════════════════════════════════
   MOVIE DETAIL — SUPABASE MASTER (STORAGE)
   Robust slug matching: exact → NFC normalized → ilike fallback
   ════════════════════════════════════════════ */
const MOVIE_DETAIL_SELECT = [
  'id',
  'slug',
  'name',
  'title_vi',
  'title_en',
  'origin_name',
  'content',
  'type',
  'status',
  'thumb_url',
  'poster_url',
  'trailer_url',
  'time',
  'episode_current',
  'episode_total',
  'current_episode',
  'total_episodes',
  'schedule_type',
  'release_time',
  'release_day',
  'schedule_timezone',
  'quality',
  'lang',
  'year',
  'actor',
  'director',
  'category',
  'country',
  'notify',
  'showtimes',
  'release_at',
  'next_episode_at',
  'next_episode_name',
  'schedule_note',
  'view',
  'ophim_id',
  'ophim_slug',
  'source_site',
  'source_name',
  'created_at',
  'updated_at',
].join(',');

async function fetchMovieDetailFromSupabase(
  slug: string,
  timeoutMs = 3500,
  options: { includeLiveFallbacks?: boolean } = {}
): Promise<MovieDetailResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;
  try {
    const normalizedSlug = slug.normalize('NFC');
    const urlDecodedSlug = decodeURIComponent(slug);

    let movie: Record<string, unknown> | null = null;

    // 1. Try exact match with multiple slug variants (published only)
    const slugVariants = Array.from(new Set([slug, normalizedSlug, urlDecodedSlug]));
    for (const variant of slugVariants) {
      const { data, error } = await supabase
        .from('movies')
        .select(MOVIE_DETAIL_SELECT)
        .eq('slug', variant)
        .eq('is_published', true)
        .abortSignal(signal)
        .maybeSingle();
      if (!error && data) {
        movie = data as unknown as Record<string, unknown>;
        break;
      }
    }

    // 1b. Try ophim_slug exact match (critical for OPhim-sourced movies)
    if (!movie) {
      const { data, error } = await supabase
        .from('movies')
        .select(MOVIE_DETAIL_SELECT)
        .eq('ophim_slug', slug)
        .eq('is_published', true)
        .abortSignal(signal)
        .maybeSingle();
      if (!error && data) {
        movie = data as unknown as Record<string, unknown>;
      }
    }

    // 1c. Try ophim_slug with decoded variants
    if (!movie) {
      const ophimVariants = Array.from(new Set([urlDecodedSlug, normalizedSlug])).filter((variant) => variant !== slug);
      for (const variant of ophimVariants) {
        const { data, error } = await supabase
          .from('movies')
          .select(MOVIE_DETAIL_SELECT)
          .eq('ophim_slug', variant)
          .eq('is_published', true)
          .abortSignal(signal)
          .maybeSingle();
        if (!error && data) {
          movie = data as unknown as Record<string, unknown>;
          break;
        }
      }
    }

    // 2. Fallback: ilike on slug / normalized_name / name / origin_name / titles.
    // Keep this disabled for very short slugs such as "wu", "up", "it"; otherwise
    // a detail URL can accidentally open an unrelated movie that merely contains the term.
    const canUseLooseDetailFallback = normalizeMatchText(urlDecodedSlug).replace(/\s+/g, '').length >= 4;
    if (!movie && canUseLooseDetailFallback) {
      const safeSlug = slug.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const { data, error } = await supabase
        .from('movies')
        .select(MOVIE_DETAIL_SELECT)
        .or(`slug.ilike.%${safeSlug}%,normalized_name.ilike.%${safeSlug}%,name.ilike.%${safeSlug}%,origin_name.ilike.%${safeSlug}%,title_vi.ilike.%${safeSlug}%,title_en.ilike.%${safeSlug}%`)
        .eq('is_published', true)
        .limit(1)
        .abortSignal(signal)
        .maybeSingle();
      if (!error && data) {
        movie = data as unknown as Record<string, unknown>;
      }
    }

    if (!movie) {
      console.warn(`[fetchMovieDetailFromSupabase] No movie found for slug: "${slug}" (tried ${slugVariants.join(', ')})`);
      return null;
    }

    const m = movie;
    const movieId = m.id as string;
    if (!movieId) return null;

    let episodeServers: EpisodeServer[] = [];
    try {
      const merged = await getMergedEpisodes(movieId, signal, {
        includeLiveFallbacks: options.includeLiveFallbacks ?? false,
      });
      episodeServers = merged.episodeServers;
    } catch { /* ignore */ }

    const movieName = getMovieDisplayName({
      name: String(m.name || ''),
      title_vi: String(m.title_vi || ''),
      title_en: String(m.title_en || ''),
      origin_name: String(m.origin_name || ''),
    });

    const movieDetail: MovieDetail = {
        _id: String(m.id || ''),
        name: movieName,
        slug: String(m.slug || ''),
        origin_name: String(m.origin_name || ''),
        content: String(m.content || ''),
        type: String(m.type || 'phim-le'),
        status: String(m.status || 'completed'),
        thumb_url: String(m.thumb_url || ''),
        poster_url: String(m.poster_url || ''),
        trailer_url: String(m.trailer_url || ''),
        time: String(m.time || ''),
        episode_current: String(m.episode_current || ''),
        episode_total: String(m.episode_total || ''),
        current_episode: Number(m.current_episode || 0) || undefined,
        total_episodes: Number(m.total_episodes || 0) || undefined,
        schedule_type: (m.schedule_type as MovieDetail['schedule_type']) || '',
        release_time: String(m.release_time || ''),
        release_day: m.release_day === null || m.release_day === undefined ? undefined : Number(m.release_day),
        schedule_timezone: String(m.schedule_timezone || ''),
        quality: String(m.quality || 'HD'),
        lang: String(m.lang || 'Vietsub'),
        year: Number(m.year || 0),
        actor: Array.isArray(m.actor) ? (m.actor as string[]) : [],
        director: Array.isArray(m.director) ? (m.director as string[]) : [],
        category: normalizeTaxonomy<MovieCategory>(m.category),
        country: normalizeTaxonomy<MovieCountry>(m.country),
        notify: String(m.notify || ''),
        showtimes: String(m.showtimes || ''),
        release_at: String(m.release_at || ''),
        next_episode_at: String(m.next_episode_at || ''),
        next_episode_name: String(m.next_episode_name || ''),
        schedule_note: String(m.schedule_note || ''),
        is_copyright: false,
        sub_docquyen: false,
        chieurap: false,
        view: Number(m.view || 0),
        ophim_id: String(m.ophim_id || ''),
        source_site: String(m.source_site || ''),
        source_name: String(m.source_name || ''),
        modified: { time: String(m.updated_at || m.created_at || new Date().toISOString()) },
      };

    return {
      status: true,
      movie: normalizeMovieEpisodeCounts(movieDetail, episodeServers),
      episodes: episodeServers,
    };
  } catch (e) {
    console.warn('[fetchMovieDetailFromSupabase] Exception:', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ════════════════════════════════════════════
   SUPABASE SEARCH — for navbar suggestions + search page
   ════════════════════════════════════════════ */
function escapePostgrestIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, ' ');
}

let supabaseSearchRpcUnavailable = false;

async function searchMoviesByAliasInSupabase(
  keyword: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<MovieItem[]> {
  if (!ENABLE_SUPABASE_TEXT_SEARCH || !SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const kw = keyword.trim();
  if (kw.length < 2) return [];

  const limit = options.limit ?? 12;
  const normalizedKw = normalizeSearchText(kw);
  const safeKw = escapePostgrestIlike(kw);
  const safeNormalizedKw = escapePostgrestIlike(normalizedKw);
  const safeSlugKw = escapePostgrestIlike(normalizedKw.replace(/\s+/g, '-'));
  const filters = Array.from(new Set([
    `origin_name.ilike.*${safeKw}*`,
    `title_en.ilike.*${safeKw}*`,
    `title_original.ilike.*${safeKw}*`,
    `normalized_name.ilike.*${safeKw}*`,
    `slug.ilike.*${safeSlugKw}*`,
    ...(safeNormalizedKw
      ? [
          `origin_name.ilike.*${safeNormalizedKw}*`,
          `title_en.ilike.*${safeNormalizedKw}*`,
          `title_original.ilike.*${safeNormalizedKw}*`,
          `normalized_name.ilike.*${safeNormalizedKw}*`,
          `normalized_name.ilike.*${safeSlugKw}*`,
        ]
      : []),
  ])).join(',');

  const url = new URL(`${SUPABASE_URL}/rest/v1/movies`);
  url.searchParams.set('select', 'id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,thumb_url,poster_url,type,year,quality,lang,episode_current,episode_total,current_episode,total_episodes,schedule_type,release_time,release_day,schedule_timezone,category,country,is_published,updated_at,ophim_id,tmdb_id,source_site,source_name,release_at,next_episode_at,next_episode_name,schedule_note');
  url.searchParams.set('is_published', 'eq.true');
  url.searchParams.set('or', `(${filters})`);
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', String(Math.max(limit, 12)));

  const response = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    signal: options.signal,
  });
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>[];
  if (!Array.isArray(data)) return [];
  return sortMoviesForSearch(
    mergeMoviesUnique((data as Record<string, unknown>[]).map(toSupabaseMovieItem)),
    kw,
    'relevance',
  ).slice(0, limit);
}

export async function searchMoviesInSupabase(
  keyword: string,
  options: { limit?: number; timeoutMs?: number; minLength?: number; signal?: AbortSignal } = {}
): Promise<MovieItem[]> {
  if (!ENABLE_SUPABASE_TEXT_SEARCH) return [];
  const kw = keyword.trim();
  const minLength = options.minLength ?? 4;
  if (!kw || kw.length < minLength) return [];
  const limit = options.limit ?? 24;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 2500);
  try {
    if (ENABLE_SUPABASE_SEARCH_RPC && !supabaseSearchRpcUnavailable) {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('search_movies_fast', {
          search_query: kw,
          result_limit: limit,
        })
        .abortSignal(controller.signal);

      if (!rpcError && Array.isArray(rpcData)) {
        const rpcMovies = sortMoviesForSearch(
          mergeMoviesUnique((rpcData as Record<string, unknown>[]).map(toSupabaseMovieItem)),
          kw,
          'relevance',
        ).slice(0, limit);
        if (rpcMovies.length > 0) return rpcMovies;
      }

      const message = (rpcError?.message ?? '').toLowerCase();
      if (
        rpcError?.code === 'PGRST202' ||
        rpcError?.code === '42883' ||
        message.includes('search_movies_fast') ||
        message.includes('function') ||
        message.includes('schema cache')
      ) {
        supabaseSearchRpcUnavailable = true;
      }
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      return [];
    }
  }

  const safeKw = escapePostgrestIlike(kw);
  const normalizedKw = normalizeSearchText(kw);
  const safeNormalizedKw = escapePostgrestIlike(normalizedKw);
  const safeSlugKw = escapePostgrestIlike(normalizedKw.replace(/\s+/g, '-'));
  const queryLimit = Math.max(limit * 4, 48);
  const queryTokens = Array.from(new Set(normalizedKw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 || /^\d+$/.test(token))
  )).slice(0, 8);
  const searchFilters = Array.from(new Set([
    `name.ilike.%${safeKw}%`,
    `origin_name.ilike.%${safeKw}%`,
    `title_vi.ilike.%${safeKw}%`,
    `title_en.ilike.%${safeKw}%`,
    `title_zh.ilike.%${safeKw}%`,
    `title_original.ilike.%${safeKw}%`,
    `slug.ilike.%${safeKw}%`,
    `normalized_name.ilike.%${safeKw}%`,
    ...(safeNormalizedKw
      ? [
          `normalized_name.ilike.%${safeNormalizedKw}%`,
          `normalized_name.ilike.%${safeSlugKw}%`,
          `slug.ilike.%${safeSlugKw}%`,
          `name.ilike.%${safeNormalizedKw}%`,
          `origin_name.ilike.%${safeNormalizedKw}%`,
          `title_vi.ilike.%${safeNormalizedKw}%`,
          `title_en.ilike.%${safeNormalizedKw}%`,
        ]
      : []),
  ])).join(',');
  try {
    const { data, error } = await supabase
      .from('movies')
      .select('id, slug, name, origin_name, title_vi, title_en, title_zh, title_original, normalized_name, thumb_url, poster_url, type, year, quality, lang, episode_current, episode_total, current_episode, total_episodes, schedule_type, release_time, release_day, schedule_timezone, category, country, is_published, updated_at, ophim_id, tmdb_id, source_site, source_name, release_at, next_episode_at, next_episode_name, schedule_note')
      .eq('is_published', true)
      .or(searchFilters)
      .order('updated_at', { ascending: false })
      .limit(queryLimit)
      .abortSignal(controller.signal);
    if (error || !data) {
      if (isAbortLikeError(error?.message)) return [];
      console.warn('[searchMoviesInSupabase] Error:', error?.message);
      return [];
    }
    const recordsById = new Map<string, Record<string, unknown>>();
    const addRecords = (rows: Record<string, unknown>[]) => {
      for (const row of rows) {
        const id = String(row.id || row.slug || '');
        if (id && !recordsById.has(id)) recordsById.set(id, row);
      }
    };
    addRecords(data as Record<string, unknown>[]);

    if (recordsById.size < Math.min(8, limit) && queryTokens.length >= 3) {
      const tokenFields = ['normalized_name', 'slug', 'title_en', 'origin_name', 'title_vi', 'name'];
      const tokenQueries = tokenFields.map(async (field) => {
        let query = supabase
          .from('movies')
          .select('id, slug, name, origin_name, title_vi, title_en, title_zh, title_original, normalized_name, thumb_url, poster_url, type, year, quality, lang, episode_current, episode_total, current_episode, total_episodes, schedule_type, release_time, release_day, schedule_timezone, category, country, is_published, updated_at, ophim_id, tmdb_id, source_site, source_name, release_at, next_episode_at, next_episode_name, schedule_note')
          .eq('is_published', true)
          .limit(Math.max(limit, 24))
          .abortSignal(controller.signal);

        for (const token of queryTokens) {
          query = query.ilike(field, `%${escapePostgrestIlike(token)}%`);
        }

        const { data: tokenData } = await query;
        return (tokenData ?? []) as Record<string, unknown>[];
      });

      const tokenResults = await Promise.allSettled(tokenQueries);
      for (const result of tokenResults) {
        if (result.status === 'fulfilled') addRecords(result.value);
      }
    }

    const baseItems = Array.from(recordsById.values()).map(toSupabaseMovieItem);
    try {
      const items = await enrichMoviesWithSupabaseEpisodeCounts(baseItems, controller.signal);
      return sortMoviesForSearch(mergeMoviesUnique(items), kw, 'relevance').slice(0, limit);
    } catch (enrichError) {
      if ((enrichError as Error)?.name !== 'AbortError') {
        console.warn('[searchMoviesInSupabase] Episode enrich skipped:', enrichError);
      }
      return sortMoviesForSearch(mergeMoviesUnique(baseItems), kw, 'relevance').slice(0, limit);
    }
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') {
      console.warn('[searchMoviesInSupabase] Exception:', e);
    }
    return [];
    } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromParent);
  }
}

const SUPABASE_SEARCH_INDEX_KEY = 'kp_supabase_search_index_v4';
const SUPABASE_SEARCH_INDEX_TTL = 30 * 60 * 1000;
let supabaseSearchIndexInflight: Promise<MovieItem[]> | null = null;
const supabaseSearchIndexMemory = new Map<string, { items: MovieItem[]; ts: number }>();

function writeSearchIndexCacheLater(cacheKey: string, items: MovieItem[]): void {
  const write = () => {
    try {
      setSmartSessionCache(cacheKey, JSON.stringify({ items, ts: Date.now() }));
    } catch { /* quota */ }
  };

  const idle = (globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  }).requestIdleCallback;

  if (typeof idle === 'function') {
    idle(write, { timeout: 2000 });
  } else {
    setTimeout(write, 250);
  }
}

export async function fetchSupabaseSearchIndex(options: { limit?: number; signal?: AbortSignal; persistentCache?: boolean } = {}): Promise<MovieItem[]> {
  if (!ENABLE_SUPABASE_TEXT_SEARCH) return [];
  const limit = options.limit ?? 3000;
  const usePersistentCache = options.persistentCache ?? true;
  const cacheKey = `${SUPABASE_SEARCH_INDEX_KEY}_${limit}`;
  const memoryCached = supabaseSearchIndexMemory.get(cacheKey);
  if (memoryCached && Date.now() - memoryCached.ts < SUPABASE_SEARCH_INDEX_TTL) {
    return memoryCached.items;
  }

  if (usePersistentCache) {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as { items: MovieItem[]; ts: number };
        if (Date.now() - cached.ts < SUPABASE_SEARCH_INDEX_TTL) {
          supabaseSearchIndexMemory.set(cacheKey, { items: cached.items, ts: cached.ts });
          return cached.items;
        }
      }
    } catch { /* ignore cache */ }
  }

  if (supabaseSearchIndexInflight) return supabaseSearchIndexInflight;

  supabaseSearchIndexInflight = (async () => {
    if (!SUPABASE_URL) return [];
    const url = new URL(`${SUPABASE_URL}/functions/v1/search-index-proxy`);
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url.toString(), {
      signal: options.signal,
      cache: 'force-cache',
    });
    if (!res.ok) return [];
    const data = await res.json() as { items?: Record<string, unknown>[] };
    const items = ((data.items ?? []) as Record<string, unknown>[]).map(toSupabaseMovieItem);
    supabaseSearchIndexMemory.set(cacheKey, { items, ts: Date.now() });
    if (usePersistentCache) writeSearchIndexCacheLater(cacheKey, items);
    return items;
  })().catch((e) => {
    if ((e as Error)?.name !== 'AbortError') {
      console.warn('[fetchSupabaseSearchIndex] Exception:', e);
    }
    return [];
  }).finally(() => {
    supabaseSearchIndexInflight = null;
  });

  return supabaseSearchIndexInflight;
}
const QUEER_UNIVERSE_TERMS = [
  'dam my',
  'đam mỹ',
  'boy love',
  'boys love',
  'bl',
  'bach hop',
  'bách hợp',
  'girl love',
  'girls love',
  'gl',
  'yuri',
  'lesbian',
];
const QUEER_SOURCE_TERMS = ['blvietsub', 'bl vietsub', 'bl-vietsub', 'vu tru dam my'];
const BLVIETSUB_SLUG_PREFIX = 'blvietsub-';
const QUEER_FALLBACK_URL = '/queer-fallback.json?v=202607041605';
const SUPABASE_QUEER_LIST_SELECT = 'id, slug, name, origin_name, title_vi, title_en, title_zh, title_original, thumb_url, poster_url, type, year, quality, lang, episode_current, episode_total, current_episode, total_episodes, schedule_type, release_time, release_day, schedule_timezone, time, category, country, is_published, updated_at, created_at, ophim_id, tmdb_id, source_site, source_name, release_at, next_episode_at, next_episode_name, schedule_note';
const BLVIETSUB_SEARCH_TERMS = [
  'bl',
  'boy love',
  'boys love',
  'dam my',
  'đam mỹ',
  'bach hop',
  'bách hợp',
  'gl',
  'girl love',
  'girls love',
  'lesbian',
  'yuri',
];

interface BloggerText {
  $t?: string;
}

interface BloggerLink {
  rel?: string;
  href?: string;
  title?: string;
}

interface BloggerCategory {
  term?: string;
}

interface BloggerEntry {
  id?: BloggerText;
  title?: BloggerText;
  content?: BloggerText;
  published?: BloggerText;
  updated?: BloggerText;
  category?: BloggerCategory[];
  link?: BloggerLink[];
  media$thumbnail?: { url?: string };
}

interface BloggerFeedResponse {
  feed?: { entry?: BloggerEntry[] };
  entry?: BloggerEntry;
}

function getBlvietsubFeedProxyUrl(params: { postId?: string; limit?: number; query?: string; startIndex?: number } = {}): string | null {
  if (!SUPABASE_URL) return null;
  const url = new URL(`${SUPABASE_URL}/functions/v1/blvietsub-feed-proxy`);
  if (params.postId) url.searchParams.set('postId', params.postId);
  if (params.limit) url.searchParams.set('maxResults', String(params.limit));
  if (params.startIndex) url.searchParams.set('startIndex', String(params.startIndex));
  if (params.query) url.searchParams.set('q', params.query);
  return url.toString();
}

function normalizeQueerSearchText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isQueerSearchIntent(keyword: string): boolean {
  const query = normalizeQueerSearchText(keyword).trim();
  if (!query) return false;
  return [...QUEER_UNIVERSE_TERMS, ...QUEER_SOURCE_TERMS].some((term) => {
    const normalized = normalizeQueerSearchText(term);
    return query === normalized || query.includes(normalized) || normalized.includes(query);
  });
}

function slugifyText(value: string): string {
  return normalizeQueerSearchText(value)
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function getBloggerPostId(entry: BloggerEntry): string {
  const id = entry.id?.$t ?? '';
  return id.match(/post-(\d+)/)?.[1] ?? '';
}

function getBloggerAlternateUrl(entry: BloggerEntry): string {
  return entry.link?.find((link) => link.rel === 'alternate')?.href ?? '';
}

function normalizeMatchText(value: string): string {
  return normalizeQueerSearchText(value)
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getEpisodeNumberFromText(value?: string): number {
  if (!value) return 0;
  const text = String(value).toLowerCase();
  if (text.includes('full')) return 1;
  const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slash) return Number(slash[1] || 0) || 0;
  const range = text.match(/(?:tap|ep|episode|tập)?\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
  if (range) return Number(range[2] || 0) || Number(range[1] || 0) || 0;
  const matches = [...text.matchAll(/(\d{1,4})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : 0;
}

function getEpisodeNumberFromData(ep: EpisodeData): number {
  const explicit = Number(ep.episode_number ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return getEpisodeNumberFromText(ep.slug) || getEpisodeNumberFromText(ep.name);
}

function getMaxEpisodeNumberFromServers(servers: EpisodeServer[] = []): number {
  return servers.reduce((max, server) => {
    return server.server_data.reduce((innerMax, ep) => Math.max(innerMax, getEpisodeNumberFromData(ep)), max);
  }, 0);
}

function getMaxEpisodeNumberFromServerData(serverData: unknown): number {
  const rows = Array.isArray(serverData)
    ? serverData
    : serverData && typeof serverData === 'object'
      ? [serverData]
      : [];
  return rows.reduce((max, item) => {
    const ep = item as Partial<EpisodeData> & { episode_number?: number | string };
    return Math.max(
      max,
      Number(ep.episode_number || 0) || 0,
      getEpisodeNumberFromText(ep.slug),
      getEpisodeNumberFromText(ep.name),
      getEpisodeNumberFromText(ep.filename),
    );
  }, 0);
}

function normalizeMovieEpisodeCounts<T extends MovieDetail | MovieItem>(movie: T, episodes: EpisodeServer[] = []): T {
  const maxEpisode = Math.max(
    getEpisodeNumberFromText(movie.current_episode ? String(movie.current_episode) : movie.episode_current),
    getMaxEpisodeNumberFromServers(episodes)
  );
  if (!maxEpisode) return movie;
  const total = Number(movie.total_episodes || 0) || getEpisodeNumberFromText(movie.episode_total);
  return {
    ...movie,
    episode_current: getEpisodeNumberFromText(movie.episode_current) >= maxEpisode ? movie.episode_current : `Tập ${maxEpisode}`,
    current_episode: maxEpisode,
    episode_total: total && total >= maxEpisode ? movie.episode_total : '',
    total_episodes: total && total >= maxEpisode ? total : undefined,
  };
}

function isQueerMovieDetail(movie?: Partial<MovieDetail> | Partial<MovieItem> | null): boolean {
  if (!movie) return false;
  const sourceSite = (movie as Partial<MovieItem>).source_site;
  const sourceName = (movie as Partial<MovieItem>).source_name;
  const haystack = normalizeQueerSearchText([
    movie.slug,
    sourceSite,
    sourceName,
    movie.showtimes,
    ...(movie.category ?? []).map((item) => item.name),
    ...(movie.category ?? []).map((item) => item.slug),
  ].filter(Boolean).join(' '));
  return haystack.includes('admin-queer') || haystack.includes('blvietsub') || haystack.includes('bl vietsub') || haystack.includes('vu tru dam my');
}

function isBlvietsubMovie(movie?: Partial<MovieDetail> | Partial<MovieItem> | null): boolean {
  if (!movie) return false;
  const sourceSite = (movie as Partial<MovieItem>).source_site;
  const sourceName = (movie as Partial<MovieItem>).source_name;
  const haystack = normalizeQueerSearchText([
    movie.slug,
    sourceSite,
    sourceName,
    movie.showtimes,
  ].filter(Boolean).join(' '));
  return haystack.includes('blvietsub') || haystack.includes('bl vietsub');
}

function buildBlvietsubDetail(entry: BloggerEntry): MovieDetailResponse | null {
  const item = bloggerEntryToMovieItem(entry);
  if (!item) return null;
  const content = entry.content?.$t ?? '';
  return {
    status: true,
    movie: {
      _id: item._id,
      name: item.name,
      slug: item.slug,
      origin_name: item.origin_name,
      content: item.content || '',
      type: item.type,
      status: item.status || 'completed',
      thumb_url: item.thumb_url,
      poster_url: item.poster_url,
      is_copyright: false,
      sub_docquyen: false,
      chieurap: false,
      trailer_url: '',
      time: item.time,
      episode_current: item.episode_current,
      episode_total: item.episode_total || '',
      current_episode: getEpisodeNumberFromText(item.episode_current) || undefined,
      quality: item.quality,
      lang: item.lang,
      notify: '',
      showtimes: getBloggerAlternateUrl(entry),
      year: item.year,
      view: 0,
      actor: [],
      director: [],
      category: item.category,
      country: item.country,
      modified: item.modified,
    },
    episodes: parseBlvietsubEpisodesByHost(content),
  };
}

function mergeEpisodeServers(primary: EpisodeServer[] = [], secondary: EpisodeServer[] = []): EpisodeServer[] {
  const merged: EpisodeServer[] = primary.map((server) => ({
    server_name: server.server_name,
    server_data: [...(server.server_data ?? [])],
  }));
  const seen = new Set<string>();
  for (const server of merged) {
    for (const ep of server.server_data) {
      const epNum = getEpisodeNumberFromData(ep);
      seen.add(`${normalizeMatchText(server.server_name)}|${epNum || normalizeMatchText(ep.slug || ep.name)}`);
    }
  }

  for (const sourceServer of secondary) {
    const serverName = sourceServer.server_name || 'BLVietsub';
    let target = merged.find((server) => normalizeMatchText(server.server_name) === normalizeMatchText(serverName));
    if (!target) {
      target = { server_name: serverName, server_data: [] };
      merged.push(target);
    }
    for (const ep of sourceServer.server_data ?? []) {
      const epNum = getEpisodeNumberFromData(ep);
      const key = `${normalizeMatchText(serverName)}|${epNum || normalizeMatchText(ep.slug || ep.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      target.server_data.push(ep);
    }
  }

  return merged.map((server) => ({
    ...server,
    server_data: server.server_data.sort((a, b) => getEpisodeNumberFromData(a) - getEpisodeNumberFromData(b)),
  }));
}

function mergePlayableMovieDetails(
  primary: MovieDetailResponse,
  secondary: MovieDetailResponse | null
): MovieDetailResponse {
  if (!detailHasPlayableEpisodes(secondary)) return primary;
  const episodes = mergeEpisodeServers(primary.episodes ?? [], secondary?.episodes ?? []);
  const primaryMaxEp = getMaxEpisodeNumberFromServers(primary.episodes ?? []);
  const mergedMaxEp = getMaxEpisodeNumberFromServers(episodes);
  return {
    ...primary,
    movie: {
      ...primary.movie,
      current_episode: Math.max(Number(primary.movie.current_episode ?? 0) || primaryMaxEp, mergedMaxEp) || primary.movie.current_episode,
      episode_current:
        mergedMaxEp > primaryMaxEp && mergedMaxEp > 0
          ? `Tập ${mergedMaxEp}`
          : primary.movie.episode_current,
    },
    episodes,
  };
}

async function mergeExternalDetailIfFast(
  primary: MovieDetailResponse,
  externalPromise: Promise<MovieDetailResponse | null>,
  timeoutMs: number
): Promise<MovieDetailResponse> {
  const external = await Promise.race([
    externalPromise.catch(() => null),
    new Promise<MovieDetailResponse | null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  return mergePlayableMovieDetails(primary, external);
}

function mergeQueerDetailWithSources(
  primary: MovieDetailResponse | null,
  blvietsub: MovieDetailResponse | null,
  ophim: MovieDetailResponse | null
): MovieDetailResponse | null {
  if (!primary) return primary;
  let mergedEpisodes = primary.episodes ?? [];
  if (detailHasPlayableEpisodes(ophim)) {
    mergedEpisodes = mergeEpisodeServers(mergedEpisodes, ophim?.episodes ?? []);
  }
  if (detailHasPlayableEpisodes(blvietsub)) {
    mergedEpisodes = mergeEpisodeServers(mergedEpisodes, blvietsub?.episodes ?? []);
  }
  const mergedMovie = normalizeMovieEpisodeCounts(primary.movie, mergedEpisodes);
  return {
    ...primary,
    movie: {
      ...mergedMovie,
      showtimes: primary.movie.showtimes || blvietsub?.movie.showtimes || ophim?.movie.showtimes,
    },
    episodes: mergedEpisodes,
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirstMatch(value: string, pattern: RegExp): string {
  const match = value.match(pattern);
  return match?.[1]?.trim() ?? '';
}

function extractBloggerImage(entry: BloggerEntry): string {
  const content = entry.content?.$t ?? '';
  const image = extractFirstMatch(content, /<img[^>]+src=["']([^"']+)["']/i);
  const thumb = entry.media$thumbnail?.url ?? '';
  return (image || thumb).replace(/\/s72-c\//, '/s320/');
}

function extractBloggerOriginName(entry: BloggerEntry): string {
  const content = entry.content?.$t ?? '';
  const alt = extractFirstMatch(content, /<img[^>]+alt=["']([^"']+)["']/i);
  const title = entry.title?.$t ?? '';
  const fromAlt = alt.includes(' - ') ? alt.split(' - ').slice(1).join(' - ') : '';
  const fromExtraInfo = extractFirstMatch(content, /Tên khác:\s*<\/?[^>]*>\s*<span>([\s\S]*?)<\/span>/i);
  return stripHtml(fromExtraInfo || fromAlt).replace(/\(\d{4}\)\s*$/, '').trim() || title;
}

function mapBloggerCategories(categories: BloggerCategory[] = []): {
  year: number;
  episode: string;
  type: string;
  status: string;
  category: MovieCategory[];
  country: MovieCountry[];
} {
  const terms = categories.map((cat) => cat.term ?? '').filter(Boolean);
  const year = Number(terms.find((term) => /^\d{4}$/.test(term)) ?? 0);
  const episode = terms.find((term) => /^Ep\b/i.test(term)) ?? (terms.includes('Hoàn Tất') ? 'Full' : '');
  const type = terms.includes('TV') ? 'series' : terms.includes('Movie') ? 'single' : 'phim-bo';
  const status = terms.includes('Đang Chiếu') ? 'ongoing' : 'completed';
  const countryNames = new Set(['Thái Lan', 'Hàn Quốc', 'Trung Quốc', 'Nhật Bản', 'Đài Loan', 'Việt Nam', 'Mỹ', 'Anh', 'Philippines', 'Hong Kong', 'Singapore', 'Úc', 'Canada']);
  const skipTerms = new Set(['TV', 'Movie', 'Hoàn Tất', 'Đang Chiếu', 'REELS', 'NSFW']);

  return {
    year,
    episode,
    type,
    status,
    country: terms
      .filter((term) => countryNames.has(term))
      .map((name) => ({ id: slugifyText(name), name, slug: slugifyText(name) })),
    category: terms
      .filter((term) => !countryNames.has(term))
      .filter((term) => !skipTerms.has(term))
      .filter((term) => !/^\d{4}$/.test(term) && !/^Ep\b/i.test(term) && !/^[A-Z]$/.test(term) && !/^\d+(\.\d+)?$/.test(term))
      .map((name) => ({ id: slugifyText(name), name, slug: slugifyText(name) })),
  };
}

function bloggerEntryToMovieItem(entry: BloggerEntry): MovieItem | null {
  const postId = getBloggerPostId(entry);
  const name = entry.title?.$t?.trim() ?? '';
  if (!postId || !name) return null;
  const mapped = mapBloggerCategories(entry.category);
  const image = extractBloggerImage(entry);
  const content = entry.content?.$t ?? '';
  const episodeServers = parseBlvietsubEpisodesByHost(content);
  const quality = stripHtml(extractFirstMatch(content, /Chất lượng:\s*<\/?[^>]*>\s*<span>([\s\S]*?)<\/span>/i)) || 'HD';

  const item: MovieItem = {
    _id: postId,
    name,
    slug: `${BLVIETSUB_SLUG_PREFIX}${postId}-${slugifyText(name)}`,
    origin_name: extractBloggerOriginName(entry),
    type: mapped.type,
    thumb_url: image,
    poster_url: image,
    sub_docquyen: false,
    chieurap: false,
    time: '',
    episode_current: mapped.episode,
    episode_total: '',
    quality,
    lang: 'Vietsub',
    year: mapped.year,
    category: [{ id: 'bl-gl', name: 'BL / GL', slug: 'bl-gl' }, ...mapped.category],
    country: mapped.country,
    modified: { time: entry.updated?.$t ?? entry.published?.$t ?? new Date().toISOString() },
    source_site: 'blvietsub',
    source_name: 'BLVietsub',
    content: stripHtml(extractFirstMatch(content, /<p id=["']synopsis["']>([\s\S]*?)<\/p>/i)),
    status: mapped.status,
    showtimes: getBloggerAlternateUrl(entry),
  };
  return normalizeMovieEpisodeCounts(item, episodeServers);
}

async function fetchBlvietsubEntries(options: { limit?: number; timeoutMs?: number; signal?: AbortSignal; query?: string } = {}): Promise<BloggerEntry[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 25, 3000));
  const query = options.query?.trim();
  const pageSize = Math.min(limit, 500);
  const entries: BloggerEntry[] = [];
  const seen = new Set<string>();

  for (let startIndex = 1; entries.length < limit; startIndex += pageSize) {
    const proxyUrl = getBlvietsubFeedProxyUrl({ limit: pageSize, query, startIndex });
    if (!proxyUrl) break;
    const data = await fetchJSON<BloggerFeedResponse>(proxyUrl, options.timeoutMs ?? 4500, options.signal);
    const batch = data.feed?.entry ?? [];
    if (!batch.length) break;
    for (const entry of batch) {
      const key = getBloggerPostId(entry) || entry.id?.$t || entry.title?.$t || '';
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      entries.push(entry);
      if (entries.length >= limit) break;
    }
    if (batch.length < pageSize) break;
  }

  return entries;
}

const BLVIETSUB_MOVIES_CACHE_TTL = 5 * 60 * 1000;
let blvietsubMoviesCache: {
  limit: number;
  expiresAt: number;
  promise: Promise<MovieItem[]>;
} | null = null;

async function fetchBlvietsubMovies(options: { limit?: number; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<MovieItem[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 25, 3000));
  if (!options.signal && blvietsubMoviesCache && blvietsubMoviesCache.limit >= limit && blvietsubMoviesCache.expiresAt > Date.now()) {
    const cached = await blvietsubMoviesCache.promise;
    return cached.slice(0, limit);
  }

  const entries = await fetchBlvietsubEntries(options);
  const promise = Promise.resolve(uniqueMoviesBySlug(entries.map(bloggerEntryToMovieItem).filter(Boolean) as MovieItem[]));
  if (!options.signal) {
    blvietsubMoviesCache = {
      limit,
      expiresAt: Date.now() + BLVIETSUB_MOVIES_CACHE_TTL,
      promise,
    };
  }
  return promise;
}

function matchesBlvietsubSearch(movie: MovieItem, keyword: string): boolean {
  const query = normalizeQueerSearchText(keyword).trim();
  if (!query) return false;
  if (isQueerSearchIntent(keyword)) return true;
  const haystack = normalizeQueerSearchText([
    movie.name,
    movie.origin_name,
    movie.content,
    movie.year ? String(movie.year) : '',
    ...(movie.category ?? []).flatMap((item) => [item.name, item.slug]),
    ...(movie.country ?? []).flatMap((item) => [item.name, item.slug]),
  ].filter(Boolean).join(' '));
  return query.split(/\s+/).every((part) => haystack.includes(part));
}

function extractBlvietsubPostIdFromSlug(slug: string): string {
  const decoded = decodeURIComponent(slug);
  return decoded.startsWith(BLVIETSUB_SLUG_PREFIX)
    ? decoded.slice(BLVIETSUB_SLUG_PREFIX.length).match(/^(\d+)/)?.[1] ?? ''
    : '';
}

function inferBlvietsubServerName(rawServerName: string, embedUrl: string): string {
  const raw = rawServerName.trim();
  const rawCode = normalizeServerPriorityText(raw);
  try {
    const host = new URL(embedUrl.replace(/&amp;/g, '&')).hostname.toLowerCase();
    if (rawCode === 'VK' && host.includes('ssplay')) return 'SS';
    if (host.includes('dailymotion.com') || host === 'dai.ly') return 'Daily';
    if (['SS', 'HX', 'OK'].includes(rawCode)) return rawCode;
    if (rawCode === 'DL') return 'Daily';
    if (host.includes('ssplay')) return 'SS';
    if (host.includes('ok.ru') || host.includes('odnoklassniki')) return 'OK';
    if (host.includes('vk.com') || host.includes('vkvideo')) return 'VK';
    if (host.includes('abyssplayer') || host.includes('short.icu')) return 'HX';
  } catch {
    // Keep the raw server label when the embed URL is not parseable.
  }
  return raw || 'BLVietsub';
}

function parseBlvietsubEpisodes(content: string): EpisodeServer[] {
  const serverBlocks = Array.from(content.matchAll(/<ul[^>]+id=["']([^"']+)["'][^>]*class=["']serverEpisode["'][^>]*>([\s\S]*?)<\/ul>/gi));
  return serverBlocks
    .map(([, serverName, block]) => {
      const server_data = Array.from(block.matchAll(/data-embed=["']([^"']+)["'][\s\S]*?<span>([^<]+)<\/span>/gi))
        .map(([, embed, label]) => ({
          name: `Tập ${label.trim()}`,
          slug: label.trim().toLowerCase().replace(/\s+/g, '-'),
          filename: '',
          link_embed: normalizeDailymotionUrl(embed.replace(/&amp;/g, '&')),
          link_m3u8: '',
          subtitle_url: '',
        }))
        .filter((ep) => Boolean(ep.link_embed));
      return server_data.length ? { server_name: serverName, server_data } : null;
    })
    .filter(Boolean) as EpisodeServer[];
}

function parseBlvietsubEpisodesByHost(content: string): EpisodeServer[] {
  const serverBlocks = Array.from(content.matchAll(/<ul[^>]+id=["']([^"']+)["'][^>]*class=["']serverEpisode["'][^>]*>([\s\S]*?)<\/ul>/gi));
  const byServer = new Map<string, EpisodeData[]>();
  const seen = new Set<string>();
  for (const [, serverName, block] of serverBlocks) {
    for (const [, embed, label] of Array.from(block.matchAll(/data-embed=["']([^"']+)["'][\s\S]*?<span>([^<]+)<\/span>/gi))) {
      const link_embed = normalizeDailymotionUrl(embed.replace(/&amp;/g, '&'));
      if (!link_embed) continue;
      const inferredServerName = inferBlvietsubServerName(serverName, link_embed);
      const slug = label.trim().toLowerCase().replace(/\s+/g, '-');
      const key = `${inferredServerName}|${slug}|${link_embed}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!byServer.has(inferredServerName)) byServer.set(inferredServerName, []);
      byServer.get(inferredServerName)!.push({
        name: `Tap ${label.trim()}`,
        slug,
        filename: '',
        link_embed,
        link_m3u8: '',
        episode_number: getEpisodeNumberFromText(label.trim()) || undefined,
        subtitle_url: '',
      });
    }
  }
  return Array.from(byServer.entries()).map(([server_name, server_data]) => ({
    server_name,
    server_data,
  }));
}

async function fetchMovieDetailFromBlvietsub(slug: string): Promise<MovieDetailResponse | null> {
  const postId = extractBlvietsubPostIdFromSlug(slug);
  if (!postId) return null;
  try {
    const proxyUrl = getBlvietsubFeedProxyUrl({ postId });
    if (!proxyUrl) return null;
    const data = await fetchJSON<BloggerFeedResponse>(proxyUrl, 5500);
    const entry = data.entry;
    return entry ? buildBlvietsubDetail(entry) : null;
  } catch (e) {
    if (import.meta.env.DEV && !isAbortLikeError(e)) {
      console.warn('[fetchMovieDetailFromBlvietsub] Exception:', e);
    }
    return null;
  }
}

async function fetchMovieDetailFromBlvietsubForMovie(movie?: Partial<MovieDetail> | Partial<MovieItem> | null): Promise<MovieDetailResponse | null> {
  if (!isQueerMovieDetail(movie)) return null;
  if (movie?.slug?.startsWith(BLVIETSUB_SLUG_PREFIX)) return fetchMovieDetailFromBlvietsub(movie.slug);

  const queries = [
    movie?.origin_name,
    movie?.name,
    (movie as Partial<MovieItem>)?.title_vi,
    (movie as Partial<MovieItem>)?.title_en,
    (movie as Partial<MovieItem>)?.title_zh,
  ].filter(Boolean) as string[];

  for (const query of queries) {
    try {
      const entries = await fetchBlvietsubEntries({ query, limit: 8, timeoutMs: 3500 });
      const expected = normalizeMatchText(query);
      const entry = entries.find((candidate) => {
        const title = normalizeMatchText(candidate.title?.$t ?? '');
        const origin = normalizeMatchText(extractBloggerOriginName(candidate));
        return title === expected || origin === expected || title.includes(expected) || expected.includes(title) || origin.includes(expected);
      });
      const entryPostId = entry ? getBloggerPostId(entry) : '';
      const detail = entryPostId
        ? await fetchMovieDetailFromBlvietsub(`${BLVIETSUB_SLUG_PREFIX}${entryPostId}`)
        : entry ? buildBlvietsubDetail(entry) : null;
      if (detail && detailHasPlayableEpisodes(detail)) return detail;
    } catch (e) {
      if (import.meta.env.DEV && !isAbortLikeError(e)) {
        console.warn('[fetchMovieDetailFromBlvietsubForMovie] Exception:', e);
      }
    }
  }

  return null;
}

async function fetchMovieDetailFromOPhimForMovie(movie?: Partial<MovieDetail> | Partial<MovieItem> | null): Promise<MovieDetailResponse | null> {
  if (!isQueerMovieDetail(movie)) return null;

  const movieRecord = movie as Record<string, unknown>;
  const slug = String(movie?.slug || '').trim();
  if (slug && !slug.startsWith(BLVIETSUB_SLUG_PREFIX)) {
    const direct = await fetchMovieDetailFromOPhim(slug, false);
    if (
      direct &&
      detailHasPlayableEpisodes(direct) &&
      (validateOphimExactMatch(direct, slug, movieRecord) || movieNamesMatchExactly(movie, direct.movie))
    ) {
      return markOphimServers(direct);
    }
  }

  const queries = [
    movie?.origin_name,
    movie?.name,
    (movie as Partial<MovieItem>)?.title_vi,
    (movie as Partial<MovieItem>)?.title_en,
    (movie as Partial<MovieItem>)?.title_zh,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  for (const query of queries) {
    try {
      const candidates = await searchOphimCandidates(query, 8);
      const exact = candidates.find((candidate) => movieNamesMatchExactly(movie, candidate));
      const candidateSlug = String(exact?.slug || '').trim();
      if (!candidateSlug) continue;

      const detail = await fetchMovieDetailFromOPhim(candidateSlug, false);
      if (
        detail &&
        detailHasPlayableEpisodes(detail) &&
        (movieNamesMatchExactly(movie, detail.movie) || validateOphimExactMatch(detail, candidateSlug, movieRecord))
      ) {
        return markOphimServers(detail);
      }
    } catch (e) {
      if (import.meta.env.DEV && !isAbortLikeError(e)) {
        console.warn('[fetchMovieDetailFromOPhimForMovie] Exception:', e);
      }
    }
  }

  return null;
}
function toSupabaseMovieItem(m: Record<string, unknown>): MovieItem {
  const currentEpisode = Number(m.current_episode || 0) || undefined;
  const episodeCurrent = (m.episode_current as string) || '';
  const episodeTextNumber = getEpisodeNumberFromText(episodeCurrent);
  const normalizedEpisodeCurrent =
    currentEpisode && currentEpisode > episodeTextNumber
      ? `Tập ${currentEpisode}`
      : episodeCurrent;
  const item: MovieItem = {
    _id: (m.id as string) || '',
    name: getMovieDisplayName({
      name: (m.name as string) || '',
      title_vi: (m.title_vi as string) || '',
      title_en: (m.title_en as string) || '',
      title_zh: (m.title_zh as string) || '',
      origin_name: (m.origin_name as string) || '',
    }),
    slug: (m.slug as string) || '',
    origin_name: (m.origin_name as string) || '',
    type: (m.type as string) || 'phim-le',
    thumb_url: (m.thumb_url as string) || (m.poster_url as string) || '',
    poster_url: (m.poster_url as string) || '',
    quality: (m.quality as string) || 'HD',
    lang: (m.lang as string) || 'Vietsub',
    year: (m.year as number) || 0,
    episode_current: normalizedEpisodeCurrent,
    episode_total: (m.episode_total as string) || '',
    current_episode: currentEpisode || episodeTextNumber || undefined,
    total_episodes: Number(m.total_episodes || 0) || undefined,
    schedule_type: (m.schedule_type as MovieItem['schedule_type']) || '',
    release_time: (m.release_time as string) || undefined,
    release_day: m.release_day === null || m.release_day === undefined ? undefined : Number(m.release_day),
    schedule_timezone: (m.schedule_timezone as string) || undefined,
    category: normalizeTaxonomy<MovieCategory>(m.category),
    country: normalizeTaxonomy<MovieCountry>(m.country),
    sub_docquyen: false,
    chieurap: false,
    time: (m.time as string) || '',
    modified: { time: (m.updated_at as string) || (m.created_at as string) || new Date().toISOString() },
    ophim_id: (m.ophim_id as string) || undefined,
    tmdb_id: (m.tmdb_id as string) || undefined,
    source_site: (m.source_site as string) || 'supabase',
    source_name: (m.source_name as string) || 'Supabase',
    title_vi: (m.title_vi as string) || undefined,
    title_en: (m.title_en as string) || undefined,
    title_zh: (m.title_zh as string) || undefined,
    release_at: (m.release_at as string) || undefined,
    next_episode_at: (m.next_episode_at as string) || undefined,
    next_episode_name: (m.next_episode_name as string) || undefined,
    schedule_note: (m.schedule_note as string) || undefined,
  };
  return normalizeMovieEpisodeCounts(item);
}

async function enrichMoviesWithSupabaseEpisodeCounts(items: MovieItem[], signal?: AbortSignal): Promise<MovieItem[]> {
  const ids = Array.from(new Set(items.map((item) => item._id).filter(Boolean)));
  if (ids.length === 0) return items;

  try {
    const maxByMovieId = new Map<string, number>();
    const setMaxEpisode = (movieId: string, episodeNumber: number) => {
      if (!movieId || !Number.isFinite(episodeNumber) || episodeNumber <= 0) return;
      maxByMovieId.set(movieId, Math.max(maxByMovieId.get(movieId) || 0, episodeNumber));
    };
    const fetchPagedRows = async (
      buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
    ): Promise<Record<string, unknown>[]> => {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await buildQuery(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as Record<string, unknown>[]));
        if (!data || data.length < 1000) break;
      }
      return rows;
    };
    const chunkSize = 30;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const [movieEpisodesRows, episodeRows, streamRows] = await Promise.all([
        fetchPagedRows((from, to) => supabase
          .from('movie_episodes')
          .select('movie_id, episode_number, source')
          .in('movie_id', chunk)
          .order('episode_number', { ascending: false })
          .range(from, to)
          .abortSignal(signal)),
        fetchPagedRows((from, to) => supabase
          .from('episodes')
          .select('movie_id, episode_number, episode_slug, episode_name, server_data')
          .in('movie_id', chunk)
          .order('episode_number', { ascending: false })
          .range(from, to)
          .abortSignal(signal)),
        fetchPagedRows((from, to) => supabase
          .from('streams')
          .select('movie_id, episode_slug, is_active')
          .in('movie_id', chunk)
          .eq('is_active', true)
          .range(from, to)
          .abortSignal(signal)),
      ]);

      for (const row of movieEpisodesRows) {
        if (String(row.source || '').toLowerCase() === 'hidden') continue;
        setMaxEpisode(String(row.movie_id || ''), Number(row.episode_number || 0));
      }

      for (const row of episodeRows) {
        setMaxEpisode(
          String(row.movie_id || ''),
          Math.max(
            Number(row.episode_number || 0) || 0,
            getEpisodeNumberFromText(String(row.episode_slug || '')),
            getEpisodeNumberFromText(String(row.episode_name || '')),
            getMaxEpisodeNumberFromServerData(row.server_data),
          ),
        );
      }

      for (const row of streamRows) {
        setMaxEpisode(String(row.movie_id || ''), getEpisodeNumberFromText(String(row.episode_slug || '')));
      }
    }

    if (maxByMovieId.size === 0) return items;
    return items.map((item) => {
      const liveMax = maxByMovieId.get(item._id) || 0;
      const currentMax = Math.max(Number(item.current_episode || 0), getEpisodeNumberFromText(item.episode_current));
      if (!liveMax || !currentMax || liveMax === currentMax) return item;
      return normalizeMovieEpisodeCounts({
        ...item,
        episode_current: `Tập ${liveMax}`,
        current_episode: liveMax,
        episode_total: Number(item.total_episodes || 0) >= liveMax ? item.episode_total : '',
        total_episodes: Number(item.total_episodes || 0) >= liveMax ? item.total_episodes : undefined,
      });
    });
  } catch {
    return items;
  }
}
export async function searchQueerUniverseMovies(
  keyword: string,
  options: { limit?: number; timeoutMs?: number; minLength?: number; signal?: AbortSignal } = {}
): Promise<MovieItem[]> {
  const kw = keyword.trim();
  const minLength = options.minLength ?? 2;
  if (!kw || kw.length < minLength) return [];

  const limit = options.limit ?? 24;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 2500);

  try {
    const safeKw = escapePostgrestIlike(kw);
    const normalizedKw = normalizeSearchText(kw);
    const safeNormalizedKw = escapePostgrestIlike(normalizedKw);
    const safeSlugKw = escapePostgrestIlike(normalizedKw.replace(/\s+/g, '-'));
    const searchFilters = Array.from(new Set([
      `name.ilike.%${safeKw}%`,
      `origin_name.ilike.%${safeKw}%`,
      `title_vi.ilike.%${safeKw}%`,
      `title_en.ilike.%${safeKw}%`,
      `title_zh.ilike.%${safeKw}%`,
      `title_original.ilike.%${safeKw}%`,
      `content.ilike.%${safeKw}%`,
      `slug.ilike.%${safeKw}%`,
      ...(safeNormalizedKw
        ? [
            `normalized_name.ilike.%${safeNormalizedKw}%`,
            `slug.ilike.%${safeSlugKw}%`,
            `name.ilike.%${safeNormalizedKw}%`,
            `origin_name.ilike.%${safeNormalizedKw}%`,
            `title_vi.ilike.%${safeNormalizedKw}%`,
            `title_en.ilike.%${safeNormalizedKw}%`,
          ]
        : []),
    ])).join(',');
    const supabaseQueerPromise: Promise<MovieItem[]> = (async () => {
      const { data } = await supabase
        .from('movies')
        .select(SUPABASE_QUEER_LIST_SELECT)
        .eq('is_published', true)
        .or('source_site.ilike.%admin-queer%,source_site.ilike.%blvietsub%,source_name.ilike.%blvietsub%,source_site.ilike.%bl vietsub%,source_name.ilike.%bl vietsub%')
        .or(searchFilters)
        .order('updated_at', { ascending: false })
        .limit(limit)
        .abortSignal(controller.signal);

      return ((data ?? []) as Record<string, unknown>[]).map(toSupabaseMovieItem);
    })().catch(() => []);

    const supabaseQueerItems = await supabaseQueerPromise;
    const matchingFeedItems = supabaseQueerItems.filter((movie) => matchesBlvietsubSearch(movie, kw));
    if (matchingFeedItems.length > 0 || isQueerSearchIntent(kw)) {
      return sortMoviesForSearch(
        mergeMoviesUnique(matchingFeedItems.length ? matchingFeedItems : supabaseQueerItems),
        kw,
        'relevance'
      ).slice(0, limit);
    }

    const fallbackResult = await supabase
      .from('movies')
      .select(SUPABASE_QUEER_LIST_SELECT)
      .eq('is_published', true)
      .or('source_site.ilike.%admin-queer%,source_site.ilike.%blvietsub%,source_name.ilike.%blvietsub%,source_site.ilike.%bl vietsub%,source_name.ilike.%bl vietsub%')
      .or(searchFilters)
      .order('updated_at', { ascending: false })
      .limit(limit)
      .abortSignal(controller.signal);

    return sortMoviesForSearch(
      mergeMoviesUnique([
        ...supabaseQueerItems,
        ...((fallbackResult.data ?? []) as Record<string, unknown>[]).map(toSupabaseMovieItem),
      ]),
      kw,
      'relevance'
    ).slice(0, limit);
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') {
      console.warn('[searchQueerUniverseMovies] Exception:', e);
    }
    return [];
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromParent);
  }
}

function movieMatchesQueerUniverse(movie: MovieItem, raw?: Record<string, unknown>): boolean {
  const taxonomy = [
    ...(movie.category ?? []).flatMap((item) => [item.name, item.slug]),
    ...(movie.country ?? []).flatMap((item) => [item.name, item.slug]),
  ];
  const haystack = [
    movie.name,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.slug,
    raw?.content,
    raw?.title_original,
    ...taxonomy,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return QUEER_UNIVERSE_TERMS.some((term) =>
    haystack.includes(term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );
}

function uniqueMoviesBySlug(items: MovieItem[]): MovieItem[] {
  const seen = new Set<string>();
  const result: MovieItem[] = [];
  for (const item of items) {
    if (!item.slug || seen.has(item.slug)) continue;
    seen.add(item.slug);
    result.push(item);
  }
  return result;
}

async function loadStaticQueerFallback(signal?: AbortSignal): Promise<MovieItem[]> {
  try {
    const res = await fetch(QUEER_FALLBACK_URL, {
      cache: 'force-cache',
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json() as { sections?: { newUpdates?: Record<string, unknown>[] } };
    return ((data.sections?.newUpdates ?? []) as Record<string, unknown>[])
      .map(toSupabaseMovieItem)
      .filter((movie) => Boolean(movie.slug && movie.name));
  } catch {
    return [];
  }
}

function getMovieUpdateTime(movie: MovieItem): number {
  const time = new Date(movie.modified?.time ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
export async function fetchQueerUniverseSections(options: { limit?: number; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<{
  featured: MovieItem[];
  newUpdates: MovieItem[];
  byYear: Record<string, MovieItem[]>;
}> {
  const limit = options.limit ?? 18;
  const poolLimit = Math.max(limit, 1000);
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4500);

  try {
    const { data: markedRows } = await supabase
      .from('movies')
      .select(SUPABASE_QUEER_LIST_SELECT)
      .eq('is_published', true)
      .or('source_site.ilike.%admin-queer%,source_site.ilike.%blvietsub%,source_name.ilike.%blvietsub%')
      .order('updated_at', { ascending: false })
      .limit(poolLimit)
      .abortSignal(controller.signal);

    const markedMovies = ((markedRows ?? []) as Record<string, unknown>[]).map(toSupabaseMovieItem);
    const combinedQueerMovies = uniqueMoviesBySlug(markedMovies).sort((a, b) => {
      const ta = getMovieUpdateTime(a);
      const tb = getMovieUpdateTime(b);
      if (tb !== ta) return tb - ta;
      if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
        return tb - ta;
      });

    if (combinedQueerMovies.length > 0) {
      const byYear: Record<string, MovieItem[]> = {};
      for (const movie of combinedQueerMovies) {
        if (!movie.year) continue;
        const key = String(movie.year);
        if (!byYear[key]) byYear[key] = [];
        if (byYear[key].length < limit) byYear[key].push(movie);
      }
      return {
        featured: combinedQueerMovies.slice(0, limit),
        newUpdates: combinedQueerMovies.slice(0, limit),
        byYear,
      };
    }

    const keywordQueries = QUEER_UNIVERSE_TERMS.slice(0, 10).map((term) => {
      const safe = escapePostgrestIlike(term);
      return supabase
        .from('movies')
        .select(SUPABASE_QUEER_LIST_SELECT)
        .eq('is_published', true)
        .or(`name.ilike.%${safe}%,origin_name.ilike.%${safe}%,title_vi.ilike.%${safe}%,title_en.ilike.%${safe}%,title_original.ilike.%${safe}%,content.ilike.%${safe}%,slug.ilike.%${safe}%`)
        .order('updated_at', { ascending: false })
        .limit(limit)
        .abortSignal(controller.signal);
    });

    const results = await Promise.all(keywordQueries);
    const rawRows = results.flatMap((result) => result.data ?? []) as Record<string, unknown>[];
    const movies = uniqueMoviesBySlug(
      rawRows
        .map((row) => ({ row, movie: toSupabaseMovieItem(row) }))
        .filter(({ movie, row }) => movieMatchesQueerUniverse(movie, row))
        .map(({ movie }) => movie)
    );

    const sorted = [...movies].sort((a, b) => {
      const ta = getMovieUpdateTime(a);
      const tb = getMovieUpdateTime(b);
      if (tb !== ta) return tb - ta;
      if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
      return tb - ta;
    });

    const byYear: Record<string, MovieItem[]> = {};
    for (const movie of sorted) {
      if (!movie.year) continue;
      const key = String(movie.year);
      if (!byYear[key]) byYear[key] = [];
      if (byYear[key].length < limit) byYear[key].push(movie);
    }

    return {
      featured: sorted.slice(0, limit),
      newUpdates: sorted.slice(0, limit),
      byYear,
    };
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') {
      console.warn('[fetchQueerUniverseSections] Exception:', e);
    }
    const fallbackMovies = await loadStaticQueerFallback(options.signal);
    return { featured: fallbackMovies, newUpdates: fallbackMovies, byYear: {} };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromParent);
  }
}
export function epSortKey(ep: EpisodeData): number {
  const explicit = Number(ep.episode_number ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = ep.slug || ep.name || '';
  const match = text.match(/(\d+)/);
  if (match) return Number(match[1]);
  if (text.toLowerCase().includes('full')) return 0;
  return Infinity;
}

const detailInflight = new Map<string, Promise<MovieDetailResponse | null>>();

/* Race helper: trả về kết quả non-null đầu tiên, có timeout cap */
function raceFirstValidWithTimeout<T>(
  promises: Promise<T | null>[],
  timeoutMs: number
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    let resolved = false;
    let pending = promises.length;
    if (pending === 0) { clearTimeout(timer); resolve(null); return; }
    promises.forEach((p) => {
      p.then((result) => {
        if (!resolved && result !== null) {
          resolved = true;
          clearTimeout(timer);
          resolve(result);
        }
        pending--;
        if (pending === 0 && !resolved) { clearTimeout(timer); resolve(null); }
      }).catch(() => {
        pending--;
        if (pending === 0 && !resolved) { clearTimeout(timer); resolve(null); }
      });
    });
  });
}

function withNullTimeout<T>(
  promise: Promise<T | null>,
  timeoutMs: number,
): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<T | null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/* ─═══════════════════════════════════════════
   MOVIE DETAIL — EXTERNAL API FALLBACK
   Dùng khi OPhim không có phim hoặc bị lỗi
   OPTIMIZED: chỉ 2 nguồn dự phòng nhanh nhất
   ════════════════════════════════════════════ */
async function fetchMovieDetailFromExternal(slug: string): Promise<MovieDetailResponse | null> {
  const sources = [
    { url: `https://phimapi.com/phim/${encodeURIComponent(slug)}`, name: 'phimapi' },
    { url: `https://phimapi.net/phim/${encodeURIComponent(slug)}`, name: 'phimapi-net' },
  ];

  const controllers: AbortController[] = [];

  const promises = sources.map(({ url, name }) => {
    const ctrl = new AbortController();
    controllers.push(ctrl);
    const t = setTimeout(() => { try { ctrl.abort(); } catch { /* noop */ } }, 4500);

    return fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      .then(async (r) => {
        clearTimeout(t);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json() as Record<string, unknown>;
        // Unwrap v1 format: { status, msg, data: { movie, episodes } }
        const payload = (raw.data as Record<string, unknown>) || raw;
        const result = parseMovieDetailPayload(payload, slug);
        if (result?.movie?._id || result?.movie?.name) {
          // API /phim/${slug} trả về HTTP 200 + movie data → tin tưởng đây là phim đúng
          // Chỉ log warn nếu slug mismatch để debug, không reject
          const extSlug = String(result.movie.slug || '').trim().toLowerCase().normalize('NFC');
          const expectedSlug = slug.trim().toLowerCase().normalize('NFC');
          if (import.meta.env.DEV && extSlug && extSlug !== expectedSlug) {
            console.warn(
              `[fetchMovieDetailFromExternal] Slug mismatch (accepted): expected "${expectedSlug}" got "${extSlug}" from ${name}`
            );
          }
          return result;
        }
        throw new Error('Invalid response format');
      })
      .catch((err) => {
        clearTimeout(t);
        if (import.meta.env.DEV && !isAbortLikeError(err)) {
          console.warn(`[fetchMovieDetailFromExternal] ${name} failed:`, (err as Error).message);
        }
        return null;
      });
  });

  const winner = await raceFirstValidWithTimeout(promises, 5000);
  if (winner) {
    controllers.forEach((c) => { try { c.abort(); } catch { /* noop */ } });
  }
  return winner ?? null;
}

export async function fetchMovieDetail(slug: string, forceRefresh = false, source?: string): Promise<MovieDetailResponse | null> {
  const cacheKey = `detail_v6_${slug}`;
  // Xóa cache key cũ nếu còn sót
  apiCache.delete(`detail_${slug}`);
  apiCache.delete(`detail_v2_${slug}`);
  apiCache.delete(`detail_v3_${slug}`);
  apiCache.delete(`detail_v4_${slug}`);
  apiCache.delete(`detail_v5_${slug}`);

  const ttl = TTL_CONFIG.detail;
  const cached = getCached<MovieDetailResponse>(cacheKey, ttl);

  if (cached && !cached.stale && !forceRefresh && cached.data && detailHasPlayableEpisodes(cached.data)) return cached.data;

  const inflight = detailInflight.get(slug);
  if (inflight && !forceRefresh) return inflight;

  if (forceRefresh) {
    apiCache.delete(cacheKey);
    apiCache.delete(`detail_${slug}`);
    apiCache.delete(`detail_v2_${slug}`);
    apiCache.delete(`detail_v3_${slug}`);
    apiCache.delete(`detail_v4_${slug}`);
    apiCache.delete(`detail_v5_${slug}`);
    detailInflight.delete(slug);
  }

  const promise = (async (): Promise<MovieDetailResponse | null> => {
    let blvietsubPromise: Promise<MovieDetailResponse | null> | undefined;

    // ── PRIORITY: If source=ophim or slug looks like CJK/non-ASCII, try OPhim FIRST ──
    const isOphimSource = source === 'ophim';
    const looksLikeCjk = Array.from(slug).some((char) => char.charCodeAt(0) > 127);
    const preferOphim = isOphimSource || looksLikeCjk;

    let ophim: MovieDetailResponse | null = null;
    let sb: MovieDetailResponse | null = null;
    let proxy: MovieDetailResponse | null = null;
    let blvietsub: MovieDetailResponse | null = null;
    let queerOphim: MovieDetailResponse | null = null;
    let externalPromise: Promise<MovieDetailResponse | null> | undefined;

    if (preferOphim) {
      const ophimPromise = fetchMovieDetailFromOPhim(slug, false);
      const sbPromise = fetchMovieDetailFromSupabase(slug);
      const proxyPromise = fetchMovieDetailFromProxy(slug, forceRefresh);
      externalPromise = fetchMovieDetailFromExternal(slug);
      blvietsubPromise = fetchMovieDetailFromBlvietsub(slug);
      const quickPlayable = await raceFirstValidWithTimeout(
        [
          ophimPromise.then((data) => (detailHasPlayableEpisodes(data) ? data : null)).catch(() => null),
          sbPromise.then((data) => (detailHasPlayableEpisodes(data) ? data : null)).catch(() => null),
          proxyPromise.then((data) => (detailHasPlayableEpisodes(data) ? data : null)).catch(() => null),
        ],
        3500
      );
      if (quickPlayable) {
        if (isQueerMovieDetail(quickPlayable.movie)) {
          const freshQueerDetail = await getFreshQueerDetailWithTimeout(quickPlayable, blvietsubPromise, ophimPromise, 2200);
          if (freshQueerDetail) {
            if (import.meta.env.DEV) console.log(`[fetchMovieDetail] Using fresh merged queer detail for "${slug}" (source=ophim/CJK)`);
            setCached(cacheKey, freshQueerDetail);
            return freshQueerDetail;
          }
          refreshQueerDetailCacheInBackground(cacheKey, quickPlayable, blvietsubPromise, ophimPromise);
        }
        if (import.meta.env.DEV) console.log(`[fetchMovieDetail] Using quick playable source for "${slug}" (source=ophim/CJK)`);
        const mergedQuick = await mergeExternalDetailIfFast(quickPlayable, externalPromise, forceRefresh ? 3500 : 900);
        setCached(cacheKey, mergedQuick);
        return mergedQuick;
      }
      if (!ophim && !sb && !proxy && !blvietsub) {
        [ophim, sb, proxy, blvietsub] = await Promise.all([ophimPromise, sbPromise, proxyPromise, blvietsubPromise!]);
      }
    } else {
      // Default path: let the edge proxy serve DB/cache first. Direct Supabase is a fallback
      // so a large click burst does not double the database queries for every movie open.
      const proxyPromise = fetchMovieDetailFromProxy(slug, forceRefresh);

      const quickPlayable = await raceFirstValidWithTimeout(
        [
          proxyPromise.then((data) => (detailHasPlayableEpisodes(data) ? data : null)).catch(() => null),
        ],
        1800
      );
      if (quickPlayable) {
        if (isQueerMovieDetail(quickPlayable.movie)) {
          if (isBlvietsubMovie(quickPlayable.movie)) {
            refreshQueerDetailCacheInBackground(cacheKey, quickPlayable, undefined, undefined);
            setCached(cacheKey, quickPlayable);
            return quickPlayable;
          }
          blvietsubPromise = fetchMovieDetailFromBlvietsubForMovie(quickPlayable.movie);
          const queerOphimPromise = fetchMovieDetailFromOPhimForMovie(quickPlayable.movie);
          const freshQueerDetail = await getFreshQueerDetailWithTimeout(quickPlayable, blvietsubPromise, queerOphimPromise, 2200);
          if (freshQueerDetail) {
            if (import.meta.env.DEV) console.log(`[fetchMovieDetail] Using fresh merged queer detail for "${slug}"`);
            setCached(cacheKey, freshQueerDetail);
            return freshQueerDetail;
          }
          refreshQueerDetailCacheInBackground(cacheKey, quickPlayable, blvietsubPromise, queerOphimPromise);
        }
        if (import.meta.env.DEV) console.log(`[fetchMovieDetail] Using first quick playable source for "${slug}"`);
        externalPromise = fetchMovieDetailFromExternal(slug);
        const mergedQuick = await mergeExternalDetailIfFast(quickPlayable, externalPromise, forceRefresh ? 3500 : 900);
        setCached(cacheKey, mergedQuick);
        return mergedQuick;
      }

      proxy = await proxyPromise.catch(() => null);
      sb = detailHasPlayableEpisodes(proxy) ? null : await fetchMovieDetailFromSupabase(slug).catch(() => null);
      if (!detailHasPlayableEpisodes(sb)) {
        const ophimPromise = fetchMovieDetailFromOPhim(slug, false);
        blvietsubPromise = fetchMovieDetailFromBlvietsub(slug);
        [ophim, blvietsub] = await Promise.all([
          withNullTimeout(ophimPromise, 4500),
          withNullTimeout(blvietsubPromise, 6000),
        ]);
      }
    }

    // ── If OPhim returned data, sync it to Supabase for future dedup ──
    if (ophim?.movie?.name) {
      // Background sync to Supabase is handled by edge functions/cron jobs
      // Frontend does not have write access to movies table via RLS
    }

    const sbMovie = (sb?.movie as unknown as Record<string, unknown>) || null;
    const canonicalSlug = sbMovie?.slug ? String(sbMovie.slug) : null;

    if (!blvietsub && isQueerMovieDetail(sb?.movie)) {
      blvietsub = await withNullTimeout(fetchMovieDetailFromBlvietsubForMovie(sb?.movie), 6000);
    }

    if (sb && isQueerMovieDetail(sb.movie)) {
      queerOphim = await withNullTimeout(fetchMovieDetailFromOPhimForMovie(sb.movie), 4500);
      const merged = mergeQueerDetailWithSources(sb, blvietsub, queerOphim);
      if (merged && detailHasPlayableEpisodes(merged)) {
        if (import.meta.env.DEV) console.log(`[fetchMovieDetail] Using merged Supabase + OPhim + BLVietsub detail for "${slug}"`);
        setCached(cacheKey, merged);
        return merged;
      }
    }

    // ── STEP 2: Pick best result from all sources ──
    if (!sb && blvietsub && isQueerMovieDetail(blvietsub.movie)) {
      queerOphim = await withNullTimeout(fetchMovieDetailFromOPhimForMovie(blvietsub.movie), 4500);
      const merged = mergeQueerDetailWithSources(blvietsub, null, queerOphim);
      if (merged && detailHasPlayableEpisodes(merged)) {
        if (import.meta.env.DEV) console.log(`[fetchMovieDetail] Using merged BLVietsub + OPhim detail for "${slug}"`);
        setCached(cacheKey, merged);
        return merged;
      }
    }

    const candidates = [
      { src: 'supabase', data: sb },
      { src: 'proxy', data: proxy },
      { src: 'blvietsub', data: blvietsub },
      { src: 'ophim', data: ophim },
  
    ];

    // For OPhim source: prioritize OPhim data
    if (preferOphim && ophim && detailHasPlayableEpisodes(ophim)) {
      if (import.meta.env.DEV) console.log(`[fetchMovieDetail] Using OPhim as priority source for "${slug}" (source=ophim/CJK)`);
      void fetchMovieDetailFromProxy(slug, true).catch(() => null);
      setCached(cacheKey, ophim);
      return ophim;
    }

    // Find first candidate with playable episodes
    for (const cand of candidates) {
      if (cand.data && detailHasPlayableEpisodes(cand.data)) {
        if (import.meta.env.DEV) console.log(`[fetchMovieDetail] Using ${cand.src} for "${slug}" (has episodes)`);
        setCached(cacheKey, cand.data);
        return cand.data;
      }
    }

    // Find first candidate with any movie metadata
    for (const cand of candidates) {
      if (cand.data?.movie?.slug || cand.data?.movie?.name) {
        if (import.meta.env.DEV) console.log(`[fetchMovieDetail] Using ${cand.src} for "${slug}" (metadata only)`);
        setCached(cacheKey, cand.data);
        return cand.data;
      }
    }

    // ── STEP 3: Retry OPhim & External with canonical slug from Supabase ──
    let usableOphim: MovieDetailResponse | null = null;
    if (canonicalSlug && canonicalSlug !== slug) {
      console.warn(`[fetchMovieDetail] All initial sources failed for "${slug}", retrying OPhim with canonical slug "${canonicalSlug}"`);
      usableOphim = await fetchMovieDetailFromOPhim(canonicalSlug, false);
      if (usableOphim && detailHasPlayableEpisodes(usableOphim)) {
        setCached(cacheKey, usableOphim);
        return usableOphim;
      }
    }

    // ── STEP 4: External fallback ──
    let external = externalPromise ? await externalPromise.catch(() => null) : await fetchMovieDetailFromExternal(slug);
    if (!external && canonicalSlug && canonicalSlug !== slug) {
      external = await fetchMovieDetailFromExternal(canonicalSlug);
    }
    if (external && detailHasPlayableEpisodes(external)) {
      setCached(cacheKey, external);
      return external;
    }

    // ── STEP 5: If any source returned metadata (no episodes), show as "updating" ──
    const bestMetadata = sb ?? proxy ?? blvietsub ?? ophim;
    if (bestMetadata?.movie?.name || bestMetadata?.movie?.slug) {
      console.warn(`[fetchMovieDetail] Returning metadata-only for "${slug}" from ${bestMetadata === sb ? 'supabase' : bestMetadata === proxy ? 'proxy' : bestMetadata === blvietsub ? 'blvietsub' : 'ophim'}`);
      const metaOnly: MovieDetailResponse = {
        ...bestMetadata,
        episodes: [],
      };
      setCached(cacheKey, metaOnly);
      return metaOnly;
    }

    // ── STEP 6: Truly not found on any source ──
    console.warn(`[fetchMovieDetail] ALL sources failed for slug: "${slug}"`);
    return null;
  })().finally(() => detailInflight.delete(slug));

  detailInflight.set(slug, promise);
  return promise;
}

/* ════════════════════════════════════════════
   TRENDING  (TTL = 4 tiếng)
   ════════════════════════════════════════════ */
function isTrailerOnly(episodeCurrent?: string): boolean {
  if (!episodeCurrent) return false;
  return episodeCurrent.toLowerCase().trim() === 'trailer';
}

function hotScore(
  item: MovieListResponse['items'][number],
  source: string
): number {
  const currentYear = new Date().getFullYear();
  const movieYear   = item.year ?? 0;
  const ep          = (item.episode_current ?? '').toLowerCase().trim();
  const isFull      = ep === 'full' || ep === 'full hd' || ep.startsWith('hoàn tất');
  const isCinema    = source === 'phim-chieu-rap';
  const yearDiff  = currentYear - movieYear;
  const yearScore =
    yearDiff <= 0  ? 60 :
    yearDiff === 1 ? 45 :
    yearDiff === 2 ? 30 :
    yearDiff === 3 ? 15 :
    yearDiff <= 5  ?  5 : 0;
  const mtime          = new Date(item.modified?.time ?? 0).getTime();
  const ageHours       = (Date.now() - mtime) / 3600000;
  const freshnessScore = Math.max(0, 80 - ageHours * 2);
  return yearScore + freshnessScore + (isFull ? 25 : 0) + (isCinema ? 15 : 0);
}

export async function fetchTrendingMovies(): Promise<MovieListResponse> {
  const cacheKey = '__trending__';
  const ttl = TTL_CONFIG.trending;
  const cached = getCached<MovieListResponse>(cacheKey, ttl);
  if (cached && !cached.stale) return cached.data;

  const ss = getSSCache<MovieListResponse>(SS_KEYS.trending, SS_TTL);
  if (ss) {
    apiCache.set(cacheKey, { data: ss, ts: Date.now() });
    return ss;
  }

  // Stale-while-revalidate: trả cũ + refresh ngầm
  if (cached?.stale) {
    const revalidatePromise = (async () => {
      try {
        const result = await computeTrending();
        apiCache.set(cacheKey, { data: result, ts: Date.now() });
        setSSCache(SS_KEYS.trending, result);
      } catch { /* silently keep stale */ }
    })();
    inflightMap.set(cacheKey, revalidatePromise as Promise<unknown>);
    return cached.data;
  }

  const result = await computeTrending();
  apiCache.set(cacheKey, { data: result, ts: Date.now() });
  setSSCache(SS_KEYS.trending, result);
  return result;
}

async function computeTrending(): Promise<MovieListResponse> {
  // Multi-source trending: try all LIST_SOURCES for fresh movies
  const allRequests = LIST_SOURCES.flatMap((src) => [
    { url: `${src.base}${src.listEndpoint}phim-moi-cap-nhat?page=1&sort_field=modified.time&sort_type=desc`, source: `phim-moi-${src.name}` },
    ...(src.mirror ? [{ url: `${src.mirror}${src.listEndpoint}phim-moi-cap-nhat?page=1&sort_field=modified.time&sort_type=desc`, source: `phim-moi-${src.name}-M` }] : []),
  ]);

  const results = await Promise.allSettled(
    allRequests.map(({ url, source }) =>
      fetchJSON<Record<string, unknown>>(url).then(d => ({ res: toMovieListResponse(d), source }))
    )
  );

  const seen = new Set<string>();
  type ScoredItem = { item: MovieListResponse['items'][number]; score: number };
  const scored: ScoredItem[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { res, source } = r.value;
    for (const item of res.items ?? []) {
      if (seen.has(item.slug)) continue;
      if (isTrailerOnly(item.episode_current)) continue;
      seen.add(item.slug);
      scored.push({ item, score: hotScore(item, source) });
    }
  }

  const top40 = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map(s => s.item);

  return {
    status: true,
    items: top40,
    pagination: { currentPage: 1, totalItems: top40.length, totalItemsPerPage: 40, totalPages: 1 },
  };
}

/* ════════════════════════════════════════════
   SERVER QUALITY SCORING — auto-pick best
   ════════════════════════════════════════════ */
interface ServerQualityInfo {
  index: number;
  score: number;
  resolution: string;
  hasM3u8: boolean;
  hasEmbed: boolean;
}
export const STREAM_SERVER_PRIORITY = ['OPHIM', 'KKPHIM', 'KHOPHIM', 'DM', 'SUPABASE', 'SS', 'OK', 'ABYSS', 'VK'] as const;
const FALLBACK_SERVER_AUTO_PICK_PENALTY = 500;
const SERVER_RECENT_BAD_HOST_PENALTY = 900;
const OPHIM_PREFERRED_SOURCE_BONUS = 380;
const KKPHIM_PREFERRED_SOURCE_BONUS = 360;
const DAILYMOTION_PREFERRED_SOURCE_BONUS = 240;

function normalizeServerPriorityText(value: string): string {
  return value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getServerPriorityRank(server: EpisodeServer, episode?: EpisodeData): number {
  const text = normalizeServerPriorityText([
    server.server_name,
    episode?.link_embed,
    episode?.link_m3u8,
  ].filter(Boolean).join(' '));

  const tokens = new Set(text.split(/\s+/).filter(Boolean));
  const compact = text.replace(/\s+/g, '');
  const joinedUrls = [
    episode?.link_embed,
    episode?.link_m3u8,
  ].filter(Boolean).join(' ').toLowerCase();
  const hasOphimSource =
    tokens.has('OPHIM') ||
    compact.includes('OPHIM') ||
    joinedUrls.includes('opstream') ||
    joinedUrls.includes('ophim');
  const hasKkPhimSource =
    tokens.has('KKPHIM') ||
    tokens.has('PHIMAPI') ||
    compact.includes('KKPHIM') ||
    compact.includes('PHIMAPI') ||
    joinedUrls.includes('phimapi.com') ||
    joinedUrls.includes('phimapi.net') ||
    joinedUrls.includes('kkphim') ||
    joinedUrls.includes('kkphimplayer');
  const hasDailymotionSource =
    compact.includes('DAILYMOTION') ||
    compact.includes('DAILY') ||
    compact.includes('DAILYLY') ||
    tokens.has('DL') ||
    /(^|[./])dai\.ly/i.test(String(episode?.link_embed || ''));
  const isOwnHlsSource = Boolean(episode?.link_m3u8) && (
    compact.includes('KHOPHIM') ||
    compact.includes('VIDEOKHOPHIMORG') ||
    compact.includes('SUPABASE')
  );
  if (hasOphimSource) {
    return STREAM_SERVER_PRIORITY.indexOf('OPHIM');
  }
  if (hasKkPhimSource) {
    return STREAM_SERVER_PRIORITY.indexOf('KKPHIM');
  }
  if (
    tokens.has('KHOPHIM') ||
    (tokens.has('KHO') && tokens.has('PHIM')) ||
    compact.includes('KHOPHIM') ||
    compact.includes('VIDEOKHOPHIMORG')
  ) {
    return STREAM_SERVER_PRIORITY.indexOf('KHOPHIM');
  }
  if (
    tokens.has('SUPABASE') ||
    tokens.has('ADMIN') ||
    tokens.has('MANUAL') ||
    tokens.has('MANUA') ||
    compact.includes('SUPABASE') ||
    compact.includes('ADMIN') ||
    compact.includes('MANUAL')
  ) {
    return STREAM_SERVER_PRIORITY.indexOf('SUPABASE');
  }
  if (hasDailymotionSource && !isOwnHlsSource) {
    return STREAM_SERVER_PRIORITY.indexOf('DM');
  }
  if (
    tokens.has('DM') ||
    tokens.has('DL') ||
    tokens.has('DAILYMOTION') ||
    compact.includes('DAILYMOTION') ||
    compact.includes('DAILY') ||
    compact.includes('DAILYLY')
  ) {
    return STREAM_SERVER_PRIORITY.indexOf('DM');
  }
  if (
    tokens.has('SS') ||
    tokens.has('SSPLAY') ||
    compact.includes('SSPLAY')
  ) {
    return STREAM_SERVER_PRIORITY.indexOf('SS');
  }
  if (
    tokens.has('ABYSS') ||
    tokens.has('ABYSSPLAYER') ||
    compact.includes('ABYSSPLAYER') ||
    compact.includes('SHORTICU')
  ) {
    return STREAM_SERVER_PRIORITY.indexOf('ABYSS');
  }

  const rank = STREAM_SERVER_PRIORITY.findIndex((code) =>
    code !== 'SUPABASE' && code !== 'KKPHIM' && (
    tokens.has(code) ||
    compact.includes(`SERVER${code}`) ||
    compact.includes(`SV${code}`) ||
    compact.includes(`[${code}]`)
    )
  );

  return rank >= 0 ? rank : STREAM_SERVER_PRIORITY.length;
}

function refreshQueerDetailCacheInBackground(
  cacheKey: string,
  primary: MovieDetailResponse,
  blvietsubPromise?: Promise<MovieDetailResponse | null>,
  ophimPromise?: Promise<MovieDetailResponse | null>
): void {
  if (!isQueerMovieDetail(primary.movie)) return;
  void Promise.all([
    blvietsubPromise ?? fetchMovieDetailFromBlvietsubForMovie(primary.movie),
    ophimPromise ?? fetchMovieDetailFromOPhimForMovie(primary.movie),
  ])
    .then(([blvietsub, ophim]) => {
      const merged = mergeQueerDetailWithSources(primary, blvietsub, ophim);
      if (merged && detailHasPlayableEpisodes(merged)) {
        setCached(cacheKey, merged);
      }
    })
    .catch(() => {});
}

async function getFreshQueerDetailWithTimeout(
  primary: MovieDetailResponse,
  blvietsubPromise?: Promise<MovieDetailResponse | null>,
  ophimPromise?: Promise<MovieDetailResponse | null>,
  timeoutMs = 2200
): Promise<MovieDetailResponse | null> {
  if (!isQueerMovieDetail(primary.movie)) return null;

  const work = Promise.all([
    blvietsubPromise ?? fetchMovieDetailFromBlvietsubForMovie(primary.movie),
    ophimPromise ?? fetchMovieDetailFromOPhimForMovie(primary.movie),
  ])
    .then(([blvietsub, ophim]) => {
      const merged = mergeQueerDetailWithSources(primary, blvietsub, ophim);
      return merged && detailHasPlayableEpisodes(merged) ? merged : null;
    })
    .catch(() => null);

  return Promise.race([
    work,
    new Promise<MovieDetailResponse | null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function getEpisodeQualityScore(ep: EpisodeData): number {
  const name = (ep.name ?? '').toLowerCase();
  let score = 0;
  if (name.includes('1080')) score += 15;
  else if (name.includes('720')) score += 10;
  else if (name.includes('480')) score += 5;
  if (ep.link_m3u8) score += 8;
  if (ep.link_embed) score += 2;
  return score;
}

function getUrlHost(value = ''): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isDailymotionEpisode(ep?: EpisodeData): boolean {
  if (!ep) return false;
  const host = getUrlHost(ep.link_embed || ep.link_m3u8 || '');
  const text = normalizeServerPriorityText([
    ep.link_embed,
    ep.link_m3u8,
    ep.filename,
    ep.name,
  ].filter(Boolean).join(' '));
  return (
    host.includes('dailymotion.com') ||
    host === 'dai.ly' ||
    text.includes('DAILYMOTION') ||
    text.includes('DAILY')
  );
}

function getRecentBadHostPenalty(ep: EpisodeData): number {
  if (typeof window === 'undefined') return 0;
  const host = getUrlHost(ep.link_m3u8 || ep.link_embed || '');
  if (!host) return 0;
  try {
    const raw = window.localStorage.getItem('khophim.bad-source-hosts.v1');
    const map = raw ? JSON.parse(raw) as Record<string, number> : {};
    const lastBadAt = Number(map[host] || 0);
    if (!lastBadAt) return 0;
    const ageMs = Date.now() - lastBadAt;
    return ageMs >= 30 * 60 * 1000 ? 0 : SERVER_RECENT_BAD_HOST_PENALTY;
  } catch {
    return 0;
  }
}

function getPriorityRankScore(rank: number): number {
  return rank < STREAM_SERVER_PRIORITY.length
    ? (STREAM_SERVER_PRIORITY.length - rank) * 95
    : 0;
}

function getBestPlayableEpisodeScore(server: EpisodeServer): number {
  const playable = (server.server_data ?? []).filter((ep) => hasPlayableUrl(ep) && !ep.is_scheduled);
  if (!playable.length) return -10000;

  return playable.reduce((best, ep) => {
    const score = getEpisodeReliabilityScore(ep) + getEpisodeQualityScore(ep);
    return Math.max(best, score);
  }, -10000);
}

function getEpisodeReliabilityScore(ep: EpisodeData): number {
  const m3u8 = String(ep.link_m3u8 || '').trim();
  const embed = String(ep.link_embed || '').trim();
  const url = m3u8 || embed;
  const host = getUrlHost(url);
  const lower = url.toLowerCase();
  let score = 0;

  if (!url) return -10000;
  if (!m3u8 && embed && isBlvietsubWatchPageUrl(embed)) return -10000;
  const healthStatus = String(ep.source_health_status || '').trim().toLowerCase();
  const failureCount = Number(ep.source_failure_count || 0);
  const responseMs = Number(ep.source_response_time_ms || 0);
  const sourcePriority = Number(ep.source_priority || 0);

  if (healthStatus === 'ok') score += 120;
  else if (healthStatus === 'unchecked') score += 8;
  else if (healthStatus === 'blocked') score -= failureCount >= 3 ? 180 : 55;
  else if (healthStatus === 'failed') score -= 220 + failureCount * 35;
  else if (healthStatus === 'dead') score -= 1000;

  if (Number.isFinite(responseMs) && responseMs > 0) {
    if (responseMs <= 1200) score += 55;
    else if (responseMs <= 2500) score += 25;
    else if (responseMs >= 7000) score -= 90;
    else if (responseMs >= 4500) score -= 45;
  }

  if (Number.isFinite(sourcePriority) && sourcePriority > 0) {
    score += Math.min(sourcePriority, 250) * 0.25;
  }

  if (m3u8) score += /\.m3u8(?:[?#].*)?$/i.test(m3u8) ? 130 : 115;
  if (/\.(mp4|webm|mov)(?:[?#].*)?$/i.test(embed)) score += 110;
  if (host.includes('video.khophim.org') || host.includes('supabase.co')) score += 120;
  if (host.includes('opstream') || host.includes('ophim') || lower.includes('ophim')) score += OPHIM_PREFERRED_SOURCE_BONUS;
  if (host.includes('phimapi.com') || host.includes('phimapi.net') || host.includes('kkphim') || lower.includes('kkphimplayer')) score += KKPHIM_PREFERRED_SOURCE_BONUS;
  if (host.includes('dailymotion.com') || host === 'dai.ly') score += DAILYMOTION_PREFERRED_SOURCE_BONUS;
  if (lower.includes('.m3u8')) score += 70;
  if (host.includes('ssplay')) score += 45;
  if (host.includes('abyssplayer') || host.includes('short.icu')) score += 20;
  if (host.includes('versondd.top')) score -= 1200;
  if (host.includes('blvietsub.com')) score -= 250;
  if (embed && !m3u8 && score < 20) score += 10;

  return score - getRecentBadHostPenalty(ep);
}

export function getServerQualityScore(server: EpisodeServer): number {
  const name = (server.server_name ?? '').toLowerCase();
  let score = 0;

  // Resolution score
  if (name.includes('1080') || name.includes('fhd') || name.includes('full hd')) score += 25;
  else if (name.includes('720') || name.includes('hd')) score += 18;
  else if (name.includes('480') || name.includes('sd')) score += 8;
  else if (name.includes('360') || name.includes('cam') || name.includes('ts')) score -= 15;

  // M3U8 preferred (HLS streaming, usually more stable & higher quality)
  const firstEp = server.server_data?.[0];
  if (firstEp?.link_m3u8) score += 10;
  if (firstEp?.link_embed) score += 3;
  score += getBestPlayableEpisodeScore(server);
  if ((server.server_data ?? []).some((ep) => isDailymotionEpisode(ep))) {
    score += DAILYMOTION_PREFERRED_SOURCE_BONUS;
  }

  // Vietnamese audio preferred (vietsub, thuyetminh, longtieng)
  const tokens = name.split(/[\s\-_#]+/).filter(Boolean);
  if (
    name.includes('vietsub') ||
    tokens.includes('tm') || name.includes('thuyetminh') || name.includes('thuyet-minh') || name.includes('thuyet_minh') ||
    tokens.includes('lt') || name.includes('longtieng') || name.includes('long-tieng') || name.includes('long_tieng')
  ) score += 4;

  // Prefer longer episode list (more complete)
  const epCount = server.server_data?.length ?? 0;
  if (epCount > 0) score += Math.min(epCount, 10);
  const priorityRank = getServerPriorityRank(server, firstEp);
  score += getPriorityRankScore(priorityRank);
  return score;
}

export function pickBestServerIndex(episodes: EpisodeServer[]): number {
  if (!episodes.length) return 0;
  let bestIndex = 0;
  let bestScore = getServerQualityScore(episodes[0]);
  for (let i = 1; i < episodes.length; i++) {
    const score = getServerQualityScore(episodes[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function getServerQualityInfo(episodes: EpisodeServer[]): ServerQualityInfo[] {
  return episodes.map((srv, i) => {
    const name = (srv.server_name ?? '').toLowerCase();
    let resolution = 'Auto';
    if (name.includes('1080') || name.includes('fhd')) resolution = '1080p';
    else if (name.includes('720') || name.includes('hd')) resolution = '720p';
    else if (name.includes('480') || name.includes('sd')) resolution = '480p';
    else if (name.includes('360')) resolution = '360p';

    const firstEp = srv.server_data?.[0];
    return {
      index: i,
      score: getServerQualityScore(srv),
      resolution,
      hasM3u8: !!firstEp?.link_m3u8,
      hasEmbed: !!firstEp?.link_embed,
    };
  });
}

export function findHighestQualityEpisode(
  serverData: EpisodeData[],
  targetName: string
): EpisodeData | undefined {
  const candidates = serverData.filter(ep =>
    ep.name === targetName || ep.slug === targetName || ep.filename?.includes(targetName)
  );
  if (candidates.length <= 1) return candidates[0];

  // Pick candidate with highest quality indicators
  return candidates.reduce((best, current) => {
    const bName = (best.name ?? '').toLowerCase();
    const cName = (current.name ?? '').toLowerCase();
    let bScore = 0;
    let cScore = 0;

    if (bName.includes('1080')) bScore += 25;
    else if (bName.includes('720')) bScore += 18;
    else if (bName.includes('480')) bScore += 8;
    if (best.link_m3u8) bScore += 10;

    if (cName.includes('1080')) cScore += 25;
    else if (cName.includes('720')) cScore += 18;
    else if (cName.includes('480')) cScore += 8;
    if (current.link_m3u8) cScore += 10;

    return cScore > bScore ? current : best;
  });
}

export function findHighestQualityEpisodeBySlug(
  serverData: EpisodeData[],
  targetSlug: string
): EpisodeData | undefined {
  const candidates = serverData.filter(ep => ep.slug === targetSlug || ep.name === targetSlug);
  if (candidates.length <= 1) return candidates[0];

  return candidates.reduce((best, current) => {
    let bScore = 0;
    let cScore = 0;
    const bName = (best.name ?? '').toLowerCase();
    const cName = (current.name ?? '').toLowerCase();

    if (bName.includes('1080')) bScore += 25;
    else if (bName.includes('720')) bScore += 18;
    else if (bName.includes('480')) bScore += 8;
    if (best.link_m3u8) bScore += 10;

    if (cName.includes('1080')) cScore += 25;
    else if (cName.includes('720')) cScore += 18;
    else if (cName.includes('480')) cScore += 8;
    if (current.link_m3u8) cScore += 10;

    return cScore > bScore ? current : best;
  });
}

/** Kiểm tra episode có ít nhất một URL phát được không */
export function hasPlayableUrl(ep: EpisodeData): boolean {
  const embed = String(ep.link_embed || '').trim();
  return !!(ep.link_m3u8?.trim() || (embed && !isBlvietsubWatchPageUrl(embed)));
}

/** Kiểm tra server có ít nhất một episode phát được không */
export function hasPlayableEpisodes(srv: EpisodeServer): boolean {
  return srv.server_data?.some((ep) => hasPlayableUrl(ep)) ?? false;
}

/** Tìm tập phim chất lượng cao nhất trong TẤT CẢ server */
export function pickBestEpisodeAcrossServers(
  episodes: EpisodeServer[],
  targetEpSlug?: string,
): { serverIndex: number; episode: EpisodeData } | null {
  if (!episodes.length) return null;

  const allOptions: { serverIndex: number; episode: EpisodeData; score: number; priorityRank: number }[] = [];

  for (let si = 0; si < episodes.length; si++) {
    const srv = episodes[si];
    const srvScore = getServerQualityScore(srv);
    const list = srv.server_data ?? [];

    for (const ep of list) {
      if (targetEpSlug && ep.slug !== targetEpSlug) continue;
      // BỎ QUA episode không có URL phát được
      if (!hasPlayableUrl(ep)) continue;

      let epScore = srvScore;
      epScore += getEpisodeQualityScore(ep);
      epScore += getEpisodeReliabilityScore(ep);
      const priorityRank = getServerPriorityRank(srv, ep);
      epScore += getPriorityRankScore(priorityRank);

      allOptions.push({ serverIndex: si, episode: ep, score: epScore, priorityRank });
    }
  }

  if (!allOptions.length) return null;

  // Sort by score descending, pick best
  allOptions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.priorityRank - b.priorityRank;
  });
  const best = allOptions[0];
  return { serverIndex: best.serverIndex, episode: best.episode };
}
export function pickBestEpisodeByPriority(
  episodes: EpisodeServer[],
  targetEpSlug?: string,
): { serverIndex: number; episode: EpisodeData; priorityLabel: string | null } | null {
  const candidates: { serverIndex: number; episode: EpisodeData; priorityRank: number; qualityScore: number }[] = [];
  const targetText = targetEpSlug?.trim() ?? '';
  const targetNumber = getEpisodeNumberFromText(targetText);

  episodes.forEach((server, serverIndex) => {
    for (const episode of server.server_data ?? []) {
      if (targetText) {
        const episodeNumber = getEpisodeNumberFromData(episode);
        const matchesTarget =
          episode.slug === targetText ||
          episode.name === targetText ||
          (targetNumber > 0 && episodeNumber === targetNumber);
        if (!matchesTarget) continue;
      }
      if (!hasPlayableUrl(episode)) continue;
      candidates.push({
        serverIndex,
        episode,
        priorityRank: getServerPriorityRank(server, episode),
        qualityScore:
          getServerQualityScore(server) +
          getEpisodeReliabilityScore(episode) +
          getEpisodeQualityScore(episode) -
          (serverIndex === 0 ? FALLBACK_SERVER_AUTO_PICK_PENALTY : 0),
      });
    }
  });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const aDirect = a.episode.link_m3u8 || /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(a.episode.link_embed || '');
    const bDirect = b.episode.link_m3u8 || /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(b.episode.link_embed || '');
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    if (Boolean(aDirect) !== Boolean(bDirect)) return bDirect ? 1 : -1;
    return a.priorityRank - b.priorityRank;
  });

  const best = candidates[0];
  const priorityLabel = best.priorityRank < STREAM_SERVER_PRIORITY.length
    ? STREAM_SERVER_PRIORITY[best.priorityRank]
    : null;

  return { serverIndex: best.serverIndex, episode: best.episode, priorityLabel };
}
/* ════════════════════════════════════════════
   AUTO-PICK BEST SERVER — static score + latency
   ════════════════════════════════════════════ */
export function getAnonymousServerDisplay(serverName: string, index: number): string {
  const normalized = normalizeServerPriorityText(serverName);
  const compact = normalized.replace(/\s+/g, '');
  if (compact.includes('KHOPHIM') || (normalized.includes('KHO') && normalized.includes('PHIM'))) return 'KhoPhim';
  if (compact.includes('BLVIETSUB')) return 'BLVietsub';
  if (compact.includes('OPHIM')) return 'OPhim';
  if (compact.includes('KKPHIM') || compact.includes('PHIMAPI')) return 'KKPhim';
  const match = serverName.match(/\[(.*?)\]/);
  if (match && match[1]) return `[${match[1]}]`;
  return `Server ${index + 1}`;
}

/* ════════════════════════════════════════════
   DEDUPLICATE & LIMIT SERVERS — clean UI
   ════════════════════════════════════════════ */
export function detectServerType(serverName: string): 'khophim' | 'vietsub' | 'thuyetminh' | 'longtieng' | 'other' {
  const n = serverName.toLowerCase();
  // Remove bracketed suffixes like [NguonC], [OPHIM], etc. for cleaner matching
  const clean = n.replace(/\[.*?\]/g, '').trim();
  const tokens = clean.split(/[\s\-_#]+/).filter(Boolean);
  const priorityText = normalizeServerPriorityText(serverName);
  const compactPriority = priorityText.replace(/\s+/g, '');

  if (
    compactPriority.includes('KHOPHIM') ||
    (priorityText.includes('KHO') && priorityText.includes('PHIM'))
  ) {
    return 'khophim';
  }

  // --- Thuyết Minh (check before vietsub to avoid false positives) ---
  if (
    clean.includes('thuyết minh') || clean.includes('thuyet minh') ||
    clean.includes('thuyetminh') || clean.includes('thuyet-minh') || clean.includes('thuyet_minh') ||
    tokens.includes('tm') || clean === 'tm' ||
    n.includes('thuyết minh') || n.includes('thuyet minh') || n.includes('thuyetminh')
  ) {
    return 'thuyetminh';
  }

  // --- Lồng Tiếng ---
  if (
    clean.includes('lồng tiếng') || clean.includes('long tieng') ||
    clean.includes('longtieng') || clean.includes('long-tieng') || clean.includes('long_tieng') ||
    tokens.includes('lt') || clean === 'lt' ||
    clean.includes('dubbed') || clean.includes('dub') ||
    n.includes('lồng tiếng') || n.includes('long tieng') || n.includes('longtieng')
  ) {
    return 'longtieng';
  }

  // --- Vietsub ---
  if (
    clean.includes('vietsub') || clean.includes('viet sub') ||
    (clean.includes('sub') && !clean.includes('dub')) ||
    ['ss', 'vk', 'ok', 'hx', 'dl'].includes(compactPriority.toLowerCase()) ||
    tokens.includes('vs') || clean === 'vs' ||
    n.includes('vietsub') || n.includes('viet sub')
  ) {
    return 'vietsub';
  }

  return 'other';
}

export interface ServerTypeStyle {
  label: string;
  icon: string;
  activeClass: string;
  inactiveClass: string;
  dotClass: string;
}

export function getServerTypeStyle(type: string): ServerTypeStyle {
  switch (type) {
    case 'khophim':
      return {
        label: 'KhoPhim',
        icon: 'ri-cloud-line',
        activeClass: 'bg-red-500 text-white border-red-600',
        inactiveClass: 'bg-red-500/10 text-red-400 border-red-500/25 hover:bg-red-500/20',
        dotClass: 'bg-red-400',
      };
    case 'vietsub':
      return {
        label: 'Vietsub',
        icon: 'ri-file-text-line',
        activeClass: 'bg-emerald-500 text-white border-emerald-600',
        inactiveClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20',
        dotClass: 'bg-emerald-400',
      };
    case 'thuyetminh':
      return {
        label: 'Thuyết Minh',
        icon: 'ri-mic-2-line',
        activeClass: 'bg-orange-500 text-white border-orange-600',
        inactiveClass: 'bg-orange-500/10 text-orange-400 border-orange-500/25 hover:bg-orange-500/20',
        dotClass: 'bg-orange-400',
      };
    case 'longtieng':
      return {
        label: 'Lồng Tiếng',
        icon: 'ri-volume-up-line',
        activeClass: 'bg-amber-500 text-white border-amber-600',
        inactiveClass: 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20',
        dotClass: 'bg-amber-400',
      };
    default:
      return {
        label: 'Nguồn',
        icon: 'ri-server-line',
        activeClass: 'bg-red-500 text-white border-red-600',
        inactiveClass: 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white',
        dotClass: 'bg-white/40',
      };
  }
}

export function deduplicateAndLimitServers(episodes: EpisodeServer[]): EpisodeServer[] {
  if (!episodes.length) return [];

  // 0. Chỉ giữ server có ít nhất 1 episode phát được
  const playableOnly = episodes
    .map((srv) => {
      const originalData = srv.server_data ?? [];
      const cleanData = originalData.filter((ep) => ep.is_scheduled || hasPlayableUrl(ep));
      return cleanData.length === originalData.length ? srv : { ...srv, server_data: cleanData };
    })
    .filter((srv) => srv.server_data.length > 0);
  if (!playableOnly.length) return [];

  // 1. Sắp xếp: vietsub → thuyetminh → longtieng → other, trong mỗi nhóm sort by quality
  const order: Record<string, number> = { khophim: 0, vietsub: 1, thuyetminh: 2, longtieng: 3, other: 4 };
  const sorted = [...playableOnly].sort((a, b) => {
    const scoreA = getServerQualityScore(a);
    const scoreB = getServerQualityScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;

    const rankA = getServerPriorityRank(a, a.server_data?.[0]);
    const rankB = getServerPriorityRank(b, b.server_data?.[0]);
    if (rankA !== rankB) return rankA - rankB;

    const typeA = order[detectServerType(a.server_name ?? '')] ?? 99;
    const typeB = order[detectServerType(b.server_name ?? '')] ?? 99;
    if (typeA !== typeB) return typeA - typeB;
    return 0;
  });

  return sorted;
}

export function extractEpNumber(text: string): number {
  return getEpisodeNumberFromText(text);
}

export interface FlatEpisode {
  id: number | string;
  episode_number: number;
  episode_name: string;
  slug: string;
  server_name: string;
  link_m3u8: string;
  link_embed: string;
  subtitle_url: string;
  thumbnail_url: string;
  duration: string;
  source: string;
  is_backup: boolean;
  source_origin: 'admin' | 'ophim';
  is_hidden?: boolean;
}

function normalizeEpisodeKeyPart(value: string): string {
  return value.trim().toLowerCase().normalize('NFC');
}

function buildEpisodeDedupKeys(serverName: string, slug: string, episodeNumber: number, name = ''): string[] {
  const server = normalizeEpisodeKeyPart(serverName || 'Nguồn');
  const keys: string[] = [];
  const normalizedSlug = normalizeEpisodeKeyPart(slug || '');
  const normalizedName = normalizeEpisodeKeyPart(name || '');
  if (normalizedSlug) keys.push(`${server}|slug:${normalizedSlug}`);
  if (normalizedName) keys.push(`${server}|name:${normalizedName}`);
  if (Number.isFinite(episodeNumber)) keys.push(`${server}|num:${episodeNumber}`);
  return keys;
}

function hasSeenEpisode(seen: Set<string>, serverName: string, slug: string, episodeNumber: number, name = ''): boolean {
  return buildEpisodeDedupKeys(serverName, slug, episodeNumber, name).some((key) => seen.has(key));
}

function markSeenEpisode(seen: Set<string>, serverName: string, slug: string, episodeNumber: number, name = ''): void {
  for (const key of buildEpisodeDedupKeys(serverName, slug, episodeNumber, name)) {
    seen.add(key);
  }
}

function isHiddenEpisodeSource(source: unknown): boolean {
  return String(source || '').trim().toLowerCase() === 'hidden';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

/**
 * Query & merge episodes from ALL three tables:
 * - movie_episodes (admin manual)
 * - episodes (OPhim JSONB auto-sync)
 * - streams (OPhim legacy auto-sync)
 *
 * Admin episodes have highest priority (deduplication wins).
 * Returns both server-centric (for detail page) and flat list (for admin).
 */
export async function getMergedEpisodes(
  movieId: string,
  signal?: AbortSignal,
  options: { includeLiveFallbacks?: boolean } = {}
): Promise<{
  episodeServers: EpisodeServer[];
  flatEpisodes: FlatEpisode[];
  maxEpisodeNumber: number;
}> {
  if (!isUuid(movieId)) {
    return {
      episodeServers: [],
      flatEpisodes: [],
      maxEpisodeNumber: 0,
    };
  }
  const includeLiveFallbacks = options.includeLiveFallbacks ?? true;
  const querySignal = signal ?? new AbortController().signal;
  const [{ data: meRows, error: meErr }, { data: oldEps }, { data: streams }, { data: movieRow }] = await Promise.all([
    supabase
      .from('movie_episodes')
      .select('id, episode_number, slug, server_name, source, episode_name, link_embed, link_m3u8, subtitle_url, thumbnail_url, duration, is_backup')
      .eq('movie_id', movieId)
      .order('episode_number', { ascending: true })
      .abortSignal(querySignal),
    supabase
      .from('episodes')
      .select('server_name, episode_number, episode_slug, episode_name, link_m3u8, link_embed, subtitle_url, server_data')

      .eq('movie_id', movieId)
      .order('episode_number', { ascending: true })
      .abortSignal(querySignal),
    supabase
      .from('streams')
      .select('stream_url, embed_url, episode_slug, server_name, subtitle_url, priority, health_status, response_time_ms, failure_count')
      .eq('movie_id', movieId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('response_time_ms', { ascending: true, nullsFirst: false })
      .abortSignal(querySignal),
    supabase
      .from('movies')
      .select('id, slug, name, origin_name, title_vi, title_en, title_zh, source_site, source_name, showtimes, category, episode_current, episode_total, current_episode, total_episodes')
      .eq('id', movieId)
      .abortSignal(querySignal)
      .maybeSingle(),
  ]);

  if (meErr) {
    console.warn('[getMergedEpisodes] movie_episodes error:', meErr.message);
  }

  const flatEpisodes: FlatEpisode[] = [];
  const serverMap = new Map<string, EpisodeData[]>();
  const seen = new Set<string>();
  let maxEpisodeNumber = 0;

  const movieEpisodeRows = [...(meRows ?? [])].sort((a, b) => {
    const aHidden = isHiddenEpisodeSource(a.source);
    const bHidden = isHiddenEpisodeSource(b.source);
    if (aHidden !== bHidden) return aHidden ? -1 : 1;
    const aApi = ['ophim', 'phimapi', 'kkphim'].includes(String(a.source || '').trim().toLowerCase());
    const bApi = ['ophim', 'phimapi', 'kkphim'].includes(String(b.source || '').trim().toLowerCase());
    if (aApi !== bApi) return aApi ? 1 : -1;
    return Number(a.episode_number ?? 0) - Number(b.episode_number ?? 0);
  });

  // 1. movie_episodes overrides. Manual rows win; hidden rows block lower-priority API rows.
  for (const ep of movieEpisodeRows) {
    const num = Number(ep.episode_number ?? 0);
    if (num > maxEpisodeNumber) maxEpisodeNumber = num;

    const slug = ep.slug || `tap-${num}`;
    const serverName = ep.server_name || 'Nguồn';
    const source = String(ep.source || 'manual');
    const isHidden = isHiddenEpisodeSource(source);
    const sourceOrigin: 'admin' | 'ophim' = ['ophim', 'phimapi', 'kkphim'].includes(source.toLowerCase()) ? 'ophim' : 'admin';
    if (!isHidden && num > maxEpisodeNumber) maxEpisodeNumber = num;
    const epData: EpisodeData = {
      name: ep.episode_name || `Tập ${num}`,
      slug,
      filename: '',
      link_embed: normalizeDailymotionUrl(ep.link_embed || ''),
      link_m3u8: ep.link_m3u8 || '',
      episode_number: num || undefined,
      subtitle_url: ep.subtitle_url || '',
    };

    
    flatEpisodes.push({
      id: ep.id,
      episode_number: num,
      episode_name: ep.episode_name || `Tập ${num}`,
      slug,
      server_name: serverName,
      link_m3u8: ep.link_m3u8 || '',
      link_embed: ep.link_embed || '',
      subtitle_url: ep.subtitle_url || '',  
      thumbnail_url: ep.thumbnail_url || '',
      duration: ep.duration || '',
      source,
      is_backup: Boolean(ep.is_backup),
      source_origin: isHidden ? 'admin' : sourceOrigin,
      is_hidden: isHidden,
    });
    const alreadySeen = hasSeenEpisode(seen, serverName, slug, num, epData.name);
    markSeenEpisode(seen, serverName, slug, num, epData.name);
    if (isHidden || alreadySeen) continue;

    if (!serverMap.has(serverName)) serverMap.set(serverName, []);
    serverMap.get(serverName)!.push(epData);
  }

  // 2. Episodes table — now normalized: one row per episode
  for (const row of oldEps ?? []) {
    const serverName = String(row.server_name || 'Nguồn');
    let epData: EpisodeData;
    const num = Number(row.episode_number ?? 0);
    const slug = String(row.episode_slug || (num > 0 ? String(num) : 'full'));

    // Prefer normalized columns (new schema)
    if (row.link_m3u8 || row.link_embed || row.episode_name || row.episode_slug) {
      epData = {
        name: String(row.episode_name || (num > 0 ? `Tập ${num}` : 'Full')),
        slug,
        filename: '',
        link_embed: normalizeDailymotionUrl(String(row.link_embed || '')),
        link_m3u8: String(row.link_m3u8 || ''),
        episode_number: num || undefined,
        subtitle_url: String(row.subtitle_url || ''),
      };
    } else if (row.server_data && typeof row.server_data === 'object' && !Array.isArray(row.server_data)) {
      // Legacy object format (server_data is a single episode object)
      const sd = row.server_data as Record<string, unknown>;
      epData = {
        name: String(sd.name || ''),
        slug: String(sd.slug || ''),
        filename: String(sd.filename || ''),
        link_embed: normalizeDailymotionUrl(String(sd.link_embed || '')),
        link_m3u8: String(sd.link_m3u8 || ''),
        episode_number: num || getEpisodeNumberFromText(String(sd.slug || sd.name || '')) || undefined,
        subtitle_url: String(sd.subtitle_url || sd.subtitle || ''),
      };
    } else if (Array.isArray(row.server_data)) {
      // Legacy array format (server_data is array of episodes — rare, ~105 rows)
      const sds = row.server_data as EpisodeData[];
      for (const ep of sds) {
        const epNum = epSortKey(ep);
        if (epNum > maxEpisodeNumber && epNum !== Infinity) maxEpisodeNumber = epNum;
        const epSlug = ep.slug || ep.name || '';
        const numericEp = epNum === Infinity ? 0 : epNum;
        if (hasSeenEpisode(seen, serverName, epSlug, numericEp, ep.name || '')) continue;
        markSeenEpisode(seen, serverName, epSlug, numericEp, ep.name || '');

        flatEpisodes.push({
          id: -1,
          episode_number: numericEp,
          episode_name: ep.name || '',
          slug: epSlug,
          server_name: serverName,
          link_m3u8: ep.link_m3u8 || '',
          link_embed: ep.link_embed || '',
          subtitle_url: ep.subtitle_url || '',
          thumbnail_url: '',
          duration: '',
          source: 'ophim',
          is_backup: false,
          source_origin: 'ophim',
        });

        if (!serverMap.has(serverName)) serverMap.set(serverName, []);
        serverMap.get(serverName)!.push({
          ...ep,
          link_embed: normalizeDailymotionUrl(ep.link_embed || ''),
          episode_number: numericEp || ep.episode_number,
        });
      }
      continue; // skip the rest of this iteration — array was already handled inline
    } else {
      continue;
    }

    if (num > maxEpisodeNumber) maxEpisodeNumber = num;

    if (hasSeenEpisode(seen, serverName, slug, num, epData.name)) continue;
    markSeenEpisode(seen, serverName, slug, num, epData.name);

    flatEpisodes.push({
      id: -1,
      episode_number: num,
      episode_name: epData.name,
      slug,
      server_name: serverName,
      link_m3u8: epData.link_m3u8 || '',
      link_embed: epData.link_embed || '',
      subtitle_url: epData.subtitle_url || '',
      thumbnail_url: '',
      duration: '',
      source: 'ophim',
      is_backup: false,
      source_origin: 'ophim',
    });

    if (!serverMap.has(serverName)) serverMap.set(serverName, []);
    serverMap.get(serverName)!.push(epData);
  }

  // 3. Streams table (legacy auto-sync) — ONLY include if stream_url or embed_url is non-empty
  for (const s of streams ?? []) {
    const sm = s as Record<string, unknown>;
    const streamUrl = String(sm.stream_url || '').trim();
    const embedUrl = String(sm.embed_url || '').trim();

    // STRICT: skip dead streams — no playable URL
    if (!streamUrl && !embedUrl) continue;
    const healthStatus = String(sm.health_status || 'unchecked').toLowerCase();
    const failureCount = Number(sm.failure_count || 0);
    if (healthStatus === 'dead' || (healthStatus === 'failed' && failureCount >= 5)) continue;

    const slug = String(sm.episode_slug || 'full');
    const num = slug === 'full' ? 0 : extractEpNumber(slug);
    if (num > maxEpisodeNumber) maxEpisodeNumber = num;

    const serverName = String(sm.server_name || 'Nguồn');

    const epData: EpisodeData = {
      name: slug === 'full' ? 'Full' : `Tập ${num || slug}`,
      slug,
      filename: '',
      link_embed: normalizeDailymotionUrl(embedUrl),
      link_m3u8: streamUrl,
      episode_number: num || undefined,
      subtitle_url: String(sm.subtitle_url || ''),
      source_health_status: healthStatus || 'unchecked',
      source_response_time_ms: Number(sm.response_time_ms || 0) || undefined,
      source_failure_count: failureCount || undefined,
      source_priority: Number(sm.priority || 0) || undefined,
    };
    if (hasSeenEpisode(seen, serverName, slug, num, epData.name)) continue;
    markSeenEpisode(seen, serverName, slug, num, epData.name);

    flatEpisodes.push({
      id: -1,
      episode_number: num,
      episode_name: epData.name,
      slug,
      server_name: serverName,
      link_m3u8: epData.link_m3u8,
      link_embed: epData.link_embed,
      subtitle_url: epData.subtitle_url || '',
      thumbnail_url: '',
      duration: '',
      source: 'ophim',
      is_backup: false,
      source_origin: 'ophim',
    });

    if (!serverMap.has(serverName)) serverMap.set(serverName, []);
    serverMap.get(serverName)!.push(epData);
  }

  // 4. BLVietsub live fallback for Vũ trụ đam mỹ movies.
  // Admin/manual rows still win, but newer BLSub episodes remain visible in add-movie.
  const blvietsubDetail = includeLiveFallbacks && movieRow
    ? await fetchMovieDetailFromBlvietsubForMovie(movieRow as unknown as Partial<MovieDetail>)
    : null;
  if (blvietsubDetail && detailHasPlayableEpisodes(blvietsubDetail)) {
    for (const server of blvietsubDetail.episodes ?? []) {
      const serverName = server.server_name || 'BLVietsub';
      for (const ep of server.server_data ?? []) {
        if (!hasPlayableUrl(ep)) continue;
        const num = getEpisodeNumberFromData(ep);
        const slug = ep.slug || (num > 0 ? `tap-${num}` : normalizeMatchText(ep.name));
        if (num > maxEpisodeNumber) maxEpisodeNumber = num;
        if (hasSeenEpisode(seen, serverName, slug, num, ep.name || '')) continue;
        markSeenEpisode(seen, serverName, slug, num, ep.name || '');

        const normalizedEp = {
          ...ep,
          slug,
          link_embed: normalizeDailymotionUrl(ep.link_embed || ''),
          link_m3u8: ep.link_m3u8 || '',
          episode_number: num || ep.episode_number,
          subtitle_url: ep.subtitle_url || '',
        };

        flatEpisodes.push({
          id: `blvietsub-${normalizeMatchText(serverName)}-${slug}`,
          episode_number: num,
          episode_name: ep.name || (num > 0 ? `Tập ${num}` : slug),
          slug,
          server_name: serverName,
          link_m3u8: normalizedEp.link_m3u8,
          link_embed: normalizedEp.link_embed,
          subtitle_url: normalizedEp.subtitle_url,
          thumbnail_url: '',
          duration: '',
          source: 'blvietsub',
          is_backup: false,
          source_origin: 'ophim',
        });

        if (!serverMap.has(serverName)) serverMap.set(serverName, []);
        serverMap.get(serverName)!.push(normalizedEp);
      }
    }
  }

  // 5. OPhim live fallback for Vu tru dam my movies when the title/id matches exactly.
  // Keep it as separate OPhim servers so admins can compare quality without overwriting manual rows.
  const ophimDetail = includeLiveFallbacks && movieRow
    ? await fetchMovieDetailFromOPhimForMovie(movieRow as unknown as Partial<MovieDetail>)
    : null;
  if (ophimDetail && detailHasPlayableEpisodes(ophimDetail)) {
    for (const server of ophimDetail.episodes ?? []) {
      const serverName = server.server_name || 'OPhim';
      for (const ep of server.server_data ?? []) {
        if (!hasPlayableUrl(ep)) continue;
        const num = getEpisodeNumberFromData(ep);
        const slug = ep.slug || (num > 0 ? `tap-${num}` : normalizeMatchText(ep.name));
        if (num > maxEpisodeNumber) maxEpisodeNumber = num;
        if (hasSeenEpisode(seen, serverName, slug, num, ep.name || '')) continue;
        markSeenEpisode(seen, serverName, slug, num, ep.name || '');

        const normalizedEp = {
          ...ep,
          slug,
          link_embed: normalizeDailymotionUrl(ep.link_embed || ''),
          link_m3u8: ep.link_m3u8 || '',
          episode_number: num || ep.episode_number,
          subtitle_url: ep.subtitle_url || '',
        };

        flatEpisodes.push({
          id: `ophim-${normalizeMatchText(serverName)}-${slug}`,
          episode_number: num,
          episode_name: ep.name || (num > 0 ? `Tap ${num}` : slug),
          slug,
          server_name: serverName,
          link_m3u8: normalizedEp.link_m3u8,
          link_embed: normalizedEp.link_embed,
          subtitle_url: normalizedEp.subtitle_url,
          thumbnail_url: '',
          duration: '',
          source: 'ophim',
          is_backup: false,
          source_origin: 'ophim',
        });

        if (!serverMap.has(serverName)) serverMap.set(serverName, []);
        serverMap.get(serverName)!.push(normalizedEp);
      }
    }
  }

  // Sort episodes within each server by number
  for (const [, eps] of serverMap) {
    eps.sort((a, b) => epSortKey(a) - epSortKey(b));
  }

  const episodeServers: EpisodeServer[] = [];
  for (const [serverName, serverData] of serverMap) {
    episodeServers.push({ server_name: serverName, server_data: serverData });
  }

  // Sort flat: by episode_number asc, admin first if same number, then server_name
  flatEpisodes.sort((a, b) => {
    if (a.episode_number !== b.episode_number) return a.episode_number - b.episode_number;
    if (a.source_origin === 'admin' && b.source_origin !== 'admin') return -1;
    if (a.source_origin !== 'admin' && b.source_origin === 'admin') return 1;
    return a.server_name.localeCompare(b.server_name);
  });

  return { episodeServers, flatEpisodes, maxEpisodeNumber };
}

/** Xóa toàn bộ cache liên quan đến một phim sau khi admin sửa đổi */
export function evictAllMovieCaches(slug: string): void {
  const cacheKeys = [
    `detail_${slug}`,
    `detail_v2_${slug}`,
    `detail_v3_${slug}`,
    `detail_v4_${slug}`,
    `detail_v5_${slug}`,
    `detail_v6_${slug}`,
  ];
  // 1. RAM cache
  cacheKeys.forEach((key) => apiCache.delete(key));
  detailInflight.delete(slug);

  // 2. sessionStorage
  try {
    const keys = Object.keys(sessionStorage);
    for (const k of keys) {
      if (
        k.includes(slug) ||
        k.startsWith('detail_') ||
        k.startsWith('search_v') ||
        k === SUPABASE_SEARCH_INDEX_KEY ||
        k.includes('queer') ||
        k.includes('home')
      ) {
        sessionStorage.removeItem(k);
      }
    }
  } catch { /* quota */ }

  // 3. localStorage – chỉ xóa progress/resume, giữ lịch sử xem */
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if ((k.includes(slug) || k.includes('watch_progress') || k.includes('resume_watch')) &&
          (k.includes('progress') || k.includes('resume'))) {
        localStorage.removeItem(k);
      }
    }
  } catch { /* quota */ }

  if (import.meta.env.DEV) console.log(`[evictAllMovieCaches] Cleared all caches for slug: ${slug}`);
}

// Alias backward-compatible
export { evictAllMovieCaches as evictDetailCache };

export async function fetchHomePageData(
  sections: string[],
  options: { signal?: AbortSignal } = {},
): Promise<{
  status: boolean;
  source: 'cache' | 'stale' | 'fresh';
  sections: Record<string, Movie[]>;
}> {
  if (!SUPABASE_URL) {
    throw new Error('Supabase config missing');
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error('Supabase anon key missing');
  }

  const url = new URL(`${SUPABASE_URL}/functions/v1/home-proxy`);
  url.searchParams.set('sections', sections.join(','));
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) controller.abort(options.signal.reason);
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      cache: 'default',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`home-proxy returned ${res.status}`);
    }
    const data = (await res.json()) as {
      status: boolean;
      source: 'cache' | 'stale' | 'fresh';
      sections: Record<string, unknown[]>;
    };

    const parsedSections: Record<string, Movie[]> = {};
    for (const [key, items] of Object.entries(data.sections)) {
      parsedSections[key] = (items as unknown[])
        .map((it) => parseMovieItem(it))
        .filter(Boolean) as Movie[];
    }

    if (import.meta.env.DEV) {
      console.log(
        '[fetchHomePageData] source=%s sections=%o',
        data.source,
        Object.fromEntries(Object.entries(parsedSections).map(([k, v]) => [k, v.length]))
      );
    }

    return { status: data.status, source: data.source, sections: parsedSections };
  } catch (err) {
    clearTimeout(timer);
    console.warn('[fetchHomePageData] Failed:', (err as Error).message);
    throw err;
  } finally {
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

function parseMovieItem(raw: unknown): Movie | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!m.slug || !m.name) return null;
  const displayName = getMovieDisplayName({
    name: String(m.name || ''),
    title_vi: String(m.title_vi || ''),
    title_en: String(m.title_en || ''),
    origin_name: String(m.origin_name || ''),
  });
  return {
    _id: String(m._id ?? m.id ?? ''),
    name: displayName,
    slug: String(m.slug),
    origin_name: String(m.origin_name ?? ''),
    type: String(m.type ?? 'single'),
    thumb_url: String(m.thumb_url ?? ''),
    poster_url: String(m.poster_url ?? ''),
    quality: String(m.quality ?? 'HD'),
    lang: String(m.lang ?? 'Vietsub'),
    year: Number(m.year ?? 0),
    episode_current: String(m.episode_current ?? ''),
    episode_total: String(m.episode_total ?? ''),
    current_episode: Number(m.current_episode || 0) || undefined,
    total_episodes: Number(m.total_episodes || 0) || undefined,
    schedule_type: (m.schedule_type as MovieItem['schedule_type']) || '',
    release_time: String(m.release_time ?? '') || undefined,
    release_day: m.release_day === null || m.release_day === undefined ? undefined : Number(m.release_day),
    schedule_timezone: String(m.schedule_timezone ?? '') || undefined,
    release_at: String(m.release_at ?? '') || undefined,
    next_episode_at: String(m.next_episode_at ?? '') || undefined,
    next_episode_name: String(m.next_episode_name ?? '') || undefined,
    schedule_note: String(m.schedule_note ?? '') || undefined,
    time: String(m.time ?? ''),
    modified: { time: String((m.modified as { time?: string } | undefined)?.time ?? new Date().toISOString()) },
    category: normalizeTaxonomy<MovieCategory>(m.category),
    country: normalizeTaxonomy<MovieCountry>(m.country),
    chieurap: Boolean(m.chieurap ?? false),
    sub_docquyen: Boolean(m.sub_docquyen ?? false),
    is_copyright: false,
    trailer_url: '',
    view: 0,
    actor: Array.isArray(m.actor) ? (m.actor as string[]) : [],
    director: Array.isArray(m.director) ? (m.director as string[]) : [],
    status: '',
    content: '',
    notify: '',
    showtimes: '',
    source_site: String(m.source_site ?? m.source_name ?? ''),
    source_name: String(m.source_name ?? ''),
  };
}
