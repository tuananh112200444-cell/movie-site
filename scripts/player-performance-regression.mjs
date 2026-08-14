import fs from 'node:fs';

const vite = fs.readFileSync('vite.config.ts', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const page = fs.readFileSync('src/pages/movie-detail/page.tsx', 'utf8');
const hero = fs.readFileSync('src/pages/movie-detail/components/MovieDetailHero.tsx', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const worker = fs.readFileSync('functions/[[path]].js', 'utf8');
const navbar = fs.readFileSync('src/components/feature/Navbar.tsx', 'utf8');
const playerSection = fs.readFileSync('src/pages/movie-detail/components/MovieDetailPlayerSection.tsx', 'utf8');
const playerBox = fs.readFileSync('src/pages/movie-detail/components/PlayerBox.tsx', 'utf8');
const watchHistory = fs.readFileSync('src/hooks/useWatchHistory.ts', 'utf8');
const continueWatching = fs.readFileSync('src/pages/home/components/ContinueWatching.tsx', 'utf8');
const comments = fs.readFileSync('src/pages/movie-detail/components/UserComments.tsx', 'utf8');
const imageFallback = fs.readFileSync('src/hooks/useImageFallback.ts', 'utf8');
const homeHero = fs.readFileSync('src/pages/home/components/HeroBanner.tsx', 'utf8');
const lazyHomeSection = fs.readFileSync('src/pages/home/components/LazyMovieSection.tsx', 'utf8');
const autoRepair = fs.readFileSync('supabase/functions/auto-repair-player-issues/index.ts', 'utf8');
const streamHealth = fs.readFileSync('supabase/functions/stream-health-check/index.ts', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const sourceHealth = fs.readFileSync('src/services/playerSourceHealth.ts', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const polyfills = fs.readFileSync('src/polyfills.ts', 'utf8');
const lightweightPlayer = fs.readFileSync('src/pages/movie-detail/components/LightweightHlsPlayer.tsx', 'utf8');
const diagnostics = fs.readFileSync('src/services/playerDiagnostics.ts', 'utf8');
const sourceHealthBrain = fs.readFileSync('supabase/functions/player-source-health/index.ts', 'utf8');

const checks = [
  [imageFallback.includes('useLayoutEffect(() => {') && imageFallback.includes('memory-cache `load` event'), 'Cached movie artwork must reset before load events so SPA logo navigation cannot leave decoded images at opacity zero'],
  [!detailProxy.includes('isPlayableEpisodeLink('), 'Movie detail must not call an undefined playback-link helper'],
  [detailProxy.includes('seo_has_playable_episode: hasEpisodes'), 'Movie detail must expose stored playback truth to SEO prerendering'],
  [playerBox.includes("function isOnlyflixEmbed(url: string)") && !playerBox.includes('allow-forms allow-popups'), 'OnlyFlix embeds must keep playback capabilities without popup permission'],
  [playerBox.includes("requiresUnsandboxedEmbed(url) || isOnlyflixEmbed(url) || isDailymotion(url)"), 'Sandboxed OnlyFlix embeds must retain the provider Referer required for playback'],
  [playerBox.includes("requiresUnsandboxedEmbed(embedSrc) || isOnlyflixEmbed(embedSrc)"), 'OnlyFlix embeds that reject iframe sandboxing must be rendered without a sandbox'],
  [playerBox.includes("pickBestEpisodeByPriority(fallbackServers, episode?.slug || episode?.name)"), 'Embed timeout must only assume a fallback when another server has the same logical episode'],
  [playerBox.includes('onSelectEp(fallback.episode, lastPlaybackTimeRef.current)'), 'Automatic server fallback must preserve the current playback position'],
  [lightweightPlayer.includes('const MAX_STREAM_RECOVERY_ATTEMPTS = 2') && lightweightPlayer.includes('const STALL_RECOVERY_DELAY_MS = 2500') && lightweightPlayer.includes('const MAX_REPEATED_SHORT_STALLS = 3') && lightweightPlayer.includes('repeated short stalls'), 'A stalled HLS source must fail over promptly instead of retrying five times'],
  [movieApi.includes("healthStatus === 'blocked' && !browserManagedProbeException") && detailProxy.includes("healthStatus === 'blocked' && !browserManagedProbeException"), 'Blocked direct sources must not enter playback while browser-managed probe exceptions remain narrow'],
  [!vite.includes('appendAssetVersion'), 'Hashed Vite assets must not receive a second query-string identity'],
  [html.includes("w.setTimeout(function(){if('requestIdleCallback'in w)w.requestIdleCallback(loadGtm,{timeout:5000});else loadGtm();},10000)"), 'GTM must have a real minimum delay after the critical viewing path'],
  [html.includes('rel="preload" as="style"') && html.includes('display=optional'), 'Web fonts must not block the first movie render'],
  [app.includes('requestIdleCallback(run, { timeout: 15000 })'), 'Source-health warming must not compete with initial playback'],
  [page.includes('if (isWatchPage || !showBottom || !detail?.movie || !slug || relatedFetchedRef.current) return;') && !page.includes('relatedTimer = setTimeout'), 'Related movies must load only near the lower information-page sections and never on the player page'],
  [hero.includes('hidden sm:block') && hero.includes('loading="eager"') && hero.includes('fetchPriority="high"') && !hero.includes('backdropFallback'), 'Desktop LCP backdrop must load eagerly while remaining hidden on mobile'],
  [navbar.includes('/brand/khophim-favicon-v2-96.png'), 'Navigation must use the compact brand asset'],
  [movieApi.includes("new URL('/api/movie-detail'"), 'Movie detail must use the same-origin edge cache'],
  [movieApi.includes('External enrichment must never delay first render/player startup') && movieApi.includes('void mergeExternalDetailIfFast'), 'External detail enrichment must remain outside the critical render path'],
  [movieApi.includes('BLVIETSUB_DETAIL_DEDUPE_MS') && movieApi.includes('blvietsubDetailInflight'), 'Repeated BLVietsub detail failures must be deduplicated on the client'],
  [movieApi.includes('OPSTREAM_IFRAME_BLOCK_PENALTY') && movieApi.includes("!m3u8 && embed && host.includes('opstream')"), 'Telemetry-confirmed blocked OPhim iframes must not outrank healthy independent sources'],
  [movieApi.includes("healthStatus === 'blocked'") && movieApi.includes('failureCount >= 2 ? 2400 : 900'), 'Repeatedly blocked sources must not outrank an independent healthy backup'],
  [movieApi.includes('hasBrowserManagedPhimApiEmbed') && movieApi.includes("healthStatus === 'failed' && hasBrowserManagedPhimApiEmbed"), 'A server-blocked PhimAPI HLS probe must not discard its working browser-managed iframe'],
  [movieApi.includes('hasBrowserManagedStreamcEmbed') && movieApi.includes("healthStatus === 'blocked' && hasBrowserManagedStreamcEmbed) score += 420"), 'Server-side StreamC 403s must not force viewers onto a slower VK iframe'],
  [movieApi.includes('STREAMC_IFRAME_ONLY_PENALTY') && movieApi.includes('browserEmbedPenalty') && movieApi.includes('storedPlaybackScore * 3 + transportBonus - browserEmbedPenalty'), 'Probe-only StreamC scores must not outrank a direct HLS source that can actually play'],
  [!movieApi.includes('FALLBACK_SERVER_AUTO_PICK_PENALTY'), 'The best pre-ranked server must not receive an arbitrary index penalty'],
  [autoRepair.includes('penalizeTelemetryFailedStreams') && autoRepair.includes('independent probe required') && !autoRepair.includes("last_error: 'Viewer telemetry: repeated fatal playback failure'"), 'Viewer telemetry may request repair but must not disable a stream without an independent probe'],
  [autoRepair.includes('detectProviderIncidents') && autoRepair.includes('item.hosts.size >= 3') && autoRepair.includes('item.movies.size >= 20') && autoRepair.includes('Math.min(limit, 2)'), 'A multi-host provider outage must bound expensive per-movie catalogue repairs'],
  [autoRepair.includes('primaryProviderIncident') && autoRepair.includes('if (!primaryProviderIncident)'), 'A provider-wide outage must not resync the same failing primary CDN for every movie'],
  [autoRepair.includes("'hls_fatal_retry'") && lightweightPlayer.includes('isManifestStartupFailure ? 1 : 3') && lightweightPlayer.includes('startup watchdog exceeded 18 seconds'), 'Manifest startup failures must enter repair telemetry and terminate instead of retrying forever'],
  [detailProxy.includes('knownUnhealthyUrls') && detailProxy.includes('const activeStreams = allStreams.filter'), 'Inactive failed URLs must suppress legacy and freshly fetched copies without hiding unrelated healthy streams'],
  [detailProxy.includes('if (shouldSuppressUnhealthyStream(sm)) continue;') && movieApi.includes('if (shouldSuppressStoredStream(sm)) continue;'), 'Pending or unhealthy rows must also be excluded from the direct streams-table playback path'],
  [detailProxy.includes('const shouldRepairInBackground =') && detailProxy.includes('const shouldFetchExternal =') && detailProxy.includes('serverMap.size === 0 || !useSupabase || shouldRepairPlaceholderSeries'), 'Third-party source repair must not block a usable database-backed player; only structurally invalid series placeholders may synchronously resolve a verified catalogue'],
  [detailProxy.includes('edgeWaitUntil(Promise.allSettled(cacheWrites))') && !detailProxy.includes('await writeCachedDetail(supabase, slug, response)'), 'Best-effort detail-cache writes must not delay a ready player response'],
  [detailProxy.includes('exact private catalogue row is an authoritative quarantine/tombstone') && detailProxy.includes("'X-Catalog-Quarantine': '1'") && worker.includes('?rev=canonical-v5'), 'A provider response or stale edge cache must not resurrect an explicitly quarantined movie'],
  [detailProxy.includes('is_published: false') && detailProxy.includes('persistedPlayableCoverage') && detailProxy.includes('hasExternalPlayable && hasUsableImage'), 'Lazy detail persistence must keep metadata-only movies private until playback and artwork are stored'],
  [autoRepair.includes('host_counts') && autoRepair.includes('>= threshold'), 'A hostname must independently reach the evidence threshold before persistent penalty'],
  [autoRepair.includes("'sync-motchill-feed'") && autoRepair.includes('candidate.critical >= 3'), 'A repeatedly dead primary source must search one identity-guarded independent provider'],
  [autoRepair.includes('player-repair:') && autoRepair.includes('repair_cooldown') && autoRepair.includes('cooldown_minutes'), 'Automatic repairs must be idempotent within a bounded cooldown window'],
  [autoRepair.includes('{ key: repairKey, page: 1') && autoRepair.includes('repair cooldown cursor:'), 'Player repair cooldown must satisfy the sync_cursors page > 0 contract and expose persistence failures'],
  [autoRepair.includes("refresh_global') === '1'") && autoRepair.includes('75000'), 'Repair requests must not block on global cache warming or outlive the parent Edge request'],
  [autoRepair.includes('AbortSignal.timeout(15_000)') && autoRepair.includes('AbortSignal.timeout(10_000)'), 'Repair database reads must fail fast under pool pressure'],
  [streamHealth.includes('telemetryEmbedCooldown') && streamHealth.includes("startsWith('Viewer telemetry:')") && streamHealth.includes('30 * 60 * 1000'), 'Server reachability must not immediately erase browser-confirmed iframe failures'],
  [streamHealth.includes('Viewer telemetry confirmed direct failure:') && streamHealth.includes('embed page reachability is not playback proof'), 'A reachable embed page must not override a direct-media failure confirmed by viewer telemetry'],
  [streamHealth.includes('Viewer telemetry confirmed source failure:') && streamHealth.includes("result.error.startsWith('Viewer telemetry confirmed')"), 'A source failure independently confirmed after viewer telemetry must be retired immediately'],
  [streamHealth.includes('hotRetryBefore') && streamHealth.includes('onePerMovie') && streamHealth.includes('last_checked_at: now'), 'The telemetry hot queue must not be starved by repeatedly probing the same browser-managed embeds or one large series'],
  [streamHealth.includes('spreadAcrossMovies') && streamHealth.includes('Provider verification pending:%') && streamHealth.includes('Math.min(limit * 4, 600)') && streamHealth.includes('verificationBudget = verificationRows.length > 0 ? Math.ceil(limit / 2) : 0'), 'New-source, unchecked and problem queues must spread probes across movies while reserving bounded capacity for provider verification'],
  [autoRepair.includes('updated_at: new Date().toISOString()'), 'Fresh viewer telemetry must outrank stale repair backlog rows'],
  [sourceHealth.includes('phim1280') && sourceHealthBrain.includes('phim1280') && movieApi.includes("host.includes('phim1280')"), 'All player layers must group Phim1280 shards with the KKPhim provider incident'],
  [streamHealth.includes('browserManagedProbeBlocked') && streamHealth.includes('Server probe blocked; browser validation required'), 'Cloud-only StreamC 403s must remain unverified instead of accumulating false failures'],
  [streamHealth.includes('isBrowserManagedPhimApiProbeBlocked') && streamHealth.includes("status: browserManagedProbeBlocked ? 'unchecked'"), 'Browser-playable PhimAPI sources must not be quarantined from a server-only 404 probe'],
  [streamHealth.includes("pick_unchecked_stream_health_candidates") && streamHealth.includes('p_movie_ids: movieIds'), 'Fresh health checks must choose at most one unchecked stream per movie'],
  [streamHealth.includes('probeStreamRow') && streamHealth.includes('Embed returned an HTML 404/deleted-video page'), 'Health checks must validate both HLS and embed error pages'],
  [streamHealth.includes("url.searchParams.get('episode')") && streamHealth.includes(".eq('movie_id', targetMovie.id)") && streamHealth.includes("query.eq('episode_slug', episodeSlug)"), 'Targeted source recovery must resolve indexed movie identity and independently probe only the reported episode'],
  [detailProxy.includes("healthStatus === 'failed' && failureCount >= 3"), 'The detail API and frontend must suppress a telemetry-failed stream at the same threshold'],
  [sourceHealth.includes('SOURCE_HEALTH_PENALTY_TTL_MS = 30 * 60 * 1000') && sourceHealth.includes('SOURCE_HEALTH_UPDATED_EVENT') && sourceHealth.includes('function getSourceCluster') && sourceHealth.includes('map[`cluster:${cluster}`]'), 'Cross-viewer host and independently-confirmed cluster penalties must remain active for the advertised window and notify an open player'],
  [main.indexOf("import './polyfills'") >= 0 && main.indexOf("import './polyfills'") < main.indexOf("react-dom/client") && polyfills.includes('Array.prototype.at'), 'The player compatibility shim must run before React and lazy HLS chunks on Safari 14'],
  [
    playerBox.includes('hlsCluster !== embedCluster')
      && playerBox.includes('if (switchToFallbackServer()) return;')
      && playerBox.includes('Cross-origin 404/504 pages still')
      && !playerBox.includes('a working iframe\n    // from the same provider'),
    'A fatal HLS source must never turn into an infinite-loading iframe from the same provider cluster',
  ],
  [playerBox.includes('isBrowserManagedPhimApiEmbed') && playerBox.includes('isBrowserManagedSameProviderFallback') && playerBox.includes('playerModeWasManuallySelectedRef'), 'Repeated direct-HLS stalls may use a verified browser-managed PhimAPI player without overriding an explicit viewer choice'],
  [playerBox.includes("new URL(raw).pathname") && playerBox.includes('player.phimapi.com/player/?url=...index.m3u8'), 'An iframe URL whose query contains a manifest must not be misclassified as direct HLS'],
  [playerBox.includes('shouldAvoidEmbedForCurrentOutage') && playerBox.includes('SOURCE_HEALTH_UPDATED_EVENT') && sourceHealth.includes('player-source-health?hours=1'), 'A health-confirmed broken iframe must be bypassed before playback while recovered providers stop being penalized promptly'],
  [page.includes('healthyAlternativeServers') && page.includes('!isRecentlyBadSourceHost(getPlayableSourceUrl(candidate))'), 'Automatic same-episode recovery must prefer a healthy server instead of rotating viewers among hosts already in the outage set'],
  [playerBox.includes('prevSourceIdentityRef') && playerBox.includes('failedSourceKeysRef.current.has(key)'), 'Same-episode fallback must reset player mode and must not loop to an already failed source'],
  [playerBox.includes("effectivePlayerMode === 'embed'") && playerBox.includes('? embedSrc') && playerBox.includes("setPlayerMode(isHlsUrl(episode.link_m3u8) ? 'hls' : 'video')"), 'Telemetry must attribute the active playback path and a blocked iframe must try its direct media path before changing servers'],
  [diagnostics.includes("| 'playback_started'") && lightweightPlayer.includes('onPlaybackStarted?.()') && playerBox.includes("event_type: 'playback_started'"), 'Player telemetry must record one real playing-state success for source health rate calculations'],
  [diagnostics.includes('playback_session_id: getPlaybackSessionId()') && diagnostics.includes('window.sessionStorage') && diagnostics.includes('payload.source_host'), 'Player telemetry must use an anonymous per-tab session and keep throttling scoped to the exact source host'],
  [sourceHealthBrain.includes('session.success && !session.critical') && sourceHealthBrain.includes('(critical + 2) / (critical + success + 4)') && sourceHealthBrain.includes("SOURCE_SUCCESS_EVENTS = new Set(['playback_started'])"), 'Global source health must treat a session that starts then fatally stalls as failed, not as one success plus one failure'],
  [sourceHealthBrain.includes('deduplicatePlaybackEvents') && sourceHealthBrain.includes("playbackIdentity}|${normalizeHost(event.source_host)}|${eventClass}") && sourceHealthBrain.includes('balanced_events'), 'Global source health must deduplicate retries by playback session, host and event class'],
  [sourceHealthBrain.includes('summarizeClusterOutages') && sourceHealthBrain.includes('item.affected_hosts >= 3') && sourceHealth.includes('cluster_outages') && sourceHealth.includes('map[`cluster:${cluster}`] = now'), 'A provider cluster may be demoted only after failures span at least three independent hosts'],
  [sourceHealth.includes('SOURCE_HEALTH_FETCH_TTL_MS = 5 * 60 * 1000') && sourceHealth.includes('SOURCE_HEALTH_PENALTY_TTL_MS = 30 * 60 * 1000'), 'Source health must refresh promptly while retaining a bounded anti-flapping penalty'],
  [page.includes('if (!currentUrl || !isRecentlyBadSourceHost(currentUrl)) return;') && page.includes('if (currentPlaybackTime >= 8) return;') && page.includes('const allAlternativeServers = filteredEpisodes') && page.includes('const alternativeServers = healthyAlternativeServers.length > 0'), 'A late health response must replace a bad startup URL with an independent same-episode source before meaningful viewing begins'],
  [page.includes('warmSourceHealthWithinStartupBudget') && page.includes('Promise.all([detailRequest, initialSourceHealth])') && page.includes('window.setTimeout(resolve, 900)'), 'Initial watch-source selection must honor known provider outages without adding an unbounded startup dependency'],
  [page.includes("document.addEventListener('visibilitychange', refreshHealth)") && page.includes('window.setInterval(refreshHealth, 5 * 60 * 1000)') && page.includes("document.visibilityState === 'visible'"), 'Long watch sessions must refresh source health without polling in background tabs'],
  [movieApi.includes('isRecentlyBadSourceCluster') && movieApi.includes('isRecentlyBadExactSourceHost') && !movieApi.includes("khophim.bad-source-hosts.v1"), 'Source selection must consume the same global health state written by the telemetry brain'],
  [movieApi.includes('isAuthoritativeNoPlaybackDetail(proxy)') && movieApi.includes('a direct provider fallback must not reintroduce'), 'A provider fallback must not resurrect a URL that the authoritative health proxy quarantined'],
  [movieApi.includes('buildStoredStreamHealthIndex') && movieApi.includes('getStoredEpisodeHealthRow') && movieApi.includes('shouldSuppressStoredStream(healthRow)'), 'Direct Supabase fallback must not resurrect legacy episode rows already suppressed by stream health'],
  [movieApi.includes('hasStoredPlaybackHttpUrl') && movieApi.includes("/^https?:\\/\\//i.test(normalized)"), 'Direct Supabase fallback must not expose malformed non-HTTP playback values'],
  [movieApi.indexOf("{ src: 'proxy', data: proxy }") < movieApi.indexOf("{ src: 'supabase', data: sb }"), 'Health-filtered proxy detail must outrank raw Supabase episode rows when the fast-path budget is exceeded'],
  [sourceHealthBrain.includes('bad_hosts: []') && !sourceHealthBrain.includes('FALLBACK_DEGRADED_HOSTS'), 'A telemetry outage must not inject stale hard-coded provider failures'],
  [sourceHealthBrain.includes("if (value === null || value.trim() === '') return fallback") && sourceHealthBrain.includes("clampNumber(url.searchParams.get('limit'), 2000"), 'Global source health must inspect the configured default telemetry window instead of collapsing missing query parameters to the minimum'],
  [lightweightPlayer.includes('navigator.onLine === false') && playerBox.includes("window.addEventListener('online', onOnline)"), 'Offline mobile transitions must pause failure attribution and retry the same source when connectivity returns'],
  [lightweightPlayer.includes('const targetHeight = isSmallScreen ? 360 : 480') && lightweightPlayer.includes('ABR remains enabled') && lightweightPlayer.includes('setSelectedLevel(-1)'), 'HLS must start at a conservative rendition and leave ABR enabled to upgrade after measuring the real CDN speed'],
  [lightweightPlayer.includes('suspendedTimeRef.current = video?.currentTime || 0') && lightweightPlayer.includes('hlsRef.current?.startLoad(resumeAt') && lightweightPlayer.includes('wasPlayingBeforeSuspendRef.current'), 'Returning to a visible tab must resume the existing HLS player at the preserved time instead of rebuilding from zero'],
  [lightweightPlayer.includes('offlineTimeRef.current = video?.currentTime || 0') && lightweightPlayer.includes('hlsRef.current.startLoad(resumeAt > 0 ? resumeAt : -1)') && lightweightPlayer.includes('wasPlayingBeforeOfflineRef.current'), 'Network reconnect must preserve HLS playback time without rebuilding the player from stale initialTime'],
  [playerBox.includes("video.addEventListener('loadedmetadata', restorePlayback, { once: true })") && playerBox.includes('reloadDirectVideoAt(resumeAt, true)'), 'Direct-video recovery must wait for metadata before restoring playback time'],
  [movieApi.includes('badPaths.length < hosts.length') && page.includes('if (!currentUrl || !isRecentlyBadSourceHost(currentUrl)) return;') && playerBox.includes('getEpisodeSourceKeys(candidate)'), 'An episode with iframe and direct media must remain eligible until every playback path fails, while fallback avoids the exact failed path'],
  [page.includes('Keep the complete playable catalogue visible') && !page.includes('server_data: (server.server_data ?? []).filter((episode)'), 'Global source health must rank and fail over sources without deleting requested episodes from the visible catalogue'],
  [sourceHealth.includes('markSourcePlaybackFailed') && playerBox.includes('rememberActiveSourceFailure') && playerBox.includes('!isRecentlyBadExactSourceHost(episode.link_m3u8)') && !playerBox.includes("khophim.bad-source-hosts.v1"), 'Fatal HLS, direct-video and iframe paths must share one v2 failure state and never cycle back to an exact path already failed in the session'],
  [worker.includes("pathname === '/api/movie-detail'") && worker.includes('X-KhoPhim-Detail-Cache'), 'Cloudflare must cache complete movie-detail JSON'],
  [worker.includes('Large catalogues can finish just after four seconds') && worker.includes('signal: AbortSignal.timeout(7000)'), 'Cloudflare must not abort a valid large-catalogue detail response immediately before completion'],
  [worker.includes('/__circuit/blvietsub/') && worker.includes('/__circuit/movie-detail/') && worker.includes('X-KhoPhim-Circuit'), 'Cloudflare POP circuit breakers must protect detail upstreams'],
  [playerSection.includes("aria-label={cinemaMode ? 'Thoát chế độ Cinema' : 'Bật chế độ Cinema'}"), 'Cinema control must have an accessible name on mobile'],
  [comments.includes('<h2 className="text-white font-bold text-base">'), 'Comments heading must preserve a valid document outline'],
  [!imageFallback.includes('new Image()'), 'Lazy movie posters must not be eagerly downloaded by a duplicate JavaScript image loader'],
  [/backgroundWidth\s*=\s*isMobileHero\s*\?\s*(?:[1-3]\d{2}|4[0-8]0)\s*:\s*1360/.test(homeHero), 'Mobile hero must request an image rendition no wider than 480px before DPR scaling'],
  [lazyHomeSection.includes('return !isMobileViewport() && hasData && sectionIndex === 0;'), 'Offscreen mobile category shelves must not render eagerly'],
  [page.includes("window.addEventListener('pagehide', flushBeforePageLeaves)") && page.includes('pendingProgressRef.current'), 'Playback progress must flush periodically and when the mobile tab leaves'],
  [page.includes('const playbackTimeRef = useRef(0)') && page.includes('setInitialSeekTime(resumeAt)') && page.includes('playbackTimeRef.current = Math.max(0, time)'), 'Every player rebuild and source switch must carry the live playback position instead of restarting at zero'],
  [!/late cross-viewer health update[\s\S]{0,1400}setInitialSeekTime\(0\)/.test(page), 'A late global source-health update must never reset an active viewer to the beginning'],
  [page.includes('const targetEpisode = activeEpRef.current') && page.includes('pickBestEpisodeByPriority(deduped, targetEpisode)') && page.includes('setActiveEp(recovered.episode)'), 'Refreshing failed sources must restore the same episode and playback position'],
  [page.includes('if (requestedEpisode && !requested)') && page.includes('setActiveEp(null)') && page.indexOf('if (requestedEpisode && !requested)') < page.indexOf('const best = requested ??'), 'An unavailable episode route must never silently fall back to a different episode'],
  [page.includes("requestedEpisode !== 'full'") && page.includes('numberedEpisodes.length < 2') && page.includes("navigate(`/xem-phim/${slug}/${episodePath}`"), 'A legacy `/full` TV-series link must move to a verified numbered episode only after multiple numbered episodes exist'],
  [detailProxy.includes('hasOnlyFullPlaceholderCoverage') && detailProxy.includes("movie?.tmdb_id") && detailProxy.includes('shouldRepairPlaceholderSeries') && detailProxy.includes('isSafeAuxiliaryExternalMatch'), 'A multi-episode series with only a `full` placeholder must resolve a safely matched numbered catalogue only from stable identity evidence'],
  [detailProxy.includes('removeLegacyUncheckedFullPlaceholders') && detailProxy.includes("provider === 'ophim' && health === 'unchecked'"), 'A verified numbered series catalogue must hide only the legacy unchecked OPhim `full` placeholder, not manual specials'],
  [playerSection.includes('requestedEpisodeUnavailable') && playerSection.includes('KhoPhim sẽ không tự phát nhầm sang tập khác'), 'An unavailable requested episode must show an explicit recovery state instead of a misleading ready-to-play player'],
  [autoRepair.indexOf('const penalizedStreams = await penalizeTelemetryFailedStreams') > autoRepair.indexOf("'sync-ophim-movies'"), 'Provider refresh must finish before the current stored source is queued for an independent telemetry probe'],
  [playerBox.includes('onLoadedMetadata={(event) =>') && playerBox.includes('onTimeUpdate={(event) =>') && playerBox.includes('onVideoEnded?.();'), 'Direct MP4 playback must restore, save and complete progress like HLS playback'],
  [watchHistory.includes('persistWatchHistoryProgress') && watchHistory.includes('entry.slug === movieSlug'), 'Watch history progress must survive canonical movie ID changes by matching slug'],
  [continueWatching.includes('normalizeStoredSegment') && continueWatching.includes('resume?.shouldResume ? resume.epSlug'), 'Continue-watching links must use the newest validated resume episode'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('player performance regression passed');
