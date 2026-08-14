import { useEffect, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const DESKTOP_AD = {
  key: 'bdb00121f91598ecc645ad05155f9af9',
  width: 728,
  height: 90,
};

const MOBILE_AD = {
  key: 'b4a6445f28b35fc2a47190d98ebe6af6',
  width: 320,
  height: 50,
};

const AD_FRAME_ORIGIN = 'https://movie-site-eds.pages.dev';

export default function AdsterraResponsiveBanner({ deferMs = 0 }: { deferMs?: number }) {
  const mobile = useMediaQuery('(max-width: 767px)');
  const ad = mobile ? MOBILE_AD : DESKTOP_AD;
  const frameSrc = `${AD_FRAME_ORIGIN}/_ads/banner-${ad.width}x${ad.height}.html`;
  const [ready, setReady] = useState(deferMs <= 0);

  useEffect(() => {
    if (deferMs <= 0) {
      setReady(true);
      return;
    }
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), deferMs);
    return () => window.clearTimeout(timer);
  }, [deferMs]);

  return (
    <aside
      className="adsterra-responsive-banner"
      aria-label={`Quảng cáo ${ad.width} x ${ad.height}`}
      data-ad-size={`${ad.width}x${ad.height}`}
    >
      <span className="adsterra-responsive-banner__label">Quảng cáo</span>
      <div className="adsterra-responsive-banner__viewport" style={{ minHeight: ad.height }}>
        {ready && (
          <iframe
            key={ad.key}
            title={`Quảng cáo ${ad.width} x ${ad.height}`}
            src={frameSrc}
            width={ad.width}
            height={ad.height}
            loading="lazy"
            scrolling="no"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
      </div>
    </aside>
  );
}
