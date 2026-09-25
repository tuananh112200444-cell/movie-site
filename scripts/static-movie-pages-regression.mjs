import fs from 'node:fs';

const generator = fs.readFileSync('scripts/generate-static-movie-pages.mjs', 'utf8');
const shellGenerator = fs.readFileSync('scripts/generate-static-seo-shells.mjs', 'utf8');
const catalogFunction = fs.readFileSync('supabase/functions/static-seo-catalog/index.ts', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const moviePage = fs.readFileSync('src/pages/movie-detail/page.tsx', 'utf8');
const movieHero = fs.readFileSync('src/pages/movie-detail/components/MovieDetailHero.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const worker = fs.readFileSync('functions/[[path]].js', 'utf8');
const bootstrap = fs.readFileSync('src/services/staticMovieBootstrap.ts', 'utf8');
const aliases = fs.readFileSync('src/data/movieCanonicalAliases.json', 'utf8');
const headers = fs.readFileSync('public/_headers', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [
  [!indexHtml.includes('<link rel="canonical" href="https://khophim.org"'), 'Shared SPA HTML must not canonicalize every deep route to the homepage'],
  [packageJson.scripts.postbuild.includes('generate-static-movie-pages.mjs'), 'Production postbuild must generate static movie HTML'],
  [generator.includes('PAGE_LIMIT') && generator.includes('18_000') && generator.includes('MAX_PAGES_FILE_COUNT = 20_000'), 'Static generation must reserve space below the Cloudflare Pages free file limit'],
  [generator.includes('MIN_EXPECTED_INDEXABLE_MOVIES = 100'), 'The phased index cohort must fail closed if the live catalogue unexpectedly falls below its safe floor'],
  [generator.includes("path.join('out', 'phim', `${canonicalSlug}.html`)") && generator.includes('forces a trailing-slash redirect'), 'Every selected movie must receive a clean extensionless /phim/:slug asset without a trailing-slash redirect'],
  [generator.includes('<link rel="canonical" href="${canonical}">') && generator.includes('<meta name="kp-static-movie" content="${escapeHtml(slug)}">') && generator.includes("'@type': 'Movie'") && generator.includes("'@type': 'BreadcrumbList'"), 'Generated movie HTML must carry a persistent cohort marker, self canonical and structured data'],
  [generator.includes('sitemap-movies-static-') && generator.includes("writeFile('out/sitemap-movies.xml'"), 'Movie sitemaps must contain exactly the statically generated cohort'],
  [generator.includes("writeFile(path.join('out', 'sitemap-seo-studio.xml'), sitemapXml(seoStudioMovies)") && generator.includes('seo_studio_count'), 'Postbuild must replace the empty SEO Studio fallback with the approved static profile sitemap'],
  [!indexHtml.includes("/^\\/phim\\/") && worker.includes('staticMovieSlug: indexable') && worker.includes('name="kp-static-movie"'), 'The edge must own the movie cohort decision and inject its marker without a conflicting shared-shell noindex'],
  [catalogFunction.includes(".eq('eligible_for_index', true)") && catalogFunction.includes(".in('index_tier', ['playable', 'ongoing'])") && catalogFunction.includes(".eq('movies.is_published', true)"), 'Static catalogue must expose only published SEO-approved movies'],
  [catalogFunction.includes('isHighValueStaticMovie') && catalogFunction.includes(".gte('quality_score', 85)") && catalogFunction.includes(".gte('content_length', 500)") && catalogFunction.includes('hasUsefulPerson'), 'Static catalogue must match the editorial-quality sitemap cohort'],
  [catalogFunction.includes('UPCOMING_COHORT_LIMIT = 20') && catalogFunction.includes('UPCOMING_MIN_QUALITY_SCORE = 88') && catalogFunction.includes('UPCOMING_MIN_CONTENT_LENGTH = 350') && catalogFunction.includes('hasOfficialTrailerUrl'), 'Upcoming static catalogue must remain small, metadata-rich and trailer-backed'],
  [catalogFunction.includes("const profileCohort = requestedCohort === 'profiles';") && generator.includes("cohort: 'profiles'") && generator.includes('static-seo-profile-catalog-fallback.sql'), 'Published SEO Studio profiles must receive their own static-priority catalogue'],
  [generator.includes('MIN_EXPECTED_UPCOMING_MOVIES = 5') && generator.includes("sitemap-movies-upcoming.xml") && generator.includes('data-kp-upcoming=') && generator.includes('potentialAction: canAdvertiseWatch ?'), 'Static generation must publish a fail-closed upcoming sitemap without premature watch schema'],
  [shellGenerator.includes('data-kp-contextual-movie-links="true"') && shellGenerator.includes("pathname === '/phim-sap-chieu'") && shellGenerator.includes('upcomingMovieLocs'), 'Static catalogue shells must provide contextual crawl paths into movie and upcoming cohorts'],
  [shellGenerator.includes("pathname === '/xem-phim-online'") && shellGenerator.includes('editorialMovieLocs') && shellGenerator.includes('broadIntentHub ? 72'), 'Broad watch-intent hubs must link prominently to approved editorial movie pages'],
  [generator.includes('seenContent') && generator.includes('fallbackSeenContent'), 'Static generation must not publish multiple URLs with the same synopsis'],
  [catalogFunction.includes("offset + (profileResult.data ?? []).length < Number(profileResult.count || 0)") && generator.includes('if (payload.has_more === false) break;') && generator.includes('Approved SEO profile mismatch'), 'Static profile catalogue must paginate and fail on missing approved URLs'],
  [catalogFunction.includes('hasValidPublishableApiKey(req)') && !catalogFunction.includes('SUPABASE_SERVICE_ROLE_KEY}`'), 'Static catalogue must require the public API key without exposing the service key'],
  [moviePage.includes('!isWatchPage && (') && moviePage.includes('const shouldNoIndexMovieInfo = staticBootstrap') && moviePage.includes('? !isStaticMovieIndexable') && moviePage.includes('noIndex={shouldNoIndexMovieInfo}') && moviePage.includes('canonical={`/phim/${slug ?? \'\'}`}'), 'Hydrated information pages must index only the edge-approved cohort'],
  [moviePage.includes('noIndex={shouldNoIndexMovieInfo}') && movieHero.includes('noIndex={noIndex}'), 'Every movie-detail SEO owner must preserve the cohort noindex decision'],
  [main.includes('meta[name="kp-static-movie"]') && main.includes('__KP_STATIC_MOVIE_SLUG__') && moviePage.includes('!isStaticMovieIndexable && ('), 'React startup must preserve the persistent edge/static movie cohort marker until live detail data is ready'],
  [worker.includes('getStaticMovieDocument') && worker.includes("'cloudflare-static-movie'") && worker.includes('if (publicMovieMatch) {') && !worker.includes('publicMovieMatch && !isBot(userAgent)'), 'Users and Googlebot must both use built movie HTML before a slow database renderer'],
  [generator.includes('kp-static-movie-data') && generator.includes("path.join('out', 'movie-data'") && bootstrap.includes('fetchStaticMovieBootstrap') && bootstrap.includes('1_500'), 'Static HTML and same-origin JSON must bootstrap movie information independently from the playback API'],
  [generator.includes('previewMovies') && generator.includes('...hotMovies, ...homeMovies') && generator.includes('indexable: false') && generator.includes("robots = indexable") && worker.includes("? 'noindex, follow'"), 'Homepage and cinema previews must load quickly while remaining noindex until SEO approval'],
  [aliases.includes('nguoi-nhen-khoi-dau-moi') && bootstrap.includes('movieDetailSourceSlug') && headers.includes('/movie-data/*'), 'Canonical aliases and static bootstrap responses must remain stable and cacheable'],
  [moviePage.includes('const hasAdvertisedEpisodes = useMemo') && moviePage.includes('const canOpenWatchPage = hasEpisodes || hasAdvertisedEpisodes') && moviePage.includes('hasEpisodes={canOpenWatchPage}') && movieHero.includes("episodeDataLoading ? 'Đang tải tập...' : 'Chưa có tập'") && !movieHero.includes("? 'Đang cập nhật' : isTrailerOnly"), 'Released static movie metadata must show an immediate watch action instead of a misleading update state while episode data loads'],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
  console.error('Static movie page regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Static movie page regression passed (${checks.length} contracts).`);
