import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const BASE_URL = 'https://cobephim.top';
const SOURCE_SITE = 'cobephim';
const SOURCE_NAME = 'CobePhim / StreamVSMov';
const SERVER_NAME = 'CobePhim StreamVSMov';
const SITEMAP_PAGE_SIZE = 1000;

type SupabaseClient = ReturnType<typeof createClient>;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 KhoPhim-Sync/1.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${BASE_URL}/`,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

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

function firstMatch(value: string, pattern: RegExp) {
  return decodeHtml(String(value || '').match(pattern)?.[1] || '').trim();
}

function getMetaContent(html: string, property: string) {
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
  parsed.protocol = 'https:';
  parsed.hash = '';
  parsed.search = '';
  const slug = parsed.pathname.split('/').filter(Boolean).at(-1) || '';
  return slug ? `${BASE_URL}/xem-phim/${slug}` : '';
}

function parseXmlUrls(xml = '') {
  const urls: string[] = [];
  for (const match of String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const url = decodeHtml(match[1]).trim();
    if (/^https:\/\/cobephim\.top\/(?:phim|xem-phim)\/[^/?#]+\/?$/i.test(url)) {
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

function uniqueList(values: unknown[] = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function parseEpisodeNumber(label = '') {
  if (/full/i.test(label)) return 1;
  const numbers = String(label || '').match(/\d+/g);
  return numbers?.length ? Number(numbers.at(-1)) || 1 : 1;
}

function deriveHlsFromEmbed(embedUrl = '') {
  const id = String(embedUrl || '').match(/streamvsmov\.com\/video\/([a-z0-9-]+)/i)?.[1];
  return id ? `https://v1.streamvsmov.com/stream/${id}/master.m3u8` : '';
}

