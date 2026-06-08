import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Fallback key hardcoded to guarantee operation regardless of secrets configuration
const HARDCODED_KEY = '75c107f309e77803399d42354463a0f7';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || HARDCODED_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty body */
    }

    const id = Number(body.id || 0);
    const mediaType = String(body.mediaType || 'movie') as 'movie' | 'tv';

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing id' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    if (!TMDB_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'TMDB_API_KEY not available' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const append = mediaType === 'movie'
      ? 'credits,videos,release_dates'
      : 'credits,videos,content_ratings';

    const url = new URL(`${TMDB_BASE}/${mediaType}/${id}`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    url.searchParams.set('language', 'en-US');
    url.searchParams.set('append_to_response', append);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[tmdb-detail-proxy] TMDB error ${res.status}:`, txt.slice(0, 500));
      return new Response(
        JSON.stringify({ error: `TMDB API error: ${res.status}`, details: txt.slice(0, 500) }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const data = await res.json() as Record<string, unknown>;

    const isTv = mediaType === 'tv';
    const title = String(data.title || data.name || '');
    const originalTitle = String(data.original_title || data.original_name || title);
    const overview = String(data.overview || '');
    const posterUrl = data.poster_path
      ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
      : '';
    const backdropUrl = data.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
      : '';
    const rating = Number(data.vote_average || 0);
    const voteCount = Number(data.vote_count || 0);
    const releaseDate = String(data.release_date || data.first_air_date || '');
    const statusStr = String(data.status || '');
    const runtime = isTv ? 0 : Number(data.runtime || 0);
    const numberOfEpisodes = isTv ? Number(data.number_of_episodes || 0) : 0;

    const genres = Array.isArray(data.genres)
      ? (data.genres as Array<{ name: string }>).map((g) => g.name)
      : [];

    const credits = (data.credits || {}) as Record<string, unknown>;
    const castArr = Array.isArray(credits.cast)
      ? (credits.cast as Array<{ name: string }>)
      : [];
    const crewArr = Array.isArray(credits.crew)
      ? (credits.crew as Array<{ job: string; name: string }>)
      : [];

    const director = crewArr.find((c) => c.job === 'Director')?.name ?? '';

    const productionCountries = Array.isArray(data.production_countries)
      ? (data.production_countries as Array<{ name: string }>).map((c) => c.name)
      : [];

    const videoData = (data.videos || {}) as Record<string, unknown>;
    const videoResults = Array.isArray(videoData.results)
      ? (videoData.results as Array<{ type: string; site: string; key: string }>)
      : [];

    const imdbId = String(data.imdb_id || '');

    const response = {
      title,
      originalTitle,
      overview,
      posterUrl,
      backdropUrl,
      rating,
      voteCount,
      releaseDate,
      status: statusStr,
      runtime,
      numberOfEpisodes,
      genres,
      cast: castArr.slice(0, 20),
      productionCountries,
      videos: videoResults,
      director,
      imdbId,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  } catch (err) {
    console.error('[tmdb-detail-proxy] error:', err);
    return new Response(
      JSON.stringify({ error: 'Server error', message: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }
});