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
      console.log('[Version Check] No stored version found, skipping check');
      return false;
    }

    // Get the current build version from the embedded code
    const currentBuildVersion = getBuildVersion();
    
    // Compare stored version with current build version
    // This is the most reliable method since both come from the same source
    if (storedVersion && currentBuildVersion && storedVersion !== currentBuildVersion) {
      console.log('[Version Check] Version changed:', { 
        stored: storedVersion, 
        current: currentBuildVersion,
        willReload: true 
      });
      return true; // New version available
    }
    
    // If versions match, definitely no new version
    if (storedVersion === currentBuildVersion) {
      console.log('[Version Check] Versions match, no reload needed:', { 
        stored: storedVersion, 
        current: currentBuildVersion 
      });
      return false;
    }

    // Fallback: Check HTML for meta tag with build version
    try {
      const htmlResponse = await fetch(`/?v=${Date.now()}`, {
        cache: 'no-store',
      });
      const htmlText = await htmlResponse.text();
      
      // Check for meta tag with build version
      const metaMatch = htmlText.match(/<meta\s+name="build-version"\s+content="([^"]+)"/i);
      if (metaMatch) {
        const metaVersion = metaMatch[1];
        if (storedVersion && metaVersion && storedVersion !== metaVersion) {
          console.log('[Version Check] Meta version changed:', { 
            stored: storedVersion, 
            current: metaVersion 
          });
          return true;
        }
        if (storedVersion === metaVersion) {
          console.log('[Version Check] Meta versions match, no reload needed');
          return false;
        }
      }
    } catch (htmlError) {
      console.warn('[Version Check] Could not fetch HTML for version check:', htmlError);
    }

    // If we couldn't determine version reliably, don't reload (safer to not reload)
    console.log('[Version Check] Could not reliably determine version, not reloading');
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
