import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/sync-glvietsub-feed/index.ts', 'utf8');
const identity = fs.readFileSync('supabase/functions/_shared/movie-identity.ts', 'utf8');
const playerBox = fs.readFileSync('src/pages/movie-detail/components/PlayerBox.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260721195500_add_glvietsub_sync.sql', 'utf8');
const healthMigration = fs.readFileSync('supabase/migrations/20260721210000_harden_operations_health_and_cron.sql', 'utf8');
const localizedUpgradeMigration = fs.readFileSync('supabase/migrations/20260814223000_restore_glvietsub_localized_upgrade_pipeline.sql', 'utf8');
const freshnessMigration = fs.readFileSync('supabase/migrations/20260815163907_glvietsub_freshness_and_4_elements_canonical.sql', 'utf8');
const capacityMigration = fs.readFileSync('supabase/migrations/20260821170304_stabilize_viewer_brain_and_source_sync_capacity.sql', 'utf8');
const gapProviderSync = fs.readFileSync('supabase/functions/sync-gap-playback-providers/index.ts', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const detailPage = fs.readFileSync('src/pages/movie-detail/page.tsx', 'utf8');
const player = fs.readFileSync('src/pages/movie-detail/components/MovieDetailPlayerSection.tsx', 'utf8');
const queerHome = fs.readFileSync('src/pages/home/components/QueerUniverseHome.tsx', 'utf8');
const queerHero = fs.readFileSync('src/pages/home/components/QueerUniverseHero.tsx', 'utf8');
const checks = [
  [source.includes("const SOURCE = 'glvietsub'"), 'GLVietsub source identity is missing'],
  [source.includes("action: 'doo_player_ajax'"), 'Dooplay player resolver is missing'],
  [source.includes('consecutiveFailures >= 3'), 'GLVietsub circuit breaker is missing'],
  [source.includes('skippedUnplayable') && source.includes('Coming-soon pages are valid catalogue entries'), 'Coming-soon titles must not open the connector circuit or block later movies'],
  [source.includes('const urlChanged') && source.includes("!['health_status', 'failure_count', 'last_error'].includes(key)"), 'Unchanged GLVietsub URLs must preserve accumulated stream health'],
  [source.includes('links.slice(0, 80), 4') && source.includes('mapWithConcurrency(discovered, 2'), 'GLVietsub parsing must use bounded episode and movie concurrency'],
  [source.includes('findCanonicalMovieByIdentity') && source.includes('normalizedNames'), 'GL/BL canonical matching must use the shared identity policy'],
  [source.includes('Identity matching must use complete titles') && source.includes('[entry.name, entry.originName]'), 'GL identity matching must not collapse a spin-off title to its parent prefix'],
  [playerBox.includes("return /^(?:www\\.)?blvietsub\\.com$/i.test(parsed.hostname);")
    && !playerBox.includes("return /(^|\\.)blvietsub\\.com$/i.test(parsed.hostname);"), 'BLVietsub content-page guard must not block player.blvietsub.com embeds'],
  [identity.includes('.ilike(column, exactCaseInsensitiveName)'), 'Canonical title matching must ignore letter case'],
  [identity.includes(".ilike('normalized_name', `%${normalizedName}%`)") && identity.includes('movieTitleIdentities(movie).includes(normalizedName)'), 'Canonical matching must resolve punctuation-safe bilingual alias bridges without fuzzy titles'],
  [source.includes('sourceBeforeStore') && source.includes('retireSourceMovieDuplicate'), 'Verified GL source duplicates must retire after their episodes attach to a canonical movie'],
  [source.includes('.slice(0, 2)'), 'Each episode must expose at most two sources'],
  [source.includes("episode.raw ? 'raw' : 'vietsub'"), 'RAW/Vietsub episodes must remain distinguishable'],
  [source.includes('existing.raw = existing.raw || raw'), 'Duplicate play CTA must not hide the RAW episode label'],
  [source.includes('-tap-dac-biet') && source.includes('specialNumber'), 'Special-episode URLs must be discovered'],
  [source.includes('episode.special') && source.includes('regularEpisodes'), 'Special episodes must not inflate the regular episode counters'],
  [source.includes("eq('audio_type', 'raw')") && source.includes("in('episode_number', translatedEpisodeNumbers)") && source.includes("in('episode_slug', translatedEpisodeSlugs)"), 'Translated releases must remove stale GLVietsub RAW episode and stream rows'],
  [source.includes('verifiedTranslatedEpisode') && source.includes('movie.source_site === SOURCE'), 'GL movie metadata must track the highest localized episode instead of stale RAW progress'],
  [source.includes('no-video') && source.includes('directRawEmbed'), 'Direct RAW iframe fallback is missing'],
  [source.includes('safe.length ? safe'), 'Safer embed providers must be preferred'],
  [source.includes('rejectRepeatedEpisodePlaybackUrls') && source.includes('rejected_playback_rows'), 'Repeated GL playback URLs must not create fake episode coverage'],
  [source.includes('youtubePlaybackTitle') && source.includes("'youtube_trailer'"), 'YouTube trailers must not be stored as playable GL episodes'],
  [source.includes('GMMTV\\s*2026') && source.includes('official\\s+)?(?:trailer|teaser|pilot'), 'GL YouTube promo detection must cover trailers, pilots, teasers and lineup videos'],
  [source.includes('hasRejectedPlayback') && source.includes('!entry.episodes.length && !hasRejectedPlayback'), 'Rejected GL playback must still reach cleanup even when no valid episode remains'],
  [source.includes("'glvietsub-feed-backfill'"), 'Archive backfill cursor is missing'],
  [source.includes('tvshows-sitemap1.xml') && source.includes('tvshows-sitemap2.xml'), 'GL backfill must cover every catalogue sitemap'],
  [source.includes('backfillOffset % archiveCount') && source.includes('% archiveCount'), 'GL cursor must wrap across the combined catalogue without skipping sitemap 2'],
  [source.includes('discoverDetailUrls(latestHtml, 1)'), 'Every run must still inspect the newest source title'],
  [source.includes('hasPlayableEpisode') && source.includes('rawEpisode') && source.includes('playableEpisode'), 'Playable RAW discoveries must be published without pretending to be Vietsub'],
  [source.includes('titleAliases') && source.includes("movie.source_site === 'tmdb-catalog'"), 'GL title aliases must enrich an existing TMDB canonical movie'],
  [source.includes("db.rpc('refresh_movie_seo_quality'") && source.includes("'search_index_v4_rows'"), 'GL updates must refresh SEO eligibility and expire discovery caches'],
  [migration.includes('sync-glvietsub-feed-every-15-minutes'), '15-minute sync cron is missing'],
  [migration.includes('sync-glvietsub-feed?limit=8'), 'GL catalogue convergence is too slow for RAW releases on older pages'],
  [migration.includes("where name = 'CRON_SECRET'"), 'Cron secret must come from Vault'],
  [movieApi.includes('source_site.ilike.%glvietsub%'), 'Queer catalogue does not include GLVietsub'],
  [detailProxy.includes("String(ep.audio_type || '').toLowerCase() === 'raw'"), 'RAW must not inflate the translated current-episode number'],
  [detailProxy.includes('exactMergeAlias') && detailProxy.includes(".eq('alias_slug', slug)") && detailProxy.includes(".eq('is_published', true)"), 'A retired duplicate slug must resolve only through an explicit alias to a published canonical movie'],
  [detailProxy.includes('suppressRepeatedGlvietsubPlaybackUrls'), 'Stored duplicate GL playback URLs must be hidden from viewers'],
  [detailProxy.includes("callInternalFunction('sync-glvietsub-feed'") && detailProxy.includes('shouldRefreshStaleGlvietsubRaw'), 'GL detail self-repair must call the GL sync and revisit stale RAW rows'],
  [detailProxy.includes("from('provider_movie_identities')") && detailProxy.includes('localizedEpisodeNumbers'), 'Verified localized auxiliary episodes must suppress stale RAW playback choices'],
  [gapProviderSync.includes("from('provider_movie_identities').upsert") && gapProviderSync.includes("audio_type: 'vietsub'"), 'Strict provider matches must persist a durable identity and localized audio type'],
  [detailPage.includes('translated.length > 0 ? translated : playable'), 'Default watch route must prefer translated episodes'],
  [detailPage.includes("String(ep.audio_type || '').toLowerCase() === 'raw'"), 'Detail hero must not label a RAW release as Vietsub'],
  [movieApi.includes('RAW is a useful early-access choice'), 'Automatic source selection must not silently choose RAW'],
  [player.includes("'RAW · Chưa phụ đề'") && player.includes('isRawEpisode(item.ep)'), 'Player RAW labels are missing'],
  [playerBox.includes('YouTube error 153') && playerBox.includes("'strict-origin-when-cross-origin'"), 'YouTube embeds must retain an HTTP origin referrer'],
  [movieApi.includes("'glvietsub', 'gl vietsub'") && movieApi.includes('getQueerSourceFitScore'), 'BL/GL source-role deduplication is missing'],
  [movieApi.includes("haystack.includes('glvietsub')"), 'GLVietsub details must participate in queer source merging'],
  [queerHome.includes('priority={false}') && !queerHome.includes('priority={index < 6}'), 'Queer grids must not compete with the hero using high-priority images'],
  [queerHero.includes('heroRequestWidth') && queerHero.includes('fetchPriority="low"'), 'Responsive queer hero image policy is missing'],
  [healthMigration.includes("auto-repair-player-issues-every-30-minutes") && healthMigration.includes("cron.unschedule('sync-blvietsub-smart-repair-every-30-minutes')"), 'Redundant/stuck repair cron cleanup is missing'],
  [healthMigration.includes("event_type in ('stall_fatal'") && healthMigration.includes("http_code in (404,410)"), 'Operations health must exclude recovery events and probe-only 403 responses'],
  [localizedUpgradeMigration.includes('dispatch_glvietsub_raw_upgrades') && localizedUpgradeMigration.includes("active := true") && localizedUpgradeMigration.includes('upgrade-glvietsub-raw-every-15-minutes'), 'GL RAW upgrade pipeline must remain scheduled and bounded'],
  [source.includes("url.searchParams.get('recent') === '1'") && source.includes("mode = explicitSlug ? 'slug' : recentOnly ? 'recent' : 'archive'"), 'GL recent-update mode must remain independent from the archive cursor'],
  [freshnessMigration.includes('sync-glvietsub-recent-every-15-minutes') && freshnessMigration.includes('upgrade-glvietsub-raw-every-10-minutes'), 'GL recent and RAW-upgrade freshness lanes must remain scheduled'],
  [capacityMigration.includes("('sync-glvietsub-recent-every-15-minutes')") && capacityMigration.includes("('upgrade-glvietsub-raw-every-10-minutes')") && capacityMigration.includes('4-7,12-16'), 'Every GL freshness lane must be capacity-managed and broad RAW upgrades must stay outside viewer peaks'],
  [capacityMigration.includes('sync-blvietsub-recent-peak-guard') && capacityMigration.includes('limit=4&offset=0&page_size=50'), 'BLVietsub must keep a bounded peak freshness lane without running the full ingestion batch'],
  [freshnessMigration.includes('motchill-4-elements-the-fire') && freshnessMigration.includes('glvietsub-4-elements-the-fire'), 'The audited 4 Elements duplicate must retain its canonical alias repair'],
];
const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
console.log(JSON.stringify({ checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
