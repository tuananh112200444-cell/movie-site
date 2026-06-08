import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SITE_URL, seoLandingUrls } from './seo-data.mjs';

const errors = [];
const warnings = [];

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

const robots = await read('public/robots.txt');
if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) {
  addError('robots.txt must point to the canonical sitemap index.');
}
if (/crawl-delay\s*:/i.test(robots)) {
  addError('robots.txt contains Crawl-delay, which slows Screaming Frog and some crawlers.');
}
const globalRobotsBlock = robots.split(/\n\s*User-agent:/i)[0];
if (/Disallow:\s*\/\s*$/im.test(globalRobotsBlock)) {
  addError('robots.txt has a global User-agent: * Disallow: / rule.');
}

const sitemapIndex = await read('public/sitemap.xml');
const childSitemaps = extractLocs(sitemapIndex);
if (childSitemaps.length < 3) {
  addError('sitemap.xml should include static, seo landing, and movie sitemaps.');
}

for (const loc of childSitemaps) {
  if (!loc.startsWith(`${SITE_URL}/`)) {
    addError(`Sitemap loc is not canonical: ${loc}`);
    continue;
  }
  const fileName = loc.replace(`${SITE_URL}/`, '');
  if (!fileName.endsWith('.xml')) continue;
  if (fileName === 'sitemap-movies.xml') {
    continue;
  }
  if (!(await exists(resolve('public', fileName)))) {
    addError(`Sitemap index points to missing public/${fileName}.`);
  }
}

const seoSitemap = await read('public/sitemap-seo-landing.xml');
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
const staticLocs = extractLocs(staticSitemap);
const duplicateStaticLocs = staticLocs.filter((loc, index) => staticLocs.indexOf(loc) !== index);
if (duplicateStaticLocs.length > 0) {
  addWarning(`sitemap-static.xml has duplicate locs: ${[...new Set(duplicateStaticLocs)].join(', ')}`);
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
