import { readFile } from 'node:fs/promises';

const [source, migration, selectionMigration] = await Promise.all([
  readFile('supabase/functions/enrich-tmdb-metadata/index.ts', 'utf8'),
  readFile('supabase/migrations/20260808020000_add_tmdb_metadata_enrichment.sql', 'utf8'),
  readFile('supabase/migrations/20260808021000_fix_tmdb_metadata_enrichment_selection.sql', 'utf8'),
]);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(source.includes('const MAX_BATCH_SIZE = 15;') && source.includes('const TMDB_CONCURRENCY = 3;'),
  'TMDB enrichment must remain bounded to a small off-peak batch.');
expect(source.includes('const CRON_SECRETS = [') && source.includes('CRON_SECRETS.includes(providedSecret)'),
  'TMDB enrichment must accept only configured internal scheduler secrets.');
expect(source.includes('identityMatches(movie, item.detail, item.mediaType)') && source.includes('verified.length === 1'),
  'TMDB metadata must be applied only after an unambiguous strict identity match.');
expect(source.includes("if (textLength(movie.content) < 80") && source.includes('stringList(movie.actor).length === 0'),
  'TMDB enrichment must fill only weak or missing metadata fields.');
expect(!/patch\.(?:stream|embed|link_m3u8|link_embed|episode_current|current_episode|slug|name)\s*=/.test(source),
  'TMDB enrichment must never overwrite playback, episode, slug, or source-title fields.');
expect(source.includes("from('movie_api_cache').update") && source.includes("search_index_v4_rows"),
  'A successful metadata batch must invalidate only the affected detail and search caches.');
expect(source.includes("rpc('get_tmdb_metadata_enrichment_candidates', { p_limit: limit })"),
  'TMDB enrichment must read candidates through the retry-aware database queue.');
expect(migration.includes("'enrich-tmdb-metadata-offpeak'") && migration.includes("'7 0,9,17 * * *'"),
  'TMDB enrichment must be scheduled only in the established off-peak windows.');
expect(migration.includes('runtime_capacity_managed_jobs'),
  'TMDB enrichment must be controlled by the runtime capacity guard.');
expect(selectionMigration.includes("s.status = 'skipped_identity' and s.attempted_at < now() - interval '30 days'")
  && selectionMigration.includes("s.status = 'retryable_error' and s.attempted_at < now() - interval '6 hours'"),
  'The TMDB metadata queue must advance past recently skipped rows and retry transient failures later.');

if (failures.length) {
  console.error('TMDB metadata enrichment regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('TMDB metadata enrichment regression passed.');
