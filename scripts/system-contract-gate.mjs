import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const failures = [];
const releaseGate = read('scripts/release-gate.mjs');
const movieApi = read('src/services/movieApi.ts');
const detailProxy = read('supabase/functions/movie-detail-proxy/index.ts');
const playerBox = read('src/pages/movie-detail/components/PlayerBox.tsx');
const navbar = read('src/components/feature/Navbar.tsx');
const autoRepair = read('supabase/functions/auto-repair-player-issues/index.ts');
const identityPolicy = read('supabase/functions/_shared/movie-identity.ts');
const cronStagger = read('supabase/migrations/20260721162000_stagger_heavy_system_crons.sql');
const searchCronTuning = read('supabase/migrations/20260721164500_reduce_search_cache_rebuild_pressure.sql');
const indexingCronCleanup = read('supabase/migrations/20260721171000_remove_deprecated_google_indexing_cron.sql');
const viewerSourceRecovery = read('supabase/migrations/20260722213000_prioritize_viewer_source_recovery.sql');
const streamHealth = read('supabase/functions/stream-health-check/index.ts');
const ophimSync = read('supabase/functions/sync-ophim-movies/index.ts');
const blvietsubSync = read('supabase/functions/sync-blvietsub-feed/index.ts');
const glvietsubSync = read('supabase/functions/sync-glvietsub-feed/index.ts');
const motchillSync = read('supabase/functions/sync-motchill-feed/index.ts');
const catalogIntegrity = read('supabase/migrations/20260723073000_add_catalog_integrity_brain.sql');
const catalogRepairDispatcher = read('supabase/migrations/20260723074000_add_catalog_source_repair_dispatcher.sql');
const episodeSequenceRepair = read('supabase/migrations/20260724143000_repair_episode_sequence_gaps.sql');
const viewerReadCapacity = read('supabase/migrations/20260723077000_prioritize_viewer_reads_over_repair_backlog.sql');
const reviewService = read('src/services/reviewService.ts');
const homeProxy = read('supabase/functions/home-proxy/index.ts');
const searchProxy = read('supabase/functions/search-index-proxy/index.ts');
const cloudflareWorker = read('functions/[[path]].js');
const connectors = [
  'supabase/functions/sync-glvietsub-feed/index.ts',
  'supabase/functions/sync-onlyflix-feed/index.ts',
  'supabase/functions/sync-cobephim-feed/index.ts',
];

for (const brandColor of ['text-[#4799ff]', 'text-[#35c8ff]', 'from-[#25F4EE]/15', 'text-[#54c8ff]']) {
  if (!navbar.includes(brandColor)) failures.push(`desktop social icon is missing persistent brand color: ${brandColor}`);
}
if (!navbar.includes('drop-shadow-[0_0_5px_currentColor]') || navbar.includes('text-white/30 ${color}')) {
  failures.push('desktop social icons can still render dim before hover');
}

for (const step of ['schema:test', 'seo:upcoming:test', 'seo:ongoing:test', 'system:contracts', 'home:test', 'search:test', 'movie:data:test', 'watch:test', 'diagnostics:test']) {
  if (!releaseGate.includes(`['${step}']`)) failures.push(`release gate is missing ${step}`);
}

