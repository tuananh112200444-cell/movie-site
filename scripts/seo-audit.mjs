import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SITE_URL, seoLandingUrls } from './seo-data.mjs';
import { MHOPHIM_URL, satellitePages } from './mhophim-satellite-data.mjs';

const errors = [];
const warnings = [];
const SECONDARY_DOMAIN_PATTERN = /https?:\/\/(?:www\.)?mhophim\.com/i;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function read(path) {
  return readFile(resolve(path), 'utf8');
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim());
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function hasMojibake(value) {
  return /Ã|Â»|Â¼|â€|Æ°|áº|á»/.test(value);
}

function isDynamicMovieSitemap(fileName) {
  return fileName === 'sitemap-movies.xml'
    || fileName === 'sitemap-movies-recent.xml'
    || fileName === 'sitemap-movies-upcoming.xml'
    || fileName === 'sitemap-movies-ongoing.xml'
    || /^sitemap-movies-\d+\.xml$/.test(fileName);
}

const robots = await read('public/robots.txt');
if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) {
  addError('robots.txt must point to the canonical sitemap index.');
}
if (SECONDARY_DOMAIN_PATTERN.test(robots)) {
  addError('robots.txt must not reference the secondary domain mhophim.com.');
}
if (/crawl-delay\s*:/i.test(robots)) {
  addError('robots.txt contains Crawl-delay, which slows Screaming Frog and some crawlers.');
}
const globalRobotsBlock = robots.split(/\n\s*User-agent:/i)[0];
if (/Disallow:\s*\/\s*$/im.test(globalRobotsBlock)) {
  addError('robots.txt has a global User-agent: * Disallow: / rule.');
}

const redirects = await read('public/_redirects');
if (/^\s*https?:\/\//im.test(redirects)) {
  addError('public/_redirects must not use domain-level sources; Cloudflare Pages only supports path-based sources here.');
}
const routesConfig = await read('public/_routes.json');
if (routesConfig.includes('"/sitemap*.xml"')) {
  addError('Cloudflare routes must let sitemap requests reach the SEO worker so retired chunks can return HTTP 410.');
}
if (!redirects.includes('/* /index.html 200')) {
  addError('public/_redirects must keep the SPA fallback after canonical redirects.');
}
if (/^\/sitemap[^\s]*\s+https:\/\//m.test(redirects) || /^\/feed\.xml\s+https:\/\//m.test(redirects)) {
  addError('public/_redirects must not bypass the single sitemap handler in functions/[[path]].js.');
}

