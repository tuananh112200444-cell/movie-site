import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') ?? 'https://mhophim.com';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const R2_BUCKET = Deno.env.get('R2_BUCKET') ?? '';
const R2_PUBLIC_BASE_URL = (Deno.env.get('R2_PUBLIC_BASE_URL') ?? '').replace(/\/+$/, '');
const MAX_UPLOAD_BYTES = Number(Deno.env.get('R2_MAX_UPLOAD_BYTES') || 5 * 1024 * 1024 * 1024);
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
    if (!expiresAt || Number.isNaN(expiresAt)) return false;
    const secret = SUPABASE_SERVICE_ROLE_KEY.slice(0, 32) || 'khophim-admin-fallback';
    return expiresAt > Math.floor(Date.now() / 1000) && await hmacVerify(payload, signature, secret);
  } catch  {
    return false;
  }
}
function safePathPart(value, fallback) {
  const cleaned = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || fallback;
}
function validateConfigured() {
  const missing = [
    [
      'R2_ACCOUNT_ID',
      R2_ACCOUNT_ID
    ],
    [
      'R2_ACCESS_KEY_ID',
      R2_ACCESS_KEY_ID
    ],
    [
      'R2_SECRET_ACCESS_KEY',
      R2_SECRET_ACCESS_KEY
    ],
    [
      'R2_BUCKET',
      R2_BUCKET
    ],
    [
      'R2_PUBLIC_BASE_URL',
      R2_PUBLIC_BASE_URL
    ]
  ].filter(([, value])=>!value).map(([key])=>key);
  if (missing.length > 0) {
    throw new Error(`Chua cau hinh R2 secrets: ${missing.join(', ')}`);
  }
}
serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: corsHeaders
  });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    validateConfigured();
    const body = await req.json();
    if (!body.token || !await verifyAdminToken(body.token)) {
      return new Response(JSON.stringify({
        error: 'Invalid or expired admin token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const size = Number(body.size || 0);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      throw new Error(`File qua lon hoac khong hop le. Gioi han: ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`);
    }
    const fileName = safePathPart(String(body.file_name || 'video.mp4'), 'video.mp4');
    const movieSlug = safePathPart(String(body.movie_slug || 'movie'), 'movie');
    const episodeSlug = safePathPart(String(body.episode_slug || 'full'), 'full');
    const contentType = String(body.content_type || 'application/octet-stream');
    const key = `movies/${movieSlug}/${episodeSlug}/${Date.now()}-${fileName}`;
    const encodedKey = key.split('/').map((part)=>encodeURIComponent(part)).join('/');
    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${encodedKey}`;
    const aws = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto'
    });
    const signed = await aws.sign(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      aws: {
        signQuery: true
      }
    });
    return new Response(JSON.stringify({
      success: true,
      uploadUrl: signed.url,
      publicUrl: `${R2_PUBLIC_BASE_URL}/${key}`,
      key,
      contentType
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
