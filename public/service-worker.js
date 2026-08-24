// KhoPhim service worker kill switch.
//
// The app no longer uses a service worker because old cached builds could keep
// serving an offline fallback after deploys. Keeping this file lets existing
// registrations update to a tiny worker that unregisters itself and removes
// KhoPhim caches.

const LEGACY_CACHE_RE = /^(khophim|workbox)/i;
const PROTECTED_WATCH_PATH_RE = /^\/xem-phim(?:\/|$)/;

async function clearKhophimCaches() {
  if (!self.caches) return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => LEGACY_CACHE_RE.test(name))
      .map((name) => caches.delete(name))
  );
}

async function hasActiveWatchClient() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return clients.some((client) => {
    try {
      return PROTECTED_WATCH_PATH_RE.test(new URL(client.url).pathname);
    } catch {
      return false;
    }
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await clearKhophimCaches();
      // Installed PWAs can remain alive in the background, which otherwise
      // leaves this cleanup worker waiting indefinitely and keeps serving the
      // old app shell. Activate immediately for normal pages, but never take
      // over while a visitor is on a protected watch route.
      if (!(await hasActiveWatchClient())) await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await clearKhophimCaches();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await self.registration.unregister();

      for (const client of clients) {
        client.postMessage({ type: 'KHOPHIM_SW_REMOVED' });
      }
    })()
  );
});

// Network pass-through while this temporary worker is still controlling a page.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
