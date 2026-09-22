import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyDeterministicEditorialConstraints,
  normalizeMetaDescription,
  normalizeSecondaryKeywords,
  normalizeSeoTitle,
} from '../supabase/functions/_shared/seo-editorial-constraints.ts';
import {
  missingMovieFactFields,
  patchFromDatabaseConsensus,
  patchFromVerifiedDatabaseCandidate,
  patchFromVerifiedTmdb,
  tmdbIdentityMatches,
} from '../supabase/functions/_shared/seo-movie-fact-enrichment.ts';

const facts = { name: 'Mùi Phở', origin_name: 'The Scent of Pho', year: 2026 };

const longMeta = normalizeMetaDescription('Mùi Phở là bộ phim điện ảnh Việt Nam với phần giới thiệu cố ý rất dài để mô phỏng kết quả AI vượt quá giới hạn hiển thị thường gặp trên thiết bị di động và trên nhiều truy vấn tìm kiếm khác nhau của Google.', facts);
assert.ok(longMeta.length >= 100 && longMeta.length <= 165, `long meta was not normalized: ${longMeta.length}`);
assert.match(longMeta, /[.!?]$/u, 'normalized meta must end as a complete sentence');

const shortMeta = normalizeMetaDescription('Thông tin phim Mùi Phở.', facts);
assert.ok(shortMeta.length >= 100 && shortMeta.length <= 165, `short meta was not rebuilt: ${shortMeta.length}`);
assert.match(shortMeta, /Mùi Phở/u, 'rebuilt meta lost the movie identity');

const title = normalizeSeoTitle('Mùi Phở', facts);
assert.ok(title.length >= 32 && title.length <= 68, `title was not normalized: ${title.length}`);

assert.deepEqual(
  normalizeSecondaryKeywords(['Mùi Phở', 'mui pho', 'MÙI PHỞ', 'phim Việt Nam']),
  ['Mùi Phở', 'phim Việt Nam'],
  'normalized duplicate keywords were not removed',
);

const constrained = applyDeterministicEditorialConstraints({
  seo_title: 'Mùi Phở',
  meta_description: 'Mô tả ngắn.',
  secondary_keywords: ['Mùi Phở', 'mui pho'],
  movie_patch: facts,
  review_content: 'Nội dung phải được giữ nguyên.',
});
assert.equal(constrained.review_content, 'Nội dung phải được giữ nguyên.', 'constraints changed an unrelated editorial field');

const incompleteMovie = {
  id: 'movie-1', name: 'Phim Mẫu', origin_name: 'Sample Movie', title_vi: 'Phim Mẫu', title_en: 'Sample Movie',
  year: 2026, actor: [], director: [], category: [], country: [], content: '', thumb_url: '', poster_url: '', trailer_url: '',
};
const verifiedDetail = {
  id: 7788,
  title: 'Phim Mẫu',
  original_title: 'Sample Movie',
  release_date: '2026-04-02',
  overview: 'Nội dung đã xác minh '.repeat(25),
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  genres: [{ id: 18, name: 'Chính kịch' }],
  production_countries: [{ iso_3166_1: 'VN', name: 'Việt Nam' }],
  credits: { cast: [{ name: 'Diễn Viên A' }], crew: [{ name: 'Đạo Diễn B', job: 'Director' }] },
  videos: { results: [{ site: 'YouTube', type: 'Trailer', official: true, key: 'verified-trailer' }] },
};
assert.equal(tmdbIdentityMatches(incompleteMovie, verifiedDetail), true, 'exact TMDB identity was rejected');
assert.equal(tmdbIdentityMatches(incompleteMovie, { ...verifiedDetail, release_date: '2025-04-02' }), false, 'wrong-year TMDB identity was accepted');
const tmdbPatch = patchFromVerifiedTmdb(incompleteMovie, verifiedDetail, 'movie');
assert.deepEqual(tmdbPatch.actor, ['Diễn Viên A']);
assert.deepEqual(tmdbPatch.director, ['Đạo Diễn B']);
assert.equal(tmdbPatch.country?.[0]?.name, 'Việt Nam');
assert.match(String(tmdbPatch.thumb_url), /poster\.jpg$/, 'vertical poster was assigned to the wrong field');
assert.match(String(tmdbPatch.poster_url), /backdrop\.jpg$/, 'backdrop was assigned to the wrong field');
assert.ok(String(tmdbPatch.content).length >= 300, 'verified overview was not offered for thin content');

