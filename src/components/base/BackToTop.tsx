import { useState, useEffect } from 'react';

export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let shown = window.scrollY > 400;
    let rafId: number | null = null;
    setShow(shown);

    const handle = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        const nextShown = window.scrollY > 400;
        if (nextShown !== shown) {
          shown = nextShown;
          setShow(nextShown);
        }
        rafId = null;
      });
    };
    window.addEventListener('scroll', handle, { passive: true });
    return () => {
      window.removeEventListener('scroll', handle);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Lên đầu trang"
      className="fixed bottom-24 right-6 z-40 w-10 h-10 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition-all cursor-pointer animate-fade-in"
    >
      <i className="ri-arrow-up-line text-base" />
    </button>
  );
}
