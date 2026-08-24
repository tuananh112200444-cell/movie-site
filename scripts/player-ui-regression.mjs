import fs from 'node:fs';

const hls = fs.readFileSync('src/pages/movie-detail/components/LightweightHlsPlayer.tsx', 'utf8');
const box = fs.readFileSync('src/pages/movie-detail/components/PlayerBox.tsx', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const fullscreenUtils = fs.readFileSync('src/utils/playerFullscreen.ts', 'utf8');
const globalCss = fs.readFileSync('src/index.css', 'utf8');
const playerSection = fs.readFileSync('src/pages/movie-detail/components/MovieDetailPlayerSection.tsx', 'utf8');
const moviePage = fs.readFileSync('src/pages/movie-detail/page.tsx', 'utf8');
const router = fs.readFileSync('src/router/config.tsx', 'utf8');
const continueWatching = fs.readFileSync('src/pages/home/components/ContinueWatching.tsx', 'utf8');
const updateCoordinator = fs.readFileSync('src/components/base/UpdateCoordinator.tsx', 'utf8');
const serviceWorker = fs.readFileSync('public/service-worker.js', 'utf8');

const checks = [
  [hls.includes('document.fullscreenEnabled === true && el.requestFullscreen'), 'HLS player must only use a confirmed native fullscreen API'],
  [hls.includes('document.fullscreenElement || safariDocument.webkitFullscreenElement'), 'HLS player must verify native fullscreen really started'],
  [hls.includes('enterPseudoFullscreen();'), 'HLS player must support viewport fullscreen'],
  [hls.includes("document.documentElement.style.overflow = 'hidden'"), 'HLS fullscreen must lock page scrolling'],
  [hls.includes("aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}"), 'HLS fullscreen control needs an accessible name'],
  [hls.includes('w-11 h-11 flex items-center'), 'HLS controls must keep a 44px touch target'],
  [box.includes('enterEmbedPseudoFullscreen();'), 'Embed/MP4 player must support viewport fullscreen'],
  [box.includes('document.fullscreenEnabled === true && el.requestFullscreen'), 'Embed/MP4 player must prefer native fullscreen when supported'],
  [box.includes("h-[100dvh] w-screen"), 'Fallback fullscreen must cover the dynamic viewport'],
  [!box.includes("h-[100dvh] w-screen' : 'aspect-video w-full'} relative"), 'Fullscreen container must not receive conflicting fixed and relative positioning'],
  [box.includes("aria-label={isEmbedFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}"), 'Embed/MP4 fullscreen controls need accessible names'],
  [box.includes('h-12 w-12'), 'Embed fullscreen control must keep a 48px touch target'],
  [box.includes('data-kp-fullscreen="true"'), 'KhoPhim fullscreen control needs a stable selector above source-player controls'],
  [box.includes('!preferProviderNativeFullscreen') && box.includes('data-kp-source-fullscreen-proxy="true"'), 'The source fullscreen proxy must not cover the native player control on Apple mobile devices'],
  [box.includes('Always expose a first-party fullscreen action') && box.includes('Do not rely on') && box.includes('data-kp-fullscreen="true"'), 'Apple iframe playback must keep a visible KhoPhim fullscreen fallback'],
  [box.includes('shouldUseProviderNativeFullscreenOnApple') && box.includes('navigator.maxTouchPoints > 1'), 'Fullscreen routing must recognize iPhone, iPad and touch-mode iPadOS'],
  [box.includes('appleVideo.webkitEnterFullscreen();') && box.includes("video.addEventListener('webkitendfullscreen'"), 'Direct video must use and track native iPhone fullscreen'],
  [box.includes("'top-3 right-3 h-12 w-12'"), 'KhoPhim fullscreen control must stay in the expected top-right corner'],
  [box.includes('bg-black/20'), 'Embed fullscreen control must remain translucent over the movie'],
  [box.includes("transform: 'translate(-50%, -50%) rotate(90deg)'") && box.includes("width: '100dvh'") && box.includes("height: '100dvw'"), 'Embed fullscreen must provide a forced landscape fallback on portrait phones'],
  [globalCss.includes('.kp-landscape-fullscreen') && globalCss.includes('rotate(90deg) !important'), 'Landscape fallback must not be overridden by animation or reduced-motion CSS'],
  [hls.includes("rotate(90deg)"), 'HLS fullscreen must provide a landscape fallback on portrait phones'],
  [fullscreenUtils.includes('window.innerWidth <= 600') && !fullscreenUtils.includes('window.innerWidth <= 900'), 'iPad/tablet fullscreen must not be force-rotated as a phone viewport'],
  [box.includes("classList.add('kp-player-pseudo-fullscreen')") && hls.includes("classList.add('kp-player-pseudo-fullscreen')") && globalCss.includes('html.kp-player-pseudo-fullscreen .kp-main-header') && globalCss.includes('html.kp-player-pseudo-fullscreen .angular-detail-page') && globalCss.includes('html.kp-player-pseudo-fullscreen .movie-player-frame') && globalCss.includes('html.kp-player-pseudo-fullscreen .movie-player-box'), 'Pseudo-fullscreen must prevent angular page chrome and clipping from covering the exit control'],
  [fullscreenUtils.includes("orientation.lock('landscape')"), 'Player fullscreen must request native landscape orientation when supported'],
  [fullscreenUtils.includes('getOrientationApi()?.unlock?.()'), 'Player fullscreen must restore orientation on exit'],
  [movieApi.includes("host.includes('short.icu')) return 'known_bad'"), 'Client source scoring must reject the dead short.icu host'],
  [detailProxy.includes("host === 'short.icu'"), 'Movie detail API must suppress the dead short.icu host'],
  [!movieApi.includes('PREFERRED_SOURCE_BONUS') && !movieApi.includes('ACTIVE_OUTAGE_MULTIPLIER'), 'Provider identity must not add a source bonus or multiplier'],
  [movieApi.includes("case 'ophim':\n    case 'kkphim':\n    case 'dailymotion':\n    case 'stable_embed':\n    case 'third_party_embed':\n    case 'ssplay_abyss':\n      return 30;"), 'All valid embed APIs must begin with the same transport score'],
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
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('player UI regression passed');
