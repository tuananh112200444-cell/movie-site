import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type PlayerErrorEvent = {
  playback_session_id: string | null;
  movie_slug: string | null;
  episode_slug: string | null;
  event_type: string | null;
  source_host: string | null;
  server_name: string | null;
  player_mode: string | null;
  created_at: string;
};

type PlayerErrorRollup = {
  bucket_start: string;
  event_type: string;
  source_host: string;
  server_name: string;
  player_mode: string;
  event_count: number;
  session_count: number;
};

type HostHealth = {
  host: string;
  cluster: string;
  score: number;
  critical: number;
  recovery: number;
  success: number;
  failure_rate: number;
  total: number;
  server_names: string[];
  player_modes: string[];
};

type ClusterOutage = {
  cluster: string;
  affected_hosts: number;
  critical: number;
  success: number;
};

const SOURCE_CRITICAL_EVENTS = new Set([
  'stall_fatal',
  'hls_fatal',
  'direct_video_error',
  'native_hls_error',
  'iframe_blocked',
]);

const SOURCE_RECOVERY_EVENTS = new Set([
  'source_failover',
  'stall_recovery',
  'hls_retry',
  'hls_fatal_retry',
  'hls_media_retry',
]);
const SOURCE_SUCCESS_EVENTS = new Set(['playback_started']);

const ROLLUP_HEALTH_TIMEOUT_MS = 8000;
const RAW_HEALTH_TIMEOUT_MS = 2800;

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = [
    'https://khophim.org',
    'https://www.khophim.org',
    'https://mhophim.com',
    'https://www.mhophim.com',
    'http://localhost:3000',
    'http://localhost:4173',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:5173',
  ];
  const safeOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  };
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>, cacheControl = 'public, max-age=300'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
  });
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function normalizeHost(host: string | null | undefined): string {
  const trimmed = String(host || '').trim().toLowerCase().replace(/^www\./, '');
  if (!trimmed || trimmed === 'unknown-host' || trimmed === 'localhost') return '';
  return trimmed;
}

function getSourceCluster(host: string): string {
  if (!host) return '';
  if (host.includes('ssplay') || host.includes('abyssplayer') || host.includes('short.icu')) return 'ssplay_abyss';
  if (host.includes('dailymotion.com') || host === 'dai.ly') return 'dailymotion';
  if (host.includes('video.khophim.org') || host.includes('supabase.co')) return 'khophim_direct';
  if (host.includes('opstream') || host.includes('ophim')) return 'ophim';
  if (host.includes('phimapi.com') || host.includes('phimapi.net') || host.includes('kkphim') || host.includes('phim1280')) return 'kkphim';
  if (host.includes('versondd.top')) return 'known_bad';
  return host;
}

function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return String(record.message || record.details || record.hint || JSON.stringify(record));
  }
  return String(error);
}

function fallbackHealth(reason: string, corsHeaders: Record<string, string>): Response {
  return json({
    ok: true,
    source: 'fallback',
    reason,
    generated_at: new Date().toISOString(),
    window_hours: 6,
    penalty_minutes: 30,
    // Never inject a hard-coded provider outage when live telemetry is
    // unavailable. Existing client penalties expire naturally after 30m.
    bad_hosts: [],
  }, 200, corsHeaders, 'public, max-age=120');
}

function addUnique(list: string[], value: string | null | undefined, limit = 4): void {
  const trimmed = String(value || '').trim();
  if (!trimmed || list.includes(trimmed) || list.length >= limit) return;
  list.push(trimmed);
}

