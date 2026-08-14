import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || '';
const TMDB_READ_ACCESS_TOKEN = Deno.env.get('TMDB_READ_ACCESS_TOKEN') || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
function mapItem(item, mediaType) {
  const title = item.title ?? item.name ?? '';
  const originalTitle = item.original_title ?? item.original_name ?? title;
  return {
    id: item.id,
    title: title || originalTitle,
    originalTitle: originalTitle || title,
    overview: item.overview ?? '',
    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
    rating: item.vote_average ?? 0,
    voteCount: item.vote_count ?? 0,
    year: Number((item.release_date ?? item.first_air_date ?? '').split('-')[0]) || 0,
    mediaType,
    genreIds: item.genre_ids ?? []
  };
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }
  try {
    let body = {};
    try {
      body = await req.json();
    } catch  {
    /* empty body */ }
    const query = String(body.query || '').trim();
    const page = Number(body.page || 1);
    if (!query) {
      return new Response(JSON.stringify({
        error: 'Missing query'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
    if (!TMDB_API_KEY && !TMDB_READ_ACCESS_TOKEN) {
      return new Response(JSON.stringify({
        error: 'TMDB credentials not available'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
    const buildUrl = (endpoint)=>{
      const url = new URL(`${TMDB_BASE}${endpoint}`);
      if (TMDB_API_KEY) url.searchParams.set('api_key', TMDB_API_KEY);
      url.searchParams.set('language', 'en-US');
      url.searchParams.set('include_adult', 'false');
      url.searchParams.set('page', String(page));
      url.searchParams.set('query', query);
      return url.toString();
    };
    const movieUrl = buildUrl('/search/movie');
    const tvUrl = buildUrl('/search/tv');
    const [movieRes, tvRes] = await Promise.all([
      fetch(movieUrl, TMDB_READ_ACCESS_TOKEN ? {
        headers: {
          Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}`
        }
      } : undefined),
      fetch(tvUrl, TMDB_READ_ACCESS_TOKEN ? {
        headers: {
          Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}`
        }
      } : undefined)
    ]);
    // If TMDB returns auth error, forward it clearly so frontend knows
    if (!movieRes.ok && !tvRes.ok) {
      const movieTxt = await movieRes.text().catch(()=>'');
      const tvTxt = await tvRes.text().catch(()=>'');
      console.error(`[tmdb-search-proxy] TMDB errors movie=${movieRes.status} tv=${tvRes.status}`);
      return new Response(JSON.stringify({
        error: `TMDB API error: movie=${movieRes.status}, tv=${tvRes.status}`,
        details: movieTxt || tvTxt
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
    const movieData = movieRes.ok ? await movieRes.json() : {
      results: []
    };
    const tvData = tvRes.ok ? await tvRes.json() : {
      results: []
    };
    const movieResults = (movieData.results ?? []).map((m)=>mapItem(m, 'movie'));
    const tvResults = (tvData.results ?? []).map((m)=>mapItem(m, 'tv'));
    return new Response(JSON.stringify({
      movieResults,
      tvResults
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  } catch (err) {
    console.error('[tmdb-search-proxy] error:', err);
    return new Response(JSON.stringify({
      error: 'Server error',
      message: err instanceof Error ? err.message : String(err)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }
});
