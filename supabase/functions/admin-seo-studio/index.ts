import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { verifyAdminRequest } from '../_shared/admin-session.ts';
import { applyDeterministicEditorialConstraints } from '../_shared/seo-editorial-constraints.ts';
import {
  SEO_QUALITY_RULES_VERSION,
  buildSeoIntentMap,
  evaluateSeoQualityV2,
  type SeoQualityV2Result,
} from '../_shared/seo-quality-v2.ts';
import {
  buildIndexedSeoDecision,
  type IndexedSeoDecision,
} from '../_shared/seo-indexed-page-guard.ts';
import {
  missingMovieFactFields,
  patchFromDatabaseConsensus,
  patchFromVerifiedDatabaseCandidate,
  patchFromVerifiedTmdb,
  tmdbIdentityMatches,
  type MovieFactPatch,
  type TmdbFactDetail,
} from '../_shared/seo-movie-fact-enrichment.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SEO_INSPECT_SECRET = Deno.env.get('MOVIE_DETAIL_PROXY_SECRET') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.5';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
const GEMINI_FAST_MODEL = Deno.env.get('GEMINI_FAST_MODEL') ?? 'gemini-3.5-flash-lite';
const GEMINI_FALLBACK_MODEL = Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-2.5-flash-lite';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') ?? '';
const TMDB_READ_ACCESS_TOKEN = Deno.env.get('TMDB_READ_ACCESS_TOKEN') ?? '';
const SEO_PUBLISH_MODE = (Deno.env.get('SEO_PUBLISH_MODE') ?? 'static').toLowerCase() === 'worker' ? 'worker' : 'static';

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