const cloudflareFunction = await read('functions/[[path]].js').catch(() => '');
const consolidatedSeoPaths = [
  '/xem-phim',
  '/xem-phim-mien-phi',
  '/xem-phim-hd',
  '/web-xem-phim',
  '/kho-phim-online',
  '/xem-phim-vietsub',
  '/xem-phim-moi',
  '/xem-phim-le',
  '/xem-phim-bo',
  '/xem-phim-chieu-rap',
  '/xem-phim-viet-nam',
  '/xem-phim-han-quoc',
  '/xem-phim-trung-quoc',
  '/xem-phim-au-my',
  '/xem-anime-vietsub',
];
for (const path of consolidatedSeoPaths) {
  if (!cloudflareFunction.includes(`['${path}',`)) {
    addError(`Cloudflare is missing the consolidated SEO redirect for ${path}.`);
  }
  if (seoLandingUrls.some((item) => item.path === path)) {
    addError(`Consolidated SEO path must not remain in the landing sitemap: ${path}.`);
  }
}
if (/url\.hostname === 'mhophim\.com'[\s\S]{0,120}canonicalRedirect\(url,\s*pathname\)/.test(cloudflareFunction)) {
  addError('functions/[[path]].js must not send mhophim.com through the khophim.org canonical redirect.');
}
for (const requiredSnippet of [
  'handleMhophimRequest',
  "url.hostname === 'mhophim.com'",
  "url.hostname === 'www.mhophim.com'",
  "url.hostname === 'www.khophim.org'",
  "return serveAsset(context, '/mhophim/index.html')",
  "return hostRedirect(`${SITE_URL}${pathname}${url.search}`, 'khophim.org')",
]) {
  if (!cloudflareFunction.includes(requiredSnippet)) {
    addError(`functions/[[path]].js is missing host SEO guard: ${requiredSnippet}`);
  }
}
if (!cloudflareFunction.includes("pathname === '/sitemap-movies-archive.xml'")) {
  addError('Cloudflare SEO worker must keep the bounded archive sitemap available outside the recovery sitemap.');
}
if (!cloudflareFunction.includes('EDGE_SITEMAP_CHUNK_SIZE = 1000')
  || cloudflareFunction.includes('page_size=50000')) {
  addError('Cloudflare SEO worker must split the quality-gated movie sitemap into bounded 1,000-URL chunks.');
}
for (const requiredDiscoverySnippet of [
  'fetchStaticMovieLinks(context, cleanPath, page)',
  '/home-fallback.json',
  "'@type': 'ItemList'",
  'await renderStaticPrerender(request, context)',
  "X-Sitemap-Proxy': 'cloudflare-pages-priority-index'",
  'renderMovieSitemapIndexXml({ archive:',
  'repairSitemapMojibake(await response.text())',
  'const maxAttempts = movieChunkMatch ? 2 : 1',
  "movieChunkMatch && cachedCount === '0'",
]) {
  if (!cloudflareFunction.includes(requiredDiscoverySnippet)) {
    addError(`Cloudflare SEO worker is missing server-rendered movie discovery: ${requiredDiscoverySnippet}`);
  }
}
if (cloudflareFunction.includes('<h2>Cụm từ khóa liên quan</h2>')
  || cloudflareFunction.includes('Googlebot có thể đi từ trang này')) {
  addError('Cloudflare SEO worker must not render search-engine-first copy or keyword lists to users.');
}
if (!cloudflareFunction.includes('the-loai|quoc-gia|danh-sach')) {
  addError('MHoPhim legacy catalogue URLs must consolidate into khophim.org.');
}
if (!cloudflareFunction.includes("potentialAction: hasPlayableEpisode ? { '@type': 'WatchAction', target: watchUrl }")) {
  addError('Movie prerender WatchAction must target the dedicated watch page.');
}
if (/['\"]@type['\"]:\s*['\"]VideoObject['\"]/.test(cloudflareFunction)) {
  addError('Movie information pages must not advertise a complementary trailer as a watch-page VideoObject.');
}
if (!cloudflareFunction.includes('apikey: SUPABASE_PUBLIC_KEY')
  || !cloudflareFunction.includes('Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`')) {
  addError('Movie prerender must authenticate to the JWT-protected published-data endpoint with the public key.');
}
if (!cloudflareFunction.includes("pathname === '/feed.xml' || pathname === '/sitemap-movies-recent.xml'")
  || !cloudflareFunction.includes(') ? 5000 : 30000')) {
  addError('RSS and recent sitemap upstream calls must fail over quickly instead of holding crawlers for 30 seconds.');
}
if (!cloudflareFunction.includes('renderMovieTemporarilyUnavailable')
  || !cloudflareFunction.includes("'Retry-After': '300'")) {
  addError('A temporary movie data outage must return retryable 503, not a noindex 404.');
}
if (!cloudflareFunction.includes("pathname === '/sitemap-movies-recent.xml'")
  || !cloudflareFunction.includes('cloudflare-pages-static-recent-fallback')) {
  addError('Recent movie sitemap must retain a validated static fallback during a data outage.');
}

const llms = await read('public/llms.txt').catch(() => '');
if (!/^#\s+\S+/m.test(llms)) {
  addError('llms.txt must start with an H1 title, for example "# KhoPhim.org".');
}

const pressPage = await read('public/press/index.html').catch(() => '');
if (hasMojibake(pressPage)) {
  addError('Press page contains mojibake and is unsafe for journalists to quote.');
}
for (const requiredPressAsset of ['/sitemap.xml', '/feed.xml', '/sitemap', '/llms.txt', '/brand/khophim-logo-v2.png']) {
  if (!pressPage.includes(requiredPressAsset)) addError(`Press page is missing linkable asset: ${requiredPressAsset}`);
}
if (/mua b[aá]n li[eê]n k[eế]t|trao [đd]ổi backlink h[aà]ng lo[aạ]t/i.test(pressPage) === false) {
  addError('Press page must publish an anti-link-scheme policy.');
}
if (/50,000\+|lớn nhất Việt Nam|hàng đầu Việt Nam/i.test(pressPage)) {
  addError('Press page contains an unverified superlative or fixed catalogue claim.');
}
const llmsLinks = [...llms.matchAll(/\[[^\]]+\]\((https:\/\/khophim\.org(?:\/[^)]*)?)\)/g)].map((match) => match[1]);
if (llmsLinks.length < 8) {
  addError('llms.txt should contain important khophim.org links for agents and web browsing tools.');
}
for (const requiredLink of [`${SITE_URL}/`, `${SITE_URL}/search`, `${SITE_URL}/sitemap.xml`, `${SITE_URL}/robots.txt`]) {
  if (!llmsLinks.includes(requiredLink)) addError(`llms.txt is missing required link: ${requiredLink}`);
}
if (hasMojibake(llms)) {
  addError('llms.txt contains mojibake text.');
}

