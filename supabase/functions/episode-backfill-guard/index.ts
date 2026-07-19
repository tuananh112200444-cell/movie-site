import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

type SupabaseClient = ReturnType<typeof createClient>;

interface MovieCandidate {
  id: string;
  slug: string;
  name?: string | null;
  source_site?: string | null;
  source_name?: string | null;
  ophim_slug?: string | null;
  episode_current?: string | null;
  current_episode?: number | null;
}

interface RepairCandidate {
  id: string;
  slug: string;
  name: string;
  provider: 'ophim' | 'kkphim';
  repair_slug: string;
  displayed_episode: number;
  playable_episode: number;
}

interface MetadataAnomaly {
  id: string;
  slug: string;
  name: string;
  source_site: string;
  source_name: string;
  displayed_episode: number;
  playable_episode: number;
  gap: number;
  reason: string;
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

function isTransientCallFailure(call: FunctionCallResult): boolean {
  if (call.ok) return false;
  const text = JSON.stringify(call.result || '').toLowerCase();
  return (
    call.status === 0 &&
    (
      text.includes('signal has been aborted') ||
      text.includes('timeout') ||
      text.includes('timed out') ||
      text.includes('fetch failed') ||
      text.includes('network')
    )
  );
}

function episodeNumberFromText(value: unknown): number {
  const text = String(value || '').toLowerCase();
  if (!text) return 0;
  if (text.includes('full')) return 1;
  const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slash) return Number(slash[1] || 0) || 0;
  const range = text.match(/(?:tap|ep|episode|tập)?\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
  if (range) return Number(range[2] || 0) || Number(range[1] || 0) || 0;
  const match = text.match(/(\d{1,4})/);
  return match ? Number(match[1] || 0) || 0 : 0;
}

function displayedEpisode(movie: MovieCandidate): number {
  return Math.max(
    Number(movie.current_episode || 0) || 0,
    episodeNumberFromText(movie.episode_current),
  );
}

function playableEpisodeNumber(row: Record<string, unknown>): number {
  const hasLink = Boolean(
    String(row.link_m3u8 || row.stream_url || '').trim() ||
    String(row.link_embed || row.embed_url || '').trim()
  );
  if (!hasLink) return 0;
  return Math.max(
    Number(row.episode_number || 0) || 0,
    episodeNumberFromText(row.episode_slug),
    episodeNumberFromText(row.slug),
    episodeNumberFromText(row.episode_name),
  );
}

function getProvider(movie: MovieCandidate): 'ophim' | 'kkphim' {
  const source = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  return source.includes('kkphim') || source.includes('phimapi') ? 'kkphim' : 'ophim';
}

async function readCursorPage(supabase: SupabaseClient, key: string): Promise<number> {
  const { data } = await supabase
    .from('sync_cursors')
    .select('page')
    .eq('key', key)
    .maybeSingle();
  const page = Number(data?.page || 1);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

async function writeCursorPage(supabase: SupabaseClient, key: string, page: number): Promise<void> {
  await supabase
    .from('sync_cursors')
    .upsert({ key, page, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

async function queryRowsByMovieIds(
  supabase: SupabaseClient,
  table: string,
  select: string,
  movieIds: string[],
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < movieIds.length; index += 25) {
    const ids = movieIds.slice(index, index + 25);
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in('movie_id', ids)
      .limit(1000);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data || []) as Record<string, unknown>[]));
  }
  return rows;
}

async function findEpisodeMismatchCandidates(
  supabase: SupabaseClient,
  options: {
    cursorKey: string;
    scanLimit: number;
    repairLimit: number;
    minDisplayed: number;
    maxDisplayed: number;
    severeOnly: boolean;
    advanceCursor: boolean;
  },
): Promise<{ candidates: RepairCandidate[]; scanned: number; next_page: number }> {
  const page = await readCursorPage(supabase, options.cursorKey);
  const from = (page - 1) * options.scanLimit;
  const to = from + options.scanLimit - 1;
  const { data, error } = await supabase
    .from('movies')
    .select('id, slug, name, source_site, source_name, ophim_slug, episode_current, current_episode')
    .eq('is_published', true)
    .or('source_site.ilike.%ophim%,source_name.ilike.%ophim%,source_site.ilike.%phimapi%,source_name.ilike.%kkphim%,ophim_slug.not.is.null')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .range(from, to);
  if (error) throw new Error(`movies mismatch scan: ${error.message}`);

  const movies = ((data || []) as MovieCandidate[])
    .map((movie) => ({ ...movie, displayed: displayedEpisode(movie) }))
    .filter((movie) => movie.displayed >= options.minDisplayed && movie.displayed <= options.maxDisplayed);
  const ids = movies.map((movie) => movie.id).filter(Boolean);

  const [movieEpisodes, episodes, streams] = await Promise.all([
    queryRowsByMovieIds(supabase, 'movie_episodes', 'movie_id, episode_number, slug, episode_name, link_m3u8, link_embed, source', ids),
    queryRowsByMovieIds(supabase, 'episodes', 'movie_id, episode_number, episode_slug, episode_name, link_m3u8, link_embed', ids),
    queryRowsByMovieIds(supabase, 'streams', 'movie_id, episode_slug, stream_url, embed_url, is_active', ids),
  ]);

  const playableByMovie = new Map<string, number>();
  for (const row of [
    ...movieEpisodes.filter((row) => String(row.source || '').toLowerCase() !== 'hidden'),
    ...episodes,
    ...streams.filter((row) => row.is_active !== false),
  ]) {
    const movieId = String(row.movie_id || '');
    const episode = playableEpisodeNumber(row);
    if (!movieId || episode <= 0) continue;
    playableByMovie.set(movieId, Math.max(playableByMovie.get(movieId) || 0, episode));
  }

  const candidates = movies
    .map((movie) => {
      const playable = playableByMovie.get(movie.id) || 0;
      return {
        id: movie.id,
        slug: movie.slug,
        name: String(movie.name || movie.slug),
        provider: getProvider(movie),
        repair_slug: String(movie.ophim_slug || movie.slug).trim(),
        displayed_episode: movie.displayed,
        playable_episode: playable,
      } as RepairCandidate;
    })
    .filter((movie) =>
      movie.repair_slug &&
      movie.playable_episode < movie.displayed_episode &&
      (!options.severeOnly || movie.playable_episode <= 1)
    )
    .sort((a, b) => (b.displayed_episode - b.playable_episode) - (a.displayed_episode - a.playable_episode))
    .slice(0, options.repairLimit);

  const nextPage = (data || []).length < options.scanLimit ? 1 : page + 1;
  if (options.advanceCursor) await writeCursorPage(supabase, options.cursorKey, nextPage);
  return { candidates, scanned: (data || []).length, next_page: nextPage };
}

async function findMetadataAnomalies(
  supabase: SupabaseClient,
  options: {
    limit: number;
    displayedThreshold: number;
    maxPlayableForAnomaly: number;
    minGap: number;
  },
): Promise<{ anomalies: MetadataAnomaly[]; scanned: number }> {
  if (options.limit <= 0) return { anomalies: [], scanned: 0 };

  const { data, error } = await supabase
    .from('movies')
    .select('id, slug, name, source_site, source_name, ophim_slug, episode_current, current_episode')
    .eq('is_published', true)
    .or('source_site.ilike.%ophim%,source_name.ilike.%ophim%,source_site.ilike.%phimapi%,source_name.ilike.%kkphim%,ophim_slug.not.is.null')
    .gte('current_episode', options.displayedThreshold)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(Math.max(options.limit * 8, 40));
  if (error) throw new Error(`metadata anomaly scan: ${error.message}`);

  const movies = ((data || []) as MovieCandidate[])
    .map((movie) => ({ ...movie, displayed: displayedEpisode(movie) }))
    .filter((movie) => movie.displayed >= options.displayedThreshold);
  const ids = movies.map((movie) => movie.id).filter(Boolean);

  const [movieEpisodes, episodes, streams] = await Promise.all([
    queryRowsByMovieIds(supabase, 'movie_episodes', 'movie_id, episode_number, slug, episode_name, link_m3u8, link_embed, source', ids),
    queryRowsByMovieIds(supabase, 'episodes', 'movie_id, episode_number, episode_slug, episode_name, link_m3u8, link_embed', ids),
    queryRowsByMovieIds(supabase, 'streams', 'movie_id, episode_slug, stream_url, embed_url, is_active', ids),
  ]);

  const playableByMovie = new Map<string, number>();
  for (const row of [
    ...movieEpisodes.filter((row) => String(row.source || '').toLowerCase() !== 'hidden'),
    ...episodes,
    ...streams.filter((row) => row.is_active !== false),
  ]) {
    const movieId = String(row.movie_id || '');
    const episode = playableEpisodeNumber(row);
    if (!movieId || episode <= 0) continue;
    playableByMovie.set(movieId, Math.max(playableByMovie.get(movieId) || 0, episode));
  }

  const anomalies = movies
    .map((movie) => {
      const playable = playableByMovie.get(movie.id) || 0;
      const displayed = movie.displayed;
      const gap = displayed - playable;
      return {
        id: movie.id,
        slug: movie.slug,
        name: String(movie.name || movie.slug),
        source_site: String(movie.source_site || ''),
        source_name: String(movie.source_name || ''),
        displayed_episode: displayed,
        playable_episode: playable,
        gap,
        reason: 'metadata_episode_is_far_above_playable_episode',
      } as MetadataAnomaly;
    })
    .filter((movie) =>
      movie.displayed_episode >= options.displayedThreshold &&
      movie.playable_episode > 0 &&
      movie.playable_episode <= options.maxPlayableForAnomaly &&
      movie.gap >= options.minGap
    )
    .sort((a, b) => b.gap - a.gap)
    .slice(0, options.limit);

  return { anomalies, scanned: (data || []).length };
}

async function callFunction(
  baseUrl: string,
  serviceKey: string,
  secret: string,
  name: string,
  params: Record<string, string | number | boolean | null | undefined>,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 25000,
): Promise<FunctionCallResult> {
  const started = Date.now();
  const endpoint = new URL(`${baseUrl.replace(/\/$/, '')}/functions/v1/${name}`);
  appendParams(endpoint, params);
  if (secret) endpoint.searchParams.set('secret', secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
  if (!cronSecret && !blvietsubSecret) return json({ success: false, error: 'Sync authentication is not configured' }, 503);
  if (providedSecret !== cronSecret && providedSecret !== blvietsubSecret) {
    return json({ success: false, error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) {
    return json({ success: false, error: 'Missing Supabase env' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const internalSecret = providedSecret || cronSecret || blvietsubSecret;
  const latestPages = clampNumber(url.searchParams.get('latest_pages'), 2, 1, 5);
  const latestLimit = clampNumber(url.searchParams.get('latest_limit'), 36, 1, 100);
  const backfillPages = clampNumber(url.searchParams.get('backfill_pages'), 1, 1, 5);
  const backfillLimit = clampNumber(url.searchParams.get('backfill_limit'), 24, 1, 100);
  const blLatestLimit = clampNumber(url.searchParams.get('blvietsub_latest_limit'), 150, 10, 500);
  const blBackfillLimit = clampNumber(url.searchParams.get('blvietsub_backfill_limit'), 100, 10, 1000);
  const blPageSize = clampNumber(url.searchParams.get('blvietsub_page_size'), 150, 10, 500);
  const blRepairExistingLimit = clampNumber(url.searchParams.get('blvietsub_repair_existing_limit'), 24, 1, 80);
  const mismatchScanLimit = clampNumber(url.searchParams.get('mismatch_scan_limit'), 180, 20, 500);
  const mismatchRepairLimit = clampNumber(url.searchParams.get('mismatch_repair_limit'), 6, 0, 20);
  const mismatchMinDisplayed = clampNumber(url.searchParams.get('mismatch_min_displayed'), 3, 2, 20);
  const mismatchMaxDisplayed = clampNumber(url.searchParams.get('mismatch_max_displayed'), 80, mismatchMinDisplayed, 200);
  const mismatchSevereOnly = url.searchParams.get('mismatch_severe_only') !== '0';
  const mismatchCursorKey = url.searchParams.get('mismatch_cursor_key') || 'episode-backfill-guard:mismatch:v1';
  const mismatchOnly = url.searchParams.get('mismatch_only') === '1';
  const anomalyLimit = clampNumber(url.searchParams.get('metadata_anomaly_limit'), mismatchOnly ? 0 : 8, 0, 50);
  const anomalyDisplayedThreshold = clampNumber(url.searchParams.get('metadata_anomaly_displayed_threshold'), 500, 100, 5000);
  const anomalyMaxPlayable = clampNumber(url.searchParams.get('metadata_anomaly_max_playable'), 200, 1, 1000);
  const anomalyMinGap = clampNumber(url.searchParams.get('metadata_anomaly_min_gap'), 300, 50, 5000);
  const skipBlvietsub = url.searchParams.get('skip_blvietsub') === '1';
  const skipDirectOphim = url.searchParams.get('skip_direct_ophim') === '1';
  const childTimeoutMs = clampNumber(url.searchParams.get('child_timeout_ms'), 25000, 5000, 120000);
  const refreshCaches = url.searchParams.get('refresh_caches') !== '0';
  const dryRun = url.searchParams.get('dry_run') === '1';

  const calls: FunctionCallResult[] = [];
  let mismatchRepair:
    | { candidates: RepairCandidate[]; scanned: number; next_page: number; calls: FunctionCallResult[]; error?: string }
    | null = null;
  let metadataAnomalies:
    | { anomalies: MetadataAnomaly[]; scanned: number; error?: string }
    | null = null;

  if (!mismatchOnly) for (const provider of ['ophim', 'kkphim']) {
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-ophim-movies', {
      provider,
      episodes: '1',
      pages: latestPages,
      limit: latestLimit,
      dry_run: dryRun ? '1' : null,
    }, {}, childTimeoutMs));

    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-ophim-movies', {
      provider,
      episodes: '1',
      backfill: '1',
      pages: backfillPages,
      limit: backfillLimit,
      cursor_key: `episode-backfill-guard:${provider}`,
      dry_run: dryRun ? '1' : null,
    }, {}, childTimeoutMs));
  }

  if (!dryRun && !mismatchOnly && !skipDirectOphim) {
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'auto-sync-ophim-episodes', {
      limit: clampNumber(url.searchParams.get('direct_ophim_limit'), 80, 1, 200),
    }, {}, childTimeoutMs));
  }

  if (skipBlvietsub && !mismatchOnly) {
    calls.push({
      name: 'sync-blvietsub-feed',
      ok: true,
      status: 200,
      elapsed_ms: 0,
      result: {
        skipped: true,
        reason: 'skip_blvietsub=1',
      },
    });
  } else if (dryRun && !mismatchOnly) {
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
  } else if (!mismatchOnly) {
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-blvietsub-feed', {
      offset: 0,
      limit: blLatestLimit,
      page_size: blPageSize,
      refresh_search: '0',
    }, {}, childTimeoutMs));

    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-blvietsub-feed', {
      repair_existing: '1',
      limit: blRepairExistingLimit,
      refresh_search: refreshCaches ? '1' : null,
    }, {}, childTimeoutMs));

    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-blvietsub-feed', {
      use_cursor: '1',
      cursor_key: 'episode-backfill-guard:blvietsub',
      limit: blBackfillLimit,
      page_size: blPageSize,
      refresh_search: refreshCaches ? '1' : null,
    }, {}, childTimeoutMs));
  }

  if (mismatchRepairLimit > 0) {
    try {
      const mismatch = await findEpisodeMismatchCandidates(supabase, {
        cursorKey: mismatchCursorKey,
        scanLimit: mismatchScanLimit,
        repairLimit: mismatchRepairLimit,
        minDisplayed: mismatchMinDisplayed,
        maxDisplayed: mismatchMaxDisplayed,
        severeOnly: mismatchSevereOnly,
        advanceCursor: !dryRun,
      });
      const mismatchCalls: FunctionCallResult[] = [];
      if (!dryRun) {
        for (const candidate of mismatch.candidates) {
          mismatchCalls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'sync-ophim-movies', {
            provider: candidate.provider,
            slug: candidate.repair_slug,
            episodes: '1',
            limit: 1,
            reason: 'episode_mismatch_guard',
          }, {}, childTimeoutMs));
        }
      }
      mismatchRepair = {
        candidates: mismatch.candidates,
        scanned: mismatch.scanned,
        next_page: mismatch.next_page,
        calls: mismatchCalls,
      };
      calls.push(...mismatchCalls);
    } catch (error) {
      mismatchRepair = {
        candidates: [],
        scanned: 0,
        next_page: 0,
        calls: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (anomalyLimit > 0) {
    try {
      metadataAnomalies = await findMetadataAnomalies(supabase, {
        limit: anomalyLimit,
        displayedThreshold: anomalyDisplayedThreshold,
        maxPlayableForAnomaly: anomalyMaxPlayable,
        minGap: anomalyMinGap,
      });
    } catch (error) {
      metadataAnomalies = {
        anomalies: [],
        scanned: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (refreshCaches && !dryRun) {
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'search-index-proxy', {
      refresh: '1',
      limit: 5000,
    }, {}, childTimeoutMs));
    calls.push(await callFunction(supabaseUrl, serviceKey, internalSecret, 'home-proxy', {
      refresh: '1',
    }, { 'x-home-proxy-refresh': '1' }, childTimeoutMs));
  }

  const nonCriticalFailed = calls.filter((call) =>
    !call.ok &&
    (
      call.name === 'search-index-proxy' ||
      call.name === 'home-proxy' ||
      (call.name === 'sync-ophim-movies' && isTransientCallFailure(call))
    )
  );
  const failed = calls.filter((call) =>
    !call.ok &&
    call.name !== 'search-index-proxy' &&
    call.name !== 'home-proxy' &&
    !(call.name === 'sync-ophim-movies' && isTransientCallFailure(call))
  );
  return json({
    success: failed.length === 0,
    dry_run: dryRun,
    mismatch_only: mismatchOnly,
    calls,
    mismatch_repair: mismatchRepair,
    metadata_anomalies: metadataAnomalies,
    warning_count: nonCriticalFailed.length,
    warnings: nonCriticalFailed.map((call) => ({
      name: call.name,
      status: call.status,
      elapsed_ms: call.elapsed_ms,
      result: call.result,
    })),
    failed_count: failed.length,
    elapsed_ms: Date.now() - started,
  }, failed.length ? 207 : 200);
});
