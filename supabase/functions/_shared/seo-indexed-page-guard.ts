export type IndexedSeoDecisionStatus =
  | 'not_indexed'
  | 'awaiting_recrawl'
  | 'insufficient_data'
  | 'healthy'
  | 'low_ctr'
  | 'low_position'
  | 'wrong_query'
  | 'canonical_mismatch';

export type IndexedSeoDecision = {
  status: IndexedSeoDecisionStatus;
  label: string;
  reason: string;
  indexed: boolean;
  google_confirmed: boolean;
  protected_fields: string[];
  editable_fields: string[];
  evidence: {
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
    matching_query_impressions: number;
    observed_query_impressions: number;
    matching_query_ratio: number;
    last_crawl_time: string | null;
    inspected_at: string | null;
    user_canonical: string | null;
    google_canonical: string | null;
  };
  observation: {
    started_at: string | null;
    age_days: number;
    early_check_at: string | null;
    provisional_check_at: string | null;
    decision_check_at: string | null;
  };
};

type GuardInput = {
  slug: string;
  aliases: unknown[];
  profileUpdatedAt?: unknown;
  inspection?: Record<string, unknown> | null;
  pageMetric?: Record<string, unknown> | null;
  queryMetrics?: Array<Record<string, unknown>> | null;
  now?: Date;
};

const CORE_PROTECTED_FIELDS = ['slug', 'canonical_path', 'focus_keyword'];
const SEARCH_PRESENTATION_FIELDS = ['seo_title', 'meta_description'];
const CONTENT_FIELDS = ['secondary_keywords', 'intro_content', 'review_content', 'faq', 'topic_links'];
const MIN_IMPRESSIONS = 100;
const MIN_CTR_IMPRESSIONS = 200;
const LOW_CTR = 0.01;
const LOW_POSITION_MIN = 10;
const LOW_POSITION_MAX = 40;
const MIN_QUERY_IMPRESSIONS = 100;
const MIN_MATCHING_QUERY_RATIO = 0.2;

function normalize(value: unknown): string {
  return String(value ?? '').toLocaleLowerCase('vi').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function dateValue(value: unknown): number {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: number): string | null {
  return value > 0 ? new Date(value).toISOString() : null;
}

function addDays(value: number, days: number): string | null {
  return value > 0 ? new Date(value + days * 86_400_000).toISOString() : null;
}

function latestQueryRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const latest = Math.max(0, ...rows.map((row) => dateValue(row.collected_at)));
  if (!latest) return rows;
  const latestDay = new Date(latest).toISOString().slice(0, 10);
  return rows.filter((row) => {
    const collected = dateValue(row.collected_at);
    return collected > 0 && new Date(collected).toISOString().slice(0, 10) === latestDay;
  });
}

