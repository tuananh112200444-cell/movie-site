import { useEffect, useRef, useCallback, useState } from 'react';
import Hls from 'hls.js';

interface VideoPreloaderProps {
  /** URL m3u8 cần preload */
  src: string;
  /** Callback khi preload xong (có thể phát ngay) */
  onReady?: () => void;
  /** Callback khi có lỗi preload */
  onError?: () => void;
}

export interface PreloadedVideoHandle {
  /** Video element đã preload */
  video: HTMLVideoElement;
  /** HLS instance (nếu dùng hls.js) */
  hls: Hls | null;
  /** Phát video */
  play: () => Promise<void>;
  /** Dọn dẹp */
  destroy: () => void;
}

export function useVideoPreloader() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const cleanup = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.remove();
      videoRef.current = null;
    }
    setIsReady(false);
    setHasError(false);
  }, []);

  const startPreload = useCallback((src: string) => {
    if (!src) return;
    
    // Dọn dẹp cũ trước khi tạo mới — tránh rò rỉ DOM
    cleanup();

    // Tạo video element ẩn
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true; // Preload cần muted để autoplay policy
    video.playsInline = true;
    video.style.position = 'absolute';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.width = '1px';
    video.style.height = '1px';
    document.body.appendChild(video);
    videoRef.current = video;

    setIsReady(false);
    setHasError(false);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1_000_000,
        // Preload mode: chỉ load manifest + 1-2 segment đầu
        startLevel: -1,
        // Không tự động play
        autoStartLoad: true,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsReady(true);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setHasError(true);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = src;
      video.addEventListener('loadedmetadata', () => setIsReady(true), { once: true });
      video.addEventListener('error', () => setHasError(true), { once: true });
    }
  }, [cleanup]);

  const getHandle = useCallback((): PreloadedVideoHandle | null => {
    const video = videoRef.current;
    if (!video) return null;

    return {
      video,
      hls: hlsRef.current,
      play: async () => {
        video.muted = false;
        await video.play();
      },
      destroy: () => {
        cleanup();
      },
    };
  }, [cleanup]);

  return { startPreload, getHandle, cleanup, isReady, hasError };
}

/**
 * Component wrapper để preload trong React lifecycle
 */
export default function VideoPreloader({ src, onReady, onError }: VideoPreloaderProps) {
  const { startPreload, cleanup, isReady, hasError } = useVideoPreloader();

  useEffect(() => {
    if (src) {
      startPreload(src);
    }
    return () => {
      cleanup();
    };
  }, [src, startPreload, cleanup]);

  useEffect(() => {
    if (isReady) onReady?.();
  }, [isReady, onReady]);

  useEffect(() => {
    if (hasError) onError?.();
  }, [hasError, onError]);

  return null; // Không render UI
}