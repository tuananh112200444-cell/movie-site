const SITE = String(process.env.SITE_URL || 'https://khophim.org').replace(/\/$/, '');
const TIMEOUT = Math.max(3000, Number(process.env.SMOKE_TIMEOUT_MS || 15000));
const checks = [
  { name: 'release-manifest', path: '/release.json', status: 200, has: ['release_id','schema_contract'] },
  { name: 'home', path: '/', status: 200, has: ['KhoPhim'] },
  { name: 'sitemap', path: '/sitemap.xml', status: 200, has: ['<sitemapindex','sitemap-movies-recent.xml','feed.xml'] },
  { name: 'rss', path: '/feed.xml', status: 200, has: ['<rss','rel="hub"','/phim/'] },
  { name: 'robots', path: '/robots.txt', status: 200, has: ['Sitemap:'] },
  { name: 'press', path: '/press/', status: 200, has: ['Thông tin thương hiệu','khophim-logo-v2'] },
  { name: 'api-time', path: '/api/time', status: 200, contentType: 'application/json', has: ['"now"'] },
  { name: 'api-source-health', path: '/api/player-source-health?hours=1&limit=5', status: 200, contentType: 'application/json', has: ['"bad_hosts"'] },
  { name: 'api-multi-source-detail', path: '/api/movie-detail?slug=cap-doi-trai-nguoc', status: 200, contentType: 'application/json', has: ['"movie"','"episodes"','"server_name"'] },
  { name: 'home-googlebot', path: '/', status: 200, has: ['index, follow','application/ld+json','KhoPhim'], bot: true },
  { name: 'seo-landing-googlebot', path: '/xem-phim-online', status: 200, has: ['index, follow','rel="canonical"','Xem Phim Online'], bot: true },
  { name: 'movie-googlebot', path: '/phim/quyet-chien-tai-mohenjo', status: 200, has: ['rel="canonical"','Movie','role=actor'], bot: true },
  { name: 'thin-movie-noindex', path: '/phim/bieu-muoi-van-phuc', status: 200, has: ['noindex, follow'], bot: true },
];

async function check(item) {
  const started = Date.now();
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${SITE}${item.path}`, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT), headers: item.bot ? { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } : {} });
      const body = await response.text();
      const missing = item.has.filter((value) => !body.includes(value));
      const contentType = response.headers.get('content-type') || '';
      const contentTypeOk = !item.contentType || contentType.toLowerCase().includes(item.contentType);
      return { name:item.name, ok:response.status===item.status && missing.length===0 && contentTypeOk, status:response.status, content_type:contentType, expected_content_type:item.contentType || null, missing, attempts:attempt, elapsed_ms:Date.now()-started };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return { name:item.name, ok:false, error:lastError?.message || 'network failure', attempts:2, elapsed_ms:Date.now()-started };
}

const results = [];
for (const item of checks) results.push(await check(item));
const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({ site:SITE, checked_at:new Date().toISOString(), ok:failed.length===0, results }, null, 2));
if (failed.length) { console.error(`POST-DEPLOY SMOKE FAILED: ${failed.map((item)=>item.name).join(', ')}. Stop rollout and inspect/rollback.`); process.exit(1); }
console.log('POST-DEPLOY SMOKE PASSED.');
