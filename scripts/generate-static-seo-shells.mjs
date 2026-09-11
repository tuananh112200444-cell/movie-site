import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SITE_URL = 'https://khophim.org';
const OUT_DIR = path.resolve('out');
const rootSitemap = await readFile(path.join(OUT_DIR, 'sitemap.xml'), 'utf8');
const sitemapNames = [...rootSitemap.matchAll(/<loc>https:\/\/khophim\.org\/([^<]+)<\/loc>/g)]
  .map((match) => match[1])
  .filter((name) => name === 'sitemap-static.xml' || name === 'sitemap-seo-landing.xml');

const paths = new Set();
for (const sitemapName of sitemapNames) {
  const xml = await readFile(path.join(OUT_DIR, sitemapName), 'utf8');
  for (const match of xml.matchAll(/<loc>https:\/\/khophim\.org(\/[^<]*)<\/loc>/g)) {
    const pathname = new URL(match[1], SITE_URL).pathname.replace(/\/+$/, '') || '/';
    if (pathname !== '/' && pathname !== '/press') paths.add(pathname);
  }
}

const baseHtml = await readFile(path.join(OUT_DIR, 'index.html'), 'utf8');
const homeFallback = await readFile(path.join(OUT_DIR, 'home-fallback.json'), 'utf8');
const regularMovieLocs = [...(await readFile(path.join(OUT_DIR, 'sitemap-movies-1.xml'), 'utf8')).matchAll(/<loc>(https:\/\/khophim\.org\/phim\/[^<]+)<\/loc>/g)]
  .map((match) => match[1]);
const upcomingMovieLocs = [...(await readFile(path.join(OUT_DIR, 'sitemap-movies-upcoming.xml'), 'utf8')).matchAll(/<loc>(https:\/\/khophim\.org\/phim\/[^<]+)<\/loc>/g)]
  .map((match) => match[1]);
