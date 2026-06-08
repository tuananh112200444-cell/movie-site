import { useState, useEffect, useRef } from 'react';

/**
 * Lazy render section qua IntersectionObserver.
 * Trả về ref gắn vào container + boolean `visible`.
 * Chỉ trigger 1 lần (không reset về false).
 * rootMargin mặc định = 300px để render trước khi scroll đến.
 */
export function useLazySection(rootMargin = '150px'): {
  sectionRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
} {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return { sectionRef, visible };
}