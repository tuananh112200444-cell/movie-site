const encoder = new TextEncoder();
function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for(let index = 0; index < left.length; index += 1)mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}
async function hmac(message, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {
    name: 'HMAC',
    hash: 'SHA-256'
  }, false, [
    'sign'
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}
function sessionSecret() {
  return (Deno.env.get('ADMIN_SESSION_SECRET') || '').trim();
}
export function isAdminSessionConfigured() {
  return sessionSecret().length >= 32;
}
export async function issueAdminSession() {
  const secret = sessionSecret();
  if (secret.length < 32) throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters');
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const nonce = btoa(String.fromCharCode(...randomBytes));
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${nonce}.${expiresAt}`;
  const signature = await hmac(payload, secret);
  return {
    token: btoa(`${payload}.${btoa(String.fromCharCode(...signature))}`),
    expiresAt
  };
}
export async function verifyAdminSession(token) {
  const secret = sessionSecret();
  if (secret.length < 32 || !token) return false;
  try {
    const decoded = atob(token);
    const separator = decoded.lastIndexOf('.');
    if (separator <= 0) return false;
    const payload = decoded.slice(0, separator);
    const signature = Uint8Array.from(atob(decoded.slice(separator + 1)), (char)=>char.charCodeAt(0));
    const expiresAt = Number(payload.slice(payload.lastIndexOf('.') + 1));
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
    return constantTimeEqual(signature, await hmac(payload, secret));
  } catch  {
    return false;
  }
}
export async function verifyAdminRequest(req) {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') && verifyAdminSession(auth.slice(7).trim());
}
