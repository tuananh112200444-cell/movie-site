import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') ?? 'https://khophim.org';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000;
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

async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function generateSignedToken(): Promise<{ token: string; expiresAt: number }> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const randomPart = btoa(String.fromCharCode(...randomBytes));
  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const payload = `${randomPart}.${expiresAt}`;
  const secret = SUPABASE_SERVICE_ROLE_KEY.slice(0, 32) || 'khophim-admin-fallback';
  const signature = await hmacSign(payload, secret);
  const token = btoa(`${payload}.${signature}`);
  return { token, expiresAt };
}

function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIP = req.headers.get('x-real-ip');
  if (realIP) return realIP.trim();
  return 'unknown';
}

async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + getSalt());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getPinHash(supabase: ReturnType<typeof createClient>): Promise<{ pin_hash: string | null; setup_required: boolean }> {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('pin')
    .eq('id', 1)
    .maybeSingle();
    if (error) {
    throw new Error(`Unable to read admin settings: ${error.message}`);
  }
  if (!data || !data.pin || data.pin === '') {
    return { pin_hash: null, setup_required: true };
  }
  return { pin_hash: data.pin, setup_required: false };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as { pin?: string; action?: string; newPin?: string };
    const pin = body.pin ?? '';
    const action = body.action ?? 'verify';



    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { pin_hash: currentPinHash, setup_required } = await getPinHash(supabase);
    if (action === 'status') {
      return json({ setup_required }, 200, corsHeaders);
    }

    // ── FIRST-TIME SETUP ──
    if (action === 'verify' && !setup_required && pin.trim() === '') {
      return json({ setup_required: false }, 200, corsHeaders);
    }
    if (action === 'setup' && setup_required) {
      if (!body.newPin || body.newPin.length < 6) {
        return json({ error: 'Password must be at least 6 characters.' }, 400, corsHeaders);
      }
      if (!/[a-zA-Z]/.test(body.newPin) || !/[0-9]/.test(body.newPin)) {
        return json({ error: 'Password must contain both letters and numbers.' }, 400, corsHeaders);
      }

      const hashedNewPin = await hashPin(body.newPin);
      const { error } = await supabase
        .from('admin_settings')
        .upsert({ id: 1, pin: hashedNewPin, updated_at: new Date().toISOString() }, { onConflict: 'id' });

      if (error) throw error;

      const { token, expiresAt } = await generateSignedToken();
      return json({ token, expiresAt, setup: true, message: 'Admin password created.' }, 200, corsHeaders);
    }

    if (action === 'setup' && !setup_required) {
      return json({ error: 'Admin password already exists. Please log in or use change password.' }, 403, corsHeaders);
    }

    // ── VERIFY FLOW ──
    const clientIP = getClientIP(req);
    const ipHash = await hashIP(clientIP);
    const { data: record, error: rateError } = await supabase
      .from('admin_login_attempts')
      .select('attempt_count, last_attempt_at, locked_until')
      .eq('ip_hash', ipHash)
      .maybeSingle();
    if (rateError) {
      throw new Error(`Unable to read admin login attempts: ${rateError.message}`);
    }

    if (record?.locked_until) {
      const lockTime = new Date(record.locked_until).getTime();
      const now = Date.now();
      if (lockTime > now) {
        const minutesLeft = Math.ceil((lockTime - now) / 60000);
        return json(
          {
            error: 'Account temporarily locked',
            locked: true,
            minutesLeft,
            message: `Admin is locked. Try again in ${minutesLeft} minutes.`,
          },
          429,
          corsHeaders
        );
      }
    }

    if (setup_required) {
      return json({ setup_required: true, message: 'No admin password exists. Please create one.' }, 200, corsHeaders);
    }

    const hashedInput = await hashPin(pin);

    if (!currentPinHash || hashedInput !== currentPinHash) {
      const newCount = (record?.attempt_count ?? 0) + 1;
      const lockedUntil = newCount >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MS).toISOString()
        : null;

      await supabase.from('admin_login_attempts').upsert(
        {
          ip_hash: ipHash,
          attempt_count: newCount,
          last_attempt_at: new Date().toISOString(),
          locked_until: lockedUntil,
        },
        { onConflict: 'ip_hash' }
      );

      const remaining = MAX_ATTEMPTS - newCount;
      if (newCount >= MAX_ATTEMPTS) {
        return json(
          {
            error: 'Account temporarily locked',
            locked: true,
            minutesLeft: 30,
            message: 'Too many wrong attempts. Admin is locked for 30 minutes.',
          },
          429,
          corsHeaders
        );
      }

      return json({ error: 'Invalid PIN', remaining, message: `Wrong password. ${remaining} attempts left.` }, 401, corsHeaders);
    }

    await supabase.from('admin_login_attempts').upsert(
      {
        ip_hash: ipHash,
        attempt_count: 0,
        last_attempt_at: new Date().toISOString(),
        locked_until: null,
      },
      { onConflict: 'ip_hash' }
    );

    const { token, expiresAt } = await generateSignedToken();
    return json({ token, expiresAt, message: 'Authenticated' }, 200, corsHeaders);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message, message: 'Cannot check admin password right now. Please try again later.' }, 503, corsHeaders);
  }
});
