import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Auto Ping New Movies – with admin token verification + rate limiting
 * Tự động ping Google khi có phim mới được thêm vào
 */

interface PingRequest {
  urls?: string[];
  type?: 'URL_UPDATED' | 'URL_DELETED';
  withinHours?: number;
  limit?: number;
  maxPerRun?: number;
}

interface GooglePingResult {
  ok: boolean;
  status: number;
  url: string;
  data?: unknown;
  error?: string;
}

const GOOGLE_INDEXING_API = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SITE_URL = 'https://khophim.org';
const LOOKBACK_HOURS = 24;
const FAILED_URL_COOLDOWN_HOURS = 12;
const CIRCUIT_BREAKER_HOURS = 2;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(Deno.env.get(name) || '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

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

function verifyCronSecret(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET') || '';
  if (!expected) return false;
  const url = new URL(req.url);
  const provided = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  return provided === expected;
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

async function pingGoogleIndexing(url: string, type: 'URL_UPDATED' | 'URL_DELETED', accessToken: string): Promise<GooglePingResult> {
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
    return { ok: false, status: response.status, url, error };
  }

  return { ok: true, status: response.status, url, data: await response.json() };
}

function shouldStopBatchAfter(result: GooglePingResult): boolean {
  if (result.ok) return false;
  const error = String(result.error || '').toLowerCase();
  return result.status === 403
    || result.status === 429
    || error.includes('quota')
    || error.includes('permission')
    || error.includes('rate limit');
}

function slugFromMovieUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.match(/^\/phim\/([^/]+)/)?.[1] || url);
  } catch {
    return url;
  }
}

async function logPingResults(
  supabase: ReturnType<typeof createClient>,
  urls: string[],
  successful: number,
  failed: number,
  triggeredBy: string,
  failedUrls: string[] = [],
) {
  try {
    await supabase.from('google_ping_logs').insert({
      run_at: new Date().toISOString(),
      total_movies: urls.length,
      pinged_ok: successful,
      pinged_fail: failed,
      failed_slugs: failedUrls.slice(0, 50).map(slugFromMovieUrl),
      triggered_by: triggeredBy || 'manual',
    });
  } catch (e) {
    console.error('Failed to log ping results:', e);
  }
}

async function getRecentMovieUrls(
  supabase: ReturnType<typeof createClient>,
  withinHours = 26,
  limit = 50,
): Promise<string[]> {
  const safeHours = Math.max(1, Math.min(Number(withinHours || 26), 168));
  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 100));
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('movies')
    .select('slug')
    .eq('is_published', true)
    .not('slug', 'is', null)
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(`movies select for Google ping: ${error.message}`);
  return Array.from(new Set((data || [])
    .map((row: { slug?: string }) => String(row.slug || '').trim())
    .filter(Boolean)
    .map((slug) => `${SITE_URL}/phim/${encodeURIComponent(slug)}`)));
}

async function getRecentPingAttempts(supabase: ReturnType<typeof createClient>): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('google_ping_logs')
    .select('total_movies')
    .gte('run_at', since)
    .limit(5000);

  if (error) {
    console.warn('Google ping budget check failed:', error.message);
    return 0;
  }

  return (data || []).reduce((sum: number, row: { total_movies?: number | null }) => {
    return sum + Math.max(0, Number(row.total_movies || 0));
  }, 0);
}

