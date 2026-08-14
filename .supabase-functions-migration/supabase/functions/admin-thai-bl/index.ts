import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/** Verify admin token (same pattern as other admin functions) */ function verifyAdminToken(req) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  return token.length > 20;
}
function getCorsHeaders(origin) {
  const allowed = [
    'https://mhophim.com',
    'http://localhost:5173'
  ];
  const safeOrigin = origin && allowed.some((a)=>origin.startsWith(a)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
Deno.serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  // Auth check for write operations
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? '';
  const writeActions = [
    'upsert-movie',
    'delete-movie',
    'add-stream',
    'update-stream',
    'delete-stream',
    'add-episode',
    'delete-episode',
    'toggle-active',
    'check-stream'
  ];
  if (writeActions.includes(action) && !verifyAdminToken(req)) {
    return new Response(JSON.stringify({
      error: 'Unauthorized'
    }), {
      status: 401,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  try {
    // ─── GET: list movies ───
    if (req.method === 'GET' && action === 'list-movies') {
      const type = url.searchParams.get('type') ?? '';
      const page = parseInt(url.searchParams.get('page') ?? '1');
      const limit = parseInt(url.searchParams.get('limit') ?? '20');
      const search = url.searchParams.get('search') ?? '';
      let query = supabase.from('thai_bl_movies').select('*', {
        count: 'exact'
      }).order('updated_at', {
        ascending: false
      }).range((page - 1) * limit, page * limit - 1);
      if (type) query = query.eq('type', type);
      if (search) query = query.ilike('name', `%${search}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({
        movies: data ?? [],
        total: count ?? 0
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── GET: get single movie with streams+subs ───
    if (req.method === 'GET' && action === 'get-movie') {
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({
        error: 'Missing id'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
      const [{ data: movie }, { data: streams }, { data: episodes }, { data: subtitles }] = await Promise.all([
        supabase.from('thai_bl_movies').select('*').eq('id', id).maybeSingle(),
        supabase.from('thai_bl_streams').select('*').eq('movie_id', id),
        supabase.from('thai_bl_episodes').select('*').eq('movie_id', id),
        supabase.from('subtitle_tracks').select('*').eq('movie_id', id)
      ]);
      return new Response(JSON.stringify({
        movie,
        streams: streams ?? [],
        episodes: episodes ?? [],
        subtitles: subtitles ?? []
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const body = req.method !== 'GET' ? await req.json() : {};
    // ─── UPSERT movie ───
    if (action === 'upsert-movie') {
      const { movie } = body;
      if (!movie) return new Response(JSON.stringify({
        error: 'Missing movie'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
      const payload = {
        ...movie,
        updated_at: new Date().toISOString()
      };
      const { data, error } = movie.id ? await supabase.from('thai_bl_movies').update(payload).eq('id', movie.id).select().maybeSingle() : await supabase.from('thai_bl_movies').insert({
        ...payload,
        created_at: new Date().toISOString()
      }).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({
        movie: data
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── TOGGLE active ───
    if (action === 'toggle-active') {
      const { id, is_active } = body;
      const { error } = await supabase.from('thai_bl_movies').update({
        is_active
      }).eq('id', id);
      if (error) throw error;
      return new Response(JSON.stringify({
        ok: true
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── DELETE movie ───
    if (action === 'delete-movie') {
      const { id } = body;
      await supabase.from('thai_bl_streams').delete().eq('movie_id', id);
      await supabase.from('thai_bl_episodes').delete().eq('movie_id', id);
      await supabase.from('subtitle_tracks').delete().eq('movie_id', id);
      const { error } = await supabase.from('thai_bl_movies').delete().eq('id', id);
      if (error) throw error;
      return new Response(JSON.stringify({
        ok: true
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── ADD stream ───
    if (action === 'add-stream') {
      const { stream } = body;
      const { data, error } = await supabase.from('thai_bl_streams').insert({
        ...stream,
        is_active: true,
        created_at: new Date().toISOString()
      }).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({
        stream: data
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── UPDATE stream ───
    if (action === 'update-stream') {
      const { id, is_active } = body;
      const { error } = await supabase.from('thai_bl_streams').update({
        is_active
      }).eq('id', id);
      if (error) throw error;
      return new Response(JSON.stringify({
        ok: true
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── DELETE stream ───
    if (action === 'delete-stream') {
      const { id } = body;
      const { error } = await supabase.from('thai_bl_streams').delete().eq('id', id);
      if (error) throw error;
      return new Response(JSON.stringify({
        ok: true
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── CHECK stream health ───
    if (action === 'check-stream') {
      const { movie_id } = body;
      const { data: streams } = await supabase.from('thai_bl_streams').select('*').eq('movie_id', movie_id);
      const results = [];
      for (const s of streams ?? []){
        try {
          const r = await fetch(s.source_url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000)
          });
          results.push({
            id: s.id,
            url: s.source_url,
            alive: r.ok,
            status_code: r.status
          });
          // Update is_active based on health
          await supabase.from('thai_bl_streams').update({
            is_active: r.ok,
            last_checked: new Date().toISOString()
          }).eq('id', s.id);
        } catch  {
          results.push({
            id: s.id,
            url: s.source_url,
            alive: false
          });
          await supabase.from('thai_bl_streams').update({
            is_active: false,
            last_checked: new Date().toISOString()
          }).eq('id', s.id);
        }
      }
      return new Response(JSON.stringify({
        results
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    return new Response(JSON.stringify({
      error: 'Unknown action'
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: String(e)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
