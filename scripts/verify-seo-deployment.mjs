const inputBase = process.argv[2] || process.env.SEO_DEPLOYMENT_URL || 'https://khophim.org';
const allowFunctionFailOpen = process.argv.includes('--allow-function-fail-open');
const base = new URL(inputBase);
const canonicalOrigin = 'https://khophim.org';
const userAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const failures = [];

function locs(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

function deploymentUrl(canonicalUrl) {
  const url = new URL(canonicalUrl);
  return new URL(`${url.pathname}${url.search}`, base).toString();
}

async function fetchPage(url, { redirect = 'manual' } = {}) {
  return fetch(url, {
    redirect,
    headers: { 'user-agent': userAgent, accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(20_000),
  });
}

const rootResponse = await fetchPage(new URL('/sitemap.xml', base), { redirect: 'follow' });
const rootXml = await rootResponse.text();
if (rootResponse.status !== 200 || !rootXml.includes('<sitemapindex')) failures.push(`Root sitemap failed: HTTP ${rootResponse.status}.`);
if (!allowFunctionFailOpen && rootResponse.headers.get('x-sitemap-proxy') !== 'cloudflare-pages-priority-index') {
  failures.push(`Root sitemap did not pass through the Pages SEO worker (proxy: ${rootResponse.headers.get('x-sitemap-proxy') || 'missing'}).`);
}

const childLocs = locs(rootXml);
const expectedChildPaths = [
  '/sitemap-static.xml',
  '/sitemap-seo-landing.xml',
  '/sitemap-movies-recent.xml',
  '/sitemap-movies-upcoming.xml',
  '/sitemap-seo-studio.xml',
  '/sitemap-movies-1.xml',
];
const childPaths = childLocs.map((loc) => new URL(loc).pathname);
for (const expected of expectedChildPaths) {
  if (!childPaths.includes(expected)) failures.push(`Root sitemap is missing ${expected}.`);
}
for (const forbidden of ['/sitemap-movies-ongoing.xml', '/feed.xml', '/sitemap-movies-2.xml']) {
  if (childPaths.includes(forbidden)) failures.push(`Root sitemap still includes runtime-only or stale child ${forbidden}.`);
}

const submittedUrls = new Set();
for (const childLoc of childLocs) {
  const response = await fetchPage(deploymentUrl(childLoc), { redirect: 'follow' });
  const body = await response.text();
  if (response.status !== 200 || !body.trimStart().startsWith('<?xml')) {
    failures.push(`Child sitemap failed: ${new URL(childLoc).pathname} returned HTTP ${response.status}.`);
    continue;
  }
  if (!allowFunctionFailOpen && new URL(childLoc).pathname === '/sitemap-seo-studio.xml'
    && response.headers.get('x-sitemap-proxy') !== 'cloudflare-pages') {
    failures.push(`SEO Studio sitemap is using a static fail-open response instead of the Pages SEO worker.`);
  }
  for (const url of locs(body)) {
    if (url.startsWith(`${canonicalOrigin}/`)) submittedUrls.add(url);
  }
}

const submitted = [...submittedUrls];
let cursor = 0;
let checked = 0;
async function auditWorker() {
  while (cursor < submitted.length) {
    const canonicalUrl = submitted[cursor++];
    const response = await fetchPage(deploymentUrl(canonicalUrl), { redirect: 'manual' });
    const body = await response.text();
    checked += 1;
    if (response.status !== 200) {
      failures.push(`Submitted URL returned HTTP ${response.status}: ${canonicalUrl}.`);
      continue;
    }
    if (!allowFunctionFailOpen && (response.headers.get('x-robots-tag') || '').toLowerCase().includes('noindex')) {
      failures.push(`Submitted URL returned X-Robots-Tag noindex: ${canonicalUrl}.`);
    }
    if ((response.headers.get('content-type') || '').includes('text/html')) {
      const canonicalTag = body.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || '';
      const canonicalHeader = (response.headers.get('link') || '').match(/<([^>]+)>;\s*rel=["']?canonical/i)?.[1] || '';
      const canonicalHref = canonicalTag.match(/href=["']([^"']+)["']/i)?.[1] || canonicalHeader;
      if (!canonicalHref || new URL(canonicalHref, canonicalOrigin).pathname !== new URL(canonicalUrl).pathname) {
        failures.push(`Submitted HTML has the wrong canonical: ${canonicalUrl} -> ${canonicalHref || '(missing)'}.`);
      }
      if (!/<h1\b/i.test(body)) failures.push(`Submitted HTML has no server-rendered H1: ${canonicalUrl}.`);
      if (/\/phim\//.test(new URL(canonicalUrl).pathname) && !/"@type":"Movie"|"@type":\s*"Movie"/.test(body)) {
        failures.push(`Submitted movie has no Movie structured data: ${canonicalUrl}.`);
      }
    }
  }
}
await Promise.all(Array.from({ length: 10 }, () => auditWorker()));

if (!allowFunctionFailOpen) {
  const timeResponse = await fetchPage(new URL('/api/time', base), { redirect: 'follow' });
  const timeBody = await timeResponse.text();
  if (timeResponse.status !== 200 || !(timeResponse.headers.get('content-type') || '').includes('application/json') || !timeBody.includes('"now"')) {
    failures.push(`Pages Worker health route is unavailable: /api/time HTTP ${timeResponse.status}.`);
  }
  const inspectResponse = await fetchPage(new URL('/internal/seo-studio-inspect?slug=biet-doi-cong-ly-avalanche', base), { redirect: 'manual' });
  if (inspectResponse.status !== 401 || !(inspectResponse.headers.get('x-robots-tag') || '').toLowerCase().includes('noindex')) {
    failures.push(`Protected SEO Studio inspection route is unavailable or unsafe: HTTP ${inspectResponse.status}.`);
  }
  for (const runtimePath of ['/sitemap-movies-ongoing.xml']) {
    const response = await fetchPage(new URL(runtimePath, base), { redirect: 'follow' });
    const body = await response.text();
    if (response.status !== 200 || !body.includes('<urlset')) failures.push(`Runtime sitemap is unhealthy: ${runtimePath} HTTP ${response.status}.`);
  }
  const feedResponse = await fetchPage(new URL('/feed.xml', base), { redirect: 'follow' });
  const feedBody = await feedResponse.text();
  if (feedResponse.status !== 200 || !feedBody.includes('<rss')) failures.push(`RSS feed is unhealthy: HTTP ${feedResponse.status}.`);
}

for (const privatePath of allowFunctionFailOpen ? [] : ['/search?q=conan', '/xem-phim/cuu-mon-2026']) {
  const response = await fetchPage(new URL(privatePath, base), { redirect: 'manual' });
  if (response.status !== 200 || !(response.headers.get('x-robots-tag') || '').toLowerCase().includes('noindex')) {
    failures.push(`Private crawl path must return 200 + noindex: ${privatePath}.`);
  }
}

for (const slashPath of ['/phim-le/', '/phim/cuu-mon-2026/']) {
  const response = await fetchPage(new URL(slashPath, base), { redirect: 'manual' });
  if (![301, 308].includes(response.status)) failures.push(`Trailing-slash duplicate did not permanently redirect: ${slashPath} HTTP ${response.status}.`);
}

const missingResponse = await fetchPage(new URL('/seo-audit-missing-987654', base), { redirect: 'manual' });
if (missingResponse.status !== 404) failures.push(`Unknown URL must return 404, got ${missingResponse.status}.`);

const report = {
  deployment: base.origin,
  function_fail_open_allowed: allowFunctionFailOpen,
  child_sitemaps: childLocs.length,
  submitted_urls: submitted.length,
  checked_urls: checked,
  failures: failures.slice(0, 100),
  truncated_failures: Math.max(0, failures.length - 100),
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
