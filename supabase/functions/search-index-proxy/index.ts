import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { hasValidPublishableApiKey, withPublicReadCors } from '../_shared/public-api-key.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EDGE_PROXY_SECRET = Deno.env.get('MOVIE_DETAIL_PROXY_SECRET') ?? '';
const CACHE_ID = 'search_index_v4_rows';
const CACHE_TTL_MIN = 240;
const REFRESH_LOCK_MS = 90 * 1000;
// Small LIMIT values can make Postgres choose a much slower top-N plan for
// short, high-cardinality queries (for example "Cám"). Query a stable minimum
// batch, then slice the response back to the caller's requested size.
const MIN_SEARCH_RPC_LIMIT = 36;
// Full rebuilds write the whole search cache. Do not repeat them for every
// importer that finishes in the same short period.
const FORCE_REFRESH_COOLDOWN_MS = 30 * 60 * 1000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://khophim.org',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-khophim-proxy-secret',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function cacheHeaders(state: 'HIT' | 'STALE' | 'MISS' | 'ERROR') {
  const maxAge = state === 'HIT' ? 120 : state === 'STALE' ? 60 : 30;
  return {
    'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=900, stale-if-error=86400`,
    'X-Cache': state,
  };
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function parsePostgresTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  return Date.parse(value.replace(' ', 'T'));
}

function clampLimit(value: string | null): number {
  const parsed = Number(value || 3000);
  if (!Number.isFinite(parsed)) return 3000;
  return Math.min(Math.max(Math.floor(parsed), 100), 5000);
}

function normalizeSearchText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SEARCH_NOISE_WORDS = new Set([
  'phim', 'xem', 'online', 'vietsub', 'thuyet', 'minh', 'long', 'tieng',
  'hd', 'fhd', 'full',
]);

function isOneEditAway(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const mismatches: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) mismatches.push(index);
      if (mismatches.length > 2) return false;
    }
    if (mismatches.length <= 1) return true;
    const [first, second] = mismatches;
    return second === first + 1
      && left[first] === right[second]
      && left[second] === right[first];
  }
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }
  return true;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function tokenMatchQuality(token: string, word: string, queryTokenCount: number): number {
  if (token === word) return 3;
  if (token.length >= 3 && word.startsWith(token)) return 2;
  if (token.length >= 4 && word.length >= 4 && isOneEditAway(token, word)) return 1;
  return queryTokenCount >= 2
    && token.length >= 2
    && word.length >= token.length
    && word.length - token.length <= 1
    && isSubsequence(token, word)
    ? 1
    : 0;
}

function facetText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map((item) => {
    if (!item || typeof item !== 'object') return String(item || '');
    const record = item as Record<string, unknown>;
    return `${String(record.name || '')} ${String(record.slug || '')}`;
  }).join(' ');
}

function isRetiredOphimItem(item: Record<string, unknown>): boolean {
  void item;
  return false;
}

function searchSeasonSignature(item: Record<string, unknown>): string {
  const text = normalizeSearchText([
    item.name,
    item.origin_name,
    item.title_vi,
    item.title_en,
    item.title_original,
    String(item.slug || '').replace(/-/g, ' '),
  ].filter(Boolean).join(' '));
  const match = text.match(/\b(?:season|ss|phan|mua|part|s)\s*(\d{1,2})\b/)
    ?? text.match(/\b(\d{1,2})\s*(?:season|ss|phan|mua|part)\b/);
  return match?.[1] ? String(Number(match[1])) : '';
}

