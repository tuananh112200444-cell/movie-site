import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('supabase/functions/_shared/seo-quality-v2.ts', 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const quality = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const movie = {
  name: 'Phim Kiểm Thử',
  origin_name: 'Quality Test Movie',
  title_vi: 'Phim Kiểm Thử',
  year: 2026,
  content: 'Một câu chuyện điều tra có bối cảnh rõ ràng, nhân vật trung tâm và các dữ kiện chính thức giúp người xem nhận diện đúng tác phẩm. '.repeat(8),
  poster_url: 'https://images.example.com/poster.webp',
  actor: ['Diễn viên A', 'Diễn viên B'],
  director: ['Đạo diễn A'],
  category: [{ name: 'Hành Động', slug: 'hanh-dong' }],
  country: [{ name: 'Việt Nam', slug: 'viet-nam' }],
  source_site: 'tmdb',
};
const intent = quality.buildSeoIntentMap(movie, 'phim kiểm thử', ['xem phim kiểm thử', 'phim kiểm thử diễn viên']);
assert.ok(intent.watch.some((item) => item.includes('xem phim')));
assert.ok(intent.topics.some((item) => item.toLocaleLowerCase('vi').includes('hành động')));
assert.ok(intent.entities.some((item) => item.includes('Diễn viên A')));
assert.ok(intent.demand.includes('xem phim kiểm thử'));

const strong = quality.evaluateSeoQualityV2({
  movie_id: 'test',
  slug: 'phim-kiem-thu',
  focus_keyword: 'phim kiểm thử',
  secondary_keywords: [...intent.watch, ...intent.topics, ...intent.entities],
  seo_title: 'Xem Phim Kiểm Thử (2026) Vietsub | KhoPhim',
  meta_description: 'Xem phim Phim Kiểm Thử (2026) vietsub, nội dung điều tra, diễn viên và thông tin đã xác minh được cập nhật tại KhoPhim.',
  canonical_path: '/phim/phim-kiem-thu',
  og_image_url: movie.poster_url,
  intro_content: movie.content,
  review_content: 'Bài viết phân tích riêng bối cảnh, cách nhận diện tác phẩm, dữ kiện đoàn phim và những điều người xem cần kiểm tra trước khi lựa chọn. '.repeat(30),
  faq: [
    { question: 'Phim Kiểm Thử thuộc thể loại nào?', answer: 'Tác phẩm được phân loại thuộc nhóm hành động dựa trên dữ liệu đã xác minh.' },
    { question: 'Ai tham gia Phim Kiểm Thử?', answer: 'Dữ liệu hiện ghi nhận Diễn viên A, Diễn viên B và Đạo diễn A.' },
  ],
  topic_links: [{ url: '/phim/a' }, { url: '/phim/b' }],
  movie_patch: movie,
}, movie, ['xem phim kiểm thử']);
assert.equal(strong.rules_version, 2);
assert.equal(strong.passed, true);
assert.ok(strong.score >= 85);
assert.ok(strong.content_fingerprint.startsWith('v2-'));

const weak = quality.evaluateSeoQualityV2({
  slug: 'phim-kiem-thu',
  focus_keyword: 'phim kiểm thử',
  seo_title: 'Phim Kiểm Thử',
  meta_description: 'Thông tin phim.',
  canonical_path: '/phim/phim-kiem-thu',
  og_image_url: movie.poster_url,
  intro_content: '',
  review_content: 'Giá trị của phần review này là đặt bộ phim vào đúng bối cảnh thông tin.',
  topic_links: [],
  movie_patch: movie,
}, { ...movie, content: '' });
assert.equal(weak.passed, false);
assert.ok(weak.issues.some((item) => item.code === 'v2_template_copy'));
assert.ok(weak.issues.some((item) => item.severity === 'error'));

console.log('SEO quality V2 regression passed: versioned scoring, intent clusters, originality and fail-closed behavior.');
