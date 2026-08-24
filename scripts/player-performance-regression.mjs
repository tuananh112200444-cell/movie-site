import fs from 'node:fs';

const vite = fs.readFileSync('vite.config.ts', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const headers = fs.readFileSync('public/_headers', 'utf8');
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
const asyncViewerBrainMigration = fs.readFileSync('supabase/migrations/20260821170304_stabilize_viewer_brain_and_source_sync_capacity.sql', 'utf8');

const checks = [
  [imageFallback.includes('useLayoutEffect(() => {') && imageFallback.includes('memory-cache `load` event'), 'Cached movie artwork must reset before load events so SPA logo navigation cannot leave decoded images at opacity zero'],
  [!detailProxy.includes('isPlayableEpisodeLink('), 'Movie detail must not call an undefined playback-link helper'],
  [detailProxy.includes('seo_has_playable_episode: hasEpisodes'), 'Movie detail must expose stored playback truth to SEO prerendering'],
  [playerBox.includes("function isOnlyflixEmbed(url: string)") && !playerBox.includes('allow-forms allow-popups'), 'OnlyFlix embeds must keep playback capabilities without popup permission'],
  [playerBox.includes("requiresUnsandboxedEmbed(url) || isOnlyflixEmbed(url) || isDailymotion(url)"), 'Sandboxed OnlyFlix embeds must retain the provider Referer required for playback'],
  [playerBox.includes("requiresUnsandboxedEmbed(embedSrc) || isOnlyflixEmbed(embedSrc)"), 'OnlyFlix embeds that reject iframe sandboxing must be rendered without a sandbox'],
  [playerBox.includes("pickBestEpisodeByScore(fallbackServers, episode?.slug || episode?.name)"), 'Embed timeout must only assume a fallback when another server has the same logical episode'],
  [playerBox.includes('onSelectEp(target, finitePlaybackTime(lastPlaybackTimeRef.current))'), 'Automatic server fallback must preserve the current playback position'],
  [
    lightweightPlayer.includes('const callbacksRef = useRef({')
      && lightweightPlayer.includes('initialTimeRef.current = target')
      && lightweightPlayer.includes('}, [src, autoPlay, retryNonce]);')
      && lightweightPlayer.includes('callbacksRef.current.onTimeUpdate?.')
      && !lightweightPlayer.includes('}, [src, autoPlay, initialTime, onFatalError, onPlayerIssue, retryNonce]);'),
    'Progress, callback and countdown renders must not destroy and recreate the active HLS MediaSource',
  ],
  [
    playerBox.includes('const effectiveInitialTime = finitePlaybackTime(initialTime);')
      && !playerBox.includes('? Math.max(Math.max(0, Number(initialTime || 0)), lastPlaybackTimeRef.current)'),
    'Live playback time must not be converted into a new external seek request on ordinary PlayerBox renders',
  ],
  [
    playerSection.includes("const isCompleted = ['completed', 'complete', 'hoan-tat', 'hoàn tất'].includes(status);")
      && playerSection.includes('const pendingRelease = Boolean(movie.release_at) && !isCompleted;'),
    'A completed movie with historical release_at metadata must not keep a one-second schedule clock alive',
  ],
  [lightweightPlayer.includes('const STALL_RECOVERY_DELAY_MS = 10_000') && lightweightPlayer.includes('const MIN_FATAL_STALL_MS = 45_000') && lightweightPlayer.includes('const isNewStall = !stallStartedAtRef.current') && lightweightPlayer.includes('if (!hls.loadingEnabled) hls.startLoad(finitePlaybackTime(video.currentTime) || -1, true)') && !lightweightPlayer.includes('hls.stopLoad();'), 'Slow HLS fragments must keep their active request and deduplicate waiting/stalled events before failover'],
  [lightweightPlayer.includes('finitePlaybackTime(lastPlaybackSecondRef.current)') && lightweightPlayer.includes('setHasError(false);') && lightweightPlayer.includes('onClick={retryStream}') && playerBox.includes('setManualReloadTime(resumeAt)') && playerBox.includes('initialTime={manualReloadTime ?? effectiveInitialTime}'), 'Manual player and stream retries must remount the video and preserve the active playback position'],
  [lightweightPlayer.includes('maxBufferLength: slowNetwork ? 18 : 24') && lightweightPlayer.includes('maxBufferLength: 36') && lightweightPlayer.includes('maxMaxBufferLength: 72') && lightweightPlayer.includes('abrBandWidthFactor: 0.8') && lightweightPlayer.includes('fragLoadingTimeOut: 25_000'), 'HLS must keep a bounded device-aware buffer, conservative ABR and enough time to finish each fragment'],
  [lightweightPlayer.includes('const baseline = current >= 0 ? current : hls.levels.length - 1') && lightweightPlayer.includes('if (baseline <= 0)') && lightweightPlayer.includes('const next = baseline - 1'), 'Stall recovery at the lowest rendition must never increase video bitrate'],
  [movieApi.includes("healthStatus === 'blocked' && !browserManagedException") && detailProxy.includes("healthStatus === 'blocked' && !browserManagedException"), 'Blocked direct sources must not enter playback while browser-managed probe exceptions remain narrow'],
  [!vite.includes('appendAssetVersion') && !vite.includes('renderBuiltUrl') && !vite.includes('$1?v=') && html.includes('src="/src/main.tsx"'), 'Hashed Vite assets must have one URL identity without query-string duplication'],
  [/\/assets\/\*\r?\n\s+Cache-Control: public, max-age=0, must-revalidate/.test(headers), 'A transient Pages asset miss must never poison a browser cache with SPA HTML for a year'],
  [html.includes("w.setTimeout(function(){if('requestIdleCallback'in w)w.requestIdleCallback(loadGtm,{timeout:5000});else loadGtm();},10000)"), 'GTM must have a real minimum delay after the critical viewing path'],
  [!html.includes('fonts.googleapis.com/css2') && html.includes("font-family:system-ui"), 'External web fonts must not block the first movie render'],
  [html.includes('<link rel="preconnect" href="https://ceoxbhsdodllziyxmbqr.supabase.co" crossorigin="anonymous">'), 'The primary Singapore catalogue connection must start before the application requests movie detail'],
  [!app.includes('warmPlayerSourceHealth') && page.includes('warmSourceHealthWithinStartupBudget'), 'Source-health warming must be owned by the watch page and bounded by its startup budget'],
  [page.includes('if (isWatchPage || !showBottom || !detail?.movie || !slug || relatedFetchedRef.current) return;') && !page.includes('relatedTimer = setTimeout'), 'Related movies must load only near the lower information-page sections and never on the player page'],
  [hero.includes('hidden sm:block') && hero.includes('loading="eager"') && hero.includes('fetchPriority="high"') && !hero.includes('backdropFallback'), 'Desktop LCP backdrop must load eagerly while remaining hidden on mobile'],
  [navbar.includes('/brand/khophim-favicon-v2-96.png'), 'Navigation must use the compact brand asset'],
  [movieApi.includes("new URL('/api/movie-detail'"), 'Movie detail must use the same-origin edge cache'],
  [movieApi.includes('delayMs: 150') && movieApi.includes('timeoutMs: 18_000') && movieApi.includes('raceFirstValidWithTimeout(requests, 18_250)'), 'Movie detail must hedge the public Singapore read and tolerate a cold multi-provider response without producing a false 404'],
  [movieApi.includes('External enrichment must never delay first render/player startup') && movieApi.includes('void mergeExternalDetailIfFast'), 'External detail enrichment must remain outside the critical render path'],
  [movieApi.includes('BLVIETSUB_DETAIL_DEDUPE_MS') && movieApi.includes('blvietsubDetailInflight'), 'Repeated BLVietsub detail failures must be deduplicated on the client'],
  [movieApi.includes('OPSTREAM_IFRAME_BLOCK_PENALTY') && movieApi.includes("!m3u8 && embed && host.includes('opstream')"), 'Telemetry-confirmed blocked OPhim iframes must not outrank healthy independent sources'],
  [movieApi.includes("healthStatus === 'blocked'") && movieApi.includes('failureCount >= 2 ? 2400 : 900'), 'Repeatedly blocked sources must not outrank an independent healthy backup'],
  [movieApi.includes('hasBrowserManagedPhimApiEmbed') && movieApi.includes("healthStatus === 'failed' && hasBrowserManagedPhimApiEmbed"), 'A server-blocked PhimAPI HLS probe must not discard its working browser-managed iframe'],
  [movieApi.includes('hasBrowserManagedStreamcEmbed') && movieApi.includes("healthStatus === 'blocked' && hasBrowserManagedStreamcEmbed) score += 420"), 'Server-side StreamC 403s must not force viewers onto a slower VK iframe'],
  [movieApi.includes('effectiveStoredPlaybackScore') && movieApi.includes('Math.min(storedPlaybackScore, 420)') && movieApi.includes('STREAMC_IFRAME_ONLY_PENALTY'), 'Probe-only StreamC scores must not outrank a direct HLS source that can actually play'],
  [!movieApi.includes('FALLBACK_SERVER_AUTO_PICK_PENALTY'), 'The best pre-ranked server must not receive an arbitrary index penalty'],
  [autoRepair.includes('penalizeTelemetryFailedStreams') && autoRepair.includes('independent probe required') && !autoRepair.includes("last_error: 'Viewer telemetry: repeated fatal playback failure'"), 'Viewer telemetry may request repair but must not disable a stream without an independent probe'],
  [autoRepair.includes('detectProviderIncidents') && autoRepair.includes('item.hosts.size >= 3') && autoRepair.includes('item.movies.size >= 20') && autoRepair.includes('Math.min(limit, 2)'), 'A multi-host provider outage must bound expensive per-movie catalogue repairs'],
  [autoRepair.includes("'unified-provider-brain'") && autoRepair.includes('provider_budget: candidate.critical >= 3 ? 4 : 2'), 'A provider-wide outage must use the bounded unified provider pool'],
  [autoRepair.includes("'hls_fatal_retry'") && lightweightPlayer.includes('const maxNetworkRetries = 1') && lightweightPlayer.includes('startup watchdog exceeded 18 seconds'), 'Manifest startup failures must enter repair telemetry and terminate instead of retrying forever'],
  [detailProxy.includes('knownUnhealthyUrls') && detailProxy.includes('const activeStreams = allStreams.filter'), 'Inactive failed URLs must suppress legacy and freshly fetched copies without hiding unrelated healthy streams'],
  [detailProxy.includes('if (shouldSuppressUnhealthyStream(sm)) continue;') && movieApi.includes('if (shouldSuppressStoredStream(sm)) continue;'), 'Pending or unhealthy rows must also be excluded from the direct streams-table playback path'],
  [detailProxy.includes('const shouldRepairInBackground =') && detailProxy.includes('const shouldFetchExternal =') && detailProxy.includes('serverMap.size === 0 || !useSupabase || shouldRepairPlaceholderSeries'), 'Third-party source repair must not block a usable database-backed player; only structurally invalid series placeholders may synchronously resolve a verified catalogue'],
  [detailProxy.includes('edgeWaitUntil(Promise.allSettled(cacheWrites))') && !detailProxy.includes('await writeCachedDetail(supabase, slug, response)'), 'Best-effort detail-cache writes must not delay a ready player response'],
  [detailProxy.includes('exact private catalogue row is an authoritative quarantine/tombstone') && detailProxy.includes("'X-Catalog-Quarantine': '1'") && /\?rev=canonical-v\d+(?:-[a-z0-9-]+)?/i.test(worker), 'A provider response or stale edge cache must not resurrect an explicitly quarantined movie'],
  [detailProxy.includes('is_published: false') && detailProxy.includes('persistedPlayableCoverage') && detailProxy.includes('hasExternalPlayable && hasUsableImage'), 'Lazy detail persistence must keep metadata-only movies private until playback and artwork are stored'],
  [autoRepair.includes('host_counts') && autoRepair.includes('>= threshold'), 'A hostname must independently reach the evidence threshold before persistent penalty'],
  [autoRepair.includes("'unified-provider-brain'") && autoRepair.includes('slug: movie.slug'), 'A repeatedly dead primary source must use identity-guarded unified failover'],
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
  [streamHealth.includes('isBrowserManagedPhimApiProbeBlocked') && streamHealth.includes("status: browserManagedProbeBlocked || embedPlaybackUnverified ? 'unchecked'"), 'Browser-playable PhimAPI sources must not be quarantined from a server-only 404 probe'],
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
  [asyncViewerBrainMigration.includes('drop trigger if exists learn_from_player_event') && asyncViewerBrainMigration.includes('playback_learning_queue') && asyncViewerBrainMigration.includes('pg_try_advisory_xact_lock'), 'Viewer telemetry must enqueue exact-source learning instead of synchronously rescanning 24 hours of events on every heartbeat'],
  [lightweightPlayer.includes('const PLAYBACK_HEARTBEAT_SECONDS = 300') && playerBox.includes('const DIRECT_VIDEO_HEARTBEAT_SECONDS = 300'), 'Long-watch telemetry must be sampled every five minutes instead of writing once per viewer per minute'],
  [asyncViewerBrainMigration.includes("where jobname = 'backfill-playback-score-v2-every-minute'") && asyncViewerBrainMigration.includes('cron.unschedule(jobid)'), 'The completed playback-score backfill must not keep scanning streams every minute'],
  [sourceHealthBrain.includes('deduplicatePlaybackEvents') && sourceHealthBrain.includes("playbackIdentity}|${normalizeHost(event.source_host)}|${eventClass}") && sourceHealthBrain.includes('balanced_events'), 'Global source health must deduplicate retries by playback session, host and event class'],
  [sourceHealthBrain.includes('summarizeClusterOutages') && sourceHealthBrain.includes('item.affected_hosts >= 3') && sourceHealth.includes('cluster_outages') && sourceHealth.includes('map[`cluster:${cluster}`] = now'), 'A provider cluster may be demoted only after failures span at least three independent hosts'],
  [sourceHealth.includes('SOURCE_HEALTH_FETCH_TTL_MS = 5 * 60 * 1000') && sourceHealth.includes('SOURCE_HEALTH_PENALTY_TTL_MS = 30 * 60 * 1000'), 'Source health must refresh promptly while retaining a bounded anti-flapping penalty'],
  [page.includes('if (!currentUrl || !isRecentlyBadSourceHost(currentUrl)) return;') && page.includes('currentPlaybackTime >= 8 || Date.now() - activeSourceSelectedAtRef.current >= 8_000') && page.includes('const allAlternativeServers = filteredEpisodes') && page.includes('const alternativeServers = healthyAlternativeServers.length > 0'), 'A late health response must replace a bad startup URL with an independent same-episode source before meaningful viewing begins'],
  [page.includes('warmSourceHealthWithinStartupBudget') && page.includes('Promise.all([detailRequest, initialSourceHealth])') && page.includes('window.setTimeout(resolve, 250)'), 'Initial watch-source selection must honor cached provider outages within a 250ms startup budget'],
  [playerBox.includes('isBrowserManagedPhimApiEmbed(ep.link_embed)') && playerBox.includes('reserve the iframe as a same-provider fallback'), 'CORS-capable PhimAPI manifests must prefer the first-party HLS player over a tracker-heavy iframe'],
  [playerBox.includes('const [iframeRevealed, setIframeRevealed]') && playerBox.includes('const EMBED_SOFT_REVEAL_MS = 2_500') && playerBox.includes('{!iframeRevealed && (') && !playerBox.includes('setIframeKey((k) => k + 1);\n      setSsplayVariant'), 'Embed loading UI must reveal promptly without remounting the initial iframe'],
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
  [lightweightPlayer.includes('suspendedTimeRef.current = finitePlaybackTime(video?.currentTime)') && lightweightPlayer.includes('if (hls && !hls.loadingEnabled) hls.startLoad(resumeAt || -1, true)') && lightweightPlayer.includes('wasPlayingBeforeSuspendRef.current'), 'Returning to a visible tab must resume the existing HLS player at the preserved time instead of rebuilding from zero'],
  [lightweightPlayer.includes('offlineTimeRef.current = finitePlaybackTime(video?.currentTime)') && lightweightPlayer.includes('if (!hlsRef.current.loadingEnabled) hlsRef.current.startLoad(resumeAt || -1, true)') && lightweightPlayer.includes('wasPlayingBeforeOfflineRef.current'), 'Network reconnect must preserve HLS playback time without rebuilding the player from stale initialTime'],
  [lightweightPlayer.includes('hls.startLoad(') && lightweightPlayer.includes('!isManifestStartupFailure,') && lightweightPlayer.includes('Immediately trying to restart loading could cause loop loading') === false && lightweightPlayer.includes('const maxNetworkRetries = 1'), 'Fatal HLS network recovery must be single-shot and preserve the playhead without a restart loop'],
  [lightweightPlayer.includes('function finitePlaybackTime(value: unknown)') && lightweightPlayer.includes('function seekVideoSafely') && playerBox.includes('function finitePlaybackTime(value: unknown)') && page.includes('const safeSeekTime = Number.isFinite(seekTime)'), 'Every player layer must reject NaN and Infinity before assigning HTMLMediaElement.currentTime'],
  [playerBox.includes('|| iframeLoaded') && playerBox.includes('Date.now() - sourceMountedAtRef.current >= 8_000') && page.includes('Date.now() - activeSourceSelectedAtRef.current >= 8_000'), 'Late source-health responses must never replace an iframe or source already committed to the viewer'],
  [playerBox.indexOf('if (switchToFallbackServer()) return;') < playerBox.indexOf('if (canUseEmbedFallback)') && playerBox.includes("event_type: 'source_failover'"), 'Fatal direct playback must prefer an independent same-audio server before an opaque iframe and record the decision'],
  [streamHealth.includes("playbackProof?: 'hls-segment' | 'direct-media' | 'embed-html'") && streamHealth.includes("result.playbackProof === 'embed-html'") && streamHealth.includes('Embed HTML reachable; playback unverified'), 'An HTTP 200 embed document must remain unverified until media playback is proven'],
  [movieApi.includes('isConclusivePlaybackFailure(ep.source_last_error)') && detailProxy.includes('isConclusivePlaybackFailure(row.last_error)'), 'A conclusive 404, 410 or DNS failure must be removed immediately instead of being offered to more viewers'],
  [playerBox.includes('const requestTerminalSourceRepair = useCallback') && playerBox.includes('terminalRepairKeyRef.current === repairKey') && playerBox.includes('window.setTimeout(() =>') && playerBox.includes('onRefetchMovie();'), 'A terminal source failure must request one bounded fresh repair without entering a refetch loop'],
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
  [page.includes('const targetEpisode = activeEpRef.current') && page.includes('pickBestEpisodeByScore(deduped, targetEpisode, preferredSource)') && page.includes('setActiveEp(recovered.episode)'), 'Refreshing failed sources must restore the same episode and playback position'],
  [page.includes('if (requestedEpisode && !requested)') && page.includes('setActiveEp(null)') && page.indexOf('if (requestedEpisode && !requested)') < page.indexOf('const best = requested ??'), 'An unavailable episode route must never silently fall back to a different episode'],
  [page.includes("requestedEpisode !== 'full'") && page.includes('numberedEpisodes.length < 2') && page.includes('withPlaybackPreference(`/xem-phim/${slug}/${episodePath}`'), 'A legacy `/full` TV-series link must move to a verified numbered episode only after multiple numbered episodes exist'],
  [detailProxy.includes('hasOnlyFullPlaceholderCoverage') && detailProxy.includes("movie?.tmdb_id") && detailProxy.includes('shouldRepairPlaceholderSeries') && detailProxy.includes('isSafeAuxiliaryExternalMatch'), 'A multi-episode series with only a `full` placeholder must resolve a safely matched numbered catalogue only from stable identity evidence'],
  [detailProxy.includes('removeLegacyUncheckedFullPlaceholders') && detailProxy.includes("provider === 'ophim' && health === 'unchecked'"), 'A verified numbered series catalogue must hide only the legacy unchecked OPhim `full` placeholder, not manual specials'],
  [playerSection.includes('requestedEpisodeUnavailable') && playerSection.includes('KhoPhim sẽ không tự phát nhầm sang tập khác'), 'An unavailable requested episode must show an explicit recovery state instead of a misleading ready-to-play player'],
  [autoRepair.indexOf('const penalizedStreams = await penalizeTelemetryFailedStreams') > autoRepair.indexOf("'unified-provider-brain'"), 'Provider refresh must finish before the current stored source is queued for an independent telemetry probe'],
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
