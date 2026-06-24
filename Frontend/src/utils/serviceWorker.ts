/**
 * Service worker removed — purge any legacy registration on app load.
 */

/**
 * Unregister all service workers and clear Cache Storage.
 */
export async function purgeServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        try {
          await registration.update();
        } catch {
          /* ignore update errors */
        }
        return registration.unregister();
      }),
    );
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

/**
 * Purge legacy workers. Do not register a new worker — the server-hosted
 * kill-switch sw.js is picked up automatically when the browser updates.
 */
export async function neutralizeLegacyServiceWorker(): Promise<void> {
  await purgeServiceWorker();

  const hadWorker = navigator.serviceWorker?.controller != null;
  if (hadWorker && sessionStorage.getItem('sw-purge-reload') !== '1') {
    try {
      sessionStorage.setItem('sw-purge-reload', '1');
      window.location.reload();
    } catch {
      /* ignore */
    }
  }
}

/** @deprecated Service worker removed */
export function registerServiceWorker(): void {
  void neutralizeLegacyServiceWorker();
}

export function unregisterServiceWorker(): void {
  void purgeServiceWorker();
}
