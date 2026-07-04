import { useState, useRef, useCallback, useMemo, forwardRef, useEffect } from 'react';
import type { EpisodeData, EpisodeServer, MovieDetail } from '@/types/movie';
import {
  getAnonymousServerDisplay,
  pickBestEpisodeByPriority,
  detectServerType,
  getServerTypeStyle,
  epSortKey,
  getThumbUrl,
  hasPlayableUrl,
} from '@/services/movieApi';
import { useServerNow } from '@/hooks/useServerNow';
import { getMovieCountdownInfo } from '@/utils/movieSchedule';
import PlayerBox from './PlayerBox';

const EP_GROUP = 100;
const MOBILE_COLLAPSED_EPISODES = 24;

interface MergedEpisode {
  ep: EpisodeData;
  serverIndices: number[];
  key: string;
}

function getEpisodeMergeKey(ep: EpisodeData): string {
  if (ep.is_scheduled) return ep.slug || ep.name || 'scheduled';
  const sortKey = epSortKey(ep);
  if (Number.isFinite(sortKey)) return `tap-${sortKey}`;
  return (ep.slug || ep.name || '').toLowerCase().trim().replace(/^0+/, '').replace(/\s+/g, '-');
}

function getServerIdentityText(srv: EpisodeServer): string {
  const firstEp = srv.server_data?.[0];
  return [
    srv.server_name,
    firstEp?.link_m3u8,
    firstEp?.link_embed,
  ].filter(Boolean).join(' ');
}

function getServerDisplayName(srv: EpisodeServer, idx: number): string {
  const identity = getServerIdentityText(srv).toLowerCase();
  if (identity.includes('khophim') || identity.includes('video.khophim.org')) return 'KhoPhim';
  return getAnonymousServerDisplay(srv.server_name, idx);
}

function getAvailableEpisodeLabel(episodesCount: number, activeEp?: EpisodeData | null): string {
  const activeNumber = activeEp ? epSortKey(activeEp) : 0;
  if (episodesCount === 1 && Number.isFinite(activeNumber) && activeNumber > 1) {
    return '1 tập có sẵn';
  }
  return `${episodesCount} tập`;
}

interface Props {
  movie: MovieDetail;
  episodes: EpisodeServer[];
  isTrailerOnly: boolean;
  trailerEmbedUrl: string | null;
  onSelectEp: (ep: EpisodeData) => void;
  onTimeUpdate?: (time: number, duration: number) => void;
  resumeInfo: { time: number; duration: number; progress: number; shouldResume: boolean } | null;
  showResumeBanner: boolean;
  onResume: () => void;
  onRestart: () => void;
  activeEp: EpisodeData | null;
  activeServer: number;
  onSwitchServer: (idx: number) => void;
  onRefetchMovie?: () => void;
  initialSeekTime: number;
  onVideoEnded?: () => void;
  slug: string;
  cinemaMode: boolean;
  setCinemaMode: (v: boolean) => void;
}

