import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminFetch } from '@/services/adminAuth';

const SITE_URL = 'https://khophim.org';
const GSC_FEEDBACK_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/gsc-seo-feedback`;
const HOT_MOVIE_RADAR_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/seo-hot-movie-radar`;

interface GscFeedback {
  latest_run: null | { started_at:string; success:boolean; pages_collected:number; queries_collected:number; urls_inspected:number; indexed_urls:number; error_message?:string|null };
  inspections: Array<{ url:string; slug:string; verdict:string; coverage_state:string; recommendation:string; priority:number; inspected_at:string }>;
  top_pages: Array<{ dimension_value:string; clicks:number; impressions:number; ctr:number; position:number }>;
  top_queries: Array<{ dimension_value:string; clicks:number; impressions:number; ctr:number; position:number }>;
  query_visibility: Array<{ class_name:string; clicks:number; impressions:number; queries:number }>;
  daily_work_items: SeoWorkItem[];
  latest_brain_run: null | { id:number; started_at:string; finished_at?:string; status:string; candidate_count:number; queued_count:number; summary?:Record<string,unknown>; error_message?:string|null };
  static_release_requests: Array<{ id:number; slug?:string; reason:string; requested_version?:number; status:string; requested_at:string; error_message?:string|null }>;
  latest_hot_movie_run: null | { id:number; started_at:string; finished_at?:string; status:string; sources_attempted:number; sources_succeeded:number; signals_seen:number; matched_count:number; missing_count:number; summary?:Record<string,unknown>; error_message?:string|null };
  hot_movie_candidates: HotMovieCandidate[];
}

interface HotMovieCandidate {
  id: number;
  source: 'box_office_vietnam'|'netflix_vietnam'|'khophim_first_party';
  source_key: string;
  title: string;
  original_title?: string|null;
  release_date?: string|null;
  release_year?: number|null;
  source_rank?: number|null;
  demand_score: number;
  source_url?: string|null;
  matched_movie_id?: string|null;
  matched_slug?: string|null;
  match_status: 'exact'|'alias'|'fuzzy'|'direct'|'missing'|'ambiguous';
  match_confidence: number;
  readiness_status: 'ready'|'import_movie'|'review_identity'|'publish_movie'|'enrich_content'|'repair_technical'|'release_static';
  recommended_action: string;
  evidence: Record<string,unknown>;
  last_seen_at: string;
  expires_at: string;
}

interface SeoWorkItem {
  id: number;
  movie_id: string;
  slug: string;
  movie_name: string;
  task_type: 'fix_technical'|'improve_original_content'|'strengthen_discovery'|'capture_search_demand'|'repair_editorial_trust'|'complete_editorial_profile';
  status: 'pending'|'in_progress';
  priority_score: number;
  urgency: 'critical'|'high'|'medium'|'low';
  reason: string;
  required_fields: string[];
  evidence: Record<string, unknown>;
  due_at?: string;
  last_seen_at: string;
}

const TASK_LABELS: Record<SeoWorkItem['task_type'], { label:string; icon:string; action:string }> = {
  fix_technical: { label: 'Sửa lỗi kỹ thuật', icon: 'ri-tools-line', action: 'Kiểm tra trang thật' },
  improve_original_content: { label: 'Nâng chất lượng nội dung', icon: 'ri-article-line', action: 'Sửa nội dung' },
  strengthen_discovery: { label: 'Tăng khả năng Google khám phá', icon: 'ri-links-line', action: 'Bổ sung nội dung & liên kết' },
  capture_search_demand: { label: 'Tận dụng nhu cầu tìm kiếm', icon: 'ri-line-chart-line', action: 'Tối ưu từ khóa đang có cơ hội' },
  repair_editorial_trust: { label: 'Sửa độ tin cậy nội dung', icon: 'ri-shield-check-line', action: 'Xóa nhận xét chưa có căn cứ' },
  complete_editorial_profile: { label: 'Hoàn thiện hồ sơ SEO', icon: 'ri-file-edit-line', action: 'Hoàn thiện hồ sơ' },
};

const FIELD_LABELS: Record<string,string> = {
  technical: 'Kỹ thuật', intro_content: 'Giới thiệu', review_content: 'Bài đánh giá',
  faq: 'FAQ', topic_links: 'Liên kết nội bộ', focus_keyword: 'Từ khóa chính',
  seo_title: 'SEO Title', meta_description: 'Meta Description',
};

const HOT_SOURCE_LABELS: Record<HotMovieCandidate['source'], string> = {
  box_office_vietnam: 'Phòng vé Việt Nam',
  netflix_vietnam: 'Netflix Việt Nam',
  khophim_first_party: 'Người xem KhoPhim',
};

const HOT_READINESS_LABELS: Record<HotMovieCandidate['readiness_status'], { label:string; className:string; icon:string }> = {
  ready: { label: 'Sẵn sàng SEO', className: 'bg-emerald-500/15 text-emerald-300', icon: 'ri-checkbox-circle-line' },
  import_movie: { label: 'Cần nhập phim', className: 'bg-red-500/15 text-red-300', icon: 'ri-add-circle-line' },
  review_identity: { label: 'Xác nhận đúng phim', className: 'bg-orange-500/15 text-orange-300', icon: 'ri-fingerprint-line' },
  publish_movie: { label: 'Cần xuất bản', className: 'bg-amber-500/15 text-amber-300', icon: 'ri-upload-2-line' },
  enrich_content: { label: 'Cần làm giàu nội dung', className: 'bg-amber-500/15 text-amber-200', icon: 'ri-file-edit-line' },
  repair_technical: { label: 'Lỗi trang thật', className: 'bg-red-500/15 text-red-300', icon: 'ri-tools-line' },
  release_static: { label: 'Chờ phát hành tĩnh', className: 'bg-cyan-500/15 text-cyan-200', icon: 'ri-upload-cloud-2-line' },
};

