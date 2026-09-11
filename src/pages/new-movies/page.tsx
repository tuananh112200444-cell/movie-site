import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import Pagination from '@/components/base/Pagination';
import AdsterraNativeBanner from '@/components/feature/AdsterraNativeBanner';
import AdsterraResponsiveBanner from '@/components/feature/AdsterraResponsiveBanner';
import SEO, { SITE_URL } from '@/components/base/SEO';
import { fetchLatestReleaseMovies, getFeaturedUrl, getSmallThumbUrl, type StableCatalogFeedMode } from '@/services/movieApi';
import { useImageFallback } from '@/hooks/useImageFallback';
import { isImagePreloaded, markImagePreloaded } from '@/utils/imagePreloader';
import { movieDetailUrl } from '@/utils/slugEncoder';
import type { Movie } from '@/types/movie';

const PAGE_SIZE = 36;

const FEEDS = {
  new: {
    path: '/phim-moi-nhat', label: 'Phim Mới Nhất', shortLabel: 'Phim mới',
    eyebrow: 'NEW RELEASES', icon: 'ri-sparkling-2-line',
    description: 'Những phim vừa được thêm vào KhoPhim, sắp xếp theo thời điểm xuất hiện thực tế.',
    sectionTitle: 'Mới Có Trên KhoPhim', gridTitle: 'Danh Sách Phim Mới',
  },
  episode_updates: {
    path: '/phim-moi-cap-nhat', label: 'Phim Mới Cập Nhật', shortLabel: 'Tập mới',
    eyebrow: 'EPISODE UPDATES', icon: 'ri-refresh-line',
    description: 'Những phim vừa có số tập mới; sửa ảnh, mô tả hoặc nguồn phát không làm đảo thứ tự.',
    sectionTitle: 'Vừa Có Tập Mới', gridTitle: 'Các Phim Đang Cập Nhật',
  },
} as const;

const CATEGORY_LINKS = [
  { label: 'Phim lẻ', href: '/phim-le', icon: 'ri-movie-2-line' },
  { label: 'Phim bộ', href: '/phim-bo', icon: 'ri-tv-2-line' },
  { label: 'Chiếu rạp', href: '/phim-chieu-rap', icon: 'ri-building-4-line' },
  { label: 'Hoạt hình', href: '/hoat-hinh', icon: 'ri-gamepad-line' },
  { label: 'Hàn Quốc', href: '/phim-han-quoc', icon: 'ri-heart-3-line' },
  { label: 'Trung Quốc', href: '/phim-trung-quoc', icon: 'ri-ancient-gate-line' },
] as const;

function getMovieKey(movie: Movie): string {
  return movie._id || movie.slug || `${movie.name}-${movie.year || ''}`;
}

