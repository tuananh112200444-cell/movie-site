import { createClient } from '@supabase/supabase-js';

const DEFAULT_FEED_URL = 'https://blvietsub.com/ophim-sitemap.xml';
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

function getMovieCurrentEpisode(movie) {
  const numeric = Number(movie?.current_episode || movie?.total_episodes || 0);
  if (numeric > 0) return numeric;
  const fromText = String(movie?.episode_current || '').match(/\d+/)?.[0];
  return fromText ? Number(fromText) : 0;
}

function playableEpisodeCount(episodes) {
  return new Set(episodes.map((episode) => Number(episode.episode_number || 0)).filter(Boolean)).size;
}

function parseSitemap(xml = '') {
  const urls = [];
  for (const match of xml.matchAll(/<url>\s*<loc>([\s\S]*?)<\/loc>(?:[\s\S]*?<lastmod>([\s\S]*?)<\/lastmod>)?[\s\S]*?<\/url>/gi)) {
    const url = decodeHtml(match[1]).replace(/^http:\/\//i, 'https://');
    if (!/^https?:\/\/blvietsub\.com\/phim\/[^/]+\/?$/i.test(url)) continue;
    urls.push({ url, updatedAt: decodeHtml(match[2] || '') });
  }
  return urls;
}

function getMovieSlug(movieUrl = '') {
  return String(movieUrl).match(/\/phim\/([^/]+)\/?$/i)?.[1] || '';
}

function parseEpisodes(html = '', movieSlug = '') {
  const episodes = new Map();
  if (!movieSlug) return [];
  const escapedSlug = movieSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const absolutePattern = new RegExp(`https?:\\/\\/blvietsub\\.com\\/+(?:xem-phim)\\/${escapedSlug}\\/tap-([0-9]+)-sv-([0-9]+)`, 'gi');
  const relativePattern = new RegExp(`(?:^|["'\\s])((?:\\/\\/?)?xem-phim\\/${escapedSlug}\\/tap-([0-9]+)-sv-([0-9]+))`, 'gi');

  const addEpisode = (episodeNumber, serverNumber, rawLink) => {
    if (!episodeNumber) return;
    const serverName = `SV ${serverNumber || 1}`;
    let link = String(rawLink || '').replace(/^http:\/\//i, 'https://').replace(/&amp;/g, '&');
    if (link.startsWith('//')) link = `https:${link}`;
    if (link.startsWith('/')) link = `https://blvietsub.com${link}`;
    if (!/^https?:\/\//i.test(link)) link = `https://blvietsub.com/${link.replace(/^\/+/, '')}`;
    const key = `${serverName}|${episodeNumber}`;
    if (episodes.has(key)) return;
    episodes.set(key, {
      episode_number: episodeNumber,
      episode_name: `${TAP_LABEL} ${episodeNumber}`,
      slug: `tap-${episodeNumber}`,
      server_name: serverName,
      link_embed: link,
    });
  };

  for (const match of html.matchAll(absolutePattern)) addEpisode(Number(match[1] || 0), Number(match[2] || 1), match[0]);
  for (const match of html.matchAll(relativePattern)) addEpisode(Number(match[2] || 0), Number(match[3] || 1), match[1]);

  return [...episodes.values()].sort((a, b) => a.episode_number - b.episode_number || a.server_name.localeCompare(b.server_name));
}

function firstWatchUrl(html, movieSlug) {
  return parseEpisodes(html, movieSlug)[0]?.link_embed || '';
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
    stripTags(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i));
  const image = getMetaContent(html, 'og:image');
  const content = getMetaContent(html, 'og:description');
  const postId = firstMatch(html, /https?:\/\/blvietsub\.com\/\?p=(\d+)/i) || movieSlug;
  const episodes = parseEpisodes(`${html}\n${playerHtml}`, movieSlug);
  if (!title || episodes.length === 0) return null;
  const maxEpisode = Math.max(...episodes.map((episode) => episode.episode_number));
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

export async function fetchMovieEntry(movieUrl, updatedAt = '') {
  const html = await fetchText(movieUrl, 22000);
  const movieSlug = getMovieSlug(movieUrl);
  const watchUrl = firstWatchUrl(html, movieSlug);
  let playerHtml = '';
  if (watchUrl) {
    try {
      playerHtml = await fetchText(watchUrl, 22000);
    } catch {
      playerHtml = '';
    }
  }
  return parseMoviePage(movieUrl, updatedAt, html, playerHtml);
}

export async function fetchEntries({ feedUrl = DEFAULT_FEED_URL, limit = 10, offset = 0, concurrency = 3 } = {}) {
  const sitemap = await fetchText(feedUrl, 30000);
  const allUrls = parseSitemap(sitemap);
  const urls = allUrls.slice(offset, offset + limit);
  const entries = [];
  const errors = [];
  for (let index = 0; index < urls.length; index += concurrency) {
    const batch = urls.slice(index, index + concurrency);
    const parsed = await Promise.all(batch.map(async (item) => {
      try {
        return await fetchMovieEntry(item.url, item.updatedAt);
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
  }
  return { byPostId, bySourceUrl, bySlug, byTitle };
}

function findMovie(entry, indexes) {
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
  const { data, error } = await supabase
    .from('movies')
    .insert(payload)
    .select('id, slug, name, origin_name, title_vi, title_en, source_site, source_name, showtimes, source_url, episode_current, current_episode, total_episodes, year')
    .single();
  if (error) throw new Error(`movies insert ${slug}: ${error.message}`);
  return data;
}

async function updateMovie(supabase, movie, entry) {
  const episodeCount = Math.max(1, playableEpisodeCount(entry.episodes));
  const current = getMovieCurrentEpisode(movie);
  const payload = {
    showtimes: entry.sourceUrl,
    source_url: entry.sourceUrl,
    last_synced_at: new Date().toISOString(),
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
    .select('episode_number, server_name')
    .eq('movie_id', movie.id)
    .eq('source', SOURCE_SITE);
  if (error) throw new Error(`movie_episodes select ${movie.slug}: ${error.message}`);

  const existing = new Set((data || []).map((row) => `${String(row.server_name || '').trim()}|${Number(row.episode_number || 0)}`));
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
  let singleEntry = null;

  if (movieUrl) {
    const entry = await fetchMovieEntry(movieUrl);
    if (dryRun || !supabase) {
      return {
        success: Boolean(entry),
        dry_run: true,
        movie_url: movieUrl,
        title: entry?.title || '',
        episodes: entry?.episodes.length || 0,
        distinct_episodes: entry ? playableEpisodeCount(entry.episodes) : 0,
        servers: entry ? [...new Set(entry.episodes.map((episode) => episode.server_name))] : [],
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
  errors.push(...fetchErrors);

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
