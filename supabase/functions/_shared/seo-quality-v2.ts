export const SEO_QUALITY_RULES_VERSION = 2;

export type SeoQualitySeverity = 'error' | 'warning' | 'success';
export type SeoQualitySection = 'movie' | 'search' | 'content' | 'links' | 'technical';
export type SeoQualityIssue = {
  code: string;
  severity: SeoQualitySeverity;
  section: SeoQualitySection;
  message: string;
};

export type SeoIntentMap = {
  primary: string;
  aliases: string[];
  watch: string[];
  entities: string[];
  topics: string[];
  demand: string[];
};

export type SeoQualityV2Result = {
  rules_version: number;
  score: number;
  passed: boolean;
  breakdown: Record<'technical' | 'search_intent' | 'originality' | 'trust' | 'discovery', number>;
  issues: SeoQualityIssue[];
  intent_map: SeoIntentMap;
  content_fingerprint: string;
  evaluated_at: string;
};

type Taxonomy = { name?: unknown; slug?: unknown };
type SeoQualityPayload = {
  movie_id?: unknown;
  slug?: unknown;
  focus_keyword?: unknown;
  secondary_keywords?: unknown;
  seo_title?: unknown;
  meta_description?: unknown;
  canonical_path?: unknown;
  og_image_url?: unknown;
  intro_content?: unknown;
  review_content?: unknown;
  faq?: unknown;
  topic_links?: unknown;
  movie_patch?: Record<string, unknown> | null;
};

