import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FEED_URL = 'https://www.blogger.com/feeds/6087760537213062341/posts/default';
const SOURCE_SITE = 'blvietsub';
const SOURCE_NAME = 'BLVietsub';
const TAP_LABEL = 'T\u1eadp';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SupabaseClient = ReturnType<typeof createClient>;

interface BloggerEntry {
  id?: { $t?: string };
  title?: { $t?: string };
  content?: { $t?: string };
  published?: { $t?: string };
  updated?: { $t?: string };
  link?: Array<{ rel?: string; href?: string }>;
}

interface BloggerFeedResponse {
  feed?: { entry?: BloggerEntry[] };
}

interface ParsedEpisode {
  episode_number: number;
  episode_name: string;
  slug: string;
  link_embed: string;
}

interface MovieRow {
  id: string;
  slug: string;
  name?: string | null;
  origin_name?: string | null;
  title_vi?: string | null;
  title_en?: string | null;
  showtimes?: string | null;
  episode_current?: string | null;
  current_episode?: number | null;
  total_episodes?: number | null;
}

interface ParsedEntry {
  postId: string;
  title: string;
  originName: string;
  sourceUrl: string;
  updatedAt: string;
  episodes: ParsedEpisode[];
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
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripTags(html = ''): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPostId(entry: BloggerEntry): string {
  return String(entry.id?.$t || '').match(/post-(\d+)/)?.[1] || '';
}

function getAlternateLink(entry: BloggerEntry): string {
  return entry.link?.find((link) => link.rel === 'alternate')?.href || '';
}

function getOriginName(content = ''): string {
  return stripTags(
    content.match(/(?:T\u00ean kh\u00e1c|T\u00ean g\u1ed1c|Original name|Other name):\s*<\/?[^>]*>\s*<span>([\s\S]*?)<\/span>/i)?.[1] || '',
  );
}

function parseEpisodes(content = ''): ParsedEpisode[] {
  const byNumber = new Map<number, ParsedEpisode>();
  for (const match of content.matchAll(/data-embed=["']([^"']+)["'][\s\S]*?<span>([^<]+)<\/span>/gi)) {
    const embed = match[1].replace(/&amp;/g, '&').trim();
    const label = match[2].trim();
    const episodeNumber = Number(label.match(/\d+/)?.[0] || 0);
    if (!episodeNumber || !embed) continue;

    let host = '';
    try {
      host = new URL(embed).hostname.toLowerCase();
    } catch {
      continue;
    }

    if (!host.includes('ssplay')) continue;
    if (byNumber.has(episodeNumber)) continue;
    byNumber.set(episodeNumber, {
      episode_number: episodeNumber,
      episode_name: `${TAP_LABEL} ${episodeNumber}`,
      slug: `tap-${episodeNumber}`,
      link_embed: embed,
    });
  }
  return [...byNumber.values()].sort((a, b) => a.episode_number - b.episode_number);
}

function parseEntry(entry: BloggerEntry): ParsedEntry | null {
  const postId = getPostId(entry);
  const content = entry.content?.$t || '';
  const episodes = parseEpisodes(content);
  if (!postId || episodes.length === 0) return null;
  return {
    postId,
    title: entry.title?.$t || '',
    originName: getOriginName(content),
    sourceUrl: getAlternateLink(entry) || `https://www.blvietsub.top/?p=${postId}`,
    updatedAt: entry.updated?.$t || entry.published?.$t || new Date().toISOString(),
    episodes,
  };
}

function extractPostIdFromMovie(movie: MovieRow): string {
  return String(movie.showtimes || movie.slug || '').match(/(?:p=|post-|blvietsub-)(\d+)/)?.[1] || '';
}

function getMovieCurrentEpisode(movie: MovieRow): number {
  return Math.max(
    Number(movie.current_episode || 0),
    Number(String(movie.episode_current || '').match(/\d+/)?.[0] || 0),
  );
}

function buildEntryIndexes(entries: ParsedEntry[]) {
  const byPostId = new Map<string, ParsedEntry>();
  const byTitle = new Map<string, ParsedEntry>();
  for (const entry of entries) {
    byPostId.set(entry.postId, entry);
    for (const key of [entry.title, entry.originName].map(normalizeText).filter(Boolean)) {
      if (!byTitle.has(key)) byTitle.set(key, entry);
    }
  }
  return { byPostId, byTitle };
}

function findEntryForMovie(
  movie: MovieRow,
  indexes: ReturnType<typeof buildEntryIndexes>,
): ParsedEntry | null {
  const postId = extractPostIdFromMovie(movie);
  if (postId && indexes.byPostId.has(postId)) return indexes.byPostId.get(postId) || null;

  for (const key of [movie.name, movie.origin_name, movie.title_vi, movie.title_en].map((value) => normalizeText(value || '')).filter(Boolean)) {
    const entry = indexes.byTitle.get(key);
    if (entry) return entry;
  }
  return null;
}

async function insertMissingEpisodes(
  supabase: SupabaseClient,
  movie: MovieRow,
  entry: ParsedEntry,
): Promise<number> {
  const { data: existingRows, error } = await supabase
    .from('movie_episodes')
    .select('episode_number')
    .eq('movie_id', movie.id)
    .eq('server_name', 'SS');

  if (error) throw new Error(`movie_episodes select ${movie.slug}: ${error.message}`);

  const existing = new Set((existingRows || []).map((row) => Number(row.episode_number || 0)));
  const rows = entry.episodes
    .filter((episode) => !existing.has(episode.episode_number))
    .map((episode) => ({
      movie_id: movie.id,
      episode_number: episode.episode_number,
      episode_name: episode.episode_name,
      slug: episode.slug,
      server_name: 'SS',
      link_m3u8: '',
      link_embed: episode.link_embed,
      subtitle_url: '',
      thumbnail_url: '',
      duration: '',
      source: SOURCE_SITE,
      is_backup: false,
    }));

  if (rows.length === 0) return 0;
  const { error: insertError } = await supabase.from('movie_episodes').insert(rows);
  if (insertError) throw new Error(`movie_episodes insert ${movie.slug}: ${insertError.message}`);
  return rows.length;
}

async function updateMovieMetadata(
  supabase: SupabaseClient,
  movie: MovieRow,
  entry: ParsedEntry,
): Promise<boolean> {
  const liveMax = Math.max(...entry.episodes.map((episode) => episode.episode_number));
  const current = getMovieCurrentEpisode(movie);
  const update: Record<string, unknown> = {
    showtimes: entry.sourceUrl || `https://www.blvietsub.top/?p=${entry.postId}`,
    source_site: movie.slug.startsWith('blvietsub-') ? SOURCE_SITE : undefined,
    source_name: movie.slug.startsWith('blvietsub-') ? SOURCE_NAME : undefined,
  };

  if (liveMax > current) {
    update.episode_current = `${TAP_LABEL} ${liveMax}`;
    update.current_episode = liveMax;
    if (!movie.total_episodes || movie.total_episodes < liveMax) update.total_episodes = liveMax;
  }

  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
  if (Object.keys(update).length === 0) return false;

  const { error } = await supabase.from('movies').update(update).eq('id', movie.id);
  if (error) throw new Error(`movies update ${movie.slug}: ${error.message}`);
  return true;
}

async function writeSyncLog(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('sync_logs').insert({
      function_name: 'sync-blvietsub-feed',
      run_at: new Date().toISOString(),
      scanned: payload.scanned,
      added: payload.inserted,
      skipped: payload.matched,
      errors: Array.isArray(payload.errors) ? payload.errors.length : 0,
      details: payload.errors,
      elapsed_ms: payload.elapsed_ms,
      success: Array.isArray(payload.errors) ? payload.errors.length === 0 : true,
    });
  } catch {
    /* sync_logs is optional */
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  if (cronSecret && secret !== cronSecret) return json({ success: false, error: 'Unauthorized' }, 401);

  const started = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase env' }, 500);

  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 500), 500));
  const supabase = createClient(supabaseUrl, serviceKey);
  const errors: string[] = [];

  try {
    const feedResponse = await fetch(`${FEED_URL}?alt=json&max-results=${limit}`, {
      headers: { 'User-Agent': 'KhoPhim-BLVietsub-Sync/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!feedResponse.ok) throw new Error(`BLVietsub feed ${feedResponse.status}`);

    const feed = (await feedResponse.json()) as BloggerFeedResponse;
    const entries = (feed.feed?.entry || []).map(parseEntry).filter(Boolean) as ParsedEntry[];
    const indexes = buildEntryIndexes(entries);

    const { data: movies, error: moviesError } = await supabase
      .from('movies')
      .select('id, slug, name, origin_name, title_vi, title_en, showtimes, episode_current, current_episode, total_episodes')
      .eq('is_published', true)
      .or('source_site.ilike.%admin-queer%,source_site.ilike.%blvietsub%,source_name.ilike.%blvietsub%')
      .limit(500);

    if (moviesError) throw new Error(`movies select: ${moviesError.message}`);

    let matched = 0;
    let inserted = 0;
    let updated = 0;
    const missing: string[] = [];

    for (const movie of (movies || []) as MovieRow[]) {
      const entry = findEntryForMovie(movie, indexes);
      if (!entry) {
        missing.push(movie.slug);
        continue;
      }

      matched += 1;
      try {
        inserted += await insertMissingEpisodes(supabase, movie, entry);
        if (await updateMovieMetadata(supabase, movie, entry)) updated += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const result = {
      success: errors.length === 0,
      feed_entries: entries.length,
      scanned: movies?.length || 0,
      matched,
      missing,
      inserted,
      updated,
      errors,
      elapsed_ms: Date.now() - started,
    };
    await writeSyncLog(supabase, result);
    return json(result, errors.length ? 207 : 200);
  } catch (error) {
    const result = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - started,
    };
    return json(result, 500);
  }
});