for (const file of connectors) {
  const source = read(file);
  if (!source.includes("from('movie_api_cache').delete()")) failures.push(`${file} does not invalidate movie detail cache`);
  if (!source.includes('const urlChanged')) failures.push(`${file} can overwrite health without checking URL identity`);
}
for (const file of connectors.slice(0, 2)) {
  if (!read(file).includes('findCanonicalMovieByIdentity')) failures.push(`${file} bypasses the shared movie identity policy`);
}
if (!identityPolicy.includes('A title without a verified year is not strong enough') || !identityPolicy.includes('canonicalPriority')) {
  failures.push('shared movie identity policy is missing year safety or canonical priority');
}
if (!cronStagger.includes("cron.unschedule('cobephim-smart-sync')") || !cronStagger.includes("'13,28,43,58 * * * *'")) {
  failures.push('heavy sync jobs are not deduplicated and staggered');
}
if (!searchCronTuning.includes("'17,47 * * * *'")) failures.push('full search-index safety rebuild runs too frequently');
if (!indexingCronCleanup.includes("cron.unschedule('auto-ping-google-daily')")) failures.push('deprecated Google Indexing API cron is still part of the control plane');
if (!ophimSync.includes(".eq('id', 'homepage_v3')") || !ophimSync.includes(".delete().in('slug', targets)")) {
  failures.push('OPhim sync must invalidate only changed movie caches and preserve stale homepage data');
}
if (ophimSync.includes("delete().neq('slug', '__never__')") || ophimSync.includes("home_page_cache').delete().neq")) {
  failures.push('OPhim sync still contains global cache deletion');
}
if (!homeProxy.includes('stale-if-error=86400') || !searchProxy.includes('stale-if-error=86400') || !detailProxy.includes('stale-if-error=86400')) {
  failures.push('critical read APIs do not preserve last-known-good data during upstream failure');
}
if (!cloudflareWorker.includes('?rev=canonical-v3')) {
  failures.push('Cloudflare detail cache was not versioned after the canonical alias contract changed');
}
if (
  detailProxy.includes('const verifiedAuxiliary = await fetchVerifiedAuxiliaryExternalDetail') ||
  !detailProxy.includes('edgeWaitUntil(\n        fetchVerifiedAuxiliaryExternalDetail')
) {
  failures.push('BLVietsub auxiliary discovery can still block a viewer-facing detail response');
}
if (
  !playerBox.includes("isDailymotion(embedSrc) ? 'strict-origin-when-cross-origin' : 'no-referrer'") ||
  playerBox.includes('referrerPolicy="no-referrer"')
) {
  failures.push('Dailymotion embeds can lose the cross-origin Referer required for playback');
}
if (
  !viewerReadCapacity.includes("'17 3 * * *'") ||
  !viewerReadCapacity.includes('scan_catalog_integrity(750)') ||
  !viewerReadCapacity.includes('dispatch_catalog_source_repairs(1)') ||
  !viewerReadCapacity.includes('process_movie_refresh_queue(10)')
) {
  failures.push('historical repair backlog can still starve viewer-facing Supabase reads');
}
if (ophimSync.includes('/auto-ping-new-movies') || blvietsubSync.includes('/auto-ping-new-movies')) {
  failures.push('source sync still calls the disabled Google Indexing API for ordinary movie URLs');
}
if (reviewService.includes('/google-index-ping') || reviewService.includes('pingGoogleIndex(')) {
  failures.push('review saves still call the disabled Google Indexing API');
}

