import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const failures = [];
const releaseGate = read('scripts/release-gate.mjs');
const movieApi = read('src/services/movieApi.ts');
const detailProxy = read('supabase/functions/movie-detail-proxy/index.ts');
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
const reviewService = read('src/services/reviewService.ts');
const homeProxy = read('supabase/functions/home-proxy/index.ts');
const searchProxy = read('supabase/functions/search-index-proxy/index.ts');
const connectors = [
  'supabase/functions/sync-glvietsub-feed/index.ts',
  'supabase/functions/sync-onlyflix-feed/index.ts',
  'supabase/functions/sync-cobephim-feed/index.ts',
];

for (const step of ['schema:test', 'system:contracts', 'home:test', 'search:test', 'movie:data:test', 'watch:test', 'diagnostics:test']) {
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
if (!autoRepair.includes('penalizeTelemetryFailedStreams') || !autoRepair.includes("health_status: 'failed'")) {
  failures.push('viewer telemetry is not connected to persistent source health');
}
if (!navbar.includes('<StickyBanner />') || navbar.includes('!scrolled && <StickyBanner />')) {
  failures.push('top campaign banner disappears when the fixed header enters its scrolled state');
}

console.log(JSON.stringify({ status: failures.length ? 'failed' : 'passed', contracts: 5, connectors: connectors.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
