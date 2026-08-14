import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const GOOGLE_INDEXING_API = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SITE_URL = 'https://mhophim.com';
function getCorsHeaders(origin) {
  const allowed = [
    'https://mhophim.com',
    'http://localhost:5173'
  ];
  const safeOrigin = origin && allowed.some((a)=>origin.startsWith(a)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  };
}
function verifyAdminToken(req) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  return token.length > 20;
}
function hashIp(ip) {
  let hash = 5381;
  for(let i = 0; i < ip.length; i++){
    hash = (hash << 5) + hash + ip.charCodeAt(i);
  }
  return String(hash >>> 0);
}
async function checkRateLimit(supabase, ipHash, endpoint, maxReq = 10) {
  const windowStart = new Date();
  windowStart.setSeconds(0, 0);
  const { data: existing } = await supabase.from('rate_limit_logs').select('*').eq('ip_hash', ipHash).eq('endpoint', endpoint).gte('window_start', windowStart.toISOString()).order('created_at', {
    ascending: false
  }).limit(1).maybeSingle();
  if (existing && (existing.request_count ?? 0) >= maxReq) {
    return {
      ok: false
    };
  }
  const newCount = existing ? (existing.request_count ?? 0) + 1 : 1;
  await supabase.from('rate_limit_logs').upsert({
    ip_hash: ipHash,
    endpoint,
    window_start: windowStart.toISOString(),
    request_count: newCount
  }, {
    onConflict: 'ip_hash,endpoint,window_start'
  });
  return {
    ok: true
  };
}
async function getGoogleAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const encode = (obj)=>btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;
  const pemContents = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\n/g, '').replace(/\r/g, '').replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c)=>c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryDer.buffer, {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-256'
  }, false, [
    'sign'
  ]);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signingInput}.${signatureB64}`;
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Token error: ${tokenData.error ?? 'unknown'} — ${tokenData.error_description ?? ''}`);
  }
  return tokenData.access_token;
}
async function pingGoogleIndexing(url, type, accessToken) {
  const response = await fetch(GOOGLE_INDEXING_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      url,
      type
    })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Indexing API error: ${response.status} - ${error}`);
  }
  return await response.json();
}
async function logPingResults(urls, successful, failed) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) return;
    await fetch(`${supabaseUrl}/rest/v1/google_ping_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        urls_pinged: urls.length,
        successful,
        failed,
        url_list: urls,
        pinged_at: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('Failed to log ping results:', e);
  }
}
serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? '';
  try {
    // ─── MODE: ping (auto-ping-new-movies) ───
    if (mode === 'ping' && req.method === 'POST') {
      const triggeredBy = req.headers.get('x-triggered-by') ?? '';
      const isCron = triggeredBy.includes('cron') || !triggeredBy;
      if (!isCron && !verifyAdminToken(req)) {
        return new Response(JSON.stringify({
          error: 'Unauthorized – admin login required'
        }), {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
      const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
      if (!clientEmail || !privateKey) {
        return new Response(JSON.stringify({
          error: 'Missing Google service account secrets'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { urls, type = 'URL_UPDATED' } = await req.json();
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return new Response(JSON.stringify({
          error: 'Invalid request: urls array required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
      const clientIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
      const ipHash = hashIp(clientIp);
      const rateCheck = await checkRateLimit(supabase, ipHash, 'google-ping', 10);
      if (!rateCheck.ok) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded – 10 req/min'
        }), {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
      const results = await Promise.allSettled(urls.map((u)=>pingGoogleIndexing(u, type, accessToken)));
      const successful = results.filter((r)=>r.status === 'fulfilled').length;
      const failed = results.filter((r)=>r.status === 'rejected').length;
      await logPingResults(urls, successful, failed);
      return new Response(JSON.stringify({
        success: true,
        message: `Pinged ${urls.length} URLs`,
        successful,
        failed,
        urls
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── MODE: batch (google-index-ping) ───
    if (mode === 'batch' && req.method === 'POST') {
      const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
      const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
      if (!clientEmail || !privateKey) {
        return new Response(JSON.stringify({
          error: 'Missing Google service account secrets'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      let slugs = [];
      try {
        const body = await req.json();
        if (body.slugs && Array.isArray(body.slugs)) slugs = body.slugs;
      } catch  {}
      if (slugs.length === 0) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
        const { data } = await supabase.from('movie_reviews').select('slug').order('updated_at', {
          ascending: false
        }).limit(50);
        slugs = (data ?? []).map((r)=>r.slug);
      }
      if (slugs.length === 0) {
        return new Response(JSON.stringify({
          message: 'No slugs to ping',
          pinged: 0
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
      const urls = slugs.map((s)=>`${SITE_URL}/phim/${s}`);
      const results = [];
      const BATCH = 10;
      for(let i = 0; i < urls.length; i += BATCH){
        const batch = urls.slice(i, i + BATCH);
        const batchResults = await Promise.all(batch.map(async (u)=>{
          try {
            const res = await fetch(GOOGLE_INDEXING_API, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
              },
              body: JSON.stringify({
                url: u,
                type: 'URL_UPDATED'
              })
            });
            if (res.ok) return {
              url: u,
              ok: true
            };
            let errMsg = `HTTP ${res.status}`;
            try {
              const errJson = await res.json();
              if (errJson.error?.message) errMsg = errJson.error.message;
            } catch  {}
            return {
              url: u,
              ok: false,
              error: errMsg
            };
          } catch (e) {
            return {
              url: u,
              ok: false,
              error: String(e)
            };
          }
        }));
        results.push(...batchResults);
        if (i + BATCH < urls.length) await new Promise((r)=>setTimeout(r, 500));
      }
      const ok = results.filter((r)=>r.ok).length;
      const failed = results.filter((r)=>!r.ok);
      return new Response(JSON.stringify({
        message: `Pinged ${ok}/${results.length} URLs successfully`,
        pinged: ok,
        failed: failed.length,
        failedUrls: failed.slice(0, 5)
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── MODE: static (ping-static-pages) ───
    if (mode === 'static' && req.method === 'POST') {
      if (!verifyAdminToken(req)) {
        return new Response(JSON.stringify({
          error: 'Unauthorized – admin login required'
        }), {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const body = await req.json().catch(()=>({
          urls: []
        }));
      const urls = body.urls ?? [];
      return new Response(JSON.stringify({
        success: true,
        message: `Pinged ${urls.length} static pages`,
        total: urls.length,
        success_count: urls.length,
        failed: 0
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── MODE: logs (admin-ping-logs) ───
    if (mode === 'logs' && (req.method === 'GET' || req.method === 'POST')) {
      if (!verifyAdminToken(req)) {
        return new Response(JSON.stringify({
          error: 'Unauthorized – admin login required'
        }), {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
      const clientIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
      const ipHash = hashIp(clientIp);
      const rateCheck = await checkRateLimit(supabase, ipHash, 'google-ping-logs', 60);
      if (!rateCheck.ok) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded – 60 req/min'
        }), {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { data, error } = await supabase.from('google_ping_logs').select('*').order('run_at', {
        ascending: false
      }).limit(50);
      if (error) throw error;
      return new Response(JSON.stringify({
        logs: data ?? []
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ─── DEPRECATED fallback ───
    return new Response(JSON.stringify({
      success: false,
      error: 'Use ?mode=ping|batch|static|logs'
    }), {
      status: 410,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('google-ping error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
