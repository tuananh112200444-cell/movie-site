import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHeroLazyLoad } from '@/hooks/useHeroLazyLoad';
import { Link } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import Pagination from '@/components/base/Pagination';
import SEO, { SITE_URL } from '@/components/base/SEO';
import { fetchMoviesByCategory } from '@/services/movieApi';
import type { MovieItem } from '@/types/movie';

const HERO_BG = 'https://readdy.ai/api/search-image?query=dark%20horror%20cinematic%20scene%20abandoned%20gothic%20building%20fog%20mist%20blood%20red%20moon%20eerie%20shadows%20creepy%20atmosphere%20dark%20blue%20black%20tones%20dramatic%20lighting%20thriller%20suspense%20film%20aesthetic%20wide%20landscape&width=1400&height=500&seq=phim-ma-hero-bg-v1&orientation=landscape';

const SORT_OPTIONS = [
  { value: 'modified.time_desc', label: 'Mới cập nhật', icon: 'ri-time-line' },
  { value: 'year_desc', label: 'Năm mới nhất', icon: 'ri-calendar-line' },
  { value: 'year_asc', label: 'Năm cũ nhất', icon: 'ri-history-line' },
];

const COUNTRY_FILTERS = [
  { key: 'all', label: 'Tất Cả', icon: 'ri-apps-line' },
  { key: 'han-quoc', label: 'Hàn Quốc', icon: 'ri-flag-line' },
  { key: 'nhat-ban', label: 'Nhật Bản', icon: 'ri-flag-line' },
  { key: 'au-my', label: 'Âu Mỹ', icon: 'ri-flag-line' },
  { key: 'thai-lan', label: 'Thái Lan', icon: 'ri-flag-line' },
  { key: 'trung-quoc', label: 'Trung Quốc', icon: 'ri-flag-line' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả', icon: 'ri-apps-line' },
  { key: 'completed', label: 'Hoàn tất', icon: 'ri-checkbox-circle-line' },
  { key: 'ongoing', label: 'Đang chiếu', icon: 'ri-loader-2-line' },
  { key: 'trailer', label: 'Trailer', icon: 'ri-movie-2-line' },
];

const GENRE_TAGS = [
  { label: 'Zombie', icon: 'ri-skull-2-line', color: 'bg-red-900/25 text-red-400 border-red-800/40' },
  { label: 'Ma', icon: 'ri-ghost-2-line', color: 'bg-stone-800/40 text-stone-400 border-stone-700/40' },
  { label: 'Quỷ', icon: 'ri-sparkling-2-line', color: 'bg-orange-900/25 text-orange-400 border-orange-800/40' },
  { label: 'Exorcism', icon: 'ri-book-open-line', color: 'bg-amber-900/25 text-amber-400 border-amber-800/40' },
  { label: 'Cult', icon: 'ri-group-line', color: 'bg-rose-900/25 text-rose-400 border-rose-800/40' },
  { label: 'Slasher', icon: 'ri-knife-line', color: 'bg-red-950/40 text-red-300 border-red-900/40' },
  { label: 'Tâm Lý', icon: 'ri-brain-line', color: 'bg-slate-800/40 text-slate-400 border-slate-700/40' },
  { label: 'Siêu Nhiên', icon: 'ri-eye-line', color: 'bg-zinc-800/40 text-zinc-400 border-zinc-700/40' },
];

const FAQ = [
  {
    q: 'Phim kinh dị Hàn Quốc hay nhất là gì?',
    a: 'KhoPhim tổng hợp hàng loạt phim kinh dị Hàn Quốc đỉnh cao: Train to Busan, The Wailing, A Tale of Two Sisters, và nhiều bộ khác. Phim Hàn kinh dị nổi tiếng với sự kết hợp giữa tâm lý, xã hội và yếu tố rùng rợn. Tất cả đều vietsub HD miễn phí.',
  },
  {
    q: 'Phim ma Nhật Bản (J-Horror) có ở KhoPhim không?',
    a: 'Có đầy đủ! KhoPhim có kho phim ma Nhật Bản kinh điển: The Ring, The Grudge, Dark Water, và hàng chục phim J-Horror khác. J-Horror nổi tiếng với yếu tố siêu nhiên, bóng ma trắng, và câu chuyện bị nguyền rủa.',
  },
  {
    q: 'Xem phim kinh dị miễn phí ở đâu chất lượng cao?',
    a: 'KhoPhim Ma là điểm đến hàng đầu để xem phim kinh dị vietsub HD miễn phí. Không quảng cáo phiền phức, cập nhật hàng ngày phim ma, phim zombie, phim exorcism từ Hàn, Nhật, Âu Mỹ.',
  },
  {
    q: 'Phim zombie hay nhất 2026 là gì?',
    a: 'KhoPhim cập nhật liên tục phim zombie mới nhất 2026 từ nhiều quốc gia. Từ phim zombie Hàn Quốc đến Hollywood, từ series zombie đến phim chiếu rạp đều có đủ vietsub HD.',
  },
  {
    q: 'KhoPhim có phim kinh dị Thái Lan không?',
    a: 'KhoPhim có đầy đủ phim ma Thái Lan — nổi tiếng với yếu tố bùa ngải, tâm linh và truyền thuyết địa phương. Phim ma Thái luôn mang đến cảm giác rùng rợn đặc trưng không lẫn với bất kỳ quốc gia nào.',
  },
];

const PAGE_SIZE = 36;
const POOL_CACHE_TTL = 10 * 60 * 1000;

const BG_COLOR = '#080808';

function getMovieKey(movie: MovieItem): string {
  return movie._id || movie.slug || `${movie.name}-${movie.year ?? ''}`;
}

function inferTotalPages(totalPages: number, itemCount: number, pg: number): number {
  if (itemCount >= PAGE_SIZE) return Math.max(totalPages, pg + 1);
  return Math.max(totalPages, pg);
}

function inferCachedTotalPages(items: MovieItem[], current = 1): number {
  return Math.max(current, Math.ceil(items.length / PAGE_SIZE) + (items.length >= PAGE_SIZE ? 1 : 0), 1);
}
function getPoolCacheKey(slug: string, sort: string, country: string) {
  return `kp_phimma_${slug}_${sort}_${country}_v1`;
}

function getPoolCache(slug: string, sort: string, country: string): MovieItem[] | null {
  try {
    const key = getPoolCacheKey(slug, sort, country);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { data: MovieItem[]; ts: number };
    if (Date.now() - entry.ts > POOL_CACHE_TTL) { sessionStorage.removeItem(key); return null; }
    return entry.data;
  } catch { return null; }
}

function setPoolCache(slug: string, sort: string, country: string, data: MovieItem[]): void {
  try {
    const key = getPoolCacheKey(slug, sort, country);
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota */ }
}

function SkeletonCard() {
  return (
    <div>
      <div className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
      <div className="mt-2 h-3 rounded bg-white/5 animate-pulse w-3/4" />
      <div className="mt-1 h-2.5 rounded bg-white/5 animate-pulse w-1/2" />
    </div>
  );
}

function StatusBadge({ episode }: { episode?: string }) {
  if (!episode) return null;
  const ep = episode.toLowerCase();
  let color = 'bg-white/5 text-white/40';
  let label = episode;

  if (ep.includes('hoàn tất') || ep === 'full') {
    color = 'bg-red-900/30 text-red-400 border border-red-800/30';
    label = 'Hoàn tất';
  } else if (ep.includes('tập')) {
    color = 'bg-stone-800/50 text-stone-400 border border-stone-700/30';
    label = episode;
  } else if (ep === 'trailer') {
    color = 'bg-orange-900/30 text-orange-400 border border-orange-800/30';
    label = 'Trailer';
  }

  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${color}`}>
      {label}
    </span>
  );
}

function getMovieYear(m: MovieItem): number {
  const y = Number(m.year);
  return Number.isFinite(y) && y > 1900 ? y : 0;
}

function getMovieStatus(m: MovieItem): 'completed' | 'ongoing' | 'trailer' | 'unknown' {
  const ep = (m.episode_current ?? '').toLowerCase();
  if (ep.includes('hoàn tất') || ep === 'full') return 'completed';
  if (ep === 'trailer') return 'trailer';
  if (ep.includes('tập')) return 'ongoing';
  return 'unknown';
}

function getCountrySlug(m: MovieItem): string {
  if (!m.country) return '';
  const map: Record<string, string> = {
    'hàn quốc': 'han-quoc', 'han quoc': 'han-quoc',
    'trung quốc': 'trung-quoc', 'trung quoc': 'trung-quoc',
    'thái lan': 'thai-lan', 'thai lan': 'thai-lan',
    'nhật bản': 'nhat-ban', 'nhat ban': 'nhat-ban',
    'âu mỹ': 'au-my', 'au my': 'au-my',
    'mỹ': 'au-my',
  };
  const str = Array.isArray(m.country)
    ? (typeof m.country[0] === 'string' ? m.country[0] : (m.country[0]?.name ?? '')).toLowerCase()
    : String(m.country).toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (str.includes(key)) return val;
  }
  return '';
}

export default function PhimMaPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('modified.time_desc');
  const [activeCountry, setActiveCountry] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [activeYear, setActiveYear] = useState('all');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const poolMapRef = useRef<Record<string, MovieItem[]>>({});
  const seenMapRef = useRef<Record<string, Set<string>>>({});
  const totalPagesMapRef = useRef<Record<string, number>>({});
  const totalItemsMapRef = useRef<Record<string, number>>({});
  const { heroRef, showHeroBg, heroImgLoaded, setHeroImgLoaded } = useHeroLazyLoad();

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    movies.forEach((m) => {
      const y = getMovieYear(m);
      if (y > 1900) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [movies]);

  const filteredMovies = useMemo(() => {
    let result = [...movies];
    if (activeCountry !== 'all') {
      result = result.filter((m) => getCountrySlug(m) === activeCountry);
    }
    if (activeStatus !== 'all') {
      result = result.filter((m) => getMovieStatus(m) === activeStatus);
    }
    if (activeYear !== 'all') {
      const y = Number(activeYear);
      result = result.filter((m) => getMovieYear(m) === y);
    }
    return result;
  }, [movies, activeCountry, activeStatus, activeYear]);

  const getSortParams = (sort: string) => {
    if (sort === 'year_desc') return { sortField: 'year', sortType: 'desc' as const };
    if (sort === 'year_asc') return { sortField: 'year', sortType: 'asc' as const };
    return { sortField: 'modified.time', sortType: 'desc' as const };
  };

  const fetchMovies = useCallback(async (pg: number, reset = false, sort = sortBy, country = activeCountry) => {
    const cacheKey = `${sort}_${country}`;
    if (reset) {
      if (pg === 1) {
        const cached = poolMapRef.current?.[cacheKey];
        if (cached && cached.length > 0) {
          setMovies(cached);
          setTotalPages(inferCachedTotalPages(cached, totalPagesMapRef.current?.[cacheKey] ?? 1));
          setTotalItems(totalItemsMapRef.current?.[cacheKey] ?? cached.length);
          setLoading(false);
          return;
        }
        const ssCached = getPoolCache('kinh-di', sort, country);
        if (ssCached && ssCached.length > 0) {
          poolMapRef.current ??= {};
          seenMapRef.current ??= {};
          poolMapRef.current[cacheKey] = ssCached;
          seenMapRef.current[cacheKey] = new Set(ssCached.map(getMovieKey));
          setMovies(ssCached);
          setTotalPages(inferCachedTotalPages(ssCached, totalPagesMapRef.current?.[cacheKey] ?? 1));
          setTotalItems(totalItemsMapRef.current?.[cacheKey] ?? ssCached.length);
          setLoading(false);
          return;
        }
      }
      seenMapRef.current ??= {};
      poolMapRef.current ??= {};
      seenMapRef.current[cacheKey] = new Set();
      poolMapRef.current[cacheKey] = [];
      setMovies([]);
      setTotalPages(1);
      setTotalItems(0);
    }
    setLoading(true);
    try {
      const sortParams = getSortParams(sort);
      const data = await fetchMoviesByCategory({
        type: 'phim-moi-cap-nhat',
        category: 'kinh-di',
        page: pg,
        ...sortParams,
      });
      const items = data.items ?? [];
      const seen = seenMapRef.current?.[cacheKey] ?? new Set<string>();
      if (reset) {
        items.forEach((m) => seen.add(getMovieKey(m)));
        seenMapRef.current ??= {};
        poolMapRef.current ??= {};
        seenMapRef.current[cacheKey] = seen;
        poolMapRef.current[cacheKey] = items;
        setMovies(items);
      } else {
        const fresh = items.filter((m) => !seen.has(getMovieKey(m)));
        fresh.forEach((m) => seen.add(getMovieKey(m)));
        seenMapRef.current ??= {};
        poolMapRef.current ??= {};
        seenMapRef.current[cacheKey] = seen;
        const updated = [...(poolMapRef.current[cacheKey] ?? []), ...fresh];
        poolMapRef.current[cacheKey] = updated;
        setMovies(updated);
      }
      const tp = inferTotalPages(data.pagination?.totalPages ?? 1, items.length, pg);
      const ti = data.pagination?.totalItems ?? 0;
      setTotalPages(tp);
      totalPagesMapRef.current ??= {};
      totalItemsMapRef.current ??= {};
      totalPagesMapRef.current[cacheKey] = tp;
      totalItemsMapRef.current[cacheKey] = ti;
      setTotalItems(ti);
      if (pg === 1 && poolMapRef.current[cacheKey]?.length) {
        setPoolCache('kinh-di', sort, country, poolMapRef.current[cacheKey]);
      }
    } catch {
      if (reset) setMovies([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy, activeCountry]);

  useEffect(() => {
    poolMapRef.current = {};
    seenMapRef.current = {};
    totalPagesMapRef.current = {};
    totalItemsMapRef.current = {};
    setMovies([]);
    setPage(1);
    setActiveStatus('all');
    setActiveYear('all');
    fetchMovies(1, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [fetchMovies]);

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    setPage(1);
    setActiveStatus('all');
    setActiveYear('all');
    fetchMovies(1, true, newSort, activeCountry);
  };

  const handleCountryChange = (newCountry: string) => {
    setActiveCountry(newCountry);
    setPage(1);
    setActiveStatus('all');
    setActiveYear('all');
    fetchMovies(1, true, sortBy, newCountry);
  };

  const handlePageChange = useCallback((next: number) => {
    setPage(next);
    fetchMovies(next, true, sortBy, activeCountry);
  }, [activeCountry, fetchMovies, sortBy]);

  const handleLoadMore = () => {
    handlePageChange(page + 1);
  };

  const activeFilterCount = (activeCountry !== 'all' ? 1 : 0) + (activeStatus !== 'all' ? 1 : 0) + (activeYear !== 'all' ? 1 : 0);

  const seoTitle = 'Phim Kinh Dị - Ma Zombie Vietsub HD Miễn Phí | KhoPhim Ma';
  const canonicalPath = '/phim-ma';
  const canonicalUrl = page > 1 ? `${SITE_URL}${canonicalPath}?page=${page}` : `${SITE_URL}${canonicalPath}`;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Phim Ma', item: `${SITE_URL}${canonicalPath}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: seoTitle,
      url: `${SITE_URL}${canonicalPath}`,
      description: 'Xem phim kinh dị, ma, zombie vietsub HD miễn phí tại KhoPhim Ma. Horror Hàn Quốc, Nhật Bản, Âu Mỹ, Thái Lan. Cập nhật hàng ngày, không quảng cáo!',
      inLanguage: 'vi',
      isPartOf: { '@type': 'WebSite', name: 'KhoPhim Ma', url: SITE_URL },
    },
    ...(filteredMovies.length > 0 ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Phim Ma – Danh Sách',
      url: `${SITE_URL}${canonicalPath}`,
      numberOfItems: filteredMovies.length,
      itemListElement: filteredMovies.slice(0, 10).map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/phim/${m.slug}`,
        name: m.name,
      })),
    }] : []),
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: BG_COLOR }}>
      <SEO
        title={seoTitle}
        description="Xem phim kinh dị, ma, zombie vietsub HD miễn phí tại KhoPhim Ma. Horror Hàn Quốc, Nhật Bản (J-Horror), Âu Mỹ, Thái Lan. Cập nhật hàng ngày, không quảng cáo!"
        keywords="phim kinh di, phim ma, phim zombie, phim horror, phim ma han quoc, phim kinh di nhat ban, J-horror, phim exorcism, phim ma thai lan, xem phim kinh di"
        canonical={canonicalUrl}
        schema={schema}
      />
      <Navbar />

      {/* ─── Horror Hero Banner ─── */}
      <div ref={heroRef} className="relative w-full h-[280px] sm:h-[340px] md:h-[420px] overflow-hidden">
        <div className="absolute inset-0">
          {showHeroBg ? (
            <img
              src={HERO_BG}
              alt="Phim Ma Background"
              className={`w-full h-full object-cover object-top transition-opacity duration-700 ${heroImgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setHeroImgLoaded(true)}
            />
          ) : null}
          <div
            className={`absolute inset-0 ${showHeroBg && heroImgLoaded ? 'opacity-0' : 'opacity-50'} transition-opacity duration-500`}
            style={{ background: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #1c1917 100%)' }}
          />
        </div>
        {/* Dark overlay — extra dark for horror */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/80 to-red-950/20" />
        {/* Blood-red accent overlay */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(153,27,27,0.15) 0%, rgba(69,10,10,0.2) 50%, rgba(28,25,23,0.15) 100%)' }} />

        {/* Floating particles — darker, slower for horror mood */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full opacity-10"
              style={{
                width: `${2 + (i % 3)}px`,
                height: `${2 + (i % 3)}px`,
                background: i % 2 === 0 ? '#991b1b' : '#292524',
                left: `${(i * 10.3) % 100}%`,
                top: `${(i * 8.7) % 80 + 10}%`,
                animation: `float ${12 + (i % 7)}s ease-in-out infinite`,
                animationDelay: `${i * 1.1}s`,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-end max-w-[1760px] mx-auto px-4 pb-6 sm:pb-8">
          <nav className="flex items-center gap-1.5 mb-3 sm:mb-4 text-[11px] sm:text-xs text-white/40 flex-wrap">
            <Link to="/" className="hover:text-white/70 transition-colors">Trang chủ</Link>
            <i className="ri-arrow-right-s-line" />
            <span style={{ color: '#f87171' }}>Phim Ma</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-5">
            {/* Skull icon badge */}
            <div
              className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #450a0a 0%, #991b1b 100%)',
                boxShadow: '0 0 40px rgba(153,27,27,0.5), 0 0 80px rgba(69,10,10,0.3)',
              }}
            >
              <i className="ri-skull-2-line text-white text-xl sm:text-2xl" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-semibold px-3 py-1 rounded-full text-white"
                  style={{ background: 'linear-gradient(135deg, #450a0a 0%, #991b1b 100%)' }}
                >
                  THỂ LOẠI ĐẶC BIỆT
                </span>
                {!loading && totalItems > 0 && (
                  <span className="text-xs text-red-300 bg-red-900/20 px-2.5 py-1 rounded-full border border-red-800/30">
                    {totalItems.toLocaleString()} phim
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
                Phim <span style={{ color: '#f87171' }}>Kinh Dị</span> - Ma Zombie HD
              </h1>
              <p className="text-white/45 text-sm max-w-2xl leading-relaxed line-clamp-2">
                Khám phá thế giới phim kinh dị tại KhoPhim Ma. Horror Hàn Quốc rùng rợn, J-Horror Nhật Bản bí ẩn, zombie Âu Mỹ, phim ma Thái Lan — tất cả vietsub HD, không quảng cáo.
              </p>
            </div>

            <Link
              to="/filter?genre=kinh-di"
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto mt-1 sm:mt-0"
            >
              <i className="ri-equalizer-2-line" />
              Lọc nâng cao
            </Link>
          </div>

        </div>
      </div>

      <main className="max-w-[1760px] mx-auto px-4 pb-16">
        {/* ─── Country Filters ─── */}
        <div className="flex items-center gap-2 py-4 sm:py-5 border-b border-white/5 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
          <span className="text-xs text-white/30 mr-1 flex-shrink-0">Quốc gia:</span>
          {COUNTRY_FILTERS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleCountryChange(opt.key)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeCountry === opt.key
                  ? 'text-white border border-red-800/50'
                  : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
              }`}
              style={activeCountry === opt.key ? { background: 'linear-gradient(135deg, rgba(69,10,10,0.4) 0%, rgba(153,27,27,0.2) 100%)' } : undefined}
            >
              <i className={opt.icon} />
              {opt.label}
            </button>
          ))}
        </div>

        {/* ─── Sort ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 py-4 sm:py-5 border-b border-white/5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
            <span className="text-xs text-white/30 mr-1 flex-shrink-0">Sắp xếp:</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSortChange(opt.value)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  sortBy === opt.value
                    ? 'text-red-300 border border-red-800/40'
                    : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                }`}
                style={sortBy === opt.value ? { background: 'rgba(69,10,10,0.25)' } : undefined}
              >
                <i className={opt.icon} />
                {opt.label}
              </button>
            ))}
          </div>

          {!loading && totalItems > 0 && (
            <div className="text-xs text-white/30">
              Hiển thị <span className="text-white/60">{filteredMovies.length}</span>{activeFilterCount > 0 && <span className="text-white/40"> / {movies.length} lọc</span>}{activeFilterCount === 0 && ` / ${totalItems.toLocaleString()}`} phim
            </div>
          )}
        </div>

        {/* ─── Filter Bar ─── */}
        <div className="py-3 border-b border-white/5">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 transition-all cursor-pointer whitespace-nowrap"
            >
              <i className={showFilters ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} />
              Bộ lọc {activeFilterCount > 0 && <span className="text-red-300 ml-1">({activeFilterCount})</span>}
            </button>

            {activeStatus !== 'all' && (
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-red-900/25 text-red-300 border border-red-800/30">
                {STATUS_FILTERS.find((f) => f.key === activeStatus)?.label}
                <button onClick={() => setActiveStatus('all')} className="hover:text-white cursor-pointer"><i className="ri-close-line" /></button>
              </span>
            )}
            {activeYear !== 'all' && (
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-orange-900/25 text-orange-300 border border-orange-800/30">
                Năm {activeYear}
                <button onClick={() => setActiveYear('all')} className="hover:text-white cursor-pointer"><i className="ri-close-line" /></button>
              </span>
            )}
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setActiveStatus('all'); setActiveYear('all'); }}
                className="text-[11px] text-white/30 hover:text-white/60 transition-colors cursor-pointer whitespace-nowrap"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
              {/* Status filter */}
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-[11px] text-white/30 mt-1.5 flex-shrink-0 w-14">Trạng thái:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {STATUS_FILTERS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setActiveStatus(activeStatus === opt.key ? 'all' : opt.key)}
                      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        activeStatus === opt.key
                          ? 'text-red-300 border border-red-800/40'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                      }`}
                      style={activeStatus === opt.key ? { background: 'rgba(69,10,10,0.25)' } : undefined}
                    >
                      <i className={opt.icon} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year filter */}
              {availableYears.length > 0 && (
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-[11px] text-white/30 mt-1.5 flex-shrink-0 w-14">Năm:</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setActiveYear('all')}
                      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        activeYear === 'all'
                          ? 'text-orange-300 border border-orange-800/40'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                      }`}
                      style={activeYear === 'all' ? { background: 'rgba(124,45,18,0.25)' } : undefined}
                    >
                      Tất cả
                    </button>
                    {availableYears.map((y) => (
                      <button
                        key={y}
                        onClick={() => setActiveYear(activeYear === String(y) ? 'all' : String(y))}
                        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                          activeYear === String(y)
                            ? 'text-orange-300 border border-orange-800/40'
                            : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                        }`}
                        style={activeYear === String(y) ? { background: 'rgba(124,45,18,0.25)' } : undefined}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Genre Tags Row ─── */}
        <div className="flex items-center gap-2 py-4 flex-wrap">
          {GENRE_TAGS.map((tag) => (
            <button
              key={tag.label}
              onClick={() => {
                navigate(`/filter?genre=kinh-di&keyword=${encodeURIComponent(tag.label)}`);
              }}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${tag.color} hover:opacity-80`}
            >
              <i className={tag.icon} />
              {tag.label}
            </button>
          ))}
        </div>

        {/* ─── Movie Grid ─── */}
        <div className="pt-4">
          {loading && movies.length === 0 ? (
            <div className="grid movie-grid-desktop">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredMovies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-white/30">
              <div className="w-20 h-20 flex items-center justify-center rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, rgba(69,10,10,0.4) 0%, rgba(153,27,27,0.3) 100%)' }}>
                <i className="ri-skull-2-line text-red-400 text-3xl" />
              </div>
              <p className="text-lg font-medium mb-1">
                {activeFilterCount > 0 ? 'Không có phim phù hợp bộ lọc' : 'Chưa có phim nào'}
              </p>
              <p className="text-sm text-white/20">
                {activeFilterCount > 0 ? 'Thử điều chỉnh bộ lọc khác' : 'Đang cập nhật danh sách phim ma'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setActiveStatus('all'); setActiveYear('all'); }}
                  className="mt-4 flex items-center gap-1.5 text-sm text-red-300 hover:text-red-200 transition-colors cursor-pointer"
                >
                  <i className="ri-refresh-line" />
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid movie-grid-desktop">
                {filteredMovies.map((m, idx) => (
                  <div key={getMovieKey(m)} className="relative group">
                    <MovieCard movie={m} priority={idx < 2} />
                    <div className="absolute top-1.5 left-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <StatusBadge episode={m.episode_current} />
                    </div>
                  </div>
                ))}
              </div>

              {page < totalPages && activeFilterCount === 0 && (
                <div className="flex justify-center mt-10">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="flex items-center gap-2 border border-red-800/30 hover:border-red-700/50 text-white text-sm px-8 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    style={{ background: 'linear-gradient(135deg, rgba(69,10,10,0.2) 0%, rgba(153,27,27,0.1) 100%)' }}
                  >
                    {loading
                      ? <><i className="ri-loader-4-line animate-spin" /> Đang tải...</>
                      : <><i className="ri-add-line" /> Tải thêm phim</>
                    }
                  </button>
                </div>
              )}

              {activeFilterCount === 0 && (
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  basePath={canonicalPath}
                  hasNext={page < totalPages}
                  accentClass="bg-red-700"
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}
        </div>

        {/* ─── FAQ Section ─── */}
        <div className="mt-16 pt-10 border-t border-white/5">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <i className="ri-question-answer-line" style={{ color: '#f87171' }} />
            Câu hỏi thường gặp về Phim Kinh Dị
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FAQ.map((item, i) => (
              <div key={i} className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm text-white/80 font-medium leading-snug">{item.q}</span>
                  <i className={`ri-arrow-down-s-line text-red-400/60 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-3 sm:px-4 pb-4 text-sm text-white/50 leading-relaxed border-t border-white/5 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ─── CTA Section ─── */}
        <div className="mt-12 pt-8 border-t border-white/5">
          <div
            className="rounded-2xl p-4 sm:p-6 md:p-8 text-center border"
            style={{
              background: 'linear-gradient(135deg, rgba(69,10,10,0.15) 0%, rgba(153,27,27,0.08) 50%, rgba(28,25,23,0.1) 100%)',
              borderColor: 'rgba(153,27,27,0.25)',
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <i className="ri-skull-line text-red-400 text-lg" />
              <i className="ri-ghost-2-line text-stone-400 text-lg" />
              <i className="ri-skull-line text-red-400 text-lg" />
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
              Khám Phá Thế Giới Kinh Dị
            </h3>
            <p className="text-white/45 text-sm max-w-xl mx-auto mb-5">
              Từ phim ma Hàn Quốc ám ảnh đến J-Horror bí ẩn, từ zombie Âu Mỹ đến phim ma Thái Lan rùng rợn — KhoPhim Ma mang đến trải nghiệm horror tuyệt vời nhất.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/phim-han-quoc"
                className="flex items-center gap-2 px-6 py-3 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, #450a0a 0%, #991b1b 100%)' }}
              >
                <i className="ri-film-line" />
                Phim Hàn Quốc
              </Link>
              <Link
                to="/phim-nhat-ban"
                className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap border border-white/10"
              >
                <i className="ri-global-line" />
                Phim Nhật Bản
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.1; }
          25% { transform: translateY(-15px) translateX(8px); opacity: 0.15; }
          50% { transform: translateY(-8px) translateX(-4px); opacity: 0.1; }
          75% { transform: translateY(-20px) translateX(6px); opacity: 0.12; }
        }
      `}</style>
    </div>
  );
}
