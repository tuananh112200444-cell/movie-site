import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { findCanonicalMovieByIdentity, retireSourceMovieDuplicate } from '../_shared/movie-identity.ts';
import { resolveLocalizedMovieTitles } from '../_shared/tmdb-title-localization.ts';

const BASE = 'https://www.glvietsub.net';
const SOURCE = 'glvietsub';
const TMDB_READ_ACCESS_TOKEN = Deno.env.get('TMDB_READ_ACCESS_TOKEN') || '';
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

function titleAliases(...values: unknown[]): string[] {
  const aliases = new Set<string>();
  for (const value of values) {
    const title = plain(String(value || '')).trim();
    if (!title) continue;
    aliases.add(title);
    const prefix = title.split(/\s*[:|–—]\s*/)[0]?.trim();
    if (prefix && prefix.length >= 3) aliases.add(prefix);
  }
  return [...aliases];
}

async function enrichEntryTitles(entry: Record<string, unknown>): Promise<void> {
  const localized = await resolveLocalizedMovieTitles({
    titleVi: String(entry.name || ''),
    sourceOriginal: String(entry.originName || ''),
    year: Number(entry.year || 0),
    tmdbToken: TMDB_READ_ACCESS_TOKEN,
  });
  entry.titleEn = localized.titleEn;
  entry.titleOriginal = localized.titleOriginal || String(entry.originName || '');
  entry.tmdbId = localized.tmdbId;
}

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