const indexHtml = await read('index.html');
if (SECONDARY_DOMAIN_PATTERN.test(indexHtml)) {
  addError('index.html must not contain mhophim.com; all SEO signals must point to khophim.org.');
}
if (!indexHtml.includes('rel="canonical"') || !indexHtml.includes('https://khophim.org')) {
  addError('index.html must declare khophim.org as the canonical homepage.');
}
if (indexHtml.includes("gtag('config', 'G-6B5GLB9W6H');")) {
  addError('index.html sends an automatic GA page_view before SPA tracking.');
}
if (indexHtml.includes('G-XXXXXXXXXX')) {
  addError('index.html contains a placeholder GA measurement id.');
}
const noscriptFallback = indexHtml.match(/<!-- noscript: readable fallback[\s\S]*?<script type="module"/)?.[0] ?? '';
if (hasMojibake(noscriptFallback)) {
  addError('index.html noscript SEO fallback contains mojibake text.');
}

const analyticsTs = await read('src/utils/analytics.ts');
if (analyticsTs.includes('G-XXXXXXXXXX')) {
  addError('src/utils/analytics.ts contains a placeholder GA measurement id.');
}

const routerConfig = await read('src/router/config.tsx');
function routeExists(path) {
  if (routerConfig.includes(`path: '${path}'`) || routerConfig.includes(`path: "${path}"`)) return true;
  if (path.startsWith('/the-loai/')) return routerConfig.includes("path: '/the-loai/:slug'");
  if (path.startsWith('/dien-vien/')) return routerConfig.includes("path: '/dien-vien/:slug'");
  return false;
}
for (const item of seoLandingUrls) {
  if (!routeExists(item.path)) {
    addError(`SEO landing path is in sitemap data but missing a React route: ${item.path}`);
  }
}

const sitemapIndex = await read('public/sitemap.xml');
if (SECONDARY_DOMAIN_PATTERN.test(sitemapIndex)) {
  addError('sitemap.xml must not contain mhophim.com URLs.');
}
const childSitemaps = extractLocs(sitemapIndex);
if (childSitemaps.length < 3) {
  addError('sitemap.xml should include static, seo landing, and movie sitemaps.');
}
if (childSitemaps.includes(`${SITE_URL}/sitemap-movies.xml`)) {
  addError('sitemap.xml should not list the full sitemap-movies.xml; use chunked movie sitemaps to improve crawl stability.');
}
const recentMovieSitemap = `${SITE_URL}/sitemap-movies-recent.xml`;
if (!childSitemaps.includes(recentMovieSitemap)) {
  addError(`sitemap.xml is missing the curated recent movie sitemap: ${recentMovieSitemap}`);
}
const upcomingMovieSitemap = `${SITE_URL}/sitemap-movies-upcoming.xml`;
if (!childSitemaps.includes(upcomingMovieSitemap)) {
  addError(`sitemap.xml is missing the quality-gated upcoming movie sitemap: ${upcomingMovieSitemap}`);
}
const ongoingMovieSitemap = `${SITE_URL}/sitemap-movies-ongoing.xml`;
if (!childSitemaps.includes(ongoingMovieSitemap)) {
  addError(`sitemap.xml is missing the freshness-ranked ongoing movie sitemap: ${ongoingMovieSitemap}`);
}
const movieChunks = childSitemaps.filter((loc) => /\/sitemap-movies-\d+\.xml$/.test(loc));
if (movieChunks.length !== 0) {
  addError(`Recovery sitemap.xml must focus crawl on priority URLs; found ${movieChunks.length} archive chunks.`);
}
if (!childSitemaps.includes(`${SITE_URL}/feed.xml`)) {
  addError('sitemap.xml is missing the curated recent-movie RSS feed.');
}
const archiveSitemapIndex = await read('public/sitemap-movies-archive.xml');
const archiveMovieChunks = extractLocs(archiveSitemapIndex);
for (let page = 1; page <= 18; page += 1) {
  const chunkLoc = `${SITE_URL}/sitemap-movies-${page}.xml`;
  if (!archiveMovieChunks.includes(chunkLoc)) {
    addError(`Archive sitemap index is missing bounded movie chunk: ${chunkLoc}`);
  }
}

