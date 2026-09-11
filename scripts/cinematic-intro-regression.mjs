import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const intro = fs.readFileSync('src/components/feature/CinematicLogoIntro.tsx', 'utf8');
const styles = fs.readFileSync('src/components/feature/CinematicLogoIntro.css', 'utf8');

const checks = [
  [app.includes('<AnimatedContent />') && app.includes('<CinematicLogoIntro />') && app.indexOf('<AnimatedContent />') < app.indexOf('<CinematicLogoIntro />'), 'The real page must render behind the intro so data and images load concurrently'],
  [intro.includes('INTRO_MIN_MS = 2_500') && intro.includes('INTRO_MAX_MS = 2_700') && intro.includes('INTRO_EXIT_MS = 420'), 'The normal intro must remain close to three seconds including its exit transition'],
  [intro.includes('khophim.cinematic-intro.seen.v1') && intro.includes("pathname !== '/'"), 'The intro must run only once per session and only on the homepage by default'],
  [intro.includes('prefers-reduced-motion: reduce') && intro.includes('BOT_USER_AGENT'), 'Reduced-motion visitors and crawlers must skip the intro'],
  [intro.includes('settleCriticalPaint') && intro.includes('img[fetchpriority="high"]'), 'The intro window must wait briefly for critical page paint and eager images'],
  [intro.includes("introMode === 'demo'") && intro.includes("introMode === 'preview'"), 'Design review must support repeatable demo and held preview modes'],
  [styles.includes('perspective: 950px') && styles.includes('transform-style: preserve-3d') && styles.includes('@keyframes kp-intro-logo'), 'The logo must retain true CSS 3D perspective and motion'],
  [styles.includes('.kp-logo-intro-active body') && styles.includes('overflow: hidden !important'), 'The background page must not scroll while the intro is visible'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('cinematic intro regression passed');
