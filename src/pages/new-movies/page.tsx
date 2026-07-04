import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useHeroLazyLoad } from '@/hooks/useHeroLazyLoad';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import Pagination from '@/components/base/Pagination';
import SEO, { SITE_URL } from '@/components/base/SEO';
import { fetchLatestReleaseMovies, fetchMoviesByType, getFeaturedUrl, getSmallThumbUrl } from '@/services/movieApi';
import { useLazySection } from '@/hooks/useLazySection';
import { isImagePreloaded, markImagePreloaded } from '@/utils/imagePreloader';
import { movieDetailUrl } from '@/utils/slugEncoder';
import type { Movie } from '@/types/movie';

const PAGE_SIZE = 36;
const NEW_MOVIES_INITIAL_TIMEOUT_MS = 4500;
const NEW_MOVIES_TYPES = ['phim-le', 'phim-bo', 'phim-chieu-rap', 'hoat-hinh', 'tv-shows'] as const;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function getMovieKey(movie: Movie): string {
  return movie._id || movie.slug || `${movie.name}-${movie.year ?? ''}`;
}

function sortByNewReleasePriority(movies: Movie[]): Movie[] {
  return [...movies].sort((a, b) => {
    const ya = Number(a.year) || 0;
    const yb = Number(b.year) || 0;
    if (ya !== yb) return yb - ya;
    const ea = firstNumber(a.current_episode) || firstNumber(a.episode_current);
    const eb = firstNumber(b.current_episode) || firstNumber(b.episode_current);
    const fa = String(a.episode_current ?? '').toLowerCase().includes('full') ? 1 : 0;
    const fb = String(b.episode_current ?? '').toLowerCase().includes('full') ? 1 : 0;
    if (fa !== fb) return fa - fb;
    if (ea !== eb) return eb - ea;
    const ta = new Date(a.modified?.time ?? 0).getTime();
    const tb = new Date(b.modified?.time ?? 0).getTime();
    return tb - ta;
  });
}

function firstNumber(value?: string | number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function recoverJoinedEpisode(rawNumber: number, totalEpisodes: number): number {
  if (!rawNumber || !totalEpisodes) return 0;
  const rawText = String(rawNumber);
  const totalText = String(totalEpisodes);
  if (!rawText.endsWith(totalText) || rawText.length <= totalText.length) return 0;
  const current = Number(rawText.slice(0, -totalText.length));
  return current > 0 && current <= totalEpisodes ? current : 0;
}

function normalizeEpisodeCurrent(movie: Movie): string {
  const raw = String(movie.episode_current ?? '').trim();
  const lower = raw.toLowerCase();
  const fixedLabels = ['full', 'full hd', 'hoàn tất', 'hoan tat', 'trailer', 'sắp chiếu', 'sap chieu'];
  if (!raw) return 'Đang cập nhật';
  if (fixedLabels.includes(lower)) return raw;

  const rawNumber = firstNumber(raw);
  const year = firstNumber(movie.year);
  const total = firstNumber(movie.total_episodes) || firstNumber(movie.episode_total);
  const currentRaw = firstNumber(movie.current_episode);
  const recoveredCurrent = recoverJoinedEpisode(rawNumber, total);
  const current = recoveredCurrent || (
    currentRaw > 0 && currentRaw !== year && currentRaw < 500 ? currentRaw : 0
  );

  if (current > 0) {
    return total > 0 && total >= current ? `Tập ${current}/${total}` : `Tập ${current}`;
  }

  if (rawNumber === year || rawNumber >= 500) {
    return 'Đang cập nhật';
  }

  return raw;
}

function normalizeNewMovieItem(movie: Movie): Movie | null {
  const key = getMovieKey(movie);
  if (!key || !movie.name || !movie.slug) return null;
  return {
    ...movie,
    episode_current: normalizeEpisodeCurrent(movie),
  };
}

async function fetchFastLatestMovies(page: number): Promise<Movie[]> {
  const primary = await withTimeout(fetchLatestReleaseMovies(page), NEW_MOVIES_INITIAL_TIMEOUT_MS);
  if (primary?.items?.length) return primary.items;

  const results = await Promise.allSettled(
    NEW_MOVIES_TYPES.map((type) => fetchMoviesByType(type, page, 'year', 'desc'))
  );
  return results
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchMoviesByType>>> => result.status === 'fulfilled')
    .flatMap((result) => result.value.items ?? []);
}

