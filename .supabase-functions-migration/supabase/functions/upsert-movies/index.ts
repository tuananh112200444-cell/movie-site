import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  };
}
function sanitizeMovie(m) {
  const type = (m.type || 'phim-le').toString();
  const slug = m.slug.toString().trim();
  const name = m.name.toString().trim();
  return {
    slug,
    name,
    origin_name: (m.origin_name || name).toString().trim(),
    content: (m.content || '').toString().trim(),
    type,
    status: (m.status || 'completed').toString(),
    thumb_url: (m.thumb_url || '').toString().trim(),
    poster_url: (m.poster_url || '').toString().trim(),
    quality: (m.quality || 'HD').toString(),
    lang: (m.lang || 'Vietsub').toString(),
    time: (m.time || '').toString(),
    episode_current: (m.episode_current || '').toString(),
    episode_total: (m.episode_total || '').toString(),
    year: Number.isFinite(Number(m.year)) ? Number(m.year) : 0,
    actor: Array.isArray(m.actor) ? m.actor : [],
    director: Array.isArray(m.director) ? m.director : [],
    category: Array.isArray(m.category) ? m.category : [],
    country: Array.isArray(m.country) ? m.country : [],
    trailer_url: (m.trailer_url || '').toString(),
    notify: (m.notify || '').toString(),
    showtimes: (m.showtimes || '').toString(),
    ophim_id: (m.ophim_id || slug).toString(),
    source_url: (m.source_url || '').toString(),
    source_name: (m.source_name || 'ophim').toString(),
    source_site: 'ophim',
    is_published: true,
    updated_at: new Date().toISOString()
  };
}
serve(async (req)=>{
  const cors = getCorsHeaders();
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: cors
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    const body = await req.json();
    const movies = body?.movies ?? [];
    if (!Array.isArray(movies) || movies.length === 0) {
      return new Response(JSON.stringify({
        error: 'Missing movies array'
      }), {
        status: 400,
        headers: {
          ...cors,
          'Content-Type': 'application/json'
        }
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    let upserted = 0;
    let skipped = 0;
    const errors = [];
    for (const m of movies){
      if (!m.slug || !m.name) {
        skipped++;
        continue;
      }
      const data = sanitizeMovie(m);
      const { error } = await supabase.from('movies').upsert(data, {
        onConflict: 'slug',
        ignoreDuplicates: false
      });
      if (error) {
        errors.push(`[${m.slug}] ${error.message}`);
        skipped++;
      } else {
        upserted++;
      }
    }
    return new Response(JSON.stringify({
      success: true,
      upserted,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: {
        ...cors,
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
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
});
