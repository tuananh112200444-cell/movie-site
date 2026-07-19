const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': 'https://khophim.org',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  return new Response(JSON.stringify({
    status: false,
    disabled: true,
    message: 'Automatic Indexing API submission is disabled for ordinary movie pages. New eligible movies are discovered through the curated sitemap and internal links.',
    sitemap: 'https://khophim.org/sitemap-movies-recent.xml',
  }), { status: 410, headers: HEADERS });
});
