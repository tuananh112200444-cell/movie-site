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
  };
  data?: {
    item?: {
      _id?: string;
      name?: string;
      origin_name?: string;
      slug?: string;
      episode_current?: string;
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
  episodes: OPhimServer[];
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
  return Math.max(
    Number(movie.current_episode || 0),
    Number(String(movie.episode_current || '').match(/\d+/)?.[0] || 0),
  );
}

function tokenCount(value = ''): number {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function getEpisodeNumber(ep: OPhimEpisode): number {
  const fromName = Number(String(ep.name || '').match(/\d+/)?.[0] || 0);
  if (fromName) return fromName;
  return Number(String(ep.slug || '').match(/\d+/)?.[0] || 0);
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
    // INCREASED LIMIT: 50 instead of 15 for faster coverage
    const targetSlug = url.searchParams.get('slug')?.trim() || '';
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);

    let moviesQuery = supabase
      .from('movies')
      .select('id, ophim_id, ophim_slug, slug, name, origin_name, title_vi, title_en, year, episode_current, current_episode, total_episodes, source_site, source_name, showtimes, updated_at, last_synced_at')
      .eq('is_published', true)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (targetSlug) {
      moviesQuery = moviesQuery.eq('slug', targetSlug);
    } else {
      moviesQuery = moviesQuery.or('ophim_id.not.is.null,ophim_slug.not.is.null,source_site.ilike.%ophim%,source_name.ilike.%ophim%');
    }

    const { data: movies, error: moviesErr } = await moviesQuery;

    if (moviesErr) {
      throw new Error(`Failed to fetch movies: ${moviesErr.message}`);
    }

    if (!movies || movies.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No movies eligible for OPhim sync found.',
          movies_processed: 0,
          episodes_inserted: 0,
          episodes_skipped: 0,
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
    for (const movie of movies) {
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
            const { error: insertErr } = await supabase.from('movie_episodes').insert({
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
            });

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
            const { error: epInsertErr } = await supabase.from('episodes').insert({
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

            if (epInsertErr) {
              if (!(epInsertErr.code === '23505' || epInsertErr.message.toLowerCase().includes('duplicate'))) {
                errorDetails.push(`[${movie.slug}] ep ${episodeNumber} episodes: ${epInsertErr.message}`);
              }
            }

            // ─── INSERT into streams (individual stream per row) ───
            const { error: streamInsertErr } = await supabase.from('streams').insert({
              movie_id: movie.id,
              ophim_id: detail.id || detail.slug,
              server_name: serverName,
              episode_slug: epSlug,
              stream_url: ep.link_m3u8 || '',
              embed_url: ep.link_embed || '',
              source: 'ophim',
              is_active: true,
            });

            if (streamInsertErr) {
              if (!(streamInsertErr.code === '23505' || streamInsertErr.message.toLowerCase().includes('duplicate'))) {
                errorDetails.push(`[${movie.slug}] ep ${episodeNumber} streams: ${streamInsertErr.message}`);
              }
            }

            movieInserted++;
          }
        }

        totalInserted += movieInserted;
        totalSkipped += movieSkipped;

        const previousCurrent = getMovieCurrentEpisode(movie as MovieRow);
        const currentEpisode = Math.max(previousCurrent, maxEpisode);
        const movieUpdate: Record<string, unknown> = {
          ophim_id: detail.id || movie.ophim_id || '',
          ophim_slug: detail.slug || movie.ophim_slug || '',
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (currentEpisode > previousCurrent) {
          movieUpdate.episode_current = `Tập ${currentEpisode}`;
          movieUpdate.current_episode = currentEpisode;
          if (!movie.total_episodes || Number(movie.total_episodes) < currentEpisode) {
            movieUpdate.total_episodes = currentEpisode;
          }
        }

        await supabase
          .from('movies')
          .update(movieUpdate)
          .eq('id', movie.id);

        // Be nice to OPhim API — small delay between movies
        await new Promise((r) => setTimeout(r, 600));

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
      scanned: movies.length,
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
        message: `Processed ${movies.length} movies | Inserted ${totalInserted} new episodes | Skipped ${totalSkipped} existing | Errors: ${errorDetails.length}`,
        movies_processed: movies.length,
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
