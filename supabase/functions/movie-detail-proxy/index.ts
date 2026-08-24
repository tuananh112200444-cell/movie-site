import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { getProviderEpisodeNumber, normalizeVerifiedSeasonNumbering } from '../_shared/episode-numbering.ts';
import { hasValidPublishableApiKey, withPublicReadCors } from '../_shared/public-api-key.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MOVIE_DETAIL_PROXY_SECRET = Deno.env.get('MOVIE_DETAIL_PROXY_SECRET') ?? '';
// Viewer requests must never become an unbounded write/sync worker. The second
// explicit switch is intentionally absent by default; normal repairs go to the
// bounded playback queues and system brains instead.
const ENABLE_PUBLIC_LAZY_PERSIST =
  Deno.env.get('ENABLE_PUBLIC_LAZY_PERSIST') === 'true'
  && Deno.env.get('ENABLE_VIEWER_WRITE_PATH') === 'true';
const DETAIL_CACHE_TTL_MIN = 10;
const DETAIL_CACHE_SCHEMA_VERSION = 'provider-score-v10';
const VERIFIED_PLAYBACK_SAFETY_NET: Record<string, Array<{
  server_name: string;
  name: string;
  slug: string;
  link_m3u8: string;
  link_embed: string;
  source_provider: string;
  source_playback_score: number;
  source_health_status: string;
  source_last_checked_at: string;
}>> = {
  // Verified in a real Chrome playback request on 2026-08-23 (HTTP 200) and
  // matched to the canonical Singapore movie row before the DB pool saturated.
  // This is used only when both canonical DB playback and neutral API discovery
  // return zero safe links; normal scored database data always replaces it.
  'mua-do': [{
    server_name: '#Hà Nội (Vietsub)',
    name: 'Full',
    slug: 'full',
    link_m3u8: 'https://s6.kkphimplayer6.com/20251118/obSmOjv7/index.m3u8',
    link_embed: 'https://player.phimapi.com/player/?url=https://s6.kkphimplayer6.com/20251118/obSmOjv7/index.m3u8',
    source_provider: 'kkphim',
    source_playback_score: 720,
    source_health_status: 'ok',
    source_last_checked_at: '2026-08-23T14:50:00.000Z',
  }],
};
const CORS_HEADERS = {
  // Production viewer traffic enters through the same-origin Cloudflare
  // gateway, which owns caching, fallback and the outage circuit breaker.
  'Access-Control-Allow-Origin': 'https://khophim.org',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-khophim-proxy-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin',
};

const MOVIE_DETAIL_SELECT = [
  'id',
  'slug',
  'name',
  'origin_name',
  'title_vi',
  'title_en',
  'title_zh',
  'title_original',
  'content',
  'type',
  'status',
  'thumb_url',
  'poster_url',
  'trailer_url',
  'time',
  'episode_current',
  'episode_total',
  'current_episode',
  'total_episodes',
  'schedule_type',
  'release_time',
  'release_day',
  'schedule_timezone',
  'release_at',
  'next_episode_at',
  'next_episode_name',
  'schedule_note',
  'quality',
  'lang',
  'year',
  'actor',
  'director',
  'category',
  'country',
  'notify',
  'showtimes',
  'view',
  'ophim_id',
  'ophim_slug',
  'tmdb_id',
  'imdb_id',
  'seo_catalog_status',
  'catalog_source',
  'tmdb_media_type',
  'tmdb_popularity',
  'tmdb_vote_count',
  'tmdb_vote_average',
  'catalog_synced_at',
  'source_site',
  'source_name',
  'is_published',
  'created_at',
  'updated_at',
  'last_synced_at',
].join(',');

function isBlvietsubWatchPageUrl(url: string): boolean {
  const raw = String(url || '').replace(/&amp;/g, '&').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return /^(?:www\.)?blvietsub\.com$/i.test(parsed.hostname) && /\/+xem-phim\//i.test(parsed.pathname);
  } catch {
    return /^(?:https?:\/\/)?(?:www\.)?blvietsub\.com\/+xem-phim\//i.test(raw);
  }
}

function normalizeDailymotionUrl(url: string): string {
  if (isBlvietsubWatchPageUrl(url)) return '';
  const dm = /^https?:\/\/(?:www\.)?dailymotion\.com\/(?:embed\/)?video\/([a-zA-Z0-9]+)/i.exec(url);
  if (dm) return `https://geo.dailymotion.com/player.html?video=${dm[1]}`;
  const short = /^https?:\/\/dai\.ly\/([a-zA-Z0-9]+)/i.exec(url);
  if (short) return `https://geo.dailymotion.com/player.html?video=${short[1]}`;
  return url;
}

function epSortKey(ep: { slug?: string; name?: string }): number {
  const text = ep.slug || ep.name || '';
  const number = extractEpNumber(text);
  if (number) return number;
  if (text.toLowerCase().includes('full')) return 0;
  return Infinity;
}
function extractEpNumber(text: string): number {
  const normalized = String(text || '').toLowerCase();
  if (normalized.includes('full')) return 0;
  const decimal = normalized.match(/(?:^|\D)(\d{1,3})\.\d{1,2}(?:\D|$)/);
  if (decimal) return Number(decimal[1] || 0) || 0;
  const slash = normalized.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slash) return Number(slash[1] || 0) || 0;
  const range = normalized.match(/(?:tap|ep|episode|tập)?\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
  if (range) return Number(range[2] || 0) || Number(range[1] || 0) || 0;
  const matches = [...normalized.matchAll(/(\d{1,4})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : 0;
}

function extractMaxEpNumber(text: string): number {
  const matches = String(text || '').match(/\d+/g);
  if (!matches) return extractEpNumber(text);
  return Math.max(...matches.map((value) => Number(value || 0)).filter(Number.isFinite));
}

function getExpectedEpisodeNumber(movie: Record<string, unknown> | null | undefined): number {
  if (!movie) return 0;
  return Math.max(
    Number(movie.current_episode || 0) || 0,
    extractEpNumber(String(movie.episode_current || movie.episodeCurrent || '')),
  );
}

function getMaxEpisodeNumberFromServers(servers: Array<{ server_data?: unknown[] }> = []): number {
  return servers.reduce((max, server) => {
    const serverMax = (server.server_data ?? []).reduce((innerMax, raw) => {
      const ep = raw as Record<string, unknown>;
      if (String(ep.audio_type || '').toLowerCase() === 'raw' || /\braw\b/i.test(String(ep.name || ''))) return innerMax;
      return Math.max(innerMax, getProviderEpisodeNumber(ep));
    }, 0);
    return Math.max(max, serverMax);
  }, 0);
}

function getMaxEpisodeNumberFromServerMap(serverMap: Map<string, unknown[]>): number {
  let max = 0;
  for (const [, episodes] of serverMap) {
    for (const raw of episodes) {
      const ep = raw as Record<string, unknown>;
      max = Math.max(max, getProviderEpisodeNumber(ep));
    }
  }
  return max;
}

function isClearlyEpisodicMovie(movie: Record<string, unknown> | null | undefined): boolean {
  if (!movie) return false;
  const kind = `${movie.type || ''} ${movie.tmdb_media_type || ''}`.toLowerCase();
  const advertisedTotal = Math.max(
    Number(movie.total_episodes || 0) || 0,
    extractMaxEpNumber(String(movie.episode_total || '')),
  );
  return advertisedTotal > 1 && /phim-bo|series|tv/.test(kind);
}

function hasOnlyFullPlaceholderCoverage(
  movie: Record<string, unknown> | null | undefined,
  serverMap: Map<string, unknown[]>,
): boolean {
  if (!isClearlyEpisodicMovie(movie)) return false;
  // Without a stable external identity, `Full` may be a legitimate manual
  // compilation or special. Do not replace it from a title-only guess.
  if (!String(movie?.tmdb_id || '').trim()) return false;
  const playableLabels: string[] = [];
  for (const rows of serverMap.values()) {
    for (const raw of rows) {
      const ep = raw as Record<string, unknown>;
      if (!String(ep.link_m3u8 || '').trim() && !String(ep.link_embed || '').trim()) continue;
      playableLabels.push(`${ep.slug || ''} ${ep.name || ''}`.trim().toLowerCase());
    }
  }
  return playableLabels.length > 0 && playableLabels.every((label) => /\bfull\b/.test(label));
}

function removeLegacyUncheckedFullPlaceholders(
  movie: Record<string, unknown> | null | undefined,
  serverMap: Map<string, unknown[]>,
): void {
  if (!isClearlyEpisodicMovie(movie)) return;
  const numberedEpisodes = new Set<number>();
  for (const rows of serverMap.values()) {
    for (const raw of rows) {
      const ep = raw as Record<string, unknown>;
      const number = extractEpNumber(String(ep.slug || ep.name || ''));
      if (number > 0) numberedEpisodes.add(number);
    }
  }
  if (numberedEpisodes.size < 2) return;

  for (const [serverName, rows] of serverMap) {
    const filtered = rows.filter((raw) => {
      const ep = raw as Record<string, unknown>;
      const label = `${ep.slug || ''} ${ep.name || ''}`.trim().toLowerCase();
      const provider = String(ep.source_provider || '').trim().toLowerCase();
      const health = String(ep.source_health_status || '').trim().toLowerCase();
      // Keep manual/special Full editions. Only hide the old OPhim placeholder
      // pattern that was never independently checked and conflicts with the
      // verified numbered series catalogue.
      return !(/\bfull\b/.test(label) && provider === 'ophim' && health === 'unchecked');
    });
    if (filtered.length > 0) serverMap.set(serverName, filtered);
    else serverMap.delete(serverName);
  }
}

function isPlaceholderSeriesDetail(payload: Record<string, unknown>): boolean {
  const movie = payload.movie as Record<string, unknown> | undefined;
  if (!isClearlyEpisodicMovie(movie)) return false;
  const episodes = Array.isArray(payload.episodes)
    ? payload.episodes as Array<{ server_data?: unknown[] }>
    : [];
  const labels = episodes.flatMap((server) => (server.server_data ?? []).map((raw) => {
    const ep = raw as Record<string, unknown>;
    return `${ep.slug || ''} ${ep.name || ''}`.trim().toLowerCase();
  }));
  return labels.length > 0 && labels.every((label) => /\bfull\b/.test(label));
}

function isDetailEpisodeIncomplete(payload: Record<string, unknown>): boolean {
  const movie = payload.movie as Record<string, unknown> | undefined;
  const expected = getExpectedEpisodeNumber(movie);
  if (expected <= 1) return false;
  const episodes = Array.isArray(payload.episodes)
    ? payload.episodes as Array<{ server_data?: unknown[] }>
    : [];
  const actual = getMaxEpisodeNumberFromServers(episodes);
  return actual > 0 && actual < expected;
}

function normalizeEpisodeKeyPart(value: string): string {
  return value.trim().toLowerCase().normalize('NFC');
}

function buildEpisodeDedupKeys(serverName: string, slug: string, episodeNumber: number, name = ''): string[] {
  const server = normalizeEpisodeKeyPart(serverName || 'Nguồn');
  const keys: string[] = [];
  const normalizedSlug = normalizeEpisodeKeyPart(slug || '');
  const normalizedName = normalizeEpisodeKeyPart(name || '');
  if (normalizedSlug) keys.push(`${server}|slug:${normalizedSlug}`);
  if (normalizedName) keys.push(`${server}|name:${normalizedName}`);
  if (Number.isFinite(episodeNumber)) keys.push(`${server}|num:${episodeNumber}`);
  return keys;
}

function hasSeenEpisode(seen: Set<string>, serverName: string, slug: string, episodeNumber: number, name = ''): boolean {
  return buildEpisodeDedupKeys(serverName, slug, episodeNumber, name).some((key) => seen.has(key));
}

function markSeenEpisode(seen: Set<string>, serverName: string, slug: string, episodeNumber: number, name = ''): void {
  for (const key of buildEpisodeDedupKeys(serverName, slug, episodeNumber, name)) {
    seen.add(key);
  }
}

function isHiddenEpisodeSource(source: unknown): boolean {
  return String(source || '').trim().toLowerCase() === 'hidden';
}

function hasPlayableEpisodeLink(epData: Record<string, unknown>): boolean {
  return Boolean(
    String(epData.link_m3u8 || '').trim() ||
    String(epData.link_embed || '').trim()
  );
}

function hasPlayableFullMovie(servers: Array<{ server_data?: unknown[] }> = []): boolean {
  return servers.some((server) =>
    (server.server_data || []).some((raw) => {
      const episode = raw as Record<string, unknown>;
      if (!hasPlayableEpisodeLink(episode) || !episodeHealthIsUsable(episode)) return false;
      const label = `${String(episode.slug || '')} ${String(episode.name || '')}`.trim().toLowerCase();
      return /\bfull\b/.test(label) && !label.includes('trailer');
    })
  );
}

function pushEpisode(serverMap: Map<string, unknown[]>, serverName: string, epData: Record<string, unknown>): void {
  if (!hasPlayableEpisodeLink(epData)) return;
  if (!serverMap.has(serverName)) serverMap.set(serverName, []);
  serverMap.get(serverName)!.push(epData);
}

function normalizePlayableUrl(value = ''): string {
  return String(value || '').trim().replace(/&amp;/g, '&').replace(/\/+$/, '');
}

function isRetiredOphimPlayback(
  source: unknown,
  serverName: unknown,
  ...urls: unknown[]
): boolean {
  const identity = `${String(source || '')} ${String(serverName || '')}`.toLowerCase();
  if (/(?:^|[^a-z0-9])ophim(?:[^a-z0-9]|$)|opstream/i.test(identity)) return true;
  return urls.some((value) => {
    const raw = String(value || '').trim();
    if (!raw) return false;
    try {
      const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
      return host === 'ophim1.com' || host.endsWith('.ophim1.com') || /opstream/i.test(host);
    } catch {
      return /ophim1\.com|opstream/i.test(raw);
    }
  });
}

function sanitizeRetiredOphimDetail(payload: Record<string, unknown>): Record<string, unknown> {
  const servers = Array.isArray(payload.episodes) ? payload.episodes as Record<string, unknown>[] : [];
  const episodes = servers.map((server) => {
    const serverName = String(server.server_name || '');
    const rows = (Array.isArray(server.server_data) ? server.server_data : []) as Record<string, unknown>[];
    const serverData = rows.filter((episode) => {
      if (isRetiredOphimPlayback(
        episode.source_provider,
        serverName,
        episode.link_m3u8,
        episode.link_embed,
      )) return false;
      if (isKnownBlockedEmbedHost(String(episode.link_embed || episode.link_m3u8 || ''))) return false;
      return episodeHealthIsUsable(episode);
    });
    return { ...server, server_data: serverData };
  }).filter((server) => (server.server_data as unknown[]).length > 0);
  return { ...payload, episodes };
}

function playbackIdentityUrl(value = ''): string {
  const raw = normalizePlayableUrl(value);
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
    return raw;
  }
}

function suppressRepeatedGlvietsubPlaybackUrls(serverMap: Map<string, unknown[]>): void {
  const ownerByUrl = new Map<string, number>();
  for (const rows of serverMap.values()) {
    for (const raw of rows) {
      const episode = raw as Record<string, unknown>;
      if (String(episode.source_provider || '').trim().toLowerCase() !== 'glvietsub') continue;
      const episodeNumber = extractEpNumber(String(episode.slug || episode.name || ''));
      const identity = playbackIdentityUrl(String(episode.link_m3u8 || episode.link_embed || ''));
      if (!identity || episodeNumber <= 0) continue;
      const owner = ownerByUrl.get(identity);
      if (owner === undefined || episodeNumber < owner) ownerByUrl.set(identity, episodeNumber);
    }
  }
  for (const [serverName, rows] of serverMap) {
    const filtered = rows.filter((raw) => {
      const episode = raw as Record<string, unknown>;
      if (String(episode.source_provider || '').trim().toLowerCase() !== 'glvietsub') return true;
      const episodeNumber = extractEpNumber(String(episode.slug || episode.name || ''));
      const identity = playbackIdentityUrl(String(episode.link_m3u8 || episode.link_embed || ''));
      const owner = identity ? ownerByUrl.get(identity) : undefined;
      return !identity || episodeNumber <= 0 || owner === undefined || owner === episodeNumber;
    });
    if (filtered.length > 0) serverMap.set(serverName, filtered);
    else serverMap.delete(serverName);
  }
}

function isDuplicateDbError(error: { code?: string; message?: string } | null | undefined): boolean {
  const text = String(error?.message || '').toLowerCase();
  return error?.code === '23505' || text.includes('duplicate') || text.includes('unique constraint');
}

function streamRowUrl(row: Record<string, unknown>): string {
  return normalizePlayableUrl(String(row.stream_url || row.embed_url || ''));
}

function buildStreamHealthIndex(streams: unknown[] = []): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  for (const raw of streams) {
    const row = raw as Record<string, unknown>;
    const url = streamRowUrl(row);
    const serverName = String(row.server_name || 'Nguá»“n');
    const episodeSlug = String(row.episode_slug || '');
    if (url) index.set(`url:${url}`, row);
    if (serverName && episodeSlug) {
      index.set(`server:${normalizeEpisodeKeyPart(serverName)}|slug:${normalizeEpisodeKeyPart(episodeSlug)}`, row);
      const episodeNumber = extractEpNumber(episodeSlug);
      if (Number.isFinite(episodeNumber)) {
        index.set(`server:${normalizeEpisodeKeyPart(serverName)}|num:${episodeNumber}`, row);
      }
    }
  }
  return index;
}

