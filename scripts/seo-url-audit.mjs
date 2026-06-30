const SITE = 'https://khophim.org';
const DEFAULT_LIMIT = 1000;
const DEFAULT_CONCURRENCY = 8;
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

function isSitemapUrl(url) {
  return /\/sitemap[^/]*\.xml(?:$|[?#])/i.test(new URL(url).pathname);
}

let requestTimeoutMs = 12000;
let sitemapTimeoutMs = 30000;

async function fetchText(url, timeoutMs = requestTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xml,text/xml,*/*',
        'user-agent': GOOGLEBOT,
        'cache-control': 'no-cache',
      },
      redirect: 'manual',
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function collectUrls(entryUrl, maxSitemapUrls = 50000) {
  const seenSitemaps = new Set();
  const pageUrls = [];
  const queue = [entryUrl];

  while (queue.length && pageUrls.length < maxSitemapUrls) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);
    const { response, text } = await fetchText(sitemapUrl, sitemapTimeoutMs);
    if (!response.ok) {
      pageUrls.push(sitemapUrl);
      continue;
    }
    const locs = extractLocs(text);
    for (const loc of locs) {
      if (isSitemapUrl(loc)) queue.push(loc);
      else pageUrls.push(loc);
      if (pageUrls.length >= maxSitemapUrls) break;
    }
  }

  return unique(pageUrls);
}

function spreadSample(items, limit) {
  if (items.length <= limit) return items;
  if (limit === 1) return [items[0]];
  const selected = [];
  const seen = new Set();
  const maxIndex = items.length - 1;
  for (let i = 0; i < limit; i += 1) {
    const index = Math.round((i * maxIndex) / (limit - 1));
    const item = items[index];
    if (item && !seen.has(item)) {
      seen.add(item);
      selected.push(item);
    }
  }
  return selected;
}

function parseMetaRobots(html) {
  const match = html.match(/<meta[^>]+name=["'](?:robots|googlebot)["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["'](?:robots|googlebot)["'][^>]*>/i);
  return match ? match[1].toLowerCase() : '';
}

function parseCanonical(html) {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i);
  return match ? match[1].trim() : '';
}

function classify(url, response, html, error) {
  if (error) return { issue: 'fetch_error', detail: error };
  const status = response.status;
  const location = response.headers.get('location') || '';
  const xRobots = (response.headers.get('x-robots-tag') || '').toLowerCase();
  const robots = parseMetaRobots(html);
  const canonical = parseCanonical(html);
  const cleanUrl = url.replace(/\/+$/, '');
  const cleanCanonical = canonical.replace(/\/+$/, '');

  if (status >= 500) return { issue: 'server_5xx', detail: String(status) };
  if ([301, 302, 307, 308].includes(status)) return { issue: 'redirect', detail: location };
  if (status === 404 || status === 410) return { issue: 'not_found', detail: String(status) };
  if (status < 200 || status >= 300) return { issue: 'bad_status', detail: String(status) };
  if (xRobots.includes('noindex') || robots.includes('noindex')) return { issue: 'noindex', detail: xRobots || robots };
  if (!canonical) return { issue: 'missing_canonical', detail: '' };
  if (cleanCanonical !== cleanUrl) return { issue: 'canonical_mismatch', detail: canonical };
  if (/khophim - xem phim online/i.test(html) && /\/phim\//.test(new URL(url).pathname)) {
    return { issue: 'spa_fallback_possible', detail: 'movie returned homepage shell title' };
  }
  if (/Không tìm thấy phim|Khong tim thay phim/i.test(html)) return { issue: 'soft_404_text', detail: 'not found text in body' };
  return { issue: 'ok', detail: '' };
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  const sitemap = arg('sitemap', `${SITE}/sitemap.xml`);
  const limit = Math.max(1, Number(arg('limit', String(DEFAULT_LIMIT))) || DEFAULT_LIMIT);
  const collectLimit = Math.max(limit, Number(arg('collect', '60000')) || 60000);
  requestTimeoutMs = Math.max(3000, Number(arg('timeout', '12000')) || 12000);
  sitemapTimeoutMs = Math.max(requestTimeoutMs, Number(arg('sitemap-timeout', '30000')) || 30000);
  const concurrency = Math.max(1, Math.min(20, Number(arg('concurrency', String(DEFAULT_CONCURRENCY))) || DEFAULT_CONCURRENCY));
  const sample = arg('sample', 'first');
  const collectedUrls = await collectUrls(sitemap, collectLimit);
  const urls = (sample === 'spread' ? spreadSample(collectedUrls, limit) : collectedUrls.slice(0, limit));
  const started = Date.now();
  const results = await mapLimit(urls, concurrency, async (url) => {
    try {
      const { response, text } = await fetchText(url);
      const verdict = classify(url, response, text, '');
      return { url, status: response.status, ...verdict };
    } catch (error) {
      return { url, status: 0, ...classify(url, null, '', error.message || String(error)) };
    }
  });

  const summary = results.reduce((acc, item) => {
    acc[item.issue] = (acc[item.issue] || 0) + 1;
    return acc;
  }, {});
  const samples = Object.fromEntries(
    Object.keys(summary).sort().map((issue) => [
      issue,
      results.filter((item) => item.issue === issue).slice(0, 10),
    ]),
  );

  console.log(JSON.stringify({
    sitemap,
    collected: collectedUrls.length,
    sample,
    timeoutMs: requestTimeoutMs,
    sitemapTimeoutMs,
    checked: results.length,
    ms: Date.now() - started,
    summary,
    samples,
  }, null, 2));

  if (results.some((item) => item.issue !== 'ok')) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
