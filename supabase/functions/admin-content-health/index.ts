import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type MovieRow = {
  id: string;
  slug: string;
  name: string | null;
  origin_name: string | null;
  source_site: string | null;
  source_name: string | null;
  thumb_url: string | null;
  poster_url: string | null;
  episode_current: string | null;
  current_episode: number | null;
  updated_at: string | null;
};

type EpisodeRow = {
  movie_id: string;
  episode_number: number | null;
  episode_name?: string | null;
  episode_slug?: string | null;
  slug?: string | null;
};

type StreamRow = {
  movie_id: string;
  episode_slug: string | null;
  stream_url?: string | null;
  embed_url?: string | null;
  is_active?: boolean | null;
};

type ActionItem = {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
};

const HOME_SECTIONS = [
  'trending',
  'phim-chieu-rap',
  'phim-le',
  'phim-bo',
  'hoat-hinh',
  'han-quoc',
  'au-my',
  'trung-quoc',
  'thai-lan',
];

const MIN_HOME_ITEMS = 6;

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

function verifyAdminToken(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  return auth.slice(7).trim().length > 20;
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

function getEpisodeNumberFromText(value: string | null | undefined): number {
  const text = String(value || '').toLowerCase();
  const range = text.match(/(?:tap|ep|episode|tập)?\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
  if (range) return Number(range[2] || 0) || Number(range[1] || 0) || 0;
  if (/\b(full|hoan tat|complete|completed)\b/.test(text)) {
    const completed = [...text.matchAll(/(\d{1,5})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
    return completed.length ? Math.max(...completed) : 1;
  }
  const nums = [...text.matchAll(/(\d{1,5})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : 0;
}

function playableEpisodeNumber(row: EpisodeRow): number {
  return Math.max(
    Number(row.episode_number || 0),
    getEpisodeNumberFromText(row.episode_name),
    getEpisodeNumberFromText(row.episode_slug),
    getEpisodeNumberFromText(row.slug),
  );
}

function advertisedEpisode(movie: MovieRow): number {
  return Math.max(Number(movie.current_episode || 0), getEpisodeNumberFromText(movie.episode_current));
}

function hasImage(movie: MovieRow): boolean {
  return Boolean(String(movie.thumb_url || '').trim() || String(movie.poster_url || '').trim());
}

function movieName(movie: MovieRow): string {
  return movie.name || movie.origin_name || movie.slug;
}

async function fetchPagedRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = 50000,
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

async function fetchRowsForMovieIds<T>(
  movieIds: string[],
  makeQuery: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  batchSize = 10,
): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < movieIds.length; index += batchSize) {
    const ids = movieIds.slice(index, index + batchSize);
    rows.push(...await fetchPagedRows<T>((from, to) => makeQuery(ids, from, to)));
  }
  return rows;
}

async function auditHomeProxy(supabaseUrl: string, serviceKey: string) {
  const url = new URL(`${supabaseUrl}/functions/v1/home-proxy`);
  url.searchParams.set('sections', HOME_SECTIONS.join(','));
  const started = performance.now();
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    signal: AbortSignal.timeout(18000),
  });
  const elapsedMs = Math.round(performance.now() - started);
  if (!response.ok) {
    return {
      ok: false,
      elapsed_ms: elapsedMs,
      source: 'error',
      counts: Object.fromEntries(HOME_SECTIONS.map((section) => [section, 0])),
      failures: [`home-proxy HTTP ${response.status}`],
    };
  }

  const payload = await response.json();
  const sections = payload?.sections && typeof payload.sections === 'object' ? payload.sections : {};
  const counts = Object.fromEntries(HOME_SECTIONS.map((section) => [
    section,
    Array.isArray(sections[section]) ? sections[section].length : 0,
  ]));
  const failures = HOME_SECTIONS
    .filter((section) => Number(counts[section] || 0) < MIN_HOME_ITEMS)
    .map((section) => `${section} chi co ${counts[section] || 0} phim`);

  return {
    ok: failures.length === 0,
    elapsed_ms: elapsedMs,
    source: String(payload?.source || 'unknown'),
    counts,
    failures,
  };
}

async function auditSearchIndex(supabaseUrl: string, serviceKey: string) {
  const started = performance.now();
  const response = await fetch(`${supabaseUrl}/functions/v1/search-index-proxy?limit=5000`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    signal: AbortSignal.timeout(18000),
  });
  const elapsedMs = Math.round(performance.now() - started);
  if (!response.ok) {
    return { ok: false, elapsed_ms: elapsedMs, items: 0, source: 'error', error: `HTTP ${response.status}` };
  }
  const payload = await response.json();
  const rawCount =
    (Array.isArray(payload?.items) ? payload.items.length : payload?.items) ??
    payload?.count ??
    payload?.total ??
    payload?.total_items ??
    (Array.isArray(payload?.movies) ? payload.movies.length : undefined) ??
    (Array.isArray(payload?.data) ? payload.data.length : undefined) ??
    (Array.isArray(payload?.index) ? payload.index.length : undefined);
  const items = Number.isFinite(Number(rawCount)) ? Number(rawCount) : 0;
  return {
    ok: items >= 3000,
    elapsed_ms: elapsedMs,
    items,
    source: String(payload?.source || response.headers.get('x-cache') || 'unknown'),
    error: items >= 3000 ? null : `search index chi tra ${items} phim`,
  };
}

function buildActionItems(input: {
  missingImages: MovieRow[];
  noPlayable: Array<MovieRow & { advertised: number; playable: number }>;
  episodeMismatches: Array<MovieRow & { advertised: number; playable: number }>;
  homeAudit: Awaited<ReturnType<typeof auditHomeProxy>>;
  searchAudit: Awaited<ReturnType<typeof auditSearchIndex>>;
}): ActionItem[] {
  const items: ActionItem[] = [];
  if (!input.homeAudit.ok) {
    items.push({
      severity: 'critical',
      title: 'Trang chu co section thieu phim',
      detail: input.homeAudit.failures.join(', '),
      action: 'Refresh home-proxy cache va kiem tra query section/country bi thieu phim.',
    });
  }
  if (!input.searchAudit.ok) {
    items.push({
      severity: 'critical',
      title: 'Search index chua dat nguong',
      detail: input.searchAudit.error || `Search index co ${input.searchAudit.items} phim.`,
      action: 'Chay warm/refresh search-index-proxy de khach tim phim nhanh va day du hon.',
    });
  }
  if (input.episodeMismatches.length > 0) {
    items.push({
      severity: 'critical',
      title: 'Co phim nghi hien sai so tap',
      detail: `${input.episodeMismatches.length} phim metadata cao hon tap playable.`,
      action: 'Chay repair missing episodes cho cac phim dau danh sach va xoa cache detail/home.',
    });
  }
  if (input.noPlayable.length > 0) {
    items.push({
      severity: 'warning',
      title: 'Co phim co tap nhung thieu nguon phat local',
      detail: `${input.noPlayable.length} phim co episode_current nhung chua tim thay tap playable trong DB.`,
      action: 'Uu tien phim moi cap nhat va BLVietsub/OPhim/KKPhim de backfill stream.',
    });
  }
  if (input.missingImages.length > 0) {
    items.push({
      severity: 'warning',
      title: 'Co phim thieu anh poster/thumb',
      detail: `${input.missingImages.length} phim gan day thieu anh.`,
      action: 'Bo sung anh tu TMDB/OPhim/BLVietsub de giao dien khong bi xau.',
    });
  }
  if (items.length === 0) {
    items.push({
      severity: 'info',
      title: 'Du lieu phim dang sach',
      detail: 'Khong thay section rong, phim thieu tap, hoac search index thieu trong mau kiem tra.',
      action: 'Tiep tuc theo doi sau moi dot sync/deploy lon.',
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const url = new URL(req.url);
    const movieLimit = Math.max(50, Math.min(500, Number(url.searchParams.get('movie_limit') || 240)));

    const [{ data: movies, error: movieError }, homeAudit, searchAudit] = await Promise.all([
      supabase
        .from('movies')
        .select('id,slug,name,origin_name,source_site,source_name,thumb_url,poster_url,episode_current,current_episode,updated_at')
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .limit(movieLimit),
      auditHomeProxy(supabaseUrl, serviceKey),
      auditSearchIndex(supabaseUrl, serviceKey),
    ]);

    if (movieError) throw movieError;
    const movieRows = (movies ?? []) as MovieRow[];
    const movieIds = movieRows.map((movie) => movie.id);

    const [episodeRows, adminEpisodeRows, streamRows] = movieIds.length > 0 ? await Promise.all([
      fetchRowsForMovieIds<EpisodeRow>(movieIds, (ids, from, to) =>
        supabase
          .from('episodes')
          .select('movie_id,episode_number,episode_name,episode_slug')
          .in('movie_id', ids)
          .gt('episode_number', 0)
          .range(from, to)
      ),
      fetchRowsForMovieIds<EpisodeRow>(movieIds, (ids, from, to) =>
        supabase
          .from('movie_episodes')
          .select('movie_id,episode_number,episode_name,slug')
          .in('movie_id', ids)
          .gt('episode_number', 0)
          .range(from, to)
      ),
      fetchRowsForMovieIds<StreamRow>(movieIds, (ids, from, to) =>
        supabase
          .from('streams')
          .select('movie_id,episode_slug,stream_url,embed_url,is_active')
          .in('movie_id', ids)
          .eq('is_active', true)
          .range(from, to)
      ),
    ]) : [[], [], []];

    const playableByMovie = new Map<string, number>();
    for (const row of [...episodeRows, ...adminEpisodeRows]) {
      playableByMovie.set(row.movie_id, Math.max(playableByMovie.get(row.movie_id) || 0, playableEpisodeNumber(row)));
    }
    for (const row of streamRows) {
      if (!String(row.stream_url || row.embed_url || '').trim()) continue;
      const ep = getEpisodeNumberFromText(row.episode_slug);
      if (ep > 0) playableByMovie.set(row.movie_id, Math.max(playableByMovie.get(row.movie_id) || 0, ep));
    }

    const missingImages = movieRows.filter((movie) => !hasImage(movie)).slice(0, 30);
    const noPlayable: Array<MovieRow & { advertised: number; playable: number }> = [];
    const episodeMismatches: Array<MovieRow & { advertised: number; playable: number }> = [];

    for (const movie of movieRows) {
      const advertised = advertisedEpisode(movie);
      const playable = playableByMovie.get(movie.id) || 0;
      if (advertised <= 1) continue;
      if (playable <= 0) noPlayable.push({ ...movie, advertised, playable });
      else if (playable < advertised) episodeMismatches.push({ ...movie, advertised, playable });
    }

    const penalty =
      (homeAudit.ok ? 0 : 24) +
      (searchAudit.ok ? 0 : 18) +
      Math.min(30, episodeMismatches.length * 5) +
      Math.min(18, noPlayable.length * 2) +
      Math.min(12, missingImages.length);

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      score: Math.max(0, 100 - penalty),
      checked: {
        movies: movieRows.length,
        episodes: episodeRows.length,
        admin_episodes: adminEpisodeRows.length,
        streams: streamRows.length,
      },
      home_proxy: homeAudit,
      search_index: searchAudit,
      missing_images: missingImages.map((movie) => ({
        slug: movie.slug,
        name: movieName(movie),
        source_site: movie.source_site || movie.source_name || 'unknown',
        updated_at: movie.updated_at,
      })),
      no_playable: noPlayable.slice(0, 30).map((movie) => ({
        slug: movie.slug,
        name: movieName(movie),
        source_site: movie.source_site || movie.source_name || 'unknown',
        advertised: movie.advertised,
        playable: movie.playable,
        updated_at: movie.updated_at,
      })),
      episode_mismatches: episodeMismatches.slice(0, 30).map((movie) => ({
        slug: movie.slug,
        name: movieName(movie),
        source_site: movie.source_site || movie.source_name || 'unknown',
        advertised: movie.advertised,
        playable: movie.playable,
        missing_count: Math.max(0, movie.advertised - movie.playable),
        updated_at: movie.updated_at,
      })),
      action_items: buildActionItems({ missingImages, noPlayable, episodeMismatches, homeAudit, searchAudit }),
    }, 200, corsHeaders);
  } catch (error) {
    let message = '';
    try {
      message = error instanceof Error ? error.message : JSON.stringify(error);
    } catch {
      message = String(error);
    }
    return json({ error: message || String(error) }, 500, corsHeaders);
  }
});