function getEpisodeHealthRow(
  healthIndex: Map<string, Record<string, unknown>>,
  serverName: string,
  slug: string,
  episodeNumber: number,
  epData: Record<string, unknown>,
): Record<string, unknown> | null {
  const url = normalizePlayableUrl(String(epData.link_m3u8 || epData.link_embed || ''));
  if (url && healthIndex.has(`url:${url}`)) return healthIndex.get(`url:${url}`) || null;
  const server = normalizeEpisodeKeyPart(serverName || 'Nguá»“n');
  const normalizedSlug = normalizeEpisodeKeyPart(slug || '');
  if (server && normalizedSlug && healthIndex.has(`server:${server}|slug:${normalizedSlug}`)) {
    return healthIndex.get(`server:${server}|slug:${normalizedSlug}`) || null;
  }
  if (server && Number.isFinite(episodeNumber) && healthIndex.has(`server:${server}|num:${episodeNumber}`)) {
    return healthIndex.get(`server:${server}|num:${episodeNumber}`) || null;
  }
  return null;
}

function isConclusivePlaybackFailure(message: unknown): boolean {
  return /(?:HTTP|segment|playlist|manifest)\s*(?:404|410)\b|\b(?:ENOTFOUND|NXDOMAIN)\b|name not resolved|could not resolve host|connection refused/i
    .test(String(message || ''));
}

function isBrowserManagedProbeException(embedUrl: string): boolean {
  return /https?:\/\/player\.phimapi\.com\/player\//i.test(embedUrl) ||
    /https?:\/\/[^/]*streamc\.xyz\//i.test(embedUrl);
}

function isBrowserManagedHardFailureException(embedUrl: string): boolean {
  return /https?:\/\/player\.phimapi\.com\/player\//i.test(embedUrl);
}

function shouldSuppressUnhealthyStream(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  if (String(row.last_error || '').startsWith('Provider verification pending:')) return true;
  const healthStatus = String(row.health_status || '').toLowerCase();
  const failureCount = Number(row.failure_count || 0);
  const embedUrl = String(row.embed_url || row.link_embed || '').trim();
  const browserManagedException = isBrowserManagedProbeException(embedUrl);
  if (healthStatus === 'failed' && isConclusivePlaybackFailure(row.last_error) && !isBrowserManagedHardFailureException(embedUrl)) return true;
  if (healthStatus === 'blocked' && !browserManagedException) return true;
  return healthStatus === 'dead' || (healthStatus === 'failed' && failureCount >= 3);
}

function episodeHealthIsUsable(ep: Record<string, unknown>): boolean {
  if (String(ep.source_last_error || '').startsWith('Provider verification pending:')) return false;
  const status = String(ep.source_health_status || '').trim().toLowerCase();
  const failures = Number(ep.source_failure_count || 0);
  const embedUrl = String(ep.link_embed || '').trim();
  const browserManagedException = isBrowserManagedProbeException(embedUrl);
  if (status === 'dead') return false;
  if (status === 'failed' && isConclusivePlaybackFailure(ep.source_last_error) && !isBrowserManagedHardFailureException(embedUrl)) return false;
  if (status === 'failed' && failures >= 2) return false;
  if (status === 'blocked' && failures >= 2) return false;
  return true;
}

function hasUnhealthyExpectedCoverage(
  serverMap: Map<string, unknown[]>,
  expectedEpisode: number,
): boolean {
  if (expectedEpisode <= 0 || expectedEpisode > 300) return false;
  const usable = new Set<number>();
  const present = new Set<number>();
  for (const rows of serverMap.values()) {
    for (const raw of rows) {
      const ep = raw as Record<string, unknown>;
      const number = extractEpNumber(String(ep.slug || ep.name || ''));
      if (number <= 0 || number > expectedEpisode) continue;
      present.add(number);
      if (episodeHealthIsUsable(ep)) usable.add(number);
    }
  }
  if (present.size === 0) return false;
  for (let number = 1; number <= expectedEpisode; number += 1) {
    if (present.has(number) && !usable.has(number)) return true;
  }
  return false;
}

function episodeProviderKey(ep: Record<string, unknown>): string {
  const source = String(ep.source_provider || '').trim().toLowerCase();
  if (/phimapi|kkphim/.test(source)) return 'phimapi';
  if (/ophim/.test(source)) return 'ophim';
  if (/motchill/.test(source)) return 'motchill';
  if (source) return source;
  try {
    return new URL(String(ep.link_m3u8 || ep.link_embed || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// Old catalogues can look complete while every URL comes from one provider and
// has never been checked. Request one independent provider before promising
// playback; once either a healthy URL or a second provider exists, normal cache
// behavior resumes and the external API is not called on every page view.
function hasUnverifiedSingleProviderCoverage(
  serverMap: Map<string, unknown[]>,
  expectedEpisode: number,
): boolean {
  if (expectedEpisode <= 0 || expectedEpisode > 300) return false;
  const episodes = new Map<number, Array<Record<string, unknown>>>();
  for (const rows of serverMap.values()) {
    for (const raw of rows) {
      const ep = raw as Record<string, unknown>;
      const number = extractEpNumber(String(ep.slug || ep.name || ''));
      if (number <= 0 || number > expectedEpisode) continue;
      const bucket = episodes.get(number) || [];
      bucket.push(ep);
      episodes.set(number, bucket);
    }
  }
  for (const candidates of episodes.values()) {
    if (candidates.some((ep) => {
      if (String(ep.source_health_status || '').toLowerCase() !== 'ok') return false;
      const checkedAt = Date.parse(String(ep.source_last_checked_at || ''));
      return Number.isFinite(checkedAt) && Date.now() - checkedAt <= 6 * 60 * 60 * 1000;
    })) continue;
    const providers = new Set(candidates.map(episodeProviderKey).filter(Boolean));
    if (providers.size < 2) return true;
  }
  return false;
}

function attachStreamHealth(epData: Record<string, unknown>, row: Record<string, unknown> | null): Record<string, unknown> {
  if (!row) return epData;
  const healthStatus = String(row.health_status || 'unchecked').toLowerCase();
  const lastError = String(row.last_error || '');
  const directStreamFailed = healthStatus === 'degraded' && lastError.startsWith('Direct stream failed:');
  return {
    ...epData,
    ...(directStreamFailed ? { link_m3u8: '' } : {}),
    source_health_status: healthStatus,
    source_response_time_ms: Number(row.response_time_ms || 0) || undefined,
    source_failure_count: Number(row.failure_count || 0) || undefined,
    source_priority: Number(row.priority || 0) || undefined,
    source_playback_score: Number(row.playback_score ?? -1) >= 0 ? Number(row.playback_score) : undefined,
    source_provider: String(row.provider_key || row.source || epData.source_provider || '') || undefined,
    source_last_checked_at: String(row.last_checked_at || '') || undefined,
    source_last_error: lastError || undefined,
  };
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function fetchTextWithTimeout(url: string, ms = 5000, init: RequestInit = {}): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => { try { controller.abort(); } catch { /* noop */ } }, ms);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KhoPhimBot/1.0)',
        'Accept': init.body ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml',
        ...(init.headers || {}),
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function getUrlHost(value = ''): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isKnownBlockedEmbedHost(value = ''): boolean {
  const raw = String(value || '').toLowerCase();
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  if (
    raw.includes('versondd.top') || decoded.includes('versondd.top') ||
    raw.includes('short.icu') || decoded.includes('short.icu')
  ) return true;
  const host = getUrlHost(value);
  return (
    host === 'versondd.top' || host.endsWith('.versondd.top') ||
    host === 'short.icu' || host.endsWith('.short.icu') ||
    // This exact host returns X-Frame-Options: sameorigin in a real Chrome
    // navigation, so an apparently successful probe still cannot play inside
    // KhoPhim's iframe. Other StreamC hosts remain score/health candidates.
    host === 'embed11.streamc.xyz'
  );
}

async function readCachedDetail(
  supabase: ReturnType<typeof createClient>,
  slug: string,
  liveMovie: Record<string, unknown> | null,
): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await supabase
      .from('movie_api_cache')
      .select('detail_json, expires_at')
      .eq('slug', slug)
      .abortSignal(timeoutSignal(6000))
      .maybeSingle();

    const row = data as { detail_json?: unknown; expires_at?: string } | null;
    if (!row?.detail_json || !row.expires_at) return null;
    if (liveMovie && liveMovie.is_published !== true) return null;
    // Playback health and scores change independently from movie metadata.
    // Never let a stale derived snapshot shadow freshly revalidated streams.
    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    const cachedPayload = row.detail_json as Record<string, unknown>;
    if (cachedPayload.playback_cache_version !== DETAIL_CACHE_SCHEMA_VERSION) return null;
    const cachedMovie = cachedPayload.movie as Record<string, unknown> | undefined;
    if (getExpectedEpisodeNumber(liveMovie as Record<string, unknown> | null) > getExpectedEpisodeNumber(cachedMovie)) return null;
    const sanitized = sanitizeRetiredOphimDetail(cachedPayload);
    return detailHasPlayableEpisodes(sanitized) ? sanitized : null;
  } catch {
    return null;
  }
}

async function writeCachedDetail(
  supabase: ReturnType<typeof createClient>,
  slug: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase
      .from('movie_api_cache')
      .upsert({
        slug,
        detail_json: payload,
        source: 'movie-detail-proxy',
        cached_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + DETAIL_CACHE_TTL_MIN * 60 * 1000).toISOString(),
      })
      .abortSignal(timeoutSignal(3000));
  } catch {
    /* cache write is best-effort */
  }
}

/* ── Search OPhim for correct slug when detail 404 ── */
function getInternalSyncSecret(): string {
  return Deno.env.get('CRON_SECRET') ||
    Deno.env.get('BLVIETSUB_SYNC_SECRET') ||
    Deno.env.get('PLAYER_REPAIR_SECRET') ||
    '';
}

function edgeWaitUntil(promise: Promise<unknown>): void {
  try {
    const runtime = globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    };
    if (runtime.EdgeRuntime?.waitUntil) {
      runtime.EdgeRuntime.waitUntil(promise);
    } else {
      void promise;
    }
  } catch {
    void promise;
  }
}

function isBlvietsubMovieRecord(movie: Record<string, unknown> | null | undefined): boolean {
  const text = `${movie?.source_site || ''} ${movie?.source_name || ''} ${movie?.showtimes || ''} ${movie?.source_url || ''}`.toLowerCase();
  return text.includes('blvietsub') || text.includes('glvietsub') || text.includes('admin-queer');
}

function isGlvietsubMovieRecord(movie: Record<string, unknown> | null | undefined): boolean {
  const text = `${movie?.source_site || ''} ${movie?.source_name || ''} ${movie?.showtimes || ''} ${movie?.source_url || ''}`.toLowerCase();
  return text.includes('glvietsub');
}

function getGlvietsubMovieSlug(movie: Record<string, unknown> | null | undefined): string {
  for (const value of [movie?.source_url, movie?.showtimes]) {
    const raw = String(value || '').trim();
    try {
      const url = new URL(raw);
      if (!/(^|\.)glvietsub\.net$/i.test(url.hostname)) continue;
      const match = url.pathname.match(/\/phim-bo\/([^/?#]+)/i);
      if (match?.[1]) return decodeURIComponent(match[1]).trim();
    } catch {
      // Fall through to the stable database slug below.
    }
  }
  return String(movie?.slug || '').replace(/^glvietsub-/i, '').trim();
}

function getBlvietsubMovieUrl(movie: Record<string, unknown> | null | undefined): string {
  for (const value of [movie?.source_url, movie?.showtimes]) {
    const raw = String(value || '').trim();
    try {
      const url = new URL(raw);
      if (!/^(?:www\.)?blvietsub\.com$/i.test(url.hostname)) continue;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0]?.toLowerCase() === 'phim' && parts.length === 2) {
        return `https://blvietsub.com/phim/${encodeURIComponent(decodeURIComponent(parts[1]))}/`;
      }
      // WordPress exposes /phim/<slug>/ as the source page but advertises
      // /<slug>/ as its canonical URL. Older sync rows therefore stored the
      // root canonical and could not be targeted by manual detail refresh.
      if (parts.length === 1 && !/^(?:phim|xem-phim|categories|category|tag|feed|page|wp-json)$/i.test(parts[0])) {
        return `https://blvietsub.com/phim/${encodeURIComponent(decodeURIComponent(parts[0]))}/`;
      }
    } catch {
      // Ignore malformed historical source URLs.
    }
  }
  return '';
}

function isUnifiedProviderMovieRecord(movie: Record<string, unknown> | null | undefined): boolean {
  const text = `${movie?.source_site || ''} ${movie?.source_name || ''}`.toLowerCase();
  return text.includes('ophim') || text.includes('kkphim') || text.includes('phimapi') ||
    text.includes('vsmov') || text.includes('nguonc') || text.includes('nguồn c') || !!movie?.ophim_slug;
}

function isTrustedQueerEpisodeSource(
  source: unknown,
  serverName: unknown,
  verifiedProviders: ReadonlySet<string> = new Set(),
): boolean {
  const text = `${source || ''} ${serverName || ''}`.toLowerCase();
  if (!text.trim()) return true;
  const sourceKey = String(source || '').trim().toLowerCase() === 'kkphim'
    ? 'phimapi'
    : String(source || '').trim().toLowerCase();
  if (sourceKey && verifiedProviders.has(sourceKey)) return true;
  const verifiedAuxiliary =
    text.includes('verified') &&
    (text.includes('ophim') || text.includes('kkphim') || text.includes('phimapi'));
  if (verifiedAuxiliary) return true;
  if (
    text.includes('ophim') ||
    text.includes('kkphim') ||
    text.includes('phimapi') ||
    text.includes('#hà nội') ||
    text.includes('#ha noi') ||
    text.includes('hà nội') ||
    text.includes('ha noi')
  ) {
    return false;
  }
  return (
    text.includes('blvietsub') ||
    text.includes('glvietsub') ||
    text.includes('admin-queer') ||
    text.includes('verified') ||
    text.includes('manual') ||
    text.includes('stream') ||
    text.includes('ss') ||
    /\bsv\s*\d+\b/.test(text)
  );
}

function hasUntrustedQueerEpisodeServer(payload: Record<string, unknown> | null | undefined): boolean {
  const movie = payload?.movie as Record<string, unknown> | undefined;
  if (!isBlvietsubMovieRecord(movie)) return false;
  const servers = Array.isArray(payload?.episodes)
    ? payload.episodes as Array<{ server_name?: unknown }>
    : [];
  return servers.some((server) => !isTrustedQueerEpisodeSource('', server.server_name));
}

function detailHasPlayableEpisodes(detail: { episodes?: Array<{ server_data?: unknown[] }> } | null | undefined): boolean {
  return Boolean(detail?.episodes?.some((server) =>
    (server.server_data ?? []).some((raw) => {
      const ep = raw as Record<string, unknown>;
      return Boolean(String(ep.link_m3u8 || '').trim() || String(ep.link_embed || '').trim());
    })
  ));
}

function parseMotchillEpisodeLinks(html: string, slug: string): Array<{ episodeNumber: number; url: string }> {
  const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`href=['"]([^'"]*\\/tap-phim\\/${escapedSlug}-tap-(\\d+)[^'"]*)['"]`, 'gi');
  const links = new Map<number, string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const episodeNumber = Number(match[2] || 0);
    if (!episodeNumber) continue;
    const rawUrl = match[1].replace(/&amp;/g, '&');
    const url = rawUrl.startsWith('http') ? rawUrl : `https://www.motchillkz.org${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    links.set(episodeNumber, url);
  }
  return [...links.entries()]
    .map(([episodeNumber, url]) => ({ episodeNumber, url }))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
}

function parseMotchillPlayerOptions(html: string): Array<{ serverName: string; post: string; nume: string; type: string }> {
  const options: Array<{ serverName: string; post: string; nume: string; type: string }> = [];
  const pattern = /<li[^>]*data-type=['"]([^'"]+)['"][^>]*data-post=['"]([^'"]+)['"][^>]*data-nume=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const titleMatch = match[4].match(/<span[^>]*class=['"][^'"]*title[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i);
    const serverName = decodeHtmlEntities(titleMatch?.[1] || `Motchill #${match[3]}`);
    if (/trailer/i.test(serverName)) continue;
    options.push({
      serverName: serverName || `Motchill #${match[3]}`,
      type: match[1],
      post: match[2],
      nume: match[3],
    });
  }
  return options;
}

