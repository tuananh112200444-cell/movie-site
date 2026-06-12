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

function getPriority(movie: MovieItem): string {
  const ep = (movie.episode_current ?? '').toLowerCase();
  const catalogStatus = String(movie.seo_catalog_status || '').toLowerCase();
  if (catalogStatus === 'upcoming') return '0.88';
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

async function fetchSupabaseMovies(): Promise<MovieItem[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const pageSize = 1000;
  const maxRows = 5000;
  const rows: MovieItem[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('movies')
      .select('slug,name,thumb_url,poster_url,modified,updated_at,episode_current,is_published,seo_catalog_status,catalog_source,release_at,tmdb_popularity')
      .eq('is_published', true)
      .not('slug', 'is', null)
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (error || !data?.length) break;
    rows.push(...(data as MovieItem[]));
    if (data.length < pageSize) break;
  }

  return rows;
}

async function buildMovieSitemap(): Promise<{ xml: string; count: number }> {
  const pages = [1, 2, 3, 4, 5, 6];
  const [supabaseMovies, ...lists] = await Promise.all([
    fetchSupabaseMovies(),
    ...LIST_TYPES.flatMap((type) => pages.map((page) => fetchMoviePage(type, page))),
  ]);

  const ophimMovies = lists.flat();
  const seen = new Set<string>();
  const movies = [...supabaseMovies, ...ophimMovies]
    .filter((movie) => {
      const slug = movie.slug?.trim();
      if (!slug || seen.has(slug)) return false;
      seen.add(slug);
      return movie.is_published !== false;
    })
    .slice(0, 5000);

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

  const { xml, count } = await buildMovieSitemap();
  const headers = {
    ...XML_HEADERS,
    'X-Movie-Count': String(count),
  };

  return new Response(req.method === 'HEAD' ? null : xml, {
    status: 200,
    headers,
  });
});
