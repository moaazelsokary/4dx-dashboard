/**
 * Service worker removed — purge any legacy registration on app load.
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
          /* ignore */
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

/** Purge legacy workers on every app load. Never register a new worker. */
export async function neutralizeLegacyServiceWorker(): Promise<void> {
  await purgeServiceWorker();
}

/** @deprecated Service worker removed */
export function registerServiceWorker(): void {
  void purgeServiceWorker();
}

export function unregisterServiceWorker(): void {
  void purgeServiceWorker();
}
