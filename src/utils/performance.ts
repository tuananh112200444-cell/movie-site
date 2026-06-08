/**
 * ─── Performance Utilities ───
 * Tối ưu Core Web Vitals:
 * - LCP: Largest Contentful Paint
 * - CLS: Cumulative Layout Shift
 * - INP: Interaction to Next Paint
 * - FID: First Input Delay
 */

/**
 * Defer non-critical work sau khi browser idle
 * Dùng requestIdleCallback nếu có, fallback setTimeout
 */
export function runWhenIdle(fn: () => void, timeout = 2000): void {
  if ('requestIdleCallback' in window) {
    (window as Window & typeof globalThis & { requestIdleCallback: (fn: () => void, opts?: { timeout: number }) => void })
      .requestIdleCallback(fn, { timeout });
  } else {
    setTimeout(fn, 100);
  }
}

/**
 * Defer work đến sau frame hiện tại
 * Tránh layout thrashing khi cần đọc/ghi DOM liên tiếp
 */
export function afterFrame(fn: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Prefetch URL bằng <link rel="prefetch"> — nhẹ hơn preload
 * Dùng cho route-level prefetching
 */
const prefetchedUrls = new Set<string>();
export function prefetchUrl(url: string): void {
  if (prefetchedUrls.has(url)) return;
  prefetchedUrls.add(url);
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  link.as = 'document';
  document.head.appendChild(link);
}

/**
 * Preconnect to domain — cho API calls sắp diễn ra
 */
const preconnectedDomains = new Set<string>();
export function preconnectDomain(origin: string): void {
  if (preconnectedDomains.has(origin)) return;
  preconnectedDomains.add(origin);
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

/**
 * Report Core Web Vitals to console (dev) hoặc analytics (prod)
 * Gọi 1 lần sau khi trang load xong
 */
export function reportWebVitals(): void {
  if (typeof window === 'undefined') return;

  runWhenIdle(() => {
    // LCP Observer
    try {
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number; element?: Element };
        const lcp = Math.round(last.startTime);
        const status = lcp < 2500 ? 'GOOD' : lcp < 4000 ? 'NEEDS IMPROVEMENT' : 'POOR';
        if (import.meta.env.DEV) console.log(`[CWV] LCP: ${lcp}ms — ${status}`, last.element);
      });
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* not supported */ }

    // CLS Observer
    try {
      let clsScore = 0;
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!e.hadRecentInput) clsScore += e.value ?? 0;
        }
        const status = clsScore < 0.1 ? 'GOOD' : clsScore < 0.25 ? 'NEEDS IMPROVEMENT' : 'POOR';
        if (import.meta.env.DEV) console.log(`[CWV] CLS: ${clsScore.toFixed(4)} — ${status}`);
      });
      clsObs.observe({ type: 'layout-shift', buffered: true });
    } catch { /* not supported */ }

    // FCP Observer
    try {
      const fcpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const fcp = Math.round(entry.startTime);
          const status = fcp < 1800 ? 'GOOD' : fcp < 3000 ? 'NEEDS IMPROVEMENT' : 'POOR';
          if (import.meta.env.DEV) console.log(`[CWV] FCP: ${fcp}ms — ${status}`);
          fcpObs.disconnect();
        }
      });
      fcpObs.observe({ type: 'paint', buffered: true });
    } catch { /* not supported */ }

    // INP Observer (modern browsers)
    try {
      const inpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { duration?: number; interactionId?: number };
          if (!e.interactionId) continue;
          const inp = Math.round(e.duration ?? 0);
          const status = inp < 200 ? 'GOOD' : inp < 500 ? 'NEEDS IMPROVEMENT' : 'POOR';
          if (import.meta.env.DEV) console.log(`[CWV] INP candidate: ${inp}ms — ${status}`);
        }
      });
      inpObs.observe({ type: 'event', buffered: true, durationThreshold: 16 } as any);
    } catch { /* not supported */ }
  });
}
