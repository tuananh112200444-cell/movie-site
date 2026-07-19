import fs from 'node:fs';

const vite = fs.readFileSync('vite.config.ts', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const page = fs.readFileSync('src/pages/movie-detail/page.tsx', 'utf8');
const hero = fs.readFileSync('src/pages/movie-detail/components/MovieDetailHero.tsx', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const worker = fs.readFileSync('functions/[[path]].js', 'utf8');
const navbar = fs.readFileSync('src/components/feature/Navbar.tsx', 'utf8');

const checks = [
  [!vite.includes('appendAssetVersion'), 'Hashed Vite assets must not receive a second query-string identity'],
  [html.includes("w.setTimeout(function(){if('requestIdleCallback'in w)w.requestIdleCallback(loadGtm,{timeout:5000});else loadGtm();},10000)"), 'GTM must have a real minimum delay after the critical viewing path'],
  [app.includes('requestIdleCallback(run, { timeout: 15000 })'), 'Source-health warming must not compete with initial playback'],
  [page.includes('relatedTimer = setTimeout(run, 8000)'), 'Related movies must load after the player'],
  [hero.includes('hidden sm:block') && hero.includes('fetchPriority="low"'), 'Decorative hero backdrop must not compete on mobile'],
  [navbar.includes('/brand/khophim-favicon-v2-96.png'), 'Navigation must use the compact brand asset'],
  [movieApi.includes("new URL('/api/movie-detail'"), 'Movie detail must use the same-origin edge cache'],
  [worker.includes("pathname === '/api/movie-detail'") && worker.includes('X-KhoPhim-Detail-Cache'), 'Cloudflare must cache complete movie-detail JSON'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('player performance regression passed');
