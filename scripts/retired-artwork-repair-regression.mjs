import { readFile } from 'node:fs/promises';

const worker = await readFile('supabase/functions/repair-retired-artwork/index.ts', 'utf8');
const migration = await readFile('supabase/migrations/20261004145000_schedule_retired_artwork_repair.sql', 'utf8');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(worker.includes('matches.length === 1') && worker.includes('year !== candidateYear') && worker.includes('type === providerType'),
  'Artwork repair must require one exact title/year/type match.');
expect(worker.includes("poster_url: poster") && worker.includes("thumb_url: thumb")
  && !/episode_current|link_m3u8|link_embed/.test(worker),
  'Artwork repair must update only artwork and verified TMDB identity.');
expect(worker.includes('const MAX_BATCH = 20') && worker.includes('const CONCURRENCY = 4'),
  'Artwork repair must remain a bounded low-concurrency batch.');
expect(migration.includes('repair-retired-artwork-offpeak') && migration.includes("'3-58/5 17-22 * * *'"),
  'Artwork repair must run only in the established off-peak window.');
expect(migration.includes('perform cron.unschedule(jobid)') && migration.includes("jobname = 'enrich-tmdb-metadata-offpeak'"),
  'The unconfigured TMDB cron must not keep producing 503 responses.');
expect(worker.includes("rpc('get_retired_artwork_repair_candidates'")
  && worker.includes("metadata: { artwork_repair: 'kkphim'"),
  'Repair candidates must advance through a retry-aware database queue.');
expect(migration.includes('get_retired_artwork_repair_candidates')
  && migration.includes("s.attempted_at < now() - interval '30 days'"),
  'Unmatched artwork must not be retried on every five-minute run.');

if (failures.length) {
  console.error(`Retired artwork repair regression failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Retired artwork repair regression passed.');
