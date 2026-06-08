import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const BANNER_URL = '';
const DISMISSED_KEY = 'kp_sticky_banner_dismissed';
function trackBannerClick(pagePath: string) {
  const payload = {
    url: BANNER_URL,
    page_path: pagePath,
    user_agent: navigator.userAgent.slice(0, 250),
    clicked_at: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const edgeUrl = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/track-banner-click`;

  // Layer 1: fetch with keepalive (guaranteed to send even on page unload)
  try {
    fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Layer 2 fallback on fetch failure
    });
  } catch {
    // silent
  }

  // Layer 2: Supabase direct insert (fast, usually succeeds)
  void (async () => {
    try {
      const { error } = await supabase.from('banner_clicks').insert(payload);
      if (error) {
        if (import.meta.env.DEV) console.warn('Banner click tracking error (supabase):', error);
        // Layer 3: sendBeacon as last resort
        try {
          navigator.sendBeacon(edgeUrl, body);
        } catch {
          // silent
        }
      }
    } catch {
      try {
        navigator.sendBeacon(edgeUrl, body);
      } catch {
        // silent
      }
    }
  })();
}

export default function StickyBanner() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    setVisible(false);

    const timer = setTimeout(() => {
      setVisible(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [location.pathname, dismissed]);

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVisible(false);
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch { /* ignore */ }
  };

  const handleBannerClick = () => {
    trackBannerClick(location.pathname);
  };

  if (dismissed) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[90] transition-transform duration-500 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="relative mx-auto w-full max-w-[720px] px-2 sm:px-3 pb-2 pt-1">
        <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60">
          <a
            href={BANNER_URL}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={handleBannerClick}
            className="block active:scale-[0.99] transition-transform cursor-pointer"
          >
            <img
              src="https://static.readdy.ai/image/85988c9764f3464943f9546f02dafd4c/77c2b25cfe14f09e260a7cdb41aa610f.jpeg"
              alt="Banner"
              className="w-full h-[50px] sm:h-[90px] object-cover object-center"
              loading="lazy"
            />

            <span className="absolute bottom-1 left-2 text-[9px] text-white/30 font-medium tracking-wide uppercase select-none pointer-events-none">
              Ad
            </span>
          </a>

          <button
            onClick={handleClose}
            type="button"
            className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white/70 hover:bg-black/80 hover:text-white transition-all active:scale-90 cursor-pointer z-20"
            aria-label="Đóng banner"
            title="Đóng"
          >
            <i className="ri-close-line text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}