function firstNumber(value?: string | number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const match = String(value || '').match(/\d+/);
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
  const raw = String(movie.episode_current || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return 'Đang cập nhật';
  if (/^(full|full hd|hoàn tất|hoan tat|trailer|sắp chiếu|sap chieu)/.test(lower)) return raw;

  const rawNumber = firstNumber(raw);
  const year = firstNumber(movie.year);
  const total = firstNumber(movie.total_episodes) || firstNumber(movie.episode_total);
  const storedCurrent = firstNumber(movie.current_episode);
  const recoveredCurrent = recoverJoinedEpisode(rawNumber, total);
  const current = recoveredCurrent || (
    storedCurrent > 0 && storedCurrent !== year && storedCurrent < 500 ? storedCurrent : 0
  );

  if (current > 0) return total >= current ? `Tập ${current}/${total}` : `Tập ${current}`;
  if (rawNumber === year || rawNumber >= 500) return 'Đang cập nhật';
  return raw;
}

function normalizeFeedItems(items: Movie[]): Movie[] {
  const seen = new Set<string>();
  return items.flatMap((movie) => {
    const key = getMovieKey(movie);
    const status = String(movie.seo_catalog_status || 'published').toLowerCase();
    const episode = String(movie.episode_current || '').toLowerCase();
    if (!key || seen.has(key) || !movie.slug || !movie.name) return [];
    if (movie.is_published === false || movie.superseded_by_movie_id) return [];
    if (['hidden', 'draft', 'superseded', 'awaiting_playback'].includes(status)) return [];
    if (/\b(trailer|teaser)\b/.test(episode)) return [];
    seen.add(key);
    return [{ ...movie, episode_current: normalizeEpisodeCurrent(movie) }];
  });
}

function feedTime(movie: Movie, mode: StableCatalogFeedMode): string {
  return mode === 'episode_updates'
    ? String(movie.last_episode_change_at || movie.modified?.time || '')
    : String(movie.created_at || movie.published_at || movie.modified?.time || '');
}

function formatFeedDate(movie: Movie, mode: StableCatalogFeedMode): string {
  const value = Date.parse(feedTime(movie, mode));
  if (!Number.isFinite(value)) return mode === 'episode_updates' ? 'Vừa cập nhật' : 'Mới thêm';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function buildNewMoviesSchema(mode: StableCatalogFeedMode) {
  const feed = FEEDS[mode];
  return [
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: feed.label, item: `${SITE_URL}${feed.path}` },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: `${feed.label} – KhoPhim`, url: `${SITE_URL}${feed.path}`,
      description: feed.description, inLanguage: 'vi',
      isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
    },
  ];
}

