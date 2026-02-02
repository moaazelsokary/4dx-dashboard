/**
 * Metrics Service - Frontend service for PMS/Odoo combined data
 * Uses localStorage cache for instant initial load
 */

import { getAuthHeader } from './authService';
import { handleApiError } from '@/utils/apiErrorHandler';

// Use local proxy for development, Netlify function for production
const isLocalhost = window.location.hostname === 'localhost';
const API_BASE_URL = isLocalhost
  ? 'http://localhost:3000/.netlify/functions/metrics-api'
  : '/.netlify/functions/metrics-api';

const CACHE_KEY = 'pms_odoo_metrics_cache';
const CACHE_TIMESTAMP_KEY = 'pms_odoo_metrics_cache_timestamp';
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes cache

export interface PMSMetric {
  ProjectName: string;
  MetricName: string;
  MonthYear: string;
  Target: number;
  Actual: number;
  UpdatedAt: string;
}

export interface OdooMetric {
  Project: string;
  Month: string;
  ServicesCreated: number;
  ServicesDone: number;
  UpdatedAt: string;
}

export interface MetricsData {
  pms: PMSMetric[];
  odoo: OdooMetric[];
  lastUpdated: string | null;
}

interface CachedData extends MetricsData {
  timestamp: number;
  isStale: boolean;
}

// Get cached data from localStorage
function getCachedData(): CachedData | null {
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
      ...data,
      timestamp: cacheTime,
      isStale
    };
  } catch (error) {
    console.error('Error reading cached metrics data:', error);
    return null;
  }
}

// Cache data to localStorage
function cacheData(data: MetricsData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.error('Error caching metrics data:', error);
  }
}

// Fetch metrics from API
async function fetchMetricsFromAPI(): Promise<MetricsData> {
  const url = `${API_BASE_URL}?_t=${Date.now()}`;
  const authHeaders = getAuthHeader();
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch metrics' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch metrics');
  }

  return result.data;
}

/**
 * Get metrics data (with localStorage cache)
 * Returns cached data immediately if available, then fetches fresh data in background
 */
export async function getMetrics(): Promise<MetricsData> {
  // Check cache first
  const cached = getCachedData();
  
  if (cached && !cached.isStale) {
    // Return cached data immediately, then refresh in background
    fetchMetricsFromAPI()
      .then(data => {
        cacheData(data);
      })
      .catch(error => {
        console.warn('Background metrics refresh failed:', error);
      });
    
    return {
      pms: cached.pms,
      odoo: cached.odoo,
      lastUpdated: cached.lastUpdated
    };
  }
  
  // Cache is stale or doesn't exist, fetch fresh data
  try {
    const data = await fetchMetricsFromAPI();
    cacheData(data);
    return data;
  } catch (error) {
    // If fetch fails but we have stale cache, return it
    if (cached) {
      console.warn('Using stale cache due to fetch error:', error);
      return {
        pms: cached.pms,
        odoo: cached.odoo,
        lastUpdated: cached.lastUpdated
      };
    }
    
    // No cache and fetch failed, throw error
    throw handleApiError(error);
  }
}

/**
 * Refresh metrics (triggers background sync)
 * Requires Admin or CEO role
 */
export async function refreshMetrics(): Promise<void> {
  const url = `${API_BASE_URL}/refresh`;
  const authHeaders = getAuthHeader();
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to refresh metrics' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to refresh metrics');
  }

  // Clear cache to force fresh fetch on next getMetrics() call
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIMESTAMP_KEY);
}

/**
 * Get distinct projects and metrics for dropdowns
 */
export function getDistinctProjectsAndMetrics(data: MetricsData): {
  pmsProjects: string[];
  pmsMetrics: string[];
  odooProjects: string[];
} {
  const pms = data?.pms ?? [];
  const odoo = data?.odoo ?? [];
  const pmsProjects = [...new Set(pms.map(m => m.ProjectName).filter(Boolean))].sort();
  const pmsMetrics = [...new Set(pms.map(m => m.MetricName).filter(Boolean))].sort();
  const odooProjects = [...new Set(odoo.map(m => m.Project).filter(Boolean))].sort();
  
  return {
    pmsProjects,
    pmsMetrics,
    odooProjects
  };
}
