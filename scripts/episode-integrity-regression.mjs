import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeVerifiedSeasonNumbering } from '../supabase/functions/_shared/episode-numbering.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260811124000_fix_episode_playback_integrity.sql'),
  'utf8',
);
const healthAwareMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260811133000_make_episode_truth_health_aware.sql'),
  'utf8',
);
const selfHealingMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260812090000_harden_playback_self_healing.sql'),
  'utf8',
);
const reconciliationPriorityMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260812093000_prioritize_public_playback_reconciliation.sql'),
  'utf8',
);
const durableCoverageGapMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260812103000_detect_episode_gaps_beyond_downgraded_metadata.sql'),
  'utf8',
);
const syncSource = fs.readFileSync(path.join(root, 'supabase/functions/sync-ophim-movies/index.ts'), 'utf8');
const proxySource = fs.readFileSync(path.join(root, 'supabase/functions/movie-detail-proxy/index.ts'), 'utf8');
const healthCheckSource = fs.readFileSync(path.join(root, 'supabase/functions/stream-health-check/index.ts'), 'utf8');
const sourceHealthFunction = fs.readFileSync(path.join(root, 'supabase/functions/player-source-health/index.ts'), 'utf8');
const moviePageSource = fs.readFileSync(path.join(root, 'src/pages/movie-detail/page.tsx'), 'utf8');
const sourceHealthClient = fs.readFileSync(path.join(root, 'src/services/playerSourceHealth.ts'), 'utf8');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const server = (start, end) => ({
  server_name: 'Vietsub #1',
  server_data: Array.from({ length: end - start + 1 }, (_, index) => {
    const number = start + index;
    return { name: String(number), slug: String(number), link_m3u8: `https://media.test/${number}.m3u8` };
  }),
});

const cumulative = normalizeVerifiedSeasonNumbering(
  {
    name: 'Mọi Lúc Mọi Nơi (Phần 4)',
    origin_name: 'Whenever Possible (Season 4)',
    episode_current: 'Hoàn tất (52/52)',
    episode_total: '52 Tập',
    tmdb: { id: 247805, type: 'tv', season: 4 },
  },
  [server(36, 52)],
);
expect(cumulative.normalization?.rawStart === 36, 'verified cumulative range was not detected');
expect(cumulative.normalization?.canonicalTotal === 17, 'cumulative season total was not normalized to 17');
expect(cumulative.episodes[0].server_data?.[0]?.slug === 'tap-01', 'first cumulative episode was not normalized to tap-01');
expect(cumulative.episodes[0].server_data?.at(-1)?.slug === 'tap-17', 'last cumulative episode was not normalized to tap-17');
expect(cumulative.movie.episode_current === 'Hoàn Tất (17/17)', 'completed season metadata was not normalized');

const local = normalizeVerifiedSeasonNumbering(
  {
    name: 'Mọi Lúc Mọi Nơi (Phần 4)',
    origin_name: 'Whenever Possible (Season 4)',
    episode_current: 'Tập 6',
    episode_total: 10,
    tmdb: { id: 247805, type: 'tv', season: 4 },
  },
  [server(1, 6)],
);
expect(local.normalization === null, 'already-local provider numbering must remain unchanged');

const gapped = normalizeVerifiedSeasonNumbering(
  {
    name: 'Example (Phần 3)', origin_name: 'Example (Season 3)',
    episode_current: '20/20', episode_total: 20, tmdb: { id: 1, season: 3 },
  },
  [{ server_name: 'A', server_data: [server(11, 11).server_data[0], server(13, 20).server_data[0]] }],
);
expect(gapped.normalization === null, 'gapped provider range must not be guessed');

const overlapping = normalizeVerifiedSeasonNumbering(
  {
    name: 'Example (Phần 2)', origin_name: 'Example (Season 2)',
    episode_current: '15/15', episode_total: 15, tmdb: { id: 2, season: 2 },
  },
  [server(6, 15)],
);
expect(overlapping.normalization === null, 'overlapping raw/canonical ranges must be quarantined');

