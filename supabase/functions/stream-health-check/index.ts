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
  movies?: { slug?: string } | Array<{ slug?: string }> | null;
}

interface ProbeResult {
  ok: boolean;
  status: number | null;
  responseMs: number;
  error: string;
  directStreamFailed?: boolean;
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

function spreadAcrossMovies(rows: unknown[], limit: number): unknown[] {
  const onePerMovie: unknown[] = [];
  const overflow: unknown[] = [];
  const seenMovies = new Set<string>();
  for (const row of rows) {
    const movieId = String((row as StreamRow).movie_id || '');
    if (movieId && !seenMovies.has(movieId)) {
      seenMovies.add(movieId);
      onePerMovie.push(row);
    } else {
      overflow.push(row);
    }
  }
  return [...onePerMovie, ...overflow].slice(0, limit);
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
    // Several video CDNs reject otherwise valid requests when the UA contains
    // an automation suffix. Probe with the same shape as a real mobile viewer.
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    Accept: '*/*',
  };
  if (/blvietsub\.com/i.test(url)) headers.Referer = 'https://blvietsub.com/';
  if (/opstream|ophim/i.test(url)) headers.Referer = 'https://ophim1.com/';
  else if (/streamc\.xyz/i.test(url)) headers.Referer = 'https://khophim.org/';
  else if (/phimapi|kkphim|phim1280/i.test(url)) headers.Referer = 'https://khophim.org/';
  return headers;
}

function firstPlaylistUri(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#')) || '';
}

