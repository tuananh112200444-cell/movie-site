import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { findCanonicalMovieByIdentity } from '../_shared/movie-identity.ts';

const BASE = 'https://www.glvietsub.net';
const SOURCE = 'glvietsub';
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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
});
const decode = (value = '') => String(value)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&#039;|&apos;|&#8217;/g, "'")
  .replace(/&#8211;|&#8212;/g, '-');
const plain = (value = '') => decode(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
const first = (value: string, pattern: RegExp) => decode(String(value || '').match(pattern)?.[1] || '').trim();
const slugify = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
const meta = (html: string, key: string) => first(html, new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)`, 'i'));

async function fetchText(url: string, timeout = 18_000, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...HEADERS, ...(init.headers || {}) },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function discoverDetailUrls(html: string, limit: number): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/href=["'](https:\/\/www\.glvietsub\.net\/(?:phim-bo|phim-le)\/[^"'#?]+)["']/gi)) {
    const value = decode(match[1]).replace(/\/$/, '');
    if (seen.has(value)) continue;
    seen.add(value);
    urls.push(value);
    if (urls.length >= limit) break;
  }
  return urls;
}

function discoverSitemapUrls(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>(https:\/\/www\.glvietsub\.net\/(?:phim-bo|phim-le)\/[^<]+)<\/loc>/gi))
    .map((match) => decode(match[1]).replace(/\/$/, ''));
}

function episodeLinks(html: string): Array<{ url: string; number: number; raw: boolean }> {
  const values: Array<{ url: string; number: number; raw: boolean }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a[^>]+href=["'](https:\/\/www\.glvietsub\.net\/xem-phim\/[^"']+tap-(\d+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decode(match[1]).replace(/\/$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    values.push({ url, number: Number(match[2]), raw: /\bRAW\b/i.test(plain(match[3])) });
  }
  return values.sort((a, b) => a.number - b.number);
}

function unwrapEmbed(payload: Record<string, unknown>): string {
  const raw = String(payload.embed_url || '');
  const iframe = raw.match(/<iframe[^>]+src=["']([^"']+)/i)?.[1];
  return decode(iframe || raw).replaceAll('\\/', '/').trim();
}

async function playerUrls(postId: string, type: string, serverCount: number): Promise<string[]> {
  const candidates = (await Promise.all(Array.from(
    { length: Math.min(serverCount, 6) },
    async (_, index): Promise<string> => {
      const nume = index + 1;
    try {
      const body = new URLSearchParams({ action: 'doo_player_ajax', post: postId, nume: String(nume), type });
      const raw = await fetchText(`${BASE}/wp-admin/admin-ajax.php`, 12_000, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      });
      const url = unwrapEmbed(JSON.parse(raw));
      return /^https?:\/\//i.test(url) ? url : '';
    } catch {
      // A broken mirror must not stop the episode or open the circuit.
      return '';
    }
    },
  ))).filter((url, index, rows) => Boolean(url) && rows.indexOf(url) === index);
  const safe = candidates.filter((url) => /abyssplayer\.com|ok\.ru\/videoembed/i.test(url));
  const fallback = candidates.filter((url) => !/vk\.com|dailymotion\.com/i.test(url));
  return (safe.length ? safe : fallback.length ? fallback : candidates).slice(0, 2);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function parseDetail(sourceUrl: string) {
  const html = await fetchText(sourceUrl);
  const sourceSlug = sourceUrl.split('/').filter(Boolean).pop() || slugify(meta(html, 'og:title'));
  const name = plain(first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || meta(html, 'og:title')).replace(/\s*[-|].*GLVietsub.*$/i, '').trim();
  const originName = plain(first(html, /<h2[^>]*>([\s\S]*?)<\/h2>/i)) || name;
  const year = Number(first(html, /(?:class=["']year["'][^>]*>|<span>)(20\d{2}|19\d{2})/i)) || 0;
  const expectedEpisodes = Number(first(html, /(?:<span[^>]*>|\b)(\d{1,4})\s*tập(?:\s*<\/span>|\b)/i)) || 0;
  const links = episodeLinks(html);
  const episodeGroups = await mapWithConcurrency(links.slice(0, 80), 3, async (episode) => {
    const episodeHtml = await fetchText(episode.url);
    const postId = first(episodeHtml, /class=["']dooplay_player_option["'][^>]+data-post=["'](\d+)/i);
    const type = first(episodeHtml, /class=["']dooplay_player_option["'][^>]+data-type=["']([^"']+)/i) || 'tv';
    const serverCount = [...episodeHtml.matchAll(/class=["']dooplay_player_option["']/gi)].length;
    const directRawEmbed = episode.raw
      ? first(episodeHtml, /class=["'][^"']*no-video[^"']*["'][\s\S]{0,1200}?<iframe[^>]+src=["']([^"']+)/i)
      : '';
    const urls = postId && serverCount
      ? await playerUrls(postId, type, serverCount)
      : /^https?:\/\//i.test(directRawEmbed) ? [decode(directRawEmbed)] : [];
    return urls.map((url, index) => ({
      episode_number: episode.number,
      episode_name: `Tập ${episode.number}${episode.raw ? ' RAW' : ''}`,
      slug: `tap-${episode.number}`,
      server_name: episode.raw ? `GLVietsub RAW ${index + 1}` : `GLVietsub ${index + 1}`,
      link_embed: url,
      raw: episode.raw,
    }));
  });
  const episodes: Array<Record<string, unknown>> = episodeGroups.flat();
  const translatedNumbers = episodes.filter((row) => !row.raw).map((row) => Number(row.episode_number || 0));
  const currentEpisode = Math.max(0, ...translatedNumbers);
  return {
    sourceUrl, sourceSlug, name, originName, year, expectedEpisodes, currentEpisode, episodes,
    content: plain(meta(html, 'description') || first(html, /class=["']mota["'][^>]*>([\s\S]*?)<\/span>/i)),
    image: meta(html, 'og:image') || first(html, /<img[^>]+(?:alt=["'][^"']*["'][^>]+)?src=["']([^"']+wp-content\/uploads\/[^"']+)/i),
    category: /phim-bach-hop|Bách Hợp/i.test(html) ? [{ name: 'Bách Hợp', slug: 'bach-hop' }] : [{ name: 'Đam Mỹ / BL', slug: 'dam-my' }],
    country: /phim-thai-lan/i.test(html) ? [{ name: 'Thái Lan', slug: 'thai-lan' }] : [],
  };
}

async function findMovie(db: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  const fields = 'id,slug,name,origin_name,normalized_name,year,source_site,current_episode,total_episodes,is_published';
  const { data: bySource } = await db.from('movies').select(fields).eq('source_url', entry.sourceUrl).limit(1).maybeSingle();
  if (bySource?.id) return bySource;
  // Match through punctuation-safe normalized values. Raw titles can contain
  // commas/parentheses that alter PostgREST .or() syntax and silently prevent
  // GL episodes from attaching to an existing BL canonical movie.
  const normalizedNames = Array.from(new Set([
    slugify(String(entry.name || '')),
    slugify(String(entry.originName || '')),
  ].filter(Boolean)));
  return await findCanonicalMovieByIdentity(db, {
    names: [entry.name, entry.originName],
    normalizedNames,
    year: entry.year,
  });
}

async function storeEntry(db: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  let movie = await findMovie(db, entry);
  let created = false;
  const now = new Date().toISOString();
  if (!movie) {
    const payload = {
      slug: `glvietsub-${entry.sourceSlug}`, name: entry.name, origin_name: entry.originName,
      title_en: entry.originName, title_original: entry.originName, normalized_name: slugify(String(entry.name)),
      content: entry.content, type: 'series', status: 'ongoing', thumb_url: entry.image, poster_url: entry.image,
      quality: 'HD', lang: 'Vietsub', episode_current: `Tập ${entry.currentEpisode}`,
      episode_total: String(entry.expectedEpisodes || entry.currentEpisode), current_episode: entry.currentEpisode,
      total_episodes: Math.max(Number(entry.expectedEpisodes || 0), Number(entry.currentEpisode || 0)),
      year: entry.year || null, actor: [], director: [], category: entry.category, country: entry.country,
      source_url: entry.sourceUrl, showtimes: entry.sourceUrl, source_site: SOURCE, source_name: 'GLVietsub',
      is_published: Number(entry.currentEpisode || 0) > 0, last_synced_at: now, schedule_timezone: 'Asia/Ho_Chi_Minh',
    };
    const { data, error } = await db.from('movies').insert(payload).select('id,slug,source_site,current_episode,total_episodes').single();
    if (error) throw error;
    movie = data;
    created = true;
  } else {
    const nextCurrent = Math.max(Number(movie.current_episode || 0), Number(entry.currentEpisode || 0));
    const update: Record<string, unknown> = { last_synced_at: now };
    if (movie.source_site === SOURCE) Object.assign(update, {
      name: entry.name, origin_name: entry.originName, content: entry.content,
      thumb_url: entry.image, poster_url: entry.image, category: entry.category, country: entry.country,
      episode_current: `Tập ${nextCurrent}`, current_episode: nextCurrent,
      total_episodes: Math.max(Number(movie.total_episodes || 0), Number(entry.expectedEpisodes || 0), nextCurrent),
      episode_total: String(Math.max(Number(entry.expectedEpisodes || 0), nextCurrent)),
      is_published: nextCurrent > 0,
    });
    const { error } = await db.from('movies').update(update).eq('id', movie.id);
    if (error) throw error;
  }

  let rows = 0;
  for (const episode of entry.episodes as Array<Record<string, unknown>>) {
    const payload = {
      movie_id: movie.id, episode_number: episode.episode_number, episode_name: episode.episode_name,
      slug: episode.slug, server_name: episode.server_name, link_embed: episode.link_embed, link_m3u8: '',
      subtitle_url: '', thumbnail_url: entry.image || '', source: SOURCE,
      is_backup: movie.source_site !== SOURCE, audio_type: episode.raw ? 'raw' : 'vietsub',
    };
    const { data: old } = await db.from('movie_episodes').select('id').eq('movie_id', movie.id)
      .eq('episode_number', episode.episode_number).eq('server_name', episode.server_name).limit(1).maybeSingle();
    if (old?.id) await db.from('movie_episodes').update(payload).eq('id', old.id);
    else { const { error } = await db.from('movie_episodes').insert(payload); if (error) throw error; }
    const streamPayload = {
      movie_id: movie.id, server_name: episode.server_name, episode_slug: episode.slug,
      stream_url: '', embed_url: episode.link_embed, source: SOURCE, quality: 'HD', priority: 45,
      is_active: true, health_status: 'unchecked', failure_count: 0, last_error: '', audio_type: episode.raw ? 'raw' : 'vietsub',
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
  await db.from('movie_api_cache').delete().eq('slug', movie.slug);
  return { slug: movie.slug, created, rows, current_episode: entry.currentEpisode, total_episodes: entry.expectedEpisodes };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const started = Date.now();
  const url = new URL(req.url);
  const expected = [Deno.env.get('CRON_SECRET'), Deno.env.get('GLVIETSUB_SYNC_SECRET')].map((v) => String(v || '').trim()).filter(Boolean);
  const supplied = req.headers.get('x-cron-secret') || url.searchParams.get('secret') || '';
  if (!expected.length) return json({ success: false, error: 'Sync authentication is not configured' }, 503);
  if (!expected.includes(supplied)) return json({ success: false, error: 'Unauthorized' }, 401);
  const dbUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!dbUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase env' }, 500);
  const db = createClient(dbUrl, serviceKey, { auth: { persistSession: false } });
  const dryRun = url.searchParams.get('dry_run') === '1';
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 3), 8));
  const explicitSlug = slugify(url.searchParams.get('slug') || '');
  let backfillOffset = 0;
  if (!explicitSlug && !dryRun) {
    const { data: cursor } = await db.from('sync_cursors').select('page').eq('key', 'glvietsub-feed-backfill').maybeSingle();
    backfillOffset = Math.max(0, Number(cursor?.page || 0));
  }
  let discovered: string[];
  if (explicitSlug) {
    discovered = [`${BASE}/phim-bo/${explicitSlug}`];
  } else {
    const latestHtml = await fetchText(`${BASE}/`);
    const sitemapNumber = Math.min(2, Math.floor(backfillOffset / 1000) + 1);
    const sitemapOffset = backfillOffset % 1000;
    const sitemapXml = await fetchText(`${BASE}/tvshows-sitemap${sitemapNumber}.xml`).catch(() => '');
    const archiveUrls = discoverSitemapUrls(sitemapXml);
    // Check the newest title on every run, then rotate through the archive so
    // the catalogue converges instead of re-scanning the same homepage cards.
    discovered = Array.from(new Set([
      ...discoverDetailUrls(latestHtml, 1),
      ...archiveUrls.slice(sitemapOffset, sitemapOffset + Math.max(1, limit - 1)),
    ])).slice(0, limit);
  }
  const stored: unknown[] = [];
  const errors: string[] = [];
  let consecutiveFailures = 0;
  for (const sourceUrl of discovered) {
    if (consecutiveFailures >= 3) break;
    try {
      const entry = await parseDetail(sourceUrl);
      if (!entry.name || !entry.episodes.length) throw new Error('No playable translated episode');
      stored.push(dryRun ? { name: entry.name, current_episode: entry.currentEpisode, total_episodes: entry.expectedEpisodes, sources: entry.episodes.length } : await storeEntry(db, entry));
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      errors.push(`${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const result = { success: errors.length === 0, dry_run: dryRun, scanned: discovered.length, stored, errors, circuit_open: consecutiveFailures >= 3, elapsed_ms: Date.now() - started };
  if (!explicitSlug && !dryRun) {
    const nextPage = discovered.length < 2 || backfillOffset >= 1999
      ? 0
      : backfillOffset + Math.max(1, limit - 1);
    await db.from('sync_cursors').upsert({ key: 'glvietsub-feed-backfill', page: nextPage, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  }
  if (!dryRun) await db.from('sync_logs').insert({
    function_name: 'sync-glvietsub-feed', run_at: new Date().toISOString(), scanned: discovered.length,
    added: stored.filter((value: any) => value.created).length, skipped: stored.filter((value: any) => !value.created).length,
    errors: errors.length, details: errors, elapsed_ms: result.elapsed_ms, success: result.success, metadata: result,
  });
  return json(result, result.success ? 200 : 207);
});
