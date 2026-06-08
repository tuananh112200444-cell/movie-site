import { useEffect, useRef, useState, useCallback } from 'react';

interface CWVData {
  lcp: number | null;
  cls: number | null;
  fcp: number | null;
  inp: number | null;
  ttfb: number | null;
  lcpStatus: 'good' | 'needs' | 'poor' | 'pending';
  clsStatus: 'good' | 'needs' | 'poor' | 'pending';
  fcpStatus: 'good' | 'needs' | 'poor' | 'pending';
  inpStatus: 'good' | 'needs' | 'poor' | 'pending';
  ttfbStatus: 'good' | 'needs' | 'poor' | 'pending';
  pageLoadTime: number | null;
  domInteractive: number | null;
  domComplete: number | null;
  resourceCount: number;
  imageCount: number;
  totalTransferSize: number;
  heroImgUrl: string | null;
  lcpElementTag: string | null;
}

const STATUS_COLOR = {
  good: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  needs: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  poor: 'bg-red-500/20 text-red-400 border-red-500/30',
  pending: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
} as const;

const THRESHOLDS = {
  lcp: { good: 2500, needs: 4000 },
  cls: { good: 0.1, needs: 0.25 },
  fcp: { good: 1800, needs: 3000 },
  inp: { good: 200, needs: 500 },
  ttfb: { good: 800, needs: 1800 },
} as const;

function getStatus(value: number | null, metric: keyof typeof THRESHOLDS): CWVData[`${typeof metric}Status`] {
  if (value === null) return 'pending';
  const t = THRESHOLDS[metric];
  if (value <= t.good) return 'good';
  if (value <= t.needs) return 'needs';
  return 'poor';
}

function formatMs(ms: number | null): string {
  if (ms === null) return '---';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

/** Hook: lắng nghe PerformanceObserver và trả về CWV data real-time */
function useCWVMonitor(): CWVData {
  const [data, setData] = useState<CWVData>({
    lcp: null, cls: null, fcp: null, inp: null, ttfb: null,
    lcpStatus: 'pending', clsStatus: 'pending', fcpStatus: 'pending',
    inpStatus: 'pending', ttfbStatus: 'pending',
    pageLoadTime: null, domInteractive: null, domComplete: null,
    resourceCount: 0, imageCount: 0, totalTransferSize: 0,
    heroImgUrl: null, lcpElementTag: null,
  });

  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    // Navigation timing
    const updateNavTiming = () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!nav) return;
      setData((prev) => ({
        ...prev,
        pageLoadTime: nav.loadEventEnd - nav.startTime,
        domInteractive: nav.domInteractive - nav.startTime,
        domComplete: nav.domComplete - nav.startTime,
        ttfb: nav.responseStart - nav.startTime,
        ttfbStatus: getStatus(nav.responseStart - nav.startTime, 'ttfb'),
      }));
    };
    // Delay để navigation entry sẵn sàng
    const navTimer = setTimeout(updateNavTiming, 100);

    // LCP Observer
    let lcpObs: PerformanceObserver | null = null;
    try {
      lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number; element?: Element; url?: string };
        const lcp = Math.round(last.startTime);
        const tag = last.element?.tagName ?? 'unknown';
        const imgUrl = last.url || (last.element as HTMLImageElement | null)?.src || null;
        setData((prev) => ({
          ...prev,
          lcp,
          lcpStatus: getStatus(lcp, 'lcp'),
          lcpElementTag: tag,
          heroImgUrl: imgUrl,
        }));
      });
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* not supported */ }

    // CLS Observer
    let clsObs: PerformanceObserver | null = null;
    try {
      let clsScore = 0;
      clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!e.hadRecentInput) clsScore += e.value ?? 0;
        }
        setData((prev) => ({
          ...prev,
          cls: clsScore,
          clsStatus: getStatus(clsScore, 'cls'),
        }));
      });
      clsObs.observe({ type: 'layout-shift', buffered: true });
    } catch { /* not supported */ }

    // FCP Observer
    let fcpObs: PerformanceObserver | null = null;
    try {
      fcpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name !== 'first-contentful-paint') continue;
          const fcp = Math.round(entry.startTime);
          setData((prev) => ({
            ...prev,
            fcp,
            fcpStatus: getStatus(fcp, 'fcp'),
          }));
          fcpObs?.disconnect();
        }
      });
      fcpObs.observe({ type: 'paint', buffered: true });
    } catch { /* not supported */ }

    // INP Observer (modern browsers)
    let inpObs: PerformanceObserver | null = null;
    try {
      const interactions: number[] = [];
      inpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { duration?: number; interactionId?: number };
          if (!e.interactionId) continue;
          interactions.push(e.duration ?? 0);
          // Keep last 10 interactions, pick p98
          if (interactions.length > 10) interactions.shift();
          const sorted = [...interactions].sort((a, b) => a - b);
          const idx = Math.floor(sorted.length * 0.98);
          const inp = sorted[Math.min(idx, sorted.length - 1)];
          setData((prev) => ({
            ...prev,
            inp: Math.round(inp),
            inpStatus: getStatus(inp, 'inp'),
          }));
        }
      });
      inpObs.observe({ type: 'event', buffered: true, durationThreshold: 16 } as any);
    } catch { /* not supported */ }

    // Resource stats — tính sau 2 giây khi load xong
    const resourceTimer = setTimeout(() => {
      const resources = performance.getEntriesByType('resource');
      const imageResources = resources.filter((r) => {
        const rt = r as PerformanceResourceTiming;
        return rt.initiatorType === 'img' || rt.nextHopProtocol?.includes('http');
      });
      const images = resources.filter((r) => {
        const rt = r as PerformanceResourceTiming;
        return rt.initiatorType === 'img' || /\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i.test(rt.name);
      });
      const totalSize = resources.reduce((sum, r) => sum + ((r as PerformanceResourceTiming).transferSize || 0), 0);
      setData((prev) => ({
        ...prev,
        resourceCount: resources.length,
        imageCount: images.length,
        totalTransferSize: totalSize,
      }));
    }, 2000);

    return () => {
      clearTimeout(navTimer);
      clearTimeout(resourceTimer);
      lcpObs?.disconnect();
      clsObs?.disconnect();
      fcpObs?.disconnect();
      inpObs?.disconnect();
    };
  }, []);

  return data;
}