const upcomingMovieUrls = new Set(upcomingMovieLocs);
const catalogMovieLocs = [...new Set([...regularMovieLocs, ...upcomingMovieLocs])];
const catalogRecords = [];
for (const movieUrl of catalogMovieLocs) {
  const slug = decodeURIComponent(new URL(movieUrl).pathname.replace(/^\/phim\//, ''));
  const movieHtml = await readFile(path.join(OUT_DIR, 'phim', `${slug}.html`), 'utf8');
  const name = movieHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || slug.replace(/-/g, ' ');
  const bootstrap = JSON.parse(await readFile(path.join(OUT_DIR, 'movie-data', `${slug}.json`), 'utf8'));
  catalogRecords.push({
    url: movieUrl,
    slug,
    name,
    movie: bootstrap?.detail?.movie || {},
    upcoming: upcomingMovieUrls.has(movieUrl),
  });
}
const worker = await import(`${pathToFileURL(path.resolve('functions/[[path]].js')).href}?static-shells=${Date.now()}`);

function taxonomySlugs(value) {
  return new Set((Array.isArray(value) ? value : [])
    .map((item) => typeof item === 'string' ? item : item?.slug)
    .map((item) => String(item || '').trim())
    .filter(Boolean));
}

const countryPathSlugs = new Map([
  ['/phim-viet-nam', 'viet-nam'],
  ['/phim-trung-quoc', 'trung-quoc'],
  ['/phim-han-quoc', 'han-quoc'],
  ['/phim-thai-lan', 'thai-lan'],
  ['/phim-au-my', 'au-my'],
  ['/phim-nhat-ban', 'nhat-ban'],
]);

function matchesContext(record, pathname) {
  const movie = record.movie || {};
  const type = String(movie.type || '').toLowerCase();
  const categories = taxonomySlugs(movie.category);
  const countries = taxonomySlugs(movie.country);
  if (pathname === '/kho-phim') return true;
  if (pathname === '/phim-sap-chieu') return record.upcoming;
  if (pathname === '/phim-le') return /single|phim-le/.test(type);
  if (pathname === '/phim-bo') return /series|tv|phim-bo/.test(type);
  if (pathname === '/phim-chieu-rap') return movie.chieurap === true;
  if (pathname === '/hoat-hinh' || pathname === '/anime') return categories.has('hoat-hinh') || categories.has('anime');
  if (pathname === '/phim-moi-nhat' || pathname === '/phim-moi-cap-nhat') return !record.upcoming;
  if (pathname.startsWith('/the-loai/')) return categories.has(pathname.slice('/the-loai/'.length));
  const countrySlug = countryPathSlugs.get(pathname);
  return countrySlug ? countries.has(countrySlug) : false;
}

function contextualMovieLinks(pathname) {
  const matches = catalogRecords.filter((record) => matchesContext(record, pathname));
  const limit = pathname === '/kho-phim' ? matches.length : 48;
  return matches.slice(0, limit).map((record) => `<li><a href="${record.url}">${record.name}</a></li>`).join('');
}

function replaceHeadValue(html, selectorPattern, value) {
  return html.replace(selectorPattern, value);
}

function shellFromPrerender(prerenderHtml, pathname) {
  const title = prerenderHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
  const description = prerenderHtml.match(/<meta name="description" content="([^"]*)">/i)?.[1] || '';
  const robots = prerenderHtml.match(/<meta name="robots" content="([^"]*)">/i)?.[1] || 'index, follow';
  const canonical = prerenderHtml.match(/<link rel="canonical" href="([^"]*)">/i)?.[1] || '';
  const ogTitle = prerenderHtml.match(/<meta property="og:title" content="([^"]*)">/i)?.[1] || title;
  const ogDescription = prerenderHtml.match(/<meta property="og:description" content="([^"]*)">/i)?.[1] || description;
  const schema = prerenderHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1] || '';
  let main = prerenderHtml.match(/<main>([\s\S]*?)<\/main>/i)?.[1] || '';
  if (!title || !description || !canonical || !main) throw new Error(`Incomplete prerender for ${canonical || 'unknown path'}`);
  const contextualLinks = contextualMovieLinks(pathname);
  if (contextualLinks) {
    const heading = pathname === '/phim-sap-chieu'
      ? 'Phim sắp chiếu có trailer và thông tin đầy đủ'
      : 'Phim có thông tin đầy đủ trong danh mục này';
    main += `<section data-kp-contextual-movie-links="true" aria-labelledby="static-catalog-heading"><h2 id="static-catalog-heading">${heading}</h2><ol>${contextualLinks}</ol></section>`;
  }

  let html = baseHtml;
  html = html.replace(/<!-- noscript: readable fallback[\s\S]*?<\/noscript>/i, '');
  html = replaceHeadValue(html, /<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = replaceHeadValue(html, /<meta name="description" content="[^"]*"\s*\/?>/i, `<meta name="description" content="${description}" />`);
  html = replaceHeadValue(html, /<meta name="robots" content="[^"]*"\s*\/?>/i, `<meta name="robots" content="${robots}" />`);
  html = replaceHeadValue(html, /<meta name="googlebot" content="[^"]*"\s*\/?>/i, `<meta name="googlebot" content="${robots}" />`);
  html = replaceHeadValue(html, /<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${ogTitle}" />`);
  html = replaceHeadValue(html, /<meta property="og:description" content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${ogDescription}" />`);
  html = replaceHeadValue(html, /<meta property="og:url" content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${canonical}" />`);
  html = replaceHeadValue(html, /<meta name="twitter:title" content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${ogTitle}" />`);
  html = replaceHeadValue(html, /<meta name="twitter:description" content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${ogDescription}" />`);
  html = html.replace(/<link rel="canonical"[^>]*>\s*/gi, '');
  html = html.replace('</head>', `  <link rel="canonical" href="${canonical}">\n  <link rel="alternate" hreflang="vi" href="${canonical}">\n  <link rel="alternate" hreflang="vi-VN" href="${canonical}">\n  <link rel="alternate" hreflang="x-default" href="${canonical}">\n  ${schema ? `<script type="application/ld+json" data-kp-static-route-schema="true">${schema}</script>` : ''}\n</head>`);
  html = html.replace(
    /<div\s+id="root"([^>]*)><\/div>/i,
    `<div id="root"$1><main data-kp-static-route-shell="true">${main}</main></div>`,
  );
  if (!html.includes('data-kp-static-route-shell="true"')) {
    throw new Error(`App root was not populated for ${canonical}`);
  }
  return html;
}

const contextFor = (pathname) => ({
  request: new Request(`${SITE_URL}${pathname}`, { headers: { 'User-Agent': 'Googlebot/2.1', Accept: 'text/html' } }),
  env: {
    ASSETS: {
      fetch: async (request) => {
        const requestPath = new URL(request.url).pathname;
        if (requestPath === '/home-fallback.json') {
          return new Response(homeFallback, { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(baseHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      },
    },
  },
  next: async () => new Response(baseHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  waitUntil: () => {},
});

const pathList = [...paths].sort();
let cursor = 0;
const generated = [];
async function generateWorker() {
  while (cursor < pathList.length) {
    const pathname = pathList[cursor++];
    const response = await worker.onRequest(contextFor(pathname));
    if (response.status !== 200) throw new Error(`Static SEO shell returned HTTP ${response.status}: ${pathname}`);
    const shell = shellFromPrerender(await response.text(), pathname);
    const destination = path.join(OUT_DIR, `${pathname.replace(/^\//, '')}.html`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, shell, 'utf8');
    generated.push(pathname);
  }
}
await Promise.all(Array.from({ length: 4 }, () => generateWorker()));

// These exact SPA rewrites would mask clean-URL HTML assets during a Pages
// Functions quota fail-open. Keep wildcard/private routes, but let generated
// public SEO routes resolve to their own static shell.
const redirectsPath = path.join(OUT_DIR, '_redirects');
const redirects = await readFile(redirectsPath, 'utf8');
const generatedSet = new Set(generated);
const safeRedirects = redirects
  .split(/\r?\n/)
  .filter((line) => {
    const source = line.trim().split(/\s+/)[0] || '';
    return !generatedSet.has(source.replace(/\/+$/, '') || '/');
  })
  .join('\n');
await writeFile(redirectsPath, safeRedirects, 'utf8');

console.log(`Generated ${generated.length} static SEO route shells with React fallback.`);
