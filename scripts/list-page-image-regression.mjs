import { readFile } from 'node:fs/promises';

const source = await readFile('src/pages/movie-list/components/FeaturedSection.tsx', 'utf8');
const movieApiSource = await readFile('src/services/movieApi.ts', 'utf8');
const movieCardSource = await readFile('src/components/base/MovieCard.tsx', 'utf8');
const movieDetailHeroSource = await readFile('src/pages/movie-detail/components/MovieDetailHero.tsx', 'utf8');
const homeProxySource = await readFile('supabase/functions/home-proxy/index.ts', 'utf8');
const providerSyncSource = await readFile('supabase/functions/sync-ophim-movies/index.ts', 'utf8');
const edgeSource = await readFile('functions/[[path]].js', 'utf8');
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
  !movieApiSource.includes('large phimimg originals')
  || movieApiSource.includes('phimimg\\.com|icdn\\.darkbytes\\.xyz')
  || movieApiSource.includes('return `/cdn-cgi/image/width=${safeWidth}')
) {
  failures.push('Production phimimg posters must use free resizing without paid Cloudflare Images transformations.');
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