function episodeLinks(html: string): Array<{
  url: string; number: number; raw: boolean; special: boolean; label: string; slug: string;
}> {
  const values: Array<{
    url: string; number: number; raw: boolean; special: boolean; label: string; slug: string;
  }> = [];
  const byUrl = new Map<string, typeof values[number]>();
  for (const match of html.matchAll(/<a[^>]+href=["'](https:\/\/www\.glvietsub\.net\/xem-phim\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decode(match[1]).replace(/\/$/, '');
    const sourceSlug = url.split('/').filter(Boolean).at(-1) || '';
    const regularMatch = sourceSlug.match(/-tap-(\d+)$/i);
    const special = /-tap-dac-biet(?:-|$)/i.test(sourceSlug);
    if (!regularMatch && !special) continue;
    const label = plain(match[2]);
    const raw = /\bRAW\b/i.test(label);
    const existing = byUrl.get(url);
    if (existing) {
      // The large "Play" CTA appears before the episode-list label and has no
      // RAW marker. Aggregate duplicate anchors so the richer label wins.
      existing.raw = existing.raw || raw;
      if (/dac\s*biet/i.test(slugify(label))) existing.label = label;
      continue;
    }
    const specialNumber = special
      ? Number(slugify(label).match(/dac-biet-(\d+)/i)?.[1]
        || sourceSlug.match(/-tap-dac-biet-(\d+)(?:-|$)/i)?.[1] || 0)
      : 0;
    const episode = {
      url,
      number: regularMatch ? Number(regularMatch[1]) : -(1000 + specialNumber),
      raw,
      special,
      label,
      slug: special ? sourceSlug.slice(sourceSlug.indexOf('tap-dac-biet')) : `tap-${regularMatch?.[1]}`,
    };
    byUrl.set(url, episode);
    values.push(episode);
  }
  let nextSpecialNumber = 1;
  const usedSpecialNumbers = new Set(values.filter((episode) => episode.special && episode.number < -1000)
    .map((episode) => Math.abs(episode.number) - 1000)
    .filter(Boolean));
  for (const episode of values.filter((item) => item.special && item.number === -1000)) {
    while (usedSpecialNumbers.has(nextSpecialNumber)) nextSpecialNumber += 1;
    episode.number = -(1000 + nextSpecialNumber);
    usedSpecialNumbers.add(nextSpecialNumber);
  }
  return values.sort((a, b) => {
    if (a.special !== b.special) return a.special ? 1 : -1;
    return a.special ? Math.abs(a.number) - Math.abs(b.number) : a.number - b.number;
  });
}

function unwrapEmbed(payload: Record<string, unknown>): string {
  const raw = String(payload.embed_url || '');
  const iframe = raw.match(/<iframe[^>]+src=["']([^"']+)/i)?.[1];
  return decode(iframe || raw).replaceAll('\\/', '/').trim();
}

function playbackIdentity(url: unknown): string {
  const raw = decode(String(url || '')).replaceAll('\\/', '/').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return videoId ? `youtube:${videoId}` : '';
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const embedId = parsed.pathname.match(/^\/(?:embed|shorts)\/([^/?#]+)/i)?.[1];
      const videoId = embedId || parsed.searchParams.get('v') || '';
      return videoId ? `youtube:${videoId}` : '';
    }
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
}

function isYouTubePlaybackUrl(url: unknown): boolean {
  try {
    const host = new URL(String(url || '')).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com';
  } catch {
    return false;
  }
}

async function youtubePlaybackTitle(url: string): Promise<string> {
  try {
    const identity = playbackIdentity(url);
    const videoId = identity.startsWith('youtube:') ? identity.slice('youtube:'.length) : '';
    if (!videoId) return '';
    // YouTube oEmbed returns 404 for /embed/... URLs. Resolve metadata through
    // the canonical watch URL so trailer detection is deterministic.
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const payload = JSON.parse(await fetchText(endpoint, 8_000)) as Record<string, unknown>;
    return plain(String(payload.title || '')).trim();
  } catch {
    return '';
  }
}

function isTrailerPlaybackTitle(title: string): boolean {
  return /(?:^|[\s[(\-:])(?:official\s+)?(?:trailer|teaser|pilot\d*|prelude|preview)(?:$|[\s\])\-:])|\b(?:concept\s+teaser|pilot\s+trailer|pre[\s-]?series|upcoming|coming\s+soon|rumou?red\s+to\s+premiere|press\s+conference)\b|\b(?:trailer|teaser)\s+chính\s+thức\b|ตัวอย่าง|งานแถลงข่าว|예고|予告|预告|預告|\|\s*GMMTV\s*2026\s*$/i.test(title);
}

function rejectRepeatedEpisodePlaybackUrls(rows: Array<Record<string, unknown>>) {
  const ownerByUrl = new Map<string, number>();
  for (const row of rows) {
    if (row.invalid_playback_reason) continue;
    if (row.special) continue;
    const episodeNumber = Number(row.episode_number || 0);
    const identity = playbackIdentity(row.link_embed || row.link_m3u8);
    if (!identity || episodeNumber <= 0) continue;
    const owner = ownerByUrl.get(identity);
    if (owner === undefined || episodeNumber < owner) ownerByUrl.set(identity, episodeNumber);
  }

  const episodes: Array<Record<string, unknown>> = [];
  const duplicateEpisodes: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (row.invalid_playback_reason) {
      duplicateEpisodes.push(row);
      continue;
    }
    const episodeNumber = Number(row.episode_number || 0);
    const identity = playbackIdentity(row.link_embed || row.link_m3u8);
    const owner = identity ? ownerByUrl.get(identity) : undefined;
    if (!row.special && episodeNumber > 0 && owner !== undefined && owner !== episodeNumber) {
      duplicateEpisodes.push({ ...row, duplicate_of_episode: owner, playback_identity: identity });
      continue;
    }
    episodes.push(row);
  }
  return { episodes, duplicateEpisodes };
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
  const episodeGroups = await mapWithConcurrency(links.slice(0, 80), 4, async (episode) => {
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
    const youtubeTitles = new Map<string, string>();
    await Promise.all(urls.filter(isYouTubePlaybackUrl).map(async (url) => {
      youtubeTitles.set(url, await youtubePlaybackTitle(url));
    }));
    return urls.map((url, index) => {
      const youtubeTitle = youtubeTitles.get(url) || '';
      return {
      episode_number: episode.number,
      episode_name: episode.special
        ? `${episode.label.replace(/\s*RAW\b/i, '').trim() || 'Tập Đặc Biệt'}${episode.raw ? ' RAW' : ''}`
        : `Tập ${episode.number}${episode.raw ? ' RAW' : ''}`,
      slug: episode.slug,
      server_name: episode.raw ? `GLVietsub RAW ${index + 1}` : `GLVietsub ${index + 1}`,
      link_embed: url,
      raw: episode.raw,
      special: episode.special,
      invalid_playback_reason: youtubeTitle && isTrailerPlaybackTitle(youtubeTitle) ? 'youtube_trailer' : '',
      playback_title: youtubeTitle,
    };
    });
  });
  // GLVietsub can temporarily publish two episode buttons that resolve to the
  // same immutable player URL. A reachable URL is not proof that it belongs to
  // a new episode, so keep the earliest numbered owner and quarantine the rest.
  const parsedPlayback = rejectRepeatedEpisodePlaybackUrls(episodeGroups.flat());
  const episodes = parsedPlayback.episodes;
  const regularEpisodes = episodes.filter((row) => !row.special);
  const translatedNumbers = regularEpisodes.filter((row) => !row.raw).map((row) => Number(row.episode_number || 0));
  const rawNumbers = regularEpisodes.filter((row) => row.raw).map((row) => Number(row.episode_number || 0));
  const playableNumbers = regularEpisodes.map((row) => Number(row.episode_number || 0));
  const currentEpisode = Math.max(0, ...translatedNumbers);
  const rawEpisode = Math.max(0, ...rawNumbers);
  const playableEpisode = Math.max(0, ...playableNumbers);
  return {
    sourceUrl, sourceSlug, name, originName, year, expectedEpisodes,
    currentEpisode, rawEpisode, playableEpisode, episodes,
    duplicateEpisodes: parsedPlayback.duplicateEpisodes,
    content: plain(meta(html, 'description') || first(html, /class=["']mota["'][^>]*>([\s\S]*?)<\/span>/i)),
    image: meta(html, 'og:image') || first(html, /<img[^>]+(?:alt=["'][^"']*["'][^>]+)?src=["']([^"']+wp-content\/uploads\/[^"']+)/i),
    category: /phim-bach-hop|Bách Hợp/i.test(html) ? [{ name: 'Bách Hợp', slug: 'bach-hop' }] : [{ name: 'Đam Mỹ / BL', slug: 'dam-my' }],
    country: /phim-thai-lan/i.test(html) ? [{ name: 'Thái Lan', slug: 'thai-lan' }] : [],
  };
}

async function findMovie(db: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  const fields = 'id,slug,name,origin_name,title_vi,title_en,title_original,tmdb_id,normalized_name,year,source_site,current_episode,total_episodes,is_published';
  const { data: bySource } = await db.from('movies').select(fields).eq('source_url', entry.sourceUrl).limit(1).maybeSingle();
  // Match through punctuation-safe normalized values. Raw titles can contain
  // commas/parentheses that alter PostgREST .or() syntax and silently prevent
  // GL episodes from attaching to an existing BL canonical movie.
  // Identity matching must use complete titles. A prefix before ":" can name
  // the parent series (for example "Fourever You Season 2") and would attach a
  // spin-off's episodes to that parent.
  const aliases = Array.from(new Set(
    [entry.name, entry.originName].map((value) => plain(String(value || '')).trim()).filter(Boolean),
  ));
  const normalizedNames = Array.from(new Set(aliases.map((value) => slugify(value)).filter(Boolean)));
  const canonical = await findCanonicalMovieByIdentity(db, {
    names: aliases,
    normalizedNames,
    year: entry.year,
    provider: SOURCE,
    providerSlug: entry.sourceSlug,
    providerId: entry.sourceSlug,
    tmdbId: entry.tmdbId,
    originalTitle: entry.titleOriginal || entry.originName,
    localizedTitle: entry.name,
    movieType: 'series',
    createSlug: `glvietsub-${entry.sourceSlug}`,
    sourceName: 'GLVietsub',
  });
  return canonical || bySource || null;
}

async function storeEntryLegacy(db: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  let movie = await findMovie(db, entry);
  let created = false;
  const now = new Date().toISOString();
  const titleEn = String(entry.titleEn || (entry.originName !== entry.name ? entry.originName : '')).trim();
  const titleOriginal = String(entry.titleOriginal || entry.originName || '').trim();
  if (!movie) {
    const payload = {
      slug: `glvietsub-${entry.sourceSlug}`, name: entry.name, origin_name: entry.originName,
      title_vi: entry.name, title_en: titleEn, title_original: titleOriginal,
      tmdb_id: entry.tmdbId || null,
      normalized_name: slugify([entry.name, entry.originName, titleEn, titleOriginal].filter(Boolean).join(' ')),
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
    const currentTitleEn = String(movie.title_en || '').trim();
    if (titleEn && (!currentTitleEn || slugify(currentTitleEn) === slugify(String(entry.name || '')))) update.title_en = titleEn;
    if (titleOriginal && !String(movie.title_original || '').trim()) update.title_original = titleOriginal;
    if (entry.tmdbId && !movie.tmdb_id) update.tmdb_id = entry.tmdbId;
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
  for (const duplicate of (entry.duplicateEpisodes || []) as Array<Record<string, unknown>>) {
    const episodeNumber = Number(duplicate.episode_number || 0);
    const episodeSlug = String(duplicate.slug || '').trim();
    const serverName = String(duplicate.server_name || '').trim();
    const embedUrl = String(duplicate.link_embed || '').trim();
    if (!episodeNumber || !episodeSlug || !serverName || !embedUrl) continue;
    const { error: duplicateEpisodeError } = await db.from('movie_episodes').delete()
      .eq('movie_id', movie.id)
      .eq('source', SOURCE)
      .eq('episode_number', episodeNumber)
      .eq('server_name', serverName)
      .eq('link_embed', embedUrl);
    if (duplicateEpisodeError) throw duplicateEpisodeError;
    // Verified duplicate playback quarantine contract: the parser proved this
    // exact provider/movie/episode/server/embed URL is either a trailer or is
    // already owned by another episode. This is not negative feed absence.
    const { error: duplicateStreamError } = await db.from('streams').update({
      is_active: false,
      health_status: 'blocked',
      failure_count: 3,
      last_error: duplicate.invalid_playback_reason === 'youtube_trailer'
        ? `Rejected GL playback: YouTube trailer (${String(duplicate.playback_title || '').slice(0, 140)})`
        : `Duplicate playback URL already belongs to episode ${Number(duplicate.duplicate_of_episode || 0)}`,
      last_checked_at: now,
    })
      .eq('movie_id', movie.id)
      .eq('source', SOURCE)
      .eq('episode_slug', episodeSlug)
      .eq('server_name', serverName)
      .eq('embed_url', embedUrl);
    if (duplicateStreamError) throw duplicateStreamError;
  }
  const translatedEpisodes = (entry.episodes as Array<Record<string, unknown>>)
    .filter((episode) => !episode.raw);
  // Verified localized replacement contract: a RAW row is removed only after
  // this same successful parse produced a translated row for that episode.
  const translatedEpisodeNumbers = Array.from(new Set(
    translatedEpisodes
      .map((episode) => Number(episode.episode_number || 0))
      .filter((episodeNumber) => Number.isFinite(episodeNumber) && episodeNumber !== 0),
  ));
  if (translatedEpisodeNumbers.length) {
    const translatedEpisodeSlugs = Array.from(new Set(translatedEpisodes
      .map((episode) => String(episode.slug || '').trim())
      .filter(Boolean)));
    const { error: staleEpisodeError } = await db.from('movie_episodes').delete()
      .eq('movie_id', movie.id)
      .eq('source', SOURCE)
      .eq('audio_type', 'raw')
      .in('episode_number', translatedEpisodeNumbers);
    if (staleEpisodeError) throw staleEpisodeError;
    if (translatedEpisodeSlugs.length) {
      const { error: staleStreamError } = await db.from('streams').delete()
        .eq('movie_id', movie.id)
        .eq('source', SOURCE)
        .eq('audio_type', 'raw')
        .in('episode_slug', translatedEpisodeSlugs);
      if (staleStreamError) throw staleStreamError;
    }
  }
  await db.from('movie_api_cache').update({ expires_at: new Date().toISOString() }).eq('slug', movie.slug);
  return {
    slug: movie.slug,
    created,
    rows,
    rejected_playback_rows: ((entry.duplicateEpisodes || []) as Array<Record<string, unknown>>).length,
    current_episode: entry.currentEpisode,
    total_episodes: entry.expectedEpisodes,
  };
}

async function storeEntry(db: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  await enrichEntryTitles(entry);
  const { data: sourceBeforeStore } = await db.from('movies')
    .select('id,slug,source_site,source_name')
    .eq('source_url', entry.sourceUrl)
    .limit(1)
    .maybeSingle();
  const result = await storeEntryLegacy(db, entry);
  const movie = await findMovie(db, entry);
  if (!movie?.id) throw new Error('Stored movie could not be resolved');

  const now = new Date().toISOString();
  const translatedEpisode = Number(entry.currentEpisode || 0);
  const rawEpisode = Number(entry.rawEpisode || 0);
  const playableEpisode = Number(entry.playableEpisode || 0);
  const hasPlayableEpisode = playableEpisode > 0 && (entry.episodes as Array<Record<string, unknown>>).length > 0;
  const { data: localizedRows, error: localizedRowsError } = await db.from('movie_episodes')
    .select('episode_number')
    .eq('movie_id', movie.id)
    .eq('source', SOURCE)
    .neq('audio_type', 'raw')
    .order('episode_number', { ascending: false })
    .limit(1);
  if (localizedRowsError) throw localizedRowsError;
  const verifiedTranslatedEpisode = Math.max(
    translatedEpisode,
    Number((localizedRows?.[0] as Record<string, unknown> | undefined)?.episode_number || 0),
  );
  // For a GL-owned movie, current_episode means the highest localized episode,
  // not the highest early-access RAW episode. Other canonical sources retain
  // their own higher translated progress.
  const nextCurrent = movie.source_site === SOURCE
    ? verifiedTranslatedEpisode
    : Math.max(Number(movie.current_episode || 0), verifiedTranslatedEpisode);
  const nextPlayable = Math.max(Number(movie.total_episodes || 0), playableEpisode);
  const displayEpisode = nextCurrent > 0
    ? `Tập ${nextCurrent}`
    : rawEpisode > 0 ? `Tập ${rawEpisode} RAW` : 'Đang cập nhật';
  const displayLanguage = nextCurrent > 0 ? 'Vietsub' : rawEpisode > 0 ? 'RAW · Chưa phụ đề' : 'Đang cập nhật';
  const aliases = titleAliases(entry.originName, entry.titleEn, entry.titleOriginal);
  const titleEn = String(entry.titleEn || aliases.at(-1) || entry.originName || '').trim();
  const titleOriginal = String(entry.titleOriginal || entry.originName || '').trim();
  const update: Record<string, unknown> = {
    last_synced_at: now,
    title_vi: entry.name,
    content: entry.content,
    status: hasPlayableEpisode ? 'ongoing' : 'upcoming',
    episode_current: displayEpisode,
    current_episode: nextCurrent,
    total_episodes: Math.max(Number(entry.expectedEpisodes || 0), nextPlayable),
    episode_total: String(Math.max(Number(entry.expectedEpisodes || 0), nextPlayable)),
    lang: displayLanguage,
    is_published: Boolean(movie.is_published) || hasPlayableEpisode,
  };
  const currentTitleEn = String(movie.title_en || '').trim();
  if (titleEn && (!currentTitleEn || slugify(currentTitleEn) === slugify(String(entry.name || '')))) update.title_en = titleEn;
  if (titleOriginal && !String(movie.title_original || '').trim()) update.title_original = titleOriginal;
  if (entry.tmdbId && !movie.tmdb_id) update.tmdb_id = entry.tmdbId;
  if (movie.source_site === 'tmdb-catalog') Object.assign(update, {
    name: entry.name,
    normalized_name: slugify(String(entry.name)),
  });
  if (movie.source_site === SOURCE) Object.assign(update, {
    name: entry.name,
    origin_name: entry.originName,
    normalized_name: slugify(String(entry.name)),
    thumb_url: entry.image,
    poster_url: entry.image,
    category: entry.category,
    country: entry.country,
    is_published: hasPlayableEpisode,
  });

  const { error: updateError } = await db.from('movies').update(update).eq('id', movie.id);
  if (updateError) throw updateError;
  if (sourceBeforeStore?.id && sourceBeforeStore.id !== movie.id) {
    await retireSourceMovieDuplicate(db, {
      source: sourceBeforeStore,
      target: movie,
      provider: SOURCE,
    });
  }
  const { error: seoError } = await db.rpc('refresh_movie_seo_quality', { p_movie_id: movie.id });
  if (seoError) throw seoError;
  await db.from('home_page_cache').update({ expires_at: now }).in('id', ['homepage_v3', 'search_index_v4_rows']);
  await db.from('movie_api_cache').update({ expires_at: new Date().toISOString() }).eq('slug', movie.slug);
  return { ...result, current_episode: nextCurrent, raw_episode: rawEpisode, playable_episode: playableEpisode };
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
  const recentOnly = url.searchParams.get('recent') === '1';
  let backfillOffset = 0;
  if (!explicitSlug && !recentOnly && !dryRun) {
    const { data: cursor } = await db.from('sync_cursors').select('page').eq('key', 'glvietsub-feed-backfill').maybeSingle();
    backfillOffset = Math.max(0, Number(cursor?.page || 0));
  }
  let discovered: string[];
  let archiveCount = 0;
  let archiveBatchSize = 0;
  let normalizedBackfillOffset = 0;
  if (explicitSlug) {
    discovered = [`${BASE}/phim-bo/${explicitSlug}`];
  } else if (recentOnly) {
    // Viewer-facing freshness lane: GLVietsub puts recently updated titles on
    // its homepage. Revisit that small window all day without rotating the
    // full sitemap during viewing peaks.
    const latestHtml = await fetchText(`${BASE}/`);
    discovered = discoverDetailUrls(latestHtml, limit);
  } else {
    const [latestHtml, sitemapOne, sitemapTwo] = await Promise.all([
      fetchText(`${BASE}/`),
      fetchText(`${BASE}/tvshows-sitemap1.xml`).catch(() => ''),
      fetchText(`${BASE}/tvshows-sitemap2.xml`).catch(() => ''),
    ]);
    const archiveUrls = Array.from(new Set([
      ...discoverSitemapUrls(sitemapOne),
      ...discoverSitemapUrls(sitemapTwo),
    ]));
    archiveCount = archiveUrls.length;
    archiveBatchSize = Math.max(1, limit - 1);
    normalizedBackfillOffset = archiveCount > 0 ? backfillOffset % archiveCount : 0;
    const archiveWindow = archiveCount > 0
      ? Array.from({ length: Math.min(archiveBatchSize, archiveCount) }, (_, index) =>
        archiveUrls[(normalizedBackfillOffset + index) % archiveCount])
      : [];
    // Check the newest title on every run, then rotate through the archive so
    // every sitemap is covered even when each WordPress sitemap contains far
    // fewer than the nominal 1,000 URLs.
    discovered = Array.from(new Set([
      ...discoverDetailUrls(latestHtml, 1),
      ...archiveWindow,
    ])).slice(0, limit);
  }
  const stored: unknown[] = [];
  const errors: string[] = [];
  let skippedUnplayable = 0;
  let consecutiveFailures = 0;
  const parsedEntries = await mapWithConcurrency(discovered, 2, async (sourceUrl) => {
    try {
      return { sourceUrl, entry: await parseDetail(sourceUrl), error: '' };
    } catch (error) {
      return { sourceUrl, entry: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  for (const parsed of parsedEntries) {
    try {
      if (!parsed.entry) throw new Error(parsed.error || 'Unknown parse failure');
      const entry = parsed.entry;
      if (!entry.name) throw new Error('Missing movie identity');
      const hasRejectedPlayback = Array.isArray(entry.duplicateEpisodes) && entry.duplicateEpisodes.length > 0;
      if (!entry.episodes.length && !hasRejectedPlayback) {
        // Coming-soon pages are valid catalogue entries, not connector
        // failures. They must remain unpublished and must not open the circuit
        // or prevent later playable movies in the same archive window.
        skippedUnplayable += 1;
        consecutiveFailures = 0;
        continue;
      }
      stored.push(dryRun ? {
        name: entry.name,
        current_episode: entry.currentEpisode,
        raw_episode: entry.rawEpisode,
        playable_episode: entry.playableEpisode,
        total_episodes: entry.expectedEpisodes,
        sources: entry.episodes.length,
      } : await storeEntry(db, entry));
      consecutiveFailures = 0;
    } catch (error) {
      const message = `${parsed.sourceUrl}: ${error instanceof Error ? error.message : String(error)}`;
      // Archive sitemaps can retain removed posts. A verified 404/410 is a
      // stale catalogue entry, not a connector outage, so it must not open the
      // circuit or make fresh playable titles in the same batch look failed.
      if (/HTTP\s+(404|410)\b/i.test(message)) {
        skippedUnplayable += 1;
        consecutiveFailures = 0;
      } else {
        consecutiveFailures += 1;
        errors.push(message);
      }
    }
  }
  const mode = explicitSlug ? 'slug' : recentOnly ? 'recent' : 'archive';
  const result = { success: errors.length === 0, dry_run: dryRun, mode, scanned: discovered.length, stored, skipped_unplayable: skippedUnplayable, errors, circuit_open: consecutiveFailures >= 3, elapsed_ms: Date.now() - started };
  if (!explicitSlug && !recentOnly && !dryRun) {
    const nextPage = archiveCount > 0
      ? (normalizedBackfillOffset + archiveBatchSize) % archiveCount
      : 0;
    await db.from('sync_cursors').upsert({ key: 'glvietsub-feed-backfill', page: nextPage, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  }
  if (!dryRun) await db.from('sync_logs').insert({
    function_name: 'sync-glvietsub-feed', run_at: new Date().toISOString(), scanned: discovered.length,
    added: stored.filter((value: any) => value.created).length, skipped: stored.filter((value: any) => !value.created).length,
    errors: errors.length, details: errors, elapsed_ms: result.elapsed_ms, success: result.success, metadata: result,
  });
  return json(result, result.success ? 200 : 207);
});
