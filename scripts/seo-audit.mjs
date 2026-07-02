import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SITE_URL, seoLandingUrls } from './seo-data.mjs';
import { MHOPHIM_URL, satellitePages } from './mhophim-satellite-data.mjs';

const errors = [];
const warnings = [];
const SECONDARY_DOMAIN_PATTERN = /https?:\/\/(?:www\.)?mhophim\.com/i;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function read(path) {
  return readFile(resolve(path), 'utf8');
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim());
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function hasMojibake(value) {
  return /Ã|Â»|Â¼|â€|Æ°|áº|á»/.test(value);
}

function isDynamicMovieSitemap(fileName) {
  return fileName === 'sitemap-movies.xml'
    || fileName === 'sitemap-movies-recent.xml'
    || fileName === 'sitemap-movies-upcoming.xml'
    || /^sitemap-movies-\d+\.xml$/.test(fileName);
}

const robots = await read('public/robots.txt');
if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) {
  addError('robots.txt must point to the canonical sitemap index.');
}
if (SECONDARY_DOMAIN_PATTERN.test(robots)) {
  addError('robots.txt must not reference the secondary domain mhophim.com.');
}
if (/crawl-delay\s*:/i.test(robots)) {
  addError('robots.txt contains Crawl-delay, which slows Screaming Frog and some crawlers.');
}
const globalRobotsBlock = robots.split(/\n\s*User-agent:/i)[0];
if (/Disallow:\s*\/\s*$/im.test(globalRobotsBlock)) {
  addError('robots.txt has a global User-agent: * Disallow: / rule.');
}

const redirects = await read('public/_redirects');
for (const host of ['www.khophim.org']) {
  const expected = `https://${host}/* https://khophim.org/:splat 301!`;
  if (!redirects.includes(expected)) {
    addError(`public/_redirects is missing canonical redirect: ${expected}`);
  }
}
for (const expected of [
  'https://www.mhophim.com/* https://mhophim.com/:splat 301!',
  'https://mhophim.com/phim/* https://khophim.org/phim/:splat 301!',
  'https://mhophim.com/search* https://khophim.org/search:splat 301!',
  'https://mhophim.com/robots.txt /mhophim/robots.txt 200!',
  'https://mhophim.com/sitemap.xml /mhophim/sitemap.xml 200!',
  'https://mhophim.com/ /mhophim/index.html 200!',
]) {
  if (!redirects.includes(expected)) {
    addError(`public/_redirects is missing MHoPhim satellite rule: ${expected}`);
  }
}
if (!redirects.includes('/* /index.html 200')) {
  addError('public/_redirects must keep the SPA fallback after canonical redirects.');
}

const llms = await read('public/llms.txt').catch(() => '');
if (!/^#\s+\S+/m.test(llms)) {
  addError('llms.txt must start with an H1 title, for example "# KhoPhim.org".');
}
const llmsLinks = [...llms.matchAll(/\[[^\]]+\]\((https:\/\/khophim\.org(?:\/[^)]*)?)\)/g)].map((match) => match[1]);
if (llmsLinks.length < 8) {
  addError('llms.txt should contain important khophim.org links for agents and web browsing tools.');
}
for (const requiredLink of [`${SITE_URL}/`, `${SITE_URL}/search`, `${SITE_URL}/sitemap.xml`, `${SITE_URL}/robots.txt`]) {
  if (!llmsLinks.includes(requiredLink)) addError(`llms.txt is missing required link: ${requiredLink}`);
}
if (hasMojibake(llms)) {
  addError('llms.txt contains mojibake text.');
}

const indexHtml = await read('index.html');
if (SECONDARY_DOMAIN_PATTERN.test(indexHtml)) {
  addError('index.html must not contain mhophim.com; all SEO signals must point to khophim.org.');
}
if (!indexHtml.includes(`<link rel="canonical" href="${SITE_URL}`)) {
  addError('index.html must declare khophim.org as the canonical homepage.');
}
if (indexHtml.includes("gtag('config', 'G-6B5GLB9W6H');")) {
  addError('index.html sends an automatic GA page_view before SPA tracking.');
}
if (indexHtml.includes('G-XXXXXXXXXX')) {
  addError('index.html contains a placeholder GA measurement id.');
}
const noscriptFallback = indexHtml.match(/<!-- noscript: readable fallback[\s\S]*?<script type="module"/)?.[0] ?? '';
if (hasMojibake(noscriptFallback)) {
  addError('index.html noscript SEO fallback contains mojibake text.');
}

const analyticsTs = await read('src/utils/analytics.ts');
if (analyticsTs.includes('G-XXXXXXXXXX')) {
  addError('src/utils/analytics.ts contains a placeholder GA measurement id.');
}

const sitemapIndex = await read('public/sitemap.xml');
if (SECONDARY_DOMAIN_PATTERN.test(sitemapIndex)) {
  addError('sitemap.xml must not contain mhophim.com URLs.');
}
const childSitemaps = extractLocs(sitemapIndex);
if (childSitemaps.length < 3) {
  addError('sitemap.xml should include static, seo landing, and movie sitemaps.');
}
if (childSitemaps.includes(`${SITE_URL}/sitemap-movies.xml`)) {
  addError('sitemap.xml should not list the full sitemap-movies.xml; use chunked movie sitemaps to improve crawl stability.');
}
for (let page = 1; page <= 8; page += 1) {
  const chunkLoc = `${SITE_URL}/sitemap-movies-${page}.xml`;
  if (!childSitemaps.includes(chunkLoc)) {
    addError(`sitemap.xml is missing chunked movie sitemap: ${chunkLoc}`);
  }
}

