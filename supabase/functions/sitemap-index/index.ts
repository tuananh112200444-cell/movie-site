Deno.serve(() => {
  const now = new Date().toISOString().split('T')[0];
  const movieChunks = Array.from({ length: 8 }, (_, index) => {
    const page = index + 1;
    return `  <sitemap>
    <loc>https://khophim.org/sitemap-movies-${page}.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- khophim.org Sitemap Index - Last updated: ${now} -->
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://khophim.org/sitemap-static.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://khophim.org/sitemap-seo-landing.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://khophim.org/sitemap-movies-recent.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://khophim.org/sitemap-movies-upcoming.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
${movieChunks}
</sitemapindex>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
