// React hook for checking lock status
import { useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LockCheckResponse } from '@/types/config';
import { checkLockStatus, checkLockStatusBatch } from '@/services/configService';
import type { LockCheckRequest } from '@/types/config';

/**
 * Hook to check if a single field is locked
 */
export function useLockStatus(
  fieldType: 'target' | 'monthly_target' | 'monthly_actual' | 'all_fields',
  departmentObjectiveId: number | null,
  month?: string,
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = useQuery<LockCheckResponse>({
    queryKey: ['lockStatus', fieldType, departmentObjectiveId, month],
    queryFn: async () => {
      if (!departmentObjectiveId) {
        console.log(`[Lock Check] Skipped - no objective ID for ${fieldType}`);
        return { is_locked: false };
      }
      console.log(`[Lock Check] Checking ${fieldType} for objective ${departmentObjectiveId}${month ? ` month ${month}` : ''}`);
      const result = await checkLockStatus(fieldType, departmentObjectiveId, month);
      console.log(`[Lock Check] Result for ${fieldType}:`, result);
      return result;
    },
    enabled: enabled && !!departmentObjectiveId,
    staleTime: 0, // Always check fresh (no caching)
    gcTime: 0, // No garbage collection time (replaces cacheTime in newer versions)
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Log when enabled state changes
  useEffect(() => {
    console.log(`[Lock Check] Hook state for ${fieldType} (obj: ${departmentObjectiveId}):`, {
      enabled,
      departmentObjectiveId,
      isLocked: data?.is_locked,
      isLoading,
      hasError: !!error,
    });
  }, [enabled, departmentObjectiveId, fieldType, data?.is_locked, isLoading, error]);

  return {
    isLocked: data?.is_locked || false,
    lockInfo: data,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to batch check multiple fields at once
 */
export function useBatchLockStatus(
  checks: LockCheckRequest[],
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['batchLockStatus', checks],
    queryFn: async () => {
      if (checks.length === 0) {
        return { results: [] };
      }
      return await checkLockStatusBatch(checks);
    },
    enabled: enabled && checks.length > 0,
    staleTime: 0,
    cacheTime: 0,
  });

  // Create a map for easy lookup
  const lockMap = new Map<string, LockCheckResponse>();
  if (data?.results) {
    data.results.forEach((result) => {
      const key = `${result.field_type}-${result.department_objective_id}${result.month ? `-${result.month}` : ''}`;
      lockMap.set(key, result);
    });
  }

  // Helper function to get lock status for a specific field
  const getLockStatus = useCallback(
    (
      fieldType: 'target' | 'monthly_target' | 'monthly_actual',
      departmentObjectiveId: number,
      month?: string
    ): LockCheckResponse => {
      const key = `${fieldType}-${departmentObjectiveId}${month ? `-${month}` : ''}`;
      return lockMap.get(key) || { is_locked: false };
    },
    [lockMap]
  );

  return {
    lockMap,
    getLockStatus,
    isLoading,
    error,
    refetch,
  };
}
