/**
 * Network Status Hook
 * Monitors online/offline status and network quality
 */

import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean; // True if we just came back online
  isSlowConnection: boolean;
  quality: 'fast' | 'slow' | 'offline';
}

/**
 * Hook to monitor network status
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [quality, setQuality] = useState<'fast' | 'slow' | 'offline'>(
    navigator.onLine ? 'fast' : 'offline'
  );

  // Measure connection speed
  const measureConnectionSpeed = useCallback(async () => {
    if (!navigator.onLine) {
      setQuality('offline');
      setIsSlowConnection(false);
      return;
    }

    try {
      const startTime = performance.now();
      // Try to fetch a small resource to measure speed
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Consider connection slow if it takes more than 2 seconds
      const slow = duration > 2000;
      setIsSlowConnection(slow);
      setQuality(slow ? 'slow' : 'fast');
    } catch (error) {
      // If measurement fails, assume slow connection
      setIsSlowConnection(true);
      setQuality('slow');
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      const wasOfflineBefore = !isOnline;
      setIsOnline(true);
      setWasOffline(wasOfflineBefore);
      setQuality('fast');
      setIsSlowConnection(false);
      
      // Measure speed when coming back online
      setTimeout(() => {
        measureConnectionSpeed();
      }, 1000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(false);
      setQuality('offline');
      setIsSlowConnection(false);
    };

    // Initial measurement
    measureConnectionSpeed();
    
    // Measure periodically when online (every 30 seconds)
    const speedCheckInterval = setInterval(() => {
      if (navigator.onLine) {
        measureConnectionSpeed();
      }
    }, 30000);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(speedCheckInterval);
    };
  }, [isOnline, measureConnectionSpeed]);

  // Reset wasOffline flag after a short delay
  useEffect(() => {
    if (wasOffline && isOnline) {
      const timer = setTimeout(() => {
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [wasOffline, isOnline]);

  return {
    isOnline,
    wasOffline,
    isSlowConnection,
    quality,
  };
}
