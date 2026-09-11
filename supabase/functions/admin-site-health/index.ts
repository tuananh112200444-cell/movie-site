import { verifyAdminRequest } from '../_shared/admin-session.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

type CheckResult = {
  key: string;
  label: string;
  url: string;
  group: 'page' | 'seo' | 'api';
  ok: boolean;
  status: number | null;
  elapsed_ms: number;
  error: string | null;
  attempts: number;
  first_elapsed_ms: number | null;
};

type ActionItem = {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
};

const SITE_URL = 'https://khophim.org';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';

function resolvePublicApiKey(): string {
  const legacyAnonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
  if (legacyAnonKey) return legacyAnonKey;

  const configuredKeys = String(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '').trim();
  if (!configuredKeys) return '';
  try {
    const candidates: string[] = [];
    const visit = (value: unknown) => {
      if (typeof value === 'string') {
        candidates.push(value.trim());
      } else if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(visit);
      }
    };
    visit(JSON.parse(configuredKeys));
    return candidates.find((value) => value.startsWith('sb_publishable_'))
      || candidates.find((value) => value.startsWith('eyJ'))
      || '';
  } catch {
    return '';
  }
}

const SUPABASE_PUBLIC_API_KEY = resolvePublicApiKey();
const SUPABASE_PUBLIC_HEADERS = SUPABASE_PUBLIC_API_KEY
  ? { apikey: SUPABASE_PUBLIC_API_KEY }
  : {};

const CHECKS = [
  { key: 'home', label: 'Trang chu', group: 'page' as const, url: `${SITE_URL}/` },
  { key: 'movie-list', label: 'Phim moi cap nhat', group: 'page' as const, url: `${SITE_URL}/phim-moi-cap-nhat` },
  { key: 'single-movies', label: 'Phim le', group: 'page' as const, url: `${SITE_URL}/phim-le` },
  { key: 'series', label: 'Phim bo', group: 'page' as const, url: `${SITE_URL}/phim-bo` },
  { key: 'bl-home', label: 'Vu tru dam my', group: 'page' as const, url: `${SITE_URL}/vu-tru-dam-my` },
  { key: 'sitemap-index', label: 'Sitemap index', group: 'seo' as const, url: `${SITE_URL}/sitemap.xml` },
  { key: 'sitemap-movies', label: 'Sitemap movies', group: 'seo' as const, url: `${SITE_URL}/sitemap-movies.xml` },
  { key: 'robots', label: 'Robots.txt', group: 'seo' as const, url: `${SITE_URL}/robots.txt` },
  { key: 'rss-feed', label: 'RSS phim moi', group: 'seo' as const, url: `${SITE_URL}/feed.xml` },
  { key: 'press-kit', label: 'Press kit', group: 'page' as const, url: `${SITE_URL}/press/` },
  { key: 'mhophim', label: 'MHoPhim', group: 'page' as const, url: 'https://mhophim.com/' },
  { key: 'home-proxy', label: 'Home proxy', group: 'api' as const, url: `${SUPABASE_URL}/functions/v1/home-proxy`, headers: { ...SUPABASE_PUBLIC_HEADERS } },
  { key: 'search-index', label: 'Search API', group: 'api' as const, url: `${SUPABASE_URL}/functions/v1/search-index-proxy?q=ben%20bo&limit=8`, headers: { ...SUPABASE_PUBLIC_HEADERS } },
  { key: 'movie-detail', label: 'Movie detail proxy', group: 'api' as const, url: `${SUPABASE_URL}/functions/v1/movie-detail-proxy?slug=goi-ngay-bac-si-khuong`, headers: { ...SUPABASE_PUBLIC_HEADERS, 'X-KhoPhim-Proxy-Secret': Deno.env.get('MOVIE_DETAIL_PROXY_SECRET') ?? '' } },
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = [
    'https://khophim.org',
    'https://www.khophim.org',
    'http://localhost:3000',
    'http://localhost:4173',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:5173',
  ];
  const safeOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}


function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function slowThreshold(group: CheckResult['group']): number {
  return group === 'api' ? 4500 : 2500;
}

