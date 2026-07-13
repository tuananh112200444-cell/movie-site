import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'https://motchilltv.uno';
const SOURCE_SITE = 'motchill';
const SOURCE_NAME = 'Motchill / StreamC';
const SERVER_NAME = 'Motchill StreamC';

const HEADERS = {
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

function uniqueList(values = []) {
  return [...new Set(values.map((value) => stripTags(value)).filter(Boolean))];
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

function taxonomyItems(values = []) {
  return uniqueList(values).map((name) => ({ name, slug: slugify(name) }));
}

function getMetaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return firstMatch(
    html,
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
  );
}

function normalizeMotchillUrl(rawUrl = '') {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  const parsed = new URL(value, BASE_URL);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'motchilltv.uno') return '';
  parsed.protocol = 'https:';
  parsed.hash = '';
  parsed.search = '';
  const parts = parsed.pathname.split('/').filter(Boolean);
  const kind = parts[0] || '';
  const slug = parts[1] || '';
  if (!slug || !['tvshows', 'movies'].includes(kind)) return '';
  return `${BASE_URL}/${kind}/${slug}/`;
}

function parseEpisodeNumber(label = '') {
  const text = stripTags(label);
  if (/full/i.test(text)) return 1;
  const numbers = text.match(/\d+/g);
  return numbers?.length ? Number(numbers.at(-1)) || 1 : 1;
}

