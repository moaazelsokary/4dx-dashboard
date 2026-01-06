/**
 * Environment configuration utility
 * Handles environment detection and configuration for development, staging, and production
 */

export type Environment = 'development' | 'staging' | 'production';

/**
 * Get current environment
 */
export const getEnvironment = (): Environment => {
  // Check for explicit environment variable
  const envVar = import.meta.env.MODE || import.meta.env.VITE_ENV;
  
  if (envVar === 'production' || envVar === 'prod') {
    return 'production';
  }
  
  if (envVar === 'staging' || envVar === 'stage') {
    return 'staging';
  }
  
  // Default to development for localhost
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'development';
  }
  
  // Check if staging domain
  if (typeof window !== 'undefined' && window.location.hostname.includes('staging')) {
    return 'staging';
  }
  
  // Default to development
  return 'development';
};

/**
 * Check if running in development
 */
export const isDevelopment = (): boolean => {
  return getEnvironment() === 'development';
};

/**
 * Check if running in staging
 */
export const isStaging = (): boolean => {
  return getEnvironment() === 'staging';
};

/**
 * Check if running in production
 */
export const isProduction = (): boolean => {
  return getEnvironment() === 'production';
};

/**
 * Get API base URL based on environment
 */
export const getApiBaseUrl = (): string => {
  const env = getEnvironment();
  
  if (env === 'development') {
    return import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }
  
  if (env === 'staging') {
    return import.meta.env.VITE_STAGING_API_URL || '/.netlify/functions';
  }
  
  return import.meta.env.VITE_API_URL || '/.netlify/functions';
};

/**
 * Get environment-specific configuration
 */
export const getEnvConfig = () => {
  const env = getEnvironment();
  
  return {
    environment: env,
    apiBaseUrl: getApiBaseUrl(),
    isDevelopment: isDevelopment(),
    isStaging: isStaging(),
    isProduction: isProduction(),
    enableDebugLogging: !isProduction(),
    enableErrorTracking: isProduction() || isStaging(),
  };
};

export default getEnvConfig;

