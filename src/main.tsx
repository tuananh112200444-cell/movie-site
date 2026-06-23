// ━━━ No StrictMode in production — saves one full re-render cycle ━━━
import './i18n'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reportWebVitals } from './utils/performance'

const rootElement = document.getElementById('root');

if (!rootElement) {
  document.body.innerHTML = '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080a10;color:#fff;font-family:Arial,sans-serif;padding:24px;text-align:center"><div><h1 style="font-size:24px;margin:0 0 12px">KhoPhim dang cap nhat</h1><p style="color:rgba(255,255,255,.72);margin:0 0 20px">Vui long tai lai trang de nhan phien ban moi nhat.</p><button onclick="location.reload()" style="background:#dc2626;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-weight:700;cursor:pointer">Tai lai</button></div></main>';
} else {
  createRoot(rootElement).render(<App />);
}

// Report Core Web Vitals sau khi render
reportWebVitals()

const STALE_TAB_RELOAD_MS = 15 * 60 * 1000;
const STALE_TAB_RELOAD_KEY = 'kp_stale_tab_reload_v1';

function hasActiveMediaPlayback(): boolean {
  return Array.from(document.querySelectorAll('video, audio')).some((media) => {
    const element = media as HTMLMediaElement;
    return !element.paused && !element.ended && element.readyState > 1;
  });
}

function reloadOnceForFreshShell(reason: string): void {
  const key = `${STALE_TAB_RELOAD_KEY}_${reason}`;
  if (sessionStorage.getItem(key) === '1') return;
  if (hasActiveMediaPlayback()) return;
  sessionStorage.setItem(key, '1');
  window.location.reload();
}

async function clearLegacyKhophimCaches(): Promise<void> {
  try {
    if (!('caches' in window)) return;
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => /^khophim|workbox/i.test(name))
        .map((name) => caches.delete(name))
    );
  } catch {
    // Best-effort cleanup only.
  }
}

async function removeLegacyServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (!registrations.length) {
      await clearLegacyKhophimCaches();
      return;
    }

    await Promise.all(registrations.map(async (registration) => {
      try {
        await registration.update();
      } catch {
        // Some old workers cannot update; unregister them anyway.
      }
      await registration.unregister();
    }));
    await clearLegacyKhophimCaches();

    if (navigator.serviceWorker.controller) {
      reloadOnceForFreshShell('sw_removed');
    }
  } catch {
    // Do not block app startup if a browser blocks service worker APIs.
  }
}

// ── Page Visibility: pause heavy animations when tab hidden ──
if (typeof document !== 'undefined') {
  let hiddenAt = Date.now();

  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('tab-hidden', document.hidden);
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (Date.now() - hiddenAt > STALE_TAB_RELOAD_MS) {
      reloadOnceForFreshShell('visible_after_stale');
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reloadOnceForFreshShell('bfcache_restore');
  });
}

// ── Service Worker Registration: "Never Go Down" ──
const ENABLE_SERVICE_WORKER = false;

// Service worker is disabled temporarily to recover visitors stuck on old cached builds.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void removeLegacyServiceWorkers();
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'KHOPHIM_SW_REMOVED') return;
    if (sessionStorage.getItem('kp_sw_removed_reload_v1') === '1') return;
    sessionStorage.setItem('kp_sw_removed_reload_v1', '1');
    window.location.reload();
  });
}

if (ENABLE_SERVICE_WORKER && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (sessionStorage.getItem('kp_sw_refreshed_v1') === '1') return;
          sessionStorage.setItem('kp_sw_refreshed_v1', '1');
          window.location.reload();
        });

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available, activate immediately
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {
        // Silent fail
      });
  });
}
