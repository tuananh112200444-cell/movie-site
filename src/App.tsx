import { BrowserRouter, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import BackToTop from "./components/base/BackToTop";
import OfflineIndicator from "./components/base/OfflineIndicator";
import { ToastProvider } from "./components/base/Toast";
import AnalyticsProvider from "./components/feature/AnalyticsProvider";
import CatPawCursor from "./components/feature/CatPawCursor";
import { ThemeProvider } from "./context/ThemeContext";
import CWVMonitor from "./components/base/CWVMonitor";
import AppErrorBoundary from "./components/base/AppErrorBoundary";

// ScrollProgressBar dùng DOM trực tiếp thay vì setState để tránh re-render mỗi scroll.
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

/** Scroll restoration + fade animation */
function AnimatedContent() {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);

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
    let ticking = false;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      document.body.classList.add('is-scrolling');
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        document.body.classList.remove('is-scrolling');
      }, 150);

      if (!ticking) {
        requestAnimationFrame(() => {
          saveScrollPosition(location.pathname, window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
      document.body.classList.remove('is-scrolling');
    };
  }, [location.pathname]);

  return (
    <div
      key={location.pathname}
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
      Bỏ qua điều hướng, đi đến nội dung chính
    </a>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <BrowserRouter basename={__BASE_PATH__}>
            <ToastProvider>
              <AnalyticsProvider>
                <OfflineIndicator />
                <CatPawCursor />
                <ScrollProgressBar />
                <AnimatedContent />
                <BackToTop />
                <CWVMonitor />
              </AnalyticsProvider>
            </ToastProvider>
          </BrowserRouter>
        </I18nextProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}

export default App;
