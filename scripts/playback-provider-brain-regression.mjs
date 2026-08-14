/* global console, process */
import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20260812150000_harden_playback_provider_brain.sql',
  'utf8',
);
const equalBrainMigration = fs.readFileSync(
  'supabase/migrations/20260812170000_add_equal_provider_playback_brain.sql',
  'utf8',
);
const backfillProgressMigration = fs.readFileSync(
  'supabase/migrations/20260812171000_fix_playback_brain_backfill_progress.sql',
  'utf8',
);
const player = fs.readFileSync('src/pages/movie-detail/components/PlayerBox.tsx', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const gapSync = fs.readFileSync('supabase/functions/sync-gap-playback-providers/index.ts', 'utf8');
const health = fs.readFileSync('supabase/functions/stream-health-check/index.ts', 'utf8');
const viewerBrainMigration = fs.readFileSync(
  'supabase/migrations/20260813234500_add_viewer_trained_playback_brain.sql',
  'utf8',
);
const newestAuditMigration = fs.readFileSync(
  'supabase/migrations/20260813235000_add_newest_first_playback_audit.sql',
  'utf8',
);

const ophimOutageMultiplier = Number(movieApi.match(/OPHIM_ACTIVE_OUTAGE_MULTIPLIER\s*=\s*([\d.]+)/)?.[1] || 0);
const kkphimOutageMultiplier = Number(movieApi.match(/KKPHIM_ACTIVE_OUTAGE_MULTIPLIER\s*=\s*([\d.]+)/)?.[1] || 0);

const checks = [
  [migration.includes('exists(select 1 from public.background_job_pause_state)'), 'Operator global pause is not respected'],
  [migration.includes("capacity_mode = 'protect'"), 'Capacity protect mode does not gate repair jobs'],
  [migration.includes("'sync-ophim-priority-every-15-minutes'"), 'OPhim priority feed is not supervised'],
  [migration.includes("'sync-kkphim-priority-every-15-minutes'"), 'KKPhim priority feed is not supervised'],
  [migration.includes("'sync-provider-backups-every-30-minutes'"), 'Cross-provider backups are not supervised'],
  [migration.includes("'sync-gap-playback-providers-offpeak'"), 'Gap-provider repair is not supervised'],
  [migration.includes("'ensure-playback-provider-brain-every-5-minutes'") && migration.includes("'*/5 * * * *'"), 'Playback brain watchdog is not scheduled'],
  [player.includes("u.includes('streamc.xyz/embed.php')"), 'NguonC StreamC iframe is not recognized as an iframe source'],
  [player.includes('shouldWarmProviderFallback') && player.includes('nav.connection?.saveData'), 'NguonC warmup ignores reduced-data clients'],
  [player.includes("addTemporaryPrefetch(streamcFallbackUrl, 'document')"), 'NguonC fallback document is not prefetched'],
  [player.includes("addTemporaryPrefetch(`${streamcOrigin}/player.js?ver=1.9`, 'script')"), 'NguonC cold player script is not prefetched'],
  [player.includes("addTemporaryPreconnect('https://ssl.p.jwpcdn.com')"), 'NguonC JW Player origin is not preconnected'],
  [health.includes("Range: 'bytes=0-65535'") && health.includes('HLS playlist has no segment'), 'Stream health does not verify an actual media segment'],
  [ophimOutageMultiplier > kkphimOutageMultiplier && kkphimOutageMultiplier >= 1, 'An active OPhim cluster outage is not demoted below the healthier priority provider'],
  [movieApi.includes("sourceKind === 'ophim'") && movieApi.includes('OPHIM_ACTIVE_OUTAGE_MULTIPLIER'), 'OPhim outage penalty is not wired into source scoring'],
  [equalBrainMigration.includes('set_stream_playback_brain_fields') && equalBrainMigration.includes('calculate_playback_score'), 'Playback score is not precomputed in Supabase'],
  [equalBrainMigration.includes('backfill-stream-playback-brain-offpeak') && equalBrainMigration.includes('for update skip locked'), 'Legacy score backfill is not bounded and off-peak'],
  [backfillProgressMigration.includes('stream.playback_score is null') && backfillProgressMigration.includes('playback_provider_key(stream.source, stream.stream_url, stream.embed_url) is not null'), 'Legacy score backfill can repeatedly select non-target providers'],
  [equalBrainMigration.includes('movie_provider_coverage') && equalBrainMigration.includes("('ophim'::text), ('kkphim'), ('vsmov'), ('nguonc')"), 'Four-provider coverage ledger is incomplete'],
  [equalBrainMigration.includes('providers=vsmov,nguonc'), 'Scheduled discovery does not include both VSMOV and NguonC'],
  [gapSync.includes("DEFAULT_PROVIDERS: Provider[] = ['vsmov', 'nguonc']") && gapSync.includes(".from('movie_provider_coverage')"), 'Gap sync is not driven by the provider coverage queue'],
  [detailProxy.includes(".order('playback_score', { ascending: false, nullsFirst: false })") && detailProxy.includes('source_playback_score'), 'Movie detail API does not return pre-ranked playback sources'],
  [movieApi.includes('storedPlaybackScore * 3') && movieApi.includes("code === 'OPHIM' || code === 'KKPHIM' || code === 'VSMOV' || code === 'NGUONC'"), 'Frontend source selection is not provider-neutral'],
  [movieApi.includes('if (b.reliabilityScore !== a.reliabilityScore) return b.reliabilityScore - a.reliabilityScore;'), 'Clicked-episode score is not authoritative over unrelated server-wide quality'],
  [viewerBrainMigration.includes('calculate_playback_score_v2') && viewerBrainMigration.includes('playback_stable'), 'Real stable playback is not incorporated into the stored score'],
  [viewerBrainMigration.includes('not has_direct and successes = 0') && viewerBrainMigration.includes('least(raw_score, 420)'), 'Unverified third-party iframe can still outrank direct playback'],
  [viewerBrainMigration.includes('group by playback_session_id') && viewerBrainMigration.includes('max(coalesce(watched_seconds, 0))') && viewerBrainMigration.includes("interval '24 hours'"), 'Viewer learning is not session-deduplicated and time-bounded'],
  [newestAuditMigration.includes('claim_newest_playback_audit_batch') && newestAuditMigration.includes('for update') && newestAuditMigration.includes('playback_audit_pending') && newestAuditMigration.includes("interval '3 minutes'"), 'Newest-first playback audit has no resumable leased checkpoint'],
  [health.includes("queue === 'newest'") && health.includes('record_newest_playback_audit_batch'), 'Stream health worker does not execute or record newest-first audit batches'],
  [player.includes('onPlaybackQuality={reportIssue}') && player.includes("emitQuality('playback_stable')"), 'HLS and direct-video players do not both send stable playback quality to the learning brain'],
  [player.includes(": episode?.link_m3u8 || directVideoSrc || hlsSrc"), 'HLS telemetry records the bridge host instead of the real provider host'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log(`playback provider brain regression passed (${checks.length} contracts)`);
