const encoder = new TextEncoder();
const CURRENT_HASH_PREFIX = 'v3$';

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function currentPepper(): string {
  return (Deno.env.get('ADMIN_PIN_PEPPER') || '').trim();
}

function legacySaltPrefixes(): string[] {
  return [
    Deno.env.get('ADMIN_PIN_LEGACY_SALT_PREFIX') || '',
    (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').slice(0, 48),
  ].map((value) => value.trim().slice(0, 48)).filter(Boolean);
}

async function legacyV2Hash(pin: string, saltPrefix: string): Promise<string> {
  const salt = `khophim-admin-salt-v2-${saltPrefix}`;
  return sha256Hex(pin + salt);
}

export function isAdminPinConfigured(): boolean {
  return currentPepper().length >= 32;
}

export async function hashAdminPin(pin: string): Promise<string> {
  const pepper = currentPepper();
  if (pepper.length < 32) throw new Error('ADMIN_PIN_PEPPER must contain at least 32 characters');
  const digest = await sha256Hex(`khophim-admin-pin-v3\0${pin}\0${pepper}`);
  return `${CURRENT_HASH_PREFIX}${digest}`;
}

export async function verifyAdminPin(
  pin: string,
  storedHash: string,
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (storedHash.startsWith(CURRENT_HASH_PREFIX)) {
    const currentHash = await hashAdminPin(pin);
    return { valid: constantTimeEqual(currentHash, storedHash), needsUpgrade: false };
  }

  for (const saltPrefix of legacySaltPrefixes()) {
    const candidate = await legacyV2Hash(pin, saltPrefix);
    if (constantTimeEqual(candidate, storedHash)) {
      return { valid: true, needsUpgrade: true };
    }
  }

  return { valid: false, needsUpgrade: false };
}

export async function hashAdminClientIP(ip: string): Promise<string> {
  const pepper = currentPepper();
  if (pepper.length < 32) throw new Error('ADMIN_PIN_PEPPER must contain at least 32 characters');
  return sha256Hex(`khophim-admin-ip-v3\0${ip}\0${pepper}`);
}