if (!detailProxy.includes("from('streams')") || !detailProxy.includes('source_health_status')) {
  failures.push('movie-detail-proxy does not expose the stored stream-health contract');
}
if (!detailProxy.includes('hasUnhealthyExpectedCoverage') || !detailProxy.includes('shouldRepairUnhealthyCoverage')) {
  failures.push('complete episode counts can still hide unhealthy playback coverage');
}
if (!detailProxy.includes('hasUnverifiedSingleProviderCoverage') || !detailProxy.includes('shouldRepairUnverifiedCoverage')) {
  failures.push('unchecked single-provider catalogues cannot request an independent playback backup');
}
if (!streamHealth.includes('streamc\\.xyz') || !streamHealth.includes("Referer = 'https://khophim.org/'")) {
  failures.push('StreamC health probes do not use the production playback referer');
}
if (!detailProxy.includes("provider === 'phimapi'") || !detailProxy.includes('providerRank')) {
  failures.push('external repair does not preserve and prefer an independent PhimAPI backup on equal coverage');
}
if (!streamHealth.includes('probeStreamRow') || !streamHealth.includes('HTML 404/deleted-video page')) {
  failures.push('stream health does not validate both stored playback URLs and HTML error pages');
}
if (!viewerSourceRecovery.includes('stream-health-problem-every-15-minutes') || !viewerSourceRecovery.includes('auto-repair-player-issues-every-10-minutes')) {
  failures.push('viewer-facing health and telemetry recovery are not prioritized by cron');
}
if (!detailProxy.includes("healthStatus === 'dead' && failureCount >= 2") || !detailProxy.includes('getExpectedEpisodeNumber(liveMovie')) {
  failures.push('detail cache or source filtering can hide new episodes after one transient probe failure');
}
if (!detailProxy.includes('phimapi.com/v1/api/tim-kiem') || !detailProxy.includes('initialExternalMax < expectedEpisode')) {
  failures.push('detail repair cannot resolve renamed PhimAPI slugs safely');
}
if (!movieApi.includes('source_health_status') || !movieApi.includes('source_failure_count')) {
  failures.push('frontend source selection does not consume the backend health contract');
}
if (!autoRepair.includes('penalizeTelemetryFailedStreams') || !autoRepair.includes('independent probe required') || autoRepair.includes("last_error: 'Viewer telemetry: repeated fatal playback failure'")) {
  failures.push('viewer telemetry can disable a stream without an independent probe');
}
if (!ophimSync.includes('canonicalCandidateScore') || !ophimSync.includes('canonicalCandidateScore(match) >= canonicalCandidateScore(exactMatch) + 40')) {
  failures.push('OPhim exact-slug shells can outrank a substantially more complete same-title/year canonical movie');
}
if (!ophimSync.includes('runDatabaseMutationWithRetry') || !ophimSync.includes('upsertEpisodeRowsSafely')) {
  failures.push('OPhim sync can lose a movie update to a deadlock or normalized episode uniqueness conflict');
}
if (!ophimSync.includes('isCuratedCatalogMovie') || !ophimSync.includes('.filter((row) => !isCuratedCatalogMovie(row))')) {
  failures.push('OPhim sync can attach external episode rows directly to curated BL/admin movies');
}
if (!ophimSync.includes("existingSource.includes('merged')") || !ophimSync.includes('if (result.retired)')) {
  failures.push('OPhim sync can republish or continue mutating a safely merged duplicate');
}
if (!identityPolicy.includes('Math.min(currentEpisode, 200) * 20')) {
  failures.push('shared canonical identity policy does not prioritize real episode completeness');
}
if (!motchillSync.includes('skipped_unplayable') || !glvietsubSync.includes('/HTTP\\s+(404|410)\\b/i')) {
  failures.push('removed or unplayable archive pages still poison connector health');
}
if (
  !catalogIntegrity.includes('create table if not exists public.catalog_integrity_issues') ||
  !catalogIntegrity.includes('scan_catalog_integrity') ||
  !catalogIntegrity.includes("'review_only'") ||
  !catalogIntegrity.includes("active := false")
) {
  failures.push('catalog integrity brain is missing its safe issue queue, bounded scanner, review-only duplicate policy, or empty-source circuit');
}
if (
  !catalogIntegrity.includes("lower(coalesce(m.source_site, '')) <> 'tmdb-catalog'") ||
  !catalogRepairDispatcher.includes('dispatch_catalog_source_repairs') ||
  !catalogRepairDispatcher.includes('reconcile_catalog_source_repairs') ||
  !catalogRepairDispatcher.includes('issue.attempts < 3') ||
  !catalogRepairDispatcher.includes('for update of issue skip locked') ||
  !catalogRepairDispatcher.includes('&episodes=1&strict_missing_detail=1')
) {
  failures.push('catalog source repair is not bounded, isolated, retry-limited, or trailer-catalog safe');
}
if (
  !episodeSequenceRepair.includes("'episode_sequence_gap'") ||
  !episodeSequenceRepair.includes('generate_series(1, m.current_episode)') ||
  !episodeSequenceRepair.includes("'?movie_id=' || item.movie_id") ||
  !ophimSync.includes('fetchDetailForTarget') ||
  !ophimSync.includes('provider.searchPath(query)') ||
  !ophimSync.includes(".ilike('last_error', 'Viewer telemetry:%')")
) {
  failures.push('episode sequence gaps or telemetry-only source recovery are not repaired through stable cross-provider movie identity');
}
if (!navbar.includes('<StickyBanner />') || navbar.includes('!scrolled && <StickyBanner />')) {
  failures.push('top campaign banner disappears when the fixed header enters its scrolled state');
}

console.log(JSON.stringify({ status: failures.length ? 'failed' : 'passed', contracts: 7, connectors: connectors.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
