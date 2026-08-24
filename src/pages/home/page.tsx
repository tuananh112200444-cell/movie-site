import { useEffect, useMemo, useState, useRef, lazy, Suspense, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';
import LazyMovieSection from './components/LazyMovieSection';
import ContinueWatching from './components/ContinueWatching';
import StickyBanner from '../../components/feature/StickyBanner';
import AdsterraNativeBanner from '../../components/feature/AdsterraNativeBanner';
import AdsterraResponsiveBanner from '../../components/feature/AdsterraResponsiveBanner';
import EditorialHero from './components/EditorialHero';
import EditorialMoodGrid from './components/EditorialMoodGrid';
import TrendingSection from './components/TrendingSection';
import SEO, { SITE_URL } from '../../components/base/SEO';
import { fetchHomePageData, fetchQueerUniverseSections, getOptimizedImageUrl } from '../../services/movieApi';
import { prefetchCriticalRoutes } from '../../utils/prefetchRoute';
import { injectPreloadLink, preloadBatch } from '../../utils/imagePreloader';
import { removeSmartSessionCache, setSmartSessionCache } from '../../utils/smartCache';
import type { MovieItem } from '../../types/movie';
import { useMediaQuery } from '../../hooks/useMediaQuery';

// Lazy load bottom sections
const FAQSection       = lazy(() => import('./components/FAQSection'));
const AboutSection     = lazy(() => import('./components/AboutSection'));
const SiteGuideSection = lazy(() => import('./components/SiteGuideSection'));
const GenreSEOSection  = lazy(() => import('./components/GenreSEOSection'));
const QueerUniverseHome = lazy(() => import('./components/QueerUniverseHome'));
const TopCinemaMoviesSection = lazy(() => import('./components/TopCinemaMoviesSection'));
const Top10TodaySection = lazy(() => import('./components/Top10TodaySection'));
const TopRatedSection = lazy(() => import('./components/TopRatedSection'));
const TrailerMoviesSection = lazy(() => import('./components/TrailerMoviesSection'));

function VietnamPoetryBanner() {
  return (
    <section className="home-poetry-banner mx-auto mb-4 overflow-visible sm:mb-7 lg:mb-8" aria-label="Thông điệp Việt Nam">
      <div className="relative overflow-hidden rounded-2xl border border-amber-200/16 bg-[radial-gradient(circle_at_12%_10%,rgba(252,211,77,0.18),transparent_34%),linear-gradient(135deg,rgba(127,29,29,0.28),rgba(15,17,26,0.88)_50%,rgba(6,8,14,0.96))] px-2.5 py-2.5 shadow-[0_20px_70px_-52px_rgba(248,113,113,0.75),inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-4 sm:py-3 lg:px-5">
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-yellow-200/45 to-transparent" />
        <div className="grid grid-cols-[38%_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[260px_minmax(0,1fr)] sm:gap-4 md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="relative flex h-[82px] items-center justify-start overflow-visible sm:h-32 md:h-36 lg:h-32">
          <div className="absolute inset-y-2 left-0 w-[88%] rounded-full bg-red-500/12 blur-2xl" aria-hidden="true" />
          <img
            src="/images/vietnam-flag-watercolor-760.jpg"
            alt="Cờ Việt Nam"
            className="relative z-[1] h-full w-full object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.36)]"
            loading="lazy"
          />
        </div>
        <blockquote
          className="min-w-0 space-y-1.5 border-l border-yellow-200/28 pl-2 italic leading-snug text-yellow-50 sm:space-y-3 sm:pl-4 lg:pl-6"
          style={{ wordBreak: 'keep-all', overflowWrap: 'normal', fontKerning: 'normal' }}
        >
          <p className="whitespace-nowrap text-center text-[clamp(0.72rem,3vw,1.55rem)] font-bold tracking-normal text-yellow-50 drop-shadow-[0_1px_10px_rgba(0,0,0,0.45)] max-[360px]:text-[0.65rem] sm:whitespace-nowrap">
            HOÀNG SA, TRƯỜNG SA LÀ CỦA TRUNG QUỐC
          </p>
          <p className="whitespace-nowrap text-center text-[clamp(0.76rem,3.2vw,1.48rem)] font-black tracking-normal text-red-200 drop-shadow-[0_1px_12px_rgba(0,0,0,0.5)] max-[360px]:text-[0.68rem] sm:whitespace-nowrap">
            CÒN TRUNG QUỐC LÀ CỦA VIỆT NAM 🤪
          </p>
        </blockquote>
        </div>
      </div>
    </section>
  );
}

const homeSchema = [
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Thể Loại Phim Tại KhoPhim',
    description: 'Danh sách các thể loại phim vietsub HD miễn phí tại KhoPhim (khophim.org)',
    numberOfItems: 16,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Phim Hành Động Vietsub HD', url: `${SITE_URL}/the-loai/hanh-dong` },
      { '@type': 'ListItem', position: 2, name: 'Phim Tình Cảm Vietsub HD', url: `${SITE_URL}/the-loai/tinh-cam` },
      { '@type': 'ListItem', position: 3, name: 'Phim Kinh Dị Vietsub HD', url: `${SITE_URL}/the-loai/kinh-di` },
      { '@type': 'ListItem', position: 4, name: 'Phim Hài Hước Vietsub HD', url: `${SITE_URL}/the-loai/hai-huoc` },
      { '@type': 'ListItem', position: 5, name: 'Phim Viễn Tưởng Vietsub HD', url: `${SITE_URL}/the-loai/vien-tuong` },
      { '@type': 'ListItem', position: 6, name: 'Phim Hoạt Hình Anime Vietsub', url: `${SITE_URL}/hoat-hinh` },
      { '@type': 'ListItem', position: 7, name: 'Phim Tâm Lý Drama Vietsub', url: `${SITE_URL}/the-loai/tam-ly` },
      { '@type': 'ListItem', position: 8, name: 'Phim Phiêu Lưu Vietsub HD', url: `${SITE_URL}/the-loai/phieu-luu` },
      { '@type': 'ListItem', position: 9, name: 'Phim Cổ Trang Trung Quốc Vietsub', url: `${SITE_URL}/the-loai/co-trang` },
      { '@type': 'ListItem', position: 10, name: 'Phim Hình Sự Trinh Thám Vietsub', url: `${SITE_URL}/the-loai/hinh-su` },
      { '@type': 'ListItem', position: 11, name: 'Phim Chiến Tranh Lịch Sử Vietsub', url: `${SITE_URL}/the-loai/chien-tranh` },
      { '@type': 'ListItem', position: 12, name: 'Phim Gia Đình Vietsub HD', url: `${SITE_URL}/the-loai/gia-dinh` },
      { '@type': 'ListItem', position: 13, name: 'Phim Bí Ẩn Mystery Vietsub', url: `${SITE_URL}/the-loai/bi-an` },
      { '@type': 'ListItem', position: 14, name: 'Phim Thể Thao Vietsub HD', url: `${SITE_URL}/the-loai/the-thao` },
      { '@type': 'ListItem', position: 15, name: 'Phim Âm Nhạc Musical Vietsub', url: `${SITE_URL}/the-loai/am-nhac` },
      { '@type': 'ListItem', position: 16, name: 'Phim Kinh Điển Classic Vietsub', url: `${SITE_URL}/the-loai/kinh-dien` },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'KhoPhim có xem phim online miễn phí không?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'KhoPhim cho phép mở trang phim và sử dụng các nguồn xem hiện có mà không bắt buộc đăng ký tài khoản. Chất lượng và loại âm thanh được hiển thị theo dữ liệu của từng nguồn.',
        },
      },
      {
        '@type': 'Question',
        name: 'KhoPhim có những thể loại phim nào?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'KhoPhim phân loại phim theo định dạng, thể loại và quốc gia. Nhãn và trạng thái tập được hiển thị theo dữ liệu hiện có của từng phim.',
        },
      },
      {
        '@type': 'Question',
        name: 'Làm sao tìm phim Vietsub trên KhoPhim?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Dùng ô tìm kiếm hoặc các trang phim mới, thể loại và quốc gia để tìm phim. Nhãn Vietsub, thuyết minh hoặc lồng tiếng được hiển thị khi dữ liệu nguồn có cung cấp.',
        },
      },
      {
        '@type': 'Question',
        name: 'Có thể xem phim mới nhất 2026 ở đâu?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Bạn có thể mở mục Phim Mới Cập Nhật để xem các phim vừa thay đổi dữ liệu. Ngôn ngữ và loại phụ đề được hiển thị theo nguồn hiện có của từng phim.',
        },
      },
      {
        '@type': 'Question',
        name: 'Xem phim trên KhoPhim có cần tải app không?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Không cần tải app, bạn có thể xem phim trực tiếp trên trình duyệt web tại khophim.org mà không cần cài đặt thêm gì cả. Tương thích hoàn toàn với điện thoại, máy tính bảng và máy tính.',
        },
      },
      {
        '@type': 'Question',
        name: 'Phim trên KhoPhim có phụ đề tiếng Việt không?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Nhãn Vietsub, thuyết minh hoặc lồng tiếng được hiển thị khi nguồn của phim cung cấp. Người xem nên kiểm tra nhãn ngôn ngữ trên từng trang phim.',
        },
      },
    ],
  },
];

