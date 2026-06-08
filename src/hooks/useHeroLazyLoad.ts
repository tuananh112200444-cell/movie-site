import { useRef, useState, useEffect } from 'react';

/**
 * Lazy-load hero banner background image via IntersectionObserver.
 *
 * Returns a ref to attach to the hero container, plus state flags
 * that let you conditionally render the <img> and show a skeleton
 * placeholder while the image is off-screen or loading.
 *
 * @param rootMargin – passed to IntersectionObserver (default '200px 0px')
 */
export function useHeroLazyLoad(rootMargin = '100px 0px') {
  const heroRef = useRef<HTMLDivElement>(null);
  const [showHeroBg, setShowHeroBg] = useState(false);
  const [heroImgLoaded, setHeroImgLoaded] = useState(false);

  useEffect(() => {
    if (!heroRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShowHeroBg(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, [rootMargin]);

  return {
    heroRef,
    showHeroBg,
    heroImgLoaded,
    setHeroImgLoaded,
  };
}