const curatedMovieXml = await read('public/sitemap-movies-recent.xml');
const curatedMovieLocs = extractLocs(curatedMovieXml);
if (curatedMovieLocs.length < 40 || curatedMovieLocs.length > 120) {
  addError(`Curated recent sitemap must contain 40-120 identity-backed cohort URLs; found ${curatedMovieLocs.length}.`);
}
for (const loc of childSitemaps) {
  if (!loc.startsWith(`${SITE_URL}/`)) {
    addError(`Sitemap loc is not canonical: ${loc}`);
    continue;
  }
  const fileName = loc.replace(`${SITE_URL}/`, '');
  if (!fileName.endsWith('.xml')) continue;
  if (isDynamicMovieSitemap(fileName) || fileName === 'feed.xml') {
    continue;
  }
  if (!(await exists(resolve('public', fileName)))) {
    addError(`Sitemap index points to missing public/${fileName}.`);
  }
}

const seoSitemap = await read('public/sitemap-seo-landing.xml');
if (SECONDARY_DOMAIN_PATTERN.test(seoSitemap)) {
  addError('sitemap-seo-landing.xml must not contain mhophim.com URLs.');
}
const seoLocs = extractLocs(seoSitemap);
const expectedSeoLocs = seoLandingUrls.map((item) => `${SITE_URL}${item.path}`);
const missingSeoLocs = expectedSeoLocs.filter((loc) => !seoLocs.includes(loc));
const duplicateSeoLocs = seoLocs.filter((loc, index) => seoLocs.indexOf(loc) !== index);
const fakeSeoLocs = seoLocs.filter((loc) => /-seo($|[/?#])/.test(loc));

if (seoLocs.length < 40) {
  addError(`sitemap-seo-landing.xml has only ${seoLocs.length} URLs; expected at least 40.`);
}
if (missingSeoLocs.length > 0) {
  addError(`sitemap-seo-landing.xml is missing: ${missingSeoLocs.join(', ')}`);
}
if (duplicateSeoLocs.length > 0) {
  addError(`sitemap-seo-landing.xml has duplicate locs: ${[...new Set(duplicateSeoLocs)].join(', ')}`);
}
if (fakeSeoLocs.length > 0) {
  addError(`sitemap-seo-landing.xml contains non-routed *-seo URLs: ${fakeSeoLocs.join(', ')}`);
}

const staticSitemap = await read('public/sitemap-static.xml');
if (SECONDARY_DOMAIN_PATTERN.test(staticSitemap)) {
  addError('sitemap-static.xml must not contain mhophim.com URLs.');
}
const staticLocs = extractLocs(staticSitemap);
if (staticLocs.some((loc) => loc.startsWith(`${SITE_URL}/dien-vien/`))) {
  addError('Unverified mock actor profiles must not remain in the static sitemap.');
}
if (staticLocs.includes(`${SITE_URL}/blog/phim-hot-thang-5-2026-xem-tai-khophim`)) {
  addError('The stale May 2026 hot-movie article must not remain in the static sitemap.');
}
const duplicateStaticLocs = staticLocs.filter((loc, index) => staticLocs.indexOf(loc) !== index);
if (duplicateStaticLocs.length > 0) {
  addWarning(`sitemap-static.xml has duplicate locs: ${[...new Set(duplicateStaticLocs)].join(', ')}`);
}
const overlappingLandingLocs = staticLocs.filter((loc) => seoLocs.includes(loc));
if (overlappingLandingLocs.length > 0) {
  addError(`Static and SEO landing sitemaps overlap: ${overlappingLandingLocs.join(', ')}`);
}

const mhophimRobots = await read('public/mhophim/robots.txt').catch(() => '');
if (!mhophimRobots.includes(`Sitemap: ${MHOPHIM_URL}/sitemap.xml`)) {
  addError('public/mhophim/robots.txt must point to the MHoPhim sitemap.');
}
if (!/Disallow:\s*\/phim\//i.test(mhophimRobots) || !/Disallow:\s*\/search/i.test(mhophimRobots)) {
  addError('public/mhophim/robots.txt must block duplicate movie/search paths.');
}

const mhophimSitemap = await read('public/mhophim/sitemap.xml').catch(() => '');
const mhophimLocs = extractLocs(mhophimSitemap);
const expectedMhophimLocs = satellitePages.map((page) => `${MHOPHIM_URL}${page.path === '/' ? '/' : page.path}`);
const missingMhophimLocs = expectedMhophimLocs.filter((loc) => !mhophimLocs.includes(loc));
const duplicateMhophimLocs = mhophimLocs.filter((loc, index) => mhophimLocs.indexOf(loc) !== index);
if (mhophimLocs.length !== satellitePages.length) {
  addError(`public/mhophim/sitemap.xml has ${mhophimLocs.length} URLs; expected ${satellitePages.length}.`);
}
if (missingMhophimLocs.length > 0) {
  addError(`public/mhophim/sitemap.xml is missing: ${missingMhophimLocs.join(', ')}`);
}
if (duplicateMhophimLocs.length > 0) {
  addError(`public/mhophim/sitemap.xml has duplicate locs: ${[...new Set(duplicateMhophimLocs)].join(', ')}`);
}
for (const loc of mhophimLocs) {
  if (!loc.startsWith(`${MHOPHIM_URL}/`)) {
    addError(`MHoPhim sitemap loc is not canonical: ${loc}`);
  }
  if (/\/(?:phim|search)(?:\/|$|\?)/.test(new URL(loc).pathname)) {
    addError(`MHoPhim sitemap must not include duplicate movie/search URL: ${loc}`);
  }
}

for (const page of satellitePages) {
  const filePath = page.path === '/'
    ? 'public/mhophim/index.html'
    : `public/mhophim/${page.path.replace(/^\/+/, '')}/index.html`;
  const html = await read(filePath).catch(() => '');
  const canonical = `${MHOPHIM_URL}${page.path === '/' ? '/' : page.path}`;
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) {
    addError(`${filePath} must declare self canonical ${canonical}.`);
  }
  if (!html.includes('MHoPhim') || !html.includes('khophim.org')) {
    addError(`${filePath} must brand MHoPhim and link to khophim.org.`);
  }
  if (hasMojibake(html)) {
    addError(`${filePath} contains mojibake text.`);
  }
}

const adminSeoPage = await read('src/pages/admin-seo/page.tsx').catch(() => '');
if (/google\.com\/ping\?sitemap=/i.test(adminSeoPage)) {
  addError('Admin SEO must not use the retired Google sitemap ping endpoint.');
}

const stickyBanner = await read('src/components/feature/StickyBanner.tsx').catch(() => '');
if (!stickyBanner.includes('/banners/winaz-top-20260722.gif')) {
  addError('Top banner asset is missing from StickyBanner.');
}
if (/setTimeout\([^)]*setImageReady|12_000/.test(stickyBanner)) {
  addError('Top banner must not be delayed long enough to appear removed.');
}
if (!stickyBanner.includes('aspect-[728/90]') || !stickyBanner.includes('WINAZ')) {
  addError('Top banner must reserve its layout space and show an immediate branded placeholder.');
}
const bannerDelay = stickyBanner.match(/setTimeout\(\(\) => setBannerReady\(true\),\s*([\d_]+)\)/)?.[1];
if (!bannerDelay || Number(bannerDelay.replaceAll('_', '')) > 3000) {
  addError('Top banner animation must load within three seconds after the page load event.');
}
if (!adminSeoPage.includes('gsc-seo-feedback')) {
  addError('Admin SEO is missing the automated Search Console feedback dashboard.');
}

const hotMoviesPage = await read('src/pages/hot-movies-2026/page.tsx').catch(() => '');
for (const requiredSnippet of ['fetchTrendingMovies', 'Cập nhật tự động', 'Đây không phải bảng xếp hạng quảng cáo']) {
  if (!hotMoviesPage.includes(requiredSnippet)) {
    addError(`The hot-movies page is missing its evidence-based contract: ${requiredSnippet}`);
  }
}
if (hotMoviesPage.includes("mocks/hotMovies2026") || hasMojibake(hotMoviesPage)) {
  addError('The hot-movies page must not use mock rankings or mojibake content.');
}

const actorListPage = await read('src/pages/actor/list-page.tsx').catch(() => '');
const actorDetailPage = await read('src/pages/actor/page.tsx').catch(() => '');
const blogDetailPage = await read('src/pages/blog/detail-page.tsx').catch(() => '');
for (const [file, source] of [
  ['src/pages/actor/list-page.tsx', actorListPage],
  ['src/pages/actor/page.tsx', actorDetailPage],
  ['src/pages/blog/detail-page.tsx', blogDetailPage],
]) {
  if (!source.includes('noIndex')) {
    addError(`${file} must remain noindex until its mock or unverified content is replaced.`);
  }
}
const edgeWorker = await read('functions/[[path]].js').catch(() => '');
for (const pattern of [String.raw`/^\/dien-vien(?:\/|$)/`, String.raw`/^\/blog\/[^/]+\/?$/`]) {
  if (!edgeWorker.includes(pattern)) {
    addError(`Googlebot noindex routing is missing: ${pattern}`);
  }
}

const gscFeedbackFunction = await read('supabase/functions/gsc-seo-feedback/index.ts').catch(() => '');
for (const requiredSnippet of ['searchAnalytics/query', 'urlInspection/index:inspect', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'strengthen_internal_links_and_content']) {
  if (!gscFeedbackFunction.includes(requiredSnippet)) {
    addError(`Search Console feedback function is missing: ${requiredSnippet}`);
  }
}

const gscMigration = await read('supabase/migrations/20260720033000_add_gsc_seo_feedback_loop.sql').catch(() => '');
for (const requiredSnippet of ['collect-gsc-seo-feedback-daily', 'cleanup-gsc-seo-history-weekly', 'seo_url_inspections']) {
  if (!gscMigration.includes(requiredSnippet)) {
    addError(`Search Console automation migration is missing: ${requiredSnippet}`);
  }
}

const webSubMigration = await read('supabase/migrations/20260719093000_schedule_movie_feed_websub.sql').catch(() => '');
if (webSubMigration.includes('SUPABASE_ANON_KEY')) {
  addError('Movie WebSub cron must use its internal cron secret without a nullable anon authorization header.');
}

const categoryPage = await read('src/pages/movie-list/page.tsx').catch(() => '');
const categorySeoContent = await read('src/pages/movie-list/components/CategorySEOContent.tsx').catch(() => '');
const countryPage = await read('src/pages/country/page.tsx').catch(() => '');
const countrySeoContent = await read('src/pages/country/components/CountrySEOContent.tsx').catch(() => '');
const homePage = await read('src/pages/home/page.tsx').catch(() => '');
const homeGenreSeo = await read('src/pages/home/components/GenreSEOSection.tsx').catch(() => '');
const homeAbout = await read('src/pages/home/components/AboutSection.tsx').catch(() => '');
const homeFaq = await read('src/pages/home/components/FAQSection.tsx').catch(() => '');
const newMoviesPage = await read('src/pages/new-movies/page.tsx').catch(() => '');
const animePage = await read('src/pages/anime/page.tsx').catch(() => '');
const horrorPage = await read('src/pages/phim-ma/page.tsx').catch(() => '');
const handsomePage = await read('src/pages/my-nam/page.tsx').catch(() => '');
const movieReview = await read('src/components/feature/MovieReview.tsx').catch(() => '');
for (const [file, source] of [
  ['src/pages/movie-list/components/CategorySEOContent.tsx', categorySeoContent],
  ['src/pages/country/components/CountrySEOContent.tsx', countrySeoContent],
  ['src/pages/home/page.tsx', homePage],
  ['src/pages/home/components/GenreSEOSection.tsx', homeGenreSeo],
  ['src/pages/home/components/AboutSection.tsx', homeAbout],
  ['src/pages/home/components/FAQSection.tsx', homeFaq],
  ['src/pages/new-movies/page.tsx', newMoviesPage],
  ['src/pages/anime/page.tsx', animePage],
  ['src/pages/phim-ma/page.tsx', horrorPage],
  ['src/pages/my-nam/page.tsx', handsomePage],
]) {
  if (/itemType="https:\/\/schema\.org\/Review"|reviewRating|Biên tập viên KhoPhim/.test(source)) {
    addError(`${file} must not publish unverified editorial reviews or ratings.`);
  }
  if (/\b(?:10[.,]000|12[.,]000|15[.,]000|20[.,]000|50[.,]000)\+?\b/.test(source)) {
    addError(`${file} must not publish hard-coded catalogue-size claims.`);
  }
  if (/không quảng cáo|lớn nhất Việt Nam|tốt nhất 2026/i.test(source)) {
    addError(`${file} must not publish unverifiable promotional claims.`);
  }
}
if (/aria-hidden="true"[\s\S]{0,500}(?:KhoPhim|xem phim)/i.test(homeGenreSeo)
  || /Google reads this|users don't notice/i.test(homeGenreSeo)) {
  addError('Homepage genre navigation must not contain hidden search-engine-only copy.');
}
if (/\bkeywords="[^"]{250,}"/i.test(homePage)) {
  addError('Homepage must not publish a long meta-keyword list that Google ignores.');
}
if (/reviewRating|itemType="https:\/\/schema\.org\/Rating"|ratingValue.*8/.test(movieReview)) {
  addError('Movie editorial content must not publish a fabricated fixed rating.');
}
if (!cloudflareFunction.includes("SEO_PRERENDER_VERSION = '20260820-cohort-parity-v24'")) {
  addError('SEO prerender cache must use the cohort parity release.');
}
if (!cloudflareFunction.includes("includes('noindex')) return;")) {
  addError('Transient noindex movie prerenders must never be stored in the shared edge cache.');
}
if (!cloudflareFunction.includes("if (ep === 'trailer' || ep.includes('trailer')) return true;")) {
  addError('An explicit trailer episode label must remain authoritative during movie lifecycle transitions.');
}
if (!cloudflareFunction.includes('function isHighValueIndexCandidate(movie)')
  || !cloudflareFunction.includes('Number(movie.seo_quality_score || 0) < 85')
  || !cloudflareFunction.includes('tmdbId <= 0')) {
  addError('Movie indexability must use the strict, identity-backed public cohort gate.');
}
if (!cloudflareFunction.includes("{ code: 'KKPHIM'")
  || !cloudflareFunction.includes("{ code: 'VSMOV'")
  || !cloudflareFunction.includes("{ code: 'NGUONC'")
  || !cloudflareFunction.includes('hasPlayableProviderDetail(normalizedPayload, slug)')
  || !cloudflareFunction.includes('provider identity contributes no score')) {
  addError('Provider-neutral detail fallback must preserve exact movie identity without secondary metadata overwrites.');
}
if (cloudflareFunction.includes('const isIndexableFallback = !qualityChecked')) {
  addError('Unverified fallback movie data must not bypass the public cohort gate.');
}
if (seoLandingUrls.some((entry) => entry.path === '/dien-vien')) {
  addError('The noindex actor directory must not be included in the indexable SEO sitemap.');
}
if (!categoryPage.includes("'@type': 'CollectionPage'") || !categoryPage.includes("'@type': 'ItemList'")) {
  addError('Movie category pages must retain CollectionPage and ItemList structured data.');
}
if (!countryPage.includes("'@type': 'CollectionPage'") || !countryPage.includes("'@type': 'ItemList'")) {
  addError('Country pages must retain CollectionPage and ItemList structured data.');
}

if (warnings.length > 0) {
  console.warn('SEO audit warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error('SEO audit failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`SEO audit passed. Checked ${seoLocs.length} SEO landing URLs and ${childSitemaps.length} sitemap entries.`);
