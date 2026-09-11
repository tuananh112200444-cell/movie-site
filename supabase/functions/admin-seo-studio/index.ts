import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { verifyAdminRequest } from '../_shared/admin-session.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SEO_INSPECT_SECRET = Deno.env.get('MOVIE_DETAIL_PROXY_SECRET') ?? '';

type Severity = 'error' | 'warning' | 'success';
type ValidationIssue = {
  code: string;
  severity: Severity;
  section: 'movie' | 'search' | 'content' | 'links' | 'technical';
  message: string;
};

type FaqItem = { question: string; answer: string };
type TopicLink = { title: string; url: string; anchor: string; description?: string };
type LiveAuditCheck = { code: string; passed: boolean; message: string; value?: string | number | boolean };
type LiveAuditResult = { passed: boolean; checked_at: string; url: string; status: number; checks: LiveAuditCheck[] };

type SeoPayload = {
  movie_id: string;
  slug: string;
  focus_keyword?: string;
  secondary_keywords?: string[];
  seo_title?: string;
  meta_description?: string;
  canonical_path?: string;
  og_image_url?: string;
  index_mode?: 'auto' | 'index' | 'noindex';
  intro_content?: string;
  review_content?: string;
  faq?: FaqItem[];
  topic_links?: TopicLink[];
  movie_patch?: Record<string, unknown>;
};

type SafeFieldState = {
  status: 'protected' | 'needs_attention' | 'optional' | 'immutable';
  protected: boolean;
  reason: string;
};

type SafeEditInput = {
  baseline_version: number;
  unlocked_fields: string[];
};

const SAFE_FIELD_PATHS = [
  'movie_patch.name', 'movie_patch.title_vi', 'movie_patch.title_en', 'movie_patch.origin_name',
  'movie_patch.year', 'movie_patch.quality', 'movie_patch.lang', 'movie_patch.trailer_url',
  'movie_patch.thumb_url', 'movie_patch.poster_url', 'movie_patch.actor', 'movie_patch.director',
  'movie_patch.category', 'movie_patch.country', 'focus_keyword', 'secondary_keywords',
  'seo_title', 'meta_description', 'og_image_url', 'intro_content', 'review_content',
  'faq', 'topic_links', 'index_mode', 'canonical_path', 'slug',
] as const;

function cors(origin: string | null): Record<string, string> {
  const allowed = ['https://khophim.org', 'http://localhost:5173', 'http://localhost:3000'];
  const safe = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': safe,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, max);
}

function plainText(value: unknown, max: number): string {
  return text(value, max).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0;
}

function normalizeKeyword(value: string): string {
  return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

function cleanStringList(value: unknown, maxItems = 12, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => text(item, maxLength)).filter(Boolean))).slice(0, maxItems);
}

function cleanFaq(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const question = plainText(row.question, 220);
    const answer = plainText(row.answer, 1200);
    return question && answer ? [{ question, answer }] : [];
  });
}

function safeTopicUrl(value: unknown): string {
  const raw = text(value, 500);
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw);
    return parsed.origin === 'https://khophim.org' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '';
  } catch {
    return '';
  }
}

function cleanTopicLinks(value: unknown): TopicLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 20).flatMap((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const titleValue = plainText(row.title, 180);
    const url = safeTopicUrl(row.url);
    const anchor = plainText(row.anchor, 180) || titleValue;
    const description = plainText(row.description, 320);
    if (!titleValue || !url || seen.has(url)) return [];
    seen.add(url);
    return [{ title: titleValue, url, anchor, ...(description ? { description } : {}) }];
  });
}

function cleanTaxonomy(value: unknown): Array<{ id: string; name: string; slug: string }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const name = plainText(row.name, 100);
    const slug = text(row.slug, 120).toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!name || !slug) return [];
    return [{ id: text(row.id, 80), name, slug }];
  });
}

function cleanMoviePatch(value: unknown): Record<string, unknown> {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const year = Number(raw.year || 0);
  return {
    name: plainText(raw.name, 180),
    title_vi: plainText(raw.title_vi, 180),
    title_en: plainText(raw.title_en, 180),
    origin_name: plainText(raw.origin_name, 180),
    year: Number.isInteger(year) && year >= 1888 && year <= new Date().getUTCFullYear() + 3 ? year : 0,
    quality: plainText(raw.quality, 40),
    lang: plainText(raw.lang, 80),
    trailer_url: text(raw.trailer_url, 700),
    thumb_url: text(raw.thumb_url, 700),
    poster_url: text(raw.poster_url, 700),
    actor: cleanStringList(raw.actor, 30, 140),
    director: cleanStringList(raw.director, 12, 140),
    category: cleanTaxonomy(raw.category),
    country: cleanTaxonomy(raw.country),
  };
}

function cleanPayload(value: unknown): SeoPayload {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const slug = text(raw.slug, 180).toLowerCase();
  const canonical = text(raw.canonical_path, 300);
  const expectedCanonical = slug ? `/phim/${slug}` : '';
  const indexMode = ['auto', 'index', 'noindex'].includes(String(raw.index_mode))
    ? raw.index_mode as SeoPayload['index_mode']
    : 'auto';
  return {
    movie_id: text(raw.movie_id, 80),
    slug,
    focus_keyword: plainText(raw.focus_keyword, 160),
    secondary_keywords: cleanStringList(raw.secondary_keywords, 20, 160),
    seo_title: plainText(raw.seo_title, 180),
    meta_description: plainText(raw.meta_description, 320),
    canonical_path: canonical === expectedCanonical ? canonical : expectedCanonical,
    og_image_url: text(raw.og_image_url, 700),
    index_mode: indexMode,
    intro_content: plainText(raw.intro_content, 12_000),
    review_content: plainText(raw.review_content, 35_000),
    faq: cleanFaq(raw.faq),
    topic_links: cleanTopicLinks(raw.topic_links),
    movie_patch: cleanMoviePatch(raw.movie_patch),
  };
}

