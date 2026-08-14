import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') ?? '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
async function searchTMDB(query, year, isTv = true) {
  if (!TMDB_API_KEY) return null;
  const type = isTv ? 'tv' : 'movie';
  let url = `${TMDB_BASE}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=vi-VN`;
  if (year) url += `&${isTv ? 'first_air_date_year' : 'year'}=${year}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0] ?? null;
  } catch  {
    return null;
  }
}
async function getTMDBDetail(tmdbId, type) {
  if (!TMDB_API_KEY) return null;
  const url = `${TMDB_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=vi-VN&append_to_response=credits`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch  {
    return null;
  }
}
Deno.serve(async (req)=>{
  const auth = req.headers.get('Authorization');
  const expected = `Bearer ${Deno.env.get('ADMIN_SECRET_TOKEN') ?? ''}`;
  if (auth !== expected) {
    return new Response(JSON.stringify({
      error: 'Unauthorized'
    }), {
      status: 401
    });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results = {
    enriched: 0,
    skipped: 0,
    errors: []
  };
  try {
    // Get movies without TMDB data
    const { data: movies, error } = await supabase.from('thai_bl_movies').select('id, slug, name, origin_name, year, tmdb_id').is('tmdb_id', null).eq('is_active', true).limit(50);
    if (error) throw error;
    if (!movies || movies.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        results: {
          enriched: 0,
          skipped: 0,
          message: 'No movies need enrichment'
        }
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    for (const movie of movies){
      const query = movie.origin_name || movie.name;
      const search = await searchTMDB(query, movie.year ?? undefined, true);
      if (!search) {
        // Try movie search
        const movieSearch = await searchTMDB(query, movie.year ?? undefined, false);
        if (!movieSearch) {
          results.skipped++;
          continue;
        }
      }
      const tmdbResult = search;
      const tmdbId = tmdbResult.id;
      const mediaType = search ? 'tv' : 'movie';
      // Cache TMDB data
      const detail = await getTMDBDetail(tmdbId, mediaType);
      if (detail) {
        await supabase.from('tmdb_cache').upsert({
          tmdb_id: tmdbId,
          type: mediaType,
          data: detail,
          fetched_at: new Date().toISOString()
        }, {
          onConflict: 'tmdb_id,type'
        });
      }
      // Update movie with TMDB metadata
      const { error: updErr } = await supabase.from('thai_bl_movies').update({
        tmdb_id: tmdbId,
        tmdb_poster: tmdbResult.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbResult.poster_path}` : null,
        tmdb_backdrop: tmdbResult.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbResult.backdrop_path}` : null,
        tmdb_rating: tmdbResult.vote_average ?? null,
        tmdb_overview: tmdbResult.overview ?? null,
        updated_at: new Date().toISOString()
      }).eq('id', movie.id);
      if (updErr) {
        results.errors.push(`update-fail: ${movie.slug}`);
      } else {
        results.enriched++;
      }
    }
    return new Response(JSON.stringify({
      success: true,
      results
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({
      success: false,
      error: msg
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
