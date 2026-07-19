import fs from 'node:fs';

const hls = fs.readFileSync('src/pages/movie-detail/components/LightweightHlsPlayer.tsx', 'utf8');
const box = fs.readFileSync('src/pages/movie-detail/components/PlayerBox.tsx', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const fullscreenUtils = fs.readFileSync('src/utils/playerFullscreen.ts', 'utf8');
const globalCss = fs.readFileSync('src/index.css', 'utf8');

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
  [box.includes('data-kp-source-fullscreen-proxy="true"'), 'Source-player fullscreen affordance must delegate to the reliable parent control'],
  [box.includes("'top-3 right-3 h-12 w-12'"), 'KhoPhim fullscreen control must stay in the expected top-right corner'],
  [box.includes('bg-black/20'), 'Embed fullscreen control must remain translucent over the movie'],
  [box.includes("transform: 'translate(-50%, -50%) rotate(90deg)'") && box.includes("width: '100dvh'") && box.includes("height: '100dvw'"), 'Embed fullscreen must provide a forced landscape fallback on portrait phones'],
  [globalCss.includes('.kp-landscape-fullscreen') && globalCss.includes('rotate(90deg) !important'), 'Landscape fallback must not be overridden by animation or reduced-motion CSS'],
  [hls.includes("rotate(90deg)"), 'HLS fullscreen must provide a landscape fallback on portrait phones'],
  [fullscreenUtils.includes("orientation.lock('landscape')"), 'Player fullscreen must request native landscape orientation when supported'],
  [fullscreenUtils.includes('getOrientationApi()?.unlock?.()'), 'Player fullscreen must restore orientation on exit'],
  [movieApi.includes("host.includes('short.icu')) return 'known_bad'"), 'Client source scoring must reject the dead short.icu host'],
  [detailProxy.includes("host === 'short.icu'"), 'Movie detail API must suppress the dead short.icu host'],
  [movieApi.includes("case 'dailymotion':\n      // Dailymotion") && movieApi.includes('return TRUSTED_PLATFORM_SOURCE_BONUS - 360;'), 'Dailymotion embeds must remain fallback-only because HTTP success does not prove iframe playback'],
  [movieApi.includes("case 'stable_embed':\n      return TRUSTED_PLATFORM_SOURCE_BONUS + 60;"), 'Known stable embeds must outrank opaque Dailymotion embeds'],
  [!movieApi.includes('DAILYMOTION_PREFERRED_SOURCE_BONUS'), 'Dailymotion must not receive duplicate reliability and server bonuses'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('player UI regression passed');