async function fetchText(url, timeoutMs = 25000, options = {}) {
  const response = await fetch(url, {
    headers: { ...HEADERS, ...(options.headers || {}) },
    method: options.method || 'GET',
    body: options.body,
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
      headers: HEADERS,
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

function parseFieldByLabel(html = '', label = '') {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return stripTags(firstMatch(html, new RegExp(`<span>\\s*${escaped}\\s*:<\\/span>\\s*([\\s\\S]*?)<\\/p>`, 'i')));
}

function parseListByLabel(html = '', label = '') {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = firstMatch(html, new RegExp(`<span>\\s*${escaped}\\s*:<\\/span>\\s*([\\s\\S]*?)<\\/p>`, 'i'));
  return uniqueList([...block.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => match[1]));
}

function parseEpisodeLinks(movieHtml = '') {
  const links = [];
  const seen = new Set();
  const pattern = /<a\b([^>]*?)href=["'](https?:\/\/(?:www\.)?motchilltv\.uno\/episodes\/[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of movieHtml.matchAll(pattern)) {
    const attrs = `${match[1] || ''} ${match[3] || ''}`;
    if (/\bnonex\b/i.test(attrs)) continue;
    const label = stripTags(match[4]);
    const episodeNumber = parseEpisodeNumber(label);
    const url = decodeHtml(match[2]).replace(/^https:\/\/www\./i, 'https://');
    const key = `${episodeNumber}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ url, label, episodeNumber });
  }
  return links.sort((a, b) => a.episodeNumber - b.episodeNumber);
}

function parsePlayerOptions(episodeHtml = '') {
  const options = [];
  const pattern =
    /<li[^>]+class=["'][^"']*dooplay_player_option[^"']*["'][^>]*data-type=["']([^"']+)["'][^>]*data-post=["']([^"']+)["'][^>]*data-nume=["']([^"']+)["'][^>]*>/gi;
  for (const match of episodeHtml.matchAll(pattern)) {
    options.push({ type: match[1], post: match[2], nume: match[3] });
  }
  const commentPostId = firstMatch(episodeHtml, /name=["']comment_post_ID["']\s+value=["'](\d+)["']/i);
  if (!options.length && commentPostId) {
    options.push({ type: 'tv', post: commentPostId, nume: '1' });
  }
  return options;
}

async function fetchPlayerEmbed(episodeUrl, episodeHtml) {
  const options = parsePlayerOptions(episodeHtml);
  const tried = new Set();
  for (const option of options) {
    for (const type of [option.type, 'tv', 'episode', 'tvshows', 'movies'].filter(Boolean)) {
      const key = `${option.post}|${option.nume}|${type}`;
      if (tried.has(key)) continue;
      tried.add(key);
      const body = new URLSearchParams({
        action: 'doo_player_ajax',
        post: option.post,
        nume: option.nume,
        type,
      });
      try {
        const text = await fetchText(`${BASE_URL}/wp-admin/admin-ajax.php`, 15000, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: episodeUrl,
          },
          body,
        });
        const payload = JSON.parse(text);
        const embedUrl = decodeHtml(payload.embed_url || '').trim();
        if (/^https?:\/\//i.test(embedUrl)) return embedUrl;
      } catch {
        // Try the next available player option.
      }
    }
  }
  return firstMatch(episodeHtml, /<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
}

async function fetchEpisode(episode) {
  const html = await fetchText(episode.url);
  const embedUrl = await fetchPlayerEmbed(episode.url, html);
  if (!embedUrl) return null;
  return {
    episode_number: episode.episodeNumber,
    episode_name: /^full$/i.test(episode.label) ? 'Full' : `Tập ${episode.episodeNumber}`,
    slug: /^full$/i.test(episode.label) ? 'full' : slugify(`tap-${episode.episodeNumber}`),
    server_name: SERVER_NAME,
    link_m3u8: '',
    link_embed: embedUrl,
    source_episode_url: episode.url,
    probe: await probeUrl(embedUrl),
  };
}

export async function fetchMotchillEntry(movieUrl) {
  const sourceUrl = normalizeMotchillUrl(movieUrl);
  if (!sourceUrl) throw new Error(`Invalid Motchill URL: ${movieUrl}`);

  const html = await fetchText(sourceUrl);
  const rawPageTitle = getMetaContent(html, 'og:title') || firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const cleanPageTitle = stripTags(rawPageTitle)
    .replace(/\s+Full\s+(Vietsub|Thuyết Minh|Lồng Tiếng).*$/i, '')
    .replace(/\s+-\s+Motchill.*$/i, '')
    .trim();
  const titleFromMeta = firstMatch(cleanPageTitle, /^(.+?)\s+-\s+.+?\s+\(\d{4}\)/i) || cleanPageTitle.replace(/\s+\(\d{4}\).*$/i, '');
  const originNameFromMeta = firstMatch(cleanPageTitle, /^.+?\s+-\s+(.+?)\s+\(\d{4}\)/i);
  const title = titleFromMeta || firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const originName = originNameFromMeta || '';
  const sourceSlug = sourceUrl.split('/').filter(Boolean).at(-1) || slugify(title);
  const episodeLinks = parseEpisodeLinks(html);
  const episodes = (await Promise.all(episodeLinks.map((episode) => fetchEpisode(episode)))).filter(Boolean);
  const playableMax = Math.max(...episodes.map((episode) => episode.episode_number), 1);
  const declaredTotal = Number(firstMatch(html, /Số Tập Phim:\s*<\/span>\s*(\d+)/i) || firstMatch(html, /(\d+)\s*Tập/i) || 0) || Math.max(episodeLinks.length, playableMax, 1);
  const type = /\/movies\//i.test(sourceUrl) || declaredTotal <= 1 ? 'single' : 'series';
  const status = playableMax >= declaredTotal && declaredTotal > 1 ? 'completed' : 'ongoing';
  const year = Number(firstMatch(html, /<a[^>]+\/release\/\d{4}\/[^>]*>(\d{4})<\/a>/i) || firstMatch(html, /\b(20\d{2}|19\d{2})\b/) || new Date().getFullYear());

  const entry = {
    sourceUrl,
    sourceSlug,
    sourceId: firstMatch(html, /<article[^>]+id=["']post-(\d+)["']/i) || firstMatch(html, /data-id=["'](\d+)["']/i),
    title: stripTags(title || sourceSlug),
    originName: stripTags(originName || ''),
    content: stripTags(firstMatch(html, /<div[^>]+class=["'][^"']*wp-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) || getMetaContent(html, 'description')),
    type,
    status,
    thumb: getMetaContent(html, 'og:image') || firstMatch(html, /<img[^>]+src=["']([^"']+)["'][^>]+alt=["'][^"']*${sourceSlug}/i),
    poster: getMetaContent(html, 'og:image') || '',
    trailer: firstMatch(html, /<iframe[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*><\/iframe>/i),
    quality: parseFieldByLabel(html, 'Chất Lượng') || 'HD',
    lang: /thuyết minh|thuyet minh/i.test(html) ? 'Thuyết Minh' : 'Vietsub',
    time: parseFieldByLabel(html, 'Thời Lượng'),
    episodeCurrent: declaredTotal === 1 ? 'Full' : `Tập ${playableMax}`,
    episodeTotal: String(declaredTotal || ''),
    currentEpisode: playableMax,
    totalEpisodes: declaredTotal,
    year,
    actor: parseListByLabel(html, 'Diễn Viên'),
    director: parseListByLabel(html, 'Đạo diễn'),
    category: taxonomyItems(parseListByLabel(html, 'Thể Loại')),
    country: taxonomyItems(parseListByLabel(html, 'Quốc Gia')),
    imdbId: '',
    tmdbId: '',
    episodes,
    probe: {
      embed_ok: episodes.some((episode) => episode.link_embed && episode.probe.status !== 404 && episode.probe.status !== 410),
    },
  };

  if (!entry.title || !entry.episodes.length) throw new Error(`No playable Motchill data parsed from ${sourceUrl}`);
  return entry;
}

export async function searchMotchill(query, limit = 10) {
  const home = await fetchText(BASE_URL, 25000);
  const nonce = firstMatch(home, /var\s+dtGonza\s*=\s*\{[\s\S]*?"nonce"\s*:\s*"([^"]+)"/i) || firstMatch(home, /"nonce"\s*:\s*"([^"]+)"/i);
  if (!nonce) throw new Error('Motchill search nonce not found');
  const url = `${BASE_URL}/wp-json/dooplay/search/?keyword=${encodeURIComponent(query)}&nonce=${encodeURIComponent(nonce)}`;
  const text = await fetchText(url, 15000, { headers: { Accept: 'application/json,*/*' } });
  const payload = JSON.parse(text);
  return Object.entries(payload || {})
    .slice(0, limit)
    .map(([, item]) => ({
      title: stripTags(item.title || ''),
      url: normalizeMotchillUrl(item.url || ''),
      image: item.img || '',
      year: item.extra?.date || '',
    }))
    .filter((item) => item.url);
}

async function fetchExistingMovie(supabase, entry) {
  const selectFields = 'id,slug,name,origin_name,title_vi,title_en,source_site,source_name,source_url,showtimes,tmdb_id,imdb_id,episode_current,episode_total,current_episode,total_episodes,quality,lang,status,is_published';
  for (const [column, value] of [
    ['slug', entry.sourceSlug],
    ['source_url', entry.sourceUrl],
    ['showtimes', entry.sourceUrl],
  ]) {
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
    ophim_id: entry.sourceId ? `motchill-${entry.sourceId}` : '',
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
  const currentEpisode = Number(movie.current_episode || 0) || 0;
  const totalEpisodes = Number(movie.total_episodes || 0) || 0;
  const hasPlayableUpgrade = entry.currentEpisode > currentEpisode || entry.episodes.length > 0;
  const looksLikeTrailerOnly = /trailer|sắp|sap|updating|đang cập nhật|dang cap nhat/i.test(String(movie.episode_current || ''));

  if (!movie.source_url) payload.source_url = entry.sourceUrl;
  if (!movie.showtimes) payload.showtimes = entry.sourceUrl;
  if (hasPlayableUpgrade && movie.is_published === false) payload.is_published = true;
  if ((!movie.title_vi || movie.title_vi === movie.origin_name || movie.title_vi === movie.name) && entry.title) payload.title_vi = entry.title;
  if (movie.name === movie.origin_name && entry.title && entry.title !== entry.originName) payload.name = entry.title;
  if (!movie.title_en && entry.originName) payload.title_en = entry.originName;
  if (hasPlayableUpgrade && (entry.currentEpisode >= currentEpisode || !currentEpisode || !totalEpisodes || looksLikeTrailerOnly)) {
    payload.episode_current = entry.episodeCurrent;
    payload.episode_total = entry.episodeTotal;
    payload.current_episode = entry.currentEpisode;
    payload.total_episodes = Math.max(entry.totalEpisodes, totalEpisodes);
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
  let episodesInserted = 0;
  let episodesUpdated = 0;
  let streamsInserted = 0;
  let streamsUpdated = 0;

  for (const episode of entry.episodes) {
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
    const { data: existingEpisode, error: episodeLookupError } = await supabase
      .from('movie_episodes')
      .select('id,link_embed,link_m3u8')
      .eq('movie_id', movie.id)
      .eq('server_name', episode.server_name)
      .eq('episode_number', episode.episode_number)
      .limit(1)
      .maybeSingle();
    if (episodeLookupError) throw new Error(`movie_episodes lookup ${movie.slug}: ${episodeLookupError.message}`);
    if (existingEpisode?.id) {
      const { error } = await supabase.from('movie_episodes').update(payload).eq('id', existingEpisode.id);
      if (error) throw new Error(`movie_episodes update ${movie.slug}: ${error.message}`);
      episodesUpdated += 1;
    } else {
      const { error } = await supabase.from('movie_episodes').insert(payload);
      if (error) throw new Error(`movie_episodes insert ${movie.slug}: ${error.message}`);
      episodesInserted += 1;
    }

    const streamPayload = {
      movie_id: movie.id,
      ophim_id: entry.sourceId ? `motchill-${entry.sourceId}` : '',
      server_name: episode.server_name,
      episode_slug: episode.slug,
      stream_url: episode.link_m3u8 || '',
      embed_url: episode.link_embed || '',
      subtitle_url: '',
      source: SOURCE_SITE,
      quality: entry.quality,
      priority: movie.source_site === SOURCE_SITE ? 43 : 23,
      is_active: true,
      health_status: episode.probe.ok ? 'ok' : 'unchecked',
      failure_count: 0,
      last_error: '',
    };
    const { data: existingStream, error: streamLookupError } = await supabase
      .from('streams')
      .select('id')
      .eq('movie_id', movie.id)
      .eq('source', SOURCE_SITE)
      .eq('is_active', true)
      .ilike('server_name', episode.server_name)
      .ilike('episode_slug', episode.slug)
      .limit(1)
      .maybeSingle();
    if (streamLookupError) throw new Error(`streams lookup ${movie.slug}: ${streamLookupError.message}`);
    if (existingStream?.id) {
      const { error } = await supabase.from('streams').update(streamPayload).eq('id', existingStream.id);
      if (error) throw new Error(`streams update ${movie.slug}: ${error.message}`);
      streamsUpdated += 1;
    } else {
      const { error } = await supabase.from('streams').insert(streamPayload);
      if (error) throw new Error(`streams insert ${movie.slug}: ${error.message}`);
      streamsInserted += 1;
    }
  }
  return { episodes_inserted: episodesInserted, episodes_updated: episodesUpdated, streams_inserted: streamsInserted, streams_updated: streamsUpdated };
}

async function clearCaches(supabase, slugs = []) {
  try {
    if (slugs.length) await supabase.from('movie_api_cache').delete().in('slug', slugs);
  } catch {
    // Cache table is optional.
  }
}

async function writeSyncLog(supabase, payload) {
  try {
    await supabase.from('sync_logs').insert({
      function_name: 'external-sync-motchill',
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

export async function runMotchillSync({ supabase, movieUrl = '', query = '', limit = 10, dryRun = false } = {}) {
  const started = Date.now();
  const errors = [];
  const entries = [];
  const urls = movieUrl ? [normalizeMotchillUrl(movieUrl)] : (await searchMotchill(query, limit)).map((item) => item.url);

  for (const url of urls.filter(Boolean)) {
    try {
      entries.push(await fetchMotchillEntry(url));
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  if (dryRun || !supabase) {
    return {
      success: errors.length === 0,
      dry_run: true,
      scanned: urls.length,
      parsed: entries.length,
      sample: entries.slice(0, 10).map((entry) => ({
        title: entry.title,
        origin_name: entry.originName,
        source_url: entry.sourceUrl,
        episodes: entry.episodes.length,
        current_episode: entry.currentEpisode,
        total_episodes: entry.totalEpisodes,
        embed_ok: entry.probe.embed_ok,
      })),
      errors,
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
    scanned: urls.length,
    parsed: entries.length,
    matched,
    created,
    ...rowSummary,
    changed_slugs: changedSlugs,
    errors,
    elapsed_ms: Date.now() - started,
  };
  await writeSyncLog(supabase, result);
  return result;
}
