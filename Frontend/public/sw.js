/**
 * Service Worker for cache management and automatic updates
 */

const CACHE_NAME = 'lifemakers-v2';
const BUILD_VERSION = '1768656318862';

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker, version:', BUILD_VERSION);
  
  // Force activation of new service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker, version:', BUILD_VERSION);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Take control of all pages immediately
  return self.clients.claim();
});

// Fetch event - network first, then cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // SPA navigations and HTML: do not intercept. Netlify serves index.html for all routes;
  // intercepting here caused 503 "Network error and no cache available" on reload when the
  // network fetch failed and HTML was never cached as a fallback.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    return;
  }

  // For external resources (fonts, etc.), don't intercept - let browser handle
  // Service workers shouldn't intercept external requests due to CSP restrictions
  if (url.origin !== self.location.origin) {
    // Don't intercept external requests - let them pass through normally
    return;
  }

  // For assets (JS/CSS), use cache-first strategy
  // Vite already handles versioning with hashes
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            }).catch((err) => {
              console.warn('[SW] Failed to cache response:', err);
            });
          }
          return response;
        })
        .catch(async (error) => {
          console.error('[SW] Fetch failed:', error);
          const retry = await fetch(request).catch(() => null);
          if (retry) return retry;
          return new Response('Network error', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        });
    })
  );
});

// Listen for skip waiting message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
