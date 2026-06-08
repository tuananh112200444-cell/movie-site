import { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { EpisodeData, EpisodeServer } from '@/types/movie';
import { pickBestEpisodeByPriority } from '@/services/movieApi';
import { useServerNow } from '@/hooks/useServerNow';
import { formatVerboseTimeLeft, getTimeLeft } from '@/utils/movieSchedule';
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
  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined;
  if (!supabaseUrl || !shouldProxyHls(url)) return url;
  const proxy = new URL(`${supabaseUrl}/functions/v1/hls-cors-proxy`);
  proxy.searchParams.set('url', url);
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
  initialTime?: number;
  onTimeUpdate?: (time: number, duration: number) => void;
  onVideoEnded?: () => void;
  nextEpName?: string;
  onRefetchMovie?: () => void;
}

const DIRECT_VIDEO_SPEEDS = [1, 1.25, 1.5, 2];
const LightweightHlsPlayer = lazy(() => import('./LightweightHlsPlayer'));

export default function PlayerBox({
  episode,
  movieTitle,
  quality,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  allServers,
  activeServer,
  onSwitchServer,
  initialTime = 0,
  onTimeUpdate,
  onVideoEnded,
  nextEpName,
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

  const embedSrc = useMemo(() => normalizeDailymotionUrl(episode?.link_embed ?? ''), [episode?.link_embed]);
  const dmOriginalUrl = useMemo(() => getOriginalDailymotionUrl(episode?.link_embed ?? ''), [episode?.link_embed]);
  const directVideoSrc = useMemo(() => {
    const streamUrl = episode?.link_m3u8 ?? '';
    if (streamUrl && !isHlsUrl(streamUrl)) return streamUrl;
    return episode?.link_embed ?? '';
  }, [episode?.link_m3u8, episode?.link_embed]);
  const hlsSrc = useMemo(() => getHlsProxyUrl(episode?.link_m3u8 ?? ''), [episode?.link_m3u8]);
  const streamIsHls = Boolean(episode?.link_m3u8 && isHlsUrl(episode.link_m3u8));
  const scheduledLeft = episode?.scheduled_target_at ? getTimeLeft(episode.scheduled_target_at, serverNow) : null;
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
    iframeTimerRef.current = setTimeout(() => {
      setIframeBlocked(true);
    }, 12000);
    return () => {
      if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);
    };
  }, [playerMode, embedSrc, iframeKey]);

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

  const handleHlsFatal = useCallback(() => {
    // Fallback to embed or direct video mode
    const embedUrl = episode?.link_embed;
    if (embedUrl && playerMode === 'hls') {
      setPlayerMode(isIframeSource(embedUrl) ? 'embed' : 'video');
      return;
    }
    const remainingServerIndices = allServers
      .map((_, index) => index)
      .filter((index) => index !== activeServer);
    const remainingServers = remainingServerIndices.map((index) => allServers[index]);
    const fallback = pickBestEpisodeByPriority(remainingServers, episode?.slug);
    if (fallback) {
      onSwitchServer(remainingServerIndices[fallback.serverIndex]);
      return;
    }
  }, [episode?.link_embed, episode?.slug, playerMode, allServers, activeServer, onSwitchServer]);

  useEffect(() => {
    if (!iframeBlocked || playerMode !== 'embed') return;
    const remainingServerIndices = allServers
      .map((_, index) => index)
      .filter((index) => index !== activeServer);
    const remainingServers = remainingServerIndices.map((index) => allServers[index]);
    const fallback = pickBestEpisodeByPriority(remainingServers, episode?.slug);
    if (fallback) onSwitchServer(remainingServerIndices[fallback.serverIndex]);
  }, [iframeBlocked, playerMode, allServers, activeServer, episode?.slug, onSwitchServer]);

  return (
    <div className="mb-2 relative">
      <div className="relative rounded-xl overflow-hidden bg-black">
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
          <div ref={embedContainerRef} className="aspect-video w-full relative group">
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
            {/* Overlay fullscreen button on embed video */}
            {iframeLoaded && (
              <button
                onClick={toggleEmbedFullscreen}
                title={isEmbedFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white/80 hover:text-white border border-white/10 backdrop-blur-sm transition-all cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <i className={`${isEmbedFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} text-base`} />
                <span className="text-[11px] font-medium hidden sm:inline">
                  {isEmbedFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
                </span>
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
          </div>
        )}

        {playerMode === 'embed' && !embedSrc && !iframeBlocked && (
          <div className="aspect-video w-full bg-[#0d0f1a] flex items-center justify-center">
            <div className="text-center">
              <i className="ri-play-circle-line text-5xl text-white/10 mb-2 block" />
              <p className="text-white/30 text-sm">Chọn tập để bắt đầu xem</p>
            </div>
          </div>
        )}

        {playerMode === 'hls' && (
          <Suspense
            fallback={
              <div className="aspect-video w-full bg-[#0a0c14] flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-red-500/20 border-t-red-500 animate-spin mb-3" />
                <p className="text-white/30 text-sm">Dang tai trinh phat...</p>
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
              crossOrigin="anonymous"
            >
              {episode?.subtitle_url && (
                <track
                  kind="subtitles"
                  src={episode.subtitle_url}
                  srcLang="vi"
                  label="Tieng Viet"
                  default
                />
              )}
              Trình duyệt không hỗ trợ phát video.
            </video>
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
      <div className="mt-1.5 sm:mt-2 flex items-center justify-between gap-2 px-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button onClick={onPrev} disabled={!hasPrev} title="Tập trước"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed">
            <i className="ri-skip-back-line text-base" />
          </button>
          <button onClick={onNext} disabled={!hasNext} title="Tập sau"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed">
            <i className="ri-skip-forward-line text-base" />
          </button>
          <button onClick={() => { setIframeLoaded(false); setIframeKey((k) => k + 1); }} title="Tải lại"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all cursor-pointer">
            <i className="ri-refresh-line text-base" />
          </button>

          {streamIsHls && episode?.link_embed && (
            <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5 ml-1">
              <button onClick={() => setPlayerMode('hls')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  playerMode === 'hls' ? 'bg-red-500 text-white' : 'text-white/35 hover:text-white/70'
                }`}>
                HLS
              </button>
              <button onClick={() => setPlayerMode(isIframeSource(episode.link_embed) ? 'embed' : 'video')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  playerMode === 'embed' || playerMode === 'video' ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white/70'
                }`}>
                {isIframeSource(episode.link_embed) ? 'Nhúng' : 'MP4'}
              </button>
            </div>
          )}
          {playerMode === 'video' && (
            <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5 ml-1">
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
          {(playerMode === 'embed' || playerMode === 'video') && (
            <button
              onClick={toggleEmbedFullscreen}
              title={isEmbedFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all cursor-pointer"
            >
              <i className={`${isEmbedFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} text-base`} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
