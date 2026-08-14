import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { useParams, Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import { useToast } from '@/components/base/Toast';
import { persistWatchHistoryProgress, useWatchHistory } from '@/hooks/useWatchHistory';
import { useResumeWatch } from '@/hooks/useResumeWatch';
import { useFavorites } from '@/hooks/useFavorites';
import MovieDetailHero from './components/MovieDetailHero';
import AdsterraResponsiveBanner from '@/components/feature/AdsterraResponsiveBanner';
import AdsterraRectangleBanner from '@/components/feature/AdsterraRectangleBanner';
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
import {
  isRecentlyBadSourceHost,
  SOURCE_HEALTH_UPDATED_EVENT,
  warmPlayerSourceHealth,
} from '@/services/playerSourceHealth';

const UserComments = lazy(() => import('./components/UserComments'));
const MovieReviewSection = lazy(() => import('@/components/feature/MovieReview'));
const MovieDetailSEOBlock = lazy(() => import('./components/MovieDetailSEOBlock'));
const MovieDetailPlayerSection = lazy(() => import('./components/MovieDetailPlayerSection'));

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
  const dm = /^https?:\/\/(?:www\.)?dailymotion\.com\/(?:embed\/)?video\/([a-zA-Z0-9]+)/i.exec(url);
  if (dm) return `https://geo.dailymotion.com/player.html?video=${dm[1]}`;
  const shortDm = /^https?:\/\/dai\.ly\/([a-zA-Z0-9]+)/i.exec(url);
  if (shortDm) return `https://geo.dailymotion.com/player.html?video=${shortDm[1]}`;
  if (url.includes('dailymotion.com/player')) return url;
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
      if (String(ep.audio_type || '').toLowerCase() === 'raw' || /\braw\b/i.test(String(ep.name || ''))) return max;
      const episodeNumber = getEpisodeNumber(ep);
      return Number.isFinite(episodeNumber) && episodeNumber > 0 ? Math.max(max, episodeNumber) : max;
    }, 0);
    return Math.max(highest, serverHighest);
  }, 0);
}

