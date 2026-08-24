import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [landing, about, banner, edge, comments, movieList, seoComponent] = await Promise.all([
  readFile('src/pages/seo-landing/page.tsx', 'utf8'),
  readFile('src/pages/about/page.tsx', 'utf8'),
  readFile('src/components/feature/NavBanner.tsx', 'utf8'),
  readFile('functions/[[path]].js', 'utf8'),
  readFile('src/pages/movie-detail/components/UserComments.tsx', 'utf8'),
  readFile('src/pages/movie-list/page.tsx', 'utf8'),
  readFile('src/components/base/SEO.tsx', 'utf8'),
]);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(landing.includes('readerSections') && landing.includes('isSearchEngineCopy'),
  'SEO landing pages must exclude search-engine-facing copy from visible content and FAQ schema.');
expect(!landing.includes('>KhoPhim SEO<') && !landing.includes('>Từ khóa liên quan<'),
  'Visible landing pages must not expose SEO labels or keyword-chip blocks.');
expect(!about.includes('không có quảng cáo') && !about.includes('hàng triệu người Việt Nam') && !about.includes('Toàn bộ phim trên KhoPhim'),
  'The About page must not contain unverifiable advertising, audience, or catalog claims.');
expect(about.includes('OPhim, KKPhim, BLVietsub, GLVietsub và TMDB') && about.includes('publishingPrinciples'),
  'The About page must disclose data provenance and publishing principles.');
expect(!banner.includes('/cdn-cgi/image/') && banner.includes("if (pathname.endsWith('.gif'))") && banner.includes('restoreOriginalBanner'),
  'Animated banners must avoid paid Cloudflare Images transformations and retain an original fallback.');
expect(!edge.includes('Độ mới của cập nhật tập:') && !edge.includes('Ưu tiên cập nhật mới:'),
  'Movie prerender content must not expose internal SEO scores or priority language.');
expect(!comments.includes('SEED_COMMENTS') && !comments.includes("id: 'seed-"),
  'Movie pages must not display fabricated seed comments or likes.');
expect(movieList.includes('const displayStats = [') && movieList.includes('{displayTitle}{page > 1'),
  'Movie list hero must use live page counts and avoid an unverified fixed year heading.');
expect(!seoComponent.includes("querySelectorAll('[data-kp-seo-managed=\"true\"]')")
  && seoComponent.includes('data-kp-route-schema'),
  'Client SEO must update one stable route schema instead of deleting and recreating the whole head.');

const worker = await import(`${pathToFileURL('functions/[[path]].js').href}?people-first=${Date.now()}`);
const fallbackPayload = JSON.stringify({
  sections: {
    'phim-le': [{ slug: 'phim-le-thu-nghiem', name: 'Phim Lẻ Thử Nghiệm', year: 2026, episode_current: 'Full' }],
    'phim-chieu-rap': [{ slug: 'phim-rap-thu-nghiem', name: 'Phim Rạp Thử Nghiệm', year: 2026, episode_current: 'Full' }],
    'trung-quoc': [{ slug: 'phim-trung-thu-nghiem', name: 'Phim Trung Thử Nghiệm', year: 2026, episode_current: 'Tập 12' }],
  },
});
const contextFor = (pathname) => ({
  request: new Request(`https://khophim.org${pathname}`, { headers: { 'User-Agent': 'Googlebot' } }),
  env: {
    SEO_CATALOG_FETCH: async (input) => {
      const url = new URL(input);
      const isSingle = url.searchParams.get('type')?.includes('single');
      const isChina = url.searchParams.get('country')?.includes('trung-quoc');
      const rows = isSingle
        ? [{ slug: 'phim-le-thu-nghiem', name: 'Phim Lẻ Thử Nghiệm', year: 2026, episode_current: 'Full' }]
        : isChina
          ? [{ slug: 'phim-trung-thu-nghiem', name: 'Phim Trung Thử Nghiệm', year: 2026, episode_current: 'Tập 12' }]
          : [];
      return new Response(JSON.stringify(rows), {
        status: 206,
        headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
      });
    },
    ASSETS: {
      fetch: async () => new Response(fallbackPayload, { headers: { 'Content-Type': 'application/json' } }),
    },
  },
  next: () => { throw new Error(`Unexpected SPA fallthrough for ${pathname}`); },
  waitUntil: () => {},
});

for (const pathname of ['/phim-le', '/phim-chieu-rap', '/phim-trung-quoc']) {
  const response = await worker.onRequest(contextFor(pathname));
  const html = await response.text();
  expect(response.status === 200, `${pathname} must return stable 200 HTML to crawlers.`);
  expect(response.headers.get('X-Prerendered') === 'cloudflare-static', `${pathname} must use static edge prerendering.`);
  expect(!/(?:topical authority|canonical riêng|từ khóa không dấu|\btruy vấn\b|\btối ưu\b)/i.test(html),
    `${pathname} exposes search-engine-facing copy to users.`);
  expect(/Phim .*Thử Nghiệm/.test(html), `${pathname} must render direct movie discovery links.`);
}

const sitemapResponse = await worker.onRequest(contextFor('/sitemap.xml'));
const sitemapXml = await sitemapResponse.text();
expect(sitemapResponse.status === 200, 'Root sitemap must return 200 without a database call.');
expect(sitemapResponse.headers.get('X-Sitemap-Proxy') === 'cloudflare-pages-priority-index',
  'Root sitemap must use the local crawl-recovery index.');
expect(!/sitemap-movies-\d+\.xml/.test(sitemapXml), 'Root sitemap must not advertise archive chunks during crawl recovery.');
expect(sitemapXml.includes('/sitemap-movies-recent.xml'), 'Root sitemap must retain the recent priority movie sitemap.');

if (failures.length) {
  console.error('People-first SEO regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('People-first SEO regression passed.');
