/**
 * ═══════════════════════════════════════════════════════════
 *  KHOPHIM SERVICE WORKER — "NEVER GO DOWN" EDITION
 *  Cache: static assets + API responses + poster images
 *  Strategy: Network First cho API, Cache First cho ảnh
 * ═══════════════════════════════════════════════════════════
 */

const CACHE_NAME = 'khophim-cache-v6';
const STATIC_CACHE = 'khophim-static-v6';
const IMAGE_CACHE = 'khophim-images-v6';
const API_CACHE = 'khophim-api-v6';

// Precache các file cốt lõi (được build ra từ Vite)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
];

// Danh sách pattern cần cache
const STATIC_PATTERNS = [
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.json$/,
];

const IMAGE_PATTERNS = [
  /img\.ophim\.live/,
  /wsrv\.nl/,
  /readdy\.ai\/api\/search-image/,
  /public\.readdy\.ai/,
  /static\.readdy\.ai/,
  /storage\.readdy-site\.link/,
];

const API_PATTERNS = [
  /supabase\.co\/functions\/v1\/home-proxy/,
  /supabase\.co\/functions\/v1\/movie-detail-proxy/,
  /ophim1\.com/,
  /phimapi\.com/,
  /phimimg\.com/,
  /nguonc\.com/,
];
const STALE_FIRST_API_PATTERNS = [
  /supabase\.co\/functions\/v1\/home-proxy/,
  /supabase\.co\/functions\/v1\/movie-detail-proxy/,
];
const IMAGE_MAX_MB = 200;
const API_MAX_MB = 50;
const STATIC_MAX_MB = 50;

function mbToBytes(mb) { return mb * 1024 * 1024; }

/** Quota-guarded cache put — silently skips if over limit */
async function guardedCachePut(cacheName, request, response, maxBytes) {
  try {
    const cache = await caches.open(cacheName);
    // Estimate response size
    const cloned = response.clone();
    const blob = await cloned.blob();
    if (blob.size > maxBytes * 0.5) {
      // Single entry too large, skip caching
      return;
    }
    await cache.put(request, response.clone());
    // Evict oldest if over quota
    await evictIfOverLimit(cacheName, maxBytes);
  } catch (e) {
    // Quota exceeded or other error — silently skip
  }
}

/** LRU eviction: count-based — nhanh hơn nhiều so với đọc blob từng entry */
async function evictIfOverLimit(cacheName, maxBytes) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length === 0) return;

    // Rough count-based limit (giả định avg size để tránh đọc blob)
    const avgSize = cacheName === IMAGE_CACHE ? 180 * 1024 : cacheName === STATIC_CACHE ? 80 * 1024 : 40 * 1024;
    const maxEntries = Math.max(20, Math.floor(maxBytes / avgSize));
    if (keys.length <= maxEntries) return;

    const toDelete = keys.length - Math.floor(maxEntries * 0.8);
    for (let i = 0; i < toDelete && i < keys.length; i++) {
      await cache.delete(keys[i]);
    }
  } catch (e) {
    // Silently fail
  }
}

/* ─── INSTALL: Precache core assets ─── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).catch(() => {
      // A failed precache must not block activation for existing visitors.
    }).then(() => {
      // Skip waiting để activate ngay lập tức
      self.skipWaiting();
    })
  );
});

/* ─── ACTIVATE: Clean old caches ─── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return name !== STATIC_CACHE &&
                   name !== IMAGE_CACHE &&
                   name !== API_CACHE;
          })
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of all clients immediately
      self.clients.claim();
    })
  );
});

/* ─── Helper: Check if URL matches patterns ─── */
function matchesPatterns(url, patterns) {
  return patterns.some((pattern) => pattern.test(url));
}
function isMediaRequest(request, url) {
  const pathname = url.pathname.toLowerCase();
  return (
    request.destination === 'video' ||
    request.destination === 'audio' ||
    pathname.endsWith('.m3u8') ||
    pathname.endsWith('.ts') ||
    pathname.endsWith('.m4s') ||
    pathname.endsWith('.mp4') ||
    pathname.endsWith('.webm') ||
    pathname.endsWith('.mkv')
  );
}

