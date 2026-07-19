import { readdir, readFile } from 'node:fs/promises';
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
    required: ['Xem Phim Online Miễn Phí Vietsub HD', 'Xem phim online Vietsub HD miễn phí', 'meta name="description"', 'rel="canonical"', 'SearchAction', 'Organization', 'CollectionPage'],
  },
  {
    name: 'sitemap-index',
    url: `${SITE_URL}/sitemap.xml`,
    maxMs: 1200,
    required: ['<sitemapindex', '/sitemap-static.xml', '/sitemap-seo-landing.xml', '/sitemap-movies-recent.xml', '/feed.xml'],
  },
  {
    name: 'seo-sitemap',
    url: `${SITE_URL}/sitemap-seo-landing.xml`,
    maxMs: 1200,
    required: ['<urlset', '/xem-phim-online', '/phim-vietsub', '/phim-dang-chieu'],
  },
  {
    name: 'movie-rss-feed',
    url: `${SITE_URL}/feed.xml`,
    maxMs: 2500,
    required: ['<rss', 'rel="hub"', '/phim/'],
  },
  {
    name: 'movie-sitemap-recent',
    url: `${SITE_URL}/sitemap-movies-recent.xml`,
    maxMs: 2500,
    required: ['<urlset', '/phim/'],
  },
  {
    name: 'llms-txt',
    url: `${SITE_URL}/llms.txt`,
    maxMs: 1200,
    required: ['# KhoPhim.org', '## Important Links', `${SITE_URL}/sitemap.xml`, `${SITE_URL}/search`],
  },
];

function hasMojibake(text) {
  return /Ã|áº|á»|Ä‘|Ä|Æ°|Æ¡|Â(?!u|U)/.test(text);
}

