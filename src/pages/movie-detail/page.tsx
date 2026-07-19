import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import { useToast } from '@/components/base/Toast';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useResumeWatch } from '@/hooks/useResumeWatch';
import { useFavorites } from '@/hooks/useFavorites';
import MovieDetailHero from './components/MovieDetailHero';
import MovieDetailPlayerSection from './components/MovieDetailPlayerSection';
import SEO from '@/components/base/SEO';
import type { MovieDetailResponse, EpisodeData, EpisodeServer, MovieItem } from '@/types/movie';
import {
  fetchMovieDetail,
  fetchMoviesByCategory,
  deduplicateAndLimitServers,
  pickBestServerIndex,
  hasPlayableUrl,
  pickBestEpisodeByPriority,
  epSortKey,
  getPosterUrl,
} from '@/services/movieApi';
import { runWhenIdle } from '@/utils/performance';

const UserComments = lazy(() => import('./components/UserComments'));
const MovieReviewSection = lazy(() => import('@/components/feature/MovieReview'));
const MovieDetailSEOBlock = lazy(() => import('./components/MovieDetailSEOBlock'));

function getPlayableSourceUrl(ep: EpisodeData): string {
  return ep.link_m3u8?.trim() || ep.link_embed?.trim() || '';
}

function resolveOriginalServerIndex(targetServer: EpisodeServer, originalServers: EpisodeServer[]): number {
  const directIdx = originalServers.findIndex((server) => server === targetServer);
  if (directIdx >= 0) return directIdx;

  const targetLinks = new Set(
    (targetServer.server_data ?? [])
      .flatMap((ep) => [ep.link_m3u8?.trim(), ep.link_embed?.trim()])
      .filter(Boolean) as string[]
  );

  return originalServers.findIndex((server) => {
    if ((server.server_name ?? '') !== (targetServer.server_name ?? '')) return false;
    return (server.server_data ?? []).some((ep) =>
      targetLinks.has(ep.link_m3u8?.trim() ?? '') ||
      targetLinks.has(ep.link_embed?.trim() ?? '')
    );
  });
}

function shouldWarmMoviePlayer(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (nav.connection?.saveData) return false;
  return !/(^|-)2g$/.test(nav.connection?.effectiveType ?? '');
}

function addWarmupHint(rel: 'dns-prefetch' | 'preconnect', href: string): () => void {
  const selector = `link[rel="${rel}"][href="${href}"]`;
  const existing = document.querySelector<HTMLLinkElement>(selector);
  if (existing) return () => {};

  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (rel === 'preconnect') link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
  return () => link.remove();
}