type VerifiedKeywordPlan = {
  focus_keyword: string;
  secondary_keywords: string[];
  allowed_intents: string[];
  lifecycle: 'watch';
  clusters: ReturnType<typeof buildSeoIntentMap>;
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

type FactEnrichmentResult = {
  patch: MovieFactPatch;
  verified_fields: string[];
  unresolved_fields: string[];
  sources: string[];
  tmdb_status: 'verified' | 'not_configured' | 'not_matched' | 'not_needed' | 'error';
  message: string;
};

const INDEX_READINESS_CODES = new Set([
  'brief_intro', 'few_internal_links',
  'duplicate_title', 'duplicate_description', 'duplicate_secondary_keywords',
  'keyword_not_in_title', 'keyword_not_in_copy',
  'v2_watch_intent', 'v2_alias_coverage', 'v2_topic_intent',
  'v2_intro_depth', 'v2_review_depth', 'v2_content_depth', 'v2_template_copy',
]);

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

const AI_REPAIRABLE_ISSUE_CODES = new Set([
  'missing_keyword', 'title_short', 'title_brief', 'title_long',
  'description_short', 'description_brief', 'description_long',
  'duplicate_title', 'duplicate_description', 'duplicate_secondary_keywords',
  'keyword_not_in_title', 'keyword_not_in_copy', 'thin_intro', 'brief_intro',
  'missing_review', 'thin_review', 'unsupported_rating_claim',
  'thin_faq_answer', 'subjective_faq_claim', 'thin_faq',
  'few_internal_links', 'self_topic_link', 'image_unreachable',
  'v2_watch_intent', 'v2_alias_coverage', 'v2_topic_intent',
  'v2_intro_depth', 'v2_review_depth', 'v2_content_depth', 'v2_template_copy',
  'v2_supporting_entities',
]);

const DATA_ENRICHMENT_ISSUE_CODES = new Set([
  'missing_name', 'missing_year', 'missing_image', 'invalid_image_url',
  'missing_category', 'missing_country', 'missing_people',
]);

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

function movieFactField(key: string): string {
  return key === 'content' ? 'intro_content' : `movie_patch.${key}`;
}

async function tmdbJson<T>(path: string, params: Record<string, string>): Promise<T | null> {
  if (!TMDB_API_KEY && !TMDB_READ_ACCESS_TOKEN) return null;
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  if (TMDB_API_KEY) url.searchParams.set('api_key', TMDB_API_KEY);
  try {
    const response = await fetch(url, {
      headers: TMDB_READ_ACCESS_TOKEN ? { Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}` } : undefined,
      signal: AbortSignal.timeout(9000),
    });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

function expectedTmdbTypes(movie: Record<string, unknown>): Array<'movie' | 'tv'> {
  const explicit = text(movie.tmdb_media_type, 20).toLowerCase();
  if (explicit === 'movie' || explicit === 'tv') return [explicit];
  const type = text(movie.type, 40).toLowerCase();
  if (/series|tv|phim-bo|hoathinhbo/.test(type)) return ['tv'];
  if (/single|movie|phim-le/.test(type)) return ['movie'];
  return ['movie', 'tv'];
}

async function verifiedTmdbPatch(movie: Record<string, unknown>): Promise<{ patch: MovieFactPatch; status: FactEnrichmentResult['tmdb_status'] }> {
  if (missingMovieFactFields(movie).length === 0) return { patch: {}, status: 'not_needed' };
  if (!TMDB_API_KEY && !TMDB_READ_ACCESS_TOKEN) return { patch: {}, status: 'not_configured' };
  try {
    const types = expectedTmdbTypes(movie);
    const existingId = Number(movie.tmdb_id || 0);
    const identities: Array<{ id: number; mediaType: 'movie' | 'tv' }> = [];
    if (existingId > 0) {
      identities.push(...types.map((mediaType) => ({ id: existingId, mediaType })));
    } else {
      const queries = Array.from(new Set([movie.name, movie.origin_name, movie.title_vi, movie.title_en]
        .map((value) => plainText(value, 180)).filter(Boolean))).slice(0, 3);
      const searchResponses = await Promise.all(types.flatMap((mediaType) => queries.map(async (query) => ({
        mediaType,
        response: await tmdbJson<{ results?: TmdbFactDetail[] }>(`/search/${mediaType}`, {
          query,
          language: 'vi-VN',
          include_adult: 'false',
          ...(Number(movie.year || 0) ? { [mediaType === 'movie' ? 'year' : 'first_air_date_year']: String(movie.year) } : {}),
        }),
      }))));
      const matched = new Map<string, { id: number; mediaType: 'movie' | 'tv' }>();
      for (const { mediaType, response } of searchResponses) {
        for (const result of response?.results || []) {
          if (!Number(result.id || 0) || !tmdbIdentityMatches(movie, result)) continue;
          matched.set(`${mediaType}:${result.id}`, { id: Number(result.id), mediaType });
        }
      }
      if (matched.size !== 1) return { patch: {}, status: 'not_matched' };
      identities.push(...matched.values());
    }
    const details = await Promise.all(identities.map(async ({ id, mediaType }) => ({
      mediaType,
      detail: await tmdbJson<TmdbFactDetail>(`/${mediaType}/${id}`, { language: 'vi-VN', append_to_response: 'credits,videos' }),
    })));
    const verified = details.filter((item) => item.detail && tmdbIdentityMatches(movie, item.detail));
    if (verified.length !== 1 || !verified[0].detail) return { patch: {}, status: 'not_matched' };
    return { patch: patchFromVerifiedTmdb(movie, verified[0].detail, verified[0].mediaType), status: 'verified' };
  } catch {
    return { patch: {}, status: 'error' };
  }
}

function mergeFactPatches(primary: MovieFactPatch, secondary: MovieFactPatch): MovieFactPatch {
  const result = { ...secondary, ...primary };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))) as MovieFactPatch;
}

async function verifiedMovieFactEnrichment(
  db: ReturnType<typeof createClient>,
  movie: Record<string, unknown>,
): Promise<FactEnrichmentResult> {
  const missingBefore = missingMovieFactFields(movie);
  if (missingBefore.length === 0) return {
    patch: {}, verified_fields: [], unresolved_fields: [], sources: [], tmdb_status: 'not_needed', message: 'Dữ liệu phim đã đủ; không cần bổ sung.',
  };
  const tmdb = await verifiedTmdbPatch(movie);
  let consensusPatch: MovieFactPatch = {};
  let trustedDatabasePatch: MovieFactPatch = {};
  const normalizedName = text(movie.normalized_name, 240);
  if (normalizedName && Number(movie.year || 0)) {
    const { data, error } = await db.from('movies')
      .select('id,name,origin_name,title_vi,title_en,title_original,year,content,actor,director,category,country,thumb_url,poster_url,trailer_url,tmdb_id,source_site,source_name')
      .eq('normalized_name', normalizedName)
      .eq('year', Number(movie.year))
      .neq('id', text(movie.id, 80))
      .is('superseded_by_movie_id', null)
      .limit(20);
    if (!error) {
      const candidates = (data || []) as Array<Record<string, unknown>>;
      const candidateIds = candidates.map((row) => text(row.id, 80)).filter(Boolean);
      const verifiedIds = new Set<string>();
      if (candidateIds.length > 0) {
        const statusResult = await db.from('movie_tmdb_enrichment_status')
          .select('movie_id,status')
          .in('movie_id', candidateIds)
          .eq('status', 'enriched');
        if (!statusResult.error) (statusResult.data || []).forEach((row) => verifiedIds.add(String(row.movie_id)));
      }
      const annotated = candidates.map((row) => ({ ...row, tmdb_verified: verifiedIds.has(text(row.id, 80)) }));
      trustedDatabasePatch = patchFromVerifiedDatabaseCandidate(movie, annotated);
      consensusPatch = patchFromDatabaseConsensus(movie, annotated);
    }
  }
  const databasePatch = mergeFactPatches(trustedDatabasePatch, consensusPatch);
  const patch = mergeFactPatches(tmdb.patch, databasePatch);
  const enrichedMovie = { ...movie, ...patch };
  const verifiedFields = Object.keys(patch).filter((key) => !['tmdb_id', 'tmdb_media_type'].includes(key)).map(movieFactField);
  const sources = [
    ...(Object.keys(tmdb.patch).length ? ['TMDB khớp tên và năm phát hành'] : []),
    ...(Object.keys(trustedDatabasePatch).length ? ['Bản phim trùng khớp đã được TMDB xác minh trước đó'] : []),
    ...(Object.keys(consensusPatch).length ? ['Đồng thuận từ ít nhất 2 nguồn phim độc lập'] : []),
  ];
  const unresolvedFields = missingMovieFactFields(enrichedMovie);
  const message = verifiedFields.length > 0
    ? `Đã xác minh và bổ sung ${verifiedFields.length} trường dữ liệu phim vào bản nháp.`
    : tmdb.status === 'not_configured'
      ? 'Chưa có khóa TMDB và chưa đủ đồng thuận từ dữ liệu hiện có; hệ thống không tự đoán.'
      : 'Không tìm được kết quả khớp duy nhất, nên hệ thống không tự điền để tránh gắn nhầm phim.';
  return { patch, verified_fields: verifiedFields, unresolved_fields: unresolvedFields, sources, tmdb_status: tmdb.status, message };
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0;
}

const MIN_USEFUL_REVIEW_WORDS = 300;

/**
 * AI occasionally returns a concise answer despite the schema prompt. The
 * quality gate must never depend on the model following a word-count request.
 * This foundation only restates facts already present in the approved movie
 * payload and turns them into a useful viewing guide; it deliberately avoids
 * invented plot points, ratings, performance claims, or recommendations.
 */
function verifiedReviewFoundation(payload: SeoPayload): string {
  const patch = payload.movie_patch ?? {};
  const name = plainText(patch.name || payload.focus_keyword, 180) || 'Bộ phim này';
  const origin = plainText(patch.origin_name, 180);
  const year = Number(patch.year || 0);
  const type = plainText(patch.type, 40);
  const categories = cleanTaxonomy(patch.category).map((item) => item.name).slice(0, 4);
  const countries = cleanTaxonomy(patch.country).map((item) => item.name).slice(0, 3);
  const directors = cleanStringList(patch.director, 4, 140);
  const actors = cleanStringList(patch.actor, 6, 140);
  const language = plainText(patch.lang, 80);
  const quality = plainText(patch.quality, 40);
  const episode = plainText(patch.episode_current, 80);
  const synopsis = plainText(payload.intro_content, 900);
  const identity = [
    origin && origin !== name ? `tên quốc tế ${origin}` : '',
    year ? `năm phát hành ${year}` : '',
    type ? `dạng ${type}` : '',
  ].filter(Boolean).join(', ');
  const catalog = [
    categories.length ? `thể loại ${categories.join(', ')}` : '',
    countries.length ? `quốc gia ${countries.join(', ')}` : '',
    directors.length ? `đạo diễn ${directors.join(', ')}` : '',
    actors.length ? `diễn viên ${actors.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  const playback = [
    quality ? `chất lượng hiển thị ${quality}` : '',
    language ? `ngôn ngữ hoặc phụ đề ${language}` : '',
    episode ? `trạng thái tập ${episode}` : '',
  ].filter(Boolean).join(', ');

  return plainText([
    `Góc nhìn biên tập về ${name}`,
    `${name}${identity ? ` được nhận diện bằng ${identity}` : ''}. Phần thông tin trên KhoPhim tập trung vào việc giúp người xem xác định đúng phiên bản trước khi mở phim, đặc biệt khi tên Việt hóa, tên quốc tế hoặc các bản làm lại có thể dễ gây nhầm lẫn. ${catalog ? `Dữ kiện đang có gồm ${catalog}.` : 'Dữ kiện đoàn phim và phân loại được cập nhật theo nguồn hiện có.'}`,
    synopsis
      ? `Về nội dung công khai, trang giới thiệu ghi nhận: ${synopsis} Phần nhận xét này chỉ dựa trên ngữ cảnh đã được cung cấp; vì vậy không tự thêm diễn biến, nút thắt hay kết luận về các cảnh chưa có nguồn xác minh. Cách trình bày đó giúp người xem biết mình sắp tiếp cận chủ đề gì mà vẫn hạn chế tiết lộ nội dung quan trọng.`
      : `Nguồn dữ liệu hiện chưa cung cấp mô tả cốt truyện đủ chi tiết để phân tích sâu theo từng tình tiết. Thay vì tạo thêm nội dung suy đoán, phần biên tập giữ trọng tâm ở nhận diện phim, thể loại và thông tin đoàn phim để người xem có cơ sở chọn đúng tác phẩm. Khi mô tả chính thức được bổ sung, nhận xét có thể được mở rộng dựa trên dữ kiện mới.` ,
    `Khi cân nhắc xem, người dùng nên đối chiếu ${categories.length ? `nhóm thể loại ${categories.join(', ')}` : 'thể loại'} với sở thích cá nhân, sau đó kiểm tra năm phát hành và danh sách tập để tránh chọn nhầm mùa hoặc bản khác. ${playback ? `Tại thời điểm cập nhật, trang ghi nhận ${playback}.` : 'Chất lượng, ngôn ngữ và số tập có thể thay đổi khi nguồn phát cập nhật, nên nên xem thông tin ngay trên trang phim trước khi bắt đầu.'} Đây là các chi tiết thực tế hữu ích hơn một nhận định cảm tính vì chúng ảnh hưởng trực tiếp đến lựa chọn của người xem.`,
    `Giá trị của phần review này là đặt ${name} vào đúng bối cảnh thông tin: tác phẩm thuộc nhóm nội dung nào, ai tham gia nếu dữ liệu đã xác minh và người xem cần kiểm tra gì trước khi xem. Nội dung không tự chấm điểm hoặc khẳng định mức độ hay dở khi chưa có quy trình biên tập và nguồn đánh giá độc lập. Nhờ vậy, trang vừa hỗ trợ tìm kiếm vừa duy trì kỳ vọng rõ ràng, cập nhật được khi dữ liệu phim thay đổi.`,
  ].join('\n\n'), 35_000);
}

function ensureUsefulReview(payload: SeoPayload): SeoPayload {
  const review = plainText(payload.review_content, 35_000);
  if (wordCount(review) >= MIN_USEFUL_REVIEW_WORDS) return payload;
  const foundation = verifiedReviewFoundation(payload);
  const merged = review ? `${review}\n\n${foundation}` : foundation;
  return cleanPayload({ ...payload, review_content: merged });
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
  v2_primary_intent: ['focus_keyword'],
  v2_title_identity: ['seo_title'],
  v2_watch_intent: ['secondary_keywords', 'seo_title', 'meta_description', 'intro_content'],
  v2_alias_coverage: ['secondary_keywords', 'intro_content', 'faq'],
  v2_topic_intent: ['secondary_keywords', 'intro_content', 'topic_links'],
  v2_intro_depth: ['intro_content'],
  v2_review_depth: ['review_content'],
  v2_content_depth: ['intro_content', 'review_content'],
  v2_template_copy: ['review_content'],
  v2_people_evidence: ['movie_patch.actor', 'movie_patch.director'],
  v2_identity_evidence: ['movie_patch.country', 'movie_patch.year'],
  v2_source_evidence: ['movie_patch.name'],
  v2_topic_links: ['topic_links'],
  v2_supporting_entities: ['faq', 'movie_patch.actor', 'movie_patch.director'],
  v2_unsupported_claim: ['review_content', 'faq'],
};

function fieldsForIssue(code: string): string[] {
  if (code.startsWith('topic_link_unreachable_')) return ['topic_links'];
  return ISSUE_FIELD_MAP[code] || [];
}

function repairableIssues(validation: ReturnType<typeof validate>): ValidationIssue[] {
  return validation.issues.filter((issue) => issue.severity !== 'success'
    && (AI_REPAIRABLE_ISSUE_CODES.has(issue.code) || issue.code.startsWith('topic_link_unreachable_')));
}

function assistantCompletion(validation: ReturnType<typeof validate>, repairedInSecondPass: boolean) {
  const remainingIssues = validation.issues.filter((issue) => issue.severity !== 'success');
  const aiFixableRemaining = repairableIssues(validation);
  const dataIssues = remainingIssues.filter((issue) => DATA_ENRICHMENT_ISSUE_CODES.has(issue.code));
  const limitations = [
    ...(dataIssues.length > 0 ? [`${dataIssues.length} mục cần bổ sung dữ liệu phim đã xác minh; AI không được phép tự bịa.`] : []),
    ...(remainingIssues.some((issue) => ['canonical_mismatch', 'invalid_slug'].includes(issue.code)) ? ['URL chuẩn và slug được khóa để bảo vệ tín hiệu Google.'] : []),
    ...(aiFixableRemaining.length > 0 ? [`AI vẫn còn ${aiFixableRemaining.length} mục có thể cải thiện; hệ thống không đánh dấu hoàn thành.`] : []),
  ];
  return {
    complete: remainingIssues.length === 0,
    repaired_in_second_pass: repairedInSecondPass,
    remaining_issues: remainingIssues,
    ai_fixable_remaining: aiFixableRemaining.map((issue) => issue.code),
    requires_data_enrichment: dataIssues.map((issue) => issue.code),
    limitations,
  };
}

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

function applyIndexedDecisionToFieldStates(
  states: Record<string, SafeFieldState>,
  decision: IndexedSeoDecision,
): Record<string, SafeFieldState> {
  const protectedFields = new Set(decision.protected_fields);
  const editableFields = new Set(decision.editable_fields);
  return Object.fromEntries(Object.entries(states).map(([field, state]) => {
    if (!protectedFields.has(field) || editableFields.has(field) || state.status === 'needs_attention' || state.status === 'immutable') {
      return [field,state];
    }
    return [field,{
      status:'protected' as const,
      protected:true,
      reason:`${decision.label}: ${decision.reason}`,
    }];
  }));
}

function indexedGuardIssues(
  baseline: SeoPayload,
  next: SeoPayload,
  unlockedFields: string[],
  decision: IndexedSeoDecision,
): ValidationIssue[] {
  if (!decision.indexed) return [];
  const protectedFields = new Set(decision.protected_fields);
  const editableFields = new Set(decision.editable_fields);
  const unlocked = new Set(unlockedFields);
  return SAFE_FIELD_PATHS.flatMap((field) => {
    if (comparable(valueAt(baseline,field)) === comparable(valueAt(next,field))) return [];
    if (!protectedFields.has(field) || editableFields.has(field)) return [];
    return [{
      code:`indexed_guard_${field.replace(/[^a-z0-9]+/gi,'_')}`,
      severity:'error' as const,
      section:'technical' as const,
      message:unlocked.has(field)
        ? `Mục “${field}” vẫn bị khóa vì Search Console chưa có bằng chứng cần sửa. ${decision.reason}`
        : `Mục “${field}” của trang đã index đang được bảo vệ. ${decision.reason}`,
    }];
  });
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

function uniqueVerifiedKeywords(values: unknown[], limit = 6): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const keyword = plainText(value, 160);
    const normalized = normalizeKeyword(keyword);
    if (!keyword || !normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [keyword];
  }).slice(0, limit);
}

function buildVerifiedKeywordPlan(
  movie: Record<string, unknown>,
  requestedFocus?: string,
  observedQueries: unknown[] = [],
): VerifiedKeywordPlan {
  const clusters = buildSeoIntentMap(movie, requestedFocus, observedQueries);
  const focus = clusters.primary;
  const secondary = uniqueVerifiedKeywords([
    ...clusters.aliases.filter((value) => normalizeKeyword(value) !== normalizeKeyword(focus)),
    ...clusters.watch,
    ...clusters.entities,
    ...clusters.topics,
    ...clusters.demand,
  ], 12);
  return {
    focus_keyword: focus,
    secondary_keywords: secondary,
    lifecycle: 'watch',
    allowed_intents: ['xem phim', 'vietsub', 'thuyết minh', 'full', 'nội dung phim', 'diễn viên', 'đạo diễn', 'thể loại', 'quốc gia'],
    clusters,
  };
}

function applyVerifiedKeywordPlan(payload: SeoPayload, plan: VerifiedKeywordPlan): SeoPayload {
  const focus = plainText(payload.focus_keyword, 160) || plan.focus_keyword;
  const existing = cleanStringList(payload.secondary_keywords, 12, 160)
    .filter((keyword) => normalizeKeyword(keyword) !== normalizeKeyword(focus));
  return {
    ...payload,
    focus_keyword: focus,
    secondary_keywords: uniqueVerifiedKeywords([...plan.secondary_keywords, ...existing], 12),
  };
}

function baselinePayload(movie: Record<string, unknown>, profile: Record<string, unknown> | null, review: Record<string, unknown> | null): SeoPayload {
  const slug = text(movie.slug, 180).toLowerCase();
  const keywordPlan = buildVerifiedKeywordPlan(movie, profile?.focus_keyword ? String(profile.focus_keyword) : '');
  return cleanPayload({
    movie_id: movie.id,
    slug,
    focus_keyword: profile?.focus_keyword || keywordPlan.focus_keyword,
    secondary_keywords: profile?.secondary_keywords || keywordPlan.secondary_keywords,
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

type PublicHtmlProbe = {
  ok: boolean;
  status: number;
  path: string;
};

function sitemapLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi), (match) => decodeHtml(match[1] || '').trim()).filter(Boolean);
}

async function publicMoviePathsFromSitemaps(): Promise<Set<string>> {
  const moviePaths = new Set<string>();
  try {
    const indexResponse = await fetch('https://khophim.org/sitemap.xml', {
      headers: {
        Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5',
        'Cache-Control': 'no-cache',
        'User-Agent': 'KhoPhim-SEO-Studio-Link-Selector/1.0',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (indexResponse.status !== 200) return moviePaths;
    const indexXml = await indexResponse.text();
    const sitemapUrls = sitemapLocs(indexXml).flatMap((value) => {
      const parsed = publicHttpsUrl(value);
      return parsed && parsed.origin === 'https://khophim.org' && parsed.pathname.endsWith('.xml') ? [parsed] : [];
    }).slice(0, 16);
    const sitemapBodies = await Promise.all(sitemapUrls.map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5',
            'Cache-Control': 'no-cache',
            'User-Agent': 'KhoPhim-SEO-Studio-Link-Selector/1.0',
          },
          signal: AbortSignal.timeout(7000),
        });
        return response.status === 200 ? await response.text() : '';
      } catch {
        return '';
      }
    }));
    for (const xml of sitemapBodies) {
      for (const value of sitemapLocs(xml)) {
        const parsed = publicHttpsUrl(value);
        if (!parsed || parsed.origin !== 'https://khophim.org') continue;
        const path = parsed.pathname.replace(/\/$/, '');
        if (/^\/phim\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) moviePaths.add(path);
      }
    }
  } catch {
    // Fail closed: an unavailable sitemap must never make an unverified URL eligible for AI linking.
  }
  return moviePaths;
}

async function probePublicIndexableHtmlPath(pathValue: string, timeoutMs = 7000): Promise<PublicHtmlProbe> {
  const path = safeTopicUrl(pathValue).replace(/[?#].*$/, '').replace(/\/$/, '');
  if (!path || !path.startsWith('/')) return { ok: false, status: 0, path };
  const expected = new URL(path, 'https://khophim.org');
  try {
    const response = await fetch(expected, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Cache-Control': 'no-cache',
        'User-Agent': 'KhoPhim-SEO-Studio-Link-Selector/1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = response.headers.get('content-type') || '';
    const html = response.status === 200 && /text\/html|application\/xhtml\+xml/i.test(contentType)
      ? (await response.text()).slice(0, 65_536)
      : '';
    const robots = htmlValue(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)
      || htmlValue(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i);
    const canonicalValue = htmlValue(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
      || htmlValue(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    const canonical = canonicalValue ? new URL(canonicalValue, expected) : null;
    const finalUrl = new URL(response.url || expected.toString());
    const ok = response.status === 200
      && Boolean(html)
      && finalUrl.origin === expected.origin
      && finalUrl.pathname.replace(/\/$/, '') === path
      && canonical?.origin === expected.origin
      && canonical?.pathname.replace(/\/$/, '') === path
      && !/(?:^|,)\s*noindex\b/i.test(robots);
    return { ok, status: response.status, path };
  } catch {
    return { ok: false, status: 0, path };
  }
}

async function verifiedPublicRelatedMovies(
  candidates: Array<Record<string, unknown>>,
  publicMoviePaths: Set<string>,
): Promise<Array<Record<string, unknown>>> {
  const shortlisted = candidates.filter((item) => publicMoviePaths.has(`/phim/${text(item.slug, 180)}`)).slice(0, 16);
  const probes = await Promise.all(shortlisted.map((item) => probePublicIndexableHtmlPath(`/phim/${text(item.slug, 180)}`)));
  return shortlisted.filter((_item, index) => probes[index]?.ok).slice(0, 8);
}

async function verifiedExistingTopicLinks(links: TopicLink[]): Promise<TopicLink[]> {
  const limited = links.slice(0, 12);
  const probes = await Promise.all(limited.map((item) => probePublicIndexableHtmlPath(item.url)));
  return limited.filter((_item, index) => probes[index]?.ok);
}

async function seoWorkerStatus(): Promise<{ online: boolean; status: number; checked_at: string }> {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(`https://khophim.org/api/time?seo_studio_health=${Date.now()}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(5000),
    });
    const body = response.status === 200 ? await response.json().catch(() => null) : null;
    return {
      online: response.status === 200 && Boolean(body && typeof body === 'object' && 'now' in body),
      status: response.status,
      checked_at: checkedAt,
    };
  } catch {
    return { online: false, status: 0, checked_at: checkedAt };
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
  const score = Math.min(base.score, Math.max(0, Math.min(100, 100 - errorCount * 14 - warningCount * 3)));
  if (errorCount === 0) unique.push({
    code: 'ready',
    severity: 'success',
    section: 'technical',
    message: score >= 85 ? 'Nội dung và tài nguyên đã qua cổng xuất bản.' : 'Không có lỗi chặn; nên xử lý thêm cảnh báo.',
  });
  return { score, issues: unique };
}

function mergeQualityV2(base: ReturnType<typeof validate>, quality: SeoQualityV2Result): ReturnType<typeof validate> {
  const merged = mergeValidation(base, quality.issues as ValidationIssue[]);
  const score = Math.min(merged.score, quality.score);
  const issues = merged.issues.filter((item) => item.code !== 'ready');
  if (!issues.some((item) => item.severity === 'error')) {
    issues.push({
      code: 'ready',
      severity: 'success',
      section: 'technical',
      message: score >= 85
        ? `Nội dung đạt cổng SEO V${quality.rules_version}; tiếp tục kiểm tra trang thật trước khi xuất bản.`
        : `Không có lỗi kỹ thuật chặn nhưng chất lượng V${quality.rules_version} mới đạt ${score}/100.`,
    });
  }
  return { score, issues };
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

const AI_EDITOR_INSTRUCTIONS = [
  'Bạn là biên tập viên SEO phim tiếng Việt của KhoPhim.',
  'Chỉ dùng dữ kiện có trong TRUSTED_CONTEXT. Không suy đoán nguồn phát, ngày chiếu, cốt truyện, diễn viên, đạo diễn hoặc mức độ nổi tiếng.',
  'Không tự chấm điểm, không dùng lời quảng cáo cảm tính như hay nhất, đỉnh, siêu hay; không nhồi từ khóa và không sao chép mô tả.',
  'TRUSTED_CONTEXT có keyword_plan đã xác minh theo các cụm aliases, watch, entities, topics và demand. Mọi trang phim của KhoPhim được tối ưu theo ý định xem phim ngay. Dùng đúng một từ khóa chính, chọn tối đa 12 từ khóa liên quan không trùng nhau từ keyword_plan, và phân bổ tự nhiên các biến thể tên phim vào SEO Title, Meta Description, giới thiệu và FAQ.',
  'Luôn ưu tiên các cụm “xem phim”, “vietsub”, “thuyết minh” hoặc “full” từ keyword_plan; không dùng các cụm “trailer”, “sắp chiếu”, “lịch chiếu”, “chưa có tập” hay “chưa có nguồn”. Tuy nhiên không tự bịa số tập, máy chủ, chất lượng video hoặc ngày phát hành.',
  'Mục tiêu là nội dung tự nhiên, hữu ích, phân biệt rõ phim và đáp ứng đúng ý định tìm kiếm. Phải phủ ít nhất một cụm watch và một cụm topics hoặc demand khi dữ kiện cho phép; không được nhét tất cả cụm vào cùng một đoạn.',
  'Giữ nguyên trường đang tốt khi không có lý do cụ thể để sửa. Tuyệt đối không đề xuất thay đổi slug, canonical, index_mode hoặc movie_patch.',
  'Liên kết nội bộ chỉ được chọn nguyên văn từ related_movies. Nếu dữ kiện không đủ, giữ nội dung hiện tại và nêu cảnh báo.',
  'Phải xử lý hết cả lỗi và cảnh báo trong current_validation thuộc các trường được phép sửa. Meta Description phải từ 100 đến 160 ký tự và kết thúc thành câu hoàn chỉnh. SEO Title nên từ 32 đến 68 ký tự.',
  'Nếu sửa intro_content, viết tối thiểu 120 từ hữu ích. Nếu review_content đang thiếu hoặc dưới 300 từ, bắt buộc viết 380–520 từ chia thành ít nhất 4 đoạn: nhận diện phim, ngữ cảnh nội dung đã được công khai, điều người xem nên kiểm tra trước khi xem, và kết luận biên tập không cảm tính. Review phải dùng dữ kiện đã cho, không tự thêm tình tiết, không chấm điểm; chọn từ 2 đến 6 liên kết thật sự liên quan.',
  'Không được tuyên bố hoàn thành nếu vẫn còn lỗi hoặc cảnh báo có thể sửa. Nếu dữ kiện không đủ để viết an toàn, nêu rõ trong warnings thay vì kéo dài hoặc suy đoán.',
  'Mỗi dữ kiện quan trọng phải có evidence trỏ tới một source_url đã xuất hiện trong TRUSTED_CONTEXT.',
].join(' ');

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

function extractGeminiText(value: unknown): string {
  const response = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    const row = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
    const content = row.content && typeof row.content === 'object' ? row.content as Record<string, unknown> : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    for (const part of parts) {
      const item = part && typeof part === 'object' ? part as Record<string, unknown> : {};
      if (typeof item.text === 'string') return item.text;
    }
  }
  return '';
}

function fallbackAiSuggestion(
  baseline: SeoPayload,
  relatedMovies: Array<Record<string, unknown>>,
  keywordPlan: VerifiedKeywordPlan,
): AiSeoSuggestion {
  const moviePatch = baseline.movie_patch || {};
  const name = plainText(moviePatch.name, 120) || plainText(baseline.focus_keyword, 120) || 'Phim';
  const originName = plainText(moviePatch.origin_name, 120);
  const year = Number(moviePatch.year || 0);
  const directors = cleanStringList(moviePatch.director, 4, 120);
  const actors = cleanStringList(moviePatch.actor, 5, 120);
  const categories = cleanTaxonomy(moviePatch.category).map((item) => item.name).slice(0, 4);
  const countries = cleanTaxonomy(moviePatch.country).map((item) => item.name).slice(0, 3);
  let intro = plainText(baseline.intro_content, 12_000);
  if (wordCount(intro) < 70) {
    const verifiedFacts = [
      year ? `phát hành năm ${year}` : '',
      categories.length ? `thuộc nhóm ${categories.join(', ')}` : '',
      countries.length ? `có thông tin sản xuất liên quan tới ${countries.join(', ')}` : '',
      directors.length ? `do ${directors.join(', ')} đạo diễn` : '',
      actors.length ? `với các diễn viên ${actors.join(', ')}` : '',
    ].filter(Boolean).join(', ');
    intro = plainText(`${intro} ${name}${originName && originName !== name ? ` (${originName})` : ''} ${verifiedFacts}. Trang này tổng hợp nội dung, thông tin đoàn phim và tình trạng phát hành từ dữ liệu đã xác minh của KhoPhim; các chi tiết mới sẽ được cập nhật trên cùng URL khi nguồn chính thức thay đổi.`, 12_000);
  }
  const description = plainText(`Xem phim ${name}${originName && originName !== name ? ` (${originName})` : ''}${year ? ` (${year})` : ''} vietsub, thuyết minh và thông tin nội dung, diễn viên tại KhoPhim.`, 320);
  const existingLinks = baseline.topic_links || [];
  const topicLinks = existingLinks.length >= 2 ? existingLinks : relatedMovies.slice(0, 4).map((movie) => ({
    title: plainText(movie.name, 180),
    url: `/phim/${text(movie.slug, 180)}`,
    anchor: `Xem thông tin ${plainText(movie.name, 150)}`,
    description: movie.year ? `Phim liên quan phát hành năm ${Number(movie.year)}.` : 'Phim có chủ đề liên quan trên KhoPhim.',
  }));
  return {
    summary: 'Hệ thống dự phòng đã bổ sung phần còn thiếu bằng dữ kiện phim đã xác minh, kế hoạch từ khóa xem phim thống nhất và liên kết nội bộ có sẵn.',
    patch: {
      ...aiPatchFromSuggestion(baseline, baseline),
      secondary_keywords: uniqueVerifiedKeywords([...(baseline.secondary_keywords || []), ...keywordPlan.secondary_keywords], 12),
      meta_description: description,
      intro_content: intro,
      topic_links: topicLinks,
    },
    evidence: topicLinks.map((link) => ({
      field: 'topic_links',
      fact: `Trang liên quan có sẵn: ${link.title}.`,
      source_url: `https://khophim.org${link.url}`,
      confidence: 'high',
    })),
    warnings: ['Đang dùng bản nháp dự phòng dựa trên dữ kiện xác minh; phần nhận xét chuyên sâu không được tự tạo khi AI không phản hồi.'],
    preserved_fields: ['slug', 'canonical_path', 'index_mode', 'movie_patch'],
  };
}

function normalizeAiSuggestion(baseline: SeoPayload, parsed: Record<string, unknown>): AiSeoSuggestion {
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

async function requestOpenAiSuggestion(input: Record<string, unknown>, baseline: SeoPayload): Promise<AiSeoSuggestion> {
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
      instructions: AI_EDITOR_INSTRUCTIONS,
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
  return normalizeAiSuggestion(baseline, JSON.parse(outputText) as Record<string, unknown>);
}

async function requestGeminiSuggestion(input: Record<string, unknown>, baseline: SeoPayload): Promise<AiSeoSuggestion> {
  const deepMode = input.mode === 'deep';
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: AI_EDITOR_INSTRUCTIONS }] },
    contents: [{ role: 'user', parts: [{ text: `TRUSTED_CONTEXT\n${JSON.stringify(input)}` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: AI_SUGGESTION_SCHEMA,
      maxOutputTokens: deepMode ? 6000 : 3000,
      temperature: 0.25,
    },
  });
  let lastError = 'Gemini tạm thời chưa phản hồi.';
  const modelCandidates = Array.from(new Set(deepMode
    ? [GEMINI_MODEL, GEMINI_FAST_MODEL]
    : [GEMINI_FAST_MODEL, GEMINI_FALLBACK_MODEL]));
  for (const model of modelCandidates) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': GEMINI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: requestBody,
        signal: AbortSignal.timeout(deepMode ? 40000 : 25000),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (response.ok) {
        const outputText = extractGeminiText(responseBody);
        if (!outputText) throw new Error('Gemini không trả về bản đề xuất có cấu trúc.');
        return normalizeAiSuggestion(baseline, JSON.parse(outputText) as Record<string, unknown>);
      }
      const row = responseBody && typeof responseBody === 'object' ? responseBody as Record<string, unknown> : {};
      const apiError = row.error && typeof row.error === 'object' ? row.error as Record<string, unknown> : {};
      lastError = plainText(apiError.message, 500) || `Gemini API error ${response.status}`;
      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      if (!retryable) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error(`Gemini đang bận sau ${modelCandidates.length} model. ${lastError}`);
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

async function inspectPublicDiscovery(payload: SeoPayload, expectedVersion: number | string): Promise<LiveAuditResult> {
  const publicUrl = `https://khophim.org/phim/${encodeURIComponent(payload.slug)}`;
  const expectedCanonical = `https://khophim.org/phim/${payload.slug}`;
  const expectedIndex = payload.index_mode === 'index';
  const checks: LiveAuditCheck[] = [];
  let status = 0;
  let html = '';
  let canonical = '';
  let marker = '';
  let robots = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${publicUrl}?seo_profile_check=${encodeURIComponent(String(expectedVersion))}&attempt=${attempt}`, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Googlebot',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(10_000),
      });
      status = response.status;
      html = await response.text();
      canonical = htmlValue(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)
        || htmlValue(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i);
      marker = htmlValue(html, /data-kp-seo-profile-version=["']([^"']+)["']/i);
      robots = `${htmlValue(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["'][^>]*>/i)}`.toLowerCase();
      const robotsReady = expectedIndex
        ? robots.includes('index') && !robots.includes('noindex')
        : robots.includes('noindex');
      if (status === 200 && marker === String(expectedVersion) && canonical === expectedCanonical && robotsReady) break;
    } catch {
      status = 0;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  checks.push(
    { code: 'public_http_200', passed: status === 200, message: status === 200 ? 'URL công khai trả HTTP 200 cho Googlebot.' : `URL công khai trả HTTP ${status || 'lỗi mạng'}.`, value: status },
    { code: 'public_profile_version', passed: marker === String(expectedVersion), message: marker === String(expectedVersion) ? `URL công khai nhận hồ sơ phiên bản ${marker}.` : `URL công khai chưa nhận hồ sơ phiên bản ${String(expectedVersion)}.`, value: marker },
    { code: 'public_canonical', passed: canonical === expectedCanonical, message: canonical === expectedCanonical ? 'Canonical công khai chính xác.' : `Canonical công khai: ${canonical || 'không có'}.`, value: canonical },
    expectedIndex
      ? { code: 'public_robots_index', passed: robots.includes('index') && !robots.includes('noindex'), message: robots.includes('index') && !robots.includes('noindex') ? 'URL công khai cho phép Google index.' : `Robots công khai: ${robots || 'không có'}.`, value: robots }
      : { code: 'public_robots_noindex', passed: robots.includes('noindex'), message: robots.includes('noindex') ? 'URL công khai giữ noindex đúng yêu cầu.' : `Robots công khai: ${robots || 'không có'}.`, value: robots },
  );

  let sitemapStatus = 0;
  let sitemapXml = '';
  let sitemapContainsUrl = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const freshToken = `${String(expectedVersion)}-${attempt}`;
      const sitemapResponse = await fetch(`https://khophim.org/sitemap-seo-studio.xml?fresh=${encodeURIComponent(freshToken)}`, {
        headers: {
          Accept: 'application/xml',
          'User-Agent': 'KhoPhim-SEO-Studio-Auditor/1.0',
          'X-KhoPhim-SEO-Inspect-Secret': SEO_INSPECT_SECRET,
        },
        signal: AbortSignal.timeout(10_000),
      });
      sitemapStatus = sitemapResponse.status;
      sitemapXml = await sitemapResponse.text();
      sitemapContainsUrl = sitemapXml.includes(`<loc>${expectedCanonical}</loc>`);
      const sitemapReady = sitemapStatus === 200 && (expectedIndex ? sitemapContainsUrl : !sitemapContainsUrl);
      if (sitemapReady) break;
    } catch {
      sitemapStatus = 0;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  checks.push(
    { code: 'public_sitemap_http', passed: sitemapStatus === 200, message: sitemapStatus === 200 ? 'Sitemap SEO Studio trả HTTP 200.' : `Sitemap SEO Studio trả HTTP ${sitemapStatus || 'lỗi mạng'}.`, value: sitemapStatus },
    expectedIndex
      ? { code: 'public_sitemap_membership', passed: sitemapContainsUrl, message: sitemapContainsUrl ? 'URL đã xuất hiện trong sitemap SEO Studio.' : 'URL chưa xuất hiện trong sitemap SEO Studio.' }
      : { code: 'public_sitemap_exclusion', passed: !sitemapContainsUrl, message: !sitemapContainsUrl ? 'URL noindex không bị đưa vào sitemap SEO Studio.' : 'URL noindex vẫn đang có trong sitemap SEO Studio.' },
  );
  return {
    passed: checks.every((check) => check.passed),
    checked_at: new Date().toISOString(),
    url: publicUrl,
    status,
    checks,
  };
}

function releaseForProfile(rows: unknown, version: number): Record<string, unknown> | null {
  const releases = Array.isArray(rows)
    ? rows.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  return releases.find((item) => Number(item.requested_version || 0) === version && String(item.reason || '').startsWith('seo_profile_'))
    ?? releases.find((item) => Number(item.requested_version || 0) === version)
    ?? releases[0]
    ?? null;
}

function indexingPipelineState(
  profile: Record<string, unknown> | null | undefined,
  release: Record<string, unknown> | null | undefined,
  inspection: Record<string, unknown> | null | undefined,
) {
  const verdict = String(inspection?.verdict || '');
  const coverage = String(inspection?.coverage_state || '');
  if (verdict === 'PASS') return { stage: 'indexed', label: 'Google đã lập chỉ mục', google_confirmed: true };
  if (inspection?.last_crawl_time) return { stage: 'crawled_not_indexed', label: 'Google đã crawl, chưa lập chỉ mục', google_confirmed: true };
  if (/discovered|phát hiện/i.test(coverage)) return { stage: 'discovered', label: 'Google đã phát hiện URL', google_confirmed: true };
  const releaseStatus = String(release?.status || '');
  if (releaseStatus === 'processing') return { stage: 'deploying', label: 'Cloudflare đang phát hành', google_confirmed: false };
  if (releaseStatus === 'pending') return { stage: 'scheduled', label: release?.release_lane === 'nightly' ? 'Đã xếp lịch phát hành 03:30' : 'Đang chờ phát hành ưu tiên', google_confirmed: false };
  const liveAudit = profile?.live_audit && typeof profile.live_audit === 'object' ? profile.live_audit as Record<string, unknown> : null;
  const checks = Array.isArray(liveAudit?.checks) ? liveAudit.checks as Array<Record<string, unknown>> : [];
  const inSitemap = checks.some((check) => check.code === 'public_sitemap_membership' && check.passed === true);
  if (profile?.status === 'published' && liveAudit?.passed === true && inSitemap) {
    return { stage: 'submitted_sitemap', label: 'Đã xuất bản và có trong sitemap; đang chờ Google', google_confirmed: false };
  }
  if (profile?.status === 'published') return { stage: 'published', label: 'Đã xuất bản; chưa có xác nhận từ Google', google_confirmed: false };
  return { stage: 'draft', label: 'Bản nháp nội bộ', google_confirmed: false };
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

    if (action === 'release_status') {
      const movieId = text(body.movie_id, 80);
      if (!movieId) return json({ error: 'Missing movie_id' }, 400, headers);
      const [profileResult, releaseResult, inspectionResult] = await Promise.all([
        db.from('movie_seo_profiles').select('status,index_mode,validation_score,version,live_audit,last_audited_at,published_at,updated_at').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_static_release_requests').select('reason,release_lane,status,requested_version,requested_at,processing_started_at,deployed_at,deployment_url,error_message').eq('movie_id', movieId).order('requested_at', { ascending: false }).limit(10),
        db.from('seo_url_inspections').select('verdict,coverage_state,indexing_state,page_fetch_state,user_canonical,google_canonical,last_crawl_time,inspected_at,recommendation').eq('movie_id', movieId).maybeSingle(),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (releaseResult.error) throw releaseResult.error;
      const profile = profileResult.data;
      const version = Number(profile?.version || 0);
      const staticRelease = releaseForProfile(releaseResult.data, version);
      const inspection = inspectionResult.error ? null : inspectionResult.data;
      return json({
        profile,
        static_release: staticRelease,
        inspection,
        google_indexed: inspectionResult.data?.verdict === 'PASS',
        indexing_pipeline: indexingPipelineState(profile as Record<string, unknown> | null, staticRelease, inspection as Record<string, unknown> | null),
      }, 200, headers);
    }

    if (action === 'retry_release') {
      const movieId = text(body.movie_id, 80);
      if (!movieId) return json({ error: 'Missing movie_id' }, 400, headers);
      const [profileResult, releaseResult] = await Promise.all([
        db.from('movie_seo_profiles').select('slug,status,index_mode,validation_score,version').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_static_release_requests').select('id,reason,release_lane,status,requested_version,requested_at').eq('movie_id', movieId).order('requested_at', { ascending: false }).limit(10),
      ]);
      if (profileResult.error || !profileResult.data) throw profileResult.error || new Error('SEO profile not found');
      if (releaseResult.error) throw releaseResult.error;
      const profile = profileResult.data;
      const version = Number(profile.version || 0);
      if (profile.status !== 'published' || profile.index_mode !== 'index' || Number(profile.validation_score || 0) < 85 || version < 1) {
        return json({ error: 'Hồ sơ chưa đủ điều kiện phát hành lại cho Google. Hãy xuất bản SEO một lần nữa.' }, 422, headers);
      }
      const selectedRelease = releaseForProfile(releaseResult.data, version);
      if (selectedRelease && ['pending', 'processing'].includes(String(selectedRelease.status || ''))) {
        return json({ error: 'Bản SEO này đã có một lượt phát hành đang chạy.' }, 409, headers);
      }
      const queuedAt = new Date().toISOString();
      const releaseLane = body.release_timing === 'nightly' ? 'nightly' : 'urgent';
      const releasePayload = {
        movie_id: movieId,
        slug: String(profile.slug || ''),
        reason: 'seo_profile_retry',
        release_lane: releaseLane,
        requested_version: version,
        status: 'pending',
        requested_at: queuedAt,
        processing_started_at: null,
        deployed_at: null,
        deployment_url: null,
        error_message: null,
        automatic_retry_count: 0,
        next_retry_at: null,
      };
      const retryResult = selectedRelease?.id
        ? await db.from('seo_static_release_requests').update(releasePayload).eq('id', selectedRelease.id)
        : await db.from('seo_static_release_requests').insert(releasePayload);
      if (retryResult.error) throw retryResult.error;
      return json({ success: true, static_release: { status: 'pending', release_lane: releaseLane, requested_version: version, requested_at: queuedAt } }, 202, headers);
    }

    if (action === 'load') {
      const movieId = text(body.movie_id, 80);
      if (!movieId) return json({ error: 'Missing movie_id' }, 400, headers);
      const [movieResult, profileResult, reviewResult, qualityResult, draftResult, workItemResult, inspectionResult, metricResult, queryMetricResult, releaseResult] = await Promise.all([
        db.from('movies').select('id,slug,name,origin_name,title_vi,title_en,title_original,normalized_name,content,year,type,status,seo_catalog_status,episode_current,current_episode,release_at,quality,lang,trailer_url,thumb_url,poster_url,actor,director,category,country,tmdb_id,tmdb_media_type,imdb_id,source_site,source_name,is_published,updated_at').eq('id', movieId).maybeSingle(),
        db.from('movie_seo_profiles').select('*').eq('movie_id', movieId).maybeSingle(),
        db.from('movie_reviews').select('content,word_count,generated_at,updated_at').eq('slug', text(body.slug, 180)).maybeSingle(),
        db.from('movie_seo_quality_status').select('eligible_for_index,index_tier,quality_score,reasons,signals,checked_at').eq('movie_id', movieId).maybeSingle(),
        db.from('movie_seo_profile_drafts').select('payload,baseline_version,unlocked_fields,validation_score,validation_issues,updated_at').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_work_items').select('task_type,status,priority_score,urgency,reason,required_fields,evidence,due_at,updated_at').eq('movie_id', movieId).in('status', ['pending', 'in_progress']).order('priority_score', { ascending: false }).limit(1).maybeSingle(),
        db.from('seo_url_inspections').select('verdict,coverage_state,indexing_state,page_fetch_state,user_canonical,google_canonical,last_crawl_time,inspected_at,recommendation').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_search_metrics').select('clicks,impressions,ctr,position,date_start,date_end,collected_at').eq('dimension_type', 'page').ilike('dimension_value', `%/phim/${text(body.slug, 180)}%`).order('collected_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('seo_query_page_metrics').select('query,clicks,impressions,ctr,position,date_start,date_end,collected_at').ilike('page', `%/phim/${text(body.slug, 180)}%`).order('collected_at', { ascending: false }).order('impressions', { ascending: false }).limit(20),
        db.from('seo_static_release_requests').select('reason,release_lane,status,requested_version,requested_at,processing_started_at,deployed_at,deployment_url,error_message').eq('movie_id', movieId).order('requested_at', { ascending: false }).limit(10),
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
      const observedQueries = (queryMetricResult.error ? [] : queryMetricResult.data ?? []).map((item) => String((item as Record<string, unknown>).query || '')).filter(Boolean);
      const baselineQualityV2 = evaluateSeoQualityV2(baseline, movie, observedQueries);
      const baselineValidation = mergeQualityV2(validate(baseline), baselineQualityV2);
      const indexedDecision = buildIndexedSeoDecision({
        slug:String(movie.slug || ''),
        aliases:baselineQualityV2.intent_map.aliases,
        profileUpdatedAt:profile?.updated_at,
        inspection:inspectionResult.error ? null : inspectionResult.data as Record<string, unknown> | null,
        pageMetric:metricResult.error ? null : metricResult.data as Record<string, unknown> | null,
        queryMetrics:queryMetricResult.error ? [] : (queryMetricResult.data ?? []) as Array<Record<string, unknown>>,
      });
      const baselineVersion = Number(profile?.version || 0);
      const staticRelease = releaseForProfile(releaseResult.error ? [] : releaseResult.data, baselineVersion);
      const serverDraft = draftResult.data && Number(draftResult.data.baseline_version || 0) === baselineVersion
        ? draftResult.data
        : null;
      const suggestedTitle = `${movie.name}${movie.year ? ` (${movie.year})` : ''} – Thông Tin Phim | KhoPhim`;
      const suggestedDescription = `${movie.name}${movie.origin_name ? ` (${movie.origin_name})` : ''} – nội dung, diễn viên, trailer, lịch phát hành và thông tin cập nhật tại KhoPhim.`;
      // Static-only publishing deliberately does not depend on Pages
      // Functions.  Do not report the optional Worker health route as a
      // failure when the active publisher is the verified static pipeline.
      const workerStatus = SEO_PUBLISH_MODE === 'worker'
        ? { ...await seoWorkerStatus(), required: true, mode: 'worker' as const }
        : { online: true, status: 200, checked_at: new Date().toISOString(), required: false, mode: 'static' as const };
      return json({
        movie,
        profile: profileResult.data,
        review: reviewResult.data,
        quality: qualityResult.data,
        quality_v2: baselineQualityV2,
        indexed_decision: indexedDecision,
        ai_available: Boolean(GEMINI_API_KEY || OPENAI_API_KEY),
        ai_provider: GEMINI_API_KEY ? 'gemini' : OPENAI_API_KEY ? 'openai' : null,
        publish_mode: SEO_PUBLISH_MODE,
        static_release: staticRelease,
        indexing_pipeline: indexingPipelineState(profile, staticRelease, inspectionResult.error ? null : inspectionResult.data as Record<string, unknown> | null),
        worker_status: workerStatus,
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
          fields: applyIndexedDecisionToFieldStates(
            fieldStates(baseline, baselineValidation, profile?.status === 'published'),
            indexedDecision,
          ),
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
        db.from('movies').select('id,slug,name,origin_name,title_vi,title_en,title_original,normalized_name,content,year,type,status,seo_catalog_status,episode_current,current_episode,release_at,quality,lang,trailer_url,thumb_url,poster_url,actor,director,category,country,tmdb_id,tmdb_media_type,imdb_id,source_site,source_name,is_published,updated_at').eq('id', movieId).maybeSingle(),
        db.from('movie_seo_profiles').select('*').eq('movie_id', movieId).maybeSingle(),
        db.from('movie_reviews').select('content,word_count,generated_at,updated_at').eq('slug', slug).maybeSingle(),
        db.from('movie_seo_quality_status').select('eligible_for_index,index_tier,quality_score,reasons,signals,checked_at').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_work_items').select('task_type,status,priority_score,urgency,reason,required_fields,evidence,due_at,updated_at').eq('movie_id', movieId).in('status', ['pending', 'in_progress']).order('priority_score', { ascending: false }).limit(1).maybeSingle(),
        db.from('seo_url_inspections').select('verdict,coverage_state,indexing_state,page_fetch_state,user_canonical,google_canonical,last_crawl_time,inspected_at,recommendation').eq('movie_id', movieId).maybeSingle(),
        db.from('seo_search_metrics').select('clicks,impressions,ctr,position,date_start,date_end,collected_at').eq('dimension_type', 'page').ilike('dimension_value', `%/phim/${slug}%`).order('collected_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('seo_query_page_metrics').select('query,clicks,impressions,ctr,position,date_start,date_end,collected_at').ilike('page', `%/phim/${slug}%`).order('collected_at', { ascending: false }).order('impressions', { ascending: false }).limit(mode === 'deep' ? 30 : 12),
        db.from('movies').select('id,slug,name,origin_name,year,category,country').eq('is_published', true).neq('id', movieId).order('updated_at', { ascending: false }).limit(mode === 'deep' ? 300 : 150),
      ]);
      if (movieResult.error || !movieResult.data) throw movieResult.error || new Error('Movie not found');
      if (text(movieResult.data.slug, 180).toLowerCase() !== slug) return json({ error: 'Movie identity mismatch' }, 409, headers);
      if (profileResult.error) throw profileResult.error;
      const movie = movieResult.data as Record<string, unknown>;
      const profile = profileResult.data && typeof profileResult.data === 'object' ? profileResult.data as Record<string, unknown> : null;
      const review = reviewResult.data && typeof reviewResult.data === 'object' ? reviewResult.data as Record<string, unknown> : null;
      const baseline = baselinePayload(movie, profile, review);
      const submittedDraft = body.payload && typeof body.payload === 'object' ? cleanPayload(body.payload) : null;
      let workingBaseline = submittedDraft && submittedDraft.movie_id === movieId && submittedDraft.slug === slug
        ? cleanPayload({
          ...submittedDraft,
          movie_id: movieId,
          slug,
          canonical_path: `/phim/${slug}`,
          movie_patch: baseline.movie_patch,
        })
        : baseline;
      if (plainText(baseline.focus_keyword, 160)
        && plainText(workingBaseline.focus_keyword, 160) !== plainText(baseline.focus_keyword, 160)) {
        // Drafts created by older AI versions can carry a case-only or wording
        // change to a locked focus phrase. Suggestions always start from the
        // canonical focus phrase so they do not recreate a publish blocker.
        workingBaseline = cleanPayload({ ...workingBaseline, focus_keyword: baseline.focus_keyword });
      }
      const factInput = {
        ...movie,
        ...workingBaseline.movie_patch,
        content: workingBaseline.intro_content,
      };
      const factEnrichment = await verifiedMovieFactEnrichment(db, factInput);
      const { content: verifiedContent, ...verifiedMovieFields } = factEnrichment.patch;
      const verifiedWorkingBaseline = cleanPayload({
        ...workingBaseline,
        intro_content: verifiedContent || workingBaseline.intro_content,
        movie_patch: { ...workingBaseline.movie_patch, ...verifiedMovieFields },
      });
      const movieCategories = new Set(cleanTaxonomy(verifiedWorkingBaseline.movie_patch?.category).map((item) => item.slug));
      const movieCountries = new Set(cleanTaxonomy(verifiedWorkingBaseline.movie_patch?.country).map((item) => item.slug));
      const rankedRelatedMovies = (relatedResult.data ?? []).map((item) => {
        const row = item as Record<string, unknown>;
        const categoryOverlap = cleanTaxonomy(row.category).filter((entry) => movieCategories.has(entry.slug)).length;
        const countryOverlap = cleanTaxonomy(row.country).filter((entry) => movieCountries.has(entry.slug)).length;
        const yearDistance = Math.abs(Number(row.year || 0) - Number(movie.year || 0));
        return { ...row, relevance_score: categoryOverlap * 5 + countryOverlap * 2 + (yearDistance <= 2 ? 1 : 0) };
      }).filter((item) => Number(item.relevance_score) > 0).sort((a, b) => Number(b.relevance_score) - Number(a.relevance_score));
      const [publicMoviePaths, existingTopicLinks] = await Promise.all([
        publicMoviePathsFromSitemaps(),
        verifiedExistingTopicLinks(verifiedWorkingBaseline.topic_links || []),
      ]);
      const relatedMovies = await verifiedPublicRelatedMovies(rankedRelatedMovies, publicMoviePaths);
        const assistantBaseline = cleanPayload(applyDeterministicEditorialConstraints({ ...verifiedWorkingBaseline, topic_links: existingTopicLinks }));
        const observedQueries = (queryMetricResult.error ? [] : queryMetricResult.data ?? [])
          .map((item) => String((item as Record<string, unknown>).query || ''))
          .filter(Boolean);
        const keywordPlan = buildVerifiedKeywordPlan(movie, assistantBaseline.focus_keyword, observedQueries);
        const assistantQualityV2 = evaluateSeoQualityV2(assistantBaseline, movie, observedQueries);
        const assistantValidation = mergeQualityV2(validate(assistantBaseline), assistantQualityV2);
        const indexedDecision = buildIndexedSeoDecision({
          slug,
          aliases:assistantQualityV2.intent_map.aliases,
          profileUpdatedAt:profile?.updated_at,
          inspection:inspectionResult.error ? null : inspectionResult.data as Record<string, unknown> | null,
          pageMetric:metricResult.error ? null : metricResult.data as Record<string, unknown> | null,
          queryMetrics:queryMetricResult.error ? [] : (queryMetricResult.data ?? []) as Array<Record<string, unknown>>,
        });
        const indexedAllowedFields = new Set(AI_EDITABLE_FIELDS.filter((field) =>
          !indexedDecision.indexed
          || !indexedDecision.protected_fields.includes(field)
          || indexedDecision.editable_fields.includes(field)));
        const trustedContext = {
        mode,
        page_url: `https://khophim.org/phim/${slug}`,
        current_profile: {
          ...aiPatchFromSuggestion(assistantBaseline, assistantBaseline),
          intro_content: plainText(assistantBaseline.intro_content, mode === 'deep' ? 9000 : 4500),
          review_content: plainText(assistantBaseline.review_content, mode === 'deep' ? 18000 : 8000),
        },
        current_validation: assistantValidation,
        protected_fields: applyIndexedDecisionToFieldStates(
          fieldStates(assistantBaseline, assistantValidation, profile?.status === 'published'),
          indexedDecision,
        ),
        indexed_page_guard: indexedDecision,
        movie_facts: {
          name: assistantBaseline.movie_patch?.name,
          title_vi: assistantBaseline.movie_patch?.title_vi,
          title_en: assistantBaseline.movie_patch?.title_en,
          origin_name: assistantBaseline.movie_patch?.origin_name,
          synopsis: plainText(assistantBaseline.intro_content, mode === 'deep' ? 9000 : 4500),
          year: assistantBaseline.movie_patch?.year,
          quality: assistantBaseline.movie_patch?.quality,
          language: assistantBaseline.movie_patch?.lang,
          trailer_url: assistantBaseline.movie_patch?.trailer_url,
          actors: assistantBaseline.movie_patch?.actor,
          directors: assistantBaseline.movie_patch?.director,
          categories: assistantBaseline.movie_patch?.category,
          countries: assistantBaseline.movie_patch?.country,
          source_url: `https://khophim.org/phim/${slug}`,
        },
        keyword_plan: keywordPlan,
        verified_fact_enrichment: factEnrichment,
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
      const aiProvider = GEMINI_API_KEY ? 'gemini' : OPENAI_API_KEY ? 'openai' : null;
      let suggestion: AiSeoSuggestion;
      let aiGenerationSucceeded = false;
      if (GEMINI_API_KEY) {
        try {
          suggestion = await requestGeminiSuggestion(trustedContext, assistantBaseline);
          aiGenerationSucceeded = true;
        } catch (error) {
          suggestion = fallbackAiSuggestion(assistantBaseline, relatedMovies, keywordPlan);
          suggestion.warnings.unshift(error instanceof Error ? error.message : String(error));
        }
      } else if (OPENAI_API_KEY) {
        try {
          suggestion = await requestOpenAiSuggestion(trustedContext, assistantBaseline);
          aiGenerationSucceeded = true;
        } catch (error) {
          suggestion = fallbackAiSuggestion(assistantBaseline, relatedMovies, keywordPlan);
          suggestion.warnings.unshift(error instanceof Error ? error.message : String(error));
        }
      } else {
        suggestion = fallbackAiSuggestion(assistantBaseline, relatedMovies, keywordPlan);
      }
      const allowedEvidenceUrls = new Set([
        `https://khophim.org/phim/${slug}`,
        ...relatedMovies.map((item) => `https://khophim.org/phim/${item.slug}`),
      ]);
      const allowedTopicPaths = new Set([
        ...existingTopicLinks.map((item) => safeTopicUrl(item.url)),
        ...relatedMovies.map((item) => `/phim/${item.slug}`),
      ].filter(Boolean));
      const buildProposedPayload = (
        source: SeoPayload,
        candidate: AiSeoSuggestion,
        allowedFields?: Set<string>,
      ): SeoPayload => {
        const candidatePatch = {
          ...candidate.patch,
          topic_links: (candidate.patch.topic_links || []).filter((item) => allowedTopicPaths.has(safeTopicUrl(item.url))),
        };
        const selectedPatch = Object.fromEntries(AI_EDITABLE_FIELDS.map((field) => {
          // Focus keyword defines the page's established search intent. AI may
          // expand verified related terms, but it must never replace a focus
          // keyword that is already present and protected.
          if (field === 'focus_keyword' && plainText(source.focus_keyword, 160)) return [field, source.focus_keyword];
          return [field, allowedFields && !allowedFields.has(field) ? valueAt(source, field) : candidatePatch[field]];
        }));
        return ensureUsefulReview(cleanPayload(applyDeterministicEditorialConstraints(applyVerifiedKeywordPlan({
          ...source,
          ...selectedPatch,
          movie_patch: verifiedWorkingBaseline.movie_patch,
          slug,
          canonical_path: `/phim/${slug}`,
          index_mode: baseline.index_mode,
        }, keywordPlan))));
      };
      let proposed = buildProposedPayload(verifiedWorkingBaseline, suggestion, indexedAllowedFields);
      let proposedQualityV2 = evaluateSeoQualityV2(proposed, movie, observedQueries);
      let proposedValidation = mergeQualityV2(validate(proposed), proposedQualityV2);
      proposedValidation = mergeValidation(proposedValidation, await remoteValidationIssues(db, proposed));
      let repairedInSecondPass = false;
      const firstPassRemaining = repairableIssues(proposedValidation);
      if (aiGenerationSucceeded && firstPassRemaining.length > 0) {
        const repairFields = new Set(firstPassRemaining.flatMap((issue) => fieldsForIssue(issue.code))
          .filter((field) => AI_EDITABLE_FIELDS.includes(field as typeof AI_EDITABLE_FIELDS[number]) && indexedAllowedFields.has(field as typeof AI_EDITABLE_FIELDS[number])));
        const repairContext = {
          ...trustedContext,
          mode: 'deep',
          current_profile: aiPatchFromSuggestion(proposed, proposed),
          current_validation: proposedValidation,
          repair_pass: {
            required: true,
            issue_codes: firstPassRemaining.map((issue) => issue.code),
            editable_fields: Array.from(repairFields),
            instruction: 'Đây là lượt sửa cuối. Chỉ sửa editable_fields và phải xử lý hết các issue_codes nếu dữ kiện cho phép.',
          },
        };
        try {
          const repairedSuggestion = aiProvider === 'gemini'
            ? await requestGeminiSuggestion(repairContext, proposed)
            : await requestOpenAiSuggestion(repairContext, proposed);
          const repairedProposed = buildProposedPayload(proposed, repairedSuggestion, repairFields);
          const repairedQualityV2 = evaluateSeoQualityV2(repairedProposed, movie, observedQueries);
          let repairedValidation = mergeQualityV2(validate(repairedProposed), repairedQualityV2);
          repairedValidation = mergeValidation(repairedValidation, await remoteValidationIssues(db, repairedProposed));
          const repairedRemaining = repairableIssues(repairedValidation);
          if (repairedRemaining.length < firstPassRemaining.length || repairedValidation.score > proposedValidation.score) {
            proposed = repairedProposed;
            proposedValidation = repairedValidation;
            proposedQualityV2 = repairedQualityV2;
            repairedInSecondPass = true;
            suggestion = {
              ...repairedSuggestion,
              summary: `${suggestion.summary} Hệ thống đã chạy thêm một lượt tự kiểm tra và sửa các mục còn sót.`,
              evidence: [...suggestion.evidence, ...repairedSuggestion.evidence],
              warnings: [...suggestion.warnings, ...repairedSuggestion.warnings],
              preserved_fields: [...suggestion.preserved_fields, ...repairedSuggestion.preserved_fields],
            };
          } else {
            suggestion.warnings.push('Lượt sửa thứ hai không giảm được số lỗi/cảnh báo nên hệ thống giữ bản tốt hơn trước đó.');
          }
        } catch (error) {
          suggestion.warnings.push(`Lượt tự sửa thứ hai chưa hoàn tất: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const completion = assistantCompletion(proposedValidation, repairedInSecondPass);
      suggestion.warnings.push(...completion.limitations);
      const safeEvidence = suggestion.evidence.filter((item) => allowedEvidenceUrls.has(item.source_url));
      const editorialChangedFields = AI_EDITABLE_FIELDS.filter((field) => comparable(valueAt(workingBaseline, field)) !== comparable(valueAt(proposed, field)));
      const changedFields = Array.from(new Set([...factEnrichment.verified_fields, ...editorialChangedFields]));
      return json({
        ai_available: Boolean(aiProvider),
        provider: aiProvider,
        model: aiProvider === 'gemini' ? GEMINI_MODEL : aiProvider === 'openai' ? OPENAI_MODEL : null,
        mode,
        summary: suggestion.summary,
        proposed_payload: proposed,
        validation: proposedValidation,
        changed_fields: changedFields,
        evidence: safeEvidence,
        warnings: Array.from(new Set(suggestion.warnings.filter(Boolean))),
        completion,
        quality_v2: proposedQualityV2,
        indexed_decision: indexedDecision,
        fact_enrichment: factEnrichment,
        preserved_fields: Array.from(new Set([...suggestion.preserved_fields, 'slug', 'canonical_path', 'index_mode', 'movie_patch'])),
        generated_at: new Date().toISOString(),
      }, 200, headers);
    }

    if (action === 'validate') {
      const payload = cleanPayload(body.payload);
      const qualityV2 = evaluateSeoQualityV2(payload, { ...(payload.movie_patch || {}), content: payload.intro_content || '' });
      return json({ ...mergeQualityV2(validate(payload), qualityV2), quality_v2: qualityV2 }, 200, headers);
    }

    if (action === 'inspect') {
      const payload = cleanPayload(body.payload);
      const qualityV2 = evaluateSeoQualityV2(payload, { ...(payload.movie_patch || {}), content: payload.intro_content || '' });
      const validation = mergeValidation(mergeQualityV2(validate(payload), qualityV2), await remoteValidationIssues(db, payload));
      if (SEO_PUBLISH_MODE === 'static') {
        const blocking = validation.issues.filter((issue) => issue.severity === 'error' || INDEX_READINESS_CODES.has(issue.code));
        const checkedAt = new Date().toISOString();
        const liveAudit: LiveAuditResult = {
          passed: blocking.length === 0 && validation.score >= 85,
          checked_at: checkedAt,
          url: `https://khophim.org/phim/${payload.slug}`,
          status: 0,
          checks: [
            {
              code: 'static_preflight',
              passed: blocking.length === 0 && validation.score >= 85,
              message: blocking.length === 0 && validation.score >= 85
                ? 'Bản nháp đạt cổng phát hành tĩnh; trang công khai và sitemap sẽ được xác minh sau khi Pages build xong.'
                : `Còn ${blocking.length} mục phải hoàn thiện trước khi xếp hàng phát hành tĩnh.`,
              value: validation.score,
            },
          ],
        };
        return json({ validation, quality_v2: qualityV2, live_audit: liveAudit, publish_mode: SEO_PUBLISH_MODE }, 200, headers);
      }
      const liveAudit = await inspectLivePage(payload);
      const liveIssues = liveAudit.checks
        .filter((check) => !check.passed)
        .map((check) => ({
          code: `live_${check.code}`,
          severity: 'error' as const,
          section: 'technical' as const,
          message: check.message,
        }));
      return json({ validation: mergeValidation(validation, liveIssues), quality_v2: qualityV2, live_audit: liveAudit }, 200, headers);
    }

    if (action === 'save' || action === 'publish') {
      const payload = cleanPayload(body.payload);
      const safeEdit = readSafeEditInput(body);
      if (action === 'publish' && payload.index_mode === 'auto') {
        payload.index_mode = 'index';
        safeEdit.unlocked_fields = Array.from(new Set([...safeEdit.unlocked_fields, 'index_mode']));
      }
      let validation = validate(payload);
      if (!payload.movie_id || !payload.slug) return json({ error: 'Missing movie identity', validation }, 400, headers);
      const [movieResult, profileResult, reviewResult, inspectionResult, metricResult, queryMetricResult] = await Promise.all([
        db.from('movies').select('id,slug,name,origin_name,title_vi,title_en,content,year,status,seo_catalog_status,episode_current,current_episode,release_at,quality,lang,trailer_url,thumb_url,poster_url,actor,director,category,country,is_published,updated_at').eq('id', payload.movie_id).maybeSingle(),
        db.from('movie_seo_profiles').select('*').eq('movie_id', payload.movie_id).maybeSingle(),
        db.from('movie_reviews').select('content,word_count,generated_at,updated_at').eq('slug', payload.slug).maybeSingle(),
        db.from('seo_url_inspections').select('verdict,coverage_state,indexing_state,page_fetch_state,user_canonical,google_canonical,last_crawl_time,inspected_at,recommendation').eq('movie_id', payload.movie_id).maybeSingle(),
        db.from('seo_search_metrics').select('clicks,impressions,ctr,position,date_start,date_end,collected_at').eq('dimension_type', 'page').ilike('dimension_value', `%/phim/${payload.slug}%`).order('collected_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('seo_query_page_metrics').select('query,clicks,impressions,ctr,position,date_start,date_end,collected_at').ilike('page', `%/phim/${payload.slug}%`).order('collected_at', { ascending: false }).order('impressions', { ascending: false }).limit(30),
      ]);
      if (movieResult.error || !movieResult.data) throw movieResult.error || new Error('Movie not found');
      if (profileResult.error) throw profileResult.error;
      const movie = movieResult.data as Record<string, unknown>;
      const currentProfile = profileResult.data && typeof profileResult.data === 'object' ? profileResult.data as Record<string, unknown> : null;
      const currentVersion = Number(currentProfile?.version || 0);
      const currentBaseline = baselinePayload(
        movie,
        currentProfile,
        reviewResult.data && typeof reviewResult.data === 'object' ? reviewResult.data as Record<string, unknown> : null,
      );
      const observedQueries = (queryMetricResult.error ? [] : queryMetricResult.data ?? []).map((item) => String((item as Record<string, unknown>).query || '')).filter(Boolean);
      const currentQualityV2 = evaluateSeoQualityV2(currentBaseline, movie, observedQueries);
      const currentValidation = mergeQualityV2(validate(currentBaseline), currentQualityV2);
      const indexedDecision = buildIndexedSeoDecision({
        slug:payload.slug,
        aliases:currentQualityV2.intent_map.aliases,
        profileUpdatedAt:currentProfile?.updated_at,
        inspection:inspectionResult.error ? null : inspectionResult.data as Record<string, unknown> | null,
        pageMetric:metricResult.error ? null : metricResult.data as Record<string, unknown> | null,
        queryMetrics:queryMetricResult.error ? [] : (queryMetricResult.data ?? []) as Array<Record<string, unknown>>,
      });
      const focusState = fieldStates(currentBaseline, currentValidation, currentProfile?.status === 'published').focus_keyword;
      if (focusState?.protected
        && !safeEdit.unlocked_fields.includes('focus_keyword')
        && plainText(currentBaseline.focus_keyword, 160)
        && plainText(payload.focus_keyword, 160) !== plainText(currentBaseline.focus_keyword, 160)) {
        // Older AI drafts may have changed the focus phrase before the guard
        // existed. Restore the stable phrase so the operator can still publish.
        payload.focus_keyword = currentBaseline.focus_keyword;
        validation = validate(payload);
      }
      const qualityV2 = evaluateSeoQualityV2(payload, movie);
      validation = mergeQualityV2(validation, qualityV2);
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
        validation = mergeValidation(validation,indexedGuardIssues(
          currentBaseline,
          payload,
          safeEdit.unlocked_fields,
          indexedDecision,
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
      if (action === 'publish' && payload.index_mode === 'index') {
        const indexReadinessIssues = validation.issues.filter((item) => item.severity === 'error' || INDEX_READINESS_CODES.has(item.code));
        if (indexReadinessIssues.length > 0) {
          return json({
            error: `Chưa thể cho Google index: còn ${indexReadinessIssues.length} mục nội dung/từ khóa/liên kết cần hoàn thiện.`,
            validation,
          }, 422, headers);
        }
      }
      if (action === 'publish' && SEO_PUBLISH_MODE === 'worker') {
        const prePublishAudit = await inspectLivePage(payload);
        if (!prePublishAudit.passed) {
          const safeValidation = mergeValidation(validation, [{
            code: 'seo_worker_preflight_failed',
            severity: 'error',
            section: 'technical',
            message: 'Bộ dựng HTML Googlebot chưa hoạt động; không xuất bản hoặc thay đổi quyền index khi trang thật chưa thể xác minh.',
          }]);
          return json({
            error: 'SEO Worker đang không hoạt động hoặc trang thật chưa đạt. Bản SEO đang chạy được giữ nguyên; hãy lưu nháp và kiểm tra lại sau.',
            validation: safeValidation,
            live_audit: prePublishAudit,
            published_profile_unchanged: true,
          }, 503, headers);
        }
      }
      const { error: saveError } = await db.from('movie_seo_profile_drafts')
        .upsert({
          movie_id: payload.movie_id,
          payload,
          baseline_version: currentVersion,
          unlocked_fields: safeEdit.unlocked_fields,
          validation_score: validation.score,
          validation_issues: validation.issues,
          quality_rules_version: qualityV2.rules_version,
          quality_breakdown: qualityV2.breakdown,
          intent_map: qualityV2.intent_map,
          content_fingerprint: qualityV2.content_fingerprint,
          quality_evaluated_at: qualityV2.evaluated_at,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'movie_id' });
      if (saveError) throw saveError;
      if (action === 'save') return json({ success: true, status: 'draft', validation, quality_v2: qualityV2, indexed_decision: indexedDecision, published_profile_unchanged: true }, 200, headers);

      const releaseTiming = body.release_timing === 'urgent' ? 'urgent' : 'nightly';
      if (SEO_PUBLISH_MODE === 'static' && releaseTiming === 'nightly') {
        const queuedAt = new Date().toISOString();
        const { data: activeRelease, error: activeReleaseError } = await db.from('seo_static_release_requests')
          .select('id,status')
          .eq('movie_id', payload.movie_id)
          .in('status', ['pending', 'processing'])
          .order('requested_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeReleaseError) throw activeReleaseError;
        if (activeRelease?.status === 'processing') {
          return json({
            error: 'Phim đang có một bản phát hành được Cloudflare xử lý. Hãy chờ bản đó hoàn tất trước khi xếp lịch mới.',
            validation,
          }, 409, headers);
        }
        const releasePayload = {
          movie_id: payload.movie_id,
          slug: payload.slug,
          reason: 'seo_draft_scheduled',
          release_lane: 'nightly',
          requested_version: null,
          status: 'pending',
          requested_at: queuedAt,
          processing_started_at: null,
          deployed_at: null,
          deployment_url: null,
          error_message: null,
          automatic_retry_count: 0,
          next_retry_at: null,
        };
        const queuedRelease = activeRelease?.id
          ? await db.from('seo_static_release_requests').update(releasePayload).eq('id', activeRelease.id)
          : await db.from('seo_static_release_requests').insert(releasePayload);
        if (queuedRelease.error) throw queuedRelease.error;
        const queuedAudit: LiveAuditResult = {
          passed: false,
          mode: 'nightly-release-queued',
          checked_at: queuedAt,
          url: `https://khophim.org/phim/${payload.slug}`,
          status: 0,
          checks: [{
            code: 'nightly_release_queued',
            passed: true,
            message: 'Bản SEO đã được duyệt và sẽ phát hành theo lô lúc 03:30 sáng. Trang công khai hiện tại chưa thay đổi.',
            value: currentVersion + 1,
          }],
        };
        return json({
          success: true,
          status: 'scheduled-nightly',
          publish_mode: SEO_PUBLISH_MODE,
          validation,
          quality_v2: qualityV2,
          indexed_decision: indexedDecision,
          live_audit: queuedAudit,
          published_profile_unchanged: true,
          public_discovery: { indexable: false, in_sitemap: false, queued: true, checked_at: queuedAt },
          static_release: {
            status: 'pending',
            release_lane: 'nightly',
            requested_version: null,
            requested_at: queuedAt,
            scheduled_for: '03:30 Asia/Ho_Chi_Minh',
          },
        }, 202, headers);
      }

      const { data: publishResult, error: publishError } = await db.rpc('publish_movie_seo_profile', { p_movie_id: payload.movie_id });
      if (publishError) throw publishError;
      const publishedVersion = publishResult && typeof publishResult === 'object'
        ? (publishResult as Record<string, unknown>).version as string | number | undefined
        : undefined;
      const { error: qualitySaveError } = await db.from('movie_seo_profiles').update({
        quality_rules_version: qualityV2.rules_version,
        quality_breakdown: qualityV2.breakdown,
        intent_map: qualityV2.intent_map,
        content_fingerprint: qualityV2.content_fingerprint,
        quality_evaluated_at: qualityV2.evaluated_at,
      }).eq('movie_id', payload.movie_id).eq('version', Number(publishedVersion || 0));
      if (qualitySaveError) throw qualitySaveError;
      if (SEO_PUBLISH_MODE === 'static') {
        const queuedAt = new Date().toISOString();
        const staticPendingAudit = {
          passed: false,
          mode: 'static-build-pending',
          checked_at: queuedAt,
          url: `https://khophim.org/phim/${payload.slug}`,
          status: 0,
          checks: [{
            code: 'static_release_queued',
            passed: true,
            message: 'Hồ sơ đã qua cổng chất lượng và đang chờ Cloudflare Pages tạo trang tĩnh cùng sitemap.',
            value: String(publishedVersion || ''),
          }],
        };
        const { error: pendingAuditError } = await db.from('movie_seo_profiles').update({
          live_audit: staticPendingAudit,
          last_audited_at: queuedAt,
          updated_at: queuedAt,
        }).eq('movie_id', payload.movie_id).eq('version', Number(publishedVersion || 0));
        if (pendingAuditError) throw pendingAuditError;
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
          reason: 'seo_profile_static_publish',
          release_lane: 'urgent',
          requested_version: Number(publishedVersion || 0),
          status: 'pending',
          requested_at: queuedAt,
          processing_started_at: null,
          deployed_at: null,
          deployment_url: null,
          error_message: null,
          automatic_retry_count: 0,
          next_retry_at: null,
        };
        const releaseResult = pendingRelease?.id
          ? await db.from('seo_static_release_requests').update(releasePayload).eq('id', pendingRelease.id)
          : await db.from('seo_static_release_requests').insert(releasePayload);
        if (releaseResult.error) throw releaseResult.error;
        return json({
          success: true,
          status: 'queued-static',
          publish_mode: SEO_PUBLISH_MODE,
          validation,
          indexed_decision: indexedDecision,
          live_audit: staticPendingAudit,
          public_discovery: { indexable: false, in_sitemap: false, queued: true, checked_at: queuedAt },
          static_release: { status: 'pending', release_lane: 'urgent', requested_version: Number(publishedVersion || 0), requested_at: queuedAt },
          result: publishResult,
        }, 202, headers);
      }
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
      const publicDiscovery = finalAudit.passed
        ? await inspectPublicDiscovery(payload, verifiedVersion)
        : { passed: false, checked_at: new Date().toISOString(), url: `https://khophim.org/phim/${payload.slug}`, status: 0, checks: [] };
      const finalVerification: LiveAuditResult = {
        passed: finalAudit.passed && publicDiscovery.passed,
        checked_at: publicDiscovery.checked_at,
        url: finalAudit.url,
        status: publicDiscovery.status || finalAudit.status,
        checks: [...finalAudit.checks, ...publicDiscovery.checks],
      };
      if (!finalVerification.passed) {
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
            live_audit: finalVerification,
            rollback,
            result: publishResult,
          }, 502, headers);
        }
        const { error: failSafeError } = await db.from('movie_seo_profiles').update({
          index_mode: 'noindex',
          version: verifiedVersion + 1,
          validation_score: safeValidation.score,
          validation_issues: safeValidation.issues,
          live_audit: finalVerification,
          last_audited_at: finalVerification.checked_at,
          updated_at: new Date().toISOString(),
        }).eq('movie_id', payload.movie_id).eq('version', verifiedVersion);
        if (failSafeError) throw failSafeError;
        return json({
          error: 'Hồ sơ đã được giữ ở noindex vì lần kiểm tra cuối trên trang thật chưa đạt. Hãy xem các mục kiểm tra rồi xuất bản lại.',
          success: false,
          status: 'published-safe-noindex',
          validation: safeValidation,
          live_audit: finalVerification,
          result: publishResult,
        }, 502, headers);
      }

      const { error: finalAuditSaveError } = await db.from('movie_seo_profiles').update({
        live_audit: finalVerification,
        last_audited_at: finalVerification.checked_at,
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
        automatic_retry_count: 0,
        next_retry_at: null,
      };
      const releaseResult = pendingRelease?.id
        ? await db.from('seo_static_release_requests').update(releasePayload).eq('id', pendingRelease.id)
        : await db.from('seo_static_release_requests').insert(releasePayload);
      if (releaseResult.error) throw releaseResult.error;
      return json({
        success: true,
        status: payload.index_mode === 'index' ? 'published-indexable' : 'published-noindex',
        validation,
        indexed_decision: indexedDecision,
        live_audit: finalVerification,
        public_discovery: {
          indexable: payload.index_mode === 'index',
          in_sitemap: publicDiscovery.checks.some((check) => check.code === 'public_sitemap_membership' && check.passed),
          checked_at: publicDiscovery.checked_at,
        },
        result: { ...((publishResult && typeof publishResult === 'object') ? publishResult : {}), version: verifiedVersion },
      }, 200, headers);
    }

    return json({ error: 'Unknown action' }, 400, headers);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, headers);
  }
});
