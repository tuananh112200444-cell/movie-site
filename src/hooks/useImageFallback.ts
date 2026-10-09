import { useState, useCallback, useLayoutEffect, useMemo, useRef, type SyntheticEvent } from 'react';
import { getOptimizedImageFallbacks, getOriginalImageFromProxy } from '../services/movieApi';

interface UseImageFallbackResult {
  currentSrc: string;
  loaded: boolean;
  hasError: boolean;
  onLoad: (event?: SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
}

interface ImageFallbackOptions {
  preferredAspect?: 'portrait' | 'landscape';
  includeOriginalFallback?: boolean;
  minimumWidth?: number;
}

function isPreferredAspect(width: number, height: number, preferredAspect?: ImageFallbackOptions['preferredAspect']): boolean {
  if (!preferredAspect || width <= 0 || height <= 0) return true;
  const ratio = width / height;
  if (preferredAspect === 'portrait') return ratio <= 1.05;
  return ratio >= 1.2;
}

const LOCAL_POSTER_FALLBACK = '/images/movie-poster-fallback.svg';

function imageIdentity(url: string): string {
  return getOriginalImageFromProxy(url) || url;
}

/** Smart image loader: tries primary → alt → generic fallback automatically */
export function useImageFallback(
  primaryPath?: string,
  altPath?: string,
  preloaded = false,
  width = 620,
  quality = 88,
  options: ImageFallbackOptions = {},
): UseImageFallbackResult {
  const fallbackUrls = useMemo(
    () => getOptimizedImageFallbacks(
      primaryPath,
      altPath,
      width,
      quality,
      options.includeOriginalFallback ?? true,
      options.minimumWidth ?? 180,
    ),
    [primaryPath, altPath, width, quality, options.includeOriginalFallback, options.minimumWidth],
  );
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(preloaded);
  const [exhausted, setExhausted] = useState(false);
  const [aspectFallbackSrc, setAspectFallbackSrc] = useState<string | null>(null);
  const [usingAspectFallback, setUsingAspectFallback] = useState(false);
  const rejectedAspectIdentities = useRef(new Set<string>());

  const indexedSrc = fallbackUrls[Math.min(index, fallbackUrls.length - 1)];
  const currentSrc = usingAspectFallback && aspectFallbackSrc ? aspectFallbackSrc : indexedSrc;
  const hasError = exhausted;

  // Reset before the browser can dispatch a memory-cache `load` event. A
  // passive effect could run after that event and overwrite loaded=true,
  // leaving a successfully decoded image permanently hidden at opacity: 0
  // after an SPA route round-trip.
  useLayoutEffect(() => {
    setIndex(0);
    setLoaded(preloaded);
    setExhausted(false);
    setAspectFallbackSrc(null);
    setUsingAspectFallback(false);
    rejectedAspectIdentities.current.clear();
  }, [fallbackUrls, preloaded]);

  const advance = useCallback((mismatchedSrc?: string) => {
    const rememberedAspectSrc = aspectFallbackSrc || mismatchedSrc || null;
    const mismatchedIdentity = mismatchedSrc ? imageIdentity(mismatchedSrc) : '';
    if (mismatchedIdentity) rejectedAspectIdentities.current.add(mismatchedIdentity);
    let nextIndex = index + 1;

    // A successfully decoded optimized image and its full-resolution origin
    // always have the same aspect ratio. Skip that duplicate retry instead of
    // downloading a multi-megabyte original that will be rejected as well.
    while (
      nextIndex < fallbackUrls.length
      && rejectedAspectIdentities.current.has(imageIdentity(fallbackUrls[nextIndex]))
    ) {
      nextIndex += 1;
    }

    const nextSrc = fallbackUrls[nextIndex];
    if ((!nextSrc || nextSrc.endsWith(LOCAL_POSTER_FALLBACK)) && rememberedAspectSrc) {
      setAspectFallbackSrc(rememberedAspectSrc);
      setUsingAspectFallback(true);
      // This image has already decoded successfully; only its aspect is not
      // ideal. Reveal it immediately instead of waiting for another load event
      // that may not fire when React reuses the same URL from memory cache.
      setLoaded(true);
      setExhausted(false);
      return;
    }

    if (nextSrc) {
      setLoaded(false);
      setIndex(nextIndex);
      return;
    }

    setLoaded(true);
    setExhausted(true);
  }, [aspectFallbackSrc, fallbackUrls, index]);

  const onLoad = useCallback((event?: SyntheticEvent<HTMLImageElement>) => {
    const img = event?.currentTarget;
    if (usingAspectFallback) {
      setLoaded(true);
      setExhausted(false);
      return;
    }
    if (img && (img.naturalWidth <= 0 || img.naturalHeight <= 0)) {
      advance();
      return;
    }
    if (img && !isPreferredAspect(img.naturalWidth, img.naturalHeight, options.preferredAspect)) {
      const mismatch = currentSrc;
      if (!aspectFallbackSrc) setAspectFallbackSrc(mismatch);
      advance(mismatch);
      return;
    }
    setLoaded(true);
    setExhausted(false);
  }, [advance, aspectFallbackSrc, currentSrc, options.preferredAspect, usingAspectFallback]);

  const onError = useCallback(() => {
    if (usingAspectFallback) {
      setUsingAspectFallback(false);
      setAspectFallbackSrc(null);
      setIndex(fallbackUrls.length - 1);
      setLoaded(true);
      setExhausted(true);
      return;
    }
    advance();
  }, [advance, fallbackUrls.length, usingAspectFallback]);

  return { currentSrc, loaded, hasError, onLoad, onError };
}
