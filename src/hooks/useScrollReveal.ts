import { useEffect, useRef } from 'react';
/**
 * Batch apply classList updates via requestAnimationFrame
 * to avoid layout thrashing when revealing many elements at once.
 */
function batchApplyClass(
  elements: HTMLElement[],
  className: string,
): void {
  requestAnimationFrame(() => {
    for (let i = 0; i < elements.length; i++) {
      elements[i].classList.add(className);
      elements[i].dataset.revealed = 'true';
    }
  });
}

/**
 * Attach to a container element.
 * Adds js-reveal-ready + js-stagger-ready to container so CSS hides items,
 * then reveals them via IntersectionObserver as they enter viewport.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // Mark container so CSS can hide items safely
    container.classList.add('js-reveal-ready', 'js-stagger-ready');

    const targets = container.querySelectorAll<HTMLElement>(
      '.reveal, .reveal-left, .reveal-scale, .stagger-item',
    );
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const toRevealStagger: HTMLElement[] = [];
        const toRevealOthers: HTMLElement[] = [];

        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          // Skip if already revealed (prevents re-animation on scroll back)
          if (el.dataset.revealed === 'true') return;
          if (el.classList.contains('stagger-item')) {
            toRevealStagger.push(el);
          } else {
            toRevealOthers.push(el);
          }
          observer.unobserve(el);
        });

        if (toRevealStagger.length) batchApplyClass(toRevealStagger, 'staggered');
        if (toRevealOthers.length) batchApplyClass(toRevealOthers, 'revealed');
      },
      { rootMargin: '150px 0px 150px 0px', threshold: 0 },
    );

    targets.forEach((el) => observer.observe(el));

    // Safety fallback: after 1.5s force-reveal everything in case observer missed
    const fallback = setTimeout(() => {
      batchApplyClass(Array.from(targets), 'staggered');
      batchApplyClass(Array.from(targets), 'revealed');
    }, 1500);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  return ref;
}

/**
 * Single element reveal hook.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  className = 'reveal',
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Find nearest parent or self to mark ready
    el.classList.add(className, 'js-reveal-ready');

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if ((entry.target as HTMLElement).dataset.revealed !== 'true') {
            (entry.target as HTMLElement).classList.add('revealed');
            (entry.target as HTMLElement).dataset.revealed = 'true';
          }
          observer.disconnect();
        }
      },
      { rootMargin: '150px 0px 150px 0px', threshold: 0 },
    );
    observer.observe(el);

    const fallback = setTimeout(() => {
      el.classList.add('revealed');
      el.dataset.revealed = 'true';
    }, 1500);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [className]);

  return ref;
}