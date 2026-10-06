import { createScopeToken, verifyScopeToken } from './auth.mjs';
import { rewriteMediaPlaylist } from './playlist.mjs';

const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
const TICKET_COOKIE = 'kp_hls_ticket';

function jsonLog(level, event, fields = {}) {
  console[level](JSON.stringify({ event, ...fields }));
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'private, no-store',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

function allowedOrigins(env) {
  return new Set(String(env.HLS_ALLOWED_ORIGINS || 'https://khophim.org,https://www.khophim.org')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, ETag',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function textResponse(request, env, message, status, extraHeaders = {}) {
  return new Response(request.method === 'HEAD' ? null : message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...noStoreHeaders(),
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function normalizeObjectKeyFromUrl(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname.replace(/^\/hls\//, ''));
  } catch {
    throw new Error('invalid encoded object key');
  }
  const normalized = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))) {
    throw new Error('invalid object key');
  }
  return segments.join('/');
}

function contentTypeForKey(key) {
  if (/\.m3u8$/i.test(key)) return 'application/vnd.apple.mpegurl; charset=utf-8';
  if (/\.ts$/i.test(key)) return 'video/mp2t';
  if (/\.m4s$/i.test(key)) return 'video/iso.segment';
  if (/\.mp4$/i.test(key)) return 'video/mp4';
  if (/\.vtt$/i.test(key)) return 'text/vtt; charset=utf-8';
  return 'application/octet-stream';
}

function applyObjectMetadata(headers, object, key) {
  object.writeHttpMetadata?.(headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', contentTypeForKey(key));
  if (object.httpEtag || object.etag) headers.set('ETag', object.httpEtag || object.etag);
  headers.set('Accept-Ranges', 'bytes');
}

function rangeHeaders(headers, object) {
  if (object.range && Number.isFinite(object.range.offset) && Number.isFinite(object.range.length)) {
    const start = object.range.offset;
    const end = start + object.range.length - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
    headers.set('Content-Length', String(object.range.length));
    return 206;
  }
  headers.set('Content-Length', String(object.size));
  return 200;
}

function requestHasForbiddenOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (origin) return !allowedOrigins(env).has(origin);
  return request.headers.get('Sec-Fetch-Site') === 'cross-site';
}

function constantTimeTextEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left || ''));
  const rightBytes = new TextEncoder().encode(String(right || ''));
  if (leftBytes.length !== rightBytes.length || leftBytes.length === 0) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function proxyIsAuthorized(request, env) {
  if (String(env.HLS_REQUIRE_PROXY_SECRET || 'false').toLowerCase() !== 'true') return true;
  return constantTimeTextEqual(request.headers.get('X-KhoPhim-Proxy-Secret'), env.HLS_PROXY_SECRET);
}

function allowedPrefixes(env) {
  return String(env.HLS_ALLOWED_PREFIXES || '')
    .split(',')
    .map((prefix) => prefix.trim().replace(/\\/g, '/').replace(/^\/+/, ''))
    .filter(Boolean)
    .map((prefix) => prefix.endsWith('/') ? prefix : `${prefix}/`);
}

function encodeObjectKey(key) {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function cookieValue(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return '';
}

function tokenFromCookie(request) {
  const parts = cookieValue(request, TICKET_COOKIE).split('.');
  if (parts.length !== 3) return null;
  return { scope: parts[0], exp: parts[1], sig: parts[2] };
}

async function issueTicket(request, env) {
  if (request.method !== 'POST') {
    return textResponse(request, env, 'Method Not Allowed', 405, { Allow: 'POST, OPTIONS' });
  }
  if (requestHasForbiddenOrigin(request, env) || !request.headers.get('Origin')) {
    return textResponse(request, env, 'Forbidden', 403);
  }
  if (!env.HLS_SIGNING_SECRET) return textResponse(request, env, 'Gateway Not Configured', 503);
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 2048) return textResponse(request, env, 'Payload Too Large', 413);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return textResponse(request, env, 'Unsupported Media Type', 415);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return textResponse(request, env, 'Bad Request', 400);
  }

  let objectKey;
  try {
    objectKey = normalizeObjectKeyFromUrl(`/hls/${String(payload?.objectKey || '')}`);
  } catch {
    return textResponse(request, env, 'Bad Request', 400);
  }
  if (!/\.m3u8$/i.test(objectKey)) return textResponse(request, env, 'Bad Request', 400);
  const prefix = allowedPrefixes(env).find((candidate) => objectKey.startsWith(candidate));
  if (!prefix) return textResponse(request, env, 'Forbidden', 403);
  const playlist = await env.HLS_BUCKET.head(objectKey);
  if (!playlist) return textResponse(request, env, 'Not Found', 404);

  const scope = objectKey.slice(0, objectKey.lastIndexOf('/') + 1);
  const token = await createScopeToken(env.HLS_SIGNING_SECRET, scope, {
    ttlSeconds: Number(env.HLS_TICKET_TTL_SECONDS || 600),
    maxTtlSeconds: Number(env.HLS_MAX_TOKEN_TTL_SECONDS || 900),
  });
  const gatewayUrl = new URL(request.url);
  gatewayUrl.pathname = `/hls/${encodeObjectKey(objectKey)}`;
  gatewayUrl.search = '';
  const headers = new Headers({ ...noStoreHeaders(), ...corsHeaders(request, env) });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  const maxAge = Math.max(1, Number(token.exp) - Math.floor(Date.now() / 1000));
  headers.append(
    'Set-Cookie',
    `${TICKET_COOKIE}=${token.scope}.${token.exp}.${token.sig}; Path=/hls/${encodeObjectKey(scope)}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`,
  );
  return new Response(JSON.stringify({ url: gatewayUrl.toString(), expiresAt: Number(token.exp) * 1000 }), {
    status: 200,
    headers,
  });
}

