import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const PROVIDERS = {
  ophim: {
    sourceSite: 'ophim',
    sourceName: 'OPhim',
    bases: ['https://ophim1.com', 'https://ophim.tv', 'https://ophim9.cc', 'https://ophim8.cc'],
    listPath: (page: number) => `/v1/api/danh-sach/phim-moi-cap-nhat?page=${page}&sort_field=modified.time&sort_type=desc`,
    detailPath: (slug: string) => `/v1/api/phim/${encodeURIComponent(slug)}`,
    trackOphimIdentity: true,
  },
  kkphim: {
    sourceSite: 'phimapi',
    sourceName: 'KKPhim',
    bases: ['https://phimapi.com', 'https://phimapi.net'],
    listPath: (page: number) => `/danh-sach/phim-moi-cap-nhat?page=${page}`,
    detailPath: (slug: string) => `/phim/${encodeURIComponent(slug)}`,
    trackOphimIdentity: false,
  },
} as const;

type ProviderKey = keyof typeof PROVIDERS;
type ProviderConfig = (typeof PROVIDERS)[ProviderKey];

function providerFromParam(value: string | null): ProviderConfig {
  return value === 'kkphim' ? PROVIDERS.kkphim : PROVIDERS.ophim;
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
}

interface SyncStats {
  scanned: number;
  created: number;
  updated: number;
  episodesInserted: number;
  skipped: number;
  errors: string[];
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
  if (source.includes('admin') || source.includes('supabase') || source.includes('blvietsub')) return 4;
  if (record.tmdb_id) return 3;
  if (source.includes('ophim')) return 2;
  return 1;
}

