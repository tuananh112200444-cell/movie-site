import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const failures = [];

const migration = read('supabase/migrations/20260723033000_upgrade_upcoming_movie_seo_brain.sql');
const staleTrailerRepair = read('supabase/migrations/20260920173000_reconcile_stale_trailer_playback.sql');
const sitemap = read('supabase/functions/sitemap-movies-xml/index.ts');
const prerenderData = read('supabase/functions/movie-seo-prerender-data/index.ts');
const worker = read('functions/[[path]].js');
const gsc = read('supabase/functions/gsc-seo-feedback/index.ts');
const tmdb = read('supabase/functions/sync-tmdb-catalog/index.ts');
const cinemaTrailers = read('supabase/functions/sync-vietnam-cinema-trailers/index.ts');
const cinemaSchedule = read('supabase/migrations/20260920191500_schedule_fresh_cinema_trailer_discovery.sql');
const trailerSchedulerRepair = read('supabase/migrations/20260920193000_repair_trailer_scheduler_secret.sql');
const trailerSchedulerActivation = read('supabase/migrations/20260920194000_activate_trailer_discovery_jobs.sql');
const watchIntentGate = read('supabase/migrations/20260920201000_align_seo_gate_with_watch_intent.sql');
const sitemapGenerator = read('scripts/generate-sitemap-index.mjs');
const staticCatalog = read('supabase/functions/static-seo-catalog/index.ts');
const staticPages = read('scripts/generate-static-movie-pages.mjs');

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
requireText(staleTrailerRepair, 'reconcile_stale_trailer_playback', 'stale trailer/playable records do not have a targeted repair function');
requireText(staleTrailerRepair, 'public.get_movie_playable_max_episode(m.id) > 0', 'stale trailer repair does not verify playable episodes before promotion');
requireText(staleTrailerRepair, 'public.reconcile_movie_release_state(item.id)', 'stale trailer repair does not reuse the shared release-state truth');
requireText(staleTrailerRepair, "'7-59/10 * * * *'", 'stale trailer repair is not scheduled frequently enough');

requireText(sitemap, 'hasSeoBase(movie, 120) && hasHttpsTrailer(movie)', 'upcoming sitemap lacks a strict content/trailer gate');
requireText(sitemap, "eq('index_tier', 'upcoming')", 'upcoming sitemap still scans the entire movie catalogue instead of the eligible tier');
requireText(sitemap, ".gte('quality_score', 88)", 'upcoming sitemap quality threshold differs from the verified static cohort');
requireText(sitemap, ".gte('content_length', 350)", 'upcoming sitemap synopsis threshold differs from the verified static cohort');
requireText(sitemap, "isHighValueCohortMovie(movie, options.mode === 'upcoming')", 'upcoming sitemap rejects its own eligible tier');
requireText(sitemap, "hasOfficialTrailerUrl(movie.trailer_url)", 'upcoming sitemap accepts arbitrary HTTPS URLs instead of an official trailer');
requireText(sitemap, 'fetchEligibleUpcomingMovies(Math.max(200, options.outputLimit * 10))', 'upcoming sitemap limits database candidates before the final content filter and misses good pages');
requireText(sitemap, 'qualityByMovieId.get(movie.id) === true', 'sitemap admits unchecked database movies');
requireText(sitemap, '.filter((movie) => isUpcoming(movie) || isTrailer(movie))', 'upcoming sitemap is empty or unfiltered');
if (sitemap.includes('xmlns:video=') || sitemap.includes('<video:video>')) {
  failures.push('movie information sitemap must not claim trailer watch-page eligibility');
}

