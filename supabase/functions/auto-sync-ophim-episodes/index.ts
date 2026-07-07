import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Auto Sync OPhim Episodes — Cron-triggered edge function
 * Runs every 5 minutes to fetch new episodes from OPhim and insert into:
 *  - movie_episodes (admin table, deduped)
 *  - episodes (normalized per-episode table with episode_number INT)
 *  - streams (individual stream per row)
 * Logic: ONLY INSERT if episode doesn't exist for this movie + episode_number + source='ophim' + is_backup=false
 * Never updates or overwrites existing episodes (including admin-added backups).
 */

interface OPhimEpisode {
  name: string;
  slug: string;
  filename: string;
  link_embed: string;
  link_m3u8: string;
}

interface OPhimServer {
  server_name: string;
  server_data: OPhimEpisode[];
}

interface OPhimResponse {
  status: boolean | string;
  movie?: {
    _id?: string;
    name?: string;
    slug?: string;
    episode_current?: string;
    episode_total?: string;
  };
  data?: {
    item?: {
      _id?: string;
      name?: string;
      origin_name?: string;
      slug?: string;
      episode_current?: string;
      episode_total?: string;
      episodes?: OPhimServer[];
    };
    items?: Array<{
      _id?: string;
      name?: string;
      origin_name?: string;
      slug?: string;
      episode_current?: string;
      year?: number;
    }>;
  };
  item?: {
    _id?: string;
    name?: string;
    origin_name?: string;
    slug?: string;
    episode_current?: string;
    episode_total?: string;
    episodes?: OPhimServer[];
  };
  episodes?: OPhimServer[];
}

interface MovieRow {
  id: string;
  ophim_id?: string | null;
  ophim_slug?: string | null;
  slug: string;
  name?: string | null;
  origin_name?: string | null;
  title_vi?: string | null;
  title_en?: string | null;
  year?: number | null;
  episode_current?: string | null;
  current_episode?: number | null;
  total_episodes?: number | null;
  status?: string | null;
  source_site?: string | null;
  source_name?: string | null;
  showtimes?: string | null;
  updated_at?: string | null;
  last_synced_at?: string | null;
}

interface ParsedOPhimDetail {
  id: string;
  slug: string;
  name: string;
  originName: string;
  episodeCurrent: string;
  episodeTotal: string;
  episodes: OPhimServer[];
}

function isDuplicateDbError(error: { code?: string; message?: string } | null | undefined): boolean {
  const text = String(error?.message || '').toLowerCase();
  return error?.code === '23505' || text.includes('duplicate') || text.includes('unique constraint');
}

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
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

function getMovieTitle(movie: MovieRow): string {
  return String(movie.origin_name || movie.title_en || movie.name || movie.title_vi || '').trim();
}

