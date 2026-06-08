import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

/* ─── Types ─── */
interface QualityLevel {
  index: number;
  height: number;
  width: number;
  bitrate: number;
  name: string;
}

interface PlayerStats {
  bandwidth: number;
  bufferLength: number;
  currentBitrate: number;
  droppedFrames: number;
  latency: number;
}

interface HlsPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  initialTime?: number;
  onTimeUpdate?: (time: number, duration: number) => void;
  onEnded?: () => void;
  onVideoEnded?: () => void;
  onFatalError?: () => void;
  subtitleUrl?: string;
}

/* ─── Helpers ─── */
function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${Math.round(bps / 1_000)} kbps`;
  return `${bps} bps`;
}

function formatBandwidth(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mb/s`;
  if (bps >= 1_000) return `${Math.round(bps / 1_000)} kb/s`;
  return `${bps} b/s`;
}

function getQualityLabel(level: QualityLevel): string {
  if (level.height >= 2160) return '4K';
  if (level.height >= 1440) return '2K';
  if (level.height >= 1080) return '1080p';
  if (level.height >= 720)  return '720p';
  if (level.height >= 480)  return '480p';
  if (level.height >= 360)  return '360p';
  if (level.height >= 240)  return '240p';
  if (level.height > 0)     return `${level.height}p`;
  return formatBitrate(level.bitrate);
}

function getQualityBadgeColor(label: string): string {
  if (label === '4K' || label === '2K') return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
  if (label === '1080p') return 'bg-red-500/20 text-red-300 border-red-500/30';
  if (label === '720p')  return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  if (label === '480p')  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  return 'bg-white/10 text-white/50 border-white/15';
}

