import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CACHE_ID = 'search_index_v4_rows';
const CACHE_TTL_MIN = 240;
const REFRESH_LOCK_MS = 90 * 1000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=900`,
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

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get('limit'));
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

  if (cacheValid) {
    const cached = await readCachedRows(supabase, limit);
    if (cached.items.length >= Math.min(limit, 100)) {
      return jsonResponse(
        { status: true, source: forceRefresh ? 'cache-refresh-skipped' : 'cache', items: cached.items.slice(0, limit), updated_at: cacheRow!.updated_at },
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
