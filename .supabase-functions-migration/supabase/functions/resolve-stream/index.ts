import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const OPHIM_API = 'https://ophim1.com/v1/api';
async function fetchJSON(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch  {
    return null;
  } finally{
    clearTimeout(timer);
  }
}
async function resolveFromOPhim(supabase, movieId, episodeSlug, sourceSlug) {
  const detail = await fetchJSON(`${OPHIM_API}/phim/${encodeURIComponent(sourceSlug)}`, 8000);
  if (!detail?.episodes) return [];
  const results = [];
  const now = new Date().toISOString();
  for (const ep of detail.episodes){
    for (const sd of ep.server_data || []){
      if (sd.slug === episodeSlug && (sd.link_m3u8 || sd.link_embed)) {
        results.push({
          episode_slug: sd.slug,
          server_name: ep.server_name || 'OPhim',
          stream_url: sd.link_m3u8 || '',
          embed_url: sd.link_embed || '',
          subtitle_url: '',
          quality: detail.movie?.quality || 'HD',
          priority: 1,
          source: 'ophim'
        });
      }
    }
  }
  // Cache resolved streams
  if (results.length > 0) {
    const rows = results.map((r)=>({
        movie_id: movieId,
        episode_slug: r.episode_slug,
        source: r.source,
        server_name: r.server_name,
        stream_url: r.stream_url,
        embed_url: r.embed_url,
        subtitle_url: r.subtitle_url,
        quality: r.quality,
        priority: r.priority,
        is_active: true,
        created_at: now,
        updated_at: now
      }));
    await supabase.from('streams').upsert(rows, {
      onConflict: 'movie_id,episode_slug,source,server_name',
      ignoreDuplicates: false
    });
  }
  return results;
}
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
  let body = {};
  try {
    body = await req.json();
  } catch  {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Invalid JSON body'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  const movieId = body.movie_id;
  const episodeSlug = body.episode_slug || 'tap-1';
  const slug = body.slug;
  if (!movieId && !slug) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Missing movie_id or slug'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
  let resolvedMovieId = movieId;
  let movieSlug = slug;
  // If only slug provided, lookup movie_id
  if (!resolvedMovieId && slug) {
    const { data: movieRow } = await supabase.from('movies').select('id').eq('slug', slug).maybeSingle();
    if (movieRow) {
      resolvedMovieId = movieRow.id;
    } else {
      // Try movie_sources.source_slug
      const { data: sourceRow } = await supabase.from('movie_sources').select('movie_id').eq('source_slug', slug).eq('is_active', true).maybeSingle();
      if (sourceRow) {
        resolvedMovieId = sourceRow.movie_id;
      }
    }
  }
  if (!resolvedMovieId) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Movie not found'
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  // 1. Query cached streams from DB
  const { data: cachedStreams } = await supabase.from('streams').select('*').eq('movie_id', resolvedMovieId).eq('episode_slug', episodeSlug).eq('is_active', true).order('priority', {
    ascending: true
  });
  const streams = (cachedStreams || []).map((s)=>({
      episode_slug: s.episode_slug,
      server_name: s.server_name,
      stream_url: s.stream_url,
      embed_url: s.embed_url,
      subtitle_url: s.subtitle_url,
      quality: s.quality,
      priority: s.priority,
      source: s.source
    }));
  // 2. If no cached streams, try to resolve from movie_sources
  if (streams.length === 0) {
    const { data: sources } = await supabase.from('movie_sources').select('source_name, source_slug, source_site, priority').eq('movie_id', resolvedMovieId).eq('is_active', true).eq('status', 'active').order('priority', {
      ascending: true
    });
    for (const src of sources || []){
      if (src.source_name === 'ophim' && src.source_slug) {
        const resolved = await resolveFromOPhim(supabase, resolvedMovieId, episodeSlug, src.source_slug);
        streams.push(...resolved);
      }
    // KissKH streams are added during sync; if missing here, they need manual sync
    }
  }
  if (streams.length === 0) {
    return new Response(JSON.stringify({
      ok: false,
      movie_id: resolvedMovieId,
      episode_slug: episodeSlug,
      error: 'No active streams found for this episode'
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  // Sort by priority
  streams.sort((a, b)=>a.priority - b.priority);
  const response = {
    ok: true,
    movie_id: resolvedMovieId,
    episode_slug: episodeSlug,
    streams,
    best_stream: streams[0]
  };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60'
    }
  });
});