async function probe(url: string): Promise<ProbeResult> {
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
      let playlistUrl = url;
      let playlistText = await response.text();
      if (!playlistText.includes('#EXTM3U')) {
        return { ok: false, status: response.status, responseMs, error: 'HLS master playlist invalid' };
      }

      // A 200 master is not proof of playback. Some expired provider URLs
      // still return a master whose referenced media playlist is already 404.
      if (playlistText.includes('#EXT-X-STREAM-INF')) {
        const childPath = firstPlaylistUri(playlistText);
        if (!childPath) {
          return { ok: false, status: response.status, responseMs, error: 'HLS master has no media playlist' };
        }
        playlistUrl = new URL(childPath, url).toString();
        const childResponse = await fetch(playlistUrl, {
          method: 'GET',
          headers: headersFor(playlistUrl),
          redirect: 'follow',
          signal: controller.signal,
        });
        if (!childResponse.ok) {
          return {
            ok: false,
            status: childResponse.status,
            responseMs: Date.now() - started,
            error: `HLS media playlist HTTP ${childResponse.status}`,
          };
        }
        playlistText = await childResponse.text();
      }

      if (!playlistText.includes('#EXTM3U') || !playlistText.includes('#EXTINF')) {
        return {
          ok: false,
          status: response.status,
          responseMs: Date.now() - started,
          error: 'HLS media playlist invalid',
        };
      }

      const segmentPath = firstPlaylistUri(playlistText);
      if (!segmentPath) {
        return { ok: false, status: response.status, responseMs: Date.now() - started, error: 'HLS playlist has no segment' };
      }
      const segmentUrl = new URL(segmentPath, playlistUrl).toString();
      const segmentResponse = await fetch(segmentUrl, {
        method: 'GET',
        headers: { ...headersFor(segmentUrl), Range: 'bytes=0-65535' },
        redirect: 'follow',
        signal: controller.signal,
      });
      const segmentType = segmentResponse.headers.get('content-type') || '';
      const segmentOk = segmentResponse.ok && !/text\/html/i.test(segmentType);
      await segmentResponse.body?.cancel().catch(() => undefined);
      return {
        ok: segmentOk,
        status: segmentResponse.status,
        responseMs: Date.now() - started,
        error: segmentOk ? '' : `HLS segment HTTP ${segmentResponse.status}`,
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

async function probeStreamRow(row: StreamRow): Promise<ProbeResult> {
  const directUrl = String(row.stream_url || '').trim();
  const embedUrl = String(row.embed_url || '').trim();
  const candidates = unique([directUrl, embedUrl].filter(Boolean));
  const failures: ProbeResult[] = [];
  for (const candidate of candidates) {
    const result = await probe(candidate);
    if (result.ok) {
      if (candidate === embedUrl && directUrl && failures.length > 0) {
        if (String(row.last_error || '').startsWith('Viewer telemetry:')) {
          const directFailure = failures[0];
          return {
            ...directFailure,
            error: `Viewer telemetry confirmed direct failure: ${directFailure.error}; embed page reachability is not playback proof`,
          };
        }
        return {
          ...result,
          directStreamFailed: true,
          error: `Direct stream failed: ${failures[0].error}; embed fallback reachable`,
        };
      }
      return result;
    }
    failures.push(result);
  }
  const selectedFailure = failures.sort((a, b) => {
    const severity = (status: number | null) =>
      status === 404 || status === 410 ? 4 : status !== null && status >= 500 ? 3 : status === 401 || status === 403 ? 2 : 1;
    return severity(b.status) - severity(a.status);
  })[0] ?? { ok: false, status: null, responseMs: 0, error: 'No stream or embed URL' };
  if (String(row.last_error || '').startsWith('Viewer telemetry:')) {
    return {
      ...selectedFailure,
      error: `Viewer telemetry confirmed source failure: ${selectedFailure.error}`,
    };
  }
  return selectedFailure;
}

async function logHealth(
  supabase: SupabaseClient,
  row: StreamRow,
  result: ProbeResult,
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

function healthStatusFor(result: ProbeResult, failureCount: number) {
  if (result.ok) return result.directStreamFailed ? 'degraded' : 'ok';
  if (result.error.startsWith('Viewer telemetry confirmed')) return 'dead';
  if (result.status === 401 || result.status === 403) return 'blocked';
  if (result.status === 404 || result.status === 410) return failureCount >= 2 ? 'dead' : 'failed';
  return 'failed';
}

function shouldDeactivate(result: ProbeResult, failureCount: number, deactivateAfter: number) {
  if (result.ok) return false;
  if (result.error.startsWith('Viewer telemetry confirmed')) return true;
  if (result.status === 401 || result.status === 403) return false;
  if (result.status === 404 || result.status === 410) return failureCount >= 2;
  if (/playlist invalid|name not resolved|connection refused/i.test(result.error)) return failureCount >= 2;
  return failureCount >= deactivateAfter;
}

async function updateStream(
  supabase: SupabaseClient,
  row: StreamRow,
  result: ProbeResult,
  deactivateAfter: number,
) {
  const now = new Date().toISOString();
  const embedUrl = String(row.embed_url || '').trim();
  const browserManagedProbeBlocked =
    !String(row.stream_url || '').trim()
    && /https?:\/\/[^/]*streamc\.xyz\//i.test(embedUrl)
    && (result.status === 401 || result.status === 403);
  if (browserManagedProbeBlocked) {
    const viewerReportedFailure = String(row.last_error || '').startsWith('Viewer telemetry:');
    const providerVerificationPending = String(row.last_error || '').startsWith('Provider verification pending:');
    await supabase.from('streams').update({
      last_checked_at: now,
      response_time_ms: result.responseMs,
      updated_at: now,
      ...(!viewerReportedFailure ? {
        health_status: 'unchecked',
        failure_count: 0,
        last_error: providerVerificationPending
          ? row.last_error
          : 'Server probe blocked; browser validation required',
      } : {}),
    }).eq('id', row.id);
    return;
  }
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
      last_checked_at: now,
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
    update.priority = result.directStreamFailed
      ? Math.min(Number(row.priority || 100), 40)
      : scoreStream(row, result.responseMs);
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
  const episodeSlug = String(url.searchParams.get('episode') || '').trim();
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
  let preselectedRows: unknown[] | null = null;

  if (slug) {
    // Resolve the indexed movie identity first. Filtering streams through the
    // embedded movies join timed out on the production stream table even for
    // a single requested episode.
    const { data: targetMovie, error: targetMovieError } = await supabase
      .from('movies')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (targetMovieError) return json({ success: false, error: targetMovieError.message }, 500);
    if (!targetMovie?.id) return json({ success: true, checked: 0, results: [], message: 'Movie not found' });
    query = query.eq('movie_id', targetMovie.id);
    if (episodeSlug) query = query.eq('episode_slug', episodeSlug);
  }
  else if (queue === 'unchecked') {
    // Split one bounded run between new imports and the historical backlog.
    // Oldest-first alone made today's streams wait behind hundreds of
    // thousands of unchecked rows.
    const recentLimit = Math.ceil(limit / 2);
    const backlogLimit = Math.max(0, limit - recentLimit);
    const [recentResult, backlogResult] = await Promise.all([
      supabase
        .from('streams')
        .select(streamSelect)
        .eq('is_active', true)
        .eq('health_status', 'unchecked')
        .or('stream_url.neq.,embed_url.neq.')
        .order('updated_at', { ascending: false })
        .limit(Math.min(recentLimit * 4, 300)),
      backlogLimit > 0
        ? supabase
          .from('streams')
          .select(streamSelect)
          .eq('is_active', true)
          .eq('health_status', 'unchecked')
          .or('stream_url.neq.,embed_url.neq.')
          .order('last_checked_at', { ascending: true, nullsFirst: true })
          .order('priority', { ascending: false })
          .limit(Math.min(backlogLimit * 4, 300))
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (recentResult.error) return json({ success: false, error: recentResult.error.message }, 500);
    if (backlogResult.error) return json({ success: false, error: backlogResult.error.message }, 500);
    const distinctRows = [...new Map(
      [...(recentResult.data || []), ...(backlogResult.data || [])]
        .map((row) => [String((row as StreamRow).id), row]),
    ).values()];
    preselectedRows = spreadAcrossMovies(distinctRows, limit);
  } else if (queue === 'problem') {
    const { data: problemRows, error: problemError } = await supabase
      .from('streams')
      .select(streamSelect)
      .eq('is_active', true)
      .in('health_status', ['failed', 'dead', 'blocked'])
      .or('stream_url.neq.,embed_url.neq.')
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .order('priority', { ascending: false })
      .limit(Math.min(limit * 4, 600));
    if (problemError) return json({ success: false, error: problemError.message }, 500);
    preselectedRows = spreadAcrossMovies(problemRows || [], limit);
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
    // Viewer telemetry is advisory until this queue independently probes the
    // exact stored source. It must outrank merely recent catalogue updates.
    const hotRetryBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const hotCandidateQuery = (pattern: string) => supabase
      .from('streams')
      .select(streamSelect)
      .eq('is_active', true)
      .like('last_error', pattern)
      .or(`last_checked_at.is.null,last_checked_at.lt.${hotRetryBefore}`)
      .or('stream_url.neq.,embed_url.neq.')
      .order('updated_at', { ascending: false })
      .limit(Math.min(limit * 4, 600));
    const [telemetryResult, verificationResult] = await Promise.all([
      hotCandidateQuery('Viewer telemetry:%'),
      hotCandidateQuery('Provider verification pending:%'),
    ]);
    const telemetryError = telemetryResult.error || verificationResult.error;
    if (telemetryError) return json({ success: false, error: telemetryError.message }, 500);
    const verificationRows = verificationResult.data || [];
    const viewerRows = telemetryResult.data || [];
    const verificationBudget = verificationRows.length > 0 ? Math.ceil(limit / 2) : 0;
    const prioritizedHotRows = [
      ...spreadAcrossMovies(verificationRows, verificationBudget),
      ...spreadAcrossMovies(viewerRows, limit - verificationBudget),
      ...verificationRows,
      ...viewerRows,
    ];
    const telemetryRows = [...new Map(
      prioritizedHotRows.map((row) => [String((row as StreamRow).id), row]),
    ).values()].slice(0, limit);

    if ((telemetryRows || []).length > 0) {
      preselectedRows = telemetryRows;
    } else {
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
  }

  const queryResult = preselectedRows ? { data: preselectedRows, error: null } : await query;
  const { data, error } = queryResult;
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
        movie_slug: Array.isArray(row.movies) ? row.movies[0]?.slug : row.movies?.slug,
        episode_slug: row.episode_slug,
        server_name: row.server_name,
        ok: result.ok,
        degraded: Boolean(result.directStreamFailed),
        status: result.status,
        response_time_ms: result.responseMs,
        error: result.error,
      };
    }));
    results.push(...batchResults.filter(Boolean));
  }

  if (!dryRun) {
    const staleDetailSlugs = unique(results
      .filter((item) => item && (!item.ok || item.degraded))
      .map((item) => String(item?.movie_slug || '').trim())
      .filter(Boolean));
    for (let index = 0; index < staleDetailSlugs.length; index += 100) {
      await supabase
        .from('movie_api_cache')
        .delete()
        .in('slug', staleDetailSlugs.slice(index, index + 100));
    }
  }

  return json({
    success: true,
    dry_run: dryRun,
    queue,
    movie_limit: movieLimit,
    checked: results.length,
    ok: results.filter((item) => item.ok).length,
    degraded: results.filter((item) => item.degraded).length,
    failed: results.filter((item) => !item.ok).length,
    results: results.slice(0, 20),
  });
});
