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

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeader(),
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Authentication failed' }));
      return { success: false, error: error.error || 'Authentication failed' };
    }

    const data = await response.json();
    
    if (data.success && data.user && data.token) {
      // Store token and user info
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      
      logInfo('User signed in', { username: data.user.username, role: data.user.role });
      
      return {
        success: true,
        user: data.user,
        token: data.token,
      };
    }

    return { success: false, error: data.error || 'Authentication failed' };
  } catch (error) {
    logError('Sign in error', error as Error, { username });
    return { success: false, error: 'Network error. Please try again.' };
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
    return {};
  }
  return {
    'Authorization': `Bearer ${token}`,
  };
};