export default function NewMoviesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode: StableCatalogFeedMode = location.pathname === FEEDS.episode_updates.path ? 'episode_updates' : 'new';
  const feed = FEEDS[mode];
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const requestSequence = useRef(0);
  const [retryKey, setRetryKey] = useState(0);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pagination, setPagination] = useState({ totalItems: 0, totalPages: 1 });

  useEffect(() => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(false);
    setMovies([]);

    fetchLatestReleaseMovies(page, mode)
      .then((response) => {
        if (requestSequence.current !== sequence) return;
        if (!response.status) throw new Error('stable_feed_unavailable');
        const normalized = normalizeFeedItems(response.items);
        const reportedPages = Math.max(1, response.pagination.totalPages || 1);
        const canContinue = response.items.length >= PAGE_SIZE;
        const effectivePages = Math.max(reportedPages, canContinue ? page + 1 : page);
        setMovies(normalized);
        setPagination({
          totalItems: Math.max(response.pagination.totalItems || 0, normalized.length),
          totalPages: effectivePages,
        });
        if (page > effectivePages) {
          navigate({ pathname: feed.path, search: effectivePages > 1 ? `?page=${effectivePages}` : '' }, { replace: true });
        }
      })
      .catch(() => {
        if (requestSequence.current === sequence) setError(true);
      })
      .finally(() => {
        if (requestSequence.current === sequence) setLoading(false);
      });

    return () => {
      if (requestSequence.current === sequence) requestSequence.current += 1;
    };
  }, [feed.path, mode, navigate, page, retryKey]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [mode, page]);

  const featured = page === 1 ? movies.slice(0, 3) : [];
  const gridMovies = page === 1 ? movies.slice(3) : movies;
  const hasNext = page < pagination.totalPages;
  const canonical = page > 1 ? `${SITE_URL}${feed.path}?page=${page}` : `${SITE_URL}${feed.path}`;
  const previous = page > 1 ? `${SITE_URL}${feed.path}${page > 2 ? `?page=${page - 1}` : ''}` : undefined;
  const next = hasNext ? `${SITE_URL}${feed.path}?page=${page + 1}` : undefined;
  const pageSchema = useMemo(() => buildNewMoviesSchema(mode), [mode]);
  const visibleCountLabel = pagination.totalItems > movies.length
    ? `${pagination.totalItems.toLocaleString('vi-VN')} phim`
    : `${movies.length} phim trên trang`;
  const retry = useCallback(() => setRetryKey((current) => current + 1), []);

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <SEO
        title={`${feed.label} – Vietsub HD Miễn Phí | KhoPhim`}
        description={`${feed.description} Xem miễn phí với nguồn phát đã được kiểm tra trên KhoPhim.`}
        keywords="phim mới nhất, phim mới cập nhật, phim vietsub, phim có tập mới, xem phim mới miễn phí"
        canonical={canonical}
        prev={previous}
        next={next}
        ogType="website"
        schema={pageSchema}
      />
      <Navbar />

      <header className="relative overflow-hidden border-b border-white/[0.06] pt-20 sm:pt-28">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-red-600/10 blur-[100px]" />
          <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-amber-500/[0.06] blur-[90px]" />
          <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:56px_56px]" />
        </div>

        <div className="relative mx-auto max-w-[1760px] px-4 pb-8 sm:px-6 sm:pb-12 lg:px-8">
          <nav className="mb-5 flex items-center gap-1.5 text-xs text-white/35" aria-label="Breadcrumb">
            <Link to="/" className="transition-colors hover:text-white">Trang chủ</Link>
            <i className="ri-arrow-right-s-line" aria-hidden="true" />
            <span className="text-white/60">{feed.label}</span>
          </nav>

          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-red-400">
                <span className="h-px w-8 bg-red-500" aria-hidden="true" />{feed.eyebrow}
              </p>
              <h1 className="max-w-4xl text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">{feed.label}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/48 sm:text-base">{feed.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-1.5" aria-label="Chọn loại danh sách">
              {(Object.keys(FEEDS) as StableCatalogFeedMode[]).map((feedMode) => {
                const option = FEEDS[feedMode];
                const active = mode === feedMode;
                return (
                  <Link key={feedMode} to={option.path} aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors ${active ? 'bg-red-500 text-white' : 'text-white/48 hover:bg-white/[0.06] hover:text-white'}`}>
                    <i className={option.icon} aria-hidden="true" />{option.shortLabel}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2 text-xs text-white/42">
            <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5">
              <i className="ri-database-2-line mr-1.5 text-red-400" aria-hidden="true" />
              {loading ? 'Đang đọc danh mục…' : visibleCountLabel}
            </span>
            <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5">
              <i className="ri-shield-check-line mr-1.5 text-emerald-400" aria-hidden="true" />Chỉ phim đã xuất bản
            </span>
            <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5">Trang {page}</span>
          </div>
        </div>
      </header>

      <main className="cinema-page-container">
        <AdsterraResponsiveBanner />

        <nav className="mb-8 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" aria-label="Khám phá nhanh theo danh mục">
          {CATEGORY_LINKS.map((category) => (
            <Link key={category.href} to={category.href}
              className="flex min-h-10 flex-shrink-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3.5 text-xs font-semibold text-white/52 transition-colors hover:border-red-400/30 hover:bg-red-500/10 hover:text-white">
              <i className={`${category.icon} text-red-400`} aria-hidden="true" />{category.label}
            </Link>
          ))}
        </nav>

        {error ? <FeedError onRetry={retry} /> : loading ? <FeedSkeleton /> : movies.length === 0 ? <FeedEmpty /> : (
          <>
            {featured.length > 0 && (
              <section className="mb-10" aria-labelledby="latest-featured-title">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">EDITOR'S WINDOW</p>
                    <h2 id="latest-featured-title" className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{feed.sectionTitle}</h2>
                  </div>
                  <span className="hidden text-xs text-white/35 sm:block">Theo thứ tự canonical của KhoPhim</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,.8fr)]">
                  <FeaturedCard movie={featured[0]} mode={mode} />
                  {featured.length > 1 && (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                      {featured.slice(1).map((movie) => <SideFeaturedCard key={getMovieKey(movie)} movie={movie} mode={mode} />)}
                    </div>
                  )}
                </div>
              </section>
            )}

            <section aria-labelledby="latest-grid-title">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="latest-grid-title" className="cinema-section-title text-base sm:text-lg">{feed.gridTitle}</h2>
                <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-xs text-white/38">{gridMovies.length} mục</span>
              </div>
              <div className="grid movie-grid-desktop">
                {gridMovies.map((movie, index) => <MovieCard key={getMovieKey(movie)} movie={movie} priority={index < 6} />)}
              </div>
            </section>

            <Pagination currentPage={page} totalPages={pagination.totalPages} basePath={feed.path} hasNext={hasNext} />
            <AdsterraNativeBanner />
          </>
        )}

        <FeedExplanation />
      </main>
      <Footer />
    </div>
  );
}

function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="rounded-3xl border border-red-400/15 bg-red-500/[0.055] px-6 py-16 text-center" role="alert">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/12 text-2xl text-red-400"><i className="ri-wifi-off-line" /></div>
      <h2 className="mt-5 text-xl font-bold">Chưa tải được danh sách phim</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">Kết nối danh mục đang bận. Bạn có thể thử lại mà không cần tải lại toàn bộ trang.</p>
      <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-bold text-white hover:bg-red-400">
        <i className="ri-refresh-line" />Thử lại
      </button>
    </section>
  );
}

function FeedEmpty() {
  return (
    <section className="rounded-3xl border border-white/[0.07] bg-white/[0.025] px-6 py-20 text-center">
      <i className="ri-film-line text-5xl text-white/18" />
      <h2 className="mt-4 text-xl font-bold text-white/80">Chưa có phim phù hợp</h2>
      <p className="mt-2 text-sm text-white/40">Danh sách sẽ tự cập nhật khi phim vượt qua kiểm tra xuất bản.</p>
      <Link to="/" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-white/65 hover:bg-white/[0.06] hover:text-white">Về trang chủ</Link>
    </section>
  );
}

function FeedSkeleton() {
  return (
    <div aria-label="Đang tải danh sách phim" aria-busy="true">
      <div className="mb-10 grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,.8fr)]">
        <div className="aspect-[16/8.2] rounded-3xl skeleton" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1"><div className="aspect-[16/10] rounded-2xl skeleton" /><div className="aspect-[16/10] rounded-2xl skeleton" /></div>
      </div>
      <div className="grid movie-grid-desktop">
        {Array.from({ length: 18 }, (_, index) => <div key={index}><div className="aspect-[2/3] rounded-lg skeleton" /><div className="mt-2 h-3 w-4/5 rounded skeleton" /><div className="mt-1.5 h-2.5 w-1/2 rounded skeleton" /></div>)}
      </div>
    </div>
  );
}

function FeedExplanation() {
  return (
    <section className="mt-16 border-t border-white/[0.06] pt-10">
      <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">HIỂU ĐÚNG DANH SÁCH</p>
          <h2 className="mt-2 text-xl font-bold">Hai trang, hai ý nghĩa rõ ràng</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/43">“Phim mới” dùng thời điểm phim được thêm vào KhoPhim. “Tập mới” chỉ thay đổi khi số tập thực sự tăng. Việc sửa poster, mô tả hoặc thay nguồn phát không đưa phim cũ lên đầu.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(FEEDS) as StableCatalogFeedMode[]).map((feedMode) => {
            const option = FEEDS[feedMode];
            return (
              <Link key={feedMode} to={option.path} className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 hover:border-red-400/25 hover:bg-red-500/[0.05]">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-400"><i className={option.icon} /></span>
                  <div><strong className="text-sm text-white/85 group-hover:text-white">{option.label}</strong><p className="mt-0.5 text-xs text-white/35">{feedMode === 'new' ? 'Theo ngày thêm phim' : 'Theo lần tăng số tập'}</p></div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({ movie, mode }: { movie: Movie; mode: StableCatalogFeedMode }) {
  const imagePath = movie.hero_backdrop_url || movie.thumb_url || movie.hero_poster_url || movie.poster_url;
  const fallbackPath = movie.thumb_url || movie.poster_url;
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(imagePath, fallbackPath, isImagePreloaded(getFeaturedUrl(imagePath)), 1180, 88);
  return (
    <Link to={movieDetailUrl(movie.slug)} className="movie-card-contain movie-art-frame movie-art-frame--wide group relative block overflow-hidden rounded-3xl bg-[#151823]">
      <div className="relative aspect-[16/8.2] min-h-[260px]">
        {!loaded && !hasError && <div className="absolute inset-0 skeleton" />}
        {hasError && <div className="absolute inset-0 grid place-items-center bg-[#151823] text-4xl text-white/15"><i className="ri-image-line" /></div>}
        <img src={currentSrc} alt={movie.name} loading="eager" decoding="async"
          className={`h-full w-full object-cover transition duration-700 group-hover:scale-[1.025] ${loaded && !hasError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => { onLoad(); markImagePreloaded(currentSrc); }} onError={onError} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" /><div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2 sm:left-5 sm:top-5">
          <span className="rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">{mode === 'new' ? 'Mới thêm' : 'Tập mới'}</span>
          {movie.quality && <span className="rounded-md border border-white/15 bg-black/60 px-2 py-1 text-[10px] font-bold text-white">{movie.quality}</span>}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/48">{formatFeedDate(movie, mode)}</p>
          <h3 className="max-w-3xl text-xl font-black leading-tight text-white sm:text-3xl">{movie.name}</h3>
          {movie.origin_name && <p className="mt-1 line-clamp-1 text-xs text-white/46 sm:text-sm">{movie.origin_name}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/58">
            {movie.year ? <span>{movie.year}</span> : null}{movie.lang ? <span>· {movie.lang}</span> : null}
            {movie.episode_current ? <span className="rounded-md bg-white/10 px-2 py-1 text-white/80">{movie.episode_current}</span> : null}
            <span className="ml-auto hidden min-h-10 items-center gap-2 rounded-full bg-white px-4 font-bold text-black sm:inline-flex"><i className="ri-play-fill" />Xem ngay</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SideFeaturedCard({ movie, mode }: { movie: Movie; mode: StableCatalogFeedMode }) {
  const imagePath = movie.hero_backdrop_url || movie.thumb_url || movie.hero_poster_url || movie.poster_url;
  const fallbackPath = movie.thumb_url || movie.poster_url;
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(imagePath, fallbackPath, isImagePreloaded(getSmallThumbUrl(imagePath)), 520, 84);
  return (
    <Link to={movieDetailUrl(movie.slug)} className="movie-card-contain movie-art-frame movie-art-frame--wide group relative block overflow-hidden rounded-2xl bg-[#151823]">
      <div className="relative aspect-[16/10]">
        {!loaded && !hasError && <div className="absolute inset-0 skeleton" />}{hasError && <div className="absolute inset-0 grid place-items-center text-2xl text-white/15"><i className="ri-image-line" /></div>}
        <img src={currentSrc} alt={movie.name} loading="lazy" decoding="async"
          className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.035] ${loaded && !hasError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => { onLoad(); markImagePreloaded(currentSrc); }} onError={onError} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
        <div className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2 py-1 text-[9px] font-bold text-white/80">{formatFeedDate(movie, mode)}</div>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="line-clamp-2 text-sm font-bold leading-5 text-white group-hover:text-red-300">{movie.name}</h3>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/48">{movie.year ? <span>{movie.year}</span> : null}{movie.episode_current ? <span className="truncate rounded bg-white/10 px-1.5 py-0.5 text-white/75">{movie.episode_current}</span> : null}</div>
        </div>
      </div>
    </Link>
  );
}