async function getRecentFailedSlugs(supabase: ReturnType<typeof createClient>): Promise<Set<string>> {
  const since = new Date(Date.now() - FAILED_URL_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('google_ping_logs')
    .select('failed_slugs')
    .gte('run_at', since)
    .gt('pinged_fail', 0)
    .limit(1000);

  if (error) {
    console.warn('Google ping failed slug cooldown check failed:', error.message);
    return new Set();
  }

  const slugs = new Set<string>();
  for (const row of data || []) {
    for (const slug of row.failed_slugs || []) {
      const clean = String(slug || '').trim();
      if (clean) slugs.add(clean);
    }
  }
  return slugs;
}

async function getCircuitBreakerState(supabase: ReturnType<typeof createClient>): Promise<{ open: boolean; attempts: number; failed: number; failureRate: number }> {
  const since = new Date(Date.now() - CIRCUIT_BREAKER_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('google_ping_logs')
    .select('total_movies,pinged_fail')
    .gte('run_at', since)
    .limit(1000);

  if (error) {
    console.warn('Google ping circuit breaker check failed:', error.message);
    return { open: false, attempts: 0, failed: 0, failureRate: 0 };
  }

  const attempts = (data || []).reduce((sum: number, row: { total_movies?: number | null }) => sum + Math.max(0, Number(row.total_movies || 0)), 0);
  const failed = (data || []).reduce((sum: number, row: { pinged_fail?: number | null }) => sum + Math.max(0, Number(row.pinged_fail || 0)), 0);
  const failureRate = attempts > 0 ? failed / attempts : 0;
  return { open: attempts >= 20 && failureRate >= 0.8, attempts, failed, failureRate };
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
    const isCron = triggeredBy.includes('cron') && verifyCronSecret(req);
    if (!isCron && !verifyAdminToken(req)) {
      return new Response(JSON.stringify({ error: 'Unauthorized – admin login required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({})) as PingRequest;
    const type = body.type || 'URL_UPDATED';
    let urls = Array.isArray(body.urls) ? body.urls : [];
    if (urls.length === 0) {
      urls = await getRecentMovieUrls(supabase, body.withinHours || 26, body.limit || 50);
    }

    urls = Array.from(new Set(urls
      .map((item) => String(item || '').trim())
      .filter((item) => item.startsWith(`${SITE_URL}/phim/`))))
      .slice(0, 100);

    if (urls.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No movie URLs to ping', urls: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Rate Limit (stricter for Google API) ───
    const dailyBudget = envInt('GOOGLE_INDEX_DAILY_BUDGET', 180, 50, 200);
    const defaultMaxPerRun = isCron
      ? envInt('GOOGLE_INDEX_CRON_MAX_URLS_PER_RUN', 4, 1, 20)
      : envInt('GOOGLE_INDEX_MANUAL_MAX_URLS_PER_RUN', 20, 1, 50);
    const requestedMaxPerRun = Number(body.maxPerRun || body.limit || 0);
    const maxPerRun = requestedMaxPerRun > 0
      ? Math.max(1, Math.min(Math.floor(requestedMaxPerRun), defaultMaxPerRun))
      : defaultMaxPerRun;
    const recentAttempts = await getRecentPingAttempts(supabase);
    const remainingBudget = Math.max(0, dailyBudget - recentAttempts);

    if (remainingBudget <= 0) {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'quota_guard',
          message: `Google Indexing API budget guarded: ${recentAttempts}/${dailyBudget} URLs attempted in the last ${LOOKBACK_HOURS}h. Sitemap remains the crawl source for the rest.`,
          queued_urls: urls.length,
          pinged_urls: 0,
          sample_urls: urls.slice(0, 5),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const circuit = await getCircuitBreakerState(supabase);
    if (circuit.open) {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'circuit_open',
          message: `Google Indexing API circuit breaker is open: ${circuit.failed}/${circuit.attempts} URLs failed in the last ${CIRCUIT_BREAKER_HOURS}h. Sitemap remains active; ping will resume after failures cool down.`,
          queued_urls: urls.length,
          pinged_urls: 0,
          failure_rate: Number(circuit.failureRate.toFixed(3)),
          sample_urls: urls.slice(0, 5),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const queuedUrls = urls.length;
    if (isCron) {
      const recentFailedSlugs = await getRecentFailedSlugs(supabase);
      if (recentFailedSlugs.size > 0) {
        urls = urls.filter((url) => !recentFailedSlugs.has(slugFromMovieUrl(url)));
      }
      if (urls.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            status: 'cooldown_skipped',
            message: `All queued URLs recently failed Google ping and are cooling down for ${FAILED_URL_COOLDOWN_HOURS}h. Sitemap remains active.`,
            queued_urls: queuedUrls,
            pinged_urls: 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    urls = urls.slice(0, Math.min(maxPerRun, remainingBudget));

    const clientIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const ipHash = hashIp(clientIp);
    const rateCheck = await checkRateLimit(supabase, ipHash, 'auto-ping-new-movies');
    if (!rateCheck.ok) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded – 10 req/min' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');

    if (!clientEmail || !privateKey) {
      await logPingResults(supabase, urls, 0, urls.length, triggeredBy || 'cron-missing-credentials', urls);
      return new Response(
        JSON.stringify({
          success: false,
          status: 'credentials_missing',
          message: 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY in Supabase Secrets',
          queued_urls: urls.length,
          sample_urls: urls.slice(0, 5),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);

    const results: GooglePingResult[] = [];
    for (const url of urls) {
      const result = await pingGoogleIndexing(url, type, accessToken);
      results.push(result);
      if (shouldStopBatchAfter(result)) break;
    }

    const successful = results.filter((result) => result.ok).length;
    const failedResults = results.filter((result) => !result.ok);
    const failed = failedResults.length;
    const failedSamples = failedResults.slice(0, 5).map((result) => ({
      url: result.url,
      status: result.status,
      error: String(result.error || 'unknown').slice(0, 500),
    }));

    await logPingResults(supabase, results.map((item) => item.url), successful, failed, triggeredBy || 'manual', failedResults.map((item) => item.url));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Pinged ${results.length} URLs to Google`,
        status: failed === 0 ? 'ok' : 'partial',
        daily_budget: dailyBudget,
        recent_attempts_before_run: recentAttempts,
        queued_urls: queuedUrls,
        selected_urls: urls.length,
        successful,
        failed,
        stopped_early: results.length < urls.length,
        sample_urls: results.map((item) => item.url).slice(0, 10),
        failed_samples: failedSamples,
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
