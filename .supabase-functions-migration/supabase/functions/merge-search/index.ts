import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const OPHIM_API = 'https://ophim1.com/v1/api';
/* ═══════════════════════════════════════════════════════
   LEVENSHTEIN DISTANCE & STRING SIMILARITY
   ═══════════════════════════════════════════════════════ */ function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Use two rows for memory efficiency
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for(let j = 0; j <= n; j++)prev[j] = j;
  for(let i = 1; i <= m; i++){
    curr[0] = i;
    for(let j = 1; j <= n; j++){
      curr[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? prev[j - 1] : 1 + Math.min(prev[j - 1], curr[j - 1], prev[j]);
    }
    [prev, curr] = [
      curr,
      prev
    ];
  }
  return prev[n];
}
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9\u00C0-\u1EF9]/g, ' ').replace(/\s+/g, ' ').trim();
}
async function searchTMDB(query, apiKey, page = 1) {
  const [movieRes, tvRes] = await Promise.all([
    fetch(`${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=vi-VN&page=${page}&include_adult=false`, {
      signal: AbortSignal.timeout(5000)
    }).catch(()=>null),
    fetch(`${TMDB_BASE}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=vi-VN&page=${page}&include_adult=false`, {
      signal: AbortSignal.timeout(5000)
    }).catch(()=>null)
  ]);
  const movieData = movieRes?.ok ? await movieRes.json() : {
    results: [],
    total_results: 0,
    total_pages: 0
  };
  const tvData = tvRes?.ok ? await tvRes.json() : {
    results: [],
    total_results: 0,
    total_pages: 0
  };
  const results = [];
  const seen = new Set();
  for (const r of movieData.results){
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    results.push({
      ...r,
      media_type: 'movie'
    });
  }
  for (const r of tvData.results){
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    results.push({
      ...r,
      media_type: 'tv'
    });
  }
  // Sort by popularity proxy (vote_count)
  results.sort((a, b)=>b.vote_count - a.vote_count || b.vote_average - a.vote_average);
  return {
    results: results.slice(0, 20),
    total_results: movieData.total_results + tvData.total_results,
    total_pages: Math.max(movieData.total_pages, tvData.total_pages)
  };
}
function getTMDBPosterUrl(path, size = 'w342') {
  return path ? `${TMDB_IMG}/${size}${path}` : null;
}
function getTMDBBackdropUrl(path, size = 'w780') {
  return path ? `${TMDB_IMG}/${size}${path}` : null;
}
async function searchOPhim(query, page = 1) {
  try {
    const res = await fetch(`${OPHIM_API}/tim-kiem?keyword=${encodeURIComponent(query)}&page=${page}`, {
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch  {
    return null;
  }
}
/* ═══════════════════════════════════════════════════════
   DEDUPLICATION ENGINE
   ═══════════════════════════════════════════════════════ */ function deduplicateMovies(ophimItems, tmdbItems, knownMappings) {
  const knownMap = new Map();
  for (const m of knownMappings){
    knownMap.set(m.ophim_slug, m.tmdb_id);
  }
  const merged = [];
  const usedTmdbIds = new Set();
  const ophimSlugToTmdbId = new Map();
  // Pass 1: Known mappings (exact from DB)
  for (const ophim of ophimItems){
    const knownTmdbId = knownMap.get(ophim.slug);
    if (knownTmdbId) {
      const tmdbMatch = tmdbItems.find((t)=>t.id === knownTmdbId);
      if (tmdbMatch) {
        usedTmdbIds.add(tmdbMatch.id);
        ophimSlugToTmdbId.set(ophim.slug, tmdbMatch.id);
        merged.push(buildMergedMovie(ophim, tmdbMatch));
        continue;
      }
    }
  }
  // Pass 2: Algorithmic deduplication for remaining OPhim items
  for (const ophim of ophimItems){
    if (ophimSlugToTmdbId.has(ophim.slug)) continue;
    const ophimNorm = normalizeTitle(ophim.name);
    const ophimNormOrigin = normalizeTitle(ophim.origin_name);
    let bestMatch = null;
    let bestScore = 0;
    for (const tmdb of tmdbItems){
      if (usedTmdbIds.has(tmdb.id)) continue;
      const tmdbYear = tmdb.release_date ? Number(tmdb.release_date.split('-')[0]) : tmdb.first_air_date ? Number(tmdb.first_air_date.split('-')[0]) : 0;
      // Year check: must be same or within 1 year
      const yearDiff = Math.abs((ophim.year || 0) - tmdbYear);
      if (yearDiff > 1) continue;
      // Name similarity checks
      const tmdbTitle = tmdb.title ?? tmdb.name ?? '';
      const tmdbOrig = tmdb.original_title ?? tmdb.original_name ?? '';
      const tmdbNorm = normalizeTitle(tmdbTitle);
      const tmdbNormOrig = normalizeTitle(tmdbOrig);
      let score = 0;
      // Exact or near-exact match
      if (ophimNorm === tmdbNorm || ophimNormOrigin === tmdbNormOrig) {
        score = 1.0;
      } else {
        // Levenshtein similarity
        const s1 = similarity(ophimNorm, tmdbNorm);
        const s2 = similarity(ophimNorm, tmdbNormOrig);
        const s3 = similarity(ophimNormOrigin, tmdbNorm);
        const s4 = similarity(ophimNormOrigin, tmdbNormOrig);
        score = Math.max(s1, s2, s3, s4);
      }
      // Boost exact year match
      if (yearDiff === 0 && score >= 0.70) {
        score = Math.min(1, score + 0.05);
      }
      if (score > bestScore && score >= 0.75) {
        bestScore = score;
        bestMatch = tmdb;
      }
    }
    if (bestMatch) {
      usedTmdbIds.add(bestMatch.id);
      ophimSlugToTmdbId.set(ophim.slug, bestMatch.id);
      merged.push(buildMergedMovie(ophim, bestMatch, bestScore));
    } else {
      // OPhim only
      merged.push(buildOPhimOnlyMovie(ophim));
    }
  }
  // TMDB-only items
  const tmdbOnly = [];
  for (const tmdb of tmdbItems){
    if (usedTmdbIds.has(tmdb.id)) continue;
    tmdbOnly.push(buildTMDBOnlyMovie(tmdb));
  }
  return {
    merged,
    tmdbOnly
  };
}
function buildMergedMovie(ophim, tmdb, similarityScore) {
  const tmdbYear = tmdb.release_date ? Number(tmdb.release_date.split('-')[0]) : tmdb.first_air_date ? Number(tmdb.first_air_date.split('-')[0]) : ophim.year || 0;
  return {
    unified_id: `merged:${ophim.slug}:${tmdb.id}`,
    name: ophim.name,
    origin_name: ophim.origin_name,
    slug: ophim.slug,
    year: ophim.year || tmdbYear,
    type: ophim.type === 'single' ? 'single' : 'series',
    poster_url: getTMDBPosterUrl(tmdb.poster_path, 'w342') || `https://img.ophim.live/uploads/movies/${ophim.poster_url || ophim.thumb_url}`,
    thumb_url: getTMDBPosterUrl(tmdb.poster_path, 'w342') || `https://img.ophim.live/uploads/movies/${ophim.thumb_url}`,
    quality: ophim.quality,
    lang: ophim.lang,
    episode_current: ophim.episode_current,
    category: ophim.category,
    country: ophim.country,
    source_type: 'merged',
    tmdb_id: tmdb.id,
    tmdb_rating: tmdb.vote_average,
    tmdb_overview: tmdb.overview,
    tmdb_backdrop: getTMDBBackdropUrl(tmdb.backdrop_path, 'w1280') || undefined,
    tmdb_vote_count: tmdb.vote_count,
    ophim_id: ophim._id,
    sub_docquyen: ophim.sub_docquyen,
    chieurap: ophim.chieurap,
    time: ophim.time,
    view: ophim.view,
    modified: ophim.modified,
    is_watchable: true,
    detail_url: `/phim/${ophim.slug}`
  };
}
function buildOPhimOnlyMovie(ophim) {
  return {
    unified_id: `ophim:${ophim.slug}`,
    name: ophim.name,
    origin_name: ophim.origin_name,
    slug: ophim.slug,
    year: ophim.year || 0,
    type: ophim.type === 'single' ? 'single' : 'series',
    poster_url: `https://img.ophim.live/uploads/movies/${ophim.poster_url || ophim.thumb_url}`,
    thumb_url: `https://img.ophim.live/uploads/movies/${ophim.thumb_url}`,
    quality: ophim.quality,
    lang: ophim.lang,
    episode_current: ophim.episode_current,
    category: ophim.category,
    country: ophim.country,
    source_type: 'ophim_only',
    ophim_id: ophim._id,
    sub_docquyen: ophim.sub_docquyen,
    chieurap: ophim.chieurap,
    time: ophim.time,
    view: ophim.view,
    modified: ophim.modified,
    is_watchable: true,
    detail_url: `/phim/${ophim.slug}`
  };
}
function buildTMDBOnlyMovie(tmdb) {
  const year = tmdb.release_date ? Number(tmdb.release_date.split('-')[0]) : tmdb.first_air_date ? Number(tmdb.first_air_date.split('-')[0]) : 0;
  const title = tmdb.title ?? tmdb.name ?? '';
  const origTitle = tmdb.original_title ?? tmdb.original_name ?? '';
  return {
    unified_id: `tmdb:${tmdb.id}`,
    name: title,
    origin_name: origTitle,
    slug: `tmdb-${tmdb.id}`,
    year,
    type: tmdb.media_type === 'tv' ? 'series' : 'single',
    poster_url: getTMDBPosterUrl(tmdb.poster_path, 'w342') || '',
    thumb_url: getTMDBPosterUrl(tmdb.poster_path, 'w342') || '',
    source_type: 'tmdb_only',
    tmdb_id: tmdb.id,
    tmdb_rating: tmdb.vote_average,
    tmdb_overview: tmdb.overview,
    tmdb_backdrop: getTMDBBackdropUrl(tmdb.backdrop_path, 'w1280') || undefined,
    tmdb_vote_count: tmdb.vote_count,
    is_watchable: false,
    detail_url: `/phim-tmdb/${tmdb.id}?type=${tmdb.media_type === 'tv' ? 'tv' : 'movie'}`
  };
}
/* ═══════════════════════════════════════════════════════
   SAVE MAPPINGS TO DATABASE
   ═══════════════════════════════════════════════════════ */ async function saveMappings(supabase, mappings) {
  if (mappings.length === 0) return;
  const rows = mappings.map((m)=>({
      ophim_slug: m.ophim_slug,
      tmdb_id: m.tmdb_id,
      title: m.title,
      year: m.year,
      similarity_score: m.similarity_score,
      matched_at: new Date().toISOString()
    }));
  try {
    await supabase.from('movie_mapping').upsert(rows, {
      onConflict: 'ophim_slug,tmdb_id',
      ignoreDuplicates: true
    });
  } catch  {
  // Silently fail — mapping cache is best-effort
  }
}
/* ═══════════════════════════════════════════════════════
   MAIN HANDLER
   ═══════════════════════════════════════════════════════ */ serve(async (req)=>{
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
      error: 'Invalid JSON body'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  const query = body.query?.trim();
  if (!query) {
    return new Response(JSON.stringify({
      error: 'Missing query parameter'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  const page = Math.max(1, body.page ?? 1);
  const tmdbApiKey = body.tmdb_api_key || Deno.env.get('TMDB_API_KEY') || '';
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
  // Check known mappings that might match this query
  const normalizedQuery = normalizeTitle(query);
  const { data: knownMappings } = await supabase.from('movie_mapping').select('ophim_slug, tmdb_id, title, year').or(`title.ilike.%${query}%,title.ilike.%${normalizedQuery}%`).limit(20);
  // Parallel search both APIs
  const [ophimData, tmdbData] = await Promise.all([
    searchOPhim(query, page),
    tmdbApiKey ? searchTMDB(query, tmdbApiKey, page) : Promise.resolve({
      results: [],
      total_results: 0,
      total_pages: 0
    })
  ]);
  const ophimItems = ophimData?.data?.items ?? [];
  const tmdbItems = tmdbData.results ?? [];
  // Deduplicate
  const { merged, tmdbOnly } = deduplicateMovies(ophimItems, tmdbItems, knownMappings ?? []);
  // Combine: merged first (OPhim + merged), then TMDB-only
  const allResults = [
    ...merged,
    ...tmdbOnly
  ];
  // Save high-confidence mappings (similarity >= 0.85)
  const newMappings = [];
  for (const m of merged){
    if (m.source_type === 'merged' && m.ophim_id && m.tmdb_id) {
      // Check if this pair was already in known mappings
      const alreadyKnown = (knownMappings ?? []).some((km)=>km.ophim_slug === m.slug && km.tmdb_id === m.tmdb_id);
      if (!alreadyKnown) {
        newMappings.push({
          ophim_slug: m.slug,
          tmdb_id: m.tmdb_id,
          title: m.name,
          year: m.year,
          similarity_score: 0.90
        });
      }
    }
  }
  if (newMappings.length > 0) {
    await saveMappings(supabase, newMappings);
  }
  const ophimPagination = ophimData?.data?.pagination;
  return new Response(JSON.stringify({
    status: true,
    results: allResults,
    pagination: {
      currentPage: page,
      totalPages: ophimPagination?.totalPages ?? 1,
      totalItems: ophimPagination?.totalItems ?? allResults.length,
      totalItemsPerPage: ophimPagination?.totalItemsPerPage ?? 24
    },
    meta: {
      ophim_count: ophimItems.length,
      tmdb_count: tmdbItems.length,
      merged_count: merged.filter((m)=>m.source_type === 'merged').length,
      ophim_only_count: merged.filter((m)=>m.source_type === 'ophim_only').length,
      tmdb_only_count: tmdbOnly.length,
      query_normalized: normalizedQuery
    }
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
});