/* ─── Sitemap definitions ─── */
const SITEMAPS = [
  {
    id: 'sitemap-index',
    name: 'Sitemap Index',
    url: `${SITE_URL}/sitemap.xml`,
    type: 'index' as const,
    urls: 6,
    lastmod: 'Tự động',
    priority: 'Cao nhất',
    desc: 'Chứa 6 sitemap con đã kiểm tra: trang tĩnh, landing SEO và các nhóm phim chất lượng',
  },
  {
    id: 'sitemap-static',
    name: 'Static Pages Sitemap',
    url: `${SITE_URL}/sitemap-static.xml`,
    type: 'static' as const,
    urls: 15,
    lastmod: 'Theo lần build',
    priority: 'Cao',
    desc: 'Trang chủ, danh mục, thể loại, quốc gia, diễn viên, about, policy',
  },
  {
    id: 'sitemap-seo-landing',
    name: 'SEO Landing Sitemap',
    url: `${SITE_URL}/sitemap-seo-landing.xml`,
    type: 'static' as const,
    urls: 56,
    lastmod: 'Theo lần build',
    priority: 'Cao',
    desc: 'Trang SEO landing: phim theo năm, chất lượng, ngôn ngữ, trạng thái',
  },
  {
    id: 'sitemap-movies',
    name: 'Movies Sitemap',
    url: `${SITE_URL}/sitemap-movies-1.xml`,
    type: 'static' as const,
    urls: 'Theo cohort',
    lastmod: 'Theo bản phát hành',
    priority: 'Cao',
    desc: 'Danh mục phim đủ điều kiện index; tự loại URL thiếu chất lượng',
  },
  {
    id: 'sitemap-recent',
    name: 'Recent Movies Sitemap',
    url: `${SITE_URL}/sitemap-movies-recent.xml`,
    type: 'static' as const,
    urls: '100',
    lastmod: 'Theo bản phát hành',
    priority: 'Cao',
    desc: 'Phim mới cập nhật để Google phát hiện thay đổi nhanh',
  },
  {
    id: 'sitemap-upcoming',
    name: 'Upcoming Movies Sitemap',
    url: `${SITE_URL}/sitemap-movies-upcoming.xml`,
    type: 'static' as const,
    urls: 'Tối đa 20',
    lastmod: 'Theo bản phát hành',
    priority: 'Trung bình',
    desc: 'Phim sắp chiếu đủ điều kiện index',
  },
  {
    id: 'sitemap-studio',
    name: 'SEO Studio Sitemap',
    url: `${SITE_URL}/sitemap-seo-studio.xml`,
    type: 'static' as const,
    urls: 'Đã duyệt',
    lastmod: 'Theo bản phát hành',
    priority: 'Cao',
    desc: 'Hồ sơ phim đã xuất bản và vượt kiểm tra SEO Studio',
  },
];

/* ─── SEO Health Checks ─── */
const HEALTH_CHECKS = [
  {
    id: 'robots',
    name: 'Robots.txt',
    status: 'pass' as const,
    detail: 'Khai báo sitemap index và cho phép crawl các trang công khai',
    url: `${SITE_URL}/robots.txt`,
  },
  {
    id: 'canonical',
    name: 'Canonical URLs',
    status: 'pass' as const,
    detail: 'Mọi trang đều có canonical tag trỏ về chính nó',
    url: null,
  },
  {
    id: 'schema',
    name: 'Schema.org Markup',
    status: 'pass' as const,
    detail: 'BreadcrumbList, Movie, Review, FAQPage, CollectionPage đầy đủ',
    url: null,
  },
  {
    id: 'sitemap-index',
    name: 'Sitemap Index',
    status: 'pass' as const,
    detail: '7 nguồn URL; sitemap phim được tạo động và lọc chất lượng',
    url: `${SITE_URL}/sitemap.xml`,
  },
  {
    id: 'mobile',
    name: 'Mobile Friendly',
    status: 'pass' as const,
    detail: 'Responsive design, viewport meta tag đầy đủ',
    url: null,
  },
  {
    id: 'ssl',
    name: 'SSL/HTTPS',
    status: 'pass' as const,
    detail: 'HTTPS enabled, HSTS ready via Cloudflare',
    url: null,
  },
  {
    id: 'speed',
    name: 'Page Speed',
    status: 'warning' as const,
    detail: 'Cần tối ưu thêm Core Web Vitals (LCP, CLS)',
    url: 'https://pagespeed.web.dev/?url=https%3A%2F%2Fkhophim.org',
  },
  {
    id: 'indexing',
    name: 'Google Indexing',
    status: 'pass' as const,
    detail: 'Sitemap được kiểm tra và submit tự động qua Search Console',
    url: 'https://search.google.com/search-console',
  },
];

