import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { MovieInfo, MovieReview } from '@/services/reviewService';
import { getAllReviews, getApiKey, getGeminiKey, getProvider, deleteReview } from '@/services/reviewService';
import type { MovieItem } from '@/types/movie';
import ApiKeyModal from './components/ApiKeyModal';
import ReviewEditor from './components/ReviewEditor';
import BulkGeneratePanel from './components/BulkGeneratePanel';

type Tab = 'movies' | 'bulk' | 'manage';

const BASE_URL = 'https://ophim1.com';

function movieToInfo(m: MovieItem): MovieInfo {
  return {
    slug: m.slug,
    name: m.name,
    origin_name: m.origin_name,
    year: m.year,
    quality: m.quality,
    lang: m.lang,
    episode_current: m.episode_current,
    category: m.category,
    country: m.country,
  };
}

// Fetch trực tiếp, KHÔNG qua cache
async function fetchPageDirect(type: string, page: number): Promise<MovieItem[]> {
  try {
    const res = await fetch(`${BASE_URL}/v1/api/danh-sach/${type}?page=${page}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    const items: MovieItem[] = data?.data?.items ?? data?.items ?? [];
    return items;
  } catch {
    return [];
  }
}

// Crawl tất cả trang — dừng khi trang trả về rỗng
async function crawlAllPages(
  type: string,
  onBatch: (items: MovieItem[], page: number, total: number) => void,
  signal: AbortSignal
): Promise<number> {
  // Lấy trang 1 để biết totalPages
  let totalPages = 999;
  try {
    const res = await fetch(`${BASE_URL}/v1/api/danh-sach/${type}?page=1`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as any;
      const items: MovieItem[] = data?.data?.items ?? data?.items ?? [];
      const pagination = data?.data?.params?.pagination ?? {};
      totalPages = pagination.totalPages ?? Math.ceil((pagination.totalItems ?? 9999) / (pagination.totalItemsPerPage ?? 24));
      if (items.length > 0) onBatch(items, 1, totalPages);
      if (items.length === 0) return 0;
    }
  } catch {
    return 0;
  }

  if (signal.aborted) return 0;

  // Crawl song song 8 trang mỗi batch
  const BATCH = 8;
  let totalLoaded = 0;

  for (let start = 2; start <= totalPages; start += BATCH) {
    if (signal.aborted) break;

    const pageNums = Array.from(
      { length: Math.min(BATCH, totalPages - start + 1) },
      (_, i) => start + i
    );

    const results = await Promise.allSettled(
      pageNums.map((p) => fetchPageDirect(type, p))
    );

    if (signal.aborted) break;

    let batchItems: MovieItem[] = [];
    let hasEmpty = false;

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.length === 0) { hasEmpty = true; break; }
        batchItems = [...batchItems, ...r.value];
      }
    }

    if (batchItems.length > 0) {
      totalLoaded += batchItems.length;
      onBatch(batchItems, start, totalPages);
    }

    // Nếu có trang rỗng → đã hết phim thật sự
    if (hasEmpty) break;

    // Delay nhỏ tránh spam
    await new Promise((r) => setTimeout(r, 200));
  }

  return totalLoaded;
}

export default function AdminReviewsPage() {
  const [tab, setTab] = useState<Tab>('movies');
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [reviews, setReviews] = useState<Record<string, MovieReview>>({});
  const [loadingMovies, setLoadingMovies] = useState(true);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, label: 'Đang tải...' });
  const [showApiModal, setShowApiModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'has' | 'missing'>('all');
  const [hasApiKey, setHasApiKey] = useState(!!(getProvider() === 'gemini' ? getGeminiKey() : getApiKey()));
  const abortRef = useRef<AbortController | null>(null);

  const loadAllMovies = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoadingMovies(true);
    setMovies([]);
    setLoadProgress({ loaded: 0, label: 'Đang khởi động...' });

    const seenSlugs = new Set<string>();
    let totalCount = 0;

    const addBatch = (items: MovieItem[], page: number, totalPages: number, typeLabel: string) => {
      const newItems = items.filter((m) => {
        if (!m.slug) return false;
        if (seenSlugs.has(m.slug)) return false;
        seenSlugs.add(m.slug);
        return true;
      });
      if (newItems.length === 0) return;
      totalCount += newItems.length;
      setMovies((prev) => [...prev, ...newItems]);
      setLoadProgress({
        loaded: totalCount,
        label: `${typeLabel} — trang ${page}/${totalPages} (${totalCount.toLocaleString()} phim)`,
      });
    };

    const types: { type: string; label: string }[] = [
      { type: 'phim-bo', label: 'Phim bộ' },
      { type: 'phim-le', label: 'Phim lẻ' },
      { type: 'hoat-hinh', label: 'Hoạt hình' },
      { type: 'phim-chieu-rap', label: 'Phim chiếu rạp' },
      { type: 'tv-shows', label: 'TV Shows' },
    ];

    for (const { type, label } of types) {
      if (ctrl.signal.aborted) break;
      setLoadProgress((p) => ({ ...p, label: `Đang tải ${label}...` }));
      try {
        await crawlAllPages(
          type,
          (items, page, total) => addBatch(items, page, total, label),
          ctrl.signal
        );
      } catch { /* bỏ qua lỗi từng type */ }
    }

    if (!ctrl.signal.aborted) {
      setLoadingMovies(false);
      setLoadProgress((p) => ({ ...p, label: `Hoàn tất — ${p.loaded.toLocaleString()} phim` }));
    }
  }, []);

  const loadReviews = useCallback(async () => {
    const all = await getAllReviews();
    const map: Record<string, MovieReview> = {};
    all.forEach((r) => { map[r.slug] = r; });
    setReviews(map);
  }, []);

  useEffect(() => {
    loadAllMovies();
    loadReviews();
    return () => { abortRef.current?.abort(); };
  }, [loadAllMovies, loadReviews]);

  const handleReviewSaved = useCallback((review: MovieReview) => {
    setReviews((prev) => ({ ...prev, [review.slug]: review }));
  }, []);

  // alias cho BulkGeneratePanel (chỉ nhận 1 param)
  const handleBulkProgress = useCallback((review: MovieReview) => {
    handleReviewSaved(review);
  }, [handleReviewSaved]);

  const handleDeleteReview = useCallback(async (slug: string) => {
    await deleteReview(slug);
    setReviews((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  }, []);

  const handleApiKeySaved = () => {
    setHasApiKey(!!(getProvider() === 'gemini' ? getGeminiKey() : getApiKey()));
  };

  const filteredMovies = movies.filter((m) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || m.name.toLowerCase().includes(q) || (m.origin_name ?? '').toLowerCase().includes(q) || m.slug.includes(q);
    const hasReview = !!reviews[m.slug];
    const matchFilter = filterStatus === 'all' || (filterStatus === 'has' && hasReview) || (filterStatus === 'missing' && !hasReview);
    return matchSearch && matchFilter;
  });

  const reviewCount = Object.keys(reviews).length;
  const missingCount = movies.filter((m) => !reviews[m.slug]).length;

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <title>Review Manager – Admin | KhoPhim</title>
      <meta name="description" content="Admin panel quản lý review phìm – tạo, chỉnh sửa và xuất bản review phìm tự động bằng AI." />
      <meta name="robots" content="noindex, nofollow" />
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0d0f18]">
        <div className="max-w-[1400px] mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/" className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
              <i className="ri-arrow-left-line" />
            </Link>
            <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-violet-500/20">
              <i className="ri-quill-pen-line text-violet-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base">Review Manager</h1>
              <p className="text-white/30 text-xs">Tự động viết review phim bằng AI</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-3 mr-2">
              <div className="text-center">
                <p className="text-white/70 font-bold text-sm">{movies.length.toLocaleString()}</p>
                <p className="text-white/30 text-[10px]">Tổng phim</p>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center">
                <p className="text-emerald-400 font-bold text-sm">{reviewCount.toLocaleString()}</p>
                <p className="text-white/30 text-[10px]">Đã có review</p>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center">
                <p className="text-amber-400 font-bold text-sm">{missingCount.toLocaleString()}</p>
                <p className="text-white/30 text-[10px]">Chưa có review</p>
              </div>
            </div>

            <button
              onClick={() => setShowApiModal(true)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap border ${
                hasApiKey
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
              }`}
            >
              <i className={hasApiKey ? 'ri-key-2-fill' : 'ri-key-2-line'} />
              {hasApiKey ? `${getProvider() === 'gemini' ? 'Gemini' : 'OpenAI'} ✓` : 'Cài API Key'}
            </button>
          </div>
        </div>

        {/* Loading progress bar */}
        {loadingMovies && (
          <div className="max-w-[1400px] mx-auto px-4 pb-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full animate-pulse w-full" />
              </div>
              <span className="text-white/40 text-xs whitespace-nowrap min-w-0 max-w-[300px] truncate">{loadProgress.label}</span>
            </div>
          </div>
        )}
        {!loadingMovies && movies.length > 0 && (
          <div className="max-w-[1400px] mx-auto px-4 pb-2">
            <p className="text-emerald-400/60 text-xs">{loadProgress.label}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="max-w-[1400px] mx-auto px-4 flex gap-1 pb-0">
          {([
            { key: 'movies', label: 'Danh sách phim', icon: 'ri-film-line' },
            { key: 'bulk', label: 'Tạo hàng loạt', icon: 'ri-sparkling-2-line' },
            { key: 'manage', label: 'Quản lý review', icon: 'ri-file-list-3-line' },
          ] as { key: Tab; label: string; icon: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                tab === t.key
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              <i className={t.icon} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-6">

        {/* ── TAB: Movies ── */}
        {tab === 'movies' && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 min-w-0">
              {/* Filters */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm phim theo tên..."
                    className="w-full bg-[#1a1d2e] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-white/25 placeholder-white/20"
                  />
                </div>
                <div className="flex gap-1 bg-[#1a1d2e] border border-white/10 rounded-xl p-1">
                  {([
                    { key: 'all', label: 'Tất cả' },
                    { key: 'missing', label: 'Chưa có' },
                    { key: 'has', label: 'Đã có' },
                  ] as { key: typeof filterStatus; label: string }[]).map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilterStatus(f.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                        filterStatus === f.key ? 'bg-violet-500 text-white' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={loadAllMovies}
                  disabled={loadingMovies}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/40 hover:text-white text-xs transition-all cursor-pointer whitespace-nowrap disabled:opacity-40"
                >
                  <i className={`ri-refresh-line ${loadingMovies ? 'animate-spin' : ''}`} />
                  Tải lại
                </button>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <p className="text-white/30 text-xs">
                  Hiển thị <strong className="text-white/50">{Math.min(filteredMovies.length, 300).toLocaleString()}</strong>/{filteredMovies.length.toLocaleString()} phim
                </p>
                {loadingMovies && (
                  <span className="flex items-center gap-1 text-violet-400 text-xs">
                    <i className="ri-loader-4-line animate-spin text-xs" />
                    đang tải thêm...
                  </span>
                )}
                {filteredMovies.length > 300 && (
                  <span className="text-white/20 text-xs">— nhập tên để tìm phim cụ thể</span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {filteredMovies.slice(0, 300).map((m) => {
                  const hasReview = !!reviews[m.slug];
                  const isSelected = selectedMovie?.slug === m.slug;
                  return (
                    <button
                      key={m.slug}
                      onClick={() => setSelectedMovie(isSelected ? null : movieToInfo(m))}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-violet-500/15 border-violet-500/30'
                          : 'bg-[#1a1d2e] border-white/5 hover:border-white/15 hover:bg-[#1e2133]'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasReview ? 'bg-emerald-400' : 'bg-white/15'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{m.name}</p>
                        <p className="text-white/30 text-xs truncate">{m.origin_name ?? m.slug}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {m.year && <span className="text-white/25 text-xs">{m.year}</span>}
                        {hasReview ? (
                          <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            {reviews[m.slug].wordCount} từ
                          </span>
                        ) : (
                          <span className="text-[10px] bg-white/5 text-white/25 border border-white/8 px-2 py-0.5 rounded-full">
                            Chưa có
                          </span>
                        )}
                        <i className={`ri-arrow-right-s-line text-white/20 text-sm transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                  );
                })}

                {filteredMovies.length > 300 && (
                  <div className="py-3 text-center text-white/20 text-xs border border-white/8 rounded-xl">
                    Còn {(filteredMovies.length - 300).toLocaleString()} phim nữa — nhập tên vào ô tìm kiếm để lọc
                  </div>
                )}

                {loadingMovies && movies.length === 0 && (
                  <div className="flex items-center justify-center py-12 gap-2 text-white/30">
                    <i className="ri-loader-4-line animate-spin" />
                    <span className="text-sm">{loadProgress.label}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Review editor */}
            <div className="lg:w-[520px] flex-shrink-0">
              {selectedMovie ? (
                <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5 sticky top-4">
                  <ReviewEditor
                    movie={selectedMovie}
                    existingReview={reviews[selectedMovie.slug] ?? null}
                    onSaved={handleReviewSaved}
                    onRequestApiKey={() => setShowApiModal(true)}
                  />
                  {reviews[selectedMovie.slug] && (
                    <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                      <p className="text-white/25 text-xs">
                        Cập nhật: {new Date(reviews[selectedMovie.slug].updatedAt).toLocaleDateString('vi-VN')}
                      </p>
                      <button
                        onClick={() => handleDeleteReview(selectedMovie.slug)}
                        className="text-red-400/60 hover:text-red-400 text-xs flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <i className="ri-delete-bin-line" />
                        Xóa review
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
                  <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-violet-500/10 mb-4">
                    <i className="ri-quill-pen-line text-violet-400 text-2xl" />
                  </div>
                  <p className="text-white/50 text-sm font-medium">Chọn một phim để viết review</p>
                  <p className="text-white/25 text-xs mt-1">Nhấn vào phim bên trái để bắt đầu</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Bulk ── */}
        {tab === 'bulk' && (
          <div className="max-w-3xl">
            <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-violet-500/15">
                  <i className="ri-sparkling-2-line text-violet-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">Tạo Review Hàng Loạt</h3>
                  <p className="text-white/40 text-xs mt-0.5">
                    {loadingMovies
                      ? `Đang tải phim... (${movies.length.toLocaleString()} phim)`
                      : `Tự động viết review cho ${movies.length.toLocaleString()} phim`}
                  </p>
                </div>
              </div>
              <BulkGeneratePanel
                movies={movies.map(movieToInfo)}
                onProgress={handleBulkProgress}
                onRequestApiKey={() => setShowApiModal(true)}
              />
            </div>
          </div>
        )}

        {/* ── TAB: Manage ── */}
        {tab === 'manage' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-white/50 text-sm">{reviewCount.toLocaleString()} review đã lưu</p>
              {reviewCount > 0 && (
                <button
                  onClick={async () => {
                    const { getAllReviews: getAll } = await import('@/services/reviewService');
                    const all = await getAll();
                    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `khophim-reviews-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 text-xs font-medium rounded-xl transition-all cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-download-2-line" />
                  Xuất backup JSON
                </button>
              )}
            </div>

            {Object.values(reviews).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <i className="ri-file-list-3-line text-5xl text-white/10 mb-3" />
                <p className="text-white/30 text-sm">Chưa có review nào</p>
                <p className="text-white/20 text-xs mt-1">Chuyển sang tab &quot;Danh sách phim&quot; để tạo review</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.values(reviews)
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                  .map((r) => (
                    <div key={r.slug} className="bg-[#0d0f18] border border-white/[0.06] rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <p className="text-white font-medium text-sm truncate">{r.movieName}</p>
                          {r.originName && <p className="text-white/30 text-xs truncate">{r.originName}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Link to={`/phim/${encodeURIComponent(r.slug)}`} target="_blank"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
                            <i className="ri-external-link-line text-sm" />
                          </Link>
                          <button
                            onClick={() => { setSelectedMovie({ slug: r.slug, name: r.movieName, origin_name: r.originName }); setTab('movies'); }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-violet-400 hover:bg-violet-500/10 transition-all cursor-pointer">
                            <i className="ri-edit-line text-sm" />
                          </button>
                          <button onClick={() => handleDeleteReview(r.slug)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
                            <i className="ri-delete-bin-line text-sm" />
                          </button>
                        </div>
                      </div>
                      <p className="text-white/40 text-xs leading-relaxed line-clamp-3">{r.content.slice(0, 150)}...</p>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.05]">
                        <span className="text-emerald-400 text-xs font-medium">{r.wordCount} từ</span>
                        <span className="text-white/20 text-xs">{new Date(r.updatedAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showApiModal && (
        <ApiKeyModal onClose={() => setShowApiModal(false)} onSaved={handleApiKeySaved} />
      )}
    </div>
  );
}
