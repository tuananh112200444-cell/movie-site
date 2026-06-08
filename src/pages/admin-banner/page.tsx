import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ChangePinPanel from './components/ChangePinPanel';

const TRACKED_URL = 'https://gg8834.com/?id=662541355';

interface ClickRecord {
  id: string;
  url: string;
  page_path: string;
  user_agent: string;
  clicked_at: string;
}

interface HourlyStat { gio: number; so_click: number; }
interface DailyStat { ngay: string; so_click: number; users: number; }
interface PageStat { page_path: string; so_click: number; }
interface DeviceStat { ten: string; so_click: number; }

function getVnDateString(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function getVnHour(iso: string): number {
  return parseInt(
    new Date(iso).toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false,
    }).split(':')[0], 10
  );
}

function getVnDateIso(iso: string): string {
  const parts = getVnDateString(iso).split('/');
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function getTodayIso(): string {
  const todayVn = new Date().toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = todayVn.split('/');
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function getVnNowString(): string {
  return new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function parseDevice(ua: string): string {
  if (!ua) return 'Không xác định';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone / iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Khác';
}

export default function AdminBannerPage() {
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStat[]>([]);
  const [pageStats, setPageStats] = useState<PageStat[]>([]);
  const [deviceStats, setDeviceStats] = useState<DeviceStat[]>([]);
  const [clickLog, setClickLog] = useState<ClickRecord[]>([]);
  const [totalClicks, setTotalClicks] = useState(0);
  const [todayClicks, setTodayClicks] = useState(0);
  const [totalUniqueUsers, setTotalUniqueUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [dateRange, setDateRange] = useState<'7' | '14' | '30' | '90' | 'all'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'log' | 'security'>('overview');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [testClickStatus, setTestClickStatus] = useState<string>('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setDebugInfo('');
    try {
      const todayVn = new Date().toLocaleDateString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
      });
      const todayIso = getTodayIso();

      // Single query for all stats within date range
      let query = supabase
        .from('banner_clicks')
        .select('id, clicked_at, page_path, user_agent')
        .eq('url', TRACKED_URL)
        .order('clicked_at', { ascending: false });

      if (dateRange !== 'all') {
        const days = parseInt(dateRange, 10);
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        query = query.gte('clicked_at', fromDate.toISOString());
      }

      const { data: rows, error } = await query;

      if (error) {
        console.error('Admin banner query error:', error);
        setDebugInfo(`Query error: ${error.message} (code: ${error.code})`);
        setTotalClicks(0);
        setTodayClicks(0);
        setDailyStats([]);
        setHourlyStats(Array.from({ length: 24 }, (_, gio) => ({ gio, so_click: 0 })));
        setPageStats([]);
        setDeviceStats([]);
        setLoading(false);
        return;
      }

      const data = (rows ?? []) as { id: string; clicked_at: string; page_path: string; user_agent: string }[];
      setDebugInfo(`Query OK — ${data.length} rows returned`);
      setTotalClicks(data.length);

      const allAgents = new Set(data.map((r) => r.user_agent));
      setTotalUniqueUsers(allAgents.size);

      const dayMap: Record<string, number> = {};
      const dayUserMap: Record<string, Set<string>> = {};
      const hourMap: Record<number, number> = {};
      const pageMap: Record<string, number> = {};
      const deviceMap: Record<string, number> = {};
      let todayCount = 0;

      data.forEach((r) => {
        const vnDay = getVnDateIso(r.clicked_at);
        const vnHour = getVnHour(r.clicked_at);
        const path = r.page_path || '/';
        const device = parseDevice(r.user_agent);

        dayMap[vnDay] = (dayMap[vnDay] ?? 0) + 1;
        if (!dayUserMap[vnDay]) dayUserMap[vnDay] = new Set();
        dayUserMap[vnDay].add(r.user_agent);
        if (vnDay === todayIso) {
          todayCount++;
          hourMap[vnHour] = (hourMap[vnHour] ?? 0) + 1;
        }
        pageMap[path] = (pageMap[path] ?? 0) + 1;
        deviceMap[device] = (deviceMap[device] ?? 0) + 1;
      });

      setTodayClicks(todayCount);

      const daily: DailyStat[] = Object.entries(dayMap)
        .map(([ngay, so_click]) => ({ ngay, so_click, users: dayUserMap[ngay]?.size ?? 0 }))
        .sort((a, b) => b.ngay.localeCompare(a.ngay));
      setDailyStats(daily);

      const hourly: HourlyStat[] = Array.from({ length: 24 }, (_, gio) => ({
        gio, so_click: hourMap[gio] ?? 0,
      }));
      setHourlyStats(hourly);

      const pages: PageStat[] = Object.entries(pageMap)
        .map(([page_path, so_click]) => ({ page_path, so_click }))
        .sort((a, b) => b.so_click - a.so_click)
        .slice(0, 15);
      setPageStats(pages);

      const devices: DeviceStat[] = Object.entries(deviceMap)
        .map(([ten, so_click]) => ({ ten, so_click }))
        .sort((a, b) => b.so_click - a.so_click);
      setDeviceStats(devices);

      // Log query: 100 most recent clicks (all time)
      const { data: logData, error: logErr } = await supabase
        .from('banner_clicks')
        .select('id, url, page_path, user_agent, clicked_at')
        .eq('url', TRACKED_URL)
        .order('clicked_at', { ascending: false })
        .limit(100);
      if (logErr) {
        console.error('Admin banner log error:', logErr);
      }
      setClickLog((logData ?? []) as ClickRecord[]);

      const now = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      setLastUpdated(`${todayVn} ${now}`);
    } catch (err) {
      console.error('Admin banner fetchStats error:', err);
      setDebugInfo(`Exception: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  const handleTestClick = async () => {
    setTestClickStatus('Đang gửi...');
    try {
      const { error } = await supabase
        .from('banner_clicks')
        .insert({
          url: TRACKED_URL,
          page_path: '/admin/test',
          user_agent: navigator.userAgent.slice(0, 250),
          clicked_at: new Date().toISOString(),
        });
      if (error) {
        setTestClickStatus(`Lỗi: ${error.message}`);
      } else {
        setTestClickStatus('✓ Đã thêm 1 click test!');
        setTimeout(() => {
          fetchStats();
          setTestClickStatus('');
        }, 500);
      }
    } catch (e) {
      setTestClickStatus(`Lỗi: ${String(e)}`);
    }
  };

  // Realtime subscription for instant click updates
  useEffect(() => {
    const channel = supabase
      .channel('banner_clicks_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'banner_clicks', filter: `url=eq.${TRACKED_URL}` },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchStats, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchStats]);

  const maxDaily = useMemo(() => Math.max(...dailyStats.map((d) => d.so_click), 1), [dailyStats]);
  const maxHourly = useMemo(() => Math.max(...hourlyStats.map((h) => h.so_click), 1), [hourlyStats]);
  const maxPage = useMemo(() => Math.max(...pageStats.map((p) => p.so_click), 1), [pageStats]);
  const maxDevice = useMemo(() => Math.max(...deviceStats.map((d) => d.so_click), 1), [deviceStats]);
  const peakHour = useMemo(() => {
    return hourlyStats.reduce((a, b) => (a.so_click > b.so_click ? a : b), { gio: 0, so_click: 0 });
  }, [hourlyStats]);

  const yesterdayClicks = useMemo(() => {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yestStr = yest.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).split('/').reverse().join('-');
    return dailyStats.find((d) => d.ngay === yestStr)?.so_click ?? 0;
  }, [dailyStats]);

  const avgDaily = useMemo(() => {
    if (dailyStats.length === 0) return 0;
    return Math.round(dailyStats.reduce((s, d) => s + d.so_click, 0) / dailyStats.length);
  }, [dailyStats]);

  // Build a complete daily table with all days from first click to today
  const dailyTable = useMemo(() => {
    if (dailyStats.length === 0) return [];
    const todayIso = getTodayIso();
    const firstDay = dailyStats[dailyStats.length - 1].ngay;

    // Build map for quick lookup
    const map: Record<string, number> = {};
    dailyStats.forEach((d) => { map[d.ngay] = d.so_click; });

    const result: { ngay: string; iso: string; so_click: number; users: number; isToday: boolean; isYesterday: boolean }[] = [];

    // Start from today and go backwards to first day
    const [fy, fm, fd] = firstDay.split('-').map(Number);
    const start = new Date(fy, fm - 1, fd);
    const [ty, tm, td] = todayIso.split('-').map(Number);
    const end = new Date(ty, tm - 1, td);

    // Go from end to start
    let cursor = new Date(end);
    while (cursor >= start) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const dayName = cursor.toLocaleDateString('vi-VN', { weekday: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
      const dateStr = cursor.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

      const dayStat = dailyStats.find((d) => d.ngay === iso);
      result.push({
        ngay: `${dayName}, ${dateStr}`,
        iso,
        so_click: map[iso] ?? 0,
        users: dayStat?.users ?? 0,
        isToday: iso === todayIso,
        isYesterday: iso === `${ty}-${String(tm).padStart(2, '0')}-${String(td - 1).padStart(2, '0')}`,
      });

      cursor.setDate(cursor.getDate() - 1);
    }

    return result;
  }, [dailyStats]);

  const todayIsoStr = getTodayIso();
  const vnNow = getVnNowString();

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <title>Admin Banner Stats | KhoPhim</title>
      <meta name="robots" content="noindex, nofollow" />

      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/" className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
              <i className="ri-arrow-left-line" />
            </Link>
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-amber-500/15">
              <i className="ri-bar-chart-box-line text-amber-400 text-sm" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm">Thống kê Banner Click</h1>
              <p className="text-white/25 text-[11px] truncate max-w-[260px] sm:max-w-md">{TRACKED_URL}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#1a1d2e] border border-white/[0.08] rounded-xl p-1">
              {([
                { key: '7' as const, label: '7 ngày' },
                { key: '14' as const, label: '14 ngày' },
                { key: '30' as const, label: '30 ngày' },
                { key: '90' as const, label: '3 tháng' },
                { key: 'all' as const, label: 'Tất cả' },
              ]).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setDateRange(r.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                    dateRange === r.key ? 'bg-amber-500 text-white' : 'text-white/35 hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                  : 'bg-[#1a1d2e] border-white/[0.08] text-white/30 hover:text-white'
              }`}
              title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh'}
            >
              <i className={`ri-refresh-line text-xs ${autoRefresh ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={fetchStats}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1a1d2e] border border-white/[0.08] text-white/30 hover:text-white transition-all cursor-pointer"
              title="Làm mới"
            >
              <i className="ri-refresh-line text-xs" />
            </button>
          </div>
        </div>
      </div>

      {/* Sub nav */}
      <div className="border-b border-white/[0.04] bg-[#0a0c14]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex gap-1">
          {([
            { key: 'overview' as const, label: 'Tổng quan', icon: 'ri-dashboard-line' },
            { key: 'log' as const, label: 'Nhật ký click', icon: 'ri-list-check' },
            { key: 'security' as const, label: 'Bảo mật', icon: 'ri-shield-keyhole-line' },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-[12px] font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === t.key
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-white/30 hover:text-white/60'
              }`}
            >
              <i className={t.icon} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {/* Status bar */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-white/20 text-[11px] flex-wrap">
            <span>Cập nhật: <span className="text-white/40">{lastUpdated || '—'}</span></span>
            <span className="text-white/15">|</span>
            <span>Giờ VN: <span className="text-white/40">{vnNow}</span></span>
            {autoRefresh && <span className="text-emerald-400/70 text-[10px]">Auto 30s</span>}
            {debugInfo && <span className="text-amber-400/70 text-[10px]">{debugInfo}</span>}
          </div>
          <div className="flex items-center gap-2">
            {testClickStatus && (
              <span className={`text-[11px] ${testClickStatus.startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>
                {testClickStatus}
              </span>
            )}
            <button
              onClick={handleTestClick}
              disabled={!!testClickStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[11px] font-medium hover:bg-amber-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <i className="ri-add-line text-xs" />
              Test thêm 1 click
            </button>
            {loading && (
              <div className="flex items-center gap-1.5 text-white/25 text-[11px]">
                <i className="ri-loader-4-line animate-spin" /> Đang tải...
              </div>
            )}
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Big summary card */}
            <div className="bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/15 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-amber-500/15">
                  <i className="ri-links-line text-amber-400 text-lg" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm">Link đang theo dõi</h2>
                  <p className="text-amber-400/60 text-[11px] font-mono break-all">{TRACKED_URL}</p>
                </div>
              </div>
              <p className="text-white/30 text-[11px]">
                Mỗi lần người dùng click vào banner có link này, hệ thống tự động ghi nhận.
                Tổng hiện tại: <span className="text-white font-bold">{totalClicks.toLocaleString('vi-VN')}</span> lượt click.
              </p>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-500/12">
                    <i className="ri-cursor-line text-amber-400 text-[10px]" />
                  </div>
                  <span className="text-white/30 text-[10px]">Tổng click</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">{totalClicks.toLocaleString('vi-VN')}</p>
              </div>
              <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/12">
                    <i className="ri-calendar-check-line text-emerald-400 text-[10px]" />
                  </div>
                  <span className="text-white/30 text-[10px]">Hôm nay</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">{todayClicks.toLocaleString('vi-VN')}</p>
                <p className="text-[9px] text-white/15 mt-0.5">{todayIsoStr}</p>
              </div>
              <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.05]">
                    <i className="ri-calendar-close-line text-white/30 text-[10px]" />
                  </div>
                  <span className="text-white/30 text-[10px]">Hôm qua</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">{yesterdayClicks.toLocaleString('vi-VN')}</p>
                <p className="text-[9px] text-white/15 mt-0.5">
                  {(() => {
                    const yest = new Date();
                    yest.setDate(yest.getDate() - 1);
                    return yest.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' });
                  })()}
                </p>
              </div>
              <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-violet-500/12">
                    <i className="ri-time-line text-violet-400 text-[10px]" />
                  </div>
                  <span className="text-white/30 text-[10px]">Giờ cao điểm</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">{peakHour.gio}:00</p>
                <p className="text-[10px] text-white/25 mt-0.5">{peakHour.so_click} click</p>
              </div>
              <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-rose-500/12">
                    <i className="ri-fire-line text-rose-400 text-[10px]" />
                  </div>
                  <span className="text-white/30 text-[10px]">Kỷ lục/ngày</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">{dailyStats.length === 0 ? 0 : maxDaily.toLocaleString('vi-VN')}</p>
              </div>
              <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-sky-500/12">
                    <i className="ri-bar-chart-grouped-line text-sky-400 text-[10px]" />
                  </div>
                  <span className="text-white/30 text-[10px]">TB/ngày</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">{avgDaily.toLocaleString('vi-VN')}</p>
              </div>
              <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-pink-500/12">
                    <i className="ri-user-line text-pink-400 text-[10px]" />
                  </div>
                  <span className="text-white/30 text-[10px]">Người dùng</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white">{totalUniqueUsers.toLocaleString('vi-VN')}</p>
                <p className="text-[9px] text-white/15 mt-0.5">Unique user-agent</p>
              </div>
            </div>

            {/* Fallback message if filtered results empty but records exist */}
            {!loading && totalClicks === 0 && dateRange !== 'all' && (
              <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl p-4 flex items-center gap-3">
                <i className="ri-information-line text-amber-400 text-sm" />
                <div className="flex-1">
                  <p className="text-amber-400 text-xs font-medium">Không có click nào trong khoảng {dateRange} ngày qua.</p>
                  <p className="text-white/30 text-[11px] mt-0.5">Có thể do đồng hồ hệ thống khác timezone. Thử chọn <button onClick={() => setDateRange('all')} className="text-amber-400 underline cursor-pointer">Tất cả</button> để xem toàn bộ dữ liệu.</p>
                </div>
              </div>
            )}

            {/* DAILY BREAKDOWN TABLE — the key feature the user wants */}
            <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-[13px] flex items-center gap-2">
                  <i className="ri-calendar-event-line text-emerald-400" /> Chi tiết click từng ngày
                </h2>
                <span className="text-white/20 text-[10px]">Timezone: Asia/Ho_Chi_Minh (UTC+7)</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-white/30">
                  <i className="ri-loader-4-line animate-spin text-sm mr-2" /> Đang tải...
                </div>
              ) : dailyTable.length === 0 ? (
                <div className="text-center py-8 text-white/20 text-sm">Chưa có dữ liệu</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="py-2.5 px-3 text-[10px] font-medium text-white/25 uppercase tracking-wider">Ngày</th>
                        <th className="py-2.5 px-3 text-[10px] font-medium text-white/25 uppercase tracking-wider text-right">Số click</th>
                        <th className="py-2.5 px-3 text-[10px] font-medium text-white/25 uppercase tracking-wider text-right">Người dùng</th>
                        <th className="py-2.5 px-3 text-[10px] font-medium text-white/25 uppercase tracking-wider text-right">Click/User</th>
                        <th className="py-2.5 px-3 text-[10px] font-medium text-white/25 uppercase tracking-wider">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyTable.map((row, i) => {
                        const pct = maxDaily > 0 ? (row.so_click / maxDaily) * 100 : 0;
                        return (
                          <tr
                            key={row.iso}
                            className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${
                              row.isToday ? 'bg-emerald-500/[0.04]' : row.isYesterday ? 'bg-amber-500/[0.04]' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium ${
                                  row.isToday ? 'text-emerald-400' : row.isYesterday ? 'text-amber-400' : 'text-white/50'
                                }`}>
                                  {row.ngay}
                                </span>
                                {row.isToday && (
                                  <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-medium">Hôm nay</span>
                                )}
                                {row.isYesterday && (
                                  <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">Hôm qua</span>
                                )}
                              </div>
                              <p className="text-[10px] text-white/15 font-mono mt-0.5">{row.iso}</p>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={`text-sm font-bold ${
                                row.so_click > 0 ? 'text-white' : 'text-white/20'
                              }`}>
                                {row.so_click.toLocaleString('vi-VN')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={`text-xs font-medium ${row.users > 0 ? 'text-white/60' : 'text-white/20'}`}>
                                {row.users.toLocaleString('vi-VN')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={`text-xs font-medium ${row.users > 0 ? 'text-white/60' : 'text-white/20'}`}>
                                {row.users > 0 ? (Math.round((row.so_click / row.users) * 10) / 10).toFixed(1) : '0.0'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              {row.so_click > 0 ? (
                                <span className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                                  <i className="ri-checkbox-circle-line" /> Có click
                                </span>
                              ) : (
                                <span className="text-[10px] text-white/15">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Daily summary note */}
              {!loading && dailyTable.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-4 text-[10px] text-white/20 flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/60" /> Hôm nay</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500/60" /> Hôm qua</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/15" /> Ngày khác</span>
                  <span className="ml-auto">Kỷ lục: {maxDaily.toLocaleString('vi-VN')} click/ngày</span>
                </div>
              )}
            </div>

            {/* Hourly + Top pages */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3 bg-[#0d0f18] border border-white/[0.05] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold text-[13px] flex items-center gap-2">
                    <i className="ri-bar-chart-grouped-line text-amber-400" /> Click theo giờ — Hôm nay
                  </h2>
                  <span className="text-white/20 text-[10px]">{todayClicks} click</span>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-white/30">
                    <i className="ri-loader-4-line animate-spin" />
                    <span className="text-sm">Đang tải...</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {hourlyStats.map((h) => {
                      const pct = maxHourly > 0 ? (h.so_click / maxHourly) * 100 : 0;
                      const isCurrentHour = h.gio === getVnHour(new Date().toISOString());
                      return (
                        <div key={h.gio} className="flex items-center gap-2">
                          <span className={`w-9 text-right text-[10px] font-mono flex-shrink-0 ${isCurrentHour ? 'text-amber-400 font-bold' : 'text-white/25'}`}>
                            {String(h.gio).padStart(2, '0')}:00
                          </span>
                          <div className="flex-1 min-w-0 h-4 bg-white/[0.03] rounded overflow-hidden relative">
                            <div className={`h-full rounded transition-all duration-500 ${isCurrentHour ? 'bg-amber-500/80' : 'bg-amber-500/40'}`} style={{ width: `${pct}%` }} />
                            {h.so_click > 0 && (
                              <span className="absolute inset-0 flex items-center pl-2 text-[10px] font-bold text-white drop-shadow">{h.so_click}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 bg-[#0d0f18] border border-white/[0.05] rounded-xl p-5">
                <h2 className="text-white font-semibold text-[13px] mb-4 flex items-center gap-2">
                  <i className="ri-pages-line text-violet-400" /> Top trang
                </h2>
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-white/30"><i className="ri-loader-4-line animate-spin" /></div>
                ) : pageStats.length === 0 ? (
                  <div className="text-center py-8 text-white/20 text-xs">Chưa có dữ liệu</div>
                ) : (
                  <div className="space-y-2.5">
                    {pageStats.map((p, idx) => {
                      const pct = (p.so_click / maxPage) * 100;
                      return (
                        <div key={p.page_path}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold flex-shrink-0 ${idx < 3 ? 'bg-amber-500/15 text-amber-400' : 'bg-white/[0.04] text-white/25'}`}>
                              {idx + 1}
                            </span>
                            <span className="text-white/45 text-xs truncate flex-1 min-w-0">{p.page_path === '/' ? 'Trang chủ' : p.page_path}</span>
                            <span className="text-white/35 text-xs font-medium flex-shrink-0">{p.so_click}</span>
                          </div>
                          <div className="h-1 bg-white/[0.03] rounded-full overflow-hidden ml-7">
                            <div className="h-full rounded-full bg-violet-500/40" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Daily bar chart + Device */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3 bg-[#0d0f18] border border-white/[0.05] rounded-xl p-5">
                <h2 className="text-white font-semibold text-[13px] mb-4 flex items-center gap-2">
                  <i className="ri-bar-chart-line text-emerald-400" /> Biểu đồ click theo ngày
                </h2>
                {loading ? (
                  <div className="flex items-center justify-center py-16 text-white/30">
                    <i className="ri-loader-4-line animate-spin text-sm mr-2" /> Đang tải...
                  </div>
                ) : dailyStats.length === 0 ? (
                  <div className="text-center py-12 text-white/20 text-sm">Không có dữ liệu</div>
                ) : (
                  <div className="space-y-2.5">
                    {dailyStats.map((d) => {
                      const pct = (d.so_click / maxDaily) * 100;
                      const isToday = d.ngay === todayIsoStr;
                      return (
                        <div key={d.ngay} className="flex items-center gap-3">
                          <div className="w-16 text-right flex-shrink-0">
                            <p className={`text-xs font-medium ${isToday ? 'text-amber-400' : 'text-white/40'}`}>
                              {new Date(d.ngay + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                            </p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="h-6 bg-white/[0.03] rounded-md overflow-hidden relative">
                              <div className={`h-full rounded-md transition-all duration-500 ${isToday ? 'bg-emerald-500/70' : 'bg-emerald-500/35'}`} style={{ width: `${pct}%` }} />
                              <span className="absolute inset-0 flex items-center pl-2 text-[11px] font-semibold text-white drop-shadow">{d.so_click.toLocaleString('vi-VN')}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 bg-[#0d0f18] border border-white/[0.05] rounded-xl p-5">
                <h2 className="text-white font-semibold text-[13px] mb-4 flex items-center gap-2">
                  <i className="ri-smartphone-line text-sky-400" /> Thiết bị
                </h2>
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-white/30"><i className="ri-loader-4-line animate-spin" /></div>
                ) : deviceStats.length === 0 ? (
                  <div className="text-center py-8 text-white/20 text-xs">Chưa có dữ liệu</div>
                ) : (
                  <div className="space-y-3">
                    {deviceStats.map((d) => {
                      const pct = (d.so_click / maxDevice) * 100;
                      const icon = d.ten.includes('iPhone') ? 'ri-apple-line' : d.ten.includes('Android') ? 'ri-android-line' : d.ten.includes('Windows') ? 'ri-windows-line' : d.ten.includes('macOS') ? 'ri-apple-line' : 'ri-device-line';
                      return (
                        <div key={d.ten}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center gap-1.5 text-white/40 text-xs"><i className={`${icon} text-white/20 text-xs`} /> {d.ten}</span>
                            <span className="text-white/30 text-xs">{d.so_click}</span>
                          </div>
                          <div className="h-1.5 bg-white/[0.03] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-sky-500/40" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'log' && (
          <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-[13px] flex items-center gap-2">
                <i className="ri-list-check text-emerald-400" /> Nhật ký click gần đây (100 click)
              </h2>
              <span className="text-white/20 text-[10px]">Timezone: Asia/Ho_Chi_Minh (UTC+7)</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-white/30"><i className="ri-loader-4-line animate-spin" /><span className="text-sm">Đang tải...</span></div>
            ) : clickLog.length === 0 ? (
              <div className="text-center py-8 text-white/20 text-xs">Chưa có click nào</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="py-2 px-3 text-[10px] font-medium text-white/25 uppercase tracking-wider">Thời gian (VN)</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-white/25 uppercase tracking-wider">Trang</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-white/25 uppercase tracking-wider">Thiết bị</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-white/25 uppercase tracking-wider">URL đích</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clickLog.map((c, i) => {
                      const vnTime = new Date(c.clicked_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      const vnDate = getVnDateString(c.clicked_at);
                      return (
                        <tr key={c.id} className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i < 10 ? 'bg-amber-500/[0.02]' : ''}`}>
                          <td className="py-2 px-3 text-xs text-white/50 whitespace-nowrap">
                            <span className="text-white/30">{vnDate}</span> <span className="text-white/60 font-mono">{vnTime}</span>
                          </td>
                          <td className="py-2 px-3 text-xs text-white/40 truncate max-w-[200px]">{c.page_path === '/' ? 'Trang chủ' : c.page_path}</td>
                          <td className="py-2 px-3 text-xs text-white/30 whitespace-nowrap">{parseDevice(c.user_agent)}</td>
                          <td className="py-2 px-3 text-[10px] text-white/15 truncate max-w-[200px]">{c.url}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="max-w-md">
            <div className="bg-[#0d0f18] border border-white/[0.05] rounded-xl p-5 mb-4">
              <h2 className="text-white font-semibold text-[13px] mb-1 flex items-center gap-2">
                <i className="ri-shield-check-line text-emerald-400" /> Trạng thái bảo mật
              </h2>
              <p className="text-white/25 text-[11px] mb-4">Quản lý mật khẩu truy cập trang admin</p>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-500/8 border border-emerald-500/15 rounded-lg px-3 py-2">
                  <i className="ri-checkbox-circle-line" />
                  <span>Mật khẩu được hash SHA-256 + server-side salt</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-500/8 border border-emerald-500/15 rounded-lg px-3 py-2">
                  <i className="ri-checkbox-circle-line" />
                  <span>Khóa 30 phút sau 5 lần nhập sai</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-500/8 border border-emerald-500/15 rounded-lg px-3 py-2">
                  <i className="ri-checkbox-circle-line" />
                  <span>Token xác thực tự hủy sau 1 giờ</span>
                </div>
              </div>
            </div>
            <ChangePinPanel />
          </div>
        )}
      </div>
    </div>
  );
}