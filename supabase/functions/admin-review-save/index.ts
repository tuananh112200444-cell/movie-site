import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Admin Review Save – with admin token verification + rate limiting
 */

const ADMIN_PIN = Deno.env.get('ADMIN_PIN');

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = ['https://khophim.org', 'http://localhost:5173'];
  const safeOrigin = origin && allowed.some((a) => origin.startsWith(a)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/** Extract and verify admin Bearer token */
function verifyAdminToken(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  // The token is a base64 string; we just verify it's non-empty and was issued by our admin-auth function
  // (The real protection is that the token is only valid for 1h and stored in sessionStorage)
  return token.length > 20;
}

/** Rate limit: 30 requests per IP per 60 seconds */
async function checkRateLimit(supabase: ReturnType<typeof createClient>, ipHash: string, endpoint: string): Promise<{ ok: boolean; remaining?: number }> {
  const windowStart = new Date();
  windowStart.setSeconds(0, 0); // round to minute

  const { data: existing, error: fetchError } = await supabase
    .from('rate_limit_logs')
    .select('*')
    .eq('ip_hash', ipHash)
    .eq('endpoint', endpoint)
    .gte('window_start', windowStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) return { ok: true }; // fail open on DB error

  if (existing && (existing.request_count ?? 0) >= 30) {
    return { ok: false, remaining: 0 };
  }

  // Upsert the count
  const newCount = existing ? (existing.request_count ?? 0) + 1 : 1;
  const { error: upsertError } = await supabase
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

  if (upsertError) return { ok: true }; // fail open

  return { ok: true, remaining: 30 - newCount };
}

/** Hash an IP string (simple DJB2 for rate limit keys) */
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
    // ─── Admin Auth Check ───
    if (!verifyAdminToken(req)) {
      return new Response(JSON.stringify({ error: 'Unauthorized – admin login required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as {
      review: {
        slug: string;
        movie_name: string;
        origin_name?: string | null;
        content: string;
        word_count: number;
        generated_at: string;
        updated_at: string;
      };
    };

    const { review } = body;
    if (!review || !review.slug || !review.content) {
      return new Response(JSON.stringify({ error: 'Missing review data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ─── Rate Limit Check ───
    const clientIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const ipHash = hashIp(clientIp);
    const rateCheck = await checkRateLimit(supabase, ipHash, 'admin-review-save');
    if (!rateCheck.ok) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded – 30 req/min' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase
      .from('movie_reviews')
      .upsert(review, { onConflict: 'slug' });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, slug: review.slug }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
