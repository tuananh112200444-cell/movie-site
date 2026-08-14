import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') ?? 'https://mhophim.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
function toOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch  {
    return null;
  }
}
function getCorsHeaders(origin) {
  const configured = CORS_ORIGIN ? CORS_ORIGIN.split(',').map((s)=>s.trim()).filter(Boolean) : [];
  const allowed = [
    'https://mhophim.com',
    'http://localhost:5173',
    'http://localhost:3000',
    ...configured
  ];
  const allowedOrigins = allowed.map((a)=>toOrigin(a)).filter((a)=>Boolean(a));
  const requestOrigin = toOrigin(origin);
  const safe = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': safe,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
async function hmacVerify(message, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {
    name: 'HMAC',
    hash: 'SHA-256'
  }, false, [
    'verify'
  ]);
  const sigBytes = Uint8Array.from(atob(signature), (c)=>c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(message));
}
async function verifyAdminToken(token) {
  try {
    const decoded = atob(token);
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return false;
    const payload = decoded.slice(0, lastDot);
    const signature = decoded.slice(lastDot + 1);
    const [, expiresAtStr] = payload.split('.');
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || Number.isNaN(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
    const secret = SUPABASE_SERVICE_ROLE_KEY.slice(0, 32) || 'khophim-admin-fallback';
    return hmacVerify(payload, signature, secret);
  } catch  {
    return false;
  }
}
function cleanPayload(value) {
  const allowed = [
    'source_site',
    'movie_slug',
    'action',
    'target_server_name',
    'target_episode_slug',
    'target_episode_number',
    'server_name',
    'episode_name',
    'episode_slug',
    'link_embed',
    'link_m3u8',
    'subtitle_url',
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
  payload.action = String(payload.action || 'add').trim().toLowerCase();
  if (!payload.movie_slug) throw new Error('Thiếu slug phim');
  if (![
    'add',
    'update',
    'hide'
  ].includes(String(payload.action))) throw new Error('Hành động không hợp lệ');
  return payload;
}
serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: corsHeaders
  });
  try {
    const body = await req.json();
    const authHeader = req.headers.get('authorization') || '';
    const headerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const token = body.token || headerToken;
    if (!token || !await verifyAdminToken(token)) {
      return new Response(JSON.stringify({
        error: 'Admin token không hợp lệ hoặc đã hết hạn'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
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
      const { error } = await supabase.from('external_episode_overrides').delete().eq('id', body.id);
      if (error) throw error;
      return new Response(JSON.stringify({
        success: true,
        deleted: body.id
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (body.action === 'upsert') {
      const payload = cleanPayload(body.override || {});
      const query = body.id ? supabase.from('external_episode_overrides').update(payload).eq('id', body.id) : supabase.from('external_episode_overrides').insert(payload);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return new Response(JSON.stringify({
        success: true,
        override: data
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    let query = supabase.from('external_episode_overrides').select('*').order('created_at', {
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
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : String(e)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
