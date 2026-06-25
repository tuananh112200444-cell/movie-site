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

const ANIME_BG = 'https://readdy.ai/api/search-image?query=dark%20anime%20cityscape%20neon%20purple%20pink%20lights%20night%20cyberpunk%20aesthetic%20cherry%20blossom%20petals%20falling%20dramatic%20cinematic%20atmosphere%20stars%20magical%20glowing%20particles%20fantasy%20japanese%20style%20wide%20landscape&width=1400&height=500&seq=anime-hero-bg-v1&orientation=landscape';

const SORT_OPTIONS = [
  { value: 'modified.time_desc', label: 'Mới cập nhật', icon: 'ri-time-line' },
  { value: 'year_desc', label: 'Năm mới nhất', icon: 'ri-calendar-line' },
  { value: 'year_asc', label: 'Năm cũ nhất', icon: 'ri-history-line' },
];

const SEASON_FILTERS = [
  { key: 'all', label: 'Tất Cả', icon: 'ri-apps-line' },
  { key: 'winter', label: 'Mùa Đông', icon: 'ri-snowflake-line' },
  { key: 'spring', label: 'Mùa Xuân', icon: 'ri-sun-foggy-line' },
  { key: 'summer', label: 'Mùa Hè', icon: 'ri-sun-line' },
  { key: 'fall', label: 'Mùa Thu', icon: 'ri-leaf-line' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả', icon: 'ri-apps-line' },
  { key: 'completed', label: 'Hoàn tất', icon: 'ri-checkbox-circle-line' },
  { key: 'ongoing', label: 'Đang chiếu', icon: 'ri-loader-2-line' },
  { key: 'trailer', label: 'Trailer', icon: 'ri-movie-2-line' },
];

const EPISODE_FILTERS = [
  { key: 'all', label: 'Tất cả', icon: 'ri-apps-line' },
  { key: 'movie', label: 'Movie (1 tập)', icon: 'ri-film-line' },
  { key: 'short', label: 'Ngắn (2-12)', icon: 'ri-numbers-line' },
  { key: 'medium', label: 'TB (13-24)', icon: 'ri-folders-line' },
  { key: 'long', label: 'Dài (25+)', icon: 'ri-stack-line' },
];

const GENRE_TAGS = [
  { label: 'Shounen', icon: 'ri-fire-line', color: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  { label: 'Shoujo', icon: 'ri-heart-line', color: 'bg-pink-500/15 text-pink-400 border-pink-500/25' },
  { label: 'Isekai', icon: 'ri-earth-line', color: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
  { label: 'Mecha', icon: 'ri-robot-line', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  { label: 'Slice of Life', icon: 'ri-cup-line', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  { label: 'Psychological', icon: 'ri-brain-line', color: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/25' },
  { label: 'Fantasy', icon: 'ri-magic-line', color: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
  { label: 'Romance', icon: 'ri-hearts-line', color: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
];

const FAQ = [
  {
    q: 'Xem anime vietsub miễn phí ở đâu tốt nhất?',
    a: 'KhoPhim Anime là điểm đến lý tưởng để xem anime vietsub HD miễn phí. Kho phim anime khổng lồ với hàng nghìn bộ anime mùa mới được cập nhật nhanh chóng, không quảng cáo phiền phức.',
  },
  {
    q: 'Anime mùa mới được cập nhật nhanh không?',
    a: 'Cực kỳ nhanh! KhoPhim cập nhật anime mùa mới ngay trong tuần đầu phát sóng tại Nhật Bản. Từ anime shounen bom tấn đến anime indie ẩn mình đều có đủ vietsub.',
  },
  {
    q: 'Có thể xem anime lồng tiếng Việt không?',
    a: 'KhoPhim cung cấp anime với nhiều loại âm thanh: vietsub phụ đề (phổ biến nhất), thuyết minh tiếng Việt cho một số anime kinh điển. Thông tin ngôn ngữ được hiển thị rõ ràng trên từng phim.',
  },
  {
    q: 'Anime hay nhất 2026 là gì?',
    a: '2026 là năm bùng nổ của anime với nhiều season 2 được mong chờ. Vào trang Anime để xem danh sách anime được đánh giá cao nhất, cập nhật theo tuần theo điểm số từ cộng đồng.',
  },
  {
    q: 'KhoPhim có anime movie không?',
    a: 'Có! KhoPhim có đầy đủ anime movie từ Studio Ghibli, Makoto Shinkai, và nhiều studio khác. Từ anime chiếu rạp kinh điển đến movie anime mới nhất đều có đủ vietsub HD.',
  },
];

const PAGE_SIZE = 36;
const POOL_CACHE_TTL = 10 * 60 * 1000;
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

function getPoolCacheKey(slug: string, sort: string, season: string) {
  return `kp_anime_${slug}_${sort}_${season}_v1`;
}

function getPoolCache(slug: string, sort: string, season: string): MovieItem[] | null {
  try {
    const key = getPoolCacheKey(slug, sort, season);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { data: MovieItem[]; ts: number };
    if (Date.now() - entry.ts > POOL_CACHE_TTL) { sessionStorage.removeItem(key); return null; }
    return entry.data;
  } catch { return null; }
}

function setPoolCache(slug: string, sort: string, season: string, data: MovieItem[]): void {
  try {
    const key = getPoolCacheKey(slug, sort, season);
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

function AnimeSeasonBadge({ episode }: { episode?: string }) {
  if (!episode) return null;
  const ep = episode.toLowerCase();
  let color = 'bg-white/5 text-white/40';
  let label = episode;

  if (ep.includes('hoàn tất') || ep === 'full') {
    color = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
    label = 'Hoàn tất';
  } else if (ep.includes('tập')) {
    color = 'bg-purple-500/15 text-purple-400 border border-purple-500/25';
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

function getEpisodeCount(m: MovieItem): number {
  const ep = (m.episode_current ?? '').toLowerCase();
  if (ep.includes('hoàn tất') || ep === 'full') {
    const match = m.episode_total?.match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  if (ep === 'trailer') return 0;
  const match = ep.match(/(\d+)/);
  if (match) return Number(match[1]);
  return 0;
}

function getMovieStatus(m: MovieItem): 'completed' | 'ongoing' | 'trailer' | 'unknown' {
  const ep = (m.episode_current ?? '').toLowerCase();
  if (ep.includes('hoàn tất') || ep === 'full') return 'completed';
  if (ep === 'trailer') return 'trailer';
  if (ep.includes('tập')) return 'ongoing';
  return 'unknown';
}

function isJapanAnime(m: MovieItem): boolean {
  if (!m.country) return false;
  if (Array.isArray(m.country)) {
    return m.country.some((c) => {
      const name = (c?.name ?? '').toLowerCase();
      return name.includes('nhật') || name.includes('nhat');
    });
  }
  const str = String(m.country).toLowerCase();
  return str.includes('nhật') || str.includes('nhat');
}

export default function AnimePage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('modified.time_desc');
  const [activeSeason, setActiveSeason] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [activeEpisode, setActiveEpisode] = useState('all');
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

  // Filter: Japan anime only + user filters
  const filteredMovies = useMemo(() => {
    let result = movies.filter(isJapanAnime);
    if (activeStatus !== 'all') {
      result = result.filter((m) => getMovieStatus(m) === activeStatus);
    }
    if (activeEpisode !== 'all') {
      result = result.filter((m) => {
        const count = getEpisodeCount(m);
        switch (activeEpisode) {
          case 'movie': return count <= 1;
          case 'short': return count >= 2 && count <= 12;
          case 'medium': return count >= 13 && count <= 24;
          case 'long': return count >= 25;
          default: return true;
        }
      });
    }
    if (activeYear !== 'all') {
      const y = Number(activeYear);
      result = result.filter((m) => getMovieYear(m) === y);
    }
    return result;
  }, [movies, activeStatus, activeEpisode, activeYear]);

  const getSortParams = (sort: string) => {
    if (sort === 'year_desc') return { sortField: 'year', sortType: 'desc' as const };
    if (sort === 'year_asc') return { sortField: 'year', sortType: 'asc' as const };
    return { sortField: 'modified.time', sortType: 'desc' as const };
  };

  const fetchMovies = useCallback(async (pg: number, reset = false, sort = sortBy, season = activeSeason) => {
    const cacheKey = `${sort}_${season}`;
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
        const ssCached = getPoolCache('anime', sort, season);
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
      // API: hoat-hinh is a TYPE, not a category filter
      const data = await fetchMoviesByType('hoat-hinh', pg, sortParams.sortField, sortParams.sortType);
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
        setPoolCache('anime', sort, season, poolMapRef.current[cacheKey]);
      }
    } catch {
      if (reset) setMovies([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy, activeSeason]);

  useEffect(() => {
    poolMapRef.current = {};
    seenMapRef.current = {};
    totalPagesMapRef.current = {};
    totalItemsMapRef.current = {};
    setMovies([]);
    setPage(1);
    setActiveStatus('all');
    setActiveEpisode('all');
    setActiveYear('all');
    fetchMovies(1, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [fetchMovies]);

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    setPage(1);
    setActiveStatus('all');
    setActiveEpisode('all');
    setActiveYear('all');
    fetchMovies(1, true, newSort, activeSeason);
  };

  const handleSeasonChange = (newSeason: string) => {
    setActiveSeason(newSeason);
    setPage(1);
    setActiveStatus('all');
    setActiveEpisode('all');
    setActiveYear('all');
    fetchMovies(1, true, sortBy, newSeason);
  };

  const handlePageChange = useCallback((next: number) => {
    setPage(next);
    fetchMovies(next, true, sortBy, activeSeason);
  }, [activeSeason, fetchMovies, sortBy]);

  const handleLoadMore = () => {
    handlePageChange(page + 1);
  };

  const activeFilterCount = (activeStatus !== 'all' ? 1 : 0) + (activeEpisode !== 'all' ? 1 : 0) + (activeYear !== 'all' ? 1 : 0);

  const seoTitle = 'Anime Vietsub HD Miễn Phí | KhoPhim Anime';
  const canonicalPath = '/anime';
  const canonicalUrl = page > 1 ? `${SITE_URL}${canonicalPath}?page=${page}` : `${SITE_URL}${canonicalPath}`;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Anime', item: `${SITE_URL}${canonicalPath}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: seoTitle,
      url: `${SITE_URL}${canonicalPath}`,
      description: 'Xem anime vietsub HD miễn phí tại KhoPhim Anime. Kho anime Nhật Bản khổng lồ: shounen, shoujo, isekai, mecha, slice of life. Cập nhật mùa mới hàng tuần, không quảng cáo.',
      inLanguage: 'vi',
      isPartOf: { '@type': 'WebSite', name: 'KhoPhim Anime', url: SITE_URL },
    },
    ...(filteredMovies.length > 0 ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Anime – Danh Sách',
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
    <div className="min-h-screen text-white" style={{ backgroundColor: '#0a0614' }}>
      <SEO
        title={seoTitle}
        description="Xem anime vietsub HD miễn phí tại KhoPhim Anime. Kho anime Nhật Bản khổng lồ: shounen, shoujo, isekai, mecha, slice of life. Cập nhật anime mùa mới hàng tuần, không quảng cáo!"
        keywords="anime vietsub, xem anime, anime Nhat Ban, anime mien phi, anime HD, anime shounen, anime isekai, anime moi, anime hoat hinh, kho anime"
        canonical={canonicalUrl}
        schema={schema}
      />
      <Navbar />

      {/* ─── Anime Hero Banner ─── */}
      <div ref={heroRef} className="relative w-full h-[280px] sm:h-[340px] md:h-[420px] overflow-hidden">
        <div className="absolute inset-0">
          {showHeroBg ? (
            <img
              src={ANIME_BG}
              alt="Anime Background"
              className={`w-full h-full object-cover object-top transition-opacity duration-700 ${heroImgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setHeroImgLoaded(true)}
            />
          ) : null}
          <div
            className={`absolute inset-0 ${showHeroBg && heroImgLoaded ? 'opacity-0' : 'opacity-60'} transition-opacity duration-500`}
            style={{ background: 'linear-gradient(135deg, #4c1d95 0%, #db2777 50%, #7c3aed 100%)' }}
          />
        </div>
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0614] via-[#0a0614]/70 to-purple-900/30" />
        {/* Purple accent overlay */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(219,39,119,0.1) 50%, rgba(76,29,149,0.15) 100%)' }} />

        {/* Floating particles effect via CSS */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full opacity-20"
              style={{
                width: `${4 + (i % 4) * 2}px`,
                height: `${4 + (i % 4) * 2}px`,
                background: i % 2 === 0 ? '#db2777' : '#a78bfa',
                left: `${(i * 8.5) % 100}%`,
                top: `${(i * 7.3) % 80 + 10}%`,
                animation: `float ${8 + (i % 5)}s ease-in-out infinite`,
                animationDelay: `${i * 0.7}s`,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-end max-w-[1760px] mx-auto px-4 pb-6 sm:pb-8">
          <nav className="flex items-center gap-1.5 mb-3 sm:mb-4 text-[11px] sm:text-xs text-white/40 flex-wrap">
            <Link to="/" className="hover:text-white/70 transition-colors">Trang chủ</Link>
            <i className="ri-arrow-right-s-line" />
            <span className="text-purple-300">Anime</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-5">
            {/* Anime icon badge */}
            <div
              className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
                boxShadow: '0 0 40px rgba(124,58,237,0.5), 0 0 80px rgba(219,39,119,0.2)',
              }}
            >
              <i className="ri-sparkling-line text-white text-xl sm:text-2xl" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-semibold px-3 py-1 rounded-full text-white"
                  style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)' }}
                >
                  THỂ LOẠI ĐẶC BIỆT
                </span>
                {!loading && totalItems > 0 && (
                  <span className="text-xs text-purple-300 bg-purple-500/15 px-2.5 py-1 rounded-full border border-purple-500/25">
                    {totalItems.toLocaleString()} anime
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
                Anime <span style={{ color: '#c4b5fd' }}>Vietsub</span> HD Miễn Phí
              </h1>
              <p className="text-white/45 text-sm max-w-2xl leading-relaxed line-clamp-2">
                Khám phá thế giới anime Nhật Bản tại KhoPhim Anime. Shounen, shoujo, isekai, mecha, slice of life — tất cả đều vietsub HD, không quảng cáo, cập nhật mùa mới hàng tuần.
              </p>
            </div>

            <Link
              to="/filter?genre=hoat-hinh&country=nhat-ban"
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto mt-1 sm:mt-0"
            >
              <i className="ri-equalizer-2-line" />
              Lọc nâng cao
            </Link>
          </div>

        </div>
      </div>

      <main className="max-w-[1760px] mx-auto px-4 pb-16">
        {/* ─── Season Filters ─── */}
        <div className="flex items-center gap-2 py-4 sm:py-5 border-b border-white/5 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
          <span className="text-xs text-white/30 mr-1 flex-shrink-0">Mùa:</span>
          {SEASON_FILTERS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleSeasonChange(opt.key)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeSeason === opt.key
                  ? 'text-white border border-purple-500/40'
                  : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
              }`}
              style={activeSeason === opt.key ? { background: 'linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(219,39,119,0.15) 100%)' } : undefined}
            >
              <i className={opt.icon} />
              {opt.label}
            </button>
          ))}
        </div>

        {/* ─── Sort & Genre Tags ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 py-4 sm:py-5 border-b border-white/5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
            <span className="text-xs text-white/30 mr-1 flex-shrink-0">Sắp xếp:</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSortChange(opt.value)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  sortBy === opt.value
                    ? 'text-purple-300 border border-purple-500/30'
                    : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                }`}
                style={sortBy === opt.value ? { background: 'rgba(124,58,237,0.15)' } : undefined}
              >
                <i className={opt.icon} />
                {opt.label}
              </button>
            ))}
          </div>

          {!loading && totalItems > 0 && (
            <div className="text-xs text-white/30">
              Hiển thị <span className="text-white/60">{filteredMovies.length}</span>{activeFilterCount > 0 && <span className="text-white/40"> / {movies.filter(isJapanAnime).length} lọc</span>}{activeFilterCount === 0 && ` / ${totalItems.toLocaleString()}`} anime
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
              Bộ lọc {activeFilterCount > 0 && <span className="text-purple-300 ml-1">({activeFilterCount})</span>}
            </button>

            {activeStatus !== 'all' && (
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/20">
                {STATUS_FILTERS.find((f) => f.key === activeStatus)?.label}
                <button onClick={() => setActiveStatus('all')} className="hover:text-white cursor-pointer"><i className="ri-close-line" /></button>
              </span>
            )}
            {activeEpisode !== 'all' && (
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-pink-500/15 text-pink-300 border border-pink-500/20">
                {EPISODE_FILTERS.find((f) => f.key === activeEpisode)?.label}
                <button onClick={() => setActiveEpisode('all')} className="hover:text-white cursor-pointer"><i className="ri-close-line" /></button>
              </span>
            )}
            {activeYear !== 'all' && (
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/20">
                Năm {activeYear}
                <button onClick={() => setActiveYear('all')} className="hover:text-white cursor-pointer"><i className="ri-close-line" /></button>
              </span>
            )}
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setActiveStatus('all'); setActiveEpisode('all'); setActiveYear('all'); }}
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
                          ? 'text-purple-300 border border-purple-500/30'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                      }`}
                      style={activeStatus === opt.key ? { background: 'rgba(124,58,237,0.15)' } : undefined}
                    >
                      <i className={opt.icon} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Episode filter */}
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-[11px] text-white/30 mt-1.5 flex-shrink-0 w-14">Số tập:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {EPISODE_FILTERS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setActiveEpisode(activeEpisode === opt.key ? 'all' : opt.key)}
                      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        activeEpisode === opt.key
                          ? 'text-pink-300 border border-pink-500/30'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                      }`}
                      style={activeEpisode === opt.key ? { background: 'rgba(219,39,119,0.15)' } : undefined}
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
                          ? 'text-violet-300 border border-violet-500/30'
                          : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                      }`}
                      style={activeYear === 'all' ? { background: 'rgba(139,92,246,0.15)' } : undefined}
                    >
                      Tất cả
                    </button>
                    {availableYears.map((y) => (
                      <button
                        key={y}
                        onClick={() => setActiveYear(activeYear === String(y) ? 'all' : String(y))}
                        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                          activeYear === String(y)
                            ? 'text-violet-300 border border-violet-500/30'
                            : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                        }`}
                        style={activeYear === String(y) ? { background: 'rgba(139,92,246,0.15)' } : undefined}
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
                navigate(`/filter?genre=hoat-hinh&country=nhat-ban&keyword=${encodeURIComponent(tag.label)}`);
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
              <div className="w-20 h-20 flex items-center justify-center rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(219,39,119,0.2) 100%)' }}>
                <i className="ri-sparkling-line text-purple-300 text-3xl" />
              </div>
              <p className="text-lg font-medium mb-1">
                {activeFilterCount > 0 ? 'Không có anime phù hợp bộ lọc' : 'Chưa có anime nào'}
              </p>
              <p className="text-sm text-white/20">
                {activeFilterCount > 0 ? 'Thử điều chỉnh bộ lọc khác' : 'Đang cập nhật danh sách anime mùa mới'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setActiveStatus('all'); setActiveEpisode('all'); setActiveYear('all'); }}
                  className="mt-4 flex items-center gap-1.5 text-sm text-purple-300 hover:text-purple-200 transition-colors cursor-pointer"
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
                  <div key={m._id} className="relative group">
                    <MovieCard movie={m} priority={idx < 2} />
                    <div className="absolute top-1.5 left-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <AnimeSeasonBadge episode={m.episode_current} />
                    </div>
                  </div>
                ))}
              </div>

              {page < totalPages && activeFilterCount === 0 && (
                <div className="flex justify-center mt-10">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="flex items-center gap-2 border border-purple-500/25 hover:border-purple-500/50 text-white text-sm px-8 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.1) 0%, rgba(219,39,119,0.08) 100%)' }}
                  >
                    {loading
                      ? <><i className="ri-loader-4-line animate-spin" /> Đang tải...</>
                      : <><i className="ri-add-line" /> Tải thêm anime</>
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
                  accentClass="bg-purple-500"
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}
        </div>

        {/* ─── FAQ Section ─── */}
        <div className="mt-16 pt-10 border-t border-white/5">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <i className="ri-question-answer-line" style={{ color: '#c4b5fd' }} />
            Câu hỏi thường gặp về Anime
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FAQ.map((item, i) => (
              <div key={i} className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm text-white/80 font-medium leading-snug">{item.q}</span>
                  <i className={`ri-arrow-down-s-line text-purple-400/60 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
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
              background: 'linear-gradient(135deg, rgba(124,58,237,0.1) 0%, rgba(219,39,119,0.06) 50%, rgba(76,29,149,0.1) 100%)',
              borderColor: 'rgba(124,58,237,0.2)',
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <i className="ri-sparkling-line text-purple-400 text-lg" />
              <i className="ri-heart-3-line text-pink-400 text-lg" />
              <i className="ri-sparkling-line text-purple-400 text-lg" />
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
              Khám Phá Thế Giới Anime
            </h3>
            <p className="text-white/45 text-sm max-w-xl mx-auto mb-5">
              Từ shounen hành động đến shoujo lãng mạn, từ isekai fantasy đến slice of life đời thường — KhoPhim Anime mang đến trải nghiệm xem anime tuyệt vời nhất.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/the-loai/hoat-hinh"
                className="flex items-center gap-2 px-6 py-3 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)' }}
              >
                <i className="ri-film-line" />
                Xem Hoạt Hình
              </Link>
              <Link
                to="/filter?country=nhat-ban"
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
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.15; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.25; }
          50% { transform: translateY(-10px) translateX(-5px); opacity: 0.15; }
          75% { transform: translateY(-25px) translateX(8px); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