function collectDuplicateValues(text, regex) {
  const counts = new Map();
  for (const match of text.matchAll(regex)) {
    const value = match[1];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function hasAppShellMojibake(text) {
  return /(?:Ã|Â|Ä|Æ|áº|á»)/.test(text);
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

async function fetchTextBestEffort(check) {
  const first = await fetchText(check);
  if (first.status === 200 && first.ms <= check.maxMs) return first;
  const second = await fetchText(check);
  return second.ms < first.ms ? second : first;
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

async function assertAppShellRecoveryClean() {
  const files = [
    'src/main.tsx',
    'src/App.tsx',
    'src/components/base/AppErrorBoundary.tsx',
    'src/components/base/OfflineIndicator.tsx',
    'public/service-worker.js',
  ];
  const failures = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8').catch(() => '');
    if (!text) {
      failures.push(`${file} is missing from app shell recovery audit.`);
      continue;
    }
    if (hasAppShellMojibake(text)) failures.push(`${file} contains mojibake text.`);
  }

  const main = await readFile('src/main.tsx', 'utf8').catch(() => '');
  const offline = await readFile('src/components/base/OfflineIndicator.tsx', 'utf8').catch(() => '');
  if (!main.includes('removeLegacyServiceWorkers')) failures.push('src/main.tsx no longer removes legacy service workers.');
  if (!main.includes('pruneSmartClientCaches({ force: true })')) failures.push('src/main.tsx no longer cleans stale restored tab caches.');
  if (main.includes('reloadOnceForFreshShell') || main.includes('visible_after_stale')) {
    failures.push('src/main.tsx should not auto-reload stale restored tabs; it must clean caches silently.');
  }
  if (offline.includes('kp_probe') || offline.includes("fetch('/") || offline.includes('fetch(`${path}')) {
    failures.push('OfflineIndicator should not create same-origin network probes on focus/visibility.');
  }

  return failures;
}

async function assertProductionBuildClean() {
  const failures = [];
  const html = await readFile('out/index.html', 'utf8').catch(() => null);
  if (!html) {
    return ['out/index.html is missing. Run npm run build before site-excellence audit.'];
  }

  for (const needle of ['/@vite/client', 'react-refresh', '/src/main.tsx']) {
    if (html.includes(needle)) failures.push(`out/index.html contains dev-only reference: ${needle}`);
  }

  for (const needle of [
    '<title>KhoPhim',
    'meta name="description"',
    'rel="canonical"',
    'type="module" crossorigin src="/assets/',
    '<noscript>',
  ]) {
    if (!html.includes(needle)) failures.push(`out/index.html is missing required production marker: ${needle}`);
  }

  if (hasMojibake(html)) failures.push('out/index.html contains mojibake text.');

  const duplicatePreloads = collectDuplicateValues(
    html,
    /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["'][^>]*>/g,
  );
  if (duplicatePreloads.length > 0) {
    failures.push(`out/index.html contains duplicate modulepreload links: ${duplicatePreloads.join(', ')}`);
  }

  const assets = await readdir('out/assets', { withFileTypes: true }).catch(() => []);
  const files = assets.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const fileSet = new Set(files);
  const budgets = [
    { pattern: /^index-.*\.js$/, maxBytes: 390_000, label: 'main app JS' },
    { pattern: /^vendor-hls-.*\.js$/, maxBytes: 560_000, label: 'HLS vendor JS' },
    { pattern: /^vendor-react-.*\.js$/, maxBytes: 220_000, label: 'React vendor JS' },
    { pattern: /^index-.*\.css$/, maxBytes: 230_000, label: 'main CSS' },
  ];

  for (const file of files) {
    if (!/\.(js|css)$/.test(file)) continue;
    const budget = budgets.find((item) => item.pattern.test(file));
    if (!budget) continue;
    const bytes = (await readFile(`out/assets/${file}`)).byteLength;
    if (bytes > budget.maxBytes) {
      failures.push(`${budget.label} ${file} is ${bytes} bytes, above budget ${budget.maxBytes}.`);
    }
    if (!fileSet.has(`${file}.gz`)) failures.push(`${file} is missing gzip precompression.`);
    if (!fileSet.has(`${file}.br`)) failures.push(`${file} is missing brotli precompression.`);
  }

  return failures;
}

async function assertHeadersClean() {
  const headers = await readFile('public/_headers', 'utf8').catch(() => '');
  const routes = await readFile('public/_routes.json', 'utf8').catch(() => '');
  const failures = [];
  for (const needle of [
    'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy:',
    'X-Content-Type-Options: nosniff',
    '/assets/*',
    'Cache-Control: public, max-age=31536000, immutable',
    '/service-worker.js',
    'Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
    '/sitemap*.xml',
    'Content-Type: application/xml',
    '/llms.txt',
    'Content-Type: text/plain; charset=utf-8',
  ]) {
    if (!headers.includes(needle)) failures.push(`public/_headers is missing: ${needle}`);
  }
  const smartCacheBlocks = new Map([
    ['/', 'Cache-Control: public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=600'],
    ['/phim/*', 'Cache-Control: public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=600'],
    ['/search*', 'Cache-Control: public, max-age=30, s-maxage=120, stale-while-revalidate=300'],
  ]);
  for (const [route, cacheHeader] of smartCacheBlocks) {
    const block = `${route}\n  ${cacheHeader}`;
    if (!headers.includes(block)) failures.push(`public/_headers should keep ${route} on smart short cache.`);
  }
  for (const excludedRoute of [
    '/assets/*',
    '/images/*',
    '/banners/*',
    '/robots.txt',
    '/llms.txt',
    '/home-fallback.json',
    '/queer-fallback.json',
    '/sitemap*.xml',
  ]) {
    if (!routes.includes(excludedRoute)) failures.push(`public/_routes.json should exclude ${excludedRoute} from Pages Functions.`);
  }
  return failures;
}

async function assertSitemapsClean() {
  const [index, seo, llms] = await Promise.all([
    readFile('public/sitemap.xml', 'utf8').catch(() => ''),
    readFile('public/sitemap-seo-landing.xml', 'utf8').catch(() => ''),
    readFile('public/llms.txt', 'utf8').catch(() => ''),
  ]);
  const failures = [];
  if (!index.includes('<sitemapindex')) failures.push('public/sitemap.xml is not a sitemap index.');
  for (const loc of ['sitemap-static.xml', 'sitemap-seo-landing.xml', 'sitemap-movies-recent.xml', 'feed.xml']) {
    if (!index.includes(loc)) failures.push(`public/sitemap.xml is missing ${loc}.`);
  }
  if (index.includes('sitemap-movies.xml')) {
    failures.push('public/sitemap.xml should use chunked movie sitemaps instead of the full sitemap-movies.xml.');
  }
  if (/sitemap-movies-[1-8]\.xml/.test(index) || index.includes('sitemap-movies-upcoming.xml')) failures.push('public/sitemap.xml should not expose broad or upcoming movie sitemaps during quality recovery.');
  if (!seo.includes('<urlset')) failures.push('public/sitemap-seo-landing.xml is not a URL set.');
  for (const loc of ['/xem-phim-online', '/phim-vietsub', '/phim-dang-chieu']) {
    if (!seo.includes(loc)) failures.push(`public/sitemap-seo-landing.xml is missing ${loc}.`);
  }
  if (hasMojibake(index) || hasMojibake(seo)) failures.push('Local sitemap XML contains mojibake text.');
  if (!llms.startsWith('# KhoPhim.org')) failures.push('public/llms.txt must start with "# KhoPhim.org".');
  for (const loc of [`${SITE_URL}/`, `${SITE_URL}/search`, `${SITE_URL}/sitemap.xml`, `${SITE_URL}/robots.txt`]) {
    if (!llms.includes(loc)) failures.push(`public/llms.txt is missing ${loc}.`);
  }
  const llmsLinkCount = [...llms.matchAll(/\[[^\]]+\]\((https:\/\/khophim\.org(?:\/[^)]*)?)\)/g)].length;
  if (llmsLinkCount < 8) failures.push('public/llms.txt should contain at least 8 khophim.org markdown links.');
  if (hasMojibake(llms)) failures.push('public/llms.txt contains mojibake text.');
  return failures;
}

async function assertMovieDetailSourcePriorityClean() {
  const movieApi = await readFile('src/services/movieApi.ts', 'utf8').catch(() => '');
  const failures = [];
  if (!movieApi) return ['src/services/movieApi.ts is missing from detail source priority audit.'];

  if (!movieApi.includes('const cacheKey = `detail_v7_${detailSourceKey}_${slug}`')) {
    failures.push('Movie detail cache key must include source, so source=ophim cannot reuse stale default detail cache.');
  }
  if (!movieApi.includes('const inflightKey = `${detailSourceKey}:${slug}`')) {
    failures.push('Movie detail inflight key must include source, so concurrent source requests cannot share stale promises.');
  }
  if (!movieApi.includes('...(looksLikeCjk ? [ophimPromise.then')) {
    failures.push('source=ophim quick race must only include direct OPhim for CJK/non-ASCII slugs.');
  }
  if (movieApi.includes('...(preferOphim ? [ophimPromise.then')) {
    failures.push('source=ophim quick race is allowed to prefer direct OPhim again; this can regress ASCII movies like chasing-love.');
  }
  if (!movieApi.includes('if (looksLikeCjk && ophim && detailHasPlayableEpisodes(ophim))')) {
    failures.push('Direct OPhim priority must stay limited to CJK/non-ASCII slug fallback.');
  }
  if (movieApi.includes('if (preferOphim && ophim && detailHasPlayableEpisodes(ophim))')) {
    failures.push('Direct OPhim priority must not run for every source=ophim request.');
  }

  return failures;
}

const failures = [];
const warnings = [];
const results = [];

for (const check of CHECKS) {
  try {
    const result = await fetchTextBestEffort(check);
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
failures.push(...await assertAppShellRecoveryClean());
failures.push(...await assertProductionBuildClean());
failures.push(...await assertHeadersClean());
failures.push(...await assertSitemapsClean());
failures.push(...await assertMovieDetailSourcePriorityClean());

console.log(JSON.stringify({ site: SITE_URL, strictLive: STRICT_LIVE, results, warnings, failures }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