/* ─── GSC Steps ─── */
const GSC_STEPS = [
  {
    step: 1,
    title: 'Truy cập Google Search Console',
    desc: 'Đăng nhập bằng tài khoản Google, thêm property khophim.org',
    action: 'Mở Google Search Console',
    link: 'https://search.google.com/search-console',
    icon: 'ri-google-line',
  },
  {
    step: 2,
    title: 'Xác minh quyền sở hữu domain',
    desc: 'Chọn phương thức "Domain" và thêm DNS TXT record, hoặc dùng URL prefix với file HTML',
    action: 'Bắt đầu xác minh',
    link: 'https://search.google.com/search-console/welcome',
    icon: 'ri-shield-check-line',
  },
  {
    step: 3,
    title: 'Submit Sitemap Index',
    desc: 'Vào mục Sitemaps → nhập https://khophim.org/sitemap.xml → Submit',
    action: 'Copy URL sitemap',
    link: null,
    icon: 'ri-map-2-line',
    copyValue: `${SITE_URL}/sitemap.xml`,
  },
  {
    step: 4,
    title: 'Kiểm tra Coverage Report',
    desc: 'Vào Coverage để xem số trang đã index, valid, excluded, error',
    action: 'Xem Coverage Report',
    link: 'https://search.google.com/search-console/coverage',
    icon: 'ri-pie-chart-line',
  },
  {
    step: 5,
    title: 'Theo dõi Performance',
    desc: 'Vào Performance để xem từ khóa, CTR, impressions, position theo thời gian',
    action: 'Xem Performance',
    link: 'https://search.google.com/search-console/performance/search-analytics',
    icon: 'ri-line-chart-line',
  },
  {
    step: 6,
    title: 'Kiểm tra Core Web Vitals',
    desc: 'Vào Experience → Core Web Vitals để kiểm tra LCP, FID, CLS',
    action: 'Kiểm tra CWV',
    link: 'https://search.google.com/search-console/core-web-vitals',
    icon: 'ri-speed-line',
  },
];

/* ─── URL Breakdown ─── */
const URL_BREAKDOWN = [
  { category: 'Trang phim chi tiết', count: 498, color: 'bg-red-500', percent: 62 },
  { category: 'Trang tĩnh (danh mục)', count: 80, color: 'bg-amber-500', percent: 10 },
  { category: 'SEO Landing Pages', count: 30, color: 'bg-emerald-500', percent: 4 },
  { category: 'Trang review', count: 200, color: 'bg-blue-500', percent: 25 },
  { category: 'Trang diễn viên', count: 8, color: 'bg-purple-500', percent: 1 },
];

/* ─── Helpers ─── */
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    // handled by UI state
  });
}

