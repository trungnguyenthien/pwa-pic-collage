// Service Worker for PicStudio PWA (Compliant with pwa-standards)
const CACHE_NAME = 'picstudio-v2';

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

// Install: Cache initial shell assets and skip waiting immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// Activate: Clean up all older caches immediately and claim clients
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

// Fetch: Network-First for HTML/Scripts/Styles, Stale-While-Revalidate for images
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // 1. In local development (localhost / 127.0.0.1), bypass Service Worker cache
  if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
    return;
  }

  // 2. Scope Isolation: Never intercept requests outside this PWA scope
  if (requestUrl.origin === self.location.origin && !request.url.startsWith(self.registration.scope)) {
    return;
  }

  // 3. Ignore non-GET, blob:, data:, and chrome-extension: requests
  if (
    request.method !== 'GET' ||
    requestUrl.protocol === 'blob:' ||
    requestUrl.protocol === 'data:' ||
    requestUrl.protocol === 'chrome-extension:'
  ) {
    return;
  }

  // 4. Network-First strategy for documents, HTML, scripts, and CSS
  const isCodeOrDoc = 
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    requestUrl.pathname.endsWith('.html') ||
    requestUrl.pathname.endsWith('.js') ||
    requestUrl.pathname.endsWith('.css');

  if (isCodeOrDoc) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            return new Response('Network error occurred and no cache available', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
        })
    );
    return;
  }

  // 5. Stale-While-Revalidate for static media / fonts / icons
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
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
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
