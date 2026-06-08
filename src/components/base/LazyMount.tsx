import { useEffect, useRef, useState, type ReactNode } from 'react';

interface LazyMountProps {
  children: ReactNode;
  delay?: number; // ms delay sau khi visible
  placeholder?: ReactNode;
  rootMargin?: string;
}

export default function LazyMount({
  children,
  delay = 300,
  placeholder,
  rootMargin = '200px',
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(t);
  }, [visible, delay]);

  return (
    <div ref={ref}>
      {ready ? children : placeholder ?? null}
    </div>
  );
}