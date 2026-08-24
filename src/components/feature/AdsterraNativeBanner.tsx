import { useEffect, useRef, useState } from 'react';
import { ADSTERRA_BANNERS_ENABLED } from '../../lib/advertising';

const ZONE_ID = '9f5c539f1e2214dda5ba8d5cc9d05a24';
const SCRIPT_SRC = `https://pl30842366.effectivecpmnetwork.com/${ZONE_ID}/invoke.js`;

export default function AdsterraNativeBanner() {
  if (!ADSTERRA_BANNERS_ENABLED) return null;
  return <ActiveAdsterraNativeBanner />;
}

function ActiveAdsterraNativeBanner() {
  const sectionRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const slot = slotRef.current;
    if (!section || !slot) return;

    let script: HTMLScriptElement | null = null;
    let cancelled = false;

    const loadAd = () => {
      if (cancelled || script) return;

      slot.replaceChildren();
      script = document.createElement('script');
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      script.src = SCRIPT_SRC;
      script.dataset.adsterraZone = ZONE_ID;
      script.onerror = () => {
        if (!cancelled) setFailed(true);
      };
      section.insertBefore(script, slot);
    };

    if (!('IntersectionObserver' in window)) {
      loadAd();
      return () => {
        cancelled = true;
        script?.remove();
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        loadAd();
        observer.disconnect();
      },
      { rootMargin: '600px 0px' },
    );

    observer.observe(section);

    return () => {
      cancelled = true;
      observer.disconnect();
      script?.remove();
    };
  }, []);

  if (failed) return null;

  return (
    <section
      ref={sectionRef}
      className="adsterra-native-banner"
      aria-label="Quảng cáo"
      data-ad-zone={ZONE_ID}
    >
      <span className="adsterra-native-banner__label">Quảng cáo</span>
      <div ref={slotRef} id={`container-${ZONE_ID}`} className="adsterra-native-banner__slot" />
    </section>
  );
}
