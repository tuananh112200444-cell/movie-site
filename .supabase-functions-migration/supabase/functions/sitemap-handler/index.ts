import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'public, max-age=3600',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
};
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
function emptyUrlset() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
</urlset>`;
}
function emptyIndex(now) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- mhophim.com Sitemap Index — Last updated: ${now} -->
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://mhophim.com/sitemap-static.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://mhophim.com/sitemap-seo-landing.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? '';
  const action = url.searchParams.get('action') ?? '';
  const now = new Date().toISOString().split('T')[0];
  // ─── sitemap-index.xml ───
  if (type === 'index') {
    return new Response(emptyIndex(now), {
      status: 200,
      headers: {
        ...XML_HEADERS,
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }
  // ─── generate-sitemap JSON ───
  if (action === 'generate' || type === 'generate') {
    if (url.searchParams.get('serve') === '1') {
      return new Response(emptyUrlset(), {
        status: 200,
        headers: XML_HEADERS
      });
    }
    return new Response(JSON.stringify({
      success: true,
      movies: 0,
      message: 'Sitemap generation paused — /phim/ URLs are noindex. SEO focuses on category pages.',
      generated: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }
  // ─── get-sitemap-xml (storage) ───
  if (type === 'storage') {
    const file = url.searchParams.get('file') ?? 'sitemap-movies.xml';
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data, error } = await supabase.storage.from('sitemaps').download(file);
    if (error || !data) {
      return new Response(JSON.stringify({
        error: error?.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
    const xml = await data.text();
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        ...CORS_HEADERS
      }
    });
  }
  // ─── sitemap-movies-xml / sitemap-reviews / sitemap-proxy ───
  // All return empty XML since /phim/ is noindex
  return new Response(emptyUrlset(), {
    status: 200,
    headers: {
      ...XML_HEADERS,
      'X-Movie-Count': '0'
    }
  });
});
