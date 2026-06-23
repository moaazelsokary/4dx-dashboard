/**
 * Service worker disabled — purge any legacy registration on app load.
 */

/**
 * Unregister all service workers and clear Cache Storage.
 * Fixes stale SW returning 503 "Network error and no cache available" on reload.
 */
export async function purgeServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.warn('[SW] Unregister failed:', error);
  }

  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (error) {
      console.warn('[SW] Cache clear failed:', error);
    }
  }
}

/** @deprecated Service worker removed */
export function registerServiceWorker(): void {
  void purgeServiceWorker();
}

export function unregisterServiceWorker(): void {
  void purgeServiceWorker();
}
