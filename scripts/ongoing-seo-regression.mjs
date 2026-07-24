import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const failures = [];

const migration = read('supabase/migrations/20260723043000_upgrade_ongoing_movie_seo_brain.sql');
const isolation = read('supabase/migrations/20260723060000_isolate_movie_refresh_brains.sql');
const queueTuning = read('supabase/migrations/20260723061500_tune_movie_refresh_queue_throughput.sql');
const legacyCleanup = read('supabase/migrations/20260723063000_remove_legacy_inline_seo_triggers.sql');
const episodeTruth = read('supabase/migrations/20260723064000_enforce_playable_episode_truth.sql');
const episodeTruthScanner = read('supabase/migrations/20260723065000_add_episode_truth_scanner.sql');
const unifiedEpisodeTruth = read('supabase/migrations/20260723066000_unify_playable_episode_truth.sql');
const guardedEpisodeTruthScanner = read('supabase/migrations/20260723067000_guard_episode_truth_scanner_direction.sql');
const capacityScheduler = read('supabase/migrations/20260723068000_capacity_aware_cron_scheduler.sql');
const episodeNumberSanity = read('supabase/migrations/20260723069000_guard_episode_number_sanity.sql');
const sitemap = read('supabase/functions/sitemap-movies-xml/index.ts');
const prerenderData = read('supabase/functions/movie-seo-prerender-data/index.ts');
const worker = read('functions/[[path]].js');
const gsc = read('supabase/functions/gsc-seo-feedback/index.ts');
const sitemapGenerator = read('scripts/generate-sitemap-index.mjs');
const movieSitemapGenerator = read('scripts/generate-movie-sitemap-chunks.mjs');
const redirects = read('public/_redirects');

const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};

requireText(migration, "index_tier in ('blocked', 'upcoming', 'ongoing', 'playable')", 'ongoing lifecycle tier is missing');
requireText(migration, 'latest_episode_number', 'quality brain does not persist the latest playable episode');
requireText(migration, 'declared_total_episodes', 'quality brain does not persist declared episode totals');
requireText(migration, 'episode_progress_percent', 'quality brain does not calculate airing progress');
requireText(migration, 'last_episode_change_at', 'quality brain cannot distinguish episode updates from metadata edits');
requireText(migration, 'freshness_score', 'ongoing movies have no deterministic freshness score');
requireText(migration, "'next_episode_scheduled'", 'next-episode schedules are not represented as signals');
requireText(migration, "'stale_ongoing'", 'stale ongoing metadata cannot be observed');
requireText(migration, 'excluded.latest_episode_number <> q.latest_episode_number', 'episode freshness is incorrectly refreshed by metadata-only edits');
requireText(migration, 'refresh_ongoing_movie_seo_quality', 'ongoing catalogue has no rotating refresh');
requireText(isolation, 'create table if not exists public.movie_refresh_queue', 'ingestion and SEO brains have no isolation queue');
requireText(isolation, 'on conflict (movie_id) do update', 'episode bursts are not deduplicated per movie');
requireText(isolation, 'for update skip locked', 'parallel queue workers can process the same movie');
requireText(queueTuning, 'process_movie_refresh_queue(25)', 'queue worker cannot keep up with active sync throughput');
requireText(isolation, "'* * * * *'", 'movie refresh queue is not processed continuously');
requireText(isolation, "'17 3 * * *'", 'ongoing freshness maintenance has no low-traffic schedule');
requireText(isolation, "'refresh-movie-seo-quality-hourly'", 'legacy 1500-movie cron is not explicitly removed');
requireText(isolation, "'refresh-ongoing-movie-seo-quality'", 'legacy ongoing cron is not explicitly removed');
requireText(isolation, 'enqueue_movie_refresh_after_episode_change', 'episode changes still perform expensive inline reconciliation');
requireText(isolation, "current_setting('app.movie_refresh_processing', true)", 'queue reconciliation can recursively enqueue itself');
requireText(isolation, 'next_attempt_at = now() + make_interval', 'failed refreshes have no retry backoff');
requireText(isolation, "then 'Tập ' || max_episode::text", 'episode reconciliation can write corrupted labels');
requireText(legacyCleanup, 'drop trigger if exists movies_refresh_seo_quality', 'legacy movie SEO trigger still bypasses the queue');
requireText(legacyCleanup, 'drop trigger if exists movie_episodes_refresh_seo_quality', 'legacy movie_episodes SEO trigger still bypasses the queue');
requireText(legacyCleanup, 'drop trigger if exists episodes_refresh_seo_quality', 'legacy episodes SEO trigger still bypasses the queue');
requireText(episodeTruth, 'advertised_episode is distinct from max_episode', 'episode metadata is not capped to playable truth');
requireText(episodeTruth, "episode_current = 'Đang cập nhật'", 'movies without playable links still advertise phantom episodes');
requireText(episodeTruth, "array['episode_truth_repair']", 'existing episode discrepancies are not queued for repair');
requireText(episodeTruthScanner, 'cursor_movie_id uuid', 'historical episode drift scanner has no cursor');
requireText(episodeTruthScanner, 'limit batch_limit', 'historical drift scanner is unbounded');
requireText(episodeTruthScanner, "'2-59/5 * * * *'", 'historical drift scanner has no safe recurring schedule');
requireText(unifiedEpisodeTruth, 'get_movie_playable_max_episode', 'playable episode truth is duplicated across systems');
requireText(unifiedEpisodeTruth, 'from public.streams s', 'active streams are excluded from playable episode truth');
requireText(unifiedEpisodeTruth, 'public.get_movie_playable_max_episode(m.id)', 'scanner does not use shared playable episode truth');
requireText(guardedEpisodeTruthScanner, 'item.advertised_episode > item.playable_episode', 'truth scanner can create upward metadata churn');
requireText(guardedEpisodeTruthScanner, "q.reasons = array['episode_truth_scan']::text[]", 'scanner-only false-positive work is not cleaned safely');
requireText(capacityScheduler, 'with latest_runs as materialized', 'operations health still repeats cron history scans per job');
requireText(capacityScheduler, "'capacity_aware_60_connections'", 'scheduler has no capacity profile');
requireText(capacityScheduler, 'limit=40&concurrency=3', 'stream health exceeds the safe viewer-recovery batch');
requireText(capacityScheduler, "'cleanup-cron-history-daily'", 'cron history has no retention policy');
requireText(episodeNumberSanity, "max_episode = declared_total", 'completion labels can exceed declared totals');
requireText(episodeNumberSanity, "[0-9]{1,4}", 'stream identifiers can be mistaken for episode numbers');
requireText(episodeNumberSanity, "'invalid_completion_label_repair'", 'existing impossible completion labels are not queued');