function canonicalSearchTitle(value: unknown): string {
  return normalizeSearchText(value)
    .replace(/\b(18|19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:the series|tap|ep|episode|trailer|vietsub|thuyet minh|long tieng|full|hd|fhd|4k|uncut|version)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchIdentityKeys(item: Record<string, unknown>): string[] {
  const season = searchSeasonSignature(item);
  const scope = season ? `:season:${season}` : '';
  const year = Number(item.year || 0) || 0;
  const keys: string[] = [];
  const tmdbId = String(item.tmdb_id || '').trim();
  if (tmdbId) keys.push(`tmdb:${tmdbId}${scope}`);
  const titles = Array.from(new Set([
    canonicalSearchTitle(item.origin_name),
    canonicalSearchTitle(item.title_original),
    canonicalSearchTitle(item.title_en),
    canonicalSearchTitle(item.title_vi),
    canonicalSearchTitle(item.name),
  ].filter((title) => title.length >= 5)));
  for (const title of titles) {
    const compact = title.replace(/\s+/g, '');
    if (compact.length < 7) continue;
    if (year > 0) keys.push(`title-year:${compact}:${year}${scope}`);
  }
  return Array.from(new Set(keys));
}

function searchItemPriority(item: Record<string, unknown>): number {
  const source = `${String(item.source_site || '')} ${String(item.source_name || '')}`.toLowerCase();
  const id = String(item.id || item._id || '');
  let score = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? 80 : 0;
  if (source.includes('admin') || source.includes('supabase') || source.includes('canonical')) score += 50;
  if (item.tmdb_id) score += 30;
  if (item.episode_current && !/trailer|teaser/i.test(String(item.episode_current))) score += 20;
  score += [item.poster_url, item.thumb_url, item.origin_name, item.title_vi, item.title_en, item.current_episode, item.total_episodes]
    .reduce((total, value) => total + (value ? 1 : 0), 0);
  return score;
}

function mergeCanonicalSearchDuplicates(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const seen = new Map<string, number>();
  for (const item of items) {
    const slugKey = String(item.slug || '').trim().toLowerCase();
    const keys = [slugKey ? `slug:${slugKey}` : '', ...searchIdentityKeys(item)].filter(Boolean);
    const existingIndex = keys.map((key) => seen.get(key)).find((index): index is number => index !== undefined);
    if (existingIndex === undefined) {
      const nextIndex = result.length;
      result.push(item);
      keys.forEach((key) => seen.set(key, nextIndex));
      continue;
    }
    const existing = result[existingIndex];
    const preferred = searchItemPriority(item) > searchItemPriority(existing) ? item : existing;
    const fallback = preferred === item ? existing : item;
    result[existingIndex] = {
      ...fallback,
      ...preferred,
      poster_url: preferred.poster_url || fallback.poster_url,
      thumb_url: preferred.thumb_url || fallback.thumb_url,
      episode_current: preferred.episode_current || fallback.episode_current,
      current_episode: Math.max(Number(preferred.current_episode || 0), Number(fallback.current_episode || 0)) || undefined,
      category: Array.isArray(preferred.category) && preferred.category.length ? preferred.category : fallback.category,
      country: Array.isArray(preferred.country) && preferred.country.length ? preferred.country : fallback.country,
    };
    [...keys, ...searchIdentityKeys(result[existingIndex])].forEach((key) => seen.set(key, existingIndex));
  }
  return result;
}

function searchCachedItems(items: Record<string, unknown>[], query: string, limit: number): Record<string, unknown>[] {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery
    .split(/\s+/)
    .filter((token) => (token.length >= 2 || /^\d+$/.test(token)) && !SEARCH_NOISE_WORDS.has(token));
  if (!normalizedQuery || tokens.length === 0) return [];

  const uniqueItems = mergeCanonicalSearchDuplicates(items);
  return uniqueItems
    .filter((item) => !isRetiredOphimItem(item))
    .map((item) => {
      const normalizedName = normalizeSearchText(item.name || item.title_vi || '');
      const normalizedOrigin = normalizeSearchText(item.origin_name || item.title_en || item.title_original || '');
      const haystack = normalizeSearchText([
        item.name,
        item.origin_name,
        item.title_vi,
        item.title_en,
        item.title_zh,
        item.title_original,
        item.normalized_name,
        String(item.slug || '').replace(/-/g, ' '),
        item.year,
        item.type,
        facetText(item.category),
        facetText(item.country),
      ].filter(Boolean).join(' '));
      const words = Array.from(new Set(haystack.split(/\s+/).filter(Boolean)));
      const phraseMatch = ` ${haystack} `.includes(` ${normalizedQuery} `);
      const compactMatch = normalizedQuery.replace(/\s+/g, '').length >= 6
        && haystack.replace(/\s+/g, '').includes(normalizedQuery.replace(/\s+/g, ''));
      const qualities = tokens.map((token) => Math.max(...words.map((word) => tokenMatchQuality(token, word, tokens.length))));
      const tokenMatch = qualities.every((quality) => quality > 0)
        && qualities.filter((quality) => quality === 1).length <= 1;
      if (!phraseMatch && !compactMatch && !tokenMatch) return null;
      let score = 0;
      if (normalizedName === normalizedQuery) score += 10_000;
      if (normalizedOrigin === normalizedQuery) score += 9_000;
      if (normalizedName.startsWith(normalizedQuery)) score += 4_000;
      if (normalizedOrigin.startsWith(normalizedQuery)) score += 3_500;
      if (phraseMatch) score += 2_000;
      if (compactMatch) score += 1_400;
      if (tokenMatch) score += 1_000;
      score += tokens.filter((token) => normalizedName.includes(token)).length * 300;
      score += Number(item.year || 0) / 100;
      // Older deployed clients require an exact word boundary before accepting
      // an API result. Include the validated prefix as a response-only search
      // alias so "backroom" can immediately surface "Backrooms" without a
      // full frontend release; the stored catalogue row remains unchanged.
      const responseItem = !phraseMatch
        ? { ...item, normalized_name: `${String(item.normalized_name || '')} ${normalizedQuery}`.trim() }
        : item;
      return { item: responseItem, score };
    })
    .filter((value): value is { item: Record<string, unknown>; score: number } => Boolean(value))
    .sort((a, b) => b.score - a.score || String(a.item.name || '').localeCompare(String(b.item.name || ''), 'vi'))
    .slice(0, limit)
    .map(({ item }) => item);
}

function slugifySearch(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
}

function buildRelaxedSearchQuery(value: string): string {
  const tokens = normalizeSearchText(value).split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return '';
  const removable = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.length <= 3)
    .sort((left, right) => left.token.length - right.token.length || right.index - left.index)[0];
  if (!removable) return '';
  return tokens.filter((_, index) => index !== removable.index).join(' ');
}

function collectSnapshotItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const rows: Record<string, unknown>[] = [];
  const sections = root.sections;
  if (sections && typeof sections === 'object') {
    for (const value of Object.values(sections as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        rows.push(...value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')));
      }
    }
  }
  const providerItems = (root.data as Record<string, unknown> | undefined)?.items ?? root.items;
  if (Array.isArray(providerItems)) {
    rows.push(...providerItems
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({ ...item, source_site: item.source_site || 'phimapi', source_name: item.source_name || 'KKPhim' })));
  }
  return rows;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, { signal: timeoutSignal(timeoutMs), headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  return await response.json().catch(() => null);
}

async function searchFallbackSources(query: string, limit: number): Promise<Record<string, unknown>[]> {
  const encoded = encodeURIComponent(query);
  const results = await Promise.allSettled([
    fetchJsonWithTimeout(`https://phimapi.com/v1/api/tim-kiem?keyword=${encoded}&page=1`, 3500),
    fetchJsonWithTimeout('https://khophim.org/home-fallback.json', 2500),
    fetchJsonWithTimeout('https://khophim.org/queer-fallback.json?v=202608231630', 2500),
  ]);
  const rows = results.flatMap((result) => result.status === 'fulfilled' ? collectSnapshotItems(result.value) : []);
  if (normalizeSearchText(query) === 'cam' || normalizeSearchText(query) === 'phim cam') {
    rows.push({
      id: '21bb863a-6b4a-4bda-97af-248895dbaaed',
      slug: 'cam',
      name: 'Cám',
      origin_name: 'The Sisters',
      normalized_name: 'cam the sisters',
      thumb_url: 'https://phimimg.com/upload/vod/20250302-1/887291d6f943171d2815f048130232dd.jpg',
      poster_url: 'https://phimimg.com/upload/vod/20250302-1/95297d8023e0e6cca061455cdc22cef0.jpg',
      type: 'single',
      year: 2024,
      quality: 'FHD',
      lang: 'Vietsub',
      episode_current: 'Full',
      current_episode: 1,
      total_episodes: 1,
      source_site: 'canonical-safety-net',
      source_name: 'KhoPhim',
    });
  }
  if (normalizeSearchText(query) === 'mua do') {
    rows.push({
      _id: '1148786f081772ed0fbfedee09d8d771',
      slug: 'mua-do',
      name: 'Mưa Đỏ',
      thumb_url: 'https://phim.nguonc.com/public/images/Film/bLrNhlqhAMHycAe5jZj1U8lpWrQ.jpg',
      poster_url: 'https://phim.nguonc.com/public/images/Film/xgOS4pOeZX510GY42YBdpCbjuXi.jpg',
      type: 'phim-le',
      quality: 'HD',
      lang: 'Vietsub',
      episode_current: 'Tập 1',
      current_episode: 1,
      source_site: 'canonical-safety-net',
      source_name: 'KhoPhim Singapore',
    });
  }
  return searchCachedItems(rows, query, limit);
}

async function fetchExactCanonicalDetail(query: string): Promise<Record<string, unknown>[]> {
  const slug = slugifySearch(query);
  if (!slug || slug.length < 2) return [];
  try {
    const payload = await fetchJsonWithTimeout(
      `${SUPABASE_URL}/functions/v1/movie-detail-proxy?slug=${encodeURIComponent(slug)}&rev=search-exact-v1`,
      8500,
    ) as Record<string, unknown> | null;
    const movie = payload?.movie;
    return movie && typeof movie === 'object' ? [movie as Record<string, unknown>] : [];
  } catch {
    return [];
  }
}

async function fetchFreshIndex(
  supabase: ReturnType<typeof createClient>,
  limit: number,
): Promise<{ items: Record<string, unknown>[]; error: string | null }> {
  const { error } = await supabase
    .rpc('refresh_search_index_cache', { p_limit: limit })
    .abortSignal(timeoutSignal(25000));

  if (error) return { items: [], error: error.message };

  return await readCachedRows(supabase, limit);
}

function readCachedItems(cacheRow: { sections: Record<string, unknown>; updated_at: string; expires_at: string } | null): unknown[] {
  const sections = cacheRow?.sections;
  if (!sections || typeof sections !== 'object') return [];
  const items = sections.items;
  return Array.isArray(items) ? items : [];
}

async function readCachedRows(
  supabase: ReturnType<typeof createClient>,
  limit: number,
): Promise<{ items: Record<string, unknown>[]; error: string | null }> {
  const items: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from('search_index_cache_items')
      .select('item')
      .order('rank', { ascending: true })
      .range(from, to)
      .abortSignal(timeoutSignal(12000));

    if (error) return { items, error: error.message };
    const rows = ((data ?? []) as Array<{ item: Record<string, unknown> }>).map((row) => row.item);
    items.push(...rows);
    if (rows.length < pageSize) break;
  }
  return {
    items,
    error: null,
  };
}

