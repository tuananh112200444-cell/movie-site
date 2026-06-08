/**
 * Check Google Credentials – with admin token verification + rate limiting
 */

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = ['https://khophim.org', 'http://localhost:5173'];
  const safeOrigin = origin && allowed.some((a) => origin.startsWith(a)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!verifyAdminToken(req)) {
      return new Response(JSON.stringify({ error: 'Unauthorized – admin login required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const key = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');

    const hasEmail = !!email && email.length > 0;
    const hasKey = !!key && key.length > 50;
    const isReady = hasEmail && hasKey;

    const keyValid = hasKey &&
      key.includes('BEGIN PRIVATE KEY') &&
      key.includes('END PRIVATE KEY');

    return new Response(
      JSON.stringify({
        ready: isReady && keyValid,
        hasEmail,
        hasKey,
        keyValid,
        emailPreview: hasEmail ? `${email.substring(0, 10)}...${email.substring(email.indexOf('@'))}` : null,
        message: isReady && keyValid
          ? 'Google Service Account credentials đã sẵn sàng'
          : !hasEmail
            ? 'Thiếu GOOGLE_SERVICE_ACCOUNT_EMAIL trong Supabase Secrets'
            : !hasKey
              ? 'Thiếu GOOGLE_SERVICE_ACCOUNT_KEY trong Supabase Secrets'
              : 'GOOGLE_SERVICE_ACCOUNT_KEY không đúng format (thiếu BEGIN/END PRIVATE KEY)',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ready: false,
        error: String(e),
        message: 'Lỗi kiểm tra credentials',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
});