function validate(payload: SeoPayload): { score: number; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const patch = payload.movie_patch ?? {};
  const titleValue = payload.seo_title ?? '';
  const description = payload.meta_description ?? '';
  const intro = payload.intro_content ?? '';
  const review = payload.review_content ?? '';
  const keyword = payload.focus_keyword ?? '';
  const categories = Array.isArray(patch.category) ? patch.category : [];
  const countries = Array.isArray(patch.country) ? patch.country : [];
  const actors = Array.isArray(patch.actor) ? patch.actor : [];
  const directors = Array.isArray(patch.director) ? patch.director : [];
  const image = String(payload.og_image_url || patch.poster_url || patch.thumb_url || '');
  const introWords = wordCount(intro);
  const reviewWords = wordCount(review);
  const totalEditorialWords = introWords + reviewWords;
  const topicLinks = payload.topic_links ?? [];
  const add = (code: string, severity: Severity, section: ValidationIssue['section'], message: string) => issues.push({ code, severity, section, message });

  if (!payload.movie_id) add('missing_movie', 'error', 'movie', 'Chưa chọn phim.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) add('invalid_slug', 'error', 'technical', 'Slug không hợp lệ.');
  if (!String(patch.name || '').trim()) add('missing_name', 'error', 'movie', 'Thiếu tên hiển thị.');
  if (!Number(patch.year || 0)) add('missing_year', 'warning', 'movie', 'Thiếu năm phát hành hợp lệ.');
  if (!image) add('missing_image', 'error', 'movie', 'Thiếu poster hoặc ảnh chia sẻ.');
  else if (!/^https:\/\//i.test(image)) add('invalid_image_url', 'error', 'movie', 'Ảnh SEO phải dùng URL HTTPS công khai.');
  if (categories.length === 0) add('missing_category', 'error', 'movie', 'Thiếu thể loại.');
  if (countries.length === 0) add('missing_country', 'warning', 'movie', 'Thiếu quốc gia.');
  if (actors.length === 0 && directors.length === 0) add('missing_people', 'warning', 'movie', 'Nên có diễn viên hoặc đạo diễn đã xác minh.');

  if (!keyword) add('missing_keyword', 'error', 'search', 'Thiếu từ khóa chính.');
  if (titleValue.length < 20) add('title_short', 'error', 'search', 'SEO Title chưa mô tả đủ rõ nội dung trang.');
  else if (titleValue.length < 32) add('title_brief', 'warning', 'search', 'SEO Title hơi ngắn; hãy mô tả tự nhiên và phân biệt với các phim khác.');
  else if (titleValue.length > 68) add('title_long', 'warning', 'search', 'SEO Title có thể bị cắt tùy thiết bị; đây là khuyến nghị hiển thị, không phải giới hạn của Google.');
  if (description.length < 70) add('description_short', 'error', 'search', 'Meta Description chưa đủ thông tin để mô tả trang.');
  else if (description.length < 100) add('description_brief', 'warning', 'search', 'Meta Description hơi ngắn; nên nêu điểm khác biệt và ý định của trang.');
  else if (description.length > 165) add('description_long', 'warning', 'search', 'Meta Description có thể bị rút gọn tùy truy vấn và thiết bị.');
  if (new Set((payload.secondary_keywords ?? []).map(normalizeKeyword)).size !== (payload.secondary_keywords ?? []).length) {
    add('duplicate_secondary_keywords', 'warning', 'search', 'Danh sách từ khóa liên quan đang có mục trùng nhau.');
  }

  const normalizedKeyword = normalizeKeyword(keyword);
  if (keyword && !normalizeKeyword(titleValue).includes(normalizedKeyword)) add('keyword_not_in_title', 'warning', 'search', 'Title chưa chứa từ khóa chính theo cách tự nhiên.');
  if (keyword && !normalizeKeyword(`${description} ${intro}`).includes(normalizedKeyword)) add('keyword_not_in_copy', 'warning', 'content', 'Nội dung chưa đề cập tự nhiên đến từ khóa chính.');

  if (intro.length < 300 || introWords < 70) add('thin_intro', 'error', 'content', 'Giới thiệu nguyên bản cần tối thiểu 300 ký tự và khoảng 70 từ để đủ ngữ cảnh.');
  else if (introWords < 120) add('brief_intro', 'warning', 'content', 'Giới thiệu đã dùng được nhưng nên bổ sung thêm bối cảnh hữu ích, không kéo dài bằng từ khóa.');
  if (reviewWords === 0) add('missing_review', 'warning', 'content', 'Chưa có bài đánh giá riêng; với phim cạnh tranh cao nên bổ sung nhận xét thực sự hữu ích.');
  else if (reviewWords < 300) add('thin_review', 'warning', 'content', 'Review đang ngắn; nên bổ sung nhận xét thực sự hữu ích.');
  const editorialText = `${review} ${(payload.faq ?? []).map((item) => `${item.question} ${item.answer}`).join(' ')}`;
  if (/\b(?:10|[0-9](?:[.,][0-9])?)\s*\/\s*10\b/i.test(editorialText)) {
    add('unsupported_rating_claim', 'error', 'content', 'Không được tự chấm điểm phim khi chưa có nguồn đánh giá và quy trình biên tập đã xác minh.');
  }
  if ((payload.faq ?? []).some((item) => plainText(item.question, 220).length < 12 || plainText(item.answer, 1200).length < 30)) {
    add('thin_faq_answer', 'warning', 'content', 'Câu hỏi và câu trả lời FAQ cần đầy đủ, hữu ích; không dùng câu trả lời quá ngắn hoặc cảm tính.');
  }
  if ((payload.faq ?? []).some((item) => /(?:đỉnh|hay nhất|siêu hay|quá hay|chấm điểm|đánh giá ra sao)/i.test(`${item.question} ${item.answer}`))) {
    add('subjective_faq_claim', 'error', 'content', 'FAQ chỉ được trả lời dữ kiện có thể xác minh, không dùng nhận xét cảm tính.');
  }
  if ((payload.faq ?? []).length === 1) add('thin_faq', 'warning', 'content', 'Nếu dùng FAQ, nên có ít nhất 2 câu hỏi hữu ích.');
  if (topicLinks.length < 2) add('few_internal_links', 'warning', 'links', 'Nên có ít nhất 2 liên kết nội bộ thật sự liên quan.');
  if (topicLinks.some((item) => item.url === `/phim/${payload.slug}`)) add('self_topic_link', 'error', 'links', 'Cụm chủ đề không được liên kết ngược về chính trang hiện tại.');
  if (payload.canonical_path !== `/phim/${payload.slug}`) add('canonical_mismatch', 'error', 'technical', 'Canonical phải trỏ về URL phim chính.');
  if (payload.index_mode === 'index' && (!image || totalEditorialWords < 220 || categories.length === 0 || topicLinks.length < 2)) {
    add('unsafe_index', 'error', 'technical', 'Muốn cho phép index thủ công, trang cần ảnh, tối thiểu 220 từ nội dung biên tập, thể loại và ít nhất 2 liên kết nội bộ.');
  }

  const errorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.filter((item) => item.severity === 'warning').length;
  const score = Math.max(0, Math.min(100, 100 - errorCount * 14 - warningCount * 3));
  if (errorCount === 0) add('ready', 'success', 'technical', score >= 85 ? 'Nội dung đã qua cổng biên tập; hãy chạy kiểm tra trang thật trước khi xuất bản.' : 'Trang có thể lưu; nên xử lý thêm cảnh báo trước khi index.');
  return { score, issues };
}

function valueAt(payload: SeoPayload, field: string): unknown {
  if (field.startsWith('movie_patch.')) return payload.movie_patch?.[field.slice('movie_patch.'.length)];
  return (payload as unknown as Record<string, unknown>)[field];
}

function comparable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '').trim();
}

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return String(value ?? '').trim().length > 0;
}