function summarizeHostHealth(events: PlayerErrorEvent[]): HostHealth[] {
  type SessionHealth = {
    critical: boolean;
    recovery: boolean;
    success: boolean;
    criticalScore: number;
  };
  type HostSessions = {
    host: string;
    cluster: string;
    sessions: Map<string, SessionHealth>;
    server_names: string[];
    player_modes: string[];
  };
  const map = new Map<string, HostSessions>();

  for (const event of events) {
    const host = normalizeHost(event.source_host);
    if (!host) continue;
    const cluster = getSourceCluster(host);
    const eventType = String(event.event_type || '');
    const current = map.get(host) ?? {
      host,
      cluster,
      sessions: new Map<string, SessionHealth>(),
      server_names: [],
      player_modes: [],
    };
    const minuteBucket = Math.floor(Date.parse(event.created_at) / (5 * 60 * 1000));
    const playbackIdentity = String(event.playback_session_id || '').trim()
      || `${event.movie_slug || ''}:${event.episode_slug || ''}:${minuteBucket}`;
    const session = current.sessions.get(playbackIdentity) ?? {
      critical: false,
      recovery: false,
      success: false,
      criticalScore: 0,
    };
    if (SOURCE_CRITICAL_EVENTS.has(eventType)) {
      session.critical = true;
      session.criticalScore = Math.max(session.criticalScore, eventType === 'stall_fatal' ? 5 : 4);
    } else if (SOURCE_RECOVERY_EVENTS.has(eventType)) {
      session.recovery = true;
    } else if (SOURCE_SUCCESS_EVENTS.has(eventType)) session.success = true;

    current.sessions.set(playbackIdentity, session);
    addUnique(current.server_names, event.server_name);
    addUnique(current.player_modes, event.player_mode);
    map.set(host, current);
  }

  return [...map.values()]
    .map((item) => {
      const sessions = [...item.sessions.values()];
      const critical = sessions.filter((session) => session.critical).length;
      // A source that starts and then fatally stalls is a failed session, not
      // one success plus one failure. Only sessions without a fatal event are
      // allowed to contribute successful evidence.
      const success = sessions.filter((session) => session.success && !session.critical).length;
      const recovery = sessions.filter((session) => session.recovery).length;
      const score = sessions.reduce((total, session) => total + session.criticalScore, 0);
      const failureRate = (critical + 2) / (critical + success + 4);
      return {
        host: item.host,
        cluster: item.cluster,
        score,
        critical,
        recovery,
        success,
        failure_rate: Number(failureRate.toFixed(4)),
        total: sessions.length,
        server_names: item.server_names,
        player_modes: item.player_modes,
      };
    })
    // bad_hosts is a hard circuit breaker, not a generic degradation list.
    // Require independent failed sessions and a sustained failure ratio so a
    // short transient does not remove a working source for every viewer.
    .filter((item) => item.critical >= 3
      && item.score >= 12
      && item.failure_rate >= 0.40)
    .sort((a, b) => b.score - a.score || b.critical - a.critical || a.host.localeCompare(b.host))
    .slice(0, 20);
}

function summarizeRollupHostHealth(rows: PlayerErrorRollup[]): HostHealth[] {
  const hosts = new Map<string, HostHealth>();
  for (const row of rows) {
    const host = normalizeHost(row.source_host);
    if (!host) continue;
    const sessionCount = Math.max(0, Number(row.session_count || 0));
    const eventType = String(row.event_type || '');
    const current = hosts.get(host) ?? {
      host,
      cluster: getSourceCluster(host),
      score: 0,
      critical: 0,
      recovery: 0,
      success: 0,
      failure_rate: 0,
      total: 0,
      server_names: [],
      player_modes: [],
    };
    if (SOURCE_CRITICAL_EVENTS.has(eventType)) {
      current.critical += sessionCount;
      current.score += sessionCount * (eventType === 'stall_fatal' ? 5 : 4);
    } else if (SOURCE_RECOVERY_EVENTS.has(eventType)) {
      current.recovery += sessionCount;
    } else if (SOURCE_SUCCESS_EVENTS.has(eventType)) {
      current.success += sessionCount;
    }
    current.total += sessionCount;
    addUnique(current.server_names, row.server_name);
    addUnique(current.player_modes, row.player_mode);
    hosts.set(host, current);
  }

  return [...hosts.values()]
    .map((item) => ({
      ...item,
      failure_rate: Number(((item.critical + 2) / (item.critical + item.success + 4)).toFixed(4)),
    }))
    .filter((item) => item.critical >= 3 && item.score >= 12 && item.failure_rate >= 0.40)
    .sort((a, b) => b.score - a.score || b.critical - a.critical || a.host.localeCompare(b.host));
}

