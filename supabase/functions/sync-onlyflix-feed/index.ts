import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { findCanonicalMovieByIdentity } from '../_shared/movie-identity.ts';

const BASE = 'https://onlyflix.to';
const SOURCE = 'onlyflix';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret',
};
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; KhoPhim-Sync/1.0; +https://khophim.org)',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
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
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
const meta = (html: string, key: string) => match(html, new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)`, 'i'));
const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    return String(value.message || value.details || value.hint || JSON.stringify(value));
  }
  return String(error);
};
const nullableInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

async function fetchText(url: string, timeout = 20_000, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers || {}) }, redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

type Player = { number?: number; url?: string; language?: string; quality?: string; name?: string };
async function playersFromPage(url: string, html: string) {
  const nonce = match(html, /data-player-nonce=["']([^"']+)/i);
  const postId = match(html, /data-player-post-id=["'](\d+)/i);
  const type = match(html, /data-player-content-type=["']([^"']+)/i) || (/\/episodes\//i.test(url) ? 'episode' : 'movie');
  if (!nonce || !postId) return [] as Player[];
  const body = new URLSearchParams({ action: 'mcp_get_available_players', nonce, post_id: postId, type });
  const raw = await fetchText(`${BASE}/wp-admin/admin-ajax.php`, 18_000, {
    method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: url },
  });
  const payload = JSON.parse(raw);
  const candidates = (Array.isArray(payload?.data?.players) ? payload.data.players : [])
    .filter((item: Player) => /^https?:\/\//i.test(String(item?.url || ''))) as Player[];
  // Keep the source picker useful instead of exposing every upstream mirror.
  // These two providers pass KhoPhim's production health checks; if OnlyFlix
  // changes providers, retain two fallbacks so the connector can self-recover.
  const healthyProviders = candidates.filter((item) => /vidapi\.xyz|moviesapi\.to/i.test(String(item.url || '')));
  return (healthyProviders.length ? healthyProviders : candidates).slice(0, 2);
}

function episodeLinks(html: string) {
  const values: Array<{ url: string; season: number; episode: number }> = [];
  const seen = new Set<string>();
  for (const item of html.matchAll(/href=["'](https:\/\/onlyflix\.to\/episodes\/([^"']+))["']/gi)) {
    const url = decode(item[1]).replace(/\/$/, '') + '/';
    const token = decode(item[2]);
    const parsed = token.match(/s(\d{1,2})e(\d{1,3})/i);
    const season = Number(parsed?.[1] || 1) || 1;
    const episode = Number(parsed?.[2] || 1) || 1;
    if (!seen.has(url)) { seen.add(url); values.push({ url, season, episode }); }
  }
  return values.sort((a, b) => a.season - b.season || a.episode - b.episode);
}

function idsFrom(html: string, players: Player[]) {
  const blob = `${html} ${players.map((item) => item.url).join(' ')}`;
  const imdbId = blob.match(/tt\d{6,12}/i)?.[0] || '';
  const tmdbId = blob.match(/[?&]video_id=(\d{2,10})[^#]*[?&]tmdb=1/i)?.[1] || '';
  return { imdbId, tmdbId };
}

async function parsePage(item: Record<string, unknown>) {
  const sourceUrl = String(item.link || '');
  const html = await fetchText(sourceUrl);
  const baseTitle = text(String((item.title as Record<string, unknown>)?.rendered || meta(html, 'og:title') || item.slug || ''))
    .replace(/\s+(?:watch free|online streaming).*$/i, '').trim();
  const links = episodeLinks(html);
  const groups = new Map<number, typeof links>();
  if (links.length) for (const link of links) groups.set(link.season, [...(groups.get(link.season) || []), link]);
  else groups.set(0, [{ url: sourceUrl, season: 0, episode: 1 }]);
  const output: Array<Record<string, unknown>> = [];
  for (const [season, episodes] of groups) {
    const playable: Array<Record<string, unknown>> = [];
    let allPlayers: Player[] = [];
    for (const episode of episodes.slice(0, 60)) {
      const episodeHtml = episode.url === sourceUrl ? html : await fetchText(episode.url);
      const players = await playersFromPage(episode.url, episodeHtml);
      allPlayers = allPlayers.concat(players);
      for (const player of players) playable.push({
        episode_number: episode.episode,
        episode_name: season ? `Tập ${episode.episode}` : 'Full',
        slug: season ? `tap-${episode.episode}` : 'full',
        server_name: `OnlyFlix ${player.name || `Server ${player.number || 1}`} · ${player.language || 'EN'}`,
        link_embed: player.url,
        quality: player.quality || 'HD',
      });
    }
    if (!playable.length) continue;
    const { imdbId, tmdbId } = idsFrom(html, allPlayers);
    const year = Number(match(html, /(?:datePublished|releaseYear|dateCreated)[^\d]{0,20}(20\d{2}|19\d{2})/i) || new Date(String(item.date || '')).getFullYear()) || 0;
    const name = season > 1 ? `${baseTitle} (Phần ${season})` : baseTitle;
    const sourceSlug = season > 1 ? `${String(item.slug)}-phan-${season}` : String(item.slug);
    output.push({
      sourceUrl, sourceSlug, name, originName: name, year, imdbId, tmdbId,
      content: text(meta(html, 'description')), thumb: meta(html, 'og:image') || match(html, /(https:\/\/onlyflix\.to\/wp-content\/uploads\/posters\/[^"')]+)/i),
      poster: meta(html, 'twitter:image') || meta(html, 'og:image'), season,
      type: season ? 'series' : 'single', episodes: playable,
      currentEpisode: Math.max(...playable.map((row) => Number(row.episode_number || 1))),
    });
  }
  return output;
}

async function findMovie(db: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  const fields = 'id,slug,name,origin_name,normalized_name,year,source_site,source_name,current_episode,total_episodes,is_published';
  if (!entry.season) {
    for (const [column, value] of [['imdb_id', entry.imdbId], ['tmdb_id', entry.tmdbId]]) {
      if (!value) continue;
      const { data } = await db.from('movies').select(fields).eq(column, value).limit(1).maybeSingle();
      if (data?.id) return data;
    }
  }
  const { data: bySource } = await db.from('movies').select(fields).eq('source_url', entry.sourceUrl).eq('slug', `onlyflix-${entry.sourceSlug}`).limit(1).maybeSingle();
  if (bySource?.id) return bySource;
  return await findCanonicalMovieByIdentity(db, {
    names: [entry.name, entry.originName],
    normalizedNames: [slugify(String(entry.name || '')), slugify(String(entry.originName || ''))],
    year: entry.year,
  });
}

async function storeEntry(db: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  let movie = await findMovie(db, entry);
  let created = false;
  if (!movie) {
    const payload = {
      slug: `onlyflix-${entry.sourceSlug}`, name: entry.name, origin_name: entry.originName,
      title_en: entry.originName, title_original: entry.originName, normalized_name: slugify(String(entry.name)),
      content: entry.content, type: entry.type, status: 'ongoing', thumb_url: entry.thumb,
      poster_url: entry.poster || entry.thumb, quality: 'HD', lang: 'Tiếng Anh',
      episode_current: entry.type === 'single' ? 'Full' : `Tập ${entry.currentEpisode}`,
      episode_total: String(entry.currentEpisode), current_episode: entry.currentEpisode,
      total_episodes: entry.currentEpisode, year: entry.year || null, actor: [], director: [], category: [], country: [],
      source_url: entry.sourceUrl, showtimes: entry.sourceUrl, source_site: SOURCE,
      source_name: 'OnlyFlix',
      // IMDb/TMDB identify the whole series, not an individual season. Keeping
      // them on season rows would violate the catalog's global unique keys.
      imdb_id: entry.season ? '' : (entry.imdbId || ''),
      tmdb_id: entry.season ? null : nullableInteger(entry.tmdbId),
      is_published: true, last_synced_at: new Date().toISOString(), schedule_timezone: 'Asia/Ho_Chi_Minh',
    };
    const { data, error } = await db.from('movies').insert(payload).select('id,slug,source_site').single();
    if (error) throw error;
    movie = data; created = true;
  } else {
    const update: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
    if (movie.source_site === SOURCE) Object.assign(update, {
      episode_current: entry.type === 'single' ? 'Full' : `Tập ${entry.currentEpisode}`,
      current_episode: entry.currentEpisode,
      total_episodes: Math.max(Number(movie.total_episodes || 0), Number(entry.currentEpisode || 0)),
    });
    await db.from('movies').update(update).eq('id', movie.id);
  }
  let rows = 0;
  const activeServerNames = [...new Set((entry.episodes as Array<Record<string, unknown>>).map((episode) => String(episode.server_name || '')))];
  for (const episode of entry.episodes as Array<Record<string, unknown>>) {
    const episodePayload = {
      movie_id: movie.id, episode_number: episode.episode_number, episode_name: episode.episode_name,
      slug: episode.slug, server_name: episode.server_name, link_embed: episode.link_embed,
      link_m3u8: '', subtitle_url: '', thumbnail_url: entry.thumb || '', source: SOURCE,
      is_backup: movie.source_site !== SOURCE, audio_type: null,
    };
    const { data: old } = await db.from('movie_episodes').select('id').eq('movie_id', movie.id)
      .eq('episode_number', episode.episode_number).eq('server_name', episode.server_name).limit(1).maybeSingle();
    if (old?.id) await db.from('movie_episodes').update(episodePayload).eq('id', old.id);
    else { const { error } = await db.from('movie_episodes').insert(episodePayload); if (error) throw error; }
    const streamPayload = {
      movie_id: movie.id, server_name: episode.server_name, episode_slug: episode.slug,
      stream_url: '', embed_url: episode.link_embed, source: SOURCE, quality: episode.quality || 'HD',
      priority: 15, is_active: true, health_status: 'unchecked', failure_count: 0, last_error: '', audio_type: null,
    };
    const { data: stream } = await db.from('streams').select('id,stream_url,embed_url').eq('movie_id', movie.id).eq('source', SOURCE)
      .eq('server_name', episode.server_name).eq('episode_slug', episode.slug).limit(1).maybeSingle();
    if (stream?.id) {
      const urlChanged = String(stream.stream_url || '') !== String(streamPayload.stream_url || '')
        || String(stream.embed_url || '') !== String(streamPayload.embed_url || '');
      const updatePayload = urlChanged
        ? streamPayload
        : Object.fromEntries(Object.entries(streamPayload).filter(([key]) => !['health_status', 'failure_count', 'last_error'].includes(key)));
      await db.from('streams').update(updatePayload).eq('id', stream.id);
    }
    else { const { error } = await db.from('streams').insert(streamPayload); if (error) throw error; }
    rows += 1;
  }
  if (activeServerNames.length) {
    await db.from('streams').update({ is_active: false })
      .eq('movie_id', movie.id).eq('source', SOURCE).not('server_name', 'in', `(${activeServerNames.map((name) => `"${name.replaceAll('"', '')}"`).join(',')})`);
  }
  await db.from('movie_api_cache').delete().eq('slug', movie.slug);
  return { slug: movie.slug, created, rows };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const started = Date.now();
  const url = new URL(req.url);
  const expected = [Deno.env.get('CRON_SECRET'), Deno.env.get('ONLYFLIX_SYNC_SECRET')].map((v) => String(v || '').trim()).filter(Boolean);
  const supplied = req.headers.get('x-cron-secret') || url.searchParams.get('secret') || '';
  if (!expected.length) return reply({ success: false, error: 'Sync authentication is not configured' }, 503);
  if (!expected.includes(supplied)) return reply({ success: false, error: 'Unauthorized' }, 401);
  const dbUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!dbUrl || !serviceKey) return reply({ success: false, error: 'Missing Supabase env' }, 500);
  const db = createClient(dbUrl, serviceKey, { auth: { persistSession: false } });
  const dryRun = url.searchParams.get('dry_run') === '1';
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 2), 5));
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const fields = 'id,slug,link,title,date,modified';
  const [movies, shows] = await Promise.all(['posts', 'tvshows'].map(async (kind) => {
    const raw = await fetchText(`${BASE}/wp-json/wp/v2/${kind}?per_page=${limit}&page=${page}&_fields=${fields}`);
    return JSON.parse(raw) as Array<Record<string, unknown>>;
  }));
  const discovered = [...movies, ...shows].sort((a, b) => Date.parse(String(b.modified)) - Date.parse(String(a.modified))).slice(0, limit);
  const stored: unknown[] = []; const errors: string[] = []; let consecutiveFailures = 0; let parsed = 0;
  for (const item of discovered) {
    if (consecutiveFailures >= 3) break;
    try {
      const entries = await parsePage(item); parsed += entries.length;
      if (!dryRun) for (const entry of entries) stored.push(await storeEntry(db, entry));
      else stored.push(...entries.map((entry) => ({ name: entry.name, episodes: (entry.episodes as unknown[]).length })));
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      errors.push(`${String(item.link)}: ${errorMessage(error)}`);
    }
  }
  const result = { success: errors.length === 0, dry_run: dryRun, scanned: discovered.length, parsed, stored, errors, circuit_open: consecutiveFailures >= 3, elapsed_ms: Date.now() - started };
  if (!dryRun) await db.from('sync_logs').insert({ function_name: 'sync-onlyflix-feed', run_at: new Date().toISOString(), scanned: discovered.length, added: stored.filter((x: any) => x.created).length, skipped: stored.filter((x: any) => !x.created).length, errors: errors.length, details: errors, elapsed_ms: result.elapsed_ms, success: result.success, metadata: result });
  return reply(result, result.success ? 200 : 207);
});
