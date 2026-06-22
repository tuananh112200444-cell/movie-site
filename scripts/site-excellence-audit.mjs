import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const SITE_URL = process.env.SITE_URL || 'https://khophim.org';
const STRICT_LIVE = process.env.SITE_AUDIT_STRICT_LIVE === 'true';
const execFileAsync = promisify(execFile);

const CHECKS = [
  {
    name: 'home-live',
    url: `${SITE_URL}/`,
    maxMs: 1200,
    required: ['KhoPhim'],
  },
  {
    name: 'search-live',
    url: `${SITE_URL}/search?q=ben%20bo`,
    maxMs: 1200,
    required: ['KhoPhim'],
  },
  {
    name: 'movie-prerender',
    url: `${SITE_URL}/phim/blvietsub-5861-ben-bo`,
    maxMs: 1500,
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    required: ['<title>', 'meta name="description"', 'rel="canonical"', 'SearchAction', 'Episode'],
  },
  {
    name: 'seo-landing-prerender',
    url: `${SITE_URL}/xem-phim-online`,
    maxMs: 1500,
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    required: ['Xem Phim Online Vietsub HD', 'meta name="description"', 'rel="canonical"', 'SearchAction', 'Organization'],
  },
  {
    name: 'sitemap-index',
    url: `${SITE_URL}/sitemap.xml`,
    maxMs: 1200,
    required: ['<sitemapindex', '/sitemap-static.xml', '/sitemap-seo-landing.xml', '/sitemap-movies-recent.xml', '/sitemap-movies-upcoming.xml'],
  },
  {
    name: 'seo-sitemap',
    url: `${SITE_URL}/sitemap-seo-landing.xml`,
    maxMs: 1200,
    required: ['<urlset', '/xem-phim-online', '/phim-vietsub', '/phim-dang-chieu'],
  },
];

function hasMojibake(text) {
  return /Ã|Â»|Â¼|â€|Æ°|áº|á»/.test(text);
}

async function fetchText(check) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const startedAt = performance.now();
  try {
    const response = await fetch(check.url, {
      headers: check.userAgent ? { 'user-agent': check.userAgent } : {},
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, ms: Math.round(performance.now() - startedAt), text };
  } catch (error) {
    return fetchTextWithCurl(check, error);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithCurl(check, cause) {
  const args = ['-L', '-s', '--max-time', '10'];
  if (check.userAgent) args.push('-A', check.userAgent);
  args.push('-w', '\n__KHOPHIM_AUDIT_META__%{http_code} %{time_total}', check.url);
  try {
    const { stdout } = await execFileAsync('curl.exe', args, {
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    const marker = '\n__KHOPHIM_AUDIT_META__';
    const markerIndex = stdout.lastIndexOf(marker);
    if (markerIndex === -1) throw new Error('curl output missing audit marker');
    const text = stdout.slice(0, markerIndex);
    const [statusRaw, secondsRaw] = stdout.slice(markerIndex + marker.length).trim().split(/\s+/);
    return {
      status: Number(statusRaw),
      ms: Math.round(Number(secondsRaw) * 1000),
      text,
    };
  } catch (curlError) {
    throw new Error(`${cause.message}; curl fallback failed: ${curlError.message}`);
  }
}

async function assertLocalSeoClean() {
  const [html, analytics] = await Promise.all([
    readFile('index.html', 'utf8'),
    readFile('src/utils/analytics.ts', 'utf8'),
  ]);
  const failures = [];
  if (html.includes("gtag('config', 'G-6B5GLB9W6H');")) {
    failures.push('index.html sends an automatic GA page_view before SPA tracking.');
  }
  if (analytics.includes('G-XXXXXXXXXX')) {
    failures.push('src/utils/analytics.ts still contains placeholder GA measurement id.');
  }
  if (hasMojibake(html)) {
    failures.push('index.html contains mojibake text that can hurt no-JS SEO fallback.');
  }
  return failures;
}

const failures = [];
const warnings = [];
const results = [];

for (const check of CHECKS) {
  try {
    const result = await fetchText(check);
    const missing = check.required.filter((needle) => !result.text.includes(needle));
    const mojibake = check.name.includes('prerender') && hasMojibake(result.text);
    if (result.status !== 200) failures.push(`${check.name}: expected HTTP 200, got ${result.status}`);
    if (result.ms > check.maxMs) failures.push(`${check.name}: ${result.ms}ms exceeds ${check.maxMs}ms`);
    if (missing.length > 0) failures.push(`${check.name}: missing ${missing.join(', ')}`);
    if (mojibake) failures.push(`${check.name}: prerender output contains mojibake text`);
    results.push({
      name: check.name,
      status: result.status,
      ms: result.ms,
      ok: result.status === 200 && result.ms <= check.maxMs && missing.length === 0 && !mojibake,
    });
  } catch (error) {
    const message = `${check.name}: ${error.message}`;
    if (STRICT_LIVE) failures.push(message);
    else warnings.push(`${message} (set SITE_AUDIT_STRICT_LIVE=true to fail on live checks)`);
    results.push({ name: check.name, ok: false, error: error.message });
  }
}

failures.push(...await assertLocalSeoClean());

console.log(JSON.stringify({ site: SITE_URL, strictLive: STRICT_LIVE, results, warnings, failures }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
