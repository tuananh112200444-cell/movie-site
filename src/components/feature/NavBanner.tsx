import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const BANNER_URL = 'https://s6b22.6789.show/register.html';
const BANNER_IMAGE = 'https://storage.readdy-site.link/project_files/ae072a89-671e-4fbc-ae27-6b94b6cb5c25/b9d20cec-297f-40d5-8cb8-07cbeb5f185b_728X90-WORLD-CUP2026.gif?v=3c6908c952347f9a696c86f44ee81c38';

function trackNavBannerClick(pagePath: string) {
  const payload = {
    url: BANNER_URL,
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

  const handleClick = () => {
    trackNavBannerClick(location.pathname);
  };

  return (
    <div className="relative z-0 w-full bg-[#0d0f1a]/80">
      <div className="relative mx-auto max-w-[728px] px-2 sm:px-3">
        <a
          href={BANNER_URL}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={handleClick}
          className="block relative active:scale-[0.99] transition-transform cursor-pointer"
        >
          <img
            src={BANNER_IMAGE}
            alt="World Cup 2026"
            className="w-full h-auto max-h-[48px] sm:max-h-[56px] object-contain object-center"
            loading="eager"
            width={728}
            height={90}
          />
          <span className="absolute bottom-0.5 left-2 text-[9px] text-white/25 font-medium tracking-wide uppercase select-none pointer-events-none">
            Ad
          </span>
        </a>
      </div>
    </div>
  );
}