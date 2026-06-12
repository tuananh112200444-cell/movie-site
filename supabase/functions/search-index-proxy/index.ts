import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CACHE_ID = 'search_index_v1';
const CACHE_TTL_MIN = 30;
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

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function clampLimit(value: string | null): number {
  const parsed = Number(value || 800);
  if (!Number.isFinite(parsed)) return 800;
  return Math.min(Math.max(Math.floor(parsed), 100), 1200);
}

async function fetchFreshIndex(
  supabase: ReturnType<typeof createClient>,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('movies')
    .select('id, slug, name, origin_name, title_vi, title_en, title_zh, title_original, normalized_name, thumb_url, poster_url, type, year, quality, lang, episode_current, episode_total, current_episode, total_episodes, schedule_type, release_time, release_day, schedule_timezone, time, category, country, is_published, updated_at, created_at, ophim_id, tmdb_id, source_site, source_name, release_at, next_episode_at, next_episode_name, schedule_note')
    .eq('is_published', true)
    .order('updated_at', { ascending: false })
    .limit(limit)
    .abortSignal(timeoutSignal(1800));

  if (error || !data) return [];
  return data as unknown as Record<string, unknown>[];
}

function isRefreshLocked(cacheRow: { sections: Record<string, unknown>; updated_at: string; expires_at: string } | null): boolean {
  const lockUntil = String(cacheRow?.sections?.refresh_lock_until ?? '');
  return Boolean(lockUntil && lockUntil > new Date().toISOString());
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
    .abortSignal(timeoutSignal(700));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get('limit'));
  const forceRefresh = url.searchParams.get('refresh') === '1';
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let cacheRow: { sections: Record<string, unknown>; updated_at: string; expires_at: string } | null = null;
  try {
    const { data } = await supabase
      .from('home_page_cache')
      .select('sections, updated_at, expires_at')
      .eq('id', CACHE_ID)
      .abortSignal(timeoutSignal(800))
      .maybeSingle();
    if (data) cacheRow = data as unknown as typeof cacheRow;
  } catch {
    /* cache read is best-effort */
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const cachedItems = (cacheRow?.sections?.items ?? []) as unknown[];
  const cacheValid = cacheRow && cacheRow.expires_at > nowIso && cachedItems.length > 0;

  if (cacheValid && !forceRefresh) {
    return jsonResponse(
      { status: true, source: 'cache', items: cachedItems.slice(0, limit), updated_at: cacheRow!.updated_at },
      200,
      {
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=900',
        'X-Cache': 'HIT',
      },
    );
  }

  if (cachedItems.length > 0 && !forceRefresh) {
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
      { status: true, source: 'stale', items: cachedItems.slice(0, limit), updated_at: cacheRow?.updated_at },
      200,
      {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=900',
        'X-Cache': 'STALE',
      },
    );
  }

  const items = await fetchFreshIndex(supabase, limit);
  if (items.length > 0) {
    try {
      await supabase
        .from('home_page_cache')
        .upsert({
          id: CACHE_ID,
          sections: { items, refresh_lock_until: null },
          source: 'supabase-search-index',
          updated_at: nowIso,
          expires_at: new Date(now.getTime() + CACHE_TTL_MIN * 60 * 1000).toISOString(),
        })
        .abortSignal(timeoutSignal(800));
    } catch {
      /* cache write is best-effort */
    }
  }

  return jsonResponse(
    { status: true, source: 'fresh', items, updated_at: nowIso },
    200,
    {
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=900',
      'X-Cache': 'MISS',
    },
  );
});
