import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './CinematicLogoIntro.css';

const INTRO_SESSION_KEY = 'khophim.cinematic-intro.seen.v1';
const INTRO_MIN_MS = 2_500;
const INTRO_MAX_MS = 2_700;
const INTRO_EXIT_MS = 420;
const BOT_USER_AGENT = /bot|crawler|spider|googlebot|bingbot|facebookexternalhit|lighthouse/i;

function waitForWindowLoad(): Promise<void> {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
}

async function settleCriticalPaint(): Promise<void> {
  await waitForWindowLoad();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  const criticalImages = Array.from(
    document.querySelectorAll<HTMLImageElement>('img[fetchpriority="high"], img[loading="eager"]'),
  ).slice(0, 3);
  const decoded = criticalImages.map((image) => {
    if (image.complete) return image.decode?.().catch(() => {}) ?? Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
  });

  await Promise.race([
    Promise.allSettled([fontsReady, ...decoded]),
    new Promise((resolve) => window.setTimeout(resolve, 650)),
  ]);
}

function readSessionSeen(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markSessionSeen(): void {
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, '1');
  } catch {
    // Private browsers may block session storage; the intro still works.
  }
}

export default function CinematicLogoIntro() {
  const { pathname, search } = useLocation();
  const introMode = new URLSearchParams(search).get('intro');
  const previewMode = introMode === 'preview';
  const forceDemo = introMode === 'demo' || previewMode;
  const disabled = introMode === 'off';
  const [visible, setVisible] = useState(() => {
    if (disabled || BOT_USER_AGENT.test(navigator.userAgent)) return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (!forceDemo && pathname !== '/') return false;
    return forceDemo || !readSessionSeen();
  });
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    markSessionSeen();
    exitTimerRef.current = window.setTimeout(() => setVisible(false), INTRO_EXIT_MS);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const startedAt = performance.now();
    document.documentElement.classList.add('kp-logo-intro-active');

    const hardStop = window.setTimeout(finish, previewMode ? 15_000 : INTRO_MAX_MS);
    if (!previewMode) {
      void settleCriticalPaint().then(() => {
        const remaining = Math.max(0, INTRO_MIN_MS - (performance.now() - startedAt));
        window.setTimeout(finish, remaining);
      });
    }

    return () => {
      window.clearTimeout(hardStop);
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
      document.documentElement.classList.remove('kp-logo-intro-active');
    };
  }, [finish, previewMode, visible]);

  if (!visible) return null;

  return (
    <div className={`kp-logo-intro${leaving ? ' kp-logo-intro--leaving' : ''}`} data-kp-cinematic-intro="v1">
      <div className="kp-logo-intro__aurora" aria-hidden="true" />
      <div className="kp-logo-intro__grain" aria-hidden="true" />
      <button type="button" className="kp-logo-intro__skip" onClick={finish} aria-label="Bỏ qua màn hình giới thiệu">
        Bỏ qua
      </button>

      <div className="kp-logo-intro__content" role="status" aria-label="KhoPhim đang chuẩn bị nội dung">
        <div className="kp-logo-intro__scene" aria-hidden="true">
          <div className="kp-logo-intro__orbit kp-logo-intro__orbit--outer" />
          <div className="kp-logo-intro__orbit kp-logo-intro__orbit--inner" />
          <div className="kp-logo-intro__logo-stack">
            <img className="kp-logo-intro__logo-depth kp-logo-intro__logo-depth--4" src="/brand/khophim-logo-v2.png" alt="" />
            <img className="kp-logo-intro__logo-depth kp-logo-intro__logo-depth--3" src="/brand/khophim-logo-v2.png" alt="" />
            <img className="kp-logo-intro__logo-depth kp-logo-intro__logo-depth--2" src="/brand/khophim-logo-v2.png" alt="" />
            <img className="kp-logo-intro__logo-depth kp-logo-intro__logo-depth--1" src="/brand/khophim-logo-v2.png" alt="" />
            <img className="kp-logo-intro__logo-front" src="/brand/khophim-logo-v2.png" alt="" />
            <span className="kp-logo-intro__shine" />
          </div>
        </div>

        <div className="kp-logo-intro__wordmark" aria-hidden="true">
          <span>Kho</span><strong>Phim</strong>
        </div>
        <p className="kp-logo-intro__tagline">RẠP PHIM CỦA RIÊNG BẠN</p>
        <div className="kp-logo-intro__progress" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
