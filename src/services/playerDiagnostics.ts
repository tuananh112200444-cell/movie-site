import { supabase } from '@/lib/supabase';

export type PlayerIssueEventType =
  | 'hls_retry'
  | 'hls_fatal_retry'
  | 'hls_media_retry'
  | 'hls_fatal'
  | 'stall_recovery'
  | 'stall_fatal'
  | 'native_hls_error'
  | 'direct_video_error'
  | 'iframe_blocked';

export interface PlayerIssuePayload {
  movie_slug?: string;
  movie_title?: string;
  episode_slug?: string;
  episode_name?: string;
  server_name?: string;
  event_type: PlayerIssueEventType;
  player_mode?: string;
  source_host?: string;
  playback_time?: number;
  duration?: number;
  buffered_ahead?: number;
  error_message?: string;
}

const recentReports = new Map<string, number>();
const REPORT_THROTTLE_MS = 60_000;

function finiteNumber(value?: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getSourceHost(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function reportPlayerIssue(payload: PlayerIssuePayload): void {
  if (!payload.event_type) return;
  const timeBucket = Math.floor((payload.playback_time ?? 0) / 30);
  const key = [
    payload.event_type,
    payload.movie_slug,
    payload.episode_slug,
    payload.server_name,
    timeBucket,
  ].join('|');
  const now = Date.now();
  const last = recentReports.get(key) ?? 0;
  if (now - last < REPORT_THROTTLE_MS) return;
  recentReports.set(key, now);

  void supabase.from('player_error_events').insert({
    movie_slug: payload.movie_slug || null,
    movie_title: payload.movie_title || null,
    episode_slug: payload.episode_slug || null,
    episode_name: payload.episode_name || null,
    server_name: payload.server_name || null,
    event_type: payload.event_type,
    player_mode: payload.player_mode || null,
    source_host: payload.source_host || null,
    playback_time: finiteNumber(payload.playback_time),
    duration: finiteNumber(payload.duration),
    buffered_ahead: finiteNumber(payload.buffered_ahead),
    error_message: payload.error_message?.slice(0, 500) || null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
    page_url: typeof location !== 'undefined' ? location.href.slice(0, 800) : null,
  }).then(({ error }) => {
    if (error && import.meta.env.DEV) {
      console.warn('[playerDiagnostics] insert failed:', error.message);
    }
  });
}
