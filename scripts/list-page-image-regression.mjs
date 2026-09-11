import { readFile } from 'node:fs/promises';

const source = await readFile('src/pages/movie-list/components/FeaturedSection.tsx', 'utf8');
const movieApiSource = await readFile('src/services/movieApi.ts', 'utf8');
const movieCardSource = await readFile('src/components/base/MovieCard.tsx', 'utf8');
const movieDetailHeroSource = await readFile('src/pages/movie-detail/components/MovieDetailHero.tsx', 'utf8');
const homeProxySource = await readFile('supabase/functions/home-proxy/index.ts', 'utf8');
const providerSyncSource = await readFile('supabase/functions/sync-ophim-movies/index.ts', 'utf8');
const edgeSource = await readFile('functions/[[path]].js', 'utf8');
const genrePageSource = await readFile('src/pages/genre/page.tsx', 'utf8');
const countryPageSource = await readFile('src/pages/country/page.tsx', 'utf8');
const redirectsSource = await readFile('public/_redirects', 'utf8');
const artworkRepairMigration = await readFile('supabase/migrations/20260823054500_repair_ophim_artwork_paths.sql', 'utf8');
const failures = [];

if (!source.includes('movie.hero_backdrop_url || movie.thumb_url || movie.poster_url')) {
  failures.push('Landscape featured cards do not prefer backdrop/thumbnail images.');
}
if (source.includes('movie.hero_backdrop_url || movie.poster_url || movie.thumb_url')) {
  failures.push('A portrait poster is still preferred before the landscape thumbnail.');
}
if (!movieApiSource.includes('preferPrimaryWithFallback(promises, 1800, 6000)')) {
  failures.push('List requests can still accept a faster mirror before the canonical artwork source.');
}
if (movieApiSource.includes('await enrichMoviesWithSupabaseEpisodeCounts(')) {
  failures.push('List/search pages still scan episode tables instead of using the stored movie episode summary.');
}
if (
  !movieApiSource.includes('wsrv explicitly blocks through the proxy')
  || !movieApiSource.includes('phimimg\\.com|icdn\\.darkbytes\\.xyz')
  || !movieApiSource.includes('&default=1')
  || movieApiSource.includes('return `/cdn-cgi/image/width=${safeWidth}')
) {
  failures.push('Blocked phimimg posters must bypass wsrv without enabling paid Cloudflare Images transformations.');
}
if (/sourcePage\s*=\s*pg\s*\*\s*2/.test(genrePageSource) || /sourcePage\s*=\s*page\s*\*\s*2/.test(countryPageSource)) {
  failures.push('Catalogue pages must not fetch two database pages and discard half of the returned movies.');
}
if (!genrePageSource.includes('sourcePageSize === PAGE_SIZE') || !countryPageSource.includes('sourcePageSize === PAGE_SIZE')) {
  failures.push('Catalogue pagination must retain the actual provider page size when a fallback source is active.');
}
if (!genrePageSource.includes('priority={idx < 4}') || genrePageSource.includes('priority={idx < 12}')) {
  failures.push('Genre pages must reserve eager image priority for the first visible row only.');
}
if (!movieApiSource.includes('Try every resized candidate before downloading a full-resolution origin.')) {
  failures.push('Poster fallback ordering must prefer all resized candidates before full-resolution origins.');
}
if (!movieApiSource.includes('pushUrl(FALLBACK_IMG);')) {
  failures.push('The local poster placeholder must remain the final fallback after origin images.');
}
for (const route of ['/the-loai/hanh-dong', '/the-loai/tinh-cam', '/phim-han-quoc', '/phim-viet-nam']) {
  if (!redirectsSource.includes(`${route} / 200`)) {
    failures.push(`Known catalogue route is missing its fail-open SPA fallback: ${route}`);
  }
}
if (/^\/\*\s+\/index\.html\s+200$/m.test(redirectsSource)) {
  failures.push('Catalogue recovery must not replace the real unknown-route 404 with a soft-404 catch-all.');
}
if (!movieCardSource.includes('return getPortraitImagePaths(movie)')) {
  failures.push('Portrait movie cards do not use the provider-aware artwork contract.');
}
if (!movieDetailHeroSource.includes('const backdropPath = movie.hero_backdrop_url || landscapeArtwork.primary || posterPath')) {
  failures.push('Movie detail backdrop does not prefer landscape artwork.');
}
if (
  !movieApiSource.includes('function normalizeKnownOphimImageUrl')
  || !movieApiSource.includes('/uploads/movies/${match[2]}')
  || !movieApiSource.includes('`${cdnBase.replace(/\\/$/, \'\')}/${url.replace(/^\\/+/, \'\')}`')
) {
  failures.push('Shared list/image URL normalization does not repair root-level OPhim CDN artwork.');
}
if (!homeProxySource.includes('normalizeKnownOphimImageUrl(`https://img.ophim.live/${normalizedPath}`)')) {
  failures.push('Home proxy can still emit root-level OPhim artwork URLs.');
}
if (!providerSyncSource.includes('normalizeProviderImage(provider, movie.thumb_url)')) {
  failures.push('Provider sync can still persist non-canonical OPhim artwork paths.');
}
if (
  !edgeSource.includes('function normalizeKnownOphimImageUrl(value)')
  || !artworkRepairMigration.includes("where thumb_url ~* '^https://(img\\.ophimimg\\.com|img\\.ophim\\.live)/[^/?#]+([?#].*)?$'")
) {
  failures.push('Search fallback or existing catalog rows are not covered by the OPhim artwork repair.');
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', checks: 11 }, null, 2));
