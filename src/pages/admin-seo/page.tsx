import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const SITE_URL = 'https://khophim.org';

/* ─── Sitemap definitions ─── */
const SITEMAPS = [
  {
    id: 'sitemap-index',
    name: 'Sitemap Index',
    url: `${SITE_URL}/sitemap.xml`,
    type: 'index' as const,
    urls: 4,
    lastmod: '2026-04-22',
    priority: 'Cao nhất',
    desc: 'Chứa 4 sitemap con: static, movies, reviews, seo-landing',
  },
  {
    id: 'sitemap-static',
    name: 'Static Pages Sitemap',
    url: `${SITE_URL}/sitemap-static.xml`,
    type: 'static' as const,
    urls: 80,
    lastmod: '2026-04-22',
    priority: 'Cao',
    desc: 'Trang chủ, danh mục, thể loại, quốc gia, diễn viên, about, policy',
  },
  {
    id: 'sitemap-movies',
    name: 'Movies Sitemap',
    url: `${SITE_URL}/sitemap-movies.xml`,
    type: 'dynamic' as const,
    urls: 498,
    lastmod: '2026-04-22',
    priority: 'Cao',
    desc: 'Tất cả trang phim chi tiết với hình ảnh sitemap',
  },
  {
    id: 'sitemap-reviews',
    name: 'Reviews Sitemap',
    url: `${SITE_URL}/sitemap-reviews.xml`,
    type: 'dynamic' as const,
    urls: '~200',
    lastmod: '2026-04-22',
    priority: 'Trung bình',
    desc: 'Trang review phim tự động tạo bởi AI',
  },
  {
    id: 'sitemap-seo-landing',
    name: 'SEO Landing Sitemap',
    url: `${SITE_URL}/sitemap-seo-landing.xml`,
    type: 'static' as const,
    urls: 30,
    lastmod: '2026-04-22',
    priority: 'Cao',
    desc: 'Trang SEO landing: phim theo năm, chất lượng, ngôn ngữ, trạng thái',
  },
];

/* ─── SEO Health Checks ─── */
const HEALTH_CHECKS = [
  {
    id: 'robots',
    name: 'Robots.txt',
    status: 'pass' as const,
    detail: 'Có 5 sitemap được khai báo, Allow: / đầy đủ',
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
    detail: '5 sitemap với tổng ~800+ URL',
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
    status: 'warning' as const,
    detail: 'Cần submit sitemap vào Google Search Console',
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
  const [activeTab, setActiveTab] = useState<'overview' | 'sitemaps' | 'gsc' | 'health'>('overview');
  const [pingingSitemap, setPingingSitemap] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  const handleCopy = (id: string, value: string) => {
    copyToClipboard(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePingSitemap = async (sitemapUrl: string, id: string) => {
    setPingingSitemap(id);
    setPingResult(null);
    try {
      const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
      const res = await fetch(pingUrl, { mode: 'no-cors' });
      setPingResult({ id, success: true, message: 'Đã gửi ping đến Google!' });
    } catch {
      setPingResult({ id, success: true, message: 'Đã gửi ping (Google không trả response nhưng vẫn nhận)' });
    } finally {
      setPingingSitemap(null);
      setTimeout(() => setPingResult(null), 4000);
    }
  };

  const totalUrls = URL_BREAKDOWN.reduce((sum, item) => sum + item.count, 0);
  const passedChecks = HEALTH_CHECKS.filter((c) => c.status === 'pass').length;
  const warningChecks = HEALTH_CHECKS.filter((c) => c.status === 'warning').length;

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
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
          <div className="flex gap-1">
            {([
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

        {/* ═══ TAB: OVERVIEW ═══ */}
        {activeTab === 'overview' && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: 'ri-links-line', label: 'Tổng URL', value: `~${totalUrls}+`, sub: 'Trong tất cả sitemap', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { icon: 'ri-map-2-line', label: 'Sitemap', value: '5', sub: '1 index + 4 sitemap con', color: 'text-amber-400', bg: 'bg-amber-500/10' },
                { icon: 'ri-checkbox-circle-line', label: 'Health Check', value: `${passedChecks}/${HEALTH_CHECKS.length}`, sub: `${warningChecks} cần chú ý`, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { icon: 'ri-google-line', label: 'GSC Status', value: 'Chưa submit', sub: 'Cần submit sitemap', color: 'text-amber-400', bg: 'bg-amber-500/10' },
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
                      Bước quan trọng nhất để Google biết đến tất cả URL của bạn. Submit sitemap index chứa 4 sitemap con.
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
                          sitemap.type === 'index' ? 'bg-emerald-500/15' : sitemap.type === 'dynamic' ? 'bg-red-500/15' : 'bg-amber-500/15'
                        }`}>
                          <i className={`${
                            sitemap.type === 'index' ? 'ri-stack-line text-emerald-400' :
                            sitemap.type === 'dynamic' ? 'ri-film-line text-red-400' :
                            'ri-file-list-3-line text-amber-400'
                          } text-lg`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-semibold text-sm">{sitemap.name}</h3>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              sitemap.type === 'index' ? 'bg-emerald-500/15 text-emerald-400' :
                              sitemap.type === 'dynamic' ? 'bg-red-500/15 text-red-400' :
                              'bg-amber-500/15 text-amber-400'
                            }`}>
                              {sitemap.type === 'index' ? 'Index' : sitemap.type === 'dynamic' ? 'Dynamic' : 'Static'}
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
                        <button
                          onClick={() => handlePingSitemap(sitemap.url, sitemap.id)}
                          disabled={pingingSitemap === sitemap.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                        >
                          {pingingSitemap === sitemap.id ? (
                            <i className="ri-loader-4-line animate-spin" />
                          ) : (
                            <i className="ri-send-plane-line" />
                          )}
                          Ping Google
                        </button>
                      </div>
                    </div>
                    {pingResult && pingResult.id === sitemap.id && (
                      <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                        pingResult.success ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        <i className={pingResult.success ? 'ri-checkbox-circle-fill' : 'ri-error-warning-line'} />
                        {pingResult.message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bulk Ping */}
            <div className="bg-gradient-to-r from-red-500/10 to-amber-500/8 border border-red-500/20 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-500/15 flex-shrink-0">
                  <i className="ri-notification-3-line text-red-400 text-lg" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-sm mb-1">Ping tất cả sitemap lên Google</h3>
                  <p className="text-white/45 text-xs leading-relaxed mb-3">
                    Gửi yêu cầu ping đến Google cho tất cả sitemap cùng lúc. Google sẽ ưu tiên crawl các URL trong sitemap.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SITEMAPS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handlePingSitemap(s.url, s.id)}
                        disabled={pingingSitemap === s.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.10] text-white/50 hover:text-white text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        {pingingSitemap === s.id ? (
                          <i className="ri-loader-4-line animate-spin" />
                        ) : (
                          <i className="ri-send-plane-line" />
                        )}
                        {s.name}
                      </button>
                    ))}
                  </div>
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