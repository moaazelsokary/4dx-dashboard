import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook for real-time CMS updates
 * Uses React Query's refetchInterval to poll for updates
 */
export function useRealtimeCMS(enabled = true, interval = 30000) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    // Set up polling for CMS data
    const pollInterval = setInterval(() => {
      // Invalidate queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['cms-pages'] });
      queryClient.invalidateQueries({ queryKey: ['cms-images'] });
      queryClient.invalidateQueries({ queryKey: ['cms-announcements'] });
      queryClient.invalidateQueries({ queryKey: ['cms-menu'] });
    }, interval);

    return () => clearInterval(pollInterval);
  }, [enabled, interval, queryClient]);
}

/**
 * Hook for optimistic UI updates
 * Updates cache immediately, then syncs with server
 */
export function useOptimisticCMSUpdate() {
  const queryClient = useQueryClient();

  const updateCache = <T,>(
    queryKey: string[],
    updater: (old: T[]) => T[]
  ) => {
    queryClient.setQueryData<T[]>(queryKey, (old) => {
      if (!old) return old;
      return updater(old);
    });
  };

  return { updateCache };
}

