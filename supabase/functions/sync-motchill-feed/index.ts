import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { findCanonicalMovieByIdentity } from '../_shared/movie-identity.ts';

const BASE = 'https://www.motchillkz.org';
const SOURCE = 'motchill';
const ALLOWED_HOSTS = new Set(['motchillkz.org', 'www.motchillkz.org', 'motchills.us', 'www.motchills.us']);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret',
};
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; KhoPhim-Sync/2.0; +https://khophim.org)',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  Referer: `${BASE}/`,
};

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
});
const decode = (value = '') => String(value)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&#039;|&apos;|&#8217;/g, "'")
  .replace(/&#8211;|&#8212;/g, '-');
const text = (value = '') => decode(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
const match = (value: string, pattern: RegExp) => decode(String(value || '').match(pattern)?.[1] || '').trim();
const slugify = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\u0111/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
const meta = (html: string, key: string) => match(html, new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)`, 'i'));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function normalizeSourceUrl(raw: unknown) {
  try {
    const url = new URL(String(raw || ''), BASE);
    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || !['phim-bo', 'phim-le', 'tvshows', 'movies'].includes(parts[0])) return '';
    return `${BASE}/${parts[0]}/${parts[1]}`;
  } catch { return ''; }
}

function normalizeEpisodeUrl(raw: unknown) {
  try {
    const url = new URL(String(raw || ''), BASE);
    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || parts[0] !== 'tap-phim') return '';
    return `${BASE}/tap-phim/${parts[1]}`;
  } catch { return ''; }
}

async function fetchText(url: string, timeout = 20_000, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers || {}) }, redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

function episodeNumber(value: unknown) {
  const values = Array.from(String(value || '').matchAll(/(?:tập|tap|episode|e)\s*[-.:]?\s*(\d{1,3})/gi))
    .map((item) => Number(item[1])).filter((item) => item > 0);
  return values.length ? values.at(-1)! : 0;
}

function seasonNumber(value: unknown) {
  const found = String(value || '').match(/(?:season|phần|phan)\s*[-.:]?\s*(\d{1,2})/i);
  return Number(found?.[1] || 1) || 1;
}

function baseSeasonTitle(value: unknown) {
  return text(String(value || '')).replace(/\s*(?:season|phần|phan)\s*[-.:]?\s*\d{1,2}\s*$/i, '').trim();
}

function episodeLinks(html: string) {
  const output: Array<{ url: string; number: number }> = [];
  const seen = new Set<string>();
  for (const found of html.matchAll(/<a\b[^>]*href=["']([^"']*\/tap-phim\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = normalizeEpisodeUrl(decode(found[1]));
    const urlNumber = episodeNumber(url.replace(/-/g, ' '));
    const labelNumber = episodeNumber(text(found[2]));
    // A source occasionally exposes a future URL while labeling it as the
    // previous episode. Never trust that row until all identity signals agree.
    if (!url || !urlNumber || (labelNumber > 0 && labelNumber !== urlNumber)) continue;
    if (!seen.has(url)) { seen.add(url); output.push({ url, number: urlNumber }); }
  }
  return output.sort((a, b) => a.number - b.number);
}

type PlayerOption = { type: string; post: string; nume: string; label: string };
function playerOptions(html: string) {
  const output: PlayerOption[] = [];
  for (const found of html.matchAll(/<li\b([^>]*class=["'][^"']*dooplay_player_option[^"']*["'][^>]*)>([\s\S]*?)<\/li>/gi)) {
    const attrs = found[1];
    const type = match(attrs, /data-type=["']([^"']+)/i);
    const post = match(attrs, /data-post=["']([^"']+)/i);
    const nume = match(attrs, /data-nume=["']([^"']+)/i);
    if (type && post && nume) output.push({ type, post, nume, label: text(found[2]) || `Server ${nume}` });
  }
  return output.slice(0, 3);
}

function embedUrlFromPayload(raw: string) {
  try {
    const payload = JSON.parse(raw);
    const value = decode(String(payload?.embed_url || '')).trim();
    if (/^https?:\/\//i.test(value)) return value;
    return match(value, /<iframe[^>]+src=["'](https?:\/\/[^"']+)/i);
  } catch { return ''; }
}

async function fetchPlayer(option: PlayerOption, episodeUrl: string) {
  const body = new URLSearchParams({ action: 'doo_player_ajax', post: option.post, nume: option.nume, type: option.type });
  const raw = await fetchText(`${BASE}/wp-admin/admin-ajax.php`, 15_000, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: episodeUrl },
  });
  const url = embedUrlFromPayload(raw);
  if (!/^https?:\/\//i.test(url) || /youtube\.com|youtu\.be/i.test(url)) return { embedUrl: '', hlsUrl: '' };
  return { embedUrl: url, hlsUrl: await extractStreamcHls(url) };
}

async function extractStreamcHls(embedUrl: string) {
  try {
    const parsed = new URL(embedUrl);
    if (!/(^|\.)streamc\.xyz$/i.test(parsed.hostname)) return '';
    const html = await fetchText(embedUrl, 12_000, { headers: {
      Referer: BASE + '/',
      // StreamC returns a reduced/blocked document to obvious bot UAs even
      // though the same player is available to ordinary site visitors.
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    } });
    const encoded = match(html, /data-obf=["']([^"']+)/i);
    if (!encoded) return '';
    const payload = JSON.parse(atob(encoded)) as Record<string, unknown>;
    const streamKey = String(payload.sUb || '').trim().replace(/^\/+/, '');
    if (!streamKey || !/^[a-z0-9._~%/+\-=]+$/i.test(streamKey)) return '';
    const hlsUrl = new URL(`/${streamKey}?d=1`, embedUrl);
    if (hlsUrl.hostname !== parsed.hostname) return '';
    return hlsUrl.toString();
  } catch {
    return '';
  }
}

async function parseEpisode(item: { url: string; number: number }) {
  const html = await fetchText(item.url);
  const h1 = text(match(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i));
  const h1Number = episodeNumber(h1);
  if (!h1Number || h1Number !== item.number) return [];
  const options = playerOptions(html);
  if (!options.length) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const option of options) {
    try {
      const player = await fetchPlayer(option, item.url);
      if (!player.embedUrl) continue;
      rows.push({
        episode_number: item.number, episode_name: `Tập ${item.number}`, slug: `tap-${item.number}`,
        server_name: `Motchill Vietsub #${option.nume}`, link_embed: player.embedUrl, link_m3u8: player.hlsUrl,
        source_episode_url: item.url, quality: 'HD',
      });
    } catch { /* another mirror may still be healthy */ }
  }
  return rows;
}

