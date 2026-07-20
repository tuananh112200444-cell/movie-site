import { BrowserRouter, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import OfflineIndicator from "./components/base/OfflineIndicator";
import { ToastProvider } from "./components/base/Toast";
import AnalyticsProvider from "./components/feature/AnalyticsProvider";
import { ThemeProvider } from "./context/ThemeContext";
import AppErrorBoundary from "./components/base/AppErrorBoundary";
import { warmPlayerSourceHealth } from "./services/playerSourceHealth";

const BackToTop = lazy(() => import("./components/base/BackToTop"));
const CWVMonitor = lazy(() => import("./components/base/CWVMonitor"));

function useIdleReady(delayMs = 1800) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    let timer: number | null = null;
    let idleId: number | null = null;

    const markReady = () => setReady(true);
    if (win.requestIdleCallback) {
      idleId = win.requestIdleCallback(markReady, { timeout: delayMs });
    } else {
      timer = window.setTimeout(markReady, delayMs);
    }

    return () => {
      if (idleId !== null) win.cancelIdleCallback?.(idleId);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [delayMs]);

  return ready;
}

function NonCriticalEnhancements() {
  const ready = useIdleReady();
  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <BackToTop />
      <CWVMonitor />
    </Suspense>
  );
}

// ScrollProgressBar updates the DOM directly to avoid a React re-render on every scroll.
function ScrollProgressBar() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        if (bar) bar.style.width = `${pct}%`;
        rafId = null;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={barRef}
      className="scroll-progress"
      style={{ width: '0%' }}
      aria-hidden="true"
    />
  );
}

const SCROLL_KEY = "scroll_positions";

function getScrollPositions(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveScrollPosition(key: string, y: number) {
  try {
    const positions = getScrollPositions();
    positions[key] = y;
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(positions));
  } catch {
    // Ignore storage quota/private-mode failures.
  }
}

function AnimatedContent() {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const latestScrollYRef = useRef(0);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    if (prevPath !== location.pathname) {
      prevPathRef.current = location.pathname;
    }

    const positions = getScrollPositions();
    const savedY = positions[location.pathname];
    if (savedY !== undefined) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, behavior: "auto" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.pathname]);

  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      latestScrollYRef.current = window.scrollY;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveScrollPosition(location.pathname, latestScrollYRef.current);
      }, 350);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveScrollPosition(location.pathname, latestScrollYRef.current);
      }
    };
  }, [location.pathname]);

  return (
    <div
      className="page-root"
      style={{ paddingTop: 'var(--kp-header-height, 140px)' }}
    >
      <SkipToContent />
      <div id="main-content" tabIndex={-1}>
        <AppRoutes />
      </div>
    </div>
  );
}

function SkipToContent() {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const main = document.getElementById('main-content') || document.querySelector('main');
    if (main) {
      main.tabIndex = -1;
      main.focus();
      main.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <a
      href="#main-content"
      onClick={handleClick}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:bg-red-500 focus:text-white focus:px-5 focus:py-3 focus:rounded-xl focus:font-semibold focus:text-sm focus:shadow-lg focus:outline-none"
    >
      Bo qua dieu huong, di den noi dung chinh
    </a>
  );
}

function App() {
  useEffect(() => {
    // Source-health data is useful only when an actual player is about to be
    // mounted. Fetching it on the homepage spent bandwidth and produced a
    // distracting failed request when the optional diagnostics endpoint was
    // unavailable.
    if (!/^\/xem-phim\/[^/]+/.test(window.location.pathname)) return;
    const run = () => void warmPlayerSourceHealth();
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(run, { timeout: 15000 });
      return () => win.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(run, 12000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <BrowserRouter basename={__BASE_PATH__}>
            <ToastProvider>
              <AnalyticsProvider>
                <OfflineIndicator />
                <ScrollProgressBar />
                <AnimatedContent />
                <NonCriticalEnhancements />
              </AnalyticsProvider>
            </ToastProvider>
          </BrowserRouter>
        </I18nextProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}

export default App;
