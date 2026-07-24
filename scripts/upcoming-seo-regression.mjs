import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const failures = [];

const migration = read('supabase/migrations/20260723033000_upgrade_upcoming_movie_seo_brain.sql');
const sitemap = read('supabase/functions/sitemap-movies-xml/index.ts');
const prerenderData = read('supabase/functions/movie-seo-prerender-data/index.ts');
const worker = read('functions/[[path]].js');
const gsc = read('supabase/functions/gsc-seo-feedback/index.ts');
const tmdb = read('supabase/functions/sync-tmdb-catalog/index.ts');
const sitemapGenerator = read('scripts/generate-sitemap-index.mjs');

const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};

requireText(migration, "index_tier in ('blocked', 'upcoming', 'playable')", 'upcoming migration has no explicit lifecycle tiers');
requireText(migration, "issues := array_append(issues, 'missing_trailer')", 'upcoming pages can pass without a real trailer');
requireText(migration, "content_len < 120", 'upcoming pages can pass with thin content');
requireText(migration, 'fresh_demand_signal', 'upcoming pages have no freshness or demand guard');
requireText(migration, 'reconcile_movie_release_state', 'episode arrival cannot promote stale trailer records');
requireText(migration, 'greatest(coalesce(episode_number, 0)::integer, 1)', 'playable rows with missing episode numbers cannot leave trailer state');
requireText(migration, 'reconcile_movie_after_movie_episode_change', 'episode tables do not trigger lifecycle reconciliation');
requireText(migration, "'*/30 * * * *'", 'SEO quality coverage is not refreshed at least twice per hour');
requireText(migration, "'20 */6 * * *'", 'TMDB hot/upcoming discovery is not scheduled throughout the day');

requireText(sitemap, 'hasSeoBase(movie, 120) && hasHttpsTrailer(movie)', 'upcoming sitemap lacks a strict content/trailer gate');
requireText(sitemap, "eq('index_tier', 'upcoming')", 'upcoming sitemap still scans the entire movie catalogue instead of the eligible tier');
requireText(sitemap, 'qualityByMovieId.get(movie.id) === true', 'sitemap admits unchecked database movies');
requireText(sitemap, '.filter((movie) => isUpcoming(movie) || isTrailer(movie))', 'upcoming sitemap is empty or unfiltered');
requireText(sitemap, 'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"', 'trailer sitemap lacks video namespace');
requireText(sitemap, '<video:player_loc allow_embed="yes">', 'trailer sitemap lacks an embeddable player URL');

requireText(prerenderData, 'seo_eligible_for_index', 'prerender API does not expose the database quality decision');
requireText(prerenderData, ": 'unreviewed'", 'legacy playable pages have no safe compatibility state while quality coverage expands');
requireText(prerenderData, 'seo_index_tier', 'prerender API does not expose lifecycle tier');
requireText(worker, "qualityTier === 'upcoming'", 'Cloudflare prerender does not honor upcoming quality approval');
requireText(worker, '!qualityChecked', 'legacy playable pages lose indexing before asynchronous quality coverage reaches them');
requireText(worker, "'@type': 'VideoObject'", 'eligible trailer pages lack VideoObject schema');
requireText(worker, 'embedUrl: trailerEmbedUrl', 'VideoObject does not identify the actual trailer');
requireText(worker, '<loc>${SITE_URL}/sitemap-movies-upcoming.xml</loc>', 'root sitemap index omits upcoming movies');
if (worker.includes("|| pathname === '/sitemap-movies-upcoming.xml'")) {
  throw new Error('upcoming sitemap is incorrectly retired by the legacy chunk cleanup route');
}
requireText(sitemapGenerator, "'sitemap-movies-upcoming.xml'", 'generated sitemap index omits upcoming movies');

requireText(gsc, 'Promise.allSettled', 'one Search Console subsystem failure still aborts all SEO feedback');
requireText(gsc, "tier === 'upcoming'", 'GSC inspection does not prioritize newly indexable upcoming pages');
requireText(gsc, '/429|403|disabled/i', 'GSC inspection can repeatedly hammer a disabled or throttled API');
requireText(tmdb, "language: 'vi-VN'", 'TMDB discovery does not request Vietnamese metadata');
requireText(tmdb, "include_video_language: 'vi,en,null'", 'TMDB discovery does not request trailer language fallbacks');

console.log(JSON.stringify({
  status: failures.length ? 'failed' : 'passed',
  contracts: 25,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
