/**
 * Authentication service
 * Handles secure authentication with password hashing and JWT tokens
 */

import { logError, logInfo } from './logger';
import { getCsrfHeader, clearCsrfToken } from '@/utils/csrf';

export interface User {
  username: string;
  role: string;
  departments: string[];
  token?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

const AUTH_TOKEN_KEY = 'auth-token';
const USER_KEY = 'user';

/**
 * Sign in with username and password
 */
export const signIn = async (username: string, password: string): Promise<AuthResponse> => {
  try {
    const isLocalhost = window.location.hostname === 'localhost';
    const apiUrl = isLocalhost 
      ? 'http://localhost:3000/api/auth/signin'
      : '/.netlify/functions/auth-api';

    console.log('[Auth Service] Attempting sign in:', { username, apiUrl, isLocalhost });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeader(),
      },
      body: JSON.stringify({ username, password }),
    });

    console.log('[Auth Service] Response status:', response.status);
    console.log('[Auth Service] Response ok:', response.ok);

    if (!response.ok) {
      let errorData;
      try {
        const text = await response.text();
        console.log('[Auth Service] Error response text:', text);
        errorData = JSON.parse(text);
      } catch (e) {
        console.error('[Auth Service] Failed to parse error response:', e);
        errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
      }
      console.error('[Auth Service] Sign in failed:', errorData);
      return { success: false, error: errorData.error || errorData.message || 'Authentication failed' };
    }

    const responseText = await response.text();
    console.log('[Auth Service] Raw response text:', responseText.substring(0, 200));
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[Auth Service] Failed to parse JSON response:', parseError);
      return { success: false, error: 'Invalid response from server' };
    }
    
    console.log('[Auth Service] Parsed response data:', { 
      success: data.success, 
      hasUser: !!data.user, 
      hasToken: !!data.token,
      tokenLength: data.token ? data.token.length : 0,
      userRole: data.user?.role
    });
    
    if (data.success && data.user && data.token) {
      // Store token and user info
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      
      // Verify token was stored
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      console.log('[Auth Service] Token stored successfully:', {
        stored: !!storedToken,
        length: storedToken?.length,
        matches: storedToken === data.token
      });
      
      logInfo('User signed in', { username: data.user.username, role: data.user.role });
      
      return {
        success: true,
        user: data.user,
        token: data.token,
      };
    }

    console.error('[Auth Service] Invalid response format:', data);
    return { success: false, error: data.error || 'Authentication failed' };
  } catch (error) {
    console.error('[Auth Service] Sign in exception:', error);
    logError('Sign in error', error as Error, { username });
    return { success: false, error: error instanceof Error ? error.message : 'Network error. Please try again.' };
  }
};

/**
 * Sign out current user
 */
export const signOut = (): void => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Clear CSRF token on sign out
  clearCsrfToken();
  logInfo('User signed out');
};

/**
 * Get current authenticated user
 */
export const getCurrentUser = (): User | null => {
  try {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) {
      return null;
    }
    return JSON.parse(userStr) as User;
  } catch {
    return null;
  }
};

/**
 * Get authentication token
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return !!getAuthToken() && !!getCurrentUser();
};

/**
 * Get authorization header for API requests
 */
export const getAuthHeader = (): Record<string, string> => {
  const token = getAuthToken();
  if (!token) {
    console.warn('[Auth Service] No token found in localStorage', {
      localStorageKeys: Object.keys(localStorage),
      authTokenKey: AUTH_TOKEN_KEY
    });
    return {};
  }
  
  // Debug: Log token presence (but not the actual token for security)
  console.log('[Auth Service] Token found, creating Authorization header', {
    tokenLength: token.length,
    tokenPrefix: token.substring(0, 20) + '...',
    tokenSuffix: '...' + token.substring(token.length - 10),
  });
  
  const authHeader = {
    'Authorization': `Bearer ${token}`,
  };
  
  console.log('[Auth Service] Authorization header created:', {
    hasHeader: !!authHeader['Authorization'],
    headerLength: authHeader['Authorization']?.length,
    headerPrefix: authHeader['Authorization']?.substring(0, 30) + '...'
  });
  
  return authHeader;
};

