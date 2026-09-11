import { useEffect, useMemo, useState, useRef, lazy, Suspense, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import Navbar from '../../components/feature/Navbar';
import { CampaignCatfishBanner } from '../../components/feature/CampaignBannerDemo';
import EditorialHero from './components/EditorialHero';
import { prefetchCriticalRoutes } from '../../utils/prefetchRoute';
import { removeSmartSessionCache, setSmartSessionCache } from '../../utils/smartCache';
import type { MovieItem } from '../../types/movie';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useWatchHistory, type WatchEntry } from '../../hooks/useWatchHistory';
import { useFavorites, type FavMovie } from '../../hooks/useFavorites';

// Lazy load bottom sections
const FAQSection       = lazy(() => import('./components/FAQSection'));
const AboutSection     = lazy(() => import('./components/AboutSection'));
const SiteGuideSection = lazy(() => import('./components/SiteGuideSection'));
const GenreSEOSection  = lazy(() => import('./components/GenreSEOSection'));
const SEO               = lazy(() => import('../../components/base/SEO'));
const DailyUpdateDemoSection = lazy(() => import('./components/DailyUpdateDemoSection'));
const SupportBannerDemo = lazy(() => import('./components/SupportBannerDemo'));
const Footer             = lazy(() => import('../../components/feature/Footer'));
const LazyMovieSection   = lazy(() => import('./components/LazyMovieSection'));
const ContinueWatching   = lazy(() => import('./components/ContinueWatching'));
const AdsterraNativeBanner = lazy(() => import('../../components/feature/AdsterraNativeBanner'));
const AdsterraResponsiveBanner = lazy(() => import('../../components/feature/AdsterraResponsiveBanner'));
const EditorialMoodGrid  = lazy(() => import('./components/EditorialMoodGrid'));
const QueerUniverseHome = lazy(() => import('./components/QueerUniverseHome'));
const VietnamMoviesSection = lazy(() => import('./components/TopCinemaMoviesSection'));
const Top10TodaySection = lazy(() => import('./components/Top10TodaySection'));
const TopRatedSection = lazy(() => import('./components/TopRatedSection'));
const TrailerMoviesSection = lazy(() => import('./components/TrailerMoviesSection'));
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://khophim.org';

const HOME_V2_SHORTCUTS = [
  { label: 'Chiếu rạp', to: '/phim-chieu-rap', icon: 'ri-movie-2-line' },
  { label: 'Phim mới', to: '/phim-moi-cap-nhat', icon: 'ri-sparkling-2-line' },
  { label: 'Phim bộ', to: '/phim-bo', icon: 'ri-tv-2-line' },
  { label: 'Trung Quốc', to: '/phim-trung-quoc', icon: 'ri-ancient-gate-line' },
  { label: 'Hàn Quốc', to: '/phim-han-quoc', icon: 'ri-heart-3-line' },
  { label: 'Anime', to: '/hoat-hinh', icon: 'ri-bear-smile-line' },
] as const;

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

const ALL_SECTIONS = ['top-rated', 'vsmov-4k', 'trending', 'phim-chieu-rap', 'phim-le', 'phim-bo', 'hoat-hinh', 'han-quoc', 'au-my', 'trung-quoc', 'thai-lan'];
const DESKTOP_HOME_SECTIONS = ALL_SECTIONS;
const MOBILE_HOME_SECTIONS = [
  'top-rated',
  'vsmov-4k',
  'trending',
  'phim-chieu-rap',
  'phim-le',
  'phim-bo',
  'hoat-hinh',
  'au-my',
  'trung-quoc',
  'han-quoc',
  'thai-lan',
];
const HOME_CACHE_KEY = 'kp_home_proxy_v10_direct_kkphim';
const HOME_STORAGE_CACHE_KEYS = ['kp_home_proxy_v2', 'kp_home_proxy_v3', 'kp_home_proxy_v4', 'kp_home_proxy_v5', 'kp_home_proxy_v6_short', 'kp_home_proxy_v7_short', 'kp_home_proxy_v8_kkcinema', 'kp_home_proxy_v9_verified_sections'];
const QUEER_PORTAL_PATH = '/vu-tru-dam-my';
const HOME_FALLBACK_URL = '/home-fallback.json';
const HOME_CACHE_TTL = 15 * 60 * 1000;
const HOME_REFRESH_ON_RETURN_MS = 60 * 1000;
// A failed catalogue refresh must not make the hero and all homepage shelves
// disappear after an arbitrary 48-hour cutoff. The snapshot is only a
// last-known-good safety net; live data still replaces it as soon as the API
// recovers. Fourteen days gives operations enough time to repair an upstream
// outage without presenting a blank homepage.
const MAX_STATIC_HOME_FALLBACK_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function taxonomySlugs(value: MovieItem['category'] | MovieItem['country'] | undefined): string[] {
  return (value ?? []).map((item) => String(item?.slug || '').trim()).filter(Boolean);
}

