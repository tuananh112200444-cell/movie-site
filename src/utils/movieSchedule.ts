import type { MovieDetail, MovieItem } from '@/types/movie';

type ScheduleType = 'daily' | 'weekly' | 'custom';

type ScheduledMovie = Pick<
  MovieItem | MovieDetail,
  | 'episode_current'
  | 'episode_total'
  | 'current_episode'
  | 'total_episodes'
  | 'status'
  | 'release_at'
  | 'next_episode_at'
  | 'next_episode_name'
  | 'schedule_note'
  | 'schedule_type'
  | 'release_time'
  | 'release_day'
  | 'schedule_timezone'
>;

export interface MovieCountdownInfo {
  kind: 'countdown' | 'completed';
  targetAt?: string;
  label: string;
  note?: string;
  currentEpisodeNumber: number;
  targetEpisodeNumber?: number;
}

export interface TimeLeft {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

interface TimeParts {
  hours: number;
  minutes: number;
  seconds: number;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export function extractEpisodeNumber(value?: string): number {
  if (!value) return 0;
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function getCurrentEpisode(movie: ScheduledMovie): number {
  return Number(movie.current_episode || 0) || extractEpisodeNumber(movie.episode_current);
}

function getTotalEpisodes(movie: ScheduledMovie): number {
  return Number(movie.total_episodes || 0) || extractEpisodeNumber(movie.episode_total);
}

function normalizeScheduleType(value?: string): ScheduleType | '' {
  const normalized = String(value || '').toLowerCase().trim();
  return normalized === 'daily' || normalized === 'weekly' || normalized === 'custom' ? normalized : '';
}

function parseReleaseTime(value?: string): TimeParts | null {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
  return { hours, minutes, seconds };
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

function zonedTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  time: TimeParts,
  timeZone: string,
): number {
  const utcGuess = Date.UTC(year, month - 1, day, time.hours, time.minutes, time.seconds);
  const zoned = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const map = Object.fromEntries(zoned.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return utcGuess - (asUtc - utcGuess);
}

function addLocalDays(parts: ZonedParts, days: number, time: TimeParts, timeZone: string): number {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  const shifted = getZonedParts(date, timeZone);
  return zonedTimeToUtcMs(shifted.year, shifted.month, shifted.day, time, timeZone);
}

function firstRecurringTargetAfterNow(
  type: ScheduleType,
  now: number,
  releaseTime: TimeParts,
  releaseDay: number | undefined,
  timeZone: string,
): number | null {
  const localNow = getZonedParts(new Date(now), timeZone);
  if (type === 'daily') {
    const today = zonedTimeToUtcMs(localNow.year, localNow.month, localNow.day, releaseTime, timeZone);
    return today > now ? today : addLocalDays(localNow, 1, releaseTime, timeZone);
  }

  if (type === 'weekly') {
    const targetDay = Number.isInteger(releaseDay) ? Number(releaseDay) : localNow.weekday;
    const daysUntil = (targetDay - localNow.weekday + 7) % 7;
    const candidate = addLocalDays(localNow, daysUntil, releaseTime, timeZone);
    return candidate > now ? candidate : addLocalDays(localNow, daysUntil + 7, releaseTime, timeZone);
  }

  return null;
}

function getRecurringStepMs(type: ScheduleType): number {
  return type === 'weekly' ? WEEK_MS : DAY_MS;
}

function getRecurringCountdown(
  movie: ScheduledMovie,
  type: ScheduleType,
  now: number,
  currentEpisode: number,
  totalEpisodes: number,
): MovieCountdownInfo | null {
  const timeZone = movie.schedule_timezone || DEFAULT_TZ;
  const releaseTime = parseReleaseTime(movie.release_time);
  if (!releaseTime) return null;

  let anchor = movie.next_episode_at ? new Date(movie.next_episode_at).getTime() : NaN;
  if (!Number.isFinite(anchor)) {
    anchor = firstRecurringTargetAfterNow(type, now, releaseTime, movie.release_day, timeZone) ?? NaN;
  }
  if (!Number.isFinite(anchor)) return null;

  const stepMs = getRecurringStepMs(type);
  const dueCount = anchor <= now ? Math.floor((now - anchor) / stepMs) + 1 : 0;
  const effectiveCurrent = currentEpisode + dueCount;
  if (totalEpisodes > 0 && effectiveCurrent >= totalEpisodes) {
    return { kind: 'completed', label: 'Đã hoàn thành', currentEpisodeNumber: totalEpisodes };
  }

  const targetEpisode = effectiveCurrent + 1;
  const targetAt = anchor + dueCount * stepMs;
  return {
    kind: 'countdown',
    targetAt: new Date(targetAt).toISOString(),
    label: `Tập ${targetEpisode} sẽ phát sóng sau`,
    note: movie.schedule_note?.trim() || undefined,
    currentEpisodeNumber: effectiveCurrent,
    targetEpisodeNumber: targetEpisode,
  };
}

function getCustomCountdown(
  movie: ScheduledMovie,
  now: number,
  currentEpisode: number,
  totalEpisodes: number,
): MovieCountdownInfo | null {
  const targetTime = movie.next_episode_at ? new Date(movie.next_episode_at).getTime() : NaN;
  if (!Number.isFinite(targetTime)) return null;

  const scheduledEpisode = extractEpisodeNumber(movie.next_episode_name) || currentEpisode + 1;
  const effectiveCurrent = targetTime <= now ? Math.max(currentEpisode, scheduledEpisode) : currentEpisode;
  if (totalEpisodes > 0 && effectiveCurrent >= totalEpisodes) {
    return { kind: 'completed', label: 'Đã hoàn thành', currentEpisodeNumber: totalEpisodes };
  }
  if (targetTime <= now) return null;

  return {
    kind: 'countdown',
    targetAt: movie.next_episode_at,
    label: `Tập ${scheduledEpisode} sẽ phát sóng sau`,
    note: movie.schedule_note?.trim() || undefined,
    currentEpisodeNumber: currentEpisode,
    targetEpisodeNumber: scheduledEpisode,
  };
}

export function isMovieCompleted(movie: ScheduledMovie): boolean {
  const current = (movie.episode_current ?? '').toLowerCase().trim();
  const total = (movie.episode_total ?? '').toLowerCase().trim();
  const status = (movie.status ?? '').toLowerCase().trim();
  const hasSchedule = Boolean(movie.schedule_type || movie.next_episode_at || movie.release_at || movie.release_time);
  if (status === 'completed' && !hasSchedule) return true;
  if (current === 'full' || current === 'full hd' || current.includes('hoàn tất') || current.includes('hoan tat')) return true;
  if (total === 'full' || total.includes('hoàn tất') || total.includes('hoan tat')) return true;

  const currentNumber = getCurrentEpisode(movie);
  const totalNumber = getTotalEpisodes(movie);
  return totalNumber > 0 && currentNumber >= totalNumber;
}

export function getMovieCountdownInfo(movie: ScheduledMovie, now = Date.now()): MovieCountdownInfo | null {
  const currentEpisode = getCurrentEpisode(movie);
  const totalEpisodes = getTotalEpisodes(movie);
  if (isMovieCompleted(movie)) {
    return { kind: 'completed', label: 'Đã hoàn thành', currentEpisodeNumber: totalEpisodes || currentEpisode };
  }

  const scheduleType = normalizeScheduleType(movie.schedule_type);
  if (scheduleType === 'daily' || scheduleType === 'weekly') {
    return getRecurringCountdown(movie, scheduleType, now, currentEpisode, totalEpisodes);
  }
  if (scheduleType === 'custom') {
    return getCustomCountdown(movie, now, currentEpisode, totalEpisodes);
  }

  const nextEpisodeAt = movie.next_episode_at?.trim();
  if (nextEpisodeAt) {
    return getCustomCountdown({ ...movie, schedule_type: 'custom' }, now, currentEpisode, totalEpisodes);
  }

  const releaseAt = movie.release_at?.trim();
  if (releaseAt) {
    const targetTime = new Date(releaseAt).getTime();
    if (Number.isFinite(targetTime) && targetTime > now) {
      return {
        kind: 'countdown',
        targetAt: releaseAt,
        label: 'Phim sẽ phát hành sau',
        note: movie.schedule_note?.trim() || undefined,
        currentEpisodeNumber: currentEpisode,
      };
    }
  }

  return null;
}

export function getTimeLeft(targetAt: string, now = Date.now()): TimeLeft {
  const totalMs = Math.max(0, new Date(targetAt).getTime() - now);
  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { totalMs, days, hours, minutes, seconds };
}

export function formatCompactTimeLeft(time: TimeLeft): string {
  if (time.days > 0) return `${time.days} ngày ${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
  return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}:${String(time.seconds).padStart(2, '0')}`;
}

export function formatVerboseTimeLeft(time: TimeLeft): string {
  return `${time.days} ngày ${time.hours} giờ ${time.minutes} phút ${time.seconds} giây`;
}
