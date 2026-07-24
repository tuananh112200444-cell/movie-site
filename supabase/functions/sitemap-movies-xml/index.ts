import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SITE_URL = 'https://khophim.org';
const API_BASE = 'https://ophim1.com';
const IMG_BASE = 'https://img.ophim.live/uploads/movies/';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'public, max-age=1800, s-maxage=3600',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

const LIST_TYPES = [
  'phim-moi-cap-nhat',
  'phim-le',
  'phim-bo',
  'phim-chieu-rap',
  'hoat-hinh',
  'tv-shows',
];

interface MovieItem {
  id?: string;
  slug?: string;
  name?: string;
  thumb_url?: string;
  poster_url?: string;
  modified?: { time?: string };
  updated_at?: string;
  episode_current?: string;
  current_episode?: number;
  content?: string;
  is_published?: boolean;
  seo_catalog_status?: string;
  catalog_source?: string;
  release_at?: string;
  tmdb_popularity?: number;
  trailer_url?: string;
  status?: string;
  year?: number;
  total_episodes?: number;
  next_episode_at?: string;
  seo_index_tier?: string;
  seo_quality_score?: number;
  seo_freshness_score?: number;
  seo_last_episode_change_at?: string;
}

interface ApiResponse {
  data?: { items?: MovieItem[] };
  items?: MovieItem[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function repairMojibake(value = ''): string {
  if (!/(?:Ã|Â|Ä|Æ|áº|á»)/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(Array.from(value), (char) => char.charCodeAt(0) & 255);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded.replace(/\s+/g, ' ').trim() || value;
  } catch {
    return value;
  }
}

function titleFromSlug(slug = ''): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
}

function cleanImageTitle(name = '', slug = ''): string {
  const repaired = repairMojibake(name);
  if (/(?:Ã|Â|Ä|Æ|áº|á»)/.test(repaired)) return titleFromSlug(slug) || repaired;
  return repaired || titleFromSlug(slug) || slug;
}

function toImageUrl(path = ''): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${IMG_BASE}${path}`;
}

function toLastMod(value?: string): string {
  if (!value) return new Date().toISOString().split('T')[0];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
  return date.toISOString().split('T')[0];
}

function getChangeFreq(modifiedTime?: string): string {
  if (!modifiedTime) return 'weekly';
  const date = new Date(modifiedTime);
  if (Number.isNaN(date.getTime())) return 'weekly';
  const diffHours = (Date.now() - date.getTime()) / 3600000;
  if (diffHours < 48) return 'daily';
  if (diffHours < 168) return 'weekly';
  return 'monthly';
}

function isOngoingTier(movie: MovieItem): boolean {
  return movie.seo_index_tier === 'ongoing';
}

function normalize(value?: string): string {
  return String(value || '').toLowerCase().trim();
}

function normalizeSearchText(value?: string): string {
  return normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd');
}

function isTrailer(movie: MovieItem): boolean {
  const ep = normalizeSearchText(movie.episode_current);
  return ep === 'trailer' || ep === '' || ep.includes('trailer');
}

function isUpcoming(movie: MovieItem): boolean {
  const status = normalizeSearchText(movie.seo_catalog_status);
  const ep = normalizeSearchText(movie.episode_current);
  const releaseTime = movie.release_at ? new Date(movie.release_at).getTime() : 0;
  if (status === 'upcoming' || ep.includes('sap chieu') || releaseTime > Date.now()) return true;
  return status === 'upcoming' || ep.includes('sap chieu') || ep.includes('sắp chiếu') || (releaseTime > Date.now());
}

function isLikelyPlayable(movie: MovieItem): boolean {
  const episode = normalizeSearchText(movie.episode_current);
  if (!episode || episode.includes('trailer') || episode.includes('sap chieu') || episode.includes('dang cap nhat')) return false;
  return episode === 'full' || episode.includes('hoan tat') || /\d/.test(episode) || Number(movie.current_episode || 0) > 0;
}

function hasHttpsTrailer(movie: MovieItem): boolean {
  return /^https:\/\//i.test(String(movie.trailer_url || '').trim());
}

function hasSeoBase(movie: MovieItem, minimumContentLength: number): boolean {
  const name = String(movie.name || '').trim();
  const image = String(movie.poster_url || movie.thumb_url || '').trim();
  const description = String(movie.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const year = getSeoYear(movie);
  return movie.is_published !== false
    && name.length >= 2
    && image.length > 0
    && description.length >= minimumContentLength
    && year >= 1900
    && year <= new Date().getUTCFullYear() + 2;
}

function isIndexableMovie(movie: MovieItem): boolean {
  if (isUpcoming(movie) || isTrailer(movie)) {
    return hasSeoBase(movie, 120) && hasHttpsTrailer(movie);
  }
  return hasSeoBase(movie, 80) && isLikelyPlayable(movie);
}

function toTrailerPlayerUrl(value?: string): string {
  const raw = String(value || '').trim();
  if (!/^https:\/\//i.test(raw)) return '';
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : raw;
    }
    if (/(^|\.)youtube\.com$/i.test(url.hostname)) {
      const id = url.searchParams.get('v') || (/^\/(?:embed|shorts)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? '');
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : raw;
    }
    return raw;
  } catch {
    return '';
  }
}

function getFreshnessScore(movie: MovieItem): number {
  const updated = movie.updated_at || movie.release_at || movie.modified?.time;
  const updatedTime = updated ? new Date(updated).getTime() : 0;
  const freshness = Number.isFinite(updatedTime) ? updatedTime / 1000000000 : 0;
  const popularity = Number(movie.tmdb_popularity || 0);
  const upcomingBoost = isUpcoming(movie) ? 5000 : 0;
  const trailerBoost = isTrailer(movie) || movie.trailer_url ? 2500 : 0;
  return freshness + popularity + upcomingBoost + trailerBoost;
}

function getRecentUpdateScore(movie: MovieItem): number {
  const updatedTime = timestampValue(movie.seo_last_episode_change_at || movie.updated_at || movie.modified?.time);
  const releaseTime = timestampValue(movie.release_at);
  const freshness = updatedTime || Math.floor(releaseTime * 0.5);
  const popularity = Math.min(1000, Number(movie.tmdb_popularity || 0));
  const episodeBoost = isTrailer(movie) ? 0 : 5000;
  const ongoingBoost = isOngoingTier(movie)
    ? 10000 + Number(movie.seo_freshness_score || 0) * 100 + Number(movie.seo_quality_score || 0)
    : 0;
  return freshness + popularity + episodeBoost + ongoingBoost;
}

function timestampValue(value?: string): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getSeoYear(movie: MovieItem): number {
  const explicitYear = Number(movie.year || 0);
  if (explicitYear > 0) return explicitYear;
  const releaseYear = timestampValue(movie.release_at)
    ? new Date(movie.release_at || '').getUTCFullYear()
    : 0;
  if (releaseYear > 0) return releaseYear;
  const updatedYear = timestampValue(movie.updated_at || movie.modified?.time)
    ? new Date(movie.updated_at || movie.modified?.time || '').getUTCFullYear()
    : 0;
  return updatedYear > 0 ? updatedYear : 0;
}

function compareMovieSeoOrder(a: MovieItem, b: MovieItem): number {
  const yearDiff = getSeoYear(b) - getSeoYear(a);
  if (yearDiff !== 0) return yearDiff;

  const releaseDiff = timestampValue(b.release_at) - timestampValue(a.release_at);
  if (releaseDiff !== 0) return releaseDiff;

  const updatedDiff = timestampValue(b.updated_at || b.modified?.time) - timestampValue(a.updated_at || a.modified?.time);
  if (updatedDiff !== 0) return updatedDiff;

  return String(a.slug || '').localeCompare(String(b.slug || ''));
}

function getPriority(movie: MovieItem): string {
  const ep = (movie.episode_current ?? '').toLowerCase();
  const catalogStatus = String(movie.seo_catalog_status || '').toLowerCase();
  if (isOngoingTier(movie)) {
    if (Number(movie.seo_freshness_score || 0) >= 70) return '0.98';
    return '0.90';
  }
  if (catalogStatus === 'upcoming' || isUpcoming(movie)) return '0.94';
  if (isTrailer(movie) || movie.trailer_url) return '0.92';
  if (catalogStatus === 'catalog') return '0.82';
  const isFull = ep === 'full' || ep.startsWith('hoan tat') || ep.startsWith('hoan-tat');
  const modifiedTime = movie.updated_at || movie.modified?.time;
  if (!modifiedTime) return isFull ? '0.80' : '0.70';

  const date = new Date(modifiedTime);
  if (Number.isNaN(date.getTime())) return isFull ? '0.80' : '0.70';
  const diffHours = (Date.now() - date.getTime()) / 3600000;
  if (diffHours < 24) return '0.95';
  if (diffHours < 72) return '0.90';
  if (diffHours < 168) return '0.85';
  return isFull ? '0.80' : '0.70';
}

async function fetchMoviePage(type: string, page: number): Promise<MovieItem[]> {
  const url = `${API_BASE}/v1/api/danh-sach/${type}?page=${page}&sort_field=modified.time&sort_type=desc`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!response.ok) return [];
    const data = await response.json() as ApiResponse;
    return data.data?.items ?? data.items ?? [];
  } catch {
    return [];
  }
}

async function fetchSupabaseMovies(offset = 0, limit = 50000, mode: 'all' | 'recent' | 'upcoming' | 'ongoing' = 'all'): Promise<MovieItem[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const pageSize = 1000;
  const maxRows = Math.min(50000, Math.max(1, limit));
  const endExclusive = offset + maxRows;
  const concurrency = 5;
  const rows: MovieItem[] = [];

  for (let base = offset; base < endExclusive; base += pageSize * concurrency) {
    const batches = await Promise.all(
      Array.from({ length: concurrency }, async (_, index) => {
        const from = base + index * pageSize;
        const to = from + pageSize - 1;
        if (from >= endExclusive) return [] as MovieItem[];
        let query = supabase
          .from('movies')
          .select('id,slug,name,thumb_url,poster_url,updated_at,episode_current,current_episode,total_episodes,next_episode_at,content,is_published,seo_catalog_status,catalog_source,release_at,tmdb_popularity,trailer_url,status,year')
          .eq('is_published', true)
          .not('slug', 'is', null);

        if (mode === 'recent') {
          query = query
            .order('updated_at', { ascending: false, nullsFirst: false })
            .order('release_at', { ascending: false, nullsFirst: false })
            .order('year', { ascending: false, nullsFirst: false });
        } else if (mode === 'upcoming') {
          query = query
            .order('release_at', { ascending: false, nullsFirst: false })
            .order('updated_at', { ascending: false, nullsFirst: false })
            .order('year', { ascending: false, nullsFirst: false });
        } else if (mode === 'ongoing') {
          query = query
            .order('updated_at', { ascending: false, nullsFirst: false })
            .order('next_episode_at', { ascending: true, nullsFirst: false });
        } else {
          query = query
            .order('year', { ascending: false, nullsFirst: false })
            .order('release_at', { ascending: false, nullsFirst: false })
            .order('updated_at', { ascending: false, nullsFirst: false });
        }

        const { data, error } = await query.range(from, Math.min(to, endExclusive - 1));
        if (error || !data?.length) return [] as MovieItem[];
        return data as MovieItem[];
      }),
    );

    for (const batch of batches) rows.push(...batch);
    if (batches.some((batch) => batch.length < pageSize)) break;
  }

  return rows;
}

async function fetchEligibleUpcomingMovies(limit = 5000): Promise<MovieItem[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from('movie_seo_quality_status')
    .select(`
      movie_id,
      quality_score,
      movies!inner(
        id,slug,name,thumb_url,poster_url,updated_at,episode_current,current_episode,
        content,is_published,seo_catalog_status,catalog_source,release_at,
        tmdb_popularity,trailer_url,status,year
      )
    `)
    .eq('eligible_for_index', true)
    .eq('index_tier', 'upcoming')
    .order('quality_score', { ascending: false })
    .order('checked_at', { ascending: false })
    .limit(Math.min(5000, Math.max(1, limit)));
  if (error) throw error;
  return (data || [])
    .flatMap((row) => Array.isArray(row.movies) ? row.movies : [row.movies])
    .filter(Boolean) as unknown as MovieItem[];
}

async function fetchEligibleOngoingMovies(limit = 5000): Promise<MovieItem[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from('movie_seo_quality_status')
    .select(`
      movie_id,
      quality_score,
      freshness_score,
      last_episode_change_at,
      movies!inner(
        id,slug,name,thumb_url,poster_url,updated_at,episode_current,current_episode,
        total_episodes,next_episode_at,content,is_published,seo_catalog_status,catalog_source,
        release_at,tmdb_popularity,trailer_url,status,year
      )
    `)
    .eq('eligible_for_index', true)
    .eq('index_tier', 'ongoing')
    .order('freshness_score', { ascending: false })
    .order('last_episode_change_at', { ascending: false, nullsFirst: false })
    .order('quality_score', { ascending: false })
    .limit(Math.min(5000, Math.max(1, limit)));
  if (error) throw error;
  return (data || [])
    .flatMap((row) => {
      const movies = Array.isArray(row.movies) ? row.movies : [row.movies];
      return movies.filter(Boolean).map((movie) => ({
        ...(movie as unknown as MovieItem),
        seo_index_tier: 'ongoing',
        seo_quality_score: Number(row.quality_score || 0),
        seo_freshness_score: Number(row.freshness_score || 0),
        seo_last_episode_change_at: String(row.last_episode_change_at || ''),
      }));
    });
}

function getSitemapOptions(req: Request): { offset: number; limit: number; outputLimit: number; includeOphim: boolean; mode: 'all' | 'recent' | 'upcoming' | 'ongoing' } {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get('page') || '0');
  const pageSize = Math.min(10000, Math.max(100, Number(url.searchParams.get('page_size') || '10000')));
  const recent = url.searchParams.get('recent') === '1';
  const upcoming = url.searchParams.get('upcoming') === '1';
  const ongoing = url.searchParams.get('ongoing') === '1';

  if (upcoming) {
    return { offset: 0, limit: 50000, outputLimit: Math.min(5000, pageSize), includeOphim: false, mode: 'upcoming' };
  }

  if (ongoing) {
    return { offset: 0, limit: 50000, outputLimit: Math.min(5000, pageSize), includeOphim: false, mode: 'ongoing' };
  }

  if (recent) {
    return { offset: 0, limit: 2000, outputLimit: Math.min(500, pageSize), includeOphim: false, mode: 'recent' };
  }

  if (Number.isFinite(page) && page > 0) {
    return { offset: (Math.floor(page) - 1) * pageSize, limit: pageSize, outputLimit: pageSize, includeOphim: false, mode: 'all' };
  }

  return { offset: 0, limit: 50000, outputLimit: 50000, includeOphim: false, mode: 'all' };
}

async function buildMovieSitemap(req: Request): Promise<{ xml: string; count: number }> {
  const options = getSitemapOptions(req);
  const pages = [1, 2, 3, 4, 5, 6];
  const [supabaseMovies, ...lists] = await Promise.all([
    options.mode === 'upcoming'
      ? fetchEligibleUpcomingMovies(options.outputLimit)
      : options.mode === 'ongoing'
        ? fetchEligibleOngoingMovies(options.outputLimit)
        : fetchSupabaseMovies(options.offset, options.limit, options.mode),
    ...(options.includeOphim ? LIST_TYPES.flatMap((type) => pages.map((page) => fetchMoviePage(type, page))) : []),
  ]);

  const ophimMovies = lists.flat();
  const qualityByMovieId = new Map<string, boolean>();
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && supabaseMovies.length > 0) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const ids = supabaseMovies.map((movie) => movie.id).filter(Boolean) as string[];
    for (let start = 0; start < ids.length; start += 500) {
      const { data } = await supabase
        .from('movie_seo_quality_status')
        .select('movie_id,eligible_for_index')
        .in('movie_id', ids.slice(start, start + 500));
      for (const row of data || []) qualityByMovieId.set(String(row.movie_id), Boolean(row.eligible_for_index));
    }
  }
  const seen = new Set<string>();
  let movies = [...supabaseMovies, ...ophimMovies]
    .filter((movie) => {
      const slug = movie.slug?.trim();
      if (!slug || seen.has(slug)) return false;
      seen.add(slug);
      if (!isIndexableMovie(movie)) return false;
      // Never expose an unreviewed database movie to Google. Historically this
      // fallback admitted almost the entire public catalogue and created tens
      // of thousands of "Discovered - currently not indexed" URLs. OPhim
      // fallback rows have no local id; local rows must explicitly pass the
      // materialized SEO quality view before entering any sitemap.
      if (!movie.id) return true;
      if (isUpcoming(movie) || isTrailer(movie)) return qualityByMovieId.get(movie.id) === true;
      return !qualityByMovieId.has(movie.id) || qualityByMovieId.get(movie.id) === true;
    });

  if (options.mode === 'upcoming') {
    movies = movies
      .filter((movie) => isUpcoming(movie) || isTrailer(movie))
      .sort((a, b) => getFreshnessScore(b) - getFreshnessScore(a));
  } else if (options.mode === 'ongoing') {
    movies = movies
      .filter((movie) => isOngoingTier(movie))
      .sort((a, b) => getRecentUpdateScore(b) - getRecentUpdateScore(a));
  } else if (options.mode === 'recent') {
    movies = movies
      .filter((movie) => !isUpcoming(movie))
      .sort((a, b) => getRecentUpdateScore(b) - getRecentUpdateScore(a));
  } else {
    movies = movies.sort(compareMovieSeoOrder);
  }

  movies = movies.slice(0, options.mode === 'all' ? 50000 : options.outputLimit);

  const urls = movies.map((movie) => {
    const slug = movie.slug ?? '';
    const loc = `${SITE_URL}/phim/${encodeURIComponent(slug)}`;
    const image = toImageUrl(movie.thumb_url || movie.poster_url || '');
    const title = cleanImageTitle(movie.name || slug, slug);
    const modifiedTime = movie.seo_last_episode_change_at || movie.updated_at || movie.release_at || movie.modified?.time;
    const trailerPlayer = toTrailerPlayerUrl(movie.trailer_url);
    const description = String(movie.content || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1900);

    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${toLastMod(modifiedTime)}</lastmod>
    <changefreq>${isOngoingTier(movie) ? 'daily' : getChangeFreq(modifiedTime)}</changefreq>
    <priority>${getPriority(movie)}</priority>${image ? `
    <image:image>
      <image:loc>${escapeXml(image)}</image:loc>
      <image:title>${escapeXml(title)}</image:title>
    </image:image>` : ''}${trailerPlayer && image && description ? `
    <video:video>
      <video:thumbnail_loc>${escapeXml(image)}</video:thumbnail_loc>
      <video:title>${escapeXml(`Trailer ${title}`)}</video:title>
      <video:description>${escapeXml(description)}</video:description>
      <video:player_loc allow_embed="yes">${escapeXml(trailerPlayer)}</video:player_loc>
    </video:video>` : ''}
  </url>`;
  }).join('\n');

  return {
    count: movies.length,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls}
</urlset>`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: XML_HEADERS });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: XML_HEADERS });
  }

  const { xml, count } = await buildMovieSitemap(req);
  const isOngoingRequest = new URL(req.url).searchParams.get('ongoing') === '1';
  const headers = {
    ...XML_HEADERS,
    ...(isOngoingRequest
      ? { 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800' }
      : {}),
    'X-Movie-Count': String(count),
  };

  return new Response(req.method === 'HEAD' ? null : xml, {
    status: 200,
    headers,
  });
});
