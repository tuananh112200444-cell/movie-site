import { useEffect, useMemo, useState, useRef, lazy, Suspense, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';
import HeroBanner from './components/HeroBanner';
import LazyMovieSection from './components/LazyMovieSection';
import ContinueWatching from './components/ContinueWatching';
import TrendingSection from './components/TrendingSection';
import TopCinemaMoviesSection from './components/TopCinemaMoviesSection';
import Top10TodaySection from './components/Top10TodaySection';
import GenreSEOSection from './components/GenreSEOSection';
import TopRatedSection from './components/TopRatedSection';
import Year2026Banner from './components/Year2026Banner';
import HomeDiscoverySection from './components/HomeDiscoverySection';
import QueerUniverseHome from './components/QueerUniverseHome';
import TrailerMoviesSection from './components/TrailerMoviesSection';
import SEO, { SITE_URL } from '../../components/base/SEO';
import { fetchHomePageData, getOptimizedImageUrl } from '../../services/movieApi';
import { prefetchCriticalRoutes } from '../../utils/prefetchRoute';
import { injectPreloadLink, preloadBatch } from '../../utils/imagePreloader';
import { movieDetailUrl } from '../../utils/slugEncoder';
import type { MovieItem } from '../../types/movie';

// Lazy load bottom sections
const FAQSection       = lazy(() => import('./components/FAQSection'));
const AboutSection     = lazy(() => import('./components/AboutSection'));
const SiteGuideSection = lazy(() => import('./components/SiteGuideSection'));

function VietnamPoetryBanner() {
  return (
    <section className="mx-auto mb-4 max-w-[1180px] overflow-visible sm:mb-7 lg:mb-8" aria-label="Thong diep Viet Nam">
      <div className="relative overflow-hidden rounded-2xl border border-amber-200/16 bg-[radial-gradient(circle_at_12%_10%,rgba(252,211,77,0.18),transparent_34%),linear-gradient(135deg,rgba(127,29,29,0.28),rgba(15,17,26,0.88)_50%,rgba(6,8,14,0.96))] px-2.5 py-2.5 shadow-[0_20px_70px_-52px_rgba(248,113,113,0.75),inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-4 sm:py-3 lg:px-5">
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-yellow-200/45 to-transparent" />
        <div className="grid grid-cols-[38%_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[260px_minmax(0,1fr)] sm:gap-4 md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="relative flex h-[82px] items-center justify-start overflow-visible sm:h-32 md:h-36 lg:h-32">
          <div className="absolute inset-y-2 left-0 w-[88%] rounded-full bg-red-500/12 blur-2xl" aria-hidden="true" />
          <img
            src="/images/vietnam-flag-watercolor-760.jpg"
            alt="Co Viet Nam"
            className="relative z-[1] h-full w-full object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.36)]"
            loading="lazy"
          />
        </div>
        <blockquote
          className="min-w-0 space-y-1.5 border-l border-yellow-200/28 pl-2 italic leading-snug text-yellow-50 sm:space-y-3 sm:pl-4 lg:pl-6"
          style={{ wordBreak: 'keep-all', overflowWrap: 'normal', fontKerning: 'normal' }}
        >
          <p className="whitespace-nowrap text-[clamp(0.62rem,2.65vw,1.55rem)] font-bold tracking-normal text-yellow-50 drop-shadow-[0_1px_10px_rgba(0,0,0,0.45)] max-[360px]:text-[0.55rem] sm:whitespace-nowrap">
            HOÀNG SA,TRƯỜNG SA là của Trung quốc
          </p>
          <p className="whitespace-nowrap text-center text-[clamp(0.66rem,2.8vw,1.48rem)] font-black tracking-normal text-red-200 drop-shadow-[0_1px_12px_rgba(0,0,0,0.5)] max-[360px]:text-[0.58rem] sm:whitespace-nowrap">
            còn Trung quốc là của VIỆT NAM
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
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'KhoPhim - Trang Chủ', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Phim Lẻ Vietsub HD', item: `${SITE_URL}/phim-le` },
      { '@type': 'ListItem', position: 3, name: 'Phim Bộ Vietsub HD', item: `${SITE_URL}/phim-bo` },
      { '@type': 'ListItem', position: 4, name: 'Phim Chiếu Rạp', item: `${SITE_URL}/phim-chieu-rap` },
      { '@type': 'ListItem', position: 5, name: 'Phim Hàn Quốc Vietsub', item: `${SITE_URL}/phim-han-quoc` },
      { '@type': 'ListItem', position: 6, name: 'Phim Trung Quốc Vietsub', item: `${SITE_URL}/phim-trung-quoc` },
      { '@type': 'ListItem', position: 7, name: 'Phim Âu Mỹ Vietsub', item: `${SITE_URL}/phim-au-my` },
    ],
  },
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
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: 'KhoPhim',
    alternateName: [
      'KhoPhim', 'Kho Phim', 'khophim', 'kho phim',
      'khophim', 'khophim.org', 'kho phim', 'KhoPhim',
      'kho phim online', 'kho phim miễn phí', 'kho phim vietsub',
      'kho phim hd', 'kho phim 2026', 'kho phim lớn nhất',
      'kho phim hàng đầu', 'kho phim mới nhất', 'kho phim bom tấn',
      'Xem Phim Online Miễn Phí', 'KhoPhim.com',
    ],
    url: SITE_URL,
    description: 'KhoPhim (khophim.org) – Xem phim online miễn phí chất lượng cao HD, Full HD, vietsub, lồng tiếng. Kho phim lẻ, phim bộ, phim chiếu rạp, hoạt hình, anime mới nhất 2026 cập nhật hàng ngày. Xem không quảng cáo, không cần đăng ký.',
    inLanguage: 'vi',
    potentialAction: [
      {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: 'KhoPhim',
    alternateName: [
      'KhoPhim', 'Kho Phim', 'khophim', 'kho phim',
      'khophim', 'khophim.org', 'kho phim', 'KhoPhim',
      'kho phim online', 'kho phim miễn phí', 'kho phim vietsub',
      'kho phim hd', 'kho phim 2026', 'kho phim lớn nhất',
      'kho phim hàng đầu', 'kho phim mới nhất', 'kho phim bom tấn',
    ],
    url: SITE_URL,
    description: 'KhoPhim (khophim.org) – Trang web xem phim online miễn phí hàng đầu Việt Nam. KhoPhim có hơn 50,000 bộ phim vietsub HD không quảng cáo. Truy cập KhoPhim ngay tại khophim.org để xem phim miễn phí.',
    logo: {
      '@type': 'ImageObject',
      '@id': `${SITE_URL}/#logo`,
      url: 'https://public.readdy.ai/ai/img_res/e1260dce-9377-44c8-83b0-d22bf9614677.png',
      width: 200,
      height: 200,
      caption: 'KhoPhim – Xem Phim Online Miễn Phí',
    },
    image: {
      '@id': `${SITE_URL}/#logo`,
    },
    foundingDate: '2020',
    areaServed: {
      '@type': 'Country',
      name: 'Vietnam',
    },
    knowsLanguage: 'vi',
    sameAs: [
      'https://khophim.org',
      'https://www.khophim.org',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      availableLanguage: 'Vietnamese',
      areaServed: 'VN',
    },
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
          text: 'Có, KhoPhim (khophim.org) cung cấp dịch vụ xem phim online hoàn toàn miễn phí với chất lượng HD và Full HD, vietsub và lồng tiếng. Không cần đăng ký tài khoản, không quảng cáo phiền nhiễu.',
        },
      },
      {
        '@type': 'Question',
        name: 'KhoPhim có những thể loại phim nào?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'KhoPhim có đầy đủ các thể loại: phim hành động, phim tình cảm, phim kinh dị, phim hài hước, phim viễn tưởng, phim hoạt hình, phim tâm lý, phim phiêu lưu, phim cổ trang, phim hình sự, phim chiến tranh, phim gia đình. Ngoài ra còn có phim lẻ, phim bộ, phim chiếu rạp, TV shows, phim Hàn Quốc vietsub, phim Trung Quốc cổ trang, phim Âu Mỹ Hollywood, phim Thái Lan, phim Nhật Bản anime. Cập nhật phim mới 2026 hàng ngày.',
        },
      },
      {
        '@type': 'Question',
        name: 'Xem phim vietsub miễn phí không quảng cáo ở đâu?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'KhoPhim (khophim.org) là trang xem phim vietsub miễn phí tốt nhất hiện nay. Không quảng cáo, không giới hạn xem, cập nhật hàng ngày với chất lượng HD Full HD. Xem ngay trên trình duyệt mà không cần tải app.',
        },
      },
      {
        '@type': 'Question',
        name: 'Có thể xem phim mới nhất 2026 ở đâu?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'KhoPhim cập nhật phim mới 2026 hàng ngày liên tục. Bạn có thể xem phim mới nhất tại trang chủ hoặc vào mục Phim Mới Cập Nhật. Phim từ Hàn Quốc, Trung Quốc, Âu Mỹ, Việt Nam đều có vietsub đầy đủ.',
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
          text: 'Phần lớn phim nước ngoài trên KhoPhim đều có phụ đề tiếng Việt (vietsub) hoặc được lồng tiếng Việt, giúp người xem dễ theo dõi nội dung. Phim Hàn, phim Trung, phim Âu Mỹ đều có vietsub chuẩn.',
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
    return () => obs.disconnect();
  }, [visible, rootMargin]);
  return { ref, visible };
}

