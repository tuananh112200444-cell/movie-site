import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const DEPLOY_HOOK_URL = Deno.env.get('SEO_DEPLOY_HOOK_URL') ?? '';
const SITE_RELEASE_URL = 'https://khophim.org/release.json';
const SITE_URL = 'https://khophim.org';
const VERIFICATION_TIMEOUT_MS = 45 * 60 * 1000;
const BUILD_TIMEOUT_MS = 2 * 60 * 60 * 1000;

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

function edgeWaitUntil(promise: Promise<unknown>): void {
  try {
    const runtime = globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    };
    if (runtime.EdgeRuntime?.waitUntil) {
      runtime.EdgeRuntime.waitUntil(promise);
    } else {
      void promise;
    }
  } catch {
    void promise;
  }
}

async function queueGoogleCoverageCheck(slugs: string[]): Promise<void> {
  if (!CRON_SECRET || !SUPABASE_URL) return;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/gsc-seo-feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET,
    },
    // The feedback worker independently validates the pages and retains a
    // bounded quota. Passing a few newly released slugs only gives the fresh
    // pages first place in that existing queue; it never claims an index.
    body: JSON.stringify({ inspection_limit: 50, inspection_slugs: slugs.slice(0, 5) }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!response.ok) throw new Error(`GSC feedback HTTP ${response.status}`);
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

