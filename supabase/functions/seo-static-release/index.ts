import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const DEPLOY_HOOK_URL = Deno.env.get('SEO_DEPLOY_HOOK_URL') ?? '';
const SITE_RELEASE_URL = 'https://khophim.org/release.json';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function validDeployHook(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'api.cloudflare.com'
      && url.pathname.startsWith('/client/v4/pages/webhooks/deploy_hooks/')
      ? url
      : null;
  } catch {
    return null;
  }
}

async function currentReleaseTime(): Promise<number> {
  try {
    const response = await fetch(`${SITE_RELEASE_URL}?check=${Date.now()}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return 0;
    const payload = await response.json() as { generated_at?: string };
    return Date.parse(String(payload.generated_at || '')) || 0;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Missing Supabase environment' }, 500);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  const releaseTime = await currentReleaseTime();
  const { data: processing, error: processingError } = await db.from('seo_static_release_requests')
    .select('id,requested_at,processing_started_at')
    .eq('status', 'processing')
    .order('processing_started_at', { ascending: true })
    .limit(20);
  if (processingError) return json({ error: processingError.message }, 500);

  let confirmed = 0;
  let recovered = 0;
  for (const item of processing || []) {
    const requestedAt = Date.parse(String(item.requested_at || '')) || 0;
    const processingAt = Date.parse(String(item.processing_started_at || item.requested_at || '')) || 0;
    if (releaseTime > requestedAt) {
      const { error } = await db.from('seo_static_release_requests').update({
        status: 'deployed',
        deployed_at: new Date(releaseTime).toISOString(),
        deployment_url: 'https://khophim.org',
        error_message: null,
      }).eq('id', item.id).eq('status', 'processing');
      if (!error) confirmed += 1;
    } else if (processingAt && now.getTime() - processingAt > 2 * 60 * 60 * 1000) {
      const { error } = await db.from('seo_static_release_requests').update({
        status: 'pending',
        processing_started_at: null,
        error_message: 'Build confirmation timed out; queued for retry.',
      }).eq('id', item.id).eq('status', 'processing');
      if (!error) recovered += 1;
    }
  }

  const { data: pending, error: pendingError } = await db.from('seo_static_release_requests')
    .select('id,slug,requested_at,requested_version')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pendingError) return json({ error: pendingError.message }, 500);
  if (!pending) return json({ ok: true, action: 'idle', confirmed, recovered });

  const deployHook = validDeployHook(DEPLOY_HOOK_URL);
  if (!deployHook) {
    return json({
      ok: true,
      action: 'awaiting_deploy_hook',
      configured: false,
      pending_slug: pending.slug,
      confirmed,
      recovered,
    });
  }

  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await db.from('seo_static_release_requests').update({
    status: 'processing',
    processing_started_at: claimedAt,
    error_message: null,
  }).eq('id', pending.id).eq('status', 'pending').select('id').maybeSingle();
  if (claimError) return json({ error: claimError.message }, 500);
  if (!claimed) return json({ ok: true, action: 'already_claimed', confirmed, recovered });

  try {
    const response = await fetch(deployHook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'khophim-seo-brain',
        slug: pending.slug,
        requested_version: pending.requested_version,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Cloudflare deploy hook HTTP ${response.status}`);
    return json({ ok: true, action: 'deployment_triggered', slug: pending.slug, confirmed, recovered });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from('seo_static_release_requests').update({
      status: 'pending',
      processing_started_at: null,
      error_message: message.slice(0, 500),
    }).eq('id', pending.id);
    return json({ ok: false, action: 'deployment_failed', error: message }, 502);
  }
});