function plain(value: unknown, max = 35_000): string {
  return String(value ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalized(value: unknown): string {
  return plain(value).toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(value: unknown): number {
  const text = plain(value);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function list(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    const text = plain(item, 180);
    const key = normalized(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function taxonomy(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return list(value.map((item) => plain((item as Taxonomy | null)?.name, 100)), limit);
}

function unique(values: unknown[], limit = 12): string[] {
  return list(values.flatMap((value) => Array.isArray(value) ? value : [value]), limit);
}

function includesPhrase(haystack: unknown, phrase: unknown): boolean {
  const needle = normalized(phrase);
  return Boolean(needle && normalized(haystack).includes(needle));
}

function stableFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `v2-${hash.toString(16).padStart(8, '0')}`;
}

export function buildSeoIntentMap(
  movie: Record<string, unknown>,
  requestedFocus?: unknown,
  observedQueries: unknown[] = [],
): SeoIntentMap {
  const aliases = unique([
    movie.name,
    movie.title_vi,
    movie.title_en,
    movie.origin_name,
    movie.title_original,
  ], 8);
  const primary = plain(requestedFocus, 160) || aliases[0] || 'Phim';
  const shortName = aliases.find((item) => normalized(item) !== normalized(primary)) || primary;
  const categories = taxonomy(movie.category, 4);
  const countries = taxonomy(movie.country, 2);
  const actors = list(movie.actor, 3);
  const directors = list(movie.director, 2);
  const year = Number(movie.year || 0);
  const watch = unique([
    `xem phim ${shortName}`,
    `${shortName} vietsub`,
    `${shortName} thuyết minh`,
    `${shortName} full`,
    year ? `${primary} ${year}` : '',
  ], 6);
  const entities = unique([
    ...actors.map((name) => `${primary} ${name}`),
    ...directors.map((name) => `${primary} đạo diễn ${name}`),
  ], 5);
  const topics = unique([
    ...categories.map((name) => `xem phim ${name}`),
    ...categories.map((name) => `${primary} ${name}`),
    ...countries.map((name) => `${primary} phim ${name}`),
  ], 6);
  const identityTerms = aliases.map(normalized).filter(Boolean);
  const demand = unique(observedQueries, 8).filter((query) => {
    const current = normalized(query);
    return current.length >= 3 && identityTerms.some((term) => current.includes(term) || term.includes(current));
  });
  return { primary, aliases, watch, entities, topics, demand };
}

export function evaluateSeoQualityV2(
  payload: SeoQualityPayload,
  movie: Record<string, unknown>,
  observedQueries: unknown[] = [],
): SeoQualityV2Result {
  const patch = payload.movie_patch && typeof payload.movie_patch === 'object' ? payload.movie_patch : {};
  const facts = { ...movie, ...patch };
  const slug = plain(payload.slug, 180).toLowerCase();
  const title = plain(payload.seo_title, 180);
  const description = plain(payload.meta_description, 320);
  const intro = plain(payload.intro_content || movie.content, 20_000);
  const review = plain(payload.review_content, 35_000);
  const faq = Array.isArray(payload.faq) ? payload.faq : [];
  const topicLinks = Array.isArray(payload.topic_links) ? payload.topic_links : [];
  const secondary = list(payload.secondary_keywords, 20);
  const categories = taxonomy(facts.category, 8);
  const countries = taxonomy(facts.country, 4);
  const actors = list(facts.actor, 12);
  const directors = list(facts.director, 8);
  const image = plain(payload.og_image_url || facts.poster_url || facts.thumb_url, 700);
  const intentMap = buildSeoIntentMap(facts, payload.focus_keyword, observedQueries);
  const searchableCopy = [title, description, intro, review, secondary.join(' '), faq.map((item) => plain((item as Record<string, unknown>)?.question) + ' ' + plain((item as Record<string, unknown>)?.answer)).join(' ')].join(' ');
  const issues: SeoQualityIssue[] = [];
  const add = (code: string, severity: SeoQualitySeverity, section: SeoQualitySection, message: string) => issues.push({ code, severity, section, message });
  const breakdown = { technical: 0, search_intent: 0, originality: 0, trust: 0, discovery: 0 };

  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && plain(payload.canonical_path) === `/phim/${slug}`) breakdown.technical += 8;
  else add('v2_canonical_identity', 'error', 'technical', 'URL chuẩn và slug chưa khớp tuyệt đối với phim đã chọn.');
  if (/^https:\/\//i.test(image)) breakdown.technical += 5;
  else add('v2_public_image', 'error', 'movie', 'Trang cần ảnh HTTPS công khai và tải được.');
  if (categories.length > 0) breakdown.technical += 4;
  else add('v2_category', 'error', 'movie', 'Thiếu thể loại đã xác minh.');
  if (words(intro) >= 70) breakdown.technical += 8;
  else add('v2_indexable_copy', 'error', 'content', 'Trang chưa có phần giới thiệu/cốt truyện đủ dữ kiện để lập chỉ mục an toàn.');

  if (plain(payload.focus_keyword)) breakdown.search_intent += 5;
  else add('v2_primary_intent', 'error', 'search', 'Chưa xác định ý định tìm kiếm chính.');
  if (intentMap.aliases.some((alias) => includesPhrase(title, alias))) breakdown.search_intent += 5;
  else add('v2_title_identity', 'error', 'search', 'SEO Title chưa nhận diện đúng tên phim hoặc tên thay thế.');
  if (intentMap.watch.some((keyword) => includesPhrase(searchableCopy, keyword))) breakdown.search_intent += 5;
  else add('v2_watch_intent', 'warning', 'search', 'Nội dung chưa phủ tự nhiên ý định xem phim, vietsub, thuyết minh hoặc full.');
  const coveredAliases = intentMap.aliases.filter((alias) => includesPhrase(searchableCopy, alias)).length;
  if (coveredAliases >= Math.min(2, intentMap.aliases.length)) breakdown.search_intent += 4;
  else add('v2_alias_coverage', 'warning', 'search', 'Chưa phủ đủ tên Việt, tên gốc hoặc tên quốc tế đã xác minh.');
  if (intentMap.topics.some((keyword) => includesPhrase(searchableCopy, keyword)) || intentMap.demand.some((query) => includesPhrase(searchableCopy, query))) breakdown.search_intent += 6;
  else add('v2_topic_intent', 'warning', 'search', 'Chưa có cụm từ ngữ cảnh theo thể loại, quốc gia hoặc nhu cầu tìm kiếm thực tế.');

  const introWords = words(intro);
  const reviewWords = words(review);
  const totalWords = introWords + reviewWords;
  if (introWords >= 120) breakdown.originality += 8;
  else if (introWords >= 70) { breakdown.originality += 5; add('v2_intro_depth', 'warning', 'content', 'Giới thiệu đủ dùng nhưng chưa có chiều sâu biên tập.'); }
  if (reviewWords >= 300) breakdown.originality += 8;
  else if (reviewWords >= 180) { breakdown.originality += 4; add('v2_review_depth', 'warning', 'content', 'Review chưa đủ sâu để cạnh tranh cho truy vấn khó.'); }
  else add('v2_review_depth', 'warning', 'content', 'Review quá ngắn hoặc chưa có nhận xét riêng hữu ích.');
  if (totalWords >= 500) breakdown.originality += 5;
  else if (totalWords >= 300) { breakdown.originality += 3; add('v2_content_depth', 'warning', 'content', 'Tổng nội dung nguyên bản còn mỏng so với trang phim cạnh tranh.'); }
  else add('v2_content_depth', 'error', 'content', 'Tổng nội dung có thể lập chỉ mục chưa đạt mức tối thiểu của cổng chất lượng V2.');
  const templatePattern = /Giá trị của phần review này là đặt|Phần thông tin trên KhoPhim tập trung vào việc giúp người xem xác định đúng phiên bản|Bài đánh giá độc lập giúp người đọc hiểu rõ/i;
  if (!templatePattern.test(review)) breakdown.originality += 4;
  else add('v2_template_copy', 'warning', 'content', 'Review còn dấu hiệu dùng khung dự phòng chung; cần viết lại theo dữ kiện riêng của phim.');

  if (actors.length > 0 || directors.length > 0) breakdown.trust += 4;
  else add('v2_people_evidence', 'warning', 'movie', 'Thiếu diễn viên hoặc đạo diễn đã xác minh.');
  if (countries.length > 0 && Number(facts.year || 0) > 0) breakdown.trust += 4;
  else add('v2_identity_evidence', 'warning', 'movie', 'Thiếu quốc gia hoặc năm phát hành đã xác minh.');
  const unsupported = /\b(?:10|[0-9](?:[.,][0-9])?)\s*\/\s*10\b|hay nhất|đỉnh nhất|siêu phẩm số một/i.test(`${review} ${faq.map((item) => JSON.stringify(item)).join(' ')}`);
  if (!unsupported) breakdown.trust += 4;
  else add('v2_unsupported_claim', 'error', 'content', 'Nội dung có đánh giá hoặc khẳng định cảm tính chưa có bằng chứng.');
  if (plain(facts.source_site || facts.source_name || facts.tmdb_id || facts.imdb_id)) breakdown.trust += 3;
  else add('v2_source_evidence', 'warning', 'movie', 'Chưa lưu nguồn dữ kiện dùng để nhận diện phim.');

  if (topicLinks.length >= 2) breakdown.discovery += 6;
  else add('v2_topic_links', 'error', 'links', 'Cần ít nhất hai liên kết nội bộ thật sự liên quan.');
  const usefulFaq = faq.filter((item) => plain((item as Record<string, unknown>)?.question).length >= 12 && plain((item as Record<string, unknown>)?.answer).length >= 30).length;
  if (usefulFaq >= 2 || actors.length + directors.length >= 3) breakdown.discovery += 4;
  else add('v2_supporting_entities', 'warning', 'content', 'Trang cần FAQ hữu ích hoặc hệ thực thể diễn viên/đạo diễn đầy đủ hơn.');

  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((sum, value) => sum + value, 0)));
  const passed = score >= 85 && !issues.some((issue) => issue.severity === 'error');
  if (passed) add('v2_ready', 'success', 'technical', 'Hồ sơ đạt cổng chất lượng SEO V2 và có thể chuyển sang kiểm tra trang thật.');
  const fingerprintSource = normalized(`${intentMap.primary} ${intro} ${review} ${faq.map((item) => JSON.stringify(item)).join(' ')}`).slice(0, 20_000);
  return {
    rules_version: SEO_QUALITY_RULES_VERSION,
    score,
    passed,
    breakdown,
    issues,
    intent_map: intentMap,
    content_fingerprint: stableFingerprint(fingerprintSource),
    evaluated_at: new Date().toISOString(),
  };
}
