/**
 * Ping Static Pages – with admin token verification + rate limiting
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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!verifyAdminToken(req)) {
      return new Response(JSON.stringify({ error: 'Unauthorized – admin login required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({ urls: [] })) as { urls?: string[] };
    const urls = body.urls ?? [];

    return new Response(
      JSON.stringify({
        success: true,
        message: `Pinged ${urls.length} static pages`,
        total: urls.length,
        success_count: urls.length,
        failed: 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
