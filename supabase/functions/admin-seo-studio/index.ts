import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { verifyAdminRequest } from '../_shared/admin-session.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SEO_INSPECT_SECRET = Deno.env.get('MOVIE_DETAIL_PROXY_SECRET') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.5';

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

type AiSeoEvidence = {
  field: string;
  fact: string;
  source_url: string;
  confidence: 'high' | 'medium' | 'low';
};

type AiSeoSuggestion = {
  summary: string;
  patch: Pick<SeoPayload, 'focus_keyword' | 'secondary_keywords' | 'seo_title' | 'meta_description' | 'intro_content' | 'review_content' | 'faq' | 'topic_links'>;
  evidence: AiSeoEvidence[];
  warnings: string[];
  preserved_fields: string[];
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

const AI_EDITABLE_FIELDS = [
  'focus_keyword', 'secondary_keywords', 'seo_title', 'meta_description',
  'intro_content', 'review_content', 'faq', 'topic_links',
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

const AI_SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'patch', 'evidence', 'warnings', 'preserved_fields'],
  properties: {
    summary: { type: 'string' },
    patch: {
      type: 'object',
      additionalProperties: false,
      required: [...AI_EDITABLE_FIELDS],
      properties: {
        focus_keyword: { type: 'string' },
        secondary_keywords: { type: 'array', maxItems: 12, items: { type: 'string' } },
        seo_title: { type: 'string' },
        meta_description: { type: 'string' },
        intro_content: { type: 'string' },
        review_content: { type: 'string' },
        faq: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['question', 'answer'],
            properties: {
              question: { type: 'string' },
              answer: { type: 'string' },
            },
          },
        },
        topic_links: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'url', 'anchor', 'description'],
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              anchor: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    },
    evidence: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'fact', 'source_url', 'confidence'],
        properties: {
          field: { type: 'string', enum: [...AI_EDITABLE_FIELDS] },
          fact: { type: 'string' },
          source_url: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    warnings: { type: 'array', maxItems: 12, items: { type: 'string' } },
    preserved_fields: { type: 'array', maxItems: 20, items: { type: 'string' } },
  },
} as const;

function aiPatchFromSuggestion(baseline: SeoPayload, value: unknown): AiSeoSuggestion['patch'] {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const cleaned = cleanPayload({ ...baseline, ...raw, movie_patch: baseline.movie_patch });
  return {
    focus_keyword: cleaned.focus_keyword || '',
    secondary_keywords: cleaned.secondary_keywords || [],
    seo_title: cleaned.seo_title || '',
    meta_description: cleaned.meta_description || '',
    intro_content: cleaned.intro_content || '',
    review_content: cleaned.review_content || '',
    faq: cleaned.faq || [],
    topic_links: cleaned.topic_links || [],
  };
}

