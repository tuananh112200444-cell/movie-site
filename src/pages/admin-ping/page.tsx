import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminFetch } from '@/services/adminAuth';

const EDGE_LOGS_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-ping-logs`;
const EDGE_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/auto-ping-new-movies`;
const PING_STATIC_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/ping-static-pages`;
const SITE_URL = 'https://khophim.org';

// 6 URL canonical vừa fix (canonical đã được sửa từ -seo sang URL chuẩn)
const SEO_LANDING_FIXED = [
  { url: `${SITE_URL}/phim-chieu-rap`,       label: 'Phim Chiếu Rạp',   icon: 'ri-building-4-line' },
  { url: `${SITE_URL}/the-loai/hanh-dong`,   label: 'Hành Động',        icon: 'ri-sword-line' },
  { url: `${SITE_URL}/the-loai/kinh-di`,     label: 'Kinh Dị',           icon: 'ri-ghost-2-line' },
  { url: `${SITE_URL}/the-loai/tinh-cam`,    label: 'Tình Cảm',          icon: 'ri-heart-3-line' },
  { url: `${SITE_URL}/the-loai/hai-huoc`,    label: 'Hài Hước',          icon: 'ri-emotion-laugh-line' },
  { url: `${SITE_URL}/the-loai/vien-tuong`,  label: 'Viễn Tưởng',        icon: 'ri-rocket-2-line' },
];

const CURRENT_YEAR = new Date().getFullYear();
const PREV_YEAR    = CURRENT_YEAR - 1;

const STATIC_PAGES = [
  { url: `${SITE_URL}/`,                  label: 'Trang Chủ',          icon: 'ri-home-4-line',    priority: 'high' },
  { url: `${SITE_URL}/phim-moi-cap-nhat`, label: 'Phim Mới Cập Nhật', icon: 'ri-refresh-line',   priority: 'high' },
  { url: `${SITE_URL}/phim-moi-nhat`,     label: 'Phim Mới Nhất',     icon: 'ri-fire-line',      priority: 'high' },
  { url: `${SITE_URL}/phim-le`,           label: 'Phim Lẻ',           icon: 'ri-movie-2-line',   priority: 'med' },
  { url: `${SITE_URL}/phim-bo`,           label: 'Phim Bộ',           icon: 'ri-tv-2-line',      priority: 'med' },
  { url: `${SITE_URL}/phim-chieu-rap`,    label: 'Chiếu Rạp',         icon: 'ri-building-line',  priority: 'med' },
  { url: `${SITE_URL}/hoat-hinh`,         label: 'Hoạt Hình',         icon: 'ri-gamepad-line',   priority: 'med' },
  { url: `${SITE_URL}/tv-shows`,          label: 'TV Shows',           icon: 'ri-broadcast-line', priority: 'med' },
  { url: `${SITE_URL}/phim-sap-chieu`,    label: 'Phim Sắp Chiếu',    icon: 'ri-time-line',      priority: 'low' },
  { url: `${SITE_URL}/phim-han-quoc`,     label: 'Phim Hàn Quốc',     icon: 'ri-global-line',    priority: 'med' },
  { url: `${SITE_URL}/phim-trung-quoc`,   label: 'Phim Trung Quốc',   icon: 'ri-global-line',    priority: 'med' },
  { url: `${SITE_URL}/phim-au-my`,        label: 'Phim Âu Mỹ',        icon: 'ri-global-line',    priority: 'med' },
  { url: `${SITE_URL}/phim-nhat-ban`,     label: 'Phim Nhật Bản',     icon: 'ri-global-line',    priority: 'low' },
  { url: `${SITE_URL}/phim-thai-lan`,     label: 'Phim Thái Lan',     icon: 'ri-global-line',    priority: 'low' },
  { url: `${SITE_URL}/phim-viet-nam`,     label: 'Phim Việt Nam',     icon: 'ri-global-line',    priority: 'low' },
  { url: `${SITE_URL}/filter`,            label: 'Lọc Phim',          icon: 'ri-filter-line',    priority: 'low' },
];

const YEAR_PAGES = [
  { url: `${SITE_URL}/phim-le-${CURRENT_YEAR}`,        label: `Phim Lẻ ${CURRENT_YEAR}` },
  { url: `${SITE_URL}/phim-bo-${CURRENT_YEAR}`,        label: `Phim Bộ ${CURRENT_YEAR}` },
  { url: `${SITE_URL}/phim-chieu-rap-${CURRENT_YEAR}`, label: `Chiếu Rạp ${CURRENT_YEAR}` },
  { url: `${SITE_URL}/hoat-hinh-${CURRENT_YEAR}`,      label: `Hoạt Hình ${CURRENT_YEAR}` },
  { url: `${SITE_URL}/phim-le-${PREV_YEAR}`,           label: `Phim Lẻ ${PREV_YEAR}` },
  { url: `${SITE_URL}/phim-bo-${PREV_YEAR}`,           label: `Phim Bộ ${PREV_YEAR}` },
  { url: `${SITE_URL}/phim-chieu-rap-${PREV_YEAR}`,    label: `Chiếu Rạp ${PREV_YEAR}` },
  { url: `${SITE_URL}/hoat-hinh-${PREV_YEAR}`,         label: `Hoạt Hình ${PREV_YEAR}` },
];

const CHECK_CRED_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/check-google-credentials`;

