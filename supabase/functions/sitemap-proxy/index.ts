const SITEMAP_URL = 'https://khophim.org/sitemap-movies.xml';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      },
    });
  }

  return Response.redirect(SITEMAP_URL, 302);
});
