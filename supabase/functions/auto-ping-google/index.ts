import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

/**
 * Auto Ping Google Indexing API
 * DEPRECATED — replaced by auto-ping-new-movies with full JWT signing.
 * This function is kept for backward compatibility but returns a deprecation notice.
 */

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://khophim.org',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: 'This function is deprecated. Use auto-ping-new-movies instead.',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
