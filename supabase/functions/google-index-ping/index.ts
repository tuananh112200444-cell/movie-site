import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const INDEXING_API_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const SITE_URL = 'https://khophim.org';

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = ['https://khophim.org', 'http://localhost:5173'];
  const safeOrigin = origin && allowed.some((a) => origin.startsWith(a)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemContents = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signingInput}.${signatureB64}`;

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
  if (!tokenData.access_token) {
    throw new Error(`Token error: ${tokenData.error ?? 'unknown'} — ${tokenData.error_description ?? ''}`);
  }
  return tokenData.access_token;
}

async function pingGoogle(url: string, accessToken: string): Promise<{ url: string; ok: boolean; error?: string }> {
  try {
    const res = await fetch(INDEXING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    });
    if (res.ok) return { url, ok: true };
    let errMsg = `HTTP ${res.status}`;
    try {
      const errJson = await res.json() as { error?: { message?: string } };
      if (errJson.error?.message) errMsg = errJson.error.message;
    } catch { /* ignore */ }
    return { url, ok: false, error: errMsg };
  } catch (e) {
    return { url, ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');

    if (!clientEmail || !privateKey) {
      return new Response(JSON.stringify({
        error: 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY in Supabase Secrets'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let slugs: string[] = [];
    if (req.method === 'POST') {
      try {
        const body = await req.json() as { slugs?: string[] };
        if (body.slugs && Array.isArray(body.slugs)) slugs = body.slugs;
      } catch { /* body rỗng */ }
    }

    if (slugs.length === 0) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data } = await supabase
        .from('movie_reviews')
        .select('slug')
        .order('updated_at', { ascending: false })
        .limit(50);
      slugs = (data ?? []).map((r: { slug: string }) => r.slug);
    }

    if (slugs.length === 0) {
      return new Response(JSON.stringify({ message: 'No slugs to ping', pinged: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
    const urls = slugs.map((s) => `${SITE_URL}/phim/${s}`);
    const results: { url: string; ok: boolean; error?: string }[] = [];

    const BATCH = 10;
    for (let i = 0; i < urls.length; i += BATCH) {
      const batch = urls.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map((url) => pingGoogle(url, accessToken)));
      results.push(...batchResults);
      if (i + BATCH < urls.length) await new Promise((r) => setTimeout(r, 500));
    }

    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);

    return new Response(JSON.stringify({
      message: `Pinged ${ok}/${results.length} URLs successfully`,
      pinged: ok,
      failed: failed.length,
      failedUrls: failed.slice(0, 5),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
