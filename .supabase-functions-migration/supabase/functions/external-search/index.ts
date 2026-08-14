import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOTCHILL_BASES = [
  'https://motchill40.net',
  'https://motchill40.tv',
  'https://motchill40.com'
];
function decodeHtmlEntities(str) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—'
  };
  return str.replace(/&[a-zA-Z0-9#]+;/g, (m)=>entities[m] || m);
}
function fixUrl(url, base) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base}/${url}`;
}
function parseSearchHTML(html, base) {
  const items = [];
  const seenSlugs = new Set();
  // Try common container patterns for Vietnamese movie sites
  const containerRegexes = [
    /<div[^>]*class=["'][^"']*(?:film-item|movie-item|item-film|film-card|movie-card)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    /<article[^>]*class=["'][^"']*(?:film|movie|item)[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi,
    /<li[^>]*class=["'][^"']*(?:film|movie|item)[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi
  ];
  let allContainers = [];
  for (const rx of containerRegexes){
    let m;
    while((m = rx.exec(html)) !== null){
      allContainers.push(m[1]);
    }
  }
  if (allContainers.length === 0) {
    allContainers = [
      html
    ];
  }
  for (const container of allContainers){
    const linkMatch = container.match(/<a[^>]+href=["']\/(?:phim|xem-phim)\/([^"']+)["'][^>]*>/i);
    if (!linkMatch) continue;
    const slug = linkMatch[1].trim();
    if (seenSlugs.has(slug)) continue;
    const imgMatch = container.match(/<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"]*)["'])?/i);
    const thumbUrl = imgMatch ? fixUrl(imgMatch[1], base) : '';
    const rawName = imgMatch?.[2] || '';
    const yearMatch = container.match(/\b(19\d{2}|20\d{2})\b/);
    const qualityMatch = container.match(/\b(Full\s*HD|HD|4K|CAM|SD|BluRay|WEB[-\s]?DL|HDTV|DVDRip|BRRip)\b/i);
    const epPatterns = [
      /(?:T[aà]p|Episode|EP)\s*([\d\/]+|Full|Trailer|HD|Ho[aà]n\s*t[aấ]t)/i,
      /([\d\/]+)\s*(?:T[aà]p|Episode)/i,
      /(?:Ho[aà]n\s*t[aấ]t|Full|Trailer|[Dd][aă]ng\s*chi[eế]u)/i
    ];
    let episodeCurrent = '';
    for (const epP of epPatterns){
      const epM = container.match(epP);
      if (epM) {
        episodeCurrent = epM[1] || epM[0] || '';
        break;
      }
    }
    const typePatterns = [
      /\b(Phim\s+l[eẻ]|Phim\s+b[ộo]|TV\s*Show|Anime|Ho[aạ]t\s*h[ìi]nh)\b/i,
      /\b(series|movie|tvshow)\b/i
    ];
    let type = '';
    for (const tp of typePatterns){
      const tm = container.match(tp);
      if (tm) {
        type = tm[1];
        break;
      }
    }
    const name = decodeHtmlEntities(rawName).trim() || slug.replace(/-/g, ' ');
    if (!name) continue;
    seenSlugs.add(slug);
    items.push({
      name,
      slug,
      thumb_url: thumbUrl,
      poster_url: thumbUrl,
      origin_name: '',
      year: yearMatch ? parseInt(yearMatch[1]) : 0,
      quality: qualityMatch ? qualityMatch[1].replace(/\s+/g, '').toUpperCase() : '',
      episode_current: episodeCurrent,
      type,
      source_url: `${base}/phim/${slug}`,
      source_site: base.replace(/^https?:\/\//, '')
    });
    if (items.length >= 24) break;
  }
  return items;
}
async function trySearch(base, keyword) {
  const encoded = encodeURIComponent(keyword);
  const searchUrls = [
    `${base}/tim-kiem?keyword=${encoded}`,
    `${base}/search?keyword=${encoded}`,
    `${base}/search?q=${encoded}`,
    `${base}/timkiem?keyword=${encoded}`
  ];
  for (const url of searchUrls){
    try {
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(), 10000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8'
        },
        redirect: 'follow'
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 500 || /captcha|cloudflare|cf-browser-verification|turnstile/i.test(html)) {
        continue;
      }
      const items = parseSearchHTML(html, base);
      if (items.length > 0) return items;
    } catch  {}
  }
  return [];
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS
    });
  }
  const url = new URL(req.url);
  const keyword = url.searchParams.get('keyword')?.trim();
  if (!keyword) {
    return new Response(JSON.stringify({
      status: false,
      msg: 'Missing keyword',
      items: []
    }), {
      status: 400,
      headers: {
        ...CORS,
        'Content-Type': 'application/json'
      }
    });
  }
  let allItems = [];
  for (const base of MOTCHILL_BASES){
    const items = await trySearch(base, keyword);
    if (items.length > 0) {
      allItems = items;
      break;
    }
  }
  if (allItems.length > 0) {
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
      const now = new Date().toISOString();
      const sourcesToUpsert = allItems.map((item)=>({
          slug: item.slug,
          source_url: item.source_url,
          source_site: item.source_site,
          last_scraped_at: now
        }));
      await supabase.from('external_sources').upsert(sourcesToUpsert, {
        onConflict: 'slug'
      });
    } catch  {}
  }
  return new Response(JSON.stringify({
    status: allItems.length > 0,
    source: 'external',
    source_site: allItems[0]?.source_site || '',
    items: allItems,
    pagination: {
      currentPage: 1,
      totalItems: allItems.length,
      totalItemsPerPage: 24,
      totalPages: 1
    }
  }), {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=600'
    }
  });
});
