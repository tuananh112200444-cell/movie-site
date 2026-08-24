import fs from 'node:fs';

const worker = fs.readFileSync('functions/[[path]].js', 'utf8');
const prerender = fs.readFileSync('supabase/functions/movie-seo-prerender-data/index.ts', 'utf8');
const movieSitemap = fs.readFileSync('supabase/functions/sitemap-movies-xml/index.ts', 'utf8');
const sitemapIndex = fs.readFileSync('supabase/functions/sitemap-index/index.ts', 'utf8');
const sitemapGenerator = fs.readFileSync('scripts/generate-sitemap-index.mjs', 'utf8');

const failures = [];
const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message);
};

requireText(prerender, 'async function findQualityMovie', 'movie prerender does not use the joined quality lookup');
requireText(prerender, 'movies!inner(${MOVIE_FIELDS})', 'movie prerender still lacks the single joined movie/quality query');
requireText(worker, '!primary.notFound', 'Supabase fallback is not protected by the upstream circuit breaker');
requireText(worker, '__seo-prerender-stale/', 'movie HTML has no long-lived stale snapshot');
requireText(worker, "X-Prerender-Cache', 'STALE-FALLBACK", 'movie HTML cannot recover from a temporary upstream outage');
requireText(worker, 'kp_stale=1', 'dynamic sitemaps have no stale snapshot key');
requireText(worker, "X-Sitemap-Cache', 'STALE-FALLBACK", 'dynamic sitemaps cannot recover from a temporary upstream outage');
requireText(worker, "X-Sitemap-Proxy': 'cloudflare-pages-priority-index'", 'root sitemap still depends on the database during crawl recovery');
requireText(worker, "pathname === '/sitemap-movies-archive.xml'", 'archive movie sitemaps are not retained outside the priority index');
requireText(worker, "SEO_PRERENDER_VERSION = '20260820-cohort-parity-v24'", 'crawler cache was not rotated for the cohort parity release');
requireText(worker, 'function rewriteSpaDocument', 'SPA source HTML is not rewritten with route-specific SEO metadata');
requireText(worker, 'async function spaRouteMeta', 'SPA route metadata is not resolved before the client app mounts');
requireText(worker, 'const isIndexable = isHighValueIndexCandidate(movie)', 'movie robots directives do not use the public high-value cohort gate');
requireText(movieSitemap, 'outputLimit: 100', 'recent sitemap is not bounded to the 100-URL cohort');
requireText(movieSitemap, 'outputLimit: 60', 'ongoing sitemap is not bounded to the 60-URL cohort');
requireText(movieSitemap, 'outputLimit: 20', 'upcoming sitemap is not bounded to the 20-URL cohort');
requireText(movieSitemap, 'isHighValueCohortMovie(movie)', 'movie sitemap does not enforce high-value cohort completeness');
requireText(movieSitemap, 'seenContent.has(fingerprint)', 'movie sitemap does not remove exact synopsis duplicates');
requireText(movieSitemap, ".order('movie_id', { ascending: true })", 'archive sitemap chunks are not ordered by a stable key');

if (/fetchEligibleMovies[\s\S]*?\.order\('quality_score'[\s\S]*?\.range\(/.test(movieSitemap)) {
  failures.push('archive sitemap pagination still shifts when quality scores change');
}
if (/sitemapFiles\.map[\s\S]*?<lastmod>\$\{now\}/.test(sitemapIndex)) {
  failures.push('Supabase sitemap index still claims every child sitemap changed today');
}
if (/sitemapFiles\.map[\s\S]*?<lastmod>\$\{date\}/.test(sitemapGenerator)) {
  failures.push('static sitemap index still claims every child sitemap changed today');
}
if (movieSitemap.includes('<video:video>') || movieSitemap.includes('xmlns:video=')) {
  failures.push('movie information sitemap still advertises trailers as watch-page videos');
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', contracts: 14, failures: [] }, null, 2));
