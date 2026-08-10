import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const workerSource = fs.readFileSync('functions/[[path]].js', 'utf8');
const sitemapGenerator = fs.readFileSync('scripts/generate-static-sitemap.mjs', 'utf8');
const internalLinkSources = [
  'src/components/base/MovieCard.tsx',
  'src/components/feature/SearchSuggestions.tsx',
  'src/pages/search/components/SearchResultItem.tsx',
  'src/pages/home/components/HeroBanner.tsx',
  'src/pages/home/components/QueerUniverseHero.tsx',
  'src/pages/home/components/QueerUniverseHome.tsx',
  'src/pages/home/components/TrendingSection.tsx',
];

for (const [needle, message] of [
  ['renderMovieCatalogIndex', 'missing crawlable movie-catalog index'],
  ['renderMovieCatalogPage', 'missing crawlable movie-catalog page'],
  ['fetchContextualMovieLinks', 'movie prerender lacks contextual movie links'],
  ['/kho-phim/trang/', 'catalog pagination is not linked'],
  ['Toàn bộ kho phim', 'SEO hubs do not link to the full movie catalogue'],
]) {
  assert.ok(workerSource.includes(needle), message);
}
assert.ok(sitemapGenerator.includes("{ path: '/kho-phim'"), 'catalog root is missing from the static sitemap');
for (const sourcePath of internalLinkSources) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.ok(!source.includes('?source=ophim'), `${sourcePath} emits a duplicate movie-detail URL variant`);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes('/sitemap-index')) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://khophim.org/sitemap-movies-1.xml</loc></sitemap>
        <sitemap><loc>https://khophim.org/sitemap-movies-2.xml</loc></sitemap>
      </sitemapindex>`, {
      headers: { 'Content-Type': 'application/xml', 'X-Movie-Chunk-Count': '2' },
    });
  }
  if (url.includes('/sitemap-movies-xml')) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
        <url><loc>https://khophim.org/phim/phim-thu-nhat</loc><lastmod>2026-08-10</lastmod><image:image><image:title>Phim Thứ Nhất</image:title></image:image></url>
        <url><loc>https://khophim.org/phim/phim-thu-hai</loc><lastmod>2026-08-09</lastmod><image:image><image:title>Phim Thứ Hai</image:title></image:image></url>
      </urlset>`, {
      headers: { 'Content-Type': 'application/xml', 'X-Movie-Count': '2' },
    });
  }
  throw new Error(`Unexpected fetch in internal discovery test: ${url}`);
};

try {
  const worker = await import(`${pathToFileURL('functions/[[path]].js').href}?test=${Date.now()}`);
  const contextFor = (path) => ({
    request: new Request(`https://khophim.org${path}`, {
      headers: { 'User-Agent': 'Googlebot' },
    }),
    env: {},
    next: () => { throw new Error('catalog route fell through to SPA'); },
    waitUntil: () => {},
  });

  const indexResponse = await worker.onRequest(contextFor('/kho-phim'));
  const indexHtml = await indexResponse.text();
  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.headers.get('X-Robots-Tag') || '', /^index, follow/);
  assert.match(indexHtml, /rel="canonical" href="https:\/\/khophim\.org\/kho-phim"/);
  assert.match(indexHtml, /href="https:\/\/khophim\.org\/kho-phim\/trang\/1"/);
  assert.match(indexHtml, /href="https:\/\/khophim\.org\/kho-phim\/trang\/2"/);

  const pageResponse = await worker.onRequest(contextFor('/kho-phim/trang/1'));
  const pageHtml = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(pageHtml, /href="https:\/\/khophim\.org\/phim\/phim-thu-nhat">Phim Thứ Nhất<\/a>/);
  assert.match(pageHtml, /href="https:\/\/khophim\.org\/phim\/phim-thu-hai">Phim Thứ Hai<\/a>/);
  assert.match(pageHtml, /rel="canonical" href="https:\/\/khophim\.org\/kho-phim\/trang\/1"/);

  const redirectResponse = await worker.onRequest(contextFor('/kho-phim/trang/1?utm_source=test'));
  assert.equal(redirectResponse.status, 301);
  assert.equal(redirectResponse.headers.get('Location'), 'https://khophim.org/kho-phim/trang/1');

  const sourceVariantResponse = await worker.onRequest(contextFor('/phim/phim-thu-nhat?source=ophim'));
  assert.equal(sourceVariantResponse.status, 301);
  assert.equal(sourceVariantResponse.headers.get('Location'), 'https://khophim.org/phim/phim-thu-nhat');

  const genreFilterResponse = await worker.onRequest(contextFor('/filter?genre=hanh-dong'));
  assert.equal(genreFilterResponse.status, 301);
  assert.equal(genreFilterResponse.headers.get('Location'), 'https://khophim.org/the-loai/hanh-dong');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Internal discovery regression passed: catalog HTML, canonicals, and direct movie links are intact.');