function sameMovieByTitle(existing: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  const existingYear = Number(existing.year || 0);
  const incomingYear = Number(incoming.year || 0);
  if (existingYear > 0 && incomingYear > 0 && existingYear !== incomingYear) return false;

  const existingTitles = titleCandidates(existing);
  const incomingTitles = titleCandidates(incoming);
  return incomingTitles.some((incomingTitle) =>
    existingTitles.some((existingTitle) =>
      incomingTitle === existingTitle ||
      (incomingTitle.length >= 10 && existingTitle.includes(incomingTitle)) ||
      (existingTitle.length >= 10 && incomingTitle.includes(existingTitle))
    )
  );
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

function episodeNumber(ep: OPhimEpisode): number {
  const text = `${ep.name || ''} ${ep.slug || ''}`.toLowerCase();
  if (text.includes('full')) return 1;
  const value = Number(text.match(/\d+/)?.[0] || 0);
  return Number.isFinite(value) ? value : 0;
}

function getCurrentEpisode(movie: OPhimMovie, episodes: OPhimServer[]): number {
  const fromText = Number(String(movie.episode_current || '').match(/\d+/)?.[0] || 0);
  let fromEpisodes = 0;
  for (const server of episodes) {
    for (const ep of server.server_data || []) {
      fromEpisodes = Math.max(fromEpisodes, episodeNumber(ep));
    }
  }
  if (!fromText && String(movie.episode_current || '').toLowerCase().includes('full')) return 1;
  return Math.max(fromText, fromEpisodes);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

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
      const res = await fetch(`${base}${path}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      return await res.json() as Record<string, unknown>;
    } catch {
      /* try next mirror */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function listItems(payload: Record<string, unknown> | null): OPhimMovie[] {
  if (!payload) return [];
  const data = payload.data as Record<string, unknown> | undefined;
  const items = (data?.items || payload.items || []) as unknown[];
  return items.filter((item): item is OPhimMovie => Boolean(item && typeof item === 'object'));
}

function parseDetail(payload: DetailPayload | null, fallbackSlug: string): ParsedDetail | null {
  if (!payload) return null;
  const item = payload.data?.item || payload.item || payload.movie || null;
  if (!item) return null;
  const episodes = payload.data?.item?.episodes || payload.item?.episodes || payload.episodes || [];
  const movie = { ...item, slug: item.slug || fallbackSlug };
  return { movie, episodes: Array.isArray(episodes) ? episodes : [] };
}

async function fetchDetail(provider: ProviderConfig, slug: string): Promise<ParsedDetail | null> {
  const payload = await fetchJsonFromMirrors(provider, provider.detailPath(slug));
  return parseDetail(payload as DetailPayload | null, slug);
}

function moviePayload(provider: ProviderConfig, detail: ParsedDetail): Record<string, unknown> {
  const movie = detail.movie;
  const now = new Date().toISOString();
  const name = String(movie.name || movie.slug || 'Phim');
  const originName = String(movie.origin_name || '');
  const slug = String(movie.slug || slugify(name));
  const currentEpisode = getCurrentEpisode(movie, detail.episodes);

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
    thumb_url: String(movie.thumb_url || ''),
    poster_url: String(movie.poster_url || ''),
    trailer_url: String(movie.trailer_url || ''),
    time: String(movie.time || ''),
    episode_current: String(movie.episode_current || (currentEpisode ? `Tap ${currentEpisode}` : '')),
    episode_total: String(movie.episode_total || ''),
    current_episode: currentEpisode || null,
    total_episodes: currentEpisode || null,
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

async function findExistingMovie(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const checks = [
    ['slug', payload.slug],
    ['ophim_slug', payload.ophim_slug],
    ['ophim_id', payload.ophim_id],
  ].filter(([, value]) => String(value || '').trim());

  for (const [column, value] of checks) {
    const { data } = await supabase
      .from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,source_site,source_name,current_episode,total_episodes,episode_current,tmdb_id,ophim_id,ophim_slug')
      .eq(column as string, value as string)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data as Record<string, unknown>;
  }

  const title = String(payload.origin_name || payload.name || '').trim();
  const year = Number(payload.year || 0);
  if (title.length >= 3 && year > 0) {
    const safe = escapePostgrestIlike(title);
    const { data } = await supabase
      .from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,source_site,source_name,current_episode,total_episodes,episode_current,tmdb_id,ophim_id,ophim_slug')
      .eq('year', year)
      .or(`name.ilike.%${safe}%,origin_name.ilike.%${safe}%,title_vi.ilike.%${safe}%,title_en.ilike.%${safe}%,title_zh.ilike.%${safe}%,title_original.ilike.%${safe}%`)
      .limit(20);
    const match = ((data || []) as Record<string, unknown>[])
      .filter((row) => sameMovieByTitle(row, payload))
      .sort((a, b) => sourcePriority(b) - sourcePriority(a))[0];
    if (match?.id) return match;
  }

  const normalized = String(payload.normalized_name || '').trim();
  if (normalized.length >= 6 && year > 0) {
    const { data } = await supabase
      .from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,year,source_site,source_name,current_episode,total_episodes,episode_current,tmdb_id,ophim_id,ophim_slug')
      .eq('year', year)
      .ilike('normalized_name', normalized)
      .limit(10);
    const match = ((data || []) as Record<string, unknown>[])
      .filter((row) => sameMovieByTitle(row, payload))
      .sort((a, b) => sourcePriority(b) - sourcePriority(a))[0];
    if (match?.id) return match;
  }
  return null;
}

function updatePayloadForExisting(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const source = `${existing.source_site || ''} ${existing.source_name || ''}`.toLowerCase();
  const managed = source.includes('admin') || source.includes('blvietsub') || source.includes('supabase');
  const current = Math.max(Number(existing.current_episode || 0), Number(String(existing.episode_current || '').match(/\d+/)?.[0] || 0));
  const incomingCurrent = Number(incoming.current_episode || 0);

  if (!managed) return incoming;

  return {
    ophim_id: incoming.ophim_id,
    ophim_slug: incoming.ophim_slug,
    last_synced_at: incoming.last_synced_at,
    updated_at: incoming.updated_at,
    current_episode: Math.max(current, incomingCurrent) || null,
    total_episodes: Math.max(Number(existing.total_episodes || 0), Number(incoming.total_episodes || 0)) || null,
    episode_current: incomingCurrent > current ? incoming.episode_current : existing.episode_current,
  };
}

async function upsertMovie(supabase: SupabaseClient, provider: ProviderConfig, detail: ParsedDetail): Promise<{ id: string; created: boolean; updated: boolean }> {
  const payload = moviePayload(provider, detail);
  const existing = await findExistingMovie(supabase, payload);

  if (existing?.id) {
    const update = updatePayloadForExisting(existing, payload);
    if (!provider.trackOphimIdentity) {
      if (existing.ophim_id) delete update.ophim_id;
      if (existing.ophim_slug) delete update.ophim_slug;
      if (existing.source_site && String(existing.source_site) !== provider.sourceSite) {
        delete update.source_site;
        delete update.source_name;
      }
    }
    const { error } = await supabase.from('movies').update(update).eq('id', existing.id as string);
    if (error) {
      if (isDuplicateError(error) && (update.ophim_id || update.ophim_slug)) {
        const retryUpdate = { ...update };
        delete retryUpdate.ophim_id;
        delete retryUpdate.ophim_slug;
        const { error: retryError } = await supabase.from('movies').update(retryUpdate).eq('id', existing.id as string);
        if (!retryError) return { id: String(existing.id), created: false, updated: true };
        throw new Error(`movies update ${payload.slug}: ${dbErrorMessage(retryError)}`);
      }
      throw new Error(`movies update ${payload.slug}: ${dbErrorMessage(error)}`);
    }
    return { id: String(existing.id), created: false, updated: true };
  }

  const { data, error } = await supabase.from('movies').insert(payload).select('id').single();
  if (error) {
    if (isDuplicateError(error)) {
      const duplicate = await findExistingMovie(supabase, payload);
      if (duplicate?.id) {
        const update = updatePayloadForExisting(duplicate, payload);
        const { error: updateError } = await supabase.from('movies').update(update).eq('id', duplicate.id as string);
        if (!updateError) return { id: String(duplicate.id), created: false, updated: true };
        throw new Error(`movies insert duplicate update ${payload.slug}: ${dbErrorMessage(updateError)}`);
      }
    }
    throw new Error(`movies insert ${payload.slug}: ${dbErrorMessage(error)}`);
  }
  return { id: String(data.id), created: true, updated: false };
}

async function insertEpisodes(supabase: SupabaseClient, provider: ProviderConfig, movieId: string, detail: ParsedDetail): Promise<number> {
  const sourceId = provider.trackOphimIdentity ? String(detail.movie._id || detail.movie.id || '') : '';
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
    const serverName = String(server.server_name || 'OPhim').trim() || 'OPhim';
    for (const ep of server.server_data || []) {
      const number = episodeNumber(ep);
      if (!number) continue;
      const epName = String(ep.name || (number === 1 ? 'Full' : `Tap ${number}`));
      const epSlug = String(ep.slug || slugify(epName)).trim() || slugify(epName);
      const linkM3u8 = String(ep.link_m3u8 || '');
      const linkEmbed = String(ep.link_embed || '');
      if (!linkM3u8 && !linkEmbed) continue;
      parsedEpisodes.push({ number, epName, epSlug, serverName, linkM3u8, linkEmbed, raw: ep });
    }
  }

  if (parsedEpisodes.length === 0) return 0;

  const [{ data: existingAdminRows, error: adminSelectError }, { data: existingEpisodeRows, error: episodeSelectError }, { data: existingStreamRows, error: streamSelectError }] = await Promise.all([
    supabase
      .from('movie_episodes')
      .select('episode_number, server_name')
      .eq('movie_id', movieId),
    supabase
      .from('episodes')
      .select('episode_number, server_name, episode_slug')
      .eq('movie_id', movieId),
    supabase
      .from('streams')
      .select('server_name, episode_slug, source')
      .eq('movie_id', movieId)
      .eq('source', provider.sourceSite),
  ]);

  if (adminSelectError) throw new Error(`movie_episodes select ${detail.movie.slug}: ${adminSelectError.message}`);
  if (episodeSelectError) throw new Error(`episodes select ${detail.movie.slug}: ${episodeSelectError.message}`);
  if (streamSelectError) throw new Error(`streams select ${detail.movie.slug}: ${streamSelectError.message}`);

  const existingAdmin = new Set((existingAdminRows || []).map((row) => `${String(row.server_name || '').trim().toLowerCase()}|${Number(row.episode_number || 0)}`));
  const existingEpisodes = new Set((existingEpisodeRows || []).map((row) => `${String(row.server_name || '').trim().toLowerCase()}|${String(row.episode_slug || '').trim().toLowerCase()}`));
  const existingStreams = new Set((existingStreamRows || []).map((row) => `${String(row.server_name || '').trim().toLowerCase()}|${String(row.episode_slug || '').trim().toLowerCase()}|${String(row.source || '').trim().toLowerCase()}`));
  const plannedAdmin = new Set<string>();
  const plannedEpisodes = new Set<string>();
  const plannedStreams = new Set<string>();

  const movieEpisodeRows = [];
  const episodeRows = [];
  const streamRows = [];

  for (const ep of parsedEpisodes) {
    const adminKey = `${ep.serverName.trim().toLowerCase()}|${ep.number}`;
    if (!existingAdmin.has(adminKey) && !plannedAdmin.has(adminKey)) {
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
        is_backup: false,
      });
    }

    const episodeKey = `${ep.serverName.trim().toLowerCase()}|${ep.epSlug.trim().toLowerCase()}`;
    if (!existingEpisodes.has(episodeKey) && !plannedEpisodes.has(episodeKey)) {
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
    if (!existingStreams.has(streamKey) && !plannedStreams.has(streamKey)) {
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
      });
    }
  }

  for (const batch of chunks(movieEpisodeRows, 500)) {
    const { error } = await supabase
      .from('movie_episodes')
      .upsert(batch, { onConflict: 'movie_id,server_name,episode_number' });
    if (error) throw new Error(`movie_episodes upsert ${detail.movie.slug}: ${error.message}`);
  }
  for (const batch of chunks(episodeRows, 500)) {
    const { error } = await supabase
      .from('episodes')
      .upsert(batch, { onConflict: 'movie_id,server_name,episode_slug' });
    if (error) throw new Error(`episodes upsert ${detail.movie.slug}: ${error.message}`);
  }
  for (const batch of chunks(streamRows, 500)) {
    const { error } = await supabase
      .from('streams')
      .upsert(batch, { onConflict: 'movie_id,episode_slug,source,server_name' });
    if (error) throw new Error(`streams upsert ${detail.movie.slug}: ${error.message}`);
  }

  return movieEpisodeRows.length;
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
      metadata: { ...metadata, created: stats.created, updated: stats.updated, episodes_inserted: stats.episodesInserted },
    });
  } catch {
    /* optional log table */
  }
}

async function clearCaches(supabase: SupabaseClient): Promise<void> {
  await Promise.allSettled([
    supabase.from('home_page_cache').delete().neq('id', '__never__'),
    supabase.from('movie_api_cache').delete().neq('slug', '__never__'),
  ]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const started = Date.now();
  const url = new URL(req.url);
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const secret = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  if (cronSecret && secret !== cronSecret) return json({ success: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase env' }, 500);

  const pages = Math.max(1, Math.min(Number(url.searchParams.get('pages') || 2), 20));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 48), 200));
  const dryRun = url.searchParams.get('dry_run') === '1';
  const includeEpisodes = url.searchParams.get('episodes') === '1';
  const provider = providerFromParam(url.searchParams.get('provider'));
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const stats: SyncStats = { scanned: 0, created: 0, updated: 0, episodesInserted: 0, skipped: 0, errors: [] };

  try {
    const requestedStartPage = Math.max(1, Number(url.searchParams.get('start_page') || url.searchParams.get('page') || 1) || 1);
    const maxPage = Math.max(1, Number(url.searchParams.get('max_page') || 5000) || 5000);
    const useCursor = url.searchParams.get('cursor') === '1' || url.searchParams.get('backfill') === '1';
    const cursorKey = String(url.searchParams.get('cursor_key') || `sync-ophim-movies:${provider.sourceSite}:backfill`);
    const startPage = useCursor ? await readCursorPage(supabase, cursorKey, requestedStartPage) : requestedStartPage;
    const candidates = new Map<string, OPhimMovie>();
    let pagesWithItems = 0;

    for (let page = startPage; page < startPage + pages; page += 1) {
      const payload = await fetchJsonFromMirrors(provider, provider.listPath(page));
      const items = listItems(payload);
      if (items.length > 0) pagesWithItems += 1;
      for (const item of items) {
        if (item.slug && !candidates.has(item.slug)) candidates.set(item.slug, item);
      }
    }

    const slugs = Array.from(candidates.keys()).slice(0, limit);
    for (const slug of slugs) {
      stats.scanned += 1;
      try {
        const detail = await fetchDetail(provider, slug);
        if (!detail) {
          stats.skipped += 1;
          stats.errors.push(`[${slug}] detail not found`);
          continue;
        }
        if (dryRun) continue;
        const result = await upsertMovie(supabase, provider, detail);
        if (result.created) stats.created += 1;
        if (result.updated) stats.updated += 1;
        if (includeEpisodes) {
          stats.episodesInserted += await insertEpisodes(supabase, provider, result.id, detail);
        }
      } catch (error) {
        stats.errors.push(`[${slug}] ${error instanceof Error ? error.message : String(error)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (!dryRun && (stats.created > 0 || stats.updated > 0 || stats.episodesInserted > 0)) {
      await clearCaches(supabase);
    }

    const nextPage = pagesWithItems === 0 || startPage + pages > maxPage ? 1 : startPage + pages;
    if (useCursor && !dryRun) await writeCursorPage(supabase, cursorKey, nextPage);

    const elapsedMs = Date.now() - started;
    const metadata = {
      provider: provider.sourceSite,
      pages,
      limit,
      start_page: startPage,
      next_page: nextPage,
      pages_with_items: pagesWithItems,
      dry_run: dryRun,
      include_episodes: includeEpisodes,
      cursor: useCursor ? cursorKey : null,
    };
    await writeLog(supabase, stats, elapsedMs, metadata);
    return json({
      success: stats.errors.length === 0,
      provider: provider.sourceSite,
      start_page: startPage,
      next_page: nextPage,
      scanned: stats.scanned,
      created: stats.created,
      updated: stats.updated,
      episodes_inserted: stats.episodesInserted,
      skipped: stats.skipped,
      errors: stats.errors,
      include_episodes: includeEpisodes,
      elapsed_ms: elapsedMs,
    }, stats.errors.length ? 207 : 200);
  } catch (error) {
    const elapsedMs = Date.now() - started;
    stats.errors.push(error instanceof Error ? error.message : String(error));
    await writeLog(supabase, stats, elapsedMs, { provider: provider.sourceSite, pages, limit, dry_run: dryRun, include_episodes: includeEpisodes });
    return json({ success: false, error: stats.errors[0], elapsed_ms: elapsedMs }, 500);
  }
});
