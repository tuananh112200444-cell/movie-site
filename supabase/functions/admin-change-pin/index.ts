import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';


const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') ?? 'https://khophim.org';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MAX_CHANGE_ATTEMPTS = 3;
const CHANGE_LOCK_MS = 10 * 60 * 1000; 
function toOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const configured = CORS_ORIGIN ? CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const allowed = ['https://khophim.org', 'http://localhost:5173', 'http://localhost:3000', ...configured];
  const allowedOrigins = allowed.map((a) => toOrigin(a)).filter((a): a is string => Boolean(a));
  const requestOrigin = toOrigin(origin);
  const safe = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': safe,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function getSalt(): string {
  const keyPart = SUPABASE_SERVICE_ROLE_KEY.slice(0, 48);
  return 'khophim-admin-salt-v2-' + keyPart;
}

async function hashPin(pin: string): Promise<string> {
  const salt = getSalt();
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validatePinComplexity(pin: string): { valid: boolean; error?: string } {
  if (!pin || pin.length < 6) return { valid: false, error: 'Password must be at least 6 characters.' };
  if (pin.length > 32) return { valid: false, error: 'Password must be at most 32 characters.' };
  if (!/[a-zA-Z]/.test(pin)) return { valid: false, error: 'Password must contain at least 1 letter.' };
  if (!/[0-9]/.test(pin)) return { valid: false, error: 'Password must contain at least 1 number.' };
  const weakPatterns = ['123456', 'password', '000000', '111111', 'abcdef'];
  if (weakPatterns.some((p) => pin.toLowerCase().includes(p))) {
    return { valid: false, error: 'Password is too weak.' };
  }
  return { valid: true };
}

function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIP = req.headers.get('x-real-ip');
  if (realIP) return realIP.trim();
  return 'unknown';
}

async function hashIP(ip: string): Promise<string> {
  const salt = getSalt();
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as { currentPin?: string; newPin?: string; action?: string };
    const { currentPin, newPin, action } = body;

    const clientIP = getClientIP(req);
    const ipHash = await hashIP(clientIP);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // ── RATE LIMITING FOR CHANGE PIN ──────────────────────────────
    const { data: rateRecord, error: rateError } = await supabase
      .from('admin_login_attempts')
      .select('change_attempt_count, change_locked_until')
      .eq('ip_hash', ipHash)
      .maybeSingle();

    if (rateError) {
      throw new Error(`Unable to read admin rate limit: ${rateError.message}`);
    }
    const now = Date.now();
    if (rateRecord?.change_locked_until) {
      const lockTime = new Date(rateRecord.change_locked_until).getTime();
      if (lockTime > now) {
        const minsLeft = Math.ceil((lockTime - now) / 60000);
        return json({ error: `Change password is locked for ${minsLeft} minutes.` }, 429, corsHeaders);
      }
    }

    // Check if PIN exists in DB
    const { data: setting, error: settingError } = await supabase
      .from('admin_settings')
      .select('pin')
      .eq('id', 1)
      .maybeSingle();
    if (settingError) {
      throw new Error(`Unable to read admin settings: ${settingError.message}`);
    }  
    const hasExistingPin = !!(setting?.pin && setting.pin !== '');
    if (action === 'setup' && hasExistingPin) {
      return json({ error: 'Admin password already exists. Please log in or use change password.' }, 409, corsHeaders);
    }
    // ── SETUP MODE (no existing PIN) ─────────────────────────────
    if (action === 'setup' || !hasExistingPin) {
      if (!newPin) return json({ error: 'Missing new password.' }, 400, corsHeaders);
      const complexity = validatePinComplexity(newPin);
      if (!complexity.valid) return json({ error: complexity.error }, 400, corsHeaders);
      }

      const hashedNewPin = await hashPin(newPin);
      const { error } = await supabase
        .from('admin_settings')
        .upsert({ id: 1, pin: hashedNewPin, updated_at: new Date().toISOString() }, { onConflict: 'id' });

      if (error) throw error;

      return json({ success: true, message: 'Admin password created.' }, 200, corsHeaders);
    }

    // ── NORMAL CHANGE PIN ────────────────────────────────────────
    if (!currentPin || !newPin) {
      return json({ error: 'Missing current password or new password.' }, 400, corsHeaders);
    }

    // Validate new PIN complexity
    const complexity = validatePinComplexity(newPin);
    if (!complexity.valid) return json({ error: complexity.error }, 400, corsHeaders);


    // Verify current PIN
    const actualPinHash = setting!.pin;
    const hashedCurrent = await hashPin(currentPin);

    if (hashedCurrent !== actualPinHash) {
      const newChangeCount = (rateRecord?.change_attempt_count ?? 0) + 1;
      const changeLockedUntil = newChangeCount >= MAX_CHANGE_ATTEMPTS
        ? new Date(now + CHANGE_LOCK_MS).toISOString()
        : rateRecord?.change_locked_until;

      await supabase.from('admin_login_attempts').upsert(
        {
          ip_hash: ipHash,
          change_attempt_count: newChangeCount,
          change_locked_until: changeLockedUntil,
        },
        { onConflict: 'ip_hash' }
      );

      const remaining = MAX_CHANGE_ATTEMPTS - newChangeCount;
      if (newChangeCount >= MAX_CHANGE_ATTEMPTS) {
        return json({ error: 'Too many wrong current passwords. Change password is locked for 10 minutes.' }, 429, corsHeaders);
      }

      return json({ error: `Current password is wrong. ${remaining} attempts left.` }, 401, corsHeaders);
    }

    // Prevent reusing same PIN
    const hashedNew = await hashPin(newPin);
    if (hashedNew === actualPinHash) {
      return json({ error: 'New password cannot match old password.' }, 400, corsHeaders);
    }

    // Update PIN
    const { error } = await supabase
      .from('admin_settings')
      .update({ pin: hashedNew, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) throw error;

    // Reset change attempt count
    await supabase.from('admin_login_attempts').upsert(
      {
        ip_hash: ipHash,
        change_attempt_count: 0,
        change_locked_until: null,
      },
      { onConflict: 'ip_hash' }
    );

    return json({ success: true, message: 'Password changed.' }, 200, corsHeaders);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message, message: 'Cannot update admin password right now. Please try again later.' }, 503, corsHeaders);
  }
});
