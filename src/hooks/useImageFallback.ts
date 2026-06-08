import { useState, useCallback } from 'react';
import { getImageFallbacks } from '../services/movieApi';

interface UseImageFallbackResult {
  currentSrc: string;
  loaded: boolean;
  hasError: boolean;
  onLoad: () => void;
  onError: () => void;
}

/** Smart image loader: tries primary → alt → generic fallback automatically */
export function useImageFallback(
  primaryPath?: string,
  altPath?: string,
  preloaded = false,
): UseImageFallbackResult {
  const fallbackUrls = getImageFallbacks(primaryPath, altPath);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(preloaded);

  const currentSrc = fallbackUrls[Math.min(index, fallbackUrls.length - 1)];
  const hasError = index >= fallbackUrls.length - 1;

  const onLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const onError = useCallback(() => {
    if (index < fallbackUrls.length - 1) {
      setIndex((i) => i + 1);
    } else {
      setLoaded(true);
    }
  }, [index, fallbackUrls.length]);

  return { currentSrc, loaded, hasError, onLoad, onError };
}