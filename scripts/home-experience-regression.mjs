import { readFile } from 'node:fs/promises';

const home = await readFile('src/pages/home/page.tsx', 'utf8');
const trending = await readFile('src/pages/home/components/TrendingSection.tsx', 'utf8');
const lazySection = await readFile('src/pages/home/components/LazyMovieSection.tsx', 'utf8');
const proxy = await readFile('supabase/functions/home-proxy/index.ts', 'utf8');
const movieApi = await readFile('src/services/movieApi.ts', 'utf8');
const searchSuggestions = await readFile('src/components/feature/SearchSuggestions.tsx', 'utf8');
const app = await readFile('src/App.tsx', 'utf8');
const main = await readFile('src/main.tsx', 'utf8');
const smartCache = await readFile('src/utils/smartCache.ts', 'utf8');
const discovery = await readFile('src/pages/home/components/HomeDiscoverySection.tsx', 'utf8');
const portalGateway = await readFile('src/pages/home/components/PortalGateway.tsx', 'utf8');
const movieSection = await readFile('src/pages/home/components/MovieSection.tsx', 'utf8');
const failures = [];

if (home.includes('idleFallback') || !home.includes("window.addEventListener('pageshow', checkPosition)")) {
  failures.push('Deferred sections must use viewport checks without waking the whole page on an idle timer.');
}
if (!home.includes('Kho phim được đồng bộ và kiểm tra nguồn phát tự động')) {
  failures.push('Homepage is missing its live catalogue status affordance.');
}
if (/getViewerCount|\}\s*xem/.test(trending)) {
  failures.push('Trending UI must not show generated viewer counts as real analytics.');
}
if (lazySection.includes('3200 + Math.min(sectionIndex, 8) * 120')) {
  failures.push('Lazy movie shelves must not all wake on a shared idle timer.');
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
if (!home.includes('loadStaticHomeFallback(fallbackController.signal, DESKTOP_HOME_SECTIONS)')) {
  failures.push('Mobile static fallback must include every shelf for fast scrolling.');
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
if (!app.includes("if (!/^\\/xem-phim\\/[^/]+/.test(window.location.pathname)) return;")) {
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

if (failures.length) {
  console.error('Home experience regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Home experience regression passed.');
