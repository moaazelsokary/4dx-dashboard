/**
 * Service Worker management for automatic updates
 */

const SW_PATH = '/sw.js';
declare const __BUILD_VERSION__: string;
const SW_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : '__BUILD_VERSION__';

/**
 * Register service worker if supported
 */
export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(SW_PATH)
        .then((registration) => {
          console.log('[SW] Service Worker registered:', registration.scope);

          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60000); // Check every minute

          // Handle updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available, force reload
                  console.log('[SW] New service worker available, reloading...');
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                }
              });
            }
          });

          // Handle controller change (new SW activated)
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[SW] New service worker activated, reloading...');
            window.location.reload();
          });
        })
        .catch((error) => {
          console.warn('[SW] Service Worker registration failed:', error);
        });
    });
  }
}

/**
 * Unregister service worker (for cleanup)
 */
export function unregisterServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.unregister();
    });
  }
}