const MovieDetailPlayerSection = forwardRef<HTMLDivElement, Props>(
  (
    {
      movie,
      episodes,
      isTrailerOnly,
      trailerEmbedUrl,
      onSelectEp,
      onTimeUpdate,
      resumeInfo,
      showResumeBanner,
      onResume,
      onRestart,
      activeEp,
      activeServer,
      onSwitchServer,
      onRefetchMovie,
      initialSeekTime,
      onVideoEnded,
      slug,
      cinemaMode,
      setCinemaMode,
    },
    forwardedRef
  ) => {
    const [activeTab, setActiveTab] = useState<'episodes' | 'trailer'>('episodes');
    const [episodesCollapsed, setEpisodesCollapsed] = useState(true);
    const [isDesktopEpisodeLayout, setIsDesktopEpisodeLayout] = useState(false);
    const [serverTypeTab, setServerTypeTab] = useState<'all' | 'khophim' | 'vietsub' | 'thuyetminh' | 'longtieng' | 'other'>('all');
    const hasScheduledState = useMemo(
      () => Boolean(
        movie.next_episode_at ||
        movie.release_at ||
        movie.schedule_type ||
        episodes.some((server) => server.server_data?.some((ep) => ep.is_scheduled))
      ),
      [episodes, movie.next_episode_at, movie.release_at, movie.schedule_type],
    );
    const serverNow = useServerNow(hasScheduledState);
    const scheduledCountdown = useMemo(() => getMovieCountdownInfo(movie, serverNow), [movie, serverNow]);
    const scheduledEpisode = useMemo<MergedEpisode | null>(() => {
      if (!scheduledCountdown || scheduledCountdown.kind !== 'countdown' || !scheduledCountdown.targetAt || !scheduledCountdown.targetEpisodeNumber) {
        return null;
      }
      return {
        ep: {
          name: `Tập ${scheduledCountdown.targetEpisodeNumber}`,
          slug: `scheduled-tap-${scheduledCountdown.targetEpisodeNumber}`,
          filename: '',
          link_embed: '',
          link_m3u8: '',
          is_scheduled: true,
          scheduled_target_at: scheduledCountdown.targetAt,
          scheduled_note: scheduledCountdown.note,
        },
        serverIndices: [],
        key: `scheduled-tap-${scheduledCountdown.targetEpisodeNumber}`,
      };
    }, [scheduledCountdown]);

    const mergedEpisodes = useMemo<MergedEpisode[]>(() => {
      const map = new Map<string, MergedEpisode>();
      episodes.forEach((srv, sidx) => {
        srv.server_data?.forEach((ep) => {
          const key = getEpisodeMergeKey(ep);
          if (!key) return;
          const existing = map.get(key);
          if (existing) {
            if (!existing.serverIndices.includes(sidx)) existing.serverIndices.push(sidx);
          } else {
            map.set(key, { ep, serverIndices: [sidx], key });
          }
        });
      });
      const list = Array.from(map.values());
      if (scheduledEpisode && !map.has(scheduledEpisode.key)) {
        list.push(scheduledEpisode);
      }
      list.sort((a, b) => epSortKey(a.ep) - epSortKey(b.ep));
      return list;
    }, [episodes, scheduledEpisode]);

    const epList = useMemo(() => mergedEpisodes.map((m) => m.ep), [mergedEpisodes]);
    const availableEpisodeLabel = useMemo(
      () => getAvailableEpisodeLabel(mergedEpisodes.length || episodes.length, activeEp),
      [activeEp, episodes.length, mergedEpisodes.length],
    );

    const groups = useMemo(() => {
      const g: MergedEpisode[][] = [];
      for (let i = 0; i < mergedEpisodes.length; i += EP_GROUP) g.push(mergedEpisodes.slice(i, i + EP_GROUP));
      return g;
    }, [mergedEpisodes]);
    const [epGroup, setEpGroup] = useState(0);
    const currentGroup = groups[epGroup] ?? mergedEpisodes;
    const episodeHasSelectedServerType = useCallback((item: MergedEpisode) => {
      if (serverTypeTab === 'all' || item.ep.is_scheduled) return true;
      return item.serverIndices.some((idx) => {
        const srv = episodes[idx];
        return srv && detectServerType(getServerIdentityText(srv)) === serverTypeTab;
      });
    }, [episodes, serverTypeTab]);
    const navigableEpisodes = useMemo(
      () => mergedEpisodes.filter(episodeHasSelectedServerType),
      [mergedEpisodes, episodeHasSelectedServerType]
    );
    const currentTypeGroup = useMemo(
      () => currentGroup.filter(episodeHasSelectedServerType),
      [currentGroup, episodeHasSelectedServerType]
    );
    const collapsedEpisodeLimit = MOBILE_COLLAPSED_EPISODES;
    const shownEpisodes = useMemo(() => {
      if (isDesktopEpisodeLayout) return currentTypeGroup;
      if (!episodesCollapsed) return currentTypeGroup;
      const compact = currentTypeGroup.slice(0, collapsedEpisodeLimit);
      const activeKey = activeEp ? getEpisodeMergeKey(activeEp) : '';
      if (!activeKey || compact.some((item) => item.key === activeKey)) return compact;
      const activeItem = currentTypeGroup.find((item) => item.key === activeKey);
      return activeItem ? [...compact.slice(0, collapsedEpisodeLimit - 1), activeItem] : compact;
    }, [isDesktopEpisodeLayout, episodesCollapsed, currentTypeGroup, activeEp, collapsedEpisodeLimit]);
    const canCollapseEpisodes = !isDesktopEpisodeLayout && currentTypeGroup.length > collapsedEpisodeLimit;
    const visibleServerOptions = useMemo(() => {
      return episodes.map((srv, idx) => ({
        srv,
        idx,
        typeKey: detectServerType(getServerIdentityText(srv)),
      }));
    }, [episodes]);
    const serverTypeCounts = useMemo(() => {
      const counts: Record<'all' | 'khophim' | 'vietsub' | 'thuyetminh' | 'longtieng' | 'other', number> = {
        all: episodes.length,
        khophim: 0,
        vietsub: 0,
        thuyetminh: 0,
        longtieng: 0,
        other: 0,
      };
      visibleServerOptions.forEach(({ typeKey }) => {
        counts[typeKey] += 1;
      });
      return counts;
    }, [episodes.length, visibleServerOptions]);

    /* Auto-switch to episodes tab when user selects an episode while on trailer tab */
    useEffect(() => {
      if (activeEp && activeTab === 'trailer') {
        setActiveTab('episodes');
      }
    }, [activeEp, activeTab]);

    useEffect(() => {
      setEpGroup(0);
    }, [serverTypeTab]);

    useEffect(() => {
      if (serverTypeTab !== 'all' && serverTypeCounts[serverTypeTab] === 0) {
        setServerTypeTab('all');
      }
    }, [serverTypeCounts, serverTypeTab]);

    useEffect(() => {
      if (serverTypeTab === 'all' || activeServer < 0) return;
      const activeVisible = visibleServerOptions.some(({ idx, typeKey }) => idx === activeServer && typeKey === serverTypeTab);
      if (activeVisible) return;
      const activeKey = activeEp ? getEpisodeMergeKey(activeEp) : '';
      const replacement = visibleServerOptions.find(({ srv, typeKey }) => {
        if (typeKey !== serverTypeTab) return false;
        if (!activeKey) return true;
        return srv.server_data?.some((ep) => getEpisodeMergeKey(ep) === activeKey);
      }) ?? visibleServerOptions.find(({ typeKey }) => typeKey === serverTypeTab);
      if (replacement) onSwitchServer(replacement.idx);
    }, [activeEp, activeServer, onSwitchServer, serverTypeTab, visibleServerOptions]);

    useEffect(() => {
      const query = window.matchMedia('(min-width: 1024px)');
      const updateLayout = () => setIsDesktopEpisodeLayout(query.matches);
      updateLayout();
      query.addEventListener('change', updateLayout);
      return () => query.removeEventListener('change', updateLayout);
    }, []);

    useEffect(() => {
      if (!activeEp || groups.length <= 1) return;
      const activeKey = getEpisodeMergeKey(activeEp);
      const activeIndex = mergedEpisodes.findIndex((item) => item.key === activeKey);
      if (activeIndex < 0) return;
      const nextGroup = Math.floor(activeIndex / EP_GROUP);
      setEpGroup((current) => (current === nextGroup ? current : nextGroup));
    }, [activeEp, groups.length, mergedEpisodes]);

    const currentEpIdx = useMemo(() => {
      const activeKey = activeEp ? getEpisodeMergeKey(activeEp) : '';
      return navigableEpisodes.findIndex((item) => item.key === activeKey);
    }, [navigableEpisodes, activeEp]);
    const activeEpisodeKey = activeEp ? getEpisodeMergeKey(activeEp) : '';
    const hasPrev = currentEpIdx > 0;
    const hasNext = currentEpIdx >= 0 && currentEpIdx < navigableEpisodes.length - 1;
    const groupOptions = useMemo(() => groups.map((_, i) => ({
      index: i,
      start: i * EP_GROUP + 1,
      end: Math.min((i + 1) * EP_GROUP, mergedEpisodes.length),
    })), [groups, mergedEpisodes.length]);

    const handleSelectMergedEp = useCallback((item: MergedEpisode) => {
      if (item.ep.is_scheduled) {
        onSelectEp(item.ep);
        return;
      }
      const allAvailableServers = item.serverIndices
        .map((idx) => {
          const srv = episodes[idx];
          const matched = srv?.server_data?.find((ep) => getEpisodeMergeKey(ep) === item.key && hasPlayableUrl(ep));
          return srv && matched ? { ...srv, server_data: [matched], originalIndex: idx } : null;
        })
        .filter(Boolean) as Array<EpisodeServer & { originalIndex: number }>;
      const tabMatchedServers = serverTypeTab === 'all'
        ? allAvailableServers
        : allAvailableServers.filter((srv) => detectServerType(getServerIdentityText(srv)) === serverTypeTab);
      const availableServers = tabMatchedServers.length > 0 ? tabMatchedServers : allAvailableServers;
      const best = pickBestEpisodeByPriority(availableServers);
      if (best) {
        onSwitchServer(availableServers[best.serverIndex].originalIndex);
        onSelectEp(best.episode);
        return;
      }
      if (hasPlayableUrl(item.ep)) {
        onSelectEp(item.ep);
        return;
      }
      const fallback = allAvailableServers[0];
      if (!fallback?.server_data?.[0]) return;
      onSwitchServer(fallback.originalIndex);
      onSelectEp(fallback.server_data[0]);
    }, [episodes, onSwitchServer, onSelectEp, serverTypeTab]);

    const handlePrev = useCallback(() => {
      if (!hasPrev || !navigableEpisodes[currentEpIdx - 1]) return;
      handleSelectMergedEp(navigableEpisodes[currentEpIdx - 1]);
    }, [hasPrev, currentEpIdx, navigableEpisodes, handleSelectMergedEp]);

    const handleNext = useCallback(() => {
      if (!hasNext || !navigableEpisodes[currentEpIdx + 1]) return;
      handleSelectMergedEp(navigableEpisodes[currentEpIdx + 1]);
    }, [hasNext, currentEpIdx, navigableEpisodes, handleSelectMergedEp]);

    const handleWatchNow = useCallback(() => {
      if (isTrailerOnly) {
        setActiveTab('trailer');
        (forwardedRef as React.RefObject<HTMLDivElement | null>)?.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        return;
      }
      if (mergedEpisodes.length === 0) return;
      const latestPlayableEpisode = [...mergedEpisodes]
        .filter((item) => !item.ep.is_scheduled)
        .sort((a, b) => epSortKey(b.ep) - epSortKey(a.ep))[0];
      handleSelectMergedEp(latestPlayableEpisode ?? mergedEpisodes[0]);
      (forwardedRef as React.RefObject<HTMLDivElement | null>)?.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, [isTrailerOnly, mergedEpisodes, handleSelectMergedEp, forwardedRef]);

    const toggleCinemaMode = useCallback(() => {
      setCinemaMode(!cinemaMode);
      if (!cinemaMode)
        (forwardedRef as React.RefObject<HTMLDivElement | null>)?.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
    }, [cinemaMode, setCinemaMode, forwardedRef]);

    const hasTrailer = Boolean(trailerEmbedUrl);

    return (
      <div
        ref={forwardedRef}
        className={`movie-watch-section cinema-page-container pt-2 sm:pt-4 ${cinemaMode ? 'relative z-[101]' : ''}`}
      >
        {cinemaMode && (
          <div className="fixed inset-0 z-[100] bg-black pointer-events-none" aria-hidden="true" />
        )}

        <div className={`mb-6 sm:mb-8 ${cinemaMode ? 'relative z-[101]' : ''}`}>
          {/* Tabs */}
          <div className="movie-watch-topbar mb-3 flex items-center gap-2 px-3 py-3 sm:mb-4 sm:px-4 lg:px-5 flex-wrap">
            <div className="mr-auto flex min-w-[210px] items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/12 text-red-300">
                <i className="ri-play-circle-line text-lg" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white sm:text-base">Trình phát phim</p>
                <p className="truncate text-[11px] text-white/38">
                  {activeEp ? `${activeEp.name} · ${availableEpisodeLabel}` : `${availableEpisodeLabel} khả dụng`}
                </p>
              </div>
            </div>
            {!isTrailerOnly && hasTrailer && (
              <div className="flex gap-1 bg-black/25 rounded-xl p-1 w-fit border border-white/5">
                {(['episodes', 'trailer'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      activeTab === t ? 'bg-red-500 text-white' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    <i className={t === 'episodes' ? 'ri-play-fill text-xs' : 'ri-film-line text-xs'} />
                    {t === 'episodes' ? 'Xem Phim' : 'Trailer'}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={toggleCinemaMode}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                cinemaMode
                  ? 'bg-red-500/20 border-red-500/30 text-red-400'
                  : 'bg-black/50 border-white/15 text-white/70 hover:text-white'
              }`}
            >
              <i className={`${cinemaMode ? 'ri-fullscreen-exit-line' : 'ri-movie-line'} text-sm`} />
              <span className="hidden sm:inline">{cinemaMode ? 'Thoát Cinema' : 'Cinema'}</span>
            </button>
          </div>

          {/* Trailer only */}
          {isTrailerOnly && (
            <>
              <div className="flex items-center gap-3 mb-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2.5">
                <i className="ri-time-line text-orange-400 text-lg" />
                <div>
                  <p className="text-orange-300 text-xs font-semibold">Phim đang cập nhật</p>
                  <p className="text-orange-400/70 text-[11px]">Chỉ có trailer để xem trước.</p>
                </div>
              </div>
              {trailerEmbedUrl ? (
                <div className="aspect-video w-full bg-black rounded-xl overflow-hidden">
                  <iframe
                    src={trailerEmbedUrl}
                    title={`${movie.name} – Trailer`}
                    width="100%"
                    height="100%"
                    className="w-full h-full border-0"
                    allowFullScreen
                    allow="autoplay; fullscreen; picture-in-picture"
                  />
                </div>
              ) : (
                <div className="aspect-video w-full bg-[#1a1d27] rounded-xl flex items-center justify-center">
                  <p className="text-white/40 text-sm">Trailer chưa có</p>
                </div>
              )}
            </>
          )}

          {/* Episodes tab */}
          {!isTrailerOnly && activeTab === 'episodes' && (
            <>
              {/* Player area: poster if no ep selected, else video player */}
              {!activeEp ? (
                mergedEpisodes.length === 0 && !isTrailerOnly ? (
                  <div className="movie-player-frame aspect-video w-full bg-[#0d0f1a] rounded-2xl flex flex-col items-center justify-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <i className="ri-time-line text-2xl text-amber-400" />
                    </div>
                    <p className="text-white/60 text-sm font-medium">Phim đang cập nhật</p>
                    <p className="text-white/30 text-xs max-w-sm text-center px-4">Chưa có tập phim nào. Vui lòng quay lại sau hoặc xem trailer (nếu có).</p>
                    {onRefetchMovie && (
                      <button
                        onClick={onRefetchMovie}
                        className="mt-1 flex items-center gap-2 px-4 py-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium transition-all cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-refresh-line" /> Thử tải lại nguồn phim
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="movie-player-frame relative aspect-video w-full rounded-2xl overflow-hidden cursor-pointer group"
                    onClick={handleWatchNow}
                  >
                    <img
                      src={getThumbUrl(movie.thumb_url || movie.poster_url)}
                      alt={movie.name}
                      className="w-full h-full object-cover object-top scale-105 group-hover:scale-100 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-red-500/90 group-hover:bg-red-500 group-hover:scale-110 transition-all flex items-center justify-center">
                        <i className="ri-play-fill text-2xl sm:text-4xl text-white ml-1" />
                      </div>
                      <p className="text-white font-bold text-sm sm:text-lg">{movie.name}</p>
                      <p className="text-white/60 text-xs">Nhấn để bắt đầu xem</p>
                    </div>
                  </div>
                )
              ) : (
                <>
                  {/* Resume banner */}
                  {showResumeBanner && resumeInfo && (
                    <div className="mb-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5 flex-wrap">
                      <i className="ri-history-line text-amber-400 text-lg" />
                      <div className="flex-1 min-w-0">
                        <p className="text-amber-300 text-xs font-semibold">Tiếp tục xem dở</p>
                        <p className="text-amber-400/60 text-[11px]">
                          Đã xem đến{' '}
                          <strong className="text-amber-300">
                            {Math.floor(resumeInfo.time / 60)}:
                            {String(Math.floor(resumeInfo.time % 60)).padStart(2, '0')}
                          </strong>{' '}
                          — {Math.round(resumeInfo.progress * 100)}%
                        </p>
                      </div>
                      <button
                        onClick={onResume}
                        className="px-3 py-1.5 bg-amber-500 text-white text-[11px] font-semibold rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        Tiếp tục
                      </button>
                      <button
                        onClick={onRestart}
                        className="px-3 py-1.5 bg-white/8 text-white/60 text-[11px] rounded-lg cursor-pointer whitespace-nowrap border border-white/10"
                      >
                        Xem lại
                      </button>
                    </div>
                  )}

                  {/* Player */}
                  <PlayerBox
                    episode={activeEp}
                    movieSlug={slug}
                    movieTitle={movie.name}
                    quality={movie.quality ?? ''}
                    lang={movie.lang ?? ''}
                    hasPrev={hasPrev}
                    hasNext={hasNext}
                    onPrev={handlePrev}
                    onNext={handleNext}
                    allServers={episodes}
                    activeServer={activeServer}
                    onSwitchServer={onSwitchServer}
                    onSelectEp={onSelectEp}
                    initialTime={initialSeekTime}
                    onTimeUpdate={onTimeUpdate}
                    onRefetchMovie={onRefetchMovie}
                    onVideoEnded={onVideoEnded}
                    nextEpName={hasNext ? navigableEpisodes[currentEpIdx + 1]?.ep.name : undefined}
                  />
                </>
              )}

              {/* Watch controls */}
              {episodes.length > 0 && (
                <div className="movie-watch-panel mt-4 sm:mt-5 rounded-2xl border border-white/[0.08] overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-3 sm:px-4 lg:px-5 lg:py-4">
                    <span className="w-1.5 h-5 bg-red-500 rounded-full shadow-[0_0_18px_rgba(239,68,68,.45)]" />
                    <p className="text-white/68 text-xs font-semibold uppercase tracking-wider">Nguồn Phim</p>
                    <span className="text-white/30 text-[11px] ml-1">
                      ({episodes.length} nguồn)
                    </span>
                  </div>

                  {canCollapseEpisodes && (
                    <div className="-mt-9 mb-2 hidden justify-end px-3 sm:px-4">
                      <button
                        onClick={() => setEpisodesCollapsed((v) => !v)}
                        className="flex h-7 items-center gap-1.5 rounded-md bg-white/[0.06] px-2.5 text-[11px] font-semibold text-white/55 hover:text-white cursor-pointer"
                      >
                        <span>{episodesCollapsed ? 'Mở rộng' : 'Rút gọn'}</span>
                        <i className={`${episodesCollapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'} text-sm`} />
                      </button>
                    </div>
                  )}

                  {/* Type filter tabs */}
                  <div className="overflow-x-auto px-3 pt-3 sm:px-4 lg:px-5 lg:pt-4">
                  <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap lg:gap-2">
                    {[
                      { key: 'all' as const, label: 'Tất cả', icon: 'ri-apps-line', color: 'bg-white/10 text-white/70 border-white/10 hover:bg-white/15' },
                      { key: 'vietsub' as const, label: 'Vietsub', icon: 'ri-file-text-line', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' },
                      { key: 'thuyetminh' as const, label: 'Thuyết Minh', icon: 'ri-mic-2-line', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20' },
                      { key: 'longtieng' as const, label: 'Lồng Tiếng', icon: 'ri-volume-up-line', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20' },
                      { key: 'other' as const, label: 'Khác', icon: 'ri-server-line', color: 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' },
                    ]
                      .filter((t) => t.key === 'all' || serverTypeCounts[t.key] > 0)
                      .map((t) => {
                      const count = serverTypeCounts[t.key];
                      const isActive = serverTypeTab === t.key;
                      const activeColor =
                        t.key === 'all'
                          ? 'bg-white/20 text-white border-white/30'
                          : t.key === 'vietsub'
                          ? 'bg-emerald-500 text-white border-emerald-600'
                          : t.key === 'thuyetminh'
                          ? 'bg-orange-500 text-white border-orange-600'
                          : t.key === 'longtieng'
                          ? 'bg-amber-500 text-white border-amber-600'
                          : 'bg-white/15 text-white/80 border-white/20';
                      return (
                        <button
                          key={t.key}
                          onClick={() => setServerTypeTab(t.key)}
                          disabled={count === 0}
                          className={`flex h-9 lg:h-10 items-center gap-1.5 px-3 lg:px-4 rounded-full text-[11px] sm:text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                            isActive ? activeColor : t.color
                          } ${count === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <i className={`${t.icon} text-xs`} />
                          <span>{t.label}</span>
                          <span className="text-[10px] opacity-60 font-normal">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-2 sm:px-4 lg:grid-cols-3 lg:gap-2.5 lg:px-5 lg:pb-5 2xl:grid-cols-4">
                    {visibleServerOptions
                      .filter(({ typeKey }) => serverTypeTab === 'all' || typeKey === serverTypeTab)
                      .map(({ srv, idx, typeKey }) => {
                      const type = getServerTypeStyle(typeKey);
                      const isActive = idx === activeServer;
                      const sourceName = getServerDisplayName(srv, idx);
                      return (
                        <button
                          key={idx}
                          onClick={() => onSwitchServer(idx)}
                          className={`flex h-12 lg:h-14 items-center gap-2 rounded-xl border px-3 text-left transition-all cursor-pointer active:scale-[0.99] ${
                            isActive
                              ? 'bg-white text-[#11131b] border-white shadow-lg shadow-white/10'
                              : 'bg-white/[0.05] text-white/68 border-white/[0.08] hover:bg-white/[0.10] hover:text-white hover:border-white/18'
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'bg-white' : type.dotClass}`} />
                          <i className={`${type.icon} shrink-0 text-base`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs sm:text-sm lg:text-[15px] font-bold">{type.label}</span>
                            <span className={`block truncate text-[10px] sm:text-[11px] ${isActive ? 'text-white/80' : 'text-white/35'}`}>
                              {sourceName} · {srv.server_data?.length ?? 0}
                            </span>
                          </span>
                          {isActive && (
                            <i className="ri-check-line shrink-0 text-lg" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Episode group pagination */}
              {groups.length > 1 && (
                <div className="movie-watch-panel mt-4 rounded-2xl border border-white/[0.08] p-3 sm:p-4 lg:p-5">
                  <span className="text-white/40 text-xs">Nhóm:</span>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Chọn khoảng tập</p>
                      <p className="mt-0.5 text-white/30 text-[11px]">
                        {mergedEpisodes.length} tập, chia {groups.length} nhóm để tìm nhanh
                      </p>
                    </div>
                    <select
                      value={epGroup}
                      onChange={(e) => setEpGroup(Number(e.target.value))}
                      className="h-10 rounded-xl border border-white/[0.1] bg-black/30 px-3 text-xs font-semibold text-white/75 outline-none focus:border-red-500/60"
                    >
                      {groupOptions.map((group) => (
                        <option key={group.index} value={group.index}>
                          Tập {group.start}-{group.end}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                  {groups.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setEpGroup(i)}
                      className={`h-9 rounded-lg px-3 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        epGroup === i
                          ? 'bg-white text-[#10131d]'
                          : 'bg-black/24 text-white/45 border border-white/[0.08] hover:text-white'
                      }`}
                    >
                      {i * EP_GROUP + 1}–{Math.min((i + 1) * EP_GROUP, mergedEpisodes.length)}
                    </button>
                  ))}
                  </div>
                </div>
              )}

              {/* Episode list — ALWAYS visible */}
              {currentTypeGroup.length > 0 && (
                <div className="movie-watch-panel mt-4 rounded-2xl border border-white/[0.08] p-3 sm:p-4 lg:p-5">
                  <p className="text-white/42 text-[10px] uppercase tracking-wider mb-3">
                    Danh Sách Tập
                    {activeEp && (
                      <span className="ml-2 text-white/20 normal-case">
                        — Đang chọn: <span className="text-red-400">{activeEp.name}</span>
                      </span>
                    )}
                  </p>
                  {canCollapseEpisodes && (
                    <div className="-mt-1 mb-2 hidden justify-end sm:flex">
                      <button
                        onClick={() => setEpisodesCollapsed((v) => !v)}
                        className="flex h-8 items-center gap-1.5 rounded-md bg-white/[0.06] px-3 text-[11px] font-semibold text-white/55 hover:bg-white/[0.1] hover:text-white cursor-pointer"
                      >
                        <span>{episodesCollapsed ? 'Mở rộng' : 'Rút gọn'}</span>
                        <i className={`${episodesCollapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'} text-sm`} />
                      </button>
                    </div>
                  )}
                  <div className={`${episodesCollapsed ? '' : 'sm:max-h-[360px] lg:max-h-[500px] sm:overflow-y-auto sm:pr-1'}`}>
                  <div className="episode-button-grid grid gap-1.5 lg:gap-2">
                    {shownEpisodes.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => handleSelectMergedEp(item)}
                        className={`flex h-9 lg:h-11 items-center justify-center gap-1 rounded-lg px-1.5 text-center text-[11px] sm:text-xs lg:text-[13px] font-semibold transition-all cursor-pointer active:scale-95 ${
                          activeEpisodeKey === item.key
                            ? item.ep.is_scheduled
                              ? 'bg-amber-500 text-black shadow-lg shadow-amber-950/25'
                              : 'bg-red-500 text-white shadow-lg shadow-red-950/25'
                            : item.ep.is_scheduled
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20'
                            : 'bg-black/24 text-white/62 hover:text-white border border-white/[0.07] hover:bg-white/[0.08]'
                        }`}
                      >
                        {item.ep.is_scheduled && <i className="ri-timer-flash-line shrink-0" />}
                        <span className="truncate">{item.ep.name}</span>
                      </button>
                    ))}
                  </div>
                  </div>
                  {canCollapseEpisodes && (
                    <button
                      onClick={() => setEpisodesCollapsed((v) => !v)}
                      className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white/[0.07] text-xs font-semibold text-white/70 border border-white/[0.08] active:scale-[0.99] sm:hidden"
                    >
                      <span>
                        {episodesCollapsed
                          ? `Mở rộng thêm ${currentTypeGroup.length - shownEpisodes.length} tập`
                          : 'Rút gọn danh sách tập'}
                      </span>
                      <i className={`${episodesCollapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'} text-base`} />
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Trailer tab */}
          {!isTrailerOnly && activeTab === 'trailer' &&
            (trailerEmbedUrl ? (
              <div className="aspect-video w-full bg-black rounded-xl overflow-hidden">
                <iframe
                  src={trailerEmbedUrl}
                  title={`${movie.name} – Trailer`}
                  width="100%"
                  height="100%"
                  className="w-full h-full border-0"
                  allowFullScreen
                  allow="autoplay; fullscreen; picture-in-picture"
                />
              </div>
            ) : (
              <div className="aspect-video w-full bg-[#1a1d27] rounded-xl flex items-center justify-center">
                <p className="text-white/30 text-sm">Trailer chưa có</p>
              </div>
            ))}
        </div>
      </div>
    );
  }
);

MovieDetailPlayerSection.displayName = 'MovieDetailPlayerSection';

export default MovieDetailPlayerSection;
