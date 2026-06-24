/**
 * Kill-switch service worker — replaces the legacy worker that returned
 * 503 "Network error and no cache available" on SPA reload.
 *
 * Passthrough fetch: as soon as this script replaces the old worker, all
 * requests go to the network (no synthetic 503). Then activate clears caches
 * and unregisters so the site runs without a service worker.
 */
const SW_KILL_VERSION = '__BUILD_VERSION__';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        try {
          if ('navigate' in client) {
            await client.navigate(client.url);
          } else {
            client.postMessage({ type: 'SW_KILL_RELOAD', version: SW_KILL_VERSION });
          }
        } catch {
          /* client may be closing */
        }
      }
    })()
  );
});

// Critical: pass every request to the network so navigations never get 503.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
