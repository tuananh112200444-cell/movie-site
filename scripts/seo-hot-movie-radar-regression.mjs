import fs from 'node:fs';

const checks = [];

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(path, snippets) {
  const source = read(path);
  for (const [snippet, message] of snippets) {
    checks.push([source.includes(snippet), `${path}: ${message}`]);
  }
}

requireText('supabase/migrations/20260910171118_add_hot_movie_seo_radar.sql', [
  ['create table if not exists public.seo_hot_movie_runs', 'missing radar run history'],
  ['create table if not exists public.seo_hot_movie_candidates', 'missing hot candidate table'],
  ['create table if not exists public.seo_hot_movie_aliases', 'missing reviewed identity aliases'],
  ['enable row level security', 'new tables must enable RLS'],
  ['revoke all on table public.seo_hot_movie_candidates from public, anon, authenticated', 'hot candidate data must not be publicly exposed'],
  ['match_seo_hot_movie_candidate', 'missing conservative catalogue matcher'],
  ['refresh_seo_hot_movie_work_items', 'missing work-queue integration'],
  ["'12 */6 * * *'", 'radar is not scheduled every six hours'],
]);

requireText('supabase/migrations/20260926100000_connect_hot_radar_to_trailer_catalog.sql', [
  ["replace(document.normalized_name, ' ', '') = compact_title_key", 'exact hot-movie matching does not share the compact catalogue key'],
  ["document.normalized_name operator(extensions.%) compact_title_key", 'fuzzy matching still compares incompatible normalized title formats'],
]);

requireText('supabase/functions/seo-hot-movie-radar/index.ts', [
  ['verifyAdminRequest', 'manual runs are not protected by admin authentication'],
  ['BOX_OFFICE_URL', 'Vietnam box-office signal is missing'],
  ['NETFLIX_VIETNAM_URL', 'Netflix Vietnam signal is missing'],
  ['get_top10_movies_today', 'first-party demand signal is missing'],
  ['match_seo_hot_movie_candidate', 'radar does not use reviewed identity matching'],
  ['probePage', 'production HTTP/robots/canonical verification is missing'],
  ['loadSitemapText', 'sitemap membership verification is missing'],
  ['refresh_seo_hot_movie_work_items', 'radar does not update the operations queue'],
  ['verifiedCinemaFromHtml', 'verified cinema metadata is not extracted for missing hot movies'],
  ['importVerifiedCinemaMovie', 'verified missing cinema movies are not imported automatically'],
  ['refresh_movie_seo_quality', 'automatic cinema imports do not enter the SEO quality pipeline'],
]);

requireText('supabase/functions/static-seo-catalog/index.ts', [
  ["['moveek-cinema', 'phongveviet-cinema']", 'verified cinema imports cannot enter the upcoming static catalogue'],
  ['tmdbId > 0 || trustedCinemaSource', 'static publication still requires TMDB for trusted cinema records'],
]);

const staticCatalogue = read('supabase/functions/static-seo-catalog/index.ts');
checks.push([
  !staticCatalogue.includes(".not('movies.tmdb_id', 'is', null)"),
  'static catalogue query discards verified cinema records before the trusted-source quality gate',
]);

requireText('supabase/functions/gsc-seo-feedback/index.ts', [
  ["from('seo_hot_movie_runs')", 'SEO dashboard API omits the latest radar run'],
  ["from('seo_hot_movie_candidates')", 'SEO dashboard API omits hot candidates'],
]);

requireText('src/pages/admin-seo/page.tsx', [
  ['data-kp-hot-movie-radar="true"', 'admin dashboard has no hot-movie radar panel'],
  ["label: 'Phim hot'", 'admin dashboard has no hot-movie tab'],
  ['HOT_MOVIE_RADAR_URL', 'admin cannot trigger a bounded manual refresh'],
  ['Nhu cầu thật trước, chỉnh SEO sau', 'radar does not communicate the evidence-first workflow'],
]);

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`SEO hot-movie radar regression passed (${checks.length} checks).`);