function cacheFallback(request) {
  return caches.match(request).then((cached) => cached || Response.error());
}

/* ─── FETCH: Smart caching strategies ─── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Chỉ xử lý GET requests
  if (request.method !== 'GET') return;

if (isMediaRequest(request, url)) return;

  const sameOrigin = url.origin === self.location.origin;
  // 0. Critical public edge APIs: return cached data immediately, refresh in background.
  if (matchesPatterns(url.href, STALE_FIRST_API_PATTERNS)) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          const network = fetch(request).then((response) => {
            if (response.ok) guardedCachePut(API_CACHE, request, response.clone(), mbToBytes(API_MAX_MB));
            return response;
          });

          if (cached) {
            event.waitUntil(network.catch(() => {}));
            return cached;
          }

          return network.catch(() => {
            return new Response(
              JSON.stringify({ status: false, msg: 'offline', sections: {}, episodes: [] }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          });
        });
      })
    );
    return;
  }
  // 1. API requests — Network First with LRU limit
  if (matchesPatterns(url.href, API_PATTERNS)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            guardedCachePut(API_CACHE, request, response.clone(), mbToBytes(API_MAX_MB));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({ status: false, msg: 'offline', items: [] }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // 2. Poster images — Cache First with LRU size limit
  if (matchesPatterns(url.href, IMAGE_PATTERNS)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) {
            // Refresh ngầm nếu cache cũ > 1 ngày
            fetch(request).then((response) => {
              if (response.ok) guardedCachePut(IMAGE_CACHE, request, response, mbToBytes(IMAGE_MAX_MB));
            }).catch(() => {});
            return cached;
          }
          return fetch(request).then((response) => {
            if (response.ok) {
              guardedCachePut(IMAGE_CACHE, request, response.clone(), mbToBytes(IMAGE_MAX_MB));
            }
            return response;
          }).catch(() => {
            // Trả ảnh placeholder nếu không có cache
            return new Response('', { status: 404 });
          });
        });
      })
    );
    return;
  }

  // 3. Static assets (JS, CSS, fonts) - Network First so old visitors get new chunks after deploy.
  if (matchesPatterns(url.href, STATIC_PATTERNS)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return fetch(request, { cache: 'no-store' })
          .then((response) => {
            if (response.ok) {
              guardedCachePut(STATIC_CACHE, request, response.clone(), mbToBytes(STATIC_MAX_MB));
            }
            return response;
          })
          .catch(() => cache.match(request).then((cached) => cached || Response.error()));
      })
    );
    return;
  }

  // 4. Navigation requests (HTML pages) — Network First
  if (sameOrigin && request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => {
          return caches.match('/index.html').then((cached) => {
            if (cached) return cached;
            return new Response(
              '<!DOCTYPE html><html><head><title>KhoPhim — Offline</title></head>' +
              '<body style="background:#080a10;color:#fff;font-family:sans-serif;' +
              'display:flex;align-items:center;justify-content;height:100vh;margin:0;">' +
              '<div style="text-align:center;">' +
              '<h1 style="color:#ef4444;margin-bottom:8px;">KhoPhim</h1>' +
              '<p style="color:#ffffff80;">Bạn đang ngoại tuyến.</p>' +
              '<p style="color:#ffffff50;font-size:14px;">Một số phim đã xem trước đó vẫn có thể xem được.</p>' +
              '</div></body></html>',
              { status: 200, headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
    );
    return;
  }

  // 5. Default — Network First with cache fallback
  if (sameOrigin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => cacheFallback(request))
    );
  }
});

/* ─── MESSAGE: Listen for skipWaiting from app ─── */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_CACHE_STATUS' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ fromCache: false, version: CACHE_NAME });
  }
});

/* ─── SYNC: Background sync for analytics (future) ─── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'analytics-sync') {
    // TODO: Gửi analytics queued khi online
  }
});

/* ─── PUSH: Keep alive for push notifications (future) ─── */
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'KhoPhim', {
      body: data.body ?? 'Có phim mới!',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: data.url ?? '/',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(event.notification.data)
  );
});
