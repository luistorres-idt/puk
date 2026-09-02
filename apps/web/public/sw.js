/* eslint-disable */
// Service Worker for Bull Dog Solution PWA
// STRICT POLICY: Only cache safe static assets. NEVER cache API responses or authenticated requests.

const CACHE_NAME = 'bds-static-v1';
const STATIC_ASSETS = ['/', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. NEVER intercept or cache non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // 2. NEVER intercept or cache API or health endpoints
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/health') ||
    url.pathname.startsWith('/docs')
  ) {
    return;
  }

  // 3. Only serve safe static assets from same origin
  if (url.origin === self.location.origin) {
    // For navigation requests (HTML pages), network first with fallback to index
    if (event.request.mode === 'navigate') {
      event.respondWith(
        fetch(event.request).catch(() => {
          return caches.match('/');
        }),
      );
      return;
    }

    // For static assets (.js, .css, .svg, .png, .woff2), stale-while-revalidate or cache-first
    const isStaticAsset = /\.(js|css|svg|png|jpg|jpeg|webp|woff2?|ico)$/i.test(url.pathname);
    if (isStaticAsset) {
      event.respondWith(
        caches.match(event.request).then((cached) => {
          if (cached) {
            // Background revalidate
            fetch(event.request)
              .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                  caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
                }
              })
              .catch(() => {});
            return cached;
          }

          return fetch(event.request).then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const toCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
            return response;
          });
        }),
      );
    }
  }
});
