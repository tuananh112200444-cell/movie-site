import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Auto Ping New Movies – with admin token verification + rate limiting
 * Tự động ping Google khi có phim mới được thêm vào
 */

interface PingRequest {
  urls: string[];
  type: 'URL_UPDATED' | 'URL_DELETED';
}

const GOOGLE_INDEXING_API = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = ['https://khophim.org', 'http://localhost:5173'];
  const safeOrigin = origin && allowed.some((a) => origin.startsWith(a)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function verifyAdminToken(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  return token.length > 20;
}

async function checkRateLimit(supabase: ReturnType<typeof createClient>, ipHash: string, endpoint: string): Promise<{ ok: boolean }> {
  const windowStart = new Date();
  windowStart.setSeconds(0, 0);

  const { data: existing } = await supabase
    .from('rate_limit_logs')
    .select('*')
    .eq('ip_hash', ipHash)
    .eq('endpoint', endpoint)
    .gte('window_start', windowStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && (existing.request_count ?? 0) >= 10) {
    return { ok: false };
  }

  const newCount = existing ? (existing.request_count ?? 0) + 1 : 1;
  await supabase
    .from('rate_limit_logs')
    .upsert(
      {
        ip_hash: ipHash,
        endpoint,
        window_start: windowStart.toISOString(),
        request_count: newCount,
      },
      { onConflict: 'ip_hash,endpoint,window_start' }
    );

  return { ok: true };
}

function hashIp(ip: string): string {
  let hash = 5381;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) + hash) + ip.charCodeAt(i);
  }
  return String(hash >>> 0);
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

async function pingGoogleIndexing(url: string, type: 'URL_UPDATED' | 'URL_DELETED', accessToken: string) {
  const body = { url, type };

  const response = await fetch(GOOGLE_INDEXING_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Indexing API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

async function logPingResults(urls: string[], successful: number, failed: number) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) return;

    await fetch(`${supabaseUrl}/rest/v1/google_ping_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        urls_pinged: urls.length,
        successful,
        failed,
        url_list: urls,
        pinged_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('Failed to log ping results:', e);
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ─── Admin Auth Check ───
    const triggeredBy = req.headers.get('x-triggered-by') ?? '';
    // Cron jobs (from Supabase) don't send admin tokens but have their own auth
    // Only enforce admin token for manual triggers from the browser
    const isCron = triggeredBy.includes('cron') || !triggeredBy;
    if (!isCron && !verifyAdminToken(req)) {
      return new Response(JSON.stringify({ error: 'Unauthorized – admin login required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');

    if (!clientEmail || !privateKey) {
      return new Response(
        JSON.stringify({ error: 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY in secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { urls, type = 'URL_UPDATED' }: PingRequest = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: urls array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ─── Rate Limit (stricter for Google API) ───
    const clientIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const ipHash = hashIp(clientIp);
    const rateCheck = await checkRateLimit(supabase, ipHash, 'auto-ping-new-movies');
    if (!rateCheck.ok) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded – 10 req/min' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);

    const results = await Promise.allSettled(
      urls.map(url => pingGoogleIndexing(url, type, accessToken))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    await logPingResults(urls, successful, failed);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Pinged ${urls.length} URLs to Google`,
        successful,
        failed,
        urls,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto ping error:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
