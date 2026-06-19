import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FEED_URL = Deno.env.get('BLVIETSUB_FEED_URL') || 'https://blvietsub.com/ophim-sitemap.xml';
const SOURCE_SITE = 'blvietsub';
const SOURCE_NAME = 'BLVietsub';
const TAP_LABEL = 'T\u1eadp';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  episode_current?: string | null;
  current_episode?: number | null;
  total_episodes?: number | null;
  year?: number | null;
}

interface ParsedEntry {
  postId: string;
  title: string;
  originName: string;
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
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
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

function buildEntryIndexes(entries: ParsedEntry[]) {
  const byPostId = new Map<string, ParsedEntry>();
  const byTitle = new Map<string, ParsedEntry>();
  for (const entry of entries) {
    byPostId.set(entry.postId, entry);
    for (const key of [entry.title, entry.originName].map(canonicalDuplicateTitle).filter(Boolean)) {
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
    const sourceUrl = String(movie.showtimes || '').trim();
    if (sourceUrl) {
      const existing = bySourceUrl.get(sourceUrl);
      const isAdminQueer = String(movie.source_site || '').includes('admin-queer');
      const existingIsAdminQueer = String(existing?.source_site || '').includes('admin-queer');
      if (!existing || (isAdminQueer && !existingIsAdminQueer)) bySourceUrl.set(sourceUrl, movie);
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
      .select('id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, episode_current, current_episode, total_episodes, year')
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
      headers: { 'User-Agent': 'KhoPhim-BLVietsub-Sync/1.0' },
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

function getWordPressMovieSlug(movieUrl: string): string {
  return movieUrl.match(/\/phim\/([^/]+)\/?$/i)?.[1] || '';
}

function parseWordPressEpisodes(html: string, movieSlug: string): ParsedEpisode[] {
  const episodes = new Map<string, ParsedEpisode>();
  const watchUrlPattern = new RegExp(`https?:\\/\\/blvietsub\\.com\\/+(?:xem-phim)\\/${movieSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/tap-([0-9]+)-sv-([0-9]+)`, 'gi');
  for (const match of html.matchAll(watchUrlPattern)) {
    const episodeNumber = Number(match[1] || 0);
    const serverNumber = Number(match[2] || 1);
    if (!episodeNumber) continue;
    const serverName = `SV ${serverNumber || 1}`;
    const link = match[0].replace(/^http:\/\//i, 'https://');
    const key = `${serverName}|${episodeNumber}`;
    if (episodes.has(key)) continue;
    episodes.set(key, {
      episode_number: episodeNumber,
      episode_name: `${TAP_LABEL} ${episodeNumber}`,
      slug: `tap-${episodeNumber}`,
      link_embed: link,
      server_name: serverName,
    });
  }
  return [...episodes.values()].sort((a, b) => a.episode_number - b.episode_number || a.server_name.localeCompare(b.server_name));
}

function parseWordPressMoviePage(movieUrl: string, updatedAt: string, html: string): ParsedEntry | null {
  const movieSlug = getWordPressMovieSlug(movieUrl);
  if (!movieSlug) return null;
  const title = getMetaContent(html, 'og:title')
    .replace(/\s*-\s*BLVietsub\s*$/i, '')
    || decodeHtml(stripTags(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)));
  const image = getMetaContent(html, 'og:image');
  const content = getMetaContent(html, 'og:description');
  const postId = firstMatch(html, /https?:\/\/blvietsub\.com\/\?p=(\d+)/i) || movieSlug;
  const episodes = parseWordPressEpisodes(html, movieSlug);
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

async function fetchWordPressEntries(limit: number, offset: number): Promise<ParsedEntry[]> {
  const response = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'KhoPhim-BLVietsub-WordPress-Sync/1.0' },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`BLVietsub sitemap ${response.status}`);
  const urls = parseWordPressSitemap(await response.text()).slice(offset, offset + limit);
  const entries: ParsedEntry[] = [];
  const concurrency = 6;
  for (let index = 0; index < urls.length && entries.length < limit; index += concurrency) {
    const batch = urls.slice(index, index + concurrency);
    const parsed = await Promise.all(batch.map(async (item) => {
      try {
        const page = await fetch(item.url, {
          headers: { 'User-Agent': 'KhoPhim-BLVietsub-WordPress-Sync/1.0' },
          signal: AbortSignal.timeout(20000),
        });
        if (!page.ok) return null;
        return parseWordPressMoviePage(item.url, item.updatedAt, await page.text());
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
  return entries;
}

async function fetchSourceEntries(limit: number, pageSize: number, offset: number): Promise<ParsedEntry[]> {
  if (/feeds\/posts\/default/i.test(FEED_URL)) return fetchBloggerEntries(limit, pageSize, offset);
  return fetchWordPressEntries(limit, offset);
}

function findMovieForEntry(
  entry: ParsedEntry,
  indexes: ReturnType<typeof buildMovieIndexes>,
): MovieRow | null {
  const generatedSlug = `blvietsub-${entry.postId}-${slugify(entry.title)}`;
  if (indexes.byPostId.has(entry.postId)) return indexes.byPostId.get(entry.postId) || null;
  if (entry.sourceUrl && indexes.bySourceUrl.has(entry.sourceUrl)) return indexes.bySourceUrl.get(entry.sourceUrl) || null;
  if (indexes.bySlug.has(generatedSlug)) return indexes.bySlug.get(generatedSlug) || null;

  for (const key of [entry.title, entry.originName].map(canonicalDuplicateTitle).filter(Boolean)) {
    const movie = indexes.byTitle.get(key);
    if (movie && (!entry.year || !movie.year || entry.year === movie.year)) return movie;
  }

  return null;
}

async function createMovieFromEntry(
  supabase: SupabaseClient,
  entry: ParsedEntry,
): Promise<MovieRow> {
  const maxEpisode = Math.max(...entry.episodes.map((episode) => episode.episode_number));
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

  const { data, error } = await supabase
    .from('movies')
    .insert(payload)
    .select('id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, episode_current, current_episode, total_episodes, year')
    .single();

  if (error) {
    if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
      const { data: existing, error: existingError } = await supabase
        .from('movies')
        .select('id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, episode_current, current_episode, total_episodes, year')
        .eq('slug', slug)
        .single();
      if (!existingError && existing) return existing as MovieRow;
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
    .select('episode_number, server_name')
    .eq('movie_id', movie.id)
    .eq('source', SOURCE_SITE);

  if (error) throw new Error(`movie_episodes select ${movie.slug}: ${error.message}`);

  const existing = new Set((existingRows || []).map((row) => `${String(row.server_name || '').trim()}|${Number(row.episode_number || 0)}`));
  const rows = entry.episodes
    .filter((episode) => !existing.has(`${episode.server_name}|${episode.episode_number}`))
    .map((episode) => ({
      movie_id: movie.id,
      episode_number: episode.episode_number,
      episode_name: episode.episode_name,
      slug: episode.slug,
      server_name: episode.server_name,
      link_m3u8: '',
      link_embed: episode.link_embed,
      subtitle_url: '',
      thumbnail_url: '',
      duration: '',
      source: SOURCE_SITE,
      is_backup: false,
    }));

  if (rows.length === 0) return 0;
  const { error: insertError } = await supabase.from('movie_episodes').insert(rows);
  if (insertError) throw new Error(`movie_episodes insert ${movie.slug}: ${insertError.message}`);
  return rows.length;
}

async function updateMovieMetadata(
  supabase: SupabaseClient,
  movie: MovieRow,
  entry: ParsedEntry,
): Promise<boolean> {
  const liveMax = Math.max(...entry.episodes.map((episode) => episode.episode_number));
  const current = getMovieCurrentEpisode(movie);
  const update: Record<string, unknown> = {
    showtimes: entry.sourceUrl || `https://www.blvietsub.top/?p=${entry.postId}`,
    source_site: movie.slug.startsWith('blvietsub-') ? SOURCE_SITE : undefined,
    source_name: movie.slug.startsWith('blvietsub-') ? SOURCE_NAME : undefined,
  };

  if (liveMax > current) {
    update.episode_current = `${TAP_LABEL} ${liveMax}`;
    update.current_episode = liveMax;
    if (!movie.total_episodes || movie.total_episodes < liveMax) update.total_episodes = liveMax;
  }

  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
  if (Object.keys(update).length === 0) return false;

  const { error } = await supabase.from('movies').update(update).eq('id', movie.id);
  if (error) throw new Error(`movies update ${movie.slug}: ${error.message}`);
  return true;
}

async function writeSyncLog(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('sync_logs').insert({
      function_name: 'sync-blvietsub-feed',
      run_at: new Date().toISOString(),
      scanned: payload.scanned,
      added: payload.inserted,
      skipped: payload.matched,
      errors: Array.isArray(payload.errors) ? payload.errors.length : 0,
      details: payload.errors,
      elapsed_ms: payload.elapsed_ms,
      success: Array.isArray(payload.errors) ? payload.errors.length === 0 : true,
    });
  } catch {
    /* sync_logs is optional */
  }
}

async function refreshSearchIndex(supabaseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/search-index-proxy?limit=5000&refresh=1`, {
      signal: AbortSignal.timeout(60000),
    });
    return response.ok;
  } catch {
    return false;
  }
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
  const supabase = createClient(supabaseUrl, serviceKey);
  const errors: string[] = [];

  try {
    const entries = await fetchSourceEntries(limit, pageSize, offset);
    const entryIndexes = buildEntryIndexes(entries);

    const movieRows = await fetchExistingQueerMovies(supabase);
    const movieIndexes = buildMovieIndexes(movieRows);
    let matched = 0;
    let created = 0;
    let inserted = 0;
    let updated = 0;
    const missing: string[] = [];

    for (const entry of entries) {
      let movie = findMovieForEntry(entry, movieIndexes);
      try {
        if (!movie) {
          movie = await createMovieFromEntry(supabase, entry);
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

        inserted += await insertMissingEpisodes(supabase, movie, entry);
        if (await updateMovieMetadata(supabase, movie, entry)) updated += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    for (const movie of movieRows) {
      if (!findEntryForMovie(movie, entryIndexes)) missing.push(movie.slug);
    }

    const shouldRefreshSearch = url.searchParams.get('refresh_search') === '1';
    const searchIndexRefreshed = shouldRefreshSearch
      ? await refreshSearchIndex(supabaseUrl)
      : false;

    const result = {
      success: errors.length === 0,
      offset,
      feed_entries: entries.length,
      scanned: movieRows.length,
      matched,
      created,
      missing,
      inserted,
      updated,
      search_index_refreshed: searchIndexRefreshed,
      errors,
      elapsed_ms: Date.now() - started,
    };
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
