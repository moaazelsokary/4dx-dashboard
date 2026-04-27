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
  /** Post-login path when set (e.g. /department-objectives) */
  defaultRoute?: string | null;
  /** null = inherit nav from role/departments; non-null = exclusive allowed pathnames */
  allowedRoutes?: string[] | null;
  /** null = inherit Power BI from role/departments; [] = none; non-empty = allowed dashboard ids */
  powerbiDashboardIds?: string[] | null;
  /** Some stored blobs may only have snake_case (legacy / API echo) */
  powerbi_dashboard_ids?: string[] | null;
}

/** Subset of JWT claims we encode at sign-in (see auth-api / auth-proxy). */
export interface AuthTokenPayload {
  userId?: number;
  username?: string;
  role?: string;
  departments?: string[];
  defaultRoute?: string;
  allowedRoutes?: string[] | null;
  powerbiDashboardIds?: string[] | null;
  exp?: number;
  iat?: number;
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
 * Decode JWT payload (client-side only; does not verify signature).
 * Used when merging sign-in response and when localStorage `user` is missing fields.
 */
export function decodeAuthTokenPayload(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as AuthTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Sign in with username and password
 */
export const signIn = async (username: string, password: string): Promise<AuthResponse> => {
  try {
    const isLocalhost = window.location.hostname === 'localhost';
    /** Dev: Vite proxies /api/auth → auth-proxy :3000 */
    const apiUrl = isLocalhost ? '/api/auth/signin' : '/.netlify/functions/auth-api';

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
      // Align Power BI ids with JWT (same source as DB at sign-in); fixes API/localStorage drift
      const payload = decodeAuthTokenPayload(data.token);
      const userToStore: User = { ...data.user };
      if (payload && Object.prototype.hasOwnProperty.call(payload, 'powerbiDashboardIds')) {
        userToStore.powerbiDashboardIds = payload.powerbiDashboardIds ?? null;
      }
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(userToStore));
      
      // Verify token was stored
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      console.log('[Auth Service] Token stored successfully:', {
        stored: !!storedToken,
        length: storedToken?.length,
        matches: storedToken === data.token
      });
      
      logInfo('User signed in', { username: userToStore.username, role: userToStore.role });
      
      return {
        success: true,
        user: userToStore,
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
export const signOut = (redirect: boolean = true): void => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Clear CSRF token on sign out
  clearCsrfToken();
  logInfo('User signed out');
  
  // Redirect to sign-in page if requested
  if (redirect && typeof window !== 'undefined') {
    window.location.href = '/';
  }
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

/** Current route/Power BI overrides loaded from DB (Bearer JWT). */
export interface AuthSessionUserPayload {
  defaultRoute: string | null;
  allowedRoutes: string[] | null;
  powerbiDashboardIds: string[] | null;
}

/**
 * Fetch fresh session fields from the database (same values as Users admin form).
 * Use this when JWT/localStorage may be stale after an admin updated the account.
 */
export async function fetchAuthSession(): Promise<AuthSessionUserPayload | null> {
  const token = getAuthToken();
  if (!token) return null;

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalDev = host === 'localhost' || host === '127.0.0.1';

  /** Try both paths: dev users often use 127.0.0.1 (previously only /api/auth worked for "localhost"). */
  const urls = isLocalDev
    ? ['/api/auth/session', '/.netlify/functions/auth-session']
    : ['/.netlify/functions/auth-session', '/api/auth/session'];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) continue;
      const text = await response.text();
      let data: { success?: boolean; user?: AuthSessionUserPayload };
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        continue;
      }
      if (data.success && data.user) {
        return data.user as AuthSessionUserPayload;
      }
    } catch {
      /* try next URL */
    }
  }
  return null;
}

/** Persist session snapshot into localStorage so nav and route checks match the DB. */
export function mergeSessionIntoStoredUser(session: AuthSessionUserPayload): User | null {
  const cur = getCurrentUser();
  if (!cur) return null;
  const next: User = {
    ...cur,
    defaultRoute: session.defaultRoute,
    allowedRoutes: session.allowedRoutes,
    powerbiDashboardIds: session.powerbiDashboardIds,
  };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  return next;
}

/**
 * Effective Power BI dashboard id override for the signed-in user.
 * - `null` = inherit from role/departments (same as DB null).
 * - `[]` = no dashboards.
 * - non-empty = explicit allow-list.
 * - `undefined` = treat as inherit (should be rare if JWT also lacks data).
 *
 * **JWT first** when a token exists: claims are issued at sign-in from the DB and stay in sync
 * with the server. The `user` blob in localStorage can be stale or have `powerbiDashboardIds: null`
 * while the JWT still carries `['frontex']` — checking JWT first fixes the dropdown showing “all dashboards”.
 */
export function getEffectivePowerbiDashboardIds(user: User): string[] | null | undefined {
  const token = getAuthToken();
  if (token) {
    const payload = decodeAuthTokenPayload(token);
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'powerbiDashboardIds')) {
      return payload.powerbiDashboardIds ?? null;
    }
  }
  if (user.powerbiDashboardIds !== undefined) {
    return user.powerbiDashboardIds;
  }
  if (user.powerbi_dashboard_ids !== undefined) {
    return user.powerbi_dashboard_ids;
  }
  return undefined;
}

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
  
  return {
    'Authorization': `Bearer ${token}`,
  };
};

