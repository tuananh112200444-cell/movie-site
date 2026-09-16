import assert from 'node:assert/strict';
import { onRequest } from '../functions/[[path]].js';

const slug = 'seo-studio-edge-test';
const movie = {
  id: '11111111-1111-1111-1111-111111111111',
  slug,
  name: 'Phim Kiểm Thử SEO Studio',
  origin_name: 'SEO Studio Test Movie',
  content: 'Nội dung phim gốc dùng cho bài kiểm thử tích hợp tại biên.',
  type: 'single',
  year: 2026,
  lang: 'Vietsub',
  poster_url: 'https://images.example.com/seo-studio.webp',
  episode_current: 'Hoàn Tất (1/1)',
  actor: ['Diễn viên A'],
  director: ['Đạo diễn A'],
  category: [{ name: 'Hành Động', slug: 'hanh-dong' }],
  country: [{ name: 'Âu Mỹ', slug: 'au-my' }],
  tmdb_id: 12345,
  is_published: true,
};

const profile = {
  movie_id: movie.id,
  slug,
  status: 'published',
  focus_keyword: 'phim kiểm thử SEO Studio',
  secondary_keywords: ['phim SEO'],
  seo_title: 'Phim Kiểm Thử SEO Studio (2026) | KhoPhim',
  meta_description: 'Xem thông tin Phim Kiểm Thử SEO Studio, nội dung, diễn viên, đánh giá và các chủ đề liên quan được biên tập đầy đủ tại KhoPhim.',
  canonical_path: `/phim/${slug}`,
  og_image_url: movie.poster_url,
  index_mode: 'index',
  intro_content: 'Đây là nội dung giới thiệu đã được biên tập thủ công, hiển thị trực tiếp trong HTML dành cho Googlebot và người đọc.',
  review_content: 'Bài đánh giá độc lập giúp người đọc hiểu rõ điểm nổi bật, bối cảnh và nhóm khán giả phù hợp của bộ phim.',
  faq: [{ question: 'Phim kiểm thử có nội dung gì?', answer: 'Đây là dữ liệu dùng để xác minh toàn bộ luồng SEO Studio.' }],
  topic_links: [{ title: 'Phim hành động', anchor: 'xem phim hành động', description: 'Chủ đề liên quan', url: '/the-loai/hanh-dong' }],
  validation_score: 92,
  version: 7,
  updated_at: '2026-08-28T08:00:00.000Z',
};

function mockFetch(auditPassed) {
  return async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname.endsWith('/rest/v1/movie_seo_profiles')) {
      return Response.json([{ ...profile, live_audit: { passed: auditPassed } }]);
    }
    if (url.pathname.endsWith('/rest/v1/movie_seo_topic_links')) {
      return Response.json([{ source_slug: 'phim-cung-chu-de', title: 'Phim cùng chủ đề', anchor: 'phim liên quan', description: 'Liên kết hai chiều', target_path: `/phim/${slug}` }]);
    }
    if (url.pathname.endsWith('/functions/v1/movie-seo-prerender-data')) {
      return Response.json({ status: true, movie });
    }
    if (url.pathname.endsWith('/functions/v1/sitemap-seo-studio')) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://khophim.org/phim/${slug}</loc></url></urlset>`, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

async function render(auditPassed) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(auditPassed);
  try {
    return await onRequest({
      request: new Request(`https://khophim.org/phim/${slug}`, {
        headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
      }),
      env: {},
      waitUntil: () => undefined,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const pendingResponse = await render(false);
const pendingHtml = await pendingResponse.text();
assert.equal(pendingResponse.status, 200);
assert.match(pendingResponse.headers.get('x-robots-tag') || '', /noindex/);
assert.match(pendingHtml, /data-kp-seo-profile-version="7"/);
assert.match(pendingHtml, /Phim Kiểm Thử SEO Studio \(2026\) \| KhoPhim/);

const verifiedResponse = await render(true);
const verifiedHtml = await verifiedResponse.text();
assert.equal(verifiedResponse.status, 200);
assert.doesNotMatch(verifiedResponse.headers.get('x-robots-tag') || '', /noindex/);
assert.match(verifiedResponse.headers.get('x-robots-tag') || '', /index, follow/);
assert.match(verifiedHtml, /"@type":"FAQPage"/);
assert.match(verifiedHtml, /xem phim hành động/);
assert.match(verifiedHtml, /phim liên quan/);
assert.match(verifiedHtml, /Nội dung giới thiệu đã được biên tập thủ công/i);

const originalFetch = globalThis.fetch;
globalThis.fetch = mockFetch(true);
try {
  const unauthorizedInspection = await onRequest({
    request: new Request(`https://khophim.org/internal/seo-studio-inspect?slug=${slug}`),
    env: { MOVIE_DETAIL_PROXY_SECRET: 'integration-secret' },
    waitUntil: () => undefined,
  });
  assert.equal(unauthorizedInspection.status, 401);

  const authorizedInspection = await onRequest({
    request: new Request(`https://khophim.org/internal/seo-studio-inspect?slug=${slug}`, {
      headers: { 'X-KhoPhim-SEO-Inspect-Secret': 'integration-secret' },
    }),
    env: { MOVIE_DETAIL_PROXY_SECRET: 'integration-secret' },
    waitUntil: () => undefined,
  });
  const inspectionHtml = await authorizedInspection.text();
  assert.equal(authorizedInspection.status, 200);
  assert.equal(authorizedInspection.headers.get('x-seo-studio-inspection'), 'cloudflare-edge-render');
  assert.match(inspectionHtml, /data-kp-seo-profile-version="7"/);
  assert.match(inspectionHtml, /<link rel="canonical" href="https:\/\/khophim\.org\/phim\/seo-studio-edge-test"/);

  const freshSitemap = await onRequest({
    request: new Request('https://khophim.org/sitemap-seo-studio.xml?fresh=7-0', {
      headers: { 'X-KhoPhim-SEO-Inspect-Secret': 'integration-secret' },
    }),
    env: { MOVIE_DETAIL_PROXY_SECRET: 'integration-secret' },
    waitUntil: () => undefined,
  });
  const freshSitemapXml = await freshSitemap.text();
  assert.equal(freshSitemap.status, 200);
  assert.equal(freshSitemap.headers.get('x-sitemap-cache'), 'FRESH-BYPASS');
  assert.match(freshSitemapXml, new RegExp(`<loc>https://khophim.org/phim/${slug}</loc>`));
} finally {
  globalThis.fetch = originalFetch;
}

console.log('SEO Studio edge integration passed: pending profiles stay noindex and verified profiles render indexable Googlebot HTML.');