function getMovieCurrentEpisode(movie: MovieRow): number {
  const parse = (value = ''): number => {
    const text = String(value || '').toLowerCase();
    const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
    if (slash) return Number(slash[1] || 0) || 0;
    const range = text.match(/(?:tap|ep|episode|tập)?\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
    if (range) return Number(range[2] || 0) || Number(range[1] || 0) || 0;
    const matches = [...text.matchAll(/(\d{1,4})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
    return matches.length ? Math.max(...matches) : 0;
  };
  return Math.max(
    Number(movie.current_episode || 0),
    parse(movie.episode_current || ''),
  );
}

function getTotalEpisodeNumber(value = ''): number {
  const text = String(value || '').toLowerCase();
  const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slash) return Number(slash[2] || 0) || 0;
  const matches = [...text.matchAll(/(\d{1,4})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : 0;
}

async function upsertNormalizedEpisodeSafely(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await supabase.from('episodes').upsert(row, {
    onConflict: 'movie_id,server_name,episode_slug',
    ignoreDuplicates: true,
  });
  if (!error) return null;
  if (!isDuplicateDbError(error)) return error.message;

  const { data: existing, error: lookupError } = await supabase
    .from('episodes')
    .select('id')
    .eq('movie_id', row.movie_id as string)
    .ilike('server_name', String(row.server_name || '').trim())
    .ilike('episode_slug', String(row.episode_slug || '').trim())
    .limit(1)
    .maybeSingle();
  if (lookupError) return lookupError.message;
  if (!existing?.id) return null;

  const { error: updateError } = await supabase
    .from('episodes')
    .update({
      ophim_id: row.ophim_id,
      server_name: row.server_name,
      episode_number: row.episode_number,
      episode_name: row.episode_name,
      episode_slug: row.episode_slug,
      link_m3u8: row.link_m3u8,
      link_embed: row.link_embed,
      server_data: row.server_data,
    })
    .eq('id', existing.id);
  return updateError?.message || null;
}

async function upsertStreamSafely(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await supabase.from('streams').upsert(row, {
    onConflict: 'movie_id,episode_slug,source,server_name',
    ignoreDuplicates: true,
  });
  if (!error) return null;
  if (!isDuplicateDbError(error)) return error.message;

  const { data: existing, error: lookupError } = await supabase
    .from('streams')
    .select('id')
    .eq('movie_id', row.movie_id as string)
    .eq('source', String(row.source || '').trim())
    .eq('is_active', true)
    .ilike('server_name', String(row.server_name || '').trim())
    .ilike('episode_slug', String(row.episode_slug || '').trim())
    .limit(1)
    .maybeSingle();
  if (lookupError) return lookupError.message;
  if (!existing?.id) return null;

  const { error: updateError } = await supabase
    .from('streams')
    .update({
      ophim_id: row.ophim_id,
      server_name: row.server_name,
      episode_slug: row.episode_slug,
      stream_url: row.stream_url,
      embed_url: row.embed_url,
      source: row.source,
      is_active: row.is_active,
    })
    .eq('id', existing.id);
  return updateError?.message || null;
}

function isCompletedText(value: unknown): boolean {
  const text = normalizeText(String(value || ''));
  return text.includes('completed') || text.includes('complete') || text.includes('hoan tat') || text.includes('full');
}

function shouldRoutineSyncMovie(movie: MovieRow, includeCompleted: boolean): boolean {
  if (includeCompleted) return true;
  const current = getMovieCurrentEpisode(movie);
  const total = Number(movie.total_episodes || 0);
  const looksCompleted = isCompletedText(movie.status) || isCompletedText(movie.episode_current);

  if (!looksCompleted) return true;
  if (!total) return true;
  return current > 0 && current < total;
}

function tokenCount(value = ''): number {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function getEpisodeNumber(ep: OPhimEpisode): number {
  const parse = (value = ''): number => {
    const text = String(value || '').toLowerCase();
    const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
    if (slash) return Number(slash[1] || 0) || 0;
    const range = text.match(/(?:tap|ep|episode|tập)?\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
    if (range) return Number(range[2] || 0) || Number(range[1] || 0) || 0;
    const matches = [...text.matchAll(/(\d{1,4})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
    return matches.length ? Math.max(...matches) : 0;
  };
  const fromName = parse(ep.name || '');
  if (fromName) return fromName;
  return parse(ep.slug || '');
}

function parseOPhimDetail(data: OPhimResponse, fallbackSlug: string): ParsedOPhimDetail | null {
  const item = data.data?.item || data.item || data.movie || null;
  const episodes = data.data?.item?.episodes || data.item?.episodes || data.episodes || [];
  const ok = data.status === true || data.status === 'success';
  if (!ok || !item || !Array.isArray(episodes) || episodes.length === 0) return null;

  return {
    id: String(item._id || ''),
    slug: String(item.slug || fallbackSlug),
    name: String(item.name || ''),
    originName: String('origin_name' in item ? item.origin_name || '' : ''),
    episodeCurrent: String(item.episode_current || ''),
    episodeTotal: String(item.episode_total || ''),
    episodes,
  };
}

const OPHIM_MIRRORS = ['https://ophim1.com', 'https://ophim.tv', 'https://ophim9.cc', 'https://ophim8.cc'];

async function fetchOPhimDetail(slug: string): Promise<ParsedOPhimDetail | null> {
  if (!slug) return null;
  for (const base of OPHIM_MIRRORS) {
    try {
      const apiUrl = `${base}/v1/api/phim/${encodeURIComponent(slug)}`;
      const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
      if (!apiRes.ok) continue;
      const detail = parseOPhimDetail((await apiRes.json()) as OPhimResponse, slug);
      if (detail) return detail;
    } catch {
      /* try next mirror */
    }
  }
  return null;
}

async function findOPhimSlug(movie: MovieRow): Promise<string> {
  const title = getMovieTitle(movie);
  if (!title) return '';
  let data: OPhimResponse | null = null;
  for (const base of OPHIM_MIRRORS) {
    try {
      const searchUrl = `${base}/v1/api/tim-kiem?keyword=${encodeURIComponent(title)}&limit=5`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      data = (await res.json()) as OPhimResponse;
      break;
    } catch {
      /* try next mirror */
    }
  }
  if (!data) return '';
  const items = data.data?.items || [];
  if (!Array.isArray(items) || items.length === 0) return '';

  const movieKeys = [movie.name, movie.origin_name, movie.title_vi, movie.title_en]
    .map((value) => normalizeText(String(value || '')))
    .filter(Boolean);

  const exact = items.find((item) => {
    if (movie.year && item.year && Math.abs(Number(item.year) - Number(movie.year)) > 1) return false;
    const itemKeys = [item.name, item.origin_name].map((value) => normalizeText(String(value || ''))).filter(Boolean);
    return itemKeys.some((itemKey) => movieKeys.includes(itemKey));
  });
  if (exact) return String(exact.slug || '');

  const reliableTitle = [movie.origin_name, movie.title_en, movie.name, movie.title_vi]
    .map((value) => String(value || '').trim())
    .find((value) => tokenCount(value) >= 3);
  if (!reliableTitle) return '';

  const reliableKey = normalizeText(reliableTitle);
  const contains = items.find((item) => {
    if (movie.year && item.year && Math.abs(Number(item.year) - Number(movie.year)) > 1) return false;
    return [item.name, item.origin_name]
      .map((value) => normalizeText(String(value || '')))
      .some((itemKey) => itemKey.includes(reliableKey) || reliableKey.includes(itemKey));
  });
  return String(contains?.slug || '');
}

function isLikelyOPhimMovie(movie: MovieRow): boolean {
  const source = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  return Boolean(
    String(movie.ophim_slug || '').trim() ||
    String(movie.ophim_id || '').trim() ||
    source.includes('ophim')
  );
}

async function resolveOPhimDetail(movie: MovieRow): Promise<ParsedOPhimDetail | null> {
  if (!isLikelyOPhimMovie(movie)) return null;
  const candidates = [
    String(movie.ophim_slug || '').trim(),
    String(movie.ophim_id || '').trim(),
    await findOPhimSlug(movie),
  ].filter(Boolean);

  for (const candidate of Array.from(new Set(candidates))) {
    const detail = await fetchOPhimDetail(candidate);
    if (detail) return detail;
  }
  return null;
}

async function logSyncResult(
  supabase: ReturnType<typeof createClient>,
  payload: {
    function_name: string;
    run_at: string;
    scanned: number;
    added: number;
    skipped: number;
    errors: number;
    details: string[];
    elapsed_ms: number;
    success: boolean;
  }
) {
  try {
    await supabase.from('sync_logs').insert({
      function_name: payload.function_name,
      run_at: payload.run_at,
      scanned: payload.scanned,
      added: payload.added,
      skipped: payload.skipped,
      errors: payload.errors,
      details: payload.details,
      elapsed_ms: payload.elapsed_ms,
      success: payload.success,
    });
  } catch (e) {
    console.warn('[auto-sync] Failed to write sync_logs:', e);
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ─── Secret check (cron security) ───
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET');

  if (cronSecret && secret !== cronSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized — invalid or missing cron secret' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!cronSecret) {
    console.warn('[auto-sync] CRON_SECRET not set — running without auth. Set CRON_SECRET in Supabase secrets for production.');
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ─── Fetch movies that have ophim_id ───
    // Order by oldest updated first so every movie gets synced eventually
    const targetSlug = url.searchParams.get('slug')?.trim() || '';
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 80), 1), 200);
    const delayMs = Math.min(Math.max(Number(url.searchParams.get('delay_ms') || 250), 0), 1000);
    const includeCompleted = url.searchParams.get('include_completed') === '1' || Boolean(targetSlug);
    const queryLimit = targetSlug ? 1 : Math.min(limit * 4, 500);

    let moviesQuery = supabase
      .from('movies')
      .select('id, ophim_id, ophim_slug, slug, name, origin_name, title_vi, title_en, year, episode_current, current_episode, total_episodes, status, source_site, source_name, showtimes, updated_at, last_synced_at')
      .eq('is_published', true)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(queryLimit);

    if (targetSlug) {
      moviesQuery = moviesQuery.eq('slug', targetSlug);
    } else {
      moviesQuery = moviesQuery.or('ophim_id.not.is.null,ophim_slug.not.is.null,source_site.ilike.%ophim%,source_name.ilike.%ophim%');
    }

    const { data: movies, error: moviesErr } = await moviesQuery;

    if (moviesErr) {
      throw new Error(`Failed to fetch movies: ${moviesErr.message}`);
    }

    const eligibleMovies = ((movies || []) as MovieRow[])
      .filter((movie) => shouldRoutineSyncMovie(movie, includeCompleted))
      .slice(0, limit);

    if (eligibleMovies.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No ongoing or incomplete movies eligible for OPhim sync found.',
          movies_processed: 0,
          episodes_inserted: 0,
          episodes_skipped: 0,
          scanned_pool: movies?.length || 0,
          completed_skipped: (movies?.length || 0) - eligibleMovies.length,
          errors: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalInserted = 0;
    let totalSkipped = 0;
    const errorDetails: string[] = [];
    const skippedDetails: string[] = [];

    // ─── Process each movie ───
    for (const movie of eligibleMovies) {
      try {
        const detail = await resolveOPhimDetail(movie as MovieRow);
        if (!detail) {
          totalSkipped++;
          skippedDetails.push(`[${movie.slug}] OPhim detail not found`);
          await supabase
            .from('movies')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', movie.id);
          continue;
        }

        let movieInserted = 0;
        let movieSkipped = 0;
        let maxEpisode = 0;

        for (const server of detail.episodes) {
          const serverName = server.server_name || 'OPhim';
          const episodes = server.server_data || [];

          for (const ep of episodes) {
            // Parse episode number
            const episodeNumber = getEpisodeNumber(ep);
            if (!episodeNumber) {
              console.warn(`[auto-sync] Cannot parse episode number for ${movie.slug}: name="${ep.name}", slug="${ep.slug}"`);
              continue;
            }
            maxEpisode = Math.max(maxEpisode, episodeNumber);

            const epName = ep.name || `Tập ${episodeNumber}`;
            const epSlug = ep.slug || `tap-${episodeNumber}`;

            // ─── Check if this OPhim episode already exists in movie_episodes ───
            const { data: existing } = await supabase
              .from('movie_episodes')
              .select('id')
              .eq('movie_id', movie.id)
              .eq('server_name', serverName)
              .eq('episode_number', episodeNumber)
              .maybeSingle();

            if (existing) {
              movieSkipped++;
              continue; // SKIP — never update existing episodes
            }

            // ─── INSERT into movie_episodes (admin table) ───
            const { error: insertErr } = await supabase.from('movie_episodes').upsert({
              movie_id: movie.id,
              ophim_id: detail.id || detail.slug,
              episode_number: episodeNumber,
              episode_name: epName,
              slug: epSlug,
              server_name: serverName,
              link_m3u8: ep.link_m3u8 || '',
              link_embed: ep.link_embed || '',
              thumbnail_url: '',
              duration: '',
              source: 'ophim',
              is_backup: false,
            }, { onConflict: 'movie_id,server_name,episode_number', ignoreDuplicates: true });

            if (insertErr) {
              if (insertErr.code === '23505' || insertErr.message.toLowerCase().includes('duplicate')) {
                movieSkipped++;
                continue;
              }
              errorDetails.push(`[${movie.slug}] ep ${episodeNumber} movie_episodes: ${insertErr.message}`);
              movieSkipped++;
              continue;
            }

            // ─── INSERT into episodes (normalized per-episode table) ───
            const epInsertError = await upsertNormalizedEpisodeSafely(supabase, {
              movie_id: movie.id,
              ophim_id: detail.id || detail.slug,
              server_name: serverName,
              episode_number: episodeNumber,
              episode_name: epName,
              episode_slug: epSlug,
              link_m3u8: ep.link_m3u8 || '',
              link_embed: ep.link_embed || '',
              server_data: ep,
            });

            if (epInsertError) {
              errorDetails.push(`[${movie.slug}] ep ${episodeNumber} episodes: ${epInsertError}`);
            }

            // ─── INSERT into streams (individual stream per row) ───
            const streamInsertError = await upsertStreamSafely(supabase, {
              movie_id: movie.id,
              ophim_id: detail.id || detail.slug,
              server_name: serverName,
              episode_slug: epSlug,
              stream_url: ep.link_m3u8 || '',
              embed_url: ep.link_embed || '',
              source: 'ophim',
              is_active: true,
            });

            if (streamInsertError) {
              errorDetails.push(`[${movie.slug}] ep ${episodeNumber} streams: ${streamInsertError}`);
            }

            movieInserted++;
          }
        }

        totalInserted += movieInserted;
        totalSkipped += movieSkipped;

        const previousCurrent = getMovieCurrentEpisode(movie as MovieRow);
        const sourceCurrent = Math.max(getMovieCurrentEpisode({ ...movie, current_episode: 0, episode_current: detail.episodeCurrent } as MovieRow), maxEpisode);
        const previousLooksAheadOfSource =
          sourceCurrent > 0 &&
          previousCurrent > sourceCurrent &&
          Number(movie.total_episodes || 0) > 0 &&
          previousCurrent > Math.max(Number(movie.total_episodes || 0), sourceCurrent);
        const currentEpisode = previousLooksAheadOfSource ? sourceCurrent : Math.max(previousCurrent, sourceCurrent);
        const sourceTotal = Math.max(
          getTotalEpisodeNumber(detail.episodeTotal),
          getTotalEpisodeNumber(detail.episodeCurrent),
          maxEpisode,
        );
        const mergedTotalEpisode = Math.max(
          Number(movie.total_episodes || 0) || 0,
          sourceTotal,
          currentEpisode,
        );
        const movieUpdate: Record<string, unknown> = {
          ophim_id: detail.id || movie.ophim_id || '',
          ophim_slug: detail.slug || movie.ophim_slug || '',
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (sourceTotal > 0 && Number(movie.total_episodes || 0) !== mergedTotalEpisode) {
          movieUpdate.total_episodes = mergedTotalEpisode;
        }

        if (currentEpisode !== previousCurrent) {
          movieUpdate.episode_current = `Tập ${currentEpisode}`;
          movieUpdate.current_episode = currentEpisode;
        }

        await supabase
          .from('movies')
          .update(movieUpdate)
          .eq('id', movie.id);

        // Be nice to OPhim API — small delay between movies
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

      } catch (movieErr) {
        const msg = movieErr instanceof Error ? movieErr.message : String(movieErr);
        errorDetails.push(`[${movie.slug}] ${msg}`);
        console.error(`[auto-sync] Error processing ${movie.slug}:`, msg);
      }
    }

    const duration = Date.now() - startTime;

    await logSyncResult(supabase, {
      function_name: 'auto-sync-ophim-episodes',
      run_at: new Date().toISOString(),
      scanned: eligibleMovies.length,
      added: totalInserted,
      skipped: totalSkipped,
      errors: errorDetails.length,
      details: errorDetails,
      elapsed_ms: duration,
      success: errorDetails.length === 0,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${eligibleMovies.length} movies | Inserted ${totalInserted} new episodes | Skipped ${totalSkipped} existing | Errors: ${errorDetails.length}`,
        movies_processed: eligibleMovies.length,
        scanned_pool: movies?.length || 0,
        completed_skipped: (movies?.length || 0) - eligibleMovies.length,
        include_completed: includeCompleted,
        episodes_inserted: totalInserted,
        episodes_skipped: totalSkipped,
        errors: errorDetails.length > 0 ? errorDetails : undefined,
        skipped_details: skippedDetails.length > 0 ? skippedDetails.slice(0, 30) : undefined,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auto-sync] Fatal error:', msg);

    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
