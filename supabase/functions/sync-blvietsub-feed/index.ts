import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FEED_URL = Deno.env.get('BLVIETSUB_FEED_URL') || 'https://blvietsub.com/ophim-sitemap.xml';
const BLVIETSUB_PROXY_URL = Deno.env.get('BLVIETSUB_PROXY_URL') || 'https://khophim.org/internal/blvietsub-proxy';
const DISCOVERY_URLS = [
  'https://blvietsub.com/',
  'https://blvietsub.com/phim/',
];
const DISCOVERY_QUERIES = [
  'deep in',
  'nhap hi',
  'nhập hí',
];
const PRIORITY_SITEMAP_LIMIT = 40;
const SOURCE_SITE = 'blvietsub';
const SOURCE_NAME = 'BLVietsub';
const TAP_LABEL = 'T\u1eadp';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLVIETSUB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 KhoPhim-Sync/1.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  'Referer': 'https://blvietsub.com/',
};

type SupabaseClient = ReturnType<typeof createClient>;

interface BloggerEntry {
  id?: { $t?: string };
  title?: { $t?: string };
  content?: { $t?: string };
  published?: { $t?: string };
  updated?: { $t?: string };
  category?: Array<{ term?: string }>;
  link?: Array<{ rel?: string; href?: string }>;
}

interface BloggerFeedResponse {
  feed?: { entry?: BloggerEntry[] };
}

interface ParsedEpisode {
  episode_number: number;
  episode_name: string;
  slug: string;
  link_embed: string;
  link_m3u8?: string;
  server_name: string;
}

interface MovieRow {
  id: string;
  slug: string;
  name?: string | null;
  origin_name?: string | null;
  title_vi?: string | null;
  title_en?: string | null;
  source_site?: string | null;
  source_name?: string | null;
  showtimes?: string | null;
  source_url?: string | null;
  thumb_url?: string | null;
  poster_url?: string | null;
  episode_current?: string | null;
  current_episode?: number | null;
  total_episodes?: number | null;
  status?: string | null;
  year?: number | null;
}

interface ParsedEntry {
  postId: string;
  title: string;
  originName: string;
  aliasNames?: string[];
  content: string;
  image: string;
  year: number;
  type: string;
  status: string;
  category: Array<{ id: string; name: string; slug: string }>;
  country: Array<{ id: string; name: string; slug: string }>;
  sourceUrl: string;
  updatedAt: string;
  episodes: ParsedEpisode[];
}

interface WordPressMovieUrl {
  url: string;
  updatedAt: string;
  title?: string;
  originName?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function proxiedBlvietsubUrl(rawUrl: string): string {
  if (!BLVIETSUB_PROXY_URL) return rawUrl;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'blvietsub.com') return rawUrl;
    const proxy = new URL(BLVIETSUB_PROXY_URL);
    proxy.searchParams.set('url', url.toString());
    proxy.searchParams.set('fresh', '1');
    return proxy.toString();
  } catch {
    return rawUrl;
  }
}

async function fetchBlvietsubText(rawUrl: string, timeoutMs: number): Promise<string> {
  const candidates = Array.from(new Set([rawUrl, proxiedBlvietsubUrl(rawUrl)]));
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: BLVIETSUB_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        lastError = new Error(`${candidate} ${response.status}`);
        continue;
      }
      const text = await response.text();
      if (text.trim()) return text;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`BLVietsub fetch failed: ${rawUrl}`);
}

function normalizeText(value = ''): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value = ''): string {
  return normalizeText(value).replace(/\s+/g, '-') || 'phim';
}

