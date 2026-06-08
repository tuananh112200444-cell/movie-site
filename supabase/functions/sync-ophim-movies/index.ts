import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const OPHIM_BASES = [
  'https://ophim1.com',
  'https://ophim.tv',
  'https://ophim9.cc',
  'https://ophim8.cc',
];

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

function escapePostgrestIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, ' ');
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

async function fetchJsonFromMirrors(path: string, timeoutMs = 12000): Promise<Record<string, unknown> | null> {
  for (const base of OPHIM_BASES) {
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

async function fetchDetail(slug: string): Promise<ParsedDetail | null> {
  const payload = await fetchJsonFromMirrors(`/v1/api/phim/${encodeURIComponent(slug)}`);
  return parseDetail(payload as DetailPayload | null, slug);
}

function moviePayload(detail: ParsedDetail): Record<string, unknown> {
  const movie = detail.movie;
  const now = new Date().toISOString();
  const name = String(movie.name || movie.slug || 'Phim');
  const originName = String(movie.origin_name || '');
  const slug = String(movie.slug || slugify(name));
  const currentEpisode = getCurrentEpisode(movie, detail.episodes);

  return {
    slug,
    ophim_slug: slug,
    ophim_id: String(movie._id || movie.id || ''),
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
    source_site: 'ophim',
    source_name: 'OPhim',
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
      .select('id,slug,source_site,source_name,current_episode,total_episodes,episode_current')
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
      .select('id,slug,name,origin_name,title_vi,title_en,source_site,source_name,current_episode,total_episodes,episode_current')
      .eq('year', year)
      .or(`name.ilike.%${safe}%,origin_name.ilike.%${safe}%,title_vi.ilike.%${safe}%,title_en.ilike.%${safe}%`)
      .limit(10);
    const titleKey = normalizeText(title);
    const match = ((data || []) as Record<string, unknown>[]).find((row) =>
      [row.name, row.origin_name, row.title_vi, row.title_en].map((v) => normalizeText(String(v || ''))).includes(titleKey)
    );
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

async function upsertMovie(supabase: SupabaseClient, detail: ParsedDetail): Promise<{ id: string; created: boolean; updated: boolean }> {
  const payload = moviePayload(detail);
  const existing = await findExistingMovie(supabase, payload);

  if (existing?.id) {
    const update = updatePayloadForExisting(existing, payload);
    const { error } = await supabase.from('movies').update(update).eq('id', existing.id as string);
    if (error) throw new Error(`movies update ${payload.slug}: ${error.message}`);
    return { id: String(existing.id), created: false, updated: true };
  }

  const { data, error } = await supabase.from('movies').insert(payload).select('id').single();
  if (error) throw new Error(`movies insert ${payload.slug}: ${error.message}`);
  return { id: String(data.id), created: true, updated: false };
}

async function insertEpisodes(supabase: SupabaseClient, movieId: string, detail: ParsedDetail): Promise<number> {
  let inserted = 0;
  const ophimId = String(detail.movie._id || detail.movie.id || '');

  for (const server of detail.episodes) {
    const serverName = String(server.server_name || 'OPhim');
    for (const ep of server.server_data || []) {
      const number = episodeNumber(ep);
      if (!number) continue;
      const epName = String(ep.name || (number === 1 ? 'Full' : `Tap ${number}`));
      const epSlug = String(ep.slug || slugify(epName));
      const linkM3u8 = String(ep.link_m3u8 || '');
      const linkEmbed = String(ep.link_embed || '');
      if (!linkM3u8 && !linkEmbed) continue;

      const { data: existingAdmin } = await supabase
        .from('movie_episodes')
        .select('id')
        .eq('movie_id', movieId)
        .eq('source', 'ophim')
        .eq('episode_number', number)
        .limit(1)
        .maybeSingle();

      if (!existingAdmin) {
        const { error } = await supabase.from('movie_episodes').insert({
          movie_id: movieId,
          ophim_id: ophimId,
          episode_number: number,
          episode_name: epName,
          slug: epSlug,
          server_name: serverName,
          link_m3u8: linkM3u8,
          link_embed: linkEmbed,
          thumbnail_url: '',
          duration: '',
          source: 'ophim',
          is_backup: false,
        });
        if (!error) inserted += 1;
      }

      const { data: existingEpisode } = await supabase
        .from('episodes')
        .select('id')
        .eq('movie_id', movieId)
        .eq('server_name', serverName)
        .eq('episode_number', number)
        .limit(1)
        .maybeSingle();

      if (!existingEpisode) {
        await supabase.from('episodes').insert({
          movie_id: movieId,
          ophim_id: ophimId,
          server_name: serverName,
          episode_number: number,
          episode_name: epName,
          episode_slug: epSlug,
          link_m3u8: linkM3u8,
          link_embed: linkEmbed,
          server_data: ep,
        });
      }

      const { data: existingStream } = await supabase
        .from('streams')
        .select('id')
        .eq('movie_id', movieId)
        .eq('server_name', serverName)
        .eq('episode_slug', epSlug)
        .limit(1)
        .maybeSingle();

      if (!existingStream) {
        await supabase.from('streams').insert({
          movie_id: movieId,
          ophim_id: ophimId,
          server_name: serverName,
          episode_slug: epSlug,
          stream_url: linkM3u8,
          embed_url: linkEmbed,
          source: 'ophim',
          is_active: true,
        });
      }
    }
  }

  return inserted;
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

  const pages = Math.max(1, Math.min(Number(url.searchParams.get('pages') || 2), 10));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 48), 200));
  const dryRun = url.searchParams.get('dry_run') === '1';
  const includeEpisodes = url.searchParams.get('episodes') === '1';
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const stats: SyncStats = { scanned: 0, created: 0, updated: 0, episodesInserted: 0, skipped: 0, errors: [] };

  try {
    const candidates = new Map<string, OPhimMovie>();
    for (let page = 1; page <= pages; page += 1) {
      const payload = await fetchJsonFromMirrors(`/v1/api/danh-sach/phim-moi-cap-nhat?page=${page}&sort_field=modified.time&sort_type=desc`);
      for (const item of listItems(payload)) {
        if (item.slug && !candidates.has(item.slug)) candidates.set(item.slug, item);
      }
    }

    const slugs = Array.from(candidates.keys()).slice(0, limit);
    for (const slug of slugs) {
      stats.scanned += 1;
      try {
        const detail = await fetchDetail(slug);
        if (!detail) {
          stats.skipped += 1;
          stats.errors.push(`[${slug}] detail not found`);
          continue;
        }
        if (dryRun) continue;
        const result = await upsertMovie(supabase, detail);
        if (result.created) stats.created += 1;
        if (result.updated) stats.updated += 1;
        if (includeEpisodes) {
          stats.episodesInserted += await insertEpisodes(supabase, result.id, detail);
        }
      } catch (error) {
        stats.errors.push(`[${slug}] ${error instanceof Error ? error.message : String(error)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (!dryRun && (stats.created > 0 || stats.updated > 0 || stats.episodesInserted > 0)) {
      await clearCaches(supabase);
    }

    const elapsedMs = Date.now() - started;
    await writeLog(supabase, stats, elapsedMs, { pages, limit, dry_run: dryRun, include_episodes: includeEpisodes });
    return json({
      success: stats.errors.length === 0,
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
    await writeLog(supabase, stats, elapsedMs, { pages, limit, dry_run: dryRun, include_episodes: includeEpisodes });
    return json({ success: false, error: stats.errors[0], elapsed_ms: elapsedMs }, 500);
  }
});
