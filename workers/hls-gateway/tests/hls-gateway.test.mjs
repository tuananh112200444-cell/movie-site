import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { handleRequest } from '../src/index.mjs';
import { createScopeToken } from '../src/auth.mjs';

const SECRET = 'trial-only-secret-with-at-least-thirty-two-characters';
const ORIGIN = 'https://khophim.org';
const PLAYLIST_KEY = 'conan/movie.m3u8';
const SEGMENT_KEY = 'conan/movie0.ts';
const INIT_KEY = 'conan/init.mp4';
const PHI_PHONG_PLAYLIST_KEY = 'phí phông/血魔 Phí Phông Quỷ Máu Rừng Thiêng.2026.HD1080P.官方越南语中字.m3u8';

class FakeR2Object {
  constructor(key, bytes, contentType, range = null) {
    this.key = key;
    this.bytes = bytes;
    this.size = bytes.fullSize ?? bytes.byteLength;
    this.range = range;
    this.etag = 'trial-etag';
    this.httpEtag = '"trial-etag"';
    this.body = new Blob([bytes]).stream();
    this.contentType = contentType;
  }

  writeHttpMetadata(headers) {
    headers.set('Content-Type', this.contentType);
  }

  async text() {
    return new TextDecoder().decode(this.bytes);
  }
}

class FakeR2Bucket {
  constructor(entries) {
    this.entries = entries;
  }

  async head(key) {
    const entry = this.entries.get(key);
    return entry ? new FakeR2Object(key, entry.bytes, entry.contentType) : null;
  }

  async get(key, options = {}) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const rangeHeader = options.range instanceof Headers ? options.range.get('Range') : null;
    if (!rangeHeader) return new FakeR2Object(key, entry.bytes, entry.contentType);
    const match = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader);
    if (!match) throw new Error('invalid range');
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : entry.bytes.byteLength - 1;
    if (start > end || start >= entry.bytes.byteLength) throw new Error('invalid range');
    const selected = entry.bytes.slice(start, Math.min(end + 1, entry.bytes.byteLength));
    selected.fullSize = entry.bytes.byteLength;
    return new FakeR2Object(key, selected, entry.contentType, { offset: start, length: selected.byteLength });
  }
}

function trialEnv() {
  const playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:6',
    '#EXT-X-MAP:URI="init.mp4"',
    '#EXTINF:6.0,',
    'movie0.ts',
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');
  return {
    HLS_BUCKET: new FakeR2Bucket(new Map([
      [PLAYLIST_KEY, { bytes: new TextEncoder().encode(playlist), contentType: 'application/x-mpegurl' }],
      [PHI_PHONG_PLAYLIST_KEY, { bytes: new TextEncoder().encode(playlist), contentType: 'application/x-mpegurl' }],
      [SEGMENT_KEY, { bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), contentType: 'video/mp2t' }],
      [INIT_KEY, { bytes: new Uint8Array([8, 9, 10, 11]), contentType: 'video/mp4' }],
    ])),
    HLS_SIGNING_SECRET: SECRET,
    HLS_ALLOWED_ORIGINS: `${ORIGIN},https://www.khophim.org`,
    HLS_ALLOWED_PREFIXES: 'conan/,phí phông/',
    HLS_TICKET_TTL_SECONDS: '600',
    HLS_MAX_TOKEN_TTL_SECONDS: '900',
    HLS_REQUIRE_PROXY_SECRET: 'false',
  };
}

async function signedAccess(path = PLAYLIST_KEY, options = {}) {
  const scope = `${path.slice(0, path.lastIndexOf('/') + 1)}`;
  const token = await createScopeToken(SECRET, scope, options);
  return {
    url: `https://gateway.test/hls/${path}`,
    cookie: `kp_hls_ticket=${token.scope}.${token.exp}.${token.sig}`,
  };
}

function siteRequest(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Origin', ORIGIN);
  headers.set('Sec-Fetch-Site', 'same-site');
  return new Request(url, { ...init, headers });
}

function ticketRequest(objectKey = PLAYLIST_KEY, init = {}) {
  return siteRequest('https://gateway.test/api/hls-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: JSON.stringify({ objectKey }),
  });
}

test('issues a short-lived ticket only for an existing allowed playlist', async () => {
  const response = await handleRequest(ticketRequest(), trialEnv());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const ticket = await response.json();
  assert.equal(ticket.url, 'https://gateway.test/hls/conan/movie.m3u8');
  assert.ok(ticket.expiresAt > Date.now());
  const setCookie = response.headers.get('Set-Cookie') || '';
  assert.match(setCookie, /^kp_hls_ticket=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);

  const manifest = await handleRequest(siteRequest(ticket.url, {
    headers: { Cookie: setCookie.split(';', 1)[0] },
  }), trialEnv());
  assert.equal(manifest.status, 200);
});

test('issues a ticket for the unicode Phi Phong R2 folder', async () => {
  const response = await handleRequest(ticketRequest(PHI_PHONG_PLAYLIST_KEY), trialEnv());
  assert.equal(response.status, 200);
  const ticket = await response.json();
  assert.equal(
    decodeURI(ticket.url),
    `https://gateway.test/hls/${PHI_PHONG_PLAYLIST_KEY}`,
  );
  assert.match(response.headers.get('Set-Cookie') || '', /Path=\/hls\/ph%C3%AD%20ph%C3%B4ng\//);
});

test('ticket endpoint rejects foreign origins, unknown files and disallowed folders', async () => {
  const foreign = await handleRequest(new Request('https://gateway.test/api/hls-ticket', {
    method: 'POST',
    headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectKey: PLAYLIST_KEY }),
  }), trialEnv());
  assert.equal(foreign.status, 403);

  const unknown = await handleRequest(ticketRequest('conan/missing.m3u8'), trialEnv());
  assert.equal(unknown.status, 404);

  const outside = await handleRequest(ticketRequest('other/movie.m3u8'), trialEnv());
  assert.equal(outside.status, 403);

  const segment = await handleRequest(ticketRequest(SEGMENT_KEY), trialEnv());
  assert.equal(segment.status, 400);
});