async function localizedTitle(db: ReturnType<typeof createClient>, sourceTitle: string, season: number) {
  const base = baseSeasonTitle(sourceTitle);
  if (season <= 1 || !base) return sourceTitle;
  const fields = 'name,title_vi,origin_name,title_en,year';
  let { data } = await db.from('movies').select(fields).ilike('origin_name', base).order('year', { ascending: false }).limit(1).maybeSingle();
  if (!data) ({ data } = await db.from('movies').select(fields).ilike('title_en', base).order('year', { ascending: false }).limit(1).maybeSingle());
  const localizedBase = text(String(data?.title_vi || data?.name || ''));
  if (!localizedBase || slugify(localizedBase) === slugify(sourceTitle)) return sourceTitle;
  return `${localizedBase.replace(/\s*(?:season|phần|phan)?\s*\d+\s*$/i, '').trim()} ${season}`;
}

async function parseMovie(db: ReturnType<typeof createClient>, sourceUrl: string) {
  const html = await fetchText(sourceUrl);
  const rawTitle = text(match(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || meta(html, 'og:title'))
    .replace(/\s*\(\d{4}\).*$/i, '').replace(/\s*-\s*(?:Full HD|Motchill).*$/i, '').trim();
  const sourceSlug = sourceUrl.split('/').filter(Boolean).at(-1) || slugify(rawTitle);
  const season = seasonNumber(rawTitle);
  const playable = (await Promise.all(episodeLinks(html).slice(0, 60).map(parseEpisode))).flat();
  if (!rawTitle || !playable.length) throw new Error(`No verified playable episodes: ${sourceUrl}`);
  const currentEpisode = Math.max(...playable.map((row) => Number(row.episode_number || 0)));
  // The page appends recommendation cards after the canonical movie block.
  // A broad "Tập x/y" scan can therefore steal another title's episode total.
  // Keep the verified playable ceiling until an authoritative metadata source
  // provides the season total.
  const declared = 0;
  const year = Number(match(html, /\b(20\d{2}|19\d{2})\b/i) || new Date().getFullYear());
  const name = await localizedTitle(db, rawTitle, season);
  return {
    sourceUrl, sourceSlug, name, originName: rawTitle, season, year,
    content: text(meta(html, 'description')), thumb: meta(html, 'og:image'),
    currentEpisode, totalEpisodes: Math.max(declared, currentEpisode), episodes: playable,
  };
}

async function findMovie(db: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  const fields = 'id,slug,name,origin_name,title_vi,title_en,year,source_site,current_episode,total_episodes,is_published';
  const { data: bySource } = await db.from('movies').select(fields).eq('source_url', entry.sourceUrl).limit(1).maybeSingle();
  if (bySource?.id) return bySource;
  const { data: bySlug } = await db.from('movies').select(fields).eq('slug', `motchill-${entry.sourceSlug}`).limit(1).maybeSingle();
  if (bySlug?.id) return bySlug;
  return await findCanonicalMovieByIdentity(db, {
    names: [entry.name, entry.originName],
    normalizedNames: [slugify(String(entry.name)), slugify(String(entry.originName))],
    year: entry.year,
  });
}

async function storeMovie(db: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  let movie = await findMovie(db, entry); let created = false;
  if (!movie) {
    const payload = {
      slug: `motchill-${entry.sourceSlug}`, name: entry.name, origin_name: entry.originName,
      title_vi: entry.name, title_en: entry.originName, title_original: entry.originName,
      normalized_name: slugify(`${entry.name} ${entry.originName}`), content: entry.content,
      type: 'series', status: 'ongoing', thumb_url: entry.thumb, poster_url: entry.thumb,
      quality: 'HD', lang: 'Vietsub', episode_current: `Tập ${entry.currentEpisode}`,
      episode_total: String(entry.totalEpisodes), current_episode: entry.currentEpisode,
      total_episodes: entry.totalEpisodes, year: entry.year, actor: [], director: [], category: [], country: [],
      source_url: entry.sourceUrl, showtimes: entry.sourceUrl, source_site: SOURCE, source_name: 'Motchill',
      ophim_id: '', imdb_id: '', tmdb_id: null, is_published: true,
      last_synced_at: new Date().toISOString(), schedule_timezone: 'Asia/Ho_Chi_Minh',
    };
    const { data, error } = await db.from('movies').insert(payload).select('id,slug,source_site,current_episode,total_episodes').single();
    if (error) throw error; movie = data; created = true;
  } else {
    const current = Number(movie.current_episode || 0);
    const update: Record<string, unknown> = { last_synced_at: new Date().toISOString(), is_published: true };
    if (Number(entry.currentEpisode) >= current) Object.assign(update, {
      episode_current: `Tập ${entry.currentEpisode}`, current_episode: entry.currentEpisode,
      total_episodes: movie.source_site === SOURCE
        ? Number(entry.totalEpisodes || entry.currentEpisode)
        : Math.max(Number(movie.total_episodes || 0), Number(entry.totalEpisodes || 0)),
    });
    if (!movie.title_vi && entry.name) update.title_vi = entry.name;
    await db.from('movies').update(update).eq('id', movie.id);
  }
  let rows = 0;
  const activeServerNames = [...new Set((entry.episodes as Array<Record<string, unknown>>).map((episode) => String(episode.server_name || '')).filter(Boolean))];
  for (const episode of entry.episodes as Array<Record<string, unknown>>) {
    const episodePayload = {
      movie_id: movie.id, episode_number: episode.episode_number, episode_name: episode.episode_name,
      slug: episode.slug, server_name: episode.server_name, link_embed: episode.link_embed,
      link_m3u8: String(episode.link_m3u8 || ''),
      subtitle_url: '', thumbnail_url: entry.thumb || '', source: SOURCE,
      is_backup: movie.source_site !== SOURCE, audio_type: null,
    };
    const { data: old } = await db.from('movie_episodes').select('id').eq('movie_id', movie.id)
      .eq('episode_number', episode.episode_number).eq('server_name', episode.server_name).limit(1).maybeSingle();
    if (old?.id) await db.from('movie_episodes').update(episodePayload).eq('id', old.id);
    else { const { error } = await db.from('movie_episodes').insert(episodePayload); if (error) throw error; }
    const streamPayload = {
      movie_id: movie.id, server_name: episode.server_name, episode_slug: episode.slug,
      stream_url: String(episode.link_m3u8 || ''), embed_url: episode.link_embed, source: SOURCE, quality: 'HD', priority: 28,
      is_active: true, health_status: 'unchecked', failure_count: 0, last_error: '', audio_type: null,
    };
    const { data: stream } = await db.from('streams').select('id,embed_url,stream_url').eq('movie_id', movie.id).eq('source', SOURCE)
      .eq('server_name', episode.server_name).eq('episode_slug', episode.slug).limit(1).maybeSingle();
    if (stream?.id) {
      const changed = String(stream.embed_url || '') !== String(streamPayload.embed_url || '') ||
        String(stream.stream_url || '') !== String(streamPayload.stream_url || '');
      const update = changed ? streamPayload : Object.fromEntries(Object.entries(streamPayload).filter(([key]) => !['health_status', 'failure_count', 'last_error'].includes(key)));
      await db.from('streams').update(update).eq('id', stream.id);
    } else { const { error } = await db.from('streams').insert(streamPayload); if (error) throw error; }
    rows += 1;
  }
  if (activeServerNames.length) {
    const quoted = `(${activeServerNames.map((name) => `"${name.replaceAll('"', '')}"`).join(',')})`;
    await db.from('streams').update({ is_active: false }).eq('movie_id', movie.id).eq('source', SOURCE).not('server_name', 'in', quoted);
    // Episode rows are regenerated from the verified source on every sync, so
    // stale provider labels can be removed without touching other sources.
    await db.from('movie_episodes').delete().eq('movie_id', movie.id).eq('source', SOURCE).not('server_name', 'in', quoted);
  }
  await db.from('movie_api_cache').delete().eq('slug', movie.slug);
  try { await db.rpc('refresh_movie_seo_quality', { target_movie_id: movie.id }); } catch { /* optional */ }
  return { slug: movie.slug, created, rows };
}

async function discover(query: string, limit: number) {
  if (query) {
    const raw = await fetchText(`${BASE}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=${limit}`);
    return (JSON.parse(raw) as Array<Record<string, unknown>>)
      .filter((item) => ['tvshows', 'movies', 'posts'].includes(String(item.subtype || '')))
      .map((item) => normalizeSourceUrl(item.url)).filter(Boolean).slice(0, limit);
  }
  const fields = 'id,slug,link,title,date,modified';
  const batches = await Promise.all(['tvshows', 'posts'].map(async (kind) => {
    try { return JSON.parse(await fetchText(`${BASE}/wp-json/wp/v2/${kind}?per_page=${limit}&page=1&_fields=${fields}`)) as Array<Record<string, unknown>>; }
    catch { return []; }
  }));
  return [...new Set(batches.flat().sort((a, b) => Date.parse(String(b.modified)) - Date.parse(String(a.modified)))
    .map((item) => normalizeSourceUrl(item.link)).filter(Boolean))].slice(0, limit);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const started = Date.now(); const url = new URL(req.url);
  const expected = [Deno.env.get('CRON_SECRET'), Deno.env.get('MOTCHILL_SYNC_SECRET')].map((value) => String(value || '').trim()).filter(Boolean);
  const supplied = req.headers.get('x-cron-secret') || url.searchParams.get('secret') || '';
  if (!expected.length) return reply({ success: false, error: 'Sync authentication is not configured' }, 503);
  if (!expected.includes(supplied)) return reply({ success: false, error: 'Unauthorized' }, 401);
  const dbUrl = Deno.env.get('SUPABASE_URL') || ''; const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!dbUrl || !serviceKey) return reply({ success: false, error: 'Missing Supabase env' }, 500);
  const db = createClient(dbUrl, serviceKey, { auth: { persistSession: false } });
  const dryRun = url.searchParams.get('dry_run') === '1';
  const query = String(url.searchParams.get('query') || '').trim().slice(0, 120);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 8), 16));
  const urls = await discover(query, limit); const stored: unknown[] = []; const errors: string[] = [];
  for (const sourceUrl of urls) {
    try {
      const entry = await parseMovie(db, sourceUrl);
      stored.push(dryRun ? { name: entry.name, origin_name: entry.originName, episodes: entry.currentEpisode, sources: entry.episodes.length } : await storeMovie(db, entry));
    } catch (error) { errors.push(`${sourceUrl}: ${errorMessage(error)}`); }
  }
  if (!dryRun && stored.length) {
    await db.from('home_page_cache').update({ expires_at: new Date().toISOString() }).in('id', ['homepage_v3', 'search_index_v4_rows']);
  }
  const result = { success: errors.length === 0, dry_run: dryRun, query, scanned: urls.length, stored, errors, elapsed_ms: Date.now() - started };
  if (!dryRun) await db.from('sync_logs').insert({ function_name: 'sync-motchill-feed', run_at: new Date().toISOString(), scanned: urls.length, added: stored.filter((item: any) => item.created).length, skipped: stored.filter((item: any) => !item.created).length, errors: errors.length, details: errors, elapsed_ms: result.elapsed_ms, success: result.success, metadata: result });
  return reply(result, result.success ? 200 : 207);
});
