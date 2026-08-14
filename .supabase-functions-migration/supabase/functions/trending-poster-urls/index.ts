import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
/**
 * Trending Poster URLs — Edge Cachable
 *
 * Fetch trending movies from OPhim API, return poster URLs as JSON.
 * Cloudflare Edge caches this response for 1 hour (3600s).
 * Used by index.html inline script to inject <link rel="preload">.
 *
 * Response:
 *   {
 *     "timestamp": 1234567890,
 *     "items": [
 *       { "poster_url": "...", "thumb_url": "...", "name": "...", "slug": "..." }
 *     ]
 *   }
 */ const BASE_URL = 'https://ophim1.com';
const EDGE_CACHE = 3600; // 1 hour
function isTrailerOnly(episodeCurrent) {
  if (!episodeCurrent) return false;
  return episodeCurrent.toLowerCase().trim() === 'trailer';
}
function hotScore(item, source) {
  const currentYear = new Date().getFullYear();
  const movieYear = item.year ?? 0;
  const ep = (item.episode_current ?? '').toLowerCase().trim();
  const isFull = ep === 'full' || ep === 'full hd' || ep.startsWith('hoàn tất');
  const isCinema = source === 'phim-chieu-rap';
  const yearDiff = currentYear - movieYear;
  const yearScore = yearDiff <= 0 ? 60 : yearDiff === 1 ? 45 : yearDiff === 2 ? 30 : yearDiff === 3 ? 15 : yearDiff <= 5 ? 5 : 0;
  const mtime = new Date(item.modified?.time ?? 0).getTime();
  const ageHours = (Date.now() - mtime) / 3600000;
  const freshnessScore = Math.max(0, 80 - ageHours * 2);
  return yearScore + freshnessScore + (isFull ? 25 : 0) + (isCinema ? 15 : 0);
}
async function fetchJSON(url, timeout = 5000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeout);
    const res = await fetch(url, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch  {
    return null;
  }
}
function parseItems(data) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data?.data?.items ?? [];
}
serve(async ()=>{
  const requests = [
    {
      url: `${BASE_URL}/v1/api/danh-sach/phim-moi-cap-nhat?page=1&sort_field=modified.time&sort_type=desc`,
      source: 'phim-moi-cap-nhat'
    },
    {
      url: `${BASE_URL}/v1/api/danh-sach/phim-bo?page=1&sort_field=modified.time&sort_type=desc`,
      source: 'phim-bo'
    },
    {
      url: `${BASE_URL}/v1/api/danh-sach/phim-le?page=1&sort_field=modified.time&sort_type=desc`,
      source: 'phim-le'
    },
    {
      url: `${BASE_URL}/v1/api/danh-sach/phim-chieu-rap?page=1&sort_field=modified.time&sort_type=desc`,
      source: 'phim-chieu-rap'
    }
  ];
  const results = await Promise.allSettled(requests.map(({ url, source })=>fetchJSON(url).then((d)=>({
        items: parseItems(d ?? {}),
        source
      }))));
  const seen = new Set();
  const scored = [];
  for (const r of results){
    if (r.status !== 'fulfilled') continue;
    const { items, source } = r.value;
    for (const item of items){
      if (!item.slug || seen.has(item.slug)) continue;
      if (isTrailerOnly(item.episode_current)) continue;
      seen.add(item.slug);
      scored.push({
        item,
        score: hotScore(item, source)
      });
    }
  }
  const topItems = scored.sort((a, b)=>b.score - a.score).slice(0, 10).map((s)=>({
      poster_url: s.item.poster_url,
      thumb_url: s.item.thumb_url,
      name: s.item.name,
      slug: s.item.slug,
      year: s.item.year,
      quality: s.item.quality,
      episode_current: s.item.episode_current
    }));
  return new Response(JSON.stringify({
    timestamp: Date.now(),
    items: topItems
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${EDGE_CACHE}, s-maxage=${EDGE_CACHE}`,
      'X-Edge-Cache': 'MISS',
      'X-CDN-By': 'khophim-trending'
    }
  });
});
