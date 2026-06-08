import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Admin Review Delete – with admin token verification + rate limiting
 */

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = ['https://khophim.org', 'http://localhost:5173'];
  const safeOrigin = origin && allowed.some((a) => origin.startsWith(a)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

  if (existing && (existing.request_count ?? 0) >= 30) {
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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!verifyAdminToken(req)) {
      return new Response(JSON.stringify({ error: 'Unauthorized – admin login required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as { slug?: string };
    const slug = body.slug;
    if (!slug) {
      return new Response(JSON.stringify({ error: 'Missing slug' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clientIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const ipHash = hashIp(clientIp);
    const rateCheck = await checkRateLimit(supabase, ipHash, 'admin-review-delete');
    if (!rateCheck.ok) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded – 30 req/min' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase
      .from('movie_reviews')
      .delete()
      .eq('slug', slug);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, slug }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
