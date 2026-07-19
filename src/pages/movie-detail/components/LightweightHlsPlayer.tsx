import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

interface Props {
  src: string;
  poster?: string;
  title?: string;
  subtitleUrl?: string;
  autoPlay?: boolean;
  initialTime?: number;
  onTimeUpdate?: (time: number, duration: number) => void;
  onEnded?: () => void;
  onVideoEnded?: () => void;
  onFatalError?: () => void;
  onPlayerIssue?: (issue: {
    event_type: 'hls_retry' | 'hls_fatal_retry' | 'hls_media_retry' | 'hls_fatal' | 'stall_recovery' | 'stall_fatal' | 'native_hls_error';
    playback_time?: number;
    duration?: number;
    buffered_ahead?: number;
    error_message?: string;
  }) => void;
}

interface HlsQualityLevel {
  index: number;
  height: number;
  bitrate: number;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];
const MAX_STREAM_RECOVERY_ATTEMPTS = 5;
const MAX_NON_FATAL_NETWORK_RETRIES = 2;
const STALL_RECOVERY_DELAY_MS = 3500;
const STALL_PROGRESS_CHECK_MS = 2500;
const STALL_MIN_PROGRESS_SECONDS = 0.05;
const PLAYER_LOGO_URL = '/brand/khophim-logo-v2.png';

function getPlaybackProfile() {
  if (typeof window === 'undefined') {
    return {
      maxBufferLength: 36,
      maxMaxBufferLength: 72,
      maxBufferSize: 55_000_000,
      backBufferLength: 20,
    };
  }

  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
    deviceMemory?: number;
  };
  const isSmallScreen = window.innerWidth < 768;
  const saveData = Boolean(nav.connection?.saveData);
  const effectiveType = String(nav.connection?.effectiveType || '').toLowerCase();
  const slowNetwork = saveData || /(^|-)2g$|3g/.test(effectiveType);
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4;
  const lowCpu = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4;
  const lightDevice = isSmallScreen || slowNetwork || lowMemory || lowCpu;

  if (lightDevice) {
    return {
      maxBufferLength: slowNetwork ? 18 : 24,
      maxMaxBufferLength: slowNetwork ? 36 : 48,
      maxBufferSize: slowNetwork ? 24_000_000 : 34_000_000,
      backBufferLength: 10,
    };
  }

  return {
    maxBufferLength: 45,
    maxMaxBufferLength: 90,
    maxBufferSize: 70_000_000,
    backBufferLength: 30,
  };
}

function PlayerWatermark() {
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-30 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-white/85 shadow-lg shadow-black/30 backdrop-blur-md sm:left-4 sm:top-4 sm:gap-2 sm:px-2.5">
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

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function getBufferedAhead(video: HTMLVideoElement): number {
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
      return video.buffered.end(i) - video.currentTime;
    }
  }
  return 0;
}