function buildPersonalizedHomeMovies(
  sections: Record<string, MovieItem[]>,
  history: WatchEntry[],
  favorites: FavMovie[],
  limit: number,
): MovieItem[] {
  const candidates: MovieItem[] = [];
  const bySlug = new Map<string, MovieItem>();
  for (const items of Object.values(sections)) {
    for (const movie of items ?? []) {
      const key = String(movie.slug || '').trim();
      if (!key || bySlug.has(key)) continue;
      bySlug.set(key, movie);
      candidates.push(movie);
    }
  }

  const watched = new Set<string>();
  const typeWeights = new Map<string, number>();
  const categoryWeights = new Map<string, number>();
  const countryWeights = new Map<string, number>();
  const addWeight = (map: Map<string, number>, key: string, weight: number) => {
    if (key) map.set(key, (map.get(key) ?? 0) + weight);
  };
  const addSeed = (seed: WatchEntry | FavMovie, weight: number) => {
    const canonical = bySlug.get(seed.slug);
    watched.add(seed.slug);
    addWeight(typeWeights, String(seed.type || canonical?.type || ''), weight * 2.5);
    for (const key of taxonomySlugs(seed.category ?? canonical?.category)) addWeight(categoryWeights, key, weight * 4);
    for (const key of taxonomySlugs(seed.country ?? canonical?.country)) addWeight(countryWeights, key, weight * 2);
  };

  history.slice(0, 12).forEach((entry, index) => addSeed(entry, Math.max(0.45, 1 - index * 0.055)));
  favorites.slice(0, 12).forEach((entry, index) => addSeed(entry, Math.max(0.7, 1.25 - index * 0.04)));
  if (typeWeights.size + categoryWeights.size + countryWeights.size === 0) return [];

  return candidates
    .filter((movie) => !watched.has(movie.slug))
    .map((movie, index) => {
      let score = typeWeights.get(String(movie.type || '')) ?? 0;
      for (const key of taxonomySlugs(movie.category)) score += categoryWeights.get(key) ?? 0;
      for (const key of taxonomySlugs(movie.country)) score += countryWeights.get(key) ?? 0;
      if (movie.episode_current && !/trailer|teaser/i.test(movie.episode_current)) score += 0.8;
      score += Math.max(0, 1.5 - index * 0.015);
      return { movie, score };
    })
    .filter((entry) => entry.score >= 2.25)
    .sort((left, right) => right.score - left.score || left.movie.slug.localeCompare(right.movie.slug, 'vi'))
    .slice(0, limit)
    .map((entry) => entry.movie);
}

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

