import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EDGE_PROXY_SECRET = Deno.env.get('MOVIE_DETAIL_PROXY_SECRET') ?? '';
const CACHE_ID = 'search_index_v4_rows';
const CACHE_TTL_MIN = 240;
const REFRESH_LOCK_MS = 90 * 1000;
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

function isRetiredOphimItem(item: Record<string, unknown>): boolean {
  void item;
  return false;
}

function searchCachedItems(items: Record<string, unknown>[], query: string, limit: number): Record<string, unknown>[] {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length >= 2 || /^\d+$/.test(token));
  if (!normalizedQuery || tokens.length === 0) return [];

  const uniqueItems = Array.from(new Map(items.map((item) => [String(item.slug || item.id || item.name || ''), item])).values());
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
      ].filter(Boolean).join(' '));
      const words = new Set(haystack.split(/\s+/).filter(Boolean));
      const phraseMatch = ` ${haystack} `.includes(` ${normalizedQuery} `);
      const tokenMatch = tokens.length >= 3 && tokens.every((token) => words.has(token));
      if (!phraseMatch && !tokenMatch) return null;
      let score = 0;
      if (normalizedName === normalizedQuery) score += 10_000;
      if (normalizedOrigin === normalizedQuery) score += 9_000;
      if (normalizedName.startsWith(normalizedQuery)) score += 4_000;
      if (normalizedOrigin.startsWith(normalizedQuery)) score += 3_500;
      if (phraseMatch) score += 2_000;
      score += tokens.filter((token) => normalizedName.includes(token)).length * 300;
      score += Number(item.year || 0) / 100;
      return { item, score };
    })
    .filter((value): value is { item: Record<string, unknown>; score: number } => Boolean(value))
    .sort((a, b) => b.score - a.score || String(a.item.name || '').localeCompare(String(b.item.name || ''), 'vi'))
    .slice(0, limit)
    .map(({ item }) => item);
}

function slugifySearch(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const suppliedProxySecret = req.headers.get('x-khophim-proxy-secret') ?? '';
  const isTrustedCaller = Boolean(
    (EDGE_PROXY_SECRET && suppliedProxySecret === EDGE_PROXY_SECRET)
    || (SUPABASE_SERVICE_ROLE_KEY && bearer === SUPABASE_SERVICE_ROLE_KEY)
  );
  if (!isTrustedCaller) {
    return jsonResponse({ status: false, source: 'gateway-required', items: [] }, 401, {
      'Cache-Control': 'no-store',
    });
  }

  const url = new URL(req.url);
  const searchQuery = String(url.searchParams.get('q') || '').trim();
  const requestedSearchLimit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 24) || 24, 60));
  const limit = searchQuery ? requestedSearchLimit : clampLimit(url.searchParams.get('limit'));
  const forceRefresh = url.searchParams.get('refresh') === '1';
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
    let rpcError = '';
    try {
      const { data, error } = await supabase
        .rpc('search_movies_fast', {
          search_query: searchQuery,
          result_limit: requestedSearchLimit,
        })
        .abortSignal(timeoutSignal(3200));
      rpcError = error?.message || '';
      const rpcItems = searchCachedItems((data ?? []) as Record<string, unknown>[], searchQuery, requestedSearchLimit);
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
});

/*
  Old JSON-cache implementation intentionally removed. Search cache must stay in
  search_index_cache_items rows so Edge Functions never read a multi-MB JSON blob.
*/
