import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ScheduleType = 'daily' | 'weekly' | 'custom' | '';

interface MovieRow {
  id: string;
  slug: string | null;
  name: string | null;
  origin_name: string | null;
  title_vi: string | null;
  title_en: string | null;
  episode_current: string | null;
  episode_total: string | null;
  current_episode: number | null;
  total_episodes: number | null;
  schedule_type: ScheduleType | null;
  release_time: string | null;
  release_day: number | null;
  schedule_timezone: string | null;
  next_episode_at: string | null;
  next_episode_name: string | null;
  schedule_note: string | null;
  is_published: boolean | null;
}

interface AlertCandidate {
  movie: MovieRow;
  movieName: string;
  targetAt: Date;
  targetEpisodeNumber: number;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const ADMIN_NOTIFY_EMAIL = Deno.env.get('ADMIN_NOTIFY_EMAIL') ?? '';
const EMAIL_FROM = Deno.env.get('SCHEDULE_EMAIL_FROM') ?? 'KhoPhim <onboarding@resend.dev>';
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://khophim.org';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const ALERT_LEAD_MINUTES = Number(Deno.env.get('SCHEDULE_ALERT_LEAD_MINUTES') ?? 30);
const ALERT_WINDOW_MINUTES = Number(Deno.env.get('SCHEDULE_ALERT_WINDOW_MINUTES') ?? 5);
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type',
    },
  });
}

