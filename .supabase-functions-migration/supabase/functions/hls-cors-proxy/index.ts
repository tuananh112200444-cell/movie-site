import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges, content-type'
};
const ALLOWED_HOSTS = new Set([
  'hls08.cdnvideo11.shop',
  'hls15.cdnvideo11.shop',
  'hls.cdnvideo11.shop',
  'hls08.streamcdn4.site',
  'hls08.streamcdn6.site',
  'bigf.imostatic.com'
]);
function isAllowedHost(hostname) {
  return ALLOWED_HOSTS.has(hostname) || /^hls\d*\.cdnvideo11\.shop$/.test(hostname) || /^hls\d*\.streamcdn\d+\.site$/.test(hostname);
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
function getTarget(raw) {
  if (!raw) return null;
  try {
    const target = new URL(raw);
    if (target.protocol !== 'https:') return null;
    if (!isAllowedHost(target.hostname)) return null;
    return target;
  } catch  {
    return null;
  }
}
function getProxyUrl(reqUrl, target) {
  const pathname = reqUrl.pathname.startsWith('/functions/v1/') ? reqUrl.pathname : `/functions/v1${reqUrl.pathname}`;
  const proxy = new URL(`https://${reqUrl.host}${pathname}`);
  proxy.searchParams.set('url', target);
  return proxy.toString();
}
function absolutizeUrl(value, base) {
  try {
    return new URL(value, base).toString();
  } catch  {
    return value;
  }
}
function rewriteManifest(body, base, reqUrl) {
  return body.split('\n').map((line)=>{
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const absolute = absolutizeUrl(trimmed, base);
    const target = getTarget(absolute);
    return target ? getProxyUrl(reqUrl, target.toString()) : line;
  }).join('\n');
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json({
      error: 'Method not allowed'
    }, 405);
  }
  const reqUrl = new URL(req.url);
  const target = getTarget(reqUrl.searchParams.get('url'));
  if (!target) {
    return json({
      error: 'Invalid or blocked HLS URL'
    }, 400);
  }
  const upstream = await fetch(target.toString(), {
    method: req.method,
    headers: {
      Accept: req.headers.get('accept') ?? '*/*',
      Range: req.headers.get('range') ?? '',
      'User-Agent': 'KhoPhim-HLS-CORS-Proxy/1.0'
    }
  });
  const contentType = upstream.headers.get('content-type') ?? '';
  const isManifest = target.pathname.endsWith('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8');
  const isTransportStream = target.pathname.endsWith('.ts');
  const headers = new Headers(CORS_HEADERS);
  headers.set('Content-Type', isManifest ? 'application/vnd.apple.mpegurl; charset=utf-8' : isTransportStream ? 'video/mp2t' : contentType || 'video/mp2t');
  headers.set('Cache-Control', isManifest ? 'public, max-age=30' : 'public, max-age=86400');
  for (const key of [
    'content-length',
    'content-range',
    'accept-ranges',
    'last-modified',
    'etag'
  ]){
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (req.method === 'HEAD') {
    return new Response(null, {
      status: upstream.status,
      headers
    });
  }
  if (isManifest) {
    const manifest = await upstream.text();
    headers.delete('content-length');
    return new Response(rewriteManifest(manifest, target, reqUrl), {
      status: upstream.status,
      headers
    });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers
  });
});
