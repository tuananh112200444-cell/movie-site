import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/sync-onlyflix-feed/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260720173000_add_onlyflix_sync.sql', 'utf8');
const checks = [
  [source.includes("const SOURCE = 'onlyflix'"), 'OnlyFlix source identity is missing'],
  [source.includes("action: 'mcp_get_available_players'"), 'OnlyFlix player endpoint is missing'],
  [source.includes('consecutiveFailures >= 3'), 'OnlyFlix circuit breaker is missing'],
  [source.includes('const urlChanged') && source.includes("!['health_status', 'failure_count', 'last_error'].includes(key)"), 'Unchanged OnlyFlix URLs must preserve accumulated stream health'],
  [source.includes('priority: 15'), 'OnlyFlix must remain a low-priority backup source'],
  [source.includes(".slice(0, 2)"), 'OnlyFlix must expose at most two healthy sources per episode'],
  [source.includes('audio_type: null'), 'English sources must not be mislabeled as Vietnamese audio'],
  [source.includes('nullableInteger(entry.tmdbId)'), 'Empty TMDB identifiers must be stored as null, never as an invalid integer'],
  [source.includes("imdb_id: entry.season ? ''") && source.includes('tmdb_id: entry.season ? null'), 'Season rows must not reuse series-level IMDb/TMDB unique identifiers'],
  [source.includes('findCanonicalMovieByIdentity') && source.includes('errorMessage(error)'), 'OnlyFlix title matching must use the shared identity policy and diagnosable errors'],
  [source.includes('`onlyflix-${entry.sourceSlug}`'), 'OnlyFlix must use collision-safe source slugs'],
  [migration.includes('sync-onlyflix-feed-hourly'), 'OnlyFlix cron is missing'],
  [migration.includes("where name = 'CRON_SECRET'"), 'OnlyFlix cron secret must come from Vault'],
];
const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
console.log(JSON.stringify({ checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
