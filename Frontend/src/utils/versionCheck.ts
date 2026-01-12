/**
 * Version checking and cache invalidation utility
 * Ensures users always get the latest version after deployment
 */

// Build version - will be replaced during build
declare const __BUILD_VERSION__: string;
const BUILD_VERSION_RAW = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : '__BUILD_VERSION__';
const BUILD_VERSION = String(BUILD_VERSION_RAW || '__BUILD_VERSION__');
const VERSION_CHECK_INTERVAL = 60000; // Check every minute
const VERSION_STORAGE_KEY = 'app-version';

let versionCheckInterval: number | null = null;

/**
 * Get current build version
 */
export function getBuildVersion(): string {
  // In production, BUILD_VERSION will be replaced with actual version
  // In development, return timestamp
  const versionStr = String(BUILD_VERSION || '');
  if (versionStr.startsWith('__') && versionStr.endsWith('__')) {
    return Date.now().toString();
  }
  return versionStr || Date.now().toString();
}

/**
 * Get stored version from localStorage
 */
function getStoredVersion(): string | null {
  try {
    return localStorage.getItem(VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Store current version
 */
function storeVersion(version: string): void {
  try {
    localStorage.setItem(VERSION_STORAGE_KEY, version);
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Check if a new version is available
 */
async function checkForNewVersion(): Promise<boolean> {
  try {
    // Fetch index.html with cache-busting query parameter
    const response = await fetch(`/?v=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
    });

    // Check ETag or Last-Modified header if available
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');

    if (etag || lastModified) {
      const currentVersion = etag || lastModified;
      const storedVersion = getStoredVersion();

      if (storedVersion && storedVersion !== currentVersion) {
        return true; // New version available
      }

      if (currentVersion) {
        storeVersion(currentVersion);
      }
    }

    // Fallback: Check if HTML content has changed by fetching a small part
    const htmlResponse = await fetch(`/?v=${Date.now()}`, {
      cache: 'no-store',
    });
    const htmlText = await htmlResponse.text();
    
    // Extract script src to check if assets changed
    const scriptMatch = htmlText.match(/src="([^"]+\.js)"/);
    if (scriptMatch) {
      const scriptSrc = scriptMatch[1];
      const scriptVersion = scriptSrc.split('/').pop() || '';
      const storedScriptVersion = getStoredVersion();

      if (storedScriptVersion && storedScriptVersion !== scriptVersion) {
        return true; // New version available
      }

      if (scriptVersion) {
        storeVersion(scriptVersion);
      }
    }

    return false;
  } catch (error) {
    console.warn('[Version Check] Error checking for new version:', error);
    return false;
  }
}

/**
 * Force reload the page
 */
function forceReload(): void {
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        caches.delete(name);
      });
    });
  }

  // Clear localStorage version
  try {
    localStorage.removeItem(VERSION_STORAGE_KEY);
  } catch {
    // Ignore
  }

  // Reload the page
  window.location.reload();
}

/**
 * Initialize version checking
 */
export function initVersionCheck(): void {
  // Store initial version
  const currentVersion = getBuildVersion();
  storeVersion(currentVersion);

  // Check for new version periodically
  versionCheckInterval = window.setInterval(async () => {
    const hasNewVersion = await checkForNewVersion();
    if (hasNewVersion) {
      console.log('[Version Check] New version detected, reloading...');
      clearInterval(versionCheckInterval!);
      forceReload();
    }
  }, VERSION_CHECK_INTERVAL);

  // Also check on visibility change (when user returns to tab)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      const hasNewVersion = await checkForNewVersion();
      if (hasNewVersion) {
        console.log('[Version Check] New version detected on tab focus, reloading...');
        clearInterval(versionCheckInterval!);
        forceReload();
      }
    }
  });

  // Check on page load (but don't reload immediately - wait a bit to avoid reload loops)
  // Only reload if we detect a version change after the page has fully loaded
  setTimeout(() => {
    checkForNewVersion().then((hasNewVersion) => {
      if (hasNewVersion) {
        console.log('[Version Check] New version detected after load, reloading...');
        clearInterval(versionCheckInterval!);
        forceReload();
      }
    });
  }, 5000); // Wait 5 seconds after page load before checking
}

/**
 * Stop version checking
 */
export function stopVersionCheck(): void {
  if (versionCheckInterval !== null) {
    clearInterval(versionCheckInterval);
    versionCheckInterval = null;
  }
}
