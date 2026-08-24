import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { isPortraitPhoneViewport, tryLockPlayerLandscape, unlockPlayerOrientation } from '@/utils/playerFullscreen';

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
  onPlaybackStarted?: () => void;
  onPlaybackQuality?: (quality: {
    event_type: 'playback_stable' | 'playback_heartbeat';
    playback_time: number;
    duration: number;
    buffered_ahead: number;
    startup_ms: number;
    watched_seconds: number;
    stall_count: number;
    stall_seconds: number;
  }) => void;
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
const MAX_STREAM_RECOVERY_ATTEMPTS = 3;
const MAX_NON_FATAL_NETWORK_RETRIES = 5;
const STALL_RECOVERY_DELAY_MS = 10_000;
const STALL_PROGRESS_CHECK_MS = 3_000;
const STALL_MIN_PROGRESS_SECONDS = 0.05;
// A provider can briefly resume after a fragment timeout, which previously
// reset the ordinary recovery counter and left viewers in an endless
// play-buffer-play loop. Treat only a burst of genuine low-buffer waits as a
// terminal failure; isolated waits remain recoverable.
const REPEATED_STALL_WINDOW_MS = 90_000;
const MAX_REPEATED_SHORT_STALLS = 4;
const MIN_FATAL_STALL_MS = 45_000;
const RECOVERY_COOLDOWN_MS = 12_000;
const PLAYER_LOGO_URL = '/brand/khophim-favicon-v2-96.png';
const STABLE_PLAYBACK_SECONDS = 15;
// Five-minute samples retain long-watch evidence without turning every active
// viewer into a database write every minute. Startup/stable/fatal events remain
// immediate, so source failover does not wait for this heartbeat.
const PLAYBACK_HEARTBEAT_SECONDS = 300;

