import fs from 'node:fs';

const hls = fs.readFileSync('src/pages/movie-detail/components/LightweightHlsPlayer.tsx', 'utf8');
const box = fs.readFileSync('src/pages/movie-detail/components/PlayerBox.tsx', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');

const checks = [
  [hls.includes("await el.requestFullscreen({ navigationUI: 'hide' })"), 'HLS player must prefer true native fullscreen'],
  [hls.includes('enterPseudoFullscreen();'), 'HLS player must support viewport fullscreen'],
  [hls.includes("document.documentElement.style.overflow = 'hidden'"), 'HLS fullscreen must lock page scrolling'],
  [hls.includes("aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}"), 'HLS fullscreen control needs an accessible name'],
  [hls.includes('w-11 h-11 flex items-center'), 'HLS controls must keep a 44px touch target'],
  [box.includes('enterEmbedPseudoFullscreen();'), 'Embed/MP4 player must support viewport fullscreen'],
  [box.includes("await el.requestFullscreen({ navigationUI: 'hide' })"), 'Embed/MP4 player must prefer true native fullscreen'],
  [box.includes("h-[100dvh] w-screen"), 'Fallback fullscreen must cover the dynamic viewport'],
  [box.includes("aria-label={isEmbedFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}"), 'Embed/MP4 fullscreen controls need accessible names'],
  [box.includes('h-12 w-12'), 'Embed fullscreen control must keep a 48px touch target'],
  [movieApi.includes("host.includes('short.icu')) return 'known_bad'"), 'Client source scoring must reject the dead short.icu host'],
  [detailProxy.includes("host === 'short.icu'"), 'Movie detail API must suppress the dead short.icu host'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('player UI regression passed');
