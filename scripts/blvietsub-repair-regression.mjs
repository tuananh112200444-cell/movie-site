import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/sync-blvietsub-feed/index.ts', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const playerBox = fs.readFileSync('src/pages/movie-detail/components/PlayerBox.tsx', 'utf8');
const checks = [
  ['completed 1/1 is eligible for recheck', /current <= 1 && total <= 1[\s\S]{0,40}return true/],
  ['legacy 1/1 receives starvation-proof priority', /legacySingleEpisode[\s\S]{0,200}score \+= 9000/],
  ['legacy Blogger series resolve to the current source by exact title only', /hasLegacyBlvietsubUrl[\s\S]{0,1800}findExactCurrentSourceForLegacyMovie[\s\S]{0,1800}movieKeys\.has\(key\)/],
  ['legacy source discovery stays bounded and series-only', /\['phim-bo', 'series', 'tvshows', 'hoathinh'\][\s\S]{0,400}\.slice\(0, cappedLimit\)/],
  ['exactly resolved legacy series cannot starve behind current-source rows', /legacyResolvedIds\.add\(item\.movie\.id\)[\s\S]{0,700}legacyResolvedIds\.has\(movie\.movie\.id\) \? 20000 : 0/],
  ['legacy discovery falls back from disabled AJAX to HTML search', /searchUrl\.searchParams\.set\('s', keywords\[0\]\)[\s\S]{0,180}parseWordPressMovieUrlsFromHtml/],
  ['legacy mapping accepts only exact historical or title slug', /getLegacyBlvietsubSlug[\s\S]{0,1600}exactSlugKeys\.has\(candidateSlug\)/],
  ['repair updates numeric total and display total together', /update\.episode_total = `\$\{mergedTotal\} Tập`[\s\S]{0,160}update\.total_episodes = mergedTotal/],
  ['WordPress root movie URLs are supported', /parts\[0\]\?\.toLowerCase\(\) === 'phim' \? parts\[1\] : parts\.length === 1 \? parts\[0\]/],
  ['current BLVietsub multi-server buttons map data-server-url to numbered episodes', source.includes('blv-server-button') && source.includes("extractAttr(tag, 'data-server-url')") && source.includes('BLVietsub ${groupLabel')],
  ['original title is recovered from WordPress metadata', /originName: getWordPressOriginName\(title, content\)/],
  ['WordPress release year comes from movie metadata instead of image or publish-date noise', source.includes('function getWordPressReleaseYear') && source.includes('/"keywords"\\s*:\\s*\\[') && source.includes('const year = getWordPressReleaseYear(html, updatedAt)')],
  ['repair batches use bounded concurrency', /rows\.slice\(index, index \+ 4\)\.map/],
  ['repair queue retains movie and source URL', /\.slice\(0, cappedLimit\);[\s\S]{0,500}\{ movie, sourceUrl \}/],
  ['one-video sources cannot pollute healthy series', /dbBeforeEpisode >= 4 && sourceMaxEpisode <= 1[\s\S]{0,700}backward_guarded: true/],
  ['guarded titles rotate behind the repair queue', /Mark the check as completed[\s\S]{0,220}last_synced_at/],
  ['removed source pages rotate without poisoning sync health', /isPermanentExternalFetchError[\s\S]{0,1800}permanentSkipped[\s\S]{0,800}last_synced_at/],
  ['source-specific duplicates still compete with global canonical movies', /findBestMovieForEntry[\s\S]{0,420}selectPreferredMovie\(\[localMatch, globalMatch\]/],
  ['verified BL source duplicates retire only after canonical sync succeeds', /const syncResult = await syncEntryToMovie[\s\S]{0,500}retireSourceMovieDuplicate/],
  ['BL episodes cannot overwrite another canonical provider identity', /movieOwnsBlvietsubIdentity[\s\S]{0,320}!String\(movie\.showtimes[\s\S]{0,260}assignChanged\('source_url'/],
  ['sync only rejects BLVietsub content-page hosts', source.includes("return /^(?:www\\.)?blvietsub\\.com$/i.test(url.hostname)")],
  ['detail proxy preserves player.blvietsub.com embeds', detailProxy.includes("return /^(?:www\\.)?blvietsub\\.com$/i.test(parsed.hostname)")],
  ['detail refresh normalizes BLVietsub root canonical URLs back to source pages', detailProxy.includes("return `https://blvietsub.com/phim/${encodeURIComponent(decodeURIComponent(parts[0]))}/`")],
  ['manual refresh targets the known BLVietsub page even for completed movies', detailProxy.includes('shouldForceKnownBlvietsubSync') && detailProxy.includes("'movie_detail_force_refresh'")],
  ['frontend source brain treats BLVietsub player as a stable embed', movieApi.includes("host === 'player.blvietsub.com') return 'stable_embed'")],
  ['frontend content-page guard does not match BLVietsub player subdomains', movieApi.includes("return /^(?:www\\.)?blvietsub\\.com$/i.test(parsed.hostname);")],
  ['player guard does not match BLVietsub player subdomains', playerBox.includes("return /^(?:www\\.)?blvietsub\\.com$/i.test(parsed.hostname);")],
];

const failures = checks.filter(([, expectation]) =>
  typeof expectation === 'boolean' ? !expectation : !expectation.test(source)
).map(([name]) => name);
console.log(JSON.stringify({ checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
