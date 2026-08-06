import { readFile } from 'node:fs/promises';

const source = await readFile('src/pages/movie-list/components/FeaturedSection.tsx', 'utf8');
const movieApiSource = await readFile('src/services/movieApi.ts', 'utf8');
const movieCardSource = await readFile('src/components/base/MovieCard.tsx', 'utf8');
const movieDetailHeroSource = await readFile('src/pages/movie-detail/components/MovieDetailHero.tsx', 'utf8');
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
if (!movieApiSource.includes('return `/cdn-cgi/image/width=${safeWidth},quality=${safeQuality},format=auto,fit=cover/${original}`')) {
  failures.push('Production phimimg posters are not resized at the verified Cloudflare edge.');
}
if (!movieCardSource.includes('return getPortraitImagePaths(movie)')) {
  failures.push('Portrait movie cards do not use the provider-aware artwork contract.');
}
if (!movieDetailHeroSource.includes('const backdropPath = movie.hero_backdrop_url || landscapeArtwork.primary || posterPath')) {
  failures.push('Movie detail backdrop does not prefer landscape artwork.');
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', checks: 7 }, null, 2));
