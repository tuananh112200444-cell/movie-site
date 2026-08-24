import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ADSTERRA_ENABLED } from '../../lib/advertising';

const SCRIPT_SRC = 'https://pl30842367.effectivecpmnetwork.com/a9/71/37/a97137a855a0eea78c3794d6581791f2.js';

function isProtectedRoute(pathname: string): boolean {
  return /^\/xem-phim\/[^/]+(?:\/|$)/.test(pathname)
    || pathname === '/search'
    || pathname.startsWith('/admin');
}

export default function AdsterraSocialBar() {
  if (!ADSTERRA_ENABLED) return null;
  return <ActiveAdsterraSocialBar />;
}

function ActiveAdsterraSocialBar() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (isProtectedRoute(pathname)) return;

    let cancelled = false;
    let timer = 0;
    let observerTimer = 0;
    let script: HTMLScriptElement | null = null;
    const injectedNodes = new Set<Node>();

    // Social Bar adds its UI directly under <body>. Track only those top-level
    // additions so SPA navigation can remove the ad without touching React.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node === script || node === document.getElementById('root')) continue;
          injectedNodes.add(node);
        }
      }
    });

    const loadSocialBar = () => {
      if (cancelled) return;
      observer.observe(document.body, { childList: true });
      observerTimer = window.setTimeout(() => observer.disconnect(), 10_000);
      script = document.createElement('script');
      script.async = true;
      script.src = SCRIPT_SRC;
      script.dataset.adsterraSocialBar = 'a97137a855a0eea78c3794d6581791f2';
      document.body.appendChild(script);
    };

    const schedule = () => {
      timer = window.setTimeout(loadSocialBar, 2_400);
    };

    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      window.clearTimeout(timer);
      window.clearTimeout(observerTimer);
      observer.disconnect();
      script?.remove();
      injectedNodes.forEach((node) => node.parentNode === document.body && node.parentNode.removeChild(node));
    };
  }, [pathname]);

  return null;
}