const ISSUE_FIELD_MAP: Record<string, string[]> = {
  missing_movie: ['movie_patch.name'],
  missing_name: ['movie_patch.name'],
  missing_year: ['movie_patch.year'],
  missing_image: ['movie_patch.thumb_url', 'movie_patch.poster_url', 'og_image_url'],
  invalid_image_url: ['movie_patch.thumb_url', 'movie_patch.poster_url', 'og_image_url'],
  image_unreachable: ['movie_patch.thumb_url', 'movie_patch.poster_url', 'og_image_url'],
  missing_category: ['movie_patch.category'],
  missing_country: ['movie_patch.country'],
  missing_people: ['movie_patch.actor', 'movie_patch.director'],
  missing_keyword: ['focus_keyword'],
  title_short: ['seo_title'],
  title_brief: ['seo_title'],
  title_long: ['seo_title'],
  duplicate_title: ['seo_title'],
  description_short: ['meta_description'],
  description_brief: ['meta_description'],
  description_long: ['meta_description'],
  duplicate_description: ['meta_description'],
  duplicate_secondary_keywords: ['secondary_keywords'],
  keyword_not_in_title: ['focus_keyword', 'seo_title'],
  keyword_not_in_copy: ['focus_keyword', 'meta_description', 'intro_content'],
  thin_intro: ['intro_content'],
  brief_intro: ['intro_content'],
  missing_review: ['review_content'],
  thin_review: ['review_content'],
  unsupported_rating_claim: ['review_content', 'faq'],
  thin_faq_answer: ['faq'],
  subjective_faq_claim: ['faq'],
  thin_faq: ['faq'],
  few_internal_links: ['topic_links'],
  self_topic_link: ['topic_links'],
  canonical_mismatch: ['canonical_path'],
  unsafe_index: ['index_mode'],
};

function fieldStates(payload: SeoPayload, validation: ReturnType<typeof validate>, published: boolean): Record<string, SafeFieldState> {
  const attention = new Map<string, string[]>();
  for (const issue of validation.issues) {
    if (issue.severity === 'success') continue;
    for (const field of ISSUE_FIELD_MAP[issue.code] || []) {
      attention.set(field, [...(attention.get(field) || []), issue.message]);
    }
  }
  const optional = new Set(['movie_patch.title_vi', 'movie_patch.title_en', 'movie_patch.quality', 'movie_patch.lang', 'movie_patch.trailer_url', 'review_content', 'faq']);
  const states: Record<string, SafeFieldState> = {};
  for (const field of SAFE_FIELD_PATHS) {
    if (field === 'slug' || field === 'canonical_path') {
      states[field] = { status: 'immutable', protected: true, reason: 'URL chuẩn được khóa vĩnh viễn để không làm mất tín hiệu Google.' };
      continue;
    }
    const messages = attention.get(field) || [];
    const value = valueAt(payload, field);
    const emptyOptional = optional.has(field) && !hasValue(value) && messages.length === 0;
    if (messages.length > 0) {
      states[field] = { status: 'needs_attention', protected: false, reason: messages[0] };
    } else if (emptyOptional) {
      states[field] = { status: 'optional', protected: true, reason: 'Mục này đang để trống có chủ đích và không bắt buộc.' };
    } else if (hasValue(value) || field === 'index_mode') {
      states[field] = { status: 'protected', protected: true, reason: published ? 'Dữ liệu đang hoạt động tốt trên trang công khai.' : 'Dữ liệu hiện tại đã đạt kiểm tra.' };
    } else {
      states[field] = { status: 'needs_attention', protected: false, reason: 'Mục này còn thiếu dữ liệu.' };
    }
  }
  return states;
}

function moviePatchFromRecord(movie: Record<string, unknown>): Record<string, unknown> {
  return {
    name: plainText(movie.name, 180),
    title_vi: plainText(movie.title_vi || movie.name, 180),
    title_en: plainText(movie.title_en || movie.origin_name, 180),
    origin_name: plainText(movie.origin_name || movie.title_en, 180),
    year: Number(movie.year || 0),
    quality: plainText(movie.quality, 40),
    lang: plainText(movie.lang, 80),
    trailer_url: text(movie.trailer_url, 700),
    thumb_url: text(movie.thumb_url, 700),
    poster_url: text(movie.poster_url, 700),
    actor: cleanStringList(movie.actor, 30, 140),
    director: cleanStringList(movie.director, 12, 140),
    category: cleanTaxonomy(movie.category),
    country: cleanTaxonomy(movie.country),
  };
}

