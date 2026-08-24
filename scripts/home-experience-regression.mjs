import { readFile } from 'node:fs/promises';

const home = await readFile('src/pages/home/page.tsx', 'utf8');
const hero = await readFile('src/pages/home/components/HeroBanner.tsx', 'utf8');
const trending = await readFile('src/pages/home/components/TrendingSection.tsx', 'utf8');
const lazySection = await readFile('src/pages/home/components/LazyMovieSection.tsx', 'utf8');
const proxy = await readFile('supabase/functions/home-proxy/index.ts', 'utf8');
const onlyflixSync = await readFile('supabase/functions/sync-onlyflix-feed/index.ts', 'utf8');
const movieApi = await readFile('src/services/movieApi.ts', 'utf8');
const searchSuggestions = await readFile('src/components/feature/SearchSuggestions.tsx', 'utf8');
const app = await readFile('src/App.tsx', 'utf8');
const main = await readFile('src/main.tsx', 'utf8');
const smartCache = await readFile('src/utils/smartCache.ts', 'utf8');
const discovery = await readFile('src/pages/home/components/HomeDiscoverySection.tsx', 'utf8');
const portalGateway = await readFile('src/pages/home/components/PortalGateway.tsx', 'utf8');
const movieSection = await readFile('src/pages/home/components/MovieSection.tsx', 'utf8');
const movieCard = await readFile('src/components/base/MovieCard.tsx', 'utf8');
const movieDetail = await readFile('src/pages/movie-detail/page.tsx', 'utf8');
const slugEncoder = await readFile('src/utils/slugEncoder.ts', 'utf8');
const top10 = await readFile('src/pages/home/components/Top10TodaySection.tsx', 'utf8');
const topCinema = await readFile('src/pages/home/components/TopCinemaMoviesSection.tsx', 'utf8');
const imagePreloader = await readFile('src/utils/imagePreloader.ts', 'utf8');
const viteConfig = await readFile('vite.config.ts', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const homeFallback = JSON.parse(await readFile('public/home-fallback.json', 'utf8'));
const stickyBanner = await readFile('src/components/feature/StickyBanner.tsx', 'utf8');
const navBanner = await readFile('src/components/feature/NavBanner.tsx', 'utf8');
const headers = await readFile('public/_headers', 'utf8');
const pagesWorker = await readFile('functions/[[path]].js', 'utf8');
const movieSchedule = await readFile('src/utils/movieSchedule.ts', 'utf8');
const failures = [];
if (
  !movieSchedule.includes("const text = String(value ?? '').trim()") ||
  !movieSchedule.includes("const current = String(movie.episode_current ?? '')")
) {
  failures.push('Runtime provider episode values must be normalized before schedule parsing.');
}
if (home.includes('<CatalogStatsSection />')) {
  failures.push('Homepage must not publish a fixed catalogue count that drifts from production data.');
}
if (
  stickyBanner.includes('sessionStorage') ||
  stickyBanner.includes('kp_sticky_banner_dismissed') ||
  !stickyBanner.includes('setVisible(true);') ||
  !stickyBanner.includes('[location.pathname]')
) {
  failures.push('WinAZ close state must reset on route navigation and must not persist for the browser session.');
}
if (stickyBanner.includes('wsrv.nl') || !stickyBanner.includes("const BANNER_IMAGE = '/banners/winaz-top-20260722.gif?v=20260722'")) {
  failures.push('The sticky WinAZ banner must load its original animated GIF, not a converted WebP.');
}
if (navBanner.includes('/cdn-cgi/image/') || !navBanner.includes("if (pathname.endsWith('.gif'))") || !navBanner.includes('restoreOriginalBanner')) {
  failures.push('Navigation GIF banners must avoid paid Cloudflare transformations and retain an original-GIF fallback.');
}

if (!movieApi.includes('large phimimg originals') || movieApi.includes('phimimg\\.com|icdn\\.darkbytes\\.xyz')) {
  failures.push('Large phimimg originals must use the shared resizing path instead of bypassing optimization.');
}
if (!movieApi.includes('unwrapCloudflareImageOrigin')) {
  failures.push('The shared image helper must recover an origin from an already-resized Cloudflare image URL.');
}
for (const [label, source] of [
  ['homepage quick cards', home],
  ['trending cards', trending],
  ['Top 10 cards', top10],
]) {
  if (/useImageFallback\(\s*getOptimizedImageUrl/s.test(source)) {
    failures.push(`${label} must pass raw provider URLs to the fallback hook instead of optimizing twice.`);
  }
}

if (home.includes('idleFallback') || !home.includes("window.addEventListener('pageshow', checkPosition)")) {
  failures.push('Deferred sections must use viewport checks without waking the whole page on an idle timer.');
}
if (!home.includes('Kho phim được đồng bộ và kiểm tra nguồn phát tự động')) {
  failures.push('Homepage is missing its live catalogue status affordance.');
}
if (/getViewerCount|\}\s*xem/.test(trending)) {
  failures.push('Trending UI must not show generated viewer counts as real analytics.');
}
if (!/getPortraitImagePaths\(movie\)[\s\S]*?posterPath,[\s\S]*?posterFallback,[\s\S]*?isImagePreloaded\(getPosterUrl\(posterPath \|\| ''\)\)[\s\S]*?\n\s*320,\s*\n\s*84,\s*\n\s*\{ preferredAspect: 'portrait' \},\s*\n\s*\);/.test(trending)) {
  failures.push('Trending posters must pass their measured image budget through the fallback hook.');
}
if (lazySection.includes('3200 + Math.min(sectionIndex, 8) * 120')) {
  failures.push('Lazy movie shelves must not all wake on a shared idle timer.');
}
if (!lazySection.includes('hasData || propLoading || fallbackAttempted')) {
  failures.push('Lazy shelves must wait for the parent request before loading the static fallback.');
}
if (!lazySection.includes('const sectionLoading = Boolean(propLoading) || fallbackLoading;')) {
  failures.push('Lazy shelves must preserve skeleton height until the parent request settles.');
}
if (!lazySection.includes('rect.top <= viewportH + marginPx') || lazySection.includes('rect.bottom >= -marginPx')) {
  failures.push('Progressive shelves must wake after fast scrolls without requiring current intersection.');
}
if (!lazySection.includes("window.addEventListener('online', retryWhenUsable)")) {
  failures.push('Lazy shelves must retry after a mobile network reconnects.');
}
if (!main.includes("new CustomEvent('kp:page-resumed')") || !lazySection.includes("window.addEventListener('kp:page-resumed'")) {
  failures.push('Mobile tab restore must wake deferred homepage shelves.');
}
if (!smartCache.includes("prefix: 'kp_home_proxy_', ttl: 30 * MINUTE")) {
  failures.push('Homepage warm cache must survive normal mobile app switching.');
}
if (!home.includes("window.matchMedia('(max-width: 639px)').matches ? MOBILE_HOME_SECTIONS : DESKTOP_HOME_SECTIONS")) {
  failures.push('Static homepage fallback must match the smaller mobile shelf contract.');
}
for (const [label, source] of [
  ['homepage fallback', home],
  ['lazy shelf fallback', lazySection],
]) {
  if (!source.includes('MAX_STATIC_HOME_FALLBACK_AGE_MS') || !source.includes("cache: 'no-store'")) {
    failures.push(`${label} must reject an old static snapshot and bypass the browser cache.`);
  }
}
for (const snippet of [
  'const upstreamPromise = fetchNewMoviesMultiSource(page);',
  'raceFirstValidWithTimeout<MovieListResponse>',
  '], 5_500);',
]) {
  if (!movieApi.includes(snippet)) {
    failures.push(`Fresh movie lists must not wait on a slow primary source: ${snippet}`);
  }
}
if (home.includes('fetchKey="onlyflix-moi"') || home.includes("'onlyflix-moi'")) {
  failures.push('Homepage must not restore the retired OnlyFlix premiere shelf.');
}
const trendingShelfIndex = home.indexOf('<TrendingSection movies={trendingMovies}');
const queerShelfIndex = home.indexOf('title="Phim Đam Mỹ Mới Nhất"');
if (trendingShelfIndex < 0 || queerShelfIndex <= trendingShelfIndex) {
  failures.push('The newest queer shelf must render after the new-and-hot shelf.');
}
for (const contract of [
  "fetchSection(supabase, 'phim-chieu-rap', false, limit, true)",
  "if (sourceSite === 'phimapi') return `https://phimimg.com/",
  "if (key !== 'phim-chieu-rap') return merged;",
]) {
  if (!proxy.includes(contract)) failures.push(`KKPhim cinema source contract is missing: ${contract}`);
}
for (const contract of [
  "const preferKkphim = type === 'phim-chieu-rap';",
  "{ url: `https://phimapi.com/v1/api/danh-sach/${type}?${q}`, site: 'phimapi', name: 'KKPhim' }",
  'normalizeListArtworkUrl(item.poster_url, cdnBase)',
]) {
  if (!movieApi.includes(contract)) failures.push(`Client cinema fallback contract is missing: ${contract}`);
}
if (!proxy.includes("requestedSections.includes('onlyflix-moi')") || !proxy.includes("sectionPromises['onlyflix-moi'] = fetchOnlyflixTrendingMovies")) {
  failures.push('Home proxy is missing the OnlyFlix-only cinema section contract.');
}
for (const snippet of [
  '.limit(8)',
  '.find((value): value is Record<string, unknown>[] => Array.isArray(value) && value.length > 0)',
  "readStaticHomeFallback(['onlyflix-moi'])",
]) {
  if (!proxy.includes(snippet)) {
    failures.push(`OnlyFlix cinema home data must retain the latest non-empty successful rail: ${snippet}`);
  }
}
for (const snippet of [
  'const preferredPeriods = [...new Set([',
  'Array.isArray(candidate.rows) && candidate.rows.length > 0',
  "throw new Error('OnlyFlix Trending Movies has no published rows')",
]) {
  if (!onlyflixSync.includes(snippet)) {
    failures.push(`OnlyFlix cinema sync must not replace its rail with an empty default period: ${snippet}`);
  }
}
if (!proxy.includes('.abortSignal(timeoutSignal(3000))')) {
  failures.push('Homepage cache writes need enough time to persist the full section snapshot.');
}
if (discovery.includes("icon: 'ri-") || portalGateway.includes('ri-movie-2-line') || portalGateway.includes('ri-heart-3-line')) {
  failures.push('Primary mobile portal icons must not depend on the external icon font.');
}
if (movieSection.includes('relative hidden h-9 w-9') || !movieSection.includes('type LucideIcon')) {
  failures.push('Movie shelf icons must be local and visible on mobile.');
}
const listSelect = movieApi.match(/const SUPABASE_LIST_SELECT = '([^']+)'/)?.[1] ?? '';
if (!listSelect || listSelect.split(/,\s*/).includes('chieurap')) {
  failures.push('Supabase list select must match production schema and must not request the removed chieurap column.');
}
for (const compatibilitySnippet of [
  'SUPABASE_LIST_CORE_SELECT',
  'supabaseListUsesCoreContract',
  "response?.error?.code === '42703'",
  'response = await runQuery(true)',
]) {
  if (!movieApi.includes(compatibilitySnippet)) {
    failures.push(`Frontend schema compatibility layer is missing: ${compatibilitySnippet}`);
  }
}
if (!movieApi.includes("if (params.type === 'phim-chieu-rap') return null;")) {
  failures.push('Cinema lists must bypass the missing Supabase chieurap filter.');
}
if (!searchSuggestions.includes('applyImageElementFallback(event.currentTarget)')) {
  failures.push('Search suggestion posters must use the shared image fallback.');
}
if (!movieApi.includes("newMoviesEndpoint: '/danh-sach/phim-moi-cap-nhat'")) {
  failures.push('KKPhim latest-feed fallback must use its live non-v1 endpoint.');
}
if (!proxy.includes("fetchExternal('/danh-sach/phim-moi-cap-nhat")) {
  failures.push('Home proxy must use the live KKPhim latest-feed endpoint.');
}
if (app.includes('warmPlayerSourceHealth')) {
  failures.push('Player source-health warming must not consume homepage bandwidth.');
}
for (const country of ['han-quoc', 'au-my', 'trung-quoc', 'thai-lan']) {
  if (!home.includes(`fetchKey="${country}" limit={compactMobile ? 9 : 18}`)) {
    failures.push(`Mobile homepage is missing the progressive ${country} shelf.`);
  }
}
for (const snippet of ['tmdb_popularity', 'Math.log1p(popularity)', 'buildTrending(supabase, limit)']) {
  if (!proxy.includes(snippet)) failures.push(`Smart trending proxy is missing: ${snippet}`);
}
for (const snippet of [
  'fetchFreshEpisodeMovies(supabase, limit * 2)',
  'last_episode_change_at',
  'freshFirstViewport',
  'mergeTrendingWithSourceDiversity',
]) {
  if (!proxy.includes(snippet)) failures.push(`Freshness-aware homepage brain is missing: ${snippet}`);
}
if (/freshSections\.trending\s*=\s*mergeSectionWithPriority\(\s*playableCobephimMovies/.test(proxy)) {
  failures.push('A supplemental player source must not take over the first homepage trending positions.');
}
if (!trending.includes('Mới cập nhật &amp; đang hot') || !trending.includes('Tập mới trước, phim nổi bật tiếp theo')) {
  failures.push('Trending shelf must accurately explain its freshness-first ranking.');
}
for (const snippet of [
  "sectionPromises['top10-single'] = buildTop10Singles",
  "sectionPromises['top10-series'] = buildTop10Series",
  "movie_seo_quality_status",
  "isAdultTop10Candidate",
  "enforcePlayableGate",
  "top10CountryKey",
  "top10FranchiseKey",
]) {
  if (!proxy.includes(snippet)) failures.push(`Independent Top 10 brain is missing: ${snippet}`);
}
if (!home.includes("'top10-single'") || !home.includes("'top10-series'")
  || !home.includes("...(homeData['top10-single'] ?? [])")
  || !home.includes("...(homeData['top10-series'] ?? [])")) {
  failures.push('Homepage must request independent Top 10 single and series sections with compatibility fallbacks.');
}
for (const contract of [
  "'vsmov-4k'",
  "homeData['vsmov-4k']",
  'Phim 4K Siêu Nét',
  'viewAllLink="/phim-4k"',
]) {
  if (!home.includes(contract)) failures.push(`Homepage 4K shelf is missing: ${contract}`);
}
for (const contract of [
  "const VSMOV_4K_URL = 'https://vsmov.com/api/danh-sach/4k?page=1'",
  "sectionPromises['vsmov-4k'] = fetchVsmov4KMovies",
  "quality: '4K'",
  ".in('tmdb_id', chunk)",
  'filterQuarantinedExactMovies',
  'Object.values(freshSections).flat()',
  'publicFreshSlugs',
  'storedMovieIds',
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}',
  'stableSectionFallback',
  'const [singaporeItems, kkphimPayload] = await Promise.all',
  "freshSections['top10-single'] = mergeSectionWithPriority",
  "freshSections['top10-series'] = mergeSectionWithPriority",
]) {
  if (!proxy.includes(contract)) failures.push(`VSMov 4K feed contract is missing: ${contract}`);
}
for (const [ok, message] of [
  [movieCard.includes("preferredSource || 'vsmov'") && movieCard.includes("isVsmovFourK ? '4k'"), 'A VSMov 4K card must preserve its source/quality intent'],
  [slugEncoder.includes("params.set('source'") && slugEncoder.includes("params.set('quality'"), 'Movie detail URLs must carry playback preferences'],
  [movieDetail.includes('withPlaybackPreference') && movieDetail.includes("preferredSource === 'vsmov'"), 'Detail/watch navigation must preserve the 4K preference'],
  [movieApi.includes('_preferredProvider?: string') && movieApi.includes('const rankedCandidates = candidates;'), 'Playback ranking must treat a requested source as identity metadata, not priority'],
]) {
  if (!ok) failures.push(message);
}
if (
  !top10.includes('Top 10 Phim Lẻ Hay Nhức Nách') ||
  !top10.includes('Top 10 Phim Bộ Hôm Nay') ||
  !top10.includes('TỰ ĐỘNG')
) {
  failures.push('Top 10 UI must explain its automated watch-worthy ranking.');
}
if (!top10.includes('w-[292px]') || top10.includes('className={`${HOME_POSTER_ITEM_CLASS} group cursor-pointer`}')) {
  failures.push('Mobile Top 10 must use readable landscape cards instead of narrow poster-only cards.');
}
if (!/getPortraitImagePaths\(movie\)[\s\S]*?portraitPath,[\s\S]*?portraitFallback,[\s\S]*?isImagePreloaded\(getImageUrl\(portraitPath \|\| ''\)\)[\s\S]*?\n\s*480,\s*\n\s*86,\s*\n\s*\{ preferredAspect: 'portrait' \},\s*\n\s*\);/.test(topCinema)) {
  failures.push('Cinema posters must use the provider-aware portrait artwork at a sharp card-size budget.');
}
if (!String(packageJson.scripts?.prebuild || '').includes('refresh-home-fallback.mjs')) {
  failures.push('Production builds must refresh the static homepage fallback before packaging.');
}
for (const section of ['vsmov-4k', 'trending', 'top10-single', 'top10-series', 'phim-chieu-rap', 'phim-le', 'phim-bo', 'hoat-hinh']) {
  if (!Array.isArray(homeFallback.sections?.[section]) || homeFallback.sections[section].length < 6) {
    failures.push(`Static homepage fallback is missing a usable ${section} section.`);
  }
}
if (/Ã|Ä|áº|á»/.test(JSON.stringify(homeFallback))) {
  failures.push('Static homepage fallback contains mojibake and would corrupt Vietnamese titles offline.');
}
if (viteConfig.includes('homeHeroPreloadPlugin')) {
  failures.push('A SPA-wide build-time homepage preload must not waste bandwidth on detail/watch routes.');
}
if (!imagePreloader.includes("link.setAttribute('fetchpriority', 'high')")) {
  failures.push('The runtime homepage LCP preload must use high fetch priority.');
}
for (const snippet of [
  'The large hero is a landscape-only surface',
  'if (ratio < 1.2)',
  'tryNextLandscapeSource',
  'active.hero_backdrop_url',
  'active.hero_poster_url',
  'getOptimizedImageFallbacks',
  'failedHeroIds',
  'onUnavailable',
]) {
  if (!hero.includes(snippet)) {
    failures.push(`Homepage hero is missing its portrait-safe image contract: ${snippet}.`);
  }
}
if ((hero.match(/backgroundQuality,\s*\n\s*false,/g) ?? []).length < 2) {
  failures.push('Hero landscape candidates must not retry the same portrait at its multi-megabyte original size.');
}
for (const snippet of [
  "useMediaQuery('(min-width: 768px)')",
  "useMediaQuery('(min-width: 1024px)')",
  'showDesktopThumbnails &&',
  'showDesktopPoster &&',
]) {
  if (!hero.includes(snippet)) {
    failures.push(`Mobile hero still renders a hidden desktop image surface: ${snippet}.`);
  }
}
for (const route of ['/', '/index.html', '/phim/*', '/xem-phim/*']) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = headers.match(new RegExp(`(?:^|\\n)${escaped}\\r?\\n\\s+Cache-Control:\\s*([^\\r\\n]+)`))?.[1] ?? '';
  if (!/no-store/.test(rule) || /stale-while-revalidate|s-maxage=[1-9]/.test(rule)) {
    failures.push(`HTML route ${route} can serve a stale build that references deleted JavaScript chunks.`);
  }
}
if (
  !pagesWorker.includes("headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');") ||
  /text\\\/html[\s\S]{0,500}stale-while-revalidate/.test(pagesWorker)
) {
  failures.push('The Pages worker can override safe HTML headers with a stale build cache.');
}
for (const snippet of [
  'fetchVerifiedTmdbHeroArtwork',
  'enrichTrendingHeroArtwork',
  "select('slug,hero_backdrop_url,hero_poster_url')",
  'verifiedBySlug',
  'hero_backdrop_url',
  'hero_poster_url',
  'Math.abs(expectedYear - candidateYear) <= 1',
  'hero_backdrop_url: ov.hero_backdrop_url || item.hero_backdrop_url',
  'hero_poster_url: ov.hero_poster_url || item.hero_poster_url',
]) {
  if (!proxy.includes(snippet)) {
    failures.push(`Homepage data brain is missing dedicated TMDB hero artwork: ${snippet}.`);
  }
}
for (const snippet of [
  'hero_backdrop_url: String(m.hero_backdrop_url',
  'hero_poster_url: String(m.hero_poster_url',
]) {
  if (!movieApi.includes(snippet)) {
    failures.push(`Homepage response parser drops dedicated hero artwork: ${snippet}.`);
  }
}

if (failures.length) {
  console.error('Home experience regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Home experience regression passed.');