function deduplicatePlaybackEvents(events: PlayerErrorEvent[]): PlayerErrorEvent[] {
  const seen = new Set<string>();
  const output: PlayerErrorEvent[] = [];
  for (const event of events) {
    const eventType = String(event.event_type || '');
    const eventClass = SOURCE_CRITICAL_EVENTS.has(eventType)
      ? 'critical'
      : SOURCE_SUCCESS_EVENTS.has(eventType)
        ? 'success'
        : 'recovery';
    const minuteBucket = Math.floor(Date.parse(event.created_at) / (5 * 60 * 1000));
    const playbackIdentity = String(event.playback_session_id || '').trim()
      || `${event.movie_slug || ''}:${event.episode_slug || ''}:${minuteBucket}`;
    const key = `${playbackIdentity}|${normalizeHost(event.source_host)}|${eventClass}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(event);
  }
  return output;
}

function summarizeClusterOutages(hosts: HostHealth[]): ClusterOutage[] {
  const clusters = new Map<string, ClusterOutage>();
  for (const host of hosts) {
    if (!host.cluster || host.cluster === host.host) continue;
    const current = clusters.get(host.cluster) ?? {
      cluster: host.cluster,
      affected_hosts: 0,
      critical: 0,
      success: 0,
    };
    current.affected_hosts += 1;
    current.critical += host.critical;
    current.success += host.success;
    clusters.set(host.cluster, current);
  }
  // A single bad CDN hostname is not a provider outage. Require independent
  // failures on at least three shards before clients demote the whole cluster.
  return [...clusters.values()].filter((item) => item.affected_hosts >= 3 && item.critical >= 12);
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, corsHeaders, 'no-store');

  try {
    const url = new URL(req.url);
    const hours = clampNumber(url.searchParams.get('hours'), 6, 1, 24);
    const limit = clampNumber(url.searchParams.get('limit'), 2000, 100, 5000);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const healthEventTypes = [...SOURCE_CRITICAL_EVENTS, ...SOURCE_RECOVERY_EVENTS, ...SOURCE_SUCCESS_EVENTS];
    const { data: rollupData, error: rollupError } = await supabase
      .from('player_error_rollups')
      .select('bucket_start,event_type,source_host,server_name,player_mode,event_count,session_count')
      .gte('bucket_start', since)
      .in('event_type', healthEventTypes)
      .order('bucket_start', { ascending: false })
      .limit(5000)
      .abortSignal(AbortSignal.timeout(ROLLUP_HEALTH_TIMEOUT_MS));

    let badHosts: HostHealth[];
    let scannedEvents = 0;
    let balancedEventCount = 0;
    let source = 'rollup';

    if (!rollupError && (rollupData?.length ?? 0) > 0) {
      const rows = (rollupData ?? []) as PlayerErrorRollup[];
      badHosts = summarizeRollupHostHealth(rows);
      scannedEvents = rows.reduce((total, row) => total + Number(row.event_count || 0), 0);
      balancedEventCount = rows.reduce((total, row) => total + Number(row.session_count || 0), 0);
    } else {
      const { data, error } = await supabase
        .from('player_error_events')
        .select('playback_session_id, movie_slug, episode_slug, event_type, source_host, server_name, player_mode, created_at')
        .gte('created_at', since)
        .in('event_type', healthEventTypes)
        .order('created_at', { ascending: false })
        .limit(limit)
        .abortSignal(AbortSignal.timeout(RAW_HEALTH_TIMEOUT_MS));

      if (error) return fallbackHealth(serializeError(error), corsHeaders);
      const balancedEvents = deduplicatePlaybackEvents((data ?? []) as PlayerErrorEvent[]);
      badHosts = summarizeHostHealth(balancedEvents);
      scannedEvents = (data ?? []).length;
      balancedEventCount = balancedEvents.length;
      source = 'raw-fallback';
    }
    const clusterOutages = summarizeClusterOutages(badHosts);

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      since,
      window_hours: hours,
      penalty_minutes: 30,
      source,
      scanned_events: scannedEvents,
      balanced_events: balancedEventCount,
      bad_hosts: badHosts,
      cluster_outages: clusterOutages,
    }, 200, corsHeaders);
  } catch (error) {
    return fallbackHealth(serializeError(error), corsHeaders);
  }
});
