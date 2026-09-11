import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827045704_add_stable_catalog_feeds.sql', 'utf8');
const trueNewFeedMigration = fs.readFileSync('supabase/migrations/20260901084545_restore_true_new_movie_feed.sql', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const page = fs.readFileSync('src/pages/new-movies/page.tsx', 'utf8');
const homeProxy = fs.readFileSync('supabase/functions/home-proxy/index.ts', 'utf8');

const checks = [
  [migration.includes('add column if not exists published_at timestamptz') && migration.includes('add column if not exists last_episode_change_at timestamptz'), 'Stable publication and episode clocks must be stored independently from updated_at'],
  [migration.includes('coalesce(new.current_episode,0) > coalesce(old.current_episode,0)') && migration.includes('new.last_episode_change_at := old.last_episode_change_at'), 'Metadata/source writes must preserve episode-feed order while a real episode increase advances it'],
  [migration.includes('old.published_at is not null') && migration.includes('new.published_at := old.published_at'), 'Temporary unpublish/republish must not make an old movie new again'],
  [trueNewFeedMigration.includes("sort_column := 'created_at'") && trueNewFeedMigration.includes('movies_stable_creation_feed_idx'), 'New-movie feed must use immutable discovery time so cleanup cannot promote old catalogue rows'],
  [homeProxy.indexOf('...((newFeed.data ?? [])') < homeProxy.indexOf('...((episodeFeed.data ?? [])'), 'Homepage discovery pool must place genuinely new movies before episode updates'],
  [migration.includes("lower(coalesce(movie.seo_catalog_status,'published')) not in ('hidden','draft','superseded')") && migration.includes('movie.superseded_by_movie_id is null'), 'Public feeds must exclude editorial tombstones and superseded duplicates'],
  [migration.includes("'catalog:release-reconciliation'") && migration.includes("'rpc:reconcile_hidden_usable_movies'"), 'Interrupted ingests with usable playback must receive periodic bounded release reconciliation'],
  [movieApi.includes("export type StableCatalogFeedMode = 'new' | 'episode_updates'") && movieApi.includes(".rpc('get_stable_catalog_feed'"), 'Frontend must use the canonical stable feed RPC'],
  [page.includes("location.pathname === FEEDS.episode_updates.path ? 'episode_updates' : 'new'") && page.includes('fetchLatestReleaseMovies(page, mode)'), 'The two routes must request distinct feed semantics'],
  [!page.includes('fetchMoviesByType') && page.includes("throw new Error('stable_feed_unavailable')"), 'Public feed fallback must never resurrect unpersisted provider cards'],
  [!page.includes('poolRef') && !page.includes('apiDoneRef') && page.includes('requestSequence'), 'Each URL page must use one race-safe canonical request instead of an accumulating client pool'],
  [page.includes('FeedError') && page.includes('setRetryKey') && page.includes('FeedEmpty'), 'New movie pages must expose retry, loading and empty states'],
  [trueNewFeedMigration.includes('select count(*)::bigint as total_count') && trueNewFeedMigration.includes('total.total_count'), 'Canonical feed pagination must return an exact total instead of guessed pages'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log(`stable catalog feed regression passed (${checks.length} contracts)`);
