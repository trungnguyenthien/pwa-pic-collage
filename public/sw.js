// Service Worker for PicStudio PWA (Compliant with pwa-standards)
const CACHE_NAME = 'picstudio-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-icon.png',
  './icons/apple-touch-icon.png',
  './favicon.ico',
  './favicon.png'
];

// Install: Cache initial shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// Activate: Clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Listen for skipWaiting message (triggered by "Update App" button)
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Fetch: Stale-While-Revalidate with Scope Isolation
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // 1. Scope Isolation: Never intercept requests outside this PWA scope
  if (requestUrl.origin === self.location.origin && !request.url.startsWith(self.registration.scope)) {
    return;
  }

  // 2. Ignore non-GET, blob:, data:, and chrome-extension: requests
  if (
    request.method !== 'GET' ||
    requestUrl.protocol === 'blob:' ||
    requestUrl.protocol === 'data:' ||
    requestUrl.protocol === 'chrome-extension:'
  ) {
    return;
  }

  // 3. Stale-While-Revalidate caching strategy
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is HTML navigation, fallback to cached index.html
          if (request.mode === 'navigate') {
            return caches.match('./index.html', { ignoreSearch: true });
          }
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
