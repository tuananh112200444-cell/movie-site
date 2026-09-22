import { readFile } from 'node:fs/promises';

const home = await readFile('src/pages/home/page.tsx', 'utf8');
const hero = await readFile('src/pages/home/components/HeroBanner.tsx', 'utf8');
const editorialHero = await readFile('src/pages/home/components/EditorialHero.tsx', 'utf8');
const trending = await readFile('src/pages/home/components/TrendingSection.tsx', 'utf8');
const dailyUpdate = await readFile('src/pages/home/components/DailyUpdateDemoSection.tsx', 'utf8');
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
const topRated = await readFile('src/pages/home/components/TopRatedSection.tsx', 'utf8');
const vietnamSection = await readFile('src/pages/home/components/TopCinemaMoviesSection.tsx', 'utf8');
const trailerSection = await readFile('src/pages/home/components/TrailerMoviesSection.tsx', 'utf8');
const mobileSwipeHint = await readFile('src/pages/home/components/MobileSwipeHint.tsx', 'utf8');
const globalCss = await readFile('src/index.css', 'utf8');
const imagePreloader = await readFile('src/utils/imagePreloader.ts', 'utf8');
const viteConfig = await readFile('vite.config.ts', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const homeFallback = JSON.parse(await readFile('public/home-fallback.json', 'utf8'));
const topRatedFallback = JSON.parse(await readFile('public/top-rated-fallback.json', 'utf8'));
const queerFallback = JSON.parse(await readFile('public/queer-fallback.json', 'utf8'));
const stickyBanner = await readFile('src/components/feature/StickyBanner.tsx', 'utf8');
const navBanner = await readFile('src/components/feature/NavBanner.tsx', 'utf8');
const headers = await readFile('public/_headers', 'utf8');
const pagesWorker = await readFile('functions/[[path]].js', 'utf8');
const pagesFallbackGenerator = await readFile('scripts/generate-pages-api-fallbacks.mjs', 'utf8');
const homeFallbackGenerator = await readFile('scripts/refresh-home-fallback.mjs', 'utf8');
const movieSchedule = await readFile('src/utils/movieSchedule.ts', 'utf8');
const top10Migration = await readFile('supabase/migrations/20260829110000_add_first_party_top10_today.sql', 'utf8');
const watchAnalytics = await readFile('src/services/movieWatchAnalytics.ts', 'utf8');
const playerBox = await readFile('src/pages/movie-detail/components/PlayerBox.tsx', 'utf8');
const hlsPlayer = await readFile('src/pages/movie-detail/components/LightweightHlsPlayer.tsx', 'utf8');
const failures = [];
const queerFallbackMovies = queerFallback.sections?.newUpdates ?? [];
if (queerFallbackMovies.length < 24 || queerFallbackMovies.some((movie) => !/blvietsub|glvietsub|admin-queer/i.test(`${movie.source_site || ''} ${movie.source_name || ''}`))) {
  failures.push('The deployed queer fallback must contain at least 24 source-pure BL/GL movies.');
}
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

if (!movieApi.includes('wsrv explicitly blocks through the proxy') || !movieApi.includes('phimimg\\.com|icdn\\.darkbytes\\.xyz')) {
  failures.push('A wsrv-blocked phimimg origin must load directly without a guaranteed failed proxy request.');
}
if (!movieApi.includes('&default=1')) {
  failures.push('Free wsrv transformations must redirect to the original image when a provider becomes blocked.');
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
if (home.includes('Kho phim được đồng bộ và kiểm tra nguồn phát tự động')) {
  failures.push('Homepage must not restore the removed catalogue status sentence between sections.');
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
  if (!source.includes('MAX_STATIC_HOME_FALLBACK_AGE_MS') || !source.includes("cache: 'default'")) {
    failures.push(`${label} must reject an old snapshot while reusing the HTML preload on cold visits.`);
  }
}
if (!home.includes('14 * 24 * 60 * 60 * 1000') || !home.includes('function selectHeroMovies')) {
  failures.push('Homepage must retain a last-known-good hero throughout a multi-day upstream outage.');
}
for (const contract of [
  'function readBootHeroMovies',
  "document.getElementById('kp-home-hero-bootstrap')",
  'return bootHero.length > 0 ? bootHero : warmHero',
  'setHeroMovies((current) => current.length > 0 ? current : nextHeroMovies)',
  'deferredContentReady',
  'onReady={handleHeroReady}',
  'if (!heroReady) return;',
  'setHeroMovies(liveRecommendations)',
]) {
  if (!home.includes(contract)) failures.push(`Homepage first-paint stability contract is missing: ${contract}`);
}
for (const contract of [
  'const HERO_MOVIE_LIMIT = 8',
  'function selectHeroMovies',
  "sections['phim-chieu-rap']",
  '.slice(0, HERO_MOVIE_LIMIT)',
]) {
  if (!home.includes(contract)) failures.push(`Homepage cinema hero contract is missing: ${contract}`);
}
if (!home.includes("const ALL_SECTIONS = ['top-rated'") || !home.includes("const MOBILE_HOME_SECTIONS = [\n  'top-rated'")) {
  failures.push('Desktop and mobile homepage requests must include the dedicated top-rated rail.');
}
for (const contract of [
  'aria-label="8 phim đang chiếu rạp"',
  '<span>Đang chiếu rạp</span>',
  'editorial-hero-thumbnails',
]) {
  if (!editorialHero.includes(contract)) failures.push(`Editorial hero cinema context is missing: ${contract}`);
}
if (!editorialHero.includes('onReady?: () => void') || !editorialHero.includes('onReady?.();')) {
  failures.push('Editorial hero must release below-fold rendering only after its image is ready.');
}
for (const contract of [
  'editorial-hero-slide${active',
  'requestedIndexes',
  'settledIndexes',
  'pendingIndexRef',
  'onTouchStart={handleTouchStart}',
]) {
  if (!editorialHero.includes(contract)) failures.push(`Editorial hero crossfade controller is missing: ${contract}`);
}
if (!editorialHero.includes('new Set([0])')
  || !editorialHero.includes('connection?.saveData')
  || editorialHero.includes('new Set(Array.from({ length: featured.length }')) {
  failures.push('Editorial hero must not eagerly download all five full-size slides.');
}
if (!movieApi.includes('https://i0.wp.com/')
  || !movieApi.includes('getPhotonImageUrl(original, safeWidth, safeQuality)')
  || !movieApi.includes("requestedWidth <= 185")) {
  failures.push('Image helper must resize phimimg and small TMDB artwork instead of downloading oversized originals.');
}
for (const contract of [
  'transition: opacity 1200ms ease-in-out',
  'transition: transform 1800ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  'transform: translateX(4%) scale(1.03)',
  '.editorial-hero-slide.is-active',
]) {
  if (!globalCss.includes(contract)) failures.push(`Editorial hero cinematic transition is missing: ${contract}`);
}
for (const contract of [
  'fetchTopRatedHomeMovies',
  ".gte('tmdb_vote_count', 10)",
  "sectionPromises['top-rated']",
  "if (key === 'top-rated') return 5",
  'tmdb_vote_average: Number(m.tmdb_vote_average',
]) {
  if (!proxy.includes(contract)) failures.push(`Top-rated home data contract is missing: ${contract}`);
}
if (!homeFallbackGenerator.includes('TOP_RATED_OUTPUT_URL')) {
  failures.push('The dedicated top-rated rail must retain its generated fallback.');
}
const topRatedMovies = topRatedFallback.movies ?? [];
if (topRatedMovies.length !== 5
  || topRatedMovies.some((movie) => Number(movie.tmdb_vote_average || 0) <= 0 || Number(movie.tmdb_vote_count || 0) < 10)
  || topRatedMovies.some((movie) => /ophim|opstream|tmdb.?catalog/i.test(`${movie.source_site || ''} ${movie.source_name || ''}`))
  || topRatedMovies.some((movie) => movie.slug === 'among-us-2026')
  || topRatedMovies.some((movie, index) => index > 0 && Number(movie.tmdb_vote_average || 0) > Number(topRatedMovies[index - 1].tmdb_vote_average || 0))) {
  failures.push('Top-rated fallback must contain exactly five source-verified movies ordered by TMDb rating.');
}
if (!viteConfig.includes("snapshot.sections?.['phim-chieu-rap']") || !viteConfig.includes('.slice(0, 8)')) {
  failures.push('Homepage hero bootstrap must use the first eight cinema-shelf movies.');
}
for (const contract of [
  'function getResponsiveHeroImage',
  'hero_poster_url',
  'hero_backdrop_url',
  'https://i0.wp.com/',
  '[...optimized, ...originals]',
]) {
  if (!editorialHero.includes(contract)) failures.push(`Editorial hero responsive-image fallback is missing: ${contract}`);
}
for (const contract of [
  'function injectHomeHeroBootstrap',
  'function getHomeHeroPreloadUrl',
  'first.hero_poster_url',
  'first.hero_backdrop_url',
  'data-kp-home-hero-preload="mobile"',
  'data-kp-home-hero-preload="desktop"',
  'id="kp-home-hero-bootstrap"',
]) {
  if (!viteConfig.includes(contract)) failures.push(`Build-time LCP discovery contract is missing: ${contract}`);
}
if (!main.includes('if (import.meta.env.DEV)') || !main.includes("import('./utils/performance')")) {
  failures.push('Production visitors must not download the development-only CWV observer chunk.');
}
if (!pagesWorker.includes("source: 'static-fallback'") || !pagesWorker.includes("X-KhoPhim-Home-Cache': 'STATIC-FALLBACK")) {
  failures.push('Same-origin homepage API must serve the deployed snapshot instead of a 503 during an upstream outage.');
}
if (
  movieApi.includes('phimimg\\.com|img\\.ophim\\.live|img\\.ophimimg\\.com') ||
  !movieApi.includes('pushUrl(FALLBACK_IMG);')
) {
  failures.push('Unblocked catalogue images must keep free resizing while retaining origin and local fallbacks.');
}
if (!lazySection.includes('h-24 rounded-xl') || lazySection.includes('grid grid-cols-3 gap-x-2 gap-y-4 pb-3 md:hidden')) {
  failures.push('Deferred mobile shelves must use one lightweight placeholder instead of six poster skeletons.');
}
for (const contract of [
  'function hasCanonicalMovieIdentity',
  'function isCanonicalPublicMovie',
  'function isQueerUniverseMovie',
  "key !== 'queer' || isQueerUniverseMovie",
  "key === 'queer'",
  '.filter((movie) => isCanonicalPublicMovie',
  'const playableFreshSections = await enrichWithPlayableEpisodeCounts',
  ".gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())",
  "...((newFeed.data ?? []) as Array<{ item?: Record<string, unknown> }>),",
]) {
  if (!proxy.includes(contract)) failures.push(`Homepage canonical publication gate is missing: ${contract}`);
}
if (!pagesWorker.includes('function isQueerHomeItem') || !pagesWorker.includes("key === 'queer' && !isQueerHomeItem(item)")) {
  failures.push('Cloudflare must reject non-BL/GL cards from the queer section before caching or fallback repair.');
}
if (!proxy.includes('function isFreshHomepageCandidate') || !proxy.includes("key !== 'trending' || isFreshHomepageCandidate")) {
  failures.push('Homepage trending must reject old catalogue imports unless they are genuinely ongoing recent releases.');
}
if (!pagesWorker.includes('function isFreshEdgeHomeItem') || !pagesWorker.includes("key === 'trending' && !isFreshEdgeHomeItem(item)")) {
  failures.push('Cloudflare must reject old catalogue imports from the trending cache.');
}
if (!trending.includes('function factualUpdateLabel') || !trending.includes("return 'Mới thêm'")) {
  failures.push('Trending cards must distinguish a newly imported movie from a real episode update.');
}
if (!movieApi.includes('/vsmov\\.com/i.test(`${thumb} ${poster}`)') || !movieApi.includes('/\\/thumb_/i.test(poster)')) {
  failures.push('VSMOV portrait and landscape artwork roles must be normalized before rendering cards.');
}
if (!movieApi.includes('?? m.last_episode_change_at') || movieApi.includes("m.modified as { time?: string } | undefined)?.time ?? new Date().toISOString()")) {
  failures.push('Homepage parsing must never manufacture a current timestamp for movies without a semantic freshness clock.');
}
if (!movieApi.includes('liveQueer.length >= 5') || !movieApi.includes('buildSections([...liveQueer, ...fallbackMovies])')) {
  failures.push('The queer portal must merge its pure static fallback when the live BL/GL rail is sparse.');
}
if (!movieApi.includes("sections.includes('queer') && candidateQueer.length < 5")) {
  failures.push('An empty same-origin queer rail must fall through to the canonical Supabase BL/GL endpoint.');
}
if (!movieApi.includes("sections.includes('trending') && candidateTrending.length < 12")) {
  failures.push('A sparse edge trending rail must fall through to the canonical 18-movie Supabase feed.');
}
if (!home.includes('buildPersonalizedHomeMovies') || !home.includes('title="Dành Cho Bạn"') || !home.includes('useWatchHistory()')) {
  failures.push('Homepage must build private on-device recommendations from watch history.');
}
const homeReader = movieApi.slice(movieApi.indexOf('async function fetchHomePageDataUncached'));
if (!homeReader.includes("new URL('/api/home', window.location.origin)") || homeReader.indexOf("new URL('/api/home', window.location.origin)") > homeReader.indexOf("new URL(`${SUPABASE_URL}/functions/v1/home-proxy`)")) {
  failures.push('Homepage must prefer the same-origin Cloudflare cache before the Supabase fallback.');
}
for (const snippet of [
  ".rpc('get_stable_catalog_feed'",
  "export type StableCatalogFeedMode = 'new' | 'episode_updates'",
  "const sortColumn = mode === 'episode_updates' ? 'last_episode_change_at' : 'created_at';",
]) {
  if (!movieApi.includes(snippet)) {
    failures.push(`Fresh movie lists must use stable canonical feed clocks: ${snippet}`);
  }
}
if (home.includes('fetchKey="onlyflix-moi"') || home.includes("'onlyflix-moi'")) {
  failures.push('Homepage must not restore the retired OnlyFlix premiere shelf.');
}
const dailyUpdateShelfIndex = home.indexOf('<DailyUpdateDemoSection movies={dailyUpdateMovies}');
const top10ShelfIndex = home.indexOf('title="Top 10 Phim Hôm Nay"');
const queerShelfIndex = home.indexOf('title="Phim GL / Bách Hợp Mới Nhất"');
if (dailyUpdateShelfIndex < 0 || top10ShelfIndex < 0 || queerShelfIndex <= top10ShelfIndex) {
  failures.push('The daily update shelf must replace new-and-hot, with the queer shelf immediately after Top 10.');
}
for (const contract of [
  "fetchSection(supabase, 'phim-chieu-rap', false, limit, false)",
  "if (sourceSite === 'phimapi') return `https://phimimg.com/",
  "if (key !== 'phim-chieu-rap') return merged;",
  "query = query.eq('chieurap', true)",
  "key !== 'phim-chieu-rap' || (movie as Record<string, unknown>).chieurap === true",
  "candidates = pool.filter((movie) => movie.chieurap === true)",
]) {
  if (!proxy.includes(contract)) failures.push(`KKPhim cinema source contract is missing: ${contract}`);
}
for (const contract of [
  'v9-vsmov-only-4k',
  'function filterEdgeHomeSection',
  "key === 'phim-chieu-rap' && item.chieurap !== true",
  'X-KhoPhim-Home-Repair',
  'function verifiedCinemaMovieListResponse',
  "source: 'verified-cinema-snapshot'",
  'v3-verified-cinema',
  'KKPHIM_CINEMA_HOT_URL',
  "pathname === '/api/kkphim-cinema-hot'",
  "source: 'kkphim-live'",
  'KKPHIM_VIETNAM_LATEST_URL',
  'normalizeKkphimVietnamItems',
  "pathname === '/api/kkphim-vietnam-latest'",
  "source: 'kkphim-live-vietnam'",
  "source: 'kkphim-static-vietnam-fallback'",
  "context.env?.ASSETS?.fetch(assetRequest)",
]) {
  if (!pagesWorker.includes(contract)) failures.push(`Cloudflare home section repair contract is missing: ${contract}`);
}
for (const contract of [
  'KKPHIM_CINEMA_URL',
  'fetchCurrentCinemaItems',
  'KKPHIM_VIETNAM_URL',
  'fetchCurrentVietnamItems',
  "'kkphim-live-build-fallback'",
  "'phim-chieu-rap': cinemaItems",
  "'viet-nam': vietnamItems",
  "new URL('kkphim-vietnam-latest', apiDirectory)",
]) {
  if (!pagesFallbackGenerator.includes(contract)) failures.push(`Static KKPhim fallback refresh contract is missing: ${contract}`);
}
if (!vietnamSection.includes('normalizeVietnamMovies')
  || !vietnamSection.includes('Phim Việt Nam Mới Cập Nhật')
  || !vietnamSection.includes('rank={index + 1}')
  || !vietnamSection.includes("fetch('/api/kkphim-vietnam-latest'")
  || !vietnamSection.includes("fetch('/home-fallback.json'")
  || !vietnamSection.includes("fallback.sections?.['viet-nam']")
  || !vietnamSection.includes('fallbackMovies = EMPTY_VIETNAM_MOVIES')
  || !home.includes('<VietnamMoviesSection />')
  || !vietnamSection.includes('dữ liệu trực tiếp từ KKPhim')
  || vietnamSection.includes('getViewerCount(')
  || vietnamSection.includes('Math.random()')
  || vietnamSection.includes('K xem')) {
  failures.push('Vietnam UI must show the direct KKPhim Vietnam shelf without fabricated popularity data.');
}
if (!home.includes("'trending', 'phim-chieu-rap', 'phim-le'") || !home.includes("'trending', 'phim-chieu-rap', 'phim-le', 'phim-bo'")) {
  failures.push('Desktop and mobile homepage payloads must retain the cinema fallback rail.');
}
if (!home.includes('title="Phim Đang Chiếu Rạp"')
  || !home.includes('number="01" code="NOW SCREENING"')
  || !home.includes('number="VN" code="VIETNAM FRESH"')
  || home.includes('Phim Chiếu Rạp Đang Hot')
  || home.includes('number="HOT" code="BIG SCREEN"')
  || home.includes('<TopCinemaMoviesSection')) {
  failures.push('Homepage must retain the standard cinema shelf and replace only the hot-cinema shelf with Vietnam updates.');
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
if (!proxy.includes('.abortSignal(timeoutSignal(6000))')) {
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
if (/!compactMobile\s*&&\s*<>\s*\n\s*<EditorialSectionFrame number="10"/.test(home)) {
  failures.push('Country movie shelves must not be hidden on phone-sized screens.');
}
for (const country of ['au-my', 'trung-quoc', 'han-quoc', 'thai-lan']) {
  const mobileContract = home.slice(home.indexOf('const MOBILE_HOME_SECTIONS'), home.indexOf('const HOME_CACHE_KEY'));
  if (!mobileContract.includes(`'${country}'`)) {
    failures.push(`The mobile home package must include the ${country} shelf so it cannot stall on a fallback skeleton.`);
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
if (!mobileSwipeHint.includes('Vuốt ngang để xem thêm phim') || !mobileSwipeHint.includes('ChevronsRight')) {
  failures.push('Mobile movie rails must retain a clear swipe affordance.');
}
if (!vietnamSection.includes('kp-vietnam-grid') || !vietnamSection.includes('Xem thêm ${Math.min(3, movies.length - 6)} phim Việt')) {
  failures.push('Vietnam mobile shelf must show six compact posters with an explicit way to reveal more.');
}
for (const [label, source] of [
  ['vietnam', vietnamSection],
  ['trending', trending],
]) {
  if (label === 'trending' && (!source.includes('<MobileSwipeHint visible={canScrollRight} />') || !source.includes('vuốt ngang để xem thêm'))) {
    failures.push(`${label} mobile rail must explain that more movies are available horizontally.`);
  }
  if (!source.includes("addEventListener('scroll'") || !source.includes('ResizeObserver')) {
    failures.push(`${label} mobile swipe hint must react to the rail position and size.`);
  }
}
for (const [label, source] of [['vietnam', vietnamSection], ['trending', trending]]) {
  if (!source.includes('scrollFrameRef') || !source.includes('window.requestAnimationFrame')) {
    failures.push(`${label} rail must batch layout reads into an animation frame.`);
  }
}
if (!/\.home-poster-item\s*\{[\s\S]*?flex:\s*0 0 45\.5%;[\s\S]*?width:\s*45\.5%;/.test(globalCss)) {
  failures.push('Phone poster rails must reveal part of the next card as a horizontal-scroll cue.');
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
if (!home.includes('fetchTop10TodayMovies')
  || !home.includes('rankedTop10Movies')
  || home.includes("...(homeData['top10-single'] ?? [])")
  || home.includes("...(homeData['top10-series'] ?? [])")) {
  failures.push('Homepage must use one combined first-party Top 10 instead of concatenating separate single/series rails.');
}
for (const snippet of [
  'create table if not exists public.movie_watch_sessions',
  'record_movie_watch',
  'get_top10_movies_today',
  'count(distinct s.session_id)',
  "timezone('Asia/Ho_Chi_Minh', now())",
  "'first_party_views'",
  "'tmdb_fallback'",
  '55 *',
  '+ 20 *',
  '+ 15 *',
  '+ 7 *',
  '+ 3 *',
  'type_rank <= 6',
]) {
  if (!top10Migration.includes(snippet)) failures.push(`First-party daily Top 10 contract is missing: ${snippet}`);
}
if (!watchAnalytics.includes('MIN_STABLE_WATCH_SECONDS = 30')
  || !watchAnalytics.includes("window.sessionStorage.getItem(WATCH_SESSION_KEY)")
  || !watchAnalytics.includes("supabase.rpc('record_movie_watch'")
  || !playerBox.includes('recordMovieWatchProgress(movieSlug')
  || !hlsPlayer.includes('STABLE_PLAYBACK_SECONDS = 30')) {
  failures.push('Player must record a non-blocking anonymous view only after 30 seconds of engaged playback.');
}
if (top10Migration.includes('ip_address') || top10Migration.includes('user_agent')) {
  failures.push('Daily Top 10 must not store IP addresses or user-agent fingerprints.');
}
for (const contract of [
  "'vsmov-4k'",
  "homeData['vsmov-4k']",
  'Phim 4K Siêu Nét',
  'viewAllLink="/phim-4k"',
]) {
  if (!home.includes(contract)) failures.push(`Homepage 4K shelf is missing: ${contract}`);
}
const fourKShelfStart = home.indexOf('fetchKey="vsmov-4k"');
const fourKShelfEnd = home.indexOf('</EditorialSectionFrame>', fourKShelfStart);
const fourKShelf = fourKShelfStart >= 0 && fourKShelfEnd > fourKShelfStart
  ? home.slice(fourKShelfStart, fourKShelfEnd)
  : '';
if (!fourKShelf.includes('sectionIndex={3}') || !fourKShelf.includes('limit={compactMobile ? 9 : 12}') || !fourKShelf.includes('mobileLayout="rail"') || fourKShelf.includes('eager')) {
  failures.push('The offscreen 4K shelf must keep its content while mounting progressively near the viewport.');
}
const animeShelfStart = home.indexOf('fetchKey="hoat-hinh"');
const animeShelfEnd = home.indexOf('</EditorialSectionFrame>', animeShelfStart);
const animeShelf = animeShelfStart >= 0 && animeShelfEnd > animeShelfStart
  ? home.slice(animeShelfStart, animeShelfEnd)
  : '';
if (!animeShelf.includes('limit={compactMobile ? 9 : 12}') || !animeShelf.includes('mobileLayout="rail"')) {
  failures.push('The anime shelf must stay within two desktop rows and a compact mobile list.');
}
if (home.includes('HomeAngularIndex') || home.includes('MOBILE_CATEGORY_LINKS') || globalCss.includes('home-angular-index')) {
  failures.push('The duplicated quick-category strip and its dead CSS must remain removed.');
}
if (
  home.includes('<TrendingSection movies={trendingMovies}')
  || !dailyUpdate.includes("fetchLatestReleaseMovies(1, 'episode_updates')")
  || !dailyUpdate.includes("fetchLatestReleaseMovies(1, 'new')")
) {
  failures.push('The homepage must use the stable daily update feed instead of the retired new-and-hot shelf.');
}
for (const contract of [
  "const VSMOV_4K_URL = 'https://vsmov.com/api/danh-sach/4k?page=1'",
  "fetchVsmov4KMovies(limit)",
  "sectionPromises['vsmov-4k'] = fetchVsmov4KMovies(limit)",
  "https://vsmov.com/api/phim/",
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
if (!homeFallbackGenerator.includes('fetchVerifiedVsmov4KFallback')
  || !homeFallbackGenerator.includes('providerDetailEpisodes(detailPayload).length === 0')
  || !homeFallbackGenerator.includes("source_site: 'vsmov'")) {
  failures.push('Static 4K fallback must verify each VSMov detail endpoint before publishing the card.');
}
for (const [ok, message] of [
  [movieCard.includes("preferredSource || 'vsmov'") && movieCard.includes("isVsmovFourK ? '4k'"), 'A VSMov 4K card must preserve its source/quality intent'],
  [slugEncoder.includes("params.set('source'") && slugEncoder.includes("params.set('quality'"), 'Movie detail URLs must carry playback preferences'],
  [movieDetail.includes('withPlaybackPreference') && movieDetail.includes("preferredSource === 'vsmov'"), 'Detail/watch navigation must preserve the 4K preference'],
  [movieApi.includes('preferredCandidates.length > 0 ? preferredCandidates : candidates'), 'Playback ranking must honor an explicitly requested VSMov source when it is playable'],
  [pagesWorker.includes("preferredSource === 'vsmov'") && pagesWorker.includes("'vsmov-4k-v1'") && pagesWorker.includes("allProviders.filter((provider) => provider.code === 'VSMOV')"), 'VSMov 4K detail requests must use a source-specific cache and provider response'],
  [!lazySection.includes("map((movie) => ({ ...movie, source_site: 'vsmov', quality: '4K' }))"), 'The UI must not relabel arbitrary 4K cards as VSMov'],
]) {
  if (!ok) failures.push(message);
}
if (
  !top10.includes('Top 10 Phim Lẻ Hay Nhức Nách') ||
  !top10.includes('Top 10 Phim Bộ Hôm Nay') ||
  !top10.includes('Cập nhật tự động')
) {
  failures.push('Top 10 UI must explain its automated watch-worthy ranking.');
}
if (!top10.includes('kp-chart-list')
  || !top10.includes('RankingMobileRow')
  || !top10.includes('mobileExpanded ? 10 : 5')
  || !top10.includes('grid-cols-2')
  || !top10.includes('lg:grid-cols-5')
  || !top10.includes("{ preferredAspect: 'landscape' }")
  || top10.includes('overflow-x-auto')
  || top10.includes('MobileSwipeHint')) {
  failures.push('Top 10 must use compact ranked rows on phones and a five-column desktop grid.');
}
if (!topRated.includes('grid-cols-2')
  || !topRated.includes('lg:grid-cols-5')
  || !topRated.includes("{ preferredAspect: 'portrait' }")
  || !topRated.includes('Tuyển chọn từ dữ liệu độ phổ biến thực')
  || topRated.includes('getTopRating')
  || topRated.includes('getVoteCount')
  || topRated.includes('Math.random()')) {
  failures.push('Top-rated movies must use a truthful responsive portrait grid without fabricated scores or vote counts.');
}
if (!trailerSection.includes('function hasOfficialYouTubeTrailer')
  || !trailerSection.includes('function hasPlayableEpisodeLabel')
  || !trailerSection.includes('function isVerifiedTrailerMovie')
  || !trailerSection.includes('!hasPlayableEpisodeLabel(movie)')
  || !trailerSection.includes('hasOfficialYouTubeTrailer(movie.trailer_url)')) {
  failures.push('Homepage trailer shelf must only show official trailer-only/upcoming movies and reject playable movies.');
}
if (trailerSection.includes('getHotScore') || trailerSection.includes('ri-fire-fill')) {
  failures.push('Homepage trailer shelf must not display fabricated hot scores.');
}
if (!home.includes('<TopRatedSection initialMovies={topRatedMovies} loading={homeLoading}')
  || /!compactMobile\s*&&\s*<>\s*\n\s*<EditorialSectionFrame number="05"/.test(home)) {
  failures.push('The redesigned top-rated section must remain available on both phone and desktop.');
}
if (!/getPortraitImagePaths\(movie\)[\s\S]*?portraitPath,[\s\S]*?portraitFallback,[\s\S]*?isImagePreloaded\(getImageUrl\(portraitPath \|\| ''\)\)[\s\S]*?\n\s*480,\s*\n\s*86,\s*\n\s*\{ preferredAspect: 'portrait' \},\s*\n\s*\);/.test(vietnamSection)) {
  failures.push('Cinema posters must use the provider-aware portrait artwork at a sharp card-size budget.');
}
if (!String(packageJson.scripts?.prebuild || '').includes('refresh-home-fallback.mjs')) {
  failures.push('Production builds must refresh the static homepage fallback before packaging.');
}
if (!String(packageJson.scripts?.prebuild || '').includes('generate-pages-api-fallbacks.mjs')) {
  failures.push('Production builds must generate fail-open Pages API fallbacks.');
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
if ((homeFallback.sections?.['vsmov-4k'] ?? []).some((movie) => (
  !/vsmov/i.test(`${movie.source_site || ''} ${movie.source_name || ''}`)
  || !/(?:4k|2160p|uhd)/i.test(String(movie.quality || ''))
))) {
  failures.push('Every static 4K fallback card must be a verified VSMov 4K item.');
}
for (const contract of [
  "const HOME_DOCUMENT_CACHE_VERSION = '20260828-fast-home-v1'",
  "headers.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')",
  "return serveHomeDocument(context, request, pathname)",
  "contextWaitUntil(context, caches.default.put(cacheKey, response.clone()))",
]) {
  if (!pagesWorker.includes(contract)) failures.push(`Versioned homepage document cache contract is missing: ${contract}`);
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

for (const contract of [
  "get('home-v2') === '1'",
  "home-cinema-v2",
  'HOME_V2_SHORTCUTS',
  "variant={homeV2 ? 'midnight' : 'editorial'}",
  'compact={homeV2}',
  'limit={homeV2 ? 5 : 10}',
]) {
  if (!home.includes(contract)) failures.push(`Homepage V2 demo contract is missing: ${contract}`);
}
for (const contract of [
  'HOMEPAGE V2 DEMO — MIDNIGHT CINEMA',
  '.home-cinema-v2 .editorial-hero',
  '.home-v2-discovery',
  '.home-cinema-v2 .editorial-section-content',
  '.home-cinema-v2 .movie-section-desktop-grid > :nth-child(n + 7)',
]) {
  if (!globalCss.includes(contract)) failures.push(`Homepage V2 visual contract is missing: ${contract}`);
}

if (failures.length) {
  console.error('Home experience regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Home experience regression passed.');
