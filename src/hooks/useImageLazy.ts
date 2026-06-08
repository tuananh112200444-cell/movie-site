import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * ─── Smart Image Lazy Loader v8 ───
 *
 * v8 changes (maximum CPU/GPU efficiency):
 * 1. Shared IntersectionObserver — 1 observer for all images, not N observers
 * 2. Global cache với size limit — tránh memory leak
 * 3. Eager loading support — load ảnh ngay lập tức không cần chờ
 * 4. Lightweight — không tạo new Image() mỗi lần observe
 */

/* ─── Global resolved URL cache với size limit ─── */
const MAX_CACHE_SIZE = 200;
const resolvedCache = new Set<string>();
const cacheQueue: string[] = [];

function addToCache(url: string): void {
  if (resolvedCache.has(url)) return;
  if (resolvedCache.size >= MAX_CACHE_SIZE) {
    const oldest = cacheQueue.shift();
    if (oldest) resolvedCache.delete(oldest);
  }
  resolvedCache.add(url);
  cacheQueue.push(url);
}

/* ─── Shared IntersectionObserver per rootMargin ─── */
const observers = new Map<string, IntersectionObserver>();
const entryCallbacks = new Map<Element, (isIntersecting: boolean) => void>();

function getSharedObserver(rootMargin: string): IntersectionObserver {
  let obs = observers.get(rootMargin);
  if (!obs) {
    obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const cb = entryCallbacks.get(entry.target);
          if (cb) cb(entry.isIntersecting);
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    observers.set(rootMargin, obs);
  }
  return obs;
}

function observeElement(el: Element, rootMargin: string, cb: (isIntersecting: boolean) => void): () => void {
  entryCallbacks.set(el, cb);
  getSharedObserver(rootMargin).observe(el);
  return () => {
    entryCallbacks.delete(el);
    getSharedObserver(rootMargin).unobserve(el);
  };
}

/* ─── Hook ─── */
export interface ImageLazyResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  resolvedSrc: string;
  loaded: boolean;
  onLoad: () => void;
  onError: () => void;
  shouldEagerLoad: boolean;
}

export function useImageLazyFull(
  primaryUrl: string,
  fallbackUrl?: string,
  rootMargin = '200px',
  eager = false,
): ImageLazyResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const triedFallback = useRef(false);

  const alreadySeen = primaryUrl ? resolvedCache.has(primaryUrl) : false;

  const [loaded, setLoaded] = useState(alreadySeen);
  const [currentSrc, setCurrentSrc] = useState(primaryUrl || '');
  const [isInViewport, setIsInViewport] = useState(eager || alreadySeen);

  useEffect(() => {
    if (eager || alreadySeen || !containerRef.current) {
      setIsInViewport(true);
      return;
    }
    return observeElement(containerRef.current, rootMargin, (visible) => {
      if (visible) {
        setIsInViewport(true);
      }
    });
  }, [eager, alreadySeen, rootMargin]);

  const onLoad = useCallback(() => {
    if (currentSrc) addToCache(currentSrc);
    setLoaded(true);
  }, [currentSrc]);

  const onError = useCallback(() => {
    if (!triedFallback.current && fallbackUrl && currentSrc !== fallbackUrl) {
      triedFallback.current = true;
      setLoaded(false);
      setCurrentSrc(fallbackUrl);
    } else {
      setLoaded(true);
    }
  }, [fallbackUrl, currentSrc]);

  return {
    containerRef,
    resolvedSrc: currentSrc,
    loaded,
    onLoad,
    onError,
    shouldEagerLoad: eager || isInViewport,
  };
}