function baselinePayload(movie: Record<string, unknown>, profile: Record<string, unknown> | null, review: Record<string, unknown> | null): SeoPayload {
  const slug = text(movie.slug, 180).toLowerCase();
  return cleanPayload({
    movie_id: movie.id,
    slug,
    focus_keyword: profile?.focus_keyword || plainText(movie.name, 160).toLocaleLowerCase('vi'),
    secondary_keywords: profile?.secondary_keywords || [movie.origin_name, `${movie.name || ''} ${movie.year || ''}`].filter(Boolean),
    seo_title: profile?.seo_title || `${plainText(movie.name, 120)}${movie.year ? ` (${movie.year})` : ''} – Thông Tin Phim | KhoPhim`,
    meta_description: profile?.meta_description || `${plainText(movie.name, 120)}${movie.origin_name ? ` (${plainText(movie.origin_name, 120)})` : ''} – nội dung, diễn viên, trailer, lịch phát hành và thông tin cập nhật tại KhoPhim.`,
    canonical_path: `/phim/${slug}`,
    og_image_url: profile?.og_image_url || movie.poster_url || movie.thumb_url,
    index_mode: profile?.index_mode || 'auto',
    intro_content: profile?.intro_content || movie.content || '',
    review_content: profile?.review_content || review?.content || '',
    faq: profile?.faq || [],
    topic_links: profile?.topic_links || [],
    movie_patch: moviePatchFromRecord(movie),
  });
}

function readSafeEditInput(body: Record<string, unknown>): SafeEditInput {
  const raw = body.safe_edit && typeof body.safe_edit === 'object' ? body.safe_edit as Record<string, unknown> : {};
  return {
    baseline_version: Math.max(0, Math.floor(Number(raw.baseline_version || 0))),
    unlocked_fields: cleanStringList(raw.unlocked_fields, SAFE_FIELD_PATHS.length, 80)
      .filter((field) => SAFE_FIELD_PATHS.includes(field as typeof SAFE_FIELD_PATHS[number]) && !['slug', 'canonical_path'].includes(field)),
  };
}

function regressionIssues(
  baseline: SeoPayload,
  next: SeoPayload,
  baselineValidation: ReturnType<typeof validate>,
  nextValidation: ReturnType<typeof validate>,
  unlockedFields: string[],
  published: boolean,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const unlocked = new Set(unlockedFields);
  const protectedFields = fieldStates(baseline, baselineValidation, published);
  const add = (code: string, message: string) => issues.push({ code, severity: 'error', section: 'technical', message });
  for (const field of SAFE_FIELD_PATHS) {
    if (comparable(valueAt(baseline, field)) === comparable(valueAt(next, field))) continue;
    if (field === 'slug' || field === 'canonical_path') {
      add('immutable_url_changed', 'Slug và canonical đang được Google sử dụng nên không thể thay đổi trong SEO Studio.');
      continue;
    }
    if (protectedFields[field]?.protected && !unlocked.has(field)) {
      add(`protected_field_changed_${field.replace(/[^a-z0-9]+/gi, '_')}`, `Mục “${field}” đang tốt và chưa được mở khóa để sửa.`);
    }
  }
  for (const field of ['movie_patch.name', 'movie_patch.actor', 'movie_patch.director', 'movie_patch.category', 'movie_patch.country', 'movie_patch.thumb_url', 'movie_patch.poster_url']) {
    if (hasValue(valueAt(baseline, field)) && !hasValue(valueAt(next, field))) {
      add(`valuable_data_removed_${field.replace(/[^a-z0-9]+/gi, '_')}`, `Không thể xóa toàn bộ dữ liệu tốt ở mục “${field}”.`);
    }
  }
  for (const field of ['movie_patch.actor', 'movie_patch.director', 'movie_patch.category', 'movie_patch.country', 'secondary_keywords', 'topic_links']) {
    const before = valueAt(baseline, field);
    const after = valueAt(next, field);
    if (Array.isArray(before) && before.length >= 3 && Array.isArray(after) && after.length < Math.ceil(before.length / 2)) {
      add(`valuable_list_shrunk_${field.replace(/[^a-z0-9]+/gi, '_')}`, `Mục “${field}” bị giảm hơn một nửa dữ liệu; hãy giữ lại thông tin đã xác minh.`);
    }
  }
  const baselineIntroWords = wordCount(String(baseline.intro_content || ''));
  const nextIntroWords = wordCount(String(next.intro_content || ''));
  if (baselineIntroWords >= 120 && nextIntroWords < Math.ceil(baselineIntroWords * 0.7)) {
    add('valuable_intro_shrunk', 'Nội dung giới thiệu bị rút ngắn quá 30% so với bản đang chạy.');
  }
  const baselineErrors = baselineValidation.issues.filter((item) => item.severity === 'error').length;
  const nextErrors = nextValidation.issues.filter((item) => item.severity === 'error').length;
  if (nextErrors > baselineErrors) add('new_validation_errors', 'Bản mới tạo thêm lỗi SEO bắt buộc so với bản đang chạy.');
  if (nextValidation.score < baselineValidation.score) add('seo_score_regression', `Điểm SEO giảm từ ${baselineValidation.score} xuống ${nextValidation.score}; hệ thống đã chặn xuất bản.`);
  return issues;
}

async function rollbackFailedPublish(
  db: ReturnType<typeof createClient>,
  movieId: string,
  failedVersion: number,
): Promise<Record<string, unknown> | null> {
  if (!failedVersion) return null;
  const { data, error } = await db.rpc('rollback_movie_seo_profile', {
    p_movie_id: movieId,
    p_failed_version: failedVersion,
  });
  if (error) throw error;
  return data && typeof data === 'object' ? data as Record<string, unknown> : null;
}

function publicHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1') return null;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return null;
    const private172 = /^172\.(\d{1,3})\./.exec(host);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return null;
    return url;
  } catch {
    return null;
  }
}

async function probeUrl(url: URL, accept: string, timeoutMs = 7000): Promise<{ ok: boolean; status: number; contentType: string }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: accept,
        Range: 'bytes=0-4095',
        'User-Agent': 'KhoPhim-SEO-Studio-Validator/1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    try { await response.body?.cancel(); } catch { /* response already complete */ }
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
    };
  } catch {
    return { ok: false, status: 0, contentType: '' };
  }
}

function mergeValidation(base: ReturnType<typeof validate>, additions: ValidationIssue[]): ReturnType<typeof validate> {
  const issues = [
    ...base.issues.filter((item) => item.code !== 'ready'),
    ...additions,
  ];
  const unique = Array.from(new Map(issues.map((item) => [`${item.code}:${item.message}`, item])).values());
  const errorCount = unique.filter((item) => item.severity === 'error').length;
  const warningCount = unique.filter((item) => item.severity === 'warning').length;
  const score = Math.max(0, Math.min(100, 100 - errorCount * 14 - warningCount * 3));
  if (errorCount === 0) unique.push({
    code: 'ready',
    severity: 'success',
    section: 'technical',
    message: score >= 85 ? 'Nội dung và tài nguyên đã qua cổng xuất bản.' : 'Không có lỗi chặn; nên xử lý thêm cảnh báo.',
  });
  return { score, issues: unique };
}

