import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QueerUniverseHero from './QueerUniverseHero';
import PortalGateway from './PortalGateway';
import type { MovieItem } from '../../../types/movie';
import { fetchQueerUniverseSections, searchQueerUniverseMovies } from '../../../services/movieApi';
import { movieDetailUrl } from '../../../utils/slugEncoder';
import MovieCountdown from '../../../components/base/MovieCountdown';
import { useImageFallback } from '../../../hooks/useImageFallback';

interface QueerUniverseHomeProps {
  onBack: () => void;
  onSelectPortal: (portal: 'movies' | 'queer') => void;
}

interface QueerSections {
  featured: MovieItem[];
  newUpdates: MovieItem[];
  byYear: Record<string, MovieItem[]>;
}

type StatusFilter = 'all' | 'ongoing' | 'completed';

const EMPTY_SECTIONS: QueerSections = {
  featured: [],
  newUpdates: [],
  byYear: {},
};

const MOVIES_PER_PAGE = 24;
const QUEER_FALLBACK_URL = '/queer-fallback.json?v=202607041605';

async function loadStaticQueerFallback(signal?: AbortSignal): Promise<MovieItem[]> {
  try {
    const res = await fetch(QUEER_FALLBACK_URL, { cache: 'force-cache', signal });
    if (!res.ok) return [];
    const data = await res.json() as { sections?: { newUpdates?: MovieItem[] } };
    return (data.sections?.newUpdates ?? []).filter((movie) => Boolean(movie.slug && movie.name));
  } catch {
    return [];
  }
}

function getMovieHref(movie: MovieItem): string {
  const href = movieDetailUrl(movie.slug);
  const isOphimSource = movie.source_site === 'ophim' || movie.source_name === 'OPhim';
  return isOphimSource ? `${href}?source=ophim` : href;
}

function getMovieTime(movie: MovieItem): number {
  const time = new Date(movie.modified?.time ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortNewestFirst(items: MovieItem[]): MovieItem[] {
  return [...items].sort((a, b) => {
    const timeDiff = getMovieTime(b) - getMovieTime(a);
    if (timeDiff !== 0) return timeDiff;
    return (b.year || 0) - (a.year || 0);
  });
}

function normalizeText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getEpisodeNumber(movie: MovieItem): number {
  const match = (movie.episode_current || '').match(/(\d+)/);
  return Math.max(Number(movie.current_episode || 0), match ? Number(match[1]) : 0);
}

function getEpisodeLabel(movie: MovieItem): string {
  const episodeNumber = getEpisodeNumber(movie);
  const textNumber = (movie.episode_current || '').match(/(\d+)/);
  if (episodeNumber > (textNumber ? Number(textNumber[1]) : 0)) return `Tập ${episodeNumber}`;
  return movie.episode_current || (episodeNumber ? `Tập ${episodeNumber}` : '');
}

function isOngoing(movie: MovieItem): boolean {
  return movie.status === 'ongoing' || normalizeText(getEpisodeLabel(movie)).includes('dang chieu');
}

function isCompleted(movie: MovieItem): boolean {
  const text = normalizeText(`${movie.status || ''} ${getEpisodeLabel(movie)}`);
  return text.includes('completed') || text.includes('hoan tat') || text.includes('end') || text.includes('full');
}

function rankScore(movie: MovieItem): number {
  const freshness = Math.max(0, 60 - (Date.now() - getMovieTime(movie)) / 86400000);
  const yearScore = Math.max(0, (movie.year || 0) - 2020) * 4;
  const statusScore = isOngoing(movie) ? 25 : isCompleted(movie) ? 8 : 0;
  return freshness + yearScore + statusScore + Math.min(getEpisodeNumber(movie), 20);
}

function matchesSearch(movie: MovieItem, query: string): boolean {
  const q = normalizeText(query.trim());
  if (!q) return true;
  const haystack = normalizeText([
    movie.name,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.slug,
    movie.content,
    getEpisodeLabel(movie),
    movie.year ? String(movie.year) : '',
    ...(movie.category ?? []).flatMap((item) => [item.name, item.slug]),
    ...(movie.country ?? []).flatMap((item) => [item.name, item.slug]),
  ].filter(Boolean).join(' '));
  return q.split(/\s+/).every((part) => haystack.includes(part));
}

function filterByStatus(movie: MovieItem, status: StatusFilter): boolean {
  if (status === 'ongoing') return isOngoing(movie);
  if (status === 'completed') return isCompleted(movie);
  return true;
}

function getMetaText(movie: MovieItem): string {
  return [
    movie.year > 0 ? String(movie.year) : '',
    getEpisodeLabel(movie),
    movie.country?.[0]?.name,
  ].filter(Boolean).join('  ');
}

function QueerMovieImage({
  movie,
  width,
  quality,
  className,
  priority,
}: {
  movie: MovieItem;
  width: number;
  quality: number;
  className: string;
  priority?: boolean;
}) {
  const primary = movie.thumb_url || movie.poster_url;
  const fallback = movie.poster_url && movie.poster_url !== primary ? movie.poster_url : undefined;
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(
    primary,
    fallback,
    false,
    width,
    quality,
    { preferredAspect: 'portrait' },
  );

  return (
    <>
      {!loaded && <div className="absolute inset-0 z-[1] blur-placeholder" />}
      {hasError && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#111923]">
          <i className="ri-image-line text-2xl text-white/20" />
        </div>
      )}
      <img
        src={currentSrc}
        alt={movie.name}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'low'}
        decoding="async"
        className={`${className} ${loaded && !hasError ? 'opacity-100' : 'opacity-0'}`}
        onLoad={onLoad}
        onError={onError}
      />
    </>
  );
}