interface PingLog {
  id: number;
  run_at: string;
  total_movies: number;
  pinged_ok: number;
  pinged_fail: number;
  failed_slugs: string[];
  triggered_by: string;
  static_pages_pinged?: number;
  year_pages_pinged?: number;
}

interface PingSummary {
  movie_pages:  { total: number; ok: number };
  static_pages: { total: number; ok: number };
  year_pages:   { total: number; ok: number };
}

interface PingResult {
  message: string;
  run_at: string;
  triggered_by: string;
  within_hours: number;
  total_movies: number;
  pinged_ok: number;
  pinged_fail: number;
  failed_slugs: string[];
  sample_movies: { slug: string; name: string }[];
  summary?: PingSummary;
  static_pages_pinged?: string[];
  year_pages_pinged?: string[];
  error?: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} giờ trước`;
  return `${Math.floor(hrs / 24)} ngày trước`;
}

function getNextRunVN(): string {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(1, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const diffMs = next.getTime() - now.getTime();
  const diffH  = Math.floor(diffMs / 3600000);
  const diffM  = Math.floor((diffMs % 3600000) / 60000);
  return `${diffH}h ${diffM}m nữa`;
}

type ActiveTab = 'auto' | 'manual' | 'static';

export default function AdminPingPage() {
  const [logs, setLogs]             = useState<PingLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [pinging, setPinging]       = useState(false);
  const [lastResult, setLastResult] = useState<PingResult | null>(null);
  const [withinHours, setWithinHours] = useState(26);
  const [customSlugs, setCustomSlugs] = useState('');
  const [activeTab, setActiveTab]   = useState<ActiveTab>('auto');
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [pingStatic, setPingStatic] = useState(true);
  const [pingYear, setPingYear]     = useState(true);
  const [pingingKeywords, setPingingKeywords] = useState(false);
  const [keywordResult, setKeywordResult] = useState<{ success: number; failed: number; total: number; message: string } | null>(null);
  const [showCredGuide, setShowCredGuide] = useState(false);
  const [nextRun] = useState(getNextRunVN);

  const [pingingSEO, setPingingSEO] = useState(false);
  const [seoResult, setSeoResult] = useState<{ success: number; failed: number; total: number; message: string } | null>(null);

  const [credStatus, setCredStatus] = useState<{
    ready: boolean;
    hasEmail: boolean;
    hasKey: boolean;
    keyValid: boolean;
    message: string;
    checking: boolean;
  }>({ ready: false, hasEmail: false, hasKey: false, keyValid: false, message: '', checking: true });

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await adminFetch(EDGE_LOGS_URL);
      const data = await res.json() as { logs?: PingLog[]; error?: string };
      if (data.logs) setLogs(data.logs);
      else if (data.error) { /* silent */ }
    } catch {
      /* silent */
    }
    setLoadingLogs(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Kiểm tra credentials khi load trang
  const checkCredentials = useCallback(async () => {
    setCredStatus((prev) => ({ ...prev, checking: true }));
    try {
      const res = await adminFetch(CHECK_CRED_URL);
      const data = await res.json() as {
        ready: boolean;
        hasEmail: boolean;
        hasKey: boolean;
        keyValid: boolean;
        message: string;
      };
      setCredStatus({
        ready: data.ready,
        hasEmail: data.hasEmail,
        hasKey: data.hasKey,
        keyValid: data.keyValid,
        message: data.message,
        checking: false,
      });
    } catch {
      setCredStatus({
        ready: false,
        hasEmail: false,
        hasKey: false,
        keyValid: false,
        message: 'Không thể kết nối đến Edge Function kiểm tra credentials',
        checking: false,
      });
    }
  }, []);

  useEffect(() => { checkCredentials(); }, [checkCredentials]);

  const handlePing = async () => {
    setPinging(true);
    setLastResult(null);
    try {
      let body: Record<string, unknown> = {};

      if (activeTab === 'auto') {
        body = { withinHours, pingStaticPages: pingStatic, pingYearPages: pingYear };
      } else if (activeTab === 'manual') {
        const slugList = customSlugs.split('\n').map((s) => s.trim()).filter(Boolean);
        body = { slugs: slugList, pingStaticPages: pingStatic, pingYearPages: pingYear };
      } else if (activeTab === 'static') {
        body = { mode: 'static-only', pingStaticPages: true, pingYearPages: true };
      }

      const res = await adminFetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-triggered-by': 'admin-manual' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as PingResult;
      setLastResult(data);
      setTimeout(fetchLogs, 1500);
    } catch (e) {
      setLastResult({
        message: `Lỗi: ${String(e)}`, run_at: new Date().toISOString(),
        triggered_by: 'admin-manual', within_hours: withinHours,
        total_movies: 0, pinged_ok: 0, pinged_fail: 0, failed_slugs: [], sample_movies: [],
        error: String(e),
      });
    } finally {
      setPinging(false);
    }
  };

  const handlePingKeywords = async () => {
    setPingingKeywords(true);
    setKeywordResult(null);
    try {
      const res = await adminFetch(PING_STATIC_URL, { method: 'POST' });
      const data = await res.json() as { success: number; failed: number; total: number; message: string };
      setKeywordResult(data);
    } catch (e) {
      setKeywordResult({ success: 0, failed: 0, total: 0, message: `Lỗi: ${String(e)}` });
    } finally {
      setPingingKeywords(false);
    }
  };

  const handlePingSEO = async () => {
    setPingingSEO(true);
    setSeoResult(null);
    try {
      const res = await adminFetch(PING_STATIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: SEO_LANDING_FIXED.map((p) => p.url),
        }),
      });
      const data = await res.json() as { success: number; failed: number; total: number; message: string };
      setSeoResult(data);
    } catch (e) {
      setSeoResult({ success: 0, failed: 0, total: 0, message: `Lỗi: ${String(e)}` });
    } finally {
      setPingingSEO(false);
    }
  };

  const successRate = (log: PingLog) =>
    log.total_movies > 0 ? Math.round((log.pinged_ok / log.total_movies) * 100) : 0;

  const lastLog = logs[0];

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <title>Google Indexing Ping – Admin | KhoPhim</title>
      <meta name="description" content="Admin panel quản lý Google Indexing API Ping – tự động ping phim mới và trang danh mục lên Google." />
      <meta name="robots" content="noindex, nofollow" />
      {/* ── Header ── */}
      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06] cursor-pointer">
              <i className="ri-arrow-left-line text-base" />
            </Link>
            <div>
              <h1 className="text-white font-bold text-base flex items-center gap-2">
                <i className="ri-google-line text-red-400" />
                Google Indexing Auto Ping
              </h1>
              <p className="text-white/35 text-xs mt-0.5">
                Ping phim mới + trang danh mục lên Google Indexing API
              </p>
            </div>
          </div>
          <button onClick={fetchLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/50 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-lg transition-all cursor-pointer whitespace-nowrap">
            <i className="ri-refresh-line text-sm" />
            Làm mới
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── CRON STATUS BANNER ── */}
        <div className="bg-gradient-to-r from-emerald-500/12 to-teal-500/8 border border-emerald-500/25 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-500/15 flex-shrink-0 mt-0.5">
                <i className="ri-timer-flash-line text-emerald-400 text-lg" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-white font-bold text-sm">Cron Job Tự Động</h3>
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    Đã sửa &amp; Active
                  </span>
                </div>
                <p className="text-white/45 text-xs leading-relaxed max-w-xl">
                  Cron job chạy <strong className="text-white/70">mỗi ngày lúc 8:00 sáng (giờ VN)</strong> — tự động ping phim mới 26h qua + tất cả trang danh mục lên Google.
                  Đã fix lỗi <code className="text-red-400/80 bg-red-500/10 px-1 rounded text-[11px]">schema "net" does not exist</code> bằng wrapper function.
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-white/35">
                  <span className="flex items-center gap-1.5">
                    <i className="ri-time-line text-emerald-400/70" />
                    Lần chạy tiếp theo: <strong className="text-emerald-400">{nextRun}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="ri-calendar-line text-white/30" />
                    Schedule: <code className="text-white/50 bg-white/[0.06] px-1.5 py-0.5 rounded text-[11px]">0 1 * * *</code>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <div className="text-[11px] text-white/30 text-right">Lần chạy gần nhất</div>
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                <div>
                  <p className="text-white/60 text-xs font-medium">21/04/2026 08:00</p>
                  <p className="text-red-400/70 text-[11px]">Failed (đã fix)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── CREDENTIALS STATUS ── */}
        {credStatus.checking ? (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 flex items-center gap-3">
            <i className="ri-loader-4-line animate-spin text-white/30 text-lg" />
            <span className="text-white/40 text-sm">Đang kiểm tra Google Credentials...</span>
          </div>
        ) : credStatus.ready ? (
          <div className="bg-gradient-to-r from-emerald-500/12 to-teal-500/8 border border-emerald-500/25 rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-500/15 flex-shrink-0">
                <i className="ri-shield-check-line text-emerald-400 text-lg" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-emerald-300 font-bold text-sm">Google Credentials Đã Sẵn Sàng</h3>
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">Ready</span>
                </div>
                <p className="text-white/45 text-xs mt-0.5">
                  Service Account đã được cấu hình đúng. Ping Google Indexing API sẽ hoạt động.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-amber-500/12 to-orange-500/8 border border-amber-500/30 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowCredGuide(!showCredGuide)}
              className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/15 flex-shrink-0">
                  <i className="ri-key-2-line text-amber-400 text-base" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <h3 className="text-amber-300 font-bold text-sm">Cần Setup Google Credentials</h3>
                    <span className="text-[11px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">Bắt buộc</span>
                  </div>
                  <p className="text-white/40 text-xs mt-0.5">
                    {credStatus.message}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); checkCredentials(); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title="Kiểm tra lại"
                >
                  <i className="ri-refresh-line text-white/30 text-sm" />
                </button>
                <i className={`ri-arrow-down-s-line text-white/30 text-lg transition-transform ${showCredGuide ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {showCredGuide && (
              <div className="px-5 pb-5 border-t border-amber-500/15">
                <div className="mt-4 space-y-3">
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Các bước setup:</p>
                  {[
                    {
                      step: '1',
                      title: 'Tạo Google Service Account',
                      desc: 'Vào Google Cloud Console → IAM & Admin → Service Accounts → Create Service Account. Đặt tên bất kỳ, role: Owner hoặc Indexing API User.',
                      link: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
                      linkText: 'Mở Google Cloud Console',
                    },
                    {
                      step: '2',
                      title: 'Enable Indexing API',
                      desc: 'Vào APIs & Services → Enable APIs → tìm "Web Search Indexing API" → Enable.',
                      link: 'https://console.cloud.google.com/apis/library/indexing.googleapis.com',
                      linkText: 'Enable Indexing API',
                    },
                    {
                      step: '3',
                      title: 'Tạo JSON Key',
                      desc: 'Trong Service Account → Keys → Add Key → Create new key → JSON. Download file JSON về máy.',
                    },
                    {
                      step: '4',
                      title: 'Add vào Supabase Secrets',
                      desc: 'Vào Supabase Dashboard → Edge Functions → Secrets → Add secret:',
                      secrets: [
                        { name: 'GOOGLE_SERVICE_ACCOUNT_EMAIL', value: 'Lấy từ trường "client_email" trong file JSON' },
                        { name: 'GOOGLE_SERVICE_ACCOUNT_KEY', value: 'Lấy từ trường "private_key" trong file JSON (cả -----BEGIN...END-----)' },
                      ],
                      link: `${import.meta.env.VITE_PUBLIC_SUPABASE_URL?.replace('https://', 'https://supabase.com/dashboard/project/').replace('.supabase.co', '')}/functions`,
                      linkText: 'Mở Supabase Edge Functions',
                    },
                    {
                      step: '5',
                      title: 'Verify quyền trong Google Search Console',
                      desc: 'Vào Google Search Console → Settings → Users and permissions → Add user → nhập email của service account → Owner.',
                      link: 'https://search.google.com/search-console',
                      linkText: 'Mở Search Console',
                    },
                  ].map((item) => (
                    <div key={item.step} className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {item.step}
                      </div>
                      <div className="flex-1">
                        <p className="text-white/70 text-xs font-semibold mb-0.5">{item.title}</p>
                        <p className="text-white/35 text-[11px] leading-relaxed">{item.desc}</p>
                        {item.secrets && (
                          <div className="mt-2 space-y-1.5">
                            {item.secrets.map((s) => (
                              <div key={s.name} className="bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2">
                                <p className="text-amber-400/80 text-[11px] font-mono font-semibold">{s.name}</p>
                                <p className="text-white/30 text-[11px] mt-0.5">{s.value}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors">
                            <i className="ri-external-link-line" />
                            {item.linkText}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Ping từ khóa mới — banner nổi bật ── */}
        <div className="bg-gradient-to-r from-red-500/15 to-amber-500/10 border border-red-500/25 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <i className="ri-search-eye-line text-red-400 text-lg" />
                <h3 className="text-white font-bold text-sm">Ping từ khóa mới lên Google</h3>
                <span className="text-[11px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">Mới</span>
              </div>
              <p className="text-white/45 text-xs leading-relaxed max-w-lg">
                Vừa cập nhật từ khóa không dấu (phim hanh dong, phim tinh cam, phim han quoc...). Ping ngay để Google crawl lại <strong className="text-white/70">50+ trang</strong> và cập nhật từ khóa mới nhanh nhất.
              </p>
              {keywordResult && (
                <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg w-fit ${
                  keywordResult.failed === 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                  <i className={keywordResult.failed === 0 ? 'ri-checkbox-circle-fill' : 'ri-error-warning-line'} />
                  <span>{keywordResult.message}</span>
                  <span className="text-white/30">·</span>
                  <span>OK: <strong>{keywordResult.success}</strong>/{keywordResult.total}</span>
                  {keywordResult.failed > 0 && <span className="text-red-400">Lỗi: {keywordResult.failed}</span>}
                </div>
              )}
            </div>
            <button
              onClick={handlePingKeywords}
              disabled={pingingKeywords}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
            >
              {pingingKeywords ? (
                <><i className="ri-loader-4-line animate-spin" /> Đang ping 50+ trang...</>
              ) : (
                <><i className="ri-send-plane-fill" /> Ping ngay</>
              )}
            </button>
          </div>
        </div>

        {/* ── Ping 5 URL SEO landing vừa fix canonical ── */}
        <div className="bg-gradient-to-r from-blue-500/15 to-indigo-500/10 border border-blue-500/25 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <i className="ri-seo-line text-blue-400 text-lg" />
                <h2 className="text-white font-bold text-sm">Ping 6 URL Canonical Đã Fix</h2>
                <span className="text-[11px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-semibold">Canonical fixed</span>
              </div>
              <p className="text-white/45 text-xs leading-relaxed mb-3">
                6 URL canonical vừa được sửa (đổi từ <code className="text-blue-300/70 bg-blue-500/10 px-1 rounded text-[11px]">-seo</code> sang URL chuẩn) — ping ngay để Google crawl lại và index đúng canonical.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SEO_LANDING_FIXED.map((p) => (
                  <a
                    key={p.url}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-[11px] text-white/50 hover:text-white/70 transition-all"
                  >
                    <i className={`${p.icon} text-blue-400/60`} />
                    {p.label}
                    <i className="ri-external-link-line text-[10px] text-white/20" />
                  </a>
                ))}
              </div>
              {seoResult && (
                <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg w-fit ${
                  seoResult.failed === 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                  <i className={seoResult.failed === 0 ? 'ri-checkbox-circle-fill' : 'ri-error-warning-line'} />
                  <span>{seoResult.message}</span>
                  <span className="text-white/30">·</span>
                  <span>OK: <strong>{seoResult.success}</strong>/{seoResult.total}</span>
                  {seoResult.failed > 0 && <span className="text-red-400">Lỗi: {seoResult.failed}</span>}
                </div>
              )}
            </div>
            <button
              onClick={handlePingSEO}
              disabled={pingingSEO}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
            >
              {pingingSEO ? (
                <><i className="ri-loader-4-line animate-spin" /> Đang ping 6 URL...</>
              ) : (
                <><i className="ri-send-plane-fill" /> Ping 6 URL Canonical</>
              )}
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: 'ri-timer-flash-line',
              label: 'Cron Status',
              value: 'Active',
              sub: 'Đã fix — chạy 8:00 sáng',
              color: 'text-emerald-400',
              bg: 'bg-emerald-500/10',
              dot: true,
            },
            {
              icon: 'ri-links-line',
              label: 'URL/lần',
              value: lastLog ? String(lastLog.total_movies) : '~50+',
              sub: 'Phim + trang danh mục',
              color: 'text-amber-400',
              bg: 'bg-amber-500/10',
              dot: false,
            },
            {
              icon: 'ri-checkbox-circle-line',
              label: 'Lần cuối OK',
              value: lastLog ? `${lastLog.pinged_ok}/${lastLog.total_movies}` : '—',
              sub: lastLog ? timeAgo(lastLog.run_at) : 'Chưa có',
              color: 'text-red-400',
              bg: 'bg-red-500/10',
              dot: false,
            },
            {
              icon: 'ri-history-line',
              label: 'Tổng lần chạy',
              value: String(logs.length),
              sub: '20 lần gần nhất',
              color: 'text-white/60',
              bg: 'bg-white/5',
              dot: false,
            },
          ].map((card, i) => (
            <div key={i} className={`${card.bg} border border-white/[0.06] rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <i className={`${card.icon} ${card.color} text-base`} />
                <span className="text-white/40 text-xs">{card.label}</span>
              </div>
              <p className={`${card.color} font-bold text-xl flex items-center gap-2`}>
                {card.dot && <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />}
                {card.value}
              </p>
              <p className="text-white/30 text-[11px] mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── URL Coverage ── */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Static pages */}
          <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <i className="ri-pages-line text-white/40 text-sm" />
              <h3 className="text-white/70 font-semibold text-xs uppercase tracking-wider">Trang Tĩnh Được Ping</h3>
              <span className="ml-auto text-[11px] text-white/25 bg-white/[0.04] px-2 py-0.5 rounded-md">{STATIC_PAGES.length} trang</span>
            </div>
            <div className="p-3 space-y-1">
              {STATIC_PAGES.map((p) => (
                <div key={p.url} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] group">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    p.priority === 'high' ? 'bg-red-400' : p.priority === 'med' ? 'bg-amber-400' : 'bg-white/20'
                  }`} />
                  <i className={`${p.icon} text-xs text-white/25 w-3 text-center`} />
                  <span className="text-[12px] text-white/55 flex-1 truncate">{p.label}</span>
                  <a href={p.url} target="_blank" rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="ri-external-link-line text-xs text-white/30 hover:text-white/60" />
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Year pages */}
          <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <i className="ri-calendar-2-line text-white/40 text-sm" />
              <h3 className="text-white/70 font-semibold text-xs uppercase tracking-wider">Trang Theo Năm</h3>
              <span className="ml-auto text-[11px] text-white/25 bg-white/[0.04] px-2 py-0.5 rounded-md">{YEAR_PAGES.length} trang</span>
            </div>
            <div className="p-3 grid grid-cols-2 gap-1">
              {YEAR_PAGES.map((p) => (
                <div key={p.url} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] group">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    p.label.includes(String(CURRENT_YEAR)) ? 'bg-red-400' : 'bg-white/20'
                  }`} />
                  <span className="text-[11px] text-white/50 flex-1 truncate">{p.label}</span>
                  <a href={p.url} target="_blank" rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="ri-external-link-line text-[10px] text-white/30 hover:text-white/60" />
                  </a>
                </div>
              ))}
            </div>
            <div className="px-4 pb-3">
              <div className="flex items-center gap-3 text-[11px] text-white/25 mt-1">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> Năm hiện tại</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white/20 inline-block" /> Năm trước</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Trigger Panel ── */}
        <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
            <i className="ri-send-plane-line text-red-400" />
            <h3 className="text-white font-semibold text-sm">Trigger Ping Thủ Công</h3>
          </div>

          <div className="p-5">
            {/* Tabs */}
            <div className="flex gap-1 mb-5 bg-white/[0.04] rounded-xl p-1 w-fit">
              {([
                { key: 'auto',   label: 'Phim mới tự động', icon: 'ri-robot-line' },
                { key: 'manual', label: 'Nhập slug',         icon: 'ri-edit-line' },
                { key: 'static', label: 'Trang danh mục',   icon: 'ri-pages-line' },
              ] as const).map((t) => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === t.key ? 'bg-red-500 text-white' : 'text-white/40 hover:text-white'
                  }`}>
                  <i className={`${t.icon} text-sm`} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab: Auto */}
            {activeTab === 'auto' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-white/50 text-sm">Phim mới trong</span>
                  <select value={withinHours} onChange={(e) => setWithinHours(Number(e.target.value))}
                    className="bg-white/[0.06] border border-white/[0.12] text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-500/50 cursor-pointer">
                    {[6, 12, 24, 26, 48, 72].map((h) => (
                      <option key={h} value={h} className="bg-[#0d0f18]">{h} giờ</option>
                    ))}
                  </select>
                </div>
                <ToggleOptions pingStatic={pingStatic} setPingStatic={setPingStatic} pingYear={pingYear} setPingYear={setPingYear} />
              </div>
            )}

            {/* Tab: Manual */}
            {activeTab === 'manual' && (
              <div className="space-y-3">
                <div>
                  <label className="text-white/50 text-xs mb-1.5 block">Nhập slug phim (mỗi dòng 1 slug)</label>
                  <textarea value={customSlugs} onChange={(e) => setCustomSlugs(e.target.value)}
                    placeholder={'avengers-endgame\nsquid-game-2\nparasite'} rows={4}
                    className="w-full bg-white/[0.04] border border-white/[0.10] text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-red-500/40 placeholder-white/20 resize-none font-mono" />
                </div>
                <ToggleOptions pingStatic={pingStatic} setPingStatic={setPingStatic} pingYear={pingYear} setPingYear={setPingYear} />
              </div>
            )}

            {/* Tab: Static only */}
            {activeTab === 'static' && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <p className="text-white/50 text-sm mb-2">
                  Ping tất cả <strong className="text-white/70">{STATIC_PAGES.length + YEAR_PAGES.length} trang danh mục</strong> lên Google — không ping phim cụ thể.
                </p>
                <p className="text-white/30 text-xs">
                  Dùng khi muốn Google re-crawl các trang danh sách (phim-le, phim-bo, phim-moi-cap-nhat, trang năm...) mà không cần phim mới.
                </p>
              </div>
            )}

            {/* Ping button */}
            <div className="mt-4 flex items-center gap-3">
              <button onClick={handlePing} disabled={pinging || (activeTab === 'manual' && !customSlugs.trim())}
                className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap">
                {pinging ? (
                  <><i className="ri-loader-4-line animate-spin" /> Đang ping...</>
                ) : (
                  <><i className="ri-send-plane-fill" />
                    {activeTab === 'auto'   && `Ping phim mới (${withinHours}h)`}
                    {activeTab === 'manual' && `Ping ${customSlugs.split('\n').filter((s) => s.trim()).length} slug`}
                    {activeTab === 'static' && `Ping ${STATIC_PAGES.length + YEAR_PAGES.length} trang danh mục`}
                  </>
                )}
              </button>
              {pinging && (
                <span className="text-xs text-white/30 animate-pulse">Đang gửi yêu cầu đến Google...</span>
              )}
            </div>

            {/* Result */}
            {lastResult && <PingResultBox result={lastResult} />}
          </div>
        </div>

        {/* ── Logs ── */}
        <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className="ri-list-check-3 text-white/50" />
              <h3 className="text-white font-semibold text-sm">Lịch Sử Ping</h3>
              <span className="text-white/25 text-xs">(20 lần gần nhất)</span>
            </div>
            {loadingLogs && <i className="ri-loader-4-line animate-spin text-white/30 text-sm" />}
          </div>

          {logs.length === 0 && !loadingLogs ? (
            <div className="py-12 text-center">
              <i className="ri-inbox-line text-4xl text-white/10 block mb-2" />
              <p className="text-white/30 text-sm">Chưa có lịch sử ping nào</p>
              <p className="text-white/20 text-xs mt-1">Cron job tự chạy lúc 8:00 sáng, hoặc trigger thủ công ở trên</p>
              <div className="mt-4 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
                <i className="ri-information-line text-amber-400 text-sm" />
                <p className="text-amber-400/80 text-xs">
                  Cần setup Google Credentials trước khi ping thành công
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {logs.map((log) => (
                <div key={log.id}>
                  <button onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer text-left">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      log.pinged_fail === 0 ? 'bg-emerald-400' : log.pinged_ok > 0 ? 'bg-amber-400' : 'bg-red-400'
                    }`} />
                    <div className="flex-shrink-0 w-36">
                      <p className="text-white/70 text-xs font-medium">{formatDate(log.run_at)}</p>
                      <p className="text-white/25 text-[11px]">{timeAgo(log.run_at)}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                        log.triggered_by === 'cron-daily' ? 'bg-white/[0.06] text-white/40' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {log.triggered_by === 'cron-daily' ? 'Tự động' : 'Thủ công'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="text-center">
                        <p className="text-white/60 text-xs font-semibold">{log.total_movies}</p>
                        <p className="text-white/25 text-[10px]">URL</p>
                      </div>
                      <div className="text-center">
                        <p className="text-emerald-400 text-xs font-semibold">{log.pinged_ok}</p>
                        <p className="text-white/25 text-[10px]">OK</p>
                      </div>
                      {log.pinged_fail > 0 && (
                        <div className="text-center">
                          <p className="text-red-400 text-xs font-semibold">{log.pinged_fail}</p>
                          <p className="text-white/25 text-[10px]">lỗi</p>
                        </div>
                      )}
                      {(log.static_pages_pinged ?? 0) > 0 && (
                        <div className="text-center hidden sm:block">
                          <p className="text-amber-400 text-xs font-semibold">{log.static_pages_pinged}</p>
                          <p className="text-white/25 text-[10px]">trang TM</p>
                        </div>
                      )}
                      <div className="flex-1 hidden sm:block">
                        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${successRate(log)}%` }} />
                        </div>
                        <p className="text-white/25 text-[10px] mt-0.5">{successRate(log)}% thành công</p>
                      </div>
                    </div>
                    <i className={`ri-arrow-down-s-line text-white/20 text-sm flex-shrink-0 transition-transform ${expandedLog === log.id ? 'rotate-180' : ''}`} />
                  </button>

                  {expandedLog === log.id && (
                    <div className="px-5 pb-4">
                      {log.failed_slugs.length > 0 ? (
                        <>
                          <p className="text-red-400/70 text-[11px] font-semibold uppercase tracking-wider mb-2">URL bị lỗi:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {log.failed_slugs.map((slug) => (
                              <Link key={slug} to={`/phim/${encodeURIComponent(slug)}`} target="_blank"
                                className="text-[11px] text-red-400/70 hover:text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md font-mono">
                                {slug}
                              </Link>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-emerald-400/60 text-xs flex items-center gap-1.5">
                          <i className="ri-checkbox-circle-line" />
                          Tất cả URL đã được ping thành công!
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Info ── */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
          <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
            <i className="ri-information-line text-white/30" />
            Cách hoạt động
          </h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: 'ri-film-line',       title: 'Phim mới',         desc: 'Fetch phim mới từ OPhim API trong 26h qua, ping từng URL /phim/[slug] lên Google Indexing API' },
              { icon: 'ri-pages-line',      title: 'Trang danh mục',   desc: `Ping ${STATIC_PAGES.length} trang tĩnh (phim-moi-cap-nhat, phim-le...) + ${YEAR_PAGES.length} trang năm mỗi lần chạy` },
              { icon: 'ri-bar-chart-line',  title: 'Quota Google',     desc: 'Google cho phép 200 URL/ngày miễn phí. Hệ thống batch 10 URL/lần, delay 300ms để tránh rate limit' },
            ].map((item, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.04] flex-shrink-0 mt-0.5">
                  <i className={`${item.icon} text-white/40 text-sm`} />
                </div>
                <div>
                  <p className="text-white/60 text-xs font-semibold mb-0.5">{item.title}</p>
                  <p className="text-white/30 text-[11px] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */
function ToggleOptions({
  pingStatic, setPingStatic, pingYear, setPingYear,
}: {
  pingStatic: boolean; setPingStatic: (v: boolean) => void;
  pingYear: boolean;   setPingYear:   (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex items-center gap-2 cursor-pointer group">
        <div onClick={() => setPingStatic(!pingStatic)}
          className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${pingStatic ? 'bg-red-500' : 'bg-white/[0.10]'}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${pingStatic ? 'left-4' : 'left-0.5'}`} />
        </div>
        <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors whitespace-nowrap">
          Ping {STATIC_PAGES.length} trang tĩnh
        </span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer group">
        <div onClick={() => setPingYear(!pingYear)}
          className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${pingYear ? 'bg-red-500' : 'bg-white/[0.10]'}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${pingYear ? 'left-4' : 'left-0.5'}`} />
        </div>
        <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors whitespace-nowrap">
          Ping {YEAR_PAGES.length} trang năm
        </span>
      </label>
    </div>
  );
}

function PingResultBox({ result }: { result: PingResult }) {
  const isError   = !!result.error;
  const isEmpty   = result.total_movies === 0 && !isError;
  const isSuccess = !isError && !isEmpty && result.pinged_fail === 0;

  return (
    <div className={`mt-4 rounded-xl p-4 border ${
      isError   ? 'bg-red-500/10 border-red-500/25' :
      isEmpty   ? 'bg-amber-500/10 border-amber-500/25' :
      isSuccess ? 'bg-emerald-500/10 border-emerald-500/25' :
                  'bg-amber-500/10 border-amber-500/25'
    }`}>
      <div className="flex items-start gap-3">
        <i className={`text-lg mt-0.5 ${
          isError   ? 'ri-error-warning-line text-red-400' :
          isEmpty   ? 'ri-information-line text-amber-400' :
          isSuccess ? 'ri-checkbox-circle-fill text-emerald-400' :
                      'ri-error-warning-line text-amber-400'
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium">{result.message}</p>

          {result.summary && (
            <div className="flex flex-wrap gap-4 mt-2 text-xs">
              <span className="text-white/50">
                Phim: <strong className="text-emerald-400">{result.summary.movie_pages.ok}</strong>/{result.summary.movie_pages.total}
              </span>
              <span className="text-white/50">
                Trang TM: <strong className="text-amber-400">{result.summary.static_pages.ok}</strong>/{result.summary.static_pages.total}
              </span>
              <span className="text-white/50">
                Trang năm: <strong className="text-amber-400">{result.summary.year_pages.ok}</strong>/{result.summary.year_pages.total}
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-white/40">
            <span>Tổng: <strong className="text-white/70">{result.total_movies}</strong></span>
            <span>OK: <strong className="text-emerald-400">{result.pinged_ok}</strong></span>
            {result.pinged_fail > 0 && <span>Lỗi: <strong className="text-red-400">{result.pinged_fail}</strong></span>}
            <span>{new Date(result.run_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          {result.sample_movies.length > 0 && (
            <div className="mt-2">
              <p className="text-white/30 text-[11px] mb-1">Phim đã ping:</p>
              <div className="flex flex-wrap gap-1">
                {result.sample_movies.map((m) => (
                  <Link key={m.slug} to={`/phim/${encodeURIComponent(m.slug)}`} target="_blank"
                    className="text-[11px] text-red-400/70 hover:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md">
                    {m.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Credentials error hint */}
          {result.message?.includes('Missing GOOGLE_SERVICE_ACCOUNT') && (
            <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              <p className="text-amber-400 text-xs font-semibold flex items-center gap-1.5">
                <i className="ri-key-2-line" />
                Cần setup Google Credentials
              </p>
              <p className="text-white/40 text-[11px] mt-0.5">
                Xem hướng dẫn ở banner vàng phía trên để thêm <code className="text-amber-400/80">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> và <code className="text-amber-400/80">GOOGLE_SERVICE_ACCOUNT_KEY</code> vào Supabase Secrets.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