test('complete ticket flow rewrites and serves a seekable segment', async () => {
  const ticketResponse = await handleRequest(ticketRequest(), trialEnv());
  const ticket = await ticketResponse.json();
  const cookie = (ticketResponse.headers.get('Set-Cookie') || '').split(';', 1)[0];
  const manifestResponse = await handleRequest(siteRequest(ticket.url, { headers: { Cookie: cookie } }), trialEnv());
  const manifest = await manifestResponse.text();
  const segmentPath = manifest.split('\n').find((line) => line.startsWith('/hls/') && line.includes('.ts'));
  assert.ok(segmentPath);

  const segmentUrl = new URL(segmentPath, 'https://gateway.test').toString();
  const segment = await handleRequest(siteRequest(segmentUrl, { headers: { Range: 'bytes=1-3', Cookie: cookie } }), trialEnv());
  assert.equal(segment.status, 206);
  assert.equal(segment.headers.get('Content-Range'), 'bytes 1-3/8');
  assert.deepEqual(new Uint8Array(await segment.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test('rejects direct access without a token', async () => {
  const response = await handleRequest(siteRequest(`https://gateway.test/hls/${PLAYLIST_KEY}`), trialEnv());
  assert.equal(response.status, 403);
});

test('serves a signed playlist and protects every local URI', async () => {
  const access = await signedAccess();
  const response = await handleRequest(siteRequest(access.url, { headers: { Cookie: access.cookie } }), trialEnv());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(response.headers.get('Content-Type') || '', /mpegurl/i);
  const playlist = await response.text();
  assert.match(playlist, /\/hls\/conan\/movie0\.ts/);
  assert.match(playlist, /URI="\/hls\/conan\/init\.mp4"/);
  assert.doesNotMatch(playlist, /scope=|sig=|exp=/);
  assert.doesNotMatch(playlist, /\nmovie0\.ts\n/);
});

test('serves a signed segment as a stream', async () => {
  const access = await signedAccess(SEGMENT_KEY);
  const response = await handleRequest(siteRequest(access.url, { headers: { Cookie: access.cookie } }), trialEnv());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'video/mp2t');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
});

test('supports byte ranges for seeking', async () => {
  const access = await signedAccess(SEGMENT_KEY);
  const response = await handleRequest(siteRequest(access.url, {
    headers: { Range: 'bytes=2-5', Cookie: access.cookie },
  }), trialEnv());
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/8');
  assert.equal(response.headers.get('Content-Length'), '4');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([2, 3, 4, 5]));
});

test('rejects expired tokens and cross-site browser requests', async () => {
  const expiredAccess = await signedAccess(PLAYLIST_KEY, { nowMs: Date.now() - 3_600_000, ttlSeconds: 60 });
  const expired = await handleRequest(siteRequest(expiredAccess.url, { headers: { Cookie: expiredAccess.cookie } }), trialEnv());
  assert.equal(expired.status, 403);

  const validAccess = await signedAccess();
  const crossSite = await handleRequest(new Request(validAccess.url, {
    headers: { Origin: 'https://example.com', 'Sec-Fetch-Site': 'cross-site', Cookie: validAccess.cookie },
  }), trialEnv());
  assert.equal(crossSite.status, 403);
});

test('rejects traversal and object paths outside the signed movie folder', async () => {
  const traversal = await handleRequest(siteRequest(`https://gateway.test/hls/conan/%2E%2E/secret.ts`), trialEnv());
  // URL parsing normalizes the dot segment before the Worker sees it. The
  // normalized key is outside the signed scope and must still be denied.
  assert.equal(traversal.status, 403);

  const token = await createScopeToken(SECRET, 'conan/');
  const outsideUrl = 'https://gateway.test/hls/other/movie.ts';
  const outsideCookie = `kp_hls_ticket=${token.scope}.${token.exp}.${token.sig}`;
  const outside = await handleRequest(siteRequest(outsideUrl, { headers: { Cookie: outsideCookie } }), trialEnv());
  assert.equal(outside.status, 403);
});

test('requires a server-side secret and supports HEAD metadata', async () => {
  const access = await signedAccess(SEGMENT_KEY);
  const missingSecret = trialEnv();
  delete missingSecret.HLS_SIGNING_SECRET;
  const unavailable = await handleRequest(siteRequest(access.url, { headers: { Cookie: access.cookie } }), missingSecret);
  assert.equal(unavailable.status, 503);

  const head = await worker.fetch(siteRequest(access.url, { method: 'HEAD', headers: { Cookie: access.cookie } }), trialEnv());
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(head.headers.get('Content-Length'), '8');
  assert.equal(await head.text(), '');
});

test('production mode rejects requests that do not carry the Pages proxy secret', async () => {
  const env = trialEnv();
  env.HLS_REQUIRE_PROXY_SECRET = 'true';
  env.HLS_PROXY_SECRET = 'pages-to-gateway-secret-with-at-least-thirty-two-chars';

  const denied = await handleRequest(ticketRequest(), env);
  assert.equal(denied.status, 403);

  const allowedRequest = ticketRequest();
  allowedRequest.headers.set('X-KhoPhim-Proxy-Secret', env.HLS_PROXY_SECRET);
  const allowed = await handleRequest(allowedRequest, env);
  assert.equal(allowed.status, 200);
});
