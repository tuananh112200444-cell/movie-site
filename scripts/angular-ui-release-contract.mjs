import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const requiredSource = [
  ['src/pages/home/page.tsx', ['home-angular-index', 'EditorialSectionFrame', 'EditorialHero']],
  ['src/index.css', ['HOME — ANGULAR CINEMA V7', '.home-angular-index', '.editorial-section-frame', '.home-poster-item', '1760px']],
  ['src/pages/home/components/MovieSection.tsx', ['movie-section-mobile-grid', 'grid-cols-2', 'sm:grid-cols-3', 'carouselItemClass']],
];

const failures = [];
for (const [file, markers] of requiredSource) {
  const source = await readFile(file, 'utf8');
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${file} is missing ${marker}`);
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else files.push(target);
  }
  return files;
}

let artifactFiles = [];
try {
  artifactFiles = await collectFiles('out/assets');
  const [publicReleaseRaw, outReleaseRaw, outHtml, updaterSource, viteSource] = await Promise.all([
    readFile('public/release.json', 'utf8'),
    readFile('out/release.json', 'utf8'),
    readFile('out/index.html', 'utf8'),
    readFile('src/components/base/UpdateCoordinator.tsx', 'utf8'),
    readFile('vite.config.ts', 'utf8'),
  ]);
  const publicRelease = JSON.parse(publicReleaseRaw);
  const outRelease = JSON.parse(outReleaseRaw);
  const htmlRelease = outHtml.match(/<meta name="khophim-release" content="([^"]+)"/)?.[1] || '';
  if (!publicRelease.release_id || publicRelease.release_id !== outRelease.release_id || publicRelease.release_id !== htmlRelease) {
    failures.push('Release id must match in public manifest, deploy manifest and HTML meta');
  }
  for (const marker of ['const releaseId = readReleaseId();', 'injectProductionReleaseMeta(releaseId)']) {
    if (!viteSource.includes(marker)) failures.push(`Vite release generation is missing ${marker}`);
  }
  if (/\/assets\/[^"']+\.js\?v=/.test(outHtml)) failures.push('Hashed production modules must not be duplicated with a query-string identity');
  for (const marker of ['prepareReleaseAssets', 'khophim-release', "content-type", "^\\/xem-phim", "^\\/admin", "focusout", '2 * 60 * 1000']) {
    if (!updaterSource.includes(marker)) failures.push(`UpdateCoordinator is missing ${marker}`);
  }
} catch (error) {
  failures.push(`Production artifact is incomplete: ${error.message}`);
}

const cssFiles = artifactFiles.filter((file) => file.endsWith('.css'));
const jsFiles = artifactFiles.filter((file) => file.endsWith('.js'));
const cssBundle = (await Promise.all(cssFiles.map((file) => readFile(file, 'utf8')))).join('\n');
const jsBundle = (await Promise.all(jsFiles.map((file) => readFile(file, 'utf8')))).join('\n');

for (const marker of ['.home-angular-index', '.editorial-section-frame', '.movie-player-box']) {
  if (!cssBundle.includes(marker)) failures.push(`Built CSS is missing ${marker}`);
}
for (const marker of ['home-angular-index', 'editorial-section-frame']) {
  if (!jsBundle.includes(marker)) failures.push(`Built JavaScript is missing ${marker}`);
}

if (failures.length) {
  console.error('ANGULAR UI RELEASE CONTRACT FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Angular UI release contract passed: source and deploy artifact use the current angular interface.');