function useInViewOnce(rootMargin = '200px') {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin }
    );
    obs.observe(el);
    const checkPosition = () => {
      const rect = el.getBoundingClientRect();
      const margin = Number.parseInt(rootMargin, 10) || 200;
      if (rect.top <= window.innerHeight + margin) setVisible(true);
    };
    checkPosition();
    window.addEventListener('scroll', checkPosition, { passive: true });
    window.addEventListener('resize', checkPosition);
    window.addEventListener('pageshow', checkPosition);
    window.addEventListener('kp:page-resumed', checkPosition);
    return () => {
      obs.disconnect();
      window.removeEventListener('scroll', checkPosition);
      window.removeEventListener('resize', checkPosition);
      window.removeEventListener('pageshow', checkPosition);
      window.removeEventListener('kp:page-resumed', checkPosition);
    };
  }, [visible, rootMargin]);
  return { ref, visible };
}

function DeferredHomeSection({
  children,
  minHeight = 360,
  rootMargin = '160px',
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
}) {
  const { ref, visible } = useInViewOnce(rootMargin);
  return (
    <div
      ref={ref}
      style={!visible
        ? { minHeight: `${minHeight}px`, contentVisibility: 'auto', containIntrinsicSize: `0 ${minHeight}px` }
        : { contentVisibility: 'auto', containIntrinsicSize: `0 ${minHeight}px` }}
    >
      {visible ? children : null}
    </div>
  );
}

