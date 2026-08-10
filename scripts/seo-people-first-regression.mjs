import { readFile } from 'node:fs/promises';

const [landing, about, banner, edge] = await Promise.all([
  readFile('src/pages/seo-landing/page.tsx', 'utf8'),
  readFile('src/pages/about/page.tsx', 'utf8'),
  readFile('src/components/feature/NavBanner.tsx', 'utf8'),
  readFile('functions/[[path]].js', 'utf8'),
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
expect(banner.includes('format=auto,anim=true') && banner.includes('restoreOriginalBanner'),
  'Animated banners must use the optimized animated format with an original-GIF fallback.');
expect(!edge.includes('Độ mới của cập nhật tập:') && !edge.includes('Ưu tiên cập nhật mới:'),
  'Movie prerender content must not expose internal SEO scores or priority language.');

if (failures.length) {
  console.error('People-first SEO regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('People-first SEO regression passed.');
