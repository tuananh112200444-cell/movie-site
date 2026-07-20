import fs from 'node:fs';

const vite = fs.readFileSync('vite.config.ts', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const page = fs.readFileSync('src/pages/movie-detail/page.tsx', 'utf8');
const hero = fs.readFileSync('src/pages/movie-detail/components/MovieDetailHero.tsx', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const worker = fs.readFileSync('functions/[[path]].js', 'utf8');
const navbar = fs.readFileSync('src/components/feature/Navbar.tsx', 'utf8');
const playerSection = fs.readFileSync('src/pages/movie-detail/components/MovieDetailPlayerSection.tsx', 'utf8');
const comments = fs.readFileSync('src/pages/movie-detail/components/UserComments.tsx', 'utf8');
const imageFallback = fs.readFileSync('src/hooks/useImageFallback.ts', 'utf8');
const homeHero = fs.readFileSync('src/pages/home/components/HeroBanner.tsx', 'utf8');
const lazyHomeSection = fs.readFileSync('src/pages/home/components/LazyMovieSection.tsx', 'utf8');

const checks = [
  [!vite.includes('appendAssetVersion'), 'Hashed Vite assets must not receive a second query-string identity'],
  [html.includes("w.setTimeout(function(){if('requestIdleCallback'in w)w.requestIdleCallback(loadGtm,{timeout:5000});else loadGtm();},10000)"), 'GTM must have a real minimum delay after the critical viewing path'],
  [html.includes('rel="preload" as="style"') && html.includes('display=optional'), 'Web fonts must not block the first movie render'],
  [app.includes('requestIdleCallback(run, { timeout: 15000 })'), 'Source-health warming must not compete with initial playback'],
  [page.includes('if (isWatchPage || !showBottom || !detail?.movie || !slug || relatedFetchedRef.current) return;') && !page.includes('relatedTimer = setTimeout'), 'Related movies must load only near the lower information-page sections and never on the player page'],
  [hero.includes('hidden sm:block') && hero.includes('loading="eager"') && hero.includes('fetchPriority="high"') && !hero.includes('backdropFallback'), 'Desktop LCP backdrop must load eagerly while remaining hidden on mobile'],
  [navbar.includes('/brand/khophim-favicon-v2-96.png'), 'Navigation must use the compact brand asset'],
  [movieApi.includes("new URL('/api/movie-detail'"), 'Movie detail must use the same-origin edge cache'],
  [movieApi.includes('External enrichment must never delay first render/player startup') && movieApi.includes('void mergeExternalDetailIfFast'), 'External detail enrichment must remain outside the critical render path'],
  [movieApi.includes('BLVIETSUB_DETAIL_DEDUPE_MS') && movieApi.includes('blvietsubDetailInflight'), 'Repeated BLVietsub detail failures must be deduplicated on the client'],
  [worker.includes("pathname === '/api/movie-detail'") && worker.includes('X-KhoPhim-Detail-Cache'), 'Cloudflare must cache complete movie-detail JSON'],
  [worker.includes('/__circuit/blvietsub/') && worker.includes('/__circuit/movie-detail/') && worker.includes('X-KhoPhim-Circuit'), 'Cloudflare POP circuit breakers must protect detail upstreams'],
  [playerSection.includes("aria-label={cinemaMode ? 'Thoát chế độ Cinema' : 'Bật chế độ Cinema'}"), 'Cinema control must have an accessible name on mobile'],
  [comments.includes('<h2 className="text-white font-bold text-base">'), 'Comments heading must preserve a valid document outline'],
  [!imageFallback.includes('new Image()'), 'Lazy movie posters must not be eagerly downloaded by a duplicate JavaScript image loader'],
  [/backgroundWidth\s*=\s*isMobileHero\s*\?\s*(?:[1-3]\d{2}|4[0-8]0)\s*:\s*1360/.test(homeHero), 'Mobile hero must request an image rendition no wider than 480px before DPR scaling'],
  [lazyHomeSection.includes('return !isMobileViewport() && hasData && sectionIndex === 0;'), 'Offscreen mobile category shelves must not render eagerly'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('player performance regression passed');