function heroTimestamp(value: string | undefined): number {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRetiredHeroSource(movie: MovieItem): boolean {
  const identity = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  return /(?:^|[^a-z0-9])ophim(?:[^a-z0-9]|$)|ophim1\.com|opstream|tmdb.?catalog/.test(identity);
}

function isHeroEligible(movie: MovieItem): boolean {
  const status = String(movie.seo_catalog_status || 'published').toLowerCase();
  const episode = String(movie.episode_current || '').toLowerCase();
  const hasArtwork = Boolean(
    movie.hero_backdrop_url || movie.thumb_url || movie.hero_poster_url || movie.poster_url,
  );
  return Boolean(movie._id || movie.slug)
    && Boolean(movie.name)
    && hasArtwork
    && movie.is_published !== false
    && !movie.superseded_by_movie_id
    && !['awaiting_playback', 'hidden', 'draft', 'superseded'].includes(status)
    && !/\b(trailer|teaser)\b/.test(episode)
    && !isRetiredHeroSource(movie);
}

function heroRating(movie: MovieItem): number {
  const rating = Number(movie.tmdb_vote_average || 0);
  return Number.isFinite(rating) ? Math.max(0, Math.min(10, rating)) : 0;
}

function selectHeroMovies(sections: Record<string, MovieItem[]>): MovieItem[] {
  const candidates = new Map<string, MovieItem>();
  for (const movies of Object.values(sections)) {
    for (const movie of movies ?? []) {
      if (!isHeroEligible(movie)) continue;
      const key = movie._id || movie.slug;
      const current = candidates.get(key);
      if (!current || heroRating(movie) > heroRating(current)) candidates.set(key, movie);
    }
  }

  return [...candidates.values()]
    .filter((movie) => heroRating(movie) > 0)
    .sort((a, b) => {
      const ratingDiff = heroRating(b) - heroRating(a);
      if (ratingDiff !== 0) return ratingDiff;
      const voteDiff = Number(b.tmdb_vote_count || 0) - Number(a.tmdb_vote_count || 0);
      if (voteDiff !== 0) return voteDiff;
      const popularityDiff = Number(b.tmdb_popularity || 0) - Number(a.tmdb_popularity || 0);
      if (popularityDiff !== 0) return popularityDiff;
      return heroTimestamp(b.created_at || b.published_at) - heroTimestamp(a.created_at || a.published_at);
    })
    .slice(0, 5);
}

function readBootHeroMovies(): MovieItem[] {
  try {
    const node = document.getElementById('kp-home-hero-bootstrap');
    if (!node?.textContent) return [];
    const parsed = JSON.parse(node.textContent) as unknown;
    if (!Array.isArray(parsed)) return [];
    return selectHeroMovies({ trending: parsed as MovieItem[] });
  } catch {
    return [];
  }
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
    cache: 'default',
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
  const { history } = useWatchHistory();
  const { favorites } = useFavorites();
  const { ref: bottomRef, visible: bottomVisible } = useInViewOnce('300px');
  const activePortal: 'movies' | 'queer' = location.pathname === QUEER_PORTAL_PATH ? 'queer' : 'movies';
  const homeV2 = new URLSearchParams(location.search).get('home-v2') === '1';

  const setActivePortal = (portal: 'movies' | 'queer' | null) => {
    const nextPortal = portal ?? 'movies';
    navigate(nextPortal === 'queer' ? QUEER_PORTAL_PATH : '/');
  };
  // ── SINGLE REQUEST: all homepage data from home-proxy ──
  const warmHomeRef = useRef<Record<string, MovieItem[]> | null>(null);
  if (warmHomeRef.current === null) warmHomeRef.current = readWarmHomeCache();
  const bootHeroRef = useRef<MovieItem[] | null>(null);
  if (bootHeroRef.current === null) bootHeroRef.current = readBootHeroMovies();
  const [homeData, setHomeData] = useState<Record<string, MovieItem[]>>(() => warmHomeRef.current ?? {});
  const [heroMovies, setHeroMovies] = useState<MovieItem[]>(
    () => {
      const bootHero = bootHeroRef.current ?? [];
      const warmHero = selectHeroMovies(warmHomeRef.current ?? {});
      // The HTML preload is generated from the boot snapshot. Rendering that
      // exact movie first lets the browser discover the LCP image immediately;
      // warm catalogue data still powers every shelf below the hero.
      return bootHero.length > 0 ? bootHero : warmHero;
    },
  );
  const [homeLoading, setHomeLoading] = useState(() => !hasHomeMovies(warmHomeRef.current ?? {}));
  const [homeError, setHomeError] = useState(false);
  const [queerMovies, setQueerMovies] = useState<MovieItem[]>([]);
  const [queerLoading, setQueerLoading] = useState(true);
  const [rankedTop10Movies, setRankedTop10Movies] = useState<MovieItem[]>([]);
  const [top10Loading, setTop10Loading] = useState(true);
  const homeDataRef = useRef(homeData);
  const lastHomeFetchRef = useRef(0);
  const heroRevealScheduledRef = useRef(false);
  const [deferredContentReady, setDeferredContentReady] = useState(false);
  const [heroReady, setHeroReady] = useState(false);

  const revealDeferredContent = useCallback(() => {
    if (heroRevealScheduledRef.current) return;
    heroRevealScheduledRef.current = true;
    // Two animation frames guarantee that the loaded hero gets a paint before
    // React mounts the large below-fold catalogue. requestIdleCallback may run
    // before that paint on a busy mobile main thread and reintroduce LCP delay.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => setDeferredContentReady(true), 180);
      });
    });
  }, []);

  const handleHeroReady = useCallback(() => {
    setHeroReady(true);
    revealDeferredContent();
  }, [revealDeferredContent]);

  useEffect(() => {
    if (activePortal !== 'movies' || deferredContentReady) return;
    const safetyTimer = window.setTimeout(revealDeferredContent, 6000);
    return () => window.clearTimeout(safetyTimer);
  }, [activePortal, deferredContentReady, revealDeferredContent]);

  useEffect(() => {
    homeDataRef.current = homeData;
  }, [homeData]);

  useEffect(() => {
    if (!heroReady) return;
    const liveRecommendations = selectHeroMovies(homeData);
    // Never let a stale or partially repaired edge response collapse the
    // verified five-film bootstrap to a single remaining item.
    if (liveRecommendations.length >= 5) setHeroMovies(liveRecommendations);
  }, [heroReady, homeData]);

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

      import('../../services/movieApi')
        .then(({ fetchHomePageData }) => fetchHomePageData(requestedSections, { signal: controller?.signal }))
        .then((res) => {
          if (cancelled) return;
          if (res.status) {
            const nextSections = mergeHomeSections(homeDataRef.current, res.sections);
            const nextHeroMovies = selectHeroMovies(res.sections);
            // Keep the first hero stable while its LCP image is downloading.
            // Live data still refreshes every shelf, but it cannot replace the
            // image half-way through the first page view and force a restart.
            if (nextHeroMovies.length > 0) {
              setHeroMovies((current) => current.length > 0 ? current : nextHeroMovies);
            }
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
            : selectHeroMovies(fallbackSections));
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
    import('../../services/movieApi')
      .then(({ fetchGlvietsubHomeMovies }) => fetchGlvietsubHomeMovies({
        signal: controller.signal,
        limit: 12,
        timeoutMs: 5000,
      }))
      .then((movies) => {
        if (!controller.signal.aborted) {
          setQueerMovies(movies.slice(0, 12));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setQueerMovies([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setQueerLoading(false);
      });

    return () => controller.abort();
  }, [activePortal]);

  // ── Prefetch JS chunks sau khi paint xong ──
  useEffect(() => {
    prefetchCriticalRoutes();
  }, [activePortal]);

  useEffect(() => {
    if (activePortal !== 'movies' || !deferredContentReady) return;
    const controller = new AbortController();
    setTop10Loading(true);
    import('../../services/movieApi')
      .then(({ fetchTop10TodayMovies }) => fetchTop10TodayMovies({
        signal: controller.signal,
        limit: 10,
        timeoutMs: 5_000,
      }))
      .then((movies) => {
        if (!controller.signal.aborted) setRankedTop10Movies(movies.slice(0, 10));
      })
      .catch(() => {
        if (!controller.signal.aborted) setRankedTop10Movies([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTop10Loading(false);
      });
    return () => controller.abort();
  }, [activePortal, deferredContentReady]);

  const trendingMovies = homeData.trending ?? [];
  const dailyUpdateMovies = useMemo(() => {
    const seen = new Set<string>();
    return Object.values(homeData)
      .flat()
      .filter((movie) => {
        const key = movie.slug || movie._id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [homeData]);
  const personalizedMovies = useMemo(
    () => buildPersonalizedHomeMovies(homeData, history, favorites, compactMobile ? 9 : 18),
    [compactMobile, favorites, history, homeData],
  );
  const top10TodayMovies = useMemo(() => {
    const seen = new Set<string>();
    const fallbackGroups = [
      trendingMovies,
      homeData['phim-bo'] ?? [],
      homeData['phim-le'] ?? [],
    ];
    const fallbackInterleaved = Array.from({ length: 10 }, (_, index) =>
      fallbackGroups.map((group) => group[index]),
    ).flat().filter(Boolean) as MovieItem[];
    return (rankedTop10Movies.length > 0 ? rankedTop10Movies : fallbackInterleaved)
      .filter((movie) => {
        const key = movie.slug || movie._id || movie.name;
        if (!key || seen.has(key) || (movie.episode_current ?? '').toLowerCase().trim() === 'trailer') return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
  }, [homeData, rankedTop10Movies, trendingMovies]);
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
      .sort((a, b) => {
        const ratingDiff = Number(b.tmdb_vote_average || 0) - Number(a.tmdb_vote_average || 0);
        if (ratingDiff !== 0) return ratingDiff;
        const popularityDiff = Number(b.tmdb_popularity || 0) - Number(a.tmdb_popularity || 0);
        if (popularityDiff !== 0) return popularityDiff;
        return Number(b.year || 0) - Number(a.year || 0);
      })
      .slice(0, 10);
  }, [homeData]);
  // Keep a stable hero-sized loading surface even if both the live endpoint
  // and the static snapshot are temporarily unavailable. Returning `null`
  // here collapsed the top of the page and made it look as if content had
  // been cut off.
  const bannerLoading = heroMovies.length === 0;
  if (activePortal === 'queer') {
    return (
      <div className="min-h-screen kp-cinema-page text-white">
        <Suspense fallback={null}>
          <SEO
            title="Vũ Trụ Đam Mỹ / BL / GL – KhoPhim"
            description="Khong gian phim Dam My, BL, GL va Bach Hop tren KhoPhim, lay du lieu tu Supabase."
            canonical={QUEER_PORTAL_PATH}
            ogType="website"
          />
        </Suspense>
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
    <div className={`home-editorial-v4 min-h-screen kp-cinema-page text-white${homeV2 ? ' home-cinema-v2' : ''}`}>
      <h1 className="sr-only">KhoPhim – Tìm phim theo tên, thể loại và quốc gia</h1>
      {deferredContentReady && (
        <Suspense fallback={null}>
          <SEO
            title="KhoPhim – Tìm phim theo tên, thể loại và quốc gia"
            description="Khám phá phim mới, phim lẻ, phim bộ, phim chiếu rạp, phim Hàn, Trung, Âu Mỹ và anime trên KhoPhim. Danh sách và trạng thái tập được cập nhật liên tục."
            canonical="/"
            ogType="website"
            schema={homeSchema}
          />
        </Suspense>
      )}
      <Navbar />

      <CampaignCatfishBanner />

      <div className="editorial-hero-shell">
        <EditorialHero movies={heroMovies} loading={bannerLoading} onReady={handleHeroReady} variant={homeV2 ? 'midnight' : 'editorial'} />
      </div>

      {homeV2 && (
        <section className="home-v2-discovery" aria-label="Lối tắt tìm phim">
          <div className="home-v2-discovery__lead">
            <span>Chọn nhanh</span>
            <strong>Hôm nay xem gì?</strong>
          </div>
          <nav aria-label="Danh mục phim nổi bật">
            {HOME_V2_SHORTCUTS.map((item) => (
              <Link key={item.to} to={item.to}>
                <i className={item.icon} aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>
        </section>
      )}

      <div className="editorial-home-shell support-banner-demo-top">
        <Suspense fallback={<div className="support-banner-demo min-h-[220px] skeleton" />}>
          <SupportBannerDemo />
        </Suspense>
      </div>

      {deferredContentReady ? <Suspense fallback={<div className="editorial-home-shell min-h-[220px] skeleton" />}><>
      <main className="editorial-home-shell">
        <Suspense fallback={<div className="mb-10 h-[620px] skeleton" />}>
          <DailyUpdateDemoSection movies={dailyUpdateMovies} loading={homeLoading} compact={homeV2} />
        </Suspense>

        <Suspense fallback={<div className="mb-8 h-[320px] skeleton" />}>
          <GenreSEOSection />
        </Suspense>

        <ContinueWatching />

        {personalizedMovies.length >= 4 && (
          <EditorialSectionFrame number="YOU" code="FOR YOUR TASTE" tone="mood">
            <LazyMovieSection
              fetchType="type" fetchKey="personalized" limit={compactMobile ? 9 : 18}
              title="Dành Cho Bạn" viewAllLink="/phim-moi-nhat"
              cols={6} rootMargin="100px" sectionIndex={0} theme="trending"
              movies={personalizedMovies}
              loading={false}
            />
          </EditorialSectionFrame>
        )}

        <EditorialSectionFrame number="01" code="NOW SCREENING" tone="cinema">
          <LazyMovieSection
            fetchType="type" fetchKey="phim-chieu-rap" limit={compactMobile ? 9 : 18}
            title="Phim Đang Chiếu Rạp" viewAllLink="/phim-chieu-rap"
            cols={6} rootMargin="100px" sectionIndex={1} theme="cinematic"
            movies={homeData['phim-chieu-rap'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>

        <EditorialSectionFrame number="VN" code="VIETNAM FRESH" tone="cinema">
          <DeferredHomeSection minHeight={compactMobile ? 230 : 310}>
            <Suspense fallback={<div className="h-[230px] sm:h-[310px] skeleton" />}>
              <VietnamMoviesSection />
            </Suspense>
          </DeferredHomeSection>
        </EditorialSectionFrame>

        <EditorialSectionFrame number="4K" code="ULTRA HD" tone="cinema">
          <LazyMovieSection
            fetchType="type" fetchKey="vsmov-4k" limit={compactMobile ? 6 : 12}
            title="Phim 4K Siêu Nét" viewAllLink="/phim-4k"
            cols={6} rootMargin="240px" sectionIndex={3} theme="cinematic"
            movies={homeData['vsmov-4k'] ?? []}
            loading={homeLoading}
          />
        </EditorialSectionFrame>

        <AdsterraNativeBanner />

        <AdsterraResponsiveBanner />

        <EditorialSectionFrame number="03" code="DAILY CHART" tone="ranking">
          <DeferredHomeSection minHeight={compactMobile ? 220 : 300}>
            <Suspense fallback={<div className="h-[220px] sm:h-[300px] skeleton" />}>
              <Top10TodaySection
                initialMovies={top10TodayMovies}
                loading={top10Loading && top10TodayMovies.length === 0}
                title="Top 10 Phim Hôm Nay"
                subtitle="Xếp hạng từ lượt xem thực tế trên KhoPhim trong ngày"
              />
            </Suspense>
          </DeferredHomeSection>
        </EditorialSectionFrame>

        <EditorialSectionFrame number="BL" code="QUEER UNIVERSE" tone="mood">
          <LazyMovieSection
            fetchType="type" fetchKey="queer-universe" limit={compactMobile ? 6 : 12}
            title="Phim GL / Bách Hợp Mới Nhất" viewAllLink={QUEER_PORTAL_PATH}
            cols={6} rootMargin="120px" sectionIndex={4} theme="trending"
            movies={queerMovies}
            loading={queerLoading}
          />
        </EditorialSectionFrame>

        <EditorialSectionFrame number="05" code="CRITICS' CHOICE" tone="rated">
          <DeferredHomeSection minHeight={homeV2 ? (compactMobile ? 980 : 520) : (compactMobile ? 1500 : 820)}>
            <Suspense fallback={<div className={homeV2 ? 'h-[980px] lg:h-[520px] skeleton' : 'h-[1500px] lg:h-[820px] skeleton'} />}>
              <TopRatedSection initialMovies={topRatedMovies} loading={homeLoading} limit={homeV2 ? 5 : 10} />
            </Suspense>
          </DeferredHomeSection>
        </EditorialSectionFrame>

        {!compactMobile && <>
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
            fetchType="type" fetchKey="hoat-hinh" limit={compactMobile ? 6 : 12}
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

        <EditorialSectionFrame number="14" code="MOOD INDEX" tone="mood">
          <EditorialMoodGrid onOpenQueer={() => setActivePortal('queer')} />
        </EditorialSectionFrame>

        <div className="cinematic-bottom-info">
        </div>

        {/* Bottom sections — lazy render khi gần cuối trang */}
        <div ref={bottomRef}>
          {bottomVisible && (
            <Suspense fallback={<div className="h-40" />}>
              <SiteGuideSection />
              <FAQSection />
              <AboutSection />
            </Suspense>
          )}
        </div>
      </main>
      <Footer />
      </></Suspense> : <div className="editorial-home-shell min-h-[220px]" aria-hidden="true" />}
    </div>
  );
}
