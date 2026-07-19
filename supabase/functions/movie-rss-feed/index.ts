import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
const SITE_URL = 'https://khophim.org';
const FEED_URL = `${SITE_URL}/feed.xml`;
const HUB_URL = 'https://pubsubhubbub.appspot.com/';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const XML_HEADERS = { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' };
function xml(value: unknown): string { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function clean(value: unknown): string { return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

Deno.serve(async (req) => {
  if (req.method === 'POST') {
    const expected = Deno.env.get('CRON_SECRET') || '';
    if (!expected || req.headers.get('x-cron-secret') !== expected) return new Response('Unauthorized', { status: 401 });
    const response = await fetch(HUB_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': FEED_URL }) });
    return new Response(JSON.stringify({ ok: response.ok, status: response.status, feed: FEED_URL }), { status: response.ok ? 200 : 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: XML_HEADERS });
  if (!SUPABASE_URL || !SERVICE_KEY) return new Response('Service unavailable', { status: 503, headers: XML_HEADERS });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('movie_seo_quality_status').select('movie_id,slug,checked_at,movies!inner(name,origin_name,content,poster_url,thumb_url,updated_at,year)').eq('eligible_for_index', true).order('checked_at', { ascending: false }).limit(100);
  if (error) return new Response('Feed unavailable', { status: 503, headers: XML_HEADERS });
  const items = (data || []).map((row: Record<string, unknown>) => {
    const movie = (Array.isArray(row.movies) ? row.movies[0] : row.movies) as Record<string, unknown> | undefined;
    const slug = String(row.slug || ''); const link = `${SITE_URL}/phim/${encodeURIComponent(slug)}`; const title = String(movie?.name || slug); const description = clean(movie?.content).slice(0, 500); const rawImage = String(movie?.poster_url || movie?.thumb_url || ''); const image = /^https?:\/\//i.test(rawImage) ? rawImage : ''; const published = new Date(String(movie?.updated_at || row.checked_at || Date.now())).toUTCString();
    return `<item><title>${xml(title)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid><pubDate>${xml(published)}</pubDate><description>${xml(description)}</description>${image ? `<media:content url="${xml(image)}" medium="image" />` : ''}</item>`;
  }).join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>KhoPhim – Phim mới đủ điều kiện</title><link>${SITE_URL}/phim-moi-nhat</link><description>Phim mới cập nhật đã vượt kiểm tra chất lượng nội dung và nguồn phát của KhoPhim.</description><language>vi-VN</language><lastBuildDate>${xml(new Date().toUTCString())}</lastBuildDate><atom:link href="${FEED_URL}" rel="self" type="application/rss+xml"/><atom:link href="${HUB_URL}" rel="hub"/>${items}</channel></rss>`;
  return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: { ...XML_HEADERS, 'X-Feed-Items': String(data?.length || 0) } });
});
