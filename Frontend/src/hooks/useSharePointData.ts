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
        // Verify that cached data has all expected departments
        const expectedDepartments = ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices', 'community'];
        const hasAllDepartments = expectedDepartments.every(dept => cached[dept] && Array.isArray(cached[dept]));
        
        if (hasAllDepartments) {
          console.log('✅ Using cached SharePoint data for CEO view (all departments present)');
          return cached;
        } else {
          console.log('⚠️ Cached data incomplete, fetching fresh data...');
        }
      }

      // For CEO view, we'll fetch data for all departments
      const departments = ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices', 'community'];
      console.log('[CEO Data Fetch] Starting fetch for departments:', departments);
      
      // Fetch data for all departments with special handling for community
      const results = await Promise.allSettled(
        departments.map(async (dept) => {
          if (dept === 'community') {
            // Special handling for community department - skip if it fails
            try {
              console.log(`[CEO Data Fetch] Attempting to fetch community department...`);
              const data = await getDepartmentData(dept);
              console.log(`[CEO Data Fetch] ✅ Community department fetched successfully`);
              return data;
            } catch (error) {
              console.warn(`[CEO Data Fetch] ⚠️ Community department failed, skipping:`, error);
              // Return empty array instead of throwing error
              return [];
            }
          } else {
            return getDepartmentData(dept);
          }
        })
      );
      
      // Create a map of department to LagMetrics
      const departmentDataMap: { [key: string]: LagMetric[] } = {};
      
      // Start with existing cached data if available
      if (cached) {
        Object.keys(cached).forEach(dept => {
          if (dept !== 'timestamp' && dept !== 'isStale' && Array.isArray(cached[dept])) {
            departmentDataMap[dept] = cached[dept];
          }
        });
      }
      
      results.forEach((result, index) => {
        const department = departments[index];
        if (result.status === 'fulfilled') {
          departmentDataMap[department] = result.value;
          console.log(`[CEO Data Fetch] ✅ ${department}: ${result.value.length} LagMetrics`);
        } else {
          console.error(`[CEO Data Fetch] ❌ ${department}: ${result.reason}`);
          // If this department failed and we don't have cached data for it, add empty array
          if (!departmentDataMap[department]) {
            departmentDataMap[department] = [];
            console.log(`[CEO Data Fetch] ⚠️ ${department}: Using empty array due to fetch failure`);
          }
        }
      });

      // Check if too many departments failed
      const failedDepartments = results.filter(result => result.status === 'rejected').length;
      const totalDepartments = departments.length;
      const failureRate = failedDepartments / totalDepartments;
      
      if (failureRate > 0.5) { // If more than 50% failed
        console.warn(`[CEO Data Fetch] ⚠️ High failure rate (${failureRate * 100}%), clearing cache to prevent corruption`);
        sharePointCacheService.clearCache();
        // Return only successful departments
        return departmentDataMap;
      }
      
      // Cache the merged data
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
      return ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices', 'community'];
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