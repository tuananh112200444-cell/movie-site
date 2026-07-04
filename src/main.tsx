// No StrictMode in production: saves one full re-render cycle.
import './i18n'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reportWebVitals } from './utils/performance'
import { reportClientIssue } from './services/playerDiagnostics'

const rootElement = document.getElementById('root');

if (!rootElement) {
  document.body.innerHTML = '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080a10;color:#fff;font-family:Arial,sans-serif;padding:24px;text-align:center"><div><h1 style="font-size:24px;margin:0 0 12px">KhoPhim dang cap nhat</h1><p style="color:rgba(255,255,255,.72);margin:0 0 20px">Vui long tai lai trang de nhan phien ban moi nhat.</p><button onclick="location.reload()" style="background:#dc2626;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-weight:700;cursor:pointer">Tai lai</button></div></main>';
} else {
  try {
    rootElement.querySelector('#kp-boot-fallback')?.remove();
    rootElement.dataset.kpMounted = '1';
    createRoot(rootElement).render(<App />);
  } catch (error) {
    delete rootElement.dataset.kpMounted;
    reportClientIssue('app_error', error instanceof Error ? error.message : 'react mount failed');
    rootElement.innerHTML = '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080a10;color:#fff;font-family:Arial,sans-serif;padding:24px;text-align:center"><section style="max-width:460px"><h1 style="font-size:24px;margin:0 0 12px">KhoPhim dang tai lai</h1><p style="color:rgba(255,255,255,.72);line-height:1.6;margin:0 0 20px">Trinh duyet gap loi khi mo phien ban hien tai. Bam nut ben duoi de tai lai phien ban moi.</p><button onclick="location.replace(location.pathname+location.search+(location.search?\'&\':\'?\')+\'recover=\'+Date.now())" style="background:#dc2626;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer">Tai lai phien ban moi</button></section></main>';
  }
}

// Report Core Web Vitals after render.
reportWebVitals()

const STALE_TAB_RELOAD_MS = 30 * 60 * 1000;
const STALE_TAB_RELOAD_KEY = 'kp_stale_tab_reload_v2';
const STALE_TAB_RELOAD_COOLDOWN_MS = 2 * 60 * 1000;
const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|dynamically imported module/i;

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Some embedded browsers block sessionStorage. Recovery should remain best-effort.
  }
}

function hasActiveMediaPlayback(): boolean {
  return Array.from(document.querySelectorAll('video, audio')).some((media) => {
    const element = media as HTMLMediaElement;
    return !element.paused && !element.ended && element.readyState > 1;
  });
}

function reloadOnceForFreshShell(reason: string): void {
  const key = `${STALE_TAB_RELOAD_KEY}_${reason}`;
  const previous = Number(safeSessionGet(key) || 0);
  if (Number.isFinite(previous) && Date.now() - previous < STALE_TAB_RELOAD_COOLDOWN_MS) return;
  if (hasActiveMediaPlayback()) return;
  safeSessionSet(key, String(Date.now()));
  const eventType = reason === 'bfcache_restore'
    ? 'bfcache_restore_reload'
    : reason.includes('chunk')
      ? 'chunk_load_error'
      : 'stale_tab_reload';
  reportClientIssue(eventType, reason);
  window.location.reload();
}

function isChunkLikeError(message: string): boolean {
  return CHUNK_ERROR_RE.test(message);
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
      reportClientIssue('service_worker_removed', 'legacy service worker unregistered');
      reloadOnceForFreshShell('sw_removed');
    }
  } catch {
    // Do not block app startup if a browser blocks service worker APIs.
  }
}

// Page Visibility: pause heavy animations when tab hidden.
if (typeof document !== 'undefined') {
  let hiddenAt = document.hidden ? Date.now() : 0;

  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('tab-hidden', document.hidden);
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt > 0 && Date.now() - hiddenAt > STALE_TAB_RELOAD_MS) {
      reloadOnceForFreshShell('visible_after_stale');
    }
    hiddenAt = 0;
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reloadOnceForFreshShell('bfcache_restore');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'unknown rejection');
    reportClientIssue('unhandled_rejection', reason);
    if (isChunkLikeError(reason)) {
      void clearLegacyKhophimCaches().finally(() => reloadOnceForFreshShell('chunk_unhandled_rejection'));
    }
  });

  window.addEventListener('error', (event) => {
    const message = event.error instanceof Error ? event.error.message : event.message || 'unknown window error';
    reportClientIssue(isChunkLikeError(message) ? 'chunk_load_error' : 'app_error', message);
    if (isChunkLikeError(message)) {
      void clearLegacyKhophimCaches().finally(() => reloadOnceForFreshShell('chunk_window_error'));
    }
  });
}

// Service Worker Registration: disabled while recovering visitors stuck on old cached builds.
const ENABLE_SERVICE_WORKER = false;

// Service worker is disabled temporarily to recover visitors stuck on old cached builds.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void removeLegacyServiceWorkers();
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'KHOPHIM_SW_REMOVED') return;
    if (safeSessionGet('kp_sw_removed_reload_v1') === '1') return;
    safeSessionSet('kp_sw_removed_reload_v1', '1');
    window.location.reload();
  });
}

if (ENABLE_SERVICE_WORKER && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (safeSessionGet('kp_sw_refreshed_v1') === '1') return;
          safeSessionSet('kp_sw_refreshed_v1', '1');
          window.location.reload();
        });

        // Listen for updates.
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available, activate immediately.
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {
        // Silent fail.
      });
  });
}
