import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

type SupabaseClient = ReturnType<typeof createClient>;

interface StreamRow {
  id: string;
  movie_id: string;
  episode_slug: string;
  source: string;
  server_name: string;
  stream_url: string;
  embed_url: string;
  quality: string;
  priority: number | null;
  health_status: string | null;
  failure_count: number | null;
  last_checked_at: string | null;
  last_error: string | null;
  response_time_ms: number | null;
}

interface MovieQueueRow {
  id: string;
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
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function streamUrl(row: StreamRow) {
  return String(row.stream_url || row.embed_url || '').trim();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function isHls(url: string) {
  return /\.m3u8($|[?#])/i.test(url);
}

function getHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function scoreStream(row: StreamRow, responseMs: number) {
  const url = streamUrl(row).toLowerCase();
  const host = getHost(url);
  const server = `${row.server_name} ${row.source} ${row.quality}`.toLowerCase();
  let score = 100;
  if (row.source === 'manual' || server.includes('khophim')) score += 90;
  if (isHls(url)) score += 45;
  if (url.includes('dailymotion.com') || url.includes('dai.ly')) score += 35;
  if (server.includes('1080') || server.includes('fhd')) score += 25;
  if (server.includes('720') || server.includes('hd')) score += 15;
  if (url.includes('abyss') || url.includes('short.icu')) score -= 25;
  if (host.includes('vk.com') || host.includes('ok.ru')) score -= 20;
  if (responseMs > 6000) score -= 25;
  else if (responseMs > 3000) score -= 10;
  return Math.max(1, Math.min(score, 250));
}

function headersFor(url: string) {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 KhoPhim-StreamHealth/1.0',
    Accept: '*/*',
  };
  if (/blvietsub\.com/i.test(url)) headers.Referer = 'https://blvietsub.com/';
  if (/opstream|ophim/i.test(url)) headers.Referer = 'https://ophim1.com/';
  else if (/phimapi|kkphim|phim1280/i.test(url)) headers.Referer = 'https://khophim.org/';
  return headers;
}

async function probe(url: string): Promise<{ ok: boolean; status: number | null; responseMs: number; error: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headersFor(url),
      redirect: 'follow',
      signal: controller.signal,
    });
    const responseMs = Date.now() - started;
    const contentType = response.headers.get('content-type') || '';
    const okStatus = response.status >= 200 && response.status < 400;
    if (!okStatus) return { ok: false, status: response.status, responseMs, error: `HTTP ${response.status}` };

    if (isHls(url)) {
      const text = await response.text();
      const looksLikePlaylist = text.includes('#EXTM3U') || text.includes('#EXT-X-STREAM-INF') || text.includes('#EXTINF');
      return {
        ok: looksLikePlaylist,
        status: response.status,
        responseMs,
        error: looksLikePlaylist ? '' : 'HLS playlist invalid',
      };
    }

    if (/text\/html/i.test(contentType)) {
      const text = (await response.text()).slice(0, 120_000);
      if (/\b404\s+not\s+found\b|video\s+(?:was\s+)?(?:not\s+found|deleted|removed)|file\s+(?:was\s+)?(?:not\s+found|deleted|removed)/i.test(text)) {
        return { ok: false, status: 404, responseMs, error: 'Embed returned an HTML 404/deleted-video page' };
      }
      if (/\b502\s+bad\s+gateway\b|\b503\s+service\s+unavailable\b|upstream\s+(?:connect\s+)?error/i.test(text)) {
        return { ok: false, status: 502, responseMs, error: 'Embed returned an upstream gateway error page' };
      }
    }

    const embeddable = /text\/html|video\/|application\/octet-stream|application\/vnd\.apple\.mpegurl/i.test(contentType) || !contentType;
    return {
      ok: embeddable,
      status: response.status,
      responseMs,
      error: embeddable ? '' : `Unexpected content-type ${contentType}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      responseMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeStreamRow(row: StreamRow): Promise<{ ok: boolean; status: number | null; responseMs: number; error: string }> {
  const candidates = unique([
    String(row.stream_url || '').trim(),
    String(row.embed_url || '').trim(),
  ].filter(Boolean));
  const failures: Array<{ ok: boolean; status: number | null; responseMs: number; error: string }> = [];
  for (const candidate of candidates) {
    const result = await probe(candidate);
    if (result.ok) return result;
    failures.push(result);
  }
  return failures.sort((a, b) => {
    const severity = (status: number | null) =>
      status === 404 || status === 410 ? 4 : status !== null && status >= 500 ? 3 : status === 401 || status === 403 ? 2 : 1;
    return severity(b.status) - severity(a.status);
  })[0] ?? { ok: false, status: null, responseMs: 0, error: 'No stream or embed URL' };
}

async function logHealth(
  supabase: SupabaseClient,
  row: StreamRow,
  result: { ok: boolean; status: number | null; responseMs: number; error: string },
) {
  await supabase.from('stream_health_logs').insert({
    stream_id: row.id,
    movie_id: row.movie_id,
    status: result.ok ? 'ok' : 'failed',
    http_code: result.status,
    response_time_ms: result.responseMs,
    error_message: result.error,
    is_reachable: result.ok,
  });
}

function healthStatusFor(result: { ok: boolean; status: number | null; error: string }, failureCount: number) {
  if (result.ok) return 'ok';
  if (result.status === 401 || result.status === 403) return 'blocked';
  if (result.status === 404 || result.status === 410) return failureCount >= 2 ? 'dead' : 'failed';
  return 'failed';
}

function shouldDeactivate(result: { ok: boolean; status: number | null; error: string }, failureCount: number, deactivateAfter: number) {
  if (result.ok) return false;
  if (result.status === 401 || result.status === 403) return false;
  if (result.status === 404 || result.status === 410) return failureCount >= 2;
  if (/playlist invalid|name not resolved|connection refused/i.test(result.error)) return failureCount >= 2;
  return failureCount >= deactivateAfter;
}

async function updateStream(
  supabase: SupabaseClient,
  row: StreamRow,
  result: { ok: boolean; status: number | null; responseMs: number; error: string },
  deactivateAfter: number,
) {
  const now = new Date().toISOString();
  const telemetryFailureAge = Date.now() - Date.parse(String(row.last_checked_at || ''));
  const telemetryEmbedCooldown = result.ok
    && !String(row.stream_url || '').trim()
    && String(row.embed_url || '').trim()
    && String(row.last_error || '').startsWith('Viewer telemetry:')
    && Number.isFinite(telemetryFailureAge)
    && telemetryFailureAge >= 0
    && telemetryFailureAge < 30 * 60 * 1000;
  if (telemetryEmbedCooldown) {
    await supabase.from('streams').update({
      response_time_ms: result.responseMs,
      priority: Math.min(Number(row.priority || 100), 20),
      updated_at: now,
    }).eq('id', row.id);
    return;
  }
  const nextFailureCount = result.ok ? 0 : Number(row.failure_count || 0) + 1;
  const update: Record<string, unknown> = {
    health_status: healthStatusFor(result, nextFailureCount),
    last_checked_at: now,
    response_time_ms: result.responseMs,
    failure_count: nextFailureCount,
    last_error: result.error || '',
    updated_at: now,
  };
  if (result.ok) {
    update.last_success_at = now;
    update.priority = scoreStream(row, result.responseMs);
    update.is_active = true;
  } else {
    update.last_failure_at = now;
    const currentPriority = Number(row.priority || 100);
    const hardFail = result.status === 404 || result.status === 410 || /playlist invalid|name not resolved|connection refused/i.test(result.error);
    update.priority = result.status === 401 || result.status === 403
      ? Math.min(currentPriority, 35)
      : Math.max(1, currentPriority - (hardFail ? 80 : 35));
    if (shouldDeactivate(result, nextFailureCount, deactivateAfter)) update.is_active = false;
  }
  await supabase.from('streams').update(update).eq('id', row.id);
}

function authorized(req: Request, url: URL): boolean {
  const provided = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  const allowed = [
    Deno.env.get('CRON_SECRET') || '',
    Deno.env.get('STREAM_HEALTH_SECRET') || '',
    Deno.env.get('PLAYER_REPAIR_SECRET') || '',
  ].filter(Boolean);
  return allowed.length > 0 && allowed.includes(provided);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  if (!authorized(req, url)) return json({ success: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase env' }, 500);

  const limit = clampNumber(url.searchParams.get('limit'), 40, 1, 150);
  const concurrency = clampNumber(url.searchParams.get('concurrency'), 5, 1, 10);
  const deactivateAfter = clampNumber(url.searchParams.get('deactivate_after'), 4, 2, 10);
  const movieLimit = clampNumber(url.searchParams.get('movie_limit'), 80, 10, 300);
  const slug = String(url.searchParams.get('slug') || '').trim();
  const queue = String(url.searchParams.get('queue') || 'hot').toLowerCase();
  const dryRun = url.searchParams.get('dry_run') === '1';
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const streamSelect = 'id,movie_id,episode_slug,source,server_name,stream_url,embed_url,quality,priority,health_status,failure_count,last_checked_at,last_error,response_time_ms,movies!inner(slug)';
  let query = supabase
    .from('streams')
    .select(streamSelect)
    .eq('is_active', true)
    .or('stream_url.neq.,embed_url.neq.')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .order('priority', { ascending: false })
    .limit(limit);

  if (slug) query = query.eq('movies.slug', slug);
  else if (queue === 'unchecked') {
    query = supabase
      .from('streams')
      .select(streamSelect)
      .eq('is_active', true)
      .eq('health_status', 'unchecked')
      .or('stream_url.neq.,embed_url.neq.')
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .order('priority', { ascending: false })
      .limit(limit);
  } else if (queue === 'problem') {
    query = supabase
      .from('streams')
      .select(streamSelect)
      .eq('is_active', true)
      .in('health_status', ['failed', 'dead', 'blocked'])
      .or('stream_url.neq.,embed_url.neq.')
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .order('priority', { ascending: false })
      .limit(limit);
  } else if (queue === 'stale') {
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    query = supabase
      .from('streams')
      .select(streamSelect)
      .eq('is_active', true)
      .or('last_checked_at.is.null,last_checked_at.lt.' + staleBefore)
      .or('stream_url.neq.,embed_url.neq.')
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .order('priority', { ascending: false })
      .limit(limit);
  } else if (queue === 'hot') {
    const { data: hotMovies, error: hotMovieError } = await supabase
      .from('movies')
      .select('id')
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
      .limit(movieLimit);

    if (hotMovieError) return json({ success: false, error: hotMovieError.message }, 500);
    const movieIds = unique(((hotMovies || []) as MovieQueueRow[]).map((movie) => movie.id).filter(Boolean));
    if (movieIds.length > 0) {
      query = supabase
        .from('streams')
        .select(streamSelect)
        .eq('is_active', true)
        .in('movie_id', movieIds)
        .or('stream_url.neq.,embed_url.neq.')
        .order('last_checked_at', { ascending: true, nullsFirst: true })
        .order('priority', { ascending: false })
        .limit(limit);
    }
  }

  const { data, error } = await query;
  if (error) return json({ success: false, error: error.message }, 500);

  const rows = (data || []) as unknown as StreamRow[];
  const results = [];
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (row) => {
      const playableUrl = streamUrl(row);
      if (!playableUrl) return null;
      const result = await probeStreamRow(row);
      if (!dryRun) {
        await logHealth(supabase, row, result);
        await updateStream(supabase, row, result, deactivateAfter);
      }
      return {
        stream_id: row.id,
        movie_id: row.movie_id,
        episode_slug: row.episode_slug,
        server_name: row.server_name,
        ok: result.ok,
        status: result.status,
        response_time_ms: result.responseMs,
        error: result.error,
      };
    }));
    results.push(...batchResults.filter(Boolean));
  }

  return json({
    success: true,
    dry_run: dryRun,
    queue,
    movie_limit: movieLimit,
    checked: results.length,
    ok: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results: results.slice(0, 20),
  });
});
