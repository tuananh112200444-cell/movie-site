const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TOKEN_VERSION = 'khophim-hls-v1';

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url');
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeScope(scope) {
  return bytesToBase64Url(encoder.encode(scope));
}

export function decodeScope(encodedScope) {
  return decoder.decode(base64UrlToBytes(encodedScope));
}

export function normalizeScope(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = raw.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))) {
    throw new Error('invalid scope');
  }
  return `${segments.join('/')}/`;
}

function tokenMessage(scope, expiresAt) {
  return `${TOKEN_VERSION}\n${scope}\n${expiresAt}`;
}

async function importSigningKey(secret) {
  if (!secret || String(secret).length < 32) throw new Error('signing secret is unavailable');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function signScope(secret, scope, expiresAt) {
  const normalizedScope = normalizeScope(scope);
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(tokenMessage(normalizedScope, expiresAt)));
  return bytesToBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(left, right) {
  let leftBytes;
  let rightBytes;
  try {
    leftBytes = base64UrlToBytes(left);
    rightBytes = base64UrlToBytes(right);
  } catch {
    return false;
  }
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

export async function createScopeToken(secret, scope, options = {}) {
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const maxTtlSeconds = Math.max(30, Number(options.maxTtlSeconds ?? 900));
  const ttlSeconds = Math.min(maxTtlSeconds, Math.max(30, Number(options.ttlSeconds ?? 600)));
  const normalizedScope = normalizeScope(scope);
  const expiresAt = nowSeconds + ttlSeconds;
  return {
    scope: encodeScope(normalizedScope),
    exp: String(expiresAt),
    sig: await signScope(secret, normalizedScope, expiresAt),
  };
}

export async function verifyScopeToken(secret, token, options = {}) {
  const maxTtlSeconds = Math.max(30, Number(options.maxTtlSeconds ?? 900));
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const expiresAt = Number(token?.exp);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + maxTtlSeconds) {
    return { ok: false, reason: 'expired-or-invalid-expiry' };
  }

  let scope;
  try {
    scope = normalizeScope(decodeScope(String(token?.scope || '')));
  } catch {
    return { ok: false, reason: 'invalid-scope' };
  }

  const expected = await signScope(secret, scope, expiresAt);
  if (!constantTimeEqual(expected, String(token?.sig || ''))) return { ok: false, reason: 'invalid-signature' };
  return { ok: true, scope, expiresAt };
}
