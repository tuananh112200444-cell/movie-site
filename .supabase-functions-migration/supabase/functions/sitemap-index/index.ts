import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
const SITE_URL = 'https://khophim.org';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MOVIE_CHUNK_SIZE = 1000;
const FALLBACK_MOVIE_CHUNKS = 18;
async function getMovieChunkCount() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return FALLBACK_MOVIE_CHUNKS;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
  const { count, error } = await supabase.from('movie_seo_quality_status').select('movie_id,movies!inner(id)', {
    count: 'exact',
    head: true
  }).eq('eligible_for_index', true).in('index_tier', [
    'playable',
    'ongoing',
    'upcoming'
  ]).eq('movies.is_published', true);
  if (error || !Number.isFinite(count)) return FALLBACK_MOVIE_CHUNKS;
  return Math.max(1, Math.min(50, Math.ceil(Number(count) / MOVIE_CHUNK_SIZE)));
}
Deno.serve(async (req)=>{
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405
    });
  }
  const now = new Date().toISOString().split('T')[0];
  const movieChunkCount = await getMovieChunkCount();
  const sitemapFiles = [
    'sitemap-static.xml',
    'sitemap-seo-landing.xml',
    'sitemap-movies-recent.xml',
    'sitemap-movies-upcoming.xml',
    'sitemap-movies-ongoing.xml',
    ...Array.from({
      length: movieChunkCount
    }, (_, index)=>`sitemap-movies-${index + 1}.xml`),
    'feed.xml'
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- khophim.org Sitemap Index - Last updated: ${now} -->
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapFiles.map((file)=>`  <sitemap>
    <loc>${SITE_URL}/${file}</loc>
    <lastmod>${now}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`;
  return new Response(req.method === 'HEAD' ? null : xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
      'X-Movie-Chunk-Size': String(MOVIE_CHUNK_SIZE),
      'X-Movie-Chunk-Count': String(movieChunkCount)
    }
  });
});
