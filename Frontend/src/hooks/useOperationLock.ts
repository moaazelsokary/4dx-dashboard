// React hook for checking if add/delete operations are locked
import { useQuery } from '@tanstack/react-query';
import { checkOperationLock } from '@/services/configService';

/**
 * Hook to check if add or delete objective operation is locked
 */
export function useOperationLock(
  operation: 'add' | 'delete',
  kpi?: string,
  departmentId?: number,
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = useQuery<{ is_locked: boolean; lock_reason?: string }>({
    queryKey: ['operationLock', operation, kpi, departmentId],
    queryFn: async () => {
      return await checkOperationLock(operation, kpi, departmentId);
    },
    enabled: enabled, // Allow checking even without KPI (backend will handle it)
    staleTime: 0, // Always check fresh
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return {
    isLocked: data?.is_locked || false,
    lockReason: data?.lock_reason,
    isLoading,
    error,
    refetch,
  };
}
