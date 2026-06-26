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

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = [
    'https://khophim.org',
    'https://www.khophim.org',
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
    const eventType = String(event.event_type || '');
    const current = map.get(host) ?? {
      host,
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
    const limit = clampNumber(url.searchParams.get('limit'), 1000, 100, 5000);
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
      .limit(limit);

    if (error) throw error;

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
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, corsHeaders, 'no-store');
  }
});
