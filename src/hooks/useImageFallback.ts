import { useState, useCallback, useEffect, useMemo, type SyntheticEvent } from 'react';
import { getOptimizedImageFallbacks } from '../services/movieApi';

interface UseImageFallbackResult {
  currentSrc: string;
  loaded: boolean;
  hasError: boolean;
  onLoad: (event?: SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
}

interface ImageFallbackOptions {
  preferredAspect?: 'portrait' | 'landscape';
}

function isPreferredAspect(width: number, height: number, preferredAspect?: ImageFallbackOptions['preferredAspect']): boolean {
  if (!preferredAspect || width <= 0 || height <= 0) return true;
  const ratio = width / height;
  if (preferredAspect === 'portrait') return ratio <= 1.05;
  return ratio >= 1.2;
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
    () => getOptimizedImageFallbacks(primaryPath, altPath, width, quality),
    [primaryPath, altPath, width, quality],
  );
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(preloaded);
  const [exhausted, setExhausted] = useState(false);

  const currentSrc = fallbackUrls[Math.min(index, fallbackUrls.length - 1)];
  const hasError = exhausted;

  useEffect(() => {
    setIndex(0);
    setLoaded(preloaded);
    setExhausted(false);
  }, [fallbackUrls, preloaded]);

  const onLoad = useCallback((event?: SyntheticEvent<HTMLImageElement>) => {
    const img = event?.currentTarget;
    if (img && (img.naturalWidth <= 0 || img.naturalHeight <= 0)) {
      if (index < fallbackUrls.length - 1) {
        setLoaded(false);
        setIndex((i) => i + 1);
      } else {
        setLoaded(true);
        setExhausted(true);
      }
      return;
    }
    if (img && !isPreferredAspect(img.naturalWidth, img.naturalHeight, options.preferredAspect) && index < fallbackUrls.length - 1) {
      setLoaded(false);
      setIndex((i) => i + 1);
      return;
    }
    setLoaded(true);
    setExhausted(false);
  }, [fallbackUrls.length, index, options.preferredAspect]);

  const onError = useCallback(() => {
    if (index < fallbackUrls.length - 1) {
      setLoaded(false);
      setIndex((i) => i + 1);
    } else {
      setLoaded(true);
      setExhausted(true);
    }
  }, [index, fallbackUrls.length]);

  return { currentSrc, loaded, hasError, onLoad, onError };
}