requireText(sitemap, 'fetchEligibleOngoingMovies', 'ongoing sitemap scans the broad movie table');
requireText(sitemap, ".eq('index_tier', 'ongoing')", 'ongoing sitemap is not quality-gated');
requireText(sitemap, "url.searchParams.get('ongoing') === '1'", 'sitemap endpoint has no ongoing mode');
requireText(sitemap, "isOngoingTier(movie) ? 'daily'", 'ongoing sitemap has no active crawl hint');
requireText(sitemap, "return '0.98'", 'fresh ongoing movies are not prioritized');
requireText(sitemap, "'public, max-age=300, s-maxage=600, stale-while-revalidate=1800'", 'ongoing sitemap cache can hide new episodes for too long');

requireText(prerenderData, 'seo_latest_episode_number', 'prerender does not expose latest episode state');
requireText(prerenderData, 'seo_last_episode_change_at', 'prerender does not expose episode freshness');
requireText(worker, "qualityTier === 'playable' || qualityTier === 'ongoing'", 'Cloudflare blocks approved ongoing pages');
requireText(worker, 'Phim đang chiếu và cập nhật tập mới', 'ongoing prerender lacks visible status context');
requireText(worker, "'public, max-age=300, s-maxage=600, stale-while-revalidate=1800'", 'ongoing prerender cache can hide new episode metadata for too long');
requireText(worker, "'@type': 'Episode'", 'ongoing structured data lacks Episode information');
requireText(worker, '/sitemap-movies-ongoing.xml', 'Cloudflare sitemap routing omits ongoing movies');
requireText(sitemapGenerator, "'sitemap-movies-ongoing.xml'", 'generated root sitemap omits ongoing movies');
requireText(movieSitemapGenerator, 'fetchSitemapWithLastKnownGood', 'a transient Supabase outage can break the entire frontend build');
requireText(redirects, '/sitemap-movies-ongoing.xml', 'static fallback routing omits ongoing movies');

requireText(gsc, "item.tier === 'ongoing' && item.episodeChangedAt > lastInspection", 'GSC does not re-inspect a movie after a new episode');
requireText(gsc, "item.tier === 'ongoing' ? 3", 'GSC does not prioritize actively airing movies');

console.log(JSON.stringify({
  status: failures.length ? 'failed' : 'passed',
  contracts: 61,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
