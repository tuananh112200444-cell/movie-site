/* global console, process */
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260822090615_canonicalize_provider_catalog.sql', 'utf8');
const recovery = fs.readFileSync('supabase/migrations/20260824125000_provider_neutral_catalog_recovery.sql', 'utf8');
const contentDriftGuard = fs.readFileSync('supabase/migrations/20260829234000_quarantine_provider_slug_content_drift.sql', 'utf8');
const identity = fs.readFileSync('supabase/functions/_shared/movie-identity.ts', 'utf8');
const providerSync = fs.readFileSync('supabase/functions/sync-ophim-movies/index.ts', 'utf8');
const brain = fs.readFileSync('supabase/functions/unified-provider-brain/index.ts', 'utf8');

const connectorFiles = [
  'supabase/functions/sync-blvietsub-feed/index.ts',
  'supabase/functions/sync-glvietsub-feed/index.ts',
  'supabase/functions/sync-motchill-feed/index.ts',
  'supabase/functions/sync-onlyflix-feed/index.ts',
];
const connectors = connectorFiles.map((file) => fs.readFileSync(file, 'utf8'));

const checks = [
  [migration.includes('create or replace function public.resolve_canonical_movie') && migration.includes('pg_advisory_xact_lock'), 'Canonical resolver is not transaction-locked'],
  [migration.indexOf('provider_movie_identities identity') < migration.indexOf('canonical_movie_identities identity'), 'Resolver order does not start with provider identity'],
  [migration.includes('p_tmdb_id') && migration.includes('p_imdb_id') && migration.includes('original_title_year_type_season'), 'Resolver does not enforce authoritative/strict identity tiers'],
  [migration.includes('canonicalization_candidates') && migration.includes("confidence_tier in ('A', 'B')"), 'Candidate queue does not classify A/B confidence'],
  [migration.includes('merge_canonicalization_candidate') && migration.includes('canonical_merge_archive') && migration.includes('movie_slug_aliases'), 'Merge is not archived and alias-safe'],
  [migration.includes("'split_provider_coverage'") && migration.includes('movie_provider_coverage'), 'Split coverage is not detected'],
  [migration.includes("('ophim',false,'last_resort',900") && migration.includes('quarantine_conclusively_broken_ophim_streams'), 'OPhim policy is destructive or incomplete'],
  [identity.includes("rpc('resolve_canonical_movie'") && providerSync.includes("rpc('resolve_canonical_movie'"), 'Shared and four-provider connectors bypass canonical resolution'],
  [connectors.every((source) => source.includes('providerSlug:') && source.includes('movieType:')), 'A secondary connector bypasses provider identity registration'],
  [brain.includes('requested_episode') && brain.includes('missing_episode_numbers') && brain.includes('provider_coverage'), 'Repair completion contract ignores exact episodes or provider coverage'],
  [recovery.includes("'hidden_movies', 0") && recovery.includes('Never hides or relabels the canonical movie'), 'OPhim transport retirement can still hide provider-neutral catalogue metadata'],
  [['kkphim', 'vsmov', 'nguonc'].every((provider) => recovery.includes(`provider-neutral-backfill-${provider}`)), 'Independent provider backfill schedules are incomplete'],
  [recovery.includes("('ophim',false,'disabled',100000") && recovery.includes("('kkphim',true,'normal',0") && recovery.includes("('nguonc',true,'normal',0") && recovery.includes("('vsmov',true,'normal',0"), 'Provider operational policy is not provider-neutral with OPhim transport disabled'],
  [!identity.includes("source.includes('ophim')") && !identity.includes("source.includes('kkphim')") && identity.toLowerCase().includes('provider branding contributes no score'), 'Shared canonical selection still contains provider branding priority'],
  [identity.indexOf(".eq('slug', normalizedName)") < identity.indexOf("rpc('resolve_canonical_movie'"), 'Existing exact public slugs are not resolved before provider identity creation'],
  [identity.indexOf('if (!hasVerifiedYear) return null;') > identity.indexOf(".eq('slug', normalizedName)"), 'Unknown release years prevent exact public-slug recovery'],
  [identity.includes("superseded_by_movie_id: targetId") && identity.includes("from('provider_movie_identities')") && identity.includes("from('canonical_movie_identities')"), 'Retired duplicates can still retain canonical/provider identity ownership'],
  [identity.includes("from('movie_slug_aliases').update") && identity.includes(".eq('movie_id', sourceId)"), 'Older alias chains are not collapsed onto the final canonical movie'],
  [contentDriftGuard.includes('provider_identity_movie_compatibility_guard') && contentDriftGuard.includes('Provider identity type mismatch') && contentDriftGuard.includes('Provider identity year mismatch'), 'Provider slug content drift is not rejected before identity persistence'],
  [contentDriftGuard.includes("'provider_slug_content_drift'") && contentDriftGuard.includes('kp_verified_foreign_full_rows'), 'Verified cross-wired Full rows are not quarantined with an integrity audit trail'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log(`canonicalization regression passed (${checks.length} contracts)`);
