import { useState, useCallback, useEffect, useMemo } from 'react';
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
  const fallbackUrls = useMemo(() => getImageFallbacks(primaryPath, altPath), [primaryPath, altPath]);
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

  const onLoad = useCallback(() => {
    setLoaded(true);
    setExhausted(false);
  }, []);

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