async function fetchMotchillPlayer(option: { post: string; nume: string; type: string }): Promise<string> {
  const body = new URLSearchParams({
    action: 'doo_player_ajax',
    post: option.post,
    nume: option.nume,
    type: option.type,
  });
  const text = await fetchTextWithTimeout('https://www.motchillkz.org/wp-admin/admin-ajax.php', 4500, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Referer': 'https://www.motchillkz.org/',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });
  if (!text) return '';
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const value = String(payload.embed_url || '').replace(/\\\//g, '/').trim();
    if (/^https?:\/\//i.test(value)) return value;
    return value.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)/i)?.[1] || '';
  } catch {
    return '';
  }
}

async function fetchMotchillMovieDetail(
  slug: string,
): Promise<{
  movie: Record<string, unknown>;
  episodes: Array<{ server_name: string; server_data: unknown[] }>;
  elapsed_ms?: number;
} | null> {
  const seriesUrl = `https://www.motchillkz.org/phim-bo/${encodeURIComponent(slug)}`;
  const html = await fetchTextWithTimeout(seriesUrl, 5500);
  if (!html || !html.includes('/tap-phim/')) return null;

  const episodeLinks = parseMotchillEpisodeLinks(html, slug);
  if (episodeLinks.length === 0) return null;

  const maxListedEpisode = episodeLinks.reduce((max, episode) => Math.max(max, episode.episodeNumber), 0);
  const labelText = decodeHtmlEntities(html.match(/<span[^>]*class=['"][^'"]*item-label[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
  const currentFromLabel = extractMaxEpNumber(labelText) || Math.min(maxListedEpisode, 1);
  const linksToFetch = episodeLinks.slice(0, 24);
  const serverMap = new Map<string, Record<string, unknown>[]>();

  await Promise.all(linksToFetch.map(async ({ episodeNumber, url }) => {
    const episodeHtml = await fetchTextWithTimeout(url, 5500, { headers: { Referer: seriesUrl } });
    if (!episodeHtml) return;
    const options = parseMotchillPlayerOptions(episodeHtml);
    await Promise.all(options.slice(0, 4).map(async (option) => {
      const embed = await fetchMotchillPlayer(option);
      if (!embed || /youtube\.com|youtu\.be/i.test(embed) || isKnownBlockedEmbedHost(embed)) return;
      const serverName = option.serverName.toLowerCase().includes('motchill')
        ? option.serverName
        : `${option.serverName} Motchill`;
      if (!serverMap.has(serverName)) serverMap.set(serverName, []);
      serverMap.get(serverName)!.push({
        name: `Tap ${episodeNumber}`,
        slug: `tap-${episodeNumber}`,
        filename: '',
        link_embed: embed,
        link_m3u8: '',
        source: 'motchill',
      });
    }));
  }));

  const episodes = [...serverMap.entries()]
    .map(([server_name, server_data]) => ({
      server_name,
      server_data: server_data.sort((a, b) => epSortKey(a) - epSortKey(b)),
    }))
    .filter((server) => server.server_data.length > 0);

  if (episodes.length === 0) return null;

  const title = decodeHtmlEntities(
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<meta[^>]+property=['"]og:title['"][^>]+content=['"]([^'"]+)['"]/i)?.[1] ||
    slug.replace(/-/g, ' '),
  );
  const originName = decodeHtmlEntities(html.match(/<h2[^>]*class=['"][^'"]*tieudephim[^'"]*['"][^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
  const poster = (html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i)?.[1] || '').replace(/&amp;/g, '&');
  const year = Number(html.match(/<span[^>]*class=['"]year['"][^>]*>(\d{4})<\/span>/i)?.[1] || 0);

  return {
    movie: {
      id: `motchill:${slug}`,
      _id: `motchill:${slug}`,
      slug,
      name: title,
      origin_name: originName,
      type: 'series',
      status: 'ongoing',
      thumb_url: poster,
      poster_url: poster,
      episode_current: currentFromLabel > 0 ? `Tap ${currentFromLabel}` : '',
      current_episode: currentFromLabel || undefined,
      year: year || undefined,
      source_site: 'motchill',
      source_name: 'Motchill',
    },
    episodes,
  };
}

async function callInternalFunction(
  functionName: string,
  params: Record<string, string | number | boolean>,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, status: 0, body: null };
  const secret = getInternalSyncSecret();
  const endpoint = new URL(`${SUPABASE_URL}/functions/v1/${functionName}`);
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
  if (secret) endpoint.searchParams.set('secret', secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(endpoint.toString(), {
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    return { ok: response.ok && body?.success !== false, status: response.status, body };
  } catch (error) {
    console.log(`[movie-detail-proxy] on-demand repair ${functionName} failed:`, error);
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

async function clearDetailCaches(
  supabase: ReturnType<typeof createClient>,
  slugs: string[],
): Promise<void> {
  const cleanSlugs = Array.from(new Set(slugs.map((value) => String(value || '').trim()).filter(Boolean)));
  if (cleanSlugs.length === 0) return;
  await Promise.allSettled(cleanSlugs.map((cacheSlug) =>
    supabase.from('movie_api_cache').delete().eq('slug', cacheSlug)
  ));
}

function triggerOnDemandEpisodeRepair(
  supabase: ReturnType<typeof createClient>,
  movie: Record<string, unknown> | null | undefined,
  requestedSlug: string,
  reason: string,
): boolean {
  if (!movie) return false;
  const movieSlug = String(movie.slug || requestedSlug).trim();
  let repairPromise: Promise<unknown> | null = null;

  if (isGlvietsubMovieRecord(movie)) {
    const sourceSlug = getGlvietsubMovieSlug(movie);
    if (sourceSlug) {
      repairPromise = callInternalFunction('sync-glvietsub-feed', {
        slug: sourceSlug,
        reason,
      });
    }
  } else if (isBlvietsubMovieRecord(movie)) {
    const movieUrl = getBlvietsubMovieUrl(movie);
    if (movieUrl) {
      repairPromise = callInternalFunction('sync-blvietsub-feed', {
        movie_url: movieUrl,
        refresh_search: '1',
        reason,
      });
    } else {
      repairPromise = callInternalFunction('sync-blvietsub-feed', {
        repair_existing: '1',
        limit: 8,
        refresh_search: '1',
        reason,
      });
    }
  } else if (isUnifiedProviderMovieRecord(movie)) {
    repairPromise = callInternalFunction('unified-provider-brain', {
      slug: movieSlug,
      limit: 1,
      provider_budget: 4,
      reason,
    });
  }

  if (!repairPromise) return false;
  edgeWaitUntil(
    repairPromise
      .then(() => clearDetailCaches(supabase, [requestedSlug, movieSlug, String(movie.ophim_slug || '')]))
      .catch(() => undefined),
  );
  return true;
}

function triggerOnDemandStreamRecovery(
  supabase: ReturnType<typeof createClient>,
  movie: Record<string, unknown> | null | undefined,
  requestedSlug: string,
): boolean {
  if (!movie) return false;
  const movieSlug = String(movie.slug || requestedSlug).trim();
  if (!movieSlug) return false;

  // Do not put provider probing on the viewer response path. The targeted
  // health route includes inactive rows, validates HLS down to a media
  // segment, and reactivates the stream only after fresh playback proof.
  edgeWaitUntil(
    callInternalFunction('stream-health-check', {
      slug: movieSlug,
      limit: 12,
      concurrency: 3,
      deactivate_after: 3,
      queue: 'recovery',
    })
      .then(() => clearDetailCaches(supabase, [
        requestedSlug,
        movieSlug,
        String(movie.ophim_slug || ''),
      ]))
      .catch(() => undefined),
  );
  return true;
}

async function searchOphimCandidateSlugs(keyword: string, limit = 6, preferredYear = 0): Promise<string[]> {
  const cleanKeyword = String(keyword || '').trim();
  if (!cleanKeyword) return [];
  const urls = [
    `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(cleanKeyword)}&limit=${limit}`,
    `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(cleanKeyword)}`,
  ];
  type SearchIdentity = { slug: string; tmdbId: string; name: string; originName: string; year: number };
  const providerResults = await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) return [] as SearchIdentity[];
      const data = await r.json() as Record<string, unknown>;
      const d = data as Record<string, unknown>;
      const items = (d?.data as Record<string, unknown>)?.items ?? d?.items ?? [];
      if (!Array.isArray(items)) return [] as SearchIdentity[];
      const rankedItems = [...items].sort((a, b) => {
        if (preferredYear <= 0) return 0;
        const aYear = Number((a as Record<string, unknown>).year || 0) || 0;
        const bYear = Number((b as Record<string, unknown>).year || 0) || 0;
        return Number(bYear === preferredYear) - Number(aYear === preferredYear);
      });
      return rankedItems
        .map((item) => {
          const row = item as Record<string, unknown>;
          const tmdb = row.tmdb && typeof row.tmdb === 'object'
            ? row.tmdb as Record<string, unknown>
            : {};
          return {
            slug: String(row.slug || '').trim(),
            tmdbId: String(tmdb.id || row.tmdb_id || '').trim(),
            name: String(row.name || '').trim(),
            originName: String(row.origin_name || row.original_name || '').trim(),
            year: Number(row.year || 0) || 0,
          };
        })
        .filter((item) => !!item.slug)
        .slice(0, limit);
    } catch {
      return [] as SearchIdentity[];
    }
  }));
  const normalizedKeyword = slugifyVietnamese(cleanKeyword);
  const identities = providerResults.flat();
  const exactSeeds = identities.filter((item) => [item.slug, item.name, item.originName]
    .some((value) => slugifyVietnamese(value) === normalizedKeyword));
  const targetTmdbIds = new Set(exactSeeds.map((item) => item.tmdbId).filter(Boolean));
  const targetNames = new Set(exactSeeds
    .flatMap((item) => [item.name, item.originName])
    .map(slugifyVietnamese)
    .filter(Boolean));
  if (targetNames.size === 0) targetNames.add(normalizedKeyword);
  const targetYears = new Set(exactSeeds.map((item) => item.year).filter((year) => year > 0));
  const sameVerifiedIdentity = (item: SearchIdentity) => {
    const exactSlug = slugifyVietnamese(item.slug) === normalizedKeyword;
    const sameTmdb = !!item.tmdbId && targetTmdbIds.has(item.tmdbId);
    const sameTitle = [item.name, item.originName]
      .map(slugifyVietnamese)
      .some((name) => !!name && targetNames.has(name));
    const sameYear = targetYears.size === 0 || item.year <= 0 || targetYears.has(item.year);
    return exactSlug || sameTmdb || (sameTitle && sameYear);
  };
  const verified = identities.filter(sameVerifiedIdentity);
  const slugs = Array.from(new Set(verified.map((item) => item.slug)));
  return slugs
    .sort((a, b) => Number(slugifyVietnamese(b) === normalizedKeyword) - Number(slugifyVietnamese(a) === normalizedKeyword) || a.localeCompare(b))
    .slice(0, limit);
}

/* ── OPTIMIZED: Accept ANY 200 response from /phim/${slug} ── */
function verifiedAuxiliaryServerName(serverName: unknown, provider: string): string {
  const clean = String(serverName || 'Vietsub').trim();
  const prefix = provider === 'kkphim'
    ? 'KKPhim'
    : provider === 'phimapi'
      ? 'PhimAPI'
      : provider === 'vsmov'
        ? 'VSMov'
        : 'OPhim';
  return `${prefix} verified - ${clean}`;
}

function externalProviderFromMovie(movie: Record<string, unknown> | null | undefined): string {
  const text = `${movie?.source_site || ''} ${movie?.source_name || ''}`.toLowerCase();
  if (text.includes('kkphim')) return 'kkphim';
  if (text.includes('phimapi')) return 'phimapi';
  if (text.includes('vsmov')) return 'vsmov';
  return 'ophim';
}

function verifiedAuxiliarySourceFromServer(serverName: unknown): string {
  const text = String(serverName || '').toLowerCase();
  if (text.includes('kkphim')) return 'verified-kkphim';
  if (text.includes('phimapi')) return 'verified-phimapi';
  if (text.includes('vsmov')) return 'verified-vsmov';
  return 'verified-ophim';
}

function isSafeAuxiliaryExternalMatch(
  primary: Record<string, unknown> | null | undefined,
  external: Record<string, unknown> | null | undefined,
): boolean {
  if (!primary || !external) return false;
  const primaryTmdbObject = primary.tmdb && typeof primary.tmdb === 'object'
    ? primary.tmdb as Record<string, unknown>
    : null;
  const externalTmdbObject = external.tmdb && typeof external.tmdb === 'object'
    ? external.tmdb as Record<string, unknown>
    : null;
  const primaryTmdb = String(primary.tmdb_id || primaryTmdbObject?.id || '').trim();
  const externalTmdb = String(external.tmdb_id || externalTmdbObject?.id || '').trim();
  if (primaryTmdb && externalTmdb && primaryTmdb === externalTmdb) {
    const mediaType = `${primary.tmdb_media_type || primaryTmdbObject?.type || ''} ${external.tmdb_media_type || externalTmdbObject?.type || ''} ${external.type || ''}`.toLowerCase();
    const primaryYear = Number(primary.year || 0) || 0;
    const externalYear = Number(external.year || 0) || 0;
    // TMDB uses one series ID across all seasons. The release year prevents a
    // season-1 catalogue shell from importing season 2/3 merely because the
    // series-level TMDB ID is identical.
    if (/tv|series/.test(mediaType) && primaryYear > 0 && externalYear > 0 && primaryYear !== externalYear) {
      return false;
    }
    return true;
  }
  return sameMovieYearOrUnknown(primary, external) && hasSharedTitle(primary, external);
}

async function fetchVerifiedAuxiliaryExternalDetail(
  movie: Record<string, unknown> | null | undefined,
): Promise<{
  movie: Record<string, unknown>;
  episodes: Array<{ server_name: string; server_data: unknown[] }>;
} | null> {
  if (!movie) return null;
  const candidates = Array.from(new Set([
    movie.ophim_slug,
    movie.origin_name,
    movie.title_en,
    movie.title_original,
    movie.name,
    String(movie.slug || '').replace(/^blvietsub-\d+-/, '').replace(/-/g, ' '),
  ]
    .map((value) => String(value || '').trim())
    .filter((value) => value.length >= 3)
    .slice(0, 5)));

  for (const query of candidates) {
    const directSlugs = /^[a-z0-9-]+$/i.test(query) ? [query] : [];
    const preferredYear = Number(movie.year || 0) || 0;
    const searchSlugs = await searchOphimCandidateSlugs(query, 5, preferredYear);
    for (const candidateSlug of Array.from(new Set([...directSlugs, ...searchSlugs]))) {
      const detail = await fetchExternalMovieDetail(candidateSlug);
      if (!detail || !detailHasPlayableEpisodes(detail)) continue;
      if (!isSafeAuxiliaryExternalMatch(movie, detail.movie)) continue;
      const provider = externalProviderFromMovie(detail.movie);
      return {
        movie: detail.movie,
        episodes: detail.episodes.map((server) => ({
          server_name: verifiedAuxiliaryServerName(server.server_name, provider),
          server_data: server.server_data,
        })),
      };
    }
  }
  return null;
}

async function persistVerifiedAuxiliaryEpisodes(
  supabase: ReturnType<typeof createClient>,
  movieId: string,
  detail: { episodes: Array<{ server_name: string; server_data: unknown[] }> },
): Promise<{ inserted: number; updated: number; skipped: number }> {
  if (!movieId || !detail?.episodes?.length) return { inserted: 0, updated: 0, skipped: 0 };

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const server of detail.episodes) {
    const serverName = String(server.server_name || '').trim();
    if (!serverName || !isTrustedQueerEpisodeSource(verifiedAuxiliarySourceFromServer(serverName), serverName)) {
      skipped += Array.isArray(server.server_data) ? server.server_data.length : 0;
      continue;
    }

    for (const rawEpisode of (server.server_data ?? []) as Array<Record<string, unknown>>) {
      const epName = String(rawEpisode.name || '').trim();
      const slugVal = String(rawEpisode.slug || epName || '').trim();
      const epNum = extractEpNumber(slugVal || epName);
      const linkEmbed = normalizeDailymotionUrl(String(rawEpisode.link_embed || '').trim());
      const linkM3u8 = String(rawEpisode.link_m3u8 || '').trim();
      if (epNum <= 0 || (!linkEmbed && !linkM3u8)) {
        skipped += 1;
        continue;
      }

      const payload = {
        movie_id: movieId,
        episode_number: epNum,
        episode_name: epName || `Tập ${epNum}`,
        slug: slugVal || `tap-${epNum}`,
        server_name: serverName,
        link_embed: linkEmbed,
        link_m3u8: linkM3u8,
        subtitle_url: String(rawEpisode.subtitle_url || rawEpisode.subtitle || '').trim(),
        thumbnail_url: String(rawEpisode.thumb_url || rawEpisode.thumbnail_url || '').trim(),
        duration: String(rawEpisode.time || rawEpisode.duration || '').trim(),
        source: verifiedAuxiliarySourceFromServer(serverName),
        is_backup: true,
      };

      const { data: existing, error: existingError } = await supabase
        .from('movie_episodes')
        .select('id,link_embed,link_m3u8,subtitle_url,slug,episode_name')
        .eq('movie_id', movieId)
        .eq('server_name', serverName)
        .eq('episode_number', epNum)
        .maybeSingle();
      if (existingError) {
        console.warn('verified_auxiliary_lookup_failed', { movieId, serverName, epNum, error: existingError.message });
        skipped += 1;
        continue;
      }

      if (existing?.id) {
        const current = existing as Record<string, unknown>;
        const shouldUpdate =
          String(current.link_embed || '') !== payload.link_embed ||
          String(current.link_m3u8 || '') !== payload.link_m3u8 ||
          String(current.subtitle_url || '') !== payload.subtitle_url ||
          String(current.slug || '') !== payload.slug ||
          String(current.episode_name || '') !== payload.episode_name;
        if (shouldUpdate) {
          const { error: updateError } = await supabase
            .from('movie_episodes')
            .update(payload)
            .eq('id', String(current.id));
          if (updateError) {
            console.warn('verified_auxiliary_update_failed', { movieId, serverName, epNum, error: updateError.message });
            skipped += 1;
          } else {
            updated += 1;
          }
        }
        continue;
      }

      const { error: insertError } = await supabase.from('movie_episodes').insert(payload);
      if (insertError) {
        if (/duplicate key value/i.test(insertError.message || '')) {
          const { error: duplicateUpdateError } = await supabase
            .from('movie_episodes')
            .update(payload)
            .eq('movie_id', movieId)
            .eq('server_name', serverName)
            .eq('episode_number', epNum);
          if (duplicateUpdateError) {
            console.warn('verified_auxiliary_duplicate_update_failed', {
              movieId,
              serverName,
              epNum,
              error: duplicateUpdateError.message,
            });
            skipped += 1;
          } else {
            updated += 1;
          }
          continue;
        }
        console.warn('verified_auxiliary_insert_failed', { movieId, serverName, epNum, error: insertError.message });
        skipped += 1;
        continue;
      }
      inserted += 1;
    }
  }

  return { inserted, updated, skipped };
}

async function fetchExternalMovieDetail(
  slug: string,
): Promise<{
  movie: Record<string, unknown>;
  episodes: Array<{ server_name: string; server_data: unknown[] }>;
} | null> {
  const urls = [
    { url: `https://phimapi.com/phim/${encodeURIComponent(slug)}`, provider: 'phimapi' },
    { url: `https://vsmov.com/api/phim/${encodeURIComponent(slug)}`, provider: 'vsmov' },
    { url: `https://phim.nguonc.com/api/film/${encodeURIComponent(slug)}`, provider: 'nguonc' },
  ];

  const controllers: AbortController[] = [];

  const promises: Array<Promise<{
    movie: Record<string, unknown>;
    episodes: Array<{ server_name: string; server_data: unknown[] }>;
  } | null>> = urls.map(({ url, provider }) => {
    const startedAt = Date.now();
    const ctrl = new AbortController();
    controllers.push(ctrl);
    const t = setTimeout(() => { try { ctrl.abort(); } catch { /* noop */ } }, 5000);

    return fetch(url, {
      signal: ctrl.signal,
      headers: provider === 'vsmov'
        ? { Accept: 'application/json', 'User-Agent': 'KhoPhim/1.0 (+https://khophim.org)' }
        : { Accept: 'application/json' },
    })
      .then(async (r) => {
        clearTimeout(t);
        if (!r.ok) {
          if (r.status === 404) throw new Error('HTTP 404');
          throw new Error(`HTTP ${r.status}`);
        }
        const data = await r.json() as Record<string, unknown>;

        let movieData: Record<string, unknown> | undefined;
        let episodesData: Array<{ server_name: string; server_data: unknown[] }> | undefined;

        if (provider === 'nguonc' && data.movie && typeof data.movie === 'object') {
          movieData = data.movie as Record<string, unknown>;
          const nguoncServers = Array.isArray(movieData.episodes)
            ? movieData.episodes as Record<string, unknown>[]
            : [];
          episodesData = nguoncServers.map((server) => ({
            server_name: String(server.server_name || 'NguồnC'),
            server_data: (Array.isArray(server.items) ? server.items as Record<string, unknown>[] : []).map((episode) => ({
              name: String(episode.name || ''),
              slug: String(episode.slug || episode.name || ''),
              filename: String(episode.name || ''),
              link_embed: String(episode.embed || episode.link_embed || ''),
              link_m3u8: String(episode.m3u8 || episode.link_m3u8 || ''),
            })),
          }));
          movieData = {
            ...movieData,
            content: movieData.content || movieData.description || '',
            episode_current: movieData.episode_current || movieData.current_episode || '',
            episode_total: movieData.episode_total || String(movieData.total_episodes || ''),
            lang: movieData.lang || movieData.language || '',
          };
        } else if (data.movie && typeof data.movie === 'object') {
          movieData = data.movie as Record<string, unknown>;
          episodesData = data.episodes as Array<{ server_name: string; server_data: unknown[] }> | undefined;
        } else if (
          data.data &&
          typeof data.data === 'object' &&
          (data.data as Record<string, unknown>).movie
        ) {
          movieData = (data.data as Record<string, unknown>).movie as Record<string, unknown>;
          episodesData = (data.data as Record<string, unknown>).episodes as Array<{ server_name: string; server_data: unknown[] }> | undefined;
        } else if (
          data.data &&
          typeof data.data === 'object' &&
          (data.data as Record<string, unknown>).item &&
          typeof (data.data as Record<string, unknown>).item === 'object'
        ) {
          const item = (data.data as Record<string, unknown>).item as Record<string, unknown>;
          if (item.movie && typeof item.movie === 'object') {
            movieData = item.movie as Record<string, unknown>;
            episodesData = item.episodes as Array<{ server_name: string; server_data: unknown[] }> | undefined;
          } else if (item.slug || item.name || item._id || item.id) {
            movieData = item;
            episodesData = item.episodes as Array<{ server_name: string; server_data: unknown[] }> | undefined;
          }
        }

        if (!movieData || !movieData.name) throw new Error('No movie data');

        return {
          movie: {
            ...movieData,
            source_site: provider,
            source_name: provider === 'phimapi'
              ? 'PhimAPI'
              : provider === 'vsmov'
                ? 'VSMov'
                : provider === 'nguonc'
                  ? 'NguồnC'
                  : 'OPhim',
          },
          episodes: episodesData ?? [],
          elapsed_ms: Date.now() - startedAt,
        };
      })
      .catch((err) => {
        clearTimeout(t);
        console.log(`[fetchExternalMovieDetail] ${url} failed: ${err.message}`);
        return null;
      });
  });
  const motchillStartedAt = Date.now();
  promises.push(fetchMotchillMovieDetail(slug).then((detail) => detail ? ({
    ...detail,
    elapsed_ms: Date.now() - motchillStartedAt,
  }) : null).catch((err) => {
    console.log(`[fetchExternalMovieDetail] motchill ${slug} failed: ${err.message}`);
    return null;
  }));

  const completedResults: Array<{
    movie: Record<string, unknown>;
    episodes: Array<{ server_name: string; server_data: unknown[] }>;
    elapsed_ms?: number;
  }> = [];
  const trackedPromises = promises.map((promise) => promise.then((result) => {
    if (result && result.episodes.some((server) => (server.server_data ?? []).some((raw) => {
      const episode = raw as Record<string, unknown>;
      return hasPlayableEpisodeLink(episode);
    }))) completedResults.push(result);
    return result;
  }));
  const racePlayable = (candidates: typeof trackedPromises, timeoutMs: number) => new Promise<(typeof completedResults)[number] | null>((resolve) => {
    let settled = false;
    let pending = candidates.length;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    for (const candidate of candidates) {
      candidate.then((result) => {
        pending -= 1;
        const playable = !!result && result.episodes.some((server) => (server.server_data ?? []).some((raw) => {
          const episode = raw as Record<string, unknown>;
          return hasPlayableEpisodeLink(episode);
        }));
        if (!settled && playable) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        } else if (!settled && pending === 0) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      }).catch(() => {
        pending -= 1;
        if (!settled && pending === 0) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
    }
  });

  // Every provider starts together. Wait for the common scoring window, then
  // select by completeness, playable transport count and measured latency.
  // Provider identity never appears in the score.
  await Promise.race([
    Promise.allSettled(trackedPromises),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
  if (completedResults.length === 0) await racePlayable(trackedPromises, 1800);
  if (completedResults.length === 0) {
    controllers.forEach((controller) => { try { controller.abort(); } catch { /* noop */ } });
    return null;
  }
  await Promise.race([
    Promise.allSettled(trackedPromises),
    new Promise((resolve) => setTimeout(resolve, 200)),
  ]);

  const validResults = completedResults;
  const normalizedResults = validResults.map((detail) => {
    const normalized = normalizeVerifiedSeasonNumbering(
      detail.movie,
      detail.episodes as Array<{ server_name?: string; server_data?: Array<Record<string, unknown>> }>,
    );
    const safeEpisodes = (normalized.episodes as Array<{ server_name?: string; server_data?: Array<Record<string, unknown>> }>)
      .map((server) => ({
        ...server,
        server_data: (server.server_data ?? []).filter((episode) => {
          if (isRetiredOphimPlayback(
            episode.source_provider,
            server.server_name,
            episode.link_m3u8,
            episode.link_embed,
          )) return false;
          return !isKnownBlockedEmbedHost(String(episode.link_embed || episode.link_m3u8 || ''));
        }),
      }))
      .filter((server) => server.server_data.length > 0);
    return {
      movie: normalized.movie,
      episodes: safeEpisodes as Array<{ server_name: string; server_data: unknown[] }>,
      elapsed_ms: detail.elapsed_ms,
    };
  });
  const winner = normalizedResults.sort((a, b) => {
    const aMax = getMaxEpisodeNumberFromServers(a.episodes);
    const bMax = getMaxEpisodeNumberFromServers(b.episodes);
    if (bMax !== aMax) return bMax - aMax;
    const aExpected = getExpectedEpisodeNumber(a.movie);
    const bExpected = getExpectedEpisodeNumber(b.movie);
    if (bExpected !== aExpected) return bExpected - aExpected;
    const serverCountDiff = (b.episodes?.length ?? 0) - (a.episodes?.length ?? 0);
    if (serverCountDiff !== 0) return serverCountDiff;
    const playableStats = (detail: { episodes: Array<{ server_data: unknown[] }> }) => {
      let playable = 0;
      let direct = 0;
      for (const server of detail.episodes) {
        for (const raw of server.server_data ?? []) {
          const episode = raw as Record<string, unknown>;
          if (!hasPlayableEpisodeLink(episode)) continue;
          playable += 1;
          if (/\.(?:m3u8|mp4|webm|mov)(?:[?#].*)?$/i.test(String(episode.link_m3u8 || episode.link_embed || ''))) direct += 1;
        }
      }
      return { playable, direct };
    };
    const aStats = playableStats(a);
    const bStats = playableStats(b);
    if (bStats.playable !== aStats.playable) return bStats.playable - aStats.playable;
    if (bStats.direct !== aStats.direct) return bStats.direct - aStats.direct;
    return Number(a.elapsed_ms || 5000) - Number(b.elapsed_ms || 5000);
  })[0] ?? null;
  if (winner) {
    controllers.forEach((c) => { try { c.abort(); } catch { /* noop */ } });
  }
  return winner ?? null;
}
function slugifyVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function normalizeTitle(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleCandidates(value: Record<string, unknown>): string[] {
  return Array.from(new Set([
    value.name,
    value.title_vi,
    value.title_en,
    value.title_zh,
    value.title_original,
    value.origin_name,
    String(value.slug || '').replace(/-/g, ' '),
    String(value.ophim_slug || '').replace(/-/g, ' '),
    value.normalized_name,
  ]
    .map(normalizeTitle)
    .filter((title) => title.length >= 3)));
}

function hasSharedTitle(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aTitles = titleCandidates(a);
  const bTitles = titleCandidates(b);
  if (aTitles.length === 0 || bTitles.length === 0) return false;
  return aTitles.some((left) =>
    bTitles.some((right) =>
      left === right ||
      (left.length >= 8 && right.includes(left)) ||
      (right.length >= 8 && left.includes(right))
    )
  );
}

function sameMovieYearOrUnknown(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ay = Number(a.year || 0);
  const by = Number(b.year || 0);
  if (!Number.isFinite(ay) || !Number.isFinite(by)) return true;
  return ay <= 0 || by <= 0 || ay === by;
}

function normalizedSlug(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isWeakCatalogTitle(movie: Record<string, unknown> | null | undefined, requestedSlug: string): boolean {
  const name = String(movie?.name || '').trim();
  const origin = String(movie?.origin_name || movie?.title_en || '').trim();
  if (!name) return true;
  if (origin && normalizeTitle(name) === normalizeTitle(origin)) return true;
  const requestedTitle = normalizeTitle(String(requestedSlug || '').replace(/-/g, ' '));
  const nameTitle = normalizeTitle(name);
  return requestedTitle.length >= 4 && !!nameTitle && !requestedTitle.includes(nameTitle) && !nameTitle.includes(requestedTitle);
}

function shouldPreferExternalMovieData(
  primary: Record<string, unknown> | null | undefined,
  external: Record<string, unknown> | null | undefined,
  requestedSlug: string,
): boolean {
  if (!primary || !external) return false;
  const requested = normalizedSlug(requestedSlug);
  const primarySlug = normalizedSlug(primary.slug);
  const externalSlug = normalizedSlug(external.slug || external.ophim_slug);
  if (externalSlug && requested && externalSlug !== requested) return false;
  if (!sameMovieYearOrUnknown(primary, external) || !hasSharedTitle(primary, external)) return false;
  return primarySlug !== requested || isWeakCatalogTitle(primary, requestedSlug);
}

function mergeMovieDataForRequestedSlug(
  primary: Record<string, unknown>,
  external: Record<string, unknown>,
  requestedSlug: string,
): Record<string, unknown> {
  const requested = String(requestedSlug || '').trim();
  return {
    ...primary,
    name: external.name || primary.name,
    title_vi: external.name || primary.title_vi || primary.name,
    origin_name: external.origin_name || primary.origin_name,
    title_en: primary.title_en || external.origin_name || primary.origin_name,
    title_original: primary.title_original || external.origin_name || primary.origin_name || external.name,
    slug: requested || external.slug || primary.slug,
    ophim_slug: external.slug || primary.ophim_slug,
    ophim_id: external._id || external.id || primary.ophim_id,
    content: external.content || external.description || primary.content,
    type: external.type || primary.type,
    status: external.status || primary.status,
    thumb_url: external.thumb_url || external.thumbUrl || external.thumb || primary.thumb_url,
    poster_url: external.poster_url || external.posterUrl || external.poster || primary.poster_url,
    trailer_url: external.trailer_url || external.trailerUrl || primary.trailer_url,
    time: external.time || primary.time,
    episode_current: external.episode_current || external.episodeCurrent || primary.episode_current,
    episode_total: external.episode_total || external.episodeTotal || primary.episode_total,
    current_episode: external.current_episode || primary.current_episode,
    total_episodes: external.total_episodes || primary.total_episodes,
    quality: external.quality || primary.quality,
    lang: external.lang || external.language || primary.lang,
    year: external.year || primary.year,
    actor: Array.isArray(external.actor) && external.actor.length > 0 ? external.actor : primary.actor,
    director: Array.isArray(external.director) && external.director.length > 0 ? external.director : primary.director,
    category: Array.isArray(external.category) && external.category.length > 0 ? external.category : primary.category,
    country: Array.isArray(external.country) && external.country.length > 0 ? external.country : primary.country,
  };
}

function escapePostgrestIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, ' ');
}

function buildPersistMoviePayload(
  movie: Record<string, unknown>,
  requestedSlug: string,
  detailSlug: string,
): Record<string, unknown> {
  const name = String(movie.name || movie.title || requestedSlug);
  const originName = String(movie.origin_name || movie.originName || movie.original_title || '');
  const canonicalSlug = String(movie.slug || detailSlug || requestedSlug || slugifyVietnamese(name));
  const now = new Date().toISOString();
  const normalizedName = normalizeTitle(name);
  return {
    slug: canonicalSlug,
    ophim_slug: detailSlug || canonicalSlug,
    ophim_id: String(movie._id || movie.id || movie.ophim_id || ''),
    name,
    title_vi: name,
    title_en: originName,
    title_original: originName || name,
    normalized_name: normalizedName,
    origin_name: originName,
    content: String(movie.content || movie.description || ''),
    type: String(movie.type || 'phim-le'),
    status: String(movie.status || 'completed'),
    thumb_url: String(movie.thumb_url || movie.thumbUrl || movie.thumb || ''),
    poster_url: String(movie.poster_url || movie.posterUrl || movie.poster || ''),
    trailer_url: String(movie.trailer_url || movie.trailerUrl || ''),
    time: String(movie.time || ''),
    episode_current: String(movie.episode_current || movie.episodeCurrent || ''),
    episode_total: String(movie.episode_total || movie.episodeTotal || ''),
    quality: String(movie.quality || 'HD'),
    lang: String(movie.lang || movie.language || 'Vietsub'),
    year: Number(movie.year || 0),
    actor: Array.isArray(movie.actor) ? movie.actor : [],
    director: Array.isArray(movie.director) ? movie.director : [],
    category: Array.isArray(movie.category) ? movie.category : [],
    country: Array.isArray(movie.country) ? movie.country : [],
    source_site: String(movie.source_site || 'ophim'),
    source_name: String(movie.source_name || 'OPhim'),
    // Lazy detail persistence is not proof that playback exists. Keep a new
    // row private until persistExternalMovie verifies stored playable coverage.
    is_published: false,
    last_synced_at: now,
    updated_at: now,
  };
}

async function findMovieIdForPersist(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const checks: Array<{ column: string; value: string }> = [
    { column: 'slug', value: String(payload.slug || '') },
    { column: 'ophim_slug', value: String(payload.ophim_slug || '') },
    { column: 'ophim_id', value: String(payload.ophim_id || '') },
  ].filter((item) => item.value.trim());

  for (const check of checks) {
    const { data } = await supabase
      .from('movies')
      .select('id')
      .eq(check.column, check.value)
      .limit(1)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  const terms = Array.from(new Set([
    payload.name,
    payload.title_vi,
    payload.title_en,
    payload.title_original,
    payload.origin_name,
    String(payload.slug || '').replace(/-/g, ' '),
    String(payload.ophim_slug || '').replace(/-/g, ' '),
  ]
    .map((term) => String(term || '').trim())
    .filter((term) => term.length >= 3)
    .slice(0, 6)));

  const year = Number(payload.year || 0);
  for (const term of terms) {
    const safeTerm = escapePostgrestIlike(term);
    let query = supabase
      .from('movies')
      .select('id,slug,name,title_vi,title_en,title_zh,title_original,origin_name,normalized_name,ophim_slug,year,type')
      .or(`name.ilike.%${safeTerm}%,title_vi.ilike.%${safeTerm}%,title_en.ilike.%${safeTerm}%,title_zh.ilike.%${safeTerm}%,title_original.ilike.%${safeTerm}%,origin_name.ilike.%${safeTerm}%,slug.ilike.%${safeTerm}%,ophim_slug.ilike.%${safeTerm}%`)
      .eq('is_published', true);
    if (Number.isFinite(year) && year > 0) query = query.eq('year', year);

    const { data } = await query.limit(10);
    const match = ((data ?? []) as Record<string, unknown>[]).find((item) =>
      sameMovieYearOrUnknown(item, payload) && hasSharedTitle(item, payload)
    );
    if (match?.id) return String(match.id);
  }

  if (Number.isFinite(year) && year > 0 && titleCandidates(payload).length > 0) {
    const { data } = await supabase
      .from('movies')
      .select('id,slug,name,title_vi,title_en,title_zh,title_original,origin_name,normalized_name,ophim_slug,year,type')
      .eq('year', year)
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
      .limit(200);
    const match = ((data ?? []) as Record<string, unknown>[]).find((item) =>
      sameMovieYearOrUnknown(item, payload) && hasSharedTitle(item, payload)
    );
    if (match?.id) return String(match.id);
  }

  return null;
}

async function removeConflictingMovieIdentityFields(
  supabase: ReturnType<typeof createClient>,
  movieId: string,
  update: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const safeUpdate = { ...update };
  const checks: Array<[string, unknown]> = [
    ['ophim_slug', safeUpdate.ophim_slug],
    ['ophim_id', safeUpdate.ophim_id],
  ];

  for (const [column, rawValue] of checks) {
    const value = String(rawValue || '').trim();
    if (!value) continue;
    const { data, error } = await supabase
      .from('movies')
      .select('id')
      .eq(column, value)
      .neq('id', movieId)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) delete safeUpdate[column];
  }

  return safeUpdate;
}

async function persistExternalMovie(
  supabase: ReturnType<typeof createClient>,
  external: { movie: Record<string, unknown>; episodes: Array<{ server_name: string; server_data: unknown[] }> },
  requestedSlug: string,
  detailSlug: string,
  existingMovieId = '',
): Promise<void> {
  try {
    const payload = buildPersistMoviePayload(external.movie, requestedSlug, detailSlug);
    let movieId = existingMovieId || await findMovieIdForPersist(supabase, payload);
    const now = new Date().toISOString();
    const externalSource = String(external.movie.source_site || 'ophim').trim().toLowerCase();
    const isAuxiliarySource = externalSource && externalSource !== 'ophim' && externalSource !== 'kkphim' && externalSource !== 'phimapi';
    const externalMaxEpisode = getMaxEpisodeNumberFromServers(external.episodes);
    const hasExternalPlayable = external.episodes.some((server) =>
      (server.server_data || []).some((rawEpisode) => {
        const episode = rawEpisode as Record<string, unknown>;
        return Boolean(String(episode.link_m3u8 || '').trim() || String(episode.link_embed || '').trim());
      })
    );
    const hasUsableImage = Boolean(
      String(payload.thumb_url || payload.poster_url || '').trim()
      && !/^(?:data:|javascript:|about:|null$|undefined$)/i.test(String(payload.thumb_url || payload.poster_url || '').trim())
    );

    if (movieId) {
      const movieUpdate: Record<string, unknown> = {
        last_synced_at: now,
        updated_at: now,
      };
      if (externalMaxEpisode > 0) {
        const { data: currentMovie } = await supabase
          .from('movies')
          .select('current_episode,episode_current')
          .eq('id', movieId)
          .limit(1)
          .maybeSingle();
        const storedCurrent = Math.max(
          Number(currentMovie?.current_episode || 0) || 0,
          extractEpNumber(String(currentMovie?.episode_current || '')),
        );
        if (externalMaxEpisode > storedCurrent) {
          movieUpdate.current_episode = externalMaxEpisode;
          movieUpdate.episode_current = `Tập ${externalMaxEpisode}`;
        }
      }
      if (!isAuxiliarySource) {
        movieUpdate.ophim_id = payload.ophim_id;
        movieUpdate.ophim_slug = payload.ophim_slug;
      }
      const safeMovieUpdate = await removeConflictingMovieIdentityFields(supabase, movieId, movieUpdate);
      await supabase
        .from('movies')
        .update(safeMovieUpdate)
        .eq('id', movieId);
    } else {
      const conflictColumn = String(payload.ophim_slug || '').trim() ? 'ophim_slug' : 'slug';
      const { data, error } = await supabase
        .from('movies')
        .upsert(payload, { onConflict: conflictColumn })
        .select('id')
        .single();
      if (error) {
        console.log('[movie-detail-proxy] lazy movie insert failed:', error.message);
        return;
      }
      movieId = String(data.id);
    }

    const ophimId = String(payload.ophim_id || '');
    for (const srv of external.episodes) {
      const serverName = String(srv.server_name || 'Nguồn');
      const rows = (srv.server_data || []) as Array<Record<string, unknown>>;
      for (const ep of rows) {
        const linkM3u8 = String(ep.link_m3u8 || '').trim();
        const linkEmbed = String(ep.link_embed || '').trim();
        if (!linkM3u8 && !linkEmbed) continue;

        const epName = String(ep.name || '').trim();
        const epSlug = String(ep.slug || slugifyVietnamese(epName) || 'full').trim();
        const episodeNumber = extractEpNumber(epSlug || epName);
        const subtitleUrl = String(ep.subtitle_url || ep.subtitle || '').trim();

        const { data: existingEpisode } = await supabase
          .from('episodes')
          .select('id')
          .eq('movie_id', movieId)
          .ilike('server_name', serverName)
          .ilike('episode_slug', epSlug)
          .limit(1)
          .maybeSingle();

        if (!existingEpisode) {
          const { error: insertEpisodeError } = await supabase.from('episodes').insert({
            movie_id: movieId,
            ophim_id: ophimId,
            server_name: serverName,
            episode_number: episodeNumber,
            episode_name: epName || (episodeNumber > 0 ? `Tập ${episodeNumber}` : 'Full'),
            episode_slug: epSlug,
            link_m3u8: linkM3u8,
            link_embed: linkEmbed,
            subtitle_url: subtitleUrl,
            server_data: ep,
          });
          if (isDuplicateDbError(insertEpisodeError)) {
            const { data: duplicateEpisode } = await supabase
              .from('episodes')
              .select('id')
              .eq('movie_id', movieId)
              .ilike('server_name', serverName)
              .ilike('episode_slug', epSlug)
              .limit(1)
              .maybeSingle();
            if (duplicateEpisode?.id) {
              await supabase
                .from('episodes')
                .update({
                  link_m3u8: linkM3u8,
                  link_embed: linkEmbed,
                  subtitle_url: subtitleUrl,
                  server_data: ep,
                })
                .eq('id', duplicateEpisode.id);
            }
          }
        } else {
          await supabase
            .from('episodes')
            .update({
              link_m3u8: linkM3u8,
              link_embed: linkEmbed,
              subtitle_url: subtitleUrl,
              server_data: ep,
            })
            .eq('id', existingEpisode.id);
        }

        const { data: existingStream } = await supabase
          .from('streams')
          .select('id')
          .eq('movie_id', movieId)
          .eq('source', externalSource || 'ophim')
          .eq('is_active', true)
          .ilike('server_name', serverName)
          .ilike('episode_slug', epSlug)
          .limit(1)
          .maybeSingle();

        if (!existingStream) {
          const { error: insertStreamError } = await supabase.from('streams').insert({
            movie_id: movieId,
            ophim_id: ophimId,
            server_name: serverName,
            episode_slug: epSlug,
            stream_url: linkM3u8,
            embed_url: linkEmbed,
            subtitle_url: subtitleUrl,
            source: externalSource || 'ophim',
            is_active: true,
          });
          if (isDuplicateDbError(insertStreamError)) {
            const { data: duplicateStream } = await supabase
              .from('streams')
              .select('id')
              .eq('movie_id', movieId)
              .eq('source', externalSource || 'ophim')
              .eq('is_active', true)
              .ilike('server_name', serverName)
              .ilike('episode_slug', epSlug)
              .limit(1)
              .maybeSingle();
            if (duplicateStream?.id) {
              await supabase
                .from('streams')
                .update({
                  stream_url: linkM3u8,
                  embed_url: linkEmbed,
                  subtitle_url: subtitleUrl,
                  source: externalSource || 'ophim',
                  is_active: true,
                })
                .eq('id', duplicateStream.id);
            }
          }
        } else {
          await supabase
            .from('streams')
            .update({
              stream_url: linkM3u8,
              embed_url: linkEmbed,
              subtitle_url: subtitleUrl,
              source: externalSource || 'ophim',
              is_active: true,
            })
            .eq('id', existingStream.id);
        }
      }
    }

    if (hasExternalPlayable && hasUsableImage) {
      const [{ data: storedEpisode }, { data: storedStream }] = await Promise.all([
        supabase
          .from('episodes')
          .select('id')
          .eq('movie_id', movieId)
          .or('link_m3u8.neq.,link_embed.neq.')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('streams')
          .select('id')
          .eq('movie_id', movieId)
          .eq('is_active', true)
          .or('stream_url.neq.,embed_url.neq.')
          .limit(1)
          .maybeSingle(),
      ]);
      const persistedPlayableCoverage = Boolean(storedEpisode?.id || storedStream?.id);
      if (persistedPlayableCoverage) {
        await supabase
          .from('movies')
          .update({ is_published: true })
          .eq('id', movieId);
      }
    }
  } catch (err) {
    console.log('[movie-detail-proxy] lazy persist failed:', err);
  }
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const suppliedProxySecret = req.headers.get('x-khophim-proxy-secret') ?? '';
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const isPrivilegedProxyRequest = Boolean(
    (MOVIE_DETAIL_PROXY_SECRET && suppliedProxySecret === MOVIE_DETAIL_PROXY_SECRET)
    || (SUPABASE_SERVICE_ROLE_KEY && bearer === SUPABASE_SERVICE_ROLE_KEY)
  );
  const isPublicReadRequest = req.method === 'GET' && hasValidPublishableApiKey(req);
  const { searchParams } = new URL(req.url);
  const requestedForceRefresh = searchParams.get('refresh') === '1';
  if (!isPrivilegedProxyRequest && !isPublicReadRequest) {
    return jsonResponse({ status: false, message: 'Unauthorized' }, 401, {
      'Cache-Control': 'no-store',
    });
  }

  const slug = searchParams.get('slug');
  const forceRefresh = requestedForceRefresh && isPrivilegedProxyRequest;
  if (!slug) {
    return jsonResponse({ status: false, message: 'Missing slug' }, 400);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Start the last-known-good read immediately, but never return it before
    // the authoritative publication row below has confirmed that the slug is
    // not quarantined. This removes a sequential 1.5s database round trip for
    // stored-only movies whose original provider detail has since disappeared.
    const cachedDetailPromise = forceRefresh
      ? Promise.resolve(null)
      : readCachedDetail(supabase, slug, null);

    // An exact private catalogue row is an authoritative quarantine/tombstone.
    // Do this before either cache lookup or provider fallback so a dead upstream
    // URL cannot make an intentionally unpublished movie playable again.
    const { data: exactCatalogMovie, error: exactCatalogError } = await supabase
      .from('movies')
      .select(MOVIE_DETAIL_SELECT)
      .eq('slug', slug)
      .abortSignal(timeoutSignal(6000))
      .maybeSingle();
    let exactMergeAlias: Record<string, unknown> | null = null;
    if (!exactCatalogError && exactCatalogMovie && exactCatalogMovie.is_published !== true) {
      const { data: mergeAlias } = await supabase
        .from('movie_slug_aliases')
        .select('movie_id,canonical_slug')
        .eq('alias_slug', slug)
        .maybeSingle();
      if (mergeAlias?.movie_id) {
        const { data: publishedCanonical } = await supabase
          .from('movies')
          .select('id')
          .eq('id', mergeAlias.movie_id)
          .eq('is_published', true)
          .maybeSingle();
        if (publishedCanonical?.id) exactMergeAlias = mergeAlias as Record<string, unknown>;
      }
    }
    if (!exactCatalogError && exactCatalogMovie && exactCatalogMovie.is_published !== true && !exactMergeAlias?.movie_id) {
      await supabase.from('movie_api_cache').delete().eq('slug', slug);
      return jsonResponse({ status: false, message: 'Movie is not currently available' }, 404, {
        'Cache-Control': 'no-store',
        'X-Catalog-Quarantine': '1',
      });
    }

    const catalogReadUnavailable = !!exactCatalogError;

    if (!forceRefresh && !catalogReadUnavailable) {
      const cachedDetail = await cachedDetailPromise;
      const cachedMovie = cachedDetail?.movie as Record<string, unknown> | undefined;
      if (
        cachedDetail?.status &&
        detailHasPlayableEpisodes(cachedDetail) &&
        getExpectedEpisodeNumber(exactCatalogMovie as Record<string, unknown> | null) <= getExpectedEpisodeNumber(cachedMovie) &&
        !isDetailEpisodeIncomplete(cachedDetail) &&
        !isPlaceholderSeriesDetail(cachedDetail) &&
        !hasUntrustedQueerEpisodeServer(cachedDetail)
      ) {
        return jsonResponse(cachedDetail, 200, {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800, stale-if-error=86400',
          'X-Cache': 'DB-HIT',
        });
      }
    }

    /* ── 1. Try Supabase DB first (multiple slug variants) ── */
    // Reuse the authoritative row already fetched above. The previous code
    // queried the same movie a second time with a shorter deadline; under pool
    // pressure that redundant read timed out and stored-only movies fell
    // through to provider 404 even though Singapore had playable episodes.
    let movie: Record<string, unknown> | null = !catalogReadUnavailable && exactCatalogMovie?.is_published === true
      ? exactCatalogMovie as Record<string, unknown>
      : null;
    let movieId = movie ? String(movie.id || '') : '';
    let movieData: Record<string, unknown> | null = movie;

    const slugVariants = Array.from(new Set([slug, slug.normalize('NFC'), decodeURIComponent(slug)]));
    for (const variant of catalogReadUnavailable || movie ? [] : slugVariants) {
      const { data, error } = await supabase
        .from('movies')
        .select(MOVIE_DETAIL_SELECT)
        .eq('slug', variant)
        .eq('is_published', true)
        .abortSignal(timeoutSignal(1200))
        .maybeSingle();
      if (!error && data) {
        movie = data as Record<string, unknown>;
        movieId = movie.id as string;
        movieData = movie;
        break;
      }
    }

    // Compatibility layer for slugs retired by a safe movie merge. Resolve only
    // to an explicitly recorded canonical movie; never guess by title here.
    if (!movie && !catalogReadUnavailable) {
      for (const variant of slugVariants) {
        const { data: alias } = await supabase
          .from('movie_slug_aliases')
          .select('movie_id,canonical_slug')
          .eq('alias_slug', variant)
          .abortSignal(timeoutSignal(900))
          .maybeSingle();
        if (!alias?.movie_id) continue;
        const { data: canonical, error } = await supabase
          .from('movies')
          .select(MOVIE_DETAIL_SELECT)
          .eq('id', alias.movie_id)
          .eq('is_published', true)
          .abortSignal(timeoutSignal(1200))
          .maybeSingle();
        if (!error && canonical) {
          movie = canonical as Record<string, unknown>;
          movieId = movie.id as string;
          movieData = movie;
          break;
        }
      }
    }

    // Fallback: ilike search
    if (!movie && !catalogReadUnavailable) {
      const safeSlug = slug.replace(/%/g, '\\%').replace(/_/g, '\\_');
      for (const variant of slugVariants) {
        const { data, error } = await supabase
          .from('movies')
          .select(MOVIE_DETAIL_SELECT)
          .eq('ophim_slug', variant)
          .eq('is_published', true)
          .limit(1)
          .abortSignal(timeoutSignal(1200))
          .maybeSingle();
        if (!error && data) {
          movie = data as Record<string, unknown>;
          movieId = movie.id as string;
          movieData = movie;
          break;
        }
      }
    }

    const useSupabase = !!movieData;
    const supabaseOphimId = movieData ? String(movieData.ophim_id || '').trim() : '';
    const isQueerSourceMovie = isBlvietsubMovieRecord(movieData || movie);

    /* ── 2. Load episodes from DB ── */
    const serverMap = new Map<string, unknown[]>();
    const seen = new Set<string>();
    const knownUnhealthyUrls = new Set<string>();
    let recoverableProblemStreamCount = 0;
    let newestProblemStreamCheckAt = 0;
    let hasRawGlvietsubEpisode = false;

    if (useSupabase && movieId) {
      // `streams` is the canonical scored playback table. Read it first using
      // one connection. The previous four-way fan-out consumed four pool slots
      // per viewer and all four timed out together during CPU/I/O pressure,
      // even when a healthy scored stream already existed.
      const { data: streams, error: streamsErr } = await supabase
        .from('streams')
        .select('server_name, source, provider_key, episode_slug, stream_url, embed_url, subtitle_url, priority, playback_score, is_active, health_status, response_time_ms, failure_count, last_checked_at, last_error, audio_type')
        .eq('movie_id', movieId)
        .order('playback_score', { ascending: false, nullsFirst: false })
        .order('priority', { ascending: false })
        .order('response_time_ms', { ascending: true, nullsFirst: false })
        .abortSignal(timeoutSignal(6000));

      const canonicalStreams = (streams ?? []).filter((raw) => {
        const row = raw as Record<string, unknown>;
        if (!row.is_active || shouldSuppressUnhealthyStream(row)) return false;
        if (isRetiredOphimPlayback(row.provider_key || row.source, row.server_name, row.stream_url, row.embed_url)) return false;
        if (isKnownBlockedEmbedHost(String(row.embed_url || row.stream_url || ''))) return false;
        return Boolean(String(row.stream_url || '').trim() || String(row.embed_url || '').trim());
      });

      // Legacy tables are a compatibility fallback, not a parallel hot-path.
      // Queer/admin records still need their identity allow-list; otherwise a
      // complete canonical stream result avoids three additional DB queries.
      const needsLegacyRows = streamsErr || canonicalStreams.length === 0 || isQueerSourceMovie;
      const [movieEpisodesResult, oldEpisodesResult, identitiesResult] = needsLegacyRows
        ? await Promise.all([
          supabase
            .from('movie_episodes')
            .select('server_name, source, episode_number, slug, episode_name, link_embed, link_m3u8, subtitle_url, audio_type')
            .eq('movie_id', movieId)
            .order('episode_number', { ascending: true })
            .abortSignal(timeoutSignal(4500)),
          supabase
            .from('episodes')
            .select('server_name, episode_number, episode_slug, episode_name, link_m3u8, link_embed, subtitle_url, server_data')
            .eq('movie_id', movieId)
            .order('episode_number', { ascending: true })
            .abortSignal(timeoutSignal(4500)),
          supabase
            .from('provider_movie_identities')
            .select('provider')
            .eq('movie_id', movieId)
            .abortSignal(timeoutSignal(4500)),
        ])
        : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];
      const meRows = movieEpisodesResult.data;
      const meErr = movieEpisodesResult.error;
      const oldEps = oldEpisodesResult.data;
      const providerIdentities = identitiesResult.data;

      const verifiedProviders = new Set(
        (providerIdentities ?? [])
          .map((row) => String((row as Record<string, unknown>).provider || '').trim().toLowerCase())
          .filter((provider) => Boolean(provider) && provider !== 'ophim'),
      );

      if (meErr) {
        console.log('[movie-detail-proxy] movie_episodes error:', meErr.message);
      }

      const allStreams = (streams ?? []).filter((raw) => {
        const row = raw as Record<string, unknown>;
        return !isRetiredOphimPlayback(row.provider_key || row.source, row.server_name, row.stream_url, row.embed_url);
      });
      const activeStreams = allStreams.filter((row) => Boolean((row as Record<string, unknown>).is_active));
      const streamHealthIndex = buildStreamHealthIndex(allStreams);
      for (const raw of allStreams) {
        const row = raw as Record<string, unknown>;
        if (!shouldSuppressUnhealthyStream(row)) continue;
        recoverableProblemStreamCount += 1;
        const checkedAt = Date.parse(String(row.last_checked_at || ''));
        if (Number.isFinite(checkedAt)) {
          newestProblemStreamCheckAt = Math.max(newestProblemStreamCheckAt, checkedAt);
        }
        for (const value of [row.stream_url, row.embed_url]) {
          const normalized = normalizePlayableUrl(String(value || ''));
          if (normalized) knownUnhealthyUrls.add(normalized);
        }
      }
      const movieEpisodeRows = [...(meRows ?? [])].sort((a, b) => {
        const am = a as Record<string, unknown>;
        const bm = b as Record<string, unknown>;
        const aPreferredOnlyflix = /moviesapi/i.test(String(am.server_name || ''));
        const bPreferredOnlyflix = /moviesapi/i.test(String(bm.server_name || ''));
        if (aPreferredOnlyflix !== bPreferredOnlyflix) return aPreferredOnlyflix ? -1 : 1;
        const aSecondaryOnlyflix = /vidfast\.(?:pro|vc)/i.test(String(am.server_name || ''));
        const bSecondaryOnlyflix = /vidfast\.(?:pro|vc)/i.test(String(bm.server_name || ''));
        if (aSecondaryOnlyflix !== bSecondaryOnlyflix) return aSecondaryOnlyflix ? -1 : 1;
        const aHidden = isHiddenEpisodeSource(am.source);
        const bHidden = isHiddenEpisodeSource(bm.source);
        if (aHidden !== bHidden) return aHidden ? -1 : 1;
        const aApi = String(am.source || '').trim().toLowerCase() === 'ophim';
        const bApi = String(bm.source || '').trim().toLowerCase() === 'ophim';
        if (aApi !== bApi) return aApi ? 1 : -1;
        return Number(am.episode_number ?? 0) - Number(bm.episode_number ?? 0);
      });
      const localizedEpisodeNumbers = new Set<number>();
      for (const row of [...movieEpisodeRows, ...activeStreams]) {
        const candidate = row as Record<string, unknown>;
        const source = String(candidate.source || '');
        const serverName = String(candidate.server_name || '');
        if (isQueerSourceMovie && !isTrustedQueerEpisodeSource(source, serverName, verifiedProviders)) continue;
        const audioType = String(candidate.audio_type || '').trim().toLowerCase();
        if (!audioType || audioType === 'raw') continue;
        const episodeNumber = Number(candidate.episode_number || 0) || extractEpNumber(String(candidate.episode_slug || candidate.slug || ''));
        if (episodeNumber > 0) localizedEpisodeNumbers.add(episodeNumber);
      }
      hasRawGlvietsubEpisode = [...movieEpisodeRows, ...activeStreams].some((row) => {
        const candidate = row as Record<string, unknown>;
        return String(candidate.source || '').trim().toLowerCase() === 'glvietsub' &&
          String(candidate.audio_type || '').trim().toLowerCase() === 'raw';
      });

      // 2a. movie_episodes overrides. Hidden rows block API rows without entering playback.
      for (const ep of movieEpisodeRows) {
        const em = ep as Record<string, unknown>;
        const num = Number(em.episode_number ?? 0);
        const slugVal = String(em.slug || `tap-${num}`);
        const serverName = String(em.server_name || 'Nguồn');
        const source = String(em.source || 'manual');
        if (isRetiredOphimPlayback(source, serverName, em.link_m3u8, em.link_embed)) continue;
        if (isQueerSourceMovie && !isTrustedQueerEpisodeSource(source, serverName, verifiedProviders)) continue;
        if (String(em.audio_type || '').trim().toLowerCase() === 'raw' && localizedEpisodeNumbers.has(num)) continue;
        let epData = {
          name: String(em.episode_name || `Tập ${num}`),
          slug: slugVal,
          filename: '',
          link_embed: normalizeDailymotionUrl(String(em.link_embed || '')),
          link_m3u8: String(em.link_m3u8 || ''),
          subtitle_url: String(em.subtitle_url || ''),
          audio_type: String(em.audio_type || '') || undefined,
          source_provider: source,
        };
        const healthRow = getEpisodeHealthRow(streamHealthIndex, serverName, slugVal, num, epData);
        if (shouldSuppressUnhealthyStream(healthRow)) continue;
        epData = attachStreamHealth(epData, healthRow);
        if (isKnownBlockedEmbedHost(String(epData.link_embed || epData.link_m3u8 || ''))) continue;
        const alreadySeen = hasSeenEpisode(seen, serverName, slugVal, num, String(epData.name));
        markSeenEpisode(seen, serverName, slugVal, num, String(epData.name));
        if (isHiddenEpisodeSource(source) || alreadySeen) continue;
        pushEpisode(serverMap, serverName, epData);
      }

      // 2b. Episodes table
      for (const row of oldEps ?? []) {
        const rm = row as Record<string, unknown>;
        const serverName = String(rm.server_name || 'Nguồn');
        if (isRetiredOphimPlayback('', serverName, rm.link_m3u8, rm.link_embed)) continue;
        if (isQueerSourceMovie) continue;
        let epData: Record<string, unknown>;
        const num = Number(rm.episode_number ?? 0);
        const slugVal = String(rm.episode_slug || (num > 0 ? String(num) : 'full'));

        if (rm.link_m3u8 || rm.link_embed || rm.episode_name || rm.episode_slug) {
          epData = {
            name: String(rm.episode_name || (num > 0 ? `Tập ${num}` : 'Full')),
            slug: slugVal,
            filename: '',
            link_embed: normalizeDailymotionUrl(String(rm.link_embed || '')),
            link_m3u8: String(rm.link_m3u8 || ''),
            subtitle_url: String(rm.subtitle_url || ''),
          };
        } else if (rm.server_data && typeof rm.server_data === 'object' && !Array.isArray(rm.server_data)) {
          const sd = rm.server_data as Record<string, unknown>;
          epData = {
            name: String(sd.name || ''),
            slug: String(sd.slug || ''),
            filename: String(sd.filename || ''),
            link_embed: normalizeDailymotionUrl(String(sd.link_embed || '')),
            link_m3u8: String(sd.link_m3u8 || ''),
            subtitle_url: String(sd.subtitle_url || sd.subtitle || ''),
          };
        } else if (Array.isArray(rm.server_data)) {
          const sds = rm.server_data as Array<Record<string, unknown>>;
          for (const ep of sds) {
            if (isRetiredOphimPlayback('', serverName, ep.link_m3u8, ep.link_embed)) continue;
            const epSlug = String(ep.slug || ep.name || '');
            const epName = String(ep.name || '');
            const epNum = extractEpNumber(epSlug || epName);
            if (hasSeenEpisode(seen, serverName, epSlug, epNum, epName)) continue;
            markSeenEpisode(seen, serverName, epSlug, epNum, epName);
            let nestedEpData = {
              name: String(ep.name || ''),
              slug: epSlug,
              filename: String(ep.filename || ''),
              link_embed: normalizeDailymotionUrl(String(ep.link_embed || '')),
              link_m3u8: String(ep.link_m3u8 || ''),
              subtitle_url: String(ep.subtitle_url || ep.subtitle || ''),
            };
            const healthRow = getEpisodeHealthRow(streamHealthIndex, serverName, epSlug, epNum, nestedEpData);
            if (shouldSuppressUnhealthyStream(healthRow)) continue;
            nestedEpData = attachStreamHealth(nestedEpData, healthRow);
            if (isKnownBlockedEmbedHost(String(nestedEpData.link_embed || nestedEpData.link_m3u8 || ''))) continue;
            pushEpisode(serverMap, serverName, nestedEpData);
          }
          continue;
        } else {
          continue;
        }

        const healthRow = getEpisodeHealthRow(streamHealthIndex, serverName, slugVal, num, epData);
        if (shouldSuppressUnhealthyStream(healthRow)) continue;
        epData = attachStreamHealth(epData, healthRow);
        if (isKnownBlockedEmbedHost(String(epData.link_embed || epData.link_m3u8 || ''))) continue;
        if (hasSeenEpisode(seen, serverName, slugVal, num, String(epData.name || ''))) continue;
        markSeenEpisode(seen, serverName, slugVal, num, String(epData.name || ''));
        pushEpisode(serverMap, serverName, epData);
      }

      // 2c. Streams table — skip dead streams
      for (const s of activeStreams) {
        const sm = s as Record<string, unknown>;
        if (shouldSuppressUnhealthyStream(sm)) continue;
        if (isQueerSourceMovie && !isTrustedQueerEpisodeSource(sm.source, sm.server_name, verifiedProviders)) continue;
        const streamUrl = String(sm.stream_url || '').trim();
        const embedUrl = String(sm.embed_url || '').trim();
        if (!streamUrl && !embedUrl) continue;
        if (isKnownBlockedEmbedHost(embedUrl || streamUrl)) continue;
        const healthStatus = String(sm.health_status || 'unchecked').toLowerCase();
        const failureCount = Number(sm.failure_count || 0);
        const lastError = String(sm.last_error || '');
        const directStreamFailed = healthStatus === 'degraded' && lastError.startsWith('Direct stream failed:');
        // Keep the API contract aligned with the frontend. Viewer telemetry
        // raises failure_count by three after repeated fatal playback reports;
        // returning those rows until five failures made a known-bad source
        // eligible for one more viewer session and left stale edge responses.
        if (healthStatus === 'dead' || (healthStatus === 'failed' && failureCount >= 3)) continue;

        const slugVal = String(sm.episode_slug || 'full');
        const serverName = String(sm.server_name || 'Nguồn');
        const num = extractEpNumber(slugVal);
        if (String(sm.audio_type || '').trim().toLowerCase() === 'raw' && localizedEpisodeNumbers.has(num)) continue;
        const epName = slugVal === 'full' ? 'Full' : `Tập ${num || slugVal}`;
        if (hasSeenEpisode(seen, serverName, slugVal, num, epName)) continue;
        markSeenEpisode(seen, serverName, slugVal, num, epName);
        const epData = {
          name: epName,
          slug: slugVal,
          filename: '',
          link_embed: normalizeDailymotionUrl(embedUrl),
          link_m3u8: directStreamFailed ? '' : streamUrl,
          subtitle_url: String(sm.subtitle_url || ''),
          audio_type: String(sm.audio_type || '') || undefined,
          source_health_status: healthStatus || 'unchecked',
          source_response_time_ms: Number(sm.response_time_ms || 0) || undefined,
          source_failure_count: failureCount || undefined,
          source_priority: Number(sm.priority || 0) || undefined,
          source_playback_score: Number(sm.playback_score ?? -1) >= 0 ? Number(sm.playback_score) : undefined,
          source_provider: String(sm.provider_key || sm.source || '') || undefined,
          source_last_checked_at: String(sm.last_checked_at || '') || undefined,
          source_last_error: lastError || undefined,
        };

        pushEpisode(serverMap, serverName, epData);
      }
    }

    /* ── 3. Fetch external if no DB episodes or no DB movie ── */
    let externalMovieData: Record<string, unknown> | null = null;

    const dbMaxEpisode = getMaxEpisodeNumberFromServerMap(serverMap);
    const expectedEpisode = Math.max(
      getExpectedEpisodeNumber(movieData),
      getExpectedEpisodeNumber(movie),
    );
    const advertisedTotalEpisode = Math.max(
      Number((movieData || movie)?.total_episodes || 0) || 0,
      extractEpNumber(String((movieData || movie)?.episode_total || '')),
    );
    const shouldCheckFreshOngoingExternal =
      isUnifiedProviderMovieRecord((movieData || movie) as Record<string, unknown>) &&
      expectedEpisode > 0 &&
      advertisedTotalEpisode > expectedEpisode;
    const shouldCheckRequestedSlugAlias =
      useSupabase &&
      !!movieData &&
      normalizedSlug((movieData as Record<string, unknown>).slug) !== normalizedSlug(slug) &&
      isUnifiedProviderMovieRecord((movieData || movie) as Record<string, unknown>);
    const shouldRepairOnDemand = expectedEpisode > 0 && dbMaxEpisode < expectedEpisode;
    // Episode count alone is not playback readiness. If the database contains
    // the advertised episode numbers but every candidate for one of those
    // numbers is repeatedly blocked/failed, fetch an independent provider and
    // persist it as a backup instead of returning a superficially complete set.
    const shouldRepairUnhealthyCoverage =
      expectedEpisode > 0 && hasUnhealthyExpectedCoverage(serverMap, expectedEpisode);
    const shouldRepairUnverifiedCoverage =
      expectedEpisode > 0 && hasUnverifiedSingleProviderCoverage(serverMap, expectedEpisode);
    // A TV/series record advertised as multiple episodes must not be accepted
    // as complete when its only playable row is a legacy `full` placeholder.
    // Search by stable movie metadata (TMDB/title/year) and require the normal
    // safe-match check before merging a numbered provider catalogue.
    const shouldRepairPlaceholderSeries = hasOnlyFullPlaceholderCoverage(
      (movieData || movie) as Record<string, unknown> | null,
      serverMap,
    );
    const knownSourceLastSyncAt = Date.parse(String((movieData || movie)?.last_synced_at || ''));
    const shouldRefreshStaleGlvietsubRaw =
      hasRawGlvietsubEpisode &&
      isGlvietsubMovieRecord((movieData || movie) as Record<string, unknown>) &&
      (!Number.isFinite(knownSourceLastSyncAt) || Date.now() - knownSourceLastSyncAt >= 10 * 60 * 1000);
    // A manual refresh is an explicit request to re-check the known BLVietsub
    // source. It lets a completed series catch its final episode even when
    // its old database badge was internally consistent.
    const shouldForceKnownBlvietsubSync =
      forceRefresh && isBlvietsubMovieRecord((movieData || movie) as Record<string, unknown>) &&
      Boolean(
        getBlvietsubMovieUrl((movieData || movie) as Record<string, unknown>) ||
        getGlvietsubMovieSlug((movieData || movie) as Record<string, unknown>),
      );
    let repairTriggered = false;
    const shouldRecheckQuarantinedPlayback =
      serverMap.size === 0 &&
      recoverableProblemStreamCount > 0 &&
      (
        newestProblemStreamCheckAt <= 0 ||
        Date.now() - newestProblemStreamCheckAt >= 5 * 60 * 1000
      );
    const shouldRepairInBackground =
      shouldRepairOnDemand ||
      shouldForceKnownBlvietsubSync ||
      shouldRefreshStaleGlvietsubRaw ||
      shouldRepairUnhealthyCoverage ||
      shouldRepairUnverifiedCoverage ||
      shouldRepairPlaceholderSeries ||
      shouldCheckFreshOngoingExternal ||
      shouldCheckRequestedSlugAlias;
    if (isPrivilegedProxyRequest && shouldRepairInBackground) {
      repairTriggered = triggerOnDemandEpisodeRepair(
        supabase,
        (movieData || movie) as Record<string, unknown>,
        slug,
        shouldForceKnownBlvietsubSync
          ? 'movie_detail_force_refresh'
          : shouldRepairUnhealthyCoverage
            ? 'movie_detail_unhealthy_playback'
            : shouldRepairUnverifiedCoverage
              ? 'movie_detail_unverified_playback'
              : 'movie_detail_episode_mismatch',
      );
    }
    if (isPrivilegedProxyRequest && shouldRecheckQuarantinedPlayback) {
      repairTriggered = triggerOnDemandStreamRecovery(
        supabase,
        (movieData || movie) as Record<string, unknown>,
        slug,
      ) || repairTriggered;
    }

    // A complete, playable BLVietsub record must stay on the fast database
    // path. Searching OPhim/PhimAPI is network-bound and previously delayed
    // every detail request by up to several upstream timeouts, even when no
    // repair was needed. Only block for an auxiliary source when coverage is
    // genuinely missing or all candidates for the advertised episode failed.
    const shouldFetchQueerAuxiliary =
      isQueerSourceMovie &&
      !!movieData &&
      (
        serverMap.size === 0 ||
        shouldRepairOnDemand
      );

    if (isPrivilegedProxyRequest && ENABLE_PUBLIC_LAZY_PERSIST && shouldFetchQueerAuxiliary && movieData) {
      const queerMovieData = movieData as Record<string, unknown>;
      // Auxiliary discovery is a repair job, not a viewer request dependency.
      // Persist a verified match for the next open without holding this
      // response behind several third-party searches and detail fetches.
      edgeWaitUntil(
        fetchVerifiedAuxiliaryExternalDetail(queerMovieData)
          .then(async (verifiedAuxiliary) => {
            if (!verifiedAuxiliary) return;
            const result = await persistVerifiedAuxiliaryEpisodes(
              supabase,
              String(movieId || ''),
              verifiedAuxiliary,
            );
            if (result.inserted || result.updated) {
              await clearDetailCaches(supabase, [
                slug,
                String(queerMovieData.slug || ''),
                String(queerMovieData.ophim_slug || ''),
              ]);
            }
          })
          .catch((error) => {
            console.warn('verified_auxiliary_persist_failed', {
              slug,
              error: error instanceof Error ? error.message : String(error),
            });
          }),
      );
    }

    // Never make a usable database-backed player wait for third-party repair.
    // Provider search can exceed the Cloudflare 4s gateway budget and used to
    // trip the movie-detail circuit repeatedly for large catalogues. The
    // repair request above runs in the background; synchronous external lookup
    // is reserved for the true no-episode/no-database fallback.
    const shouldFetchExternal =
      !isQueerSourceMovie && (serverMap.size === 0 || !useSupabase || shouldRepairPlaceholderSeries);

    if (shouldFetchExternal) {
      let detailSlug = slug;
      // A `full` placeholder has already proven that the requested legacy slug
      // is not a valid episodic catalogue. Skip that redundant upstream round
      // trip and resolve a verified title/TMDB/year alias directly.
      let external = shouldRepairPlaceholderSeries
        ? null
        : await fetchExternalMovieDetail(detailSlug);

      const initialExternalMax = external ? getMaxEpisodeNumberFromServers(external.episodes) : 0;
      if (movieData && (initialExternalMax < expectedEpisode || shouldRepairPlaceholderSeries)) {
        const verifiedAlias = await fetchVerifiedAuxiliaryExternalDetail(movieData as Record<string, unknown>);
        const verifiedMax = verifiedAlias ? getMaxEpisodeNumberFromServers(verifiedAlias.episodes) : 0;
        if (verifiedAlias && verifiedMax > initialExternalMax) {
          external = verifiedAlias;
          detailSlug = String(verifiedAlias.movie.slug || detailSlug);
        }
      }

      // If the advertised slug is empty or missing, search every supported
      // catalogue for title aliases. Alias candidates are fetched together and
      // selected only by playable completeness; provider identity is not used.
      if (!external) {
        const aliasSlugs = (await searchOphimCandidateSlugs(slug, 6))
          .filter((candidateSlug) => candidateSlug !== slug)
          .slice(0, 4);
        const aliasResults = await Promise.all(aliasSlugs.map(async (candidateSlug) => ({
          candidateSlug,
          detail: await fetchExternalMovieDetail(candidateSlug),
        })));
        const scoredAliases = aliasResults
          .filter((result): result is typeof result & { detail: NonNullable<typeof result.detail> } => !!result.detail)
          .map((result) => {
            let playable = 0;
            let direct = 0;
            for (const server of result.detail.episodes) {
              for (const raw of server.server_data ?? []) {
                const episode = raw as Record<string, unknown>;
                if (!hasPlayableEpisodeLink(episode)) continue;
                playable += 1;
                if (/\.(?:m3u8|mp4|webm|mov)(?:[?#].*)?$/i.test(String(episode.link_m3u8 || episode.link_embed || ''))) direct += 1;
              }
            }
            return {
              ...result,
              score: getMaxEpisodeNumberFromServers(result.detail.episodes) * 1000 + playable * 20 + direct * 5,
            };
          })
          .sort((a, b) => b.score - a.score || a.candidateSlug.localeCompare(b.candidateSlug));
        if (scoredAliases[0]) {
          external = scoredAliases[0].detail;
          detailSlug = scoredAliases[0].candidateSlug;
          console.log(`[movie-detail-proxy] Playable alias "${detailSlug}" resolved "${slug}" by neutral score`);
        }
      }

      if (external) {
        externalMovieData = external.movie;
        if (movieData && shouldPreferExternalMovieData(movieData, external.movie, slug)) {
          movieData = mergeMovieDataForRequestedSlug(movieData, external.movie, slug);
        }
        if (!movieData) movieData = mergeMovieDataForRequestedSlug({}, external.movie, slug);
        if (isPrivilegedProxyRequest && ENABLE_PUBLIC_LAZY_PERSIST) {
          try {
            const runtime = globalThis as unknown as {
              EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
            };
            const persistPromise = persistExternalMovie(supabase, external, slug, detailSlug, movieId);
            if (runtime.EdgeRuntime?.waitUntil) {
              runtime.EdgeRuntime.waitUntil(persistPromise);
            } else {
              void persistPromise;
            }
          } catch {
            /* lazy persist is best-effort */
          }
        
        }
        for (const srv of external.episodes) {
          const serverName = String(srv.server_name || 'Nguồn');
          const sds = (srv.server_data ?? []) as Array<Record<string, unknown>>;
          for (const ep of sds) {
            if (isRetiredOphimPlayback(ep.source_provider, serverName, ep.link_m3u8, ep.link_embed)) continue;
            const slugVal = String(ep.slug || ep.name || '');
            const epName = String(ep.name || '');
            const epNum = extractEpNumber(slugVal || epName);
            const externalStreamUrl = normalizePlayableUrl(String(ep.link_m3u8 || ''));
            const externalEmbedUrl = normalizePlayableUrl(String(ep.link_embed || ''));
            if (isKnownBlockedEmbedHost(externalEmbedUrl || externalStreamUrl)) continue;
            if (
              (externalStreamUrl && knownUnhealthyUrls.has(externalStreamUrl)) ||
              (externalEmbedUrl && knownUnhealthyUrls.has(externalEmbedUrl))
            ) continue;
            if (hasSeenEpisode(seen, serverName, slugVal, epNum, epName)) continue;
            markSeenEpisode(seen, serverName, slugVal, epNum, epName);
            pushEpisode(serverMap, serverName, {
              name: String(ep.name || ''),
              slug: slugVal,
              filename: String(ep.filename || ''),
              link_embed: normalizeDailymotionUrl(String(ep.link_embed || '')),
              link_m3u8: String(ep.link_m3u8 || ''),
              subtitle_url: String(ep.subtitle_url || ep.subtitle || ''),
            });
          }
        }
      }
    }

    // A saturated database must degrade to a previously verified playable
    // snapshot, never to an unscored iframe. The safety net is deliberately
    // tiny and exact-slug keyed; it cannot cross-wire identities or override
    // any live canonical stream returned above.
    if (serverMap.size === 0) {
      for (const fallback of VERIFIED_PLAYBACK_SAFETY_NET[slug] ?? []) {
        if (isKnownBlockedEmbedHost(fallback.link_m3u8 || fallback.link_embed)) continue;
        pushEpisode(serverMap, fallback.server_name, {
          name: fallback.name,
          slug: fallback.slug,
          filename: '',
          link_m3u8: fallback.link_m3u8,
          link_embed: fallback.link_embed,
          source_provider: fallback.source_provider,
          source_playback_score: fallback.source_playback_score,
          source_health_status: fallback.source_health_status,
          source_last_checked_at: fallback.source_last_checked_at,
        });
      }
    }

    /* ── 4. Sort episodes ── */
    suppressRepeatedGlvietsubPlaybackUrls(serverMap);
    removeLegacyUncheckedFullPlaceholders(movieData, serverMap);

    for (const [, eps] of serverMap) {
      eps.sort((a: { slug?: string; name?: string }, b: { slug?: string; name?: string }) => epSortKey(a) - epSortKey(b));
    }

    const episodeServers: Array<{ server_name: string; server_data: unknown[] }> = [];
    for (const [serverName, serverData] of serverMap) {
      const playable = (serverData as Array<{ link_m3u8?: string; link_embed?: string }>)
        .filter((ep) => !!(ep.link_m3u8?.trim() || ep.link_embed?.trim()));
      if (playable.length > 0) {
        episodeServers.push({ server_name: serverName, server_data: playable });
      }
    }

    // Older BLVietsub sync runs numbered legacy buttons globally, turning two
    // complete hosts into N singleton servers. Rebuild those rows by host.
    if (isQueerSourceMovie && episodeServers.length > 4) {
      const initialMaxCoverage = Math.max(...episodeServers.map((server) => server.server_data.length));
      if (initialMaxCoverage === 1) {
        const byHost = new Map<string, { server_name: string; server_data: Record<string, unknown>[]; seen: Set<string> }>();
        for (const server of episodeServers) {
          for (const rawEpisode of server.server_data) {
            const episode = rawEpisode as Record<string, unknown>;
            const url = String(episode.link_m3u8 || episode.link_embed || '');
            const host = getUrlHost(url) || String(server.server_name || 'unknown').toLowerCase();
            if (!byHost.has(host)) {
              const label = host.includes('abyssplayer')
                ? 'BLVietsub HX'
                : host.includes('ssplay')
                  ? 'BLVietsub SS'
                  : `BLVietsub ${byHost.size + 1}`;
              byHost.set(host, { server_name: label, server_data: [], seen: new Set() });
            }
            const group = byHost.get(host)!;
            const key = String(epSortKey(episode as { slug?: string; name?: string }));
            if (group.seen.has(key)) continue;
            group.seen.add(key);
            group.server_data.push(episode);
          }
        }
        const regrouped = [...byHost.values()]
          .filter((server) => server.server_data.length > 1)
          .map(({ server_name, server_data }) => ({
            server_name,
            server_data: server_data.sort((a, b) => epSortKey(a) - epSortKey(b)),
          }));
        const recoveredRows = regrouped.reduce((sum, server) => sum + server.server_data.length, 0);
        if (regrouped.length > 0 && recoveredRows >= Math.ceil(episodeServers.length * 0.75)) {
          episodeServers.splice(0, episodeServers.length, ...regrouped);
        }
      }
    }

    // Some legacy BLVietsub sync runs stored every episode/player button as a
    // separate SV server. When complete servers exist, hide those singleton
    // duplicates from playback instead of presenting dozens of fake choices.
    if (isQueerSourceMovie && episodeServers.length > 3) {
      const maxCoverage = Math.max(...episodeServers.map((server) => server.server_data.length));
      if (maxCoverage >= 4) {
        const minimumUsefulCoverage = Math.max(2, Math.ceil(maxCoverage * 0.5));
        const usefulServers = episodeServers.filter((server) => server.server_data.length >= minimumUsefulCoverage);
        if (usefulServers.length > 0) {
          episodeServers.splice(0, episodeServers.length, ...usefulServers);
        }
      }
    }

    if (!movieData) {
      return jsonResponse({ status: false, message: 'Movie not found' }, 404);
    }

    const hasEpisodes = episodeServers.length > 0;
    const m = movieData;
    const response = {
      status: true,
      playback_cache_version: DETAIL_CACHE_SCHEMA_VERSION,
      movie: {
        _id: String(m.id || m._id || externalMovieData?.id || externalMovieData?._id || ''),
        name: String(m.name || externalMovieData?.name || ''),
        slug: String(m.slug || externalMovieData?.slug || slug),
        origin_name: String(m.origin_name || m.originName || externalMovieData?.origin_name || ''),
        content: String(m.content || m.description || externalMovieData?.content || ''),
        type: String(m.type || externalMovieData?.type || 'phim-le'),
        status: String(m.status || externalMovieData?.status || 'completed'),
        thumb_url: String(m.thumb_url || m.thumbUrl || m.thumb || externalMovieData?.thumb_url || ''),
        poster_url: String(m.poster_url || m.posterUrl || m.poster || externalMovieData?.poster_url || ''),
        trailer_url: String(m.trailer_url || m.trailerUrl || externalMovieData?.trailer_url || ''),
        time: String(m.time || externalMovieData?.time || ''),
        episode_current: String(m.episode_current || m.episodeCurrent || externalMovieData?.episode_current || ''),
        episode_total: String(m.episode_total || m.episodeTotal || externalMovieData?.episode_total || ''),
        current_episode: Number(m.current_episode || externalMovieData?.current_episode || 0) || undefined,
        total_episodes: Number(m.total_episodes || externalMovieData?.total_episodes || 0) || undefined,
        schedule_type: String(m.schedule_type || externalMovieData?.schedule_type || ''),
        release_time: String(m.release_time || externalMovieData?.release_time || ''),
        release_day: m.release_day ?? externalMovieData?.release_day,
        schedule_timezone: String(m.schedule_timezone || externalMovieData?.schedule_timezone || ''),
        release_at: String(m.release_at || externalMovieData?.release_at || ''),
        next_episode_at: String(m.next_episode_at || externalMovieData?.next_episode_at || ''),
        next_episode_name: String(m.next_episode_name || externalMovieData?.next_episode_name || ''),
        schedule_note: String(m.schedule_note || externalMovieData?.schedule_note || ''),
        quality: String(m.quality || externalMovieData?.quality || 'HD'),
        lang: String(m.lang || m.language || externalMovieData?.lang || 'Vietsub'),
        year: Number(m.year || externalMovieData?.year || 0),
        actor: Array.isArray(m.actor) ? (m.actor as string[]) : (Array.isArray(externalMovieData?.actor) ? externalMovieData?.actor as string[] : []),
        director: Array.isArray(m.director) ? (m.director as string[]) : (Array.isArray(externalMovieData?.director) ? externalMovieData?.director as string[] : []),
        category: Array.isArray(m.category)
          ? (m.category as Array<{ id?: string; name: string; slug: string }>)
          : (Array.isArray(externalMovieData?.category) ? externalMovieData?.category as Array<{ id?: string; name: string; slug: string }> : []),
        country: Array.isArray(m.country)
          ? (m.country as Array<{ id?: string; name: string; slug: string }>)
          : (Array.isArray(externalMovieData?.country) ? externalMovieData?.country as Array<{ id?: string; name: string; slug: string }> : []),
        notify: String(m.notify || ''),
        showtimes: String(m.showtimes || ''),
        is_copyright: false,
        sub_docquyen: false,
        chieurap: false,
        view: Number(m.view || 0),
        // Legacy OPhim identifiers remain private migration history only. They
        // are no longer part of the public provider identity contract.
        ophim_id: '',
        tmdb_id: m.tmdb_id ? Number(m.tmdb_id) : undefined,
        imdb_id: String(m.imdb_id || ''),
        seo_catalog_status: String(m.seo_catalog_status || ''),
        catalog_source: String(m.catalog_source || ''),
        tmdb_media_type: String(m.tmdb_media_type || ''),
        tmdb_popularity: Number(m.tmdb_popularity || 0),
        tmdb_vote_count: Number(m.tmdb_vote_count || 0),
        tmdb_vote_average: Number(m.tmdb_vote_average || 0),
        seo_has_playable_episode: hasEpisodes,
        modified: { time: String(m.updated_at || m.created_at || new Date().toISOString()) },
      },
      episodes: episodeServers,
    };

    const liveMaxEpisode = getMaxEpisodeNumberFromServers(episodeServers);
    const labelAdvertisedEpisode = extractEpNumber(String(response.movie.episode_current || ''));
    const currentAdvertisedEpisode = Math.max(
      Number(response.movie.current_episode || 0) || 0,
      labelAdvertisedEpisode,
    );
    if (
      liveMaxEpisode > 0 &&
      (liveMaxEpisode !== currentAdvertisedEpisode || labelAdvertisedEpisode !== liveMaxEpisode)
    ) {
      response.movie.episode_current = `Tập ${liveMaxEpisode}`;
      response.movie.current_episode = liveMaxEpisode;
      if (!response.movie.total_episodes || Number(response.movie.total_episodes) < liveMaxEpisode) {
        response.movie.total_episodes = undefined;
        response.movie.episode_total = '';
      }
    }
    if (liveMaxEpisode === 0 && hasPlayableFullMovie(episodeServers)) {
      response.movie.episode_current = 'Full';
      response.movie.episode_total = '1';
      response.movie.current_episode = 1;
      response.movie.total_episodes = Math.max(Number(response.movie.total_episodes || 0), 1);
    }

    // Cache successful responses for repeat opens; episode metadata rarely changes minute by minute.
    const responseMaxEpisode = getMaxEpisodeNumberFromServers(episodeServers);
    const responseExpectedEpisode = getExpectedEpisodeNumber(response.movie as Record<string, unknown>);
    const isIncomplete = responseExpectedEpisode > 1 && responseMaxEpisode > 0 && responseMaxEpisode < responseExpectedEpisode;
    const cacheControl = hasEpisodes
      ? (isIncomplete ? 'no-store' : 'public, max-age=300, stale-while-revalidate=1800, stale-if-error=86400')
      : 'no-store';

    const hasCacheSafePlayback = episodeServers.some((server) =>
      server.server_data.some((raw) => {
        const episode = raw as Record<string, unknown>;
        return String(episode.source_health_status || '').toLowerCase() === 'ok' ||
          Boolean(String(episode.link_m3u8 || '').trim());
      })
    );
    if (hasEpisodes && !isIncomplete && hasCacheSafePlayback) {
      const responseSlug = String(response.movie.slug || '');
      const cacheWrites = [writeCachedDetail(supabase, slug, response)];
      if (responseSlug && responseSlug !== slug) cacheWrites.push(writeCachedDetail(supabase, responseSlug, response));
      // Cache persistence is best-effort and must never consume the viewer's
      // four-second Cloudflare gateway budget after the response is ready.
      edgeWaitUntil(Promise.allSettled(cacheWrites));
    }

    return jsonResponse(response, 200, {
      'Cache-Control': cacheControl,
      'X-Cache': forceRefresh ? 'REFRESH' : 'MISS',
      'X-Repair-Triggered': repairTriggered || isIncomplete ? '1' : '0',
    });
  } catch (err) {
    console.error('[movie-detail-proxy] Fatal Error:', err);
    return jsonResponse({ status: false, message: 'Server error' }, 500);
  }
}

serve(async (req) => withPublicReadCors(await handleRequest(req), req.headers.get('origin')));
