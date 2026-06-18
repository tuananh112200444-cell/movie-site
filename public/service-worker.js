// KhoPhim service worker kill switch.
//
// The app no longer uses a service worker because old cached builds could keep
// serving an offline fallback after deploys. Keeping this file lets existing
// registrations update to a tiny worker that unregisters itself and removes
// KhoPhim caches.

const KHOPHIM_CACHE_PREFIX = 'khophim';

async function clearKhophimCaches() {
  if (!self.caches) return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(KHOPHIM_CACHE_PREFIX))
      .map((name) => caches.delete(name))
  );
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(clearKhophimCaches());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await clearKhophimCaches();
      await self.clients.claim();

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
