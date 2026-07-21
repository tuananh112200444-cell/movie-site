import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const BANNER_URL = 'https://winaz.it.com/?utm_source=Khophim&utm_medium=facebook&utm_campaign=booking';
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
  const [bannerReady, setBannerReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (dismissed) return;
    setVisible(true);
  }, [location.pathname, dismissed]);

  useEffect(() => {
    if (dismissed) return undefined;

    // The animated campaign asset is close to 1 MB. Keep the banner's space and
    // call-to-action visible immediately, but let the hero/LCP image use the
    // constrained mobile connection first.
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => setBannerReady(true), 1_800);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      window.removeEventListener('load', schedule);
      window.clearTimeout(timer);
    };
  }, [dismissed]);

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
      data-testid="sticky-top-banner"
      className={`relative z-0 w-full overflow-hidden border-t border-white/[0.04] bg-[#0d0f1a]/90 transition-all duration-500 ease-out ${
        visible ? 'max-h-[58px] opacity-100 sm:max-h-[72px] lg:max-h-[56px]' : 'max-h-0 opacity-0'
      }`}
    >
      <div className="relative mx-auto w-full max-w-[728px] px-2 py-1 sm:px-3 lg:max-w-[620px]">
        <div className="relative overflow-hidden rounded-lg border border-white/10 shadow-lg shadow-black/35">
          <a
            href={BANNER_URL}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            onClick={handleBannerClick}
            className="block active:scale-[0.99] transition-transform cursor-pointer"
          >
            <div className="aspect-[728/90] max-h-[46px] w-full bg-white/[0.025] sm:max-h-[62px] lg:max-h-[48px]">
              {bannerReady ? (
                <img
                  src="/banners/winaz-728x90-20260715.gif"
                  alt="WinAZ banner"
                  className="h-full w-full object-contain object-center"
                  loading="lazy"
                  decoding="async"
                  width={728}
                  height={90}
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center bg-gradient-to-r from-[#101a3f] via-[#18345f] to-[#101a3f] text-xs font-black tracking-[0.22em] text-white/80"
                  aria-label="WinAZ banner đang tải"
                >
                  WINAZ
                </div>
              )}
            </div>

            <span className="absolute bottom-1 left-2 text-[9px] text-white/30 font-medium tracking-wide uppercase select-none pointer-events-none">
              Ad
            </span>
          </a>

          <button
            onClick={handleClose}
            type="button"
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white/80 hover:bg-black/70 hover:text-white transition-all active:scale-90 cursor-pointer z-20 touch-manipulation"
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
