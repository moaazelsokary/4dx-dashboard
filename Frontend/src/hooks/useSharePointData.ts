import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDepartmentData, testSharePointConnection } from '@/services/sharepointService';
import { DepartmentData } from '@/types/dashboard';
import { sharePointCacheService } from '@/services/sharePointCacheService';

// Define LagMetric type here to match the service
interface LagMetric {
  id: string;
  name: string;
  value: number;
  target: number;
  trend: number;
  leads: {
    id: string;
    name: string;
    value: number;
    target: number;
    trend: number;
  }[];
}

// Hook for fetching department-specific data (optimized)
export const useDepartmentData = (
  department: string
) => {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ['departmentData', department],
    queryFn: async () => {
      // Check for cached data first
      const cached = sharePointCacheService.getCachedData();
      if (cached && !cached.isStale && cached[department]) {
        console.log(`✅ Using cached SharePoint data for ${department}`);
        return cached[department];
      }

      // Fetch fresh data if not cached
      const data = await getDepartmentData(department);
      
      // Update cache with new data
      if (cached) {
        cached[department] = data;
        sharePointCacheService.cacheData(cached);
      }
      
      return data;
    },
    enabled: !!department && department !== 'CEO',
    staleTime: 5 * 60 * 1000, // 5 minutes - match cache duration
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};

// Hook for fetching all departments data (for CEO view)
export const useAllDepartmentsData = () => {
  return useQuery({
    queryKey: ['allDepartmentsData'],
    queryFn: async () => {
      // Check for cached data first
      const cached = sharePointCacheService.getCachedData();
      if (cached && !cached.isStale) {
        console.log('✅ Using cached SharePoint data for CEO view');
        return cached;
      }

      // For CEO view, we'll fetch data for all departments
      const departments = ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices'];
      const results = await Promise.allSettled(
        departments.map(dept => getDepartmentData(dept))
      );
      
      // Create a map of department to LagMetrics
      const departmentDataMap: { [key: string]: LagMetric[] } = {};
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          departmentDataMap[departments[index]] = result.value;
        }
      });

      // Cache the fresh data
      sharePointCacheService.cacheData(departmentDataMap);
      
      return departmentDataMap;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - match cache duration
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};

// Hook for getting available departments
export const useDepartments = () => {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => {
      // Return the list of available departments
      return ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices'];
    },
    staleTime: Infinity, // Department list doesn't change often
  });
};

// Utility function to get department data based on user role
export const useUserData = (
  user: { role: string; departments: string[] } | null
) => {
  const isCEO = user?.role === 'CEO';
  const departmentData = useDepartmentData(
    isCEO ? '' : user?.departments[0] || ''
  );
  const allDepartmentsData = useAllDepartmentsData();
  if (isCEO) {
    return {
      data: allDepartmentsData.data,
      isLoading: allDepartmentsData.isLoading,
      error: allDepartmentsData.error,
      isCEO: true,
      refetch: allDepartmentsData.refetch
    };
  } else {
    return {
      data: departmentData.data,
      isLoading: departmentData.isLoading,
      error: departmentData.error,
      isCEO: false,
      refetch: departmentData.refetch
    };
  }
};

// Hook for testing SharePoint connection
export const useTestConnection = () => {
  return useQuery({
    queryKey: ['testConnection'],
    queryFn: testSharePointConnection,
    enabled: false, // Only run when explicitly called
    retry: false,
  });
}; 