async function runSingleCheck(check: typeof CHECKS[number]): Promise<CheckResult> {
  const started = performance.now();
  try {
    const response = await fetch(check.url, {
      method: 'GET',
      signal: AbortSignal.timeout(check.group === 'api' ? 16000 : 12000),
      headers: {
        'User-Agent': 'KhoPhim-SiteHealth/1.0',
        'Accept': check.group === 'seo' ? 'text/xml,text/plain,text/html,*/*' : 'text/html,application/json,*/*',
        ...('headers' in check ? check.headers : {}),
      },
    });
    const elapsed = Math.round(performance.now() - started);
    return {
      key: check.key,
      label: check.label,
      url: check.url,
      group: check.group,
      ok: response.ok,
      status: response.status,
      elapsed_ms: elapsed,
      error: response.ok ? null : `HTTP ${response.status}`,
      attempts: 1,
      first_elapsed_ms: null,
    };
  } catch (error) {
    return {
      key: check.key,
      label: check.label,
      url: check.url,
      group: check.group,
      ok: false,
      status: null,
      elapsed_ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
      attempts: 1,
      first_elapsed_ms: null,
    };
  }
}

async function runCheck(check: typeof CHECKS[number]): Promise<CheckResult> {
  const first = await runSingleCheck(check);
  if (check.group !== 'api' || (first.ok && first.elapsed_ms <= slowThreshold(check.group))) {
    return first;
  }

  // Edge isolates and database pools can have a one-off cold start. Retry only
  // a failed/slow API once so the dashboard reports sustained latency instead
  // of turning a recovered cold start into an incident.
  const retry = await runSingleCheck(check);
  const best = retry.ok && (!first.ok || retry.elapsed_ms < first.elapsed_ms) ? retry : first;
  return {
    ...best,
    attempts: 2,
    first_elapsed_ms: first.elapsed_ms,
  };
}

function buildActions(results: CheckResult[]): ActionItem[] {
  const failed = results.filter((item) => !item.ok);
  const slow = results.filter((item) => item.ok && item.elapsed_ms > slowThreshold(item.group));
  const items: ActionItem[] = [];

  if (failed.length > 0) {
    items.push({
      severity: failed.some((item) => item.group === 'page') ? 'critical' : 'warning',
      title: 'Co URL quan trong dang loi',
      detail: `${failed.length} check khong thanh cong: ${failed.map((item) => item.label).join(', ')}.`,
      action: 'Kiem tra Cloudflare/Supabase logs va uu tien sua URL page truoc API/SEO.',
    });
  }

  if (slow.length > 0) {
    items.push({
      severity: 'warning',
      title: 'Co endpoint dang phan hoi cham',
      detail: `${slow.length} check vuot nguong toc do: ${slow.map((item) => `${item.label} ${item.elapsed_ms}ms`).join(', ')}.`,
      action: 'Kiem tra cache, function cold start va query Supabase cua endpoint cham nhat.',
    });
  }

  if (items.length === 0) {
    items.push({
      severity: 'info',
      title: 'Web dang vao duoc binh thuong',
      detail: 'Tat ca route/API/SEO chinh deu tra ve thanh cong trong lan kiem tra nay.',
      action: 'Tiep tuc theo doi dashboard sau khi deploy hoac khi khach bao loi.',
    });
  }

  return items;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  try {
    if (!await verifyAdminRequest(req)) {
      return json({ error: 'Unauthorized - admin login required' }, 401, corsHeaders);
    }

    const concurrency = 4;
    const results: CheckResult[] = [];
    for (let i = 0; i < CHECKS.length; i += concurrency) {
      results.push(...await Promise.all(CHECKS.slice(i, i + concurrency).map(runCheck)));
    }

    const failed = results.filter((item) => !item.ok).length;
    const slow = results.filter((item) => item.ok && item.elapsed_ms > slowThreshold(item.group)).length;
    const score = Math.max(0, 100 - failed * 18 - slow * 6);
    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
    const { data: operationsHealth } = await supabase
      .from('operations_health_snapshots')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      score,
      summary: {
        total: results.length,
        ok: results.length - failed,
        failed,
        slow,
        avg_elapsed_ms: Math.round(results.reduce((sum, item) => sum + item.elapsed_ms, 0) / Math.max(1, results.length)),
      },
      results,
      operations_health: operationsHealth || null,
      action_items: buildActions(results),
    }, 200, corsHeaders);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, corsHeaders);
  }
});
