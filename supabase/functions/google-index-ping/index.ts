const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': 'https://khophim.org',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  return new Response(JSON.stringify({
    status: false,
    disabled: true,
    message: 'Google Indexing API is not used for ordinary movie pages. Discovery is handled through curated XML sitemaps and internal links.',
    sitemap: 'https://khophim.org/sitemap.xml',
  }), { status: 410, headers: HEADERS });
});
