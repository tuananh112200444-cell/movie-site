import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const KISSKH_API = 'https://kisskh.do/api/DramaList/GetList';
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9\u00C0-\u1EF9]/g, ' ').replace(/\s+/g, ' ').trim();
}
function makeSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 80);
}
function sleep(ms) {
  return new Promise((r)=>setTimeout(r, ms));
}
async function fetchJSON(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    if (res.status === 403) {
      throw new Error('Cloudflare blocked');
    }
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (err.message.includes('Cloudflare')) throw err;
    return null;
  } finally{
    clearTimeout(timer);
  }
}
async function findExistingMovie(supabase, slug, name, year) {
  const { data: slugMatch } = await supabase.from('movies').select('id').eq('slug', slug).maybeSingle();
  if (slugMatch) return slugMatch.id;
  const normalized = normalizeName(name);
  if (normalized.length >= 3) {
    const { data: fuzzyMatches } = await supabase.from('movies').select('id, normalized_name, year').eq('year', year).or(`normalized_name.ilike.%${normalized}%,normalized_name.ilike.%${normalized.slice(0, Math.max(3, Math.floor(normalized.length * 0.7)))}%`).limit(5);
    if (fuzzyMatches && fuzzyMatches.length > 0) {
      let bestId = null;
      let bestScore = 0;
      for (const m of fuzzyMatches){
        const dbNorm = String(m.normalized_name || '');
        let commonLen = 0;
        const minLen = Math.min(normalized.length, dbNorm.length);
        for(let i = 0; i < minLen; i++){
          if (normalized[i] === dbNorm[i]) commonLen++;
          else break;
        }
        const score = commonLen / Math.max(normalized.length, dbNorm.length);
        if (score > 0.7 && score > bestScore) {
          bestScore = score;
          bestId = m.id;
        }
      }
      if (bestId) return bestId;
    }
  }
  return null;
}
async function syncSingleDrama(supabase, drama) {
  const year = drama.releaseDate ? parseInt(drama.releaseDate.split('-')[0], 10) : 0;
  const slug = `kisskh-${drama.id}-${makeSlug(drama.name)}`;
  const normalized = normalizeName(drama.name);
  // For KissKH, we don't have episode/stream detail in the list API
  // We mark as published=true and resolve streams lazily via player
  const hasBasicInfo = drama.name && drama.id;
  if (!hasBasicInfo) {
    return {
      slug,
      status: 'skipped',
      action: 'skipped_no_stream'
    };
  }
  const existingId = await findExistingMovie(supabase, slug, drama.name, year);
  const now = new Date().toISOString();
  const movieData = {
    slug,
    name: drama.name,
    origin_name: drama.name,
    original_title: drama.name,
    normalized_name: normalized,
    content: drama.description || '',
    type: 'series',
    status: 'completed',
    thumb_url: drama.thumbnail || '',
    poster_url: drama.thumbnail || '',
    quality: 'HD',
    lang: 'English',
    time: '',
    episode_current: 'Full',
    episode_total: '',
    year: year || 0,
    view: 0,
    actor: [],
    director: [],
    category: drama.category ? [
      {
        id: '',
        name: drama.category,
        slug: ''
      }
    ] : [],
    country: drama.country ? [
      {
        id: '',
        name: drama.country,
        slug: ''
      }
    ] : [],
    trailer_url: '',
    source_site: 'kisskh.do',
    source_name: 'kisskh',
    source_url: `https://kisskh.do/Drama/${drama.id}/${encodeURIComponent(drama.name)}`,
    is_published: true,
    updated_at: now,
    last_synced_at: now
  };
  let movieId;
  let action;
  try {
    if (existingId) {
      const { error: updateErr } = await supabase.from('movies').update(movieData).eq('id', existingId);
      if (updateErr) {
        return {
          slug,
          status: 'update_error',
          error: updateErr.message
        };
      }
      movieId = existingId;
      action = 'updated';
    } else {
      const { data: inserted, error: insertErr } = await supabase.from('movies').insert(movieData).select('id').single();
      if (insertErr || !inserted) {
        return {
          slug,
          status: 'insert_error',
          error: insertErr?.message
        };
      }
      movieId = inserted.id;
      action = 'inserted';
    }
  } catch (err) {
    return {
      slug,
      status: 'insert_error',
      error: err.message
    };
  }
  // Upsert movie_sources
  const sourcePayload = {
    movie_id: movieId,
    source_name: 'kisskh',
    source_movie_id: String(drama.id),
    source_site: 'kisskh.do',
    source_slug: slug,
    source_url: `https://kisskh.do/Drama/${drama.id}/${encodeURIComponent(drama.name)}`,
    priority: 2,
    status: 'active',
    is_active: true,
    last_synced_at: now,
    updated_at: now
  };
  await supabase.from('movie_sources').upsert(sourcePayload, {
    onConflict: 'movie_id,source_name,source_movie_id',
    ignoreDuplicates: false
  });
  return {
    slug,
    status: 'ok',
    movie_id: movieId,
    action
  };
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
  let body = {
    page: 1,
    limit: 1
  };
  try {
    body = await req.json();
  } catch  {
  // defaults
  }
  const page = Math.max(1, Math.min(body.page ?? 1, 100));
  const pagesToSync = Math.max(1, Math.min(body.limit ?? 1, 2)); // max 2 pages per call
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
  // Test if KissKH API is accessible
  try {
    const testRes = await fetchJSON(`${KISSKH_API}?page=1`, 5000);
    if (testRes === null) {
      // Try one more time
      const testRes2 = await fetchJSON(`${KISSKH_API}?page=1`, 5000);
      if (testRes2 === null) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'KissKH API is unreachable (Cloudflare block or down). No sync performed.',
          page,
          pages_attempted: pagesToSync
        }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
  } catch (err) {
    if (err.message.includes('Cloudflare')) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'KissKH API blocked by Cloudflare. Cannot sync.',
        page,
        pages_attempted: pagesToSync
      }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
  const allResults = [];
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  for(let p = page; p < page + pagesToSync; p++){
    try {
      const listData = await fetchJSON(`${KISSKH_API}?page=${p}`, 10000);
      if (!listData || !Array.isArray(listData)) {
        console.warn(`[sync-kisskh] Empty response for page ${p}`);
        break;
      }
      for (const drama of listData){
        await sleep(150);
        const result = await syncSingleDrama(supabase, drama);
        allResults.push(result);
        if (result.action === 'inserted') totalInserted++;
        else if (result.action === 'updated') totalUpdated++;
        else if (result.action === 'skipped_no_stream') totalSkipped++;
      }
    } catch (err) {
      console.error(`[sync-kisskh] Page ${p} error:`, err);
      break;
    }
  }
  return new Response(JSON.stringify({
    ok: true,
    page,
    pages_synced: pagesToSync,
    total_processed: allResults.length,
    inserted: totalInserted,
    updated: totalUpdated,
    skipped_no_stream: totalSkipped,
    results: allResults
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
});
