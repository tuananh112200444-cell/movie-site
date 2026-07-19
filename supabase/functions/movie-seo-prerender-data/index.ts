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

function hasPlayableLink(row: Record<string, unknown>): boolean {
  return ['link_m3u8', 'link_embed'].some((key) => {
    const value = String(row[key] || '').trim();
    return /^https?:\/\//i.test(value) || value.startsWith('//');
  });
}

async function enrichSeoMovie(supabase: ReturnType<typeof createClient>, movie: Record<string, unknown>) {
  const movieId = String(movie.id || '');
  if (!movieId) return { ...movie, seo_has_playable_episode: false };

  const [adminEpisodes, episodes] = await Promise.all([
    supabase.from('movie_episodes').select('link_m3u8,link_embed').eq('movie_id', movieId).limit(20),
    supabase.from('episodes').select('link_m3u8,link_embed').eq('movie_id', movieId).limit(20),
  ]);
  const rows = [
    ...(adminEpisodes.data || []),
    ...(episodes.data || []),
  ] as Array<Record<string, unknown>>;
  return { ...movie, seo_has_playable_episode: rows.some(hasPlayableLink) };
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
