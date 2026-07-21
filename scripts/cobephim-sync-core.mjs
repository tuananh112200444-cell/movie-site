import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'https://cobephim.sbs';
const ALLOWED_COBEPHIM_HOSTS = new Set(['cobephim.sbs', 'cobephim.top']);
const SOURCE_SITE = 'cobephim';
const SOURCE_NAME = 'CobePhim / StreamVSMov';
const SERVER_NAME = 'CobePhim StreamVSMov';

export const COBEPHIM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 KhoPhim-Sync/1.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${BASE_URL}/`,
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

function normalizeCobeUrl(rawUrl = '') {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  const parsed = new URL(value, BASE_URL);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!ALLOWED_COBEPHIM_HOSTS.has(host)) return '';
  parsed.protocol = 'https:';
  parsed.hash = '';
  parsed.search = '';
  const parts = parsed.pathname.split('/').filter(Boolean);
  const slug = parts.at(-1) || '';
  if (!slug) return '';
  return `${BASE_URL}/xem-phim/${slug}`;
}

function parseXmlUrls(xml = '') {
  const urls = [];
  for (const match of String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const url = decodeHtml(match[1]).trim();
    if (/^https:\/\/(?:www\.)?cobephim\.(?:sbs|top)\/(?:phim|xem-phim)\/[^/?#]+\/?$/i.test(url)) {
      urls.push(normalizeCobeUrl(url));
    }
  }
  return [...new Set(urls)].filter(Boolean);
}

function extractNextFlightText(html = '') {
  let output = '';
  for (const match of String(html).matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)) {
    try {
      output += JSON.parse(`"${match[1]}"`);
    } catch {
      output += match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
  }
  return output;
}

function extractJsonObjectAfter(text = '', marker = '') {
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const objectStart = text.indexOf('{', start + marker.length);
  if (objectStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(objectStart, index + 1);
    }
  }
  return null;
}

function uniqueList(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function parseEpisodeNumber(label = '') {
  const text = String(label || '').trim();
  if (/full/i.test(text)) return 1;
  const numbers = text.match(/\d+/g);
  return numbers?.length ? Number(numbers.at(-1)) || 1 : 1;
}

function deriveHlsFromEmbed(embedUrl = '') {
  const id = String(embedUrl || '').match(/streamvsmov\.com\/video\/([a-z0-9-]+)/i)?.[1];
  return id ? `https://v1.streamvsmov.com/stream/${id}/master.m3u8` : '';
}

function isExpectedUnplayableError(message = '') {
  return /No playable CobePhim data parsed|HTTP\s+404|HTTP\s+410/i.test(String(message || ''));
}

