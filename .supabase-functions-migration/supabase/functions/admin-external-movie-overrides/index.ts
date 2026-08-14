import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') ?? 'https://mhophim.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
function cors(origin) {
  const allowed = [
    'https://mhophim.com',
    'http://localhost:5173',
    'http://localhost:3000',
    ...CORS_ORIGIN.split(',')
  ].map((s)=>s.trim()).filter(Boolean);
  const requestOrigin = origin ? (()=>{
    try {
      return new URL(origin).origin;
    } catch  {
      return '';
    }
  })() : '';
  const safe = allowed.includes(requestOrigin) ? requestOrigin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safe,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
async function verifyToken(token) {
  try {
    const decoded = atob(token);
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return false;
    const payload = decoded.slice(0, lastDot);
    const signature = decoded.slice(lastDot + 1);
    const [, expiresAtStr] = payload.split('.');
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000)) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(SUPABASE_SERVICE_ROLE_KEY.slice(0, 32) || 'khophim-admin-fallback'), {
      name: 'HMAC',
      hash: 'SHA-256'
    }, false, [
      'verify'
    ]);
    const sigBytes = Uint8Array.from(atob(signature), (c)=>c.charCodeAt(0));
    return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));
  } catch  {
    return false;
  }
}
function optionalJsonArray(value) {
  if (Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch  {
    return text.split(',').map((item)=>item.trim()).filter(Boolean);
  }
}
function cleanPayload(value) {
  const allowed = [
    'source_site',
    'movie_slug',
    'name',
    'origin_name',
    'title_vi',
    'title_en',
    'title_zh',
    'content',
    'type',
    'status',
    'thumb_url',
    'poster_url',
    'trailer_url',
    'time',
    'episode_current',
    'episode_total',
    'quality',
    'lang',
    'notify',
    'showtimes',
    'year',
    'actor',
    'director',
    'category',
    'country',
    'sort_order',
    'is_active',
    'note'
  ];
  const payload = {};
  for (const key of allowed){
    if (key in value) payload[key] = value[key];
  }
  payload.source_site = String(payload.source_site || 'any').trim().toLowerCase();
  payload.movie_slug = String(payload.movie_slug || '').trim();
  if (!payload.movie_slug) throw new Error('Thiếu slug phim');
  payload.year = payload.year ? Number(payload.year) : null;
  payload.sort_order = payload.sort_order ? Number(payload.sort_order) : 0;
  payload.actor = optionalJsonArray(payload.actor);
  payload.director = optionalJsonArray(payload.director);
  payload.category = optionalJsonArray(payload.category);
  payload.country = optionalJsonArray(payload.country);
  return payload;
}
serve(async (req)=>{
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers
  });
  try {
    const body = await req.json();
    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!await verifyToken(body.token || bearer)) {
      return new Response(JSON.stringify({
        error: 'Admin token không hợp lệ hoặc đã hết hạn'
      }), {
        status: 401,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false
      }
    });
    if (body.action === 'delete') {
      if (!body.id) throw new Error('Thiếu ID cần xóa');
      const { error } = await supabase.from('external_movie_overrides').delete().eq('id', body.id);
      if (error) throw error;
      return new Response(JSON.stringify({
        success: true,
        deleted: body.id
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
    if (body.action === 'upsert') {
      const payload = cleanPayload(body.override || {});
      const query = body.id ? supabase.from('external_movie_overrides').update(payload).eq('id', body.id) : supabase.from('external_movie_overrides').insert(payload);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return new Response(JSON.stringify({
        success: true,
        override: data
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
    let query = supabase.from('external_movie_overrides').select('*').order('created_at', {
      ascending: false
    }).limit(200);
    const movieSlug = String(body.movie_slug || '').trim();
    if (movieSlug) query = query.eq('movie_slug', movieSlug);
    const { data, error } = await query;
    if (error) throw error;
    return new Response(JSON.stringify({
      success: true,
      overrides: data ?? []
    }), {
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : String(e)
    }), {
      status: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  }
});
