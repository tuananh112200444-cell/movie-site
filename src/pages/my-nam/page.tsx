import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHeroLazyLoad } from '@/hooks/useHeroLazyLoad';
import { Link } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import Pagination from '@/components/base/Pagination';
import SEO, { SITE_URL } from '@/components/base/SEO';
import { fetchMoviesByType } from '@/services/movieApi';
import type { MovieItem } from '@/types/movie';

const HERO_BG = 'https://readdy.ai/api/search-image?query=elegant%20romantic%20cinematic%20scene%20soft%20pink%20coral%20warm%20lighting%20dreamy%20bokeh%20aesthetic%20golden%20hour%20subtle%20glow%20beautiful%20atmosphere%20abstract%20artistic%20blur%20gentle%20rose%20gold%20tones%20moody%20dark%20background%20with%20soft%20light%20particles%20floating&width=1400&height=500&seq=my-nam-hero-bg-v1&orientation=landscape';

const SORT_OPTIONS = [
  { value: 'modified.time_desc', label: 'Mới cập nhật', icon: 'ri-time-line' },
  { value: 'year_desc', label: 'Năm mới nhất', icon: 'ri-calendar-line' },
  { value: 'year_asc', label: 'Năm cũ nhất', icon: 'ri-history-line' },
];

const COUNTRY_FILTERS = [
  { key: 'all', label: 'Tất Cả', icon: 'ri-apps-line' },
  { key: 'han-quoc', label: 'Hàn Quốc', icon: 'ri-flag-line' },
  { key: 'trung-quoc', label: 'Trung Quốc', icon: 'ri-flag-line' },
  { key: 'thai-lan', label: 'Thái Lan', icon: 'ri-flag-line' },
  { key: 'nhat-ban', label: 'Nhật Bản', icon: 'ri-flag-line' },
  { key: 'dai-loan', label: 'Đài Loan', icon: 'ri-flag-line' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả', icon: 'ri-apps-line' },
  { key: 'completed', label: 'Hoàn tất', icon: 'ri-checkbox-circle-line' },
  { key: 'ongoing', label: 'Đang chiếu', icon: 'ri-loader-2-line' },
  { key: 'trailer', label: 'Trailer', icon: 'ri-movie-2-line' },
];

const GENRE_TAGS = [
  { label: 'Tình Cảm', icon: 'ri-heart-3-line', color: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
  { label: 'Cổ Trang', icon: 'ri-ancient-pavilion-line', color: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  { label: 'Tâm Lý', icon: 'ri-brain-line', color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  { label: 'Hài Hước', icon: 'ri-emotion-laugh-line', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' },
  { label: 'Gia Đình', icon: 'ri-home-heart-line', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  { label: 'School', icon: 'ri-school-line', color: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
  { label: 'BoyLove', icon: 'ri-men-line', color: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/25' },
];

const FAQ = [
  {
    q: 'Phim mỹ nam Hàn Quốc hay nhất là gì?',
    a: 'KhoPhim tổng hợp hàng loạt phim Hàn Quốc có dàn diễn viên nam visual đỉnh cao: từ phim cổ trang như Moon Lovers, Scarlet Heart đến phim hiện đại như Business Proposal, True Beauty. Tất cả đều vietsub HD miễn phí.',
  },
  {
    q: 'Có phim BL Thái Lan, Trung Quốc không?',
    a: 'Có đầy đủ! KhoPhim cập nhật phim BL (Boy Love) từ Thái Lan, Trung Quốc, Đài Loan, Nhật Bản. Các series BL nổi tiếng đều có vietsub chất lượng cao, cập nhật nhanh chóng.',
  },
  {
    q: 'Phim cổ trang Trung Quốc có diễn viên nam đẹp trai?',
    a: 'Phim cổ trang Trung Quốc nổi tiếng với dàn mỹ nam visual cực phẩm. KhoPhim có kho phim cổ trang Trung Quốc khổng lồ: Trần Tình Lệnh, Hữu Phỉ, Trường An Như Cố, và hàng trăm bộ khác.',
  },
  {
    q: 'Xem phim mỹ nam miễn phí ở đâu tốt nhất?',
    a: 'KhoPhim Mỹ Nam là điểm đến lý tưởng để xem phim có diễn viên nam đẹp trai miễn phí. Không quảng cáo phiền phức, vietsub HD, cập nhật liên tục các phim Hàn, Trung, Thái hot nhất.',
  },
  {
    q: 'Phim boy love (BL) có đầy đủ không?',
    a: 'KhoPhim cung cấp thư viện phim BL đa dạng từ nhiều quốc gia. Từ BL Thái Lan kinh điển đến BL Trung Quốc, BL Nhật Bản, BL Đài Loan đều có đủ. Cập nhật theo mùa, vietsub nhanh.',
  },
];

const PAGE_SIZE = 30;
const POOL_CACHE_TTL = 10 * 60 * 1000;

const BG_COLOR = '#0f0a0a';
const ACCENT_1 = '#f472b6'; // pink-400
const ACCENT_2 = '#fb7185'; // rose-400
const ACCENT_3 = '#fdba74'; // orange-300
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
  return `kp_mynam_${slug}_${sort}_${country}_v1`;
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
    color = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
    label = 'Hoàn tất';
  } else if (ep.includes('tập')) {
    color = 'bg-rose-500/15 text-rose-400 border border-rose-500/25';
    label = episode;
  } else if (ep === 'trailer') {
    color = 'bg-orange-500/15 text-orange-400 border border-orange-500/25';
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

function isMyNamCountry(m: MovieItem): boolean {
  if (!m.country) return false;
  const allowed = ['hàn quốc', 'han quoc', 'trung quốc', 'trung quoc', 'thái lan', 'thai lan', 'nhật bản', 'nhat ban', 'đài loan', 'dai loan', 'hong kong', 'hồng kông'];
  if (Array.isArray(m.country)) {
    return m.country.some((c) => {
      const name = (c?.name ?? '').toLowerCase();
      return allowed.some((a) => name.includes(a));
    });
  }
  const str = String(m.country).toLowerCase();
  return allowed.some((a) => str.includes(a));
}

function getCountrySlug(m: MovieItem): string {
  if (!m.country) return '';
  const map: Record<string, string> = {
    'hàn quốc': 'han-quoc', 'han quoc': 'han-quoc',
    'trung quốc': 'trung-quoc', 'trung quoc': 'trung-quoc',
    'thái lan': 'thai-lan', 'thai lan': 'thai-lan',
    'nhật bản': 'nhat-ban', 'nhat ban': 'nhat-ban',
    'đài loan': 'dai-loan', 'dai loan': 'dai-loan',
    'hồng kông': 'hong-kong', 'hong kong': 'hong-kong',
  };
  const str = Array.isArray(m.country)
    ? (m.country[0]?.name ?? '').toLowerCase()
    : String(m.country).toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (str.includes(key)) return val;
  }
  return '';
}

export default function MyNamPage() {
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
    movies.filter(isMyNamCountry).forEach((m) => {
      const y = getMovieYear(m);
      if (y > 1900) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [movies]);

  const filteredMovies = useMemo(() => {
    let result = movies.filter(isMyNamCountry);
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
        const cached = poolMapRef.current[cacheKey];
        if (cached && cached.length > 0) {
          setMovies(cached);
          setTotalPages(inferCachedTotalPages(cached, totalPagesMapRef.current[cacheKey] ?? 1));
          setTotalItems(totalItemsMapRef.current[cacheKey] ?? cached.length);
          setLoading(false);
          return;
        }
        const ssCached = getPoolCache('my-nam', sort, country);
        if (ssCached && ssCached.length > 0) {
          poolMapRef.current[cacheKey] = ssCached;
          seenMapRef.current[cacheKey] = new Set(ssCached.map(getMovieKey));
          setMovies(ssCached);
          setTotalPages(inferCachedTotalPages(ssCached, totalPagesMapRef.current[cacheKey] ?? 1));
          setTotalItems(totalItemsMapRef.current[cacheKey] ?? ssCached.length);
          setLoading(false);
          return;
        }
      }
      seenMapRef.current[cacheKey] = new Set();
      poolMapRef.current[cacheKey] = [];
      setMovies([]);
      setTotalPages(1);
      setTotalItems(0);
    }
    setLoading(true);
    try {
      const sortParams = getSortParams(sort);
      const data = await fetchMoviesByType('phim-bo', pg, sortParams.sortField, sortParams.sortType);
      const items = data.items ?? [];
      const seen = seenMapRef.current[cacheKey] ?? new Set<string>();
      if (reset) {
        items.forEach((m) => seen.add(getMovieKey(m)));
        seenMapRef.current[cacheKey] = seen;
        poolMapRef.current[cacheKey] = items;
        setMovies(items);
      } else {
        const fresh = items.filter((m) => !seen.has(getMovieKey(m)));
        fresh.forEach((m) => seen.add(getMovieKey(m)));
        seenMapRef.current[cacheKey] = seen;
        const updated = [...(poolMapRef.current[cacheKey] ?? []), ...fresh];
        poolMapRef.current[cacheKey] = updated;
        setMovies(updated);
      }
      const tp = inferTotalPages(data.pagination?.totalPages ?? 1, items.length, pg);
      const ti = data.pagination?.totalItems ?? 0;
      setTotalPages(tp);
      totalPagesMapRef.current[cacheKey] = tp;
      totalItemsMapRef.current[cacheKey] = ti;
      setTotalItems(ti);
      if (pg === 1 && poolMapRef.current[cacheKey]?.length) {
        setPoolCache('my-nam', sort, country, poolMapRef.current[cacheKey]);
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

  const seoTitle = 'Phim Mỹ Nam Vietsub HD | KhoPhim BL & Boy Love';
  const canonicalPath = '/my-nam';
  const canonicalUrl = page > 1 ? `${SITE_URL}${canonicalPath}?page=${page}` : `${SITE_URL}${canonicalPath}`;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Mỹ Nam', item: `${SITE_URL}${canonicalPath}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: seoTitle,
      url: `${SITE_URL}${canonicalPath}`,
      description: 'Xem phim mỹ nam vietsub HD miễn phí tại KhoPhim. Phim Hàn Quốc, Trung Quốc, Thái Lan, Nhật Bản có dàn diễn viên nam đẹp trai. BL, Boy Love, cổ trang, tình cảm.',
      inLanguage: 'vi',
      isPartOf: { '@type': 'WebSite', name: 'KhoPhim Mỹ Nam', url: SITE_URL },
    },
    ...(filteredMovies.length > 0 ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Mỹ Nam – Danh Sách',
      url: `${SITE_URL}${canonicalPath}`,
      numberOfItems: filteredMovies.length,
      itemListElement: filteredMovies.slice(0, 10).map((m: MovieItem, i: number) => ({
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
        description="Xem phim mỹ nam vietsub HD miễn phí tại KhoPhim. Phim Hàn Quốc, Trung Quốc, Thái Lan, Nhật Bản có dàn diễn viên nam đẹp trai. BL, Boy Love, cổ trang, tình cảm — cập nhật liên tục!"
        keywords="phim my nam, phim han quoc my nam, phim trung quoc co trang, phim BL, boy love, phim thai lan BL, dien vien nam dep trai, phim tinh cam han quoc, phim co trang trung quoc"
        canonical={canonicalUrl}
        schema={schema}
      />
      <Navbar />

      {/* ─── Hero Banner ─── */}
      <div ref={heroRef} className="relative w-full h-[280px] sm:h-[340px] md:h-[420px] overflow-hidden">
        <div className="absolute inset-0">
          {showHeroBg ? (
            <img
              src={HERO_BG}
              alt="Mỹ Nam Background"
              className={`w-full h-full object-cover object-top transition-opacity duration-700 ${heroImgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setHeroImgLoaded(true)}
            />
          ) : null}
          <div
            className={`absolute inset-0 ${showHeroBg && heroImgLoaded ? 'opacity-0' : 'opacity-60'} transition-opacity duration-500`}
            style={{ background: 'linear-gradient(135deg, #be123c 0%, #fb7185 50%, #f97316 100%)' }}
          />
        </div>
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0a0a] via-[#0f0a0a]/70 to-rose-900/30" />
        {/* Warm accent overlay */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(251,113,133,0.12) 0%, rgba(249,115,22,0.08) 50%, rgba(190,18,60,0.12) 100%)' }} />

        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full opacity-20"
              style={{
                width: `${4 + (i % 4) * 2}px`,
                height: `${4 + (i % 4) * 2}px`,
                background: i % 2 === 0 ? '#fb7185' : '#fdba74',
                left: `${(i * 8.5) % 100}%`,
                top: `${(i * 7.3) % 80 + 10}%`,
                animation: `float ${8 + (i % 5)}s ease-in-out infinite`,
                animationDelay: `${i * 0.7}s`,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-end max-w-[1400px] mx-auto px-4 pb-6 sm:pb-8">
          <nav className="flex items-center gap-1.5 mb-3 sm:mb-4 text-[11px] sm:text-xs text-white/40 flex-wrap">
            <Link to="/" className="hover:text-white/70 transition-colors">Trang chủ</Link>
            <i className="ri-arrow-right-s-line" />
            <span style={{ color: '#fda4af' }}>Mỹ Nam</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-5">
            {/* Icon badge */}
            <div
              className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #be123c 0%, #fb7185 100%)',
                boxShadow: '0 0 40px rgba(190,18,60,0.5), 0 0 80px rgba(251,113,133,0.2)',
              }}
            >
              <i className="ri-heart-3-line text-white text-xl sm:text-2xl" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-semibold px-3 py-1 rounded-full text-white"
                  style={{ background: 'linear-gradient(135deg, #be123c 0%, #fb7185 100%)' }}
                >
                  THỂ LOẢI ĐẶC BIỆT
                </span>
                {!loading && totalItems > 0 && (
                  <span className="text-xs text-rose-300 bg-rose-500/15 px-2.5 py-1 rounded-full border border-rose-500/25">
                    {totalItems.toLocaleString()} phim
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
                Phim <span style={{ color: '#fda4af' }}>Mỹ Nam</span> Vietsub HD
              </h1>
              <p className="text-white/45 text-sm max-w-2xl leading-relaxed line-clamp-2">
                Khám phá thế giới phim có dàn diễn viên nam visual đỉnh cao. Phim Hàn Quốc, Trung Quốc, Thái Lan, Nhật Bản — tình cảm, cổ trang, BL, boy love. Tất cả vietsub HD miễn phí.
              </p>
            </div>

            <Link
              to="/filter?genre=tinh-cam"
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto mt-1 sm:mt-0"
            >
              <i className="ri-equalizer-2-line" />
              Lọc nâng cao
            </Link>
          </div>

        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 pb-16">
        {/* ─── Country Filters ─── */}
        <div className="flex items-center gap-2 py-4 sm:py-5 border-b border-white/5 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
          <span className="text-xs text-white/30 mr-1 flex-shrink-0">Quốc gia:</span>
          {COUNTRY_FILTERS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleCountryChange(opt.key)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeCountry === opt.key
                  ? 'text-white border border-rose-500/40'
                  : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
              }`}
              style={activeCountry === opt.key ? { background: 'linear-gradient(135deg, rgba(190,18,60,0.2) 0%, rgba(251,113,133,0.15) 100%)' } : undefined}
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
                    ? 'text-rose-300 border border-rose-500/30'
                    : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                }`}
                style={sortBy === opt.value ? { background: 'rgba(190,18,60,0.15)' } : undefined}
              >
                <i className={opt.icon} />
                {opt.label}
              </button>
            ))}
          </div>

          {!loading && totalItems > 0 && (
            <div className="text-xs text-white/30">
              Hiển thị <span className="text-white/60">{filteredMovies.length}</span>{activeFilterCount > 0 && <span className="text-white/40"> / {movies.filter(isMyNamCountry).length} lọc</span>}{activeFilterCount === 0 && ` / ${totalItems.toLocaleString()}`} phim
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
              Bộ lọc {activeFilterCount > 0 && <span className="text-rose-300 ml-1">({activeFilterCount})</span>}
            </button>

            {activeStatus !== 'all' && (
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/20">
                {STATUS_FILTERS.find((f) => f.key === activeStatus)?.label}
                <button onClick={() => setActiveStatus('all')} className="hover:text-white cursor-pointer"><i className="ri-close-line" /></button>
              </span>
            )}
            {activeYear !== 'all' && (
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-orange-500/15 text-orange-300 border border-orange-500/20">
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
                          ? 'text-rose-300 border border-rose-500/30'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                      }`}
                      style={activeStatus === opt.key ? { background: 'rgba(190,18,60,0.15)' } : undefined}
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
                          ? 'text-orange-300 border border-orange-500/30'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                      }`}
                      style={activeYear === 'all' ? { background: 'rgba(249,115,22,0.15)' } : undefined}
                    >
                      Tất cả
                    </button>
                    {availableYears.map((y) => (
                      <button
                        key={y}
                        onClick={() => setActiveYear(activeYear === String(y) ? 'all' : String(y))}
                        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                          activeYear === String(y)
                            ? 'text-orange-300 border border-orange-500/30'
                            : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                        }`}
                        style={activeYear === String(y) ? { background: 'rgba(249,115,22,0.15)' } : undefined}
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
                navigate(`/filter?genre=${encodeURIComponent(tag.label.toLowerCase().replace(/ /g, '-'))}`);
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
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-10">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredMovies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-white/30">
              <div className="w-20 h-20 flex items-center justify-center rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, rgba(190,18,60,0.3) 0%, rgba(251,113,133,0.2) 100%)' }}>
                <i className="ri-heart-3-line text-rose-300 text-3xl" />
              </div>
              <p className="text-lg font-medium mb-1">
                {activeFilterCount > 0 ? 'Không có phim phù hợp bộ lọc' : 'Chưa có phim nào'}
              </p>
              <p className="text-sm text-white/20">
                {activeFilterCount > 0 ? 'Thử điều chỉnh bộ lọc khác' : 'Đang cập nhật danh sách phim mỹ nam'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setActiveStatus('all'); setActiveYear('all'); }}
                  className="mt-4 flex items-center gap-1.5 text-sm text-rose-300 hover:text-rose-200 transition-colors cursor-pointer"
                >
                  <i className="ri-refresh-line" />
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-10">
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
                    className="flex items-center gap-2 border border-rose-500/25 hover:border-rose-500/50 text-white text-sm px-8 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    style={{ background: 'linear-gradient(135deg, rgba(190,18,60,0.1) 0%, rgba(251,113,133,0.08) 100%)' }}
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
                  accentClass="bg-rose-500"
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}
        </div>

        {/* ─── FAQ Section ─── */}
        <div className="mt-16 pt-10 border-t border-white/5">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <i className="ri-question-answer-line" style={{ color: '#fda4af' }} />
            Câu hỏi thường gặp về Phim Mỹ Nam
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FAQ.map((item, i) => (
              <div key={i} className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm text-white/80 font-medium leading-snug">{item.q}</span>
                  <i className={`ri-arrow-down-s-line text-rose-400/60 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
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
              background: 'linear-gradient(135deg, rgba(190,18,60,0.1) 0%, rgba(251,113,133,0.06) 50%, rgba(249,115,22,0.08) 100%)',
              borderColor: 'rgba(190,18,60,0.2)',
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <i className="ri-heart-3-line text-rose-400 text-lg" />
              <i className="ri-sparkling-line text-orange-400 text-lg" />
              <i className="ri-heart-3-line text-rose-400 text-lg" />
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
              Khám Phá Thế Giới Mỹ Nam
            </h3>
            <p className="text-white/45 text-sm max-w-xl mx-auto mb-5">
              Từ phim Hàn Quốc lãng mạn đến cổ trang Trung Quốc, từ BL Thái Lan đến boy love Nhật Bản — KhoPhim Mỹ Nam mang đến trải nghiệm xem phim tuyệt vời nhất.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/phim-han-quoc"
                className="flex items-center gap-2 px-6 py-3 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, #be123c 0%, #fb7185 100%)' }}
              >
                <i className="ri-film-line" />
                Phim Hàn Quốc
              </Link>
              <Link
                to="/filter?genre=tinh-cam"
                className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap border border-white/10"
              >
                <i className="ri-heart-3-line" />
                Phim Tình Cảm
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.15; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.25; }
          50% { transform: translateY(-10px) translateX(-5px); opacity: 0.15; }
          75% { transform: translateY(-25px) translateX(8px); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