function pickStableStartLevel(levels: Hls['levels']): number {
  if (!levels.length) return -1;
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
  const maxHeight = isSmallScreen ? 720 : 1080;
  const maxBitrate = isSmallScreen ? 2_800_000 : 5_500_000;
  let bestIndex = 0;
  let bestScore = 0;

  levels.forEach((level, index) => {
    const height = level.height || 0;
    const bitrate = level.bitrate || 0;
    if ((height && height > maxHeight) || (bitrate && bitrate > maxBitrate)) return;
    const score = height * 10_000 + bitrate;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function capToLowerAutoLevel(hls: Hls): boolean {
  if (hls.levels.length <= 1) return false;
  const current = hls.currentLevel >= 0 ? hls.currentLevel : hls.nextLoadLevel;
  const next = Math.max(0, (current > 0 ? current : hls.levels.length - 1) - 1);
  hls.autoLevelCapping = next;
  hls.nextLevel = next;
  return true;
}

function srtToVtt(text: string): string {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const body = normalized
    .replace(/^\s*WEBVTT[^\n]*\n+/i, '')
    .replace(/^\s*\d+\s*\n(?=\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+)/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}
export default function LightweightHlsPlayer({
  src,
  poster,
  title,
  subtitleUrl = '',
  autoPlay = true,
  initialTime = 0,
  onTimeUpdate,
  onEnded,
  onVideoEnded,
  onFatalError,
  onPlayerIssue,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimeRef = useRef(0);
  const lastPlaybackSecondRef = useRef(0);
  const fatalRetryRef = useRef(0);
  const nonFatalNetworkRetryRef = useRef(0);
  const streamRecoveryRef = useRef(0);
  const pseudoFsRef = useRef(false);
  const scrollPositionRef = useRef(0);

  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isBuffering, setIsBuffering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(Boolean(subtitleUrl));
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [levels, setLevels] = useState<HlsQualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  useEffect(() => {
    setCaptionsEnabled(Boolean(subtitleUrl));
  }, [subtitleUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (const track of Array.from(video.textTracks)) {
      track.mode = captionsEnabled ? 'showing' : 'disabled';
    }
  }, [captionsEnabled, subtitleUrl]);
  // Debug: try fetching subtitle to surface CORS/404 issues and attach a Blob track
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !subtitleUrl) return;
    let aborted = false;
    let blobUrl = '';
    let trackEl: HTMLTrackElement | null = null;
    (async () => {
      try {
        const res = await fetch(subtitleUrl, { method: 'GET' });
        
        if (!res.ok) return;
        const text = await res.text();
        if (aborted) return;
        

        // Attach as a Blob-based track (useful to verify parsed VTT and to bypass some URL issues
        // when fetch is allowed). This will also make the track visible in video.textTracks.
        try {
          const vttText = srtToVtt(text);
          const blob = new Blob([vttText], { type: 'text/vtt' });
          blobUrl = URL.createObjectURL(blob);
          trackEl = document.createElement('track');
          trackEl.kind = 'subtitles';
          trackEl.src = blobUrl;
          trackEl.srclang = 'vi';
          trackEl.label = 'Tiếng Việt (blob)';
          trackEl.default = true;
          video.appendChild(trackEl);
          trackEl.addEventListener('load', () => {
            try {
              if (trackEl?.track) trackEl.track.mode = captionsEnabled ? 'showing' : 'disabled';
            } catch { /* ignore */ }
          
          });
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[Subtitle] failed to create blob track', e);
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[Subtitle] fetch error', e);
      }
    })();

    return () => {
      aborted = true;
      if (trackEl?.parentNode) trackEl.parentNode.removeChild(trackEl);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [subtitleUrl, captionsEnabled]);
  /* ── Detect pseudo-fullscreen via resize ── */
  const checkPseudoFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // If element is visually viewport-filling, treat as pseudo fullscreen
    const rect = el.getBoundingClientRect();
    const isPseudo = pseudoFsRef.current || (rect.width >= window.innerWidth - 2 && rect.height >= window.innerHeight - 2);
    if (isPseudo !== isFullscreen) setIsFullscreen(isPseudo);
  }, [isFullscreen]);

  useEffect(() => {
    window.addEventListener('resize', checkPseudoFullscreen);
    return () => window.removeEventListener('resize', checkPseudoFullscreen);
  }, [checkPseudoFullscreen]);

  /* ── Controls auto-hide ── */
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (isPlaying) {
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying]);

  /* ── HLS init ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setLoaded(false);
    setHasError(false);
    setErrorMsg('');
    setIsBuffering(false);
    fatalRetryRef.current = 0;
    nonFatalNetworkRetryRef.current = 0;
    streamRecoveryRef.current = 0;
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (stallMonitorRef.current) {
      clearInterval(stallMonitorRef.current);
      stallMonitorRef.current = null;
    }

    if (Hls.isSupported()) {
      const playbackProfile = getPlaybackProfile();
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: playbackProfile.maxBufferLength,
        maxMaxBufferLength: playbackProfile.maxMaxBufferLength,
        maxBufferSize: playbackProfile.maxBufferSize,
        backBufferLength: playbackProfile.backBufferLength,
        maxBufferHole: 0.75,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        capLevelToPlayerSize: true,
        startLevel: -1,
        testBandwidth: true,
        fragLoadingTimeOut: 12000,
        manifestLoadingTimeOut: 6000,
        levelLoadingTimeOut: 6000,
        fragLoadingMaxRetry: 3,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
        fragLoadingRetryDelay: 1000,
        levelLoadingRetryDelay: 1000,
        manifestLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 8000,
      });
      hlsRef.current = hls;

      setTimeout(() => {
        hls.loadSource(src);
        hls.attachMedia(video);
      }, 0);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const parsedLevels = hls.levels
          .map((level, index) => ({
            index,
            height: level.height || 0,
            bitrate: level.bitrate || 0,
          }))
          .filter((level) => level.height > 0 || level.bitrate > 0)
          .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
        setLevels(parsedLevels);
        const startLevel = pickStableStartLevel(hls.levels);
        if (startLevel >= 0) {
          hls.startLevel = startLevel;
          hls.nextLevel = startLevel;
        }
        setSelectedLevel(-1);
        setLoaded(true);
        video.playbackRate = playbackRate;
        if (initialTime > 0) video.currentTime = initialTime;
        if (autoPlay) video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          const details = String(data.details || '');
          if (data.type === 'networkError' && /frag|level|manifest/i.test(details)) {
            nonFatalNetworkRetryRef.current += 1;
            setIsBuffering(true);
            setErrorMsg('Đang tải lại đoạn phim...');
            onPlayerIssue?.({
              event_type: 'hls_retry',
              playback_time: video.currentTime,
              duration: video.duration || 0,
              buffered_ahead: getBufferedAhead(video),
              error_message: details,
            });
            if (
              nonFatalNetworkRetryRef.current >= MAX_NON_FATAL_NETWORK_RETRIES &&
              getBufferedAhead(video) < 0.75
            ) {
              setHasError(true);
              setErrorMsg('Nguồn phim phản hồi chậm');
              onPlayerIssue?.({
                event_type: 'hls_fatal',
                playback_time: video.currentTime,
                duration: video.duration || 0,
                buffered_ahead: getBufferedAhead(video),
                error_message: `${details || 'network retry limit reached'} after ${nonFatalNetworkRetryRef.current} retries`,
              });
              onFatalError?.();
              return;
            }
            capToLowerAutoLevel(hls);
            hls.startLoad(video.currentTime);
          }
          return;
        }
        if (data.fatal) {
          if (data.type === 'networkError' && fatalRetryRef.current < 3) {
            fatalRetryRef.current += 1;
            setErrorMsg(`Đang thử lại (${fatalRetryRef.current}/3)...`);
            capToLowerAutoLevel(hls);
            setIsBuffering(true);
            setErrorMsg(`Đang kết nối lại nguồn phim (${fatalRetryRef.current}/3)...`);
            onPlayerIssue?.({
              event_type: 'hls_fatal_retry',
              playback_time: video.currentTime,
              duration: video.duration || 0,
              buffered_ahead: getBufferedAhead(video),
              error_message: String(data.details || data.type || 'fatal network error'),
            });
            setTimeout(() => hls.startLoad(video.currentTime), 1500 * fatalRetryRef.current);
          } else if (data.type === 'mediaError' && fatalRetryRef.current < 3) {
            fatalRetryRef.current += 1;
            setErrorMsg(`Đang sửa lỗi giải mã (${fatalRetryRef.current}/3)...`);
            onPlayerIssue?.({
              event_type: 'hls_media_retry',
              playback_time: video.currentTime,
              duration: video.duration || 0,
              buffered_ahead: getBufferedAhead(video),
              error_message: String(data.details || data.type || 'fatal media error'),
            });
            setTimeout(() => hls.recoverMediaError(), 500);
          } else {
            setHasError(true);
            setErrorMsg('Không thể tải video');
            onPlayerIssue?.({
              event_type: 'hls_fatal',
              playback_time: video.currentTime,
              duration: video.duration || 0,
              buffered_ahead: getBufferedAhead(video),
              error_message: String(data.details || data.type || 'fatal hls error'),
            });
            onFatalError?.();
          }
        }
      });

      return () => {
        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
        if (stallMonitorRef.current) {
          clearInterval(stallMonitorRef.current);
          stallMonitorRef.current = null;
        }
        hls.destroy();
        hlsRef.current = null;
        setLevels([]);
        setSelectedLevel(-1);
      };
    }

    // Native HLS (Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      setTimeout(() => { video.src = src; }, 0);
      const onMeta = () => {
        setLoaded(true);
        video.playbackRate = playbackRate;
        if (initialTime > 0) video.currentTime = initialTime;
        if (autoPlay) video.play().catch(() => {});
      };
      const onErr = () => {
        setHasError(true);
        setErrorMsg('Không thể phát stream');
        onPlayerIssue?.({
          event_type: 'native_hls_error',
          playback_time: video.currentTime,
          duration: video.duration || 0,
          buffered_ahead: getBufferedAhead(video),
          error_message: 'native hls video error',
        });
      };
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('error', onErr);
      return () => {
        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
        if (stallMonitorRef.current) {
          clearInterval(stallMonitorRef.current);
          stallMonitorRef.current = null;
        }
        video.removeEventListener('loadedmetadata', onMeta);
        video.removeEventListener('error', onErr);
        video.src = '';
      };
    }

    setHasError(true);
    setErrorMsg('Trình duyệt không hỗ trợ HLS');
    return undefined;
  }, [src, autoPlay, initialTime, onFatalError, onPlayerIssue, retryNonce]);

  /* ── Video events ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const stopStallMonitor = () => {
      if (stallMonitorRef.current) {
        clearInterval(stallMonitorRef.current);
        stallMonitorRef.current = null;
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      stopStallMonitor();
    };
    const clearStallTimer = () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };
    const recoverStalledStream = () => {
      const hls = hlsRef.current;
      if (!hls || video.paused || video.ended) return;
      if (getBufferedAhead(video) > 1.5) return;

      streamRecoveryRef.current += 1;
      if (streamRecoveryRef.current > MAX_STREAM_RECOVERY_ATTEMPTS) {
        setHasError(true);
        setErrorMsg('Nguồn phim phản hồi chậm');
        onPlayerIssue?.({
          event_type: 'stall_fatal',
          playback_time: video.currentTime,
          duration: video.duration || 0,
          buffered_ahead: getBufferedAhead(video),
          error_message: 'stream stalled after max recovery attempts',
        });
        onFatalError?.();
        return;
      }

      const didLowerQuality = capToLowerAutoLevel(hls);
      setIsBuffering(true);
      setErrorMsg(didLowerQuality ? 'Mạng chậm, đang giảm chất lượng và tải lại...' : 'Đang kết nối lại nguồn phim...');
      onPlayerIssue?.({
        event_type: 'stall_recovery',
        playback_time: video.currentTime,
        duration: video.duration || 0,
        buffered_ahead: getBufferedAhead(video),
        error_message: didLowerQuality ? 'stall recovery lowered quality' : 'stall recovery restarted load',
      });
      hls.stopLoad();
      hls.startLoad(video.currentTime);
      video.play().catch(() => {});
    };
    const ensureStallMonitor = () => {
      if (stallMonitorRef.current) return;
      lastPlaybackSecondRef.current = video.currentTime;
      stallMonitorRef.current = setInterval(() => {
        if (video.paused || video.ended || !isFinite(video.duration || 0)) {
          lastPlaybackSecondRef.current = video.currentTime;
          return;
        }
        const progressed = Math.abs(video.currentTime - lastPlaybackSecondRef.current);
        const lowBuffer = getBufferedAhead(video) < 1.2;
        if (progressed < STALL_MIN_PROGRESS_SECONDS && lowBuffer) {
          recoverStalledStream();
        }
        lastPlaybackSecondRef.current = video.currentTime;
      }, STALL_PROGRESS_CHECK_MS);
    };
    const onWaiting = () => {
      setIsBuffering(true);
      clearStallTimer();
      stallTimerRef.current = setTimeout(recoverStalledStream, STALL_RECOVERY_DELAY_MS);
    };
    const onPlaying = () => {
      setIsBuffering(false);
      setErrorMsg('');
      streamRecoveryRef.current = 0;
      nonFatalNetworkRetryRef.current = 0;
      clearStallTimer();
      ensureStallMonitor();
    };
    const onTime = () => {
      const now = Date.now();
      if (now - lastTimeRef.current < 300) return;
      lastTimeRef.current = now;
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      onTimeUpdate?.(video.currentTime, video.duration || 0);
      if (getBufferedAhead(video) > 2) {
        setErrorMsg('');
        streamRecoveryRef.current = 0;
        nonFatalNetworkRetryRef.current = 0;
      }
    };
    const onVol = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const onEnd = () => {
      setIsPlaying(false);
      stopStallMonitor();
      onEnded?.();
      onVideoEnded?.();
    };
    const onFS = () => {
      const docEl = document as Document & { webkitFullscreenElement?: Element };
      const fs = Boolean(document.fullscreenElement || docEl.webkitFullscreenElement);
      setIsFullscreen(fs || pseudoFsRef.current);
    };

    const onIOSBegin = () => setIsFullscreen(true);
    const onIOSEnd   = () => {
      setIsFullscreen(false);
      pseudoFsRef.current = false;
    };
    const onPipEnter = () => setPipActive(true);
    const onPipLeave = () => setPipActive(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onPlaying);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('volumechange', onVol);
    video.addEventListener('ended', onEnd);
    video.addEventListener('enterpictureinpicture', onPipEnter);
    video.addEventListener('leavepictureinpicture', onPipLeave);
    video.addEventListener('webkitbeginfullscreen', onIOSBegin);
    video.addEventListener('webkitendfullscreen', onIOSEnd);
    document.addEventListener('fullscreenchange', onFS);
    document.addEventListener('webkitfullscreenchange', onFS);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onPlaying);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('volumechange', onVol);
      video.removeEventListener('ended', onEnd);
      video.removeEventListener('enterpictureinpicture', onPipEnter);
      video.removeEventListener('leavepictureinpicture', onPipLeave);
      video.removeEventListener('webkitbeginfullscreen', onIOSBegin);
      video.removeEventListener('webkitendfullscreen', onIOSEnd);
      document.removeEventListener('fullscreenchange', onFS);
      document.removeEventListener('webkitfullscreenchange', onFS);
      stopStallMonitor();
      clearStallTimer();
    };
  }, [onTimeUpdate, onEnded, onVideoEnded, onFatalError, onPlayerIssue]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  /* ── Keyboard ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (document.activeElement instanceof HTMLInputElement) return;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'm': case 'M': toggleMute(); break;
        case 'ArrowRight': v.currentTime = Math.min(v.currentTime + 5, v.duration); break;
        case 'ArrowLeft': v.currentTime = Math.max(v.currentTime - 5, 0); break;
        case 'ArrowUp': changeVolume(Math.min(v.volume + 0.1, 1)); break;
        case 'ArrowDown': changeVolume(Math.max(v.volume - 0.1, 0)); break;
        case '>': case '.': setPlaybackRate((rate) => SPEED_OPTIONS[Math.min(SPEED_OPTIONS.length - 1, SPEED_OPTIONS.findIndex((x) => x === rate) + 1)] ?? 2); break;
        case '<': case ',': setPlaybackRate((rate) => SPEED_OPTIONS[Math.max(0, SPEED_OPTIONS.findIndex((x) => x === rate) - 1)] ?? 1); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const playVideo = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    setHasError(false);
    setErrorMsg('');
    try {
      await v.play();
      return;
    } catch {
      try {
        v.muted = true;
        setIsMuted(true);
        await v.play();
        setErrorMsg('Trình duyệt đã chặn âm thanh tự động, phim đang phát ở chế độ tắt tiếng.');
      } catch {
        setErrorMsg('Bấm lại nút phát hoặc đổi nguồn phim khác nếu trình duyệt đang chặn phát video.');
      }
    }
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void playVideo();
    } else {
      v.pause();
    }
  }, [playVideo]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + seconds));
  }, []);

  const setQualityLevel = useCallback((levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.autoLevelCapping = -1;
    hls.currentLevel = levelIndex;
    setSelectedLevel(levelIndex);
    setShowQualityMenu(false);
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current as HTMLVideoElement & {
      webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture') => void;
      webkitPresentationMode?: string;
    };
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
        await video.requestPictureInPicture();
      } else if (video.webkitSetPresentationMode) {
        video.webkitSetPresentationMode(video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
      }
    } catch {
      // Ignore unsupported PiP browsers.
    }
  }, []);

  /* ── Fullscreen: native + pseudo fallback ── */
  const enterPseudoFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    pseudoFsRef.current = true;
    scrollPositionRef.current = window.scrollY;
    setIsFullscreen(true);
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '100vw';
    el.style.height = '100vh';
    el.style.zIndex = '9999';
    el.style.borderRadius = '0';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    // A transformed ancestor establishes a fixed-position containing block.
    // Compensate its offset so the player aligns with the real viewport.
    const fixedRect = el.getBoundingClientRect();
    el.style.left = `${-fixedRect.left}px`;
    el.style.top = `${-fixedRect.top}px`;
    // Try landscape on mobile
    if ((screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock) {
      (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {});
    }
  }, []);

  const exitPseudoFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    pseudoFsRef.current = false;
    setIsFullscreen(false);
    el.style.position = '';
    el.style.top = '';
    el.style.left = '';
    el.style.width = '';
    el.style.height = '';
    el.style.zIndex = '';
    el.style.borderRadius = '';
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    if ((screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock) {
      (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
    }
    window.scrollTo({ top: scrollPositionRef.current, behavior: 'auto' });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    if (pseudoFsRef.current) {
      exitPseudoFullscreen();
      return;
    }

    const safariDocument = document as Document & {
      webkitFullscreenElement?: Element;
      webkitFullscreenEnabled?: boolean;
      webkitExitFullscreen?: () => void;
    };
    const nativeFullscreenElement = document.fullscreenElement || safariDocument.webkitFullscreenElement;
    if (nativeFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen().catch(() => {});
      else safariDocument.webkitExitFullscreen?.();
      return;
    }

    // Native fullscreen is the primary experience: it hides the browser/page
    // chrome and makes the movie occupy the physical screen.
    try {
      if (document.fullscreenEnabled === true && el.requestFullscreen) {
        // The no-options form has the widest support (notably Safari and
        // embedded mobile browsers) while still entering native fullscreen.
        await el.requestFullscreen();
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        if (document.fullscreenElement || safariDocument.webkitFullscreenElement) return;
      }
      const iosVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
      if (iosVideo.webkitEnterFullscreen) {
        iosVideo.webkitEnterFullscreen();
        return;
      }
    } catch {
      // Browsers embedded in social apps may deny native fullscreen.
    }

    // Last-resort fallback keeps playback usable when native fullscreen is
    // unavailable, but normal browsers always take the native path above.
    enterPseudoFullscreen();
  }, [enterPseudoFullscreen, exitPseudoFullscreen]);

  useEffect(() => () => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }, []);

  /* ── Listen ESC to exit pseudo-fullscreen ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pseudoFsRef.current) exitPseudoFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitPseudoFullscreen]);

  /* ── Listen orientation change to exit pseudo-fullscreen ── */
  useEffect(() => {
    const onOrientation = () => {
      if (pseudoFsRef.current && window.orientation === 0) exitPseudoFullscreen();
    };
    window.addEventListener('orientationchange', onOrientation);
    return () => window.removeEventListener('orientationchange', onOrientation);
  }, [exitPseudoFullscreen]);

  const seekToPct = useCallback((pct: number) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    v.currentTime = pct * duration;
  }, [duration]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekToPct(pct);
  }, [seekToPct]);

  if (hasError) {
    return (
      <div className="aspect-video w-full bg-[#0d0f1a] rounded-xl flex items-center justify-center border border-white/5">
        <div className="text-center px-6">
          <i className="ri-wifi-off-line text-3xl text-red-400/40 mb-2 block" />
          <p className="text-white/50 text-sm">{errorMsg || 'Không thể tải video'}</p>
          <button
            type="button"
            onClick={() => setRetryNonce((value) => value + 1)}
            className="mt-3 rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/15 hover:text-white"
          >
            Thử lại stream
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black overflow-hidden select-none ${
        pseudoFsRef.current ? '' : 'aspect-video rounded-xl'
      }`}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster={poster}
        title={title}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
      >
        {subtitleUrl && (
          <track
            kind="subtitles"
            src={subtitleUrl}
            srcLang="vi"
            label="Tiếng Việt"
            default
          />
        )}
      </video>
      <PlayerWatermark />

      {/* Loading */}
      {!loaded && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black">
          <div className="w-12 h-12 rounded-full border-2 border-red-500/20 border-t-red-500 animate-spin mb-3" />
          <p className="text-white/40 text-sm">Đang kết nối stream...</p>
        </div>
      )}

      {/* Buffering */}
      {loaded && isBuffering && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/50 animate-spin" />
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-end transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-controls]')) return;
          togglePlay();
          resetControlsTimer();
        }}
      >
        {/* Gradient */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/85 to-transparent" />
        </div>

        {/* Pause button center */}
        {!isPlaying && loaded && !isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              type="button"
              aria-label="Phát phim"
              className="pointer-events-auto w-16 h-16 rounded-full bg-black/50 flex items-center justify-center border border-white/15 transition-transform hover:scale-105"
              onClick={(e) => {
                e.stopPropagation();
                void playVideo();
                resetControlsTimer();
              }}
            >
              <i className="ri-play-fill text-3xl text-white ml-1" />
            </button>
          </div>
        )}

        {/* Top bar */}
        <div data-controls className="relative z-10 flex items-center justify-between px-4 pt-2 pb-1">
          {title && <p className="hidden sm:block text-white/70 text-sm font-medium truncate max-w-[50%]">{title}</p>}
        </div>

        {/* Bottom bar */}
        <div data-controls className="relative z-10 px-3 pb-3 sm:px-4 sm:pb-4" onClick={(e) => e.stopPropagation()}>
          {/* Progress */}
          <div
            role="slider"
            aria-label="Tua phim"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Math.round(duration))}
            aria-valuenow={Math.max(0, Math.round(currentTime))}
            className="group/progress flex h-5 w-full cursor-pointer items-center mb-1 relative touch-none"
            onClick={handleProgressClick}
          >
            <div className="w-full h-1.5 group-hover/progress:h-2 rounded-full bg-white/35 overflow-hidden transition-[height]">
              <div className="h-full rounded-full bg-red-500 transition-[width] duration-100" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button type="button" aria-label={isPlaying ? 'Tạm dừng phim' : 'Phát phim'} title={isPlaying ? 'Tạm dừng (K)' : 'Phát (K)'} onClick={togglePlay} className="w-11 h-11 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 transition-all cursor-pointer flex-shrink-0">
              <i className={`${isPlaying ? 'ri-pause-fill' : 'ri-play-fill'} text-lg ${!isPlaying ? 'ml-0.5' : ''}`} />
            </button>

            <button aria-label="Lùi 10 giây" onClick={() => seekBy(-10)} title="Lùi 10 giây" className="hidden sm:flex w-11 h-11 items-center justify-center rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition-all cursor-pointer flex-shrink-0">
              <i className="ri-replay-10-line text-lg" />
            </button>
            <button aria-label="Tới 10 giây" onClick={() => seekBy(10)} title="Tới 10 giây" className="hidden sm:flex w-11 h-11 items-center justify-center rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition-all cursor-pointer flex-shrink-0">
              <i className="ri-forward-10-line text-lg" />
            </button>

            <div className="hidden sm:flex items-center gap-1.5 group/vol">
              <button aria-label={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'} title={isMuted ? 'Bật âm thanh (M)' : 'Tắt âm thanh (M)'} onClick={toggleMute} className="w-11 h-11 flex items-center justify-center rounded-lg text-white/85 hover:text-white hover:bg-white/15 cursor-pointer">
                <i className={`text-sm ${isMuted || volume === 0 ? 'ri-volume-mute-line text-red-400' : volume < 0.5 ? 'ri-volume-down-line' : 'ri-volume-up-line'}`} />
              </button>
              <div className="w-0 overflow-hidden group-hover/vol:w-16 transition-all">
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  className="w-16 h-1 accent-red-500 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <span className="text-white/90 text-xs font-mono whitespace-nowrap">
              {fmtTime(currentTime)}<span className="text-white/30"> / {fmtTime(duration)}</span>
            </span>

            <div className="flex-1" />
            {levels.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => { setShowQualityMenu((value) => !value); setShowSpeedMenu(false); }}
                  aria-label="Chọn chất lượng"
                  title="Chọn chất lượng"
                  className="h-11 min-w-12 px-2.5 rounded-lg text-xs font-bold text-white/90 hover:text-white hover:bg-white/15 border border-white/20 transition-all cursor-pointer"
                >
                  {selectedLevel < 0 ? 'Auto' : `${levels.find((level) => level.index === selectedLevel)?.height || ''}p`}
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-11 right-0 z-30 w-28 overflow-hidden rounded-lg border border-white/10 bg-black/90 p-1 shadow-2xl">
                    <button onClick={() => setQualityLevel(-1)} className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${selectedLevel < 0 ? 'bg-red-500 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>
                      Auto
                    </button>
                    {levels.map((level) => (
                      <button key={level.index} onClick={() => setQualityLevel(level.index)} className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${selectedLevel === level.index ? 'bg-red-500 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>
                        {level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}k`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="relative">
              <button
                onClick={() => { setShowSpeedMenu((value) => !value); setShowQualityMenu(false); }}
                aria-label="Tốc độ phát"
                title="Tốc độ phát"
                className="h-11 min-w-11 px-2.5 rounded-lg text-xs font-bold text-white/90 hover:text-white hover:bg-white/15 border border-white/20 transition-all cursor-pointer"
              >
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-11 right-0 z-30 w-24 overflow-hidden rounded-lg border border-white/10 bg-black/90 p-1 shadow-2xl">
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => { setPlaybackRate(speed); setShowSpeedMenu(false); }}
                      className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${playbackRate === speed ? 'bg-red-500 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {subtitleUrl && (
              <button
                onClick={() => setCaptionsEnabled((value) => !value)}
                aria-label={captionsEnabled ? 'Tắt phụ đề' : 'Bật phụ đề'}
                title="Phụ đề tiếng Việt"
                className={`w-11 h-11 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0 hover:bg-white/15 ${
                  captionsEnabled ? 'text-cyan-300' : 'text-white/85 hover:text-white'
                }`}
              >
                <i className="ri-closed-captioning-line text-lg" />
              </button>
            )}

            <button aria-label="Hình trong hình" onClick={togglePictureInPicture} title="Hình trong hình" className={`hidden sm:flex w-11 h-11 rounded-lg items-center justify-center cursor-pointer flex-shrink-0 hover:bg-white/15 ${pipActive ? 'text-red-400' : 'text-white/85 hover:text-white'}`}>
              <i className="ri-picture-in-picture-line text-lg" />
            </button>

            <button aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'} title={isFullscreen ? 'Thoát toàn màn hình (F)' : 'Toàn màn hình (F)'} onClick={() => void toggleFullscreen()} className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 cursor-pointer flex-shrink-0">
              <i className={`${isFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} text-xl`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