const MOBILE_CATEGORY_LINKS = [
  { label: 'Chiếu rạp', href: '/phim-chieu-rap', icon: 'ri-movie-2-line' },
  { label: 'Phim bộ', href: '/phim-bo', icon: 'ri-tv-2-line' },
  { label: 'Phim lẻ', href: '/phim-le', icon: 'ri-film-line' },
  { label: 'Hàn Quốc', href: '/phim-han-quoc', icon: 'ri-heart-2-line' },
  { label: 'Hoạt hình', href: '/hoat-hinh', icon: 'ri-gamepad-line' },
  { label: 'Âu Mỹ', href: '/phim-au-my', icon: 'ri-global-line' },
];

function HomeAngularIndex() {
  return (
    <nav className="home-angular-index" aria-label="Khám phá nhanh theo nhóm phim">
      <div className="home-angular-index__label" aria-hidden="true">
        <span>Khám phá nhanh</span>
        <strong>CHOOSE YOUR FRAME</strong>
      </div>
      <div className="home-angular-index__rail scrollbar-hide">
        {MOBILE_CATEGORY_LINKS.map((item, index) => (
          <Link key={item.href} to={item.href} className="home-angular-index__link touch-manipulation">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <i className={item.icon} aria-hidden="true" />
            <strong>{item.label}</strong>
            <i className="ri-arrow-right-up-line" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </nav>
  );
}

const ALL_SECTIONS = ['vsmov-4k', 'trending', 'top10-series', 'top10-single', 'phim-chieu-rap', 'phim-le', 'phim-bo', 'hoat-hinh', 'han-quoc', 'au-my', 'trung-quoc', 'thai-lan'];
const DESKTOP_HOME_SECTIONS = ALL_SECTIONS;
const MOBILE_HOME_SECTIONS = ['vsmov-4k', 'trending', 'top10-series', 'top10-single', 'phim-chieu-rap', 'phim-le', 'phim-bo', 'hoat-hinh'];
const HOME_CACHE_KEY = 'kp_home_proxy_v8_kkcinema';
const HOME_STORAGE_CACHE_KEYS = ['kp_home_proxy_v2', 'kp_home_proxy_v3', 'kp_home_proxy_v4', 'kp_home_proxy_v5', 'kp_home_proxy_v6_short', 'kp_home_proxy_v7_short'];
const QUEER_PORTAL_PATH = '/vu-tru-dam-my';
const HOME_FALLBACK_URL = '/home-fallback.json';
const HOME_CACHE_TTL = 15 * 60 * 1000;
const HOME_REFRESH_ON_RETURN_MS = 60 * 1000;
const MAX_STATIC_HOME_FALLBACK_AGE_MS = 48 * 60 * 60 * 1000;

function normalizeHomeSections(sections?: Record<string, MovieItem[]>): Record<string, MovieItem[]> {
  return sections ? { ...sections } : {};
}

type EditorialSectionTone = 'cinema' | 'hot' | 'ranking' | 'rated' | 'trailer' | 'anime' | 'series' | 'single' | 'western' | 'china' | 'korea' | 'thai' | 'mood';

function EditorialSectionFrame({
  number,
  code,
  tone,
  children,
}: {
  number: string;
  code: string;
  tone: EditorialSectionTone;
  children: ReactNode;
}) {
  return (
    <div className={`editorial-section-frame tone-${tone}`} data-editorial-section={number}>
      <div className="editorial-section-chrome" aria-hidden="true">
        <strong>{number}</strong>
        <span>{code}</span>
        <i />
      </div>
      <div className="editorial-section-content">{children}</div>
    </div>
  );
}

function mergeHomeSections(
  previous: Record<string, MovieItem[]>,
  incoming: Record<string, MovieItem[]>,
): Record<string, MovieItem[]> {
  const merged: Record<string, MovieItem[]> = {};
  const keys = new Set([...ALL_SECTIONS, ...Object.keys(previous), ...Object.keys(incoming)]);

  for (const key of keys) {
    const nextItems = incoming[key];
    merged[key] = Array.isArray(nextItems) && nextItems.length > 0
      ? nextItems
      : (previous[key] ?? []);
  }

  return normalizeHomeSections(merged);
}

function clearHomeStorageCache(): void {
  try {
    for (const key of HOME_STORAGE_CACHE_KEYS) {
      localStorage.removeItem(key);
      removeSmartSessionCache(key);
    }
  } catch { /* ignore */ }
}

function hasHomeMovies(sections: Record<string, MovieItem[]>): boolean {
  return Object.values(sections).some((items) => Array.isArray(items) && items.length > 0);
}

function readWarmHomeCache(): Record<string, MovieItem[]> {
  try {
    clearHomeStorageCache();
    const raw = sessionStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return {};
    const entry = JSON.parse(raw) as { sections?: Record<string, MovieItem[]>; ts?: number };
    if (!entry.sections || !entry.ts || Date.now() - entry.ts > HOME_CACHE_TTL) {
      removeSmartSessionCache(HOME_CACHE_KEY);
      return {};
    }
    const sections = normalizeHomeSections(entry.sections);
    return hasHomeMovies(sections) ? sections : {};
  } catch {
    return {};
  }
}

function writeWarmHomeCache(sections: Record<string, MovieItem[]>): void {
  if (!hasHomeMovies(sections)) return;
  try {
    setSmartSessionCache(HOME_CACHE_KEY, JSON.stringify({ sections, ts: Date.now() }));
  } catch { /* quota */ }
}

async function loadStaticHomeFallback(signal?: AbortSignal, allowedSections?: string[]): Promise<Record<string, MovieItem[]>> {
  const res = await fetch(HOME_FALLBACK_URL, {
    cache: 'no-store',
    signal,
  });
  if (!res.ok) return {};

  const data = await res.json() as { generated_at?: string; sections?: Record<string, unknown[]> };
  const generatedAt = Date.parse(data.generated_at ?? '');
  if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > MAX_STATIC_HOME_FALLBACK_AGE_MS) {
    return {};
  }
  const parsedSections: Record<string, MovieItem[]> = {};
  const allowed = allowedSections?.length ? new Set(allowedSections) : null;
  for (const [key, items] of Object.entries(data.sections ?? {})) {
    if (allowed && !allowed.has(key)) continue;
    parsedSections[key] = (items ?? []).filter((item) => {
      const movie = item as Partial<MovieItem>;
      return Boolean(movie?.slug && movie?.name);
    }) as MovieItem[];
  }

  return hasHomeMovies(parsedSections) ? parsedSections : {};
}

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const compactMobile = useMediaQuery('(max-width: 639px)');
  const { ref: bottomRef, visible: bottomVisible } = useInViewOnce('300px');
  const activePortal: 'movies' | 'queer' = location.pathname === QUEER_PORTAL_PATH ? 'queer' : 'movies';

  const setActivePortal = (portal: 'movies' | 'queer' | null) => {
    const nextPortal = portal ?? 'movies';
    navigate(nextPortal === 'queer' ? QUEER_PORTAL_PATH : '/');
  };
  // ── SINGLE REQUEST: all homepage data from home-proxy ──
  const warmHomeRef = useRef<Record<string, MovieItem[]> | null>(null);
  if (warmHomeRef.current === null) warmHomeRef.current = readWarmHomeCache();
  const [homeData, setHomeData] = useState<Record<string, MovieItem[]>>(() => warmHomeRef.current ?? {});
  const [heroMovies, setHeroMovies] = useState<MovieItem[]>(
    () => (warmHomeRef.current?.trending ?? []).slice(0, 5),
  );
  const [homeLoading, setHomeLoading] = useState(() => !hasHomeMovies(warmHomeRef.current ?? {}));
  const [homeError, setHomeError] = useState(false);
  const [queerMovies, setQueerMovies] = useState<MovieItem[]>([]);
  const [queerLoading, setQueerLoading] = useState(true);
  const homeDataRef = useRef(homeData);
  const lastHomeFetchRef = useRef(0);

  useEffect(() => {
    homeDataRef.current = homeData;
  }, [homeData]);

  // ── Fetch home data ONCE via home-proxy ──
  useEffect(() => {
    clearHomeStorageCache();

    if (activePortal === 'queer') {
      setHomeLoading(false);
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;
    let fallbackController: AbortController | null = null;
    const fetchHome = (showLoading = false) => {
      const hadPlaceholder = Object.keys(homeDataRef.current).length > 0;
      if (!hadPlaceholder || showLoading) setHomeLoading(true);

      controller?.abort();
      controller = new AbortController();
      lastHomeFetchRef.current = Date.now();

      const requestedSections = window.matchMedia('(max-width: 639px)').matches
        ? MOBILE_HOME_SECTIONS
        : DESKTOP_HOME_SECTIONS;

      fetchHomePageData(requestedSections, { signal: controller.signal })
        .then((res) => {
          if (cancelled) return;
          if (res.status) {
            const nextSections = mergeHomeSections(homeDataRef.current, res.sections);
            const nextHeroMovies = (res.sections.trending ?? []).slice(0, 5);
            if (nextHeroMovies.length > 0) setHeroMovies(nextHeroMovies);
            setHomeData(nextSections);
            setHomeError(false);
            clearHomeStorageCache();
            writeWarmHomeCache(nextSections);
          }
        })
        .catch((err) => {
          if (cancelled || (err as Error)?.name === 'AbortError') return;
          setHomeError(true);
        })
        .finally(() => {
          if (!cancelled) setHomeLoading(false);
        });
    };

    if (!hasHomeMovies(homeDataRef.current)) {
      fallbackController = new AbortController();
      // The fallback is one compact local file. Parse every shelf so a fast
      // mobile scroll never lands on an empty, network-dependent section.
      loadStaticHomeFallback(
        fallbackController.signal,
        window.matchMedia('(max-width: 639px)').matches ? MOBILE_HOME_SECTIONS : DESKTOP_HOME_SECTIONS,
      )
        .then((fallbackSections) => {
          if (cancelled || !hasHomeMovies(fallbackSections)) return;
          setHomeData((current) => {
            const merged = { ...fallbackSections, ...current };
            homeDataRef.current = merged;
            writeWarmHomeCache(merged);
            return merged;
          });
          setHeroMovies((current) => current.length > 0
            ? current
            : (fallbackSections.trending ?? []).slice(0, 5));
          setHomeLoading(false);
        })
        .catch(() => undefined);
    }

    fetchHome(!hasHomeMovies(homeDataRef.current));

    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastHomeFetchRef.current < HOME_REFRESH_ON_RETURN_MS) return;
      fetchHome(false);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted || Date.now() - lastHomeFetchRef.current >= HOME_REFRESH_ON_RETURN_MS) {
        fetchHome(false);
      }
    };

    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('focus', refreshIfStale);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      cancelled = true;
      controller?.abort();
      fallbackController?.abort();
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('focus', refreshIfStale);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  useEffect(() => {
    if (activePortal === 'queer') {
      setQueerLoading(false);
      return;
    }

    const controller = new AbortController();
    setQueerLoading(true);
    fetchQueerUniverseSections({
      signal: controller.signal,
      limit: compactMobile ? 9 : 18,
      timeoutMs: 5000,
    })
      .then((sections) => {
        if (!controller.signal.aborted) {
          setQueerMovies(sections.newUpdates.length ? sections.newUpdates : sections.featured);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setQueerLoading(false);
      });

    return () => controller.abort();
  }, [activePortal, compactMobile]);

  // ── Prefetch JS chunks sau khi paint xong ──
  useEffect(() => {
    prefetchCriticalRoutes();
  }, [activePortal]);
  useEffect(() => {
    if (activePortal === 'queer') return;
    const priorityMovies = (homeData.trending ?? []).slice(0, 6);
    if (priorityMovies.length === 0) return;

    const isMobileHero = window.innerWidth < 640;
    const isTabletHero = window.innerWidth < 1024;
    const heroWidth = isMobileHero ? 560 : isTabletHero ? 960 : 1280;
    const heroQuality = isMobileHero ? 78 : isTabletHero ? 80 : 82;
    const heroUrls = priorityMovies
      .slice(0, 1)
      .map((movie) => getOptimizedImageUrl(movie.poster_url || movie.thumb_url, heroWidth, heroQuality))
      .filter(Boolean);
    if (heroUrls[0]) injectPreloadLink(heroUrls[0]);
    preloadBatch(heroUrls.slice(0, 1), {
      priorityUrls: heroUrls.slice(0, 1),
      batchSize: 1,
      delayBetweenBatches: 300,
      delayBetweenImages: 80,
      limit: 1,
    });
  }, [activePortal, homeData.trending]);
  const trendingMovies = homeData.trending ?? [];
  const top10TodayMovies = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(homeData['top10-single'] ?? []),
      ...(homeData['top10-series'] ?? []),
      ...trendingMovies,
    ]
      .filter((movie) => {
        const key = movie.slug || movie._id || movie.name;
        if (!key || seen.has(key) || (movie.episode_current ?? '').toLowerCase().trim() === 'trailer') return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
  }, [homeData, trendingMovies]);
  const topRatedMovies = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(homeData['phim-chieu-rap'] ?? []),
      ...(homeData['phim-le'] ?? []),
      ...(homeData['phim-bo'] ?? []),
      ...(homeData['han-quoc'] ?? []),
      ...(homeData['au-my'] ?? []),
    ]
      .filter((movie) => {
        const key = movie.slug || movie._id || movie.name;
        if (!key || seen.has(key) || (movie.episode_current ?? '').toLowerCase().trim() === 'trailer') return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0))
      .slice(0, 10);
  }, [homeData]);
  const bannerLoading = homeLoading && heroMovies.length === 0;
  if (activePortal === 'queer') {
    return (
      <div className="min-h-screen kp-cinema-page text-white">
        <SEO
          title="Vũ Trụ Đam Mỹ / BL / GL – KhoPhim"
          description="Khong gian phim Dam My, BL, GL va Bach Hop tren KhoPhim, lay du lieu tu Supabase."
          canonical={QUEER_PORTAL_PATH}
          ogType="website"
        />
        <Navbar />
        <div className="pt-3 lg:pt-4">
          <Suspense fallback={<div className="min-h-[65vh] skeleton" />}>
            <QueerUniverseHome onBack={() => setActivePortal(null)} onSelectPortal={setActivePortal} />
          </Suspense>
        </div>
        <Footer />
      </div>
    );
  }
  return (
    <div className="home-editorial-v4 min-h-screen kp-cinema-page text-white">
      <h1 className="sr-only">KhoPhim – Tìm phim theo tên, thể loại và quốc gia</h1>
      <SEO
        title="KhoPhim – Tìm phim theo tên, thể loại và quốc gia"
        description="Khám phá phim mới, phim lẻ, phim bộ, phim chiếu rạp, phim Hàn, Trung, Âu Mỹ và anime trên KhoPhim. Danh sách và trạng thái tập được cập nhật liên tục."
        canonical="/"
        ogType="website"
        schema={homeSchema}
      />
      <Navbar />

      <div className="home-top-banner" aria-label="Banner trên đầu trang">
        <StickyBanner />
      </div>

      <div className="editorial-hero-shell">
        <EditorialHero movies={heroMovies} loading={bannerLoading} />
      </div>

      <p className="mx-auto max-w-[1760px] px-4 pb-2 pt-3 text-xs leading-5 text-white/40 sm:px-6">
        Kho phim được đồng bộ và kiểm tra nguồn phát tự động. Trạng thái tập, ngôn ngữ và chất lượng được hiển thị theo dữ liệu hiện có của từng phim.
      </p>

      <main className="editorial-home-shell">
        <HomeAngularIndex />
        <ContinueWatching />

        <EditorialSectionFrame number="4K" code="ULTRA HD" tone="cinema">
          <LazyMovieSection
            fetchType="type" fetchKey="vsmov-4k" limit={compactMobile ? 9 : 17}
            title="Phim 4K Siêu Nét" viewAllLink="/phim-4k"
            cols={6} rootMargin="120px" sectionIndex={0} theme="cinematic"
            movies={homeData['vsmov-4k'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>

        <AdsterraNativeBanner />

        <EditorialSectionFrame number="01" code="NOW SCREENING" tone="cinema">
          <LazyMovieSection
            fetchType="type" fetchKey="phim-chieu-rap" limit={compactMobile ? 9 : 18}
            title="Phim Đang Chiếu Rạp" viewAllLink="/phim-chieu-rap"
            cols={6} rootMargin="120px" sectionIndex={1} theme="cinematic"
            movies={homeData['phim-chieu-rap'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>

        <EditorialSectionFrame number="02" code="LIVE PULSE" tone="hot">
          <TrendingSection movies={trendingMovies} loading={bannerLoading} />
        </EditorialSectionFrame>

        <EditorialSectionFrame number="BL" code="QUEER UNIVERSE" tone="mood">
          <LazyMovieSection
            fetchType="type" fetchKey="queer-universe" limit={compactMobile ? 9 : 18}
            title="Phim Đam Mỹ Mới Nhất" viewAllLink={QUEER_PORTAL_PATH}
            cols={6} rootMargin="120px" sectionIndex={2} theme="trending"
            movies={queerMovies}
            loading={queerLoading}
          />
        </EditorialSectionFrame>

        <AdsterraResponsiveBanner />

        <EditorialSectionFrame number="03" code="DAILY CHART" tone="ranking">
          <DeferredHomeSection minHeight={compactMobile ? 220 : 300}>
            <Suspense fallback={<div className="h-[220px] sm:h-[300px] skeleton" />}>
              <Top10TodaySection
                initialMovies={top10TodayMovies}
                loading={homeLoading}
                title="Top 10 Phim Hôm Nay"
                subtitle="Những bộ phim được quan tâm nhiều nhất trong ngày"
              />
            </Suspense>
          </DeferredHomeSection>
        </EditorialSectionFrame>

        {!compactMobile && <>
        <EditorialSectionFrame number="04" code="BIG SCREEN" tone="cinema">
          <DeferredHomeSection minHeight={compactMobile ? 230 : 310}>
            <Suspense fallback={<div className="h-[230px] sm:h-[310px] skeleton" />}>
              <TopCinemaMoviesSection initialMovies={homeData['phim-chieu-rap'] ?? []} loading={homeLoading} />
            </Suspense>
          </DeferredHomeSection>
        </EditorialSectionFrame>

        <EditorialSectionFrame number="05" code="CRITICS' CHOICE" tone="rated">
          <DeferredHomeSection minHeight={compactMobile ? 220 : 300}>
            <Suspense fallback={<div className="h-[220px] sm:h-[300px] skeleton" />}>
              <TopRatedSection initialMovies={topRatedMovies} loading={homeLoading} />
            </Suspense>
          </DeferredHomeSection>
        </EditorialSectionFrame>

        <EditorialSectionFrame number="06" code="COMING SOON" tone="trailer">
          <DeferredHomeSection minHeight={190}>
            <Suspense fallback={<div className="h-[190px] skeleton" />}>
              <TrailerMoviesSection />
            </Suspense>
          </DeferredHomeSection>
        </EditorialSectionFrame>
        </>}

        <EditorialSectionFrame number="07" code="ANIME ARCHIVE" tone="anime">
          <LazyMovieSection
            fetchType="type" fetchKey="hoat-hinh" limit={compactMobile ? 9 : 18}
            title="Kho Tàng Anime Mới Nhất" viewAllLink="/hoat-hinh"
            cols={6} rootMargin="160px" sectionIndex={7} theme="anime"
            movies={homeData['hoat-hinh'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>

        <EditorialSectionFrame number="08" code="SERIES INDEX" tone="series">
          <LazyMovieSection
            fetchType="type" fetchKey="phim-bo" limit={compactMobile ? 9 : 15}
            title="Phim Bộ Đang Hot" viewAllLink="/phim-bo"
            cols={5} rootMargin="160px" sectionIndex={8} theme="trending"
            movies={homeData['phim-bo'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>
        <EditorialSectionFrame number="09" code="FEATURE FILMS" tone="single">
          <LazyMovieSection
            fetchType="type" fetchKey="phim-le" limit={compactMobile ? 9 : 15}
            title="Phim Lẻ Đang Hot" viewAllLink="/phim-le"
            cols={5} rootMargin="160px" sectionIndex={9} theme="cinematic"
            movies={homeData['phim-le'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>

        {!compactMobile && <>
        <EditorialSectionFrame number="10" code="WESTERN FRAME" tone="western">
          <LazyMovieSection
            fetchType="country" fetchKey="au-my" limit={compactMobile ? 9 : 18}
            title="Phim Âu Mỹ" viewAllLink="/phim-au-my"
            cols={6} rootMargin="160px" sectionIndex={10} theme="hollywood"
            movies={homeData['au-my'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>
        <EditorialSectionFrame number="11" code="ORIENTAL FRAME" tone="china">
          <LazyMovieSection
            fetchType="country" fetchKey="trung-quoc" limit={compactMobile ? 9 : 18}
            title="Phim Trung Quốc" viewAllLink="/phim-trung-quoc"
            cols={6} rootMargin="160px" sectionIndex={11} theme="oriental"
            movies={homeData['trung-quoc'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>
        <EditorialSectionFrame number="12" code="K-DRAMA FRAME" tone="korea">
          <LazyMovieSection
            fetchType="country" fetchKey="han-quoc" limit={compactMobile ? 9 : 18}
            title="Phim Hàn Quốc" viewAllLink="/phim-han-quoc"
            cols={6} rootMargin="160px" sectionIndex={12} theme="kdrama"
            movies={homeData['han-quoc'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>
        <EditorialSectionFrame number="13" code="THAI FRAME" tone="thai">
          <LazyMovieSection
            fetchType="country" fetchKey="thai-lan" limit={compactMobile ? 9 : 18}
            title="Phim Thái Lan" viewAllLink="/phim-thai-lan"
            cols={6} rootMargin="160px" sectionIndex={13} theme="tropical"
            movies={homeData['thai-lan'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>
        </>}

        <EditorialSectionFrame number="14" code="MOOD INDEX" tone="mood">
          <EditorialMoodGrid onOpenQueer={() => setActivePortal('queer')} />
        </EditorialSectionFrame>

        <div className="cinematic-bottom-info">
          <VietnamPoetryBanner />
        </div>

        {/* Bottom sections — lazy render khi gần cuối trang */}
        <div ref={bottomRef}>
          {bottomVisible && (
            <Suspense fallback={<div className="h-40" />}>
              <GenreSEOSection />
              <SiteGuideSection />
              <FAQSection />
              <AboutSection />
            </Suspense>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
