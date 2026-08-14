import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
function slugify(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}
/**
 * Parse detail page HTML for Vietnamese movie sites.
 */ function parseDetailHTML(html, base, slug) {
  // Anti-bot check
  if (html.length < 1000 || /captcha|cloudflare|cf-browser-verification|turnstile/i.test(html)) {
    return null;
  }
  // Title: try h1, meta og:title, title tag
  let name = '';
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    name = h1Match[1].replace(/<[^>]+>/g, '').trim();
  }
  if (!name) {
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    name = ogTitleMatch ? ogTitleMatch[1].trim() : '';
  }
  if (!name) {
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) name = titleMatch[1].replace(/\s*[-|]\s*.*$/i, '').trim();
  }
  // Origin name (English title) — often in parentheses or subtitle
  let originName = '';
  const subTitleMatch = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (subTitleMatch) {
    originName = subTitleMatch[1].replace(/<[^>]+>/g, '').trim();
  }
  if (!originName && name) {
    // Try extract from parentheses
    const parenMatch = name.match(/\(([^)]+)\)/);
    if (parenMatch) {
      originName = parenMatch[1].trim();
      name = name.replace(/\s*\([^)]+\)/, '').trim();
    }
  }
  // Poster / thumb
  let posterUrl = '';
  let thumbUrl = '';
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    posterUrl = fixUrl(ogImageMatch[1], base);
    thumbUrl = posterUrl;
  }
  if (!posterUrl) {
    const posterMatch = html.match(/<img[^>]+class=["'][^"']*(?:poster|thumb)[^"']*["'][^>]+src=["']([^"']+)["']/i);
    if (posterMatch) {
      posterUrl = fixUrl(posterMatch[1], base);
      thumbUrl = posterUrl;
    }
  }
  // Content / description
  let content = '';
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (ogDescMatch) content = ogDescMatch[1].trim();
  if (!content) {
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (descMatch) content = descMatch[1].trim();
  }
  if (!content) {
    const descDivMatch = html.match(/<div[^>]*class=["'][^"']*(?:desc|description|content|plot)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (descDivMatch) {
      content = descDivMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  // Year
  let year = 0;
  const yearMatch = html.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1]);
  // Quality
  let quality = '';
  const qualityMatch = html.match(/\b(Full\s*HD|HD|4K|CAM|SD|BluRay|WEB[-\s]?DL|HDTV|DVDRip|BRRip)\b/i);
  if (qualityMatch) quality = qualityMatch[1].replace(/\s+/g, '').toUpperCase();
  // Time duration
  let time = '';
  const timeMatch = html.match(/(\d+\s*(?:phút|min|m|h|gi[oờ]))/i);
  if (timeMatch) time = timeMatch[1];
  // Episode info
  let episodeCurrent = '';
  let episodeTotal = '';
  const epMatch = html.match(/(?:T[aà]p|Episode|EP)[\s:]*([\d\/]+|Full|Trailer|HD|Ho[aà]n\s*t[aấ]t)/i);
  if (epMatch) episodeCurrent = epMatch[1];
  // Type
  let type = '';
  const typeMatch = html.match(/\b(Phim\s+l[eẻ]|Phim\s+b[ộo]|TV\s*Show|Anime|Ho[aạ]t\s*h[ìi]nh)\b/i);
  if (typeMatch) type = typeMatch[1];
  // Status
  let status = '';
  const statusMatch = html.match(/\b(Đang\s*chi[eế]u|Ho[aà]n\s*t[aấ]t|S[aắ]p\s*chi[eế]u|Trailer)\b/i);
  if (statusMatch) status = statusMatch[1];
  // Language
  let lang = '';
  const langMatch = html.match(/\b(Vietsub|Thuy[eế]t\s*minh|L[oồ]ng\s*ti[eế]ng|Engsub|RAW)\b/i);
  if (langMatch) lang = langMatch[1];
  // Actors
  const actorMatches = [];
  const actorRegex = /<a[^>]+href=["'][^"']*(?:dien-vien|actor|cast)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let am;
  while((am = actorRegex.exec(html)) !== null){
    const actorName = am[1].replace(/<[^>]+>/g, '').trim();
    if (actorName && !actorMatches.includes(actorName)) actorMatches.push(actorName);
    if (actorMatches.length >= 10) break;
  }
  // Directors
  const directorMatches = [];
  const directorRegex = /<a[^>]+href=["'][^"']*(?:dao-dien|director)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let dm;
  while((dm = directorRegex.exec(html)) !== null){
    const dirName = dm[1].replace(/<[^>]+>/g, '').trim();
    if (dirName && !directorMatches.includes(dirName)) directorMatches.push(dirName);
    if (directorMatches.length >= 5) break;
  }
  // Categories
  const categories = [];
  const catRegex = /<a[^>]+href=["'][^"']*(?:the-loai|genre|category)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let cm;
  while((cm = catRegex.exec(html)) !== null){
    const catName = cm[1].replace(/<[^>]+>/g, '').trim();
    if (catName && !categories.some((c)=>c.name === catName)) {
      categories.push({
        name: catName,
        slug: slugify(catName)
      });
    }
    if (categories.length >= 8) break;
  }
  // Countries
  const countries = [];
  const countryRegex = /<a[^>]+href=["'][^"']*(?:quoc-gia|country|nation)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let cnm;
  while((cnm = countryRegex.exec(html)) !== null){
    const cName = cnm[1].replace(/<[^>]+>/g, '').trim();
    if (cName && !countries.some((c)=>c.name === cName)) {
      countries.push({
        name: cName,
        slug: slugify(cName)
      });
    }
    if (countries.length >= 5) break;
  }
  // Parse episodes
  const episodes = [];
  // Look for episode lists in common structures
  const serverPatterns = [
    /<div[^>]*class=["'][^"']*(?:server|tab|episode-list|episodes)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    /<ul[^>]*class=["'][^"']*(?:server|tab|episode-list|list-ep)[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi
  ];
  let serverContainers = [];
  for (const sp of serverPatterns){
    let sm;
    while((sm = sp.exec(html)) !== null){
      serverContainers.push(sm[1]);
    }
  }
  if (serverContainers.length === 0) {
    serverContainers = [
      html
    ];
  }
  for(let idx = 0; idx < serverContainers.length; idx++){
    const container = serverContainers[idx];
    const epLinks = [];
    const epRegex = /<a[^>]+href=["']\/(?:xem-phim|phim)\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let em;
    while((em = epRegex.exec(container)) !== null){
      const epSlug = em[1].trim();
      const epName = em[2].replace(/<[^>]+>/g, '').trim() || epSlug;
      epLinks.push({
        name: decodeHtmlEntities(epName),
        slug: epSlug,
        filename: '',
        link_embed: `${base}/${em[0].match(/href=["']([^"']+)["']/i)?.[1] || ''}`,
        link_m3u8: ''
      });
      if (epLinks.length >= 200) break;
    }
    if (epLinks.length > 0) {
      episodes.push({
        server_name: `Server ${idx + 1} [External]`,
        server_data: epLinks
      });
    }
  }
  // If no episodes found but we have an iframe/embed, create a single episode
  if (episodes.length === 0) {
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    const embedMatch = html.match(/data-embed=["']([^"']+)["']/i);
    const jsEmbedMatch = html.match(/embedUrl["']?\s*:\s*["']([^"']+)["']/i);
    const embedUrl = iframeMatch?.[1] || embedMatch?.[1] || jsEmbedMatch?.[1] || '';
    if (embedUrl) {
      episodes.push({
        server_name: 'Nguồn ngoài [External]',
        server_data: [
          {
            name: 'Tập 1',
            slug: slug,
            filename: '',
            link_embed: fixUrl(embedUrl, base),
            link_m3u8: ''
          }
        ]
      });
    }
  }
  if (!name) return null;
  const movieId = crypto.randomUUID();
  return {
    status: true,
    movie: {
      _id: movieId,
      name: decodeHtmlEntities(name),
      slug,
      origin_name: decodeHtmlEntities(originName),
      content: decodeHtmlEntities(content),
      type,
      status,
      thumb_url: thumbUrl,
      poster_url: posterUrl,
      trailer_url: '',
      time,
      episode_current: episodeCurrent,
      episode_total: episodeTotal,
      quality,
      lang,
      year,
      view: 0,
      actor: actorMatches,
      director: directorMatches,
      category: categories,
      country: countries,
      notify: '',
      showtimes: ''
    },
    episodes
  };
}
async function fetchDetailFromExternal(slug, base) {
  const urls = [
    `${base}/phim/${encodeURIComponent(slug)}`,
    `${base}/xem-phim/${encodeURIComponent(slug)}`
  ];
  for (const url of urls){
    try {
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(), 12000);
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
      if (html.length < 1000 || /captcha|cloudflare|cf-browser-verification|turnstile/i.test(html)) {
        continue;
      }
      const parsed = parseDetailHTML(html, base, slug);
      if (parsed) return parsed;
    } catch  {}
  }
  return null;
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS
    });
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug')?.trim();
  const force = url.searchParams.get('force') === 'true';
  if (!slug) {
    return new Response(JSON.stringify({
      status: false,
      msg: 'Missing slug'
    }), {
      status: 400,
      headers: {
        ...CORS,
        'Content-Type': 'application/json'
      }
    });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  // 1. Check if already in DB
  if (!force) {
    const { data: existingMovie } = await supabase.from('movies').select('*').eq('slug', slug).maybeSingle();
    if (existingMovie) {
      const { data: existingEpisodes } = await supabase.from('episodes').select('*').eq('movie_id', existingMovie.id);
      return new Response(JSON.stringify({
        status: true,
        source: 'database',
        movie: existingMovie,
        episodes: existingEpisodes?.map((ep)=>({
            server_name: ep.server_name,
            server_data: Array.isArray(ep.server_data) ? ep.server_data : JSON.parse(ep.server_data || '[]')
          })) || []
      }), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json'
        }
      });
    }
  }
  // 2. Scrape from external sources
  let detail = null;
  let sourceBase = '';
  for (const base of MOTCHILL_BASES){
    detail = await fetchDetailFromExternal(slug, base);
    if (detail) {
      sourceBase = base;
      break;
    }
  }
  if (!detail) {
    return new Response(JSON.stringify({
      status: false,
      msg: 'Không thể scrape thông tin phim từ nguồn ngoài',
      episodes: []
    }), {
      status: 404,
      headers: {
        ...CORS,
        'Content-Type': 'application/json'
      }
    });
  }
  // 3. Save to DB
  try {
    const movieRow = {
      slug,
      name: detail.movie.name,
      origin_name: detail.movie.origin_name,
      content: detail.movie.content,
      type: detail.movie.type,
      status: detail.movie.status,
      thumb_url: detail.movie.thumb_url,
      poster_url: detail.movie.poster_url,
      quality: detail.movie.quality,
      lang: detail.movie.lang,
      time: detail.movie.time,
      episode_current: detail.movie.episode_current,
      episode_total: detail.movie.episode_total,
      year: detail.movie.year,
      view: 0,
      actor: detail.movie.actor,
      director: detail.movie.director,
      category: detail.movie.category,
      country: detail.movie.country,
      trailer_url: detail.movie.trailer_url,
      notify: detail.movie.notify,
      showtimes: detail.movie.showtimes,
      source_url: `${sourceBase}/phim/${slug}`,
      source_site: sourceBase.replace(/^https?:\/\//, ''),
      watch_count: 0
    };
    const { data: insertedMovie, error: movieError } = await supabase.from('movies').insert(movieRow).select('id').single();
    if (movieError || !insertedMovie) {
      // Maybe slug already exists (race condition)
      const { data: existing } = await supabase.from('movies').select('id').eq('slug', slug).single();
      if (existing) {
        // Update instead
        await supabase.from('movies').update(movieRow).eq('slug', slug);
        const { data: updated } = await supabase.from('movies').select('id').eq('slug', slug).single();
        if (updated) insertedMovie.id = updated.id;
      }
    }
    const movieId = insertedMovie?.id;
    if (movieId && detail.episodes.length > 0) {
      const episodeRows = detail.episodes.map((ep)=>({
          movie_id: movieId,
          server_name: ep.server_name,
          server_data: ep.server_data
        }));
      await supabase.from('episodes').insert(episodeRows);
    }
    // Upsert external_sources
    await supabase.from('external_sources').upsert({
      slug,
      source_url: `${sourceBase}/phim/${slug}`,
      source_site: sourceBase.replace(/^https?:\/\//, ''),
      last_scraped_at: new Date().toISOString()
    }, {
      onConflict: 'slug'
    });
  } catch (dbErr) {
    console.error('[scrape-movie-detail] DB error:', dbErr);
  // Still return the scraped data even if DB save fails
  }
  return new Response(JSON.stringify({
    status: true,
    source: 'external',
    movie: detail.movie,
    episodes: detail.episodes
  }), {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=180, s-maxage=300'
    }
  });
});
