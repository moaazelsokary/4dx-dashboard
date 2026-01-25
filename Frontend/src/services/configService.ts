// Configuration Service - API calls for locks, logs, and permissions
import type {
  FieldLock,
  ActivityLog,
  UserPermission,
  LockCheckRequest,
  LockCheckResponse,
  BatchLockCheckRequest,
  BatchLockCheckResponse,
  LockRuleFormData,
  LogFilters,
  LogStats,
  PermissionFormData,
} from '@/types/config';
import { getAuthHeader } from './authService';
import { getCsrfHeader } from '@/utils/csrf';
import { handleApiError, isAuthError, shouldRetry, getRetryDelay, handleAuthError } from '@/utils/apiErrorHandler';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { requestQueue } from '@/utils/requestQueue';

const isLocalhost = window.location.hostname === 'localhost';
const API_BASE_URL = isLocalhost
  ? 'http://localhost:3000/.netlify/functions/config-api'
  : '/.netlify/functions/config-api';

const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = options?.method || 'GET';
  const needsCsrf = ['POST', 'PUT', 'DELETE'].includes(method.toUpperCase());
  const csrfHeaders = needsCsrf ? getCsrfHeader() : {};
  // Config API requires authentication for ALL requests (GET, POST, PUT, DELETE)
  const authHeaders = getAuthHeader();

  const url = `${API_BASE_URL}${endpoint}`;

  // Check if offline
  if (!navigator.onLine) {
    // Queue request for when connection is restored
    return new Promise<T>((resolve, reject) => {
      requestQueue.enqueue(
        url,
        {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...csrfHeaders,
            ...authHeaders,
            ...options?.headers,
          },
        },
        async (response) => {
          const data = await response.json();
          resolve(data.success ? data.data : data);
        },
        reject
      );
    });
  }

  // Retry logic
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders,
          ...authHeaders,
          ...options?.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle error using centralized error handler
        const apiError = await handleApiError(new Error(`HTTP ${response.status}`), response);
        
        // Handle authentication errors
        if (apiError.isAuthError) {
          handleAuthError();
          throw new Error(apiError.message);
        }

        // Check if should retry
        if (shouldRetry(apiError, attempt, MAX_RETRIES)) {
          const delay = getRetryDelay(attempt);
          console.log(`[Config Service] Retrying request (attempt ${attempt + 1}/${MAX_RETRIES}) after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Get user-friendly error message
        const friendlyError = getUserFriendlyError(apiError);
        const error = new Error(friendlyError.description);
        (error as any).status = response.status;
        (error as any).friendlyError = friendlyError;
        throw error;
      }

      const data = await response.json();
      return data.success ? data.data : data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Request failed');
      
      // Handle network errors
      if (lastError.name === 'AbortError' || lastError.message.includes('timeout')) {
        const apiError = await handleApiError(lastError);
        if (shouldRetry(apiError, attempt, MAX_RETRIES)) {
          const delay = getRetryDelay(attempt);
          console.log(`[Config Service] Retrying after timeout (attempt ${attempt + 1}/${MAX_RETRIES}) after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // If this is the last attempt, throw the error
      if (attempt === MAX_RETRIES) {
        // If offline, queue the request
        if (!navigator.onLine) {
          return new Promise<T>((resolve, reject) => {
            requestQueue.enqueue(
              url,
              {
                ...options,
                headers: {
                  'Content-Type': 'application/json',
                  ...csrfHeaders,
                  ...authHeaders,
                  ...options?.headers,
                },
              },
              async (response) => {
                const data = await response.json();
                resolve(data.success ? data.data : data);
              },
              reject
            );
          });
        }
        
        const apiError = await handleApiError(lastError);
        const friendlyError = getUserFriendlyError(apiError);
        const finalError = new Error(friendlyError.description);
        (finalError as any).status = apiError.status;
        (finalError as any).friendlyError = friendlyError;
        throw finalError;
      }

      // Check if error is retryable
      const apiError = await handleApiError(lastError);
      if (!shouldRetry(apiError, attempt, MAX_RETRIES)) {
        const friendlyError = getUserFriendlyError(apiError);
        const finalError = new Error(friendlyError.description);
        (finalError as any).status = apiError.status;
        (finalError as any).friendlyError = friendlyError;
        throw finalError;
      }

      // Wait before retrying
      const delay = getRetryDelay(attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Request failed');
}

// ========== LOCK MANAGEMENT ==========

export async function getLocks(): Promise<FieldLock[]> {
  return fetchAPI<FieldLock[]>('/locks');
}

export async function getLock(id: number): Promise<FieldLock> {
  return fetchAPI<FieldLock>(`/locks/${id}`);
}

export async function createLock(lockData: LockRuleFormData): Promise<FieldLock> {
  return fetchAPI<FieldLock>('/locks', {
    method: 'POST',
    body: JSON.stringify(lockData),
  });
}

export async function updateLock(id: number, lockData: Partial<LockRuleFormData>): Promise<FieldLock> {
  return fetchAPI<FieldLock>(`/locks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(lockData),
  });
}

export async function deleteLock(id: number): Promise<void> {
  await fetchAPI(`/locks/${id}`, {
    method: 'DELETE',
  });
}

export async function checkLockStatus(
  fieldType: 'target' | 'monthly_target' | 'monthly_actual' | 'all_fields',
  departmentObjectiveId: number,
  month?: string
): Promise<LockCheckResponse> {
  const params = new URLSearchParams({
    field_type: fieldType,
    department_objective_id: departmentObjectiveId.toString(),
  });
  if (month) {
    params.append('month', month);
  }
  return fetchAPI<LockCheckResponse>(`/locks/check?${params.toString()}`);
}

export async function checkLockStatusBatch(
  checks: LockCheckRequest[]
): Promise<BatchLockCheckResponse> {
  return fetchAPI<BatchLockCheckResponse>('/locks/check-batch', {
    method: 'POST',
    body: JSON.stringify({ checks }),
  });
}

export async function checkOperationLock(
  operation: 'add' | 'delete',
  kpi?: string,
  departmentId?: number
): Promise<{ is_locked: boolean; lock_reason?: string }> {
  const params = new URLSearchParams({
    operation,
  });
  if (kpi) {
    params.append('kpi', kpi);
  }
  if (departmentId) {
    params.append('department_id', departmentId.toString());
  }
  return fetchAPI<{ is_locked: boolean; lock_reason?: string }>(`/locks/check-operation?${params.toString()}`);
}

export async function bulkCreateLocks(locks: LockRuleFormData[]): Promise<FieldLock[]> {
  return fetchAPI<FieldLock[]>('/locks/bulk', {
    method: 'POST',
    body: JSON.stringify({ operation: 'create', locks }),
  });
}

export async function bulkDeleteLocks(lockIds: number[]): Promise<void> {
  await fetchAPI('/locks/bulk', {
    method: 'POST',
    body: JSON.stringify({ operation: 'delete', locks: lockIds }),
  });
}

// Helper functions for hierarchical lock rules
export async function getKPIsByUsers(userIds: number[]): Promise<string[]> {
  const params = new URLSearchParams();
  params.append('user_ids', userIds.join(','));
  return fetchAPI<string[]>(`/locks/kpis-by-users?${params.toString()}`);
}

export async function getObjectivesByUsers(userIds: number[]): Promise<Array<{
  id: number;
  activity: string;
  kpi: string;
  responsible_person: string;
  type: string;
  department_id: number;
}>> {
  const params = new URLSearchParams();
  params.append('user_ids', userIds.join(','));
  return fetchAPI<Array<{
    id: number;
    activity: string;
    kpi: string;
    responsible_person: string;
    type: string;
    department_id: number;
  }>>(`/locks/objectives-by-users?${params.toString()}`);
}

export async function getObjectivesByKPIs(kpiIds: string[], userIds?: number[]): Promise<Array<{
  id: number;
  activity: string;
  kpi: string;
  responsible_person: string;
  type: string;
  department_id: number;
}>> {
  const params = new URLSearchParams();
  kpiIds.forEach(kpi => {
    params.append('kpi_ids', kpi);
  });
  if (userIds && userIds.length > 0) {
    params.append('user_ids', userIds.join(','));
  }
  return fetchAPI<Array<{
    id: number;
    activity: string;
    kpi: string;
    responsible_person: string;
    type: string;
    department_id: number;
  }>>(`/locks/objectives-by-kpis?${params.toString()}`);
}

// ========== ACTIVITY LOGS ==========

export async function getLogs(filters?: LogFilters): Promise<{ data: ActivityLog[]; pagination: any }> {
  const params = new URLSearchParams();
  if (filters) {
    if (filters.user_id) params.append('user_id', filters.user_id.toString());
    if (filters.action_type) params.append('action_type', filters.action_type);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.kpi) params.append('kpi', filters.kpi);
    if (filters.department_id) params.append('department_id', filters.department_id.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
  }
  const queryString = params.toString();
  const endpoint = `/logs${queryString ? `?${queryString}` : ''}`;
  console.log('[configService] Calling logs API:', `${API_BASE_URL}${endpoint}`);
  
  // Don't use fetchAPI helper because we need the full response with pagination
  // But we still want error handling, so we'll use a custom fetch with error handling
  const authHeaders = getAuthHeader();
  
  // Check if offline
  if (!navigator.onLine) {
    return new Promise((resolve, reject) => {
      requestQueue.enqueue(
        `${API_BASE_URL}${endpoint}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
        },
        async (response) => {
          const fullResponse = await response.json();
          resolve({
            data: fullResponse.data || [],
            pagination: fullResponse.pagination || {}
          });
        },
        reject
      );
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const apiError = await handleApiError(new Error(`HTTP ${response.status}`), response);
      if (apiError.isAuthError) {
        handleAuthError();
        throw new Error(apiError.message);
      }
      const friendlyError = getUserFriendlyError(apiError);
      throw new Error(friendlyError.description);
    }

    const fullResponse = await response.json();
    console.log('[configService] Logs API full response:', fullResponse);
    
    // Return the entire response structure (which has data and pagination)
    return {
      data: fullResponse.data || [],
      pagination: fullResponse.pagination || {}
    };
  } catch (error) {
    const apiError = await handleApiError(error);
    const friendlyError = getUserFriendlyError(apiError);
    throw new Error(friendlyError.description);
  }
}