const newMoviesSchema = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Phim Mới Nhất 2026', item: `${SITE_URL}/phim-moi-nhat` },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Phim Mới Nhất 2026 – KhoPhim',
    url: `${SITE_URL}/phim-moi-nhat`,
    description: 'Tổng hợp phim mới nhất 2026 cập nhật hàng ngày tại KhoPhim. Phim lẻ, phim bộ, phim chiếu rạp, anime mới nhất vietsub HD Full HD miễn phí.',
    inLanguage: 'vi',
    isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Phim mới nhất hôm nay xem ở đâu miễn phí?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'KhoPhim (khophim.org) cập nhật phim mới nhất hàng ngày. Trang Phim Mới Nhất tổng hợp toàn bộ phim vừa được thêm mới từ tất cả thể loại, giúp bạn không bỏ lỡ bộ phim nào. Miễn phí, vietsub HD, không quảng cáo.',
        },
      },
      {
        '@type': 'Question',
        name: 'Phim mới 2026 vietsub xem ở đâu miễn phí?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'KhoPhim có đầy đủ phim mới 2026 vietsub miễn phí bao gồm phim lẻ, phim bộ, phim chiếu rạp, anime và TV shows. Tất cả đều được cập nhật nhanh nhất, chất lượng HD Full HD.',
        },
      },
      {
        '@type': 'Question',
        name: 'KhoPhim cập nhật phim mới bao lâu một lần?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'KhoPhim cập nhật phim mới liên tục hàng ngày, 24/7. Phim từ Hàn Quốc, Trung Quốc, Âu Mỹ, Nhật Bản, Thái Lan và Việt Nam đều được cập nhật nhanh nhất ngay sau khi phát hành.',
        },
      },
    ],
  },
];

const FILTERS = [
  { key: 'all', label: 'Tất Cả', icon: 'ri-grid-line', color: 'from-red-600 to-rose-500' },
  { key: 'phim-le', label: 'Phim Lẻ', icon: 'ri-movie-2-line', color: 'from-orange-600 to-amber-500' },
  { key: 'phim-bo', label: 'Phim Bộ', icon: 'ri-tv-2-line', color: 'from-pink-600 to-rose-500' },
  { key: 'phim-chieu-rap', label: 'Chiếu Rạp', icon: 'ri-building-4-line', color: 'from-yellow-600 to-amber-500' },
  { key: 'hoat-hinh', label: 'Hoạt Hình', icon: 'ri-gamepad-line', color: 'from-teal-600 to-emerald-500' },
  { key: 'tv-shows', label: 'TV Shows', icon: 'ri-broadcast-line', color: 'from-cyan-600 to-sky-500' },
] as const;

type FilterKey = typeof FILTERS[number]['key'];

const STATS = [
  { icon: 'ri-film-line', value: '50,000+', label: 'Bộ phim' },
  { icon: 'ri-refresh-line', value: 'Hàng ngày', label: 'Cập nhật' },
  { icon: 'ri-hd-line', value: 'HD / 4K', label: 'Chất lượng' },
  { icon: 'ri-global-line', value: '10+', label: 'Quốc gia' },
];

