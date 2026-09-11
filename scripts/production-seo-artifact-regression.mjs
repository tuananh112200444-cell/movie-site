import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('out');
const SITE_URL = 'https://khophim.org';
const failures = [];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  return readFile(path.join(OUT_DIR, relativePath), 'utf8');
}

function locs(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

const workerPath = path.join(OUT_DIR, '_worker.js');
if (!(await exists(workerPath))) {
  failures.push('out/_worker.js is missing; Pages advanced mode would not run.');
} else {
  const worker = await read('_worker.js');
  if (!worker.includes('cloudflare-pages-priority-index')) failures.push('out/_worker.js is missing the SEO sitemap handler.');
  if (!worker.includes('env["ASSETS"].fetch(request)')) failures.push('out/_worker.js cannot fall back to static assets.');
}

const manifest = JSON.parse(await read('static-movie-pages.json').catch(() => '{}'));
if (!Number.isInteger(manifest.count) || manifest.count < 100) {
  failures.push(`Static index cohort is unexpectedly small: ${manifest.count ?? 'missing'}.`);
}
if (!Number.isInteger(manifest.upcoming_count) || manifest.upcoming_count < 5 || manifest.upcoming_count > 20) {
  failures.push(`Static upcoming cohort must contain 5-20 movies, found ${manifest.upcoming_count ?? 'missing'}.`);
}

const movieFiles = await readdir(path.join(OUT_DIR, 'phim')).catch(() => []);
if (movieFiles.length < Number(manifest.count || 0)) {
  failures.push(`out/phim contains ${movieFiles.length} files for ${manifest.count || 0} indexable movies.`);
}

const submittedPublicShells = new Set();
for (const sitemapName of ['sitemap-static.xml', 'sitemap-seo-landing.xml']) {
  for (const url of locs(await read(sitemapName))) {
    const pathname = new URL(url).pathname.replace(/\/+$/, '') || '/';
    if (pathname !== '/' && pathname !== '/press') submittedPublicShells.add(pathname);
  }
}
for (const pathname of submittedPublicShells) {
  const shellPath = `${pathname.replace(/^\//, '')}.html`;
  if (!(await exists(path.join(OUT_DIR, shellPath)))) {
    failures.push(`Submitted public route has no quota-safe static shell: ${pathname}.`);
    continue;
  }
  const html = await read(shellPath);
  if (!html.includes('data-kp-static-route-shell="true"')) failures.push(`Static route shell marker is missing: ${pathname}.`);
  if (!html.includes(`<link rel="canonical" href="${SITE_URL}${pathname}">`)) failures.push(`Static route shell lacks self canonical: ${pathname}.`);
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count !== 1) failures.push(`Static route shell must contain exactly one H1 (${h1Count} found): ${pathname}.`);
  if (pathname === '/kho-phim' && (html.match(/href="https:\/\/khophim\.org\/phim\//g) || []).length < 100) {
    failures.push('Static /kho-phim shell must provide direct discovery links to the movie cohort.');
  }
  if (pathname === '/phim-sap-chieu' && (html.match(/href="https:\/\/khophim\.org\/phim\//g) || []).length < 5) {
    failures.push('Static /phim-sap-chieu shell must link directly to the upcoming trailer cohort.');
  }
  if (['/phim-le', '/phim-bo', '/phim-moi-nhat'].includes(pathname)
    && !html.includes('data-kp-contextual-movie-links="true"')) {
    failures.push(`Static catalogue shell lacks contextual links to indexable movie pages: ${pathname}.`);
  }
}

const rootXml = await read('sitemap.xml');
const childLocs = locs(rootXml);
const requiredChildren = [
  `${SITE_URL}/sitemap-static.xml`,
  `${SITE_URL}/sitemap-seo-landing.xml`,
  `${SITE_URL}/sitemap-movies-recent.xml`,
  `${SITE_URL}/sitemap-movies-upcoming.xml`,
  `${SITE_URL}/sitemap-seo-studio.xml`,
  `${SITE_URL}/sitemap-movies-1.xml`,
];
for (const required of requiredChildren) {
  if (!childLocs.includes(required)) failures.push(`Root sitemap is missing ${required}.`);
}
for (const forbidden of ['sitemap-movies-ongoing.xml', 'feed.xml', 'sitemap-movies-2.xml']) {
  if (rootXml.includes(forbidden)) failures.push(`Root sitemap depends on unavailable or stale child ${forbidden}.`);
}

for (const childLoc of childLocs) {
  const childName = new URL(childLoc).pathname.replace(/^\//, '');
  if (!(await exists(path.join(OUT_DIR, childName)))) {
    failures.push(`Root sitemap child is not present in the artifact: ${childName}.`);
  }
}

for (const failOpenFile of ['sitemap-movies-ongoing.xml', 'feed.xml']) {
  if (!(await exists(path.join(OUT_DIR, failOpenFile)))) {
    failures.push(`Quota-safe discovery fallback is missing: ${failOpenFile}.`);
  }
}
const ongoingFallback = await read('sitemap-movies-ongoing.xml').catch(() => '');
if (!ongoingFallback.includes('<urlset')) failures.push('Static ongoing sitemap fallback is not valid XML.');
const rssFallback = await read('feed.xml').catch(() => '');
if (!rssFallback.includes('<rss') || !rssFallback.includes('<channel>')) failures.push('Static RSS fallback is not valid RSS.');
const headersFile = await read('_headers').catch(() => '');
if (!/\/search\*\r?\n\s+Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r?\n\s+X-Robots-Tag: noindex, follow/.test(headersFile)) {
  failures.push('Static search fallback must remain noindex when Pages Functions fail open.');
}

const movieSitemapNames = childLocs
  .map((loc) => new URL(loc).pathname.replace(/^\//, ''))
  .filter((name) => ['sitemap-movies-recent.xml', 'sitemap-movies-upcoming.xml'].includes(name) || /^sitemap-movies-\d+\.xml$/.test(name));
const movieUrls = new Set();
for (const sitemapName of movieSitemapNames) {
  for (const url of locs(await read(sitemapName))) {
    if (url.startsWith(`${SITE_URL}/phim/`)) movieUrls.add(url);
  }
}

const upcomingUrls = new Set(locs(await read('sitemap-movies-upcoming.xml')));
for (const movieUrl of upcomingUrls) {
  const slug = decodeURIComponent(new URL(movieUrl).pathname.replace(/^\/phim\//, ''));
  const html = await read(path.join('phim', `${slug}.html`));
  if (!html.includes('data-kp-upcoming="true"')) failures.push(`Upcoming movie lacks its lifecycle marker: ${movieUrl}.`);
  if (!html.includes('youtube-nocookie.com/embed/')) failures.push(`Upcoming movie lacks a visible YouTube trailer: ${movieUrl}.`);
  if (/"potentialAction":\s*\{\s*"@type":\s*"WatchAction"/.test(html)) {
    failures.push(`Upcoming movie advertises a WatchAction before playback exists: ${movieUrl}.`);
  }
  if (/href="\/xem-phim\//.test(html)) failures.push(`Upcoming movie exposes a premature watch link: ${movieUrl}.`);
}

for (const movieUrl of movieUrls) {
  const slug = decodeURIComponent(new URL(movieUrl).pathname.replace(/^\/phim\//, ''));
  const relativePath = path.join('phim', `${slug}.html`);
  if (!(await exists(path.join(OUT_DIR, relativePath)))) {
    failures.push(`Sitemap movie has no static page: ${movieUrl}.`);
    continue;
  }
  const html = await read(relativePath);
  if (/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) failures.push(`Sitemap movie is noindex in its static HTML: ${movieUrl}.`);
  if (!html.includes(`<link rel="canonical" href="${movieUrl}">`)) failures.push(`Sitemap movie lacks a self canonical: ${movieUrl}.`);
  if (!/<h1\b/i.test(html)) failures.push(`Sitemap movie lacks an H1: ${movieUrl}.`);
  if (!/"@type":"Movie"|"@type":\s*"Movie"/.test(html)) failures.push(`Sitemap movie lacks Movie structured data: ${movieUrl}.`);
}

if (failures.length) {
  console.error('Production SEO artifact regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Production SEO artifact passed: ${childLocs.length} child sitemaps, ${movieUrls.size} unique sitemap movies, ${movieFiles.length} movie documents.`);
