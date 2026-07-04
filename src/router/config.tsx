import { lazy, Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import AdminGuard from '@/components/feature/AdminGuard';

/* ─── Dynamic redirect: /xem/:slug → /phim/:slug ─── */
function RedirectToPhim() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/phim/${slug ?? ''}`} replace />;
}

/* ─── Eager load: Home ─── */
import Home from '../pages/home/page';
import MovieDetailPage from '../pages/movie-detail/page';

/* ─── Core pages ─── */
const FilterPage        = lazy(() => import('../pages/filter/page'));
const MovieListPage     = lazy(() => import('../pages/movie-list/page'));
const FavoritesPage     = lazy(() => import('../pages/favorites/page'));
const AboutPage         = lazy(() => import('../pages/about/page'));
const PolicyPage        = lazy(() => import('../pages/policy/page'));
const NotFound          = lazy(() => import('../pages/NotFound'));
const NewMoviesPage     = lazy(() => import('../pages/new-movies/page'));
const HotMovies2026Page = lazy(() => import('../pages/hot-movies-2026/page'));
const GenrePage         = lazy(() => import('../pages/genre/page'));
const ActorPage         = lazy(() => import('../pages/actor/page'));
const ActorListPage     = lazy(() => import('../pages/actor/list-page'));
const CountryPage       = lazy(() => import('../pages/country/page'));

const BlogPage          = lazy(() => import('../pages/blog/page'));
const BlogDetailPage    = lazy(() => import('../pages/blog/detail-page'));

const AnimePage         = lazy(() => import('../pages/anime/page'));
const MyNamPage         = lazy(() => import('../pages/my-nam/page'));
const PhimMaPage        = lazy(() => import('../pages/phim-ma/page'));
const SeoLandingPage    = lazy(() => import('../pages/seo-landing/page'));

/* ─── Search Page ─── */
const SearchPage        = lazy(() => import('../pages/search/page'));
function LazySearch()      { return <Suspense fallback={<PageLoader />}><SearchPage /></Suspense>; }

/* ─── Sitemap & Admin ─── */
const MovieSitemapPage  = lazy(() => import('../pages/sitemap/MovieSitemapPage'));
const ReviewSitemapPage = lazy(() => import('../pages/sitemap/ReviewSitemapPage'));
const HTMLSitemapPage   = lazy(() => import('../pages/sitemap/HTMLSitemapPage'));
const AdminReviewsPage  = lazy(() => import('../pages/admin-reviews/page'));
const AdminPingPage     = lazy(() => import('../pages/admin-ping/page'));
const AdminSEOPage      = lazy(() => import('../pages/admin-seo/page'));
const AdminAddMoviePage = lazy(() => import('../pages/admin-add-movie/page'));
const AdminDiagnosticsPage = lazy(() => import('../pages/admin-diagnostics/page'));
const AdminSyncHealthPage = lazy(() => import('../pages/admin-sync-health/page'));
const AdminSiteHealthPage = lazy(() => import('../pages/admin-site-health/page'));
const AdminContentHealthPage = lazy(() => import('../pages/admin-content-health/page'));
const AdminOverviewPage = lazy(() => import('../pages/admin-overview/page'));

/* ─── Admin Banner Stats ─── */
const AdminBannerPage   = lazy(() => import('../pages/admin-banner/page'));
function LazyAdminBanner() { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminBannerPage /></AdminGuard></Suspense>; }

/* ─── Top Progress Bar ─── */
function PageLoader() {
  return (
    <div className="fixed inset-0 z-[190] bg-[#080a10] pointer-events-none">
      <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
        <div className="top-loading-bar h-full w-full bg-gradient-to-r from-red-600 via-red-400 to-red-500" />
      </div>
      <div className="absolute top-0 left-0 w-24 h-[2px] top-loading-bar">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-400 blur-sm" />
      </div>
    </div>
  );
}

/* ─── Wrapper helpers ─── */
function LazyFilter()        { return <Suspense fallback={<PageLoader />}><FilterPage /></Suspense>; }
function LazyMovieDetail()   { return <MovieDetailPage />; }
function LazyFavorites()     { return <Suspense fallback={<PageLoader />}><FavoritesPage /></Suspense>; }
function LazyAbout()         { return <Suspense fallback={<PageLoader />}><AboutPage /></Suspense>; }
function LazyPolicy()        { return <Suspense fallback={<PageLoader />}><PolicyPage /></Suspense>; }
function LazyNotFound()      { return <Suspense fallback={<PageLoader />}><NotFound /></Suspense>; }
function LazyNewMovies()     { return <Suspense fallback={<PageLoader />}><NewMoviesPage /></Suspense>; }
function LazyHotMovies2026() { return <Suspense fallback={<PageLoader />}><HotMovies2026Page /></Suspense>; }
function LazyGenre()         { return <Suspense fallback={<PageLoader />}><GenrePage /></Suspense>; }
function LazyActor()         { return <Suspense fallback={<PageLoader />}><ActorPage /></Suspense>; }
function LazyActorList()     { return <Suspense fallback={<PageLoader />}><ActorListPage /></Suspense>; }
function LazyBlog()          { return <Suspense fallback={<PageLoader />}><BlogPage /></Suspense>; }
function LazyBlogDetail()    { return <Suspense fallback={<PageLoader />}><BlogDetailPage /></Suspense>; }
function LazyMovieSitemap()  { return <Suspense fallback={null}><MovieSitemapPage /></Suspense>; }
function LazyReviewSitemap() { return <Suspense fallback={null}><ReviewSitemapPage /></Suspense>; }
function LazyHTMLSitemap()   { return <Suspense fallback={null}><HTMLSitemapPage /></Suspense>; }
function LazyAdminReviews()  { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminReviewsPage /></AdminGuard></Suspense>; }
function LazyAdminPing()     { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminPingPage /></AdminGuard></Suspense>; }
function LazyAdminSEO()      { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminSEOPage /></AdminGuard></Suspense>; }
function LazyAdminAddMovie() { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminAddMoviePage /></AdminGuard></Suspense>; }
function LazyAdminDiagnostics() { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminDiagnosticsPage /></AdminGuard></Suspense>; }
function LazyAdminSyncHealth() { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminSyncHealthPage /></AdminGuard></Suspense>; }
function LazyAdminSiteHealth() { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminSiteHealthPage /></AdminGuard></Suspense>; }
function LazyAdminContentHealth() { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminContentHealthPage /></AdminGuard></Suspense>; }
function LazyAdminOverview() { return <Suspense fallback={<PageLoader />}><AdminGuard><AdminOverviewPage /></AdminGuard></Suspense>; }

/* Quốc gia */
function LazyHanQuocCountry()   { return <Suspense fallback={<PageLoader />}><CountryPage countrySlug="han-quoc" /></Suspense>; }
function LazyTrungQuocCountry() { return <Suspense fallback={<PageLoader />}><CountryPage countrySlug="trung-quoc" /></Suspense>; }
function LazyAuMyCountry()      { return <Suspense fallback={<PageLoader />}><CountryPage countrySlug="au-my" /></Suspense>; }
function LazyNhatBanCountry()   { return <Suspense fallback={<PageLoader />}><CountryPage countrySlug="nhat-ban" /></Suspense>; }
function LazyThaiLanCountry()   { return <Suspense fallback={<PageLoader />}><CountryPage countrySlug="thai-lan" /></Suspense>; }
function LazyVietNamCountry()   { return <Suspense fallback={<PageLoader />}><CountryPage countrySlug="viet-nam" /></Suspense>; }

/* Loại phim */
function LazyPhimLe()       { return <Suspense fallback={<PageLoader />}><MovieListPage type="phim-le"        title="Phim Lẻ" /></Suspense>; }
function LazyPhimBo()       { return <Suspense fallback={<PageLoader />}><MovieListPage type="phim-bo"        title="Phim Bộ" /></Suspense>; }
function LazyPhimSapChieu() { return <Suspense fallback={<PageLoader />}><MovieListPage type="phim-sap-chieu" title="Phim Sắp Chiếu" /></Suspense>; }
function LazyTvShows()      { return <Suspense fallback={<PageLoader />}><MovieListPage type="tv-shows"       title="TV Shows" /></Suspense>; }
function LazyHoatHinh()     { return <Suspense fallback={<PageLoader />}><MovieListPage type="hoat-hinh"      title="Hoạt Hình" /></Suspense>; }
function LazyChieuRap()     { return <Suspense fallback={<PageLoader />}><MovieListPage type="phim-chieu-rap" title="Phim Chiếu Rạp" /></Suspense>; }
function LazyAnime()        { return <Suspense fallback={<PageLoader />}><AnimePage /></Suspense>; }
function LazyMyNam()         { return <Suspense fallback={<PageLoader />}><MyNamPage /></Suspense>; }
function LazyPhimMa()        { return <Suspense fallback={<PageLoader />}><PhimMaPage /></Suspense>; }
function LazySeoLanding({ landingKey }: { landingKey: string }) {
  return <Suspense fallback={<PageLoader />}><SeoLandingPage landingKey={landingKey} /></Suspense>;
}

const routes: RouteObject[] = [
  // ═══════════════════════════════════════════
  // TRANG CHỦ
  // ═══════════════════════════════════════════
  { path: '/', element: <Home /> },
  { path: '/vu-tru-dam-my', element: <Home /> },

  // ═══════════════════════════════════════════
  // PHIM (chi tiết + tìm kiếm + lọc)
  // ═══════════════════════════════════════════
  { path: '/phim/:slug',        element: <LazyMovieDetail /> },
  { path: '/filter',            element: <LazyFilter /> },
  { path: '/phim-moi-nhat',     element: <LazyNewMovies /> },
  { path: '/phim-moi-cap-nhat', element: <LazyNewMovies /> },
  { path: '/phim-hot-2026',     element: <LazyHotMovies2026 /> },
  { path: '/phim-sap-chieu',    element: <LazyPhimSapChieu /> },
  { path: '/phim-ma',           element: <LazyPhimMa /> },

  // ═══════════════════════════════════════════
  // LOẠI PHIM
  // ═══════════════════════════════════════════
  { path: '/phim-le',        element: <LazyPhimLe /> },
  { path: '/phim-bo',        element: <LazyPhimBo /> },
  { path: '/phim-chieu-rap', element: <LazyChieuRap /> },
  { path: '/tv-shows',       element: <LazyTvShows /> },
  { path: '/hoat-hinh',      element: <LazyHoatHinh /> },
  { path: '/anime',          element: <LazyAnime /> },
  { path: '/my-nam',         element: <LazyMyNam /> },

  // ═══════════════════════════════════════════
  // THỂ LOẠI
  // ═══════════════════════════════════════════
  { path: '/the-loai/:slug', element: <LazyGenre /> },

  // ═══════════════════════════════════════════
  // QUỐC GIA
  // ═══════════════════════════════════════════
  { path: '/phim-han-quoc',   element: <LazyHanQuocCountry /> },
  { path: '/phim-trung-quoc', element: <LazyTrungQuocCountry /> },
  { path: '/phim-au-my',      element: <LazyAuMyCountry /> },
  { path: '/phim-nhat-ban',   element: <LazyNhatBanCountry /> },
  { path: '/phim-thai-lan',   element: <LazyThaiLanCountry /> },
  { path: '/phim-viet-nam',   element: <LazyVietNamCountry /> },

  // Redirect /the-loai/phim-viet-nam → /phim-viet-nam (SEO canonical)
  { path: '/the-loai/phim-viet-nam', element: <Navigate to="/phim-viet-nam" replace /> },

  // ═══════════════════════════════════════════
  // DIỄN VIÊN
  // ═══════════════════════════════════════════
  { path: '/dien-vien',       element: <LazyActorList /> },
  { path: '/dien-vien/:slug', element: <LazyActor /> },

  // ═══════════════════════════════════════════
  // BLOG
  // ═══════════════════════════════════════════
  { path: '/blog',       element: <LazyBlog /> },
  { path: '/blog/:slug', element: <LazyBlogDetail /> },

  // SEO LANDING PAGES
  { path: '/xem-phim-online', element: <LazySeoLanding landingKey="xem-phim-online" /> },
  { path: '/phim-vietsub', element: <LazySeoLanding landingKey="phim-vietsub" /> },
  { path: '/phim-thuyet-minh', element: <LazySeoLanding landingKey="phim-thuyet-minh" /> },
  { path: '/phim-long-tieng', element: <LazySeoLanding landingKey="phim-long-tieng" /> },
  { path: '/phim-full-hd', element: <LazySeoLanding landingKey="phim-full-hd" /> },
  { path: '/phim-hay', element: <LazySeoLanding landingKey="phim-hay" /> },
  { path: '/phim-2026', element: <LazySeoLanding landingKey="phim-2026" /> },
  { path: '/phim-2025', element: <LazySeoLanding landingKey="phim-2025" /> },
  { path: '/phim-2024', element: <LazySeoLanding landingKey="phim-2024" /> },
  { path: '/phim-4k', element: <LazySeoLanding landingKey="phim-4k" /> },
  { path: '/phim-hoan-tat', element: <LazySeoLanding landingKey="phim-hoan-tat" /> },
  { path: '/phim-dang-chieu', element: <LazySeoLanding landingKey="phim-dang-chieu" /> },
  { path: '/phim-trailer', element: <LazySeoLanding landingKey="phim-trailer" /> },

  // ═══════════════════════════════════════════
  // THÔNG TIN
  // ═══════════════════════════════════════════
  { path: '/about',     element: <LazyAbout /> },
  { path: '/policy',    element: <LazyPolicy /> },
  { path: '/yeu-thich', element: <LazyFavorites /> },

  // ═══════════════════════════════════════════
  // SITEMAP
  // ═══════════════════════════════════════════
  { path: '/sitemap-movies.xml',  element: <LazyMovieSitemap /> },
  { path: '/sitemap-reviews.xml', element: <LazyReviewSitemap /> },
  { path: '/sitemap',             element: <LazyHTMLSitemap /> },

  // ═══════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════
  { path: '/admin', element: <Navigate to="/admin/overview" replace /> },
  { path: '/admin/overview', element: <LazyAdminOverview /> },
  { path: '/admin/reviews', element: <LazyAdminReviews /> },
  { path: '/admin/ping',    element: <LazyAdminPing /> },
  { path: '/admin/seo',     element: <LazyAdminSEO /> },
  { path: '/admin/banner',  element: <LazyAdminBanner /> },
  { path: '/admin/diagnostics', element: <LazyAdminDiagnostics /> },
  { path: '/admin/sync-health', element: <LazyAdminSyncHealth /> },
  { path: '/admin/site-health', element: <LazyAdminSiteHealth /> },
  { path: '/admin/content-health', element: <LazyAdminContentHealth /> },
  { path: '/admin/add-movie', element: <LazyAdminAddMovie /> },

  // ═══════════════════════════════════════════
  // REDIRECTS - URL cũ → URL mới (301)
  // ═══════════════════════════════════════════
  // Redirect URL phim cũ
  { path: '/xem/:slug',              element: <RedirectToPhim /> },
  { path: '/xem-phim/:slug',         element: <RedirectToPhim /> },
  { path: '/review-phim/:slug',      element: <RedirectToPhim /> },
  { path: '/noi-dung-phim/:slug',    element: <RedirectToPhim /> },
  { path: '/download-phim/:slug',    element: <RedirectToPhim /> },
  { path: '/phim-thuyet-minh/:slug', element: <RedirectToPhim /> },
  // Search
  { path: '/search', element: <LazySearch /> },

  // ═══════════════════════════════════════════
  // 404
  // ═══════════════════════════════════════════
  { path: '*', element: <LazyNotFound /> },
];

export default routes;
