// Data caching service for OneDrive data
const CACHE_KEY = 'onedrive_data_cache';
const CACHE_TIMESTAMP_KEY = 'onedrive_data_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// Use local proxy for development, Netlify function for production
const isLocalhost = window.location.hostname === 'localhost';
const ONEDRIVE_FUNCTION_URL = isLocalhost 
  ? 'http://localhost:3002/api/onedrive'
  : '/.netlify/functions/get_excel_data_from_onedrive_url';
const TEST_FUNCTION_URL = isLocalhost 
  ? 'http://localhost:3002/api/test'
  : '/.netlify/functions/test';
// Use environment variable for OneDrive URL, fallback to hardcoded URL
const ONEDRIVE_SAMPLE_URL = import.meta.env.VITE_ONEDRIVE_URL || 'https://lifemaker-my.sharepoint.com/:x:/r/personal/hamed_ibrahim_lifemakers_org/_layouts/15/Doc.aspx?sourcedoc=%7B084A3748-79EC-41B1-B3EB-8ECED81E5C53%7D&file=Projects%20Dashboard%202025%20-%20Internal%20tracker.xlsx&fromShare=true&action=default&mobileredirect=true';

export interface CachedData {
  data: any;
  timestamp: number;
  isStale: boolean;
}

export const dataCacheService = {
  // Get cached data if it exists and is not stale
  getCachedData(): CachedData | null {
    try {
      const cachedData = localStorage.getItem(CACHE_KEY);
      const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      
      if (!cachedData || !timestamp) {
        return null;
      }
      
      const data = JSON.parse(cachedData);
      const cacheTime = parseInt(timestamp);
      const now = Date.now();
      const isStale = (now - cacheTime) > CACHE_DURATION;
      
      return {
        data,
        timestamp: cacheTime,
        isStale
      };
    } catch (error) {
      console.error('Error reading cached data:', error);
      return null;
    }
  },

  // Cache data with current timestamp
  cacheData(data: any): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error caching data:', error);
    }
  },

  // Clear cached data
  clearCache(): void {
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  },

  // Fetch OneDrive data (with caching)
  async fetchOneDriveData(forceRefresh = false): Promise<any> {
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = this.getCachedData();
      if (cached && !cached.isStale) {
        console.log('✅ Using cached OneDrive data');
        return cached.data;
      }
    }

    console.log('🔄 Fetching fresh OneDrive data...');
    
    // First, test if Netlify functions are working
    try {
      const testRes = await fetch(TEST_FUNCTION_URL);
      const testText = await testRes.text();
      
      if (!testRes.ok || testText.includes('<!DOCTYPE')) {
        throw new Error('Netlify functions are not working. Are you running locally?');
      }
    } catch (testError) {
      console.error('Test function failed:', testError);
      throw new Error('Netlify functions are not available. Please deploy to Netlify or run locally with a different approach.');
    }
    
    // Fetch OneDrive data
    try {
      console.log('🔗 Using OneDrive URL:', ONEDRIVE_SAMPLE_URL);
      console.log('🔗 Environment variable VITE_ONEDRIVE_URL:', import.meta.env.VITE_ONEDRIVE_URL ? 'Set' : 'Not set');
      console.log('🔗 Full function URL:', `${ONEDRIVE_FUNCTION_URL}?oneDriveUrl=${encodeURIComponent(ONEDRIVE_SAMPLE_URL)}`);
      
      const res = await fetch(`${ONEDRIVE_FUNCTION_URL}?oneDriveUrl=${encodeURIComponent(ONEDRIVE_SAMPLE_URL)}`);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const json = await res.json();
      
      if (json.worksheets) {
        // Cache the fresh data
        this.cacheData(json.worksheets);
        console.log('✅ OneDrive data fetched and cached');
        return json.worksheets;
      } else {
        throw new Error('No worksheets found in response');
      }
    } catch (e: any) {
      console.error('❌ Error fetching OneDrive data:', e);
      throw e;
    }
  },

  // Pre-load data in background (for sign-in)
  async preloadData(): Promise<void> {
    try {
      console.log('🔄 Pre-loading OneDrive data...');
      await this.fetchOneDriveData(true); // Force fresh data
      console.log('✅ OneDrive data pre-loaded successfully');
    } catch (error) {
      console.error('❌ Failed to pre-load OneDrive data:', error);
      // Don't throw - this is background loading, shouldn't block sign-in
    }
  }
}; 