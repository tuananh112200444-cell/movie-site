import { readFile as readRawFile } from 'node:fs/promises';

const readFile = async (path, encoding) => String(await readRawFile(path, encoding)).replace(/\r\n/g, '\n');

const sources = Object.fromEntries(await Promise.all([
  ['movieList', 'src/pages/movie-list/page.tsx'],
  ['movieApi', 'src/services/movieApi.ts'],
  ['country', 'src/pages/country/page.tsx'],
  ['countryTabs', 'src/pages/home/components/CountryTabsSection.tsx'],
  ['anime', 'src/pages/anime/page.tsx'],
  ['phimMa', 'src/pages/phim-ma/page.tsx'],
  ['myNam', 'src/pages/my-nam/page.tsx'],
  ['genre', 'src/pages/genre/page.tsx'],
  ['filterSidebar', 'src/pages/filter/components/FilterSidebar.tsx'],
  ['edge', 'functions/[[path]].js'],
  ['homeProxy', 'supabase/functions/home-proxy/index.ts'],
].map(async ([key, path]) => [key, await readFile(path, 'utf8')])));

const failures = [];
const requireText = (sourceKey, snippet, message) => {
  if (!sources[sourceKey].includes(snippet)) failures.push(message);
};

requireText('movieList', "page,\n    1,\n    sortField", 'Numbered movie-list pages must request exactly one source page.');
requireText('movieList', "sortBy === 'hot' ? 'hot'", 'Hot catalogue mode must be sent to the data layer.');
requireText('movieList', "(['updated', 'hot'] as const)", 'Movie-list pages must expose only updated and hot sorting.');
if (sources.movieList.includes("(['new', 'hot', 'updated'] as const)")) failures.push('Movie-list pages still expose the retired newest sort.');
requireText('movieApi', ".select(selectFields, { count: 'exact' })", 'Catalogue counts must be computed from the filtered database query.');
requireText('movieApi', ".is('superseded_by_movie_id', null)", 'Superseded movies must be excluded before pagination.');
requireText('movieApi', ".not('episode_current', 'ilike', '%trailer%')", 'Trailer-only rows must be excluded before range/count.');
requireText('movieApi', "error?.code === 'PGRST103'", 'Out-of-range canonical pages must remain empty instead of falling back to another catalogue.');
requireText('movieApi', ".order('id', { ascending: false })", 'Catalogue ordering needs a deterministic ID tie-breaker.');
requireText('movieApi', "params.sortField === 'hot'", 'Hot ordering must be owned by the database query.');

for (const key of ['anime', 'phimMa', 'myNam']) {
  requireText(key, 'useSearchParams', `${key} must read its page from the URL.`);
  requireText(key, "searchParams.get('page')", `${key} must parse the URL page.`);
  requireText(key, '_p${pg}', `${key} cache entries must be isolated per numbered page.`);
  requireText(key, "{ value: 'hot_desc', label: 'Hot nhất'", `${key} must expose hot sorting.`);
  if (sources[key].includes("value: 'year_desc'") || sources[key].includes("value: 'year_asc'")) {
    failures.push(`${key} still exposes a year/newest sort.`);
  }
}

requireText('country', "const sortField = sortBy === 'hot' ? 'hot' : 'modified.time'", 'Country pages must default to updated and send hot mode to the server.');
requireText('country', "preserveQuery={sortBy === 'hot' ? { sort: 'hot' } : undefined}", 'Country pagination must preserve its sort mode.');
requireText('country', "{ key: 'updated', icon: 'ri-time-line', label: 'Mới Cập Nhật' }", 'Country pages must expose updated as the first/default sort.');
requireText('genre', "{ value: 'hot_desc', label: 'Hot nhất'", 'Genre pages must expose hot sorting.');
if (sources.genre.includes("value: 'year_desc'") || sources.genre.includes("value: 'year_asc'")) failures.push('Genre pages still expose a year/newest sort.');
requireText('filterSidebar', "{ label: 'Hot Nhất', value: 'hot:desc'", 'Advanced filters must expose hot sorting.');
if (sources.filterSidebar.includes("value: 'year:desc'") || sources.filterSidebar.includes("value: 'year:asc'")) failures.push('Advanced filters still expose a year/newest sort.');
requireText('countryTabs', 'selectFreshCountryMovies', 'Homepage country tabs must enforce the same fresh-country contract.');
for (const contract of [
  "fetchMoviesByType('phim-bo', 1, 'modified.time', 'desc')",
  "fetchMoviesByType('phim-le', 1, 'modified.time', 'desc')",
  "fetchMoviesByType('phim-chieu-rap', 1, 'modified.time', 'desc')",
  "fetchMoviesByType('hoat-hinh', 1, 'modified.time', 'desc')",
]) {
  requireText('movieList', "(['updated', 'hot'] as const)", 'Movie-list sorting contract is incomplete.');
  if (!(await readFile('src/pages/home/page.tsx', 'utf8')).includes(contract)) {
    failures.push(`Homepage shelf does not reuse the canonical catalogue query: ${contract}`);
  }
}
const vietnamSection = await readFile('src/pages/home/components/TopCinemaMoviesSection.tsx', 'utf8');
if (!vietnamSection.includes("fetchMoviesByCategory({\n    country: 'viet-nam',\n    page: 1,\n    sortField: 'modified.time'")) {
  failures.push('Vietnam homepage shelf does not reuse the canonical Vietnam catalogue query.');
}
requireText('edge', "const recentCountryKeys = ['han-quoc', 'au-my', 'trung-quoc', 'thai-lan']", 'Pages edge must reject stale country shelf rows.');
requireText('homeProxy', "const recentCountryKeys = ['han-quoc', 'au-my', 'trung-quoc', 'thai-lan']", 'Home proxy must reject stale country shelf rows.');

const fallback = JSON.parse(await readFile('public/home-fallback.json', 'utf8'));
const currentYear = new Date().getUTCFullYear();
for (const key of ['han-quoc', 'au-my', 'trung-quoc', 'thai-lan']) {
  const items = fallback.sections?.[key] ?? [];
  if (items.length < 12) failures.push(`${key} fallback has fewer than 12 movies.`);
  if (items.some((movie) => Number(movie.year || 0) < currentYear - 1 || Number(movie.year || 0) > currentYear + 1)) {
    failures.push(`${key} fallback still contains historical imports in its fresh shelf.`);
  }
  if (items.some((movie) => !(movie.country ?? []).some((entry) => entry?.slug === key))) {
    failures.push(`${key} fallback contains a cross-country movie.`);
  }
}

if (failures.length > 0) {
  console.error(`Catalog pagination regression failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Catalog pagination regression passed.');