function isPreviewOnlyDetail(detail: MovieDetailResponse): boolean {
  const movie = detail.movie as MovieDetailResponse['movie'] & {
    status?: string;
    seo_catalog_status?: string;
    current_episode?: number | string;
    trailer_url?: string;
  };
  const status = String(movie.status || '').trim().toLowerCase();
  const seoStatus = String(movie.seo_catalog_status || '').trim().toLowerCase();
  const episodeCurrent = String(movie.episode_current || '').trim().toLowerCase();
  if (
    ['upcoming', 'trailer'].includes(status) ||
    ['upcoming', 'trailer'].includes(seoStatus) ||
    /(trailer|sắp chiếu|sap chieu)/i.test(episodeCurrent)
  ) return true;

  return Boolean(String(movie.trailer_url || '').trim()) &&
    Number(movie.current_episode || 0) <= 0 &&
    !/\d/.test(episodeCurrent) &&
    !['completed', 'ongoing', 'released'].includes(status);
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

function isClearlyEpisodicMovie(movie: MovieDetailResponse['movie']): boolean {
  const typedMovie = movie as MovieDetailResponse['movie'] & {
    total_episodes?: number | string;
    tmdb_media_type?: string;
  };
  const kind = `${typedMovie.type || ''} ${typedMovie.tmdb_media_type || ''}`.toLowerCase();
  const advertisedTotal = Math.max(
    Number(typedMovie.total_episodes || 0) || 0,
    Number(String(typedMovie.episode_total || '').match(/\d+/)?.[0] || 0),
  );
  return advertisedTotal > 1 && /phim-bo|series|tv/.test(kind);
}

function hasOnlyFullPlaceholderEpisodes(detail: MovieDetailResponse): boolean {
  if (!isClearlyEpisodicMovie(detail.movie)) return false;
  const playable = (detail.episodes ?? [])
    .flatMap((server) => server.server_data ?? [])
    .filter((episode) => hasPlayableUrl(episode) && !episode.is_scheduled);
  return playable.length > 0 && playable.every((episode) => {
    const label = `${episode.slug || ''} ${episode.name || ''}`.trim().toLowerCase();
    return /\bfull\b/.test(label);
  });
}

function shouldRefreshEpisodeDetail(detail: MovieDetailResponse): boolean {
  if (hasOnlyFullPlaceholderEpisodes(detail)) return true;
  const displayedCurrent = getAdvertisedCurrentEpisode(detail);
  if (displayedCurrent < 2) return false;
  const playableCurrent = getHighestEpisodeFromServers(deduplicateAndLimitServers(detail.episodes ?? []));
  return playableCurrent < displayedCurrent;
}

function getLatestPlayableEpisodeSlug(episodes: EpisodeServer[]): string | undefined {
  const playable = episodes
    .flatMap((server) => server.server_data ?? [])
    .filter((ep) => hasPlayableUrl(ep) && !ep.is_scheduled);
  const translated = playable.filter((ep) =>
    String(ep.audio_type || '').toLowerCase() !== 'raw' && !/\braw\b/i.test(String(ep.name || ''))
  );
  const latest = [...(translated.length > 0 ? translated : playable)]
    .sort((a, b) => epSortKey(b) - epSortKey(a))[0];
  return latest?.slug || latest?.name;
}

function normalizeRequestedEpisode(routeEpisode?: string): string {
  if (!routeEpisode) return '';
  try {
    return decodeURIComponent(routeEpisode).trim().toLowerCase();
  } catch {
    return String(routeEpisode).trim().toLowerCase();
  }
}

function warmSourceHealthWithinStartupBudget(): Promise<void> {
  const health = warmPlayerSourceHealth();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 900);
    health.finally(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

function getLatestPlayableEpisode(episodes: EpisodeData[]): EpisodeData | null {
  return [...episodes]
    .filter((ep) => hasPlayableUrl(ep) && !ep.is_scheduled)
    .sort((a, b) => epSortKey(b) - epSortKey(a))[0] ?? null;
}

export default function MovieDetailPage() {
  const { slug, episode: routeEpisode } = useParams<{ slug: string; episode?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isWatchPage = location.pathname.startsWith('/xem-phim/');
  const { showToast } = useToast();
  const { addEntry } = useWatchHistory();
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
  const [sourceHealthVersion, setSourceHealthVersion] = useState(0);

  const playerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const saveProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<{ time: number; duration: number } | null>(null);
  const playbackTimeRef = useRef(0);
  const lastProgressSavedAtRef = useRef(0);
  const activeEpRef = useRef<string | null>(null);
  const relatedFetchedRef = useRef(false);
  const resumeCheckedKeyRef = useRef('');

  // Warm the shared viewer-health map as soon as the watch route opens. The
  // former app-level idle task ran only on a hard refresh and could start 15s
  // after playback, so SPA navigation routinely selected a globally bad host.
  useEffect(() => {
    if (!isWatchPage) return;
    const handleHealthUpdate = () => setSourceHealthVersion((version) => version + 1);
    const refreshHealth = () => {
      if (document.visibilityState === 'visible') void warmPlayerSourceHealth();
    };
    window.addEventListener(SOURCE_HEALTH_UPDATED_EVENT, handleHealthUpdate);
    document.addEventListener('visibilitychange', refreshHealth);
    refreshHealth();
    const refreshTimer = window.setInterval(refreshHealth, 5 * 60 * 1000);
    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', refreshHealth);
      window.removeEventListener(SOURCE_HEALTH_UPDATED_EVENT, handleHealthUpdate);
    };
  }, [isWatchPage, slug]);

  // Preserve old shared/resume links that used /phim/:slug?tap=:episode.
  useEffect(() => {
    if (isWatchPage || !slug) return;
    const legacyEpisode = searchParams.get('tap');
    if (!legacyEpisode) return;
    navigate(`/xem-phim/${slug}/${encodeURIComponent(legacyEpisode)}`, { replace: true });
  }, [isWatchPage, navigate, searchParams, slug]);

  useEffect(() => {
    activeEpRef.current = activeEp?.slug ?? null;
  }, [activeEp?.slug]);

  // Automatic route selection must restore progress too. Previously resume
  // was evaluated only when a visitor clicked an episode button, so reopening
  // a saved /xem-phim/:slug/:episode URL silently lost the resume prompt.
  useEffect(() => {
    if (!isWatchPage || !slug || !activeEp?.slug) return;
    const resumeKey = `${slug}__${activeEp.slug}`;
    if (resumeCheckedKeyRef.current === resumeKey) return;
    resumeCheckedKeyRef.current = resumeKey;
    const info = getResume(slug, activeEp.slug);
    setResumeInfo(info);
    setShowResumeBanner(info.shouldResume);
  }, [activeEp?.slug, getResume, isWatchPage, slug]);

  /* IntersectionObserver to defer bottom sections until user scrolls near */
  useEffect(() => {
    if (isWatchPage || !detail || showBottom) return;
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
  }, [detail, isWatchPage, showBottom]);

  /* ── Fetch movie detail ── */
  useEffect(() => {
    if (!slug) return;
    const isFresh = searchParams.has('fresh');
    const source = searchParams.get('source') || undefined;
    let cancelled = false;
    let autoRecoverySucceeded = false;
    const recoveryTimers: number[] = [];
    if (isFresh) {
      setSearchParams({}, { replace: true });
    }
    setLoading(true);
    setError(null);
    setActiveServer(0);
    setActiveEp(null);
    setShowBottom(false);
    resumeCheckedKeyRef.current = '';
    relatedFetchedRef.current = false;
    setRelated([]);
    window.scrollTo({ top: 0, behavior: 'auto' });

    // Start detail and global source-health requests together. On a watch URL,
    // spend at most 900ms waiting for known provider outages before selecting
    // the first source; a slow health endpoint can never block the page longer.
    const detailRequest = fetchMovieDetail(slug, isFresh, source);
    const initialSourceHealth = isWatchPage
      ? warmSourceHealthWithinStartupBudget()
      : Promise.resolve();

    Promise.all([detailRequest, initialSourceHealth])
      .then(([data]) => {
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

          // Opening a released title with zero sources starts a bounded repair
          // in the detail proxy. Give that background health/provider repair
          // two chances to finish, then update the player without requiring
          // the viewer to reload. Preview-only pages never enter this loop.
          if (!isPreviewOnlyDetail(data)) {
            for (const delay of [4000, 12000]) {
              recoveryTimers.push(window.setTimeout(() => {
                if (
                  cancelled ||
                  autoRecoverySucceeded ||
                  navigator.onLine === false ||
                  document.visibilityState !== 'visible'
                ) return;
                void fetchMovieDetail(slug, true, source)
                  .then((recovered) => {
                    if (cancelled || autoRecoverySucceeded || !recovered) return;
                    const recoveredServers = deduplicateAndLimitServers(recovered.episodes ?? []);
                    if (recoveredServers.length === 0) return;
                    autoRecoverySucceeded = true;
                    setDetail(recovered);
                    const bestIdx = pickBestServerIndex(recoveredServers);
                    const originalIdx = (recovered.episodes ?? []).findIndex(
                      (server) => server === recoveredServers[bestIdx],
                    );
                    setActiveServer(originalIdx >= 0 ? originalIdx : bestIdx);
                  })
                  .catch(() => {});
              }, delay));
            }
          }
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
      recoveryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [slug]);

  // Related content is non-critical. Fetch it only after the visitor approaches
  // the lower page sections, so the player never competes with source APIs.
  useEffect(() => {
    if (isWatchPage || !showBottom || !detail?.movie || !slug || relatedFetchedRef.current) return;
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
  }, [detail?.movie, isWatchPage, showBottom, slug]);

  /* ── ESC to exit cinema mode ── */
  useEffect(() => {
    if (!cinemaMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCinemaMode(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cinemaMode]);

  const filteredEpisodes = useMemo(() => {
    // Keep the complete playable catalogue visible. Cross-viewer health is a
    // ranking/failover signal, not permission to erase a requested episode.
    // Otherwise a few bad hosts from one provider can leave a series showing
    // only unrelated episode numbers from another provider.
    return deduplicateAndLimitServers(detail?.episodes ?? []);
  }, [detail?.episodes]);

  const displayMovie = useMemo(() => {
    if (!detail?.movie) return null;
    const hasPlayableFullMovie = filteredEpisodes.some((server) =>
      (server.server_data ?? []).some((episode) => {
        if (!hasPlayableUrl(episode) || episode.is_scheduled) return false;
        const label = `${episode.slug || ''} ${episode.name || ''}`.trim().toLowerCase();
        return /\bfull\b/.test(label) && !label.includes('trailer');
      })
    );
    if (
      hasPlayableFullMovie &&
      !isClearlyEpisodicMovie(detail.movie) &&
      String(detail.movie.episode_current || '').trim().toLowerCase() !== 'full'
    ) {
      return {
        ...detail.movie,
        current_episode: 1,
        total_episodes: Math.max(Number(detail.movie.total_episodes || 0), 1),
        episode_current: 'Full',
        episode_total: '1',
      };
    }
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

  const detailEpisodeLinks = useMemo(() => {
    const byKey = new Map<string, EpisodeData>();
    filteredEpisodes.forEach((server) => {
      (server.server_data ?? []).forEach((episode) => {
        if (!hasPlayableUrl(episode) || episode.is_scheduled) return;
        const sortKey = epSortKey(episode);
        const key = Number.isFinite(sortKey)
          ? String(sortKey)
          : `special:${episode.slug || episode.name}`;
        if (!byKey.has(key)) byKey.set(key, episode);
      });
    });
    return Array.from(byKey.values()).sort((a, b) => epSortKey(a) - epSortKey(b));
  }, [filteredEpisodes]);

  useEffect(() => {
    if (!isWatchPage || !hasEpisodes) return;
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
  }, [filteredEpisodes, hasEpisodes, isWatchPage]);

  const activeFilteredIndex = useMemo(() => {
    if (!detail?.episodes || activeServer < 0) return -1;
    return filteredEpisodes.findIndex((fe) => resolveOriginalServerIndex(fe, detail.episodes) === activeServer);
  }, [detail?.episodes, activeServer, filteredEpisodes]);

  const isTrailerOnly = useMemo(() => {
    if (!detail?.movie) return false;
    const epCurrent = (detail.movie.episode_current ?? '').toLowerCase().trim();
    const allEps = detail.episodes?.flatMap((s) => s.server_data ?? []) ?? [];
    const playableEpisodes = allEps.filter((episode) =>
      !episode.is_scheduled && hasPlayableUrl(episode)
    );
    if (playableEpisodes.length > 0) {
      return playableEpisodes.every((episode) =>
        String(episode.name || episode.slug || '').toLowerCase().includes('trailer')
      );
    }
    return epCurrent === 'trailer' || epCurrent === 'sap chieu' || epCurrent === 'dang cap nhat';
  }, [detail]);

  const requestedEpisode = useMemo(
    () => normalizeRequestedEpisode(routeEpisode),
    [routeEpisode],
  );

  // Some old TMDB TV rows were incorrectly stored as a single `full` movie.
  // Once verified numbered episodes are available, keep legacy links working
  // by canonically moving `/full` to episode 1 instead of replaying the stale
  // placeholder stream.
  useEffect(() => {
    if (!isWatchPage || requestedEpisode !== 'full' || !slug || !detail?.movie) return;
    if (!isClearlyEpisodicMovie(detail.movie)) return;
    const numberedEpisodes = detailEpisodeLinks.filter((episode) => getEpisodeNumber(episode) > 0);
    if (numberedEpisodes.length < 2) return;
    const firstEpisode = numberedEpisodes[0];
    const episodePath = encodeURIComponent(firstEpisode.slug || firstEpisode.name || 'tap-1');
    navigate(`/xem-phim/${slug}/${episodePath}`, { replace: true });
  }, [detail?.movie, detailEpisodeLinks, isWatchPage, navigate, requestedEpisode, slug]);
  const requestedEpisodeUnavailable = useMemo(
    () => Boolean(
      isWatchPage &&
      requestedEpisode &&
      detail &&
      !isTrailerOnly &&
      !pickBestEpisodeByPriority(filteredEpisodes, requestedEpisode)
    ),
    [detail, filteredEpisodes, isTrailerOnly, isWatchPage, requestedEpisode],
  );

  useEffect(() => {
    if (!isWatchPage || !hasEpisodes || isTrailerOnly || !detail?.episodes) return;
    const requestedEpisodeNumber = Number(requestedEpisode.match(/\d+/)?.[0] ?? 0);
    const matchesRequestedEpisode = (episode: EpisodeData) =>
      [episode.slug, episode.name].filter(Boolean).some((value) => String(value).toLowerCase() === requestedEpisode) ||
      (requestedEpisodeNumber > 0 && epSortKey(episode) === requestedEpisodeNumber);
    const activeMatchesRequest = Boolean(activeEp && requestedEpisode &&
      matchesRequestedEpisode(activeEp));
    const requested = requestedEpisode
      ? pickBestEpisodeByPriority(filteredEpisodes, requestedEpisode)
      : null;
    if (activeEp && (!requestedEpisode || (activeMatchesRequest && requested))) return;
    // A watch URL is an exact contract. If /25 has no playable source, never
    // hide that failure by silently starting another episode such as /14.
    if (requestedEpisode && !requested) {
      if (activeEp) {
        playbackTimeRef.current = 0;
        setActiveEp(null);
        setInitialSeekTime(0);
      }
      return;
    }
    const latestEpSlug = getLatestPlayableEpisodeSlug(filteredEpisodes);
    const best = requested ?? pickBestEpisodeByPriority(filteredEpisodes, latestEpSlug);
    if (!best) return;
    const originalIdx = resolveOriginalServerIndex(filteredEpisodes[best.serverIndex], detail.episodes);
    playbackTimeRef.current = 0;
    setActiveServer(originalIdx >= 0 ? originalIdx : best.serverIndex);
    setActiveEp(best.episode);
    setInitialSeekTime(0);
  }, [activeEp, detail?.episodes, filteredEpisodes, hasEpisodes, isTrailerOnly, isWatchPage, requestedEpisode]);

  const trailerEmbedUrl = useMemo(
    () => (detail?.movie?.trailer_url ? getTrailerEmbedUrl(detail.movie.trailer_url) : null),
    [detail?.movie?.trailer_url]
  );

  const flushProgress = useCallback(() => {
    const pending = pendingProgressRef.current;
    const epSlug = activeEpRef.current;
    if (!pending || !slug || !epSlug) return;
    saveProgress(slug, epSlug, pending.time, pending.duration);
    if (detail?.movie) {
      persistWatchHistoryProgress(
        detail.movie._id,
        detail.movie.slug || slug,
        pending.time,
        pending.duration,
      );
    }
    pendingProgressRef.current = null;
    lastProgressSavedAtRef.current = Date.now();
    if (saveProgressTimer.current) {
      clearTimeout(saveProgressTimer.current);
      saveProgressTimer.current = null;
    }
  }, [detail?.movie, saveProgress, slug]);

  // Source health arrives shortly after the route data. Before playback has
  // actually started, replace a proven-bad primary URL with an independent
  // same-episode source. Do not interrupt a viewer whose video is playing.
  useEffect(() => {
    if (!isWatchPage || sourceHealthVersion === 0 || !activeEp || !detail?.episodes) return;
    const currentUrl = getPlayableSourceUrl(activeEp);
    if (!currentUrl || !isRecentlyBadSourceHost(currentUrl)) return;
    const currentPlaybackTime = Math.max(
      playbackTimeRef.current,
      pendingProgressRef.current?.time ?? 0,
    );
    // Health arrives asynchronously after SPA navigation. Permit one early
    // same-episode handoff before the viewer has meaningfully started
    // watching, so a confirmed provider outage cannot keep the initial
    // selection on a dead CDN shard. Preserve the live seek position.
    if (currentPlaybackTime >= 8) return;
    const allAlternativeServers = filteredEpisodes
      .map((server) => ({
        ...server,
        server_data: (server.server_data ?? []).filter(
          (candidate) => getPlayableSourceUrl(candidate) !== currentUrl,
        ),
      }))
      .filter((server) => server.server_data.length > 0);
    // Prefer an independent server that is not currently in the global
    // outage set. Keep the full list as a last resort: a title may only have
    // mirrors on the same provider and must remain playable when one recovers.
    const healthyAlternativeServers = allAlternativeServers
      .map((server) => ({
        ...server,
        server_data: (server.server_data ?? []).filter(
          (candidate) => !isRecentlyBadSourceHost(getPlayableSourceUrl(candidate)),
        ),
      }))
      .filter((server) => server.server_data.length > 0);
    const alternativeServers = healthyAlternativeServers.length > 0
      ? healthyAlternativeServers
      : allAlternativeServers;
    const best = pickBestEpisodeByPriority(alternativeServers, activeEp.slug || activeEp.name);
    if (!best) return;
    const resumeAt = Math.max(
      playbackTimeRef.current,
      pendingProgressRef.current?.time ?? 0,
    );
    flushProgress();
    const originalIdx = resolveOriginalServerIndex(alternativeServers[best.serverIndex], detail.episodes);
    setActiveServer(originalIdx >= 0 ? originalIdx : best.serverIndex);
    setActiveEp(best.episode);
    setInitialSeekTime(resumeAt);
  }, [activeEp, detail?.episodes, filteredEpisodes, flushProgress, isWatchPage, sourceHealthVersion]);

  const handleSelectEp = useCallback((ep: EpisodeData, seekTime = 0) => {
    if (!hasPlayableUrl(ep)) {
      showToast('Tập này chưa có liên kết phát. Vui lòng thử tập khác.', 'error');
      return;
    }
    flushProgress();
    playbackTimeRef.current = Math.max(0, seekTime);
    setActiveEp(ep);
    setInitialSeekTime(seekTime);
    setShowResumeBanner(false);
    if (detail?.movie) addEntry(detail.movie as unknown as MovieItem, ep.slug, ep.name);
    if (slug && seekTime === 0) {
      const info = getResume(slug, ep.slug);
      setResumeInfo(info);
      setShowResumeBanner(info.shouldResume);
    }
    if (isWatchPage && slug) {
      const episodePath = encodeURIComponent(ep.slug || ep.name || 'tap-1');
      navigate(`/xem-phim/${slug}/${episodePath}`, { replace: true });
    }
    setTimeout(() => playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [detail, slug, addEntry, flushProgress, getResume, isWatchPage, navigate, showToast]);

  const handleSwitchServer = useCallback((filteredIdx: number) => {
    const targetServer = filteredEpisodes[filteredIdx];
    if (!targetServer || !detail?.episodes) return;
    const originalIdx = resolveOriginalServerIndex(targetServer, detail.episodes);
    if (originalIdx < 0) return;
    const newServerData = detail.episodes[originalIdx]?.server_data ?? [];
    if (activeEp) {
      const activeNumber = activeEp.episode_number ?? Number((activeEp.slug || activeEp.name || '').match(/\d+/)?.[0] ?? 0);
      const activeKey = activeNumber > 0 ? `num:${activeNumber}` : `text:${activeEp.slug || activeEp.name}`;
      const newEp = newServerData.find((ep) => {
        const epNumber = ep.episode_number ?? Number((ep.slug || ep.name || '').match(/\d+/)?.[0] ?? 0);
        const epKey = epNumber > 0 ? `num:${epNumber}` : `text:${ep.slug || ep.name}`;
        return epKey === activeKey && hasPlayableUrl(ep);
      });
      if (!newEp) {
        showToast(`Nguồn này không có ${activeEp.name || 'tập đang xem'}. Vui lòng chọn nguồn khác.`, 'info');
        return;
      }
      const resumeAt = Math.max(
        playbackTimeRef.current,
        pendingProgressRef.current?.time ?? 0,
      );
      flushProgress();
      setActiveServer(originalIdx);
      setActiveEp(newEp);
      setInitialSeekTime(resumeAt);
      return;
    }
    setActiveServer(originalIdx);
  }, [filteredEpisodes, detail?.episodes, activeEp, flushProgress, showToast]);

  const handleTimeUpdate = useCallback((time: number, duration: number) => {
    if (!slug || !activeEpRef.current) return;
    if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return;
    playbackTimeRef.current = Math.max(0, time);
    pendingProgressRef.current = { time, duration };
    const elapsed = Date.now() - lastProgressSavedAtRef.current;
    if (elapsed >= 5000) {
      flushProgress();
      return;
    }
    if (!saveProgressTimer.current) {
      saveProgressTimer.current = setTimeout(flushProgress, Math.max(250, 5000 - elapsed));
    }
  }, [flushProgress, slug]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushProgress();
    };
    const flushBeforePageLeaves = () => flushProgress();
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushBeforePageLeaves);
    window.addEventListener('kp:before-release-reload', flushBeforePageLeaves);
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushBeforePageLeaves);
      window.removeEventListener('kp:before-release-reload', flushBeforePageLeaves);
      flushProgress();
      if (saveProgressTimer.current) clearTimeout(saveProgressTimer.current);
    };
  }, [flushProgress]);

  const handleResume = useCallback(() => {
    if (!resumeInfo) return;
    playbackTimeRef.current = Math.max(0, resumeInfo.time);
    setInitialSeekTime(resumeInfo.time);
    setShowResumeBanner(false);
  }, [resumeInfo]);

  const handleRestart = useCallback(() => {
    if (slug && activeEp) clearProgress(slug, activeEp.slug);
    playbackTimeRef.current = 0;
    setInitialSeekTime(0);
    setShowResumeBanner(false);
  }, [slug, activeEp, clearProgress]);

  const handleRefetchMovie = useCallback(async () => {
    if (!slug) return;
    const targetEpisode = activeEpRef.current || requestedEpisode;
    const resumeAt = Math.max(
      playbackTimeRef.current,
      pendingProgressRef.current?.time ?? 0,
    );
    flushProgress();
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
      let recoveredSource = false;
      if (deduped.length > 0) {
        const recovered = targetEpisode
          ? pickBestEpisodeByPriority(deduped, targetEpisode)
          : null;
        if (recovered) {
          recoveredSource = true;
          const originalIdx = resolveOriginalServerIndex(deduped[recovered.serverIndex], data.episodes ?? []);
          playbackTimeRef.current = resumeAt;
          setActiveServer(originalIdx >= 0 ? originalIdx : recovered.serverIndex);
          setActiveEp(recovered.episode);
          setInitialSeekTime(resumeAt);
        } else {
          const bestIdx = pickBestServerIndex(deduped);
          const origIdx = (data.episodes ?? []).findIndex((ep) => ep === deduped[bestIdx]);
          playbackTimeRef.current = 0;
          setActiveServer(origIdx >= 0 ? origIdx : bestIdx);
          setInitialSeekTime(0);
        }
      } else {
        setActiveServer(-1);
      }
      showToast(
        recoveredSource ? 'Đã tìm thấy nguồn phim mới!' : 'Tập này vẫn chưa có nguồn phát hoạt động.',
        recoveredSource ? 'success' : 'error',
      );
    } catch {
      setError('Không thể tải thông tin phim');
      showToast('Không tìm thấy nguồn phim nào khác.', 'error');
    } finally {
      setLoading(false);
    }
  }, [flushProgress, requestedEpisode, showToast, slug]);

  const handleFavToggle = useCallback(() => {
    if (!detail?.movie) return;
    const added = toggle(detail.movie as unknown as MovieItem);
    showToast(added ? 'Đã thêm vào Yêu Thích!' : 'Đã xóa khỏi Yêu Thích', added ? 'success' : 'info');
  }, [detail, toggle, showToast]);

  /* ── Loading ── */
  if (loading) return (
    <div className="angular-detail-page min-h-screen kp-cinema-page text-white" data-player-fix="blvietsub-embed-autoplay-20260704">
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
    <div className="angular-detail-page min-h-screen kp-cinema-page text-white">
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
    <div className={`angular-detail-page ${isWatchPage ? 'is-watch-mode' : 'is-info-mode'} min-h-screen kp-cinema-page text-white`}>
      <Navbar />

      <main id="main-content">

      {isWatchPage && (
        <SEO
          title={`Xem ${movie.name}${activeEp?.name ? ` - ${activeEp.name}` : ''}`}
          description={`Xem ${movie.name} ${activeEp?.name || ''} tại KhoPhim. Chọn tập và nguồn phát phù hợp.`}
          canonical={`/phim/${slug ?? ''}`}
          ogImage={getPosterUrl(movie.poster_url || movie.thumb_url)}
          ogType="video.movie"
          noIndex={true}
          updatedAt={movie.modified?.time}
        />
      )}

      {/* Hero section */}
      {!isWatchPage && (
        <>
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
              const latestEpSlug = getLatestPlayableEpisodeSlug(filteredEpisodes);
              const best = pickBestEpisodeByPriority(filteredEpisodes, latestEpSlug);
              const selected = best?.episode;
              const episodePath = selected ? `/${encodeURIComponent(selected.slug || selected.name || 'tap-1')}` : '';
              navigate(`/xem-phim/${slug ?? ''}${episodePath}`);
            }}
          />
          <div className="cinema-page-container">
            <AdsterraResponsiveBanner />
          </div>
        </>
      )}

      {!isWatchPage && detailEpisodeLinks.length > 0 && (
        <section className="mx-auto mb-8 max-w-[1760px] px-3 sm:px-4" aria-labelledby="detail-episodes-title">
          <div className="detail-episode-panel rounded-2xl sm:rounded-[26px] border border-white/[0.08] p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 id="detail-episodes-title" className="font-black text-white sm:text-lg">Danh sách tập</h2>
                <p className="mt-0.5 text-xs text-white/60">{detailEpisodeLinks.length} tập · mở trong chế độ xem tập trung</p>
              </div>
              <Link to={`/xem-phim/${slug ?? ''}`} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-red-500 px-3 text-xs font-bold text-white touch-manipulation">
                <i className="ri-play-fill" /> Xem phim
              </Link>
            </div>
            <div className="detail-episode-grid">
              {detailEpisodeLinks.map((episode) => (
                <Link
                  key={`${episode.slug}-${episode.name}`}
                  to={`/xem-phim/${slug ?? ''}/${encodeURIComponent(episode.slug || episode.name || 'tap-1')}`}
                  className="detail-episode-button flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-2 text-xs font-bold text-white/80 transition-colors hover:border-red-500/50 hover:bg-red-500/15 hover:text-white touch-manipulation"
                >
                  {episode.name || episode.slug}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {isWatchPage && (
        <div className="cinema-page-container pt-20 sm:pt-24">
          <div className="movie-watch-topbar mb-3 flex items-center justify-between gap-3 px-3 py-2 sm:px-5 sm:py-3">
            <div className="min-w-0">
              <Link to={`/phim/${slug ?? ''}`} className="inline-flex min-h-11 items-center gap-1 text-xs text-white/55 hover:text-red-300 touch-manipulation">
                <i className="ri-arrow-left-line" /> Thông tin phim
              </Link>
              <h1 className="truncate text-lg font-black text-white sm:text-2xl tracking-[-0.02em]">{movie.name}</h1>
              {activeEp && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/65"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Đang xem {activeEp.name}</p>}
            </div>
            <button
              type="button"
              onClick={handleFavToggle}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border touch-manipulation ${favored ? 'border-red-500/40 bg-red-500/20 text-red-400' : 'border-white/10 bg-white/5 text-white/60'}`}
              aria-label={favored ? 'Xóa khỏi yêu thích' : 'Thêm vào yêu thích'}
            >
              <i className={favored ? 'ri-heart-fill' : 'ri-heart-line'} />
            </button>
          </div>
        </div>
      )}

      {/* Player section */}
      {isWatchPage && <Suspense fallback={<div className="cinema-page-container"><div className="aspect-video w-full skeleton rounded-xl" /></div>}><MovieDetailPlayerSection
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
        requestedEpisodeUnavailable={requestedEpisodeUnavailable}
        activeServer={activeFilteredIndex}
        onSwitchServer={handleSwitchServer}
        onRefetchMovie={handleRefetchMovie}
        initialSeekTime={initialSeekTime}
        onVideoEnded={() => { if (slug && activeEp) clearProgress(slug, activeEp.slug); }}
        slug={slug ?? ''}
        cinemaMode={cinemaMode}
        setCinemaMode={setCinemaMode}
      /></Suspense>}

      {isWatchPage && (
        <div className="cinema-page-container">
          <AdsterraResponsiveBanner deferMs={8_000} />
        </div>
      )}

      {/* Bottom sections — deferred + lazy loaded */}
      {!isWatchPage && <div className="max-w-[1760px] mx-auto px-3 sm:px-4 pb-12">
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

            <AdsterraRectangleBanner />

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
      </div>}

      </main>

      <Footer />
    </div>
  );
}
