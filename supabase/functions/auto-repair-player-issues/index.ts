import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const CRITICAL_EVENTS = new Set([
  'stall_fatal',
  'hls_fatal',
  'hls_fatal_retry',
  'direct_video_error',
  'native_hls_error',
  'iframe_blocked',
]);

type SupabaseClient = ReturnType<typeof createClient>;

interface PlayerErrorEvent {
  movie_slug: string | null;
  movie_title: string | null;
  episode_slug: string | null;
  episode_name: string | null;
  server_name: string | null;
  event_type: string | null;
  source_host: string | null;
  player_mode: string | null;
  created_at: string;
}

interface MovieRow {
  id: string;
  slug: string;
  name: string | null;
  origin_name: string | null;
  source_site: string | null;
  source_name: string | null;
  source_url: string | null;
  showtimes: string | null;
  ophim_id: string | null;
  ophim_slug: string | null;
}

interface RepairCandidate {
  slug: string;
  title: string;
  score: number;
  critical: number;
  hosts: string[];
  host_counts: Record<string, number>;
  servers: string[];
  episodes: string[];
  last_seen_at: string;
}

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

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function normalizeUrl(value = ''): string {
  return value.replace(/^http:\/\//i, 'https://').replace(/\/+$/, '').trim();
}

function addUnique(list: string[], value: string | null | undefined, limit = 8): void {
  const trimmed = String(value || '').trim();
  if (!trimmed || list.includes(trimmed) || list.length >= limit) return;
  list.push(trimmed);
}

function getAuthSecret(req: Request, url: URL): string {
  return url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
}

function validSecret(provided: string): boolean {
  const allowed = [
    Deno.env.get('PLAYER_REPAIR_SECRET') || '',
    Deno.env.get('CRON_SECRET') || '',
    Deno.env.get('BLVIETSUB_SYNC_SECRET') || '',
  ].filter(Boolean);
  return allowed.length > 0 && allowed.includes(provided);
}

function internalSecret(provided: string): string {
  return Deno.env.get('CRON_SECRET') || Deno.env.get('BLVIETSUB_SYNC_SECRET') || Deno.env.get('PLAYER_REPAIR_SECRET') || provided || '';
}

function getBlvietsubMovieUrl(movie: MovieRow): string {
  for (const raw of [movie.source_url, movie.showtimes]) {
    const value = normalizeUrl(String(raw || ''));
    if (/^https:\/\/(?:www\.)?blvietsub\.com\/phim\/[^/]+\/?$/i.test(value)) return value;
  }
  return '';
}

function isBlvietsubMovie(movie: MovieRow): boolean {
  const source = `${movie.slug} ${movie.source_site || ''} ${movie.source_name || ''} ${movie.source_url || ''} ${movie.showtimes || ''}`.toLowerCase();
  return source.includes('blvietsub') || source.includes('admin-queer') || Boolean(getBlvietsubMovieUrl(movie));
}

function isOphimLikeMovie(movie: MovieRow): boolean {
  const source = `${movie.source_site || ''} ${movie.source_name || ''} ${movie.source_url || ''} ${movie.showtimes || ''}`.toLowerCase();
  return Boolean(movie.ophim_id || movie.ophim_slug || source.includes('ophim') || source.includes('kkphim') || source.includes('phimapi'));
}

function getOphimProvider(movie: MovieRow): 'kkphim' | 'ophim' {
  const source = `${movie.source_site || ''} ${movie.source_name || ''} ${movie.source_url || ''} ${movie.showtimes || ''}`.toLowerCase();
  return source.includes('kkphim') || source.includes('phimapi') ? 'kkphim' : 'ophim';
}

function getOphimRepairSlug(movie: MovieRow): string {
  return String(movie.ophim_slug || movie.slug || movie.ophim_id || '').trim();
}

function urlHost(value: unknown): string {
  try { return new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

async function penalizeTelemetryFailedStreams(
  supabase: SupabaseClient,
  movieId: string,
  hosts: string[],
  episodeSlugs: string[],
): Promise<number> {
  const normalizedHosts = new Set(hosts.map((host) => host.toLowerCase().replace(/^www\./, '')).filter(Boolean));
  const normalizedEpisodes = new Set(episodeSlugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean));
  if (!movieId || normalizedHosts.size === 0) return 0;
  const { data } = await supabase.from('streams')
    .select('id,episode_slug,stream_url,embed_url,failure_count,priority')
    .eq('movie_id', movieId).eq('is_active', true)
    .abortSignal(AbortSignal.timeout(12_000));
  let penalized = 0;
  for (const row of data || []) {
    const host = urlHost(row.stream_url || row.embed_url);
    if (!normalizedHosts.has(host)) continue;
    const episodeSlug = String(row.episode_slug || '').trim().toLowerCase();
    if (normalizedEpisodes.size > 0 && !normalizedEpisodes.has(episodeSlug)) continue;
    const { error } = await supabase.from('streams').update({
      // Browser telemetry can be caused by the viewer's connection, tab
      // suspension, VPN or device decoder. It may request a repair and lower
      // preference, but only stream-health-check may disable a stored stream
      // after an independent probe.
      priority: Math.max(-2, Number(row.priority || 0) - 1),
      last_error: 'Viewer telemetry: repair requested; independent probe required',
    }).eq('id', row.id);
    if (!error) penalized += 1;
  }
  return penalized;
}

function summarizeCandidates(events: PlayerErrorEvent[], threshold: number, limit: number): RepairCandidate[] {
  const map = new Map<string, RepairCandidate>();

  for (const event of events) {
    const slug = String(event.movie_slug || '').trim();
    if (!slug || !CRITICAL_EVENTS.has(String(event.event_type || ''))) continue;

    const current = map.get(slug) ?? {
      slug,
      title: String(event.movie_title || slug),
      score: 0,
      critical: 0,
      hosts: [],
      host_counts: {},
      servers: [],
      episodes: [],
      last_seen_at: event.created_at,
    };

    current.critical += 1;
    current.score += event.event_type === 'stall_fatal' ? 5 : event.event_type === 'hls_fatal_retry' ? 3 : 4;
    if (event.created_at > current.last_seen_at) current.last_seen_at = event.created_at;
    const eventHost = String(event.source_host || '').toLowerCase().replace(/^www\./, '').trim();
    if (eventHost) current.host_counts[eventHost] = Number(current.host_counts[eventHost] || 0) + 1;
    addUnique(current.hosts, eventHost, 6);
    addUnique(current.servers, event.server_name, 6);
    addUnique(current.episodes, event.episode_slug || event.episode_name, 6);
    if (!current.title || current.title === slug) current.title = String(event.movie_title || slug);
    map.set(slug, current);
  }

  return [...map.values()]
    .filter((item) => item.critical >= threshold)
    .map((item) => ({
      ...item,
      hosts: item.hosts.filter((host) => Number(item.host_counts[host] || 0) >= threshold),
    }))
    .sort((a, b) => b.score - a.score || b.critical - a.critical || b.last_seen_at.localeCompare(a.last_seen_at))
    .slice(0, limit);
}

async function callFunction(
  supabaseUrl: string,
  serviceKey: string,
  secret: string,
  name: string,
  params: Record<string, string | number | null | undefined>,
): Promise<FunctionCallResult> {
  const started = Date.now();
  const endpoint = new URL(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${name}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    endpoint.searchParams.set(key, String(value));
  }
  if (secret) endpoint.searchParams.set('secret', secret);

  const controller = new AbortController();
  // The parent Edge request has a 150s idle ceiling. A child must fail fast so
  // the repair can record its result/cooldown instead of being killed mid-run.
  const timeout = setTimeout(() => controller.abort(), 75000);
  try {
    const response = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'x-cron-secret': secret,
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
    return { name, ok: response.ok, status: response.status, elapsed_ms: Date.now() - started, result };
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

function compactCall(call: FunctionCallResult): FunctionCallResult {
  const result = call.result as Record<string, unknown> | null;
  if (!result || typeof result !== 'object') return call;

  if (Array.isArray(result.items)) {
    const { items: _items, ...rest } = result;
    return {
      ...call,
      result: {
        ...rest,
        items_count: _items.length,
      },
    };
  }

  return call;
}

async function deleteMovieCaches(supabase: SupabaseClient, slugs: string[]) {
  const targets = Array.from(new Set(slugs.map((slug) => slug.trim()).filter(Boolean)));
  if (targets.length === 0) return;
  try {
    await supabase.from('movie_api_cache').delete().in('slug', targets);
  } catch {
    /* cache cleanup is best-effort */
  }
}

async function logRun(
  supabase: SupabaseClient,
  payload: {
    scanned: number;
    repaired: number;
    skipped: number;
    errors: string[];
    details: unknown[];
    elapsed_ms: number;
    success: boolean;
  },
) {
  try {
    await supabase.from('sync_logs').insert({
      function_name: 'auto-repair-player-issues',
      run_at: new Date().toISOString(),
      scanned: payload.scanned,
      added: payload.repaired,
      skipped: payload.skipped,
      errors: payload.errors.length,
      details: [
        ...payload.errors,
        JSON.stringify(payload.details).slice(0, 7000),
      ].filter(Boolean),
      elapsed_ms: payload.elapsed_ms,
      success: payload.success,
    });
  } catch {
    /* sync_logs is optional */
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const started = Date.now();
  const url = new URL(req.url);
  const providedSecret = getAuthSecret(req, url);
  if (!validSecret(providedSecret)) return json({ success: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase env' }, 500);

  const dryRun = url.searchParams.get('dry_run') === '1';
  const hours = clampNumber(url.searchParams.get('hours'), 12, 1, 72);
  const eventLimit = clampNumber(url.searchParams.get('event_limit'), 1200, 100, 5000);
  const limit = clampNumber(url.searchParams.get('limit'), 6, 1, 12);
  const threshold = clampNumber(url.searchParams.get('threshold'), 2, 1, 10);
  const cooldownMinutes = clampNumber(url.searchParams.get('cooldown_minutes'), 45, 15, 360);
  const refreshGlobal = url.searchParams.get('refresh_global') === '1';
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const secret = internalSecret(providedSecret);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: eventRows, error: eventsError } = await supabase
    .from('player_error_events')
    .select('movie_slug,movie_title,episode_slug,episode_name,server_name,event_type,source_host,player_mode,created_at')
    .gte('created_at', since)
    .in('event_type', [...CRITICAL_EVENTS])
    .order('created_at', { ascending: false })
    .limit(eventLimit)
    .abortSignal(AbortSignal.timeout(15_000));

  if (eventsError) return json({ success: false, error: eventsError.message }, 500);

  const candidates = summarizeCandidates((eventRows || []) as PlayerErrorEvent[], threshold, limit);
  const repairKeys = candidates.map((candidate) => `player-repair:${candidate.slug}`);
  const { data: repairCursorRows } = repairKeys.length
    ? await supabase.from('sync_cursors').select('key,updated_at').in('key', repairKeys).abortSignal(AbortSignal.timeout(8_000))
    : { data: [] as Array<{ key: string; updated_at: string }> };
  const cooldownCutoff = Date.now() - cooldownMinutes * 60 * 1000;
  const recentRepairKeys = new Set((repairCursorRows || [])
    .filter((row) => Date.parse(String(row.updated_at || '')) >= cooldownCutoff)
    .map((row) => String(row.key || '')));
  const slugs = candidates.map((candidate) => candidate.slug);
  if (slugs.length === 0) {
    return json({
      success: true,
      dry_run: dryRun,
      message: 'No player issue candidates need repair right now.',
      scanned_events: (eventRows || []).length,
      candidates: [],
      elapsed_ms: Date.now() - started,
    });
  }

  const { data: movieRows, error: moviesError } = await supabase
    .from('movies')
    .select('id,slug,name,origin_name,source_site,source_name,source_url,showtimes,ophim_id,ophim_slug')
    .in('slug', slugs)
    .abortSignal(AbortSignal.timeout(10_000));

  if (moviesError) return json({ success: false, error: moviesError.message }, 500);

  const moviesBySlug = new Map(((movieRows || []) as MovieRow[]).map((movie) => [movie.slug, movie]));
  const repairs: unknown[] = [];
  const errors: string[] = [];
  let repaired = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const repairKey = `player-repair:${candidate.slug}`;
    if (recentRepairKeys.has(repairKey)) {
      skipped += 1;
      repairs.push({ candidate, action: 'skip', reason: 'repair_cooldown', cooldown_minutes: cooldownMinutes });
      continue;
    }
    const movie = moviesBySlug.get(candidate.slug);
    if (!movie) {
      skipped += 1;
      repairs.push({ candidate, action: 'skip', reason: 'movie_not_found' });
      continue;
    }

    if (dryRun) {
      repairs.push({
        candidate,
        movie: { slug: movie.slug, source_site: movie.source_site, source_name: movie.source_name },
        action: isBlvietsubMovie(movie) ? 'repair_blvietsub' : isOphimLikeMovie(movie) ? 'repair_ophim_like' : 'refresh_cache_only',
        blvietsub_url: getBlvietsubMovieUrl(movie) || undefined,
      });
      continue;
    }

    const calls: FunctionCallResult[] = [];
    const penalizedStreams = await penalizeTelemetryFailedStreams(
      supabase,
      movie.id,
      candidate.hosts,
      candidate.episodes,
    );
    if (isBlvietsubMovie(movie)) {
      const movieUrl = getBlvietsubMovieUrl(movie);
      if (movieUrl) {
        const directCall = await callFunction(supabaseUrl, serviceKey, secret, 'sync-blvietsub-feed', {
          movie_url: movieUrl,
          refresh_search: '1',
        });
        calls.push(directCall);
        if (!directCall.ok) {
          calls.push(await callFunction(supabaseUrl, serviceKey, secret, 'sync-blvietsub-feed', {
            repair_existing: '1',
            limit: 12,
            refresh_search: '1',
          }));
        }
      } else {
        calls.push(await callFunction(supabaseUrl, serviceKey, secret, 'sync-blvietsub-feed', {
          repair_existing: '1',
          limit: 12,
          refresh_search: '1',
        }));
      }
    } else if (isOphimLikeMovie(movie)) {
      calls.push(await callFunction(supabaseUrl, serviceKey, secret, 'sync-ophim-movies', {
        provider: getOphimProvider(movie),
        slug: getOphimRepairSlug(movie),
        episodes: '1',
        limit: 1,
      }));
      // The primary provider can keep publishing the same expired URL. Search
      // one already-configured independent provider by title; its importer has
      // identity/year guards and persists only verified playable episodes.
      if (candidate.critical >= 3) {
        calls.push(await callFunction(supabaseUrl, serviceKey, secret, 'sync-motchill-feed', {
          query: String(movie.name || movie.origin_name || candidate.title || movie.slug),
          limit: 3,
          refresh_search: '1',
        }));
      }
    }

    await deleteMovieCaches(supabase, [
      movie.slug,
      `detail:${movie.slug}`,
      `movie:${movie.slug}`,
    ]);

    if (calls.length === 0) {
      skipped += 1;
      repairs.push({ candidate, action: 'cache_refresh_only', calls });
      continue;
    }

    const failed = calls.filter((call) => !call.ok);
    const hasSuccessfulRepair = calls.some((call) => call.ok);
    if (failed.length > 0 && !hasSuccessfulRepair) {
      errors.push(`${movie.slug}: ${failed.map((call) => `${call.name}:${call.status}`).join(', ')}`);
    } else {
      repaired += 1;
      // sync_cursors.page has a strict `page > 0` contract. Writing zero made
      // every cooldown upsert fail silently, so the same source was penalized
      // and re-synced again every ten minutes. Persist a valid cursor and make
      // a contract failure visible in the run log instead of hiding it.
      const { error: cursorError } = await supabase.from('sync_cursors').upsert(
        { key: repairKey, page: 1, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      if (cursorError) errors.push(`${movie.slug}: repair cooldown cursor: ${cursorError.message}`);
    }

    repairs.push({
      candidate,
      action: isBlvietsubMovie(movie) ? 'repair_blvietsub' : 'repair_ophim_like',
      penalized_streams: penalizedStreams,
      calls: calls.map(compactCall),
    });
  }

  let cacheRefresh: FunctionCallResult[] = [];
  // Detail caches are invalidated per movie above. Global search/home refreshes
  // are intentionally delegated to their warmers unless explicitly requested;
  // doing both here made repairs exceed the Edge idle timeout.
  if (!dryRun && repaired > 0 && refreshGlobal) {
    cacheRefresh = [
      await callFunction(supabaseUrl, serviceKey, secret, 'search-index-proxy', {
        refresh: '1',
        limit: 5000,
      }),
      await callFunction(supabaseUrl, serviceKey, secret, 'home-proxy', {
        refresh: '1',
      }),
    ];
  }

  const success = errors.length === 0 && cacheRefresh.every((call) => call.ok);
  await logRun(supabase, {
    scanned: (eventRows || []).length,
    repaired,
    skipped,
    errors,
    details: repairs,
    elapsed_ms: Date.now() - started,
    success,
  });

  return json({
    success,
    dry_run: dryRun,
    since,
    scanned_events: (eventRows || []).length,
    repaired,
    skipped,
    errors,
    candidates,
    repairs,
    cache_refresh: cacheRefresh.map(compactCall),
    elapsed_ms: Date.now() - started,
  }, success ? 200 : 207);
});
