import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const values = new Map([
  ['ADMIN_PIN_PEPPER', 'stable-admin-pin-pepper-for-regression-2026'],
  ['ADMIN_PIN_LEGACY_SALT_PREFIX', 'legacy-service-role-key-that-was-rotated'.slice(0, 48)],
  ['SUPABASE_SERVICE_ROLE_KEY', 'current-service-role-key'],
]);

globalThis.Deno = {
  env: {
    get(name) {
      return values.get(name);
    },
  },
};

const {
  hashAdminPin,
  isAdminPinConfigured,
  verifyAdminPin,
} = await import('../supabase/functions/_shared/admin-pin.ts');

const pin = 'DemoAdmin2026!';
const legacySaltPrefix = values.get('ADMIN_PIN_LEGACY_SALT_PREFIX');
const legacySalt = `khophim-admin-salt-v2-${legacySaltPrefix}`;
const legacyHash = createHash('sha256').update(pin + legacySalt).digest('hex');

assert.equal(isAdminPinConfigured(), true);
assert.deepEqual(await verifyAdminPin(pin, legacyHash), { valid: true, needsUpgrade: true });
assert.deepEqual(await verifyAdminPin('wrong-password', legacyHash), { valid: false, needsUpgrade: false });

const upgradedHash = await hashAdminPin(pin);
assert.match(upgradedHash, /^v3\$[a-f0-9]{64}$/);
assert.deepEqual(await verifyAdminPin(pin, upgradedHash), { valid: true, needsUpgrade: false });

values.set('SUPABASE_SERVICE_ROLE_KEY', 'another-rotated-service-role-key');
assert.deepEqual(await verifyAdminPin(pin, upgradedHash), { valid: true, needsUpgrade: false });

console.log('Admin PIN regression passed: legacy login upgrades and survives service-role rotation.');