export default function NewMoviesPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const poolRef     = useRef<Movie[]>([]);
  const seenRef     = useRef(new Set<string>());
  const nextApiRef  = useRef(1);
  const apiDoneRef  = useRef(false);
  const fetchingRef = useRef(false);
  const initRef     = useRef(false);
  const { sectionRef: seoRef, visible: seoVisible } = useLazySection('300px');

  const [pool, setPool]             = useState<Movie[]>([]);
  const [loading, setLoading]       = useState(true);
  const [poolReady, setPoolReady]   = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  // ── Page derived directly from URL param (single source of truth) ──
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const basePath = location.pathname === '/phim-moi-cap-nhat' ? '/phim-moi-cap-nhat' : '/phim-moi-nhat';

  const handleSetPage = useCallback((p: number) => {
    navigate({
      pathname: basePath,
      search: p > 1 ? `?page=${p}` : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [basePath, navigate]);
  const [filterType, setFilterType] = useState<FilterKey>('all');
  const didResetFilterRef = useRef(false);
  const { heroRef, showHeroBg, heroImgLoaded, setHeroImgLoaded } = useHeroLazyLoad();

  const addToPool = useCallback((items: Movie[]) => {
    const normalized = items
      .map(normalizeNewMovieItem)
      .filter((movie): movie is Movie => Boolean(movie));
    // Filter out movies that have already been seen
    const fresh = normalized.filter((m) => {
      const key = getMovieKey(m);
      return key && !seenRef.current.has(key);
    });
    if (fresh.length === 0) return;
    fresh.forEach((m) => seenRef.current.add(getMovieKey(m)));
    // Keep this page ordered by what viewers expect as "new movies": release year first,
    // then actively updating episodes, then database update time.
    poolRef.current = sortByNewReleasePriority([...poolRef.current, ...fresh]);
    setPool(poolRef.current);
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    setLoading(true);

    fetchFastLatestMovies(1).then((items) => {
      addToPool(items);
      nextApiRef.current = 2;
      setPoolReady(true);
      setLoading(false);
    }).catch(() => {
      setPoolReady(true);
      setLoading(false);
    });
  }, [addToPool]);

  const fetchMore = useCallback(async () => {
    if (fetchingRef.current || apiDoneRef.current) return;
    fetchingRef.current = true;
    setFetchingMore(true);
    const nextPage = nextApiRef.current;
    const result = filterType === 'all'
      ? { items: await fetchFastLatestMovies(nextPage).catch(() => []) }
      : await fetchMoviesByType(filterType, nextPage, 'modified.time', 'desc').catch(() => null);
    const items = result?.items ?? [];
    if (items.length > 0) addToPool(items);
    nextApiRef.current += 1;
    if (items.length === 0) apiDoneRef.current = true;
    fetchingRef.current = false;
    setFetchingMore(false);
  }, [addToPool, filterType]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  // Reset to page 1 when filter changes (skip on mount)
  useEffect(() => {
    if (!didResetFilterRef.current) { didResetFilterRef.current = true; return; }
    apiDoneRef.current = false;
    fetchingRef.current = false;
    nextApiRef.current = filterType === 'all' ? 2 : 1;
    navigate({ pathname: basePath, search: '' }, { replace: true });
  }, [filterType, basePath, navigate]);

  const filteredPool = useMemo(() => {
    if (filterType === 'all') return pool;
    return pool.filter((m) => {
      if (filterType === 'phim-le') return m.type === 'single';
      if (filterType === 'phim-bo') return m.type === 'series';
      if (filterType === 'hoat-hinh') return m.type === 'hoathinh';
      if (filterType === 'tv-shows') return m.type === 'tvshows';
      if (filterType === 'phim-chieu-rap') return m.chieurap;
      return true;
    });
  }, [pool, filterType]);

  useEffect(() => {
    if (!poolReady) return;
    const needed = 5 + page * PAGE_SIZE;
    const available = filterType === 'all' ? pool.length : filteredPool.length;
    if (available < needed && !apiDoneRef.current && !fetchingRef.current) {
      fetchMore();
    }
  }, [poolReady, page, pool.length, filteredPool.length, filterType, fetchMore]);

  // Featured: first 5 movies
  const featuredMovies = filteredPool.slice(0, 5);
  const featuredMain = featuredMovies[0];
  const featuredSide = featuredMovies.slice(1, 5);

  // Page movies (skip featured)
  const pageMovies = filteredPool.slice(5 + (page - 1) * PAGE_SIZE, 5 + page * PAGE_SIZE);
  const gridStart = 5 + (page - 1) * PAGE_SIZE;
  const hasEnoughData = filteredPool.length > gridStart;
  const showLoading = loading || (poolReady && !hasEnoughData);
  const totalPages = Math.ceil(Math.max(0, filteredPool.length - 5) / PAGE_SIZE) + (apiDoneRef.current ? 0 : 3);
  const hasNext = !apiDoneRef.current || (page * PAGE_SIZE < Math.max(0, filteredPool.length - 5));

  // Self-referencing canonical
  const canonicalUrl = page > 1 ? `${SITE_URL}${basePath}?page=${page}` : `${SITE_URL}${basePath}`;
  const prevPage = page > 1
    ? (page > 2 ? `${SITE_URL}${basePath}?page=${page - 1}` : `${SITE_URL}${basePath}`)
    : undefined;
  const nextPage = hasNext ? `${SITE_URL}${basePath}?page=${page + 1}` : undefined;

  const activeFilter = FILTERS.find((f) => f.key === filterType) ?? FILTERS[0];

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title="Phim Mới Nhất 2026 – Vietsub HD Miễn Phí | KhoPhim"
        description="Xem phim mới nhất 2026 vietsub HD miễn phí tại KhoPhim. Tổng hợp phim lẻ, phim bộ, phim chiếu rạp, anime cập nhật hàng ngày. 50.000+ bộ phim, không quảng cáo, không cần đăng ký. Xem ngay!"
        keywords="phim mới nhất 2026, phim mới cập nhật hôm nay, xem phim mới online miễn phí, phim mới vietsub hôm nay, phim mới nhất hôm nay, phim mới cập nhật 2026, xem phim mới miễn phí HD, phim mới ra 2026, phim hot 2026, phim hay mới nhất"
        canonical={canonicalUrl}
        prev={prevPage}
        next={nextPage}
        ogType="website"
        schema={newMoviesSchema}
      />
      <Navbar />

      {/* ── Hero Banner ── */}
      <div ref={heroRef} className="relative overflow-hidden">
        <div className="absolute inset-0">
          {showHeroBg ? (
            <img
              src="https://readdy.ai/api/search-image?query=cinematic film reel collection dark background with glowing red light rays movie posters scattered dramatic lighting professional photography ultra wide angle deep black background with subtle red glow abstract cinema atmosphere&width=1400&height=400&seq=newmovies-hero-bg-002&orientation=landscape"
              alt="Phim mới nhất"
              className={`w-full h-full object-cover object-center transition-opacity duration-700 ${heroImgLoaded ? 'opacity-20' : 'opacity-0'}`}
              onLoad={() => setHeroImgLoaded(true)}
            />
          ) : null}
          <div
            className={`absolute inset-0 bg-gradient-to-br from-red-900/40 to-rose-900/20 ${showHeroBg && heroImgLoaded ? 'opacity-0' : 'opacity-50'} transition-opacity duration-500`}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#080a10] via-[#080a10]/80 to-[#080a10]/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080a10] via-transparent to-[#080a10]/40" />
        </div>

        <div className="absolute top-0 right-1/4 w-72 h-72 bg-red-600/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-rose-500/6 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-[1760px] mx-auto px-4 pt-20 sm:pt-28 pb-6 sm:pb-10">
          <nav className="flex items-center gap-1.5 mb-5 text-xs text-white/30">
            <Link to="/" className="hover:text-white/60 transition-colors">Trang chủ</Link>
            <i className="ri-arrow-right-s-line" />
            <span className="text-white/50">Phim Mới Nhất</span>
          </nav>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 bg-red-500/12 border border-red-500/25 rounded-full px-3.5 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-[11px] font-bold text-red-400 uppercase tracking-widest">Cập nhật hàng ngày</span>
            </div>
            {!loading && pool.length > 0 && (
              <span className="text-[11px] text-white/40 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                {pool.length.toLocaleString()}+ bộ phim
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight mb-2">
            Phim Mới Nhất <span className="text-red-500">2026</span>
            {page > 1 ? <span className="text-white/40 text-xl ml-2">– Trang {page}</span> : ''}
          </h1>
          <p className="text-white/40 text-xs sm:text-sm md:text-base max-w-lg leading-relaxed mb-4 sm:mb-6">
            Tổng hợp phim mới cập nhật hàng ngày từ tất cả thể loại · Vietsub HD miễn phí · Không quảng cáo
          </p>

          <div className="flex flex-wrap gap-3 sm:gap-4 md:gap-6">
            {STATS.map((s) => (
              <div key={s.label} className="flex items-center gap-2.5">
                <div className="w-8 h-8 flex items-center justify-center bg-red-500/12 border border-red-500/20 rounded-lg">
                  <i className={`${s.icon} text-red-400 text-sm`} />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{s.value}</div>
                  <div className="text-[11px] text-white/30">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="cinema-page-container">

        {/* ── Filter Tabs ── */}
        <div className="mb-6 -mt-1">
          <div className="cinema-toolbar-panel flex flex-wrap gap-1.5 p-2 sm:p-3">
            {FILTERS.map(({ key, label, icon, color }) => (
              <button
                key={key}
                onClick={() => { setFilterType(key); handleSetPage(1); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap border ${
                  filterType === key
                    ? `bg-gradient-to-r ${color} text-white border-transparent shadow-lg shadow-red-500/10`
                    : 'bg-black/20 text-white/45 hover:text-white border-white/[0.07] hover:border-white/15'
                }`}
              >
                <i className={`${icon} text-sm`} />
                {label}
                {filterType === key && filteredPool.length > 0 && (
                  <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5">
                    {filteredPool.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {filterType !== 'all' && (
            <div className="mt-2.5 flex items-center gap-2 text-xs text-white/30">
              <i className={`${activeFilter.icon} text-red-400/60`} />
              <span>Đang lọc: <strong className="text-white/50">{activeFilter.label}</strong></span>
              <span className="text-white/15">·</span>
              <span>{filteredPool.length} phim</span>
              <button
                onClick={() => { setFilterType('all'); handleSetPage(1); }}
                className="ml-2 text-red-400/70 hover:text-red-400 transition-colors cursor-pointer"
              >
                Xóa lọc
              </button>
            </div>
          )}
        </div>

        {/* ── Featured Section (only page 1, not loading) ── */}
        {!loading && page === 1 && featuredMain && (
          <section className="home-section-surface mb-10">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="cinema-section-title text-sm sm:text-base">Mới Cập Nhật Hôm Nay</h2>
              <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1 h-1 bg-green-400 rounded-full animate-pulse" />
                LIVE
              </span>
            </div>

            <div className="flex flex-col lg:flex-row gap-4">
              {/* Main featured */}
              <div className="lg:w-[58%] flex-shrink-0">
                <FeaturedCard movie={featuredMain} />
              </div>

              {/* Side stack */}
              <div className="lg:flex-1 grid grid-cols-2 gap-3">
                {featuredSide.map((m) => (
                  <SideFeaturedCard key={getMovieKey(m)} movie={m} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Section header for grid ── */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="cinema-section-title text-sm sm:text-base">Tất Cả Phim Mới</h2>
          </div>
          {!loading && filteredPool.length > 0 && (
            <span className="cinema-chip rounded-full px-3 py-1 text-xs text-white/35">
              Trang {page} · {filteredPool.length.toLocaleString()} phim
            </span>
          )}
        </div>

        {/* ── Movie Grid: 10 cols, smaller posters ── */}
        {showLoading ? (
          <div className="grid movie-grid-desktop">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i}>
                <div className="aspect-[2/3] skeleton rounded-lg" />
                <div className="mt-1.5 h-2.5 skeleton rounded w-4/5" />
                <div className="mt-1 h-2 skeleton rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : pageMovies.length === 0 ? (
          <div className="cinema-empty-state flex flex-col items-center justify-center py-24 text-white/30">
            <i className="ri-film-line text-5xl mb-3" />
            <p className="text-lg">Không có phim nào</p>
            <button
              onClick={() => { setFilterType('all'); handleSetPage(1); }}
              className="mt-4 px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm transition-all cursor-pointer whitespace-nowrap"
            >
              Xem tất cả phim
            </button>
          </div>
        ) : (
          <div className="grid movie-grid-desktop">
            {pageMovies.map((m, idx) => (
              <MovieCard key={getMovieKey(m)} movie={m} priority={idx < 4} />
            ))}
          </div>
        )}

        {/* Fetch-more indicator */}
        {(fetchingMore || (poolReady && !hasEnoughData)) && (
          <div className="flex justify-center mt-8">
            <span className="flex items-center gap-2 text-sm text-white/30 bg-white/[0.03] border border-white/[0.06] px-5 py-2.5 rounded-full">
              <i className="ri-loader-4-line animate-spin" /> Đang tải thêm phim...
            </span>
          </div>
        )}

        {/* ── Pagination ── */}
        {!showLoading && pageMovies.length > 0 && (
          <Pagination currentPage={page} totalPages={totalPages} basePath={basePath} hasNext={hasNext} />
        )}

        {/* SEO content block */}
        <div ref={seoRef}>
          {seoVisible && (
            <section className="mt-16 border-t border-white/5 pt-12">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
                <div className="lg:col-span-1 space-y-3">
                  <h2 className="text-base font-bold text-white/80 mb-4">Tại Sao Chọn KhoPhim?</h2>
                  {[
                    { icon: 'ri-refresh-line', title: 'Cập nhật hàng ngày', desc: 'Phim mới nhất từ tất cả thể loại và quốc gia' },
                    { icon: 'ri-hd-line', title: 'Chất lượng HD / 4K', desc: 'Vietsub chuẩn, không quảng cáo, không giới hạn' },
                    { icon: 'ri-global-line', title: '10+ quốc gia', desc: 'Hàn, Trung, Âu Mỹ, Nhật, Thái, Việt Nam...' },
                    { icon: 'ri-shield-check-line', title: 'Hoàn toàn miễn phí', desc: 'Không cần đăng ký, không cần tài khoản' },
                  ].map((f) => (
                    <div key={f.title} className="flex items-start gap-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                      <div className="w-8 h-8 flex items-center justify-center bg-red-500/15 rounded-lg flex-shrink-0">
                        <i className={`${f.icon} text-red-400 text-sm`} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white/80">{f.title}</div>
                        <div className="text-xs text-white/35 mt-0.5">{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="lg:col-span-2">
                  <h2 className="text-base font-bold text-white/80 mb-4">Câu Hỏi Thường Gặp</h2>
                  <div className="space-y-2.5">
                    {[
                      {
                        q: 'Phim mới nhất hôm nay xem ở đâu?',
                        a: 'KhoPhim (khophim.org) cập nhật phim mới nhất hàng ngày. Trang Phim Mới Nhất tổng hợp toàn bộ phim vừa được thêm mới từ tất cả thể loại, giúp bạn không bỏ lỡ bộ phim nào. Miễn phí, vietsub HD, không quảng cáo.'
                      },
                      {
                        q: 'Phim mới 2026 vietsub xem ở đâu miễn phí?',
                        a: 'KhoPhim có đầy đủ phim mới 2026 vietsub miễn phí bao gồm phim lẻ, phim bộ, phim chiếu rạp, anime và TV shows. Tất cả đều được cập nhật nhanh nhất, chất lượng HD Full HD.'
                      },
                      {
                        q: 'KhoPhim cập nhật phim mới bao lâu một lần?',
                        a: 'KhoPhim cập nhật phim mới liên tục hàng ngày, 24/7. Phim từ Hàn Quốc, Trung Quốc, Âu Mỹ, Nhật Bản, Thái Lan và Việt Nam đều được cập nhật nhanh nhất ngay sau khi phát hành.'
                      },
                      {
                        q: 'Có thể xem phim mới trên điện thoại không?',
                        a: 'Có! KhoPhim tương thích hoàn toàn với điện thoại và máy tính bảng. Giao diện responsive, player tự động điều chỉnh chất lượng theo tốc độ mạng của bạn.'
                      },
                    ].map((item) => (
                      <details key={item.q} className="group bg-[#13151f] border border-white/[0.06] rounded-xl overflow-hidden">
                        <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer list-none select-none">
                          <strong className="text-white/75 text-sm font-medium leading-snug">{item.q}</strong>
                          <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                            <i className="ri-add-line text-white/30 group-open:hidden" />
                            <i className="ri-subtract-line text-red-400 hidden group-open:block" />
                          </span>
                        </summary>
                        <div className="px-4 pb-4">
                          <p className="text-white/45 text-sm leading-relaxed">{item.a}</p>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5">
                <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">Danh mục phim</h2>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Phim Lẻ Vietsub', href: '/phim-le' },
                    { label: 'Phim Bộ', href: '/phim-bo' },
                    { label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' },
                    { label: 'Hoạt Hình & Anime', href: '/hoat-hinh' },
                    { label: 'TV Shows', href: '/tv-shows' },
                    { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
                    { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' },
                    { label: 'Phim Âu Mỹ', href: '/phim-au-my' },
                    { label: 'Phim Thái Lan', href: '/phim-thai-lan' },
                    { label: 'Phim Nhật Bản', href: '/phim-nhat-ban' },
                    { label: 'Phim Việt Nam', href: '/phim-viet-nam' },
                    { label: 'Phim Sắp Chiếu', href: '/phim-sap-chieu' },
                    { label: 'Phim Mới Cập Nhật', href: '/phim-moi-cap-nhat' },
                    { label: 'Lọc Phim Nâng Cao', href: '/filter' },
                  ].map((r) => (
                    <Link
                      key={r.href}
                      to={r.href}
                      className="px-3.5 py-1.5 bg-white/[0.04] hover:bg-red-500/10 text-white/45 hover:text-red-400 border border-white/[0.07] hover:border-red-500/25 rounded-full text-xs transition-all cursor-pointer whitespace-nowrap"
                    >
                      {r.label}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

/* ── Featured Main Card ── */
function FeaturedCard({ movie }: { movie: Movie }) {
  const [imgError, setImgError] = useState(false);
  const imgUrl = getFeaturedUrl(movie.thumb_url || movie.poster_url);
  const [imgLoaded, setImgLoaded] = useState(isImagePreloaded(imgUrl));
  const ep = (movie.episode_current ?? '').toLowerCase().trim();
  const isFull = ep === 'full' || ep === 'hoàn tất' || ep === 'full hd';
  const isTrailer = ep === 'trailer';

  return (
    <Link to={movieDetailUrl(movie.slug)} className="group relative block rounded-2xl overflow-hidden bg-[#16192a] cursor-pointer">
      <div className="relative" style={{ aspectRatio: '16/9' }}>
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton z-[1]" />}
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <i className="ri-image-line text-white/20 text-3xl" />
          </div>
        )}
        <img
          src={imgUrl}
          alt={movie.name}
          loading="eager"
          decoding="sync"
          className={`w-full h-full object-cover object-center transition-all duration-700 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: 'contrast(1.05) saturate(1.1) brightness(0.92)' }}
          onLoad={() => { setImgLoaded(true); markImagePreloaded(imgUrl); }}
          onError={() => { setImgError(true); setImgLoaded(true); }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-[2]">
          <span className="flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            MỚI NHẤT
          </span>
          {movie.quality && (
            <span className="text-[10px] font-black bg-black/70 text-white px-2 py-0.5 rounded-md border border-white/15">{movie.quality}</span>
          )}
        </div>

        <div className="absolute top-3 right-3 z-[2] flex flex-col items-end gap-1">
          {movie.lang && (
            <span className="text-[10px] font-bold bg-white/15 text-white px-2 py-0.5 rounded-md">{movie.lang}</span>
          )}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
            isFull ? 'bg-green-500/20 text-green-400 border-green-500/30'
              : isTrailer ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
              : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
          }`}>
            {movie.episode_current}
          </span>
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-[2]">
          <h3 className="text-white text-lg md:text-xl font-bold line-clamp-1 group-hover:text-red-400 transition-colors">
            {movie.name}
          </h3>
          <p className="text-white/50 text-xs mt-1 line-clamp-1">{movie.origin_name}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {movie.year && <span className="text-[11px] text-white/50">{movie.year}</span>}
            {movie.time && (
              <>
                <span className="text-white/20 text-[10px]">·</span>
                <span className="text-[11px] text-white/40">{movie.time}</span>
              </>
            )}
            <span className="ml-auto flex items-center gap-1 bg-red-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
              <i className="ri-play-fill" /> Xem Ngay
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ── Side Featured Card (smaller) ── */
function SideFeaturedCard({ movie }: { movie: Movie }) {
  const [imgError, setImgError] = useState(false);
  const imgUrl = getSmallThumbUrl(movie.thumb_url || movie.poster_url);
  const [imgLoaded, setImgLoaded] = useState(isImagePreloaded(imgUrl));
  const ep = (movie.episode_current ?? '').toLowerCase().trim();
  const isFull = ep === 'full' || ep === 'hoàn tất' || ep === 'full hd';

  return (
    <Link to={movieDetailUrl(movie.slug)} className="group relative block rounded-xl overflow-hidden bg-[#16192a] cursor-pointer">
      <div className="relative" style={{ aspectRatio: '16/10' }}>
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton z-[1]" />}
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <i className="ri-image-line text-white/20 text-2xl" />
          </div>
        )}
        <img
          src={imgUrl}
          alt={movie.name}
          loading="lazy"
          className={`w-full h-full object-cover object-center transition-all duration-500 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: 'contrast(1.05) saturate(1.08)' }}
          onLoad={() => { setImgLoaded(true); markImagePreloaded(imgUrl); }}
          onError={() => { setImgError(true); setImgLoaded(true); }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        <div className="absolute top-2 left-2 z-[2]">
          {movie.quality && (
            <span className="text-[9px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded">{movie.quality}</span>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-2.5 z-[2]">
          <h4 className="text-white text-xs font-bold line-clamp-1 group-hover:text-red-400 transition-colors">
            {movie.name}
          </h4>
          <div className="flex items-center gap-1.5 mt-1">
            {movie.year && <span className="text-[10px] text-white/40">{movie.year}</span>}
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              isFull ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
            }`}>
              {movie.episode_current}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
