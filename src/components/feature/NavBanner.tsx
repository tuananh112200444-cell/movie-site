import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface BannerItem {
  id: string;
  url: string;
  image: string;
  alt: string;
}

const ROTATE_INTERVAL_MS = 5000;

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
    image: '/banners/winaz-728x90.gif',
    alt: 'WinAZ banner',
  },
];

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!isCollapsed || BANNERS.length < 2) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % BANNERS.length);
    }, ROTATE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isCollapsed]);

  const activeBanner = BANNERS[activeIndex];

  const handleClick = () => {
    trackNavBannerClick(location.pathname, activeBanner);
  };

  const toggleCollapsed = () => {
    setIsCollapsed((currentValue) => !currentValue);
  };

  if (isCollapsed) {
    return (
      <div className="relative z-0 w-full border-t border-white/[0.04] bg-[#0d0f1a]/85">
        <div className="mx-auto w-full max-w-none sm:max-w-[728px] sm:px-3">
          <a
            key={activeBanner.id}
            href={activeBanner.url}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            onClick={handleClick}
            className="block relative active:scale-[0.99] transition-transform cursor-pointer"
          >
            <img
              src={activeBanner.image}
              alt={activeBanner.alt}
              className="h-auto w-full object-cover object-center sm:max-h-[52px] sm:object-contain"
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
              aria-label="Mo banner"
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
    <div className="relative z-0 w-full border-t border-white/[0.04] bg-[#0d0f1a]/88">
      <div className="mx-auto w-full max-w-none sm:max-w-[728px] sm:px-3">
        <div className="flex min-w-0 flex-col gap-px sm:gap-1.5 sm:py-1">
          {BANNERS.map((banner) => (
            <a
              key={banner.id}
              href={banner.url}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              onClick={() => trackNavBannerClick(location.pathname, banner)}
              className="block relative active:scale-[0.99] transition-transform cursor-pointer"
            >
              <img
                src={banner.image}
                alt={banner.alt}
                className="h-auto w-full object-cover object-center sm:max-h-[52px] sm:object-contain"
                loading="eager"
                width={728}
                height={90}
              />
              <span className="absolute bottom-0.5 left-2 text-[9px] text-white/25 font-medium tracking-wide uppercase select-none pointer-events-none">
                Ad
              </span>
            </a>
          ))}
          <div className="flex justify-end px-2 sm:px-0">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Thu gon banner"
              className="flex h-6 w-9 items-center justify-center rounded-full border border-white/12 bg-black/55 text-amber-200 shadow-sm backdrop-blur transition-colors hover:bg-black/70 hover:text-white sm:h-7 sm:w-10"
            >
              <i className="ri-arrow-up-s-line text-lg leading-none" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
