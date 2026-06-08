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

// ── Page Visibility: pause heavy animations when tab hidden ──
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('tab-hidden', document.hidden);
  });
}

// ── Service Worker Registration: "Never Go Down" ──
const ENABLE_SERVICE_WORKER = false;

// Service worker is disabled temporarily to recover visitors stuck on old cached builds.
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