for (const loc of childSitemaps) {
  if (!loc.startsWith(`${SITE_URL}/`)) {
    addError(`Sitemap loc is not canonical: ${loc}`);
    continue;
  }
  const fileName = loc.replace(`${SITE_URL}/`, '');
  if (!fileName.endsWith('.xml')) continue;
  if (isDynamicMovieSitemap(fileName)) {
    continue;
  }
  if (!(await exists(resolve('public', fileName)))) {
    addError(`Sitemap index points to missing public/${fileName}.`);
  }
}

const seoSitemap = await read('public/sitemap-seo-landing.xml');
if (SECONDARY_DOMAIN_PATTERN.test(seoSitemap)) {
  addError('sitemap-seo-landing.xml must not contain mhophim.com URLs.');
}
const seoLocs = extractLocs(seoSitemap);
const expectedSeoLocs = seoLandingUrls.map((item) => `${SITE_URL}${item.path}`);
const missingSeoLocs = expectedSeoLocs.filter((loc) => !seoLocs.includes(loc));
const duplicateSeoLocs = seoLocs.filter((loc, index) => seoLocs.indexOf(loc) !== index);
const fakeSeoLocs = seoLocs.filter((loc) => /-seo($|[/?#])/.test(loc));

if (seoLocs.length < 40) {
  addError(`sitemap-seo-landing.xml has only ${seoLocs.length} URLs; expected at least 40.`);
}
if (missingSeoLocs.length > 0) {
  addError(`sitemap-seo-landing.xml is missing: ${missingSeoLocs.join(', ')}`);
}
if (duplicateSeoLocs.length > 0) {
  addError(`sitemap-seo-landing.xml has duplicate locs: ${[...new Set(duplicateSeoLocs)].join(', ')}`);
}
if (fakeSeoLocs.length > 0) {
  addError(`sitemap-seo-landing.xml contains non-routed *-seo URLs: ${fakeSeoLocs.join(', ')}`);
}

const staticSitemap = await read('public/sitemap-static.xml');
if (SECONDARY_DOMAIN_PATTERN.test(staticSitemap)) {
  addError('sitemap-static.xml must not contain mhophim.com URLs.');
}
const staticLocs = extractLocs(staticSitemap);
const duplicateStaticLocs = staticLocs.filter((loc, index) => staticLocs.indexOf(loc) !== index);
if (duplicateStaticLocs.length > 0) {
  addWarning(`sitemap-static.xml has duplicate locs: ${[...new Set(duplicateStaticLocs)].join(', ')}`);
}

const mhophimRobots = await read('public/mhophim/robots.txt').catch(() => '');
if (!mhophimRobots.includes(`Sitemap: ${MHOPHIM_URL}/sitemap.xml`)) {
  addError('public/mhophim/robots.txt must point to the MHoPhim sitemap.');
}
if (!/Disallow:\s*\/phim\//i.test(mhophimRobots) || !/Disallow:\s*\/search/i.test(mhophimRobots)) {
  addError('public/mhophim/robots.txt must block duplicate movie/search paths.');
}

const mhophimSitemap = await read('public/mhophim/sitemap.xml').catch(() => '');
const mhophimLocs = extractLocs(mhophimSitemap);
const expectedMhophimLocs = satellitePages.map((page) => `${MHOPHIM_URL}${page.path === '/' ? '/' : page.path}`);
const missingMhophimLocs = expectedMhophimLocs.filter((loc) => !mhophimLocs.includes(loc));
const duplicateMhophimLocs = mhophimLocs.filter((loc, index) => mhophimLocs.indexOf(loc) !== index);
if (mhophimLocs.length !== satellitePages.length) {
  addError(`public/mhophim/sitemap.xml has ${mhophimLocs.length} URLs; expected ${satellitePages.length}.`);
}
if (missingMhophimLocs.length > 0) {
  addError(`public/mhophim/sitemap.xml is missing: ${missingMhophimLocs.join(', ')}`);
}
if (duplicateMhophimLocs.length > 0) {
  addError(`public/mhophim/sitemap.xml has duplicate locs: ${[...new Set(duplicateMhophimLocs)].join(', ')}`);
}
for (const loc of mhophimLocs) {
  if (!loc.startsWith(`${MHOPHIM_URL}/`)) {
    addError(`MHoPhim sitemap loc is not canonical: ${loc}`);
  }
  if (/\/(?:phim|search)(?:\/|$|\?)/.test(new URL(loc).pathname)) {
    addError(`MHoPhim sitemap must not include duplicate movie/search URL: ${loc}`);
  }
}

for (const page of satellitePages) {
  const filePath = page.path === '/'
    ? 'public/mhophim/index.html'
    : `public/mhophim/${page.path.replace(/^\/+/, '')}/index.html`;
  const html = await read(filePath).catch(() => '');
  const canonical = `${MHOPHIM_URL}${page.path === '/' ? '/' : page.path}`;
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) {
    addError(`${filePath} must declare self canonical ${canonical}.`);
  }
  if (!html.includes('MHoPhim') || !html.includes('khophim.org')) {
    addError(`${filePath} must brand MHoPhim and link to khophim.org.`);
  }
  if (hasMojibake(html)) {
    addError(`${filePath} contains mojibake text.`);
  }
}

if (warnings.length > 0) {
  console.warn('SEO audit warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error('SEO audit failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`SEO audit passed. Checked ${seoLocs.length} SEO landing URLs and ${childSitemaps.length} sitemap entries.`);
