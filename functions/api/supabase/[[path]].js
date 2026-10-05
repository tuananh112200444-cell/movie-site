const SUPABASE_ORIGIN = 'https://ceoxbhsdodllziyxmbqr.supabase.co';

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-profile',
  'apikey',
  'authorization',
  'content-type',
  'prefer',
  'range',
  'range-unit',
  'x-client-info',
];

const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-range',
  'content-encoding',
  'cache-control',
  'etag',
  'last-modified',
  'x-supabase-api-version',
];

function safePath(parts) {
  const path = Array.isArray(parts) ? parts : [];
  if (!path.length || path.some((part) => !/^[A-Za-z0-9._~-]+$/.test(String(part)))) return null;
  const first = path[0];
  // Browser calls are limited to Supabase public APIs. This is deliberately
  // not a general outbound proxy.
  if (!['functions', 'rest', 'auth', 'storage'].includes(first)) return null;
  return path.map((part) => encodeURIComponent(String(part))).join('/');
}

function requestHeaders(request) {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function responseHeaders(response) {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('X-KhoPhim-Supabase-Proxy', '1');
  headers.set('Cache-Control', response.headers.get('cache-control') || 'no-store');
  return headers;
}

export async function onRequest(context) {
  const path = safePath(context.params.path);
  if (!path) return Response.json({ error: 'Unsupported Supabase API path' }, { status: 404 });

  const sourceUrl = new URL(context.request.url);
  const upstreamUrl = new URL(`${SUPABASE_ORIGIN}/${path}`);
  upstreamUrl.search = sourceUrl.search;

  const method = context.request.method;
  const init = {
    method,
    headers: requestHeaders(context.request),
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  };
  if (!['GET', 'HEAD'].includes(method)) init.body = context.request.body;

  try {
    const upstream = await fetch(upstreamUrl, init);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream),
    });
  } catch {
    return Response.json(
      { error: 'Admin data service is temporarily unavailable. Please retry.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'X-KhoPhim-Supabase-Proxy': '1' } },
    );
  }
}
