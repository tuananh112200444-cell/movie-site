import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800',
  'X-Content-Type-Options': 'nosniff',
};

const MOVIE_FIELDS = [
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
].join(',');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function movieFromQualityRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const nested = Array.isArray(row.movies) ? row.movies[0] : row.movies;
  if (!nested || typeof nested !== 'object') return null;
  const movie = nested as Record<string, unknown>;
  if (!movie.slug) return null;
  const tier = String(row.index_tier || 'blocked');
  const eligible = row.eligible_for_index === true;
  return {
    ...movie,
    seo_has_playable_episode: eligible && (tier === 'playable' || tier === 'ongoing'),
    seo_eligible_for_index: eligible,
    seo_index_tier: tier,
    seo_quality_score: Number(row.quality_score || 0),
    seo_quality_reasons: row.reasons || [],
    seo_quality_signals: row.signals || [],
    seo_latest_episode_number: Number(row.latest_episode_number || 0),
    seo_declared_total_episodes: Number(row.declared_total_episodes || 0),
    seo_episode_progress_percent: Number(row.episode_progress_percent || 0),
    seo_freshness_score: Number(row.freshness_score || 0),
    seo_last_episode_change_at: row.last_episode_change_at || null,
    seo_next_episode_at: row.next_episode_at || null,
    seo_quality_checked_at: row.checked_at || null,
  };
}

async function findQualityMovie(
  supabase: ReturnType<typeof createClient>,
  variants: string[],
): Promise<{ movie: Record<string, unknown> | null; error: string }> {
  for (const variant of variants) {
    const { data, error } = await supabase
      .from('movie_seo_quality_status')
      .select(`
        movie_id,slug,eligible_for_index,index_tier,quality_score,reasons,signals,checked_at,
        latest_episode_number,declared_total_episodes,episode_progress_percent,freshness_score,
        last_episode_change_at,next_episode_at,
        movies!inner(${MOVIE_FIELDS})
      `)
      .eq('slug', variant)
      .eq('movies.is_published', true)
      .maybeSingle();
    if (error) return { movie: null, error: error.message };
    const movie = data ? movieFromQualityRow(data as unknown as Record<string, unknown>) : null;
    if (movie) return { movie, error: '' };
  }
  return { movie: null, error: '' };
}

function hasPlayableLink(row: Record<string, unknown>): boolean {
  return ['link_m3u8', 'link_embed'].some((key) => {
    const value = String(row[key] || '').trim();
    return /^https?:\/\//i.test(value) || value.startsWith('//');
  });
}

async function enrichSeoMovie(supabase: ReturnType<typeof createClient>, movie: Record<string, unknown>) {
  const movieId = String(movie.id || '');
  if (!movieId) {
    return {
      ...movie,
      seo_has_playable_episode: false,
      seo_eligible_for_index: false,
      seo_index_tier: 'blocked',
      seo_quality_score: 0,
    };
  }

  const [adminEpisodes, episodes, quality] = await Promise.all([
    supabase.from('movie_episodes').select('link_m3u8,link_embed').eq('movie_id', movieId).limit(20),
    supabase.from('episodes').select('link_m3u8,link_embed').eq('movie_id', movieId).limit(20),
    supabase
      .from('movie_seo_quality_status')
      .select('eligible_for_index,index_tier,quality_score,reasons,signals,checked_at,latest_episode_number,declared_total_episodes,episode_progress_percent,freshness_score,last_episode_change_at,next_episode_at')
      .eq('movie_id', movieId)
      .maybeSingle(),
  ]);
  const rows = [
    ...(adminEpisodes.data || []),
    ...(episodes.data || []),
  ] as Array<Record<string, unknown>>;
  return {
    ...movie,
    seo_has_playable_episode: rows.some(hasPlayableLink),
    seo_eligible_for_index: quality.data ? quality.data.eligible_for_index === true : null,
    seo_index_tier: quality.data ? String(quality.data.index_tier || 'blocked') : 'unreviewed',
    seo_quality_score: Number(quality.data?.quality_score || 0),
    seo_quality_reasons: quality.data?.reasons || [],
    seo_quality_signals: quality.data?.signals || [],
    seo_latest_episode_number: Number(quality.data?.latest_episode_number || 0),
    seo_declared_total_episodes: Number(quality.data?.declared_total_episodes || 0),
    seo_episode_progress_percent: Number(quality.data?.episode_progress_percent || 0),
    seo_freshness_score: Number(quality.data?.freshness_score || 0),
    seo_last_episode_change_at: quality.data?.last_episode_change_at || null,
    seo_next_episode_at: quality.data?.next_episode_at || null,
    seo_quality_checked_at: quality.data?.checked_at || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ status: false, message: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ status: false, message: 'Missing Supabase env' }, 500);

  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  if (!slug) return json({ status: false, message: 'Missing slug' }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const variants = Array.from(new Set([
    slug,
    slug.normalize('NFC'),
    decodeURIComponent(slug),
  ].filter(Boolean)));

  // Every sitemap movie already has a row in movie_seo_quality_status. Read
  // the movie and its persisted SEO decision in one joined request. The old
  // path required one movie lookup plus three extra episode/quality queries,
  // which caused bursts of Googlebot traffic to overload the database.
  const qualityLookup = await findQualityMovie(supabase, variants);
  if (qualityLookup.error) return json({ status: false, message: qualityLookup.error }, 503);
  if (qualityLookup.movie) return json({ status: true, movie: qualityLookup.movie });

  for (const variant of variants) {
    const { data, error } = await supabase
      .from('movies')
      .select(MOVIE_FIELDS)
      .eq('slug', variant)
      .eq('is_published', true)
      .maybeSingle();
    if (error) return json({ status: false, message: error.message }, 500);
    if (!error && data?.slug) return json({ status: true, movie: await enrichSeoMovie(supabase, data) });
  }

  for (const variant of variants) {
    const { data, error } = await supabase
      .from('movies')
      .select(MOVIE_FIELDS)
      .eq('ophim_slug', variant)
      .eq('is_published', true)
      .maybeSingle();
    if (error) return json({ status: false, message: error.message }, 500);
    if (!error && data?.slug) return json({ status: true, movie: await enrichSeoMovie(supabase, data) });
  }

  return json({ status: false, message: 'Movie not found' }, 404);
});