async function fetchText(url: string, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrl(url = '', timeoutMs = 10000) {
  if (!url) return { ok: false, status: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCobephimEntry(movieUrl: string) {
  const sourceUrl = normalizeCobeUrl(movieUrl);
  if (!sourceUrl) throw new Error(`Invalid URL: ${movieUrl}`);

  const html = await fetchText(sourceUrl);
  const flightText = extractNextFlightText(html);
  const movieJson = extractJsonObjectAfter(flightText, '"movie":');
  const movie = movieJson ? JSON.parse(movieJson) : {};
  const embedUrl = firstMatch(html, /<iframe[^>]+src=["'](https?:\/\/[^"']*streamvsmov\.com\/video\/[^"']+)["']/i);
  const hlsUrl = deriveHlsFromEmbed(embedUrl);
  const latestEpisodes = Array.isArray(movie.latestEpisodes) ? movie.latestEpisodes : [];
  const fallbackEpisodeName = movie.episode_current || 'Full';
  const episodes = (latestEpisodes.length ? latestEpisodes : [{ name: fallbackEpisodeName }])
    .map((episode: Record<string, unknown>) => {
      const episodeName = String(episode.name || fallbackEpisodeName || 'Full').trim() || 'Full';
      const number = parseEpisodeNumber(episodeName);
      return {
        episode_number: number,
        episode_name: /^full$/i.test(episodeName) ? 'Full' : `Tap ${number}`,
        slug: /^full$/i.test(episodeName) ? 'full' : slugify(`tap-${number}`),
        server_name: SERVER_NAME,
        link_m3u8: hlsUrl,
        link_embed: embedUrl,
      };
    })
    .filter((episode: Record<string, string>) => episode.link_embed || episode.link_m3u8);

  const title = movie.name || firstMatch(html, /<title>Phim\s+([^<(]+)/i) || getMetaContent(html, 'og:title').replace(/^Phim\s+/i, '');
  const originName = movie.origin_name || firstMatch(getMetaContent(html, 'og:title'), /\(([^)]+)\)/);
  const sourceSlug = movie.slug || sourceUrl.split('/').filter(Boolean).at(-1) || slugify(title);
  const year = Number(movie.publish_year || firstMatch(html, /"publish_year":(\d{4})/i) || 0) || new Date().getFullYear();
  const episodeCount = Math.max(1, Number(movie.episode_total || episodes.length || 1) || episodes.length || 1);
  const probe = { embed: await probeUrl(embedUrl), hls: await probeUrl(hlsUrl) };

  const entry = {
    sourceUrl,
    sourceSlug,
    title: String(title || sourceSlug).trim(),
    originName: String(originName || '').trim(),
    content: stripTags(movie.description || getMetaContent(html, 'description')),
    type: movie.type === 'series' ? 'series' : 'single',
    status: movie.status === 'ongoing' ? 'ongoing' : 'completed',
    thumb: movie.thumbnail || getMetaContent(html, 'og:image') || '',
    poster: movie.poster || getMetaContent(html, 'twitter:image') || movie.thumbnail || '',
    trailer: movie.trailer_url || '',
    quality: movie.quality || 'HD',
    lang: movie.language || 'Vietsub',
    time: movie.episode_time || '',
    episodeCurrent: movie.episode_current || (episodeCount === 1 ? 'Full' : `Tap ${episodeCount}`),
    episodeTotal: String(movie.episode_total || episodeCount || ''),
    currentEpisode: Math.max(...episodes.map((episode: Record<string, number>) => episode.episode_number), episodeCount),
    totalEpisodes: episodeCount,
    year,
    actor: uniqueList((movie.actors || []).map((item: Record<string, unknown>) => item.name)),
    director: uniqueList((movie.directors || []).map((item: Record<string, unknown>) => item.name)),
    category: uniqueList((movie.categories || []).map((item: Record<string, unknown>) => item.name)),
    country: uniqueList((movie.regions || []).map((item: Record<string, unknown>) => item.name)),
    imdbId: String(movie.imdb_id || '').trim(),
    tmdbId: String(movie.tmdb_id || '').trim(),
    cobeMovieId: String(movie.id || ''),
    episodes,
    probe,
  };

  if (!entry.title || !entry.episodes.length) throw new Error('No playable CobePhim data parsed');
  return entry;
}

async function fetchUrls(sitemapPage: number, offset: number, limit: number) {
  const sitemapUrl = `${BASE_URL}/phim/sitemap/${Math.max(1, sitemapPage)}.xml`;
  const xml = await fetchText(sitemapUrl);
  const urls = parseXmlUrls(xml);
  return { sitemapUrl, total: urls.length, urls: urls.slice(offset, offset + limit) };
}

async function readGlobalCursor(supabase: SupabaseClient, key: string) {
  const { data } = await supabase.from('sync_cursors').select('page').eq('key', key).maybeSingle();
  return Math.max(0, Number(data?.page || 1) - 1);
}

async function writeGlobalCursor(supabase: SupabaseClient, key: string, globalOffset: number) {
  await supabase
    .from('sync_cursors')
    .upsert({ key, page: globalOffset + 1, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

async function findExistingMovie(supabase: SupabaseClient, entry: Record<string, unknown>) {
  const fields = 'id,slug,name,origin_name,title_vi,title_en,source_site,source_name,source_url,showtimes,tmdb_id,imdb_id,current_episode,total_episodes';
  const checks: Array<[string, string]> = [];
  if (entry.imdbId) checks.push(['imdb_id', String(entry.imdbId)]);
  if (entry.tmdbId) checks.push(['tmdb_id', String(entry.tmdbId)]);
  checks.push(['slug', String(entry.sourceSlug)]);
  checks.push(['source_url', String(entry.sourceUrl)]);
  checks.push(['showtimes', String(entry.sourceUrl)]);

  for (const [column, value] of checks) {
    const { data, error } = await supabase.from('movies').select(fields).eq(column, value).limit(1).maybeSingle();
    if (error) throw error;
    if (data?.id) return data;
  }

  for (const title of [entry.title, entry.originName].filter(Boolean)) {
    const { data } = await supabase
      .from('movies')
      .select(fields)
      .or(`name.eq.${title},origin_name.eq.${title},title_vi.eq.${title},title_en.eq.${title}`)
      .eq('year', entry.year)
      .limit(1)
      .maybeSingle();
    if (data?.id && canonicalDuplicateTitle(data.name || data.origin_name) === canonicalDuplicateTitle(String(title))) return data;
  }
  return null;
}

async function createMovie(supabase: SupabaseClient, entry: Record<string, unknown>) {
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
  const { data, error } = await supabase.from('movies').insert(payload).select('id,slug,source_site,source_name').single();
  if (error) throw error;
  return data;
}

async function updateMovieLightly(supabase: SupabaseClient, movie: Record<string, unknown>, entry: Record<string, unknown>) {
  const payload: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
  if (!movie.source_url) payload.source_url = entry.sourceUrl;
  if (!movie.showtimes) payload.showtimes = entry.sourceUrl;
  if (!movie.tmdb_id && entry.tmdbId) payload.tmdb_id = entry.tmdbId;
  if (!movie.imdb_id && entry.imdbId) payload.imdb_id = entry.imdbId;
  if (movie.source_site === SOURCE_SITE || movie.source_name === SOURCE_NAME) {
    payload.episode_current = entry.episodeCurrent;
    payload.current_episode = entry.currentEpisode;
    payload.total_episodes = entry.totalEpisodes;
    payload.quality = entry.quality;
    payload.lang = entry.lang;
  }
  const { error } = await supabase.from('movies').update(payload).eq('id', movie.id);
  if (error) throw error;
}

async function upsertPlayableRows(supabase: SupabaseClient, movie: Record<string, unknown>, entry: Record<string, unknown>) {
  let episodesInserted = 0;
  let episodesUpdated = 0;
  let streamsInserted = 0;
  let streamsUpdated = 0;
  const episodes = entry.episodes as Array<Record<string, unknown>>;
  const { data: existingEpisodeRows, error: episodeError } = await supabase
    .from('movie_episodes')
    .select('id,episode_number,server_name,link_embed,link_m3u8')
    .eq('movie_id', movie.id);
  if (episodeError) throw episodeError;
  const existingEpisodes = new Map(
    (existingEpisodeRows || []).map((row: Record<string, unknown>) => [`${String(row.server_name || '').toLowerCase().trim()}|${Number(row.episode_number || 0)}`, row]),
  );

  for (const episode of episodes) {
    const key = `${String(episode.server_name).toLowerCase()}|${Number(episode.episode_number)}`;
    const episodePayload = {
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
    const existingEpisode = existingEpisodes.get(key) as Record<string, unknown> | undefined;
    if (existingEpisode?.id) {
      const shouldUpdate =
        String(existingEpisode.link_embed || '') !== String(episodePayload.link_embed || '') ||
        String(existingEpisode.link_m3u8 || '') !== String(episodePayload.link_m3u8 || '');
      if (shouldUpdate) {
        const { error } = await supabase.from('movie_episodes').update(episodePayload).eq('id', existingEpisode.id);
        if (error) throw error;
        episodesUpdated += 1;
      }
    } else {
      const { error } = await supabase.from('movie_episodes').insert(episodePayload);
      if (error) throw error;
      episodesInserted += 1;
    }

    const { data: streamRow, error: streamLookupError } = await supabase
      .from('streams')
      .select('id')
      .eq('movie_id', movie.id)
      .eq('source', SOURCE_SITE)
      .eq('is_active', true)
      .ilike('server_name', String(episode.server_name))
      .ilike('episode_slug', String(episode.slug))
      .limit(1)
      .maybeSingle();
    if (streamLookupError) throw streamLookupError;
    const streamPayload = {
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
      health_status: (entry.probe as Record<string, Record<string, unknown>>).hls?.ok || (entry.probe as Record<string, Record<string, unknown>>).embed?.ok ? 'ok' : 'unchecked',
      failure_count: 0,
      last_error: '',
    };
    if (streamRow?.id) {
      const { error } = await supabase.from('streams').update(streamPayload).eq('id', streamRow.id);
      if (error) throw error;
      streamsUpdated += 1;
    } else {
      const { error } = await supabase.from('streams').insert(streamPayload);
      if (error) throw error;
      streamsInserted += 1;
    }
  }
  return { episodesInserted, episodesUpdated, streamsInserted, streamsUpdated };
}

async function clearCaches(supabase: SupabaseClient, slugs: string[]) {
  if (!slugs.length) return;
  await supabase.from('movie_api_cache').delete().in('slug', slugs);
}

async function writeLog(supabase: SupabaseClient, result: Record<string, unknown>) {
  await supabase.from('sync_logs').insert({
    function_name: 'sync-cobephim-feed',
    run_at: new Date().toISOString(),
    scanned: result.scanned || 0,
    added: result.created || 0,
    skipped: result.matched || 0,
    errors: Array.isArray(result.errors) ? result.errors.length : 0,
    details: result.errors || [],
    elapsed_ms: result.elapsed_ms || 0,
    success: result.success !== false,
    metadata: result,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  const started = Date.now();
  const url = new URL(req.url);
  const expectedSecrets = [Deno.env.get('CRON_SECRET'), Deno.env.get('COBEPHIM_SYNC_SECRET')]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const providedSecret = req.headers.get('x-cron-secret') || url.searchParams.get('secret') || '';
  if (expectedSecrets.length && !expectedSecrets.includes(providedSecret)) return json({ success: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase env' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const dryRun = url.searchParams.get('dry_run') === '1';
  const useCursor = url.searchParams.get('use_cursor') !== '0';
  const cursorKey = url.searchParams.get('cursor_key') || 'cobephim_global_offset';
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 10) || 10, 30));
  let sitemapPage = Math.max(1, Number(url.searchParams.get('sitemap_page') || 1) || 1);
  let offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
  if (useCursor && !url.searchParams.has('offset') && !url.searchParams.has('sitemap_page')) {
    const globalOffset = await readGlobalCursor(supabase, cursorKey);
    sitemapPage = Math.floor(globalOffset / SITEMAP_PAGE_SIZE) + 1;
    offset = globalOffset % SITEMAP_PAGE_SIZE;
  }

  const errors: string[] = [];
  const skippedUnplayable: string[] = [];
  const changedSlugs: string[] = [];
  let parsed = 0;
  let matched = 0;
  let created = 0;
  let episodesInserted = 0;
  let episodesUpdated = 0;
  let streamsInserted = 0;
  let streamsUpdated = 0;
  const discovery = await fetchUrls(sitemapPage, offset, limit);

  for (const movieUrl of discovery.urls) {
    try {
      const entry = await fetchCobephimEntry(movieUrl);
      parsed += 1;
      if (dryRun) continue;
      let movie = await findExistingMovie(supabase, entry);
      if (movie) {
        matched += 1;
        await updateMovieLightly(supabase, movie, entry);
      } else {
        movie = await createMovie(supabase, entry);
        created += 1;
      }
      const rows = await upsertPlayableRows(supabase, movie, entry);
      episodesInserted += rows.episodesInserted;
      episodesUpdated += rows.episodesUpdated;
      streamsInserted += rows.streamsInserted;
      streamsUpdated += rows.streamsUpdated;
      changedSlugs.push(String(movie.slug));
    } catch (error) {
      const message = `${movieUrl}: ${error instanceof Error ? error.message : String(error)}`;
      if (/No playable CobePhim data parsed/i.test(message)) skippedUnplayable.push(message);
      else errors.push(message);
    }
  }

  if (!dryRun) {
    await clearCaches(supabase, changedSlugs);
    if (useCursor && errors.length === 0) {
      await writeGlobalCursor(supabase, cursorKey, (sitemapPage - 1) * SITEMAP_PAGE_SIZE + offset + discovery.urls.length);
    }
  }

  const result = {
    success: errors.length === 0,
    dry_run: dryRun,
    sitemap_page: sitemapPage,
    offset,
    limit,
    scanned: discovery.urls.length,
    total_urls_in_sitemap: discovery.total,
    parsed,
    matched,
    created,
    episodes_inserted: episodesInserted,
    episodes_updated: episodesUpdated,
    streams_inserted: streamsInserted,
    streams_updated: streamsUpdated,
    changed_slugs: changedSlugs,
    skipped_unplayable: skippedUnplayable,
    errors,
    elapsed_ms: Date.now() - started,
  };
  if (!dryRun) await writeLog(supabase, result);
  return json(result, result.success ? 200 : 207);
});
