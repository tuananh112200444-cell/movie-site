import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE_URL = 'https://khophim.org';
const OUTPUT_DIR = path.join('out', 'phim');
const CONCURRENCY = 12;

function locs(xml) {
  return [...xml.matchAll(/<loc>(https:\/\/khophim\.org\/phim\/([a-z0-9-]+))<\/loc>/g)]
    .map((match) => ({ url: match[1], slug: match[2] }));
}

function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>(https:\/\/khophim\.org\/sitemap-movies-[^<]+\.xml)<\/loc>/g)]
    .map((match) => match[1]);
}

async function fetchText(url, accept = 'text/html') {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function patchSpiderMan(html) {
  const slug = 'spider-man-brand-new-day-2026';
  const title = 'Người Nhện: Khởi Đầu Mới (2026) – Thông Tin Phim | KhoPhim';
  const description = 'Người Nhện: Khởi Đầu Mới (Spider-Man: Brand New Day) – nội dung, diễn viên, trailer, lịch phát hành và thông tin cập nhật tại KhoPhim.';
  const review = 'Người Nhện là bộ phim siêu anh hùng hấp dẫn của Marvel, kể về hành trình Peter Parker học cách sử dụng sức mạnh và bảo vệ mọi người. Phim sở hữu cốt truyện dễ theo dõi, kết hợp hài hòa giữa hành động, hài hước và cảm xúc. Điểm nổi bật của phim là diễn xuất tự nhiên, nhân vật gần gũi cùng những cảnh đu tơ và chiến đấu mãn nhãn. Kỹ xảo đẹp, âm thanh sống động và nhịp phim nhanh giúp trải nghiệm xem luôn cuốn hút. Dù một số tình tiết còn dễ đoán, đây vẫn là bộ phim đáng xem dành cho người yêu thích Marvel và thể loại siêu anh hùng. Đánh giá: 8,5/10. Điểm đáng chú ý của Người Nhện: Khởi Đầu Mới là việc Peter Parker phải tự đưa ra quyết định khi không còn những người bạn quen thuộc hỗ trợ. Nếu phim khai thác tốt sự cô độc, trách nhiệm và hậu quả từ lựa chọn của Peter, câu chuyện có thể tạo được chiều sâu bên cạnh các cảnh hành động.';
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let next = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(title)}</title>`)
    .replace(/(<meta\s+name=["']description["']\s+content=["'])[^"']*(["'])/i, `$1${escape(description)}$2`)
    .replace(/(<meta\s+property=["']og:title["']\s+content=["'])[^"']*(["'])/i, `$1${escape(title)}$2`)
    .replace(/(<meta\s+property=["']og:description["']\s+content=["'])[^"']*(["'])/i, `$1${escape(description)}$2`)
    .replace(/(<meta\s+name=["']twitter:title["']\s+content=["'])[^"']*(["'])/i, `$1${escape(title)}$2`)
    .replace(/(<meta\s+name=["']twitter:description["']\s+content=["'])[^"']*(["'])/i, `$1${escape(description)}$2`);

  const marker = '<span data-kp-seo-profile-version="7" hidden></span>';
  if (!next.includes('data-kp-seo-profile-version="7"')) {
    next = next.replace(
      new RegExp(`(<main[^>]+data-kp-static-movie=["']${slug}["'][^>]*>)`, 'i'),
      `$1\n        ${marker}`,
    );
  }

  const editorial = `<nav aria-label="Bài viết liên quan"><h2>Khám phá thêm về Người Nhện: Khởi Đầu Mới</h2><ul><li><a href="/the-loai/hanh-dong">phim hành động</a> — Khám phá các phim hành động có nhiều cảnh chiến đấu và phiêu lưu.</li><li><a href="/phim-au-my">phim Âu Mỹ</a> — Danh sách phim điện ảnh và phim bộ Âu Mỹ đang có trên KhoPhim.</li></ul></nav><section aria-labelledby="movie-review-heading"><h2 id="movie-review-heading">Đánh giá Người Nhện: Khởi Đầu Mới</h2><p>${escape(review)}</p></section>`;
  if (!next.includes('movie-review-heading')) {
    next = next.replace(
      new RegExp(`(<p><a href=["']/xem-phim/${slug}["'])`, 'i'),
      `${editorial}\n        $1`,
    );
  }
  return next;
}

const sitemapIndex = await fetchText(`${SITE_URL}/sitemap-movies.xml`, 'application/xml,text/xml');
const childSitemaps = sitemapLocs(sitemapIndex);
if (childSitemaps.length === 0) throw new Error('Production movie sitemap index did not list any child sitemap.');
const sitemapXmls = await Promise.all(
  childSitemaps.map((url) => fetchText(url, 'application/xml,text/xml')),
);
const pageMap = new Map();
for (const sitemapXml of sitemapXmls) {
  for (const page of locs(sitemapXml)) pageMap.set(page.slug, page);
}
const pages = [...pageMap.values()];
if (pages.length < 1000) throw new Error(`Production sitemap only returned ${pages.length} movie pages.`);

await mkdir(OUTPUT_DIR, { recursive: true });
let cursor = 0;
let written = 0;
async function worker() {
  while (cursor < pages.length) {
    const current = pages[cursor++];
    let html = await fetchText(`${current.url}?static_recovery=20260828`);
    if (!/<main[^>]+data-kp-static-movie=/i.test(html)) throw new Error(`${current.slug} did not return static movie HTML.`);
    if (current.slug === 'spider-man-brand-new-day-2026') html = patchSpiderMan(html);
    await writeFile(path.join(OUTPUT_DIR, `${current.slug}.html`), html, 'utf8');
    written += 1;
    if (written % 200 === 0) console.log(`[static-recovery] ${written}/${pages.length}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
console.log(`Recovered ${written} static movie pages from production.`);