function MoviePosterCard({ movie, priority }: { movie: MovieItem; priority?: boolean }) {
  const href = getMovieHref(movie);
  const episodeLabel = getEpisodeLabel(movie);

  return (
    <Link to={href} className="group block">
      <article className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#0e1219] transition-colors hover:border-cyan-300/35 hover:bg-[#111923]">
        <div className="relative aspect-[2/3] overflow-hidden bg-white/[0.04]">
          <QueerMovieImage
            movie={movie}
            width={420}
            quality={84}
            priority={priority}
            className="h-full w-full object-cover object-center transition-[opacity,transform] duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="absolute left-2 top-2 z-[2] flex flex-col items-start gap-1">
            <MovieCountdown movie={movie} />
            {episodeLabel && (
              <span className="rounded-md bg-cyan-300 px-2 py-1 text-[10px] font-black text-[#041416] shadow-lg shadow-cyan-950/25">
                {episodeLabel}
              </span>
            )}
            {isCompleted(movie) && (
              <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-[9px] font-black text-white">Hoàn tất</span>
            )}
          </div>
          {movie.quality && (
            <span className="absolute right-2 top-2 z-[2] rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-black text-white">
              {movie.quality}
            </span>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 min-h-[38px] text-sm font-bold leading-snug text-white group-hover:text-cyan-200">
            {movie.name}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 overflow-hidden text-[11px] font-semibold text-white/48">
            {movie.year > 0 && <span>{movie.year}</span>}
            {movie.country?.[0] && (
              <>
                <span className="text-white/18">•</span>
                <span className="truncate">{movie.country[0].name}</span>
              </>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
      <div className="flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-cyan-300" />
        <h3 className="text-lg font-black text-white">{title}</h3>
      </div>
      {typeof count === 'number' && <span className="text-xs font-bold text-white/38">{count} phim</span>}
    </div>
  );
}

function MovieGrid({ movies, loading, skeletonCount = 12 }: { movies: MovieItem[]; loading: boolean; skeletonCount?: number }) {
  if (loading && movies.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.03]">
            <div className="aspect-[2/3] skeleton" />
            <div className="space-y-2 p-2.5">
              <div className="h-3 rounded skeleton" />
              <div className="h-2 w-2/3 rounded skeleton" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
      {movies.map((movie, index) => (
        <MoviePosterCard key={movie.slug} movie={movie} priority={index < 6} />
      ))}
    </div>
  );
}

function RankingList({ movies }: { movies: MovieItem[] }) {
  return (
    <aside className="rounded-md border border-white/[0.08] bg-[#0a0f15]">
      <div className="border-b border-white/[0.08] px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/70">Được quan tâm</p>
        <h3 className="mt-1 text-lg font-black text-white">Bảng xếp hạng</h3>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {movies.slice(0, 10).map((movie, index) => (
          <Link key={movie.slug} to={getMovieHref(movie)} className="group flex gap-3 px-3 py-3 transition-colors hover:bg-white/[0.04]">
            <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-sm font-black ${
              index < 3 ? 'bg-cyan-300 text-[#041416]' : 'bg-white/[0.07] text-white/55'
            }`}>
              {index + 1}
            </span>
            <div className="relative h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-white/[0.04]">
              <QueerMovieImage
                movie={movie}
                width={120}
                quality={78}
                className="h-full w-full object-cover object-center transition-opacity duration-300"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-bold leading-snug text-white group-hover:text-cyan-200">{movie.name}</p>
              <p className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-white/42">{getMetaText(movie)}</p>
            </div>
          </Link>
        ))}
      </div>
    </aside>
  );
}

export default function QueerUniverseHome({ onBack, onSelectPortal }: QueerUniverseHomeProps) {
  const [sections, setSections] = useState<QueerSections>(EMPTY_SECTIONS);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [remoteSearchMovies, setRemoteSearchMovies] = useState<MovieItem[]>([]);
  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let resolved = false;
    setLoading(true);

    const fallbackTimer = window.setTimeout(() => {
      if (resolved || controller.signal.aborted) return;
      loadStaticQueerFallback(controller.signal).then((fallbackMovies) => {
        if (resolved || controller.signal.aborted || fallbackMovies.length === 0) return;
        setSections({
          featured: sortNewestFirst(fallbackMovies),
          newUpdates: sortNewestFirst(fallbackMovies),
          byYear: {},
        });
        setLoading(false);
      });
    }, 1200);

    fetchQueerUniverseSections({ signal: controller.signal, limit: 1000, timeoutMs: 9000 })
      .then(async (data) => {
        resolved = true;
        const fallbackMovies = data.newUpdates.length === 0
          ? await loadStaticQueerFallback(controller.signal)
          : [];
        if (controller.signal.aborted) return;
        const newUpdates = sortNewestFirst(data.newUpdates.length ? data.newUpdates : fallbackMovies);
        setSections({
          featured: sortNewestFirst(data.featured.length ? data.featured : newUpdates),
          newUpdates,
          byYear: newUpdates.length ? data.byYear : {},
        });
      })
      .finally(() => {
        window.clearTimeout(fallbackTimer);
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      window.clearTimeout(fallbackTimer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (loading || sections.newUpdates.length > 0 || fallbackAttempted) return;

    const controller = new AbortController();
    setFallbackAttempted(true);
    loadStaticQueerFallback(controller.signal).then((fallbackMovies) => {
      if (controller.signal.aborted || fallbackMovies.length === 0) return;
      const sortedFallback = sortNewestFirst(fallbackMovies);
      setSections({
        featured: sortedFallback,
        newUpdates: sortedFallback,
        byYear: {},
      });
    });

    return () => controller.abort();
  }, [fallbackAttempted, loading, sections.newUpdates.length]);

  const allMovies = useMemo(() => sortNewestFirst(sections.newUpdates), [sections.newUpdates]);
  const rankedMovies = useMemo(() => [...allMovies].sort((a, b) => rankScore(b) - rankScore(a)), [allMovies]);
  const recommendedMovies = useMemo(() => rankedMovies.slice(0, 12), [rankedMovies]);
  const normalizedQuery = query.trim();
  const shouldRemoteSearch = normalizedQuery.length >= 2;

  useEffect(() => {
    if (!shouldRemoteSearch) {
      setRemoteSearchMovies([]);
      setRemoteSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setRemoteSearchLoading(true);
      searchQueerUniverseMovies(normalizedQuery, {
        limit: 72,
        timeoutMs: 6500,
        signal: controller.signal,
      })
        .then((movies) => {
          if (!controller.signal.aborted) setRemoteSearchMovies(sortNewestFirst(movies));
        })
        .catch(() => {
          if (!controller.signal.aborted) setRemoteSearchMovies([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setRemoteSearchLoading(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, shouldRemoteSearch]);

  const searchSourceMovies = useMemo(() => {
    if (!shouldRemoteSearch) return allMovies;
    const seen = new Set<string>();
    return [...remoteSearchMovies, ...allMovies].filter((movie) => {
      if (!movie.slug || seen.has(movie.slug)) return false;
      seen.add(movie.slug);
      return true;
    });
  }, [allMovies, remoteSearchMovies, shouldRemoteSearch]);

  const filteredMovies = useMemo(
    () => searchSourceMovies.filter((movie) => filterByStatus(movie, status) && matchesSearch(movie, query)),
    [searchSourceMovies, status, query]
  );

  useEffect(() => {
    setPage(1);
  }, [query, status, searchSourceMovies]);

  const totalPages = Math.max(1, Math.ceil(filteredMovies.length / MOVIES_PER_PAGE));
  const pagedMovies = filteredMovies.slice((page - 1) * MOVIES_PER_PAGE, page * MOVIES_PER_PAGE);
  const hasSearch = query.trim().length > 0 || status !== 'all';
  const hasMovies = allMovies.length > 0;

  return (
    <>
      <QueerUniverseHero movies={recommendedMovies.length ? recommendedMovies : allMovies} loading={loading} />

      <main className="mx-auto max-w-[1760px] px-3 pb-16 pt-6 md:px-5 md:pt-8 2xl:px-8">
        <PortalGateway onSelect={onSelectPortal} compact />

        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">Không gian riêng</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">Vũ Trụ Đam Mỹ / BL / GL</h2>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex w-fit items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/68 transition-colors hover:border-cyan-300/35 hover:text-white active:scale-95"
          >
            <i className="ri-arrow-left-line" />
            Đổi khu
          </button>
        </div>

        <section className="mb-8 overflow-hidden rounded-2xl border border-cyan-300/18 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,#08131a,#0a0f15_55%,#110b16)] p-4 shadow-[0_24px_80px_-44px_rgba(34,211,238,0.65)] md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300 text-[#041416] shadow-lg shadow-cyan-950/30">
              <i className="ri-search-line text-lg" />
            </span>
            <div>
              <h3 className="text-lg font-black text-white md:text-xl">Bạn muốn xem phim gì?</h3>
              <p className="mt-0.5 text-xs font-semibold text-white/48">Tìm nhanh theo tên phim, quốc gia, năm hoặc tập mới nhất</p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <label className="relative block">
              <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-lg text-cyan-200/80" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nhập tên phim bạn muốn tìm..."
                className="h-14 w-full rounded-xl border border-cyan-200/20 bg-black/35 pl-12 pr-12 text-base font-bold text-white outline-none transition-colors placeholder:text-white/35 focus:border-cyan-200/60 md:h-16 md:text-lg"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label="Xóa tìm kiếm"
                >
                  <i className="ri-close-line" />
                </button>
              )}
              {remoteSearchLoading && (
                <span className="absolute right-14 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-cyan-100/80">
                  <i className="ri-loader-4-line animate-spin" />
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                ['all', 'Tất cả'],
                ['ongoing', 'Đang chiếu'],
                ['completed', 'Hoàn tất'],
              ].map(([key, label]) => {
                const active = status === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatus(key as StatusFilter)}
                    className={`rounded-xl border px-4 py-3 text-sm font-black transition-colors ${
                      active
                        ? 'border-cyan-300 bg-cyan-300 text-[#041416]'
                        : 'border-white/[0.10] bg-white/[0.06] text-white/68 hover:border-cyan-300/35 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {!loading && !hasMovies && (
          <section className="rounded-md border border-white/[0.08] bg-white/[0.04] p-6">
            <h3 className="text-lg font-bold text-white">Chưa tải được danh sách phim</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              Hệ thống đang thử tải lại danh sách. Vui lòng quay lại sau ít phút.
            </p>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-9">
            {!hasSearch && (
              <section>
                <SectionHeader title="Phim đề cử" count={recommendedMovies.length} />
                <MovieGrid movies={recommendedMovies} loading={loading} skeletonCount={12} />
              </section>
            )}

            <section>
              <SectionHeader title={hasSearch ? 'Kết quả tìm kiếm' : 'Phim mới cập nhật'} count={filteredMovies.length} />
              <MovieGrid movies={pagedMovies} loading={loading || remoteSearchLoading} skeletonCount={24} />
              {!loading && !remoteSearchLoading && filteredMovies.length === 0 && (
                <div className="rounded-md border border-white/[0.08] bg-white/[0.035] p-8 text-center">
                  <p className="text-sm font-bold text-white/65">Không tìm thấy phim phù hợp</p>
                </div>
              )}

              {totalPages > 1 && (
                <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={page === 1}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-white/55 disabled:opacity-35"
                    aria-label="Trang trước"
                  >
                    <i className="ri-arrow-left-s-line" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }).map((_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setPage(pageNumber)}
                        className={`h-9 min-w-9 rounded-md border px-3 text-xs font-black ${
                          page === pageNumber
                            ? 'border-cyan-300 bg-cyan-300 text-[#041416]'
                            : 'border-white/[0.08] bg-white/[0.04] text-white/55'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    disabled={page === totalPages}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-white/55 disabled:opacity-35"
                    aria-label="Trang sau"
                  >
                    <i className="ri-arrow-right-s-line" />
                  </button>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <RankingList movies={rankedMovies} />
          </div>
        </div>
      </main>
    </>
  );
}