export function buildIndexedSeoDecision(input: GuardInput): IndexedSeoDecision {
  const now = input.now ?? new Date();
  const inspection = input.inspection ?? {};
  const metric = input.pageMetric ?? {};
  const queryRows = latestQueryRows(Array.isArray(input.queryMetrics) ? input.queryMetrics : []);
  const aliases = [...new Set(input.aliases.map(normalize).filter((value) => value.length >= 2))];
  const verdict = String(inspection.verdict || '');
  const indexed = verdict === 'PASS';
  const userCanonical = String(inspection.user_canonical || '') || null;
  const googleCanonical = String(inspection.google_canonical || '') || null;
  const expectedCanonical = `https://khophim.org/phim/${input.slug}`;
  const lastCrawl = dateValue(inspection.last_crawl_time);
  const profileUpdated = dateValue(input.profileUpdatedAt);
  const observedAfterCurrentProfile = lastCrawl > 0 && lastCrawl >= profileUpdated;
  const impressions = Number(metric.impressions || 0);
  const clicks = Number(metric.clicks || 0);
  const ctr = Number(metric.ctr || 0);
  const position = Number(metric.position || 0);
  let observedQueryImpressions = 0;
  let matchingQueryImpressions = 0;
  for (const row of queryRows) {
    const query = normalize(row.query);
    const rowImpressions = Math.max(0, Number(row.impressions || 0));
    observedQueryImpressions += rowImpressions;
    if (aliases.some((alias) => query.includes(alias) || alias.includes(query))) {
      matchingQueryImpressions += rowImpressions;
    }
  }
  const matchingQueryRatio = observedQueryImpressions > 0
    ? matchingQueryImpressions / observedQueryImpressions
    : 0;
  const observationStart = observedAfterCurrentProfile ? lastCrawl : 0;
  const ageDays = observationStart > 0 ? Math.max(0, Math.floor((now.getTime() - observationStart) / 86_400_000)) : 0;
  const evidence = {
    impressions, clicks, ctr, position,
    matching_query_impressions: matchingQueryImpressions,
    observed_query_impressions: observedQueryImpressions,
    matching_query_ratio: Number(matchingQueryRatio.toFixed(4)),
    last_crawl_time: iso(lastCrawl),
    inspected_at: String(inspection.inspected_at || '') || null,
    user_canonical: userCanonical,
    google_canonical: googleCanonical,
  };
  const observation = {
    started_at: iso(observationStart),
    age_days: ageDays,
    early_check_at: addDays(observationStart, 7),
    provisional_check_at: addDays(observationStart, 14),
    decision_check_at: addDays(observationStart, 28),
  };
  const result = (
    status: IndexedSeoDecisionStatus,
    label: string,
    reason: string,
    editableFields: string[],
    protectedFields = [...CORE_PROTECTED_FIELDS, ...SEARCH_PRESENTATION_FIELDS],
  ): IndexedSeoDecision => ({
    status,label,reason,indexed,google_confirmed:indexed || lastCrawl > 0,
    protected_fields:[...new Set(protectedFields)],
    editable_fields:[...new Set(editableFields)],
    evidence,observation,
  });

  if (indexed && userCanonical && googleCanonical && normalize(userCanonical) !== normalize(googleCanonical)) {
    return result('canonical_mismatch','Google chọn canonical khác','Không sửa nội dung hàng loạt; cần xử lý tín hiệu canonical kỹ thuật trước.',[]);
  }
  if (!indexed) {
    const coverage = String(inspection.coverage_state || '').toLowerCase();
    if (/crawled|thu thập dữ liệu/.test(coverage)) {
      return result('not_indexed','Đã crawl nhưng chưa index','Ưu tiên bổ sung giá trị nội dung và dữ kiện; giữ nguyên URL, canonical và từ khóa chính.',CONTENT_FIELDS);
    }
    if (/discovered|phát hiện/.test(coverage)) {
      return result('not_indexed','Đã phát hiện nhưng chưa crawl','Ưu tiên liên kết nội bộ và khả năng khám phá; chưa đổi title khi Google chưa crawl.', ['topic_links','intro_content']);
    }
    return result('not_indexed','Chưa được Google index','Chưa có bằng chứng Google index trang này; tiếp tục cổng chất lượng và kiểm tra kỹ thuật.',CONTENT_FIELDS);
  }
  if (!observedAfterCurrentProfile) {
    return result('awaiting_recrawl','Đang chờ Google crawl bản hiện tại','Google chưa crawl phiên bản SEO hiện tại; khóa title, description và từ khóa chính để tránh thay đổi chồng lên nhau.',CONTENT_FIELDS);
  }
  if (impressions < MIN_IMPRESSIONS) {
    return result('insufficient_data','Chưa đủ dữ liệu để sửa tín hiệu nhạy cảm',`Mới có ${impressions} lượt hiển thị; cần ít nhất ${MIN_IMPRESSIONS} trước khi kết luận title hoặc CTR yếu.`,CONTENT_FIELDS);
  }
  if (observedQueryImpressions >= MIN_QUERY_IMPRESSIONS && matchingQueryRatio < MIN_MATCHING_QUERY_RATIO) {
    return result('wrong_query','Truy vấn đang lệch ý định phim','Phần lớn impression quan sát được không khớp tên phim; mở title, description và nội dung để căn chỉnh lại, vẫn giữ từ khóa chính.', [...SEARCH_PRESENTATION_FIELDS,...CONTENT_FIELDS]);
  }
  if (impressions >= MIN_CTR_IMPRESSIONS && position > 0 && position <= 10 && ctr < LOW_CTR) {
    return result('low_ctr','CTR thấp với lượng dữ liệu đủ',`CTR ${(ctr * 100).toFixed(2)}% ở vị trí trung bình ${position.toFixed(1)}; có thể thử title/description theo một thay đổi có kiểm soát.`,SEARCH_PRESENTATION_FIELDS);
  }
  if (position > LOW_POSITION_MIN && position <= LOW_POSITION_MAX) {
    return result('low_position','Đã có nhu cầu nhưng vị trí còn thấp',`Trang có ${impressions} impression ở vị trí trung bình ${position.toFixed(1)}; ưu tiên chiều sâu nội dung và liên kết, không đổi từ khóa chính.`,CONTENT_FIELDS);
  }
  return result('healthy','Trang đã index và đang ổn định','Giữ nguyên title, description, từ khóa chính, URL và canonical; chỉ bổ sung dữ kiện có giá trị thật.',CONTENT_FIELDS);
}