async function fetchText(url, timeoutMs = 25000) {
  const response = await fetch(url, {
    headers: COBEPHIM_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Fetch ${url} failed: HTTP ${response.status}`);
  return response.text();
}

async function probeUrl(url, timeoutMs = 12000) {
  if (!url) return { ok: false, status: null, content_type: '', error: 'empty_url' };
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: COBEPHIM_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      ok: response.ok,
      status: response.status,
      content_type: response.headers.get('content-type') || '',
      error: '',
    };
  } catch (error) {
    return { ok: false, status: null, content_type: '', error: error.message };
  }
}

export async function fetchCobephimEntry(movieUrl) {
  const sourceUrl = normalizeCobeUrl(movieUrl);
  if (!sourceUrl) throw new Error(`Invalid CobePhim URL: ${movieUrl}`);

  const html = await fetchText(sourceUrl);
  const flightText = extractNextFlightText(html);
  const movieJson = extractJsonObjectAfter(flightText, '"movie":');
  const movie = movieJson ? JSON.parse(movieJson) : {};
  const embedUrl = firstMatch(html, /<iframe[^>]+src=["'](https?:\/\/[^"']*streamvsmov\.com\/video\/[^"']+)["']/i);
  const hlsUrl = deriveHlsFromEmbed(embedUrl);

  const latestEpisodes = Array.isArray(movie.latestEpisodes) ? movie.latestEpisodes : [];
  const fallbackEpisodeName = movie.episode_current || firstMatch(html, /Tập\s*([^<"]+)/i) || 'Full';
  const episodes = (latestEpisodes.length ? latestEpisodes : [{ name: fallbackEpisodeName }])
    .map((episode) => {
      const episodeName = String(episode.name || fallbackEpisodeName || 'Full').trim() || 'Full';
      const number = parseEpisodeNumber(episodeName);
      return {
        episode_number: number,
        episode_name: /^full$/i.test(episodeName) ? 'Full' : `Tập ${number}`,
        slug: /^full$/i.test(episodeName) ? 'full' : slugify(`tap-${number}`),
        server_name: SERVER_NAME,
        link_m3u8: hlsUrl,
        link_embed: embedUrl,
      };
    })
    .filter((episode) => episode.link_embed || episode.link_m3u8);

  const title = movie.name || firstMatch(html, /<title>Phim\s+([^<(]+)/i) || getMetaContent(html, 'og:title').replace(/^Phim\s+/i, '');
  const originName = movie.origin_name || firstMatch(getMetaContent(html, 'og:title'), /\(([^)]+)\)/);
  const slug = movie.slug || sourceUrl.split('/').filter(Boolean).at(-1) || slugify(title);
  const categories = uniqueList((movie.categories || []).map((item) => item.name));
  const countries = uniqueList((movie.regions || []).map((item) => item.name));
  const actors = uniqueList((movie.actors || []).map((item) => item.name));
  const directors = uniqueList((movie.directors || []).map((item) => item.name));
  const content = stripTags(movie.description || getMetaContent(html, 'description'));
  const year = Number(movie.publish_year || firstMatch(html, /"publish_year":(\d{4})/i) || 0) || new Date().getFullYear();
  const playableEpisodeMax = Math.max(...episodes.map((episode) => episode.episode_number), 1);
  const episodeCount = Math.max(1, Number(movie.episode_total || episodes.length || 1) || episodes.length || 1);

  const entry = {
    sourceUrl,
    sourceSlug: slug,
    sourceId: String(movie.id || ''),
    title: String(title || slug).trim(),
    originName: String(originName || '').trim(),
    content,
    type: movie.type === 'series' ? 'series' : 'single',
    status: movie.status === 'ongoing' ? 'ongoing' : 'completed',
    thumb: movie.thumbnail || getMetaContent(html, 'og:image') || '',
    poster: movie.poster || getMetaContent(html, 'twitter:image') || movie.thumbnail || '',
    trailer: movie.trailer_url || '',
    quality: movie.quality || 'HD',
    lang: movie.language || 'Vietsub',
    time: movie.episode_time || '',
    episodeCurrent: movie.episode_current || (episodeCount === 1 ? 'Full' : `Tập ${episodeCount}`),
    episodeTotal: String(movie.episode_total || episodeCount || ''),
    currentEpisode: playableEpisodeMax,
    totalEpisodes: episodeCount,
    year,
    actor: actors,
    director: directors,
    category: categories,
    country: countries,
    imdbId: String(movie.imdb_id || '').trim(),
    tmdbId: String(movie.tmdb_id || '').trim(),
    cobeMovieId: String(movie.id || ''),
    episodes,
    probe: {
      embed: await probeUrl(embedUrl),
      hls: await probeUrl(hlsUrl),
    },
  };

  if (!entry.title || !entry.episodes.length) throw new Error(`No playable CobePhim data parsed from ${sourceUrl}`);
  return entry;
}

async function fetchCobeUrls({ sitemapUrl = '', sitemapPage = 1, limit = 10, offset = 0 } = {}) {
  const url = sitemapUrl || `${BASE_URL}/phim/sitemap/${Math.max(1, Number(sitemapPage) || 1)}.xml`;
  const xml = await fetchText(url, 25000);
  const urls = parseXmlUrls(xml);
  return { sitemap_url: url, total: urls.length, urls: urls.slice(offset, offset + limit) };
}

async function fetchExistingMovie(supabase, entry) {
  const selectFields = 'id,slug,name,origin_name,title_vi,title_en,source_site,source_name,source_url,showtimes,tmdb_id,imdb_id,episode_current,episode_total,current_episode,total_episodes,quality,lang,status,is_published';
  const checks = [];
  if (entry.imdbId) checks.push(['imdb_id', entry.imdbId]);
  if (entry.tmdbId) checks.push(['tmdb_id', entry.tmdbId]);
  checks.push(['slug', entry.sourceSlug]);
  checks.push(['source_url', entry.sourceUrl]);
  checks.push(['showtimes', entry.sourceUrl]);

  for (const [column, value] of checks) {
    const { data, error } = await supabase.from('movies').select(selectFields).eq(column, value).limit(1).maybeSingle();
    if (error) throw new Error(`movies lookup ${column}: ${error.message}`);
    if (data?.id) return data;
  }

  for (const title of [entry.title, entry.originName].filter(Boolean)) {
    const { data, error } = await supabase
      .from('movies')
      .select(selectFields)
      .or(`name.eq.${title},origin_name.eq.${title},title_vi.eq.${title},title_en.eq.${title}`)
      .eq('year', entry.year)
      .limit(1)
      .maybeSingle();
    if (error) continue;
    if (data?.id && canonicalDuplicateTitle(data.name || data.origin_name) === canonicalDuplicateTitle(title)) return data;
  }

  return null;
}

async function createMovie(supabase, entry) {
  const payload = {
    slug: entry.sourceSlug,
    name: entry.title,
    origin_name: entry.originName,
    title_vi: entry.title,
    title_en: entry.originName,
    title_original: entry.originName,
    normalized_name: slugify([entry.title, entry.originName].filter(Boolean).join(' ')),
    content: entry.content,
    type: entry.type,
    status: entry.status,
    thumb_url: entry.thumb,
    poster_url: entry.poster || entry.thumb,
    quality: entry.quality,
    lang: entry.lang,
    time: entry.time,
    episode_current: entry.episodeCurrent,
    episode_total: entry.episodeTotal,
    current_episode: entry.currentEpisode,
    total_episodes: entry.totalEpisodes,
    year: entry.year,
    actor: entry.actor,
    director: entry.director,
    category: entry.category,
    country: entry.country,
    trailer_url: entry.trailer,
    notify: '',
    showtimes: entry.sourceUrl,
    source_url: entry.sourceUrl,
    source_site: SOURCE_SITE,
    source_name: SOURCE_NAME,
    ophim_id: '',
    imdb_id: entry.imdbId,
    tmdb_id: entry.tmdbId,
    is_published: true,
    last_synced_at: new Date().toISOString(),
    schedule_timezone: 'Asia/Ho_Chi_Minh',
  };
  const { data, error } = await supabase
    .from('movies')
    .insert(payload)
    .select('id,slug,name,origin_name,title_vi,title_en,source_site,source_name,source_url,showtimes,tmdb_id,imdb_id,current_episode,total_episodes')
    .single();
  if (error) throw new Error(`movies insert ${entry.sourceSlug}: ${error.message}`);
  return data;
}

async function updateMovieLightly(supabase, movie, entry) {
  const payload = {
    last_synced_at: new Date().toISOString(),
  };
  const hasPlayableUpgrade = entry.episodes.length > 0;
  const currentEpisode = Number(movie.current_episode || 0) || 0;
  const totalEpisodes = Number(movie.total_episodes || 0) || 0;
  const looksLikeTrailerOnly = /trailer|sắp|sap|updating|đang cập nhật|dang cap nhat/i.test(
    String(movie.episode_current || ''),
  );

  if (!movie.source_url) payload.source_url = entry.sourceUrl;
  if (!movie.showtimes) payload.showtimes = entry.sourceUrl;
  if (!movie.tmdb_id && entry.tmdbId) payload.tmdb_id = entry.tmdbId;
  if (!movie.imdb_id && entry.imdbId) payload.imdb_id = entry.imdbId;
  if (hasPlayableUpgrade && movie.is_published === false) payload.is_published = true;
  if ((!movie.title_vi || movie.title_vi === movie.origin_name || movie.title_vi === movie.name) && entry.title) {
    payload.title_vi = entry.title;
  }
  if (movie.name === movie.origin_name && entry.title && entry.title !== entry.originName) payload.name = entry.title;
  if (!movie.title_en && entry.originName) payload.title_en = entry.originName;
  if (hasPlayableUpgrade && (!currentEpisode || !totalEpisodes || looksLikeTrailerOnly)) {
    payload.episode_current = entry.episodeCurrent;
    payload.episode_total = entry.episodeTotal;
    payload.current_episode = entry.currentEpisode;
    payload.total_episodes = entry.totalEpisodes;
    payload.quality = entry.quality;
    payload.lang = entry.lang;
    payload.status = entry.status;
    payload.is_published = true;
  }
  if (movie.source_site === SOURCE_SITE || movie.source_name === SOURCE_NAME) {
    payload.episode_current = entry.episodeCurrent;
    payload.current_episode = entry.currentEpisode;
    payload.total_episodes = entry.totalEpisodes;
    payload.quality = entry.quality;
    payload.lang = entry.lang;
  }
  const { error } = await supabase.from('movies').update(payload).eq('id', movie.id);
  if (error) throw new Error(`movies update ${movie.slug}: ${error.message}`);
}

async function upsertPlayableRows(supabase, movie, entry) {
  const { data: episodeRows, error: episodeError } = await supabase
    .from('movie_episodes')
    .select('id,episode_number,server_name,link_embed,link_m3u8')
    .eq('movie_id', movie.id);
  if (episodeError) throw new Error(`movie_episodes select ${movie.slug}: ${episodeError.message}`);

  const existingEpisodes = new Map(
    (episodeRows || []).map((row) => [`${String(row.server_name || '').toLowerCase().trim()}|${Number(row.episode_number || 0)}`, row]),
  );
  let episodesInserted = 0;
  let episodesUpdated = 0;
  for (const episode of entry.episodes) {
    const key = `${episode.server_name.toLowerCase()}|${episode.episode_number}`;
    const existing = existingEpisodes.get(key);
    const payload = {
      movie_id: movie.id,
      episode_number: episode.episode_number,
      episode_name: episode.episode_name,
      slug: episode.slug,
      server_name: episode.server_name,
      link_m3u8: episode.link_m3u8 || '',
      link_embed: episode.link_embed || '',
      subtitle_url: '',
      thumbnail_url: entry.thumb || '',
      duration: entry.time || '',
      source: SOURCE_SITE,
      is_backup: movie.source_site !== SOURCE_SITE,
    };
    if (existing?.id) {
      const shouldUpdate =
        String(existing.link_embed || '') !== payload.link_embed || String(existing.link_m3u8 || '') !== payload.link_m3u8;
      if (shouldUpdate) {
        const { error } = await supabase.from('movie_episodes').update(payload).eq('id', existing.id);
        if (error) throw new Error(`movie_episodes update ${movie.slug}: ${error.message}`);
        episodesUpdated += 1;
      }
      continue;
    }
    const { error } = await supabase.from('movie_episodes').insert(payload);
    if (error) {
      if (/duplicate key value/i.test(error.message || '')) {
        const { error: duplicateUpdateError } = await supabase
          .from('movie_episodes')
          .update(payload)
          .eq('movie_id', movie.id)
          .eq('server_name', episode.server_name)
          .eq('episode_number', episode.episode_number);
        if (duplicateUpdateError) throw new Error(`movie_episodes duplicate update ${movie.slug}: ${duplicateUpdateError.message}`);
        episodesUpdated += 1;
        continue;
      }
      throw new Error(`movie_episodes insert ${movie.slug}: ${error.message}`);
    }
    episodesInserted += 1;
  }

  let streamsInserted = 0;
  let streamsUpdated = 0;
  for (const episode of entry.episodes) {
    const payload = {
      movie_id: movie.id,
      ophim_id: entry.cobeMovieId ? `cobephim-${entry.cobeMovieId}` : '',
      server_name: episode.server_name,
      episode_slug: episode.slug,
      stream_url: episode.link_m3u8 || '',
      embed_url: episode.link_embed || '',
      subtitle_url: '',
      source: SOURCE_SITE,
      quality: entry.quality,
      priority: movie.source_site === SOURCE_SITE ? 45 : 25,
      is_active: true,
      health_status: entry.probe.hls.ok || entry.probe.embed.ok ? 'ok' : 'unchecked',
      failure_count: 0,
      last_error: '',
    };
    const { data: existing, error: lookupError } = await supabase
      .from('streams')
      .select('id,stream_url,embed_url')
      .eq('movie_id', movie.id)
      .eq('source', SOURCE_SITE)
      .eq('is_active', true)
      .ilike('server_name', episode.server_name)
      .ilike('episode_slug', episode.slug)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw new Error(`streams lookup ${movie.slug}: ${lookupError.message}`);
    if (existing?.id) {
      const urlChanged = String(existing.stream_url || '') !== String(payload.stream_url || '')
        || String(existing.embed_url || '') !== String(payload.embed_url || '');
      const updatePayload = urlChanged
        ? payload
        : Object.fromEntries(Object.entries(payload).filter(([key]) => !['health_status', 'failure_count', 'last_error'].includes(key)));
      const { error } = await supabase.from('streams').update(updatePayload).eq('id', existing.id);
      if (error) throw new Error(`streams update ${movie.slug}: ${error.message}`);
      streamsUpdated += 1;
      continue;
    }
    const { error } = await supabase.from('streams').insert(payload);
    if (error) throw new Error(`streams insert ${movie.slug}: ${error.message}`);
    streamsInserted += 1;
  }
  return { episodes_inserted: episodesInserted, episodes_updated: episodesUpdated, streams_inserted: streamsInserted, streams_updated: streamsUpdated };
}

async function clearCaches(supabase, slugs = []) {
  try {
    if (slugs.length) await supabase.from('movie_api_cache').delete().in('slug', slugs);
  } catch {
    // Cache table is optional in local/dev projects.
  }
}

async function writeSyncLog(supabase, payload) {
  try {
    await supabase.from('sync_logs').insert({
      function_name: 'external-sync-cobephim',
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

export function makeSupabaseClient({ supabaseUrl, serviceRoleKey }) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export async function runCobephimSync({
  supabase,
  movieUrl = '',
  sitemapUrl = '',
  sitemapPage = 1,
  limit = 10,
  offset = 0,
  dryRun = false,
} = {}) {
  const started = Date.now();
  const errors = [];
  const entries = [];
  const skipped = [];
  const discovery = movieUrl
    ? { sitemap_url: '', total: 1, urls: [normalizeCobeUrl(movieUrl)] }
    : await fetchCobeUrls({ sitemapUrl, sitemapPage, limit, offset });

  for (const url of discovery.urls) {
    try {
      entries.push(await fetchCobephimEntry(url));
    } catch (error) {
      const message = `${url}: ${error.message}`;
      if (isExpectedUnplayableError(error.message)) skipped.push(message);
      else errors.push(message);
    }
  }

  if (dryRun || !supabase) {
    return {
      success: errors.length === 0,
      dry_run: true,
      sitemap_url: discovery.sitemap_url,
      scanned: discovery.urls.length,
      total_urls: discovery.total,
      parsed: entries.length,
      sample: entries.slice(0, 10).map((entry) => ({
        title: entry.title,
        origin_name: entry.originName,
        source_url: entry.sourceUrl,
        tmdb_id: entry.tmdbId,
        imdb_id: entry.imdbId,
        episodes: entry.episodes.length,
        embed_ok: entry.probe.embed.ok,
        hls_ok: entry.probe.hls.ok,
      })),
      errors,
      skipped_unplayable: skipped,
      elapsed_ms: Date.now() - started,
    };
  }

  let matched = 0;
  let created = 0;
  const changedSlugs = [];
  const rowSummary = { episodes_inserted: 0, episodes_updated: 0, streams_inserted: 0, streams_updated: 0 };

  for (const entry of entries) {
    try {
      let movie = await fetchExistingMovie(supabase, entry);
      if (!movie) {
        movie = await createMovie(supabase, entry);
        created += 1;
      } else {
        matched += 1;
        await updateMovieLightly(supabase, movie, entry);
      }
      const rows = await upsertPlayableRows(supabase, movie, entry);
      Object.keys(rowSummary).forEach((key) => {
        rowSummary[key] += rows[key] || 0;
      });
      changedSlugs.push(movie.slug);
    } catch (error) {
      errors.push(`${entry.title}: ${error.message}`);
    }
  }

  await clearCaches(supabase, changedSlugs);
  const result = {
    success: errors.length === 0,
    sitemap_url: discovery.sitemap_url,
    scanned: discovery.urls.length,
    total_urls: discovery.total,
    parsed: entries.length,
    matched,
    created,
    ...rowSummary,
    changed_slugs: changedSlugs,
    errors,
    skipped_unplayable: skipped,
    elapsed_ms: Date.now() - started,
  };
  await writeSyncLog(supabase, result);
  return result;
}