function canonicalDuplicateTitle(value = ''): string {
  return normalizeText(value)
    .replace(/\b(18|19|20)\d{2}\b/g, ' ')
    .replace(/\b(tap|ep|episode|phan|season|trailer|vietsub|thuyet minh|long tieng|full|hd|fhd|4k)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueTextValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    const key = canonicalDuplicateTitle(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function stripTags(html = ''): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value = ''): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#038;/g, '&')
    .replace(/&hellip;/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(html = '', pattern: RegExp): string {
  return pattern.exec(html)?.[1] || '';
}

function buildFeedPageUrl(startIndex: number, pageSize: number): string {
  const url = new URL(FEED_URL);
  url.searchParams.set('alt', 'json');
  url.searchParams.set('max-results', String(pageSize));
  url.searchParams.set('start-index', String(startIndex));
  return url.toString();
}

function getPostId(entry: BloggerEntry): string {
  return String(entry.id?.$t || '').match(/post-(\d+)/)?.[1] || '';
}

function getAlternateLink(entry: BloggerEntry): string {
  return entry.link?.find((link) => link.rel === 'alternate')?.href || '';
}

function getMetaContent(html = '', key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(
    firstMatch(html, new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i')) ||
    firstMatch(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')),
  );
}

function getOriginName(content = ''): string {
  return stripTags(
    content.match(/(?:T\u00ean kh\u00e1c|T\u00ean g\u1ed1c|Original name|Other name):\s*<\/?[^>]*>\s*<span>([\s\S]*?)<\/span>/i)?.[1] || '',
  );
}

function getSynopsis(content = ''): string {
  return stripTags(firstMatch(content, /<p id=["']synopsis["']>([\s\S]*?)<\/p>/i));
}

function getImage(entry: BloggerEntry): string {
  const content = entry.content?.$t || '';
  const image =
    firstMatch(content, /<img[^>]+src=["']([^"']+)["']/i) ||
    firstMatch(content, /background-image:\s*url\(["']?([^"')]+)["']?\)/i);
  return image.replace(/\/s\d+\//, '/s640/');
}

function getEntryYear(entry: BloggerEntry): number {
  const terms = entry.category?.map((item) => item.term || '') || [];
  const categoryYear = terms.find((term) => /^(19|20)\d{2}$/.test(term));
  const titleYear = entry.title?.$t?.match(/\b(19|20)\d{2}\b/)?.[0];
  return Number(categoryYear || titleYear || 0);
}

function inferServerName(rawServerName: string, embedUrl: string): string {
  const raw = rawServerName.trim();
  const upper = raw.toUpperCase();
  try {
    const host = new URL(embedUrl.replace(/&amp;/g, '&')).hostname.toLowerCase();
    if (upper === 'VK' && host.includes('ssplay')) return 'SS';
    if (['SS', 'HX', 'OK', 'DL', 'VK'].includes(upper)) return upper;
    if (host.includes('ssplay')) return 'SS';
    if (host.includes('ok.ru') || host.includes('odnoklassniki')) return 'OK';
    if (host.includes('vk.com') || host.includes('vkvideo')) return 'VK';
    if (host.includes('abyssplayer') || host.includes('short.icu')) return 'HX';
    if (host.includes('dailymotion')) return 'DM';
  } catch {
    // Keep the raw server label when the embed URL is not parseable.
  }
  return raw || SOURCE_NAME;
}

function getTerms(entry: BloggerEntry): string[] {
  return (entry.category || [])
    .map((item) => (item.term || '').trim())
    .filter(Boolean);
}

function buildTaxonomy(entry: BloggerEntry): {
  category: Array<{ id: string; name: string; slug: string }>;
  country: Array<{ id: string; name: string; slug: string }>;
  type: string;
  status: string;
} {
  const countryTerms = new Set([
    'Th\u00e1i Lan',
    'H\u00e0n Qu\u1ed1c',
    'Nh\u1eadt B\u1ea3n',
    'Trung Qu\u1ed1c',
    '\u0110\u00e0i Loan',
    'Vi\u1ec7t Nam',
    'M\u1ef9',
  ]);
  const skip = new Set(['BL', 'GL', 'LGBT', 'HD', 'Vietsub', SOURCE_NAME]);
  const terms = getTerms(entry);
  const isSingle = terms.some((term) => normalizeText(term) === 'phim le');
  const isCompleted = terms.some((term) => normalizeText(term).includes('hoan tat'));
  const countries = terms
    .filter((term) => countryTerms.has(term))
    .map((name) => ({ id: slugify(name), name, slug: slugify(name) }));
  const categories = terms
    .filter((term) => !countryTerms.has(term))
    .filter((term) => !skip.has(term))
    .filter((term) => !/^(19|20)\d{2}$/.test(term))
    .filter((term) => !/^Ep\b/i.test(term))
    .map((name) => ({ id: slugify(name), name, slug: slugify(name) }));

  const baseCategories = [
    { id: 'bl-gl', name: 'BL / GL', slug: 'bl-gl' },
    { id: 'dam-my', name: '\u0110am m\u1ef9', slug: 'dam-my' },
  ];
  const seen = new Set<string>();
  return {
    category: [...baseCategories, ...categories].filter((item) => {
      if (seen.has(item.slug)) return false;
      seen.add(item.slug);
      return true;
    }),
    country: countries,
    type: isSingle ? 'phim-le' : 'phim-bo',
    status: isCompleted ? 'completed' : 'ongoing',
  };
}

function parseEpisodes(content = ''): ParsedEpisode[] {
  const episodes = new Map<string, ParsedEpisode>();
  const serverBlocks = Array.from(content.matchAll(/<ul[^>]+id=["']([^"']+)["'][^>]*class=["']serverEpisode["'][^>]*>([\s\S]*?)<\/ul>/gi));
  const blocks = serverBlocks.length
    ? serverBlocks.map((match) => ({ serverName: match[1], html: match[2] }))
    : [{ serverName: SOURCE_NAME, html: content }];

  for (const block of blocks) {
    for (const match of block.html.matchAll(/data-embed=["']([^"']+)["'][\s\S]*?<span>([^<]+)<\/span>/gi)) {
      const embed = match[1].replace(/&amp;/g, '&').trim();
      const label = match[2].trim();
      const episodeNumber = Number(label.match(/\d+/)?.[0] || 0);
      if (!episodeNumber || !embed) continue;

      try {
        new URL(embed);
      } catch {
        continue;
      }

      const serverName = inferServerName(block.serverName, embed);
      const key = `${serverName}|${episodeNumber}`;
      if (episodes.has(key)) continue;
      episodes.set(key, {
        episode_number: episodeNumber,
        episode_name: `${TAP_LABEL} ${episodeNumber}`,
        slug: `tap-${episodeNumber}`,
        link_embed: embed,
        server_name: serverName,
      });
    }
  }
  return [...episodes.values()].sort((a, b) => a.episode_number - b.episode_number || a.server_name.localeCompare(b.server_name));
}

function parseEntry(entry: BloggerEntry): ParsedEntry | null {
  const postId = getPostId(entry);
  const content = entry.content?.$t || '';
  const episodes = parseEpisodes(content);
  if (!postId || episodes.length === 0) return null;
  const taxonomy = buildTaxonomy(entry);
  return {
    postId,
    title: entry.title?.$t || '',
    originName: getOriginName(content),
    content: getSynopsis(content),
    image: getImage(entry),
    year: getEntryYear(entry),
    ...taxonomy,
    sourceUrl: getAlternateLink(entry) || `https://www.blvietsub.top/?p=${postId}`,
    updatedAt: entry.updated?.$t || entry.published?.$t || new Date().toISOString(),
    episodes,
  };
}

function extractPostIdFromMovie(movie: MovieRow): string {
  return String(movie.showtimes || movie.slug || '').match(/(?:p=|post-|blvietsub-)(\d+)/)?.[1] || '';
}

function getMovieCurrentEpisode(movie: MovieRow): number {
  return Math.max(
    Number(movie.current_episode || 0),
    Number(String(movie.episode_current || '').match(/\d+/)?.[0] || 0),
  );
}

function isCompletedText(value: unknown): boolean {
  const text = normalizeText(String(value || ''));
  return text.includes('completed') || text.includes('complete') || text.includes('hoan tat') || text.includes('full');
}

function shouldRoutineRepairMovie(movie: MovieRow, includeCompleted: boolean): boolean {
  if (includeCompleted) return true;
  const current = getMovieCurrentEpisode(movie);
  const total = Number(movie.total_episodes || 0);
  const looksCompleted = isCompletedText(movie.status) || isCompletedText(movie.episode_current);

  if (!looksCompleted) return true;
  if (!total) return true;
  return current > 0 && current < total;
}

function playableEpisodeCount(episodes: ParsedEpisode[]): number {
  return new Set(episodes.map((episode) => episode.episode_number).filter((episode) => episode > 0)).size;
}

function maxPlayableEpisodeNumber(episodes: ParsedEpisode[]): number {
  return episodes.reduce((max, episode) => Math.max(max, Number(episode.episode_number || 0)), 0);
}

function isTransientExternalFetchError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error || '');
  return /abort|timeout|timed out|signal|fetch failed|network|502|503|504|522|523|524/i.test(text);
}

function buildEntryIndexes(entries: ParsedEntry[]) {
  const byPostId = new Map<string, ParsedEntry>();
  const byTitle = new Map<string, ParsedEntry>();
  for (const entry of entries) {
    byPostId.set(entry.postId, entry);
    for (const key of uniqueTextValues([entry.title, entry.originName, ...(entry.aliasNames || [])]).map(canonicalDuplicateTitle).filter(Boolean)) {
      if (!byTitle.has(key)) byTitle.set(key, entry);
    }
  }
  return { byPostId, byTitle };
}

function getMovieTitleKeys(movie: MovieRow): string[] {
  return [movie.name, movie.origin_name, movie.title_vi, movie.title_en]
    .map((value) => canonicalDuplicateTitle(value || ''))
    .filter(Boolean);
}

function findEntryForMovie(
  movie: MovieRow,
  indexes: ReturnType<typeof buildEntryIndexes>,
): ParsedEntry | null {
  const postId = extractPostIdFromMovie(movie);
  if (postId && indexes.byPostId.has(postId)) return indexes.byPostId.get(postId) || null;

  for (const key of [movie.name, movie.origin_name, movie.title_vi, movie.title_en].map((value) => canonicalDuplicateTitle(value || '')).filter(Boolean)) {
    const entry = indexes.byTitle.get(key);
    if (entry) return entry;
  }
  return null;
}

function buildMovieIndexes(movies: MovieRow[]) {
  const byPostId = new Map<string, MovieRow>();
  const byTitle = new Map<string, MovieRow>();
  const bySlug = new Map<string, MovieRow>();
  const bySourceUrl = new Map<string, MovieRow>();

  for (const movie of movies) {
    bySlug.set(movie.slug, movie);
    const postId = extractPostIdFromMovie(movie);
    if (postId) byPostId.set(postId, movie);
    for (const sourceUrl of [movie.showtimes, movie.source_url].map((value) => String(value || '').trim()).filter(Boolean)) {
      const normalizedSourceUrl = sourceUrl.replace(/\/+$/, '');
      const existing = bySourceUrl.get(normalizedSourceUrl);
      const isAdminQueer = String(movie.source_site || '').includes('admin-queer');
      const existingIsAdminQueer = String(existing?.source_site || '').includes('admin-queer');
      if (!existing || (isAdminQueer && !existingIsAdminQueer)) bySourceUrl.set(normalizedSourceUrl, movie);
    }
    for (const key of getMovieTitleKeys(movie)) {
      if (!byTitle.has(key)) byTitle.set(key, movie);
    }
  }

  return { byPostId, byTitle, bySlug, bySourceUrl };
}

async function fetchExistingQueerMovies(supabase: SupabaseClient): Promise<MovieRow[]> {
  const rows: MovieRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 10000; from += pageSize) {
    const { data, error } = await supabase
      .from('movies')
      .select('id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, source_url, thumb_url, poster_url, episode_current, current_episode, total_episodes, year')
      .eq('is_published', true)
      .or('source_site.ilike.%admin-queer%,source_site.ilike.%blvietsub%,source_name.ilike.%blvietsub%')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`movies select: ${error.message}`);
    const batch = (data || []) as MovieRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function fetchBloggerEntries(limit: number, pageSize: number, offset: number): Promise<ParsedEntry[]> {
  const entries: ParsedEntry[] = [];
  const seen = new Set<string>();
  for (let startIndex = offset + 1; entries.length < limit; startIndex += pageSize) {
    const feedResponse = await fetch(buildFeedPageUrl(startIndex, pageSize), {
      headers: BLVIETSUB_HEADERS,
      signal: AbortSignal.timeout(25000),
    });
    if (!feedResponse.ok) throw new Error(`BLVietsub feed ${feedResponse.status}`);

    const feed = (await feedResponse.json()) as BloggerFeedResponse;
    const rawEntries = feed.feed?.entry || [];
    if (rawEntries.length === 0) break;

    for (const parsed of rawEntries.map(parseEntry).filter(Boolean) as ParsedEntry[]) {
      if (seen.has(parsed.postId)) continue;
      seen.add(parsed.postId);
      entries.push(parsed);
      if (entries.length >= limit) break;
    }

    if (rawEntries.length < pageSize) break;
  }
  return entries;
}

function parseWordPressSitemap(xml = ''): WordPressMovieUrl[] {
  const urls: WordPressMovieUrl[] = [];
  for (const match of xml.matchAll(/<url>\s*<loc>([\s\S]*?)<\/loc>(?:[\s\S]*?<lastmod>([\s\S]*?)<\/lastmod>)?[\s\S]*?<\/url>/gi)) {
    const url = decodeHtml(match[1]);
    if (!/^https?:\/\/blvietsub\.com\/phim\/[^/]+\/?$/i.test(url)) continue;
    urls.push({ url: url.replace(/^http:\/\//i, 'https://'), updatedAt: decodeHtml(match[2] || '') });
  }
  return urls;
}

function uniqWordPressMovieUrls(items: Array<WordPressMovieUrl | string>): WordPressMovieUrl[] {
  const seen = new Set<string>();
  const urls: WordPressMovieUrl[] = [];
  for (const item of items) {
    const rawUrl = typeof item === 'string' ? item : item.url;
    const url = String(rawUrl || '').replace(/^http:\/\//i, 'https://').replace(/\/+$/, '/');
    if (!/^https:\/\/blvietsub\.com\/phim\/[^/]+\/$/i.test(url) || seen.has(url)) continue;
    if (/\/phim\/(?:feed|page)\/$/i.test(url)) continue;
    seen.add(url);
    urls.push({
      url,
      updatedAt: typeof item === 'string' ? '' : item.updatedAt || '',
      title: typeof item === 'string' ? '' : item.title || '',
      originName: typeof item === 'string' ? '' : item.originName || '',
    });
  }
  return urls;
}

function parseWordPressMovieUrlsFromHtml(html = ''): WordPressMovieUrl[] {
  const urls: WordPressMovieUrl[] = [];
  for (const match of html.matchAll(/href=["']([^"']*\/phim\/[^"']+)["']/gi)) {
    const raw = decodeHtml(match[1]).trim();
    let url = raw;
    if (url.startsWith('//')) url = `https:${url}`;
    if (url.startsWith('/')) url = `https://blvietsub.com${url}`;
    if (!/^https?:\/\/blvietsub\.com\/phim\/[^/?#]+\/?(?:[?#].*)?$/i.test(url)) continue;
    url = url.split(/[?#]/)[0].replace(/^http:\/\//i, 'https://').replace(/\/?$/, '/');
    urls.push({ url, updatedAt: '' });
  }
  return uniqWordPressMovieUrls(urls);
}

async function fetchDiscoveryPageMovieUrls(): Promise<WordPressMovieUrl[]> {
  const urls: WordPressMovieUrl[] = [];
  for (const discoveryUrl of DISCOVERY_URLS) {
    try {
      urls.push(...parseWordPressMovieUrlsFromHtml(await fetchBlvietsubText(discoveryUrl, 18000)));
    } catch {
      // Discovery is best-effort; a temporary BLVietsub block must not break sitemap sync.
    }
  }
  return uniqWordPressMovieUrls(urls);
}

async function searchBlvietsubMovieUrls(keywords = DISCOVERY_QUERIES): Promise<WordPressMovieUrl[]> {
  const urls: WordPressMovieUrl[] = [];
  for (const keyword of keywords.map((value) => value.trim()).filter(Boolean)) {
    try {
      const body = new URLSearchParams({ action: 'search_film', keyword, limit: '20' });
      const response = await fetch('https://blvietsub.com/wp-admin/admin-ajax.php', {
        method: 'POST',
        headers: {
          ...BLVIETSUB_HEADERS,
          'Accept': 'application/json,text/plain,*/*',
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
            updatedAt: '',
            title: stripTags(String(item?.title || '')),
            originName: stripTags(String(item?.original_title || '')),
          });
        }
      }
    } catch {
      // Keep sync resilient when BLVietsub search rate-limits or times out.
    }
  }
  return uniqWordPressMovieUrls(urls);
}

async function fetchWordPressSearchAlias(movieUrl: string, title = ''): Promise<WordPressMovieUrl | null> {
  const movieSlug = getWordPressMovieSlug(movieUrl);
  const slugKeyword = movieSlug.replace(/-/g, ' ');
  const compactSlugKeyword = movieSlug
    .split(/[-\s]+/)
    .filter((part) => part.length > 2)
    .slice(0, 5)
    .join(' ');
  const keywords = uniqueTextValues([title, slugKeyword, compactSlugKeyword]);
  if (keywords.length === 0) return null;

  const normalizedTarget = normalizeSourceUrl(movieUrl).replace(/\/+$/, '');
  const matches = await searchBlvietsubMovieUrls(keywords);
  return matches.find((item) => normalizeSourceUrl(item.url).replace(/\/+$/, '') === normalizedTarget) || null;
}

function getWordPressMovieSlug(movieUrl: string): string {
  return movieUrl.match(/\/phim\/([^/]+)\/?$/i)?.[1] || '';
}

function normalizeBlvietsubWatchUrl(rawLink = ''): string {
  let link = rawLink.replace(/^http:\/\//i, 'https://').replace(/&amp;/g, '&').trim();
  if (!link) return '';
  if (link.startsWith('//')) link = `https:${link}`;
  if (link.startsWith('/')) link = `https://blvietsub.com${link}`;
  if (!/^https?:\/\//i.test(link)) link = `https://blvietsub.com/${link.replace(/^\/+/, '')}`;
  return link;
}

function isBlvietsubWatchUrl(rawUrl = ''): boolean {
  const value = rawUrl.replace(/&amp;/g, '&').trim();
  try {
    const url = new URL(value);
    return /(^|\.)blvietsub\.com$/i.test(url.hostname) && /\/+xem-phim\//i.test(url.pathname);
  } catch {
    return /blvietsub\.com\/+xem-phim\//i.test(value);
  }
}

function extractAttr(tag = '', name = ''): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(tag.match(new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '');
}

function addParsedEpisode(
  episodes: Map<string, ParsedEpisode>,
  episodeNumber: number,
  serverNumber: number,
  rawLink: string,
  type = 'embed',
): void {
  if (!episodeNumber) return;
  const link = decodeHtml(rawLink.replace(/&amp;/g, '&')).trim();
  if (!link || isBlvietsubWatchUrl(link)) return;
  try {
    new URL(link);
  } catch {
    return;
  }
  const normalizedLink = link.replace(/\/+$/, '');
  for (const existing of episodes.values()) {
    const existingLink = (existing.link_embed || existing.link_m3u8 || '').replace(/\/+$/, '');
    if (existing.episode_number === episodeNumber && existingLink === normalizedLink) return;
  }
  const serverName = `SV ${serverNumber || 1}`;
  const key = `${serverName}|${episodeNumber}`;
  if (episodes.has(key)) return;
  const isHls = type.toLowerCase() === 'm3u8' || /\.m3u8(?:[?#].*)?$/i.test(link);
  episodes.set(key, {
    episode_number: episodeNumber,
    episode_name: `${TAP_LABEL} ${episodeNumber}`,
    slug: `tap-${episodeNumber}`,
    link_embed: isHls ? '' : link,
    link_m3u8: isHls ? link : '',
    server_name: serverName,
  });
}

function parseStreamingServerEpisodes(html: string): Map<string, ParsedEpisode> {
  const episodes = new Map<string, ParsedEpisode>();
  const perEpisodeCount = new Map<number, number>();
  for (const match of html.matchAll(/<[^>]+class=["'][^"']*\bstreaming-server\b[^"']*["'][^>]*>/gi)) {
    const tag = match[0];
    const link = extractAttr(tag, 'data-link');
    const type = extractAttr(tag, 'data-type') || 'embed';
    const episodeId = extractAttr(tag, 'data-id');
    const episodeNumber = Number(episodeId.match(/\d+/)?.[0] || 0);
    if (!episodeNumber || !link) continue;
    const serverNumber = (perEpisodeCount.get(episodeNumber) || 0) + 1;
    perEpisodeCount.set(episodeNumber, serverNumber);
    addParsedEpisode(episodes, episodeNumber, serverNumber, link, type);
  }
  return episodes;
}

function getWordPressWatchUrls(html: string, movieSlug: string): Array<{ episodeNumber: number; serverNumber: number; url: string }> {
  const urls = new Map<string, { episodeNumber: number; serverNumber: number; url: string }>();
  const escapedSlug = movieSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const watchUrlPattern = new RegExp(`https?:\\/\\/blvietsub\\.com\\/+(?:xem-phim)\\/${escapedSlug}\\/tap-([0-9]+)-sv-([0-9]+)`, 'gi');
  const relativeWatchUrlPattern = new RegExp(`(?:^|["'\\s])((?:\\/\\/?)?xem-phim\\/${escapedSlug}\\/tap-([0-9]+)-sv-([0-9]+))`, 'gi');
  const addUrl = (episodeNumber: number, serverNumber: number, rawLink: string) => {
    if (!episodeNumber) return;
    const link = normalizeBlvietsubWatchUrl(rawLink);
    if (!link) return;
    urls.set(`${episodeNumber}|${serverNumber || 1}`, { episodeNumber, serverNumber: serverNumber || 1, url: link });
  };

  for (const match of html.matchAll(watchUrlPattern)) {
    addUrl(Number(match[1] || 0), Number(match[2] || 1), match[0]);
  }
  for (const match of html.matchAll(relativeWatchUrlPattern)) {
    addUrl(Number(match[2] || 0), Number(match[3] || 1), match[1]);
  }
  return [...urls.values()].sort((a, b) => a.episodeNumber - b.episodeNumber || a.serverNumber - b.serverNumber);
}

function parseWordPressEpisodes(html: string, movieSlug: string): ParsedEpisode[] {
  const episodes = parseStreamingServerEpisodes(html);
  return [...episodes.values()].sort((a, b) => a.episode_number - b.episode_number || a.server_name.localeCompare(b.server_name));
}

function firstWordPressWatchUrl(html: string, movieSlug: string): string {
  return getWordPressWatchUrls(html, movieSlug)[0]?.url || '';
}

function parseWordPressMoviePage(movieUrl: string, updatedAt: string, html: string, playerHtml = ''): ParsedEntry | null {
  const movieSlug = getWordPressMovieSlug(movieUrl);
  if (!movieSlug) return null;
  const title = getMetaContent(html, 'og:title')
    .replace(/\s*-\s*BLVietsub\s*$/i, '')
    || decodeHtml(stripTags(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)));
  const image = getMetaContent(html, 'og:image');
  const content = getMetaContent(html, 'og:description');
  const postId = firstMatch(html, /https?:\/\/blvietsub\.com\/\?p=(\d+)/i) || movieSlug;
  const episodes = parseWordPressEpisodes(`${html}\n${playerHtml}`, movieSlug);
  if (!title || episodes.length === 0) return null;
  const year = Number(html.match(/\b((?:19|20)\d{2})\b/)?.[1] || 0) || new Date(updatedAt || Date.now()).getFullYear();
  const maxEpisode = Math.max(...episodes.map((episode) => episode.episode_number));
  const taxonomy = {
    category: [
      { id: 'bl-gl', name: 'BL / GL', slug: 'bl-gl' },
      { id: 'dam-my', name: '\u0110am m\u1ef9', slug: 'dam-my' },
    ],
    country: [] as Array<{ id: string; name: string; slug: string }>,
    type: maxEpisode > 1 ? 'phim-bo' : 'phim-le',
    status: 'ongoing',
  };
  return {
    postId,
    title,
    originName: '',
    content,
    image,
    year,
    ...taxonomy,
    sourceUrl: movieUrl,
    updatedAt: updatedAt || getMetaContent(html, 'article:modified_time') || new Date().toISOString(),
    episodes,
  };
}

async function fetchWordPressPlayerPages(html: string, movieSlug: string): Promise<string> {
  const watchUrls = getWordPressWatchUrls(html, movieSlug);
  const seenWatchUrls = new Set<string>();
  const playerPages: string[] = [];
  for (let watchIndex = 0; watchIndex < watchUrls.length && watchIndex < 120; watchIndex += 4) {
    const batch = watchUrls.slice(watchIndex, Math.min(watchIndex + 4, 120)).filter((watch) => {
      if (seenWatchUrls.has(watch.url)) return false;
      seenWatchUrls.add(watch.url);
      return true;
    });
    const pages = await Promise.all(batch.map(async (watch) => {
      try {
        const pageHtml = await fetchBlvietsubText(watch.url, 20000);
        for (const discovered of getWordPressWatchUrls(pageHtml, movieSlug)) {
          if (!seenWatchUrls.has(discovered.url) && watchUrls.length < 120) watchUrls.push(discovered);
        }
        return pageHtml;
      } catch {
        return '';
      }
    }));
    for (const pageHtml of pages) {
      if (pageHtml) playerPages.push(pageHtml);
    }
  }
  return playerPages.join('\n');
}

async function fetchWordPressEntries(limit: number, offset: number): Promise<ParsedEntry[]> {
  const result = await fetchWordPressEntriesWithMeta(limit, offset);
  return result.entries;
}

async function fetchWordPressEntriesWithMeta(limit: number, offset: number): Promise<{ entries: ParsedEntry[]; scanned: number; total: number }> {
  let sitemapUrls: WordPressMovieUrl[] = [];
  try {
    sitemapUrls = parseWordPressSitemap(await fetchBlvietsubText(FEED_URL, 25000));
  } catch {
    // Continue with discovery URLs when the upstream sitemap is temporarily unreachable.
  }
  const discoveryUrls = uniqWordPressMovieUrls([
    ...(await searchBlvietsubMovieUrls()),
    ...(await fetchDiscoveryPageMovieUrls()),
    ...sitemapUrls.slice(0, PRIORITY_SITEMAP_LIMIT),
  ]);
  const cursorUrls = sitemapUrls.slice(offset, offset + limit);
  const urls = uniqWordPressMovieUrls([...discoveryUrls, ...cursorUrls]).slice(0, limit);
  const allUrls = uniqWordPressMovieUrls([...discoveryUrls, ...sitemapUrls]);
  const entries: ParsedEntry[] = [];
  const concurrency = 6;
  for (let index = 0; index < urls.length && entries.length < limit; index += concurrency) {
    const batch = urls.slice(index, index + concurrency);
    const parsed = await Promise.all(batch.map(async (item) => {
      try {
        const html = await fetchBlvietsubText(item.url, 20000);
        const movieSlug = getWordPressMovieSlug(item.url);
        const playerHtml = movieSlug ? await fetchWordPressPlayerPages(html, movieSlug) : '';
        const entry = parseWordPressMoviePage(item.url, item.updatedAt, html, playerHtml);
        if (entry && !entry.originName && item.originName) entry.originName = item.originName;
        if (entry && !entry.title && item.title) entry.title = item.title;
        if (entry) entry.aliasNames = uniqueTextValues([...(entry.aliasNames || []), item.title, item.originName]);
        return entry;
      } catch {
        return null;
      }
    }));
    for (const entry of parsed) {
      if (!entry) continue;
      entries.push(entry);
      if (entries.length >= limit) break;
    }
  }
  return { entries, scanned: urls.length, total: allUrls.length };
}

async function fetchSourceEntries(limit: number, pageSize: number, offset: number): Promise<ParsedEntry[]> {
  if (/feeds\/posts\/default/i.test(FEED_URL)) return fetchBloggerEntries(limit, pageSize, offset);
  return fetchWordPressEntries(limit, offset);
}

async function fetchSourceEntriesWithMeta(limit: number, pageSize: number, offset: number): Promise<{ entries: ParsedEntry[]; scanned: number; total: number }> {
  if (/feeds\/posts\/default/i.test(FEED_URL)) {
    const entries = await fetchBloggerEntries(limit, pageSize, offset);
    return {
      entries,
      scanned: entries.length,
      total: offset + entries.length + (entries.length >= limit ? limit : 0),
    };
  }
  return fetchWordPressEntriesWithMeta(limit, offset);
}

function findMovieForEntry(
  entry: ParsedEntry,
  indexes: ReturnType<typeof buildMovieIndexes>,
): MovieRow | null {
  const generatedSlug = `blvietsub-${entry.postId}-${slugify(entry.title)}`;
  if (indexes.byPostId.has(entry.postId)) return indexes.byPostId.get(entry.postId) || null;
  const entrySourceUrl = String(entry.sourceUrl || '').replace(/\/+$/, '');
  if (entrySourceUrl && indexes.bySourceUrl.has(entrySourceUrl)) return indexes.bySourceUrl.get(entrySourceUrl) || null;
  if (indexes.bySlug.has(generatedSlug)) return indexes.bySlug.get(generatedSlug) || null;

  for (const key of uniqueTextValues([entry.title, entry.originName, ...(entry.aliasNames || [])]).map(canonicalDuplicateTitle).filter(Boolean)) {
    const movie = indexes.byTitle.get(key);
    if (movie && (!entry.year || !movie.year || entry.year === movie.year)) return movie;
  }

  return null;
}

async function createMovieFromEntry(
  supabase: SupabaseClient,
  entry: ParsedEntry,
): Promise<MovieRow> {
  const maxEpisode = Math.max(1, maxPlayableEpisodeNumber(entry.episodes) || playableEpisodeCount(entry.episodes));
  const slug = `blvietsub-${entry.postId}-${slugify(entry.title)}`;
  const normalizedName = slugify([entry.title, entry.originName].filter(Boolean).join(' '));
  const payload = {
    slug,
    name: entry.title,
    origin_name: entry.originName,
    title_vi: entry.title,
    title_en: '',
    title_original: entry.originName,
    normalized_name: normalizedName,
    content: entry.content,
    type: entry.type,
    status: entry.status,
    thumb_url: entry.image,
    poster_url: entry.image,
    quality: 'HD',
    lang: 'Vietsub',
    time: '',
    episode_current: `${TAP_LABEL} ${maxEpisode}`,
    episode_total: '',
    current_episode: maxEpisode,
    total_episodes: maxEpisode,
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

  const selectExistingMovieAfterDuplicate = async (): Promise<MovieRow | null> => {
    const selectFields = 'id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, source_url, thumb_url, poster_url, episode_current, current_episode, total_episodes, year';
    const directChecks: Array<[string, string]> = [
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
      if (data?.id) return data as MovieRow;
    }

    if (entry.postId) {
      for (const column of ['showtimes', 'source_url']) {
        const { data } = await supabase
          .from('movies')
          .select(selectFields)
          .ilike(column, `%${entry.postId}%`)
          .limit(1)
          .maybeSingle();
        if (data?.id) return data as MovieRow;
      }
    }

    for (const title of [entry.title, entry.originName].filter(Boolean)) {
      for (const column of ['name', 'origin_name', 'title_vi', 'title_en']) {
        const query = supabase
          .from('movies')
          .select(selectFields)
          .eq(column, title)
          .limit(1);
        const { data } = entry.year ? await query.eq('year', entry.year).maybeSingle() : await query.maybeSingle();
        if (data?.id) return data as MovieRow;
      }
    }

    return null;
  };

  const { data, error } = await supabase
    .from('movies')
    .insert(payload)
    .select('id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, source_url, thumb_url, poster_url, episode_current, current_episode, total_episodes, year')
    .single();

  if (error) {
    if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
      const existing = await selectExistingMovieAfterDuplicate();
      if (existing) return existing;
    }
    throw new Error(`movies insert ${slug}: ${error.message}`);
  }
  return data as MovieRow;
}

async function insertMissingEpisodes(
  supabase: SupabaseClient,
  movie: MovieRow,
  entry: ParsedEntry,
): Promise<number> {
  const { data: existingRows, error } = await supabase
    .from('movie_episodes')
    .select('id, episode_number, server_name, link_embed, link_m3u8')
    .eq('movie_id', movie.id)
    .eq('source', SOURCE_SITE);

  if (error) throw new Error(`movie_episodes select ${movie.slug}: ${error.message}`);

  const existing = new Map((existingRows || []).map((row) => [`${String(row.server_name || '').trim()}|${Number(row.episode_number || 0)}`, row]));
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

  let repaired = 0;
  for (const episode of entry.episodes) {
    const row = existing.get(`${episode.server_name}|${episode.episode_number}`);
    if (!row) continue;
    const currentEmbed = String(row.link_embed || '');
    const currentHls = String(row.link_m3u8 || '');
    const nextEmbed = episode.link_embed || '';
    const nextHls = episode.link_m3u8 || '';
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

async function updateMovieMetadata(
  supabase: SupabaseClient,
  movie: MovieRow,
  entry: ParsedEntry,
): Promise<boolean> {
  const parsedMaxEpisode = Math.max(1, maxPlayableEpisodeNumber(entry.episodes) || playableEpisodeCount(entry.episodes));
  const episodeCount = Math.max(parsedMaxEpisode, 1);
  const current = getMovieCurrentEpisode(movie);
  const update: Record<string, unknown> = {
    showtimes: entry.sourceUrl || `https://www.blvietsub.top/?p=${entry.postId}`,
    source_url: entry.sourceUrl || `https://www.blvietsub.top/?p=${entry.postId}`,
    source_site: movie.slug.startsWith('blvietsub-') ? SOURCE_SITE : undefined,
    source_name: movie.slug.startsWith('blvietsub-') ? SOURCE_NAME : undefined,
  };

  if (episodeCount !== current || Number(movie.total_episodes || 0) !== episodeCount) {
    update.episode_current = `${TAP_LABEL} ${episodeCount}`;
    update.current_episode = episodeCount;
    update.total_episodes = episodeCount;
  }

  if (entry.image) {
    if (!String(movie.thumb_url || '').trim()) update.thumb_url = entry.image;
    if (!String(movie.poster_url || '').trim()) update.poster_url = entry.image;
  }

  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
  const changed = Object.keys(update).length > 0;
  update.last_synced_at = new Date().toISOString();

  const { error } = await supabase.from('movies').update(update).eq('id', movie.id);
  if (error) throw new Error(`movies update ${movie.slug}: ${error.message}`);
  return changed;
}

async function deleteDetailCache(supabase: SupabaseClient, slugs: string[]): Promise<void> {
  const targets = Array.from(new Set(slugs.map((slug) => slug.trim()).filter(Boolean)));
  if (targets.length === 0) return;
  try {
    await supabase.from('movie_api_cache').delete().in('slug', targets);
  } catch {
    /* detail cache is best-effort */
  }
}

function normalizeSourceUrl(value = ''): string {
  return value.replace(/^http:\/\//i, 'https://').replace(/\/+$/, '').trim();
}

function getBlvietsubMovieUrl(movie: MovieRow): string {
  for (const raw of [movie.source_url, movie.showtimes]) {
    const value = normalizeSourceUrl(String(raw || ''));
    if (/^https?:\/\/blvietsub\.com\/phim\/[^/]+\/?$/i.test(value)) return value;
  }
  return '';
}

async function fetchWordPressEntryByUrl(movieUrl: string): Promise<ParsedEntry | null> {
  const page = await fetch(proxiedBlvietsubUrl(movieUrl), {
    headers: BLVIETSUB_HEADERS,
    signal: AbortSignal.timeout(25000),
  });
  if (!page.ok) throw new Error(`BLVietsub movie ${page.status}`);
  const html = await page.text();
  const movieSlug = getWordPressMovieSlug(movieUrl);
  const playerHtml = movieSlug ? await fetchWordPressPlayerPages(html, movieSlug) : '';
  const entry = parseWordPressMoviePage(movieUrl, new Date().toISOString(), html, playerHtml);
  if (!entry) return null;

  try {
    const alias = await fetchWordPressSearchAlias(movieUrl, entry.title);
    if (alias?.originName && !entry.originName) entry.originName = alias.originName;
    entry.aliasNames = uniqueTextValues([...(entry.aliasNames || []), alias?.title, alias?.originName]);
  } catch {
    // Alias lookup is best-effort; the parsed page still has enough data to sync.
  }

  return entry;
}

async function syncEntryToMovie(
  supabase: SupabaseClient,
  movie: MovieRow,
  entry: ParsedEntry,
): Promise<{ inserted: number; updated: boolean; source_max_episode: number; db_before_episode: number }> {
  const dbBeforeEpisode = getMovieCurrentEpisode(movie);
  const sourceMaxEpisode = Math.max(1, maxPlayableEpisodeNumber(entry.episodes) || playableEpisodeCount(entry.episodes));
  const inserted = await insertMissingEpisodes(supabase, movie, entry);
  const updated = await updateMovieMetadata(supabase, movie, entry);
  if (inserted > 0 || updated || sourceMaxEpisode !== dbBeforeEpisode) {
    await deleteDetailCache(supabase, [movie.slug]);
  }
  return {
    inserted,
    updated,
    source_max_episode: sourceMaxEpisode,
    db_before_episode: dbBeforeEpisode,
  };
}

async function repairExistingBlvietsubMovies(
  supabase: SupabaseClient,
  limit: number,
  includeCompleted = false,
): Promise<{
  scanned: number;
  scanned_pool: number;
  completed_skipped: number;
  checked: number;
  repaired: number;
  inserted: number;
  updated: number;
  transient_skipped: number;
  transient_details: string[];
  drift: Array<{ slug: string; title: string; before: number; after: number; inserted: number }>;
  errors: string[];
}> {
  const cappedLimit = Math.max(1, Math.min(limit, 80));
  const queryLimit = includeCompleted ? cappedLimit : Math.min(cappedLimit * 4, 320);
  const { data, error } = await supabase
    .from('movies')
    .select('id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, source_url, thumb_url, poster_url, episode_current, current_episode, total_episodes, status, year, last_synced_at')
    .eq('is_published', true)
    .or('source_site.ilike.%admin-queer%,source_site.ilike.%blvietsub%,source_name.ilike.%blvietsub%,showtimes.ilike.%blvietsub.com/phim/%,source_url.ilike.%blvietsub.com/phim/%')
    .order('updated_at', { ascending: false })
    .limit(queryLimit);

  if (error) throw new Error(`existing BLVietsub select: ${error.message}`);

  let checked = 0;
  let repaired = 0;
  let inserted = 0;
  let updated = 0;
  let transientSkipped = 0;
  const transientDetails: string[] = [];
  const drift: Array<{ slug: string; title: string; before: number; after: number; inserted: number }> = [];
  const errors: string[] = [];
  const pool = (data || []) as MovieRow[];
  const rows = pool
    .filter((movie) => shouldRoutineRepairMovie(movie, includeCompleted))
    .slice(0, cappedLimit);

  for (const movie of rows) {
    const movieUrl = getBlvietsubMovieUrl(movie);
    if (!movieUrl) continue;
    checked += 1;
    try {
      const entry = await fetchWordPressEntryByUrl(movieUrl);
      if (!entry) continue;
      const result = await syncEntryToMovie(supabase, movie, entry);
      inserted += result.inserted;
      if (result.updated) updated += 1;
      if (result.inserted > 0 || result.updated || result.source_max_episode > result.db_before_episode) {
        repaired += 1;
        drift.push({
          slug: movie.slug,
          title: entry.title || movie.name || movie.slug,
          before: result.db_before_episode,
          after: result.source_max_episode,
          inserted: result.inserted,
        });
      }
    } catch (error) {
      const message = `${movie.slug}: ${error instanceof Error ? error.message : String(error)}`;
      if (isTransientExternalFetchError(error)) {
        transientSkipped += 1;
        transientDetails.push(message);
      } else {
        errors.push(message);
      }
    }
  }

  return {
    scanned: rows.length,
    scanned_pool: pool.length,
    completed_skipped: pool.length - rows.length,
    checked,
    repaired,
    inserted,
    updated,
    transient_skipped: transientSkipped,
    transient_details: transientDetails.slice(0, 20),
    drift: drift.slice(0, 20),
    errors: errors.slice(0, 20),
  };
}

async function writeSyncLog(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('sync_logs').insert({
      function_name: String(payload.function_name || 'sync-blvietsub-feed'),
      run_at: new Date().toISOString(),
      scanned: payload.scanned,
      added: payload.inserted,
      skipped: payload.matched,
      errors: Array.isArray(payload.errors) ? payload.errors.length : 0,
      details: payload.errors,
      elapsed_ms: payload.elapsed_ms,
      success: Array.isArray(payload.errors) ? payload.errors.length === 0 : true,
      metadata: payload.metadata || (payload.seo_automation ? { seo_automation: payload.seo_automation } : null),
    });
  } catch {
    /* sync_logs is optional */
  }
}

async function refreshSearchIndex(supabaseUrl: string, serviceKey = ''): Promise<boolean> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/search-index-proxy?limit=5000&refresh=1`, {
      headers: serviceKey ? {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      } : undefined,
      signal: AbortSignal.timeout(60000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function uniqueSlugs(slugs: string[]): string[] {
  return Array.from(new Set(slugs.map((slug) => String(slug || '').trim()).filter(Boolean))).slice(0, 100);
}

function movieUrlsFromSlugs(slugs: string[]): string[] {
  return uniqueSlugs(slugs).map((slug) => `https://khophim.org/phim/${encodeURIComponent(slug)}`);
}

async function clearSeoCaches(supabase: SupabaseClient, slugs: string[]): Promise<boolean> {
  try {
    const targets = uniqueSlugs(slugs);
    await Promise.allSettled([
      supabase.from('home_page_cache').delete().neq('id', '__never__'),
      targets.length > 0
        ? supabase.from('movie_api_cache').delete().in('slug', targets)
        : supabase.from('movie_api_cache').delete().neq('slug', '__never__'),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function pingChangedMovieUrls(
  supabaseUrl: string,
  serviceKey: string,
  cronSecret: string,
  slugs: string[],
): Promise<{ attempted: boolean; ok: boolean; status: number; urls: number; message: string }> {
  const urls = movieUrlsFromSlugs(slugs);
  if (urls.length === 0) return { attempted: false, ok: true, status: 0, urls: 0, message: 'no changed urls' };

  try {
    const endpoint = new URL(`${supabaseUrl}/functions/v1/auto-ping-new-movies`);
    if (cronSecret) endpoint.searchParams.set('secret', cronSecret);
    const response = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
        'x-triggered-by': 'cron-seo-sync-blvietsub',
      },
      body: JSON.stringify({ urls, type: 'URL_UPDATED' }),
      signal: AbortSignal.timeout(90000),
    });
    const body = await response.json().catch(() => ({})) as { message?: string; status?: string; error?: string };
    return {
      attempted: true,
      ok: response.ok && body.status !== 'credentials_missing',
      status: response.status,
      urls: urls.length,
      message: body.message || body.status || body.error || '',
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: 0,
      urls: urls.length,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runSeoAutomation(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  cronSecret: string,
  changedSlugs: string[],
): Promise<{ changed_urls: number; caches_cleared: boolean; search_index_refreshed: boolean; google_ping: Awaited<ReturnType<typeof pingChangedMovieUrls>> }> {
  const slugs = uniqueSlugs(changedSlugs);
  if (slugs.length === 0) {
    return {
      changed_urls: 0,
      caches_cleared: false,
      search_index_refreshed: false,
      google_ping: { attempted: false, ok: true, status: 0, urls: 0, message: 'no changed urls' },
    };
  }

  const cachesCleared = await clearSeoCaches(supabase, slugs);
  const [searchIndexRefreshed, googlePing] = await Promise.all([
    refreshSearchIndex(supabaseUrl, serviceKey),
    pingChangedMovieUrls(supabaseUrl, serviceKey, cronSecret, slugs),
  ]);

  return {
    changed_urls: slugs.length,
    caches_cleared: cachesCleared,
    search_index_refreshed: searchIndexRefreshed,
    google_ping: googlePing,
  };
}

function pickPlayableFromWatchPage(html: string, episodeNumber: number): { link_embed: string; link_m3u8: string } | null {
  const tags = Array.from(html.matchAll(/<[^>]+class=["'][^"']*\bstreaming-server\b[^"']*["'][^>]*>/gi))
    .map((match) => match[0]);
  const tag = tags.find((candidate) => Number(extractAttr(candidate, 'data-id').match(/\d+/)?.[0] || 0) === episodeNumber) || tags[0] || '';
  const rawLink = extractAttr(tag, 'data-link');
  if (!rawLink || isBlvietsubWatchUrl(rawLink)) return null;
  try {
    new URL(rawLink);
  } catch {
    return null;
  }
  const type = extractAttr(tag, 'data-type').toLowerCase();
  const isHls = type === 'm3u8' || /\.m3u8(?:[?#].*)?$/i.test(rawLink);
  return {
    link_embed: isHls ? '' : rawLink,
    link_m3u8: isHls ? rawLink : '',
  };
}

async function repairBadBlvietsubEmbeds(
  supabase: SupabaseClient,
  limit: number,
): Promise<{ scanned: number; repaired: number; unresolved: number; remaining: number; errors: string[] }> {
  const cappedLimit = Math.max(1, Math.min(limit, 500));
  const { data: rows, error } = await supabase
    .from('movie_episodes')
    .select('id, episode_number, link_embed')
    .eq('source', SOURCE_SITE)
    .ilike('link_embed', '%blvietsub.com%xem-phim%')
    .order('id', { ascending: true })
    .limit(cappedLimit);
  if (error) throw new Error(`bad embeds select: ${error.message}`);

  let repaired = 0;
  let unresolved = 0;
  const errors: string[] = [];
  const badRows = rows || [];
  for (let index = 0; index < badRows.length; index += 6) {
    const batch = badRows.slice(index, index + 6);
    await Promise.all(batch.map(async (row) => {
      const id = Number(row.id || 0);
      const watchUrl = String(row.link_embed || '').replace(/&amp;/g, '&').trim();
      const episodeNumber = Number(row.episode_number || 0);
      if (!id || !watchUrl || !episodeNumber) {
        unresolved += 1;
        return;
      }
      try {
        const response = await fetch(proxiedBlvietsubUrl(watchUrl), {
          headers: BLVIETSUB_HEADERS,
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          unresolved += 1;
          return;
        }
        const playable = pickPlayableFromWatchPage(await response.text(), episodeNumber);
        if (!playable || (!playable.link_embed && !playable.link_m3u8)) {
          unresolved += 1;
          return;
        }
        const { error: updateError } = await supabase
          .from('movie_episodes')
          .update(playable)
          .eq('id', id);
        if (updateError) {
          errors.push(`episode ${id}: ${updateError.message}`);
          unresolved += 1;
          return;
        }
        repaired += 1;
      } catch (error) {
        unresolved += 1;
        errors.push(`episode ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }

  const { count, error: countError } = await supabase
    .from('movie_episodes')
    .select('id', { count: 'exact', head: true })
    .eq('source', SOURCE_SITE)
    .ilike('link_embed', '%blvietsub.com%xem-phim%');
  if (countError) throw new Error(`bad embeds count: ${countError.message}`);

  return {
    scanned: badRows.length,
    repaired,
    unresolved,
    remaining: count || 0,
    errors: errors.slice(0, 20),
  };
}

async function readCursorOffset(supabase: SupabaseClient, cursorKey: string, limit: number): Promise<number> {
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

async function advanceCursor(
  supabase: SupabaseClient,
  cursorKey: string,
  payload: { limit: number; offset: number; scanned: number; total: number },
): Promise<void> {
  if (!cursorKey) return;
  const nextOffset = payload.total > 0 && payload.scanned > 0 && payload.offset + payload.scanned < payload.total
    ? payload.offset + payload.limit
    : 0;
  const nextPage = Math.floor(nextOffset / payload.limit) + 1;
  const { error } = await supabase
    .from('sync_cursors')
    .upsert({ key: cursorKey, page: nextPage, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`sync_cursors upsert ${cursorKey}: ${error.message}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const syncSecret = Deno.env.get('BLVIETSUB_SYNC_SECRET') || '';
  if ((cronSecret || syncSecret) && secret !== cronSecret && secret !== syncSecret) {
    return json({ success: false, error: 'Unauthorized' }, 401);
  }

  const started = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase env' }, 500);

  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 2000), 5000));
  const pageSize = Math.max(1, Math.min(Number(url.searchParams.get('page_size') || 500), 500));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
  const useCursor = url.searchParams.get('use_cursor') === '1';
  const cursorKey = url.searchParams.get('cursor_key') || 'blvietsub_sitemap_external';
  const supabase = createClient(supabaseUrl, serviceKey);
  const errors: string[] = [];

  try {
    if (url.searchParams.get('repair_bad_embeds') === '1') {
      const repairLimit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 200), 500));
      const result = await repairBadBlvietsubEmbeds(supabase, repairLimit);
      await writeSyncLog(supabase, {
        function_name: 'sync-blvietsub-feed-repair-embeds',
        scanned: result.scanned,
        inserted: result.repaired,
        matched: 0,
        errors: result.errors,
        elapsed_ms: Date.now() - started,
      });
      return json({
        success: result.errors.length === 0,
        ...result,
        elapsed_ms: Date.now() - started,
      }, result.errors.length ? 207 : 200);
    }

    if (url.searchParams.get('repair_existing') === '1') {
      const repairLimit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 24), 80));
      const includeCompleted = url.searchParams.get('include_completed') === '1';
      const result = await repairExistingBlvietsubMovies(supabase, repairLimit, includeCompleted);
      const changedSlugs = result.drift.map((item) => item.slug);
      const seoAutomation = await runSeoAutomation(supabase, supabaseUrl, serviceKey, cronSecret || syncSecret, changedSlugs);
      await writeSyncLog(supabase, {
        function_name: 'sync-blvietsub-feed-repair-existing',
        scanned: result.scanned,
        inserted: result.inserted,
        matched: result.checked,
        errors: result.errors,
        metadata: {
          checked: result.checked,
          repaired: result.repaired,
          updated: result.updated,
          completed_skipped: result.completed_skipped,
          scanned_pool: result.scanned_pool,
          transient_skipped: result.transient_skipped,
          transient_details: result.transient_details,
          include_completed: includeCompleted,
          seo_automation: seoAutomation,
        },
        seo_automation: seoAutomation,
        elapsed_ms: Date.now() - started,
      });
      return json({
        success: result.errors.length === 0,
        ...result,
        include_completed: includeCompleted,
        seo_automation: seoAutomation,
        elapsed_ms: Date.now() - started,
      }, result.errors.length ? 207 : 200);
    }

    const directUrl = url.searchParams.get('movie_url')?.trim();
    if (directUrl && /^https?:\/\/blvietsub\.com\/phim\/[^/]+\/?$/i.test(directUrl)) {
      const entry = await fetchWordPressEntryByUrl(normalizeSourceUrl(directUrl));
      if (!entry) {
        return json({
          success: false,
          movie_url: directUrl,
          title: '',
          episodes: 0,
          max_episode: 0,
          inserted: 0,
          updated: false,
          elapsed_ms: Date.now() - started,
        }, 404);
      }
      const movieRows = await fetchExistingQueerMovies(supabase);
      const movieIndexes = buildMovieIndexes(movieRows);
      let movie = findMovieForEntry(entry, movieIndexes);
      let created = false;
      if (!movie) {
        movie = await createMovieFromEntry(supabase, entry);
        created = true;
      }
      const syncResult = await syncEntryToMovie(supabase, movie, entry);
      const changedSlugs = created || syncResult.inserted > 0 || syncResult.updated ? [movie.slug] : [];
      const seoAutomation = await runSeoAutomation(supabase, supabaseUrl, serviceKey, cronSecret || syncSecret, changedSlugs);
      const result = {
        success: true,
        movie_url: directUrl,
        movie_slug: movie.slug,
        created,
        title: entry.title,
        episodes: entry.episodes.length,
        max_episode: Math.max(...entry.episodes.map((episode) => episode.episode_number)),
        servers: Array.from(new Set(entry.episodes.map((episode) => episode.server_name))),
        inserted: syncResult.inserted,
        updated: syncResult.updated,
        db_before_episode: syncResult.db_before_episode,
        source_max_episode: syncResult.source_max_episode,
        seo_automation: seoAutomation,
        elapsed_ms: Date.now() - started,
      };
      await writeSyncLog(supabase, {
        ...result,
        scanned: 1,
        matched: created ? 0 : 1,
        inserted: syncResult.inserted,
        errors: [],
        seo_automation: seoAutomation,
      });
      return json({
        ...result,
      }, 200);
    }

    const effectiveOffset = useCursor ? await readCursorOffset(supabase, cursorKey, limit) : offset;
    const sourceResult = await fetchSourceEntriesWithMeta(limit, pageSize, effectiveOffset);
    const entries = sourceResult.entries;
    const entryIndexes = buildEntryIndexes(entries);

    const movieRows = await fetchExistingQueerMovies(supabase);
    const movieIndexes = buildMovieIndexes(movieRows);
    let matched = 0;
    let created = 0;
    let inserted = 0;
    let updated = 0;
    const changedSlugs: string[] = [];
    const missing: string[] = [];

    for (const entry of entries) {
      let movie = findMovieForEntry(entry, movieIndexes);
      try {
        let createdThisMovie = false;
        if (!movie) {
          movie = await createMovieFromEntry(supabase, entry);
          createdThisMovie = true;
          created += 1;
          movieRows.push(movie);
          const refreshedIndexes = buildMovieIndexes(movieRows);
          movieIndexes.byPostId.clear();
          movieIndexes.byTitle.clear();
          movieIndexes.bySlug.clear();
          refreshedIndexes.byPostId.forEach((value, key) => movieIndexes.byPostId.set(key, value));
          refreshedIndexes.byTitle.forEach((value, key) => movieIndexes.byTitle.set(key, value));
          refreshedIndexes.bySlug.forEach((value, key) => movieIndexes.bySlug.set(key, value));
        } else {
          matched += 1;
        }

        const syncResult = await syncEntryToMovie(supabase, movie, entry);
        inserted += syncResult.inserted;
        if (syncResult.updated) updated += 1;
        if (createdThisMovie || syncResult.inserted > 0 || syncResult.updated) {
          changedSlugs.push(movie.slug);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    for (const movie of movieRows) {
      if (!findEntryForMovie(movie, entryIndexes)) missing.push(movie.slug);
    }

    const seoAutomation = await runSeoAutomation(supabase, supabaseUrl, serviceKey, cronSecret || syncSecret, changedSlugs);

    const result = {
      success: errors.length === 0,
      offset: effectiveOffset,
      cursor_key: useCursor ? cursorKey : null,
      next_cursor_enabled: useCursor,
      total_urls: sourceResult.total,
      source_scanned: sourceResult.scanned,
      feed_entries: entries.length,
      scanned: movieRows.length,
      matched,
      created,
      missing_count: missing.length,
      missing_sample: missing.slice(0, 20),
      inserted,
      updated,
      seo_automation: seoAutomation,
      errors,
      elapsed_ms: Date.now() - started,
    };
    if (useCursor) {
      await advanceCursor(supabase, cursorKey, {
        limit,
        offset: effectiveOffset,
        scanned: sourceResult.scanned,
        total: sourceResult.total,
      });
    }
    await writeSyncLog(supabase, result);
    return json(result, errors.length ? 207 : 200);
  } catch (error) {
    const result = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - started,
    };
    return json(result, 500);
  }
});
