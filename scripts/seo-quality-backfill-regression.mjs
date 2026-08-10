import { readFile } from 'node:fs/promises';

const [migration, directBackfill, queuePrune] = await Promise.all([
  readFile('supabase/migrations/20260808030000_backfill_movie_seo_quality_offpeak.sql', 'utf8'),
  readFile('supabase/migrations/20260810094732_process_movie_seo_quality_backfill_offpeak.sql', 'utf8'),
  readFile('supabase/migrations/20260808031000_prune_nonpublic_movie_refresh_queue.sql', 'utf8'),
]);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(migration.includes('create or replace function public.seed_movie_seo_quality_backfill'),
  'SEO quality backfill must be implemented as a database-side bounded queue seed.');
expect(migration.includes("ready_queue_depth >= 100") && migration.includes("least(coalesce(p_limit, 30), 30)"),
  'SEO quality backfill must stop when normal work is busy and cap every batch at thirty movies.');
expect(migration.includes("q.movie_id is null") && migration.includes("q.movie_updated_at is distinct from m.updated_at"),
  'SEO quality backfill must repair missing and stale quality records.');
expect(migration.includes("q.index_tier not in ('playable', 'ongoing', 'upcoming')"),
  'SEO quality backfill must repair inconsistent eligible tiers before sitemap selection.');
expect(!/update\s+public\.movies|delete\s+from\s+public\.movies|insert\s+into\s+public\.movies/i.test(migration),
  'SEO quality backfill must not overwrite movie metadata, sources, or playback.');
expect(migration.includes("'7,22,37,52 17-22 * * *'") && migration.includes('seed-movie-seo-quality-backfill-offpeak'),
  'SEO quality backfill must run only in the Vietnam off-peak window.');
expect(directBackfill.includes('create or replace function public.process_movie_seo_quality_backfill'),
  'Historical SEO quality must have a processor independent of the normal movie-refresh queue.');
expect(directBackfill.includes('perform public.refresh_movie_seo_quality(item.id)') &&
  !/update\s+public\.movies|delete\s+from\s+public\.movies|insert\s+into\s+public\.movies/i.test(directBackfill),
  'Direct SEO backfill must refresh only the derived quality row, never movie or playback data.');
expect(directBackfill.includes('ready_queue_depth >= 5000') && directBackfill.includes("'3-58/5 17-22 * * *'"),
  'Direct SEO backfill must pause under exceptional queue pressure and run only off-peak.');
expect(directBackfill.includes("jobname in (\n    'seed-movie-seo-quality-backfill-offpeak',") &&
  directBackfill.includes("'process-movie-seo-quality-backfill-offpeak'"),
  'The stalled shared-queue SEO seed must be replaced, not run in parallel.');
expect(queuePrune.includes('m.is_published is true') && queuePrune.includes('delete from public.movie_refresh_queue'),
  'Non-public movies must not consume the public SEO refresh queue.');
expect(queuePrune.includes('Publishing a') && queuePrune.includes('enqueues it again'),
  'Queue pruning must preserve the safe republish path.');

if (failures.length) {
  console.error('SEO quality backfill regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('SEO quality backfill regression passed.');