function DeferredHomeSection({
  children,
  minHeight = 360,
  rootMargin = '700px',
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
}) {
  const { ref, visible } = useInViewOnce(rootMargin);
  return (
    <div ref={ref} style={!visible ? { minHeight: `min(${minHeight}px, 16vh)` } : undefined}>
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

function MobileQuickCategories() {
  return (
    <nav className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1.5 scrollbar-hide sm:hidden" aria-label="Lối tắt thể loại">
      {MOBILE_CATEGORY_LINKS.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.05] px-3.5 text-xs font-bold text-white/82 active:scale-95"
        >
          <i className={`${item.icon} text-red-400`} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function MobileQuickMovies({ movies, loading }: { movies: MovieItem[]; loading: boolean }) {
  if (loading && movies.length === 0) {
    return (
      <section className="mb-5 sm:hidden">
        <div className="mb-3 flex items-center justify-between px-0.5">
          <div className="h-5 w-32 rounded skeleton" />
          <div className="h-4 w-16 rounded skeleton" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <div className="aspect-[2/3] rounded-lg skeleton" />
              <div className="mt-1.5 h-3 w-full rounded skeleton" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (movies.length === 0) return null;

  return (
    <section className="mb-5 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-2.5 sm:hidden" aria-label="Phim đề xuất nhanh">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/15 text-red-300">
            <i className="ri-flashlight-line text-sm" />
          </span>
          <h2 className="truncate text-base font-bold text-white">Xem ngay hôm nay</h2>
        </div>
        <Link to="/search" className="shrink-0 text-xs font-semibold text-white/45 active:text-white">
          Tìm thêm
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-x-2.5 gap-y-3">
        {movies.slice(0, 6).map((movie, index) => {
          const poster = getOptimizedImageUrl(movie.poster_url || movie.thumb_url, 260, 82);
          return (
            <Link key={`${movie.slug || movie._id}-${index}`} to={movieDetailUrl(movie.slug)} className="group block min-w-0 active:scale-[0.97]">
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[#16192a]">
                <img
                  src={poster}
                  alt={movie.name}
                  loading={index < 3 ? 'eager' : 'lazy'}
                  fetchPriority={index < 3 ? 'high' : 'low'}
                  decoding="async"
                  className="h-full w-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
                {movie.episode_current && (
                  <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded bg-red-500/95 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {movie.episode_current}
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 line-clamp-2 min-h-[32px] text-[11px] font-semibold leading-4 text-white/90">
                {movie.name}
              </h3>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const ALL_SECTIONS = ['trending', 'phim-chieu-rap', 'phim-le', 'phim-bo', 'hoat-hinh', 'han-quoc', 'au-my', 'trung-quoc', 'thai-lan'];
const HOME_CACHE_KEY = 'kp_home_proxy_v5';
const LEGACY_HOME_CACHE_KEYS = ['kp_home_proxy_v2', 'kp_home_proxy_v3', 'kp_home_proxy_v4', HOME_CACHE_KEY];
const QUEER_PORTAL_PATH = '/vu-tru-dam-my';
const HOME_CACHE_TTL = 5 * 60 * 1000;
const HOME_REFRESH_ON_RETURN_MS = 2 * 60 * 1000;
const EMPTY_MOVIES: MovieItem[] = [];

const HOME_SEED_TRENDING: MovieItem[] = [
  {
    _id: 'seed-mother-mary',
    name: 'Mother Mary',
    slug: 'mother-mary-hao-quang-don-doc',
    origin_name: 'Mother Mary',
    type: 'single',
    thumb_url: 'mother-mary-hao-quang-don-doc-thumb-1779333810498.jpg',
    poster_url: 'mother-mary-hao-quang-don-doc-poster-1779333811679.jpg',
    sub_docquyen: false,
    chieurap: false,
    time: '',
    episode_current: 'Full',
    quality: 'HD',
    lang: 'Vietsub',
    year: 2026,
    category: [],
    country: [],
    source_site: 'ophim',
    source_name: 'OPhim',
  },
  {
    _id: 'seed-vu-lam-linh',
    name: 'Zhan Zhao Adventures',
    slug: 'vu-lam-linh',
    origin_name: 'Zhan Zhao Adventures',
    type: 'series',
    thumb_url: 'vu-lam-linh-thumb.jpg',
    poster_url: 'vu-lam-linh-poster.jpg',
    sub_docquyen: false,
    chieurap: false,
    time: '',
    episode_current: 'Tap 19',
    quality: 'HD',
    lang: 'Vietsub',
    year: 2026,
    category: [],
    country: [],
    source_site: 'ophim',
    source_name: 'OPhim',
  },
  {
    _id: 'seed-sold-out',
    name: 'Sold Out on You',
    slug: 'hom-nay-lai-ban-het',
    origin_name: 'Sold Out on You',
    type: 'series',
    thumb_url: 'hom-nay-lai-ban-het-thumb.jpg',
    poster_url: 'hom-nay-lai-ban-het-poster.jpg',
    sub_docquyen: false,
    chieurap: false,
    time: '',
    episode_current: 'Tap 10',
    quality: 'HD',
    lang: 'Vietsub',
    year: 2026,
    category: [],
    country: [],
    source_site: 'ophim',
    source_name: 'OPhim',
  },
  {
    _id: 'seed-the-heir',
    name: 'The Heir',
    slug: 'gia-nghiep',
    origin_name: 'The Heir',
    type: 'series',
    thumb_url: 'gia-nghiep-thumb.jpg',
    poster_url: 'gia-nghiep-poster.jpg',
    sub_docquyen: false,
    chieurap: false,
    time: '',
    episode_current: 'Tap 12',
    quality: 'HD',
    lang: 'Vietsub',
    year: 2026,
    category: [],
    country: [],
    source_site: 'ophim',
    source_name: 'OPhim',
  },
  {
    _id: 'seed-citadel',
    name: 'Citadel',
    slug: 'citadel-phan-2',
    origin_name: 'Citadel',
    type: 'series',
    thumb_url: 'citadel-phan-2-thumb.jpg',
    poster_url: 'citadel-phan-2-poster.jpg',
    sub_docquyen: false,
    chieurap: false,
    time: '',
    episode_current: 'Full',
    quality: 'HD',
    lang: 'Vietsub',
    year: 2026,
    category: [],
    country: [],
    source_site: 'ophim',
    source_name: 'OPhim',
  },
];

function normalizeHomeSections(sections?: Record<string, MovieItem[]>): Record<string, MovieItem[]> {
  const normalized = sections ? { ...sections } : {};
  if (!Array.isArray(normalized.trending) || normalized.trending.length === 0) {
    normalized.trending = HOME_SEED_TRENDING;
  }
  return normalized;
}

function mergeHomeSections(
  previous: Record<string, MovieItem[]>,
  incoming: Record<string, MovieItem[]>,
): Record<string, MovieItem[]> {
  const merged: Record<string, MovieItem[]> = {};
  const keys = new Set([...ALL_SECTIONS, ...Object.keys(previous), ...Object.keys(incoming)]);

  for (const key of keys) {
    const nextItems = incoming[key] ?? [];
    const prevItems = previous[key] ?? [];
    merged[key] = nextItems.length > 0 ? nextItems : prevItems;
  }

  return normalizeHomeSections(merged);
}

function readCachedHomeData(): { sections: Record<string, MovieItem[]>; isSeed: boolean } {
  try {
    for (const key of LEGACY_HOME_CACHE_KEYS) {
      localStorage.removeItem(key);
      if (key !== HOME_CACHE_KEY) sessionStorage.removeItem(key);
    }
    const raw = sessionStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return { sections: { trending: HOME_SEED_TRENDING }, isSeed: true };
    const entry = JSON.parse(raw) as { sections?: Record<string, MovieItem[]>; ts?: number };
    if (!entry.sections || !entry.ts || Date.now() - entry.ts > HOME_CACHE_TTL) {
      sessionStorage.removeItem(HOME_CACHE_KEY);
      return { sections: { trending: HOME_SEED_TRENDING }, isSeed: true };
    }
    if (Object.values(entry.sections).some((arr) => arr.length > 0)) {
      return { sections: normalizeHomeSections(entry.sections), isSeed: false };
    }
  } catch { /* ignore */ }
  return { sections: { trending: HOME_SEED_TRENDING }, isSeed: true };
}

function writeCachedHomeData(sections: Record<string, MovieItem[]>): void {
  const payload = JSON.stringify({ sections, ts: Date.now() });
  try { sessionStorage.setItem(HOME_CACHE_KEY, payload); } catch { /* quota */ }
}
export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const { ref: bottomRef, visible: bottomVisible } = useInViewOnce('300px');
  const activePortal: 'movies' | 'queer' = location.pathname === QUEER_PORTAL_PATH ? 'queer' : 'movies';

  const setActivePortal = (portal: 'movies' | 'queer' | null) => {
    const nextPortal = portal ?? 'movies';
    navigate(nextPortal === 'queer' ? QUEER_PORTAL_PATH : '/');
  };
  // ── SINGLE REQUEST: all homepage data from home-proxy ──
  const [initialHome] = useState(readCachedHomeData);
  const [homeData, setHomeData] = useState<Record<string, MovieItem[]>>(initialHome.sections);
  const [homeLoading, setHomeLoading] = useState(initialHome.isSeed);
  const [homeError, setHomeError] = useState(false);
  const homeDataRef = useRef(homeData);
  const lastHomeFetchRef = useRef(0);

  useEffect(() => {
    homeDataRef.current = homeData;
  }, [homeData]);

  // ── Fetch home data ONCE via home-proxy ──
  useEffect(() => {
    if (activePortal === 'queer') {
      setHomeLoading(false);
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;
    const fetchHome = (showLoading = false) => {
      const hadPlaceholder = Object.keys(homeDataRef.current).length > 0;
      if (!hadPlaceholder || showLoading) setHomeLoading(true);

      controller?.abort();
      controller = new AbortController();
      lastHomeFetchRef.current = Date.now();

      fetchHomePageData(ALL_SECTIONS, { signal: controller.signal })
        .then((res) => {
          if (cancelled) return;
          if (res.status) {
            const nextSections = mergeHomeSections(homeDataRef.current, res.sections);
            setHomeData(nextSections);
            setHomeError(false);
            writeCachedHomeData(nextSections);
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

    fetchHome(initialHome.isSeed);

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
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('focus', refreshIfStale);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // ── Prefetch JS chunks sau khi paint xong ──
  useEffect(() => {
    prefetchCriticalRoutes();
  }, [activePortal]);
  useEffect(() => {
    if (activePortal === 'queer') return;
    const priorityMovies = (homeData.trending ?? []).slice(0, 6);
    if (priorityMovies.length === 0) return;

    const heroUrls = priorityMovies
      .slice(0, 2)
      .map((movie) => getOptimizedImageUrl(movie.poster_url || movie.thumb_url, 1400, 86))
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
        const slug = movie.slug || movie._id || movie.name;
        if (!slug || seen.has(slug)) return false;
        seen.add(slug);
        return (movie.episode_current ?? '').toLowerCase().trim() !== 'trailer';
      })
      .sort((a, b) => {
        const yearDiff = Number(b.year || 0) - Number(a.year || 0);
        if (yearDiff !== 0) return yearDiff;
        return String(a.name || '').localeCompare(String(b.name || ''));
      })
      .slice(0, 10);
  }, [homeData]);
  const mobileQuickMovies = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...trendingMovies,
      ...(homeData['phim-chieu-rap'] ?? []),
      ...topRatedMovies,
      ...(homeData['phim-bo'] ?? []),
      ...(homeData['phim-le'] ?? []),
    ]
      .filter((movie) => {
        const key = movie.slug || movie._id || movie.name;
        const episode = (movie.episode_current ?? '').toLowerCase().trim();
        if (!key || seen.has(key) || episode === 'trailer') return false;
        seen.add(key);
        return Boolean(movie.poster_url || movie.thumb_url);
      })
      .slice(0, 8);
  }, [homeData, topRatedMovies, trendingMovies]);
  const bannerLoading = homeLoading && trendingMovies.length === 0;
  if (activePortal === 'queer') {
    return (
      <div className="min-h-screen kp-cinema-page text-white">
        <SEO
          title="Vu Tru Dam My / GL - KhoPhim"
          description="Khong gian phim Dam My, BL, GL va Bach Hop tren KhoPhim, lay du lieu tu Supabase."
          canonical={QUEER_PORTAL_PATH}
          ogType="website"
        />
        <Navbar />
        <div className="pt-3 lg:pt-4">
          <QueerUniverseHome onBack={() => setActivePortal(null)} onSelectPortal={setActivePortal} />
        </div>
        <Footer />
      </div>
    );
  }
  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <h1 className="sr-only">KhoPhim – Xem Phim Online Vietsub HD Miễn Phí 2026</h1>
      <SEO
        title="KhoPhim – Xem Phim Online Vietsub HD Miễn Phí 2026"
        description="KhoPhim (khophim.org) – Xem 50.000+ phim online vietsub HD miễn phí 2026. Phim lẻ, phim bộ, phim chiếu rạp, phim Hàn, Trung, Âu Mỹ, anime mới nhất. Không quảng cáo, không cần đăng ký. Xem ngay!"
        keywords="khophim, kho phim, khophim.org, xem phim khophim, kho phim, khophim, xem phim online miễn phí, phim vietsub HD, phim hay 2026, phim mới nhất 2026, phim hành động vietsub, phim tình cảm Hàn Quốc, phim kinh dị, phim hài hước, phim viễn tưởng, phim hoạt hình anime, phim tâm lý, phim phiêu lưu, phim cổ trang Trung Quốc, phim hình sự, phim chiến tranh, phim gia đình, phim bí ẩn, phim Hàn vietsub, phim han quoc, phim Trung vietsub, phim trung quoc, phim lẻ vietsub, phim le, phim bộ vietsub, phim bo, phim chiếu rạp 2026, phim Âu Mỹ Hollywood, phim Nhật Bản anime, phim Thái Lan, phim Việt Nam"
        canonical="/"
        ogType="website"
        schema={homeSchema}
      />
      <Navbar />
      
      <div className="relative z-0">
        <HeroBanner movies={trendingMovies} loading={bannerLoading} />
      </div>

      <main className="mx-auto max-w-[1880px] px-3 pt-2 sm:px-4 md:px-6 md:pt-7 lg:px-8 xl:px-12 2xl:px-14">
        <HomeDiscoverySection onSelect={setActivePortal} />
        <MobileQuickCategories />
        <VietnamPoetryBanner />
        <MobileQuickMovies movies={mobileQuickMovies} loading={homeLoading} />
        <ContinueWatching />
        <TrendingSection movies={trendingMovies} loading={bannerLoading} />
        <LazyMovieSection
          fetchType="type" fetchKey="phim-le" limit={18}
          title="Phim Lẻ Hay" viewAllLink="/phim-le"
          cols={6} rootMargin="200px" sectionIndex={0} theme="cinematic"
          movies={homeData['phim-le'] ?? []}
          loading={homeLoading}
        />
        <LazyMovieSection
          fetchType="type" fetchKey="phim-bo" limit={18}
          title="Phim Bộ Đang Hot" viewAllLink="/phim-bo"
          cols={6} rootMargin="200px" sectionIndex={1} theme="trending"
          movies={homeData['phim-bo'] ?? []}
          loading={homeLoading}
        />
        <DeferredHomeSection minHeight={260}>
          <TopCinemaMoviesSection initialMovies={homeData['phim-chieu-rap'] ?? EMPTY_MOVIES} loading={homeLoading} />
        </DeferredHomeSection>
        <DeferredHomeSection minHeight={240}>
          <Top10TodaySection initialMovies={trendingMovies} loading={homeLoading} />
        </DeferredHomeSection>
        <DeferredHomeSection minHeight={220}>
          <TopRatedSection initialMovies={topRatedMovies} loading={homeLoading} />
        </DeferredHomeSection>
        <Year2026Banner />

        {/* Lazy sections — data already loaded from home-proxy, render on scroll */}
        <LazyMovieSection
          fetchType="type" fetchKey="hoat-hinh" limit={18}
          title="Hoạt Hình Mới Nhất" viewAllLink="/hoat-hinh"
          cols={6} rootMargin="200px" sectionIndex={2} theme="anime"
          movies={homeData['hoat-hinh'] ?? []}
          loading={homeLoading}
        />
        <LazyMovieSection
          fetchType="country" fetchKey="han-quoc" limit={18}
          title="Phim Hàn Quốc" viewAllLink="/phim-han-quoc"
          cols={6} rootMargin="200px" sectionIndex={3} theme="kdrama"
          movies={homeData['han-quoc'] ?? []}
          loading={homeLoading}
        />
        <LazyMovieSection
          fetchType="country" fetchKey="au-my" limit={18}
          title="Phim Âu Mỹ" viewAllLink="/phim-au-my"
          cols={6} rootMargin="200px" sectionIndex={4} theme="hollywood"
          movies={homeData['au-my'] ?? []}
          loading={homeLoading}
        />
        <LazyMovieSection
          fetchType="country" fetchKey="trung-quoc" limit={18}
          title="Phim Trung Quốc" viewAllLink="/phim-trung-quoc"
          cols={6} rootMargin="200px" sectionIndex={5} theme="oriental"
          movies={homeData['trung-quoc'] ?? []}
          loading={homeLoading}
        />
        <LazyMovieSection
          fetchType="country" fetchKey="thai-lan" limit={18}
          title="Phim Thái Lan" viewAllLink="/phim-thai-lan"
          cols={6} rootMargin="200px" sectionIndex={6} theme="tropical"
          movies={homeData['thai-lan'] ?? []}
          loading={homeLoading}
        />
        <DeferredHomeSection minHeight={180}>
          <TrailerMoviesSection />
        </DeferredHomeSection>

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
