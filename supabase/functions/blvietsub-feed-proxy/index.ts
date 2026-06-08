import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const FEED_URL = 'https://www.blvietsub.top/feeds/posts/default?alt=json';
const POST_URL = 'https://www.blogger.com/feeds/6087760537213062341/posts/default';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=180, stale-while-revalidate=300',
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const postId = url.searchParams.get('postId')?.trim();
    const maxResults = Math.max(1, Math.min(Number(url.searchParams.get('maxResults') ?? 120), 500));
    const query = url.searchParams.get('q')?.trim();
    const target = postId
      ? `${POST_URL}/${encodeURIComponent(postId)}?alt=json`
      : `${FEED_URL}&max-results=${maxResults}${query ? `&q=${encodeURIComponent(query)}` : ''}`;

    const upstream = await fetch(target, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'KhoPhim-BLVietsub-Feed/1.0',
      },
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      return json({ error: `BLVietsub upstream returned ${upstream.status}`, body: body.slice(0, 500) }, 502);
    }

    return new Response(await upstream.text(), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=180, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
