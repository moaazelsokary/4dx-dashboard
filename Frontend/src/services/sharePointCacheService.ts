// SharePoint data caching service
import { getDepartmentData } from './sharepointService';

const SHAREPOINT_CACHE_KEY = 'sharepoint_data_cache';
const SHAREPOINT_CACHE_TIMESTAMP_KEY = 'sharepoint_data_timestamp';
const SHAREPOINT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

export interface SharePointCachedData {
  [department: string]: any;
  timestamp: number;
  isStale: boolean;
}

export const sharePointCacheService = {
  // Get cached SharePoint data if it exists and is not stale
  getCachedData(): SharePointCachedData | null {
    try {
      const cachedData = localStorage.getItem(SHAREPOINT_CACHE_KEY);
      const timestamp = localStorage.getItem(SHAREPOINT_CACHE_TIMESTAMP_KEY);
      
      if (!cachedData || !timestamp) {
        return null;
      }
      
      const data = JSON.parse(cachedData);
      const cacheTime = parseInt(timestamp);
      const now = Date.now();
      const isStale = (now - cacheTime) > SHAREPOINT_CACHE_DURATION;
      
      return {
        ...data,
        timestamp: cacheTime,
        isStale
      };
    } catch (error) {
      console.error('Error reading cached SharePoint data:', error);
      return null;
    }
  },

  // Cache SharePoint data with current timestamp
  cacheData(data: { [department: string]: any }): void {
    try {
      localStorage.setItem(SHAREPOINT_CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(SHAREPOINT_CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error caching SharePoint data:', error);
    }
  },

  // Clear cached SharePoint data
  clearCache(): void {
    try {
      localStorage.removeItem(SHAREPOINT_CACHE_KEY);
      localStorage.removeItem(SHAREPOINT_CACHE_TIMESTAMP_KEY);
      console.log('✅ SharePoint cache cleared');
    } catch (error) {
      console.error('Error clearing SharePoint cache:', error);
    }
  },

  // Force refresh cache (clear and refetch)
  async forceRefresh(): Promise<{ [department: string]: any }> {
    console.log('🔄 Force refreshing SharePoint cache...');
    this.clearCache();
    return await this.fetchAllDepartmentsData(true);
  },

  // Debug function to check cache status
  debugCache(): void {
    const cached = this.getCachedData();
    if (cached) {
      console.log('📊 Cache Status:');
      console.log('- Timestamp:', new Date(cached.timestamp).toLocaleString());
      console.log('- Is Stale:', cached.isStale);
      console.log('- Departments in cache:', Object.keys(cached).filter(key => key !== 'timestamp' && key !== 'isStale'));
      
      const expectedDepartments = ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices', 'community'];
      expectedDepartments.forEach(dept => {
        const hasData = cached[dept] && Array.isArray(cached[dept]);
        console.log(`- ${dept}: ${hasData ? `${cached[dept].length} LagMetrics` : 'No data'}`);
      });
    } else {
      console.log('📊 Cache Status: No cached data found');
    }
  },

  // Fetch SharePoint data for all departments (with caching)
  async fetchAllDepartmentsData(forceRefresh = false): Promise<{ [department: string]: any }> {
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = this.getCachedData();
      if (cached && !cached.isStale) {
        // Verify that cached data has all expected departments
        const expectedDepartments = ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices', 'community'];
        const hasAllDepartments = expectedDepartments.every(dept => cached[dept] && Array.isArray(cached[dept]));
        
        if (hasAllDepartments) {
          console.log('✅ Using cached SharePoint data (all departments present)');
          return cached;
        } else {
          console.log('⚠️ Cached data incomplete, fetching fresh data...');
        }
      }
    }

    console.log('🔄 Fetching fresh SharePoint data...');
    
    // Fetch data for all departments
    const departments = ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices', 'community'];
    const results = await Promise.allSettled(
      departments.map(async (dept) => {
        if (dept === 'community') {
          // Special handling for community department - skip if it fails
          try {
            console.log(`[Cache Service] Attempting to fetch community department...`);
            const data = await getDepartmentData(dept);
            console.log(`[Cache Service] ✅ Community department fetched successfully`);
            return data;
          } catch (error) {
            console.warn(`[Cache Service] ⚠️ Community department failed, skipping:`, error);
            // Return empty array instead of throwing error
            return [];
          }
        } else {
          return getDepartmentData(dept);
        }
      })
    );
    
    // Create a map of department to data
    const departmentDataMap: { [key: string]: any } = {};
    
    // Start with existing cached data if available
    const cached = this.getCachedData();
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
        console.log(`[Cache Service] ✅ ${department}: ${result.value.length} LagMetrics`);
      } else {
        console.error(`[Cache Service] ❌ ${department}: ${result.reason}`);
        // If this department failed and we don't have cached data for it, add empty array
        if (!departmentDataMap[department]) {
          departmentDataMap[department] = [];
          console.log(`[Cache Service] ⚠️ ${department}: Using empty array due to fetch failure`);
        }
      }
    });
    
    // Cache the fresh data
    this.cacheData(departmentDataMap);
    console.log('✅ SharePoint data fetched and cached');
    return departmentDataMap;
  },

  // Pre-load SharePoint data in background (for sign-in)
  async preloadData(): Promise<void> {
    try {
      console.log('🔄 Pre-loading SharePoint data...');
      await this.fetchAllDepartmentsData(true); // Force fresh data
      console.log('✅ SharePoint data pre-loaded successfully');
    } catch (error) {
      console.error('❌ Failed to pre-load SharePoint data:', error);
      // Don't throw - this is background loading, shouldn't block sign-in
    }
  }
};

// Make debug functions available globally for troubleshooting
if (typeof window !== 'undefined') {
  (window as any).debugSharePointCache = () => sharePointCacheService.debugCache();
  (window as any).clearSharePointCache = () => sharePointCacheService.clearCache();
  (window as any).forceRefreshSharePointCache = () => sharePointCacheService.forceRefresh();
  
  // Import test function for department testing
  import('./sharepointService').then(({ testDepartmentConnection }) => {
    (window as any).testDepartmentConnection = testDepartmentConnection;
  });
  
  console.log('🔧 SharePoint cache debug functions available:');
  console.log('- debugSharePointCache() - Check cache status');
  console.log('- clearSharePointCache() - Clear cache');
  console.log('- forceRefreshSharePointCache() - Force refresh cache');
  console.log('- testDepartmentConnection("community") - Test community department specifically');
}