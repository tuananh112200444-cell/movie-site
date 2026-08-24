import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getProviderEpisodeNumber,
  normalizeVerifiedSeasonNumbering,
  type SeasonNumberingNormalization,
} from '../_shared/episode-numbering.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const PROVIDERS = {
  kkphim: {
    sourceSite: 'phimapi',
    sourceName: 'KKPhim',
    bases: ['https://phimapi.com', 'https://phimapi.net'],
    listPath: (page: number) => `/danh-sach/phim-moi-cap-nhat?page=${page}`,
    searchPath: (query: string) => `/v1/api/tim-kiem?keyword=${encodeURIComponent(query)}&limit=10`,
    detailPath: (slug: string) => `/phim/${encodeURIComponent(slug)}`,
    trackOphimIdentity: false,
    adapter: 'ophim',
  },
  vsmov: {
    sourceSite: 'vsmov',
    sourceName: 'VSMOV',
    bases: ['https://vsmov.com'],
    listPath: (page: number) => `/api/danh-sach/phim-moi-cap-nhat?page=${page}`,
    searchPath: (query: string) => `/api/tim-kiem?keyword=${encodeURIComponent(query)}&limit=10`,
    detailPath: (slug: string) => `/api/phim/${encodeURIComponent(slug)}`,
    trackOphimIdentity: false,
    adapter: 'ophim',
  },
  nguonc: {
    sourceSite: 'nguonc',
    sourceName: 'Nguồn C',
    bases: ['https://phim.nguonc.com'],
    listPath: (page: number) => `/api/films/phim-moi-cap-nhat?page=${page}`,
    searchPath: (query: string) => `/api/films/search?keyword=${encodeURIComponent(query)}`,
    detailPath: (slug: string) => `/api/film/${encodeURIComponent(slug)}`,
    trackOphimIdentity: false,
    adapter: 'nguonc',
  },
} as const;

type ProviderKey = keyof typeof PROVIDERS;
type ProviderConfig = (typeof PROVIDERS)[ProviderKey];

function providerFromParam(value: string | null): ProviderConfig | null {
  if (value === 'kkphim') return PROVIDERS.kkphim;
  if (value === 'vsmov') return PROVIDERS.vsmov;
  if (value === 'nguonc') return PROVIDERS.nguonc;
  return null;
}

type SupabaseClient = ReturnType<typeof createClient>;

interface OPhimEpisode {
  name?: string;
  slug?: string;
  filename?: string;
  link_embed?: string;
  link_m3u8?: string;
}

interface OPhimServer {
  server_name?: string;
  server_data?: OPhimEpisode[];
}

interface OPhimMovie {
  _id?: string;
  id?: string;
  name?: string;
  origin_name?: string;
  original_name?: string;
  alternative_names?: string[];
  slug?: string;
  content?: string;
  type?: string;
  status?: string;
  thumb_url?: string;
  poster_url?: string;
  trailer_url?: string;
  time?: string;
  episode_current?: string;
  episode_total?: string;
  quality?: string;
  lang?: string;
  notify?: string;
  showtimes?: string;
  year?: number;
  tmdb?: { id?: string | number; type?: string; season?: number };
  actor?: string[];
  director?: string[];
  category?: Array<{ id?: string; name?: string; slug?: string }>;
  country?: Array<{ id?: string; name?: string; slug?: string }>;
  modified?: { time?: string };
}

interface DetailPayload {
  status?: boolean | string;
  movie?: OPhimMovie;
  episodes?: OPhimServer[];
  data?: {
    item?: OPhimMovie & { episodes?: OPhimServer[] };
    items?: OPhimMovie[];
  };
  item?: OPhimMovie & { episodes?: OPhimServer[] };
}

interface ParsedDetail {
  movie: OPhimMovie;
  episodes: OPhimServer[];
  numberingNormalization?: SeasonNumberingNormalization | null;
}

interface SyncStats {
  scanned: number;
  created: number;
  updated: number;
  episodesInserted: number;
  skipped: number;
  errors: string[];
  transientErrors: string[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function normalizeText(value = ''): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugify(value = ''): string {
  return normalizeText(value).replace(/\s+/g, '-') || 'phim';
}

function canonicalDuplicateTitle(value = ''): string {
  return normalizeText(value)
    .replace(/\b(18|19|20)\d{2}\b/g, ' ')
    .replace(/\b(tap|ep|episode|phan|season|trailer|vietsub|thuyet minh|long tieng|full|hd|fhd|4k)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCandidates(record: Record<string, unknown>): string[] {
  return Array.from(new Set([
    record.name,
    record.origin_name,
    record.title_vi,
    record.title_en,
    record.title_zh,
    record.title_original,
    record.normalized_name,
    String(record.slug || '').replace(/-/g, ' '),
    String(record.ophim_slug || '').replace(/-/g, ' '),
  ]
    .map((value) => canonicalDuplicateTitle(String(value || '')))
    .filter((value) => value.length >= 6)));
}

function sourcePriority(record: Record<string, unknown>): number {
  const source = `${record.source_site || ''} ${record.source_name || ''}`.toLowerCase();
  if (source.includes('ophim') || source.includes('phimapi') || source.includes('kkphim')) return 5;
  if (source.includes('admin') || source.includes('supabase')) return 4;
  if (source.includes('blvietsub')) return 3;
  if (record.tmdb_id) return 2;
  return 1;
}

function isCuratedCatalogMovie(record: Record<string, unknown> | null): boolean {
  const source = `${record?.source_site || ''} ${record?.source_name || ''}`.toLowerCase();
  return source.includes('admin-queer') || source.includes('blvietsub');
}

function canonicalCandidateScore(record: Record<string, unknown>): number {
  const current = Math.max(
    Number(record.current_episode || 0),
    firstEpisodeNumber(String(record.episode_current || '')),
  );
  const total = Math.max(
    Number(record.total_episodes || 0),
    totalEpisodeNumber(String(record.episode_total || '')),
    current,
  );
  return (record.is_published === false ? -10_000 : 0) + total * 20 + current * 4 + sourcePriority(record);
}

function sameMovieByTitle(existing: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  const existingYear = Number(existing.year || 0);
  const incomingYear = Number(incoming.year || 0);
  if (!(existingYear > 0 && incomingYear > 0 && existingYear === incomingYear)) return false;
  const existingType = normalizedMovieType(existing.type);
  const incomingType = normalizedMovieType(incoming.type);
  if (existingType && incomingType && existingType !== incomingType) return false;

  const strictTitles = (record: Record<string, unknown>) => Array.from(new Set([
    record.name,
    record.origin_name,
    record.title_vi,
    record.title_en,
    record.title_zh,
    record.title_original,
  ].map((value) => normalizeText(String(value || ''))).filter((value) => value.length >= 3)));
  const existingTitles = strictTitles(existing);
  const incomingTitles = strictTitles(incoming);
  return incomingTitles.some((incomingTitle) => existingTitles.includes(incomingTitle));
}

function sameMovieByStableProviderIdentity(existing: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  const incomingSource = String(incoming.source_site || '').toLowerCase();
  if (incomingSource !== 'ophim') return false;
  const sameId = String(existing.ophim_id || '') && String(existing.ophim_id) === String(incoming.ophim_id || '');
  const sameSlug = String(existing.ophim_slug || '') && String(existing.ophim_slug) === String(incoming.ophim_slug || '');
  if (!sameId && !sameSlug) return false;
  const existingType = normalizedMovieType(existing.type);
  const incomingType = normalizedMovieType(incoming.type);
  if (existingType && incomingType && existingType !== incomingType) return false;
  // OPhim occasionally renames a title while retaining both its immutable
  // provider id and slug. That exact pair identifies a metadata rename, not a
  // second movie; retaining the existing canonical row also avoids a unique
  // ophim_slug collision.
  if (sameId && sameSlug) return true;
  const titles = (record: Record<string, unknown>) => [
    record.name, record.origin_name, record.title_vi, record.title_en, record.title_original,
  ].map((value) => normalizeText(String(value || ''))).filter((value) => value.length >= 3);
  const existingTitles = titles(existing);
  return titles(incoming).some((title) => existingTitles.includes(title));
}

function normalizedMovieType(value: unknown): 'single' | 'series' | '' {
  const type = normalizeText(String(value || ''));
  if (['single', 'movie', 'phim le', 'phim chieu rap'].includes(type)) return 'single';
  if (['series', 'tv', 'tvshows', 'tv show', 'tv shows', 'phim bo', 'hoathinh'].includes(type)) return 'series';
  return '';
}

function detailMatchesExpected(expected: OPhimMovie, detail: ParsedDetail): boolean {
  const expectedRecord = expected as Record<string, unknown>;
  const detailRecord = detail.movie as Record<string, unknown>;
  if (!sameMovieByTitle(expectedRecord, detailRecord)) return false;

  const expectedType = normalizedMovieType(expected.type);
  const detailType = normalizedMovieType(detail.movie.type);
  return !(expectedType && detailType && expectedType !== detailType);
}

function escapePostgrestIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, ' ');
}

function dbErrorMessage(error: unknown): string {
  if (!error) return 'unknown database error';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return String(record.message || record.details || record.hint || record.code || JSON.stringify(record));
  }
  return String(error);
}

function isDuplicateError(error: unknown): boolean {
  const record = (error && typeof error === 'object') ? error as Record<string, unknown> : {};
  const text = dbErrorMessage(error).toLowerCase();
  return record.code === '23505' || text.includes('duplicate key') || text.includes('unique constraint');
}

function isRetryableDatabaseError(error: unknown): boolean {
  const record = (error && typeof error === 'object') ? error as Record<string, unknown> : {};
  const text = dbErrorMessage(error).toLowerCase();
  return (
    record.code === '40P01' ||
    record.code === '40001' ||
    record.code === '55P03' ||
    text.includes('deadlock detected') ||
    text.includes('serialization failure') ||
    text.includes('could not obtain lock')
  );
}

async function runDatabaseMutationWithRetry<T extends { error?: unknown }>(
  operation: () => PromiseLike<T>,
  attempts = 3,
): Promise<T> {
  let result = await operation();
  for (let attempt = 1; attempt < attempts && isRetryableDatabaseError(result.error); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100 * attempt + Math.floor(Math.random() * 75)));
    result = await operation();
  }
  return result;
}

function isTransientExternalError(value: unknown): boolean {
  const text = dbErrorMessage(value).toLowerCase();
  return (
    text.includes('error 521') ||
    text.includes('"status":521') ||
    text.includes('web server is down') ||
    text.includes('cloudflare') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('networkerror') ||
    text.includes('failed to fetch') ||
    text.includes('fetch failed') ||
    text.includes('429') ||
    text.includes('too many requests') ||
    text.includes('rate limit') ||
    text.includes('temporarily unavailable') ||
    text.includes('latest list returned 0 items') ||
    text.includes('from all mirrors') ||
    text.includes('503') ||
    text.includes('502') ||
    text.includes('504')
  );
}

function recordSyncError(stats: SyncStats, message: string): void {
  if (isTransientExternalError(message)) {
    stats.transientErrors.push(message);
    return;
  }
  stats.errors.push(message);
}

function episodeNumber(ep: OPhimEpisode): number {
  return getProviderEpisodeNumber(ep);
}

function hasPlayableEpisodeLink(ep: OPhimEpisode): boolean {
  return Boolean(String(ep.link_m3u8 || '').trim() || String(ep.link_embed || '').trim());
}