function getBufferColor(buf: number): string {
  if (buf >= 20) return 'bg-emerald-500';
  if (buf >= 10) return 'bg-amber-500';
  if (buf >= 5)  return 'bg-orange-500';
  return 'bg-red-500';
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/* ─── Main Component ─── */
export default function HlsPlayer({
  src, poster, title, autoPlay = true, initialTime = 0,
  onTimeUpdate, onEnded, onVideoEnded, onFatalError, subtitleUrl = '',
}: HlsPlayerProps) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const hlsRef       = useRef<Hls | null>(null);
  const statsTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorKeeperRef = useRef<HTMLDivElement>(null);

  const [levels, setLevels]             = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [autoLevel, setAutoLevel]       = useState<number>(-1);
  const [showQuality, setShowQuality]   = useState(false);
  const [showStats, setShowStats]       = useState(false);
  const [loaded, setLoaded]             = useState(false);
  const [hasError, setHasError]         = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');
  const [isBuffering, setIsBuffering]   = useState(false);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [isMuted, setIsMuted]           = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP]             = useState(false);
  const [volume, setVolume]             = useState(1);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [stats, setStats]               = useState<PlayerStats>({
    bandwidth: 0, bufferLength: 0, currentBitrate: 0, droppedFrames: 0, latency: 0,
  });

  const [doubleTapSide, setDoubleTapSide]   = useState<'left' | 'right' | null>(null);
  const [doubleTapCount, setDoubleTapCount] = useState(0);
  const [playFlash, setPlayFlash] = useState<'play' | 'pause' | null>(null);

  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
  type SpeedOption = typeof SPEED_OPTIONS[number];
  const [playbackSpeed, setPlaybackSpeed] = useState<SpeedOption>(1);
  const [showSpeed, setShowSpeed] = useState(false);

  const [hoverTime, setHoverTime]   = useState<number | null>(null);
  const [hoverPct, setHoverPct]     = useState(0);
  const [isDragging, setIsDragging] = useState(false);
   const [captionsEnabled, setCaptionsEnabled] = useState(Boolean(subtitleUrl));
  const progressRef = useRef<HTMLDivElement>(null);

  const controlsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef    = useRef(0);
  const tapZoneRef     = useRef<'left' | 'center' | 'right'>('center');
  const doubleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouchRef   = useRef(0);
  const showControlsRef = useRef(showControls);
  const speedDropdownRef = useRef<HTMLDivElement>(null);
  const qualityDropdownRef = useRef<HTMLDivElement>(null);
  const initialTimeRef = useRef(initialTime);
  const seekDoneRef = useRef(false);
  const seekRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeUpdateRef = useRef(0);
  const timeUpdateCallbacks = useRef<{ onTimeUpdate?: (time: number, duration: number) => void }>({});
  const onEndedRef = useRef(onEnded);
  const onVideoEndedRef = useRef(onVideoEnded);

  /* Error recovery state */
  const fatalRetryCount = useRef(0);
  const MAX_FATAL_RETRIES = 3;
  const downgradedLevel = useRef(false);

  useEffect(() => { showControlsRef.current = showControls; }, [showControls]);
  useEffect(() => { timeUpdateCallbacks.current.onTimeUpdate = onTimeUpdate; }, [onTimeUpdate]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onVideoEndedRef.current = onVideoEnded; }, [onVideoEnded]);

  /* ── Subtitle/caption handling ── */
  useEffect(() => {
    setCaptionsEnabled(Boolean(subtitleUrl));
  }, [subtitleUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateTextTracks = () => {
      for (const track of Array.from(video.textTracks)) {
        track.mode = captionsEnabled ? 'showing' : 'disabled';
      }
    };

    updateTextTracks();
    video.addEventListener('loadedmetadata', updateTextTracks);
    const tracksTarget = video.textTracks as unknown as EventTarget;
    if (tracksTarget && typeof tracksTarget.addEventListener === 'function') {
      tracksTarget.addEventListener('addtrack', updateTextTracks);
    }

    return () => {
      video.removeEventListener('loadedmetadata', updateTextTracks);
      if (tracksTarget && typeof tracksTarget.removeEventListener === 'function') {
        tracksTarget.removeEventListener('addtrack', updateTextTracks);
      }
    };
  }, [captionsEnabled, subtitleUrl]);

  /* ── Cleanup dangling timers on unmount ── */
  useEffect(() => {
    return () => {
      if (controlsTimer.current) { clearTimeout(controlsTimer.current); controlsTimer.current = null; }
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      if (doubleTapTimer.current) { clearTimeout(doubleTapTimer.current); doubleTapTimer.current = null; }
      if (playFlashTimer.current) { clearTimeout(playFlashTimer.current); playFlashTimer.current = null; }
      if (seekRetryTimer.current) { clearTimeout(seekRetryTimer.current); seekRetryTimer.current = null; }
    };
  }, []);

  /* ── HLS cleanup: cancel video.src on unmount ── */
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) {
        video.src = '';
        video.load();
      }
    };
  }, []);

  /* ── Auto-hide controls ── */
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (isFullscreen) return;
    controlsTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3500);
  }, [isPlaying, isFullscreen]);

  const triggerPlayFlash = useCallback((type: 'play' | 'pause') => {
    setPlayFlash(type);
    if (playFlashTimer.current) clearTimeout(playFlashTimer.current);
    playFlashTimer.current = setTimeout(() => setPlayFlash(null), 600);
  }, []);

  /* ── Stats polling ── */
  const startStatsPolling = useCallback((hls: Hls) => {
    if (statsTimer.current) clearInterval(statsTimer.current);
    hlsRef.current = hls;
  }, []);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!showStats || !hls) {
      if (statsTimer.current) { clearInterval(statsTimer.current); statsTimer.current = null; }
      return;
    }
    statsTimer.current = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      let bufLen = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
          bufLen = video.buffered.end(i) - video.currentTime;
          break;
        }
      }
      const quality = (video as HTMLVideoElement & { getVideoPlaybackQuality?: () => { droppedVideoFrames: number } }).getVideoPlaybackQuality?.();
      const dropped = quality?.droppedVideoFrames ?? 0;
      const lvl = hls.levels[hls.currentLevel];
      const bitrate = lvl?.bitrate ?? 0;
      setStats({ bandwidth: hls.bandwidthEstimate ?? 0, bufferLength: bufLen, currentBitrate: bitrate, droppedFrames: dropped, latency: 0 });
      setAutoLevel(hls.currentLevel);
    }, 2000);
    return () => {
      if (statsTimer.current) { clearInterval(statsTimer.current); statsTimer.current = null; }
    };
  }, [showStats]);

  /* ── Init HLS with error recovery ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setLoaded(false);
    setHasError(false);
    setErrorMsg('');
    setLevels([]);
    setCurrentLevel(-1);
    setAutoLevel(-1);
    setIsBuffering(false);
    fatalRetryCount.current = 0;
    downgradedLevel.current = false;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 20,
        maxMaxBufferLength: 40,
        maxBufferSize: 20 * 1_000_000,
        maxBufferHole: 0.5,
        abrEwmaFastLive: 3.0,
        abrEwmaSlowLive: 9.0,
        abrEwmaFastVoD: 3.0,
        abrEwmaSlowVoD: 9.0,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.85,
        capLevelToPlayerSize: true,
        maxStarvationDelay: 4,
        maxLoadingDelay: 4,
        fragLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 15_000,
        manifestLoadingTimeOut: 8_000,
        startLevel: -1,
        abrMaxWithRealBitrate: true,
      });

      hlsRef.current = hls;
      // Defer heavy load to avoid blocking main thread during mount
      setTimeout(() => {
        hls.loadSource(src);
        hls.attachMedia(video);
      }, 0);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const lvls: QualityLevel[] = data.levels.map((l, i) => ({
          index: i,
          height: l.height ?? 0,
          width: l.width ?? 0,
          bitrate: l.bitrate ?? 0,
          name: getQualityLabel({ index: i, height: l.height ?? 0, width: l.width ?? 0, bitrate: l.bitrate ?? 0, name: '' }),
        }));
        lvls.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
        setLevels(lvls);
        setLoaded(true);
        startStatsPolling(hls);

        if (data.levels.length > 0) {
          let bestIndex = 0;
          let bestBitrate = 0;
          data.levels.forEach((l, i) => {
            if ((l.bitrate ?? 0) > bestBitrate) {
              bestBitrate = l.bitrate ?? 0;
              bestIndex = i;
            }
          });
          hls.startLevel = bestIndex;
        }

        if (initialTime > 0) video.currentTime = initialTime;
        if (autoPlay) video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => setAutoLevel(data.level));

      /* ════════════════════════════════════════════
         SMART ERROR RECOVERY — auto-retry + downgrade
         ════════════════════════════════════════════ */
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) {
          if (d.type === 'networkError') {
            // Retry logic: attempt to recover network error
            if (fatalRetryCount.current < MAX_FATAL_RETRIES) {
              fatalRetryCount.current += 1;
              setIsBuffering(true);
              setErrorMsg(`Đang thử kết nối lại (${fatalRetryCount.current}/${MAX_FATAL_RETRIES})...`);
              setHasError(false);
              
              // Wait a bit then try to recover
              setTimeout(() => {
                if (hlsRef.current) {
                  hlsRef.current.startLoad();
                  setIsBuffering(false);
                }
              }, 1500 * fatalRetryCount.current);
              return;
            }
            
            // After retries exhausted, try downgrade quality
            if (!downgradedLevel.current && hls.levels.length > 1) {
              downgradedLevel.current = true;
              fatalRetryCount.current = 0;
              const currentLvl = hls.currentLevel;
              const nextLvl = Math.max(0, currentLvl - 1);
              if (nextLvl !== currentLvl) {
                hls.currentLevel = nextLvl;
                setCurrentLevel(nextLvl);
                setErrorMsg(`Giảm chất lượng xuống ${getQualityLabel({
                  index: nextLvl,
                  height: hls.levels[nextLvl]?.height ?? 0,
                  width: hls.levels[nextLvl]?.width ?? 0,
                  bitrate: hls.levels[nextLvl]?.bitrate ?? 0,
                  name: '',
                })} — thử kết nối lại...`);
                setHasError(false);
                hls.startLoad();
                return;
              }
            }
            
            // Final fallback: notify parent to switch server
            setHasError(true);
            setErrorMsg('Lỗi mạng — không thể tải stream');
            onFatalError?.();
          } else if (d.type === 'mediaError') {
            // Try media recovery
            if (fatalRetryCount.current < MAX_FATAL_RETRIES) {
              fatalRetryCount.current += 1;
              setTimeout(() => hls.recoverMediaError(), 500);
              return;
            }
            setHasError(true);
            setErrorMsg('Lỗi giải mã stream');
            onFatalError?.();
          } else {
            setHasError(true);
            setErrorMsg('Lỗi không xác định');
            onFatalError?.();
          }
        }
      });

      return () => {
        if (statsTimer.current) clearInterval(statsTimer.current);
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      setTimeout(() => { video.src = src; }, 0);
      const onMeta  = () => { setLoaded(true); if (initialTime > 0) video.currentTime = initialTime; if (autoPlay) video.play().catch(() => {}); };
      const onError = () => { setHasError(true); setErrorMsg('Không thể phát stream'); };
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('error', onError);
      return () => {
        video.removeEventListener('loadedmetadata', onMeta);
        video.removeEventListener('error', onError);
        video.src = '';
        video.load();
      };
    } else {
      setHasError(true);
      setErrorMsg('Trình duyệt không hỗ trợ HLS');
    }
  }, [src, autoPlay, startStatsPolling]);

  /* ── Seek retry ── */
  useEffect(() => {
    initialTimeRef.current = initialTime;
    seekDoneRef.current = false;
    if (seekRetryTimer.current) { clearTimeout(seekRetryTimer.current); seekRetryTimer.current = null; }

    const video = videoRef.current;
    if (!video || initialTime <= 0) return;

    const trySeek = () => {
      if (!video || seekDoneRef.current) return;
      if (video.readyState >= 1 && video.duration > 0) {
        video.currentTime = initialTimeRef.current;
        seekDoneRef.current = true;
        if (seekRetryTimer.current) { clearTimeout(seekRetryTimer.current); seekRetryTimer.current = null; }
      }
    };

    trySeek();
    let attempts = 0;
    const maxAttempts = 15;
    const retry = () => {
      if (seekDoneRef.current || attempts >= maxAttempts) return;
      attempts++;
      trySeek();
      if (!seekDoneRef.current) seekRetryTimer.current = setTimeout(retry, 200);
    };
    seekRetryTimer.current = setTimeout(retry, 200);

    return () => {
      if (seekRetryTimer.current) { clearTimeout(seekRetryTimer.current); seekRetryTimer.current = null; }
    };
  }, [initialTime]);

  /* ── Video events — THROTTLE timeupdate ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay    = () => setIsPlaying(true);
    const onPause   = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onTime    = () => {
      const now = Date.now();
      if (now - lastTimeUpdateRef.current < 250) return;
      lastTimeUpdateRef.current = now;
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      timeUpdateCallbacks.current.onTimeUpdate?.(video.currentTime, video.duration || 0);
    };
    const onVol     = () => { setVolume(video.volume); setIsMuted(video.muted); };
    const onEnd     = () => { setIsPlaying(false); onEndedRef.current?.(); onVideoEndedRef.current?.(); };
    const onFS = () => {
      const docEl = document as Document & { webkitFullscreenElement?: Element };
      const fs = Boolean(document.fullscreenElement || docEl.webkitFullscreenElement);
      setIsFullscreen(fs);
    };
    const onIOSBegin = () => setIsFullscreen(true);
    const onIOSEnd   = () => setIsFullscreen(false);

    /* Picture-in-Picture events */
    const onEnterPiP = () => setIsPiP(true);
    const onLeavePiP = () => setIsPiP(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('volumechange', onVol);
    video.addEventListener('ended', onEnd);
    video.addEventListener('webkitbeginfullscreen', onIOSBegin);
    video.addEventListener('webkitendfullscreen', onIOSEnd);
    document.addEventListener('fullscreenchange', onFS);
    document.addEventListener('webkitfullscreenchange', onFS);
    video.addEventListener('enterpictureinpicture', onEnterPiP);
    video.addEventListener('leavepictureinpicture', onLeavePiP);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('volumechange', onVol);
      video.removeEventListener('ended', onEnd);
      video.removeEventListener('webkitbeginfullscreen', onIOSBegin);
      video.removeEventListener('webkitendfullscreen', onIOSEnd);
      document.removeEventListener('fullscreenchange', onFS);
      document.removeEventListener('webkitfullscreenchange', onFS);
      video.removeEventListener('enterpictureinpicture', onEnterPiP);
      video.removeEventListener('leavepictureinpicture', onLeavePiP);
    };
  }, []);

  /* ── Controls ── */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); triggerPlayFlash('play'); }
    else { v.pause(); triggerPlayFlash('pause'); }
  }, [triggerPlayFlash]);

  /* ── Progress bar ── */
  const getPctFromEvent = useCallback((clientX: number, rect: DOMRect) => {
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const seekToPct = useCallback((pct: number) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    v.currentTime = pct * duration;
  }, [duration]);

  const handleProgressMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = getPctFromEvent(e.clientX, rect);
    setHoverPct(pct * 100);
    setHoverTime(pct * duration);
    if (isDragging) seekToPct(pct);
  }, [duration, isDragging, getPctFromEvent, seekToPct]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    seekToPct(getPctFromEvent(e.clientX, rect));
  }, [getPctFromEvent, seekToPct]);

  const handleProgressMouseUp = useCallback(() => setIsDragging(false), []);

  const handleProgressMouseLeave = useCallback(() => {
    setHoverTime(null);
    if (isDragging) setIsDragging(false);
  }, [isDragging]);

  const handleProgressTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.changedTouches[0].clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
  }, [duration]);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted  = val === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el) return;

    const iosVideo = video as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitExitFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    };

    if (iosVideo?.webkitEnterFullscreen && !document.fullscreenElement) {
      if (iosVideo.webkitDisplayingFullscreen) iosVideo.webkitExitFullscreen?.();
      else iosVideo.webkitEnterFullscreen();
      return;
    }

    const docEl = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const containerEl = el as HTMLDivElement & { webkitRequestFullscreen?: () => void };
    const isFullscreenNow = document.fullscreenElement || docEl.webkitFullscreenElement;

    if (!isFullscreenNow) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => { if (iosVideo?.webkitEnterFullscreen) iosVideo.webkitEnterFullscreen(); });
      } else if (containerEl.webkitRequestFullscreen) {
        containerEl.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (docEl.webkitExitFullscreen) docEl.webkitExitFullscreen();
    }
  }, []);

  /* ── Picture-in-Picture toggle ── */
  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // PiP not supported or blocked
    }
  }, []);

  /* ── Overlay click ── */
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastTouchRef.current < 500) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-controls]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (pct >= 0.30 && pct <= 0.70) togglePlay();
    resetControlsTimer();
  }, [togglePlay, resetControlsTimer]);

  /* ── Touch handling ── */
  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    lastTouchRef.current = Date.now();
    const target = e.target as HTMLElement;
    if (target.closest('[data-controls]')) return;
    e.preventDefault();

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.changedTouches[0].clientX - rect.left;
    const pct = x / rect.width;
    const zone: 'left' | 'center' | 'right' = pct < 0.30 ? 'left' : pct > 0.70 ? 'right' : 'center';

    if (tapZoneRef.current !== zone) { tapCountRef.current = 0; tapZoneRef.current = zone; }
    tapCountRef.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);

    tapTimer.current = setTimeout(() => {
      const count = tapCountRef.current;
      tapCountRef.current = 0;

      if (zone === 'center') {
        togglePlay();
        resetControlsTimer();
      } else if (count >= 2) {
        const secsPerTap = zone === 'left' ? 5 : 10;
        const secs = secsPerTap * (count - 1);
        if (zone === 'right') v.currentTime = Math.min(v.currentTime + secs, v.duration);
        else v.currentTime = Math.max(v.currentTime - secs, 0);
        setDoubleTapSide(zone);
        setDoubleTapCount(secs);
        if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
        doubleTapTimer.current = setTimeout(() => setDoubleTapSide(null), 800);
        resetControlsTimer();
      } else {
        if (showControlsRef.current) setShowControls(false);
        else resetControlsTimer();
      }
    }, 280);
  }, [togglePlay, resetControlsTimer]);

  const changeSpeed = useCallback((speed: SpeedOption) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSpeed(false);
  }, []);

  const switchQuality = useCallback((levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = levelIndex;
    setCurrentLevel(levelIndex);
    setShowQuality(false);
    // Reset retry counters when user manually picks a level
    fatalRetryCount.current = 0;
    downgradedLevel.current = false;
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v || (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body)) return;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'm': case 'M': toggleMute(); break;
        case 'i': case 'I': togglePiP(); break;
        case '>': {
          const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
          if (idx < SPEED_OPTIONS.length - 1) changeSpeed(SPEED_OPTIONS[idx + 1] as SpeedOption);
          break;
        }
        case '<': {
          const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
          if (idx > 0) changeSpeed(SPEED_OPTIONS[idx - 1] as SpeedOption);
          break;
        }
        case 'ArrowRight': v.currentTime = Math.min(v.currentTime + 5, v.duration); break;
        case 'ArrowLeft':  v.currentTime = Math.max(v.currentTime - 5, 0); break;
        case 'ArrowUp':    changeVolume(Math.min(v.volume + 0.1, 1)); break;
        case 'ArrowDown':  changeVolume(Math.max(v.volume - 0.1, 0)); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, toggleFullscreen, toggleMute, togglePiP, changeVolume, playbackSpeed, changeSpeed]);

  /* ── Cursor keeper ── */
  useEffect(() => {
    const keeper = cursorKeeperRef.current;
    if (!keeper) return;
    const onMove = () => { if (isFullscreen) resetControlsTimer(); };
    keeper.addEventListener('mousemove', onMove);
    return () => keeper.removeEventListener('mousemove', onMove);
  }, [isFullscreen, resetControlsTimer]);

  /* ── Global mouse up for drag ── */
  useEffect(() => {
    const onUp = () => { if (isDragging) setIsDragging(false); };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [isDragging]);

  /* ── Click outside dropdowns ── */
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showSpeed && speedDropdownRef.current && !speedDropdownRef.current.contains(target)) setShowSpeed(false);
      if (showQuality && qualityDropdownRef.current && !qualityDropdownRef.current.contains(target)) setShowQuality(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showSpeed, showQuality]);

  /* ── Close dropdowns when controls hide ── */
  useEffect(() => {
    if (!showControls) { setShowSpeed(false); setShowQuality(false); }
  }, [showControls]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = Math.min((stats.bufferLength / 30) * 100, 100);

  const activeQuality = currentLevel === -1
    ? (autoLevel >= 0 && levels.find(l => l.index === autoLevel)
        ? `${levels.find(l => l.index === autoLevel)?.name ?? 'Auto'} (Auto)`
        : 'Tự Động')
    : (levels.find(l => l.index === currentLevel)?.name ?? 'Auto');

  const activeQualityShort = currentLevel === -1
    ? (autoLevel >= 0 && levels.find(l => l.index === autoLevel)
        ? levels.find(l => l.index === autoLevel)!.name
        : 'Auto')
    : (levels.find(l => l.index === currentLevel)?.name ?? 'Auto');

  /* ── Error state ── */
  if (hasError) {
    return (
      <div className="aspect-video w-full bg-[#0d0f1a] rounded-xl flex items-center justify-center border border-white/5">
        <div className="text-center px-6 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-3">
            <i className="ri-wifi-off-line text-2xl text-red-400" />
          </div>
          <p className="text-white/60 text-sm font-medium mb-1.5">{errorMsg || 'Không thể tải video'}</p>
          <p className="text-white/30 text-xs leading-relaxed">
            Hệ thống đã tự động thử lại nhiều lần. Bạn có thể chuyển sang <strong className="text-white/50">chế độ Nhúng</strong> hoặc đợi vài phút rồi thử lại.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full bg-black rounded-xl overflow-hidden group select-none"
      style={{ cursor: 'default' }}
      onMouseMove={resetControlsTimer}
      onMouseEnter={resetControlsTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* ── Video element ── */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        style={{ cursor: 'default' }}
        preload="metadata"
        poster={poster}
        title={title}
        playsInline
        crossOrigin="anonymous"
      />

      {/* ── Cursor keeper ── */}
      <div
        ref={cursorKeeperRef}
        className="absolute inset-0 z-10"
        style={{
          cursor: 'default',
          pointerEvents: isFullscreen ? 'auto' : 'none',
        }}
      />

      {/* ── Loading overlay ── */}
      {!loaded && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black">
          <div className="relative w-16 h-16 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-red-500/10 border-t-red-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-white/5 border-t-white/20 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
          </div>
          <p className="text-white/40 text-sm">Đang kết nối stream HLS...</p>
          <p className="text-white/20 text-xs mt-1">Adaptive Bitrate Streaming</p>
        </div>
      )}

      {/* ── Buffering spinner ── */}
      {loaded && isBuffering && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
        </div>
      )}

      {/* ── Retry / Recovery notification ── */}
      {loaded && errorMsg && !hasError && (
        <div className="absolute top-3 right-3 z-40 bg-black/80 border border-amber-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
          <span className="text-amber-300/80 text-[11px] font-medium">{errorMsg}</span>
        </div>
      )}

      {/* ── Double-tap ripple ── */}
      {doubleTapSide && (
        <div
          className={`absolute inset-y-0 z-30 pointer-events-none flex items-center justify-center ${
            doubleTapSide === 'left' ? 'left-0 w-1/3' : 'right-0 w-1/3'
          }`}
        >
          <div className="relative flex flex-col items-center justify-center gap-1">
            <div className="absolute w-24 h-24 rounded-full bg-white/8 animate-ping" style={{ animationDuration: '0.5s' }} />
            <div className="absolute w-16 h-16 rounded-full bg-white/10 animate-ping" style={{ animationDuration: '0.5s', animationDelay: '0.05s' }} />
            <div className="relative w-16 h-16 rounded-full bg-black/50 flex flex-col items-center justify-center border border-white/20">
              <i className={`${doubleTapSide === 'left' ? 'ri-rewind-fill' : 'ri-speed-fill'} text-white text-xl`} />
              <span className="text-white text-[11px] font-bold leading-none mt-0.5">
                {doubleTapSide === 'left' ? `-${doubleTapCount}s` : `+${doubleTapCount}s`}
              </span>
            </div>
            <div className="flex gap-0.5 mt-1">
              {[0, 1, 2].map(i => (
                <i key={i} className={`text-white/60 text-xs ${doubleTapSide === 'left' ? 'ri-arrow-left-s-line' : 'ri-arrow-right-s-line'}`} style={{ opacity: 1 - i * 0.25 }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Play/Pause center flash ── */}
      {playFlash && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div
            key={playFlash}
            className="w-20 h-20 rounded-full bg-black/60 flex items-center justify-center border border-white/15"
            style={{ animation: 'playerFlash 0.55s ease-out forwards' }}
          >
            <i className={`${playFlash === 'play' ? 'ri-play-fill ml-1' : 'ri-pause-fill'} text-4xl text-white`} />
          </div>
        </div>
      )}

      {/* ── Stats overlay ── */}
      {showStats && loaded && (
        <div
          className="absolute top-3 left-3 z-30 bg-black/90 border border-white/10 rounded-xl p-3 min-w-[220px] text-[11px] font-mono"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
            <span className="text-white/60 font-sans font-semibold text-[10px] uppercase tracking-wider">Thống Kê Kỹ Thuật</span>
            <button onClick={() => setShowStats(false)} className="text-white/30 hover:text-white cursor-pointer">
              <i className="ri-close-line text-sm" />
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-4"><span className="text-white/35">Băng thông</span><span className="text-emerald-400 font-semibold">{formatBandwidth(stats.bandwidth)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-white/35">Bitrate hiện tại</span><span className="text-amber-400 font-semibold">{formatBitrate(stats.currentBitrate)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-white/35">Buffer</span><span className={stats.bufferLength >= 10 ? 'text-emerald-400' : 'text-orange-400'}>{stats.bufferLength.toFixed(1)}s</span></div>
            <div className="flex justify-between gap-4"><span className="text-white/35">Frames bị drop</span><span className={stats.droppedFrames > 10 ? 'text-red-400' : 'text-white/50'}>{stats.droppedFrames}</span></div>
            <div className="flex justify-between gap-4"><span className="text-white/35">Chất lượng</span><span className="text-white/70">{activeQuality}</span></div>
            <div className="flex justify-between gap-4"><span className="text-white/35">Chế độ ABR</span><span className={currentLevel === -1 ? 'text-emerald-400' : 'text-amber-400'}>{currentLevel === -1 ? 'Tự động' : 'Thủ công'}</span></div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-white/10">
            <div className="flex justify-between text-[10px] text-white/25 mb-1"><span>Buffer health</span><span>{Math.round(bufferPct)}%</span></div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${getBufferColor(stats.bufferLength)}`} style={{ width: `${bufferPct}%` }} /></div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          CONTROLS OVERLAY
      ══════════════════════════════════════ */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-end transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleOverlayClick}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Gradient ── */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
        </div>

        {/* ── Pause: big play button ── */}
        {!isPlaying && loaded && !isBuffering && !playFlash && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-black/55 flex items-center justify-center border border-white/15 transition-transform duration-200 hover:scale-110">
              <i className="ri-play-fill text-4xl text-white ml-1" />
            </div>
          </div>
        )}

        {/* ── Top bar ── */}
        <div
          data-controls
          className="relative z-10 flex items-center justify-between px-4 pt-3 pb-1"
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <p className="hidden sm:block text-white/80 text-sm font-medium truncate max-w-[55%] drop-shadow-sm">{title}</p>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            {loaded && (
              <div className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${getQualityBadgeColor(activeQualityShort)}`}>
                <i className="ri-hd-line text-xs" />
                {activeQualityShort}
                {currentLevel === -1 && <span className="text-[9px] opacity-60">AUTO</span>}
              </div>
            )}
            {loaded && stats.bandwidth > 0 && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-black/40 border border-white/10 text-white/50">
                <i className="ri-wifi-line text-xs text-emerald-400" />
                {formatBandwidth(stats.bandwidth)}
              </div>
            )}
            <button
              onClick={() => setShowStats((v) => !v)}
              title="Thống kê kỹ thuật"
              className={`hidden sm:flex w-7 h-7 items-center justify-center rounded-lg transition-all cursor-pointer border ${
                showStats ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-black/40 border-white/10 text-white/40 hover:text-white hover:border-white/25'
              }`}
            >
              <i className="ri-bar-chart-2-line text-sm" />
            </button>
          </div>
        </div>

        {/* ── Bottom controls ── */}
        <div
          data-controls
          className="relative z-10 px-3 pb-3 sm:px-4 sm:pb-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Progress bar ── */}
          <div
            ref={progressRef}
            data-controls
            className="w-full cursor-pointer mb-3 relative group/progress"
            style={{ paddingTop: 10, paddingBottom: 10 }}
            onMouseMove={handleProgressMouseMove}
            onMouseDown={handleProgressMouseDown}
            onMouseUp={handleProgressMouseUp}
            onMouseLeave={handleProgressMouseLeave}
            onTouchEnd={handleProgressTouchEnd}
          >
            {hoverTime !== null && (
              <div className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none z-50" style={{ left: `${hoverPct}%` }}>
                <div className="bg-black/90 border border-white/15 text-white text-[11px] font-mono font-semibold px-2 py-1 rounded-lg whitespace-nowrap shadow-xl">
                  {fmtTime(hoverTime)}
                </div>
                <div className="w-2 h-2 bg-black/90 border-r border-b border-white/15 rotate-45 mx-auto -mt-1" />
              </div>
            )}

            <div
              className={`w-full rounded-full relative overflow-hidden transition-all duration-150 ${hoverTime !== null || isDragging ? 'h-1.5' : 'h-1'}`}
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/20" style={{ width: `${Math.min(progress + bufferPct * 0.3, 100)}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-red-500 transition-none" style={{ width: `${progress}%` }} />
              {hoverTime !== null && hoverPct > progress && (
                <div className="absolute inset-y-0 rounded-full bg-red-400/30" style={{ left: `${progress}%`, width: `${hoverPct - progress}%` }} />
              )}
            </div>

            <div
              className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-lg transition-all duration-150 ${
                hoverTime !== null || isDragging ? 'w-4 h-4 opacity-100' : 'w-3 h-3 opacity-0 group-hover/progress:opacity-100'
              }`}
              style={{ left: `calc(${progress}% - ${hoverTime !== null || isDragging ? 8 : 6}px)` }}
            />
          </div>

          {/* ── Control row ── */}
          <div data-controls className="flex items-center gap-2 sm:gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={togglePlay}
              className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-full bg-white/15 active:bg-white/30 sm:hover:bg-white/20 text-white transition-all cursor-pointer border border-white/10 flex-shrink-0"
            >
              <i className={`${isPlaying ? 'ri-pause-fill' : 'ri-play-fill'} text-xl sm:text-lg ${!isPlaying ? 'ml-0.5' : ''}`} />
            </button>

            <div className="hidden sm:flex items-center gap-2 group/vol">
              <button onClick={toggleMute} className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer">
                <i className={`text-base ${isMuted || volume === 0 ? 'ri-volume-mute-line text-red-400' : volume < 0.5 ? 'ri-volume-down-line' : 'ri-volume-up-line'}`} />
              </button>
              <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-200">
                <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} className="w-20 h-1 accent-red-500 cursor-pointer" onClick={(e) => e.stopPropagation()} />
              </div>
            </div>

            <span className="text-white/70 text-[11px] sm:text-xs font-mono whitespace-nowrap drop-shadow-sm">
              {fmtTime(currentTime)}<span className="text-white/35"> / {fmtTime(duration)}</span>
            </span>

            <div className="flex-1" />

            {/* Captions */}
            {subtitleUrl && (
              <button
                onClick={() => setCaptionsEnabled((v) => !v)}
                title="Phụ đề Tiếng Việt"
                className={`w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-white/70 active:text-white sm:hover:text-white transition-all cursor-pointer flex-shrink-0 ${captionsEnabled ? 'text-cyan-300' : ''}`}
              >
                <i className="ri-closed-captioning-line text-xl sm:text-lg" />
              </button>
            )}
            
            {/* PiP */}
            {document.pictureInPictureEnabled && (
              <button
                onClick={togglePiP}
                title={isPiP ? 'Thoát Picture-in-Picture' : 'Picture-in-Picture'}
                className={`w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-white/70 active:text-white sm:hover:text-white transition-all cursor-pointer flex-shrink-0 ${isPiP ? 'text-red-400' : ''}`}
              >
                <i className={`${isPiP ? 'ri-picture-in-picture-exit-line' : 'ri-picture-in-picture-line'} text-xl sm:text-lg`} />
              </button>
            )}

            {/* Speed */}
            <div className="relative" ref={speedDropdownRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSpeed((v) => !v); setShowQuality(false); }}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border whitespace-nowrap ${
                  showSpeed ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-black/50 border-white/15 text-white/70 active:bg-white/10 sm:hover:text-white sm:hover:border-white/30'
                }`}
              >
                <i className="ri-speed-up-line text-sm" />
                <span className="hidden xs:inline">{playbackSpeed === 1 ? '1x' : `${playbackSpeed}x`}</span>
              </button>
              {showSpeed && (
                <div className="absolute bottom-full right-0 mb-2 bg-[#0a0c14]/97 border border-white/10 rounded-xl overflow-hidden z-50" style={{ minWidth: 160 }} onClick={(e) => e.stopPropagation()}>
                  <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
                    <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Tốc Độ Phát</p>
                    <button onClick={() => setShowSpeed(false)} className="text-white/30 cursor-pointer w-5 h-5 flex items-center justify-center"><i className="ri-close-line text-sm" /></button>
                  </div>
                  {SPEED_OPTIONS.map((speed) => (
                    <button key={speed} onClick={() => changeSpeed(speed as SpeedOption)} className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${playbackSpeed === speed ? 'text-red-400 bg-red-500/10 font-semibold' : 'text-white/60 active:bg-white/5 hover:bg-white/5'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px]">{speed === 1 ? '1x — Bình thường' : `${speed}x`}</span>
                        {speed === 0.5 && <span className="text-[10px] text-white/25">Chậm</span>}
                        {speed === 2 && <span className="text-[10px] text-white/25">Nhanh</span>}
                      </div>
                      {playbackSpeed === speed && <i className="ri-check-line text-xs text-red-400 flex-shrink-0" />}
                    </button>
                  ))}
                  <div className="px-3 py-2 border-t border-white/[0.06]"><p className="text-[10px] text-white/20">&lt; &gt; để điều chỉnh nhanh</p></div>
                </div>
              )}
            </div>

            {/* Quality */}
            {loaded && levels.length > 0 && (
              <div className="relative" ref={qualityDropdownRef}>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowQuality((v) => !v); setShowSpeed(false); }}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border whitespace-nowrap ${
                    showQuality ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-black/50 border-white/15 text-white/70 active:bg-white/10 sm:hover:text-white sm:hover:border-white/30'
                  }`}
                >
                  <i className="ri-hd-line text-sm" />
                  <span className="hidden xs:inline">{activeQualityShort}</span>
                  {currentLevel === -1 && <span className="hidden sm:inline text-[9px] opacity-60 ml-0.5">AUTO</span>}
                </button>
                {showQuality && (
                  <div className="absolute bottom-full right-0 mb-2 bg-[#0a0c14]/97 border border-white/10 rounded-xl overflow-hidden z-50" style={{ minWidth: 180, maxHeight: '60vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                    <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
                      <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Chất Lượng</p>
                      <button onClick={() => setShowQuality(false)} className="text-white/30 cursor-pointer w-5 h-5 flex items-center justify-center"><i className="ri-close-line text-sm" /></button>
                    </div>
                    <button onClick={() => switchQuality(-1)} className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${currentLevel === -1 ? 'text-red-400 bg-red-500/10 font-semibold' : 'text-white/60 active:bg-white/5 hover:bg-white/5'}`}>
                      <div>
                        <p className="text-[13px]">Tự Động (Tốt nhất)</p>
                        <p className="text-[10px] text-white/25 mt-0.5">
                          {autoLevel >= 0 && levels.find(l => l.index === autoLevel) ? `Đang phát: ${levels.find(l => l.index === autoLevel)!.name} — tự điều chỉnh theo mạng` : 'Ưu tiên chất lượng cao nhất'}
                        </p>
                      </div>
                      {currentLevel === -1 && <i className="ri-check-line text-xs text-red-400 flex-shrink-0" />}
                    </button>
                    {levels.map((lvl) => {
                      const isActive = currentLevel === lvl.index;
                      const isAutoActive = currentLevel === -1 && autoLevel === lvl.index;
                      return (
                        <button key={lvl.index} onClick={() => switchQuality(lvl.index)} className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${isActive ? 'text-red-400 bg-red-500/10 font-semibold' : 'text-white/60 active:bg-white/5 hover:bg-white/5'}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px]">{lvl.name}</span>
                            {isAutoActive && <span className="text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded-md">AUTO</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] text-white/25">{formatBitrate(lvl.bitrate)}</span>
                            {isActive && <i className="ri-check-line text-xs text-red-400" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-white/70 active:text-white sm:hover:text-white transition-all cursor-pointer flex-shrink-0"
            >
              <i className={`${isFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} text-xl sm:text-lg`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}