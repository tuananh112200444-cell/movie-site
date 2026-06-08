import { useEffect, useState } from 'react';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://khophim.org';
const BASE_URL = 'https://ophim1.com';
const IMG_BASE = 'https://img.ophim.live/uploads/movies/';

interface MovieItem {
  slug: string;
  name: string;
  thumb_url?: string;
  modified?: { time?: string };
  episode_current?: string;
}

interface ApiResponse {
  data?: { items?: MovieItem[] };
  items?: MovieItem[];
}

function getThumbUrl(path?: string): string {
  if (!path) return '';
  return path.startsWith('http') ? path : `${IMG_BASE}${path}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getChangeFreq(modifiedTime?: string): string {
  if (!modifiedTime) return 'weekly';
  const diffHours = (Date.now() - new Date(modifiedTime).getTime()) / 3600000;
  if (diffHours < 48) return 'daily';
  if (diffHours < 168) return 'weekly';
  return 'monthly';
}

function getPriority(modifiedTime?: string, episodeCurrent?: string): string {
  const ep = (episodeCurrent ?? '').toLowerCase();
  const isFull = ep === 'full' || ep.startsWith('hoan tat') || ep.startsWith('hoàn tất');
  if (!modifiedTime) return isFull ? '0.80' : '0.70';
  const diffHours = (Date.now() - new Date(modifiedTime).getTime()) / 3600000;
  if (diffHours < 24) return '0.95';
  if (diffHours < 72) return '0.90';
  if (diffHours < 168) return '0.85';
  return isFull ? '0.80' : '0.70';
}

async function fetchMoviePage(type: string, page: number): Promise<MovieItem[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/v1/api/danh-sach/${type}?page=${page}&sort_field=modified.time&sort_type=desc`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as ApiResponse;
    return data?.data?.items ?? data?.items ?? [];
  } catch {
    return [];
  }
}

export default function MovieSitemapPage() {
  const [xml, setXml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [movieCount, setMovieCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const types = ['phim-moi-cap-nhat', 'phim-le', 'phim-bo', 'phim-chieu-rap', 'hoat-hinh'];
      const pages = [1, 2, 3, 4, 5];
      const results = await Promise.all(
        types.flatMap((type) => pages.map((page) => fetchMoviePage(type, page)))
      );
      if (cancelled) return;

      const seen = new Set<string>();
      const movies = results
        .flat()
        .filter((movie) => {
          if (!movie.slug || seen.has(movie.slug)) return false;
          seen.add(movie.slug);
          return true;
        })
        .slice(0, 1000);

      const urls = movies.map((movie) => {
        const loc = `${SITE_URL}/phim/${encodeURIComponent(movie.slug)}`;
        const lastmod = movie.modified?.time
          ? new Date(movie.modified.time).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        const thumb = getThumbUrl(movie.thumb_url);
        return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${getChangeFreq(movie.modified?.time)}</changefreq>
    <priority>${getPriority(movie.modified?.time, movie.episode_current)}</priority>${thumb ? `
    <image:image>
      <image:loc>${escapeXml(thumb)}</image:loc>
      <image:title>${escapeXml(movie.name)}</image:title>
    </image:image>` : ''}
  </url>`;
      }).join('\n');

      setXml(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`);
      setMovieCount(movies.length);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!xml) return;
    document.open('text/xml');
    document.write(xml);
    document.close();
  }, [xml]);

  if (loading) {
    return (
      <div style={{
        fontFamily: 'monospace',
        padding: '40px',
        background: '#080a10',
        color: '#888',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{ fontSize: '16px', color: '#ccc' }}>Generating dynamic sitemap...</div>
        <div style={{ fontSize: '13px', color: '#555' }}>Fetching latest movies from API</div>
        <div style={{ fontSize: '12px', color: '#444', marginTop: '8px' }}>
          khophim.org/sitemap-movies.xml
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', background: '#080a10', color: '#666' }}>
      Sitemap generated: {movieCount} movies
    </div>
  );
}
