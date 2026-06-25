import { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { EpisodeData, EpisodeServer } from '@/types/movie';
import { pickBestEpisodeByPriority } from '@/services/movieApi';
import { getSourceHost, reportPlayerIssue, type PlayerIssuePayload } from '@/services/playerDiagnostics';
import { useServerNow } from '@/hooks/useServerNow';
import { formatVerboseTimeLeft, getTimeLeft } from '@/utils/movieSchedule';
import { normalizeVideoCdnUrl } from '@/utils/videoCdn';
/* ─── URL helpers ─── */
function normalizeDailymotionUrl(url: string): string {
  const dm = /^https?:\/\/(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/i.exec(url);
  if (dm) return `https://www.dailymotion.com/embed/video/${dm[1]}?queue-enable=false&sharing-enable=false&ui-logo=false`;
  const short = /^https?:\/\/dai\.ly\/([a-zA-Z0-9]+)/i.exec(url);
  if (short) return `https://www.dailymotion.com/embed/video/${short[1]}?queue-enable=false&sharing-enable=false&ui-logo=false`;
  return url;
}

function getOriginalDailymotionUrl(url: string): string {
  const embed = /^https?:\/\/(?:www\.)?dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/i.exec(url);
  if (embed) return `https://www.dailymotion.com/video/${embed[1]}`;
  return url;
}

function isIframeSource(url: string): boolean {
  const u = url.toLowerCase();
  if (isBlvietsubWatchPageUrl(u)) return false;
  return (
    u.includes('youtube.com/embed') ||
    u.includes('youtu.be') ||
    u.includes('dailymotion.com/embed') ||
    u.includes('dailymotion.com/video') ||
    u.includes('dai.ly') ||
    u.includes('vimeo.com') ||
    u.includes('player.vimeo.com')
  );
}

function isBlvietsubWatchPageUrl(url: string): boolean {
  const raw = String(url || '').replace(/&amp;/g, '&').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return /(^|\.)blvietsub\.com$/i.test(parsed.hostname) && /\/+xem-phim\//i.test(parsed.pathname);
  } catch {
    return /blvietsub\.com\/+xem-phim\//i.test(raw);
  }
}

function getSafeEmbedUrl(url: string): string {
  if (isBlvietsubWatchPageUrl(url)) return '';
  return normalizeDailymotionUrl(url);
}

function isDirectVideo(url: string): boolean {
  const u = url.toLowerCase();
  return /\.(mp4|webm|mkv|mov)(?:[?#].*)?$/.test(u);
}

function isHlsUrl(url: string): boolean {
  return /\.m3u8(?:[?#].*)?$/i.test(url);
}

function isDailymotion(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('dailymotion.com') || u.includes('dai.ly');
}

function isKnownCorsBlockedHls(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('drive.google.com') ||
    u.includes('blogspot.com') ||
    u.includes('googleusercontent.com') ||
    u.includes('dailymotion.com') ||
    u.includes('dmcdn.net') ||
    u.includes('cdnvideo11.shop') ||
    u.includes('streamcdn4.site') ||
    u.includes('imostatic.com')
  );
}

function shouldProxyHls(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'hls08.cdnvideo11.shop' || host === 'hls08.streamcdn4.site';
  } catch {
    return false;
  }
}

function getHlsProxyUrl(url: string): string {
  const normalizedUrl = normalizeVideoCdnUrl(url);
  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined;
  if (!supabaseUrl || !shouldProxyHls(normalizedUrl)) return normalizedUrl;
  const proxy = new URL(`${supabaseUrl}/functions/v1/hls-cors-proxy`);
  proxy.searchParams.set('url', normalizedUrl);
  return proxy.toString();
}

function getPlayerMode(ep: EpisodeData | null): 'hls' | 'embed' | 'video' {
  if (ep?.link_m3u8) {
    if (!isHlsUrl(ep.link_m3u8)) return 'video';
    if (shouldProxyHls(ep.link_m3u8)) return 'hls';
    if (ep.link_embed && isKnownCorsBlockedHls(ep.link_m3u8)) {
      return isIframeSource(ep.link_embed) ? 'embed' : 'video';
    }
    return 'hls';
  }
  
  if (ep?.link_embed) {
    if (isDirectVideo(ep.link_embed)) return 'video';
    if (isIframeSource(ep.link_embed)) return 'embed';
    return 'embed';
  }
  return 'embed';
}

interface PlayerBoxProps {
  episode: EpisodeData | null;
  movieSlug?: string;
  movieTitle: string;
  quality: string;
  lang: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  allServers: EpisodeServer[];
  activeServer: number;
  onSwitchServer: (idx: number) => void;
  onSelectEp: (ep: EpisodeData) => void;
  initialTime?: number;
  onTimeUpdate?: (time: number, duration: number) => void;
  onVideoEnded?: () => void;
  nextEpName?: string;
  onRefetchMovie?: () => void;
}

const DIRECT_VIDEO_SPEEDS = [1, 1.25, 1.5, 2];
const BAD_SOURCE_HOSTS_KEY = 'khophim.bad-source-hosts.v1';
const EMBED_FALLBACK_TIMEOUT_MS = 3800;
const EMBED_LAST_SOURCE_TIMEOUT_MS = 8000;
const PLAYER_LOGO_URL = 'https://public.readdy.ai/ai/img_res/e1260dce-9377-44c8-83b0-d22bf9614677.png';
const LightweightHlsPlayer = lazy(() => import('./LightweightHlsPlayer'));

function rememberBadSourceHost(host: string): void {
  if (!host || typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(BAD_SOURCE_HOSTS_KEY);
    const map = raw ? JSON.parse(raw) as Record<string, number> : {};
    map[host] = Date.now();
    window.localStorage.setItem(BAD_SOURCE_HOSTS_KEY, JSON.stringify(map));
  } catch {
    // Best-effort hint only; playback fallback must still work if storage is blocked.
  }
}

function getUrlOrigin(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function addTemporaryPreconnect(origin: string): () => void {
  const existing = document.querySelector<HTMLLinkElement>(`link[rel="preconnect"][href="${origin}"]`);
  if (existing) return () => {};
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
  return () => link.remove();
}

function PlayerWatermark() {
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-white/85 shadow-lg shadow-black/30 backdrop-blur-md sm:left-4 sm:top-4 sm:gap-2 sm:px-2.5">
      <img
        src={PLAYER_LOGO_URL}
        alt=""
        className="h-5 w-5 rounded object-contain sm:h-6 sm:w-6"
        draggable={false}
      />
      <span className="text-[10px] font-black tracking-wide sm:text-xs">khophim.org</span>
    </div>
  );
}

export default function PlayerBox({
  episode,
  movieSlug,
  movieTitle,
  quality,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  allServers,
  activeServer,
  onSwitchServer,
  onSelectEp,
  initialTime = 0,
  onTimeUpdate,
  onVideoEnded,
  nextEpName,
  onRefetchMovie,
}: PlayerBoxProps) {
  const serverNow = useServerNow(Boolean(episode?.is_scheduled));
  const [playerMode, setPlayerMode] = useState(() => getPlayerMode(episode));
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [autoNextActive, setAutoNextActive] = useState(false);
  const [autoNextCountdown, setAutoNextCountdown] = useState(5);
  const prevEpSlug = useRef<string | null>(null);
  const iframeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const embedContainerRef = useRef<HTMLDivElement>(null);
  const directVideoRef = useRef<HTMLVideoElement>(null);

  const [isEmbedFullscreen, setIsEmbedFullscreen] = useState(false);
  const [directVideoSpeed, setDirectVideoSpeed] = useState(1);

  useEffect(() => {
    const handler = () => setIsEmbedFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const toggleEmbedFullscreen = useCallback(() => {
    const el = embedContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement && !(document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if ((el as HTMLDivElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
        (el as HTMLDivElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.();
      }
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if ((document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen) {
        (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
      }
    }
  }, []);

  const embedIsSourcePage = useMemo(() => isBlvietsubWatchPageUrl(episode?.link_embed ?? ''), [episode?.link_embed]);
  const embedSrc = useMemo(() => getSafeEmbedUrl(episode?.link_embed ?? ''), [episode?.link_embed]);
  const dmOriginalUrl = useMemo(() => getOriginalDailymotionUrl(episode?.link_embed ?? ''), [episode?.link_embed]);
  const directVideoSrc = useMemo(() => {
    const streamUrl = episode?.link_m3u8 ?? '';
    if (streamUrl && !isHlsUrl(streamUrl)) return normalizeVideoCdnUrl(streamUrl);
    return normalizeVideoCdnUrl(episode?.link_embed ?? '');
  }, [episode?.link_m3u8, episode?.link_embed]);
  const hlsSrc = useMemo(() => getHlsProxyUrl(episode?.link_m3u8 ?? ''), [episode?.link_m3u8]);
  const streamIsHls = Boolean(episode?.link_m3u8 && isHlsUrl(episode.link_m3u8));
  const scheduledLeft = episode?.scheduled_target_at ? getTimeLeft(episode.scheduled_target_at, serverNow) : null;
  const activeServerName = allServers[activeServer]?.server_name ?? '';
  const activeSourceHost = useMemo(
    () => getSourceHost(episode?.link_m3u8 || episode?.link_embed || ''),
    [episode?.link_m3u8, episode?.link_embed]
  );
  useEffect(() => {
    const origins = Array.from(new Set([
      getUrlOrigin(hlsSrc),
      getUrlOrigin(directVideoSrc),
      getUrlOrigin(embedSrc),
    ].filter(Boolean) as string[]));
    const cleanups = origins.map(addTemporaryPreconnect);
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [directVideoSrc, embedSrc, hlsSrc]);
  const reportIssue = useCallback((issue: Pick<PlayerIssuePayload, 'event_type' | 'playback_time' | 'duration' | 'buffered_ahead' | 'error_message'>) => {
    reportPlayerIssue({
      movie_slug: movieSlug,
      movie_title: movieTitle,
      episode_slug: episode?.slug,
      episode_name: episode?.name,
      server_name: activeServerName,
      player_mode: playerMode,
      source_host: activeSourceHost,
      ...issue,
    });
  }, [activeServerName, activeSourceHost, episode?.name, episode?.slug, movieSlug, movieTitle, playerMode]);
  useEffect(() => {
    if (directVideoRef.current) directVideoRef.current.playbackRate = directVideoSpeed;
  }, [directVideoSpeed, directVideoSrc]);

  /* Reset when episode changes */
  useEffect(() => {
    const currentSlug = episode?.slug ?? null;
    if (currentSlug !== prevEpSlug.current) {
      prevEpSlug.current = currentSlug;
      setIframeLoaded(false);
      setIframeBlocked(false);
      setIframeKey((k) => k + 1);
      setAutoNextActive(false);
      setAutoNextCountdown(5);
      setPlayerMode(getPlayerMode(episode));
    }
  }, [episode?.slug, episode?.link_m3u8, episode?.link_embed]);

  /* Iframe load timeout fallback */
  useEffect(() => {
    if (playerMode !== 'embed' || !embedSrc) return;
    setIframeLoaded(false);
    setIframeBlocked(false);
    if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);
    const hasFallbackServer = allServers.some((_, index) => index !== activeServer);
    iframeTimerRef.current = setTimeout(() => {
      setIframeBlocked(true);
    }, hasFallbackServer ? EMBED_FALLBACK_TIMEOUT_MS : EMBED_LAST_SOURCE_TIMEOUT_MS);
    return () => {
      if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);
    };
  }, [activeServer, allServers, playerMode, embedSrc, iframeKey]);

  /* Auto-next on ended */
  const handleEnded = useCallback(() => {
    if (!hasNext) return;
    setAutoNextActive(true);
    setAutoNextCountdown(5);
  }, [hasNext]);

  /* Countdown effect */
  useEffect(() => {
    if (!autoNextActive || autoNextCountdown <= 0) return;
    const timer = setInterval(() => {
      setAutoNextCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setAutoNextActive(false);
          onNext();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoNextActive, autoNextCountdown, onNext]);

  const handleCancelAutoNext = useCallback(() => {
    setAutoNextActive(false);
  }, []);

  const switchToFallbackServer = useCallback(() => {
    rememberBadSourceHost(activeSourceHost);
    const remainingServerIndices = allServers
      .map((_, index) => index)
      .filter((index) => index !== activeServer);
    const remainingServers = remainingServerIndices.map((index) => allServers[index]);
    const fallback = pickBestEpisodeByPriority(remainingServers, episode?.slug);
    if (fallback) {
      onSwitchServer(remainingServerIndices[fallback.serverIndex]);
      onSelectEp(fallback.episode);
      return true;
    }
    return false;
  }, [activeServer, activeSourceHost, allServers, episode?.slug, onSelectEp, onSwitchServer]);

  const handleHlsFatal = useCallback(() => {
    reportIssue({
      event_type: 'hls_fatal',
      error_message: 'HLS fatal callback reached PlayerBox',
    });
    const embedUrl = episode?.link_embed;
    if (embedUrl && !isBlvietsubWatchPageUrl(embedUrl) && playerMode === 'hls') {
      setPlayerMode(isIframeSource(embedUrl) ? 'embed' : 'video');
      return;
    }
    switchToFallbackServer();
  }, [episode?.link_embed, playerMode, reportIssue, switchToFallbackServer]);

  const handleDirectVideoError = useCallback(() => {
    const video = directVideoRef.current;
    reportIssue({
      event_type: 'direct_video_error',
      playback_time: video?.currentTime ?? 0,
      duration: video?.duration ?? 0,
      error_message: 'direct video element error',
    });
    const embedUrl = episode?.link_embed ?? '';
    if (embedUrl && !isBlvietsubWatchPageUrl(embedUrl) && isIframeSource(embedUrl) && playerMode !== 'embed') {
      setPlayerMode('embed');
      return;
    }
    switchToFallbackServer();
  }, [episode?.link_embed, playerMode, reportIssue, switchToFallbackServer]);

  useEffect(() => {
    if (!iframeBlocked || playerMode !== 'embed') return;
    reportIssue({
      event_type: 'iframe_blocked',
      error_message: 'embed iframe load timed out or failed',
    });
    switchToFallbackServer();
  }, [iframeBlocked, playerMode, reportIssue, switchToFallbackServer]);

  return (
    <div className="movie-player-box mb-2 relative">
      <div className="movie-player-frame relative overflow-hidden rounded-2xl bg-black lg:rounded-[22px]">
        {episode?.is_scheduled && (
          <div className="aspect-video w-full bg-[#090b12] flex flex-col items-center justify-center gap-4 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
              <i className="ri-timer-flash-line text-3xl text-amber-300" />
            </div>
            <div>
              <p className="text-amber-300 text-sm sm:text-base font-black">{episode.name} sẽ phát sóng sau</p>
              <p className="mt-2 font-mono text-2xl sm:text-4xl font-black text-white">
                {scheduledLeft ? formatVerboseTimeLeft(scheduledLeft) : 'Đang cập nhật'}
              </p>
              {episode.scheduled_note && (
                <p className="mt-2 text-white/40 text-xs sm:text-sm">{episode.scheduled_note}</p>
              )}
            </div>
            {scheduledLeft?.totalMs === 0 && (
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-black hover:bg-amber-300"
              >
                Tải lại để kiểm tra tập mới
              </button>
            )}
          </div>
        )}

        {!episode?.is_scheduled && (
          <>
        {playerMode === 'embed' && embedSrc && !iframeBlocked && (
          <div ref={embedContainerRef} className="aspect-video w-full relative group bg-black">
            {!iframeLoaded && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0c14]">
                <div className="w-10 h-10 rounded-full border-2 border-red-500/20 border-t-red-500 animate-spin mb-3" />
                <p className="text-white/30 text-sm">Đang tải phim...</p>
              </div>
            )}
            <iframe
              key={`${embedSrc}-${iframeKey}`}
              src={embedSrc}
              title={movieTitle}
              width="100%"
              height="100%"
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
              referrerPolicy="no-referrer"
              loading="eager"
              onLoad={() => {
                setIframeLoaded(true);
                setIframeBlocked(false);
                if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);
              }}
              onError={() => {
                if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);
                setIframeBlocked(true);
              }}
            />
            {iframeLoaded && <PlayerWatermark />}
            {/* Overlay fullscreen button on embed video */}
            {iframeLoaded && (
              <button
                onClick={toggleEmbedFullscreen}
                title={isEmbedFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                className="absolute top-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-xl bg-black/65 text-white/85 border border-white/10 backdrop-blur-sm transition-all hover:bg-black/85 hover:text-white hover:border-white/20 cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <i className={`${isEmbedFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} text-base`} />
              </button>
            )}
          </div>
        )}

        {playerMode === 'embed' && iframeBlocked && (
          <div className="aspect-video w-full bg-[#0d0f1a] flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <i className="ri-shield-cross-line text-2xl text-red-400" />
            </div>
            <p className="text-white/60 text-sm font-medium">Video này không cho phép nhúng</p>
            <a
              href={isDailymotion(dmOriginalUrl) ? dmOriginalUrl : (episode?.link_embed ?? '#')}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors whitespace-nowrap"
            >
              {isDailymotion(dmOriginalUrl) ? 'Mở trên Dailymotion' : 'Mở nguồn gốc'}
            </a>
            {onRefetchMovie && (
              <button
                onClick={onRefetchMovie}
                className="px-4 py-2 rounded-lg bg-white/10 text-white/70 text-xs font-semibold hover:bg-white/15 transition-colors whitespace-nowrap"
              >
                Tải lại nguồn phim
              </button>
            )}
          </div>
        )}

        {playerMode === 'embed' && !embedSrc && !iframeBlocked && (
          <div className="aspect-video w-full bg-[#0d0f1a] flex items-center justify-center px-4">
            <div className="max-w-sm text-center">
              <i className={`${embedIsSourcePage ? 'ri-links-line' : 'ri-play-circle-line'} text-5xl text-white/10 mb-2 block`} />
              <p className="text-white/50 text-sm font-semibold">
                {embedIsSourcePage ? 'Nguồn phim này đang cần đồng bộ lại player' : 'Chọn tập để bắt đầu xem'}
              </p>
              {embedIsSourcePage && (
                <p className="mt-1 text-xs text-white/30">
                  Hệ thống đã chặn link trang BLVietsub để không nhúng cả website vào khung xem phim.
                </p>
              )}
              {embedIsSourcePage && onRefetchMovie && (
                <button
                  onClick={onRefetchMovie}
                  className="mt-3 rounded-lg bg-red-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-red-600"
                >
                  Tải lại nguồn phim
                </button>
              )}
            </div>
          </div>
        )}

        {playerMode === 'hls' && (
          <Suspense
            fallback={
              <div className="aspect-video w-full bg-[#0a0c14] flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-red-500/20 border-t-red-500 animate-spin mb-3" />
                <p className="text-white/30 text-sm">Đang tải trình phát...</p>
              </div>
            }
          >
            <LightweightHlsPlayer
              key={`${hlsSrc}-${iframeKey}`}
              src={hlsSrc}
              title={movieTitle}
              initialTime={initialTime}
              onTimeUpdate={onTimeUpdate}
              onEnded={handleEnded}
              onVideoEnded={onVideoEnded}
              onFatalError={handleHlsFatal}
              onPlayerIssue={reportIssue}
              subtitleUrl={episode?.subtitle_url || ''}
            />
          </Suspense>
        )}

        {playerMode === 'video' && (
          <div ref={embedContainerRef} className="aspect-video w-full bg-black relative">
            <video
              key={`${directVideoSrc}-${iframeKey}`}
              ref={directVideoRef}
              src={directVideoSrc}
              title={movieTitle}
              className="w-full h-full object-contain"
              controls
              autoPlay
              playsInline
              preload="metadata"
              onError={handleDirectVideoError}
            >
              {episode?.subtitle_url && (
                <track
                  kind="subtitles"
                  src={episode.subtitle_url}
                  srcLang="vi"
                  label="Tiếng Việt"
                  default
                />
              )}
              Trình duyệt không hỗ trợ phát video.
            </video>
            <PlayerWatermark />
          </div>
        )}

        {/* Auto-next overlay */}
        {autoNextActive && hasNext && (
          <div className="absolute inset-0 z-40 flex items-end justify-end p-4 sm:p-6 pointer-events-none">
            <div className="pointer-events-auto bg-black/85 border border-white/15 rounded-xl px-4 py-3 flex flex-col items-center gap-2 min-w-[180px]">
              <p className="text-white/50 text-[11px] uppercase font-semibold">Tự động chuyển tập sau {autoNextCountdown}s</p>
              <p className="text-white font-bold text-sm">{nextEpName ?? 'Tập tiếp theo'}</p>
              <div className="flex gap-2 w-full">
                <button onClick={handleCancelAutoNext} className="flex-1 py-1.5 rounded-lg text-xs bg-white/8 text-white/60 border border-white/10 cursor-pointer">
                  Huỷ
                </button>
                <button onClick={onNext} className="flex-1 py-1.5 rounded-lg text-xs bg-red-500 text-white font-semibold cursor-pointer">
                  Xem ngay
                </button>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* Control bar */}
      {playerMode !== 'embed' && (
      <div className="movie-watch-topbar mt-2 flex items-center justify-between gap-2 px-2 py-2 flex-wrap lg:mt-3 lg:px-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={onPrev} disabled={!hasPrev} title="Tập trước"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-white/45 hover:text-white hover:bg-white/10 transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed">
            <i className="ri-skip-back-line text-base" />
          </button>
          <button onClick={onNext} disabled={!hasNext} title="Tập sau"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-white/45 hover:text-white hover:bg-white/10 transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed">
            <i className="ri-skip-forward-line text-base" />
          </button>
          <button onClick={() => { setIframeLoaded(false); setIframeKey((k) => k + 1); }} title="Tải lại"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-white/45 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
            <i className="ri-refresh-line text-base" />
          </button>

          {streamIsHls && episode?.link_embed && (
            <div className="flex items-center gap-0.5 bg-black/25 border border-white/[0.08] rounded-xl p-0.5 ml-1">
              <button onClick={() => setPlayerMode('hls')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  playerMode === 'hls' ? 'bg-red-500 text-white' : 'text-white/35 hover:text-white/70'
                }`}>
                HLS
              </button>
              <button onClick={() => setPlayerMode(isIframeSource(episode.link_embed) ? 'embed' : 'video')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  playerMode === 'video' ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white/70'
                }`}>
                {isIframeSource(episode.link_embed) ? 'Nhúng' : 'MP4'}
              </button>
            </div>
          )}
          {playerMode === 'video' && (
            <div className="flex items-center gap-0.5 bg-black/25 border border-white/[0.08] rounded-xl p-0.5 ml-1">
              {DIRECT_VIDEO_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => setDirectVideoSpeed(speed)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    directVideoSpeed === speed ? 'bg-red-500 text-white' : 'text-white/35 hover:text-white/70'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {playerMode === 'hls' && episode?.link_m3u8 && (
            <span className="text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-md whitespace-nowrap">
              Chất lượng cao
            </span>
          )}
          {quality && (
            <span className="text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-md whitespace-nowrap">{quality}</span>
          )}
          {episode && episode.name !== 'Full' && (
            <span className="text-[11px] bg-white/5 text-white/40 border border-white/8 px-2 py-0.5 rounded-md whitespace-nowrap">{episode.name}</span>
          )}
          {playerMode === 'video' && (
            <button
              onClick={toggleEmbedFullscreen}
              title={isEmbedFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-white/45 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              <i className={`${isEmbedFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} text-base`} />
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
