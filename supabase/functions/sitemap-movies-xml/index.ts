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
  slug?: string;
  name?: string;
  thumb_url?: string;
  poster_url?: string;
  modified?: { time?: string };
  updated_at?: string;
  episode_current?: string;
  is_published?: boolean;
  seo_catalog_status?: string;
  catalog_source?: string;
  release_at?: string;
  tmdb_popularity?: number;
  trailer_url?: string;
  status?: string;
  year?: number;
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

function getFreshnessScore(movie: MovieItem): number {
  const updated = movie.updated_at || movie.release_at || movie.modified?.time;
  const updatedTime = updated ? new Date(updated).getTime() : 0;
  const freshness = Number.isFinite(updatedTime) ? updatedTime / 1000000000 : 0;
  const popularity = Number(movie.tmdb_popularity || 0);
  const upcomingBoost = isUpcoming(movie) ? 5000 : 0;
  const trailerBoost = isTrailer(movie) || movie.trailer_url ? 2500 : 0;
  return freshness + popularity + upcomingBoost + trailerBoost;
}

function getPriority(movie: MovieItem): string {
  const ep = (movie.episode_current ?? '').toLowerCase();
  const catalogStatus = String(movie.seo_catalog_status || '').toLowerCase();
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

async function fetchSupabaseMovies(offset = 0, limit = 50000): Promise<MovieItem[]> {
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
        const { data, error } = await supabase
          .from('movies')
          .select('slug,name,thumb_url,poster_url,updated_at,episode_current,is_published,seo_catalog_status,catalog_source,release_at,tmdb_popularity,trailer_url,status,year')
          .eq('is_published', true)
          .not('slug', 'is', null)
          .order('updated_at', { ascending: false })
          .range(from, Math.min(to, endExclusive - 1));
        if (error || !data?.length) return [] as MovieItem[];
        return data as MovieItem[];
      }),
    );

    for (const batch of batches) rows.push(...batch);
    if (batches.some((batch) => batch.length < pageSize)) break;
  }

  return rows;
}

function getSitemapOptions(req: Request): { offset: number; limit: number; includeOphim: boolean; mode: 'all' | 'recent' | 'upcoming' } {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get('page') || '0');
  const pageSize = Math.min(10000, Math.max(100, Number(url.searchParams.get('page_size') || '10000')));
  const recent = url.searchParams.get('recent') === '1';
  const upcoming = url.searchParams.get('upcoming') === '1';

  if (upcoming) {
    return { offset: 0, limit: Math.min(5000, pageSize), includeOphim: true, mode: 'upcoming' };
  }

  if (recent) {
    return { offset: 0, limit: Math.min(2000, pageSize), includeOphim: true, mode: 'recent' };
  }

  if (Number.isFinite(page) && page > 0) {
    return { offset: (Math.floor(page) - 1) * pageSize, limit: pageSize, includeOphim: false, mode: 'all' };
  }

  return { offset: 0, limit: 50000, includeOphim: true, mode: 'all' };
}

async function buildMovieSitemap(req: Request): Promise<{ xml: string; count: number }> {
  const options = getSitemapOptions(req);
  const pages = [1, 2, 3, 4, 5, 6];
  const [supabaseMovies, ...lists] = await Promise.all([
    fetchSupabaseMovies(options.offset, options.limit),
    ...(options.includeOphim ? LIST_TYPES.flatMap((type) => pages.map((page) => fetchMoviePage(type, page))) : []),
  ]);

  const ophimMovies = lists.flat();
  const seen = new Set<string>();
  let movies = [...supabaseMovies, ...ophimMovies]
    .filter((movie) => {
      const slug = movie.slug?.trim();
      if (!slug || seen.has(slug)) return false;
      seen.add(slug);
      return movie.is_published !== false;
    });

  if (options.mode === 'upcoming') {
    movies = movies
      .filter((movie) => isUpcoming(movie) || isTrailer(movie) || Boolean(movie.trailer_url))
      .sort((a, b) => getFreshnessScore(b) - getFreshnessScore(a));
  } else if (options.mode === 'recent') {
    movies = movies.sort((a, b) => getFreshnessScore(b) - getFreshnessScore(a));
  }

  movies = movies.slice(0, options.mode === 'all' ? 50000 : options.limit + 650);

  const urls = movies.map((movie) => {
    const slug = movie.slug ?? '';
    const loc = `${SITE_URL}/phim/${encodeURIComponent(slug)}`;
    const image = toImageUrl(movie.thumb_url || movie.poster_url || '');
    const title = movie.name || slug;
    const modifiedTime = movie.updated_at || movie.release_at || movie.modified?.time;

    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${toLastMod(modifiedTime)}</lastmod>
    <changefreq>${getChangeFreq(modifiedTime)}</changefreq>
    <priority>${getPriority(movie)}</priority>${image ? `
    <image:image>
      <image:loc>${escapeXml(image)}</image:loc>
      <image:title>${escapeXml(title)}</image:title>
    </image:image>` : ''}
  </url>`;
  }).join('\n');

  return {
    count: movies.length,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
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
  const headers = {
    ...XML_HEADERS,
    'X-Movie-Count': String(count),
  };

  return new Response(req.method === 'HEAD' ? null : xml, {
    status: 200,
    headers,
  });
});