async function sitemapEvidence(canonical: string, requireSeoStudio: boolean): Promise<{
  httpPassed: boolean;
  containsUrl: boolean;
  checked: string[];
}> {
  const cacheBust = Date.now();
  const studioUrl = `${SITE_URL}/sitemap-seo-studio.xml?static_release=${cacheBust}`;
  if (requireSeoStudio) {
    const response = await fetch(studioUrl, {
      headers: { Accept: 'application/xml', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.text();
    return { httpPassed: response.status === 200, containsUrl: body.includes(`<loc>${canonical}</loc>`), checked: [studioUrl] };
  }

  const rootUrl = `${SITE_URL}/sitemap.xml?static_release=${cacheBust}`;
  const rootResponse = await fetch(rootUrl, {
    headers: { Accept: 'application/xml', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(12_000),
  });
  const rootXml = await rootResponse.text();
  const childUrls = [...rootXml.matchAll(/<loc>(https:\/\/khophim\.org\/[^<]+\.xml)<\/loc>/gi)]
    .map((match) => match[1])
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 20);
  const targets = childUrls.length ? childUrls : [studioUrl];
  const children = await Promise.all(targets.map(async (target) => {
    try {
      const response = await fetch(`${target}${target.includes('?') ? '&' : '?'}static_release=${cacheBust}`, {
        headers: { Accept: 'application/xml', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(12_000),
      });
      return { ok: response.status === 200, body: await response.text() };
    } catch {
      return { ok: false, body: '' };
    }
  }));
  return {
    httpPassed: rootResponse.status === 200 && children.some((item) => item.ok),
    containsUrl: children.some((item) => item.body.includes(`<loc>${canonical}</loc>`)),
    checked: [rootUrl, ...targets],
  };
}

async function verifyStaticPublication(
  slug: string,
  version: number | null,
  expectedIndex: boolean | null,
  requireSeoStudioSitemap: boolean,
): Promise<{ passed: boolean; audit: Record<string, unknown>; error: string | null }> {
  const url = `${SITE_URL}/phim/${encodeURIComponent(slug)}`;
  const canonical = `${SITE_URL}/phim/${slug}`;
  try {
    const pageResponse = await fetch(`${url}?static_release=${version ?? 'generic'}&check=${Date.now()}`, {
      headers: { Accept: 'text/html', 'User-Agent': 'Googlebot', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(12_000),
    });
    const html = await pageResponse.text();
    const marker = htmlValue(html, /data-kp-seo-profile-version=["']([^"']+)["']/i);
    const canonicalValue = htmlValue(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
      || htmlValue(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    const robots = htmlValue(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i).toLowerCase();
    const actualIndex = robots.includes('index') && !robots.includes('noindex');
    const shouldIndex = expectedIndex ?? actualIndex;
    const sitemap = await sitemapEvidence(canonical, requireSeoStudioSitemap);
    const checks = [
      { code: 'public_http_200', passed: pageResponse.status === 200, value: pageResponse.status },
      ...(version && version > 0
        ? [{ code: 'public_profile_version', passed: marker === String(version), value: marker }]
        : []),
      { code: 'public_canonical', passed: canonicalValue === canonical, value: canonicalValue },
      shouldIndex
        ? { code: 'public_robots_index', passed: actualIndex, value: robots }
        : { code: 'public_robots_noindex', passed: robots.includes('noindex'), value: robots },
      { code: 'public_sitemap_http', passed: sitemap.httpPassed, value: sitemap.checked },
      shouldIndex
        ? { code: 'public_sitemap_membership', passed: sitemap.containsUrl }
        : { code: 'public_sitemap_exclusion', passed: !sitemap.containsUrl },
    ];
    const passed = checks.every((check) => check.passed);
    return {
      passed,
      audit: {
        passed,
        mode: 'static',
        phase: 'public-static',
        indexable: shouldIndex,
        in_sitemap: sitemap.containsUrl,
        profile_version: version,
        checked_at: new Date().toISOString(),
        url,
        status: pageResponse.status,
        checks,
      },
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

  const input = await req.json().catch(() => ({})) as { mode?: unknown };
  const mode = input.mode === 'urgent' ? 'urgent' : 'nightly';
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  const releaseTime = await currentReleaseTime();
  const { data: processing, error: processingError } = await db.from('seo_static_release_requests')
    .select('id,movie_id,slug,reason,release_lane,requested_version,requested_at,processing_started_at,automatic_retry_count,next_retry_at')
    .eq('status', 'processing')
    .order('processing_started_at', { ascending: true })
    .limit(20);
  if (processingError) return json({ error: processingError.message }, 500);

  let confirmed = 0;
  let recovered = 0;
  const confirmedSlugs: string[] = [];
  for (const item of processing || []) {
    const requestedAt = Date.parse(String(item.requested_at || '')) || 0;
    const processingAt = Date.parse(String(item.processing_started_at || item.requested_at || '')) || 0;
    const processingAge = processingAt ? now.getTime() - processingAt : 0;
    const reason = String(item.reason || '');
    const { data: profile, error: profileError } = await db.from('movie_seo_profiles')
      .select('version,status,index_mode,validation_score')
      .eq('movie_id', item.movie_id)
      .maybeSingle();
    if (profileError) {
      await db.from('seo_static_release_requests').update({
        status: 'failed',
        error_message: `Cannot load SEO profile: ${profileError.message}`.slice(0, 500),
      }).eq('id', item.id).eq('status', 'processing');
      continue;
    }
    const explicitProfileRelease = reason.startsWith('seo_profile_') || Number(item.requested_version || 0) > 0;
    const resolvedVersion = Number(item.requested_version || 0)
      || (explicitProfileRelease ? Number(profile?.version || 0) : 0);
    if (explicitProfileRelease && (!profile || profile.status !== 'published' || resolvedVersion < 1)) {
      await db.from('seo_static_release_requests').update({
        status: 'failed',
        error_message: 'Published SEO profile/version is missing; publish the draft again.',
      }).eq('id', item.id).eq('status', 'processing');
      continue;
    }
    if (explicitProfileRelease && Number(profile?.version || 0) !== resolvedVersion) {
      await db.from('seo_static_release_requests').update({
        status: 'superseded',
        error_message: `Superseded by SEO profile version ${Number(profile?.version || 0)}.`,
      }).eq('id', item.id).eq('status', 'processing');
      continue;
    }
    // The release manifest is a fast signal, but edge-to-edge cache/challenge
    // behaviour can temporarily hide it from Supabase. After a short settling
    // window, verify the actual HTML/version/robots/sitemap directly instead
    // of leaving a valid deployment stuck in processing.
    const mayVerifyPublicArtifact = releaseTime > requestedAt || processingAge >= 2 * 60_000;
    if (mayVerifyPublicArtifact) {
      const verification = await verifyStaticPublication(
        String(item.slug || ''),
        explicitProfileRelease ? resolvedVersion : null,
        explicitProfileRelease ? profile?.index_mode === 'index' : null,
        explicitProfileRelease,
      );
      if (verification.passed) {
        const deployedAt = new Date(releaseTime).toISOString();
        if (explicitProfileRelease) {
          const { data: auditedProfile, error: auditError } = await db.from('movie_seo_profiles').update({
            live_audit: verification.audit,
            last_audited_at: deployedAt,
          }).eq('movie_id', item.movie_id).eq('version', resolvedVersion).select('version').maybeSingle();
          if (auditError || !auditedProfile) {
            await db.from('seo_static_release_requests').update({
              status: 'failed',
              error_message: `Public verification passed but audit persistence failed: ${auditError?.message || 'profile version not found'}`.slice(0, 500),
            }).eq('id', item.id).eq('status', 'processing');
            continue;
          }
        }
        const { error } = await db.from('seo_static_release_requests').update({
          status: 'deployed',
          requested_version: resolvedVersion || null,
          deployed_at: deployedAt,
          deployment_url: SITE_URL,
          error_message: null,
          next_retry_at: null,
        }).eq('id', item.id).eq('status', 'processing');
        if (!error) {
          await db.from('seo_work_items').update({
            status: 'completed',
            completed_at: deployedAt,
            updated_at: deployedAt,
          }).eq('movie_id', item.movie_id).in('status', ['pending', 'in_progress']);
          confirmed += 1;
          if (item.slug) confirmedSlugs.push(String(item.slug));
        }
      } else {
        const terminal = processingAge >= VERIFICATION_TIMEOUT_MS;
        const retryCount = Number(item.automatic_retry_count || 0);
        await db.from('seo_static_release_requests').update({
          status: terminal ? 'failed' : 'processing',
          error_message: `${terminal ? 'Static verification failed' : 'Static verification pending'}: ${verification.error || 'unknown'}`.slice(0, 500),
          next_retry_at: terminal && retryCount < 3
            ? new Date(now.getTime() + Math.min(60,15 * (2 ** retryCount)) * 60_000).toISOString()
            : null,
        }).eq('id', item.id).eq('status', 'processing');
      }
    } else if (processingAge > BUILD_TIMEOUT_MS) {
      const { error } = await db.from('seo_static_release_requests').update({
        status: 'failed',
        error_message: 'Cloudflare Pages build confirmation timed out. Publish or retry the SEO release.',
        next_retry_at: Number(item.automatic_retry_count || 0) < 3
          ? new Date(now.getTime() + Math.min(60,15 * (2 ** Number(item.automatic_retry_count || 0))) * 60_000).toISOString()
          : null,
      }).eq('id', item.id).eq('status', 'processing');
      if (!error) recovered += 1;
    }
  }

  // Start the coverage evidence loop only after the public HTML and the
  // static sitemap have both passed verification. This is intentionally after
  // the deployment itself, not merely after the 03:30 draft approval time.
  if (confirmedSlugs.length) {
    edgeWaitUntil(queueGoogleCoverageCheck([...new Set(confirmedSlugs)]).catch(() => undefined));
  }

  let pendingQuery = db.from('seo_static_release_requests')
    .select('id,movie_id,slug,reason,release_lane,requested_at,requested_version,automatic_retry_count,next_retry_at')
    .eq('status', 'pending')
    .or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`);
  if (mode === 'urgent') pendingQuery = pendingQuery.eq('release_lane', 'urgent');
  const { data: pending, error: pendingError } = await pendingQuery
    .order('requested_at', { ascending: true })
    // One Pages build already regenerates the whole approved profile sitemap,
    // so claim the full bounded batch instead of starting five overlapping
    // deployments for fifty small SEO changes.
    .limit(50);
  if (pendingError) return json({ error: pendingError.message }, 500);
  if (!pending?.length) return json({ ok: true, action: 'idle', mode, confirmed, recovered });

  const deployHook = validDeployHook(DEPLOY_HOOK_URL);
  if (!deployHook) {
    return json({
      ok: true,
      action: 'awaiting_deploy_hook',
      configured: false,
      pending_slugs: pending.map((item) => item.slug),
      mode,
      confirmed,
      recovered,
    });
  }

  const prepared: Array<{
    id: number;
    movie_id: string | null;
    slug: string | null;
    reason: string;
    release_lane: string;
    requested_at: string;
    requested_version: number | null;
    automatic_retry_count: number;
    next_retry_at: string | null;
  }> = [];
  for (const item of pending) {
    if (String(item.reason || '') !== 'seo_draft_scheduled') {
      prepared.push(item as typeof prepared[number]);
      continue;
    }
    if (!item.movie_id) {
      await db.from('seo_static_release_requests').update({
        status: 'failed',
        error_message: 'Scheduled SEO draft has no movie identity.',
      }).eq('id', item.id).eq('status', 'pending');
      continue;
    }
    const { data: publishResult, error: publishError } = await db.rpc('publish_movie_seo_profile', {
      p_movie_id: item.movie_id,
    });
    if (publishError) {
      await db.from('seo_static_release_requests').update({
        status: 'failed',
        error_message: `Nightly profile publish failed: ${publishError.message}`.slice(0, 500),
      }).eq('id', item.id).eq('status', 'pending');
      continue;
    }
    const version = Number(
      publishResult && typeof publishResult === 'object'
        ? (publishResult as Record<string, unknown>).version
        : 0,
    );
    if (version < 1) {
      await db.from('seo_static_release_requests').update({
        status: 'failed',
        error_message: 'Nightly profile publish returned no version.',
      }).eq('id', item.id).eq('status', 'pending');
      continue;
    }
    const publishedAt = new Date().toISOString();
    const pendingAudit = {
      passed: false,
      mode: 'static-build-pending',
      checked_at: publishedAt,
      url: `${SITE_URL}/phim/${String(item.slug || '')}`,
      status: 0,
      checks: [{
        code: 'static_release_queued',
        passed: true,
        message: 'Hồ sơ đã được xuất bản trong đợt ban đêm và đang chờ Pages tạo HTML cùng sitemap.',
        value: String(version),
      }],
    };
    const { data: auditedProfile, error: auditError } = await db.from('movie_seo_profiles').update({
      live_audit: pendingAudit,
      last_audited_at: publishedAt,
      updated_at: publishedAt,
    }).eq('movie_id', item.movie_id).eq('version', version).select('version').maybeSingle();
    if (auditError || !auditedProfile) {
      await db.from('seo_static_release_requests').update({
        status: 'failed',
        error_message: `Nightly audit staging failed: ${auditError?.message || 'profile version not found'}`.slice(0, 500),
      }).eq('id', item.id).eq('status', 'pending');
      continue;
    }
    const { error: requestUpdateError } = await db.from('seo_static_release_requests').update({
      reason: 'seo_profile_static_publish',
      requested_version: version,
      error_message: null,
    }).eq('id', item.id).eq('status', 'pending');
    if (requestUpdateError) {
      await db.from('seo_static_release_requests').update({
        status: 'failed',
        error_message: `Nightly release preparation failed: ${requestUpdateError.message}`.slice(0, 500),
      }).eq('id', item.id).eq('status', 'pending');
      continue;
    }
    prepared.push({
      id: Number(item.id),
      movie_id: String(item.movie_id),
      slug: String(item.slug || ''),
      reason: 'seo_profile_static_publish',
      release_lane: String(item.release_lane || 'nightly'),
      requested_at: String(item.requested_at || publishedAt),
      requested_version: version,
      automatic_retry_count: Number(item.automatic_retry_count || 0),
      next_retry_at: item.next_retry_at ? String(item.next_retry_at) : null,
    });
  }
  if (!prepared.length) return json({ ok: true, action: 'nothing_ready', mode, confirmed, recovered });

  // Refresh contextual clusters before the build so every new approved page
  // enters the site graph immediately instead of waiting for a later crawl.
  const { error: clusterError } = await db.rpc('refresh_movie_seo_topic_clusters',{p_links_per_movie:4});
  if (clusterError) return json({error:`SEO topic cluster refresh failed: ${clusterError.message}`},500);

  const claimedAt = new Date().toISOString();
  const pendingIds = prepared.map((item) => item.id);
  const { data: claimed, error: claimError } = await db.from('seo_static_release_requests').update({
    status: 'processing',
    processing_started_at: claimedAt,
    error_message: null,
    next_retry_at: null,
  }).in('id', pendingIds).eq('status', 'pending').select('id,slug,release_lane,requested_version,automatic_retry_count');
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
    return json({ ok: true, action: 'deployment_triggered', mode, count: claimed.length, slugs: claimed.map((item) => item.slug), confirmed, recovered });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all(claimed.map(async (item) => {
      const nextRetryCount = Number(item.automatic_retry_count || 0) + 1;
      const canRetry = nextRetryCount <= 3;
      await db.from('seo_static_release_requests').update({
        status: canRetry ? 'pending' : 'failed',
        processing_started_at: null,
        automatic_retry_count: nextRetryCount,
        next_retry_at: canRetry
          ? new Date(Date.now() + Math.min(60,15 * (2 ** (nextRetryCount - 1))) * 60_000).toISOString()
          : null,
        error_message: `${message}${canRetry ? `; automatic retry ${nextRetryCount}/3 scheduled` : '; automatic retry limit reached'}`.slice(0, 500),
      }).eq('id', item.id);
    }));
    return json({ ok: false, action: 'deployment_failed', mode, error: message }, 502);
  }
});