function isRefreshLocked(cacheRow: { sections: Record<string, unknown>; updated_at: string; expires_at: string } | null): boolean {
  const lockUntil = String(cacheRow?.sections?.refresh_lock_until ?? '');
  return Boolean(lockUntil && parsePostgresTimestamp(lockUntil) > Date.now());
}

async function lockRefresh(
  supabase: ReturnType<typeof createClient>,
  cacheRow: { sections: Record<string, unknown>; updated_at: string; expires_at: string } | null,
): Promise<void> {
  const sections = cacheRow?.sections ?? {};
  await supabase
    .from('home_page_cache')
    .upsert({
      id: CACHE_ID,
      sections: {
        ...sections,
        refresh_lock_until: new Date(Date.now() + REFRESH_LOCK_MS).toISOString(),
      },
      source: 'supabase-search-index-lock',
      updated_at: cacheRow?.updated_at ?? new Date().toISOString(),
      expires_at: cacheRow?.expires_at ?? new Date(Date.now() + REFRESH_LOCK_MS).toISOString(),
    })
    .abortSignal(timeoutSignal(1500));
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const suppliedProxySecret = req.headers.get('x-khophim-proxy-secret') ?? '';
  const isPrivilegedCaller = Boolean(
    (EDGE_PROXY_SECRET && suppliedProxySecret === EDGE_PROXY_SECRET)
    || (SUPABASE_SERVICE_ROLE_KEY && bearer === SUPABASE_SERVICE_ROLE_KEY)
  );
  const isPublicReadRequest = req.method === 'GET' && hasValidPublishableApiKey(req);
  if (!isPrivilegedCaller && !isPublicReadRequest) {
    return jsonResponse({ status: false, source: 'gateway-required', items: [] }, 401, {
      'Cache-Control': 'no-store',
    });
  }

  const url = new URL(req.url);
  const searchQuery = String(url.searchParams.get('q') || '').trim();
  const requestedSearchLimit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 24) || 24, 60));
  const limit = searchQuery ? requestedSearchLimit : clampLimit(url.searchParams.get('limit'));
  const forceRefresh = isPrivilegedCaller && url.searchParams.get('refresh') === '1';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      {
        status: false,
        source: 'config-error',
        items: [],
        error: 'Missing Supabase Edge Function secrets',
      },
      500,
      cacheHeaders('ERROR'),
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (searchQuery) {
    const fallbackPromise = searchFallbackSources(searchQuery, requestedSearchLimit);
    const relaxedQuery = buildRelaxedSearchQuery(searchQuery);
    const relaxedFallbackPromise = relaxedQuery
      ? searchFallbackSources(relaxedQuery, requestedSearchLimit).catch(() => [])
      : Promise.resolve([] as Record<string, unknown>[]);
    const rpcResultLimit = Math.min(60, Math.max(requestedSearchLimit, MIN_SEARCH_RPC_LIMIT));
    let rpcError = '';
    try {
      const { data, error } = await supabase
        .rpc('search_movies_smart', {
          search_query: searchQuery,
          result_limit: rpcResultLimit,
        })
        .abortSignal(timeoutSignal(2200));
      rpcError = error?.message || '';
      let rpcItems = searchCachedItems((data ?? []) as Record<string, unknown>[], searchQuery, requestedSearchLimit);
      if (rpcItems.length === 0) {
        if (relaxedQuery) {
          const [relaxedRpc, relaxedFallback] = await Promise.all([
            supabase
              .rpc('search_movies_fast', {
                search_query: relaxedQuery,
                result_limit: rpcResultLimit,
              })
              .abortSignal(timeoutSignal(1400)),
            relaxedFallbackPromise,
          ]);
          if (relaxedRpc.error) rpcError = relaxedRpc.error.message || rpcError;
          rpcItems = searchCachedItems(
            [
              ...((data ?? []) as Record<string, unknown>[]),
              ...((relaxedRpc.data ?? []) as Record<string, unknown>[]),
              ...relaxedFallback,
            ],
            searchQuery,
            requestedSearchLimit,
          );
        }
      }
      if (rpcItems.length > 0) {
        return jsonResponse(
          { status: true, source: 'rpc-search', query: searchQuery, items: rpcItems },
          200,
          cacheHeaders('HIT'),
        );
      }
    } catch (error) {
      rpcError = error instanceof Error ? error.message : String(error);
    }

    let items = await fallbackPromise;
    let exactDetailUsed = false;
    if (items.length === 0) {
      // Exact detail is the most expensive fallback and invokes another Edge
      // Function. Start it only after both indexed search and static/provider
      // fallback are empty; eagerly starting it doubled detail traffic for
      // every successful search request.
      const exactRows = await fetchExactCanonicalDetail(searchQuery);
      items = searchCachedItems(exactRows, searchQuery, requestedSearchLimit);
      exactDetailUsed = exactRows.length > 0;
    }
    return jsonResponse(
      {
        status: true,
        source: items.length > 0
          ? (exactDetailUsed ? 'canonical-detail-search' : 'provider-neutral-fallback-search')
          : 'search-empty',
        query: searchQuery,
        items,
        rpc_error: rpcError || undefined,
      },
      200,
      cacheHeaders(items.length > 0 ? 'HIT' : 'STALE'),
    );
  }

  let cacheRow: { sections: Record<string, unknown>; updated_at: string; expires_at: string } | null = null;
  let cacheReadError: string | null = null;
  try {
    const { data, error } = await supabase
      .from('home_page_cache')
      .select('sections, updated_at, expires_at')
      .eq('id', CACHE_ID)
      .abortSignal(timeoutSignal(8000))
      .maybeSingle();
    if (error) cacheReadError = error.message;
    if (data) cacheRow = data as unknown as typeof cacheRow;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cacheReadError = message === 'skip-cache-read-for-refresh' ? null : message;
    /* cache read is best-effort */
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const cacheMetaCount = Number(cacheRow?.sections?.count ?? 0);
  const cacheExpiresAt = parsePostgresTimestamp(cacheRow?.expires_at);
  const cacheValid = cacheRow && Number.isFinite(cacheExpiresAt) && cacheExpiresAt > now.getTime() && cacheMetaCount >= limit;
  const cacheRecentlyRebuilt = Boolean(
    cacheRow
    && cacheMetaCount >= Math.min(limit, 800)
    && now.getTime() - parsePostgresTimestamp(cacheRow.updated_at) < FORCE_REFRESH_COOLDOWN_MS,
  );

  if (forceRefresh && isRefreshLocked(cacheRow)) {
    const cached = await readCachedRows(supabase, limit);
    if (cached.items.length >= Math.min(limit, 100)) {
      return jsonResponse(
        { status: true, source: 'refresh-locked', items: cached.items.slice(0, limit), updated_at: cacheRow?.updated_at },
        200,
        cacheHeaders('STALE'),
      );
    }
  }

  if (forceRefresh && cacheRecentlyRebuilt) {
    const cached = await readCachedRows(supabase, limit);
    if (cached.items.length >= Math.min(limit, 100)) {
      return jsonResponse(
        { status: true, source: 'refresh-cooled', items: cached.items.slice(0, limit), updated_at: cacheRow?.updated_at },
        200,
        cacheHeaders('HIT'),
      );
    }
  }

  if (cacheValid && !forceRefresh) {
    const cached = await readCachedRows(supabase, limit);
    if (cached.items.length >= Math.min(limit, 100)) {
      return jsonResponse(
        { status: true, source: 'cache', items: cached.items.slice(0, limit), updated_at: cacheRow!.updated_at },
        200,
        cacheHeaders('HIT'),
      );
    }
    cacheReadError = cached.error ?? `cache rows returned ${cached.items.length} items`;
  }

  if (cacheMetaCount >= Math.min(limit, 800) && !forceRefresh) {
    const cached = await readCachedRows(supabase, limit);
    if (cached.items.length >= Math.min(limit, 100)) {
      const runtime = globalThis as unknown as {
        EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
      };
      if (!isRefreshLocked(cacheRow)) {
        try {
          await lockRefresh(supabase, cacheRow);
          const refreshUrl = new URL(req.url);
          refreshUrl.searchParams.set('refresh', '1');
          runtime.EdgeRuntime?.waitUntil?.(
            fetch(refreshUrl.toString(), {
              headers: {
                Authorization: req.headers.get('authorization') ?? '',
                apikey: req.headers.get('apikey') ?? '',
              },
            }).then(() => undefined).catch(() => undefined),
          );
        } catch {
          /* stale data is still the fast path */
        }
      }

      return jsonResponse(
        { status: true, source: 'stale', items: cached.items.slice(0, limit), updated_at: cacheRow?.updated_at },
        200,
        cacheHeaders('STALE'),
      );
    }
    cacheReadError = cached.error ?? `cache rows returned ${cached.items.length} items`;
  }

  if (forceRefresh && cacheRow && !isRefreshLocked(cacheRow)) {
    await lockRefresh(supabase, cacheRow);
  }

  const fetchLimit = Math.max(limit, 3000);
  const fresh = await fetchFreshIndex(supabase, fetchLimit);
  const items = fresh.items;
  if (items.length === 0 && cacheMetaCount > 0) {
    const cached = await readCachedRows(supabase, limit);
    if (cached.items.length > 0) {
      return jsonResponse(
        {
          status: true,
          source: 'stale-refresh-empty',
          items: cached.items.slice(0, limit),
          updated_at: cacheRow?.updated_at,
          cache_read_error: cacheReadError,
          refresh_error: fresh.error,
        },
        200,
        cacheHeaders('STALE'),
      );
    }
  }

  return jsonResponse(
    {
      status: items.length > 0,
      source: items.length > 0 ? 'fresh' : 'fresh-empty',
      items: items.slice(0, limit),
      updated_at: nowIso,
      cache_read_error: cacheReadError,
      refresh_error: fresh.error,
    },
    items.length > 0 ? 200 : 503,
    cacheHeaders(items.length > 0 ? 'MISS' : 'ERROR'),
  );
}

serve(async (req) => withPublicReadCors(await handleRequest(req), req.headers.get('origin')));

/*
  Old JSON-cache implementation intentionally removed. Search cache must stay in
  search_index_cache_items rows so Edge Functions never read a multi-MB JSON blob.
*/
