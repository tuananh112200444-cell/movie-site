import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges, content-type',
};

const ALLOWED_HOSTS = new Set([
  'hls08.cdnvideo11.shop',
  'hls08.streamcdn4.site',
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function getTarget(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const target = new URL(raw);
    if (target.protocol !== 'https:') return null;
    if (!ALLOWED_HOSTS.has(target.hostname)) return null;
    return target;
  } catch {
    return null;
  }
}

function getProxyUrl(reqUrl: URL, target: string): string {
  const proxy = new URL(reqUrl.origin + reqUrl.pathname);
  proxy.searchParams.set('url', target);
  return proxy.toString();
}

function absolutizeUrl(value: string, base: URL): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function rewriteManifest(body: string, base: URL, reqUrl: URL): string {
  return body
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const absolute = absolutizeUrl(trimmed, base);
      const target = getTarget(absolute);
      return target ? getProxyUrl(reqUrl, target.toString()) : line;
    })
    .join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const reqUrl = new URL(req.url);
  const target = getTarget(reqUrl.searchParams.get('url'));
  if (!target) {
    return json({ error: 'Invalid or blocked HLS URL' }, 400);
  }

  const upstream = await fetch(target.toString(), {
    method: req.method,
    headers: {
      Accept: req.headers.get('accept') ?? '*/*',
      Range: req.headers.get('range') ?? '',
      'User-Agent': 'KhoPhim-HLS-CORS-Proxy/1.0',
    },
  });

  const contentType = upstream.headers.get('content-type') ?? '';
  const isManifest = target.pathname.endsWith('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8');
  const headers = new Headers(CORS_HEADERS);
  headers.set('Content-Type', isManifest ? 'application/vnd.apple.mpegurl; charset=utf-8' : (contentType || 'video/mp2t'));
  headers.set('Cache-Control', isManifest ? 'public, max-age=30' : 'public, max-age=86400');

  for (const key of ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }

  if (req.method === 'HEAD') {
    return new Response(null, { status: upstream.status, headers });
  }

  if (isManifest) {
    const manifest = await upstream.text();
    headers.delete('content-length');
    return new Response(rewriteManifest(manifest, target, reqUrl), {
      status: upstream.status,
      headers,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
});
