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
    const storedVersion = getStoredVersion();
    
    // If we don't have a stored version yet, don't trigger reload
    if (!storedVersion) {
      return false;
    }

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
      
      // Only return true if versions are different AND we have a stored version
      if (storedVersion && currentVersion && storedVersion !== currentVersion) {
        console.log('[Version Check] Version changed:', { stored: storedVersion, current: currentVersion });
        return true; // New version available
      }

      // Update stored version if we got a new one
      if (currentVersion && currentVersion !== storedVersion) {
        storeVersion(currentVersion);
      }
      
      // If versions match, definitely no new version
      if (storedVersion === currentVersion) {
        return false;
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
      
      // Only compare if we have both versions
      if (storedVersion && scriptVersion && storedVersion !== scriptVersion) {
        console.log('[Version Check] Script version changed:', { stored: storedVersion, current: scriptVersion });
        return true; // New version available
      }
      
      // If versions match, definitely no new version
      if (storedVersion === scriptVersion) {
        return false;
      }

      // Update stored version if we got a new one
      if (scriptVersion && scriptVersion !== storedVersion) {
        storeVersion(scriptVersion);
      }
    }

    // If we couldn't determine version, don't reload (safer to not reload)
    return false;
  } catch (error) {
    console.warn('[Version Check] Error checking for new version:', error);
    // On error, don't reload (safer to not reload)
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
  // Store initial version (only if not already stored)
  const storedVersion = getStoredVersion();
  const currentVersion = getBuildVersion();
  
  // Only store if we don't have a stored version yet (first load)
  if (!storedVersion) {
    storeVersion(currentVersion);
  }

  // Check for new version periodically (but not immediately)
  // Wait a bit before starting periodic checks to avoid interfering with initial load
  setTimeout(() => {
    versionCheckInterval = window.setInterval(async () => {
      const hasNewVersion = await checkForNewVersion();
      if (hasNewVersion) {
        console.log('[Version Check] New version detected, reloading...');
        clearInterval(versionCheckInterval!);
        forceReload();
      }
    }, VERSION_CHECK_INTERVAL);
  }, 10000); // Start checking after 10 seconds

  // Also check on visibility change (when user returns to tab)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      // Wait 10 seconds before checking to avoid false positives and give time for network
      setTimeout(async () => {
        const hasNewVersion = await checkForNewVersion();
        if (hasNewVersion) {
          console.log('[Version Check] New version detected on tab focus, reloading...');
          if (versionCheckInterval) {
            clearInterval(versionCheckInterval);
          }
          forceReload();
        } else {
          console.log('[Version Check] No new version detected, staying on current version');
        }
      }, 10000); // Changed from 2000ms to 10000ms (10 seconds)
    }
  });
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