async function remoteValidationIssues(
  db: ReturnType<typeof createClient>,
  payload: SeoPayload,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const imageValue = String(payload.og_image_url || payload.movie_patch?.poster_url || payload.movie_patch?.thumb_url || '');
  const imageUrl = publicHttpsUrl(imageValue);
  const topicLinks = payload.topic_links ?? [];
  const [titleResult, descriptionResult, imageProbe, ...linkProbes] = await Promise.all([
    payload.seo_title
      ? db.from('movie_seo_profiles').select('movie_id,slug').eq('seo_title', payload.seo_title).neq('movie_id', payload.movie_id).limit(3)
      : Promise.resolve({ data: [], error: null }),
    payload.meta_description
      ? db.from('movie_seo_profiles').select('movie_id,slug').eq('meta_description', payload.meta_description).neq('movie_id', payload.movie_id).limit(3)
      : Promise.resolve({ data: [], error: null }),
    imageUrl ? probeUrl(imageUrl, 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8') : Promise.resolve({ ok: false, status: 0, contentType: '' }),
    ...topicLinks.slice(0, 12).map((item) => probeUrl(new URL(item.url, 'https://khophim.org'), 'text/html,application/xhtml+xml')),
  ]);
  if (titleResult.error) throw titleResult.error;
  if (descriptionResult.error) throw descriptionResult.error;
  if ((titleResult.data ?? []).length > 0) issues.push({ code: 'duplicate_title', severity: 'error', section: 'search', message: `SEO Title đang trùng với /phim/${titleResult.data?.[0]?.slug}.` });
  if ((descriptionResult.data ?? []).length > 0) issues.push({ code: 'duplicate_description', severity: 'error', section: 'search', message: `Meta Description đang trùng với /phim/${descriptionResult.data?.[0]?.slug}.` });
  if (!imageProbe.ok || !/^image\//i.test(imageProbe.contentType)) issues.push({ code: 'image_unreachable', severity: 'error', section: 'movie', message: `Ảnh SEO không tải được như một tệp ảnh công khai (HTTP ${imageProbe.status || 'lỗi mạng'}).` });
  linkProbes.forEach((probe, index) => {
    if (!probe.ok) issues.push({ code: `topic_link_unreachable_${index + 1}`, severity: 'error', section: 'links', message: `Liên kết nội bộ “${topicLinks[index]?.title || topicLinks[index]?.url}” không truy cập được (HTTP ${probe.status || 'lỗi mạng'}).` });
  });
  return issues;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function htmlValue(html: string, pattern: RegExp): string {
  return decodeHtml(pattern.exec(html)?.[1]?.replace(/\s+/g, ' ').trim() || '');
}

async function inspectLivePage(
  payload: SeoPayload,
  expectedVersion?: number | string,
  phase: 'baseline' | 'pending' | 'final' = expectedVersion === undefined ? 'baseline' : 'final',
): Promise<LiveAuditResult> {
  const publicUrl = `https://khophim.org/phim/${encodeURIComponent(payload.slug)}`;
  const url = `https://khophim.org/internal/seo-studio-inspect?slug=${encodeURIComponent(payload.slug)}&check=${Date.now()}`;
  const checks: LiveAuditCheck[] = [];
  let status = 0;
  if (!SEO_INSPECT_SECRET) {
    checks.push({ code: 'inspect_configuration', passed: false, message: 'Máy chủ chưa có khóa kiểm tra SEO Studio.' });
    return { passed: false, checked_at: new Date().toISOString(), url: publicUrl, status, checks };
  }
  try {
    const response = await fetch(url, {
      redirect: 'error',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'KhoPhim-SEO-Studio-Auditor/1.0',
        'Cache-Control': 'no-cache',
        'X-KhoPhim-SEO-Inspect-Secret': SEO_INSPECT_SECRET,
      },
      signal: AbortSignal.timeout(15000),
    });
    status = response.status;
    const html = await response.text();
    const httpPassed = status === 200;
    checks.push({
      code: 'http_200',
      passed: httpPassed,
      message: httpPassed
        ? 'Trang phim trả về HTTP 200 qua bộ dựng HTML Googlebot nội bộ.'
        : status === 403
          ? 'Cloudflare đã chặn máy chủ kiểm tra (HTTP 403); đây là lỗi lớp chống bot, chưa phải lỗi nội dung SEO.'
          : `Bộ dựng HTML trang phim trả về HTTP ${status}.`,
      value: status,
    });
    if (!httpPassed) {
      return { passed: false, checked_at: new Date().toISOString(), url: publicUrl, status, checks };
    }
    const title = htmlValue(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = htmlValue(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)
      || htmlValue(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
    const canonical = htmlValue(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)
      || htmlValue(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i);
    const h1 = htmlValue(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const robots = `${response.headers.get('x-robots-tag') || ''} ${htmlValue(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["'][^>]*>/i)}`.toLowerCase();
    const expectedCanonical = `https://khophim.org/phim/${payload.slug}`;
    const introSample = (payload.intro_content || '').slice(0, 80).replace(/\s+/g, ' ').trim();
    const expectedIndex = phase === 'final' && payload.index_mode === 'index';
    const expectedNoIndex = phase === 'pending' || (phase === 'final' && payload.index_mode === 'noindex');
    const expectedMovieName = normalizeKeyword(String(payload.movie_patch?.name || ''));
    const normalizedH1 = normalizeKeyword(h1);
    const h1Passed = Boolean(h1 && expectedMovieName && normalizedH1.includes(expectedMovieName));
    const hasMovieSchema = /["']@type["']\s*:\s*["'](?:Movie|TVSeries)["']/i.test(html);
    checks.push(
      { code: 'canonical', passed: canonical === expectedCanonical, message: canonical === expectedCanonical ? 'Canonical chính xác.' : `Canonical nhận được: ${canonical || 'không có'}.`, value: canonical },
      { code: 'h1', passed: h1Passed, message: h1Passed ? `H1 hợp lệ: ${h1}` : h1 ? `H1 chưa khớp tên phim: ${h1}` : 'Không tìm thấy H1 phim.', value: h1 },
      { code: 'movie_schema', passed: hasMovieSchema, message: hasMovieSchema ? 'Schema Movie/TVSeries có trong HTML Googlebot.' : 'Không tìm thấy schema Movie/TVSeries trong HTML Googlebot.' },
    );
    if (expectedVersion !== undefined) {
      const marker = htmlValue(html, /data-kp-seo-profile-version=["']([^"']+)["']/i);
      checks.push(
        { code: 'profile_version', passed: marker === String(expectedVersion), message: marker === String(expectedVersion) ? `Googlebot nhận đúng hồ sơ SEO phiên bản ${marker}.` : `Googlebot chưa nhận đúng hồ sơ phiên bản ${String(expectedVersion)} (đang thấy ${marker || 'không có'}).`, value: marker },
        { code: 'seo_title', passed: title === payload.seo_title, message: title === payload.seo_title ? 'SEO Title đã xuất hiện trong HTML Googlebot.' : `Title thực tế: ${title || 'không có'}.`, value: title },
        { code: 'meta_description', passed: description === payload.meta_description, message: description === payload.meta_description ? 'Meta Description đã xuất hiện trong HTML Googlebot.' : 'Meta Description trong HTML chưa khớp hồ sơ.', value: description },
        { code: 'intro_visible', passed: !introSample || html.includes(introSample), message: !introSample || html.includes(introSample) ? 'Nội dung giới thiệu đã xuất hiện trong HTML Googlebot.' : 'Nội dung giới thiệu chưa xuất hiện trong HTML Googlebot.' },
      );
    }
    if (expectedIndex) checks.push({ code: 'robots_index', passed: robots.includes('index') && !robots.includes('noindex'), message: robots.includes('index') && !robots.includes('noindex') ? 'Robots cho phép index.' : `Robots thực tế: ${robots || 'không có'}.`, value: robots });
    if (expectedNoIndex) checks.push({ code: 'robots_noindex', passed: robots.includes('noindex'), message: robots.includes('noindex') ? 'Robots noindex đúng yêu cầu.' : `Robots chưa đặt noindex: ${robots || 'không có'}.`, value: robots });
  } catch {
    checks.push({ code: 'live_fetch', passed: false, message: 'Không tải được trang thật bằng Googlebot trong thời gian cho phép.' });
  }
  return {
    passed: checks.length > 0 && checks.every((check) => check.passed),
    checked_at: new Date().toISOString(),
    url: publicUrl,
    status,
    checks,
  };
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Missing Supabase environment' }, 500, headers);
  if (!await verifyAdminRequest(req)) return json({ error: 'Unauthorized – admin login required' }, 401, headers);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 40);
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    if (action === 'search') {
      const query = plainText(body.query, 120);
      if (query.length < 2) return json({ items: [] }, 200, headers);
      const escaped = query.replace(/[,%()]/g, ' ').trim();
      const { data, error } = await db.from('movies')
        .select('id,slug,name,origin_name,title_vi,title_en,year,thumb_url,poster_url,is_published,updated_at')
        .or(`name.ilike.%${escaped}%,origin_name.ilike.%${escaped}%,title_vi.ilike.%${escaped}%,title_en.ilike.%${escaped}%,slug.ilike.%${escaped}%`)
        .order('updated_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return json({ items: data ?? [] }, 200, headers);
    }

    if (action === 'load') {
      const movieId = text(body.movie_id, 80);
      if (!movieId) return json({ error: 'Missing movie_id' }, 400, headers);
      const [movieResult, profileResult, reviewResult, qualityResult, draftResult] = await Promise.all([
        db.from('movies').select('id,slug,name,origin_name,title_vi,title_en,content,year,quality,lang,trailer_url,thumb_url,poster_url,actor,director,category,country,is_published,updated_at').eq('id', movieId).maybeSingle(),
        db.from('movie_seo_profiles').select('*').eq('movie_id', movieId).maybeSingle(),
        db.from('movie_reviews').select('content,word_count,generated_at,updated_at').eq('slug', text(body.slug, 180)).maybeSingle(),
        db.from('movie_seo_quality_status').select('eligible_for_index,index_tier,quality_score,reasons,signals,checked_at').eq('movie_id', movieId).maybeSingle(),
        db.from('movie_seo_profile_drafts').select('payload,baseline_version,unlocked_fields,validation_score,validation_issues,updated_at').eq('movie_id', movieId).maybeSingle(),
      ]);
      if (movieResult.error) throw movieResult.error;
      if (draftResult.error && draftResult.error.code !== '42P01') throw draftResult.error;
      if (!movieResult.data) return json({ error: 'Movie not found' }, 404, headers);
      await db.from('seo_work_items').update({
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      }).eq('movie_id', movieId).eq('status', 'pending');
      const movie = movieResult.data as Record<string, unknown>;
      const profile = profileResult.data && typeof profileResult.data === 'object' ? profileResult.data as Record<string, unknown> : null;
      const review = reviewResult.data && typeof reviewResult.data === 'object' ? reviewResult.data as Record<string, unknown> : null;
      const baseline = baselinePayload(movie, profile, review);
      const baselineValidation = validate(baseline);
      const baselineVersion = Number(profile?.version || 0);
      const serverDraft = draftResult.data && Number(draftResult.data.baseline_version || 0) === baselineVersion
        ? draftResult.data
        : null;
      const suggestedTitle = `${movie.name}${movie.year ? ` (${movie.year})` : ''} – Thông Tin Phim | KhoPhim`;
      const suggestedDescription = `${movie.name}${movie.origin_name ? ` (${movie.origin_name})` : ''} – nội dung, diễn viên, trailer, lịch phát hành và thông tin cập nhật tại KhoPhim.`;
      return json({
        movie,
        profile: profileResult.data,
        review: reviewResult.data,
        quality: qualityResult.data,
        suggestions: { title: suggestedTitle, description: suggestedDescription, canonical_path: `/phim/${movie.slug}` },
        safe_edit: {
          baseline,
          baseline_version: baselineVersion,
          baseline_validation: baselineValidation,
          fields: fieldStates(baseline, baselineValidation, profile?.status === 'published'),
          draft: serverDraft,
          history_available: Number(profile?.version || 0) > 0,
        },
      }, 200, headers);
    }

    if (action === 'validate') {
      const payload = cleanPayload(body.payload);
      return json(validate(payload), 200, headers);
    }

    if (action === 'inspect') {
      const payload = cleanPayload(body.payload);
      const validation = mergeValidation(validate(payload), await remoteValidationIssues(db, payload));
      const liveAudit = await inspectLivePage(payload);
      const liveIssues = liveAudit.checks
        .filter((check) => !check.passed)
        .map((check) => ({
          code: `live_${check.code}`,
          severity: 'error' as const,
          section: 'technical' as const,
          message: check.message,
        }));
      return json({ validation: mergeValidation(validation, liveIssues), live_audit: liveAudit }, 200, headers);
    }

    if (action === 'save' || action === 'publish') {
      const payload = cleanPayload(body.payload);
      const safeEdit = readSafeEditInput(body);
      let validation = validate(payload);
      if (!payload.movie_id || !payload.slug) return json({ error: 'Missing movie identity', validation }, 400, headers);
      const [movieResult, profileResult, reviewResult] = await Promise.all([
        db.from('movies').select('id,slug,name,origin_name,title_vi,title_en,content,year,quality,lang,trailer_url,thumb_url,poster_url,actor,director,category,country,is_published,updated_at').eq('id', payload.movie_id).maybeSingle(),
        db.from('movie_seo_profiles').select('*').eq('movie_id', payload.movie_id).maybeSingle(),
        db.from('movie_reviews').select('content,word_count,generated_at,updated_at').eq('slug', payload.slug).maybeSingle(),
      ]);
      if (movieResult.error || !movieResult.data) throw movieResult.error || new Error('Movie not found');
      if (profileResult.error) throw profileResult.error;
      const currentProfile = profileResult.data && typeof profileResult.data === 'object' ? profileResult.data as Record<string, unknown> : null;
      const currentVersion = Number(currentProfile?.version || 0);
      const currentBaseline = baselinePayload(
        movieResult.data as Record<string, unknown>,
        currentProfile,
        reviewResult.data && typeof reviewResult.data === 'object' ? reviewResult.data as Record<string, unknown> : null,
      );
      const currentValidation = validate(currentBaseline);
      if (action === 'publish' && safeEdit.baseline_version !== currentVersion) {
        return json({ error: 'Hồ sơ đang chạy đã thay đổi. Hãy tải lại để tránh ghi đè phiên bản mới hơn.', validation }, 409, headers);
      }
      if (action === 'publish') {
        validation = mergeValidation(validation, await remoteValidationIssues(db, payload));
        validation = mergeValidation(validation, regressionIssues(
          currentBaseline,
          payload,
          currentValidation,
          validation,
          safeEdit.unlocked_fields,
          currentProfile?.status === 'published',
        ));
      }
      if (action === 'publish' && validation.issues.some((item) => item.severity === 'error')) {
        return json({ error: 'Bản mới bị chặn vì còn lỗi hoặc làm giảm tín hiệu SEO đang tốt.', validation }, 422, headers);
      }
      if (action === 'publish' && validation.score < 80) {
        return json({ error: 'Điểm SEO phải đạt ít nhất 80 trước khi xuất bản.', validation }, 422, headers);
      }
      if (action === 'publish' && payload.index_mode === 'index' && validation.score < 85) {
        return json({ error: 'Muốn cho phép index thủ công, điểm SEO phải đạt ít nhất 85.', validation }, 422, headers);
      }
      const { error: saveError } = await db.from('movie_seo_profile_drafts')
        .upsert({
          movie_id: payload.movie_id,
          payload,
          baseline_version: currentVersion,
          unlocked_fields: safeEdit.unlocked_fields,
          validation_score: validation.score,
          validation_issues: validation.issues,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'movie_id' });
      if (saveError) throw saveError;
      if (action === 'save') return json({ success: true, status: 'draft', validation, published_profile_unchanged: true }, 200, headers);

      const { data: publishResult, error: publishError } = await db.rpc('publish_movie_seo_profile', { p_movie_id: payload.movie_id });
      if (publishError) throw publishError;
      const publishedVersion = publishResult && typeof publishResult === 'object'
        ? (publishResult as Record<string, unknown>).version as string | number | undefined
        : undefined;
      // Newly published profiles are deliberately served as noindex until the
      // Googlebot HTML has passed every content/technical check. This closes
      // the failure window where an interrupted audit could otherwise expose
      // an unverified manual profile to search engines.
      const pendingAudit = await inspectLivePage(payload, publishedVersion, 'pending');
      if (!pendingAudit.passed) {
        const failedIssue: ValidationIssue = {
          code: 'post_publish_live_audit_failed',
          severity: 'error',
          section: 'technical',
          message: 'Trang đã được giữ ở noindex vì HTML Googlebot sau xuất bản chưa khớp hồ sơ SEO.',
        };
        const safeValidation = mergeValidation(validation, [failedIssue]);
        const rollback = await rollbackFailedPublish(db, payload.movie_id, Number(publishedVersion || 0));
        if (rollback?.restored === true) {
          return json({
            error: 'Bản mới không đạt kiểm tra trang thật nên hệ thống đã tự khôi phục phiên bản SEO tốt trước đó.',
            success: false,
            status: 'rolled-back',
            validation: safeValidation,
            live_audit: pendingAudit,
            rollback,
            result: publishResult,
          }, 502, headers);
        }
        const { error: failSafeError } = await db.from('movie_seo_profiles').update({
          index_mode: 'noindex',
          version: Math.max(1, Number(publishedVersion || 0) + 1),
          validation_score: safeValidation.score,
          validation_issues: safeValidation.issues,
          live_audit: pendingAudit,
          last_audited_at: pendingAudit.checked_at,
          updated_at: new Date().toISOString(),
        }).eq('movie_id', payload.movie_id);
        if (failSafeError) throw failSafeError;
        return json({
          error: 'Đã xuất bản dữ liệu nhưng hệ thống tự chuyển sang noindex vì kiểm tra trang thật chưa đạt. Hãy xem các mục kiểm tra và xuất bản lại sau khi sửa.',
          success: false,
          status: 'published-safe-noindex',
          validation: safeValidation,
          live_audit: pendingAudit,
          result: publishResult,
        }, 502, headers);
      }

      const verifiedVersion = Math.max(1, Number(publishedVersion || 0) + 1);
      const { data: verifiedProfile, error: auditSaveError } = await db.from('movie_seo_profiles').update({
        live_audit: pendingAudit,
        last_audited_at: pendingAudit.checked_at,
        version: verifiedVersion,
        updated_at: new Date().toISOString(),
      }).eq('movie_id', payload.movie_id).eq('version', Number(publishedVersion || 0)).select('version').maybeSingle();
      if (auditSaveError) throw auditSaveError;
      if (!verifiedProfile) throw new Error('Hồ sơ SEO đã thay đổi trong lúc xác minh. Hãy tải lại và xuất bản lại.');

      const finalAudit = await inspectLivePage(payload, verifiedVersion, 'final');
      if (!finalAudit.passed) {
        const failedIssue: ValidationIssue = {
          code: 'post_publish_final_audit_failed',
          severity: 'error',
          section: 'technical',
          message: 'Trang đã được giữ ở noindex vì lần xác minh cuối sau khi mở index chưa đạt.',
        };
        const safeValidation = mergeValidation(validation, [failedIssue]);
        const rollback = await rollbackFailedPublish(db, payload.movie_id, verifiedVersion);
        if (rollback?.restored === true) {
          return json({
            error: 'Bản mới làm kiểm tra cuối thất bại nên hệ thống đã tự khôi phục phiên bản SEO tốt trước đó.',
            success: false,
            status: 'rolled-back',
            validation: safeValidation,
            live_audit: finalAudit,
            rollback,
            result: publishResult,
          }, 502, headers);
        }
        const { error: failSafeError } = await db.from('movie_seo_profiles').update({
          index_mode: 'noindex',
          version: verifiedVersion + 1,
          validation_score: safeValidation.score,
          validation_issues: safeValidation.issues,
          live_audit: finalAudit,
          last_audited_at: finalAudit.checked_at,
          updated_at: new Date().toISOString(),
        }).eq('movie_id', payload.movie_id).eq('version', verifiedVersion);
        if (failSafeError) throw failSafeError;
        return json({
          error: 'Hồ sơ đã được giữ ở noindex vì lần kiểm tra cuối trên trang thật chưa đạt. Hãy xem các mục kiểm tra rồi xuất bản lại.',
          success: false,
          status: 'published-safe-noindex',
          validation: safeValidation,
          live_audit: finalAudit,
          result: publishResult,
        }, 502, headers);
      }

      const { error: finalAuditSaveError } = await db.from('movie_seo_profiles').update({
        live_audit: finalAudit,
        last_audited_at: finalAudit.checked_at,
      }).eq('movie_id', payload.movie_id).eq('version', verifiedVersion);
      if (finalAuditSaveError) throw finalAuditSaveError;
      const completedAt = new Date().toISOString();
      const { error: workItemError } = await db.from('seo_work_items').update({
        status: 'completed',
        completed_at: completedAt,
        updated_at: completedAt,
      }).eq('movie_id', payload.movie_id).in('status', ['pending', 'in_progress']);
      if (workItemError) throw workItemError;
      const { data: pendingRelease, error: pendingReleaseError } = await db.from('seo_static_release_requests')
        .select('id')
        .eq('movie_id', payload.movie_id)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();
      if (pendingReleaseError) throw pendingReleaseError;
      const releasePayload = {
        movie_id: payload.movie_id,
        slug: payload.slug,
        reason: 'seo_profile_published',
        requested_version: verifiedVersion,
        requested_at: completedAt,
        error_message: null,
      };
      const releaseResult = pendingRelease?.id
        ? await db.from('seo_static_release_requests').update(releasePayload).eq('id', pendingRelease.id)
        : await db.from('seo_static_release_requests').insert(releasePayload);
      if (releaseResult.error) throw releaseResult.error;
      return json({ success: true, status: 'published', validation, live_audit: finalAudit, result: { ...((publishResult && typeof publishResult === 'object') ? publishResult : {}), version: verifiedVersion } }, 200, headers);
    }

    return json({ error: 'Unknown action' }, 400, headers);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, headers);
  }
});
