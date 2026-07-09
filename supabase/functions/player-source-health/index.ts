import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type PlayerErrorEvent = {
  event_type: string | null;
  source_host: string | null;
  server_name: string | null;
  player_mode: string | null;
  created_at: string;
};

type HostHealth = {
  host: string;
  cluster: string;
  score: number;
  critical: number;
  recovery: number;
  total: number;
  server_names: string[];
  player_modes: string[];
};

const SOURCE_CRITICAL_EVENTS = new Set([
  'stall_fatal',
  'hls_fatal',
  'direct_video_error',
  'native_hls_error',
  'iframe_blocked',
]);

const SOURCE_RECOVERY_EVENTS = new Set([
  'stall_recovery',
  'hls_retry',
  'hls_fatal_retry',
  'hls_media_retry',
]);

const DB_HEALTH_TIMEOUT_MS = 2800;

const FALLBACK_DEGRADED_HOSTS: HostHealth[] = [
  { host: 'vip.opstream90.com', cluster: 'ophim', score: 120, critical: 24, recovery: 0, total: 24, server_names: ['Vietsub #1'], player_modes: ['hls'] },
  { host: 'v7.kkphimplayer7.com', cluster: 'kkphim', score: 110, critical: 22, recovery: 0, total: 22, server_names: ['Vietsub'], player_modes: ['hls'] },
  { host: 's6.kkphimplayer6.com', cluster: 'kkphim', score: 80, critical: 16, recovery: 0, total: 16, server_names: ['Vietsub'], player_modes: ['hls'] },
  { host: 'vip.opstream11.com', cluster: 'ophim', score: 55, critical: 11, recovery: 0, total: 11, server_names: ['Vietsub #1'], player_modes: ['hls'] },
  { host: 'vip.opstream15.com', cluster: 'ophim', score: 50, critical: 10, recovery: 0, total: 10, server_names: ['Vietsub #1'], player_modes: ['hls'] },
];

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
  if (host.includes('phimapi.com') || host.includes('phimapi.net') || host.includes('kkphim')) return 'kkphim';
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
    bad_hosts: FALLBACK_DEGRADED_HOSTS,
  }, 200, corsHeaders, 'public, max-age=120');
}

function addUnique(list: string[], value: string | null | undefined, limit = 4): void {
  const trimmed = String(value || '').trim();
  if (!trimmed || list.includes(trimmed) || list.length >= limit) return;
  list.push(trimmed);
}

function summarizeHostHealth(events: PlayerErrorEvent[]): HostHealth[] {
  const map = new Map<string, HostHealth>();

  for (const event of events) {
    const host = normalizeHost(event.source_host);
    if (!host) continue;
    const cluster = getSourceCluster(host);
    const eventType = String(event.event_type || '');
    const current = map.get(host) ?? {
      host,
      cluster,
      score: 0,
      critical: 0,
      recovery: 0,
      total: 0,
      server_names: [],
      player_modes: [],
    };

    current.total += 1;
    if (SOURCE_CRITICAL_EVENTS.has(eventType)) {
      current.critical += 1;
      current.score += eventType === 'stall_fatal' ? 5 : 4;
    } else if (SOURCE_RECOVERY_EVENTS.has(eventType)) {
      current.recovery += 1;
      current.score -= 1;
    }

    addUnique(current.server_names, event.server_name);
    addUnique(current.player_modes, event.player_mode);
    map.set(host, current);
  }

  return [...map.values()]
    .filter((item) => item.critical >= 2 && item.score >= 5)
    .sort((a, b) => b.score - a.score || b.critical - a.critical || a.host.localeCompare(b.host))
    .slice(0, 20);
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, corsHeaders, 'no-store');

  try {
    const url = new URL(req.url);
    const hours = clampNumber(url.searchParams.get('hours'), 6, 1, 24);
    const limit = clampNumber(url.searchParams.get('limit'), 600, 100, 2000);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase
      .from('player_error_events')
      .select('event_type, source_host, server_name, player_mode, created_at')
      .gte('created_at', since)
      .in('event_type', [...SOURCE_CRITICAL_EVENTS, ...SOURCE_RECOVERY_EVENTS])
      .order('created_at', { ascending: false })
      .limit(limit)
      .abortSignal(AbortSignal.timeout(DB_HEALTH_TIMEOUT_MS));

    if (error) return fallbackHealth(serializeError(error), corsHeaders);

    const badHosts = summarizeHostHealth((data ?? []) as PlayerErrorEvent[]);

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      since,
      window_hours: hours,
      penalty_minutes: 30,
      bad_hosts: badHosts,
    }, 200, corsHeaders);
  } catch (error) {
    return fallbackHealth(serializeError(error), corsHeaders);
  }
});
