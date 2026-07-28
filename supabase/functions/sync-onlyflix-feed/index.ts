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

function trendingMoviesFromHome(html: string, limit: number) {
  const raw = html.match(/<script[^>]*data-ofpop-home-json[^>]*>([\s\S]*?)<\/script>/i)?.[1] || '';
  if (!raw) throw new Error('OnlyFlix Trending Movies payload was not found');
  const payload = JSON.parse(raw);
  const period = String(payload?.defaultPeriod || '24h');
  const rows = payload?.groups?.movies?.periods?.[period];
  if (!Array.isArray(rows)) throw new Error(`OnlyFlix Trending Movies period ${period} is invalid`);
  return rows.slice(0, limit).map((row: Record<string, unknown>, index: number) => {
    const link = String(row.url || '');
    const slug = link.match(/^https:\/\/onlyflix\.to\/([^/?#]+)\/?$/i)?.[1] || '';
    if (!slug || !link) throw new Error(`OnlyFlix Trending Movies rank ${index + 1} has no valid movie URL`);
    return {
      slug,
      link,
      title: { rendered: String(row.title || slug) },
      trendingRank: index + 1,
      trendingTotal: Number(row.total || 0),
      trendingPeriod: period,
    };
  });
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
  // Keep OnlyFlix servers 3, 4 and 5 as bounded fallbacks. Do not import the
  // rest of the upstream mirror list.
  const healthyProviders = candidates
    .filter((item) => /moviesapi\.to|vidfast\.(?:pro|vc)|multiembed\.mov/i.test(String(item.url || '')))
    .sort((a, b) => (
      Number(/moviesapi\.to/i.test(String(b.url || ''))) - Number(/moviesapi\.to/i.test(String(a.url || '')))
    ) || Number(a.number || 99) - Number(b.number || 99));
  return (healthyProviders.length ? healthyProviders : candidates).slice(0, 3);
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
  // A row discovered in the explicit Movies rail is always a movie. Related
  // series links elsewhere in its HTML must never turn it into a fake season.
  const links = item.trendingRank ? [] : episodeLinks(html);
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
        source_priority: /moviesapi\.to/i.test(String(player.url || ''))
          ? 25
          : /vidfast\.(?:pro|vc)/i.test(String(player.url || ''))
            ? 15
            : 10,
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
  const fields = 'id,slug,name,origin_name,normalized_name,year,source_site,source_name,status,episode_current,current_episode,total_episodes,is_published';
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
    if (entry.type === 'single') Object.assign(payload, {
      episode_current: 'Dang cap nhat',
      episode_total: '0',
      current_episode: 0,
      total_episodes: 0,
    });
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
    const hasVerifiedFullMovie = entry.type === 'single'
      && (entry.episodes as Array<Record<string, unknown>>).some((episode) => episode.slug === 'full');
    const pendingLabel = /^(?:trailer|sap chieu|sắp chiếu|coming soon|dang cap nhat)$/i
      .test(String(movie.episode_current || '').trim());
    if (hasVerifiedFullMovie && pendingLabel) Object.assign(update, {
      episode_current: 'Full',
      episode_total: '1',
      current_episode: 1,
      total_episodes: Math.max(Number(movie.total_episodes || 0), 1),
      status: 'completed',
    });
    // An upstream iframe URL is not proof of playback. Single movies may only
    // be promoted by production playback health, never by feed discovery.
    if (entry.type === 'single') {
      for (const key of ['episode_current', 'episode_total', 'current_episode', 'total_episodes', 'status']) {
        delete update[key];
      }
    }
    await db.from('movies').update(update).eq('id', movie.id);
  }
  let rows = 0;
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
      priority: Number(episode.source_priority || 15), is_active: true, health_status: 'unchecked', failure_count: 0, last_error: '', audio_type: null,
    };
    const { data: stream } = await db.from('streams').select('id,stream_url,embed_url').eq('movie_id', movie.id).eq('source', SOURCE)
      .eq('server_name', episode.server_name).eq('episode_slug', episode.slug).limit(1).maybeSingle();
    if (stream?.id) {
      const urlChanged = String(stream.stream_url || '') !== String(streamPayload.stream_url || '')
        || String(stream.embed_url || '') !== String(streamPayload.embed_url || '');
      const updatePayload = urlChanged
        ? streamPayload
        : Object.fromEntries(Object.entries(streamPayload).filter(([key]) => !['is_active', 'health_status', 'failure_count', 'last_error'].includes(key)));
      await db.from('streams').update(updatePayload).eq('id', stream.id);
    }
    else { const { error } = await db.from('streams').insert(streamPayload); if (error) throw error; }
    rows += 1;
  }
  // A feed response is only positive evidence. Missing rows may be caused by
  // pagination, rate limiting or an upstream layout change, so sync cannot
  // deactivate a previously playable stream. Health checks own quarantine.
  await db.from('movie_api_cache').update({ expires_at: new Date().toISOString() }).eq('slug', movie.slug);
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
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 10), 10));
  // Read the exact, bounded Trending Movies rail that OnlyFlix publishes on
  // its homepage. Never walk its archive or infer trends from publication time.
  const discovered = trendingMoviesFromHome(await fetchText(BASE), limit);
  const stored: unknown[] = []; const errors: string[] = []; let consecutiveFailures = 0; let parsed = 0;
  const trending: unknown[] = [];
  for (const item of discovered) {
    if (consecutiveFailures >= 3) break;
    try {
      const entries = await parsePage(item); parsed += entries.length;
      for (const entry of entries) {
        const saved = dryRun
          ? { slug: (await findMovie(db, entry))?.slug || `onlyflix-${entry.sourceSlug}`, name: entry.name, created: false, episodes: (entry.episodes as unknown[]).length }
          : await storeEntry(db, entry);
        stored.push(saved);
        trending.push({
          rank: item.trendingRank,
          total: item.trendingTotal,
          period: item.trendingPeriod,
          title: entry.name,
          source_url: item.link,
          slug: saved.slug,
        });
      }
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      errors.push(`${String(item.link)}: ${errorMessage(error)}`);
    }
  }
  const result = { success: errors.length === 0, dry_run: dryRun, mode: 'trending-movies-only', scanned: discovered.length, parsed, stored, trending, errors, circuit_open: consecutiveFailures >= 3, elapsed_ms: Date.now() - started };
  if (!dryRun) {
    await db.from('sync_logs').insert({ function_name: 'sync-onlyflix-feed', run_at: new Date().toISOString(), scanned: discovered.length, added: stored.filter((x: any) => x.created).length, skipped: stored.filter((x: any) => !x.created).length, errors: errors.length, details: errors, elapsed_ms: result.elapsed_ms, success: result.success, metadata: result });
    if (result.success) await db.from('home_page_cache').update({ expires_at: new Date().toISOString() }).eq('id', 'homepage_v3');
  }
  return reply(result, result.success ? 200 : 207);
});
