const B2_ORIGIN = 'https://f004.backblazeb2.com';
const B2_BUCKET = 'videomeu8';
const ALLOWED_ORIGINS = new Set([
  'https://khophim.org',
  'https://www.khophim.org',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://khophim.org';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Origin, Accept',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: corsHeaders(request),
      });
    }

    const url = new URL(request.url);
    const objectPath = url.pathname.replace(/^\/+/, '');
    if (!objectPath || objectPath.includes('..')) {
      return new Response('Not Found', { status: 404, headers: corsHeaders(request) });
    }

    const upstream = new URL(`${B2_ORIGIN}/file/${B2_BUCKET}/${objectPath}`);
    upstream.search = url.search;

    const upstreamRequest = new Request(upstream.toString(), {
      method: request.method,
      headers: request.headers,
    });

    const response = await fetch(upstreamRequest, {
      cf: {
        cacheEverything: true,
        cacheTtl: 60 * 60 * 24 * 7,
      },
    });

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(request))) {
      headers.set(key, value);
    }
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
