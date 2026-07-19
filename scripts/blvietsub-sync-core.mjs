import { createClient } from '@supabase/supabase-js';

const DEFAULT_FEED_URL = 'https://blvietsub.com/sitemap_index.xml';
const DEFAULT_DISCOVERY_URLS = [
  'https://blvietsub.com/',
  'https://blvietsub.com/phim/',
  'https://blvietsub.com/phim/page/2/',
  'https://blvietsub.com/phim/page/3/',
  'https://blvietsub.com/phim/page/4/',
  'https://blvietsub.com/categories/phim-bo/',
  'https://blvietsub.com/categories/phim-bo/page/2/',
  'https://blvietsub.com/categories/phim-bo/page/3/',
  'https://blvietsub.com/categories/phim-le/',
  'https://blvietsub.com/categories/phim-doc/',
];
const DEFAULT_DISCOVERY_QUERIES = [
  'deep in',
  'nhap hi',
  'my magic prophecy',
  'loi de nghi cua cong to vien',
  'in love',
  'wedding dream',
  'nhập hí',
];
const PRIORITY_SITEMAP_LIMIT = 40;
const SOURCE_SITE = 'blvietsub';
const SOURCE_NAME = 'BLVietsub';
const TAP_LABEL = 'Tập';

export const BLVIETSUB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 KhoPhim-Sync/1.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://blvietsub.com/',
};

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'");
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function firstMatch(value, pattern) {
  return decodeHtml(String(value || '').match(pattern)?.[1] || '').trim();
}

function parseEpisodeToken(value = '') {
  const numbers = String(value || '').match(/\d+/g);
  if (!numbers?.length) return 1;
  return Number(numbers[numbers.length - 1] || 1) || 1;
}

function parseEpisodeInfo(value = '') {
  const raw = decodeHtml(String(value || '')).trim();
  const numbers = raw.match(/\d+/g);
  if (!numbers?.length) {
    return { number: 1, label: `${TAP_LABEL} 1`, slug: 'tap-1', end: 1 };
  }
  const start = Number(numbers[0] || 1) || 1;
  const end = Number(numbers[numbers.length - 1] || start) || start;
  const isRange = numbers.length >= 2 && /[-~–—]/.test(raw) && end > start;
  const labelToken = isRange ? `${numbers[0]}-${numbers[numbers.length - 1]}` : String(end);
  return {
    number: isRange ? start : end,
    label: `${TAP_LABEL} ${labelToken}`,
    slug: `tap-${labelToken}`,
    end,
  };
}

function getEpisodeEndNumber(episode) {
  return parseEpisodeInfo(`${episode?.episode_name || ''} ${episode?.slug || ''} ${episode?.episode_number || ''}`).end;
}

function getMetaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return firstMatch(
    html,
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
  );
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function canonicalDuplicateTitle(value = '') {
  return slugify(value).replace(/^(phim|movie|series)-/, '');
}

function compactTitleKey(value = '') {
  return canonicalDuplicateTitle(value).replace(/-/g, '');
}

function hasCompatibleYear(left, right) {
  const a = Number(left || 0);
  const b = Number(right || 0);
  return !a || !b || a === b;
}

function canonicalMoviePriority(movie) {
  const source = `${movie?.source_site || ''} ${movie?.source_name || ''}`.toLowerCase();
  if (source.includes('merged')) return -100;
  if (source.includes('admin-queer')) return 100;
  if (source.includes('admin')) return 90;
  if (!String(movie?.slug || '').startsWith('blvietsub-')) return 70;
  if (source.includes('blvietsub')) return 40;
  return 20;
}

function selectPreferredMovie(movies = []) {
  return [...movies].sort((a, b) => (
    canonicalMoviePriority(b) - canonicalMoviePriority(a) ||
    getMovieCurrentEpisode(b) - getMovieCurrentEpisode(a) ||
    Date.parse(String(b?.updated_at || '')) - Date.parse(String(a?.updated_at || ''))
  ))[0] || null;
}

function getMovieCompactTitleKeys(movie) {
  return [...new Set([movie?.name, movie?.origin_name, movie?.title_vi, movie?.title_en]
    .map((value) => compactTitleKey(value))
    .filter((value) => value.length >= 5))];
}

function getEntryCompactTitleKeys(entry) {
  return [...new Set([entry?.title, entry?.originName, ...(entry?.aliasNames || [])]
    .map((value) => compactTitleKey(value))
    .filter((value) => value.length >= 5))];
}

function getMovieCurrentEpisode(movie) {
  const numeric = Number(movie?.current_episode || movie?.total_episodes || 0);
  if (numeric > 0) return numeric;
  const fromText = String(movie?.episode_current || '').match(/\d+/)?.[0];
  return fromText ? Number(fromText) : 0;
}