export default function AdminSEOPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'work' | 'hot' | 'overview' | 'sitemaps' | 'gsc' | 'health'>('work');
  const [gscFeedback, setGscFeedback] = useState<GscFeedback | null>(null);
  const [radarRunning, setRadarRunning] = useState(false);
  const [radarMessage, setRadarMessage] = useState('');

  const handleCopy = (id: string, value: string) => {
    copyToClipboard(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadFeedback = useCallback(() => {
    return adminFetch(GSC_FEEDBACK_URL)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        setGscFeedback(payload as GscFeedback);
      })
      .catch(() => setGscFeedback(null));
  }, []);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const refreshHotMovieRadar = useCallback(async () => {
    setRadarRunning(true);
    setRadarMessage('Đang đối chiếu phòng vé, Netflix và lượt xem KhoPhim...');
    try {
      const response = await adminFetch(HOT_MOVIE_RADAR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const payload = await response.json().catch(() => ({})) as { error?:string; signals?:number; matched?:number; missing?:number };
      if (!response.ok && response.status !== 207) throw new Error(payload.error || `HTTP ${response.status}`);
      await loadFeedback();
      setRadarMessage(`Đã cập nhật ${payload.signals ?? 0} tín hiệu · khớp ${payload.matched ?? 0} · cần nhập ${payload.missing ?? 0}.`);
    } catch (error) {
      setRadarMessage(error instanceof Error ? error.message : 'Không thể cập nhật Radar lúc này.');
    } finally {
      setRadarRunning(false);
    }
  }, [loadFeedback]);

  const totalUrls = URL_BREAKDOWN.reduce((sum, item) => sum + item.count, 0);
  const passedChecks = HEALTH_CHECKS.filter((c) => c.status === 'pass').length;
  const warningChecks = HEALTH_CHECKS.filter((c) => c.status === 'warning').length;

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <title>SEO Dashboard – Admin | KhoPhim</title>
      <meta name="description" content="Admin SEO Dashboard – theo dõi và quản lý hiệu suất SEO, sitemap và Google Indexing." />
      <meta name="robots" content="noindex, nofollow" />
      {/* ── Header ── */}
      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06] cursor-pointer">
              <i className="ri-arrow-left-line text-base" />
            </Link>
            <div>
              <h1 className="text-white font-bold text-base flex items-center gap-2">
                <i className="ri-seo-line text-emerald-400" />
                SEO Admin Dashboard
              </h1>
              <p className="text-white/35 text-xs mt-0.5">
                Quản lý sitemap, submit Google Search Console, theo dõi index coverage
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://search.google.com/search-console"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-lg transition-all whitespace-nowrap"
            >
              <i className="ri-google-line text-emerald-400" />
              Mở GSC
            </a>
            <a
              href={`${SITE_URL}/sitemap.xml`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-lg transition-all whitespace-nowrap"
            >
              <i className="ri-map-2-line text-amber-400" />
              Xem Sitemap
            </a>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-white/[0.06] bg-[#0a0c14]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {([
              { key: 'work' as const, label: 'Việc hôm nay', icon: 'ri-focus-3-line' },
              { key: 'hot' as const, label: 'Phim hot', icon: 'ri-fire-line' },
              { key: 'overview' as const, label: 'Tổng quan', icon: 'ri-dashboard-line' },
              { key: 'sitemaps' as const, label: 'Sitemaps', icon: 'ri-map-2-line' },
              { key: 'gsc' as const, label: 'Google Search Console', icon: 'ri-google-line' },
              { key: 'health' as const, label: 'SEO Health Check', icon: 'ri-heart-pulse-line' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                  activeTab === tab.key
                    ? 'text-emerald-400 border-emerald-400'
                    : 'text-white/40 border-transparent hover:text-white/60'
                }`}
              >
                <i className={`${tab.icon} text-sm`} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* ═══ TAB: DAILY SEO BRAIN ═══ */}
        {activeTab === 'work' && (
          <>
            <section data-kp-seo-brain="true" className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-emerald-500/[0.06] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-cyan-200"><i className="ri-brain-line" /> Bộ não vận hành SEO</p>
                  <h2 className="mt-1 text-xl font-black text-white">5 việc quan trọng nhất hôm nay</h2>
                  <p className="mt-2 max-w-3xl text-xs leading-6 text-white/50">Hệ thống kết hợp Search Console, trạng thái index, nhu cầu không thương hiệu, chất lượng nội dung và vòng đời phim. Mỗi phim chỉ nhận một nhiệm vụ ưu tiên để bạn không sửa lan man.</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3 text-right">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Lần phân tích gần nhất</p>
                  <p className="mt-1 text-xs font-semibold text-white/75">{gscFeedback?.latest_brain_run?.started_at ? new Date(gscFeedback.latest_brain_run.started_at).toLocaleString('vi-VN') : 'Đang chờ dữ liệu'}</p>
                  <p className="mt-1 text-[10px] text-white/35">{gscFeedback?.latest_brain_run?.candidate_count ?? 0} ứng viên · chỉ hiển thị tối đa 5 việc</p>
                </div>
              </div>
            </section>

            {gscFeedback?.daily_work_items?.length ? (
              <div className="space-y-3">
                {gscFeedback.daily_work_items.map((item, index) => {
                  const task = TASK_LABELS[item.task_type];
                  const urgencyClass = item.urgency === 'critical'
                    ? 'border-red-500/25 bg-red-500/[0.07] text-red-300'
                    : item.urgency === 'high'
                      ? 'border-amber-500/25 bg-amber-500/[0.06] text-amber-200'
                      : 'border-cyan-500/20 bg-cyan-500/[0.05] text-cyan-200';
                  const evidence = item.evidence || {};
                  return <article key={item.id} className={`rounded-2xl border p-5 ${urgencyClass}`}>
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-black/25 text-lg"><i className={task.icon} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-black">#{index + 1} · {item.priority_score}/100</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider">{task.label}</span>
                        </div>
                        <h3 className="mt-2 text-base font-bold text-white">{item.movie_name}</h3>
                        <p className="mt-1 text-xs leading-5 text-white/55">{item.reason}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.required_fields.map((field) => <span key={field} className="rounded-lg border border-white/[0.08] bg-black/20 px-2 py-1 text-[10px] text-white/55">{FIELD_LABELS[field] || field}</span>)}
                          {Number(evidence.non_brand_impressions || 0) > 0 && <span className="rounded-lg border border-white/[0.08] bg-black/20 px-2 py-1 text-[10px] text-white/55">{Number(evidence.non_brand_impressions).toLocaleString('vi-VN')} impression không thương hiệu</span>}
                          {evidence.coverage_state && <span className="rounded-lg border border-white/[0.08] bg-black/20 px-2 py-1 text-[10px] text-white/55">{String(evidence.coverage_state)}</span>}
                        </div>
                      </div>
                      <Link to={`/admin/seo-studio?movie=${encodeURIComponent(item.slug)}&task=${encodeURIComponent(item.task_type)}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black hover:bg-white/90"><i className="ri-arrow-right-line" /> {task.action}</Link>
                    </div>
                  </article>;
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.07] bg-[#0d0f18] p-10 text-center"><i className="ri-checkbox-circle-line text-3xl text-emerald-400" /><p className="mt-3 text-sm font-semibold text-white/70">Không có nhiệm vụ SEO khẩn cấp</p><p className="mt-1 text-xs text-white/35">Bộ não sẽ cập nhật lại sau lượt Search Console tiếp theo.</p></div>
            )}

            {(gscFeedback?.static_release_requests?.length ?? 0) > 0 && <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
              <p className="text-sm font-bold text-amber-200"><i className="ri-upload-cloud-2-line" /> Bản tĩnh cần làm mới</p>
              <p className="mt-1 text-xs leading-5 text-white/45">Có {gscFeedback?.static_release_requests.length} thay đổi SEO đã xuất bản đang chờ đưa vào HTML/sitemap tĩnh chống sự cố.</p>
            </section>}
          </>
        )}

        {/* ═══ TAB: HOT MOVIE RADAR ═══ */}
        {activeTab === 'hot' && (
          <div data-kp-hot-movie-radar="true" className="space-y-4">
            <section className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.06] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="flex items-center gap-2 text-sm font-bold text-orange-200"><i className="ri-fire-line" /> Radar phim hot</p>
                  <h2 className="mt-1 text-xl font-black text-white">Nhu cầu thật trước, chỉnh SEO sau</h2>
                  <p className="mt-2 text-xs leading-6 text-white/50">Radar đối chiếu phòng vé Việt Nam, Top 10 Netflix Việt Nam và lượt xem thật trong KhoPhim. Phim không khớp chắc chắn sẽ dừng ở bước xác nhận danh tính để tránh sửa nhầm trang đang tốt.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshHotMovieRadar()}
                  disabled={radarRunning}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-400 px-4 py-2 text-xs font-black text-black transition hover:bg-orange-300 disabled:cursor-wait disabled:opacity-60"
                >
                  <i className={radarRunning ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
                  {radarRunning ? 'Đang cập nhật' : 'Quét ngay'}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Tín hiệu', gscFeedback?.latest_hot_movie_run?.signals_seen ?? 0],
                  ['Đã khớp kho', gscFeedback?.latest_hot_movie_run?.matched_count ?? 0],
                  ['Cần nhập mới', gscFeedback?.latest_hot_movie_run?.missing_count ?? 0],
                  ['Nguồn hoạt động', `${gscFeedback?.latest_hot_movie_run?.sources_succeeded ?? 0}/${gscFeedback?.latest_hot_movie_run?.sources_attempted ?? 3}`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                    <p className="text-lg font-black text-white">{value}</p>
                    <p className="text-[11px] text-white/40">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/40">
                <span>Lần quét: {gscFeedback?.latest_hot_movie_run?.started_at ? new Date(gscFeedback.latest_hot_movie_run.started_at).toLocaleString('vi-VN') : 'Chưa chạy'}</span>
                <span>Tự động mỗi 6 giờ</span>
              </div>
              {radarMessage && <p role="status" className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-xs text-orange-100/80">{radarMessage}</p>}
            </section>

            {gscFeedback?.hot_movie_candidates?.length ? (
              <div className="space-y-3">
                {gscFeedback.hot_movie_candidates.map((candidate) => {
                  const readiness = HOT_READINESS_LABELS[candidate.readiness_status];
                  const taskType = candidate.readiness_status === 'repair_technical' || candidate.readiness_status === 'release_static'
                    ? 'fix_technical'
                    : candidate.readiness_status === 'enrich_content'
                      ? 'improve_original_content'
                      : candidate.readiness_status === 'publish_movie' || candidate.readiness_status === 'review_identity'
                        ? 'complete_editorial_profile'
                        : 'capture_search_demand';
                  return (
                    <article key={candidate.id} className="rounded-2xl border border-white/[0.07] bg-[#0d0f18] p-4">
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-lg font-black text-orange-300">
                          {candidate.source_rank ? `#${candidate.source_rank}` : <i className="ri-fire-line" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/35">{HOT_SOURCE_LABELS[candidate.source]}</span>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${readiness.className}`}><i className={readiness.icon} /> {readiness.label}</span>
                            <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-white/50">Nhu cầu {candidate.demand_score}/100</span>
                          </div>
                          <h3 className="mt-2 text-sm font-bold text-white">{candidate.title}</h3>
                          <p className="mt-1 text-xs leading-5 text-white/45">{candidate.recommended_action}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/35">
                            {candidate.release_date && <span>Khởi chiếu {new Date(`${candidate.release_date}T00:00:00`).toLocaleDateString('vi-VN')}</span>}
                            {candidate.matched_slug && <span>Khớp: /phim/{candidate.matched_slug}</span>}
                            <span>Độ tin cậy {Math.round(Number(candidate.match_confidence || 0) * 100)}%</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] font-semibold text-white/55 hover:text-white"><i className="ri-external-link-line" /> Nguồn tín hiệu</a>}
                          {candidate.matched_slug
                            ? <Link to={`/admin/seo-studio?movie=${encodeURIComponent(candidate.matched_slug)}&task=${encodeURIComponent(taskType)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-black hover:bg-white/90"><i className="ri-arrow-right-line" /> Xử lý SEO</Link>
                            : <span className="inline-flex min-h-9 items-center rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-300">Cần nhập phim</span>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.07] bg-[#0d0f18] p-10 text-center">
                <i className="ri-radar-line text-3xl text-orange-300" />
                <p className="mt-3 text-sm font-semibold text-white/70">Chưa có ảnh chụp phim hot</p>
                <p className="mt-1 text-xs text-white/35">Bấm “Quét ngay” hoặc chờ lịch tự động gần nhất.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: OVERVIEW ═══ */}
        {activeTab === 'overview' && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: 'ri-links-line', label: 'Tổng URL', value: `~${totalUrls}+`, sub: 'Trong tất cả sitemap', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { icon: 'ri-map-2-line', label: 'Sitemap', value: '6', sub: '6 nguồn URL đã kiểm tra', color: 'text-amber-400', bg: 'bg-amber-500/10' },
                { icon: 'ri-checkbox-circle-line', label: 'Health Check', value: `${passedChecks}/${HEALTH_CHECKS.length}`, sub: `${warningChecks} cần chú ý`, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { icon: 'ri-google-line', label: 'GSC tự động', value: gscFeedback?.latest_run?.success ? 'Đang chạy' : 'Chờ dữ liệu', sub: gscFeedback?.latest_run ? `${gscFeedback.latest_run.urls_inspected} URL kiểm tra gần nhất` : 'Cron thu thập mỗi ngày', color: gscFeedback?.latest_run?.success ? 'text-emerald-400' : 'text-amber-400', bg: 'bg-emerald-500/10' },
              ].map((card, i) => (
                <div key={i} className={`${card.bg} border border-white/[0.06] rounded-xl p-4`}>
                  <div className="flex items-center gap-2 mb-2">
                    <i className={`${card.icon} ${card.color} text-base`} />
                    <span className="text-white/40 text-xs">{card.label}</span>
                  </div>
                  <p className={`${card.color} font-bold text-xl`}>{card.value}</p>
                  <p className="text-white/30 text-[11px] mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>

            {gscFeedback?.latest_run && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Vòng phản hồi Search Console tự động</h3>
                    <p className="mt-1 text-xs text-white/40">Lần chạy {new Date(gscFeedback.latest_run.started_at).toLocaleString('vi-VN')}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${gscFeedback.latest_run.success ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                    {gscFeedback.latest_run.success ? 'Hoạt động' : 'Cần kiểm tra quyền GSC'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Trang có dữ liệu', gscFeedback.latest_run.pages_collected],
                    ['Từ khóa', gscFeedback.latest_run.queries_collected],
                    ['URL đã kiểm tra', gscFeedback.latest_run.urls_inspected],
                    ['Google xác nhận index', gscFeedback.latest_run.indexed_urls],
                  ].map(([label,value]) => (
                    <div key={String(label)} className="rounded-xl bg-black/20 p-3">
                      <p className="text-lg font-black text-white">{value}</p>
                      <p className="text-[11px] text-white/40">{label}</p>
                    </div>
                  ))}
                </div>
                {gscFeedback.query_visibility?.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {gscFeedback.query_visibility.map((item) => {
                      const labels: Record<string,string> = {
                        khophim_brand: 'Thương hiệu KhoPhim',
                        legacy_brand: 'Thương hiệu cũ',
                        competitor_navigation: 'Tìm thương hiệu đối thủ',
                        generic_movie: 'Từ khóa phim phổ thông',
                        title_or_entity: 'Tên phim / diễn viên / long-tail',
                      };
                      return (
                        <div key={item.class_name} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                          <p className="text-sm font-black text-white">{item.impressions.toLocaleString('vi-VN')} hiển thị</p>
                          <p className="mt-0.5 text-[11px] text-white/50">{labels[item.class_name] || item.class_name}</p>
                          <p className="mt-1 text-[10px] text-white/30">{item.clicks.toLocaleString('vi-VN')} click · {item.queries} từ khóa</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* URL Distribution */}
            <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5">
              <h3 className="text-white/70 font-semibold text-sm mb-4 flex items-center gap-2">
                <i className="ri-pie-chart-line text-white/40" />
                Phân bố URL theo loại
              </h3>
              <div className="space-y-3">
                {URL_BREAKDOWN.map((item) => (
                  <div key={item.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white/60 text-xs">{item.category}</span>
                      <span className="text-white/40 text-xs">{item.count} URL ({item.percent}%)</span>
                    </div>
                    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                <span className="text-white/40 text-xs">Tổng cộng</span>
                <span className="text-white/70 text-sm font-bold">~{totalUrls}+ URL</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-gradient-to-r from-emerald-500/12 to-teal-500/8 border border-emerald-500/25 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-500/15 flex-shrink-0">
                    <i className="ri-send-plane-fill text-emerald-400 text-lg" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold text-sm mb-1">Submit Sitemap lên Google</h3>
                    <p className="text-white/45 text-xs leading-relaxed mb-3">
                      Sitemap index được hệ thống kiểm tra và submit tự động; nút dưới dùng để kiểm tra thủ công khi cần.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleCopy('quick-sitemap', `${SITE_URL}/sitemap.xml`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap"
                      >
                        <i className={copiedId === 'quick-sitemap' ? 'ri-check-line' : 'ri-clipboard-line'} />
                        {copiedId === 'quick-sitemap' ? 'Đã copy!' : 'Copy sitemap URL'}
                      </button>
                      <a
                        href="https://search.google.com/search-console/sitemaps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white text-xs font-semibold rounded-lg transition-all whitespace-nowrap"
                      >
                        <i className="ri-external-link-line" />
                        Mở GSC Sitemaps
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-amber-500/12 to-orange-500/8 border border-amber-500/25 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-amber-500/15 flex-shrink-0">
                    <i className="ri-speed-line text-amber-400 text-lg" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold text-sm mb-1">Kiểm tra PageSpeed</h3>
                    <p className="text-white/45 text-xs leading-relaxed mb-3">
                      Core Web Vitals ảnh hưởng trực tiếp đến thứ hạng Google. Kiểm tra và tối ưu LCP, CLS, FID.
                    </p>
                    <a
                      href={`https://pagespeed.web.dev/?url=${encodeURIComponent(SITE_URL)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-semibold rounded-lg transition-all whitespace-nowrap"
                    >
                      <i className="ri-external-link-line" />
                      Chạy PageSpeed Insights
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Important Notes */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                <i className="ri-lightbulb-line text-amber-400" />
                Lưu ý quan trọng
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: 'ri-time-line', text: 'Google mất 2-7 ngày để crawl và index sitemap mới' },
                  { icon: 'ri-refresh-line', text: 'Sitemap được cập nhật tự động mỗi ngày qua cron job' },
                  { icon: 'ri-shield-check-line', text: 'Đảm bảo domain đã trỏ về Cloudflare (Proxied)' },
                  { icon: 'ri-file-list-3-line', text: 'Robots.txt đã cho phép crawl tất cả các trang quan trọng' },
                ].map((note, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <i className={`${note.icon} text-emerald-400/60 text-sm mt-0.5 flex-shrink-0`} />
                    <p className="text-white/45 text-xs leading-relaxed">{note.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══ TAB: SITEMAPS ═══ */}
        {activeTab === 'sitemaps' && (
          <>
            <div className="bg-gradient-to-r from-emerald-500/12 to-teal-500/8 border border-emerald-500/25 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-500/15 flex-shrink-0">
                  <i className="ri-map-2-line text-emerald-400 text-lg" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1">Sitemap Index URL</h3>
                  <p className="text-white/45 text-xs leading-relaxed mb-2">
                    Đây là URL duy nhất bạn cần submit vào Google Search Console. Nó chứa tất cả các sitemap con.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-emerald-400/80 text-xs font-mono">
                      {SITE_URL}/sitemap.xml
                    </code>
                    <button
                      onClick={() => handleCopy('sitemap-index-url', `${SITE_URL}/sitemap.xml`)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap"
                    >
                      <i className={copiedId === 'sitemap-index-url' ? 'ri-check-line' : 'ri-clipboard-line'} />
                      {copiedId === 'sitemap-index-url' ? 'Đã copy!' : 'Copy'}
                    </button>
                    <a
                      href={`${SITE_URL}/sitemap.xml`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.06] hover:bg-white/[0.10] text-white/50 hover:text-white text-xs rounded-lg transition-all whitespace-nowrap"
                    >
                      <i className="ri-external-link-line" />
                      Xem
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Sitemap List */}
            <div className="space-y-3">
              {SITEMAPS.map((sitemap) => (
                <div key={sitemap.id} className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${
                          sitemap.type === 'index' ? 'bg-emerald-500/15' : 'bg-amber-500/15'
                        }`}>
                          <i className={`${
                            sitemap.type === 'index' ? 'ri-stack-line text-emerald-400' : 'ri-file-list-3-line text-amber-400'
                          } text-lg`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-semibold text-sm">{sitemap.name}</h3>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              sitemap.type === 'index' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                            }`}>
                              {sitemap.type === 'index' ? 'Index' : 'Static'}
                            </span>
                            <span className="text-[11px] bg-white/[0.06] text-white/40 px-2 py-0.5 rounded-full">
                              {sitemap.urls} URL
                            </span>
                          </div>
                          <p className="text-white/35 text-xs mt-1">{sitemap.desc}</p>
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-white/30">
                            <span className="flex items-center gap-1">
                              <i className="ri-calendar-line" />
                              Cập nhật: {sitemap.lastmod}
                            </span>
                            <span className="flex items-center gap-1">
                              <i className="ri-bar-chart-line" />
                              Priority: {sitemap.priority}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleCopy(sitemap.id, sitemap.url)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.10] text-white/50 hover:text-white text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap"
                        >
                          <i className={copiedId === sitemap.id ? 'ri-check-line text-emerald-400' : 'ri-clipboard-line'} />
                          {copiedId === sitemap.id ? 'Copied' : 'Copy URL'}
                        </button>
                        <a
                          href={sitemap.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.10] text-white/50 hover:text-white text-xs rounded-lg transition-all whitespace-nowrap"
                        >
                          <i className="ri-external-link-line" />
                          Xem
                        </a>
                        <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                          <i className="ri-refresh-line" />
                          Tự động
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-r from-emerald-500/10 to-sky-500/8 border border-emerald-500/20 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-500/15 flex-shrink-0">
                  <i className="ri-robot-2-line text-emerald-400 text-lg" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-sm mb-1">SEO vận hành tự động</h3>
                  <p className="text-white/45 text-xs leading-relaxed mb-3">
                    Google đã ngừng sitemap ping. KhoPhim tự cập nhật sitemap/lastmod, thu thập Search Console mỗi ngày và kiểm tra luân phiên URL phim bằng API chính thức.
                  </p>
                  <p className="text-xs font-semibold text-emerald-300">Không cần thao tác hằng ngày.</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══ TAB: GOOGLE SEARCH CONSOLE ═══ */}
        {activeTab === 'gsc' && (
          <>
            {/* GSC Setup Steps */}
            <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/8 border border-blue-500/20 rounded-2xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-500/15 flex-shrink-0">
                  <i className="ri-google-line text-blue-400 text-lg" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1">Hướng dẫn submit sitemap vào Google Search Console</h3>
                  <p className="text-white/45 text-xs leading-relaxed">
                    Làm theo 6 bước dưới đây để Google index website của bạn. Ước tính mất 2-7 ngày để URL xuất hiện trong kết quả tìm kiếm.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {GSC_STEPS.map((step) => (
                <div key={step.step} className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-500/15 text-blue-400 text-sm font-bold flex-shrink-0">
                      {step.step}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-semibold text-sm mb-1 flex items-center gap-2">
                        <i className={`${step.icon} text-blue-400/60`} />
                        {step.title}
                      </h4>
                      <p className="text-white/40 text-xs leading-relaxed mb-3">{step.desc}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {step.copyValue ? (
                          <button
                            onClick={() => handleCopy(`gsc-step-${step.step}`, step.copyValue!)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap"
                          >
                            <i className={copiedId === `gsc-step-${step.step}` ? 'ri-check-line' : 'ri-clipboard-line'} />
                            {copiedId === `gsc-step-${step.step}` ? 'Đã copy!' : step.action}
                          </button>
                        ) : step.link ? (
                          <a
                            href={step.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-semibold rounded-lg transition-all whitespace-nowrap"
                          >
                            <i className="ri-external-link-line" />
                            {step.action}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* GSC Direct Links */}
            <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5">
              <h3 className="text-white/70 font-semibold text-sm mb-4 flex items-center gap-2">
                <i className="ri-links-line text-white/40" />
                Link trực tiếp đến Google Search Console
              </h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  { label: 'Sitemaps', url: 'https://search.google.com/search-console/sitemaps', icon: 'ri-map-2-line' },
                  { label: 'Coverage', url: 'https://search.google.com/search-console/coverage', icon: 'ri-pie-chart-line' },
                  { label: 'Performance', url: 'https://search.google.com/search-console/performance/search-analytics', icon: 'ri-line-chart-line' },
                  { label: 'Core Web Vitals', url: 'https://search.google.com/search-console/core-web-vitals', icon: 'ri-speed-line' },
                  { label: 'Mobile Usability', url: 'https://search.google.com/search-console/mobile-usability', icon: 'ri-smartphone-line' },
                  { label: 'URL Inspection', url: 'https://search.google.com/search-console/inspect', icon: 'ri-search-line' },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-all group"
                  >
                    <i className={`${link.icon} text-white/30 group-hover:text-blue-400 text-sm`} />
                    <span className="text-white/50 group-hover:text-white/70 text-xs">{link.label}</span>
                    <i className="ri-external-link-line text-white/20 group-hover:text-white/40 text-xs ml-auto" />
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══ TAB: SEO HEALTH CHECK ═══ */}
        {activeTab === 'health' && (
          <>
            {/* Health Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                <p className="text-emerald-400 text-2xl font-bold">{passedChecks}</p>
                <p className="text-white/40 text-xs mt-1">Đạt yêu cầu</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                <p className="text-amber-400 text-2xl font-bold">{warningChecks}</p>
                <p className="text-white/40 text-xs mt-1">Cần chú ý</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                <p className="text-red-400 text-2xl font-bold">0</p>
                <p className="text-white/40 text-xs mt-1">Lỗi nghiêm trọng</p>
              </div>
            </div>

            {/* Health Check List */}
            <div className="space-y-2">
              {HEALTH_CHECKS.map((check) => (
                <div
                  key={check.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    check.status === 'pass'
                      ? 'bg-emerald-500/[0.04] border-emerald-500/15'
                      : 'bg-amber-500/[0.04] border-amber-500/15'
                  }`}
                >
                  <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${
                    check.status === 'pass' ? 'bg-emerald-500/15' : 'bg-amber-500/15'
                  }`}>
                    <i className={`${
                      check.status === 'pass' ? 'ri-checkbox-circle-fill text-emerald-400' : 'ri-error-warning-line text-amber-400'
                    } text-lg`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white/70 text-sm font-medium">{check.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        check.status === 'pass'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {check.status === 'pass' ? 'PASS' : 'WARNING'}
                      </span>
                    </div>
                    <p className="text-white/35 text-xs mt-0.5">{check.detail}</p>
                  </div>
                  {check.url && (
                    <a
                      href={check.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                    >
                      <i className="ri-external-link-line" />
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* External Tools */}
            <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5">
              <h3 className="text-white/70 font-semibold text-sm mb-4 flex items-center gap-2">
                <i className="ri-tools-line text-white/40" />
                Công cụ kiểm tra SEO bên ngoài
              </h3>
              <div className="grid sm:grid-cols-3 gap-2">
                {[
                  { name: 'PageSpeed Insights', url: `https://pagespeed.web.dev/?url=${encodeURIComponent(SITE_URL)}`, icon: 'ri-speed-line', desc: 'Đo tốc độ & CWV' },
                  { name: 'Mobile Friendly Test', url: `https://search.google.com/test/mobile-friendly?url=${encodeURIComponent(SITE_URL)}`, icon: 'ri-smartphone-line', desc: 'Kiểm tra mobile' },
                  { name: 'Rich Results Test', url: `https://search.google.com/test/rich-results?url=${encodeURIComponent(SITE_URL)}`, icon: 'ri-award-line', desc: 'Kiểm tra schema' },
                  { name: 'Schema Validator', url: 'https://validator.schema.org/', icon: 'ri-code-box-line', desc: 'Validate structured data' },
                  { name: 'SSL Labs Test', url: `https://www.ssllabs.com/ssltest/analyze.html?d=${SITE_URL.replace('https://', '')}`, icon: 'ri-shield-check-line', desc: 'Kiểm tra SSL' },
                  { name: 'GTmetrix', url: `https://gtmetrix.com/?url=${encodeURIComponent(SITE_URL)}`, icon: 'ri-bar-chart-grouped-line', desc: 'Phân tích hiệu suất' },
                ].map((tool) => (
                  <a
                    key={tool.name}
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 px-3 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-all group"
                  >
                    <i className={`${tool.icon} text-white/30 group-hover:text-emerald-400 text-sm mt-0.5`} />
                    <div>
                      <p className="text-white/60 group-hover:text-white/80 text-xs font-medium">{tool.name}</p>
                      <p className="text-white/30 text-[11px]">{tool.desc}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Footer info ── */}
        <div className="text-center py-4">
          <p className="text-white/20 text-xs">
            Domain: <span className="text-white/40">{SITE_URL}</span> ·
            Sitemap: <span className="text-white/40">{SITE_URL}/sitemap.xml</span> ·
            Robots: <span className="text-white/40">{SITE_URL}/robots.txt</span>
          </p>
        </div>
      </div>
    </div>
  );
}
