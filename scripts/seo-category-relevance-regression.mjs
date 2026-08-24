import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const worker = await import(`${pathToFileURL('functions/[[path]].js').href}?category-relevance=${Date.now()}`);

const movieFor = (slug, page) => ({
  slug: `${slug}-phim-trang-${page}`,
  name: `${slug} phim trang ${page}`,
  year: 2026,
  episode_current: 'Tập 8',
  category: [{ slug }],
});

const catalogFetch = async (input) => {
  const url = new URL(String(input));
  const category = url.searchParams.get('category') || '';
  const slug = category.match(/"slug":"([a-z0-9-]+)"/)?.[1] || 'khac';
  const page = Math.floor(Number(url.searchParams.get('offset') || 0) / 24) + 1;
  const rows = [movieFor(slug, page)];
  return new Response(JSON.stringify(rows), {
    status: 206,
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': `${(page - 1) * 24}-${((page - 1) * 24) + rows.length - 1}/72`,
    },
  });
};

const contextFor = (path) => ({
  request: new Request(`https://khophim.org${path}`, { headers: { 'User-Agent': 'Googlebot' } }),
  env: {
    SEO_CATALOG_FETCH: catalogFetch,
    ASSETS: { fetch: async () => new Response(JSON.stringify({ sections: {} })) },
  },
  next: () => { throw new Error(`Unexpected SPA fallback for ${path}`); },
  waitUntil: () => {},
});

const render = async (path) => {
  const response = await worker.onRequest(contextFor(path));
  return { response, html: await response.text() };
};

const action = await render('/the-loai/hanh-dong');
const romance = await render('/the-loai/tinh-cam');
const horror = await render('/the-loai/kinh-di');

assert.equal(action.response.status, 200);
assert.equal(action.response.headers.get('X-SEO-Catalog-Source'), 'supabase-category');
assert.match(action.html, /hanh-dong-phim-trang-1/);
assert.doesNotMatch(action.html, /tinh-cam-phim-trang-1|kinh-di-phim-trang-1/);
assert.match(romance.html, /tinh-cam-phim-trang-1/);
assert.doesNotMatch(romance.html, /hanh-dong-phim-trang-1|kinh-di-phim-trang-1/);
assert.match(horror.html, /kinh-di-phim-trang-1/);
assert.doesNotMatch(horror.html, /hanh-dong-phim-trang-1|tinh-cam-phim-trang-1/);

const page2 = await render('/the-loai/hanh-dong?page=2');
assert.equal(page2.response.status, 200);
assert.match(page2.html, /<link rel="canonical" href="https:\/\/khophim\.org\/the-loai\/hanh-dong\?page=2"/);
assert.match(page2.html, /Phim Hành Động Vietsub HD - Trang 2/);
assert.match(page2.html, /hanh-dong-phim-trang-2/);
assert.match(page2.html, /rel="prev" href="https:\/\/khophim\.org\/the-loai\/hanh-dong"/);
assert.match(page2.html, /rel="next" href="https:\/\/khophim\.org\/the-loai\/hanh-dong\?page=3"/);

const crawlBoundary = await render('/the-loai/hanh-dong?page=26');
assert.equal(crawlBoundary.response.status, 404);
assert.match(crawlBoundary.response.headers.get('X-Robots-Tag') || '', /noindex, follow/);

const animationDuplicate = await render('/the-loai/hoat-hinh');
assert.equal(animationDuplicate.response.status, 301);
assert.equal(animationDuplicate.response.headers.get('Location'), 'https://khophim.org/hoat-hinh');

const unknownGenre = await render('/the-loai/khong-ton-tai');
assert.equal(unknownGenre.response.status, 404);
assert.match(unknownGenre.response.headers.get('X-Robots-Tag') || '', /noindex, follow/);

console.log('SEO category relevance regression passed.');
