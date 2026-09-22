import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SITE_URL = 'https://khophim.org';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function xmlEscape(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return new Response('Missing Supabase environment', { status: 500 });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from('movie_seo_profiles')
    .select('slug,og_image_url,updated_at,live_audit,last_audited_at,movies!inner(name,poster_url,thumb_url,superseded_by_movie_id)')
    .eq('status', 'published')
    .eq('index_mode', 'index')
    .gte('validation_score', 85)
    .is('movies.superseded_by_movie_id', null)
    .order('updated_at', { ascending: false })
    .limit(5000);
  if (error) return new Response(error.message, { status: 503 });

  const urls = (data ?? []).map((row) => {
    const movie = Array.isArray(row.movies) ? row.movies[0] : row.movies;
    const name = movie?.name || row.slug;
    const image = row.og_image_url || movie?.poster_url || movie?.thumb_url || '';
    const imageXml = image ? `<image:image><image:loc>${xmlEscape(image)}</image:loc><image:title>${xmlEscape(name)}</image:title></image:image>` : '';
    return `  <url><loc>${SITE_URL}/phim/${encodeURIComponent(row.slug)}</loc><lastmod>${xmlEscape(String(row.updated_at).slice(0, 10))}</lastmod>${imageXml}</url>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>`;
  return new Response(req.method === 'HEAD' ? null : xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
      'X-SEO-Studio-URL-Count': String((data ?? []).length),
    },
  });
});