/**
 * Core Web Vitals Debug Overlay
 * Chỉ hiển thị khi có query param `?cwv` hoặc localStorage `cwv_monitor=true`
 */
export default function CWVMonitor() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem('cwv_monitor') === 'true' ||
        window.location.search.includes('cwv') ||
        window.location.hash.includes('cwv');
    } catch {
      return false;
    }
  });
  const [minimized, setMinimized] = useState(false);
  const data = useCWVMonitor();

  const toggleStorage = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem('cwv_monitor', String(next)); } catch { /* ignore */ }
  }, [enabled]);

  // Global shortcut: Shift+Shift+D (nhấn Shift 2 lần + D)
  useEffect(() => {
    let shiftCount = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftCount++;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { shiftCount = 0; }, 400);
      } else if (e.key.toLowerCase() === 'd' && shiftCount >= 1) {
        toggleStorage();
        shiftCount = 0;
        if (timer) clearTimeout(timer);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [toggleStorage]);

  if (!enabled) return null;

  const rows = [
    { label: 'LCP', value: formatMs(data.lcp), status: data.lcpStatus, sub: data.lcpElementTag ? `<${data.lcpElementTag.toLowerCase()}>` : '' },
    { label: 'CLS', value: data.cls !== null ? data.cls.toFixed(4) : '---', status: data.clsStatus, sub: 'layout shift' },
    { label: 'FCP', value: formatMs(data.fcp), status: data.fcpStatus, sub: 'first paint' },
    { label: 'INP', value: formatMs(data.inp), status: data.inpStatus, sub: 'interaction' },
    { label: 'TTFB', value: formatMs(data.ttfb), status: data.ttfbStatus, sub: 'server response' },
  ];

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] font-mono text-xs"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
    >
      <div className="rounded-xl border border-white/10 bg-[#0d0f18]/95 backdrop-blur-xl shadow-2xl overflow-hidden max-w-[280px]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/80 font-semibold text-[11px] tracking-wide">CWV LIVE</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMinimized((m) => !m)}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
              aria-label={minimized ? 'Expand' : 'Minimize'}
            >
              <i className={`ri-${minimized ? 'add' : 'subtract'}-line`} style={{ fontSize: '12px' }} />
            </button>
            <button
              onClick={toggleStorage}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
              aria-label="Close"
            >
              <i className="ri-close-line" style={{ fontSize: '12px' }} />
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* Metrics */}
            <div className="px-3 py-2 space-y-1">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold border ${STATUS_COLOR[row.status]}`}>
                      {row.label}
                    </span>
                    <span className="text-white/30 text-[10px] truncate">{row.sub}</span>
                  </div>
                  <span className="text-white/90 font-semibold tabular-nums whitespace-nowrap">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Divider + Extra stats */}
            <div className="border-t border-white/5 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-[10px]">Page Load</span>
                <span className="text-white/60 text-[10px] tabular-nums">{formatMs(data.pageLoadTime)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-[10px]">DOM Interactive</span>
                <span className="text-white/60 text-[10px] tabular-nums">{formatMs(data.domInteractive)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-[10px]">Resources</span>
                <span className="text-white/60 text-[10px] tabular-nums">{data.resourceCount} ({data.imageCount} img)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-[10px]">Transfer Size</span>
                <span className="text-white/60 text-[10px] tabular-nums">{formatBytes(data.totalTransferSize)}</span>
              </div>
            </div>

            {/* LCP element hint */}
            {data.heroImgUrl && (
              <div className="border-t border-white/5 px-3 py-2">
                <div className="text-white/20 text-[9px] mb-1">LCP ELEMENT</div>
                <div className="text-white/50 text-[9px] truncate" title={data.heroImgUrl}>
                  {data.heroImgUrl.length > 40 ? data.heroImgUrl.slice(0, 40) + '...' : data.heroImgUrl}
                </div>
              </div>
            )}

            {/* Hint */}
            <div className="border-t border-white/5 px-3 py-1.5 bg-white/[0.02]">
              <p className="text-white/15 text-[9px] leading-tight">
                Press Shift+Shift+D to toggle
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