function firstEpisodeNumber(value = ''): number {
  const text = String(value || '').toLowerCase();
  if (text.includes('full')) return 1;
  const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slash) return Number(slash[1] || 0) || 0;
  const range = text.match(/(?:tap|ep|episode|tập)?\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
  if (range) return Number(range[2] || 0) || Number(range[1] || 0) || 0;
  const valueNumber = Number(text.match(/\d{1,4}/)?.[0] || 0);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function totalEpisodeNumber(value = ''): number {
  const text = String(value || '');
  const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slash) return Number(slash[2] || 0) || 0;
  const valueNumber = Number(text.match(/\d{1,4}/)?.[0] || 0);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function repairConcatenatedEpisodeNumber(current: number, total: number): number {
  if (!current || !total || current <= total) return current;
  const currentText = String(current);
  const totalText = String(total);
  if (!currentText.endsWith(totalText) || currentText.length <= totalText.length) return current;
  const repaired = Number(currentText.slice(0, -totalText.length));
  return Number.isFinite(repaired) && repaired > 0 && repaired <= total ? repaired : current;
}

function getCurrentEpisode(movie: OPhimMovie, episodes: OPhimServer[]): number {
  let hasSourceEpisodeRows = false;
  const sourceTotal = Math.max(
    totalEpisodeNumber(movie.episode_current || ''),
    totalEpisodeNumber(movie.episode_total || ''),
  );
  const fromText = repairConcatenatedEpisodeNumber(firstEpisodeNumber(movie.episode_current || ''), sourceTotal);
  let fromEpisodes = 0;
  for (const server of episodes) {
    for (const ep of server.server_data || []) {
      hasSourceEpisodeRows = true;
      if (!hasPlayableEpisodeLink(ep)) continue;
      fromEpisodes = Math.max(fromEpisodes, episodeNumber(ep));
    }
  }
  if (hasSourceEpisodeRows) return fromEpisodes;
  if (!fromText && String(movie.episode_current || '').toLowerCase().includes('full')) return 1;
  return Math.max(fromText, fromEpisodes);
}

function safeProviderImage(value: unknown): string {
  const image = String(value || '').trim();
  if (!image || /^(?:data:|javascript:|about:|null$|undefined$)/i.test(image)) return '';
  return image;
}

function normalizeProviderImage(provider: ProviderConfig, value: unknown): string {
  const image = safeProviderImage(value);
  if (!image) return '';
  const repairKnownOphimPath = (url: string) => {
    const match = url.match(/^(https:\/\/(?:img\.ophimimg\.com|img\.ophim\.live))\/([^/?#]+)([?#].*)?$/i);
    if (!match) return url;
    return `${match[1]}/uploads/movies/${match[2]}${match[3] || ''}`;
  };
  if (/^https?:\/\//i.test(image)) return repairKnownOphimPath(image);
  if (/^\/\//.test(image)) {
    const absolute = `https:${image}`;
    const repaired = repairKnownOphimPath(absolute);
    return repaired === absolute ? image : repaired;
  }
  if (provider.sourceSite !== 'ophim') return image;
  return repairKnownOphimPath(`https://img.ophim.live/${image.replace(/^\/+/, '')}`);
}

function hasUsableMovieImage(...records: Array<Record<string, unknown> | null | undefined>): boolean {
  return records.some((record) => Boolean(
    safeProviderImage(record?.thumb_url) || safeProviderImage(record?.poster_url),
  ));
}

function isTrailerEpisode(episode: OPhimEpisode): boolean {
  return /\btrailer\b/i.test(`${String(episode.name || '')} ${String(episode.slug || '')} ${String(episode.filename || '')}`);
}

function detailHasPlayableEpisode(detail: ParsedDetail): boolean {
  return detail.episodes.some((server) => (server.server_data || []).some((episode) => (
    !isTrailerEpisode(episode)
    && Boolean(String(episode.link_m3u8 || '').trim() || String(episode.link_embed || '').trim())
  )));
}

function safeProviderEpisodeUrl(provider: ProviderConfig, value: unknown, kind: 'stream' | 'embed'): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    if (provider.sourceSite === 'vsmov' && kind === 'embed') {
      return /(^|\.)streamvsmov\.com$/i.test(url.hostname) && /^\/video\/[a-z0-9-]+\/?$/i.test(url.pathname)
        ? url.toString()
        : '';
    }
    if (provider.sourceSite === 'nguonc' && kind === 'embed') {
      return /^embed\d*\.streamc\.xyz$/i.test(url.hostname) && url.pathname === '/embed.php'
        ? url.toString()
        : '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

async function hasPersistedPlayableCoverage(supabase: SupabaseClient, movieId: string): Promise<boolean> {
  const [{ data: movieEpisodes }, { data: episodes }, { data: streams }] = await Promise.all([
    supabase.from('movie_episodes').select('source,server_name,slug,episode_number,link_m3u8,link_embed').eq('movie_id', movieId).limit(1000),
    supabase.from('episodes').select('server_name,episode_slug,episode_number,link_m3u8,link_embed').eq('movie_id', movieId).limit(1000),
    supabase.from('streams').select('is_active,server_name,episode_slug,stream_url,embed_url,health_status,failure_count,last_error').eq('movie_id', movieId).limit(2000),
  ]);

  const normalizeUrl = (value: unknown) => {
    const normalized = String(value || '').trim().replace(/&amp;/g, '&').replace(/\/+$/, '');
    return /^https?:\/\//i.test(normalized) ? normalized : '';
  };
  const streamRows = (streams || []) as Array<Record<string, unknown>>;
  const streamIsSuppressed = (row: Record<string, unknown>) => {
    if (row.is_active === false) return true;
    const status = String(row.health_status || '').trim().toLowerCase();
    const failures = Number(row.failure_count || 0);
    if (String(row.last_error || '').startsWith('Provider verification pending:')) return true;
    const embed = String(row.embed_url || '').trim();
    const browserManagedException =
      /https?:\/\/player\.phimapi\.com\/player\//i.test(embed)
      || /https?:\/\/[^/]*streamc\.xyz\//i.test(embed);
    if (status === 'blocked' && !browserManagedException) return true;
    return status === 'dead' || (status === 'failed' && failures >= 3);
  };
  const usableByUrl = new Map<string, boolean>();
  const usableByServerSlug = new Map<string, boolean>();
  for (const stream of streamRows) {
    const usable = !streamIsSuppressed(stream);
    for (const url of [stream.stream_url, stream.embed_url].map(normalizeUrl).filter(Boolean)) {
      usableByUrl.set(url, Boolean(usableByUrl.get(url)) || usable);
    }
    const server = String(stream.server_name || '').trim().toLowerCase();
    const slug = String(stream.episode_slug || '').trim().toLowerCase();
    if (server && slug) {
      const key = `${server}|${slug}`;
      usableByServerSlug.set(key, Boolean(usableByServerSlug.get(key)) || usable);
    }
  }
  const matchingHealthState = (
    row: Record<string, unknown>,
    directKey: string,
    embedKey: string,
    slugKey: string,
  ) => {
    const urls = [row[directKey], row[embedKey]].map(normalizeUrl).filter(Boolean);
    for (const url of urls) {
      if (usableByUrl.has(url)) return usableByUrl.get(url);
    }
    const server = String(row.server_name || '').trim().toLowerCase();
    const slug = String(row[slugKey] || '').trim().toLowerCase();
    const key = server && slug ? `${server}|${slug}` : '';
    return key && usableByServerSlug.has(key) ? usableByServerSlug.get(key) : undefined;
  };
  const legacyRowIsUsable = (
    row: Record<string, unknown>,
    directKey: string,
    embedKey: string,
    slugKey: string,
  ) => {
    if (!normalizeUrl(row[directKey]) && !normalizeUrl(row[embedKey])) return false;
    const healthState = matchingHealthState(row, directKey, embedKey, slugKey);
    return healthState === undefined || healthState;
  };

  return Boolean(
    (movieEpisodes || []).some((row) => (
      String(row.source || '').toLowerCase() !== 'hidden'
      && legacyRowIsUsable(row, 'link_m3u8', 'link_embed', 'slug')
    ))
    || (episodes || []).some((row) => legacyRowIsUsable(row, 'link_m3u8', 'link_embed', 'episode_slug'))
    || streamRows.some((row) => (
      row.is_active !== false
      && !streamIsSuppressed(row)
      && Boolean(normalizeUrl(row.stream_url) || normalizeUrl(row.embed_url))
    ))
  );
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

type MovieEpisodeUpsertRow = {
  movie_id: string;
  ophim_id: string;
  episode_number: number;
  episode_name: string;
  slug: string;
  server_name: string;
  link_m3u8: string;
  link_embed: string;
  thumbnail_url: string;
  duration: string;
  source: string;
  is_backup: boolean;
};

async function readCursorPage(supabase: SupabaseClient, key: string, fallbackPage: number): Promise<number> {
  try {
    const { data } = await supabase
      .from('sync_cursors')
      .select('page')
      .eq('key', key)
      .maybeSingle();
    const page = Number(data?.page || fallbackPage);
    return Number.isFinite(page) && page > 0 ? page : fallbackPage;
  } catch {
    return fallbackPage;
  }
}

async function writeCursorPage(supabase: SupabaseClient, key: string, page: number): Promise<void> {
  try {
    await supabase
      .from('sync_cursors')
      .upsert({ key, page, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  } catch {
    /* cursor is best-effort; sync should still succeed if cursor write fails */
  }
}

async function fetchJsonFromMirrors(provider: ProviderConfig, path: string, timeoutMs = 12000): Promise<Record<string, unknown> | null> {
  for (const base of provider.bases) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json,text/plain,*/*',
          'User-Agent': 'Mozilla/5.0 KhophimBot/1.0 (+https://khophim.org)',
        },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      return await res.json() as Record<string, unknown>;
    } catch {
      /* try next mirror */
    } finally {
      clearTimeout(timer);
    }
  }
  if (provider.sourceSite === 'nguonc') {
    const proxySecret = Deno.env.get('MOVIE_DETAIL_PROXY_SECRET') || '';
    if (!proxySecret) return null;
    let bridgeUrl = '';
    const detail = path.match(/^\/api\/film\/([a-z0-9-]+)$/i);
    const page = path.match(/^\/api\/films\/phim-moi-cap-nhat\?page=(\d+)$/i);
    const search = path.match(/^\/api\/films\/search\?keyword=(.+)$/i);
    if (detail) bridgeUrl = `https://movie-site-eds.pages.dev/internal/nguonc-detail?slug=${encodeURIComponent(detail[1])}`;
    if (page) bridgeUrl = `https://movie-site-eds.pages.dev/internal/nguonc-catalog?page=${encodeURIComponent(page[1])}`;
    if (search) bridgeUrl = `https://movie-site-eds.pages.dev/internal/nguonc-search?keyword=${search[1]}`;
    if (!bridgeUrl) return null;
    try {
      const response = await fetch(bridgeUrl, {
        headers: {
          Accept: 'application/json',
          'x-khophim-proxy-secret': proxySecret,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok || !/json/i.test(response.headers.get('content-type') || '')) return null;
      return await response.json() as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function providerListPaths(provider: ProviderConfig, page: number): string[] {
  const primary = provider.listPath(page);
  if (provider.sourceSite !== 'phimapi') return [primary];
  return Array.from(new Set([
    primary,
    `/v1/api/danh-sach/phim-moi-cap-nhat?page=${page}`,
    `/v1/api/danh-sach/phim-moi-cap-nhat?page=${page}&sort_field=modified.time&sort_type=desc`,
    `/danh-sach/phim-moi-cap-nhat-v3?page=${page}`,
    `/v1/api/danh-sach/phim-moi-cap-nhat-v3?page=${page}`,
  ]));
}

function nguoncCategoryValues(movie: Record<string, unknown>, groupName: string): Array<Record<string, unknown>> {
  const groups = movie.category && typeof movie.category === 'object'
    ? Object.values(movie.category as Record<string, unknown>)
    : [];
  const wanted = normalizeText(groupName);
  for (const entry of groups) {
    const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const group = row.group && typeof row.group === 'object' ? row.group as Record<string, unknown> : {};
    if (normalizeText(String(group.name || '')) !== wanted) continue;
    return (Array.isArray(row.list) ? row.list : [])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  return [];
}

function adaptNguoncDetail(payload: DetailPayload, fallbackSlug: string): DetailPayload {
  const rawMovie = payload.movie && typeof payload.movie === 'object'
    ? payload.movie as unknown as Record<string, unknown>
    : {};
  const format = nguoncCategoryValues(rawMovie, 'Định dạng')
    .map((item) => normalizeText(String(item.name || '')));
  const type = format.some((name) => name.includes('phim bo') || name.includes('tv show')) ? 'series' : 'single';
  const year = Number(rawMovie.year || nguoncCategoryValues(rawMovie, 'Năm')[0]?.name || 0) || 0;
  const categories = nguoncCategoryValues(rawMovie, 'Thể loại');
  const countries = nguoncCategoryValues(rawMovie, 'Quốc gia');
  const rawEpisodes = Array.isArray(rawMovie.episodes) ? rawMovie.episodes : [];
  const episodes: OPhimServer[] = rawEpisodes.map((server) => {
    const row = server && typeof server === 'object' ? server as Record<string, unknown> : {};
    return {
      server_name: String(row.server_name || 'Vietsub'),
      server_data: (Array.isArray(row.items) ? row.items : []).map((item) => {
        const episode = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        const rawEmbed = String(episode.embed || '');
        let linkEmbed = '';
        try {
          const parsed = new URL(rawEmbed);
          if (
            parsed.protocol === 'https:' &&
            /^embed\d*\.streamc\.xyz$/i.test(parsed.hostname) &&
            parsed.pathname === '/embed.php'
          ) linkEmbed = parsed.toString();
        } catch {
          linkEmbed = '';
        }
        return {
          name: String(episode.name || ''),
          slug: String(episode.slug || ''),
          filename: String(episode.name || ''),
          link_embed: linkEmbed,
          link_m3u8: '',
        };
      }),
    };
  });
  const current = String(rawMovie.current_episode || '');
  const total = String(rawMovie.total_episodes || '');
  const movie: OPhimMovie = {
    _id: String(rawMovie.id || ''),
    id: String(rawMovie.id || ''),
    name: String(rawMovie.name || fallbackSlug),
    origin_name: String(rawMovie.original_name || ''),
    slug: String(rawMovie.slug || fallbackSlug),
    content: String(rawMovie.description || ''),
    type,
    status: format.some((name) => name.includes('hoan tat')) ? 'completed' : 'ongoing',
    thumb_url: String(rawMovie.thumb_url || ''),
    poster_url: String(rawMovie.poster_url || ''),
    time: String(rawMovie.time || ''),
    episode_current: current,
    episode_total: total,
    quality: String(rawMovie.quality || 'HD'),
    lang: String(rawMovie.language || 'Vietsub'),
    year,
    actor: String(rawMovie.casts || '').split(',').map((value) => value.trim()).filter(Boolean),
    director: String(rawMovie.director || '').split(',').map((value) => value.trim()).filter(Boolean),
    category: categories.map((item) => ({ id: String(item.id || ''), name: String(item.name || ''), slug: slugify(String(item.name || '')) })),
    country: countries.map((item) => ({ id: String(item.id || ''), name: String(item.name || ''), slug: slugify(String(item.name || '')) })),
    modified: { time: String(rawMovie.modified || new Date().toISOString()) },
  };
  return { status: payload.status, movie, episodes };
}

async function fetchListPage(provider: ProviderConfig, page: number): Promise<Record<string, unknown> | null> {
  for (const path of providerListPaths(provider, page)) {
    const payload = await fetchJsonFromMirrors(provider, path, provider.sourceSite === 'phimapi' ? 18000 : 12000);
    if (listItems(payload).length > 0) return payload;
  }
  return null;
}

function listItems(payload: Record<string, unknown> | null): OPhimMovie[] {
  if (!payload) return [];
  if (isProviderErrorPayload(payload)) return [];
  const data = payload.data as Record<string, unknown> | undefined;
  const items = (data?.items || payload.items || []) as unknown[];
  return items.filter((item): item is OPhimMovie => Boolean(item && typeof item === 'object'));
}

function isProviderErrorPayload(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const status = Number(payload.status || payload.error_code || 0);
  const text = JSON.stringify(payload).toLowerCase();
  return (
    status >= 400 ||
    text.includes('error 521') ||
    text.includes('web server is down') ||
    text.includes('cloudflare') ||
    text.includes('origin_down') ||
    text.includes('temporarily unavailable')
  );
}

function parseDetail(provider: ProviderConfig, payload: DetailPayload | null, fallbackSlug: string): ParsedDetail | null {
  if (!payload) return null;
  if (isProviderErrorPayload(payload as Record<string, unknown>)) return null;
  const adapted = provider.adapter === 'nguonc' ? adaptNguoncDetail(payload, fallbackSlug) : payload;
  const item = adapted.data?.item || adapted.item || adapted.movie || null;
  if (!item) return null;
  const episodes = adapted.data?.item?.episodes || adapted.item?.episodes || adapted.episodes || [];
  const movie = { ...item, slug: item.slug || fallbackSlug };
  const normalized = normalizeVerifiedSeasonNumbering(
    movie as Record<string, unknown>,
    (Array.isArray(episodes) ? episodes : []) as OPhimServer[],
  );
  return {
    movie: normalized.movie as OPhimMovie,
    episodes: normalized.episodes as OPhimServer[],
    numberingNormalization: normalized.normalization,
  };
}

async function fetchDetail(provider: ProviderConfig, slug: string): Promise<ParsedDetail | null> {
  const payload = await fetchJsonFromMirrors(provider, provider.detailPath(slug));
  return parseDetail(provider, payload as DetailPayload | null, slug);
}

interface TargetMovieIdentity {
  id: string;
  slug: string;
  name?: string | null;
  origin_name?: string | null;
  title_vi?: string | null;
  title_en?: string | null;
  title_original?: string | null;
  year?: number | null;
  type?: string | null;
  tmdb_id?: number | string | null;
  ophim_slug?: string | null;
  source_site?: string | null;
  source_name?: string | null;
}

function sourceCandidateScore(item: OPhimMovie, target: TargetMovieIdentity): number {
  const targetNames = [target.name, target.origin_name, target.title_vi, target.title_en, target.title_original]
    .map((value) => slugify(String(value || '')))
    .filter(Boolean);
  const itemNames = [item.name, item.origin_name, ...(Array.isArray(item.alternative_names) ? item.alternative_names : [])]
    .map((value) => slugify(String(value || '')))
    .filter(Boolean);
  const exactName = itemNames.some((name) => targetNames.includes(name));
  const partialName = itemNames.some((name) => targetNames.some((targetName) =>
    name.length >= 5 && targetName.length >= 5 && (name.includes(targetName) || targetName.includes(name))
  ));
  if (!exactName && !partialName) return 0;

  let score = exactName ? 120 : 70;
  const itemYear = Number(item.year || 0);
  const targetYear = Number(target.year || 0);
  if (itemYear && targetYear) score += itemYear === targetYear ? 35 : -100;

  const itemTmdbId = String((item.tmdb as Record<string, unknown> | undefined)?.id || '');
  if (itemTmdbId && target.tmdb_id && itemTmdbId === String(target.tmdb_id)) score += 250;
  return score;
}

function isSafeTargetDetail(
  provider: ProviderConfig,
  target: TargetMovieIdentity,
  detail: ParsedDetail,
): boolean {
    const movie = detail.movie as Record<string, unknown>;
    const targetTmdb = String(target.tmdb_id || '').trim();
    const detailTmdbObject = movie.tmdb && typeof movie.tmdb === 'object'
      ? movie.tmdb as Record<string, unknown>
      : null;
    const detailTmdb = String(movie.tmdb_id || detailTmdbObject?.id || '').trim();
    const targetYear = Number(target.year || 0) || 0;
    const detailYear = Number(movie.year || 0) || 0;
    const targetType = normalizedMovieType(target.type);
    const detailType = normalizedMovieType(movie.type);
    if (targetType && detailType && targetType !== detailType) return false;

    const targetTitles = [target.name, target.origin_name, target.title_vi, target.title_en, target.title_original]
      .map((value) => slugify(String(value || '')))
      .filter(Boolean);
    const detailTitles = [movie.name, movie.origin_name, movie.title_vi, movie.title_en, movie.title_original]
      .map((value) => slugify(String(value || '')))
      .filter(Boolean);
    const exactTitle = detailTitles.some((title) => targetTitles.includes(title));
    const exactSourceSlug = slugify(movie.slug) === slugify(target.slug);
    // NguonC and OPhim occasionally assign a premiere to adjacent calendar
    // years. An exact slug + exact title + exact type is a safe, narrow bridge;
    // unrelated titles and larger year drift remain rejected.
    if (
      provider.sourceSite === 'nguonc'
      && exactSourceSlug
      && exactTitle
      && targetType
      && detailType === targetType
      && targetYear > 0
      && detailYear > 0
      && Math.abs(targetYear - detailYear) <= 1
    ) return true;

    // A matching TMDB id is authoritative, except that a different release
    // year must not cross-wire separate seasons sharing one series-level id.
    if (targetTmdb && detailTmdb && targetTmdb === detailTmdb) {
      return !(targetYear > 0 && detailYear > 0 && targetYear !== detailYear);
    }

    // Without a shared external id, require both an exact normalized title
    // and matching year. A similar name or a shared slug alone is never
    // sufficient to attach another provider's episodes to this movie.
    if (!(targetYear > 0 && detailYear > 0 && targetYear === detailYear)) return false;
    return exactTitle;
}

async function fetchDetailForTarget(
  provider: ProviderConfig,
  target: TargetMovieIdentity,
): Promise<ParsedDetail | null> {

  const directSlugs = [...new Set([target.ophim_slug, target.slug].map((value) => String(value || '').trim()).filter(Boolean))];
  for (const slug of directSlugs) {
    const detail = await fetchDetail(provider, slug);
    if (detail && isSafeTargetDetail(provider, target, detail)) return detail;
  }

  const queries = [...new Set([
    target.origin_name,
    target.title_original,
    target.title_en,
    target.name,
    target.title_vi,
  ].map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 3);

  const ranked = new Map<string, { item: OPhimMovie; score: number }>();
  for (const query of queries) {
    try {
      const payload = await fetchJsonFromMirrors(provider, provider.searchPath(query));
      for (const item of listItems(payload)) {
        const score = sourceCandidateScore(item, target);
        const previous = ranked.get(String(item.slug || ''));
        if (item.slug && score >= 100 && (!previous || score > previous.score)) {
          ranked.set(item.slug, { item, score });
        }
      }
    } catch {
      // Another title alias or provider mirror may still resolve the movie.
    }
  }

  const candidates = [...ranked.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  for (const candidate of candidates) {
    const detail = await fetchDetail(provider, String(candidate.item.slug || ''));
    if (detail && isSafeTargetDetail(provider, target, detail)) return detail;
  }
  return null;
}

function moviePayload(provider: ProviderConfig, detail: ParsedDetail): Record<string, unknown> {
  const movie = detail.movie;
  const now = new Date().toISOString();
  const name = String(movie.name || movie.slug || 'Phim');
  const originName = String(movie.origin_name || '');
  const slug = String(movie.slug || slugify(name));
  const currentEpisode = getCurrentEpisode(movie, detail.episodes);
  const hasSourceEpisodeRows = detail.episodes.some((server) => (server.server_data || []).length > 0);
  const sourceAdvertisedTotal = Math.max(
    totalEpisodeNumber(movie.episode_current || ''),
    totalEpisodeNumber(movie.episode_total || ''),
  );
  const totalEpisode = Math.max(currentEpisode, sourceAdvertisedTotal);
  const rawCurrent = firstEpisodeNumber(movie.episode_current || '');
  const sourceCurrentLooksClean = rawCurrent > 0 && rawCurrent === currentEpisode;
  const thumbUrl = normalizeProviderImage(provider, movie.thumb_url);
  const posterUrl = normalizeProviderImage(provider, movie.poster_url) || thumbUrl;

  return {
    slug,
    ophim_slug: provider.trackOphimIdentity ? slug : null,
    ophim_id: provider.trackOphimIdentity ? String(movie._id || movie.id || '') : '',
    name,
    origin_name: originName,
    title_vi: name,
    title_en: originName,
    title_original: originName || name,
    normalized_name: slugify([name, originName].filter(Boolean).join(' ')),
    content: String(movie.content || ''),
    type: String(movie.type || 'phim-le'),
    status: String(movie.status || 'ongoing'),
    thumb_url: thumbUrl,
    poster_url: posterUrl,
    trailer_url: String(movie.trailer_url || ''),
    time: String(movie.time || ''),
    episode_current: sourceCurrentLooksClean ? String(movie.episode_current || '') : (currentEpisode ? `Tập ${currentEpisode}` : 'Đang cập nhật'),
    episode_total: String(movie.episode_total || ''),
    current_episode: currentEpisode || null,
    total_episodes: totalEpisode || currentEpisode || null,
    quality: String(movie.quality || 'HD'),
    lang: String(movie.lang || 'Vietsub'),
    notify: String(movie.notify || ''),
    showtimes: String(movie.showtimes || ''),
    year: Number(movie.year || 0) || null,
    actor: Array.isArray(movie.actor) ? movie.actor : [],
    director: Array.isArray(movie.director) ? movie.director : [],
    category: Array.isArray(movie.category) ? movie.category : [],
    country: Array.isArray(movie.country) ? movie.country : [],
    source_site: provider.sourceSite,
    source_name: provider.sourceName,
    is_published: true,
    last_synced_at: now,
    updated_at: movie.modified?.time || now,
  };
}

function providerSlugPrefix(sourceSite: unknown): string {
  const normalized = String(sourceSite || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'provider';
}

async function findExistingMovie(
  supabase: SupabaseClient,
  provider: ProviderConfig,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const providerSlug = String(payload.ophim_slug || payload.slug || '').trim();
  if (providerSlug) {
    const { data: resolved, error: resolveError } = await supabase.rpc('resolve_canonical_movie', {
      p_provider: provider.sourceSite,
      p_provider_slug: providerSlug,
      p_provider_id: String(payload.ophim_id || providerSlug),
      p_tmdb_id: Number(payload.tmdb_id || 0) || null,
      p_imdb_id: String(payload.imdb_id || ''),
      p_original_title: String(payload.title_original || payload.origin_name || ''),
      p_localized_title: String(payload.title_vi || payload.name || ''),
      p_year: Number(payload.year || 0) || null,
      p_movie_type: String(payload.type || ''),
      p_season: null,
      p_create_slug: String(payload.slug || providerSlug),
      p_source_name: provider.sourceName,
    });
    if (resolveError) throw new Error(`canonical resolver ${provider.sourceSite}:${providerSlug}: ${resolveError.message}`);
    const resolvedId = String(Array.isArray(resolved) ? resolved[0]?.movie_id || '' : '');
    if (resolvedId) {
      const { data: canonical, error: canonicalError } = await supabase
        .from('movies')
        .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,type,source_site,source_name,current_episode,total_episodes,episode_current,episode_total,thumb_url,poster_url,tmdb_id,ophim_id,ophim_slug,is_published')
        .eq('id', resolvedId)
        .maybeSingle();
      if (canonicalError) throw new Error(`canonical movie lookup ${resolvedId}: ${canonicalError.message}`);
      if (canonical?.id) return canonical as Record<string, unknown>;
    }
  }
  const checks = [
    ['slug', payload.slug],
    ['ophim_slug', payload.ophim_slug],
    ['ophim_id', payload.ophim_id],
  ].filter(([, value]) => String(value || '').trim());

  let exactMatch: Record<string, unknown> | null = null;
  for (const [column, value] of checks) {
    const { data } = await supabase
      .from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,type,source_site,source_name,current_episode,total_episodes,episode_current,episode_total,thumb_url,poster_url,tmdb_id,ophim_id,ophim_slug,is_published')
      .eq(column as string, value as string)
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      exactMatch = data as Record<string, unknown>;
      break;
    }
  }
  if (isCuratedCatalogMovie(exactMatch)) {
    const providerIdentity = String(payload.ophim_slug || '').trim();
    if (providerIdentity) {
      const { data: identityMatch } = await supabase
        .from('movies')
        .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,type,source_site,source_name,current_episode,total_episodes,episode_current,episode_total,thumb_url,poster_url,tmdb_id,ophim_id,ophim_slug,is_published')
        .eq('ophim_slug', providerIdentity)
        .limit(1)
        .maybeSingle();
      exactMatch = identityMatch && !isCuratedCatalogMovie(identityMatch as Record<string, unknown>)
        ? identityMatch as Record<string, unknown>
        : null;
    } else {
      exactMatch = null;
    }
    if (!exactMatch) {
      const providerPrefix = providerSlugPrefix(payload.source_site);
      payload.slug = `${providerPrefix}-${String(payload.slug || 'movie')}`;
    }
  }

  if (exactMatch) {
    const sameProviderSlug =
      String(exactMatch.source_site || '').toLowerCase() === String(payload.source_site || '').toLowerCase()
      && String(exactMatch.slug || '') === String(payload.slug || '');
    // Exact provider identity is authoritative. Returning here avoids two
    // broad title scans for virtually every repeat/backfill update.
    if (
      sameMovieByStableProviderIdentity(exactMatch, payload)
      || sameProviderSlug
      || sameMovieByTitle(exactMatch, payload)
    ) return exactMatch;
  }

  const normalized = String(payload.normalized_name || '').trim();
  const year = Number(payload.year || 0);
  if (normalized.length >= 6 && year > 0) {
    const { data } = await supabase
      .from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,type,source_site,source_name,current_episode,total_episodes,episode_current,episode_total,thumb_url,poster_url,tmdb_id,ophim_id,ophim_slug,is_published')
      .eq('year', year)
      .eq('normalized_name', normalized)
      .limit(10);
    const match = ((data || []) as Record<string, unknown>[])
      .filter((row) => !isCuratedCatalogMovie(row))
      .filter((row) => sameMovieByTitle(row, payload))
      .sort((a, b) => canonicalCandidateScore(b) - canonicalCandidateScore(a))[0];
    if (match?.id) return match;
  }

  const title = String(payload.origin_name || payload.name || '').trim();
  if (title.length >= 3 && year > 0) {
    const safe = escapePostgrestIlike(title);
    const { data } = await supabase
      .from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,type,source_site,source_name,current_episode,total_episodes,episode_current,episode_total,thumb_url,poster_url,tmdb_id,ophim_id,ophim_slug,is_published')
      .eq('year', year)
      .or(`name.ilike.%${safe}%,origin_name.ilike.%${safe}%,title_vi.ilike.%${safe}%,title_en.ilike.%${safe}%,title_zh.ilike.%${safe}%,title_original.ilike.%${safe}%`)
      .limit(20);
    const matches = ((data || []) as Record<string, unknown>[])
      .filter((row) => !isCuratedCatalogMovie(row))
      .filter((row) => sameMovieByTitle(row, payload))
      .sort((a, b) => canonicalCandidateScore(b) - canonicalCandidateScore(a));
    const match = matches[0];
    if (
      match?.id &&
      (!exactMatch || String(match.id) === String(exactMatch.id) ||
        canonicalCandidateScore(match) >= canonicalCandidateScore(exactMatch) + 40)
    ) return match;
  }

  if (normalized.length >= 6 && year > 0) {
    const { data } = await supabase
      .from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,type,source_site,source_name,current_episode,total_episodes,episode_current,episode_total,thumb_url,poster_url,tmdb_id,ophim_id,ophim_slug,is_published')
      .eq('year', year)
      .ilike('normalized_name', normalized)
      .limit(10);
    const match = ((data || []) as Record<string, unknown>[])
      .filter((row) => !isCuratedCatalogMovie(row))
      .filter((row) => sameMovieByTitle(row, payload))
      .sort((a, b) => sourcePriority(b) - sourcePriority(a))[0];
    if (
      match?.id &&
      (!exactMatch || String(match.id) === String(exactMatch.id) ||
        canonicalCandidateScore(match) >= canonicalCandidateScore(exactMatch) + 40)
    ) return match;
  }
  if (exactMatch && (sameMovieByTitle(exactMatch, payload) || sameMovieByStableProviderIdentity(exactMatch, payload))) return exactMatch;
  if (exactMatch) {
    const providerPrefix = providerSlugPrefix(payload.source_site);
    payload.slug = `${providerPrefix}-${String(payload.slug || 'movie')}`;
  }
  return null;
}

async function findMovieByProviderUniqueIdentity(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  // Under connection pressure an earlier best-effort identity lookup can be
  // canceled. If the insert then reports a unique conflict, resolve the exact
  // provider identity directly instead of retrying the same broad title scan.
  const checks = [
    ['ophim_slug', payload.ophim_slug],
    ['ophim_id', payload.ophim_id],
  ].filter(([, value]) => String(value || '').trim());

  for (const [column, value] of checks) {
    const result = await runDatabaseMutationWithRetry(() => supabase
      .from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,type,source_site,source_name,current_episode,total_episodes,episode_current,episode_total,thumb_url,poster_url,tmdb_id,ophim_id,ophim_slug,is_published')
      .eq(column as string, value as string)
      .limit(1)
      .maybeSingle());
    if (result.data?.id) return result.data as Record<string, unknown>;
  }
  return null;
}

function updatePayloadForExisting(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const source = `${existing.source_site || ''} ${existing.source_name || ''}`.toLowerCase();
  const managed = source.includes('admin') || source.includes('blvietsub') || source.includes('supabase');
  const existingTotal = Math.max(
    Number(existing.total_episodes || 0),
    totalEpisodeNumber(String(existing.episode_total || '')),
    totalEpisodeNumber(String(existing.episode_current || '')),
  );
  const current = Math.max(
    repairConcatenatedEpisodeNumber(Number(existing.current_episode || 0), existingTotal),
    repairConcatenatedEpisodeNumber(firstEpisodeNumber(String(existing.episode_current || '')), existingTotal),
  );
  const incomingCurrent = Number(incoming.current_episode || 0);
  const incomingTotal = Math.max(
    Number(incoming.total_episodes || 0),
    totalEpisodeNumber(String(incoming.episode_total || '')),
    totalEpisodeNumber(String(incoming.episode_current || '')),
  );
  const existingLooksAheadOfSource =
    incomingCurrent > 0 &&
    current > incomingCurrent &&
    existingTotal > 0 &&
    incomingTotal > 0 &&
    current > Math.max(existingTotal, incomingTotal);
  const exactProviderIdentity = Boolean(
    (existing.ophim_id && incoming.ophim_id && String(existing.ophim_id) === String(incoming.ophim_id))
    || (existing.ophim_slug && incoming.ophim_slug && String(existing.ophim_slug) === String(incoming.ophim_slug))
    || (existing.slug && incoming.slug && String(existing.slug) === String(incoming.slug))
  );
  const authoritativeCompletedSingle =
    !managed &&
    exactProviderIdentity &&
    ['single', 'phim-le'].includes(String(incoming.type || '').toLowerCase()) &&
    incomingCurrent === 1 &&
    incomingTotal === 1 &&
    /\bfull\b|hoan\s*(?:tat|thanh)|completed/i.test(String(incoming.episode_current || ''));
  const mergedCurrent = (authoritativeCompletedSingle
    ? 1
    : existingLooksAheadOfSource
      ? incomingCurrent
      : Math.max(current, incomingCurrent)) || null;
  const mergedTotal = authoritativeCompletedSingle
    ? 1
    : Math.max(existingTotal, incomingTotal, Number(mergedCurrent || 0)) || null;

  if (!managed) {
    const update = {
      ...incoming,
      current_episode: mergedCurrent,
      total_episodes: mergedTotal,
      episode_current: authoritativeCompletedSingle || incomingCurrent > current ? incoming.episode_current : existing.episode_current || incoming.episode_current,
      episode_total: authoritativeCompletedSingle || incomingTotal >= existingTotal ? incoming.episode_total : existing.episode_total || incoming.episode_total,
    };
    // A previous run may have created the movie but timed out before writing
    // its episodes. Metadata refreshes must not publish that incomplete row.
    if (existing.is_published === false) update.is_published = false;
    return update;
  }

  return {
    ophim_id: incoming.ophim_id,
    ophim_slug: incoming.ophim_slug,
    last_synced_at: incoming.last_synced_at,
    updated_at: incoming.updated_at,
    current_episode: mergedCurrent,
    total_episodes: mergedTotal,
    episode_current: incomingCurrent > current ? incoming.episode_current : existing.episode_current,
    episode_total: incomingTotal >= existingTotal ? incoming.episode_total : existing.episode_total,
  };
}

function protectExistingSlug(existing: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const existingSlug = String(existing.slug || '').trim();
  const incomingSlug = String(update.slug || '').trim();
  if (existingSlug && incomingSlug && existingSlug !== incomingSlug) {
    const safeUpdate = { ...update };
    delete safeUpdate.slug;
    return safeUpdate;
  }
  return update;
}

async function removeConflictingUniqueIdentityFields(
  supabase: SupabaseClient,
  existingId: unknown,
  update: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const safeUpdate = { ...update };
  const currentId = String(existingId || '').trim();
  if (!currentId) return safeUpdate;

  const checks: Array<[string, unknown]> = [
    ['ophim_slug', safeUpdate.ophim_slug],
    ['ophim_id', safeUpdate.ophim_id],
    ['tmdb_id', safeUpdate.tmdb_id],
    ['imdb_id', safeUpdate.imdb_id],
  ];

  for (const [column, rawValue] of checks) {
    const value = String(rawValue || '').trim();
    if (!value) continue;
    const { data, error } = await supabase
      .from('movies')
      .select('id')
      .eq(column, value)
      .neq('id', currentId)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) delete safeUpdate[column];
  }

  return safeUpdate;
}

async function upsertMovie(
  supabase: SupabaseClient,
  provider: ProviderConfig,
  detail: ParsedDetail,
): Promise<{ id: string; created: boolean; updated: boolean; hasImage: boolean; retired?: boolean }> {
  const payload = moviePayload(provider, detail);
  const existing = await findExistingMovie(supabase, provider, payload);

  if (existing?.id) {
    const existingSource = `${existing.source_site || ''} ${existing.source_name || ''}`.toLowerCase();
    if (existing.is_published === false && existingSource.includes('merged')) {
      return { id: String(existing.id), created: false, updated: false, hasImage: hasUsableMovieImage(existing, payload), retired: true };
    }
    if (
      provider.trackOphimIdentity &&
      sameMovieByStableProviderIdentity(existing, payload) &&
      Number(existing.year || 0) > 0 &&
      Number(existing.year) !== Number(payload.year || 0)
    ) payload.year = existing.year;
    let update = protectExistingSlug(existing, updatePayloadForExisting(existing, payload));
    if (!provider.trackOphimIdentity) {
      if (existing.ophim_id) delete update.ophim_id;
      if (existing.ophim_slug) delete update.ophim_slug;
      if (existing.source_site && String(existing.source_site) !== provider.sourceSite) {
        delete update.source_site;
        delete update.source_name;
      }
    }
    update = await removeConflictingUniqueIdentityFields(supabase, existing.id, update);
    const { error } = await runDatabaseMutationWithRetry(
      () => supabase.from('movies').update(update).eq('id', existing.id as string),
    );
    if (error) {
      if (isDuplicateError(error) && (update.ophim_id || update.ophim_slug)) {
        const retryUpdate = { ...update };
        delete retryUpdate.ophim_id;
        delete retryUpdate.ophim_slug;
        delete retryUpdate.slug;
        const { error: retryError } = await runDatabaseMutationWithRetry(
          () => supabase.from('movies').update(retryUpdate).eq('id', existing.id as string),
        );
        if (!retryError) return { id: String(existing.id), created: false, updated: true, hasImage: hasUsableMovieImage(existing, payload) };
        throw new Error(`movies update ${payload.slug}: ${dbErrorMessage(retryError)}`);
      }
      throw new Error(`movies update ${payload.slug}: ${dbErrorMessage(error)}`);
    }
    return { id: String(existing.id), created: false, updated: true, hasImage: hasUsableMovieImage(existing, payload) };
  }

  // A detail sync may time out after the catalogue row is created. Keep a new
  // record private until insertEpisodes has persisted a playable source.
  const { data, error } = await supabase
    .from('movies')
    .insert({ ...payload, is_published: false })
    .select('id')
    .single();
  if (error) {
    if (isDuplicateError(error)) {
      const duplicate = await findMovieByProviderUniqueIdentity(supabase, payload)
        || await findExistingMovie(supabase, provider, payload);
      if (duplicate?.id) {
        const update = protectExistingSlug(duplicate, updatePayloadForExisting(duplicate, payload));
        const { error: updateError } = await runDatabaseMutationWithRetry(
          () => supabase.from('movies').update(update).eq('id', duplicate.id as string),
        );
        if (!updateError) return { id: String(duplicate.id), created: false, updated: true, hasImage: hasUsableMovieImage(duplicate, payload) };
        throw new Error(`movies insert duplicate update ${payload.slug}: ${dbErrorMessage(updateError)}`);
      }
    }
    throw new Error(`movies insert ${payload.slug}: ${dbErrorMessage(error)}`);
  }
  return { id: String(data.id), created: true, updated: false, hasImage: hasUsableMovieImage(payload) };
}

async function upsertMovieEpisodeRowsSafely(
  supabase: SupabaseClient,
  rows: MovieEpisodeUpsertRow[],
  movieSlug: string,
): Promise<void> {
  for (const batch of chunks(rows, 500)) {
    const { error } = await supabase
      .from('movie_episodes')
      .upsert(batch, { onConflict: 'movie_id,server_name,episode_number' });
    if (!error) continue;
    if (!isDuplicateError(error)) throw new Error(`movie_episodes upsert ${movieSlug}: ${error.message}`);

    for (const row of batch) {
      const serverName = String(row.server_name || '').trim();
      const { data: existing, error: existingError } = await supabase
        .from('movie_episodes')
        .select('id')
        .eq('movie_id', row.movie_id)
        .eq('episode_number', row.episode_number)
        .ilike('server_name', serverName)
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(`movie_episodes duplicate lookup ${movieSlug}: ${existingError.message}`);

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('movie_episodes')
          .update({
            ophim_id: row.ophim_id,
            episode_name: row.episode_name,
            slug: row.slug,
            server_name: serverName,
            link_m3u8: row.link_m3u8,
            link_embed: row.link_embed,
            thumbnail_url: row.thumbnail_url,
            duration: row.duration,
            source: row.source,
            is_backup: row.is_backup,
          })
          .eq('id', existing.id);
        if (updateError) throw new Error(`movie_episodes duplicate update ${movieSlug}: ${updateError.message}`);
        continue;
      }

      const { error: insertError } = await supabase.from('movie_episodes').insert(row);
      if (insertError && !isDuplicateError(insertError)) {
        throw new Error(`movie_episodes insert ${movieSlug}: ${insertError.message}`);
      }
    }
  }
}

async function upsertStreamRowsSafely(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  movieSlug: string,
): Promise<void> {
  for (const batch of chunks(rows, 500)) {
    const { error } = await supabase
      .from('streams')
      .upsert(batch, { onConflict: 'movie_id,episode_slug,source,server_name' });
    if (!error) continue;
    if (!isDuplicateError(error)) throw new Error(`streams upsert ${movieSlug}: ${error.message}`);

    for (const row of batch) {
      const serverName = String(row.server_name || '').trim();
      const episodeSlug = String(row.episode_slug || '').trim();
      const source = String(row.source || '').trim();
      const { data: existing, error: existingError } = await supabase
        .from('streams')
        .select('id')
        .eq('movie_id', row.movie_id as string)
        .eq('source', source)
        .ilike('server_name', serverName)
        .ilike('episode_slug', episodeSlug)
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(`streams duplicate lookup ${movieSlug}: ${existingError.message}`);

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('streams')
          .update({
            ophim_id: row.ophim_id,
            server_name: serverName,
            episode_slug: episodeSlug,
            stream_url: row.stream_url,
            embed_url: row.embed_url,
            source,
            is_active: row.is_active,
            health_status: row.health_status,
            failure_count: row.failure_count,
            last_error: row.last_error,
            last_checked_at: row.last_checked_at,
          })
          .eq('id', existing.id);
        if (updateError) throw new Error(`streams duplicate update ${movieSlug}: ${updateError.message}`);
        continue;
      }

      const { error: insertError } = await supabase.from('streams').insert(row);
      if (insertError && !isDuplicateError(insertError)) {
        throw new Error(`streams insert ${movieSlug}: ${insertError.message}`);
      }
    }
  }
}

async function upsertEpisodeRowsSafely(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  movieSlug: string,
): Promise<void> {
  for (const batch of chunks(rows, 500)) {
    const { error } = await supabase
      .from('episodes')
      .upsert(batch, { onConflict: 'movie_id,server_name,episode_slug' });
    if (!error) continue;
    if (!isDuplicateError(error)) throw new Error(`episodes upsert ${movieSlug}: ${error.message}`);

    // The database also enforces a normalized lower(trim(...)) identity. A
    // provider can change only letter casing/whitespace and make the regular
    // onConflict target miss that row. Resolve against the normalized key
    // instead of failing the whole movie sync and leaving later episodes stale.
    for (const row of batch) {
      const serverName = String(row.server_name || '').trim();
      const episodeSlug = String(row.episode_slug || '').trim();
      const { data: existing, error: existingError } = await supabase
        .from('episodes')
        .select('id')
        .eq('movie_id', row.movie_id as string)
        .ilike('server_name', serverName)
        .ilike('episode_slug', episodeSlug)
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(`episodes duplicate lookup ${movieSlug}: ${existingError.message}`);

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('episodes')
          .update({
            ophim_id: row.ophim_id,
            server_name: serverName,
            episode_number: row.episode_number,
            episode_name: row.episode_name,
            episode_slug: episodeSlug,
            link_m3u8: row.link_m3u8,
            link_embed: row.link_embed,
            server_data: row.server_data,
          })
          .eq('id', existing.id);
        if (updateError) throw new Error(`episodes duplicate update ${movieSlug}: ${updateError.message}`);
        continue;
      }

      const { error: insertError } = await supabase.from('episodes').insert(row);
      if (insertError && !isDuplicateError(insertError)) {
        throw new Error(`episodes insert ${movieSlug}: ${insertError.message}`);
      }
    }
  }
}

function bulkProviderCatalogItem(provider: ProviderConfig, detail: ParsedDetail): Record<string, unknown> {
  const rawSourceId = String(detail.movie._id || detail.movie.id || detail.movie.slug || '');
  const providerId = `${provider.sourceSite}:${rawSourceId}`.slice(0, 240);
  const episodes: Record<string, unknown>[] = [];

  for (const server of detail.episodes) {
    const sourceServerName = String(server.server_name || provider.sourceName).trim() || provider.sourceName;
    // Independent provider labels are stable across canonical movie merges and
    // can never overwrite another provider's same-named server.
    const serverName = `${provider.sourceName} - ${sourceServerName}`;
    for (const episode of server.server_data || []) {
      if (isTrailerEpisode(episode)) continue;
      const number = episodeNumber(episode);
      const name = String(episode.name || (number === 1 ? 'Full' : `Tap ${number}`));
      const slug = String(episode.slug || slugify(name)).trim() || slugify(name);
      const linkM3u8 = safeProviderEpisodeUrl(provider, episode.link_m3u8, 'stream');
      const linkEmbed = safeProviderEpisodeUrl(provider, episode.link_embed, 'embed');
      if (!linkM3u8 && !linkEmbed) continue;
      episodes.push({
        number,
        name,
        slug,
        server_name: serverName,
        link_m3u8: linkM3u8,
        link_embed: linkEmbed,
        raw: episode,
      });
    }
  }

  return {
    provider_slug: String(detail.movie.slug || ''),
    provider_id: providerId,
    movie: moviePayload(provider, detail),
    episodes,
  };
}

async function insertEpisodes(
  supabase: SupabaseClient,
  provider: ProviderConfig,
  movieId: string,
  detail: ParsedDetail,
  labelAsBackup = false,
): Promise<number> {
  const rawSourceId = String(detail.movie._id || detail.movie.id || detail.movie.slug || '');
  const sourceId = provider.trackOphimIdentity ? rawSourceId : `${provider.sourceSite}:${rawSourceId}`.slice(0, 240);
  const parsedEpisodes: Array<{
    number: number;
    epName: string;
    epSlug: string;
    serverName: string;
    linkM3u8: string;
    linkEmbed: string;
    raw: OPhimEpisode;
  }> = [];

  for (const server of detail.episodes) {
    const sourceServerName = String(server.server_name || 'OPhim').trim() || 'OPhim';
    // movie_episodes and episodes historically use a server-name key that
    // does not include the provider. Give an independently verified backup a
    // distinct label so it can never overwrite the primary provider's row.
    const serverName = labelAsBackup ? `${provider.sourceName} - ${sourceServerName}` : sourceServerName;
    for (const ep of server.server_data || []) {
      if (isTrailerEpisode(ep)) continue;
      const number = episodeNumber(ep);
      const epName = String(ep.name || (number === 1 ? 'Full' : `Tap ${number}`));
      const epSlug = String(ep.slug || slugify(epName)).trim() || slugify(epName);
      const linkM3u8 = safeProviderEpisodeUrl(provider, ep.link_m3u8, 'stream');
      const linkEmbed = safeProviderEpisodeUrl(provider, ep.link_embed, 'embed');
      if (!linkM3u8 && !linkEmbed) continue;
      // Unnumbered provider rows are legitimate specials/OVAs. Store them in
      // the slug-keyed tables with episode_number=0; movie_episodes remains
      // numeric-only because its identity is keyed by episode number.
      parsedEpisodes.push({ number, epName, epSlug, serverName, linkM3u8, linkEmbed, raw: ep });
    }
  }

  if (parsedEpisodes.length === 0) return 0;

  if (detail.numberingNormalization) {
    const normalization = detail.numberingNormalization;
    const { data: normalized, error: normalizeError } = await supabase.rpc(
      'normalize_verified_cumulative_season_numbering',
      {
        p_movie_id: movieId,
        p_source: provider.sourceSite,
        p_raw_start: normalization.rawStart,
        p_raw_end: normalization.rawEnd,
        p_season: normalization.season,
      },
    );
    if (normalizeError) {
      throw new Error(`season numbering normalize ${detail.movie.slug}: ${normalizeError.message}`);
    }
    if (normalized === false) {
      // The RPC intentionally refuses to transform a second time. A repeated
      // sync is still safe when this provider's persisted rows already form
      // the exact canonical 1..N range and contain no cumulative numbers.
      const canonicalTotal = normalization.canonicalTotal;
      const { data: storedRows, error: storedRowsError } = await supabase
        .from('movie_episodes')
        .select('episode_number')
        .eq('movie_id', movieId)
        .eq('source', provider.sourceSite)
        .limit(2000);
      if (storedRowsError) {
        throw new Error(`season numbering verify ${detail.movie.slug}: ${storedRowsError.message}`);
      }
      const storedNumbers = (storedRows || [])
        .map((row) => Number(row.episode_number || 0))
        .filter((number) => Number.isInteger(number) && number > 0);
      const canonicalNumbers = new Set(storedNumbers);
      const alreadyNormalized =
        storedNumbers.length > 0 &&
        storedNumbers.every((number) => number <= canonicalTotal) &&
        canonicalNumbers.size === canonicalTotal &&
        Array.from({ length: canonicalTotal }, (_, index) => index + 1)
          .every((number) => canonicalNumbers.has(number));
      if (!alreadyNormalized) {
        throw new Error(`season numbering normalize ${detail.movie.slug}: persisted rows failed the verified no-collision contract`);
      }
    }
  }

  const [{ data: existingAdminRows, error: adminSelectError }, { data: existingEpisodeRows, error: episodeSelectError }, { data: existingStreamRows, error: streamSelectError }] = await Promise.all([
    supabase
      .from('movie_episodes')
      .select('episode_number, server_name, link_m3u8, link_embed')
      .eq('movie_id', movieId),
    supabase
      .from('episodes')
      .select('episode_number, server_name, episode_slug, link_m3u8, link_embed')
      .eq('movie_id', movieId),
    supabase
      .from('streams')
      .select('server_name, episode_slug, source, stream_url, embed_url, is_active, health_status, failure_count, last_error, last_checked_at')
      .eq('movie_id', movieId)
      .eq('source', provider.sourceSite),
  ]);

  if (adminSelectError) throw new Error(`movie_episodes select ${detail.movie.slug}: ${adminSelectError.message}`);
  if (episodeSelectError) throw new Error(`episodes select ${detail.movie.slug}: ${episodeSelectError.message}`);
  if (streamSelectError) throw new Error(`streams select ${detail.movie.slug}: ${streamSelectError.message}`);

  const existingAdmin = new Map((existingAdminRows || []).map((row) => [
    `${String(row.server_name || '').trim().toLowerCase()}|${Number(row.episode_number || 0)}`,
    row,
  ]));
  const existingEpisodes = new Map((existingEpisodeRows || []).map((row) => [
    `${String(row.server_name || '').trim().toLowerCase()}|${String(row.episode_slug || '').trim().toLowerCase()}`,
    row,
  ]));
  const existingStreams = new Map((existingStreamRows || []).map((row) => [
    `${String(row.server_name || '').trim().toLowerCase()}|${String(row.episode_slug || '').trim().toLowerCase()}|${String(row.source || '').trim().toLowerCase()}`,
    row,
  ]));
  const plannedAdmin = new Set<string>();
  const plannedEpisodes = new Set<string>();
  const plannedStreams = new Set<string>();

  const movieEpisodeRows: MovieEpisodeUpsertRow[] = [];
  const episodeRows = [];
  const streamRows = [];

  for (const ep of parsedEpisodes) {
    if (ep.number > 0) {
      const adminKey = `${ep.serverName.trim().toLowerCase()}|${ep.number}`;
      const existingAdminRow = existingAdmin.get(adminKey);
      const adminUrlChanged = Boolean(existingAdminRow) && (
        String(existingAdminRow.link_m3u8 || '') !== ep.linkM3u8 ||
        String(existingAdminRow.link_embed || '') !== ep.linkEmbed
      );
      if ((!existingAdminRow || adminUrlChanged) && !plannedAdmin.has(adminKey)) {
        plannedAdmin.add(adminKey);
        movieEpisodeRows.push({
          movie_id: movieId,
          ophim_id: sourceId,
          episode_number: ep.number,
          episode_name: ep.epName,
          slug: ep.epSlug,
          server_name: ep.serverName,
          link_m3u8: ep.linkM3u8,
          link_embed: ep.linkEmbed,
          thumbnail_url: '',
          duration: '',
          source: provider.sourceSite,
          is_backup: labelAsBackup,
        });
      }
    }

    const episodeKey = `${ep.serverName.trim().toLowerCase()}|${ep.epSlug.trim().toLowerCase()}`;
    const existingEpisodeRow = existingEpisodes.get(episodeKey);
    const episodeUrlChanged = Boolean(existingEpisodeRow) && (
      String(existingEpisodeRow.link_m3u8 || '') !== ep.linkM3u8 ||
      String(existingEpisodeRow.link_embed || '') !== ep.linkEmbed
    );
    if ((!existingEpisodeRow || episodeUrlChanged) && !plannedEpisodes.has(episodeKey)) {
      plannedEpisodes.add(episodeKey);
      episodeRows.push({
        movie_id: movieId,
        ophim_id: sourceId,
        server_name: ep.serverName,
        episode_number: ep.number,
        episode_name: ep.epName,
        episode_slug: ep.epSlug,
        link_m3u8: ep.linkM3u8,
        link_embed: ep.linkEmbed,
        server_data: ep.raw,
      });
    }

    const streamKey = `${ep.serverName.trim().toLowerCase()}|${ep.epSlug.trim().toLowerCase()}|${provider.sourceSite.toLowerCase()}`;
    const existingStreamRow = existingStreams.get(streamKey);
    const streamUrlChanged = Boolean(existingStreamRow) && (
      String(existingStreamRow.stream_url || '') !== ep.linkM3u8 ||
      String(existingStreamRow.embed_url || '') !== ep.linkEmbed
    );
    const streamNeedsVerification = Boolean(existingStreamRow) && (
      existingStreamRow.is_active === false ||
      ['failed', 'dead', 'blocked'].includes(String(existingStreamRow.health_status || '').toLowerCase()) ||
      String(existingStreamRow.last_error || '').startsWith('Viewer telemetry:')
    );
    if ((!existingStreamRow || streamUrlChanged || streamNeedsVerification) && !plannedStreams.has(streamKey)) {
      plannedStreams.add(streamKey);
      streamRows.push({
        movie_id: movieId,
        ophim_id: sourceId,
        server_name: ep.serverName,
        episode_slug: ep.epSlug,
        stream_url: ep.linkM3u8,
        embed_url: ep.linkEmbed,
        source: provider.sourceSite,
        is_active: true,
        health_status: 'unchecked',
        failure_count: 0,
        // A provider response is not proof that its media URL plays. New,
        // changed, and previously failed rows return to a bounded verification
        // queue. Healthy unchanged rows never reach this branch, preserving
        // their evidence while allowing a recovered CDN URL to escape `dead`.
        last_error: `Provider verification pending: ${provider.sourceSite}`,
        last_checked_at: null,
        priority: 1,
      });
    }
  }

  await upsertMovieEpisodeRowsSafely(supabase, movieEpisodeRows, String(detail.movie.slug || 'movie'));
  await upsertEpisodeRowsSafely(supabase, episodeRows, String(detail.movie.slug || 'movie'));
  await upsertStreamRowsSafely(supabase, streamRows, String(detail.movie.slug || 'movie'));

  return Math.max(movieEpisodeRows.length, episodeRows.length, streamRows.length);
}

type StoredEpisodeIdentityRow = {
  id: string;
  ophim_id?: string | null;
  link_m3u8?: string | null;
  link_embed?: string | null;
  server_data?: Record<string, unknown> | null;
};

function structuredFilenameIdentity(filename: string): { names: string[]; rawNames: string[]; year: number } | null {
  const parts = filename.split(/\s+-\s+/).map((value) => value.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const yearMatch = parts[2].match(/\b([12]\d{3})\b/);
  const year = Number(yearMatch?.[1] || 0);
  const rawNames = Array.from(new Set(parts.slice(0, 2).filter((value) => normalizeText(value).length >= 3)));
  const names = Array.from(new Set(rawNames.map(normalizeText)));
  return year > 0 && names.length ? { names, rawNames, year } : null;
}

async function quarantineVerifiedForeignEpisodes(
  supabase: SupabaseClient,
  movieId: string,
  detail: ParsedDetail,
): Promise<number> {
  // Verified foreign-identity quarantine contract: rows are removable only
  // after the target detail passes strict title/year/type verification and a
  // different same-year canonical movie exactly matches the stored filename.
  const detailTitles = [detail.movie.name, detail.movie.origin_name, ...(detail.movie.alternative_names || [])]
    .map((value) => normalizeText(String(value || '')))
    .filter((value) => value.length >= 3);
  const detailYear = Number(detail.movie.year || 0);
  if (!detailYear || detailTitles.length === 0) return 0;

  const { data, error } = await supabase
    .from('episodes')
    .select('id,ophim_id,link_m3u8,link_embed,server_data')
    .eq('movie_id', movieId)
    .limit(2000);
  if (error) throw new Error(`episode identity audit ${detail.movie.slug}: ${error.message}`);

  const groups = new Map<string, { identity: { names: string[]; rawNames: string[]; year: number }; rows: StoredEpisodeIdentityRow[] }>();
  for (const rawRow of data || []) {
    const row = rawRow as StoredEpisodeIdentityRow;
    const filename = String(row.server_data?.filename || '');
    const identity = structuredFilenameIdentity(filename);
    if (!identity) continue;
    if (identity.year === detailYear && identity.names.some((name) => detailTitles.includes(name))) continue;
    const key = `${identity.year}|${identity.names.join('|')}`;
    const group = groups.get(key) || { identity, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const foreignRows: StoredEpisodeIdentityRow[] = [];
  const relatedMovieIds = new Set<string>();
  for (const group of groups.values()) {
    const candidates = new Map<string, Record<string, unknown>>();
    for (const name of group.identity.rawNames) {
      const exact = escapePostgrestIlike(name);
      for (const column of ['name', 'origin_name', 'title_vi', 'title_en', 'title_original']) {
        const { data: matches } = await supabase
          .from('movies')
          .select('id,slug,name,origin_name,title_vi,title_en,title_original,year,source_site,source_name,current_episode,total_episodes,is_published')
          .eq('year', group.identity.year)
          .ilike(column, exact)
          .neq('id', movieId)
          .limit(3);
        for (const match of matches || []) candidates.set(String(match.id), match as Record<string, unknown>);
      }
    }
    if (candidates.size === 0) continue;
    const relatedId = [...candidates.values()].sort((a, b) => canonicalCandidateScore(b) - canonicalCandidateScore(a))[0].id as string;
    relatedMovieIds.add(relatedId);
    foreignRows.push(...group.rows);
  }

  if (foreignRows.length === 0) return 0;
  const episodeIds = foreignRows.map((row) => row.id);
  const m3u8Urls = foreignRows.map((row) => String(row.link_m3u8 || '')).filter(Boolean);
  const embedUrls = foreignRows.map((row) => String(row.link_embed || '')).filter(Boolean);
  const sourceIds = foreignRows.map((row) => String(row.ophim_id || '')).filter(Boolean);

  const deleteIdsByUrls = async (table: 'streams' | 'movie_episodes') => {
    const idSet = new Set<string>();
    const fields = table === 'streams' ? ['stream_url', 'embed_url'] : ['link_m3u8', 'link_embed'];
    const urlsByField = [m3u8Urls, embedUrls];
    for (let index = 0; index < fields.length; index += 1) {
      for (const urlBatch of chunks(urlsByField[index], 100)) {
        if (!urlBatch.length) continue;
        const { data: matches } = await supabase.from(table).select('id').eq('movie_id', movieId).in(fields[index], urlBatch);
        for (const match of matches || []) idSet.add(String(match.id));
      }
    }
    if (sourceIds.length) {
      const { data: matches } = await supabase.from(table).select('id').eq('movie_id', movieId).in('ophim_id', sourceIds);
      for (const match of matches || []) idSet.add(String(match.id));
    }
    for (const idBatch of chunks([...idSet], 100)) {
      if (idBatch.length) await supabase.from(table).delete().in('id', idBatch);
    }
  };

  await deleteIdsByUrls('streams');
  await deleteIdsByUrls('movie_episodes');
  for (const idBatch of chunks(episodeIds, 100)) {
    const { error: deleteError } = await supabase.from('episodes').delete().in('id', idBatch);
    if (deleteError) throw new Error(`foreign episode quarantine ${detail.movie.slug}: ${deleteError.message}`);
  }

  const verified = moviePayload(PROVIDERS.ophim, detail);
  await supabase.from('movies').update({
    current_episode: verified.current_episode,
    total_episodes: verified.total_episodes,
    episode_current: verified.episode_current,
    episode_total: verified.episode_total,
    last_synced_at: new Date().toISOString(),
  }).eq('id', movieId);

  await supabase.from('catalog_integrity_issues').upsert({
    issue_key: `episode_identity_mismatch:${movieId}`,
    issue_type: 'episode_identity_mismatch',
    movie_id: movieId,
    related_movie_id: relatedMovieIds.size === 1 ? [...relatedMovieIds][0] : null,
    severity: 5,
    confidence: 1,
    status: 'resolved',
    evidence: {
      removed_episode_rows: foreignRows.length,
      verified_source_slug: detail.movie.slug,
      verified_source_year: detailYear,
      related_movie_ids: [...relatedMovieIds],
    },
    last_detected_at: new Date().toISOString(),
    resolved_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: 'issue_key' });

  return foreignRows.length;
}

async function writeLog(supabase: SupabaseClient, stats: SyncStats, elapsedMs: number, metadata: Record<string, unknown>): Promise<void> {
  try {
    await supabase.from('sync_logs').insert({
      function_name: 'sync-ophim-movies',
      run_at: new Date().toISOString(),
      scanned: stats.scanned,
      added: stats.created + stats.episodesInserted,
      skipped: stats.skipped,
      errors: stats.errors.length,
      details: stats.errors,
      elapsed_ms: elapsedMs,
      success: stats.errors.length === 0,
      metadata: {
        ...metadata,
        created: stats.created,
        updated: stats.updated,
        episodes_inserted: stats.episodesInserted,
        transient_errors: stats.transientErrors.slice(0, 20),
        transient_error_count: stats.transientErrors.length,
      },
    });
  } catch {
    /* optional log table */
  }
}

async function clearCaches(supabase: SupabaseClient, slugs: string[]): Promise<void> {
  const targets = uniqueSlugs(slugs);
  await Promise.allSettled([
    // Preserve the last known-good homepage payload for stale fallback. Marking
    // it expired lets the warmer refresh it without creating a cold-cache gap.
    supabase.from('home_page_cache').update({ expires_at: new Date(0).toISOString() }).eq('id', 'homepage_v3'),
    targets.length
      ? supabase.from('movie_api_cache').update({ expires_at: new Date().toISOString() }).in('slug', targets)
      : Promise.resolve(),
  ]);
}

async function verifyTargetStreamsNow(
  supabaseUrl: string,
  serviceKey: string,
  cronSecret: string,
  slug: string,
): Promise<void> {
  const endpoint = new URL(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/stream-health-check`);
  endpoint.searchParams.set('slug', slug);
  endpoint.searchParams.set('queue', 'recovery');
  endpoint.searchParams.set('limit', '16');
  endpoint.searchParams.set('concurrency', '3');
  endpoint.searchParams.set('deactivate_after', '3');
  const response = await fetch(endpoint.toString(), {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'x-cron-secret': cronSecret,
    },
    signal: AbortSignal.timeout(65_000),
  });
  if (!response.ok) throw new Error(`target stream verification HTTP ${response.status}`);
  await response.body?.cancel().catch(() => undefined);
}

function uniqueSlugs(slugs: string[]): string[] {
  return Array.from(new Set(slugs.map((slug) => String(slug || '').trim()).filter(Boolean))).slice(0, 100);
}

function movieUrlsFromSlugs(slugs: string[]): string[] {
  return uniqueSlugs(slugs).map((slug) => `https://khophim.org/phim/${encodeURIComponent(slug)}`);
}

async function pingChangedMovieUrls(
  supabaseUrl: string,
  serviceKey: string,
  cronSecret: string,
  slugs: string[],
): Promise<{ attempted: boolean; ok: boolean; status: number; urls: number; message: string }> {
  const urls = movieUrlsFromSlugs(slugs);
  if (urls.length === 0) return { attempted: false, ok: true, status: 0, urls: 0, message: 'no changed urls' };
  void supabaseUrl; void serviceKey; void cronSecret;
  return {
    attempted: false,
    ok: true,
    status: 0,
    urls: urls.length,
    message: 'Ordinary movie URLs use sitemap, RSS/WebSub and internal links; Google Indexing API is intentionally skipped.',
  };
}

async function runSeoAutomation(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  cronSecret: string,
  changedSlugs: string[],
): Promise<{ changed_urls: number; caches_cleared: boolean; search_index_refreshed: boolean; google_ping: Awaited<ReturnType<typeof pingChangedMovieUrls>> }> {
  const slugs = uniqueSlugs(changedSlugs);
  if (slugs.length === 0) {
    return {
      changed_urls: 0,
      caches_cleared: false,
      search_index_refreshed: false,
      google_ping: { attempted: false, ok: true, status: 0, urls: 0, message: 'no changed urls' },
    };
  }

  await clearCaches(supabase, slugs);
  // movie_search_documents has a per-movie trigger, so changed titles are
  // searchable immediately. Rebuilding all 5,000 rows here overloaded the
  // same database that serves viewers during busy hours.
  const googlePing = await pingChangedMovieUrls(supabaseUrl, serviceKey, cronSecret, slugs);

  return {
    changed_urls: slugs.length,
    caches_cleared: true,
    search_index_refreshed: false,
    google_ping: googlePing,
  };
}

function isVietnamViewingPeak(now = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now));
  return (hour >= 11 && hour <= 14) || (hour >= 19 && hour <= 23);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const started = Date.now();
  const url = new URL(req.url);
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const secret = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  if (!cronSecret) return json({ success: false, error: 'CRON_SECRET is not configured' }, 503);
  if (secret !== cronSecret) return json({ success: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase env' }, 500);

  const pages = Math.max(1, Math.min(Number(url.searchParams.get('pages') || 2), 20));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 48), 200));
  const dryRun = url.searchParams.get('dry_run') === '1';
  const includeEpisodes =
    url.searchParams.get('episodes') === '1' ||
    url.searchParams.get('include_episodes') === '1';
  const setBasedBulk = url.searchParams.get('set_based_bulk') === '1';
  const requestedBulkFastPath = url.searchParams.get('bulk_fast_path') === '1';
  const strictMissingDetail = url.searchParams.get('strict_missing_detail') === '1';
  const requestedProvider = String(url.searchParams.get('provider') || '').trim().toLowerCase();
  const provider = providerFromParam(requestedProvider);
  if (!provider) {
    return json({
      success: false,
      retired: requestedProvider === 'ophim',
      error: requestedProvider === 'ophim'
        ? 'OPhim provider is retired and cannot be synchronized'
        : 'provider must be one of: kkphim, vsmov, nguonc',
    }, requestedProvider === 'ophim' ? 410 : 400);
  }
  let submittedDetails = new Map<string, ParsedDetail>();
  let submittedPage = 0;
  if (req.method === 'POST') {
    try {
      const body = await req.json() as Record<string, unknown>;
      submittedPage = Math.max(1, Number(body.page || 1) || 1);
      const details = Array.isArray(body.details) ? body.details.slice(0, 20) : [];
      for (const raw of details) {
        if (!raw || typeof raw !== 'object') continue;
        const parsed = parseDetail(provider, raw as DetailPayload, '');
        const slug = String(parsed?.movie.slug || '').trim();
        const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
        // NguonC catalogue pages can legitimately contain announced titles
        // before a playable episode exists. Persist their metadata privately;
        // the publication gate below still requires a playable source.
        if (parsed && validSlug) submittedDetails.set(slug, parsed);
      }
      if (!submittedDetails.size) {
        return json({ success: false, error: `No valid ${provider.sourceSite} details submitted` }, 400);
      }
    } catch {
      return json({ success: false, error: 'Invalid submitted provider payload' }, 400);
    }
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  if (url.searchParams.get('status') === '1') {
    const [{ data: progress, error: progressError }, { data: storageRows, error: storageError }] = await Promise.all([
      supabase.from('provider_catalog_backfill_state').select('*').eq('provider', provider.sourceSite).maybeSingle(),
      supabase.rpc('provider_catalog_storage_status'),
    ]);
    if (progressError || storageError) {
      return json({ success: false, error: progressError?.message || storageError?.message || 'Status unavailable' }, 500);
    }
    return json({
      success: true,
      provider: provider.sourceSite,
      progress: progress || null,
      storage: Array.isArray(storageRows) ? storageRows[0] : storageRows,
    });
  }
  const hasTarget = Boolean(url.searchParams.get('slug') || url.searchParams.get('movie_id'));
  if (!dryRun && !hasTarget) {
    const { data: capacity } = await supabase.from('runtime_capacity_state')
      .select('mode,last_reason').eq('singleton', true).maybeSingle();
    if (capacity?.mode === 'protect' || isVietnamViewingPeak()) {
      return json({
        success: true,
        skipped: true,
        reason: capacity?.mode === 'protect' ? 'runtime_capacity_protect' : 'vietnam_viewing_peak',
        provider: provider.sourceSite,
        next_page_unchanged: true,
      }, 202);
    }
  }
  const stats: SyncStats = { scanned: 0, created: 0, updated: 0, episodesInserted: 0, skipped: 0, errors: [], transientErrors: [] };
  const changedSlugs: string[] = [];
  const bulkFastPath = requestedBulkFastPath && setBasedBulk && submittedDetails.size > 0 &&
    ['phimapi', 'nguonc'].includes(provider.sourceSite);

  // The durable runner checks storage once when a provider session starts.
  // Repeating this RPC for every submitted chunk overloaded PostgREST's schema
  // cache and turned the guard itself into the catalogue bottleneck.
  if (!dryRun && !bulkFastPath) {
    const { data: storageRows, error: storageError } = await supabase.rpc('provider_catalog_storage_status');
    const storage = Array.isArray(storageRows) ? storageRows[0] : storageRows;
    if (storageError) return json({ success: false, error: `Storage guard unavailable: ${storageError.message}` }, 503);
    if (storage && storage.can_continue === false) {
      await supabase.from('provider_catalog_backfill_state').upsert({
        provider: provider.sourceSite,
        status: 'paused',
        last_error: `Storage soft limit reached at ${storage.database_bytes} bytes`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider' });
      return json({ success: false, paused: true, reason: 'storage_soft_limit', storage }, 507);
    }
  }

  try {
    const requestedStartPage = Math.max(1, Number(url.searchParams.get('start_page') || url.searchParams.get('page') || 1) || 1);
    const maxPage = Math.max(1, Number(url.searchParams.get('max_page') || 5000) || 5000);
    const totalPages = Math.max(0, Math.min(10_000, Number(url.searchParams.get('total_pages') || 0) || 0));
    const useCursor = url.searchParams.get('cursor') === '1' || url.searchParams.get('backfill') === '1';
    const cursorKey = String(url.searchParams.get('cursor_key') || `sync-ophim-movies:${provider.sourceSite}:backfill`);
    const targetSlug = String(url.searchParams.get('slug') || '').trim();
    const targetMovieId = String(url.searchParams.get('movie_id') || '').trim();
    let targetMovie: TargetMovieIdentity | null = null;
    if (targetMovieId || targetSlug) {
      const { data, error } = await supabase
        .from('movies')
        .select('id,slug,name,origin_name,title_vi,title_en,title_original,year,type,tmdb_id,ophim_slug,source_site,source_name')
        .eq(targetMovieId ? 'id' : 'slug', targetMovieId || targetSlug)
        .maybeSingle();
      if (error) throw new Error(`target movie lookup ${targetMovieId || targetSlug}: ${error.message}`);
      targetMovie = data as TargetMovieIdentity | null;
      if (targetMovieId && !targetMovie) throw new Error(`target movie ${targetMovieId} not found`);
    }
    if (url.searchParams.get('debug_target') === '1' && targetMovie) {
      const debugSlug = targetSlug || String(targetMovie.slug || '');
      const rawPayload = await fetchJsonFromMirrors(provider, provider.detailPath(debugSlug));
      const directDetail = parseDetail(provider, rawPayload as DetailPayload | null, debugSlug);
      const rawMovie = rawPayload?.movie && typeof rawPayload.movie === 'object'
        ? rawPayload.movie as Record<string, unknown>
        : null;
      return json({
        success: true,
        provider: provider.sourceSite,
        target: {
          slug: targetMovie.slug,
          name: targetMovie.name,
          origin_name: targetMovie.origin_name,
          year: targetMovie.year,
          type: targetMovie.type,
        },
        detail_found: Boolean(directDetail),
        detail_safe: Boolean(directDetail && isSafeTargetDetail(provider, targetMovie, directDetail)),
        raw: {
          found: Boolean(rawPayload),
          keys: rawPayload ? Object.keys(rawPayload).slice(0, 20) : [],
          status: rawPayload?.status || null,
          provider_error_payload: Boolean(rawPayload && isProviderErrorPayload(rawPayload)),
          movie_keys: rawMovie ? Object.keys(rawMovie).slice(0, 30) : [],
          raw_episode_servers: Array.isArray(rawMovie?.episodes) ? rawMovie.episodes.length : 0,
        },
        detail: directDetail ? {
          slug: directDetail.movie.slug,
          name: directDetail.movie.name,
          origin_name: directDetail.movie.origin_name,
          year: directDetail.movie.year,
          type: directDetail.movie.type,
          servers: directDetail.episodes.length,
          playable_rows: directDetail.episodes.reduce((count, server) => count + (server.server_data || []).filter((episode) => Boolean(episode.link_m3u8 || episode.link_embed)).length, 0),
        } : null,
      });
    }
    const startPage = useCursor ? await readCursorPage(supabase, cursorKey, requestedStartPage) : requestedStartPage;
    const candidates = new Map<string, OPhimMovie>();
    let pagesWithItems = 0;
    let slugs: string[] = [];

    if (submittedDetails.size) {
      for (const [slug, detail] of submittedDetails) candidates.set(slug, detail.movie);
      slugs = [...submittedDetails.keys()].slice(0, limit);
      pagesWithItems = 1;
    } else if (targetSlug || targetMovie) {
      slugs = [targetSlug || String(targetMovie?.slug || '')].filter(Boolean);
      pagesWithItems = 1;
    } else {
      for (let page = startPage; page < startPage + pages; page += 1) {
        const payload = await fetchListPage(provider, page);
        const items = listItems(payload);
        if (items.length > 0) pagesWithItems += 1;
        for (const item of items) {
          if (item.slug && !candidates.has(item.slug)) candidates.set(item.slug, item);
        }
      }
      slugs = Array.from(candidates.keys()).slice(0, limit);
      if (pagesWithItems === 0 && startPage === 1) {
        recordSyncError(stats, `[${provider.sourceSite}] latest list returned 0 items from all mirrors`);
      }
    }

    const canUseSetBasedBulk =
      setBasedBulk &&
      submittedDetails.size > 0 &&
      includeEpisodes &&
      !dryRun &&
      !targetMovie &&
      !targetSlug &&
      ['phimapi', 'nguonc'].includes(provider.sourceSite);

    if (canUseSetBasedBulk) {
      const bulkItems = slugs
        .map((slug) => submittedDetails.get(slug))
        .filter((detail): detail is ParsedDetail => Boolean(detail))
        .map((detail) => bulkProviderCatalogItem(provider, detail));
      const { data: bulkResult, error: bulkError } = await supabase.rpc('bulk_ingest_provider_catalog', {
        p_provider: provider.sourceSite,
        p_items: bulkItems,
      });
      if (bulkError) throw new Error(`set-based bulk ingest: ${bulkError.message}`);
      const result = (bulkResult || {}) as Record<string, unknown>;
      stats.scanned += Number(result.scanned || 0);
      stats.created += Number(result.created || 0);
      stats.updated += Number(result.updated || 0);
      stats.episodesInserted += Number(result.episodes_inserted || 0);
      for (const message of (Array.isArray(result.errors) ? result.errors : [])) {
        recordSyncError(stats, String(message || ''));
      }
      for (const slug of slugs) changedSlugs.push(slug);
    } else for (const slug of slugs) {
      stats.scanned += 1;
      try {
        const fetchedDetail = submittedDetails.get(slug) || (targetMovie
          ? await fetchDetailForTarget(provider, targetMovie)
          : await fetchDetail(provider, slug));
        const expected = candidates.get(slug);
        const detail = fetchedDetail && (!expected || detailMatchesExpected(expected, fetchedDetail))
          ? fetchedDetail
          : null;
        if (!detail) {
          stats.skipped += 1;
          if (fetchedDetail && expected) {
            stats.errors.push(`[${slug}] provider list/detail identity mismatch`);
          } else if ((targetSlug || targetMovie) && strictMissingDetail) {
            stats.errors.push(`[${slug}] detail not found or identity mismatch`);
          }
          continue;
        }
        if (dryRun) continue;
        const result = await upsertMovie(supabase, provider, detail);
        if (result.retired) {
          stats.skipped += 1;
          continue;
        }
        if (result.created) stats.created += 1;
        if (result.updated) stats.updated += 1;
        const beforeEpisodesInserted = stats.episodesInserted;
        try {
          if (targetMovie) {
            const removedForeignEpisodes = await quarantineVerifiedForeignEpisodes(supabase, result.id, detail);
            if (removedForeignEpisodes > 0) changedSlugs.push(String(detail.movie.slug || slug));
          }
          if (includeEpisodes) {
            const primarySource = String(targetMovie?.source_site || targetMovie?.source_name || '').toLowerCase();
            const isIndependentProvider = provider.sourceSite === 'phimapi'
              ? !/(kkphim|phimapi)/.test(primarySource)
              : !/ophim/.test(primarySource);
            stats.episodesInserted += await insertEpisodes(
              supabase,
              provider,
              result.id,
              detail,
              Boolean(
                provider.sourceSite === 'vsmov' ||
                provider.sourceSite === 'nguonc' ||
                (targetMovie && isIndependentProvider)
              ),
            );
            // Publication is a strict two-part gate: the provider detail must
            // contain a real playable URL and the movie must have usable artwork.
            // This also safely releases a private row left by an interrupted run,
            // even when its episode rows were already written on that prior run.
            // A targeted repair must also re-evaluate a previously public row.
            // Provider metadata can move from upcoming/trailer to ongoing while
            // still exposing no episode; preserving the old public flag would
            // leak an unwatchable movie back into listings.
            if (targetMovie || (detailHasPlayableEpisode(detail) && result.hasImage)) {
              const persistedPlayableCoverage = await hasPersistedPlayableCoverage(supabase, result.id);
              await supabase
                .from('movies')
                .update({ is_published: persistedPlayableCoverage && result.hasImage })
                .eq('id', result.id);
            }
          }
        } finally {
          // Provider metadata can advertise more episodes than the sources
          // that are currently usable. This must run even when an episode
          // write fails, because the movie metadata was already updated.
          const { error: reconcileError } = await supabase.rpc('reconcile_movie_release_state', {
            p_movie_id: result.id,
          });
          if (reconcileError) {
            throw new Error(`movie release reconcile ${detail.movie.slug}: ${reconcileError.message}`);
          }
        }

        if (result.created || result.updated || stats.episodesInserted > beforeEpisodesInserted) {
          changedSlugs.push(String(detail.movie.slug || slug));
        }
        if (targetMovie && includeEpisodes) {
          // A targeted catalogue repair is incomplete until the refreshed
          // rows pass the same health/browser-managed policy used by the API.
          // This also restores metadata immediately when a CDN URL recovers
          // without changing its string value.
          await verifyTargetStreamsNow(
            supabaseUrl,
            serviceKey,
            cronSecret,
            String(targetMovie.slug || detail.movie.slug || slug),
          );
        }
      } catch (error) {
        recordSyncError(stats, `[${slug}] ${error instanceof Error ? error.message : String(error)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const seoAutomation = !dryRun && !bulkFastPath
      ? await runSeoAutomation(supabase, supabaseUrl, serviceKey, cronSecret, changedSlugs)
      : {
          changed_urls: 0,
          caches_cleared: false,
          search_index_refreshed: false,
          google_ping: { attempted: false, ok: true, status: 0, urls: 0, message: bulkFastPath ? 'deferred during exact bulk backfill' : 'dry run' },
        };

    const computedNextPage = submittedDetails.size
      ? submittedPage + 1
      : (targetSlug || targetMovie || pagesWithItems === 0 || startPage + pages > maxPage ? 1 : startPage + pages);
    const finiteBackfillComplete = totalPages > 0 && (
      submittedDetails.size ? submittedPage >= totalPages : startPage + pages - 1 >= totalPages
    );
    const nextPage = finiteBackfillComplete ? totalPages + 1 : computedNextPage;
    if (useCursor && !dryRun && !bulkFastPath && !targetSlug && !targetMovie) await writeCursorPage(supabase, cursorKey, nextPage);

    const elapsedMs = Date.now() - started;
    const metadata = {
      provider: provider.sourceSite,
      target_slug: targetSlug || null,
      target_movie_id: targetMovieId || null,
      pages,
      limit,
      start_page: startPage,
      next_page: nextPage,
      pages_with_items: pagesWithItems,
      dry_run: dryRun,
      include_episodes: includeEpisodes,
      total_pages: totalPages || null,
      cursor: useCursor ? cursorKey : null,
      seo_automation: seoAutomation,
    };
    if (!dryRun && !bulkFastPath && !targetSlug && !targetMovie) {
      const lastError = [...stats.errors, ...stats.transientErrors].slice(0, 3).join('; ');
      const { error: progressError } = await supabase.rpc('record_provider_catalog_backfill_batch', {
        p_provider: provider.sourceSite,
        p_next_page: nextPage,
        p_total_pages: totalPages,
        p_scanned: stats.scanned,
        p_created: stats.created,
        p_updated: stats.updated,
        p_episodes: stats.episodesInserted,
        p_errors: stats.errors.length + stats.transientErrors.length,
        p_last_error: lastError,
        p_batch: metadata,
      });
      if (progressError) recordSyncError(stats, `progress checkpoint: ${progressError.message}`);
    }
    if (!bulkFastPath) await writeLog(supabase, stats, elapsedMs, metadata);
    return json({
      success: stats.errors.length === 0,
      provider: provider.sourceSite,
      start_page: startPage,
      next_page: nextPage,
      total_pages: totalPages || null,
      target_slug: targetSlug || null,
      target_movie_id: targetMovieId || null,
      scanned: stats.scanned,
      created: stats.created,
      updated: stats.updated,
      episodes_inserted: stats.episodesInserted,
      skipped: stats.skipped,
      errors: stats.errors,
      transient_errors: stats.transientErrors.slice(0, 20),
      transient_error_count: stats.transientErrors.length,
      include_episodes: includeEpisodes,
      seo_automation: seoAutomation,
      elapsed_ms: elapsedMs,
    }, stats.errors.length ? 207 : 200);
  } catch (error) {
    const elapsedMs = Date.now() - started;
    recordSyncError(stats, error instanceof Error ? error.message : String(error));
    if (!bulkFastPath) await writeLog(supabase, stats, elapsedMs, { provider: provider.sourceSite, pages, limit, dry_run: dryRun, include_episodes: includeEpisodes });
    return json({
      success: stats.errors.length === 0,
      error: stats.errors[0] || null,
      transient_errors: stats.transientErrors.slice(0, 20),
      transient_error_count: stats.transientErrors.length,
      elapsed_ms: elapsedMs,
    }, stats.errors.length ? 500 : 207);
  }
});
