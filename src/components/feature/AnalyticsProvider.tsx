import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-6B5GLB9W6H';

/**
 * Load GA4 script động trong React — tránh block render của index.html.
 * Chỉ load 1 lần, track page view mỗi khi route thay đổi.
 */
function initGA(): void {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    cookie_flags: 'SameSite=None;Secure',
    custom_map: {
      custom_parameter_1: 'page_type',
      custom_parameter_2: 'movie_slug',
      custom_parameter_3: 'search_query',
    },
  });
}

function isGALoaded(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

function trackPageView(path: string, title: string, pageType: string): void {
  if (!isGALoaded()) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title,
    page_location: window.location.href,
    send_to: GA_MEASUREMENT_ID,
    page_type: pageType,
  });
}

function getPageType(path: string): string {
  const seoLandingPaths = new Set([
    '/xem-phim-online',
    '/phim-vietsub',
    '/phim-thuyet-minh',
    '/phim-long-tieng',
    '/phim-full-hd',
    '/phim-hay',
    '/phim-2026',
    '/phim-2025',
    '/phim-2024',
    '/phim-4k',
    '/phim-hoan-tat',
    '/phim-dang-chieu',
    '/phim-trailer',
  ]);

  if (path === '/' || path === '') return 'home';
  if (seoLandingPaths.has(path)) return 'seo_landing';
  if (path.startsWith('/phim/')) return 'movie_detail';
  if (path.startsWith('/xem-phim/')) return 'movie_player';
  if (path.startsWith('/search') || path.startsWith('/tim-kiem')) return 'search';
  if (path.startsWith('/the-loai/')) return 'genre';
  if (path.startsWith('/vu-tru-dam-my')) return 'queer_universe';
  if (path.startsWith('/quoc-gia/') || /^\/phim-[a-z-]+$/.test(path)) return 'country';
  if (path.startsWith('/dien-vien/')) return 'actor';
  if (path.startsWith('/filter')) return 'filter';
  if (path.startsWith('/blog')) return 'blog';
  if (path.includes('seo') || path.includes('landing')) return 'seo_landing';
  if (path.startsWith('/phim-le')) return 'movie_list';
  if (path.startsWith('/phim-bo')) return 'series_list';
  if (path.startsWith('/phim-chieu-rap')) return 'theater';
  if (path.startsWith('/phim-moi')) return 'new_movies';
  if (path.startsWith('/phim-sap-chieu')) return 'upcoming';
  if (path.startsWith('/hoat-hinh')) return 'animation';
  if (path.startsWith('/tv-shows')) return 'tv_shows';
  if (path.startsWith('/yeu-thich')) return 'favorites';
  if (path.startsWith('/lich-su')) return 'watch_history';
  if (path.startsWith('/about')) return 'about';
  if (path.startsWith('/policy')) return 'policy';
  if (path.startsWith('/sitemap')) return 'sitemap_page';
  if (path.startsWith('/admin')) return 'admin';
  return 'other';
}

function trackScrollDepth(depthPercent: number): void {
  if (!isGALoaded()) return;
  window.gtag('event', 'scroll_depth', {
    depth_percent: depthPercent,
    page_path: window.location.pathname,
    send_to: GA_MEASUREMENT_ID,
  });
}

function trackTimeOnPage(seconds: number): void {
  if (!isGALoaded()) return;
  window.gtag('event', 'time_on_page', {
    duration_seconds: Math.round(seconds),
    page_path: window.location.pathname,
    send_to: GA_MEASUREMENT_ID,
  });
}

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const pageStartTime = useRef(Date.now());
  const scrollTracked = useRef<Set<number>>(new Set());
  const gaLoaded = useRef(false);

  // Load GA4 script một lần duy nhất
  useEffect(() => {
    if (gaLoaded.current) return;
    gaLoaded.current = true;

    // GTM from index.html owns the network script; this provider only adds
    // route-aware events to the shared dataLayer.
    initGA();
  }, []);

  // Track page view khi route thay đổi
  useEffect(() => {
    const path = location.pathname + location.search;
    const title = document.title;
    const pageType = getPageType(location.pathname);

    // Đợi GA init xong rồi track
    const tryTrack = () => {
      if (isGALoaded()) {
        trackPageView(path, title, pageType);
      } else {
        setTimeout(tryTrack, 100);
      }
    };
    tryTrack();

    // Reset tracking state
    scrollTracked.current = new Set();
    pageStartTime.current = Date.now();

  }, [location.pathname, location.search]);

  // Track scroll depth
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const depthPercent = Math.round((scrollTop / docHeight) * 100);
      const milestones = [25, 50, 75, 90, 100];
      for (const milestone of milestones) {
        if (depthPercent >= milestone && !scrollTracked.current.has(milestone)) {
          scrollTracked.current.add(milestone);
          trackScrollDepth(milestone);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  // Track time on page khi unmount / beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const seconds = (Date.now() - pageStartTime.current) / 1000;
      if (seconds > 5) trackTimeOnPage(seconds);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      const seconds = (Date.now() - pageStartTime.current) / 1000;
      if (seconds > 5) trackTimeOnPage(seconds);
    };
  }, [location.pathname]);

  return <>{children}</>;
}

// Type augmentation
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}
