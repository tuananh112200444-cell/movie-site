import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAdminRequest } from '../_shared/admin-session.ts';

type PlayerErrorEvent = {
  id: number;
  created_at: string;
  movie_slug: string | null;
  movie_title: string | null;
  episode_slug: string | null;
  episode_name: string | null;
  server_name: string | null;
  event_type: string;
  player_mode: string | null;
  source_host: string | null;
  playback_time: number | null;
  duration: number | null;
  buffered_ahead: number | null;
  error_message: string | null;
  effective_type: string | null;
  downlink: number | null;
  device_memory: number | null;
  viewport_width: number | null;
  viewport_height: number | null;
  visibility_state: string | null;
};

type ActionItem = {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  metric: string;
  action: string;
};

const CRITICAL_EVENTS = new Set([
  'stall_fatal',
  'hls_fatal',
  'hls_fatal_retry',
  'direct_video_error',
  'native_hls_error',
  'iframe_blocked',
  'app_error',
  'chunk_load_error',
  'offline',
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}


function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function keyLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topFromMap(map: Map<string, number>, limit = 10) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function buildActionItems({
  events,
  criticalCount,
  recoveryCount,
  topHosts,
  topMovies,
  topEvents,
}: {
  events: PlayerErrorEvent[];
  criticalCount: number;
  recoveryCount: number;
  topHosts: { key: string; count: number }[];
  topMovies: { key: string; count: number }[];
  topEvents: { key: string; count: number }[];
}): ActionItem[] {
  const items: ActionItem[] = [];
  const total = Math.max(1, events.length);
  const criticalRate = criticalCount / total;
  const topHost = topHosts[0];
  const topMovie = topMovies[0];
  const topEvent = topEvents[0];

  if (criticalCount >= 10 || criticalRate >= 0.25) {
    items.push({
      severity: 'critical',
      title: 'Loi phat phim dang cao',
      detail: `${criticalCount}/${events.length} su kien la loi nghiem trong.`,
      metric: `${Math.round(criticalRate * 100)}% critical`,
      action: 'Mo phim loi nhieu nhat, chay repair tap/nguon va kiem tra server dang duoc uu tien.',
    });
  }

  if (topHost && topHost.key !== 'unknown-host' && topHost.count >= 5) {
    items.push({
      severity: topHost.count >= 15 ? 'critical' : 'warning',
      title: 'Mot host dang gay loi lap lai',
      detail: `${topHost.key} xuat hien ${topHost.count} lan trong log.`,
      metric: topHost.key,
      action: 'Giam uu tien host nay, chay stream-health-check queue=problem va uu tien server thay the.',
    });
  }

  if (topMovie && topMovie.key !== 'unknown-movie' && topMovie.count >= 3) {
    items.push({
      severity: topMovie.count >= 8 ? 'critical' : 'warning',
      title: 'Mot phim dang bi khach gap loi nhieu',
      detail: `${topMovie.key} co ${topMovie.count} su kien trong khoang thoi gian nay.`,
      metric: topMovie.key,
      action: 'Mo trang phim nay, kiem tra tap moi nhat va chay auto-repair-player-issues neu can.',
    });
  }

  if (topEvent && topEvent.count >= 5) {
    const action =
      topEvent.key === 'stall_fatal'
        ? 'Kiem tra server bi dung gan phut 30, uu tien HLS/server co response time thap hon.'
        : topEvent.key === 'iframe_blocked'
          ? 'Kiem tra embed bi chan iframe va thay bang link player/video truc tiep neu co.'
          : 'Xem chi tiet event va doi nguon uu tien cho phim bi anh huong.';

    items.push({
      severity: CRITICAL_EVENTS.has(topEvent.key) ? 'warning' : 'info',
      title: 'Loai loi xuat hien nhieu',
      detail: `${topEvent.key} xuat hien ${topEvent.count} lan.`,
      metric: topEvent.key,
      action,
    });
  }

  if (recoveryCount > criticalCount && recoveryCount >= 5) {
    items.push({
      severity: 'info',
      title: 'Player tu hoi phuc tot',
      detail: `Co ${recoveryCount} lan retry/recovery, cao hon so loi nghiem trong.`,
      metric: `${recoveryCount} recoveries`,
      action: 'Theo doi tiep, chua can can thiep manh neu khach khong bao loi.',
    });
  }

  if (items.length === 0) {
    items.push({
      severity: 'info',
      title: 'He thong phat phim on dinh',
      detail: 'Khong thay diem nong ro rang trong khoang thoi gian nay.',
      metric: 'OK',
      action: 'Tiep tuc giu cron stream-health va auto-repair dang chay.',
    });
  }

  return items.slice(0, 6);
}

function summarizeEvents(events: PlayerErrorEvent[], hours: number) {
  const eventCounts = new Map<string, number>();
  const hostCounts = new Map<string, number>();
  const serverCounts = new Map<string, number>();
  const movieCounts = new Map<string, number>();
  const modeCounts = new Map<string, number>();
  const networkCounts = new Map<string, number>();
  const hourlyCounts = new Map<string, number>();
  let criticalCount = 0;
  let recoveryCount = 0;

  for (const event of events) {
    const eventType = keyLabel(event.event_type, 'unknown');
    increment(eventCounts, eventType);
    increment(hostCounts, keyLabel(event.source_host, 'unknown-host'));
    increment(serverCounts, keyLabel(event.server_name, 'unknown-server'));
    increment(movieCounts, keyLabel(event.movie_slug || event.movie_title, 'unknown-movie'));
    increment(modeCounts, keyLabel(event.player_mode, 'unknown-mode'));
    increment(networkCounts, keyLabel(event.effective_type, 'unknown-network'));

    const hourKey = new Date(event.created_at).toISOString().slice(0, 13) + ':00:00Z';
    increment(hourlyCounts, hourKey);

    if (CRITICAL_EVENTS.has(eventType)) criticalCount += 1;
    if (eventType.includes('recovery') || eventType.includes('retry') || eventType.includes('recovered')) {
      recoveryCount += 1;
    }
  }

  const recentCritical = events
    .filter((event) => CRITICAL_EVENTS.has(event.event_type))
    .slice(0, 25)
    .map((event) => ({
      id: event.id,
      created_at: event.created_at,
      movie_slug: event.movie_slug,
      movie_title: event.movie_title,
      episode_name: event.episode_name,
      server_name: event.server_name,
      event_type: event.event_type,
      player_mode: event.player_mode,
      source_host: event.source_host,
      playback_time: event.playback_time,
      buffered_ahead: event.buffered_ahead,
      error_message: event.error_message,
    }));

  const topEvents = topFromMap(eventCounts);
  const topHosts = topFromMap(hostCounts);
  const topServers = topFromMap(serverCounts);
  const topMovies = topFromMap(movieCounts);
  const playerModes = topFromMap(modeCounts);
  const networks = topFromMap(networkCounts);
  const healthScore = events.length === 0 ? 100 : Math.max(0, Math.round(100 - (criticalCount / events.length) * 100));

  return {
    window_hours: hours,
    total_events: events.length,
    critical_events: criticalCount,
    recovery_events: recoveryCount,
    top_events: topEvents,
    top_hosts: topHosts,
    top_servers: topServers,
    top_movies: topMovies,
    player_modes: playerModes,
    networks,
    hourly: topFromMap(hourlyCounts, 48).sort((a, b) => a.key.localeCompare(b.key)),
    recent_critical: recentCritical,
    health_score: healthScore,
    action_items: buildActionItems({
      events,
      criticalCount,
      recoveryCount,
      topHosts,
      topMovies,
      topEvents,
    }),
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  try {
    if (!await verifyAdminRequest(req)) {
      return json({ error: 'Unauthorized - admin login required' }, 401, corsHeaders);
    }

    const url = new URL(req.url);
    const hours = clampNumber(url.searchParams.get('hours'), 24, 1, 168);
    const limit = clampNumber(url.searchParams.get('limit'), 1000, 100, 5000);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase
      .from('player_error_events')
      .select('id, created_at, movie_slug, movie_title, episode_slug, episode_name, server_name, event_type, player_mode, source_host, playback_time, duration, buffered_ahead, error_message, effective_type, downlink, device_memory, viewport_width, viewport_height, visibility_state')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      since,
      limit,
      summary: summarizeEvents((data ?? []) as PlayerErrorEvent[], hours),
    }, 200, corsHeaders);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, corsHeaders);
  }
});