async function authorizeRequest(request, env, objectKey) {
  if (!env.HLS_SIGNING_SECRET) return { ok: false, status: 503, reason: 'gateway-not-configured' };
  const verification = await verifyScopeToken(
    env.HLS_SIGNING_SECRET,
    tokenFromCookie(request),
    { maxTtlSeconds: Number(env.HLS_MAX_TOKEN_TTL_SECONDS || 900) },
  );
  if (!verification.ok) return { ok: false, status: 403, reason: verification.reason };
  if (!objectKey.startsWith(verification.scope)) return { ok: false, status: 403, reason: 'path-outside-scope' };
  return { ok: true, scope: verification.scope };
}

async function serveHead(request, env, objectKey) {
  const object = await env.HLS_BUCKET.head(objectKey);
  if (!object) return textResponse(request, env, 'Not Found', 404);
  const headers = new Headers({ ...noStoreHeaders(), ...corsHeaders(request, env) });
  applyObjectMetadata(headers, object, objectKey);
  headers.set('Content-Length', String(object.size));
  return new Response(null, { status: 200, headers });
}

async function servePlaylist(request, env, objectKey, authorization) {
  const object = await env.HLS_BUCKET.get(objectKey);
  if (!object) return textResponse(request, env, 'Not Found', 404);
  if (object.size > MAX_PLAYLIST_BYTES) return textResponse(request, env, 'Playlist Too Large', 413);
  const original = await object.text();
  const rewritten = rewriteMediaPlaylist(original, objectKey, authorization.scope);
  const headers = new Headers({ ...noStoreHeaders(), ...corsHeaders(request, env) });
  headers.set('Content-Type', contentTypeForKey(objectKey));
  headers.set('Content-Length', String(new TextEncoder().encode(rewritten).byteLength));
  if (object.httpEtag || object.etag) headers.set('ETag', object.httpEtag || object.etag);
  return new Response(rewritten, { status: 200, headers });
}

async function serveMedia(request, env, objectKey) {
  let object;
  try {
    object = await env.HLS_BUCKET.get(objectKey, {
      range: request.headers,
      onlyIf: request.headers,
    });
  } catch (error) {
    if (request.headers.has('Range')) return textResponse(request, env, 'Range Not Satisfiable', 416, { 'Content-Range': 'bytes */*' });
    throw error;
  }
  if (!object) return textResponse(request, env, 'Not Found', 404);
  if (!object.body) return textResponse(request, env, 'Precondition Failed', 412);

  const headers = new Headers({ ...noStoreHeaders(), ...corsHeaders(request, env) });
  applyObjectMetadata(headers, object, objectKey);
  const status = rangeHeaders(headers, object);
  return new Response(object.body, { status, headers });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/healthz') {
    return new Response('ok', { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!proxyIsAuthorized(request, env)) return textResponse(request, env, 'Forbidden', 403);
  if (url.pathname === '/api/hls-ticket') {
    if (request.method === 'OPTIONS') {
      if (requestHasForbiddenOrigin(request, env)) return textResponse(request, env, 'Forbidden', 403);
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    return issueTicket(request, env);
  }
  if (!url.pathname.startsWith('/hls/')) return textResponse(request, env, 'Not Found', 404);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return textResponse(request, env, 'Method Not Allowed', 405, { Allow: 'GET, HEAD, OPTIONS' });
  }
  if (request.method === 'OPTIONS') {
    if (requestHasForbiddenOrigin(request, env)) return textResponse(request, env, 'Forbidden', 403);
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (requestHasForbiddenOrigin(request, env)) return textResponse(request, env, 'Forbidden', 403);

  let objectKey;
  try {
    objectKey = normalizeObjectKeyFromUrl(url.pathname);
  } catch {
    return textResponse(request, env, 'Bad Request', 400);
  }

  const authorization = await authorizeRequest(request, env, objectKey);
  if (!authorization.ok) return textResponse(request, env, 'Forbidden', authorization.status);
  if (request.method === 'HEAD') return serveHead(request, env, objectKey);
  if (/\.m3u8$/i.test(objectKey)) return servePlaylist(request, env, objectKey, authorization);
  return serveMedia(request, env, objectKey);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      jsonLog('error', 'hls_gateway_error', {
        path: new URL(request.url).pathname,
        message: error instanceof Error ? error.message : String(error),
      });
      return textResponse(request, env, 'Internal Server Error', 500);
    }
  },
};