const consensusRows = ['ophim', 'kkphim'].map((source, index) => ({
  id: `source-${index}`, source_site: source, name: 'Phim Mẫu', origin_name: 'Sample Movie', year: 2026,
  actor: ['Diễn Viên A'], director: ['Đạo Diễn B'],
  category: [{ id: '18', name: 'Chính kịch', slug: 'chinh-kich' }],
  country: [{ id: 'VN', name: 'Việt Nam', slug: 'viet-nam' }],
}));
const consensusPatch = patchFromDatabaseConsensus(incompleteMovie, consensusRows);
assert.deepEqual(consensusPatch.actor, ['Diễn Viên A'], 'two-source actor consensus was not accepted');
assert.equal(consensusPatch.country?.[0]?.slug, 'viet-nam', 'two-source country consensus was not accepted');
assert.deepEqual(patchFromDatabaseConsensus(incompleteMovie, consensusRows.slice(0, 1)), {}, 'single-source facts must not be auto-filled');
const trustedCandidatePatch = patchFromVerifiedDatabaseCandidate(incompleteMovie, [{
  ...consensusRows[0], tmdb_verified: true, content: 'Mô tả đã xác minh '.repeat(30), thumb_url: 'https://image.tmdb.org/poster.jpg',
}]);
assert.deepEqual(trustedCandidatePatch.actor, ['Diễn Viên A'], 'previously TMDB-verified matching movie was not reused');
assert.deepEqual(patchFromVerifiedDatabaseCandidate(incompleteMovie, [{ ...consensusRows[0], tmdb_verified: false }]), {}, 'unverified single candidate must not be reused');
assert.ok(missingMovieFactFields(incompleteMovie).includes('movie_patch.actor'));

const endpoint = await readFile('supabase/functions/admin-seo-studio/index.ts', 'utf8');
const ui = await readFile('src/pages/admin-seo-studio/page.tsx', 'utf8');
for (const [pattern, message] of [
  ['MIN_USEFUL_REVIEW_WORDS = 300', 'review quality floor is not enforced after AI generation'],
  ['verifiedReviewFoundation', 'short AI reviews do not receive a fact-grounded editorial foundation'],
  ['ensureUsefulReview', 'AI suggestion payloads can still retain a thin review'],
  ['380–520 từ', 'AI prompt does not request a structured substantive review'],
  ['repair_pass', 'missing bounded second AI repair pass'],
  ['firstPassRemaining', 'AI result is not revalidated before completion'],
  ['assistantCompletion', 'backend does not report truthful completion state'],
  ['verifiedMovieFactEnrichment', 'SEO assistant does not run verified movie fact enrichment'],
  ['fact_enrichment: factEnrichment', 'verified fact evidence is not returned to the operator'],
  ['AI vẫn còn ${aiFixableRemaining.length}', 'remaining AI-fixable issues are hidden'],
  ['buildVerifiedKeywordPlan', 'AI has no verified keyword-planning layer'],
  ['keyword_plan: keywordPlan', 'AI does not receive the verified keyword plan'],
  ["lifecycle: 'watch'", 'AI does not use the site-wide watch-intent policy'],
  ['xem phim ${shortName}', 'AI does not create watch-intent keywords'],
  ['applyVerifiedKeywordPlan', 'AI keyword plan is not enforced before publication'],
  ["field === 'focus_keyword' && plainText(source.focus_keyword, 160)", 'AI can still replace a stable focus keyword'],
  ['payload.focus_keyword = currentBaseline.focus_keyword', 'older AI drafts cannot recover their stable focus keyword'],
  ["plainText(payload.focus_keyword, 160) !== plainText(currentBaseline.focus_keyword, 160)", 'focus keyword casing drift still blocks publication'],
  ['workingBaseline = cleanPayload({ ...workingBaseline, focus_keyword: baseline.focus_keyword })', 'AI suggestion can recreate a stale focus keyword drift'],
]) assert.ok(endpoint.includes(pattern), message);
for (const [pattern, message] of [
  ['AI chưa hoàn tất', 'simple UI still claims every AI run completed'],
  ['aiRemainingIssues', 'UI does not render remaining issues'],
  ['result.completion?.remaining_issues', 'AI completion response is ignored'],
  ['result.fact_enrichment?.verified_fields', 'verified movie facts are not auto-selected in the private draft'],
  ['Xác minh dữ liệu phim', 'operator cannot see where automatic movie facts came from'],
  ['luôn tối ưu theo ý định xem phim ngay', 'UI does not explain the site-wide watch-intent policy'],
  ['nextPayload = { ...nextPayload, focus_keyword: nextBaseline.focus_keyword }', 'stale local AI drafts can still restore a blocked focus keyword'],
]) assert.ok(ui.includes(pattern), message);

console.log('SEO AI completion regression passed: deterministic constraints, second-pass contract and truthful UI status.');
