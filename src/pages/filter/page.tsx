import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import SEO, { SITE_URL } from '@/components/base/SEO';
import FilterSidebar, { GENRES, COUNTRIES, TYPES, SORT_OPTIONS } from './components/FilterSidebar';
import MovieListItem from './components/MovieListItem';
import type { MovieItem } from '@/types/movie';
import { fetchMoviesByCategory, searchMovies } from '@/services/movieApi';

type ViewMode = 'grid' | 'list';
const VIRTUAL_GENRE_KEYWORDS: Record<string, string[]> = {
};

const PAGE_SIZE = 24;

function getMovieKey(movie: MovieItem): string {
  return movie._id || movie.slug || `${movie.name}-${movie.year ?? ''}`;
}

function mergeUniqueMovies(items: MovieItem[]): MovieItem[] {
  const seen = new Set<string>();
  return items.filter((movie) => {
    const key = getMovieKey(movie);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferTotalPages(totalPages: number, itemCount: number, pg: number): number {
  if (itemCount >= PAGE_SIZE) return Math.max(totalPages, pg + 1);
  return Math.max(totalPages, pg);
}
export default function FilterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  useEffect(() => {
    const genre = searchParams.get('genre') ?? searchParams.get('category');
    const hasOtherParams = searchParams.has('type') || searchParams.has('country') || searchParams.has('year') || searchParams.has('sort');
    if (genre && !hasOtherParams) {
      if (genre === 'phim-viet-nam') {
        navigate('/phim-viet-nam', { replace: true });
      } else {
        navigate(`/the-loai/${genre}`, { replace: true });
      }
    }
  }, [searchParams, navigate]);

  const selectedType    = searchParams.get('type')    ?? 'phim-moi-cap-nhat';
  const selectedGenre   = searchParams.get('genre') ?? searchParams.get('category') ?? '';
  const selectedCountry = searchParams.get('country') ?? '';
  const selectedYear    = searchParams.get('year')    ?? '';
  const selectedSort    = searchParams.get('sort')    ?? 'modified.time:desc';

  const setFilter = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (key === 'genre' || key === 'category') {
        next.delete('category');
        if (value) next.set('genre', value); else next.delete('genre');
      } else {
        if (value) next.set(key, value); else next.delete(key);
      }
      next.delete('page');
      return next;
    });
    setPage(1);
  }, [setSearchParams]);

  const handleReset = useCallback(() => {
    setSearchParams({});
    setPage(1);
  }, [setSearchParams]);

  const activeFilters = [selectedGenre, selectedCountry, selectedYear].filter(Boolean).length;
  const [sortField, sortType] = selectedSort.split(':') as [string, 'asc' | 'desc'];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const virtualKeywords = VIRTUAL_GENRE_KEYWORDS[selectedGenre];
    const request = virtualKeywords
      ? Promise.all(virtualKeywords.map((keyword) => searchMovies(keyword, page))).then((responses) => {
          const items = mergeUniqueMovies(responses.flatMap((data) => data.items ?? []));
          return {
            items,
            pagination: {
              totalPages: Math.max(...responses.map((data) => data.pagination?.totalPages ?? 1), items.length >= 24 ? page + 1 : page),
              totalItems: Math.max(...responses.map((data) => data.pagination?.totalItems ?? 0), items.length),
            },
          };
        })
      : fetchMoviesByCategory({
          type: selectedType || 'phim-moi-cap-nhat',
          category: selectedGenre || undefined,
          country: selectedCountry || undefined,
          year: selectedYear || undefined,
          page,
          sortField,
          sortType,
        });

    request
      .then(data => {
        if (cancelled) return;
        if (page === 1) {
          setMovies(mergeUniqueMovies(data.items ?? []));
        } else {
          setMovies(prev => mergeUniqueMovies([...prev, ...(data.items ?? [])]));
        }
        setTotalPages(inferTotalPages(data.pagination?.totalPages ?? 1, data.items?.length ?? 0, page));
        setTotalItems(data.pagination?.totalItems ?? 0);
      })
      .catch(() => { if (!cancelled) setMovies([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedType, selectedGenre, selectedCountry, selectedYear, selectedSort, page, sortField, sortType]);

  useEffect(() => { setPage(1); setMovies([]); }, [selectedType, selectedGenre, selectedCountry, selectedYear, selectedSort]);

  const getActiveChips = () => {
    const chips: { label: string; key: string }[] = [];
    if (selectedGenre) {
      const g = GENRES.find(x => x.slug === selectedGenre);
      chips.push({ label: g?.name ?? selectedGenre, key: 'genre' });
    }
    if (selectedCountry) {
      const c = COUNTRIES.find(x => x.slug === selectedCountry);
      if (c) chips.push({ label: `${c.flag} ${c.name}`, key: 'country' });
    }
    if (selectedYear) chips.push({ label: `Năm ${selectedYear}`, key: 'year' });
    if (selectedType && selectedType !== 'phim-moi-cap-nhat') {
      const t = TYPES.find(x => x.slug === selectedType);
      if (t) chips.push({ label: t.name, key: 'type' });
    }
    return chips;
  };

  const chips = getActiveChips();
  const sortLabel = SORT_OPTIONS.find(s => s.value === selectedSort)?.label ?? 'Mới Cập Nhật';
  const genreLabel   = GENRES.find(g => g.slug === selectedGenre)?.name ?? '';
  const countryLabel = COUNTRIES.find(c => c.slug === selectedCountry)?.name ?? '';
  const typeLabel    = TYPES.find(t => t.slug === selectedType)?.name ?? 'Phim Mới Cập Nhật';

  const seoTitle = [typeLabel, genreLabel, countryLabel, selectedYear ? `Năm ${selectedYear}` : '']
    .filter(Boolean).join(' – ');

  const filterSchema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Lọc Phim', item: `${SITE_URL}/filter` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${seoTitle} | KhoPhim`,
      url: `${SITE_URL}/filter`,
      description: `Lọc phim online theo thể loại, quốc gia, năm sản xuất. ${seoTitle} miễn phí HD tại KhoPhim.`,
      inLanguage: 'vi',
      isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
    },
  ];

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <SEO
        title={`${seoTitle} – Lọc Phim | KhoPhim`}
        description={`Lọc phim online theo thể loại, quốc gia, năm sản xuất tại KhoPhim. ${seoTitle} – xem phim HD vietsub miễn phí, không quảng cáo, cập nhật hàng ngày.`}
        keywords="lọc phim, tìm phim theo thể loại, phim theo quốc gia, xem phim online miễn phí, kho phim HD vietsub, phim mới nhất 2026"
        canonical={`${SITE_URL}/filter${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
        noIndex={movies.length === 0 && !loading}
        schema={filterSchema}
      />
      <Navbar />

      {/* ── Page Header ── */}
      <div className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        <div className="max-w-[1400px] mx-auto px-4 pt-8 pb-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <nav className="flex items-center gap-1.5 mb-2 text-xs">
                <a href="/" className="text-white/30 hover:text-white/60 transition-colors">Trang chủ</a>
                <i className="ri-arrow-right-s-line text-white/20" />
                <span className="text-white/55">Lọc Phim Nâng Cao</span>
              </nav>
              <h1 className="text-xl font-bold flex items-center gap-2.5">
                <div className="w-8 h-8 flex items-center justify-center bg-red-500/15 border border-red-500/25 rounded-xl">
                  <i className="ri-equalizer-2-fill text-red-400 text-sm" />
                </div>
                Lọc Phim Nâng Cao
              </h1>
              <p className="text-white/30 text-xs mt-1 hidden sm:block">
                Tìm phim theo thể loại, quốc gia, năm sản xuất và nhiều tiêu chí khác
              </p>
            </div>

            {/* Mobile filter toggle */}
            <button
              onClick={() => setMobileFilterOpen(true)}
              className="lg:hidden flex items-center gap-2 bg-[#1a1d27] border border-white/10 hover:border-red-500/30 text-white text-sm px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
            >
              <i className="ri-equalizer-2-line text-red-400" />
              Bộ Lọc
              {activeFilters > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>

          {/* Quick filter chips row */}
          <QuickFilterBar
            selectedType={selectedType}
            selectedGenre={selectedGenre}
            selectedCountry={selectedCountry}
            selectedYear={selectedYear}
            onTypeChange={v => setFilter('type', v)}
            onGenreChange={v => setFilter('genre', v)}
            onCountryChange={v => setFilter('country', v)}
          />
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 pb-16">
        <div className="flex gap-5 items-start">
          {/* Sidebar */}
          <FilterSidebar
            selectedType={selectedType}
            selectedGenre={selectedGenre}
            selectedCountry={selectedCountry}
            selectedYear={selectedYear}
            selectedSort={selectedSort}
            activeCount={activeFilters}
            mobileOpen={mobileFilterOpen}
            onMobileClose={() => setMobileFilterOpen(false)}
            onTypeChange={v => setFilter('type', v)}
            onGenreChange={v => setFilter('genre', v)}
            onCountryChange={v => setFilter('country', v)}
            onYearChange={v => setFilter('year', v)}
            onSortChange={v => setFilter('sort', v)}
            onReset={handleReset}
          />

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                {chips.length > 0 ? (
                  <>
                    {chips.map(chip => (
                      <span
                        key={chip.key}
                        className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-1.5 rounded-full"
                      >
                        {chip.label}
                        <button
                          onClick={() => setFilter(chip.key, '')}
                          className="hover:text-white transition-colors cursor-pointer ml-0.5"
                        >
                          <i className="ri-close-line text-xs" />
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={handleReset}
                      className="text-xs text-white/30 hover:text-red-400 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                    >
                      <i className="ri-refresh-line" /> Xóa tất cả
                    </button>
                  </>
                ) : (
                  <span className="text-white/30 text-sm flex items-center gap-1.5">
                    <i className="ri-film-line" />
                    Tất cả phim
                  </span>
                )}
              </div>

              {/* Right controls */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="hidden lg:flex items-center gap-1.5 text-xs text-white/30 bg-white/[0.03] border border-white/[0.06] px-3 py-1.5 rounded-lg">
                  <i className="ri-sort-desc text-white/20" />
                  {sortLabel}
                </span>
                <div className="flex bg-[#1a1d27] rounded-xl border border-white/[0.06] p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`w-8 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                      viewMode === 'grid' ? 'bg-red-500/20 text-red-400' : 'text-white/30 hover:text-white'
                    }`}
                    title="Dạng lưới"
                  >
                    <i className="ri-grid-fill text-sm" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`w-8 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                      viewMode === 'list' ? 'bg-red-500/20 text-red-400' : 'text-white/30 hover:text-white'
                    }`}
                    title="Dạng danh sách"
                  >
                    <i className="ri-list-check text-sm" />
                  </button>
                </div>
              </div>
            </div>

            {/* Result count */}
            {!loading && movies.length > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-4 bg-red-500 rounded-full" />
                <span className="text-white/50 text-sm">
                  Hiển thị <span className="text-white font-semibold">{movies.length}</span>
                  {totalItems > 0 && <> / <span className="text-white/70">{totalItems.toLocaleString()}</span></>} phim
                </span>
              </div>
            )}

            {/* Results */}
            {loading && movies.length === 0 ? (
              <LoadingSkeleton viewMode={viewMode} />
            ) : movies.length === 0 && !loading ? (
              <EmptyState onReset={handleReset} />
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
                    {movies.map(m => (
                      <MovieCard key={getMovieKey(m)} movie={m} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {movies.map((m, idx) => (
                      <MovieListItem key={getMovieKey(m)} movie={m} rank={idx + 1} />
                    ))}
                  </div>
                )}

                {page < totalPages && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={loading}
                      className="flex items-center gap-2 bg-[#1a1d27] hover:bg-red-500/10 text-white border border-white/10 hover:border-red-500/25 text-sm px-8 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {loading
                        ? <><i className="ri-loader-4-line animate-spin" /> Đang tải...</>
                        : <><i className="ri-add-line" /> Tải thêm phim</>}
                    </button>
                  </div>
                )}

                {loading && movies.length > 0 && (
                  <div className="flex justify-center mt-6">
                    <i className="ri-loader-4-line animate-spin text-red-500 text-xl" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

/* ── Quick Filter Bar ── */
const QUICK_TYPES = [
  { label: 'Tất Cả', slug: 'phim-moi-cap-nhat' },
  { label: 'Phim Lẻ', slug: 'phim-le' },
  { label: 'Phim Bộ', slug: 'phim-bo' },
  { label: 'Chiếu Rạp', slug: 'phim-chieu-rap' },
  { label: 'Hoạt Hình', slug: 'hoat-hinh' },
  { label: 'TV Shows', slug: 'tv-shows' },
];

const QUICK_GENRES = [
  { label: 'Hành Động', slug: 'hanh-dong' },
  { label: 'Tình Cảm', slug: 'tinh-cam' },
  { label: 'Hài Hước', slug: 'hai-huoc' },
  { label: 'Kinh Dị', slug: 'kinh-di' },
  { label: 'Cổ Trang', slug: 'co-trang' },
  { label: 'Viễn Tưởng', slug: 'vien-tuong' },
  { label: 'Hình Sự', slug: 'hinh-su' },
  { label: 'Tâm Lý', slug: 'tam-ly' },
];

const QUICK_COUNTRIES = [
  { label: '🇰🇷 Hàn', slug: 'han-quoc' },
  { label: '🇨🇳 Trung', slug: 'trung-quoc' },
  { label: '🇺🇸 Âu Mỹ', slug: 'au-my' },
  { label: '🇯🇵 Nhật', slug: 'nhat-ban' },
  { label: '🇹🇭 Thái', slug: 'thai-lan' },
  { label: '🇻🇳 Việt', slug: 'viet-nam' },
];

interface QuickFilterBarProps {
  selectedType: string;
  selectedGenre: string;
  selectedCountry: string;
  selectedYear?: string;
  onTypeChange: (v: string) => void;
  onGenreChange: (v: string) => void;
  onCountryChange: (v: string) => void;
}

function QuickFilterBar({ selectedType, selectedGenre, selectedCountry, onTypeChange, onGenreChange, onCountryChange }: QuickFilterBarProps) {
  return (
    <div className="mt-4 space-y-2.5">
      {/* Type row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-white/25 uppercase tracking-wider w-14 flex-shrink-0">Loại</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {QUICK_TYPES.map(t => (
            <button
              key={t.slug}
              onClick={() => onTypeChange(t.slug)}
              className={`text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap font-medium ${
                selectedType === t.slug
                  ? 'bg-red-500 text-white'
                  : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Genre row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-white/25 uppercase tracking-wider w-14 flex-shrink-0">Thể loại</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {QUICK_GENRES.map(g => {
            const featured = g.slug === 'bl' || g.slug === 'gl';
            return (
              <button
                key={g.slug}
                onClick={() => onGenreChange(selectedGenre === g.slug ? '' : g.slug)}
                className={`text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                  selectedGenre === g.slug
                    ? featured
                      ? 'bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white border border-white/30 shadow-[0_0_18px_rgba(217,70,239,0.45)] font-black'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : featured
                      ? 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-400/35 hover:bg-fuchsia-500/25 hover:text-white shadow-[0_0_14px_rgba(217,70,239,0.18)] font-bold'
                      : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Country row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-white/25 uppercase tracking-wider w-14 flex-shrink-0">Quốc gia</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {QUICK_COUNTRIES.map(c => (
            <button
              key={c.slug}
              onClick={() => onCountryChange(selectedCountry === c.slug ? '' : c.slug)}
              className={`text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                selectedCountry === c.slug
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                  : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-white/[0.06] via-white/[0.03] to-transparent mt-1" />
    </div>
  );
}

/* ── Skeleton ── */
function LoadingSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'list') {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-4 bg-[#1a1d27] rounded-xl p-3 border border-white/[0.05]">
            <div className="w-6 h-6 skeleton rounded flex-shrink-0" />
            <div className="w-16 h-[88px] skeleton rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 skeleton rounded w-3/4" />
              <div className="h-3 skeleton rounded w-1/2" />
              <div className="h-3 skeleton rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] skeleton rounded-xl" />
          <div className="mt-2 h-3 skeleton rounded w-3/4" />
          <div className="mt-1 h-2.5 skeleton rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

/* ── Empty State ── */
function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 flex items-center justify-center bg-white/[0.03] border border-white/[0.06] rounded-2xl mb-5">
        <i className="ri-film-line text-4xl text-white/10" />
      </div>
      <p className="text-white/40 text-base mb-2">Không tìm thấy phim nào phù hợp</p>
      <p className="text-white/25 text-sm mb-6">Thử thay đổi bộ lọc để xem nhiều kết quả hơn</p>
      <button
        onClick={onReset}
        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-5 py-2.5 rounded-xl text-sm transition-all cursor-pointer whitespace-nowrap"
      >
        <i className="ri-refresh-line" /> Xóa bộ lọc
      </button>
    </div>
  );
}