function getTrailerEmbedUrl(url: string): string | null {
  if (!url) return null;
  const watchMatch = url.match(/youtube\.com\/watch\?v=([^&]+)/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}?autoplay=0`;
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}?autoplay=0`;
  if (url.includes('youtube.com/embed/')) return url;
  const dm = /^https?:\/\/(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/i.exec(url);
  if (dm) return `https://www.dailymotion.com/embed/video/${dm[1]}`;
  const shortDm = /^https?:\/\/dai\.ly\/([a-zA-Z0-9]+)/i.exec(url);
  if (shortDm) return `https://www.dailymotion.com/embed/video/${shortDm[1]}`;
  if (url.includes('dailymotion.com/embed/')) return url;
  const vimeo = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i.exec(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  if (url.includes('player.vimeo.com/')) return url;
  return null;
}

function getEpisodeNumber(ep: EpisodeData): number {
  const label = `${ep.name || ''} ${ep.slug || ''}`;
  const range = label.match(/\b\d+\s*[-~–—]\s*(\d+)\b/);
  if (range) return Number(range[1] || 0) || 0;
  return ep.episode_number ?? Number(label.match(/\d+/)?.[0] ?? 0);
}

function getHighestEpisodeFromServers(episodes: EpisodeServer[]): number {
  return episodes.reduce((highest, server) => {
    const serverHighest = (server.server_data ?? []).reduce((max, ep) => {
      if (!hasPlayableUrl(ep) || ep.is_scheduled) return max;
      return Math.max(max, getEpisodeNumber(ep));
    }, 0);
    return Math.max(highest, serverHighest);
  }, 0);
}

function getAdvertisedCurrentEpisode(detail: MovieDetailResponse): number {
  const movie = detail.movie as MovieDetailResponse['movie'] & {
    current_episode?: number | string;
    total_episodes?: number | string;
  };
  const candidates: Array<number | string | undefined> = [
    movie.current_episode,
    movie.episode_current,
  ];
  return candidates.reduce<number>((max, value) => {
    if (value == null) return max;
    const match = String(value).match(/\d+/);
    const num = match ? Number(match[0]) : Number(value);
    return Number.isFinite(num) ? Math.max(max, num) : max;
  }, 0);
}

function shouldRefreshEpisodeDetail(detail: MovieDetailResponse): boolean {
  const displayedCurrent = getAdvertisedCurrentEpisode(detail);
  if (displayedCurrent < 2) return false;
  const playableCurrent = getHighestEpisodeFromServers(deduplicateAndLimitServers(detail.episodes ?? []));
  return playableCurrent < displayedCurrent;
}

function getLatestPlayableEpisodeSlug(episodes: EpisodeServer[]): string | undefined {
  const latest = episodes
    .flatMap((server) => server.server_data ?? [])
    .filter((ep) => hasPlayableUrl(ep) && !ep.is_scheduled)
    .sort((a, b) => epSortKey(b) - epSortKey(a))[0];
  return latest?.slug || latest?.name;
}

function getLatestPlayableEpisode(episodes: EpisodeData[]): EpisodeData | null {
  return [...episodes]
    .filter((ep) => hasPlayableUrl(ep) && !ep.is_scheduled)
    .sort((a, b) => epSortKey(b) - epSortKey(a))[0] ?? null;
}

export default function MovieDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { addEntry, updateProgress } = useWatchHistory();
  const { getResume, saveProgress, clearProgress } = useResumeWatch();
  const { isFav, toggle } = useFavorites();

  const [detail, setDetail] = useState<MovieDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeServer, setActiveServer] = useState(0);
  const [activeEp, setActiveEp] = useState<EpisodeData | null>(null);
  const [related, setRelated] = useState<MovieItem[]>([]);
  const [resumeInfo, setResumeInfo] = useState<{ time: number; duration: number; progress: number; shouldResume: boolean } | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [initialSeekTime, setInitialSeekTime] = useState(0);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const saveProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeEpRef = useRef<string | null>(null);
  const relatedFetchedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (saveProgressTimer.current) clearTimeout(saveProgressTimer.current);
    };
  }, []);

  useEffect(() => {
    activeEpRef.current = activeEp?.slug ?? null;
  }, [activeEp?.slug]);

  /* IntersectionObserver to defer bottom sections until user scrolls near */
  useEffect(() => {
    if (!detail || showBottom) return;
    const el = bottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShowBottom(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px' } // increased from 400px to defer more
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [detail, showBottom]);

  /* ── Fetch movie detail ── */
  useEffect(() => {
    if (!slug) return;
    const isFresh = searchParams.has('fresh');
    const source = searchParams.get('source') || undefined;
    let cancelled = false;
    if (isFresh) {
      setSearchParams({}, { replace: true });
    }
    setLoading(true);
    setError(null);
    setActiveServer(0);
    setActiveEp(null);
    setShowBottom(false);
    relatedFetchedRef.current = false;
    setRelated([]);
    window.scrollTo({ top: 0, behavior: 'auto' });

    fetchMovieDetail(slug, isFresh, source)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError(`Không thể tải thông tin phim "${slug}". Phim không tồn tại hoặc đang được cập nhật.`);
          return;
        }
        let resolvedData = data;

        setDetail(resolvedData);
        const deduped = deduplicateAndLimitServers(resolvedData.episodes ?? []);
        if (deduped.length > 0) {
          const bestIdx = pickBestServerIndex(deduped);
          const origIdx = (resolvedData.episodes ?? []).findIndex((ep) => ep === deduped[bestIdx]);
          setActiveServer(origIdx >= 0 ? origIdx : bestIdx);
        } else {
          setActiveServer(-1);
        }

        if (!isFresh && shouldRefreshEpisodeDetail(data)) {
          void fetchMovieDetail(slug, true, source)
            .then((refreshed) => {
              const oldMax = getHighestEpisodeFromServers(deduplicateAndLimitServers(data.episodes ?? []));
              const refreshedMax = refreshed
                ? getHighestEpisodeFromServers(deduplicateAndLimitServers(refreshed.episodes ?? []))
                : 0;
              if (refreshed && refreshedMax > oldMax) {
                resolvedData = refreshed;
                setDetail(resolvedData);
                const deduped = deduplicateAndLimitServers(resolvedData.episodes ?? []);
                if (deduped.length > 0) {
                  const bestIdx = pickBestServerIndex(deduped);
                  const origIdx = (resolvedData.episodes ?? []).findIndex((ep) => ep === deduped[bestIdx]);
                  setActiveServer(origIdx >= 0 ? origIdx : bestIdx);
                }
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError(`Không thể tải thông tin phim "${slug}". Phim có thể chưa được lưu hoặc slug không khớp.`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Related content is non-critical. Fetch it only after the visitor approaches
  // the lower page sections, so the player never competes with source APIs.
  useEffect(() => {
    if (!showBottom || !detail?.movie || !slug || relatedFetchedRef.current) return;
    const genre = detail.movie.category?.[0]?.slug;
    const country = detail.movie.country?.[0]?.slug;
    if (!genre && !country) return;

    let cancelled = false;
    relatedFetchedRef.current = true;
    fetchMoviesByCategory({ category: genre, country, page: 1 })
      .then((result) => {
        if (!cancelled) {
          setRelated(result.items?.filter((item) => item.slug !== slug).slice(0, 6) ?? []);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [detail?.movie, showBottom, slug]);

  /* ── ESC to exit cinema mode ── */
  useEffect(() => {
    if (!cinemaMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCinemaMode(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cinemaMode]);

  const filteredEpisodes = useMemo(
    () => deduplicateAndLimitServers(detail?.episodes ?? []),
    [detail?.episodes]
  );

  const displayMovie = useMemo(() => {
    if (!detail?.movie) return null;
    const highestEpisode = getHighestEpisodeFromServers(filteredEpisodes);
    const currentEpisode =
      detail.movie.current_episode ??
      Number((detail.movie.episode_current || '').match(/\d+/)?.[0] ?? 0);
    if (!highestEpisode || highestEpisode === currentEpisode) return detail.movie;
    return {
      ...detail.movie,
      current_episode: highestEpisode,
      episode_current: `Tập ${highestEpisode}`,
    };
  }, [detail?.movie, filteredEpisodes]);

  const hasEpisodes = useMemo(() => {
    return filteredEpisodes.length > 0 && filteredEpisodes.some((s) =>
      (s.server_data ?? []).some((ep) => ep.is_scheduled || hasPlayableUrl(ep))
    );
  }, [filteredEpisodes]);

  useEffect(() => {
    if (!hasEpisodes) return;
    const firstPlayableEpisode = filteredEpisodes
      .flatMap((server) => server.server_data ?? [])
      .find((ep) => hasPlayableUrl(ep));
    if (!firstPlayableEpisode) return;

    try {
      const firstPlayableUrl = getPlayableSourceUrl(firstPlayableEpisode);
      const origin = new URL(firstPlayableUrl).origin;
      const cleanups = [
        addWarmupHint('dns-prefetch', origin),
        addWarmupHint('preconnect', origin),
      ];

      if (firstPlayableEpisode.link_m3u8 && shouldWarmMoviePlayer()) {
        runWhenIdle(() => {
          import('./components/LightweightHlsPlayer').catch(() => {});
        }, 1800);
      }

      return () => cleanups.forEach((cleanup) => cleanup());
    } catch {
      return;
    }
  }, [filteredEpisodes, hasEpisodes]);

  const activeFilteredIndex = useMemo(() => {
    if (!detail?.episodes || activeServer < 0) return -1;
    return filteredEpisodes.findIndex((fe) => resolveOriginalServerIndex(fe, detail.episodes) === activeServer);
  }, [detail?.episodes, activeServer, filteredEpisodes]);

  const isTrailerOnly = useMemo(() => {
    if (!detail?.movie) return false;
    const epCurrent = (detail.movie.episode_current ?? '').toLowerCase().trim();
    if (epCurrent === 'trailer') return true;
    if (epCurrent === 'sap chieu' || epCurrent === 'dang cap nhat') return true;
    const allEps = detail.episodes?.flatMap((s) => s.server_data ?? []) ?? [];
    if (allEps.length === 0) {
      return epCurrent === 'trailer' || epCurrent === 'sap chieu' || epCurrent === 'dang cap nhat';
    }
    if (allEps.every((ep) => ep.name?.toLowerCase().includes('trailer'))) return true;
    return false;
  }, [detail]);

  useEffect(() => {
    if (activeEp || !hasEpisodes || isTrailerOnly || !detail?.episodes) return;
    const latestEpSlug = getLatestPlayableEpisodeSlug(filteredEpisodes);
    const best = pickBestEpisodeByPriority(filteredEpisodes, latestEpSlug);
    if (!best) return;
    const originalIdx = resolveOriginalServerIndex(filteredEpisodes[best.serverIndex], detail.episodes);
    setActiveServer(originalIdx >= 0 ? originalIdx : best.serverIndex);
    setActiveEp(best.episode);
    setInitialSeekTime(0);
  }, [activeEp, detail?.episodes, filteredEpisodes, hasEpisodes, isTrailerOnly]);

  const trailerEmbedUrl = useMemo(
    () => (detail?.movie?.trailer_url ? getTrailerEmbedUrl(detail.movie.trailer_url) : null),
    [detail?.movie?.trailer_url]
  );

  const handleSelectEp = useCallback((ep: EpisodeData, seekTime = 0) => {
    if (!hasPlayableUrl(ep)) {
      showToast('Tập này chưa có liên kết phát. Vui lòng thử tập khác.', 'error');
      return;
    }
    setActiveEp(ep);
    setInitialSeekTime(seekTime);
    setShowResumeBanner(false);
    if (detail?.movie) addEntry(detail.movie as unknown as MovieItem, ep.slug, ep.name);
    if (slug && seekTime === 0) {
      const info = getResume(slug, ep.slug);
      setResumeInfo(info);
      setShowResumeBanner(info.shouldResume);
    }
    setTimeout(() => playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [detail, slug, addEntry, getResume, showToast]);

  const handleSwitchServer = useCallback((filteredIdx: number) => {
    const targetServer = filteredEpisodes[filteredIdx];
    if (!targetServer || !detail?.episodes) return;
    const originalIdx = resolveOriginalServerIndex(targetServer, detail.episodes);
    if (originalIdx < 0) return;
    const newServerData = detail.episodes[originalIdx]?.server_data ?? [];
    setActiveServer(originalIdx);
    if (activeEp) {
      const activeNumber = activeEp.episode_number ?? Number((activeEp.slug || activeEp.name || '').match(/\d+/)?.[0] ?? 0);
      const activeKey = activeNumber > 0 ? `num:${activeNumber}` : `text:${activeEp.slug || activeEp.name}`;
      const newEp = newServerData.find((ep) => {
        const epNumber = ep.episode_number ?? Number((ep.slug || ep.name || '').match(/\d+/)?.[0] ?? 0);
        const epKey = epNumber > 0 ? `num:${epNumber}` : `text:${ep.slug || ep.name}`;
        return epKey === activeKey && hasPlayableUrl(ep);
      }) ?? getLatestPlayableEpisode(newServerData);
      if (newEp) setActiveEp(newEp);
    }
  }, [filteredEpisodes, detail?.episodes, activeEp]);

  const handleTimeUpdate = useCallback((time: number, duration: number) => {
    if (!slug || !activeEpRef.current) return;
    if (saveProgressTimer.current) clearTimeout(saveProgressTimer.current);
    saveProgressTimer.current = setTimeout(() => {
      const epSlug = activeEpRef.current;
      if (!epSlug) return;
      saveProgress(slug, epSlug, time, duration);
      if (detail?.movie) updateProgress(detail.movie._id, time, duration);
    }, 5000);
  }, [slug, saveProgress, detail, updateProgress]);

  const handleResume = useCallback(() => {
    if (!resumeInfo) return;
    setInitialSeekTime(resumeInfo.time);
    setShowResumeBanner(false);
  }, [resumeInfo]);

  const handleRestart = useCallback(() => {
    if (slug && activeEp) clearProgress(slug, activeEp.slug);
    setInitialSeekTime(0);
    setShowResumeBanner(false);
  }, [slug, activeEp, clearProgress]);

  const handleRefetchMovie = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setActiveEp(null);
    setShowResumeBanner(false);
    try {
      const data = await fetchMovieDetail(slug, true);
      if (!data) {
        setError('Không thể tải thông tin phim');
        showToast('Không tìm thấy nguồn phim nào khác.', 'error');
        setDetail(null);
        return;
      }
      setDetail(data);
      const deduped = deduplicateAndLimitServers(data.episodes ?? []);
      if (deduped.length > 0) {
        const bestIdx = pickBestServerIndex(deduped);
        const origIdx = (data.episodes ?? []).findIndex((ep) => ep === deduped[bestIdx]);
        setActiveServer(origIdx >= 0 ? origIdx : bestIdx);
      } else {
        setActiveServer(-1);
      }
      showToast('Đã tìm thấy nguồn phim mới!', 'success');
    } catch {
      setError('Không thể tải thông tin phim');
      showToast('Không tìm thấy nguồn phim nào khác.', 'error');
    } finally {
      setLoading(false);
    }
  }, [slug, showToast]);

  const handleFavToggle = useCallback(() => {
    if (!detail?.movie) return;
    const added = toggle(detail.movie as unknown as MovieItem);
    showToast(added ? 'Đã thêm vào Yêu Thích!' : 'Đã xóa khỏi Yêu Thích', added ? 'success' : 'info');
  }, [detail, toggle, showToast]);

  /* ── Loading ── */
  if (loading) return (
    <div className="min-h-screen kp-cinema-page text-white" data-player-fix="blvietsub-embed-autoplay-20260704">
      <SEO title="Đang tải phim..." description="Xem phim online HD miễn phí tại KhoPhim." noIndex={true} />
      <Navbar />
      <main className="max-w-[1760px] mx-auto px-3 sm:px-4 pt-24 pb-10">
        <div className="flex flex-row gap-3 sm:gap-8 mb-8">
          <div className="flex-shrink-0 w-24 sm:w-40 md:w-52 skeleton rounded-xl" style={{ aspectRatio: '2/3' }} />
          <div className="flex-1 space-y-3 pt-2">
            <div className="h-7 skeleton rounded-lg w-3/4" />
            <div className="h-4 skeleton rounded w-1/2" />
            <div className="flex gap-2">
              {[40, 56, 44].map((w, i) => <div key={i} className="h-6 skeleton rounded-md" style={{ width: w }} />)}
            </div>
            <div className="space-y-2">
              <div className="h-3 skeleton rounded w-full" />
              <div className="h-3 skeleton rounded w-5/6" />
            </div>
          </div>
        </div>
        <div className="aspect-video w-full skeleton rounded-xl" />
      </main>
    </div>
  );

  if (error || !detail || !displayMovie) return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO title="Không tìm thấy phim – KhoPhim" description="Phim không tồn tại hoặc đã bị xóa." noIndex={true} />
      <Navbar />
      <main className="flex flex-col items-center justify-center min-h-[70vh] gap-4 px-4">
        <i className="ri-error-warning-line text-5xl text-white/20" />
        <h1 className="text-xl font-bold text-white">Không tìm thấy phim</h1>
        <p className="text-white/40 text-center max-w-md">{error ?? 'Không tìm thấy phim'}</p>
        <p className="text-white/20 text-xs font-mono">slug: {slug ?? '—'}</p>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={handleRefetchMovie}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line" /> Thử tải lại
          </button>
          <Link to="/" className="text-red-400 hover:text-red-300 text-sm">← Về trang chủ</Link>
        </div>
      </main>
    </div>
  );

  const movie = displayMovie;
  const favored = isFav(movie._id);

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <Navbar />

      <main id="main-content">

      {/* Hero section */}
      <MovieDetailHero
        movie={movie}
        slug={slug ?? ''}
        favored={favored}
        isTrailerOnly={isTrailerOnly}
        hasEpisodes={hasEpisodes}
        onFavToggle={handleFavToggle}
        onWatchNow={() => {
          if (!hasEpisodes && !isTrailerOnly) {
            showToast('Phim đang cập nhật, chưa có tập phim', 'info');
            return;
          }
          if (isTrailerOnly) {
            playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          const latestEpSlug = getLatestPlayableEpisodeSlug(filteredEpisodes);
          const best = pickBestEpisodeByPriority(filteredEpisodes, latestEpSlug);
          if (best) {
            handleSwitchServer(best.serverIndex);
            handleSelectEp(best.episode);
          }
          playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      {/* Player section */}
      <MovieDetailPlayerSection
        ref={playerRef}
        movie={movie}
        episodes={filteredEpisodes}
        isTrailerOnly={isTrailerOnly}
        trailerEmbedUrl={trailerEmbedUrl}
        onSelectEp={handleSelectEp}
        onTimeUpdate={handleTimeUpdate}
        resumeInfo={resumeInfo}
        showResumeBanner={showResumeBanner}
        onResume={handleResume}
        onRestart={handleRestart}
        activeEp={activeEp}
        activeServer={activeFilteredIndex}
        onSwitchServer={handleSwitchServer}
        onRefetchMovie={handleRefetchMovie}
        initialSeekTime={initialSeekTime}
        onVideoEnded={() => { if (slug && activeEp) clearProgress(slug, activeEp.slug); }}
        slug={slug ?? ''}
        cinemaMode={cinemaMode}
        setCinemaMode={setCinemaMode}
      />

      {/* Bottom sections — deferred + lazy loaded */}
      <div className="max-w-[1760px] mx-auto px-3 sm:px-4 pb-12">
        {showBottom ? (
          <>
            {related.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-red-500 rounded-full" />
                  <h2 className="text-white font-bold text-sm sm:text-base">Phim Liên Quan</h2>
                  {movie.category?.[0] && (
                    <Link to={`/the-loai/${movie.category[0].slug}`} className="text-red-400 text-xs hover:underline ml-auto whitespace-nowrap">
                      Xem thêm
                    </Link>
                  )}
                </div>
                <div className="grid movie-grid-desktop">
                  {related.map((m) => <MovieCard key={m._id} movie={m} />)}
                </div>
              </div>
            )}

            <Suspense fallback={<div className="h-40 skeleton rounded-xl" />}>
              <UserComments slug={slug ?? ''} movieName={movie.name} />
            </Suspense>

            <Suspense fallback={<div className="h-40 skeleton rounded-xl" />}>
              <MovieReviewSection
                slug={slug ?? ''}
                movieName={movie.name}
                originName={movie.origin_name}
                year={movie.year}
                genres={movie.category?.map((c) => c.name)}
                posterUrl={getPosterUrl(movie.poster_url || movie.thumb_url)}
              />
            </Suspense>

            <Suspense fallback={<div className="h-60 skeleton rounded-xl" />}>
              <MovieDetailSEOBlock movie={movie} slug={slug ?? ''} />
            </Suspense>
          </>
        ) : (
          <div ref={bottomRef} className="space-y-4">
            <div className="h-6 skeleton rounded w-32" />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton rounded-xl" style={{ aspectRatio: '2/3' }} />
              ))}
            </div>
          </div>
        )}
      </div>

      </main>

      <Footer />
    </div>
  );
}