expect(migration.includes('reconcile_movie_after_stream_health_change'), 'stream health reconciliation trigger is missing');
expect(migration.includes('normalize_verified_cumulative_season_numbering'), 'verified numbering RPC is missing');
expect(migration.includes('delete from public.movie_api_cache'), 'stream/number changes do not invalidate detail cache');
expect(healthAwareMigration.includes('get_movie_playable_episode_numbers'), 'playable episode truth is not health-aware');
expect(healthAwareMigration.includes('stream_row_is_publicly_usable'), 'gap scanner does not share the public stream health contract');
expect(healthAwareMigration.includes("'health_aware_movie_identity_v3'"), 'gap repair contract is not health-aware');
expect(syncSource.includes("rpc(\n      'normalize_verified_cumulative_season_numbering'"), 'sync does not reconcile persisted cumulative rows');
expect(
  syncSource.includes('const alreadyNormalized =')
    && syncSource.includes('storedNumbers.every((number) => number <= canonicalTotal)')
    && syncSource.includes('canonicalNumbers.size === canonicalTotal'),
  'verified season normalization is not idempotent for an already canonical provider range',
);
expect(proxySource.includes('normalizeVerifiedSeasonNumbering'), 'edge fallback does not normalize provider numbering');
expect(
  proxySource.match(/healthStatus === 'dead' \|\| \(healthStatus === 'failed' && failureCount >= 3\)/g)?.length >= 2,
  'movie detail proxy can still expose a source already confirmed dead',
);
expect(
  healthCheckSource.includes(".in('health_status', ['failed', 'dead', 'blocked'])"),
  'failed streams are missing from the recovery queue',
);
const problemRecoveryBlock = healthCheckSource.slice(
  healthCheckSource.indexOf("queue === 'problem'"),
  healthCheckSource.indexOf("queue === 'stale'"),
);
const targetedRecoveryBlock = healthCheckSource.slice(
  healthCheckSource.indexOf('if (slug)'),
  healthCheckSource.indexOf("queue === 'unchecked'"),
);
const hiddenRecoveryBlock = healthCheckSource.slice(
  healthCheckSource.indexOf("queue === 'recovery'"),
  healthCheckSource.indexOf("queue === 'problem'"),
);
expect(!targetedRecoveryBlock.includes(".eq('is_active', true)"), 'targeted recheck cannot revive inactive streams');
expect(hiddenRecoveryBlock.includes(".eq('seo_catalog_status', 'awaiting_playback')"), 'hidden movie recovery queue is missing');
expect(hiddenRecoveryBlock.includes(".eq('movies.is_published', true)"), 'published zero-source movies are missing from recovery');
expect(hiddenRecoveryBlock.includes('isPreviewOnlyMovie'), 'recovery can waste capacity probing genuine preview-only titles');
expect(hiddenRecoveryBlock.includes('spreadAcrossMovies'), 'hidden movie recovery is not bounded across titles');
expect(
  selfHealingMigration.includes('movie_is_preview_only')
    && selfHealingMigration.includes("not public.movie_is_preview_only(movie)")
    && selfHealingMigration.includes("'released_trailer_is_not_playback_v2'"),
  'a promotional trailer can still exempt a released zero-source movie from quarantine',
);
expect(
  reconciliationPriorityMigration.includes("then 0")
    && reconciliationPriorityMigration.includes("'public_playback_first_v1'")
    && reconciliationPriorityMigration.includes('limit 40')
    && reconciliationPriorityMigration.includes('public.movie_is_preview_only(movie)'),
  'public playback incidents can remain behind lower-impact catalogue reconciliation work',
);
expect(
  durableCoverageGapMigration.includes('stored_episode')
    && durableCoverageGapMigration.includes('health_aware_stored_coverage_v4')
    && durableCoverageGapMigration.includes('greatest('),
  'health-driven metadata downgrades can still hide newer missing/dead episode rows from the scanner',
);
expect(
  proxySource.includes('triggerOnDemandStreamRecovery')
    && proxySource.includes("callInternalFunction('stream-health-check'")
    && proxySource.includes('newestProblemStreamCheckAt'),
  'opening a released zero-source title cannot start a cooldown-bounded targeted recovery',
);
expect(
  moviePageSource.includes('for (const delay of [4000, 12000])')
    && moviePageSource.includes('autoRecoverySucceeded')
    && moviePageSource.includes('isPreviewOnlyDetail(data)'),
  'the viewer cannot automatically receive a source restored just after the first empty response',
);
expect(
  syncSource.includes("supabase.rpc('reconcile_movie_release_state'")
    && syncSource.includes('p_movie_id: result.id')
    && syncSource.includes('} finally {'),
  'provider sync can overwrite health-aware episode truth after stream reconciliation',
);
expect(
  syncSource.includes('streamNeedsVerification')
    && syncSource.includes("['failed', 'dead', 'blocked']")
    && syncSource.includes('Provider verification pending:')
    && syncSource.includes('verifyTargetStreamsNow')
    && syncSource.includes("endpoint.searchParams.set('queue', 'recovery')"),
  'a provider-confirmed unchanged URL cannot escape a stale failed/dead state through independent verification',
);
expect(
  healthCheckSource.includes('(?:phim1280\\.tv|kkphimplayer\\d+\\.com)'),
  'KKPhim CDN false-negative probes are not browser-managed',
);
expect(
  healthCheckSource.includes("last_error: 'Server probe inconclusive; browser validation required'")
    && healthCheckSource.includes('is_active: true'),
  'an inconclusive server probe cannot restore a source for browser validation',
);
const telemetryRecoveryBlock = healthCheckSource.slice(
  healthCheckSource.indexOf('const hotCandidateQuery'),
  healthCheckSource.indexOf('const [telemetryResult'),
);
expect(!problemRecoveryBlock.includes(".eq('is_active', true)"), 'problem recovery excludes deactivated streams');
expect(!telemetryRecoveryBlock.includes(".eq('is_active', true)"), 'viewer-failure recovery excludes deactivated streams');
expect(
  moviePageSource.includes('isRecentlyBadExactSourceHost(getPlayableSourceUrl(episode))'),
  'watch page still attempts a host with a confirmed live outage',
);
expect(
  sourceHealthFunction.includes('session.success && !session.critical')
    && sourceHealthFunction.includes('item.failure_rate >= 0.40'),
  'global source blocking does not use fatal-session evidence plus a smoothed failure ratio',
);
expect(
  sourceHealthClient.includes("khophim.bad-source-hosts.v2")
    && sourceHealthClient.includes('const map: Record<string, number> = {};'),
  'recovered hosts remain trapped in a stale client-side outage cache',
);

if (failures.length) {
  console.error(`Episode integrity regression failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Episode integrity regression passed: numbering + publication + recovery + health/cache/sync contracts.');
