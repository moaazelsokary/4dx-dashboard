/**
 * Service worker disabled — neutralize any legacy registration on production.
 */

const KILL_SWITCH_URL = '/sw.js';

/**
 * Unregister all service workers and clear Cache Storage.
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Force-download the kill-switch worker (replaces broken legacy SW), then purge.
 * Call on every app load so production recovers without manual "clear site data".
 */
export async function neutralizeLegacyServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === 'SW_KILL_RELOAD') {
      window.location.reload();
    }
  };
  navigator.serviceWorker.addEventListener('message', onMessage);

  try {
    const registration = await navigator.serviceWorker.register(KILL_SWITCH_URL, {
      scope: '/',
      updateViaCache: 'none',
    });
    await registration.update();

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    if (registration.installing || registration.waiting) {
      await Promise.race([navigator.serviceWorker.ready, wait(2500)]);
    }
  } catch (error) {
    console.warn('[SW] Kill-switch register failed:', error);
  }

  await purgeServiceWorker();
}

/** @deprecated Service worker removed */
export function registerServiceWorker(): void {
  void neutralizeLegacyServiceWorker();
}

export function unregisterServiceWorker(): void {
  void purgeServiceWorker();
}
