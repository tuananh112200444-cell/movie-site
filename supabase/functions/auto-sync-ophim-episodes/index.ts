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
  status: boolean;
  movie?: {
    _id?: string;
    name?: string;
    slug?: string;
  };
  episodes?: OPhimServer[];
}

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
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
    const { data: movies, error: moviesErr } = await supabase
      .from('movies')
      .select('id, ophim_id, slug, updated_at')
      .not('ophim_id', 'is', null)
      .neq('ophim_id', '')
      .order('updated_at', { ascending: true })
      .limit(50);

    if (moviesErr) {
      throw new Error(`Failed to fetch movies: ${moviesErr.message}`);
    }

    if (!movies || movies.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No movies with ophim_id found. Add ophim_id to movies in admin panel to enable auto-sync.',
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

    // ─── Process each movie ───
    for (const movie of movies) {
      try {
        const ophimSlug = movie.ophim_id;
        if (!ophimSlug) continue;

        // Fetch from OPhim API
        const apiUrl = `https://ophim1.com/v1/api/phim/${encodeURIComponent(ophimSlug)}`;
        const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });

        if (!apiRes.ok) {
          errorDetails.push(`[${movie.slug}] OPhim API ${apiRes.status}`);
          continue;
        }

        const data = (await apiRes.json()) as OPhimResponse;
        if (!data.status || !data.episodes || data.episodes.length === 0) {
          continue;
        }

        let movieInserted = 0;
        let movieSkipped = 0;

        for (const server of data.episodes) {
          const serverName = server.server_name || 'OPhim';
          const episodes = server.server_data || [];

          for (const ep of episodes) {
            // Parse episode number
            const epNum = parseInt(ep.name, 10);
            let episodeNumber = epNum;
            if (isNaN(epNum)) {
              // Try extracting number from slug like "tap-01", "episode-1"
              const numMatch = ep.slug.match(/(?:tap-|episode-)(\d+)/i);
              const fallbackNum = numMatch ? parseInt(numMatch[1], 10) : 0;
              if (fallbackNum === 0) {
                console.warn(`[auto-sync] Cannot parse episode number for ${movie.slug}: name="${ep.name}", slug="${ep.slug}"`);
                continue;
              }
              episodeNumber = fallbackNum;
            }

            const epName = ep.name || `Tập ${episodeNumber}`;
            const epSlug = ep.slug || `tap-${episodeNumber}`;

            // ─── Check if this OPhim episode already exists in movie_episodes ───
            const { data: existing } = await supabase
              .from('movie_episodes')
              .select('id')
              .eq('movie_id', movie.id)
              .eq('episode_number', episodeNumber)
              .eq('source', 'ophim')
              .eq('is_backup', false)
              .maybeSingle();

            if (existing) {
              movieSkipped++;
              continue; // SKIP — never update existing episodes
            }

            // ─── INSERT into movie_episodes (admin table) ───
            const { error: insertErr } = await supabase.from('movie_episodes').insert({
              movie_id: movie.id,
              ophim_id: ophimSlug,
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
              errorDetails.push(`[${movie.slug}] ep ${episodeNumber} movie_episodes: ${insertErr.message}`);
              movieSkipped++;
              continue;
            }

            // ─── INSERT into episodes (normalized per-episode table) ───
            const { error: epInsertErr } = await supabase.from('episodes').insert({
              movie_id: movie.id,
              ophim_id: ophimSlug,
              server_name: serverName,
              episode_number: episodeNumber,
              episode_name: epName,
              episode_slug: epSlug,
              link_m3u8: ep.link_m3u8 || '',
              link_embed: ep.link_embed || '',
              server_data: ep,
            });

            if (epInsertErr) {
              errorDetails.push(`[${movie.slug}] ep ${episodeNumber} episodes: ${epInsertErr.message}`);
            }

            // ─── INSERT into streams (individual stream per row) ───
            const { error: streamInsertErr } = await supabase.from('streams').insert({
              movie_id: movie.id,
              ophim_id: ophimSlug,
              server_name: serverName,
              episode_slug: epSlug,
              stream_url: ep.link_m3u8 || '',
              embed_url: ep.link_embed || '',
              source: 'ophim',
              is_active: true,
            });

            if (streamInsertErr) {
              errorDetails.push(`[${movie.slug}] ep ${episodeNumber} streams: ${streamInsertErr.message}`);
            }

            movieInserted++;
          }
        }

        totalInserted += movieInserted;
        totalSkipped += movieSkipped;

        // Update movie timestamp so next run picks newer movies
        await supabase
          .from('movies')
          .update({ updated_at: new Date().toISOString() })
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
