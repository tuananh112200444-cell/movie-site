import { readFile } from 'node:fs/promises';

const source = await readFile('src/pages/movie-list/components/FeaturedSection.tsx', 'utf8');
const movieApiSource = await readFile('src/services/movieApi.ts', 'utf8');
const failures = [];

if (!source.includes('movie.hero_backdrop_url || movie.poster_url || movie.thumb_url')) {
  failures.push('Landscape featured cards do not prefer backdrop/poster images.');
}
if (source.includes('const imagePath = movie.thumb_url || movie.poster_url')) {
  failures.push('A portrait thumbnail is still preferred on a landscape featured card.');
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

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', checks: 5 }, null, 2));
