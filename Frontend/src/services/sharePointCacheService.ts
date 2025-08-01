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
    } catch (error) {
      console.error('Error clearing SharePoint cache:', error);
    }
  },

  // Fetch SharePoint data for all departments (with caching)
  async fetchAllDepartmentsData(forceRefresh = false): Promise<{ [department: string]: any }> {
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = this.getCachedData();
      if (cached && !cached.isStale) {
        console.log('✅ Using cached SharePoint data');
        return cached;
      }
    }

    console.log('🔄 Fetching fresh SharePoint data...');
    
    // Fetch data for all departments
    const departments = ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices'];
    const results = await Promise.allSettled(
      departments.map(dept => getDepartmentData(dept))
    );
    
    // Create a map of department to data
    const departmentDataMap: { [key: string]: any } = {};
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        departmentDataMap[departments[index]] = result.value;
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