import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SyncLogRow = {
  id?: number;
  function_name: string | null;
  run_at: string | null;
  success: boolean | null;
  scanned: number | null;
  added: number | null;
  skipped: number | null;
  errors: number | null;
  elapsed_ms: number | null;
  details?: unknown;
  metadata?: Record<string, unknown> | null;
};

type MovieRow = {
  id: string;
  slug: string;
  name: string | null;
  origin_name: string | null;
  source_site: string | null;
  source_name: string | null;
  episode_current: string | null;
  current_episode: number | null;
  updated_at: string | null;
  last_synced_at: string | null;
};

type EpisodeRow = {
  movie_id: string;
  episode_number: number | null;
};

type StreamRow = {
  movie_id: string;
  episode_slug: string | null;
};

type ActionItem = {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
};

const EXPECTED_SYNC_FUNCTIONS = [
  'sync-ophim-movies',
  'sync-blvietsub-feed',
  'auto-repair-player-issues',
];

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

function verifyAdminToken(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  return auth.slice(7).trim().length > 20;
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function getEpisodeNumber(movie: MovieRow): number {
  const fromColumn = Number(movie.current_episode || 0);
  const fromText = Number(String(movie.episode_current || '').match(/\d+/)?.[0] || 0);
  return Math.max(fromColumn, fromText);
}

function getEpisodeNumberFromText(value: string | null | undefined): number {
  return Number(String(value || '').match(/\d+/)?.[0] || 0);
}

function stringifyLogValue(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isDuplicateLog(row: SyncLogRow): boolean {
  const text = `${stringifyLogValue(row.details)} ${stringifyLogValue(row.metadata)}`.toLowerCase();
  return text.includes('duplicate key') || text.includes('unique constraint') || text.includes('23505');
}

function isTransientLog(row: SyncLogRow): boolean {
  const text = `${stringifyLogValue(row.details)} ${stringifyLogValue(row.metadata)}`.toLowerCase();
  return (
    text.includes('transient_error') ||
    text.includes('error 521') ||
    text.includes('"status":521') ||
    text.includes('web server is down') ||
    text.includes('cloudflare') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('signal has been aborted') ||
    text.includes('fetch failed') ||
    text.includes('rate limit') ||
    text.includes('too many requests') ||
    text.includes('502') ||
    text.includes('503') ||
    text.includes('504')
  );
}

function isHardErrorLog(row: SyncLogRow): boolean {
  const hasError = row.success === false || Number(row.errors || 0) > 0;
  return hasError && !isTransientLog(row);
}

function hoursAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return (Date.now() - time) / 36e5;
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function fetchPagedRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = 20000,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await makeQuery(from, to);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function summarizeSyncLogs(logs: SyncLogRow[]) {
  const names = EXPECTED_SYNC_FUNCTIONS.map((function_name) => ({ function_name, stale_hours: 6 }));

  return names.map(({ function_name: name, stale_hours: staleHours }) => {
    const rows = logs.filter((row) => row.function_name === name);
    const latest = rows[0] || null;
    const recent = rows.slice(0, 12);
    const failures = recent.filter((row) => row.success === false || Number(row.errors || 0) > 0).length;
    const transientFailures = recent.filter(isTransientLog).length;
    const duplicateFailures = recent.filter(isDuplicateLog).length;
    const hardFailures = recent.filter(isHardErrorLog).length;
    const lastRunHoursAgo = hoursAgo(latest?.run_at);

    return {
      function_name: name,
      last_run_at: latest?.run_at || null,
      last_run_hours_ago: lastRunHoursAgo,
      latest_success: latest?.success ?? null,
      latest_scanned: Number(latest?.scanned || 0),
      latest_added: Number(latest?.added || 0),
      latest_errors: Number(latest?.errors || 0),
      latest_elapsed_ms: Number(latest?.elapsed_ms || 0),
      recent_runs: recent.length,
      recent_failures: failures,
      recent_transient_failures: transientFailures,
      recent_duplicate_failures: duplicateFailures,
      recent_hard_failures: hardFailures,
      status:
        !latest ? 'missing'
          : lastRunHoursAgo != null && lastRunHoursAgo > staleHours ? 'stale'
            : hardFailures >= 3 ? 'unstable'
              : isHardErrorLog(latest) ? 'failed'
                : failures > 0 ? 'warning'
                : 'ok',
    };
  });
}

function buildActionItems(syncStatus: ReturnType<typeof summarizeSyncLogs>, mismatches: unknown[], staleMovies: MovieRow[]): ActionItem[] {
  const items: ActionItem[] = [];
  const badSync = syncStatus.filter((item) => item.status !== 'ok');

  if (badSync.length > 0) {
    const names = badSync.map((item) => item.function_name).join(', ');
    items.push({
      severity: badSync.some((item) => item.status === 'missing' || item.status === 'stale') ? 'critical' : 'warning',
      title: 'Sync source can kiem tra',
      detail: `${badSync.length} job dang co dau hieu bat thuong: ${names}.`,
      action: 'Uu tien hard error/duplicate truoc; transient warning thuong la nguon ngoai timeout va se retry.',
    });
  }

  const duplicateSync = syncStatus.filter((item) => item.recent_duplicate_failures > 0);
  if (duplicateSync.length > 0) {
    items.push({
      severity: 'critical',
      title: 'Co duplicate database error',
      detail: `${duplicateSync.length} job co duplicate key trong cac lan chay gan day.`,
      action: 'Kiem tra upsert/onConflict cua job do truoc khi tang tan suat sync.',
    });
  }

  if (mismatches.length > 0) {
    items.push({
      severity: 'critical',
      title: 'Co phim nghi thieu tap',
      detail: `${mismatches.length} phim metadata bao tap cao hon so tap doc duoc trong bang episodes.`,
      action: 'Chay repair missing episodes cho cac phim dau danh sach, sau do xoa cache detail cua phim do.',
    });
  }

  if (staleMovies.length > 0) {
    items.push({
      severity: 'warning',
      title: 'Phim lau chua duoc sync lai',
      detail: `${staleMovies.length} phim co last_synced_at cu hoac chua co.`,
      action: 'Uu tien cac phim dang chieu va nguon BLVietsub/OPhim/KKPhim de cap nhat tap moi.',
    });
  }

  if (items.length === 0) {
    items.push({
      severity: 'info',
      title: 'Sync dang on dinh',
      detail: 'Khong thay job stale hoac phim nghi thieu tap trong mau kiem tra.',
      action: 'Tiep tuc giu lich sync 15 phut va theo doi dashboard nay moi ngay.',
    });
  }

  return items;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  try {
    if (!verifyAdminToken(req)) {
      return json({ error: 'Unauthorized - admin login required' }, 401, corsHeaders);
    }

    const url = new URL(req.url);
    const movieLimit = clampNumber(url.searchParams.get('movie_limit'), 220, 50, 500);
    const logLimit = clampNumber(url.searchParams.get('log_limit'), 240, 50, 1000);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const [{ data: logs, error: logError }, { data: movies, error: movieError }] = await Promise.all([
      supabase
        .from('sync_logs')
        .select('id,function_name,run_at,success,scanned,added,skipped,errors,elapsed_ms,details,metadata')
        .order('run_at', { ascending: false })
        .limit(logLimit),
      supabase
        .from('movies')
        .select('id,slug,name,origin_name,source_site,source_name,episode_current,current_episode,updated_at,last_synced_at')
        .eq('is_published', true)
        .gt('current_episode', 1)
        .order('updated_at', { ascending: false })
        .limit(movieLimit),
    ]);

    if (logError) throw logError;
    if (movieError) throw movieError;

    const movieRows = ((movies ?? []) as MovieRow[]).filter((movie) => getEpisodeNumber(movie) > 1);
    const movieIds = movieRows.map((movie) => movie.id);
    let episodeRows: EpisodeRow[] = [];
    let adminEpisodeRows: EpisodeRow[] = [];
    let streamRows: StreamRow[] = [];

    if (movieIds.length > 0) {
      [episodeRows, adminEpisodeRows, streamRows] = await Promise.all([
        fetchPagedRows<EpisodeRow>((from, to) =>
          supabase
            .from('episodes')
            .select('movie_id,episode_number')
            .in('movie_id', movieIds)
            .gt('episode_number', 0)
            .range(from, to)
        ),
        fetchPagedRows<EpisodeRow>((from, to) =>
          supabase
            .from('movie_episodes')
            .select('movie_id,episode_number')
            .in('movie_id', movieIds)
            .gt('episode_number', 0)
            .range(from, to)
        ),
        fetchPagedRows<StreamRow>((from, to) =>
          supabase
            .from('streams')
            .select('movie_id,episode_slug')
            .in('movie_id', movieIds)
            .eq('is_active', true)
            .range(from, to)
        ),
      ]);
    }

    const episodeMaxByMovie = new Map<string, number>();
    for (const row of [...episodeRows, ...adminEpisodeRows]) {
      episodeMaxByMovie.set(row.movie_id, Math.max(episodeMaxByMovie.get(row.movie_id) ?? 0, Number(row.episode_number || 0)));
    }
    for (const row of streamRows) {
      const number = getEpisodeNumberFromText(row.episode_slug);
      if (number > 0) {
        episodeMaxByMovie.set(row.movie_id, Math.max(episodeMaxByMovie.get(row.movie_id) ?? 0, number));
      }
    }

    const mismatches = movieRows
      .map((movie) => {
        const expected = getEpisodeNumber(movie);
        const actual = episodeMaxByMovie.get(movie.id) ?? 0;
        return {
          slug: movie.slug,
          name: movie.name || movie.origin_name || movie.slug,
          source_site: movie.source_site || movie.source_name || 'unknown',
          expected_episode: expected,
          actual_episode: actual,
          missing_count: Math.max(0, expected - actual),
          last_synced_at: movie.last_synced_at,
          updated_at: movie.updated_at,
        };
      })
      .filter((item) => item.expected_episode > item.actual_episode)
      .sort((a, b) => b.missing_count - a.missing_count || b.expected_episode - a.expected_episode)
      .slice(0, 30);

    const staleMovies = movieRows
      .filter((movie) => {
        const age = hoursAgo(movie.last_synced_at);
        return age == null || age > 24;
      })
      .sort((a, b) => (hoursAgo(b.last_synced_at) ?? 9999) - (hoursAgo(a.last_synced_at) ?? 9999))
      .slice(0, 20);

    const syncStatus = summarizeSyncLogs(uniqueBy((logs ?? []) as SyncLogRow[], (row) => `${row.function_name || ''}|${row.run_at || ''}|${row.id || ''}`));

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      checked: {
        sync_logs: (logs ?? []).length,
        movies: movieRows.length,
        episodes: episodeRows.length,
        admin_episodes: adminEpisodeRows.length,
        streams: streamRows.length,
      },
      score: Math.max(0, 100 - syncStatus.filter((item) => item.status !== 'ok').length * 12 - mismatches.length * 3 - staleMovies.length),
      sync_status: syncStatus,
      suspected_episode_mismatches: mismatches,
      stale_movies: staleMovies.map((movie) => ({
        slug: movie.slug,
        name: movie.name || movie.origin_name || movie.slug,
        source_site: movie.source_site || movie.source_name || 'unknown',
        episode_current: movie.episode_current,
        current_episode: getEpisodeNumber(movie),
        last_synced_at: movie.last_synced_at,
        updated_at: movie.updated_at,
      })),
      recent_logs: ((logs ?? []) as SyncLogRow[]).slice(0, 30),
      action_items: buildActionItems(syncStatus, mismatches, staleMovies),
    }, 200, corsHeaders);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, corsHeaders);
  }
});