function getPlaybackProfile() {
  if (typeof window === 'undefined') {
    return {
      maxBufferLength: 24,
      maxMaxBufferLength: 48,
      maxBufferSize: 36_000_000,
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
      maxBufferSize: slowNetwork ? 24_000_000 : 36_000_000,
      backBufferLength: 15,
    };
  }

  return {
    maxBufferLength: 36,
    maxMaxBufferLength: 72,
    maxBufferSize: 64_000_000,
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

function finitePlaybackTime(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function seekVideoSafely(video: HTMLVideoElement, value: unknown): void {
  const target = finitePlaybackTime(value);
  if (target <= 0 || !Number.isFinite(video.duration) || target >= video.duration - 2) return;
  if (Math.abs(video.currentTime - target) > 0.5) video.currentTime = target;
}

function pickStableStartLevel(levels: Hls['levels']): number {
  if (!levels.length) return -1;
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
  // Start conservatively so a weak third-party CDN can deliver the first
  // fragment quickly. ABR remains enabled (selectedLevel = -1) and raises the
  // quality after measuring the viewer's real connection and source speed.
  const targetHeight = isSmallScreen ? 360 : 480;
  const targetBitrate = isSmallScreen ? 1_000_000 : 1_600_000;
  const indexed = levels.map((level, index) => ({
    index,
    height: level.height || 0,
    bitrate: level.bitrate || 0,
  }));
  const safeCandidates = indexed
    .filter((level) => (!level.height || level.height <= targetHeight)
      && (!level.bitrate || level.bitrate <= targetBitrate))
    .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
  if (safeCandidates.length > 0) return safeCandidates[0].index;

  return indexed
    .slice()
    .sort((a, b) => (a.bitrate || Number.MAX_SAFE_INTEGER) - (b.bitrate || Number.MAX_SAFE_INTEGER)
      || a.height - b.height)[0].index;
}

function capToLowerAutoLevel(hls: Hls): boolean {
  if (hls.levels.length <= 1) return false;
  const current = hls.currentLevel >= 0 ? hls.currentLevel : hls.nextLoadLevel;
  const baseline = current >= 0 ? current : hls.levels.length - 1;
  if (baseline <= 0) {
    hls.autoLevelCapping = 0;
    hls.nextLevel = 0;
    return false;
  }
  const next = baseline - 1;
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
  onPlaybackStarted,
  onPlaybackQuality,
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
  const repeatedStallTimesRef = useRef<number[]>([]);
  const lastStallRecoveryAtRef = useRef(0);
  const pageActiveRef = useRef(typeof document === 'undefined' ? true : !document.hidden);
  const wasPageSuspendedRef = useRef(false);
  const suspendedTimeRef = useRef(0);
  const wasPlayingBeforeSuspendRef = useRef(false);
  const networkOfflineRef = useRef(typeof navigator === 'undefined' ? false : navigator.onLine === false);
  const offlineTimeRef = useRef(0);
  const wasPlayingBeforeOfflineRef = useRef(false);
  const pseudoFsRef = useRef(false);
  const scrollPositionRef = useRef(0);
  const sourceOpenedAtRef = useRef(Date.now());
  const firstPlayingAtRef = useRef(0);
  const watchedSecondsRef = useRef(0);
  const lastMetricPlaybackTimeRef = useRef(finitePlaybackTime(initialTime));
  const stallCountRef = useRef(0);
  const stallSecondsRef = useRef(0);
  const stallStartedAtRef = useRef(0);
  const stableReportedRef = useRef(false);
  const heartbeatBucketRef = useRef(0);
  const initialTimeRef = useRef(finitePlaybackTime(initialTime));
  const appliedExternalSeekRef = useRef<{ src: string; time: number } | null>(null);
  const callbacksRef = useRef({
    onTimeUpdate,
    onEnded,
    onVideoEnded,
    onFatalError,
    onPlaybackStarted,
    onPlaybackQuality,
    onPlayerIssue,
  });

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

  // Callback identity changes must never rebuild MediaSource. Keep the latest
  // handlers in a ref so parent renders (progress, countdowns, health UI) are
  // completely independent from the HLS lifecycle.
  useEffect(() => {
    callbacksRef.current = {
      onTimeUpdate,
      onEnded,
      onVideoEnded,
      onFatalError,
      onPlaybackStarted,
      onPlaybackQuality,
      onPlayerIssue,
    };
  }, [onTimeUpdate, onEnded, onVideoEnded, onFatalError, onPlaybackStarted, onPlaybackQuality, onPlayerIssue]);

  // An explicit resume/restart may seek within the current source, but seeking
  // must not destroy and recreate the HLS instance.
  useEffect(() => {
    const target = finitePlaybackTime(initialTime);
    initialTimeRef.current = target;
    const lastApplied = appliedExternalSeekRef.current;
    if (lastApplied?.src === src && Math.abs(lastApplied.time - target) < 0.01) return;
    appliedExternalSeekRef.current = { src, time: target };

    const video = videoRef.current;
    if (!video) return;
    const seek = () => seekVideoSafely(video, target);
    if (video.readyState >= 1) {
      seek();
      return;
    }
    video.addEventListener('loadedmetadata', seek, { once: true });
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [src, initialTime]);

  useEffect(() => {
    sourceOpenedAtRef.current = Date.now();
    firstPlayingAtRef.current = 0;
    watchedSecondsRef.current = 0;
    lastMetricPlaybackTimeRef.current = initialTimeRef.current;
    stallCountRef.current = 0;
    stallSecondsRef.current = 0;
    stallStartedAtRef.current = 0;
    repeatedStallTimesRef.current = [];
    lastStallRecoveryAtRef.current = 0;
    stableReportedRef.current = false;
    heartbeatBucketRef.current = 0;
  }, [src, retryNonce]);

  /* Keep the media element and HLS instance alive across ordinary tab changes.
     Rebuilding here resets playback to the stale initialTime (often zero). */
  useEffect(() => {
    const suspend = () => {
      if (!pageActiveRef.current) return;
      const video = videoRef.current;
      pageActiveRef.current = false;
      wasPageSuspendedRef.current = true;
      suspendedTimeRef.current = finitePlaybackTime(video?.currentTime);
      wasPlayingBeforeSuspendRef.current = Boolean(video && !video.paused && !video.ended);
    };
    const resume = () => {
      if (document.hidden) return;
      pageActiveRef.current = true;
      if (!wasPageSuspendedRef.current) return;
      wasPageSuspendedRef.current = false;
      const video = videoRef.current;
      const resumeAt = finitePlaybackTime(suspendedTimeRef.current);
      if (!video) return;
      seekVideoSafely(video, resumeAt);
      const hls = hlsRef.current;
      // pagehide/visibility does not stop HLS. Calling startLoad on every
      // pageshow seeks and rebuilds fragment loading even when the stream is
      // healthy, which looks like a movie reload.
      if (hls && !hls.loadingEnabled) hls.startLoad(resumeAt || -1, true);
      if (wasPlayingBeforeSuspendRef.current) void video.play().catch(() => {});
    };
    const onVisibilityChange = () => document.hidden ? suspend() : resume();
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const onOffline = () => {
      const video = videoRef.current;
      networkOfflineRef.current = true;
      offlineTimeRef.current = finitePlaybackTime(video?.currentTime);
      wasPlayingBeforeOfflineRef.current = Boolean(video && !video.paused && !video.ended);
      setIsBuffering(true);
      setErrorMsg('M\u1ea5t k\u1ebft n\u1ed1i m\u1ea1ng, \u0111ang ch\u1edd k\u1ebft n\u1ed1i l\u1ea1i...');
    };
    const onOnline = () => {
      if (!networkOfflineRef.current) return;
      networkOfflineRef.current = false;
      setHasError(false);
      setErrorMsg('');
      const video = videoRef.current;
      const resumeAt = finitePlaybackTime(offlineTimeRef.current);
      if (!video) return;
      seekVideoSafely(video, resumeAt);
      if (hlsRef.current) {
        if (!hlsRef.current.loadingEnabled) hlsRef.current.startLoad(resumeAt || -1, true);
      } else if (video.currentSrc || video.src) {
        let restored = false;
        const restoreNativePlayback = () => {
          if (restored) return;
          restored = true;
          seekVideoSafely(video, resumeAt);
          if (wasPlayingBeforeOfflineRef.current) void video.play().catch(() => {});
        };
        video.addEventListener('loadedmetadata', restoreNativePlayback, { once: true });
        video.load();
      }
      if (hlsRef.current && wasPlayingBeforeOfflineRef.current) void video.play().catch(() => {});
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

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
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.65,
        fragLoadingTimeOut: 25_000,
        manifestLoadingTimeOut: 10_000,
        levelLoadingTimeOut: 10_000,
        fragLoadingMaxRetry: 5,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 3,
        fragLoadingRetryDelay: 1000,
        levelLoadingRetryDelay: 1000,
        manifestLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 16_000,
      });
      hlsRef.current = hls;
      let startupSettled = false;
      const startupWatchdog = window.setTimeout(() => {
        if (startupSettled || !pageActiveRef.current || document.hidden || networkOfflineRef.current) return;
        if (video.readyState > 0 || video.duration > 0) return;
        startupSettled = true;
        setHasError(true);
        setIsBuffering(false);
        setErrorMsg('Nguồn phim không phản hồi');
        callbacksRef.current.onPlayerIssue?.({
          event_type: 'hls_fatal',
          playback_time: video.currentTime,
          duration: video.duration || 0,
          buffered_ahead: getBufferedAhead(video),
          error_message: 'manifest startup watchdog exceeded 18 seconds',
        });
        callbacksRef.current.onFatalError?.();
      }, 18_000);

      setTimeout(() => {
        hls.loadSource(src);
        hls.attachMedia(video);
      }, 0);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        startupSettled = true;
        window.clearTimeout(startupWatchdog);
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
        seekVideoSafely(video, initialTimeRef.current);
        if (autoPlay) video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!pageActiveRef.current || document.hidden) return;
        if (networkOfflineRef.current || navigator.onLine === false) {
          setIsBuffering(true);
          setErrorMsg('M\u1ea5t k\u1ebft n\u1ed1i m\u1ea1ng, \u0111ang ch\u1edd k\u1ebft n\u1ed1i l\u1ea1i...');
          return;
        }
        if (!data.fatal) {
          const details = String(data.details || '');
          if (data.type === 'networkError' && /frag|level|manifest/i.test(details)) {
            nonFatalNetworkRetryRef.current += 1;
            setIsBuffering(true);
            setErrorMsg('Đang tải lại đoạn phim...');
            callbacksRef.current.onPlayerIssue?.({
              event_type: 'hls_retry',
              playback_time: video.currentTime,
              duration: video.duration || 0,
              buffered_ahead: getBufferedAhead(video),
              error_message: details,
            });
            if (
              nonFatalNetworkRetryRef.current >= MAX_NON_FATAL_NETWORK_RETRIES &&
              getBufferedAhead(video) < 0.75 &&
              stallStartedAtRef.current > 0 &&
              Date.now() - stallStartedAtRef.current >= MIN_FATAL_STALL_MS
            ) {
              setHasError(true);
              setErrorMsg('Nguồn phim phản hồi chậm');
              callbacksRef.current.onPlayerIssue?.({
                event_type: 'hls_fatal',
                playback_time: video.currentTime,
                duration: video.duration || 0,
                buffered_ahead: getBufferedAhead(video),
                error_message: `${details || 'network retry limit reached'} after ${nonFatalNetworkRetryRef.current} retries`,
              });
              callbacksRef.current.onFatalError?.();
              return;
            }
            capToLowerAutoLevel(hls);
            if (!hls.loadingEnabled) hls.startLoad(finitePlaybackTime(video.currentTime) || -1, true);
          }
          return;
        }
        if (data.fatal) {
          const details = String(data.details || data.type || 'fatal network error');
          const isManifestStartupFailure = /manifest/i.test(details) && video.readyState === 0;
          // hls.js has already exhausted its configured network retries before
          // emitting a fatal network error. One application-level resume is
          // enough; repeating startLoad creates a visible reload loop.
          const maxNetworkRetries = 1;
          if (data.type === 'networkError' && fatalRetryRef.current < maxNetworkRetries) {
            fatalRetryRef.current += 1;
            capToLowerAutoLevel(hls);
            setIsBuffering(true);
            setErrorMsg(`Đang kết nối lại nguồn phim (${fatalRetryRef.current}/${maxNetworkRetries})...`);
            callbacksRef.current.onPlayerIssue?.({
              event_type: 'hls_fatal_retry',
              playback_time: video.currentTime,
              duration: video.duration || 0,
              buffered_ahead: getBufferedAhead(video),
              error_message: details,
            });
            setTimeout(() => {
              if (isManifestStartupFailure) hls.loadSource(src);
              hls.startLoad(
                finitePlaybackTime(video.currentTime) || -1,
                !isManifestStartupFailure,
              );
            }, 1500 * fatalRetryRef.current);
          } else if (data.type === 'mediaError' && fatalRetryRef.current < 3) {
            fatalRetryRef.current += 1;
            setErrorMsg(`Đang sửa lỗi giải mã (${fatalRetryRef.current}/3)...`);
            callbacksRef.current.onPlayerIssue?.({
              event_type: 'hls_media_retry',
              playback_time: video.currentTime,
              duration: video.duration || 0,
              buffered_ahead: getBufferedAhead(video),
              error_message: String(data.details || data.type || 'fatal media error'),
            });
            setTimeout(() => hls.recoverMediaError(), 500);
          } else {
            startupSettled = true;
            window.clearTimeout(startupWatchdog);
            setHasError(true);
            setErrorMsg('Không thể tải video');
            callbacksRef.current.onPlayerIssue?.({
              event_type: 'hls_fatal',
              playback_time: video.currentTime,
              duration: video.duration || 0,
              buffered_ahead: getBufferedAhead(video),
              error_message: String(data.details || data.type || 'fatal hls error'),
            });
            callbacksRef.current.onFatalError?.();
          }
        }
      });

      return () => {
        startupSettled = true;
        window.clearTimeout(startupWatchdog);
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
      let nativeStartupSettled = false;
      const nativeStartupWatchdog = window.setTimeout(() => {
        if (nativeStartupSettled || !pageActiveRef.current || document.hidden || networkOfflineRef.current) return;
        if (video.readyState > 0 || video.duration > 0) return;
        nativeStartupSettled = true;
        setHasError(true);
        setIsBuffering(false);
        setErrorMsg('Nguồn phim không phản hồi');
        callbacksRef.current.onPlayerIssue?.({
          event_type: 'native_hls_error',
          playback_time: video.currentTime,
          duration: video.duration || 0,
          buffered_ahead: getBufferedAhead(video),
          error_message: 'native hls startup watchdog exceeded 18 seconds',
        });
        callbacksRef.current.onFatalError?.();
      }, 18_000);
      const onMeta = () => {
        nativeStartupSettled = true;
        window.clearTimeout(nativeStartupWatchdog);
        setLoaded(true);
        video.playbackRate = playbackRate;
        seekVideoSafely(video, initialTimeRef.current);
        if (autoPlay) video.play().catch(() => {});
      };
      const onErr = () => {
        if (!pageActiveRef.current || document.hidden) return;
        if (networkOfflineRef.current || navigator.onLine === false) {
          setIsBuffering(true);
          setErrorMsg('M\u1ea5t k\u1ebft n\u1ed1i m\u1ea1ng, \u0111ang ch\u1edd k\u1ebft n\u1ed1i l\u1ea1i...');
          return;
        }
        nativeStartupSettled = true;
        window.clearTimeout(nativeStartupWatchdog);
        setHasError(true);
        setErrorMsg('Không thể phát stream');
        callbacksRef.current.onPlayerIssue?.({
          event_type: 'native_hls_error',
          playback_time: video.currentTime,
          duration: video.duration || 0,
          buffered_ahead: getBufferedAhead(video),
          error_message: 'native hls video error',
        });
        callbacksRef.current.onFatalError?.();
      };
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('error', onErr);
      return () => {
        nativeStartupSettled = true;
        window.clearTimeout(nativeStartupWatchdog);
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
  }, [src, autoPlay, retryNonce]);

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

      const now = Date.now();
      const stalledFor = stallStartedAtRef.current > 0 ? now - stallStartedAtRef.current : 0;
      if (stalledFor < STALL_RECOVERY_DELAY_MS) return;
      if (now - lastStallRecoveryAtRef.current < RECOVERY_COOLDOWN_MS) return;
      lastStallRecoveryAtRef.current = now;

      streamRecoveryRef.current += 1;
      const repeatedStalls = repeatedStallTimesRef.current.length >= MAX_REPEATED_SHORT_STALLS;
      if (
        streamRecoveryRef.current > MAX_STREAM_RECOVERY_ATTEMPTS &&
        stalledFor >= MIN_FATAL_STALL_MS &&
        (repeatedStalls || getBufferedAhead(video) < 0.25)
      ) {
        setHasError(true);
        setErrorMsg('Nguồn phim phản hồi chậm');
        callbacksRef.current.onPlayerIssue?.({
          event_type: 'stall_fatal',
          playback_time: video.currentTime,
          duration: video.duration || 0,
          buffered_ahead: getBufferedAhead(video),
          error_message: `stream stalled for ${stalledFor}ms after ${streamRecoveryRef.current} recovery attempts`,
        });
        callbacksRef.current.onFatalError?.();
        return;
      }

      const didLowerQuality = capToLowerAutoLevel(hls);
      setIsBuffering(true);
      setErrorMsg(didLowerQuality ? 'Mạng chậm, đang giảm chất lượng và tải lại...' : 'Đang kết nối lại nguồn phim...');
      callbacksRef.current.onPlayerIssue?.({
        event_type: 'stall_recovery',
        playback_time: video.currentTime,
        duration: video.duration || 0,
        buffered_ahead: getBufferedAhead(video),
        error_message: didLowerQuality ? 'stall recovery lowered quality' : 'stall recovery kept active fragment load',
      });
      if (!hls.loadingEnabled) hls.startLoad(finitePlaybackTime(video.currentTime) || -1, true);
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
      if (!video.paused && !video.ended && !document.hidden && navigator.onLine !== false) {
        const now = Date.now();
        const isNewStall = !stallStartedAtRef.current;
        if (isNewStall) {
          stallStartedAtRef.current = now;
          stallCountRef.current += 1;
          repeatedStallTimesRef.current = repeatedStallTimesRef.current
            .filter((time) => now - time <= REPEATED_STALL_WINDOW_MS);
          if (getBufferedAhead(video) < 0.75) repeatedStallTimesRef.current.push(now);
        }
      }
      stallTimerRef.current = setTimeout(recoverStalledStream, STALL_RECOVERY_DELAY_MS);
    };
    const onPlaying = () => {
      const now = Date.now();
      if (!firstPlayingAtRef.current) firstPlayingAtRef.current = now;
      if (stallStartedAtRef.current) {
        stallSecondsRef.current += Math.max(0, (now - stallStartedAtRef.current) / 1000);
        stallStartedAtRef.current = 0;
      }
      setIsBuffering(false);
      setErrorMsg('');
      streamRecoveryRef.current = 0;
      nonFatalNetworkRetryRef.current = 0;
      clearStallTimer();
      ensureStallMonitor();
      if (!video.paused && !video.ended && navigator.onLine !== false) callbacksRef.current.onPlaybackStarted?.();
    };
    const onCanPlay = () => {
      setIsBuffering(false);
      clearStallTimer();
      if (!video.paused && !video.ended) ensureStallMonitor();
    };
    const onTime = () => {
      const now = Date.now();
      if (now - lastTimeRef.current < 300) return;
      lastTimeRef.current = now;
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      callbacksRef.current.onTimeUpdate?.(video.currentTime, video.duration || 0);
      const metricDelta = video.currentTime - lastMetricPlaybackTimeRef.current;
      if (metricDelta > 0 && metricDelta <= 3) watchedSecondsRef.current += metricDelta;
      lastMetricPlaybackTimeRef.current = video.currentTime;
      const emitPlaybackQuality = (eventType: 'playback_stable' | 'playback_heartbeat') => {
        const reportPlaybackQuality = callbacksRef.current.onPlaybackQuality;
        if (!reportPlaybackQuality || !firstPlayingAtRef.current) return;
        reportPlaybackQuality({
          event_type: eventType,
          playback_time: video.currentTime,
          duration: video.duration || 0,
          buffered_ahead: getBufferedAhead(video),
          startup_ms: Math.max(0, firstPlayingAtRef.current - sourceOpenedAtRef.current),
          watched_seconds: watchedSecondsRef.current,
          stall_count: stallCountRef.current,
          stall_seconds: stallSecondsRef.current + (stallStartedAtRef.current ? Math.max(0, (now - stallStartedAtRef.current) / 1000) : 0),
        });
      };
      if (!stableReportedRef.current && watchedSecondsRef.current >= STABLE_PLAYBACK_SECONDS) {
        stableReportedRef.current = true;
        emitPlaybackQuality('playback_stable');
      }
      const heartbeatBucket = Math.floor(watchedSecondsRef.current / PLAYBACK_HEARTBEAT_SECONDS);
      if (heartbeatBucket > heartbeatBucketRef.current) {
        heartbeatBucketRef.current = heartbeatBucket;
        emitPlaybackQuality('playback_heartbeat');
      }
      const bufferedAhead = getBufferedAhead(video);
      if (bufferedAhead > 2) {
        setErrorMsg('');
        streamRecoveryRef.current = 0;
        nonFatalNetworkRetryRef.current = 0;
      }
      if (bufferedAhead > 12) {
        repeatedStallTimesRef.current = [];
      }
    };
    const onVol = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const onEnd = () => {
      setIsPlaying(false);
      stopStallMonitor();
      callbacksRef.current.onEnded?.();
      callbacksRef.current.onVideoEnded?.();
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
    video.addEventListener('canplay', onCanPlay);
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
      video.removeEventListener('canplay', onCanPlay);
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
  }, []);

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
        case 'ArrowRight': {
          const end = Number.isFinite(v.duration) ? v.duration : v.currentTime + 5;
          v.currentTime = Math.min(v.currentTime + 5, end);
          break;
        }
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
    const rotateToLandscape = isPortraitPhoneViewport();
    pseudoFsRef.current = true;
    scrollPositionRef.current = window.scrollY;
    setIsFullscreen(true);
    el.style.position = 'fixed';
    el.style.top = rotateToLandscape ? '50%' : '0';
    el.style.left = rotateToLandscape ? '50%' : '0';
    el.style.width = rotateToLandscape ? '100dvh' : '100dvw';
    el.style.height = rotateToLandscape ? '100dvw' : '100dvh';
    el.style.transform = rotateToLandscape ? 'translate(-50%, -50%) rotate(90deg)' : '';
    el.style.zIndex = '9999';
    el.style.borderRadius = '0';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('kp-player-pseudo-fullscreen');
    // A transformed ancestor establishes a fixed-position containing block.
    // Compensate its offset so the player aligns with the real viewport.
    if (!rotateToLandscape) {
      const fixedRect = el.getBoundingClientRect();
      el.style.left = `${-fixedRect.left}px`;
      el.style.top = `${-fixedRect.top}px`;
    } else {
      void tryLockPlayerLandscape().then((locked) => {
        if (!locked || !pseudoFsRef.current || window.innerWidth <= window.innerHeight) return;
        el.style.top = '0';
        el.style.left = '0';
        el.style.width = '100dvw';
        el.style.height = '100dvh';
        el.style.transform = '';
      });
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
    el.style.transform = '';
    el.style.zIndex = '';
    el.style.borderRadius = '';
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.documentElement.classList.remove('kp-player-pseudo-fullscreen');
    unlockPlayerOrientation();
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
        if (isPortraitPhoneViewport()) {
          await tryLockPlayerLandscape();
          await new Promise((resolve) => window.setTimeout(resolve, 150));
          if (window.innerWidth <= window.innerHeight && document.fullscreenElement) {
            await document.exitFullscreen().catch(() => {});
            enterPseudoFullscreen();
            return;
          }
        }
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
    document.documentElement.classList.remove('kp-player-pseudo-fullscreen');
    unlockPlayerOrientation();
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

  const retryStream = useCallback(() => {
    // The error UI temporarily replaces the video node, so its ref is null at
    // click time. Preserve the last React/ref snapshot and remount the media
    // element before rebuilding HLS.
    const resumeAt = Math.max(
      finitePlaybackTime(initialTimeRef.current),
      finitePlaybackTime(currentTime),
      finitePlaybackTime(lastPlaybackSecondRef.current),
    );
    if (Number.isFinite(resumeAt) && resumeAt > 0) initialTimeRef.current = resumeAt;
    setLoaded(false);
    setIsBuffering(true);
    setHasError(false);
    setErrorMsg('');
    setRetryNonce((value) => value + 1);
  }, [currentTime]);

  if (hasError) {
    return (
      <div className="aspect-video w-full bg-[#0d0f1a] rounded-xl flex items-center justify-center border border-white/5">
        <div className="text-center px-6">
          <i className="ri-wifi-off-line text-3xl text-red-400/40 mb-2 block" />
          <p className="text-white/50 text-sm">{errorMsg || 'Không thể tải video'}</p>
          <button
            type="button"
            onClick={retryStream}
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
