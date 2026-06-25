import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

interface FunctionCallResult {
  name: string;
  ok: boolean;
  status: number;
  elapsed_ms: number;
  result: unknown;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function clampNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function appendParams(url: URL, params: Record<string, string | number | boolean | null | undefined>) {
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
}

async function callFunction(
  baseUrl: string,
  serviceKey: string,
  secret: string,
  name: string,
  params: Record<string, string | number | boolean | null | undefined>,
  extraHeaders: Record<string, string> = {},
): Promise<FunctionCallResult> {
  const started = Date.now();
  const endpoint = new URL(`${baseUrl.replace(/\/$/, '')}/functions/v1/${name}`);
  appendParams(endpoint, params);
  if (secret) endpoint.searchParams.set('secret', secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 140000);
  try {
    const response = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'x-cron-secret': secret,
        ...extraHeaders,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let result: unknown = text;
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      result = text.slice(0, 1000);
    }
    return {
      name,
      ok: response.ok,
      status: response.status,
      elapsed_ms: Date.now() - started,
      result,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      elapsed_ms: Date.now() - started,
      result: { error: error instanceof Error ? error.message : String(error) },
    };
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const started = Date.now();
  const url = new URL(req.url);
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const blvietsubSecret = Deno.env.get('BLVIETSUB_SYNC_SECRET') || '';
  const providedSecret = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  if ((cronSecret || blvietsubSecret) && providedSecret !== cronSecret && providedSecret !== blvietsubSecret) {
    return json({ success: false, error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) {
    return json({ success: false, error: 'Missing Supabase env' }, 500);
  }

  const internalSecret = providedSecret || cronSecret || blvietsubSecret;
  const latestPages = clampNumber(url.searchParams.get('latest_pages'), 2, 1, 5);
  const latestLimit = clampNumber(url.searchParams.get('latest_limit'), 36, 1, 100);
  const backfillPages = clampNumber(url.searchParams.get('backfill_pages'), 1, 1, 5);
  const backfillLimit = clampNumber(url.searchParams.get('backfill_limit'), 24, 1, 100);
  const blLatestLimit = clampNumber(url.searchParams.get('blvietsub_latest_limit'), 150, 10, 500);
  const blBackfillLimit = clampNumber(url.searchParams.get('blvietsub_backfill_limit'), 100, 10, 1000);
  const blPageSize = clampNumber(url.searchParams.get('blvietsub_page_size'), 150, 10, 500);
  const blRepairExistingLimit = clampNumber(url.searchParams.get('blvietsub_repair_existing_limit'), 24, 1, 80);
  const refreshCaches = url.searchParams.get('refresh_caches') !== '0';
  const dryRun = url.searchParams.get('dry_run') === '1';

  const calls: FunctionCallResult[] = [];

  for (const provider of ['ophim', 'kkphim']) {
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-ophim-movies', {
      provider,
      episodes: '1',
      pages: latestPages,
      limit: latestLimit,
      dry_run: dryRun ? '1' : null,
    }));

    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-ophim-movies', {
      provider,
      episodes: '1',
      backfill: '1',
      pages: backfillPages,
      limit: backfillLimit,
      cursor_key: `episode-backfill-guard:${provider}`,
      dry_run: dryRun ? '1' : null,
    }));
  }

  if (!dryRun) {
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'auto-sync-ophim-episodes', {
      limit: clampNumber(url.searchParams.get('direct_ophim_limit'), 80, 1, 200),
    }));
  }

  if (dryRun) {
    calls.push({
      name: 'sync-blvietsub-feed',
      ok: true,
      status: 200,
      elapsed_ms: 0,
      result: {
        skipped: true,
        reason: 'sync-blvietsub-feed does not support dry_run; skipped to avoid writes',
      },
    });
  } else {
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-blvietsub-feed', {
      offset: 0,
      limit: blLatestLimit,
      page_size: blPageSize,
      refresh_search: '0',
    }));

    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-blvietsub-feed', {
      repair_existing: '1',
      limit: blRepairExistingLimit,
      refresh_search: refreshCaches ? '1' : null,
    }));

    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-blvietsub-feed', {
      use_cursor: '1',
      cursor_key: 'episode-backfill-guard:blvietsub',
      limit: blBackfillLimit,
      page_size: blPageSize,
      refresh_search: refreshCaches ? '1' : null,
    }));
  }

  if (refreshCaches && !dryRun) {
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'search-index-proxy', {
      refresh: '1',
      limit: 5000,
    }));
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'home-proxy', {
      refresh: '1',
    }, { 'x-home-proxy-refresh': '1' }));
  }

  const failed = calls.filter((call) => !call.ok);
  return json({
    success: failed.length === 0,
    dry_run: dryRun,
    calls,
    failed_count: failed.length,
    elapsed_ms: Date.now() - started,
  }, failed.length ? 207 : 200);
});
