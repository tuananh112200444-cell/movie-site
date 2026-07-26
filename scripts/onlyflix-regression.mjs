import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/sync-onlyflix-feed/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260720173000_add_onlyflix_sync.sql', 'utf8');
const latestOnlyMigration = fs.readFileSync('supabase/migrations/20260726143000_tune_onlyflix_latest_missing_movies.sql', 'utf8');
const tenMovieMigration = fs.readFileSync('supabase/migrations/20260726150000_expand_onlyflix_latest_window.sql', 'utf8');
const homeProxy = fs.readFileSync('supabase/functions/home-proxy/index.ts', 'utf8');
const checks = [
  [source.includes("const SOURCE = 'onlyflix'"), 'OnlyFlix source identity is missing'],
  [source.includes("action: 'mcp_get_available_players'"), 'OnlyFlix player endpoint is missing'],
  [source.includes('consecutiveFailures >= 3'), 'OnlyFlix circuit breaker is missing'],
  [source.includes("mode: 'trending-movies-only'"), 'OnlyFlix trending-only mode is missing'],
  [source.includes('data-ofpop-home-json') && source.includes('groups?.movies?.periods?.[period]'), 'OnlyFlix must read the exact homepage Trending Movies payload'],
  [!source.includes('onlyflix-feed-backfill') && !source.includes('next_page: nextPage'), 'OnlyFlix must not backfill the historical catalog'],
  [source.includes('trendingRank: index + 1') && source.includes('trending.push({'), 'OnlyFlix rank must be preserved for the homepage'],
  [source.includes('const links = item.trendingRank ? [] : episodeLinks(html)'), 'Trending movie pages must ignore unrelated episode links'],
  [source.includes("from('home_page_cache').update({ expires_at: new Date().toISOString() })"), 'A successful trend sync must expire the homepage cache'],
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
  [source.includes("url.searchParams.get('limit') || 10") && source.includes(', 10));'), 'OnlyFlix latest window must be bounded at ten movies'],
  [latestOnlyMigration.includes("delete from public.sync_cursors where key = 'onlyflix-feed-backfill'"), 'Retired OnlyFlix backfill state must be removed'],
  [tenMovieMigration.includes('sync-onlyflix-feed?limit=10'), 'OnlyFlix cron must inspect ten latest movies'],
  [homeProxy.includes('fetchOnlyflixTrendingMovies') && homeProxy.includes("eq('function_name', 'sync-onlyflix-feed')"), 'OnlyFlix shelf must read the latest verified trend order'],
  [homeProxy.includes('const bySlug = new Map') && homeProxy.includes('return orderedSlugs') && homeProxy.includes('.map((slug) => bySlug.get(slug))'), 'OnlyFlix shelf must preserve source rank'],
  [homeProxy.includes("key === 'onlyflix-moi' || !isTrailerOnly"), 'Verified OnlyFlix sources must not be hidden by stale canonical trailer labels'],
  [homeProxy.match(/key === 'onlyflix-moi' \|\| !isTrailerOnly/g)?.length >= 2, 'Cached OnlyFlix trends must retain movies with verified backup streams'],
];
const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
console.log(JSON.stringify({ checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
