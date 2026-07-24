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
  [!movieApi.includes('FALLBACK_SERVER_AUTO_PICK_PENALTY'), 'The best pre-ranked server must not receive an arbitrary index penalty'],
  [autoRepair.includes('penalizeTelemetryFailedStreams') && autoRepair.includes('independent probe required') && !autoRepair.includes("last_error: 'Viewer telemetry: repeated fatal playback failure'"), 'Viewer telemetry may request repair but must not disable a stream without an independent probe'],
  [autoRepair.includes("'hls_fatal_retry'") && lightweightPlayer.includes('isManifestStartupFailure ? 1 : 3') && lightweightPlayer.includes('startup watchdog exceeded 18 seconds'), 'Manifest startup failures must enter repair telemetry and terminate instead of retrying forever'],
  [detailProxy.includes('knownUnhealthyUrls') && detailProxy.includes('const activeStreams = allStreams.filter'), 'Inactive failed URLs must suppress legacy and freshly fetched copies without hiding unrelated healthy streams'],
  [autoRepair.includes('host_counts') && autoRepair.includes('>= threshold'), 'A hostname must independently reach the evidence threshold before persistent penalty'],
  [autoRepair.includes("'sync-motchill-feed'") && autoRepair.includes('candidate.critical >= 3'), 'A repeatedly dead primary source must search one identity-guarded independent provider'],
  [autoRepair.includes('player-repair:') && autoRepair.includes('repair_cooldown') && autoRepair.includes('cooldown_minutes'), 'Automatic repairs must be idempotent within a bounded cooldown window'],
  [autoRepair.includes('{ key: repairKey, page: 1') && autoRepair.includes('repair cooldown cursor:'), 'Player repair cooldown must satisfy the sync_cursors page > 0 contract and expose persistence failures'],
  [autoRepair.includes("refresh_global') === '1'") && autoRepair.includes('75000'), 'Repair requests must not block on global cache warming or outlive the parent Edge request'],
  [autoRepair.includes('AbortSignal.timeout(15_000)') && autoRepair.includes('AbortSignal.timeout(10_000)'), 'Repair database reads must fail fast under pool pressure'],
  [streamHealth.includes('telemetryEmbedCooldown') && streamHealth.includes("startsWith('Viewer telemetry:')") && streamHealth.includes('30 * 60 * 1000'), 'Server reachability must not immediately erase browser-confirmed iframe failures'],
  [streamHealth.includes('browserManagedProbeBlocked') && streamHealth.includes('Server probe blocked; browser validation required'), 'Cloud-only StreamC 403s must remain unverified instead of accumulating false failures'],
  [streamHealth.includes('probeStreamRow') && streamHealth.includes('Embed returned an HTML 404/deleted-video page'), 'Health checks must validate both HLS and embed error pages'],
  [detailProxy.includes("healthStatus === 'failed' && failureCount >= 3"), 'The detail API and frontend must suppress a telemetry-failed stream at the same threshold'],
  [sourceHealth.includes('SOURCE_HEALTH_PENALTY_TTL_MS = 30 * 60 * 1000') && sourceHealth.includes('SOURCE_HEALTH_UPDATED_EVENT'), 'Cross-viewer source penalties must remain active for the advertised window and notify an open player'],
  [main.indexOf("import './polyfills'") >= 0 && main.indexOf("import './polyfills'") < main.indexOf("react-dom/client") && polyfills.includes('Array.prototype.at'), 'The player compatibility shim must run before React and lazy HLS chunks on Safari 14'],
  [playerBox.includes('hlsCluster !== embedCluster'), 'A fatal HLS source must not fall through to a broken embed from the same provider cluster'],
  [playerBox.includes('prevSourceIdentityRef') && playerBox.includes('failedSourceKeysRef.current.has(key)'), 'Same-episode fallback must reset player mode and must not loop to an already failed source'],
  [playerBox.includes("effectivePlayerMode === 'embed'") && playerBox.includes('? embedSrc') && playerBox.includes("setPlayerMode(isHlsUrl(episode.link_m3u8) ? 'hls' : 'video')"), 'Telemetry must attribute the active playback path and a blocked iframe must try its direct media path before changing servers'],
  [diagnostics.includes("| 'playback_started'") && lightweightPlayer.includes('onPlaybackStarted?.()') && playerBox.includes("event_type: 'playback_started'"), 'Player telemetry must record one real playing-state success for source health rate calculations'],
  [sourceHealthBrain.includes('failure_rate') && sourceHealthBrain.includes('(item.critical + 2) / (item.critical + item.success + 10)') && sourceHealthBrain.includes("SOURCE_SUCCESS_EVENTS = new Set(['playback_started'])"), 'Global source health must use a smoothed failure rate with successful starts, not raw failure volume'],
  [sourceHealthBrain.includes('bad_hosts: []') && !sourceHealthBrain.includes('FALLBACK_DEGRADED_HOSTS'), 'A telemetry outage must not inject stale hard-coded provider failures'],
  [lightweightPlayer.includes('navigator.onLine === false') && playerBox.includes("window.addEventListener('online', onOnline)"), 'Offline mobile transitions must pause failure attribution and retry the same source when connectivity returns'],
  [movieApi.includes('badPaths.length < hosts.length') && page.includes('areAllPlaybackPathsDegraded') && playerBox.includes('getEpisodeSourceKeys(candidate)'), 'An episode with iframe and direct media must remain eligible until every playback path fails, while fallback avoids the exact failed path'],
  [worker.includes("pathname === '/api/movie-detail'") && worker.includes('X-KhoPhim-Detail-Cache'), 'Cloudflare must cache complete movie-detail JSON'],
  [worker.includes('/__circuit/blvietsub/') && worker.includes('/__circuit/movie-detail/') && worker.includes('X-KhoPhim-Circuit'), 'Cloudflare POP circuit breakers must protect detail upstreams'],
  [playerSection.includes("aria-label={cinemaMode ? 'Thoát chế độ Cinema' : 'Bật chế độ Cinema'}"), 'Cinema control must have an accessible name on mobile'],
  [comments.includes('<h2 className="text-white font-bold text-base">'), 'Comments heading must preserve a valid document outline'],
  [!imageFallback.includes('new Image()'), 'Lazy movie posters must not be eagerly downloaded by a duplicate JavaScript image loader'],
  [/backgroundWidth\s*=\s*isMobileHero\s*\?\s*(?:[1-3]\d{2}|4[0-8]0)\s*:\s*1360/.test(homeHero), 'Mobile hero must request an image rendition no wider than 480px before DPR scaling'],
  [lazyHomeSection.includes('return !isMobileViewport() && hasData && sectionIndex === 0;'), 'Offscreen mobile category shelves must not render eagerly'],
  [page.includes("window.addEventListener('pagehide', flushBeforePageLeaves)") && page.includes('pendingProgressRef.current'), 'Playback progress must flush periodically and when the mobile tab leaves'],
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
