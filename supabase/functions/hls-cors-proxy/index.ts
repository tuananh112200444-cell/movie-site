import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const DEFAULT_SITE_ORIGIN = 'https://khophim.org';
const ALLOWED_SITE_ORIGINS = new Set([
  DEFAULT_SITE_ORIGIN,
  'https://www.khophim.org',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const MAX_REDIRECTS = 3;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const HLS_HOST_PATTERNS = [
  /^vip\.opstream(?:-short|\d+)\.com$/i,
  /^hbo\.opstream\d+\.com$/i,
  /^[sv]\d+\.kkphimplayer\d+\.com$/i,
  /^s\d+\.phim1280\.tv$/i,
  /^[sv]\d+\.streamvsmov\.com$/i,
  /^hls\d+\.cdnvideo11\.shop$/i,
  /^hls\d+\.streamcdn4\.site$/i,
  /^vod\d+\.cf\.dmcdn\.net$/i,
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_SITE_ORIGINS.has(origin) ? origin : DEFAULT_SITE_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
    'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges, content-type, x-khophim-hls-proxy',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function isAllowedHost(hostname: string): boolean {
  return HLS_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function getTarget(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const target = new URL(raw);
    if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) return null;
    target.username = '';
    target.password = '';
    return target;
  } catch {
    return null;
  }
}

function getProxyUrl(reqUrl: URL, target: URL): string {
  const proxy = new URL(reqUrl.origin + reqUrl.pathname);
  proxy.searchParams.set('url', target.toString());
  return proxy.toString();
}

function absolutizeUrl(value: string, base: URL): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function rewriteManifestLine(line: string, base: URL, reqUrl: URL): string {
  const withAttributeUris = line.replace(/URI=(['"])([^'"]+)\1/gi, (full, quote: string, value: string) => {
    const absolute = absolutizeUrl(value, base);
    return absolute && getTarget(absolute.toString())
      ? `URI=${quote}${getProxyUrl(reqUrl, absolute)}${quote}`
      : full;
  });
  const trimmed = withAttributeUris.trim();
  if (!trimmed || trimmed.startsWith('#')) return withAttributeUris;
  const absolute = absolutizeUrl(trimmed, base);
  return absolute && getTarget(absolute.toString()) ? getProxyUrl(reqUrl, absolute) : withAttributeUris;
}

function rewriteManifest(body: string, base: URL, reqUrl: URL): string {
  return body
    .split('\n')
    .map((line) => rewriteManifestLine(line, base, reqUrl))
    .join('\n');
}

function buildUpstreamHeaders(req: Request): Headers {
  const headers = new Headers({
    'Accept': req.headers.get('accept') ?? '*/*',
    'Referer': `${DEFAULT_SITE_ORIGIN}/`,
    'User-Agent': req.headers.get('user-agent') ?? 'Mozilla/5.0 KhoPhim-HLS-Proxy/2.0',
  });
  const range = req.headers.get('range');
  if (range) headers.set('Range', range);
  return headers;
}

async function fetchAllowedTarget(req: Request, initialTarget: URL): Promise<{ response: Response; target: URL }> {
  let target = initialTarget;
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const response = await fetch(target.toString(), {
      method: req.method,
      headers: buildUpstreamHeaders(req),
      redirect: 'manual',
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, target };
    const location = response.headers.get('location');
    const redirected = location ? absolutizeUrl(location, target) : null;
    if (!redirected || !getTarget(redirected.toString()) || attempt === MAX_REDIRECTS) {
      response.body?.cancel().catch(() => undefined);
      throw new Error('Blocked or excessive upstream redirect');
    }
    response.body?.cancel().catch(() => undefined);
    target = redirected;
  }
  throw new Error('Upstream redirect limit exceeded');
}

async function readTextWithLimit(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) throw new Error('HLS manifest exceeds size limit');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(req, { error: 'Method not allowed' }, 405);
  }

  const reqUrl = new URL(req.url);
  const target = getTarget(reqUrl.searchParams.get('url'));
  if (!target) {
    return json(req, { error: 'Invalid or blocked HLS URL' }, 400);
  }

  try {
    const { response: upstream, target: finalTarget } = await fetchAllowedTarget(req, target);
    const contentType = upstream.headers.get('content-type') ?? '';
    const isManifest = finalTarget.pathname.toLowerCase().endsWith('.m3u8') || /mpegurl|m3u8/i.test(contentType);
    const headers = new Headers(corsHeaders(req));
    headers.set('Content-Type', isManifest ? 'application/vnd.apple.mpegurl; charset=utf-8' : (contentType || 'video/mp2t'));
    headers.set('Cache-Control', isManifest ? 'public, max-age=20, s-maxage=20' : 'public, max-age=21600, s-maxage=86400');
    headers.set('X-KhoPhim-HLS-Proxy', 'international-v1');

    for (const key of ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }

    if (req.method === 'HEAD') {
      upstream.body?.cancel().catch(() => undefined);
      return new Response(null, { status: upstream.status, headers });
    }
    if (!isManifest) {
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (declaredLength > MAX_MANIFEST_BYTES) {
      upstream.body?.cancel().catch(() => undefined);
      return json(req, { error: 'HLS manifest is too large' }, 502);
    }
    const manifest = await readTextWithLimit(upstream.body, MAX_MANIFEST_BYTES);
    if (upstream.ok && !manifest.trimStart().startsWith('#EXTM3U')) {
      return json(req, { error: 'Upstream did not return an HLS manifest' }, 502);
    }
    headers.delete('content-length');
    return new Response(rewriteManifest(manifest, finalTarget, reqUrl), {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'international_hls_proxy_failed',
      host: target.hostname,
      message: error instanceof Error ? error.message : String(error),
    }));
    return json(req, { error: 'HLS upstream unavailable' }, 502);
  }
});