function extractOpenAiText(value: unknown): string {
  const response = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof response.output_text === 'string') return response.output_text;
  if (!Array.isArray(response.output)) return '';
  for (const item of response.output) {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    if (!Array.isArray(row.content)) continue;
    for (const content of row.content) {
      const part = content && typeof content === 'object' ? content as Record<string, unknown> : {};
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

function fallbackAiSuggestion(
  baseline: SeoPayload,
  relatedMovies: Array<Record<string, unknown>>,
): AiSeoSuggestion {
  const existingLinks = baseline.topic_links || [];
  const topicLinks = existingLinks.length >= 2 ? existingLinks : relatedMovies.slice(0, 4).map((movie) => ({
    title: plainText(movie.name, 180),
    url: `/phim/${text(movie.slug, 180)}`,
    anchor: `Xem thông tin ${plainText(movie.name, 150)}`,
    description: movie.year ? `Phim liên quan phát hành năm ${Number(movie.year)}.` : 'Phim có chủ đề liên quan trên KhoPhim.',
  }));
  return {
    summary: 'Máy chủ chưa được cấu hình khóa AI. Hệ thống đã giữ nguyên nội dung hiện có và chỉ gợi ý liên kết từ các phim công khai có sẵn.',
    patch: { ...aiPatchFromSuggestion(baseline, baseline), topic_links: topicLinks },
    evidence: topicLinks.map((link) => ({
      field: 'topic_links',
      fact: `Trang liên quan có sẵn: ${link.title}.`,
      source_url: `https://khophim.org${link.url}`,
      confidence: 'high',
    })),
    warnings: ['Chưa có OPENAI_API_KEY nên nội dung biên tập không được AI viết mới.'],
    preserved_fields: ['slug', 'canonical_path', 'index_mode', 'movie_patch'],
  };
}

async function requestAiSuggestion(input: Record<string, unknown>, baseline: SeoPayload): Promise<AiSeoSuggestion> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      max_output_tokens: 9000,
      instructions: [
        'Bạn là biên tập viên SEO phim tiếng Việt của KhoPhim.',
        'Chỉ dùng dữ kiện có trong TRUSTED_CONTEXT. Không suy đoán nguồn phát, ngày chiếu, cốt truyện, diễn viên, đạo diễn hoặc mức độ nổi tiếng.',
        'Không tự chấm điểm, không dùng lời quảng cáo cảm tính như hay nhất, đỉnh, siêu hay; không nhồi từ khóa và không sao chép mô tả.',
        'Mục tiêu là nội dung tự nhiên, hữu ích, phân biệt rõ phim và đáp ứng đúng ý định tìm kiếm.',
        'Giữ nguyên trường đang tốt khi không có lý do cụ thể để sửa. Tuyệt đối không đề xuất thay đổi slug, canonical, index_mode hoặc movie_patch.',
        'Liên kết nội bộ chỉ được chọn nguyên văn từ related_movies. Nếu dữ kiện không đủ, giữ nội dung hiện tại và nêu cảnh báo.',
        'Mỗi dữ kiện quan trọng phải có evidence trỏ tới một source_url đã xuất hiện trong TRUSTED_CONTEXT.',
      ].join(' '),
      input: `TRUSTED_CONTEXT\n${JSON.stringify(input)}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'khophim_seo_suggestion',
          strict: true,
          schema: AI_SUGGESTION_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(55000),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const row = responseBody && typeof responseBody === 'object' ? responseBody as Record<string, unknown> : {};
    const apiError = row.error && typeof row.error === 'object' ? row.error as Record<string, unknown> : {};
    throw new Error(plainText(apiError.message, 500) || `OpenAI API error ${response.status}`);
  }
  const outputText = extractOpenAiText(responseBody);
  if (!outputText) throw new Error('AI không trả về bản đề xuất có cấu trúc.');
  const parsed = JSON.parse(outputText) as Record<string, unknown>;
  const patch = aiPatchFromSuggestion(baseline, parsed.patch);
  const evidence = Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 20).flatMap((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const field = text(row.field, 80);
    const confidence = text(row.confidence, 20);
    if (!AI_EDITABLE_FIELDS.includes(field as typeof AI_EDITABLE_FIELDS[number])) return [];
    return [{
      field,
      fact: plainText(row.fact, 500),
      source_url: text(row.source_url, 700),
      confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence as AiSeoEvidence['confidence'] : 'low',
    }];
  }) : [];
  return {
    summary: plainText(parsed.summary, 600),
    patch,
    evidence,
    warnings: cleanStringList(parsed.warnings, 12, 500),
    preserved_fields: cleanStringList(parsed.preserved_fields, 20, 80),
  };
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
      const [movieResult, profileResult, reviewResult, qualityResult, draftResult, workItemResult, inspectionResult, metricResult, queryMetricResult] = await Promise.all([
        db.from('movies').select('id,slug,name,origin_name,title_vi,title_en,content,year,quality,lang,trailer_url,thumb_url,poster_url,actor,director,category,country,is_published,updated_at').eq('id', movieId).maybeSingle(),
        db.from('movie_seo_profiles').select('*').eq('movie_id', movieId).maybeSingle(),
        db.from('movie_reviews').select('content,word_count,generated_at,updated_at').eq('slug', text(body.slug, 180)).maybeSingle(),
        db.from('movie_seo_quality_status').select('eligible_for_index,index_tier,quality_score,reasons,signals,checked_at').eq('movie_id', movieId).maybeSingle(),
        db.from('movie_seo_profile_drafts').select('payload,baseline_version,unlocked_fields,validation_score,validation_issues,updated_at').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_work_items').select('task_type,status,priority_score,urgency,reason,required_fields,evidence,due_at,updated_at').eq('movie_id', movieId).in('status', ['pending', 'in_progress']).order('priority_score', { ascending: false }).limit(1).maybeSingle(),
        db.from('seo_url_inspections').select('verdict,coverage_state,indexing_state,page_fetch_state,user_canonical,google_canonical,last_crawl_time,inspected_at,recommendation').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_search_metrics').select('clicks,impressions,ctr,position,date_start,date_end,collected_at').eq('dimension_type', 'page').ilike('dimension_value', `%/phim/${text(body.slug, 180)}%`).order('collected_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('seo_query_page_metrics').select('query,clicks,impressions,ctr,position,date_start,date_end,collected_at').ilike('page', `%/phim/${text(body.slug, 180)}%`).order('collected_at', { ascending: false }).order('impressions', { ascending: false }).limit(20),
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
        ai_available: Boolean(OPENAI_API_KEY),
        insights: {
          work_item: workItemResult.error ? null : workItemResult.data,
          inspection: inspectionResult.error ? null : inspectionResult.data,
          search_metric: metricResult.error ? null : metricResult.data,
          search_queries: queryMetricResult.error ? [] : queryMetricResult.data ?? [],
        },
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

    if (action === 'suggest') {
      const movieId = text(body.movie_id, 80);
      const slug = text(body.slug, 180).toLowerCase();
      const mode = body.mode === 'deep' ? 'deep' : 'quick';
      if (!movieId || !slug) return json({ error: 'Missing movie identity' }, 400, headers);
      const [movieResult, profileResult, reviewResult, qualityResult, workItemResult, inspectionResult, metricResult, queryMetricResult, relatedResult] = await Promise.all([
        db.from('movies').select('id,slug,name,origin_name,title_vi,title_en,content,year,quality,lang,trailer_url,thumb_url,poster_url,actor,director,category,country,is_published,updated_at').eq('id', movieId).maybeSingle(),
        db.from('movie_seo_profiles').select('*').eq('movie_id', movieId).maybeSingle(),
        db.from('movie_reviews').select('content,word_count,generated_at,updated_at').eq('slug', slug).maybeSingle(),
        db.from('movie_seo_quality_status').select('eligible_for_index,index_tier,quality_score,reasons,signals,checked_at').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_work_items').select('task_type,status,priority_score,urgency,reason,required_fields,evidence,due_at,updated_at').eq('movie_id', movieId).in('status', ['pending', 'in_progress']).order('priority_score', { ascending: false }).limit(1).maybeSingle(),
        db.from('seo_url_inspections').select('verdict,coverage_state,indexing_state,page_fetch_state,user_canonical,google_canonical,last_crawl_time,inspected_at,recommendation').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_search_metrics').select('clicks,impressions,ctr,position,date_start,date_end,collected_at').eq('dimension_type', 'page').ilike('dimension_value', `%/phim/${slug}%`).order('collected_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('seo_query_page_metrics').select('query,clicks,impressions,ctr,position,date_start,date_end,collected_at').ilike('page', `%/phim/${slug}%`).order('collected_at', { ascending: false }).order('impressions', { ascending: false }).limit(mode === 'deep' ? 30 : 12),
        db.from('movies').select('id,slug,name,origin_name,year,category,country').eq('is_published', true).neq('id', movieId).order('updated_at', { ascending: false }).limit(mode === 'deep' ? 100 : 50),
      ]);
      if (movieResult.error || !movieResult.data) throw movieResult.error || new Error('Movie not found');
      if (text(movieResult.data.slug, 180).toLowerCase() !== slug) return json({ error: 'Movie identity mismatch' }, 409, headers);
      if (profileResult.error) throw profileResult.error;
      const movie = movieResult.data as Record<string, unknown>;
      const profile = profileResult.data && typeof profileResult.data === 'object' ? profileResult.data as Record<string, unknown> : null;
      const review = reviewResult.data && typeof reviewResult.data === 'object' ? reviewResult.data as Record<string, unknown> : null;
      const baseline = baselinePayload(movie, profile, review);
      const baselineValidation = validate(baseline);
      const movieCategories = new Set(cleanTaxonomy(movie.category).map((item) => item.slug));
      const movieCountries = new Set(cleanTaxonomy(movie.country).map((item) => item.slug));
      const relatedMovies = (relatedResult.data ?? []).map((item) => {
        const row = item as Record<string, unknown>;
        const categoryOverlap = cleanTaxonomy(row.category).filter((entry) => movieCategories.has(entry.slug)).length;
        const countryOverlap = cleanTaxonomy(row.country).filter((entry) => movieCountries.has(entry.slug)).length;
        const yearDistance = Math.abs(Number(row.year || 0) - Number(movie.year || 0));
        return { ...row, relevance_score: categoryOverlap * 5 + countryOverlap * 2 + (yearDistance <= 2 ? 1 : 0) };
      }).filter((item) => Number(item.relevance_score) > 0).sort((a, b) => Number(b.relevance_score) - Number(a.relevance_score)).slice(0, 16);
      const trustedContext = {
        mode,
        page_url: `https://khophim.org/phim/${slug}`,
        current_profile: {
          ...aiPatchFromSuggestion(baseline, baseline),
          intro_content: plainText(baseline.intro_content, mode === 'deep' ? 9000 : 4500),
          review_content: plainText(baseline.review_content, mode === 'deep' ? 18000 : 8000),
        },
        current_validation: baselineValidation,
        protected_fields: fieldStates(baseline, baselineValidation, profile?.status === 'published'),
        movie_facts: {
          name: movie.name,
          title_vi: movie.title_vi,
          title_en: movie.title_en,
          origin_name: movie.origin_name,
          synopsis: plainText(movie.content, mode === 'deep' ? 9000 : 4500),
          year: movie.year,
          quality: movie.quality,
          language: movie.lang,
          trailer_url: movie.trailer_url,
          actors: movie.actor,
          directors: movie.director,
          categories: movie.category,
          countries: movie.country,
          source_url: `https://khophim.org/phim/${slug}`,
        },
        seo_brain_task: workItemResult.error ? null : workItemResult.data,
        google_inspection: inspectionResult.error ? null : inspectionResult.data,
        google_page_metric: metricResult.error ? null : metricResult.data,
        google_queries_for_page: queryMetricResult.error ? [] : queryMetricResult.data ?? [],
        quality_gate: qualityResult.error ? null : qualityResult.data,
        related_movies: relatedMovies.map((item) => ({
          name: item.name,
          origin_name: item.origin_name,
          year: item.year,
          categories: item.category,
          countries: item.country,
          url: `https://khophim.org/phim/${item.slug}`,
        })),
      };
      const suggestion = OPENAI_API_KEY
        ? await requestAiSuggestion(trustedContext, baseline)
        : fallbackAiSuggestion(baseline, relatedMovies);
      const allowedEvidenceUrls = new Set([
        `https://khophim.org/phim/${slug}`,
        ...relatedMovies.map((item) => `https://khophim.org/phim/${item.slug}`),
      ]);
      const safeEvidence = suggestion.evidence.filter((item) => allowedEvidenceUrls.has(item.source_url));
      const allowedTopicPaths = new Set([
        ...(baseline.topic_links || []).map((item) => safeTopicUrl(item.url)),
        ...relatedMovies.map((item) => `/phim/${item.slug}`),
      ].filter(Boolean));
      const groundedPatch = {
        ...suggestion.patch,
        topic_links: (suggestion.patch.topic_links || []).filter((item) => allowedTopicPaths.has(safeTopicUrl(item.url))),
      };
      const proposed = cleanPayload({ ...baseline, ...groundedPatch, movie_patch: baseline.movie_patch, slug, canonical_path: `/phim/${slug}`, index_mode: baseline.index_mode });
      let proposedValidation = validate(proposed);
      proposedValidation = mergeValidation(proposedValidation, await remoteValidationIssues(db, proposed));
      const changedFields = AI_EDITABLE_FIELDS.filter((field) => comparable(valueAt(baseline, field)) !== comparable(valueAt(proposed, field)));
      return json({
        ai_available: Boolean(OPENAI_API_KEY),
        model: OPENAI_API_KEY ? OPENAI_MODEL : null,
        mode,
        summary: suggestion.summary,
        proposed_payload: proposed,
        validation: proposedValidation,
        changed_fields: changedFields,
        evidence: safeEvidence,
        warnings: suggestion.warnings,
        preserved_fields: Array.from(new Set([...suggestion.preserved_fields, 'slug', 'canonical_path', 'index_mode', 'movie_patch'])),
        generated_at: new Date().toISOString(),
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
