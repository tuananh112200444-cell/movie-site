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

function htmlValue(html: string, pattern: RegExp): string {
  return String(pattern.exec(html)?.[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

async function verifyStaticPublication(slug: string, version: number): Promise<{ passed: boolean; audit: Record<string, unknown>; error: string | null }> {
  const url = `https://khophim.org/phim/${encodeURIComponent(slug)}`;
  const canonical = `https://khophim.org/phim/${slug}`;
  try {
    const [pageResponse, sitemapResponse] = await Promise.all([
      fetch(`${url}?static_release=${version}&check=${Date.now()}`, {
        headers: { Accept: 'text/html', 'User-Agent': 'Googlebot', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(12_000),
      }),
      fetch(`https://khophim.org/sitemap-seo-studio.xml?static_release=${version}&check=${Date.now()}`, {
        headers: { Accept: 'application/xml', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(12_000),
      }),
    ]);
    const [html, sitemapXml] = await Promise.all([pageResponse.text(), sitemapResponse.text()]);
    const marker = htmlValue(html, /data-kp-seo-profile-version=["']([^"']+)["']/i);
    const canonicalValue = htmlValue(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
      || htmlValue(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    const robots = htmlValue(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i).toLowerCase();
    const checks = [
      { code: 'static_http_200', passed: pageResponse.status === 200, value: pageResponse.status },
      { code: 'static_profile_version', passed: marker === String(version), value: marker },
      { code: 'static_canonical', passed: canonicalValue === canonical, value: canonicalValue },
      { code: 'static_robots_index', passed: robots.includes('index') && !robots.includes('noindex'), value: robots },
      { code: 'static_sitemap_http', passed: sitemapResponse.status === 200, value: sitemapResponse.status },
      { code: 'static_sitemap_membership', passed: sitemapXml.includes(`<loc>${canonical}</loc>`) },
    ];
    const passed = checks.every((check) => check.passed);
    return {
      passed,
      audit: { passed, mode: 'static', checked_at: new Date().toISOString(), url, status: pageResponse.status, checks },
      error: passed ? null : checks.filter((check) => !check.passed).map((check) => check.code).join(', '),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { passed: false, audit: { passed: false, mode: 'static', checked_at: new Date().toISOString(), url, status: 0, checks: [] }, error: message };
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
    .select('id,movie_id,slug,requested_version,requested_at,processing_started_at')
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
      const verification = await verifyStaticPublication(String(item.slug || ''), Number(item.requested_version || 0));
      if (verification.passed) {
        const deployedAt = new Date(releaseTime).toISOString();
        const { error } = await db.from('seo_static_release_requests').update({
          status: 'deployed',
          deployed_at: deployedAt,
          deployment_url: 'https://khophim.org',
          error_message: null,
        }).eq('id', item.id).eq('status', 'processing');
        if (!error) {
          await Promise.all([
            db.from('movie_seo_profiles').update({ live_audit: verification.audit, last_audited_at: deployedAt }).eq('movie_id', item.movie_id).eq('version', item.requested_version),
            db.from('seo_work_items').update({ status: 'completed', completed_at: deployedAt, updated_at: deployedAt }).eq('movie_id', item.movie_id).in('status', ['pending', 'in_progress']),
          ]);
          confirmed += 1;
        }
      } else {
        await db.from('seo_static_release_requests').update({ error_message: `Static verification pending: ${verification.error || 'unknown'}`.slice(0, 500) }).eq('id', item.id).eq('status', 'processing');
      }
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
    .limit(50);
  if (pendingError) return json({ error: pendingError.message }, 500);
  if (!pending?.length) return json({ ok: true, action: 'idle', confirmed, recovered });

  const deployHook = validDeployHook(DEPLOY_HOOK_URL);
  if (!deployHook) {
    return json({
      ok: true,
      action: 'awaiting_deploy_hook',
      configured: false,
      pending_slugs: pending.map((item) => item.slug),
      confirmed,
      recovered,
    });
  }

  const claimedAt = new Date().toISOString();
  const pendingIds = pending.map((item) => item.id);
  const { data: claimed, error: claimError } = await db.from('seo_static_release_requests').update({
    status: 'processing',
    processing_started_at: claimedAt,
    error_message: null,
  }).in('id', pendingIds).eq('status', 'pending').select('id,slug,requested_version');
  if (claimError) return json({ error: claimError.message }, 500);
  if (!claimed?.length) return json({ ok: true, action: 'already_claimed', confirmed, recovered });

  try {
    const response = await fetch(deployHook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'khophim-seo-brain',
        slugs: claimed.map((item) => item.slug),
        requested_versions: claimed.map((item) => item.requested_version),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Cloudflare deploy hook HTTP ${response.status}`);
    return json({ ok: true, action: 'deployment_triggered', count: claimed.length, slugs: claimed.map((item) => item.slug), confirmed, recovered });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from('seo_static_release_requests').update({
      status: 'pending',
      processing_started_at: null,
      error_message: message.slice(0, 500),
    }).in('id', claimed.map((item) => item.id));
    return json({ ok: false, action: 'deployment_failed', error: message }, 502);
  }
});