function playableEpisodeCount(episodes) {
  return new Set(episodes.map((episode) => Number(episode.episode_number || 0)).filter(Boolean)).size;
}

function maxPlayableEpisodeNumber(episodes) {
  return episodes.reduce((max, episode) => Math.max(max, getEpisodeEndNumber(episode)), 0);
}

function isTransientExternalFetchError(error) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error || '');
  return /abort|timeout|timed out|signal|fetch failed|network|502|503|504|522|523|524/i.test(text);
}

function parseSitemap(xml = '') {
  const urls = [];
  for (const match of xml.matchAll(/<url>\s*<loc>([\s\S]*?)<\/loc>(?:[\s\S]*?<lastmod>([\s\S]*?)<\/lastmod>)?[\s\S]*?<\/url>/gi)) {
    const url = decodeHtml(match[1]).replace(/^http:\/\//i, 'https://');
    if (!isBlvietsubMoviePageUrl(url)) continue;
    urls.push({ url, updatedAt: decodeHtml(match[2] || '') });
  }
  return urls;
}

function parseSitemapIndex(xml = '') {
  const urls = [];
  for (const match of xml.matchAll(/<sitemap>\s*<loc>([\s\S]*?)<\/loc>(?:[\s\S]*?<lastmod>([\s\S]*?)<\/lastmod>)?[\s\S]*?<\/sitemap>/gi)) {
    const url = decodeHtml(match[1]).replace(/^http:\/\//i, 'https://');
    if (!/^https?:\/\/blvietsub\.com\/[^?#]+sitemap[^?#]*\.xml$/i.test(url)) continue;
    if (/\/(?:category|post_tag|actors?|author|page)-sitemap/i.test(url)) {
      if (!/\/post-sitemap/i.test(url)) continue;
    }
    urls.push({ url, updatedAt: decodeHtml(match[2] || '') });
  }
  return urls;
}

function isBlvietsubMoviePageUrl(rawUrl = '') {
  try {
    const url = new URL(String(rawUrl || '').replace(/^http:\/\//i, 'https://'));
    if (url.hostname !== 'blvietsub.com') return false;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 2 && parts[0].toLowerCase() === 'phim') return Boolean(parts[1]);
    if (parts.length !== 1) return false;
    const slug = parts[0].toLowerCase();
    if (!slug) return false;
    if (/\.(?:php|xml|json|txt|ico|css|js)$/i.test(slug)) return false;
    return !/^(sample-page|actors|actor|categories|category|tags|tag|blog|my-profile|submit-a-video|wp-json|wp-content|feed|page|author)$/i.test(slug);
  } catch {
    return false;
  }
}

function uniqMovieUrls(items = []) {
  const seen = new Set();
  const urls = [];
  for (const item of items) {
    const url = String(item?.url || item || '').replace(/^http:\/\//i, 'https://').replace(/\/+$/, '/');
    if (!isBlvietsubMoviePageUrl(url) || seen.has(url)) continue;
    if (/\/phim\/(?:feed|page)\/$/i.test(url)) continue;
    seen.add(url);
    urls.push({ url, updatedAt: item?.updatedAt || '', title: item?.title || '', originName: item?.originName || '' });
  }
  return urls;
}

function parseMovieUrlsFromHtml(html = '') {
  const urls = [];
  for (const match of String(html).matchAll(/href=["']([^"']+)["']/gi)) {
    const raw = decodeHtml(match[1]).trim();
    let url = raw;
    if (url.startsWith('//')) url = `https:${url}`;
    if (url.startsWith('/')) url = `https://blvietsub.com${url}`;
    if (!isBlvietsubMoviePageUrl(url.split(/[?#]/)[0])) continue;
    url = url.split(/[?#]/)[0].replace(/^http:\/\//i, 'https://').replace(/\/?$/, '/');
    urls.push({ url });
  }
  return uniqMovieUrls(urls);
}

async function fetchDiscoveryPageMovieUrls(discoveryUrls = DEFAULT_DISCOVERY_URLS) {
  const urls = [];
  for (const url of discoveryUrls) {
    try {
      const html = await fetchText(url, 18000);
      urls.push(...parseMovieUrlsFromHtml(html));
    } catch {
      // Discovery is a fallback; sitemap sync must continue if a page is temporarily blocked.
    }
  }
  return uniqMovieUrls(urls);
}

async function searchBlvietsubMovieUrls(queries = DEFAULT_DISCOVERY_QUERIES) {
  const urls = [];
  for (const query of queries.map((value) => String(value || '').trim()).filter(Boolean)) {
    try {
      const body = new URLSearchParams({ action: 'search_film', keyword: query, limit: '20' });
      const response = await fetch('https://blvietsub.com/wp-admin/admin-ajax.php', {
        method: 'POST',
        headers: {
          ...BLVIETSUB_HEADERS,
          Accept: 'application/json,text/plain,*/*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body,
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok) continue;
      const data = await response.json().catch(() => []);
      for (const item of Array.isArray(data) ? data : []) {
        const url = String(item?.slug || '').replace(/^http:\/\//i, 'https://');
        if (/^https:\/\/blvietsub\.com\/phim\/[^/]+\/?$/i.test(url)) {
          urls.push({
            url: url.replace(/\/?$/, '/'),
            title: stripTags(item?.title || ''),
            originName: stripTags(item?.original_title || ''),
          });
        }
      }
    } catch {
      // Keep sync resilient when BLVietsub search rate-limits or times out.
    }
  }
  return uniqMovieUrls(urls);
}

function getMovieSlug(movieUrl = '') {
  const raw = String(movieUrl || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.replace(/^http:\/\//i, 'https://'), 'https://blvietsub.com');
    const parts = parsed.pathname.split('/').filter(Boolean);
    const phimIndex = parts.findIndex((part) => part.toLowerCase() === 'phim');
    if (phimIndex >= 0 && parts[phimIndex + 1]) return parts[phimIndex + 1];
    if (parts.length === 1) return parts[0];
    return '';
  } catch {
    return raw
      .replace(/[?#].*$/, '')
      .match(/(?:^|\/)(?:phim\/)?([^/]+)\/?$/i)?.[1] || '';
  }
}

function normalizeBlvietsubWatchUrl(rawLink = '') {
  let link = String(rawLink || '').replace(/^http:\/\//i, 'https://').replace(/&amp;/g, '&').trim();
  if (!link) return '';
  if (link.startsWith('//')) link = `https:${link}`;
  if (link.startsWith('/')) link = `https://blvietsub.com${link}`;
  if (!/^https?:\/\//i.test(link)) link = `https://blvietsub.com/${link.replace(/^\/+/, '')}`;
  return link;
}

function isBlvietsubWatchUrl(url = '') {
  try {
    const parsed = new URL(String(url || '').replace(/&amp;/g, '&'));
    return /(^|\.)blvietsub\.com$/i.test(parsed.hostname) && /\/+xem-phim\//i.test(parsed.pathname);
  } catch {
    return /blvietsub\.com\/+xem-phim\//i.test(String(url || ''));
  }
}

function extractAttr(tag = '', name = '') {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(tag.match(new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '').trim();
}

function addParsedEpisode(episodes, episodeNumber, serverNumber, rawLink, type = 'embed', rawLabel = '') {
  if (!episodeNumber) return;
  const link = decodeHtml(String(rawLink || '').replace(/&amp;/g, '&')).trim();
  if (!link || isBlvietsubWatchUrl(link)) return;
  try {
    new URL(link);
  } catch {
    return;
  }
  const normalizedLink = link.replace(/\/+$/, '');
  // short.icu no longer resolves publicly; persisting these links creates a
  // server that can never start playback.
  if (/^https?:\/\/(?:[^/]+\.)?short\.icu(?:\/|$)/i.test(normalizedLink)) return;
  for (const existing of episodes.values()) {
    const existingLink = (existing.link_embed || existing.link_m3u8 || '').replace(/\/+$/, '');
    if (existing.episode_number === episodeNumber && existingLink === normalizedLink) return;
  }
  const serverName = `SV ${serverNumber || 1}`;
  const key = `${serverName}|${episodeNumber}`;
  if (episodes.has(key)) return;
  const isHls = type.toLowerCase() === 'm3u8' || /\.m3u8(?:[?#].*)?$/i.test(link);
  const info = parseEpisodeInfo(rawLabel || episodeNumber);
  episodes.set(key, {
    episode_number: episodeNumber,
    episode_name: info.label,
    slug: info.slug,
    server_name: serverName,
    link_embed: isHls ? '' : link,
    link_m3u8: isHls ? link : '',
  });
}

function parseStreamingServerEpisodes(html = '') {
  const episodes = new Map();
  const perEpisodeCount = new Map();
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*\bstreaming-server\b[^"']*["'][^>]*>/gi)) {
    const tag = match[0];
    const link = extractAttr(tag, 'data-link');
    const type = extractAttr(tag, 'data-type') || 'embed';
    const episodeId = extractAttr(tag, 'data-id');
    const info = parseEpisodeInfo(episodeId);
    const episodeNumber = info.number;
    if (!episodeNumber || !link) continue;
    const nextServer = (perEpisodeCount.get(episodeNumber) || 0) + 1;
    perEpisodeCount.set(episodeNumber, nextServer);
    addParsedEpisode(episodes, episodeNumber, nextServer, link, type, episodeId);
  }
  // Modern BLVietsub pages expose the same player links twice: structured
  // streaming-server nodes and legacy blv-episode-btn buttons. The legacy
  // buttons have no stable server index, so counting them globally creates
  // SV 1..84 singleton duplicates. Only use them for older pages that do not
  // contain the structured representation.
  if (episodes.size > 0) return episodes;
  const legacyPerEpisodeCount = new Map();
  for (const match of html.matchAll(/<button\b[^>]*class=["'][^"']*\bblv-episode-btn\b[^"']*["'][^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0];
    const link = extractAttr(tag, 'data-url');
    const label = stripTags(tag);
    const info = parseEpisodeInfo(label);
    if (!info.number || !link) continue;
    const serverNumber = (legacyPerEpisodeCount.get(info.number) || 0) + 1;
    legacyPerEpisodeCount.set(info.number, serverNumber);
    addParsedEpisode(episodes, info.number, serverNumber, link, 'embed', label);
  }
  return episodes;
}

function getWatchUrls(html = '', movieSlug = '') {
  const urls = new Map();
  if (!movieSlug) return [];
  const escapedSlug = movieSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const absolutePattern = new RegExp(`https?:\\/\\/blvietsub\\.com\\/+(?:xem-phim)\\/${escapedSlug}\\/tap-([a-z0-9-]+)-sv-([0-9]+)`, 'gi');
  const relativePattern = new RegExp(`(?:^|["'\\s])((?:\\/\\/?)?xem-phim\\/${escapedSlug}\\/tap-([a-z0-9-]+)-sv-([0-9]+))`, 'gi');

  const addUrl = (episodeToken, serverNumber, rawLink) => {
    const episodeNumber = parseEpisodeToken(episodeToken);
    if (!episodeNumber) return;
    const link = normalizeBlvietsubWatchUrl(rawLink);
    if (!link) return;
    urls.set(`${episodeNumber}|${serverNumber || 1}`, { episodeNumber, serverNumber: serverNumber || 1, url: link });
  };

  for (const match of html.matchAll(absolutePattern)) addUrl(match[1] || '', Number(match[2] || 1), match[0]);
  for (const match of html.matchAll(relativePattern)) addUrl(match[2] || '', Number(match[3] || 1), match[1]);
  return [...urls.values()].sort((a, b) => a.episodeNumber - b.episodeNumber || a.serverNumber - b.serverNumber);
}

function parseEpisodes(html = '', movieSlug = '') {
  const episodes = parseStreamingServerEpisodes(html);
  return [...episodes.values()].sort((a, b) => a.episode_number - b.episode_number || a.server_name.localeCompare(b.server_name));
}

function firstWatchUrl(html, movieSlug) {
  return getWatchUrls(html, movieSlug)[0]?.url || '';
}

async function fetchText(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: BLVIETSUB_HEADERS, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export function parseMoviePage(movieUrl, updatedAt, html, playerHtml = '') {
  const movieSlug = getMovieSlug(movieUrl);
  if (!movieSlug) return null;
  const title =
    getMetaContent(html, 'og:title').replace(/\s*-\s*BLVietsub\s*$/i, '') ||
    stripTags(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)) ||
    stripTags(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)).replace(/\s*-\s*BLVietsub\s*$/i, '');
  const image = getMetaContent(html, 'og:image');
  const content = getMetaContent(html, 'og:description');
  const postId = firstMatch(html, /https?:\/\/blvietsub\.com\/\?p=(\d+)/i) || movieSlug;
  const episodes = parseEpisodes(`${html}\n${playerHtml}`, movieSlug);
  if (!title || episodes.length === 0) return null;
  const maxEpisode = maxPlayableEpisodeNumber(episodes);
  return {
    postId,
    title,
    originName: '',
    content,
    image,
    year: Number(html.match(/\b((?:19|20)\d{2})\b/)?.[1] || 0) || new Date(updatedAt || Date.now()).getFullYear(),
    category: [
      { id: 'bl-gl', name: 'BL / GL', slug: 'bl-gl' },
      { id: 'dam-my', name: 'Đam mỹ', slug: 'dam-my' },
    ],
    country: [],
    type: maxEpisode > 1 ? 'phim-bo' : 'phim-le',
    status: 'ongoing',
    sourceUrl: movieUrl,
    updatedAt: updatedAt || getMetaContent(html, 'article:modified_time') || new Date().toISOString(),
    episodes,
  };
}

export async function fetchMovieEntry(movieUrl, updatedAt = '', fallback = {}) {
  const html = await fetchText(movieUrl, 22000);
  const movieSlug = getMovieSlug(movieUrl);
  const watchUrls = getWatchUrls(html, movieSlug);
  const playerPages = [];
  const seenWatchUrls = new Set();
  for (let index = 0; index < watchUrls.length && index < 120; index += 4) {
    const batch = watchUrls.slice(index, Math.min(index + 4, 120)).filter((item) => {
      if (seenWatchUrls.has(item.url)) return false;
      seenWatchUrls.add(item.url);
      return true;
    });
    const pages = await Promise.all(batch.map(async (item) => {
      try {
        const page = await fetchText(item.url, 22000);
        for (const discovered of getWatchUrls(page, movieSlug)) {
          if (!seenWatchUrls.has(discovered.url) && watchUrls.length < 120) watchUrls.push(discovered);
        }
        return page;
      } catch {
        return '';
      }
    }));
    playerPages.push(...pages.filter(Boolean));
  }
  const playerHtml = playerPages.join('\n');
  const entry = parseMoviePage(movieUrl, updatedAt, html, playerHtml);
  if (entry && !entry.originName && fallback.originName) entry.originName = fallback.originName;
  if (entry && !entry.title && fallback.title) entry.title = fallback.title;
  return entry;
}

export async function fetchEntries({ feedUrl = DEFAULT_FEED_URL, limit = 10, offset = 0, concurrency = 3 } = {}) {
  const errors = [];
  let sitemapUrls = [];
  try {
    const sitemap = await fetchText(feedUrl, 30000);
    sitemapUrls = parseSitemap(sitemap);
    if (sitemapUrls.length === 0) {
      const sitemapIndexUrls = parseSitemapIndex(sitemap);
      for (const sitemapItem of sitemapIndexUrls.slice(0, 8)) {
        try {
          const childSitemap = await fetchText(sitemapItem.url, 30000);
          sitemapUrls.push(...parseSitemap(childSitemap));
        } catch (error) {
          errors.push(`sitemap child ${sitemapItem.url}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    errors.push(`sitemap: ${error.message}`);
  }
  const discoveryUrls = uniqMovieUrls([
    ...(await searchBlvietsubMovieUrls()),
    ...(await fetchDiscoveryPageMovieUrls()),
    ...sitemapUrls.slice(0, PRIORITY_SITEMAP_LIMIT),
  ]);
  const cursorUrls = sitemapUrls.slice(offset, offset + limit);
  const urls = uniqMovieUrls(offset > 0 ? [...cursorUrls, ...discoveryUrls] : [...discoveryUrls, ...cursorUrls]).slice(0, limit);
  const allUrls = uniqMovieUrls([...discoveryUrls, ...sitemapUrls]);
  const entries = [];
  for (let index = 0; index < urls.length; index += concurrency) {
    const batch = urls.slice(index, index + concurrency);
    const parsed = await Promise.all(batch.map(async (item) => {
      try {
        return await fetchMovieEntry(item.url, item.updatedAt, item);
      } catch (error) {
        errors.push(`${item.url}: ${error.message}`);
        return null;
      }
    }));
    for (const entry of parsed) {
      if (entry) entries.push(entry);
    }
  }
  return { entries, urls, errors, total: allUrls.length };
}

async function fetchExistingMovies(supabase) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('movies')
      .select('id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, source_url, episode_current, current_episode, total_episodes, year')
      .or('source_site.ilike.%admin-queer%,source_site.ilike.%blvietsub%,source_name.ilike.%blvietsub%,showtimes.ilike.%blvietsub.com%,source_url.ilike.%blvietsub.com%')
      .range(from, from + 999);
    if (error) throw new Error(`movies select: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function buildMovieIndexes(movies) {
  const byPostId = new Map();
  const bySourceUrl = new Map();
  const bySlug = new Map();
  const byTitle = new Map();
  const byCompactTitle = new Map();
  for (const movie of movies) {
    const source = String(movie.showtimes || movie.source_url || '');
    const postId = source.match(/(?:p=|post-|blvietsub-)([^/?#&]+)/)?.[1] || '';
    if (postId) byPostId.set(postId, movie);
    for (const sourceUrl of [movie.showtimes, movie.source_url].map((value) => String(value || '').trim()).filter(Boolean)) {
      bySourceUrl.set(sourceUrl.replace(/\/+$/, ''), movie);
    }
    if (movie.slug) bySlug.set(movie.slug, movie);
    for (const title of [movie.name, movie.origin_name, movie.title_vi, movie.title_en]) {
      const key = canonicalDuplicateTitle(title);
      if (key && !byTitle.has(key)) byTitle.set(key, movie);
    }
    for (const key of getMovieCompactTitleKeys(movie)) {
      const candidates = byCompactTitle.get(key) || [];
      candidates.push(movie);
      byCompactTitle.set(key, candidates);
    }
  }
  return { byPostId, bySourceUrl, bySlug, byTitle, byCompactTitle };
}

function findMovie(entry, indexes) {
  const canonicalCandidates = new Map();
  for (const key of getEntryCompactTitleKeys(entry)) {
    for (const movie of indexes.byCompactTitle.get(key) || []) {
      if (hasCompatibleYear(entry.year, movie.year)) canonicalCandidates.set(movie.id, movie);
    }
  }
  const canonicalMatch = selectPreferredMovie([...canonicalCandidates.values()]);
  if (canonicalMatch) return canonicalMatch;

  const generatedSlug = `blvietsub-${entry.postId}-${slugify(entry.title)}`;
  const sourceUrlKey = String(entry.sourceUrl || '').replace(/\/+$/, '');
  if (indexes.byPostId.has(entry.postId)) return indexes.byPostId.get(entry.postId);
  if (sourceUrlKey && indexes.bySourceUrl.has(sourceUrlKey)) return indexes.bySourceUrl.get(sourceUrlKey);
  if (indexes.bySlug.has(generatedSlug)) return indexes.bySlug.get(generatedSlug);
  const key = canonicalDuplicateTitle(entry.title);
  return indexes.byTitle.get(key) || null;
}

async function createMovie(supabase, entry) {
  const episodeCount = Math.max(1, playableEpisodeCount(entry.episodes));
  const slug = `blvietsub-${entry.postId}-${slugify(entry.title)}`;
  const payload = {
    slug,
    name: entry.title,
    origin_name: entry.originName,
    title_vi: entry.title,
    title_en: '',
    title_original: entry.originName,
    normalized_name: slugify([entry.title, entry.originName].filter(Boolean).join(' ')),
    content: entry.content,
    type: entry.type,
    status: entry.status,
    thumb_url: entry.image,
    poster_url: entry.image,
    quality: 'HD',
    lang: 'Vietsub',
    time: '',
    episode_current: `${TAP_LABEL} ${episodeCount}`,
    episode_total: '',
    current_episode: episodeCount,
    total_episodes: episodeCount,
    year: entry.year || new Date().getFullYear(),
    actor: [],
    director: [],
    category: entry.category,
    country: entry.country,
    trailer_url: '',
    notify: '',
    showtimes: entry.sourceUrl,
    source_url: entry.sourceUrl,
    source_site: SOURCE_SITE,
    source_name: SOURCE_NAME,
    ophim_id: '',
    is_published: true,
    last_synced_at: new Date().toISOString(),
    schedule_timezone: 'Asia/Ho_Chi_Minh',
  };

  const selectFields = 'id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, source_url, episode_current, current_episode, total_episodes, year';
  async function selectExistingMovieAfterDuplicate() {
    const directChecks = [
      ['slug', slug],
      ['showtimes', entry.sourceUrl],
      ['source_url', entry.sourceUrl],
    ].filter(([, value]) => String(value || '').trim());

    for (const [column, value] of directChecks) {
      const { data } = await supabase
        .from('movies')
        .select(selectFields)
        .eq(column, value)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data;
    }

    if (entry.postId) {
      for (const column of ['showtimes', 'source_url']) {
        const { data } = await supabase
          .from('movies')
          .select(selectFields)
          .ilike(column, `%${entry.postId}%`)
          .limit(1)
          .maybeSingle();
        if (data?.id) return data;
      }
    }

    for (const title of [entry.title, entry.originName].filter(Boolean)) {
      for (const column of ['name', 'origin_name', 'title_vi', 'title_en']) {
        let query = supabase
          .from('movies')
          .select(selectFields)
          .eq(column, title)
          .limit(1);
        if (entry.year) query = query.eq('year', entry.year);
        const { data } = await query.maybeSingle();
        if (data?.id) return data;
      }
    }

    return null;
  }

  const { data, error } = await supabase
    .from('movies')
    .insert(payload)
    .select(selectFields)
    .single();
  if (error) {
    if (error.code === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) {
      const existing = await selectExistingMovieAfterDuplicate();
      if (existing) return existing;
    }
    throw new Error(`movies insert ${slug}: ${error.message}`);
  }
  return data;
}

async function updateMovie(supabase, movie, entry) {
  const current = getMovieCurrentEpisode(movie);
  const existingTotal = Number(movie.total_episodes || 0) || 0;
  const syncedEpisodeCount = Math.max(1, maxPlayableEpisodeNumber(entry.episodes), playableEpisodeCount(entry.episodes));
  const episodeCount = syncedEpisodeCount || Math.max(current, existingTotal);
  const payload = {
    showtimes: entry.sourceUrl,
    source_url: entry.sourceUrl,
    last_synced_at: new Date().toISOString(),
    ...(entry.image ? { thumb_url: entry.image, poster_url: entry.image } : {}),
    episode_current: `${TAP_LABEL} ${episodeCount}`,
    current_episode: episodeCount,
    total_episodes: episodeCount,
  };
  if (current === episodeCount && Number(movie.total_episodes || 0) === episodeCount) {
    delete payload.episode_current;
    delete payload.current_episode;
    delete payload.total_episodes;
  }
  const { error } = await supabase.from('movies').update(payload).eq('id', movie.id);
  if (error) throw new Error(`movies update ${movie.slug}: ${error.message}`);
}

async function insertMissingEpisodes(supabase, movie, entry) {
  const { data, error } = await supabase
    .from('movie_episodes')
    .select('id, episode_number, episode_name, slug, server_name, link_embed, link_m3u8')
    .eq('movie_id', movie.id)
    .abortSignal(AbortSignal.timeout(20_000));
  if (error) throw new Error(`movie_episodes select ${movie.slug}: ${error.message}`);

  const existingRows = data || [];
  const existing = new Map(existingRows.map((row) => [`${String(row.server_name || '').trim()}|${Number(row.episode_number || 0)}`, row]));
  const linkMatchedRows = new Map();
  for (const row of existingRows) {
    const link = String(row.link_embed || row.link_m3u8 || '').replace(/\/+$/, '');
    const serverName = String(row.server_name || '').trim();
    if (link && serverName) linkMatchedRows.set(`${serverName}|${link}`, row);
  }
  let relabeled = 0;
  for (const episode of entry.episodes) {
    if (existing.has(`${episode.server_name}|${episode.episode_number}`)) continue;
    const link = String(episode.link_embed || episode.link_m3u8 || '').replace(/\/+$/, '');
    const row = linkMatchedRows.get(`${episode.server_name}|${link}`);
    if (!row) continue;
    const { error: relabelError } = await supabase
      .from('movie_episodes')
      .update({
        episode_number: episode.episode_number,
        episode_name: episode.episode_name,
        slug: episode.slug,
        link_embed: episode.link_embed || '',
        link_m3u8: episode.link_m3u8 || '',
      })
      .eq('id', row.id);
    if (relabelError) throw new Error(`movie_episodes relabel ${movie.slug}: ${relabelError.message}`);
    existing.delete(`${String(row.server_name || '').trim()}|${Number(row.episode_number || 0)}`);
    existing.set(`${episode.server_name}|${episode.episode_number}`, { ...row, ...episode });
    relabeled += 1;
  }
  const rows = entry.episodes
    .filter((episode) => !existing.has(`${episode.server_name}|${episode.episode_number}`))
    .map((episode) => ({
      movie_id: movie.id,
      episode_number: episode.episode_number,
      episode_name: episode.episode_name,
      slug: episode.slug,
      server_name: episode.server_name,
      link_m3u8: episode.link_m3u8 || '',
      link_embed: episode.link_embed,
      subtitle_url: '',
      thumbnail_url: '',
      duration: '',
      source: SOURCE_SITE,
      is_backup: false,
    }));
  let repaired = relabeled;
  for (const episode of entry.episodes) {
    const row = existing.get(`${episode.server_name}|${episode.episode_number}`);
    if (!row) continue;
    const nextEmbed = episode.link_embed || '';
    const nextHls = episode.link_m3u8 || '';
    const currentEmbed = String(row.link_embed || '');
    const currentHls = String(row.link_m3u8 || '');
    if (!isBlvietsubWatchUrl(currentEmbed) && (currentEmbed || currentHls)) continue;
    if (currentEmbed === nextEmbed && currentHls === nextHls) continue;
    const { error: updateError } = await supabase
      .from('movie_episodes')
      .update({ link_embed: nextEmbed, link_m3u8: nextHls })
      .eq('id', row.id);
    if (updateError) throw new Error(`movie_episodes repair ${movie.slug}: ${updateError.message}`);
    repaired += 1;
  }
  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('movie_episodes')
      .upsert(rows, { onConflict: 'movie_id,server_name,episode_number' });
    if (insertError) throw new Error(`movie_episodes upsert ${movie.slug}: ${insertError.message}`);
  }
  return rows.length + repaired;
}

async function writeSyncLog(supabase, payload) {
  try {
    await supabase.from('sync_logs').insert({
      function_name: 'external-sync-blvietsub',
      run_at: new Date().toISOString(),
      scanned: payload.scanned,
      added: payload.created,
      skipped: payload.matched,
      errors: payload.errors?.length || 0,
      details: payload.errors,
      elapsed_ms: payload.elapsed_ms,
      success: !payload.errors?.length,
    });
  } catch {
    // sync_logs is optional.
  }
}

async function readCursorOffset(supabase, cursorKey, limit) {
  if (!cursorKey) return 0;
  const { data, error } = await supabase
    .from('sync_cursors')
    .select('page')
    .eq('key', cursorKey)
    .maybeSingle();
  if (error) throw new Error(`sync_cursors select ${cursorKey}: ${error.message}`);
  const page = Math.max(1, Number(data?.page || 1) || 1);
  return (page - 1) * limit;
}

async function advanceCursor(supabase, cursorKey, { limit, offset, scanned, total }) {
  if (!cursorKey || !scanned) return;
  const nextOffset = offset + scanned >= total ? 0 : offset + limit;
  const nextPage = Math.floor(nextOffset / limit) + 1;
  const { error } = await supabase
    .from('sync_cursors')
    .upsert({ key: cursorKey, page: nextPage, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`sync_cursors upsert ${cursorKey}: ${error.message}`);
}

export function makeSupabaseClient({ supabaseUrl, serviceRoleKey }) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export async function runBlvietsubSync({
  supabase,
  supabaseUrl = '',
  feedUrl = DEFAULT_FEED_URL,
  limit = 10,
  offset = 0,
  useCursor = false,
  cursorKey = 'blvietsub_sitemap_external',
  concurrency = 3,
  movieUrl = '',
  dryRun = false,
  refreshSearch = false,
} = {}) {
  const started = Date.now();
  const errors = [];
  const transientErrors = [];
  let singleEntry = null;

  if (movieUrl) {
    let entry = null;
    try {
      entry = await fetchMovieEntry(movieUrl);
    } catch (error) {
      if (isTransientExternalFetchError(error)) {
        transientErrors.push(`${movieUrl}: ${error.message}`);
      } else {
        throw error;
      }
    }
    if (dryRun || !supabase) {
      return {
        success: Boolean(entry),
        dry_run: true,
        movie_url: movieUrl,
        title: entry?.title || '',
        episodes: entry?.episodes.length || 0,
        distinct_episodes: entry ? playableEpisodeCount(entry.episodes) : 0,
        servers: entry ? [...new Set(entry.episodes.map((episode) => episode.server_name))] : [],
        transient_errors: transientErrors,
        elapsed_ms: Date.now() - started,
      };
    }
    singleEntry = entry;
  }

  let effectiveOffset = offset;
  if (useCursor && supabase) {
    effectiveOffset = await readCursorOffset(supabase, cursorKey, limit);
  }

  const fetched = singleEntry
    ? { entries: [singleEntry], urls: [{ url: movieUrl, updatedAt: singleEntry.updatedAt }], errors: [], total: 1 }
    : await fetchEntries({
        feedUrl,
        limit,
        offset: effectiveOffset,
        concurrency,
      });
  const { entries, urls, errors: fetchErrors, total } = fetched;
  for (const error of fetchErrors) {
    if (isTransientExternalFetchError(error)) transientErrors.push(error);
    else errors.push(error);
  }

  if (dryRun || !supabase) {
    return {
      success: errors.length === 0,
      dry_run: true,
      offset: effectiveOffset,
      scanned: urls.length,
      total_urls: total,
      parsed: entries.length,
      sample: entries.slice(0, 5).map((entry) => ({
        title: entry.title,
        source_url: entry.sourceUrl,
        episodes: entry.episodes.length,
        distinct_episodes: playableEpisodeCount(entry.episodes),
      })),
      errors,
      transient_errors: transientErrors.slice(0, 20),
      transient_skipped: transientErrors.length,
      elapsed_ms: Date.now() - started,
    };
  }

  const existingMovies = await fetchExistingMovies(supabase);
  const indexes = buildMovieIndexes(existingMovies);
  let matched = 0;
  let created = 0;
  let insertedEpisodes = 0;
  let updated = 0;

  for (const entry of entries) {
    try {
      let movie = findMovie(entry, indexes);
      if (!movie) {
        movie = await createMovie(supabase, entry);
        created += 1;
        existingMovies.push(movie);
        Object.assign(indexes, buildMovieIndexes(existingMovies));
      } else {
        matched += 1;
        await updateMovie(supabase, movie, entry);
        updated += 1;
      }
      insertedEpisodes += await insertMissingEpisodes(supabase, movie, entry);
    } catch (error) {
      errors.push(`${entry.title}: ${error.message}`);
    }
  }

  let searchRefreshed = false;
  if (refreshSearch && supabaseUrl) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/search-index-proxy?limit=5000&refresh=1`);
      searchRefreshed = response.ok;
    } catch {
      searchRefreshed = false;
    }
  }

  const result = {
    success: errors.length === 0,
    offset: effectiveOffset,
    scanned: urls.length,
    total_urls: total,
    parsed: entries.length,
    matched,
    created,
    updated,
    inserted_episodes: insertedEpisodes,
    search_refreshed: searchRefreshed,
    errors,
    transient_errors: transientErrors.slice(0, 20),
    transient_skipped: transientErrors.length,
    elapsed_ms: Date.now() - started,
  };
  if (useCursor) {
    await advanceCursor(supabase, cursorKey, {
      limit,
      offset: effectiveOffset,
      scanned: urls.length,
      total,
    });
  }
  await writeSyncLog(supabase, result);
  return result;
}
