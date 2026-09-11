import fs from 'node:fs';

const hls = fs.readFileSync('src/pages/movie-detail/components/LightweightHlsPlayer.tsx', 'utf8');
const box = fs.readFileSync('src/pages/movie-detail/components/PlayerBox.tsx', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const fullscreenUtils = fs.readFileSync('src/utils/playerFullscreen.ts', 'utf8');
const globalCss = fs.readFileSync('src/index.css', 'utf8');
const watermarkCss = fs.readFileSync('src/pages/movie-detail/components/PlayerWatermark.css', 'utf8');
const playerSection = fs.readFileSync('src/pages/movie-detail/components/MovieDetailPlayerSection.tsx', 'utf8');
const moviePage = fs.readFileSync('src/pages/movie-detail/page.tsx', 'utf8');
const router = fs.readFileSync('src/router/config.tsx', 'utf8');
const continueWatching = fs.readFileSync('src/pages/home/components/ContinueWatching.tsx', 'utf8');
const updateCoordinator = fs.readFileSync('src/components/base/UpdateCoordinator.tsx', 'utf8');
const serviceWorker = fs.readFileSync('public/service-worker.js', 'utf8');
const appErrorBoundary = fs.readFileSync('src/components/base/AppErrorBoundary.tsx', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const pagesRoutes = fs.readFileSync('public/_routes.json', 'utf8');
const pagesWorker = fs.readFileSync('functions/[[path]].js', 'utf8');

const checks = [
  [hls.includes('await requestPlayerFullscreen(el)'), 'HLS player must use the shared cross-browser fullscreen request'],
  [hls.includes('getPlayerFullscreenElement()'), 'HLS player must verify native fullscreen really started'],
  [hls.includes('enterPseudoFullscreen();'), 'HLS player must support viewport fullscreen'],
  [hls.includes("document.documentElement.style.overflow = 'hidden'"), 'HLS fullscreen must lock page scrolling'],
  [hls.includes("aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}"), 'HLS fullscreen control needs an accessible name'],
  [hls.includes('w-11 h-11 flex items-center'), 'HLS controls must keep a 44px touch target'],
  [hls.includes('onPointerDown={handleProgressPointerDown}') && hls.includes('onPointerMove={handleProgressPointerMove}') && hls.includes('onPointerUp={finishProgressScrub}'), 'Mobile progress scrubbing must use pointer events with live preview instead of a delayed click only'],
  [hls.includes('aria-valuetext={`${fmtTime(currentTime)} trên ${fmtTime(duration)}`}') && hls.includes('tabIndex={0}') && hls.includes('onKeyDown={handleProgressKeyDown}'), 'The seek control must expose its time and support keyboard seeking'],
  [hls.includes('aria-label="Lùi 10 giây"') && hls.includes('aria-label="Tới 10 giây"') && !hls.includes('className="hidden sm:flex w-11 h-11'), 'Mobile viewers must have visible ten-second seek controls'],
  [box.includes('enterEmbedPseudoFullscreen();'), 'Embed/MP4 player must support viewport fullscreen'],
  [box.includes('await requestPlayerFullscreen(el)'), 'Embed/MP4 player must prefer cross-browser native fullscreen when supported'],
  [globalCss.includes('.kp-pseudo-fullscreen') && globalCss.includes('--kp-fullscreen-width') && globalCss.includes('--kp-fullscreen-height'), 'Fallback fullscreen must cover the dynamic viewport'],
  [!box.includes("h-[100dvh] w-screen' : 'aspect-video w-full'} relative"), 'Fullscreen container must not receive conflicting fixed and relative positioning'],
  [box.includes("aria-label={isEmbedFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}"), 'Embed/MP4 fullscreen controls need accessible names'],
  [box.includes('h-12 w-12'), 'Embed fullscreen control must keep a 48px touch target'],
  [box.includes('data-kp-fullscreen="true"'), 'KhoPhim fullscreen control needs a stable selector above source-player controls'],
  [!box.includes('data-kp-source-fullscreen-proxy="true"'), 'Invisible fullscreen hitboxes must not intercept provider settings or seek controls'],
  [box.includes('Always expose a first-party fullscreen action') && box.includes('Do not rely on') && box.includes('data-kp-fullscreen="true"'), 'Apple iframe playback must keep a visible KhoPhim fullscreen fallback'],
  [box.includes('allowFullScreen') && box.includes('fullscreen; picture-in-picture') && !box.includes("fullscreen 'none'"), 'Source iframe fullscreen must be delegated on desktop and mobile browsers'],
  [fullscreenUtils.includes('webkitEnterFullscreen') && hls.includes('requestPlayerVideoFullscreen(video)') && box.includes('requestPlayerVideoFullscreen(directVideoRef.current)'), 'iPhone must fall back to native video fullscreen when container fullscreen is unavailable'],
  [box.includes("'top-3 right-3 h-12 w-12'"), 'KhoPhim fullscreen control must stay in the expected top-right corner'],
  [box.includes('bg-black/20'), 'Embed fullscreen control must remain translucent over the movie'],
  [box.includes('syncPlayerPseudoFullscreenLayout') && box.includes('kp-landscape-fullscreen'), 'Embed fullscreen must provide a forced landscape fallback on portrait phones'],
  [globalCss.includes('.kp-landscape-fullscreen') && globalCss.includes('rotate(90deg) !important'), 'Landscape fallback must not be overridden by animation or reduced-motion CSS'],
  [hls.includes('syncPlayerPseudoFullscreenLayout'), 'HLS fullscreen must provide a landscape fallback on portrait phones'],
  [fullscreenUtils.includes('viewport.width <= 600') && !fullscreenUtils.includes('viewport.width <= 900'), 'iPad/tablet fullscreen must not be force-rotated as a phone viewport'],
  [box.includes("classList.add('kp-player-pseudo-fullscreen')") && hls.includes("classList.add('kp-player-pseudo-fullscreen')") && globalCss.includes('html.kp-player-pseudo-fullscreen .kp-main-header') && globalCss.includes('html.kp-player-pseudo-fullscreen .angular-detail-page') && globalCss.includes('html.kp-player-pseudo-fullscreen .movie-player-frame') && globalCss.includes('html.kp-player-pseudo-fullscreen .movie-player-box'), 'Pseudo-fullscreen must prevent angular page chrome and clipping from covering the exit control'],
  [fullscreenUtils.includes("orientation.lock('landscape')"), 'Player fullscreen must request native landscape orientation when supported'],
  [fullscreenUtils.includes('getOrientationApi()?.unlock?.()'), 'Player fullscreen must restore orientation on exit'],
  [fullscreenUtils.includes('webkitFullscreenElement') && fullscreenUtils.includes('webkitRequestFullscreen') && fullscreenUtils.includes('webkitExitFullscreen'), 'Player fullscreen must support Safari/WebKit container fullscreen'],
  [watermarkCss.includes('[data-kp-player]:-webkit-full-screen'), 'Safari fullscreen must size the branded player container to the full screen'],
  [fullscreenUtils.includes('document.fullscreenEnabled !== false'), 'Fullscreen must be attempted in WebViews that expose requestFullscreen without a true fullscreenEnabled flag'],
  [!box.includes('nativeFullscreenIntentUntilRef'), 'Leaving native fullscreen must not reopen pseudo-fullscreen during an intent timeout'],
  [box.includes('fullscreenOperationRef') && hls.includes('fullscreenOperationRef'), 'Stale fullscreen requests must not reopen pseudo-fullscreen after the viewer exits'],
  [fullscreenUtils.includes('window.visualViewport') && box.includes("visualViewport?.addEventListener('resize'") && hls.includes("visualViewport?.addEventListener('resize'"), 'Pseudo-fullscreen must follow the visual viewport in Safari and embedded mobile browsers'],
  [watermarkCss.includes('safe-area-inset-bottom') && watermarkCss.includes('.kp-player-controls-bottom'), 'Fullscreen controls must stay above phone home indicators and display cutouts'],
  [watermarkCss.includes('(hover: none) and (pointer: coarse)') && watermarkCss.includes('.kp-desktop-player-control'), 'Rotated touch devices must keep the compact mobile control bar'],
  [movieApi.includes("host.includes('short.icu')) return 'known_bad'"), 'Client source scoring must reject the dead short.icu host'],
  [detailProxy.includes("host === 'short.icu'"), 'Movie detail API must suppress the dead short.icu host'],
  [!movieApi.includes('PREFERRED_SOURCE_BONUS') && !movieApi.includes('ACTIVE_OUTAGE_MULTIPLIER'), 'Provider identity must not add a source bonus or multiplier'],
  [/case 'ophim':\r?\n\s*case 'kkphim':\r?\n\s*case 'dailymotion':\r?\n\s*case 'stable_embed':\r?\n\s*case 'third_party_embed':\r?\n\s*case 'ssplay_abyss':\r?\n\s*return 30;/.test(movieApi), 'All valid embed APIs must begin with the same transport score'],
  [movieApi.includes('effectiveStoredPlaybackScore * 3') && movieApi.includes('getRecentBadHostPenalty(ep)'), 'Measured backend score and live failures must drive source selection'],
  [playerSection.includes('const activeMatch = activeServerData.find') && playerSection.includes('onSelectEp(activeMatch);'), 'Episode switching must preserve the source explicitly selected by the viewer'],
  [playerSection.includes('`${selectableServerOptions.length - 1} nguồn dự phòng cho tập này`'), 'Source summary must count only backups that contain the active episode'],
  [playerSection.includes('supportsActiveEpisode') && playerSection.includes('selectableServerOptions'), 'Source picker must hide servers that cannot play the active episode'],
  [playerSection.includes("window.matchMedia('(min-width: 1024px)').matches") && playerSection.includes('`Đổi nguồn (${selectableServerOptions.length})`'), 'Desktop viewers must see available backup sources immediately and mobile viewers need an explicit source count'],
  [playerSection.includes('Nguồn duy nhất hiện có cho tập này') && !playerSection.includes('Đã chọn nguồn phát · sẽ tự chuyển khi phát hiện lỗi'), 'A single-source title must not promise automatic failover that cannot happen'],
  [playerSection.includes('activeSourceHasWarning') && playerSection.includes('chưa có dự phòng cùng tập'), 'Source status must not claim readiness for a known unhealthy source'],
  [router.includes("path: '/xem-phim/:slug'") && router.includes("path: '/xem-phim/:slug/:episode'"), 'Dedicated watch routes must support movie and episode URLs'],
  [moviePage.includes("location.pathname.startsWith('/xem-phim/')"), 'Movie page must distinguish information and watch modes'],
  [moviePage.includes('noIndex={true}') && moviePage.includes('canonical={`/phim/${slug'), 'Watch pages must be noindex and canonicalize to movie information'],
  [moviePage.includes('const MovieDetailPlayerSection = lazy('), 'Player UI must be lazy-loaded away from the information page'],
  [continueWatching.includes('`/xem-phim/${encodeURIComponent(movieSlug)}'), 'Continue-watching links must open the dedicated player with a validated slug'],
  [moviePage.includes('requestedEpisodeNumber') && moviePage.includes('epSortKey(episode) === requestedEpisodeNumber'), 'Episode URLs must match equivalent slugs such as 3 and tap-03 across sources'],
  [moviePage.includes('pickBestEpisodeByScore(filteredEpisodes, requestedEpisode, preferredSource)'), 'Direct episode URLs must score every matching provider instead of selecting the first stored URL'],
  [updateCoordinator.includes("if (/^\\/xem-phim(?:\\/|$)/.test(pathname)) return true;"), 'Release coordinator can still auto-reload a paused or buffering watch route'],
  [updateCoordinator.includes("'release_update_deferred'"), 'Deferred watch-route updates are not observable in diagnostics'],
  [serviceWorker.includes('hasActiveWatchClient()') && serviceWorker.includes("PROTECTED_WATCH_PATH_RE = /^\\/xem-phim") && serviceWorker.includes('if (!(await hasActiveWatchClient())) await self.skipWaiting();') && !serviceWorker.includes('self.clients.claim()'), 'Legacy service-worker cleanup can still force a controller change during playback'],
  [pagesRoutes.includes('"/xem-phim/*"'), 'Saved movie and episode URLs must reach the Pages Function instead of the static 404'],
  [pagesWorker.indexOf('if (watchMatch)') < pagesWorker.indexOf('fetchSupabaseMovie(slug, context)'), 'Saved watch documents must render without waiting for the movie database'],
  [appErrorBoundary.includes('Promise.allSettled([clearBrowserCaches(), removeLegacyServiceWorkers()])') && appErrorBoundary.indexOf('Promise.allSettled([clearBrowserCaches(), removeLegacyServiceWorkers()])') < appErrorBoundary.lastIndexOf('recoverWithFreshUrl()'), 'Manual chunk recovery must finish cache cleanup before reopening the current movie URL'],
  [indexHtml.includes('function clearTransientState()') && !indexHtml.includes('function clearLocalState()'), 'Shell recovery must only evict transient caches'],
  [indexHtml.includes('kp_watch_history') && indexHtml.includes('kp_resume_v1') && indexHtml.includes('kp_favorites'), 'Shell recovery must explicitly preserve watch history, resume position and favorites'],
  [moviePage.includes('staticMovieSourceSlug(staticBootstrap, slug)') && moviePage.includes('normalizeDetailForCanonicalRoute(refreshed, slug, staticBootstrap?.detail)'), 'Movie retry must use the saved route alias and normalize back to the current movie URL'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('player UI regression passed');
