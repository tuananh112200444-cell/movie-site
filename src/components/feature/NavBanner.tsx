import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface BannerItem {
  id: string;
  url: string;
  image: string;
  alt: string;
}

const BANNERS: BannerItem[] = [
  {
    id: 'world-cup-2026',
    url: 'https://s6b22.6789.show/register.html',
    image: 'https://storage.readdy-site.link/project_files/ae072a89-671e-4fbc-ae27-6b94b6cb5c25/b9d20cec-297f-40d5-8cb8-07cbeb5f185b_728X90-WORLD-CUP2026.gif?v=3c6908c952347f9a696c86f44ee81c38',
    alt: 'World Cup 2026',
  },
  {
    id: 'winaz',
    url: 'https://winaz.it.com/?utm_source=Khophim&utm_medium=facebook&utm_campaign=booking',
    image: '/banners/winaz-728x90-20260715.gif',
    alt: 'WinAZ banner',
  },
];

const ROTATE_INTERVAL_MS = 5000;
const COLLAPSED_STORAGE_KEY = 'kp_nav_banner_collapsed';

function trackNavBannerClick(pagePath: string, banner: BannerItem) {
  const payload = {
    url: banner.url,
    page_path: pagePath,
    user_agent: navigator.userAgent.slice(0, 250),
    clicked_at: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const edgeUrl = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/track-banner-click`;

  try {
    fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* silent */ });
  } catch { /* silent */ }

  void (async () => {
    try {
      const { error } = await supabase.from('banner_clicks').insert(payload);
      if (error) {
        try {
          navigator.sendBeacon(edgeUrl, body);
        } catch { /* silent */ }
      }
    } catch {
      try {
        navigator.sendBeacon(edgeUrl, body);
      } catch { /* silent */ }
    }
  })();
}

export default function NavBanner() {
  const location = useLocation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!isCollapsed || BANNERS.length < 2) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % BANNERS.length);
    }, ROTATE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isCollapsed]);

  const activeBanner = BANNERS[activeIndex];

  const toggleCollapsed = () => {
    setIsCollapsed((currentValue) => {
      const nextValue = !currentValue;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, nextValue ? '1' : '0');
      } catch { /* ignore */ }
      return nextValue;
    });
  };

  if (isCollapsed) {
    return (
      <div className="relative z-0 w-full border-t border-white/[0.04] bg-[#0d0f1a]/90 lg:py-1">
        <div className="mx-auto w-full max-w-[1180px] px-0 sm:px-3 lg:px-5">
          <a
            key={activeBanner.id}
            href={activeBanner.url}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            onClick={() => trackNavBannerClick(location.pathname, activeBanner)}
            className="relative mx-auto block w-full max-w-[728px] active:scale-[0.99] transition-transform cursor-pointer lg:max-w-[500px]"
          >
            <img
              src={activeBanner.image}
              alt={activeBanner.alt}
              className="aspect-[728/90] h-auto w-full object-contain object-center lg:max-h-[62px]"
              loading="eager"
              width={728}
              height={90}
            />
            <span className="absolute bottom-0.5 left-2 text-[9px] text-white/25 font-medium tracking-wide uppercase select-none pointer-events-none">
              Ad
            </span>
          </a>

          <div className="flex justify-end px-2 py-1 sm:px-0">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Mo tat ca banner"
              title="Mo tat ca banner"
              className="flex h-6 w-9 items-center justify-center rounded-full border border-white/12 bg-black/55 text-amber-200 shadow-sm backdrop-blur transition-colors hover:bg-black/70 hover:text-white sm:h-7 sm:w-10"
            >
              <i className="ri-arrow-down-s-line text-lg leading-none" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-0 w-full border-t border-white/[0.04] bg-[#0d0f1a]/88 lg:py-1">
      <div className="mx-auto w-full max-w-[1180px] px-0 sm:px-3 lg:px-5">
        <div className="grid min-w-0 grid-cols-1 gap-px sm:gap-1.5 sm:py-1 lg:grid-cols-[minmax(0,500px)_minmax(0,500px)_auto] lg:items-center lg:justify-center lg:gap-3 lg:py-0">
          {BANNERS.map((banner) => (
            <a
              key={banner.id}
              href={banner.url}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              onClick={() => trackNavBannerClick(location.pathname, banner)}
              className="relative block min-w-0 active:scale-[0.99] transition-transform cursor-pointer"
            >
              <img
                src={banner.image}
                alt={banner.alt}
                className="aspect-[728/90] h-auto w-full object-contain object-center lg:max-h-[62px]"
                loading="eager"
                width={728}
                height={90}
              />
              <span className="absolute bottom-0.5 left-2 text-[9px] text-white/25 font-medium tracking-wide uppercase select-none pointer-events-none">
                Ad
              </span>
            </a>
          ))}
          <div className="flex justify-end px-2 sm:px-0 lg:justify-center">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Thu gon banner"
              className="flex h-6 w-9 items-center justify-center rounded-full border border-white/12 bg-black/55 text-amber-200 shadow-sm backdrop-blur transition-colors hover:bg-black/70 hover:text-white sm:h-7 sm:w-10 lg:h-8 lg:w-8"
            >
              <i className="ri-arrow-up-s-line text-lg leading-none" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