requireText(prerenderData, 'seo_eligible_for_index', 'prerender API does not expose the database quality decision');
requireText(prerenderData, ": 'unreviewed'", 'legacy playable pages have no safe compatibility state while quality coverage expands');
requireText(prerenderData, 'seo_index_tier', 'prerender API does not expose lifecycle tier');
requireText(worker, "const upcoming = tier === 'upcoming';", 'Cloudflare has no explicit, bounded upcoming index cohort');
requireText(worker, "(upcoming ? 88 : 85)", 'upcoming pages do not use a stricter quality threshold');
requireText(worker, "(upcoming ? 350 : 500)", 'upcoming pages do not require a substantial synopsis');
requireText(worker, "!hasPlayableMovieEvidence(movie)", 'upcoming pages are not kept separate from playable pages');
requireText(worker, 'const automaticIndexable = isHighValueIndexCandidate(movie)', 'Cloudflare prerender does not honor the strict public cohort gate');
if (worker.includes("'@type': 'VideoObject'") || worker.includes('embedUrl: trailerEmbedUrl')) {
  failures.push('movie information pages must not expose complementary trailers as VideoObject watch pages');
}
requireText(worker, '<h2>Trailer ${escapeHtml(name)}</h2>', 'eligible trailer pages must keep a visible trailer for users');
requireText(worker, "'sitemap-movies-upcoming.xml'", 'root sitemap index does not submit the static upcoming cohort');
requireText(worker, '20260916-upcoming-cohort-parity-v2', 'upcoming sitemap cache was not invalidated after the cohort repair');
if (worker.includes("|| pathname === '/sitemap-movies-upcoming.xml'")) {
  throw new Error('upcoming sitemap is incorrectly retired by the legacy chunk cleanup route');
}
requireText(sitemapGenerator, "'sitemap-movies-upcoming.xml'", 'generated root sitemap omits the static upcoming cohort');
requireText(staticCatalog, 'UPCOMING_COHORT_LIMIT = 20', 'static upcoming cohort is not capped at 20 movies');
requireText(staticCatalog, "const upcomingCohort = requestedCohort === 'upcoming';", 'static catalogue has no dedicated upcoming mode');
requireText(staticCatalog, 'hasOfficialTrailerUrl(movie.trailer_url)', 'static upcoming cohort accepts untrusted trailer URLs');
requireText(staticCatalog, 'seo_index_tier: movie.seo_index_tier', 'verified editorial profiles can overwrite the upcoming lifecycle tier');
requireText(staticPages, "const upcomingSitemapFile = 'sitemap-movies-upcoming.xml'", 'build does not generate a static upcoming sitemap');
requireText(staticPages, "potentialAction: canAdvertiseWatch ?", 'upcoming or editorial information pages incorrectly advertise a WatchAction');
requireText(staticPages, 'data-kp-upcoming=', 'upcoming static HTML has no lifecycle marker');

requireText(gsc, 'Promise.allSettled', 'one Search Console subsystem failure still aborts all SEO feedback');
requireText(gsc, "tier === 'upcoming'", 'GSC inspection does not prioritize newly indexable upcoming pages');
requireText(gsc, '/429|403|disabled/i', 'GSC inspection can repeatedly hammer a disabled or throttled API');
requireText(tmdb, "language: 'vi-VN'", 'TMDB discovery does not request Vietnamese metadata');
requireText(tmdb, "include_video_language: 'vi,en,null'", 'TMDB discovery does not request trailer language fallbacks');
requireText(tmdb, "import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';", 'TMDB discovery does not import its Edge Function server runtime');
requireText(tmdb, 'const SYNC_SECRETS = [', 'TMDB discovery does not accept the scheduler secret');
requireText(cinemaTrailers, "const SOURCE_ORIGIN = 'https://moveek.com'", 'Cinema trailer discovery has no public Vietnamese cinema catalogue source');
requireText(cinemaTrailers, "import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';", 'Cinema trailer discovery does not import its Edge Function server runtime');
requireText(cinemaTrailers, 'const SYNC_SECRETS = [', 'Cinema trailer discovery does not accept the scheduler secret');
requireText(cinemaTrailers, 'data-video-url', 'Cinema trailer discovery does not verify the official trailer published on the source page');
requireText(cinemaTrailers, 'https://www.youtube.com/watch?v=${videoId}', 'Cinema trailer discovery must store a canonical official YouTube trailer URL');
requireText(cinemaTrailers, "status: 'trailer'", 'Cinema trailer discoveries are not classified as trailer pages');
requireText(cinemaTrailers, 'schedule_type: null', 'Cinema trailer discovery incorrectly uses the episodic schedule field');
requireText(cinemaTrailers, "source_site: 'moveek-cinema'", 'Cinema trailer discoveries have no traceable source identity');
requireText(cinemaTrailers, "if (existing && hasPlayableEvidence(existing)) return 'skipped';", 'Cinema trailer discovery can overwrite a playable movie with a trailer record');
requireText(cinemaSchedule, "'sync-vietnam-cinema-trailers'", 'Vietnamese cinema trailer discovery is not scheduled');
requireText(cinemaSchedule, "'7 */2 * * *'", 'Vietnamese cinema trailer discovery does not refresh frequently enough');
requireText(cinemaSchedule, "'sync-tmdb-catalog-daily'", 'TMDB discovery scheduler is not restored when missing');
requireText(trailerSchedulerRepair, 'VIETNAM_CINEMA_TRAILER_SECRET', 'Trailer scheduler has no dedicated shared secret');
requireText(trailerSchedulerRepair, "'sync-vietnam-cinema-trailers'", 'Trailer scheduler secret repair does not update the cinema job');
requireText(trailerSchedulerActivation, 'active := true', 'Trailer discovery jobs can remain paused after repair');
requireText(watchIntentGate, "if content_len < 120 then issues := array_append(issues, 'thin_content'); end if;", 'watch-intent SEO gate does not retain a meaningful content floor');
requireText(watchIntentGate, "tier := case when eligible and ongoing_candidate then 'ongoing' when eligible then 'playable' else 'blocked' end;", 'watch-intent SEO gate does not classify qualified public pages as indexable');
requireText(watchIntentGate, "q.reasons @> array['missing_trailer']", 'existing trailer-blocked pages are not rechecked after the policy change');

console.log(JSON.stringify({
  status: failures.length ? 'failed' : 'passed',
  contracts: 25,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
