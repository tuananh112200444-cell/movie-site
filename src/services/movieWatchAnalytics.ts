import { supabase } from '@/lib/supabase';

const WATCH_SESSION_KEY = 'khophim.watch-session.v1';
const MIN_STABLE_WATCH_SECONDS = 30;
const MAX_RECORDED_WATCH_SECONDS = 21_600;
const RECORD_THRESHOLDS = [30, 300, 900, 1_800, 3_600, 7_200, 14_400, 21_600] as const;

const playbackIds = new Map<string, string>();
const recordedThresholds = new Map<string, number>();

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getAnonymousSessionId(): string {
  if (typeof window === 'undefined') return createUuid();
  try {
    const existing = window.sessionStorage.getItem(WATCH_SESSION_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = createUuid();
    window.sessionStorage.setItem(WATCH_SESSION_KEY, created);
    return created;
  } catch {
    return createUuid();
  }
}

function getPlaybackId(movieSlug: string): string {
  const existing = playbackIds.get(movieSlug);
  if (existing) return existing;
  const created = createUuid();
  playbackIds.set(movieSlug, created);
  return created;
}

function getReachedThreshold(watchedSeconds: number): number {
  let reached = 0;
  for (const threshold of RECORD_THRESHOLDS) {
    if (watchedSeconds < threshold) break;
    reached = threshold;
  }
  return reached;
}

/**
 * Records anonymous watch progress in the background. It deliberately has no
 * await in the player path, so analytics can never delay playback controls.
 */
export function recordMovieWatchProgress(movieSlug: string, watchedSeconds: number): void {
  const normalizedSlug = movieSlug.trim();
  const safeSeconds = Math.min(MAX_RECORDED_WATCH_SECONDS, Math.floor(watchedSeconds));
  if (!normalizedSlug || safeSeconds < MIN_STABLE_WATCH_SECONDS) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const reachedThreshold = getReachedThreshold(safeSeconds);
  if (reachedThreshold < MIN_STABLE_WATCH_SECONDS) return;

  const playbackId = getPlaybackId(normalizedSlug);
  const previousThreshold = recordedThresholds.get(playbackId) ?? 0;
  if (reachedThreshold <= previousThreshold) return;
  recordedThresholds.set(playbackId, reachedThreshold);

  void supabase.rpc('record_movie_watch', {
    p_movie_slug: normalizedSlug,
    p_session_id: getAnonymousSessionId(),
    p_playback_id: playbackId,
    p_watched_seconds: safeSeconds,
  }).then(({ error }) => {
    if (!error) return;
    // Permit one retry at the next player heartbeat without interrupting playback.
    if (recordedThresholds.get(playbackId) === reachedThreshold) {
      recordedThresholds.set(playbackId, previousThreshold);
    }
    if (import.meta.env.DEV) console.warn('[movie-watch] background record failed:', error.message);
  });
}