function extractEpisodeNumber(value: unknown): number {
  const match = String(value ?? '').match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function getCurrentEpisode(movie: MovieRow): number {
  return Number(movie.current_episode || 0) || extractEpisodeNumber(movie.episode_current);
}

function getTotalEpisodes(movie: MovieRow): number {
  return Number(movie.total_episodes || 0) || extractEpisodeNumber(movie.episode_total);
}

function parseReleaseTime(value: string | null): { hour: number; minute: number } | null {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function localVietnamParts(now: Date): { year: number; month: number; date: number; day: number } {
  const shifted = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
  };
}

function vietnamLocalToUtcMs(year: number, month: number, date: number, hour: number, minute: number): number {
  return Date.UTC(year, month, date, hour, minute, 0, 0) - VIETNAM_OFFSET_MS;
}

function getRecurringTarget(movie: MovieRow, now: Date): Date | null {
  const releaseTime = parseReleaseTime(movie.release_time);
  if (!releaseTime) return null;

  const parts = localVietnamParts(now);
  let addDays = 0;
  if (movie.schedule_type === 'weekly') {
    const releaseDay = Number(movie.release_day);
    if (!Number.isInteger(releaseDay) || releaseDay < 0 || releaseDay > 6) return null;
    addDays = (releaseDay - parts.day + 7) % 7;
  }

  let targetMs = vietnamLocalToUtcMs(
    parts.year,
    parts.month,
    parts.date + addDays,
    releaseTime.hour,
    releaseTime.minute
  );

  if (targetMs <= now.getTime()) {
    targetMs += movie.schedule_type === 'weekly'
      ? 7 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
  }

  return new Date(targetMs);
}

function getMovieName(movie: MovieRow): string {
  return movie.title_vi || movie.name || movie.origin_name || movie.title_en || movie.slug || 'Phim sap chieu';
}

function getAlertCandidate(movie: MovieRow, now: Date): AlertCandidate | null {
  const currentEpisode = getCurrentEpisode(movie);
  const totalEpisodes = getTotalEpisodes(movie);
  if (totalEpisodes > 0 && currentEpisode >= totalEpisodes) return null;

  const scheduleType = movie.schedule_type || '';
  let targetAt: Date | null = null;
  let targetEpisodeNumber = extractEpisodeNumber(movie.next_episode_name) || currentEpisode + 1;

  if (scheduleType === 'custom' || (!scheduleType && movie.next_episode_at)) {
    const targetMs = movie.next_episode_at ? new Date(movie.next_episode_at).getTime() : NaN;
    if (!Number.isFinite(targetMs)) return null;
    targetAt = new Date(targetMs);
  } else if (scheduleType === 'daily' || scheduleType === 'weekly') {
    targetAt = getRecurringTarget(movie, now);
  }

  if (!targetAt || !Number.isFinite(targetAt.getTime())) return null;
  if (targetAt.getTime() <= now.getTime()) return null;
  if (targetEpisodeNumber <= 0) targetEpisodeNumber = currentEpisode + 1;

  return {
    movie,
    movieName: getMovieName(movie),
    targetAt,
    targetEpisodeNumber,
  };
}

function isInsideAlertWindow(targetAt: Date, now: Date): boolean {
  const diffMinutes = (targetAt.getTime() - now.getTime()) / 60000;
  return diffMinutes >= ALERT_LEAD_MINUTES - ALERT_WINDOW_MINUTES
    && diffMinutes <= ALERT_LEAD_MINUTES + ALERT_WINDOW_MINUTES;
}

function formatVietnamTime(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function movieUrl(movie: MovieRow): string {
  return `${SITE_URL.replace(/\/$/, '')}/phim/${encodeURIComponent(movie.slug || '')}`;
}

async function sendEmail(candidate: AlertCandidate): Promise<{ id?: string }> {
  const subject = `[KhoPhim] ${candidate.movieName} sap chieu tap ${candidate.targetEpisodeNumber}`;
  const url = movieUrl(candidate.movie);
  const targetText = formatVietnamTime(candidate.targetAt);
  const note = candidate.movie.schedule_note?.trim();

  const text = [
    `${candidate.movieName} sap phat song tap ${candidate.targetEpisodeNumber}.`,
    `Thoi gian chieu: ${targetText}`,
    note ? `Ghi chu: ${note}` : '',
    `Link phim: ${url}`,
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
      <h2 style="margin:0 0 12px">Phim sap chieu</h2>
      <p><strong>${candidate.movieName}</strong> sap phat song <strong>tap ${candidate.targetEpisodeNumber}</strong>.</p>
      <p>Thoi gian chieu: <strong>${targetText}</strong></p>
      ${note ? `<p>Ghi chu: ${note}</p>` : ''}
      <p><a href="${url}">Mo trang phim</a></p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [ADMIN_NOTIFY_EMAIL],
      subject,
      text,
      html,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `Resend error ${response.status}`);
  }
  return payload as { id?: string };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });

  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Missing Supabase service credentials' }, 500);
  }
  if (!RESEND_API_KEY || !ADMIN_NOTIFY_EMAIL) {
    return jsonResponse({ error: 'Missing RESEND_API_KEY or ADMIN_NOTIFY_EMAIL' }, 500);
  }

  const now = new Date();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: movies, error } = await supabase
    .from('movies')
    .select('id,slug,name,origin_name,title_vi,title_en,episode_current,episode_total,current_episode,total_episodes,schedule_type,release_time,release_day,schedule_timezone,next_episode_at,next_episode_name,schedule_note,is_published')
    .eq('is_published', true)
    .or('schedule_type.not.is.null,next_episode_at.not.is.null,release_time.not.is.null')
    .limit(500);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  let scanned = 0;
  let matched = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const details: string[] = [];

  for (const movie of (movies ?? []) as MovieRow[]) {
    scanned += 1;
    const candidate = getAlertCandidate(movie, now);
    if (!candidate || !isInsideAlertWindow(candidate.targetAt, now)) continue;
    matched += 1;

    const insertPayload = {
      movie_id: movie.id,
      movie_slug: movie.slug || '',
      movie_name: candidate.movieName,
      target_episode_number: candidate.targetEpisodeNumber,
      target_at: candidate.targetAt.toISOString(),
      recipient_email: ADMIN_NOTIFY_EMAIL,
      status: 'pending',
      provider: 'resend',
    };

    const { data: inserted, error: insertError } = await supabase
      .from('schedule_email_notifications')
      .insert(insertPayload)
      .select('id')
      .maybeSingle();

    if (insertError) {
      if (insertError.code === '23505') {
        skipped += 1;
        continue;
      }
      failed += 1;
      details.push(`${candidate.movieName}: insert failed - ${insertError.message}`);
      continue;
    }

    try {
      const provider = await sendEmail(candidate);
      await supabase
        .from('schedule_email_notifications')
        .update({
          status: 'sent',
          provider_message_id: provider.id ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq('id', inserted?.id);
      sent += 1;
      details.push(`${candidate.movieName} tap ${candidate.targetEpisodeNumber}: sent`);
    } catch (sendError) {
      failed += 1;
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      await supabase
        .from('schedule_email_notifications')
        .update({
          status: 'failed',
          error_message: message,
        })
        .eq('id', inserted?.id);
      details.push(`${candidate.movieName}: send failed - ${message}`);
    }
  }

  return jsonResponse({
    ok: failed === 0,
    now: now.toISOString(),
    alertLeadMinutes: ALERT_LEAD_MINUTES,
    alertWindowMinutes: ALERT_WINDOW_MINUTES,
    scanned,
    matched,
    sent,
    skipped,
    failed,
    details,
  });
});
