/* global console, process */
import fs from 'node:fs';

const brain = fs.readFileSync('supabase/functions/unified-provider-brain/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260822060315_unify_four_provider_brain.sql', 'utf8');
const canonicalMigration = fs.readFileSync('supabase/migrations/20260822090615_canonicalize_provider_catalog.sql', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const playerRepair = fs.readFileSync('supabase/functions/auto-repair-player-issues/index.ts', 'utf8');
const equalScheduler = fs.readFileSync('supabase/migrations/20260823093000_equal_provider_offpeak_scheduler.sql', 'utf8');

const checks = [
  [['ophim', 'kkphim', 'vsmov', 'nguonc'].every((provider) => brain.includes(`'${provider}'`)) && brain.includes("provider_policy: 'equal_parallel_health_score'"), 'The provider pool is not an equal four-provider score pool'],
  [brain.includes("rpc('claim_unified_provider_repairs'"), 'The orchestrator is not driven by one durable queue'],
  [brain.includes("capacity?.mode === 'protect'"), 'Batch repair ignores runtime capacity protection'],
  [brain.includes("dry_run requires a slug") && brain.indexOf("dry_run requires a slug") < brain.indexOf("rpc('claim_unified_provider_repairs'"), 'A batch dry-run can mutate the queue'],
  [brain.includes("provider === 'ophim' || provider === 'kkphim'") && brain.includes("sync-gap-playback-providers"), 'The four providers are not isolated behind their two connector adapters'],
  [brain.includes('unified_provider_cursor') && brain.includes('completedProviderCycle'), 'Provider failover is not resumable or backoff-aware'],
  [migration.includes('for update of issue skip locked'), 'Concurrent orchestrator runs can claim the same movie'],
  [migration.includes('catalog_integrity_unified_provider_claim_idx'), 'The unified queue has no partial claim index'],
  [migration.includes("'unified-provider-brain-every-30-minutes'"), 'The unified scheduler is missing'],
  [migration.includes("'dispatch-catalog-source-repairs-every-2-minutes'") && migration.includes("'sync-gap-playback-providers-offpeak'") && migration.includes('active := false'), 'Legacy repair schedulers are not deactivated'],
  [migration.includes('cannot resurrect them') && migration.includes('paused_by_capacity_guard = false'), 'The capacity controller can reactivate a retired repair scheduler'],
  [migration.includes('revoke all on function public.claim_unified_provider_repairs(integer)') && migration.includes('to service_role'), 'Queue claim privileges are too broad'],
  [detailProxy.includes("callInternalFunction('unified-provider-brain'") && !detailProxy.includes("callInternalFunction('sync-ophim-movies'"), 'On-demand detail repair bypasses the unified brain'],
  [detailProxy.includes("text.includes('vsmov')") && detailProxy.includes("text.includes('nguonc')") && detailProxy.includes('slug: movieSlug'), 'Direct VSMOV/NguonC movies or canonical internal slugs bypass on-demand repair'],
  [playerRepair.includes("callFunction(supabaseUrl, serviceKey, secret, 'unified-provider-brain'") && !playerRepair.includes("callFunction(supabaseUrl, serviceKey, secret, 'sync-ophim-movies'"), 'Player telemetry repair bypasses the unified brain'],
  [playerRepair.includes("source.includes('vsmov')") && playerRepair.includes("source.includes('nguonc')") && playerRepair.includes('slug: movie.slug'), 'Player repair does not recognize direct VSMOV/NguonC records safely'],
  [brain.includes('requested_episode') && brain.includes('episode_numbers.includes(requestedEpisode)'), 'Targeted repair can still report success when the requested episode is missing'],
  [brain.includes('Promise.all(selectedProviders.map') && !brain.includes("provider !== 'ophim'"), 'Provider repair still serializes or excludes a source'],
  [equalScheduler.includes("4, 3600, true") && equalScheduler.includes("'catalog-brain-night'") && equalScheduler.includes("'playback-brain-peak-guard'"), 'Equal provider sync and off-peak scheduling contract is missing'],
  [canonicalMigration.includes("'split_provider_coverage'") && canonicalMigration.includes('canonicalization_candidates'), 'Split provider coverage is not connected to canonicalization'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log(`unified provider brain regression passed (${checks.length} contracts)`);