export async function exportLogs(filters?: Omit<LogFilters, 'page' | 'limit'>): Promise<Blob> {
  const params = new URLSearchParams();
  if (filters) {
    if (filters.user_id) params.append('user_id', filters.user_id.toString());
    if (filters.action_type) params.append('action_type', filters.action_type);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.kpi) params.append('kpi', filters.kpi);
    if (filters.department_id) params.append('department_id', filters.department_id.toString());
    if (filters.search) params.append('search', filters.search);
  }
  const queryString = params.toString();
  const response = await fetch(`${API_BASE_URL}/logs/export${queryString ? `?${queryString}` : ''}`, {
    headers: {
      ...getAuthHeader(),
    },
  });
  if (!response.ok) {
    throw new Error('Failed to export logs');
  }
  return response.blob();
}

export async function getLogStats(): Promise<LogStats> {
  return fetchAPI<LogStats>('/logs/stats');
}

// ========== USER PERMISSIONS ==========

export async function getPermissions(): Promise<UserPermission[]> {
  return fetchAPI<UserPermission[]>('/permissions');
}

export async function getUserPermissions(userId: number): Promise<UserPermission[]> {
  return fetchAPI<UserPermission[]>(`/permissions/user/${userId}`);
}

export async function createOrUpdatePermission(permission: PermissionFormData): Promise<UserPermission> {
  return fetchAPI<UserPermission>('/permissions', {
    method: 'POST',
    body: JSON.stringify(permission),
  });
}

export async function deletePermission(id: number): Promise<void> {
  await fetchAPI(`/permissions/${id}`, {
    method: 'DELETE',
  });
}

export async function bulkUpdatePermissions(permissions: PermissionFormData[]): Promise<UserPermission[]> {
  return fetchAPI<UserPermission[]>('/permissions/bulk', {
    method: 'POST',
    body: JSON.stringify({ permissions }),
  });
}

// ========== USERS ==========

export interface User {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
}

export async function getUsers(): Promise<User[]> {
  return fetchAPI<User[]>('/users');
}
