import type {
  MainPlanObjective,
  RASCI,
  RASCIWithExistence,
  Department,
  DepartmentObjective,
  StrategicDepartmentObjective,
  StrategicMonthlyData,
  StrategicMainObjectiveLink,
  MonthlyData,
  PlanChecker,
  HierarchicalPlan,
  KPIBreakdownResponse,
  KPIBreakdownSource,
  StrategicTopicCode,
  StrategicTopicKpiRow,
} from '@/types/wig';
import { getCsrfHeader } from '@/utils/csrf';
import { getAuthHeader } from './authService';
import { handleApiError, isAuthError, shouldRetry, getRetryDelay, handleAuthError } from '@/utils/apiErrorHandler';
import { getUserFriendlyError, type AppError } from '@/utils/errorMessages';
import { requestQueue } from '@/utils/requestQueue';

// Use local proxy for development, Netlify function for production
const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalWigProxy =
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
const API_BASE_URL = isLocalWigProxy
  ? '/api/wig' // Proxied to wig-proxy (3003) by Vite in dev
  : '/.netlify/functions/wig-api';

const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // CSRF on mutating methods only. Auth (Bearer) on all methods so GETs can return
  // role-scoped data (e.g. strategic meeting_notes / me_e / active / notes for Admin/CEO).
  const method = options?.method || 'GET';
  const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
  const csrfHeaders = isMutating ? getCsrfHeader() : {};
  const authHeaders = getAuthHeader();

  if (process.env.NODE_ENV === 'development' && isMutating) {
    console.log('[WIG Service] Auth headers:', authHeaders);
    console.log('[WIG Service] Has token:', !!authHeaders['Authorization']);
  }

  // Add cache-busting timestamp to GET requests to prevent browser caching
  let url = `${API_BASE_URL}${endpoint}`;
  if (method === 'GET') {
    const separator = endpoint.includes('?') ? '&' : '?';
    url += `${separator}_t=${Date.now()}`;
  }

  // Check if offline
  if (!navigator.onLine) {
    // Queue request for when connection is restored
    return new Promise<T>((resolve, reject) => {
      requestQueue.enqueue(
        url,
        {
          ...options,
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            ...csrfHeaders,
            ...authHeaders,
            ...options?.headers,
          },
        },
        async (response) => {
          const data = await response.json();
          resolve(data);
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
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
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
          console.log(`[WIG Service] Retrying request (attempt ${attempt + 1}/${MAX_RETRIES}) after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Get user-friendly error message
        const friendlyError = getUserFriendlyError(apiError);
        const error = new Error(friendlyError.description) as AppError;
        error.status = response.status;
        error.friendlyError = friendlyError;
        throw error;
      }

      return response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Request failed');
      
      // Handle network errors
      if (lastError.name === 'AbortError' || lastError.message.includes('timeout')) {
        const apiError = await handleApiError(lastError);
        if (shouldRetry(apiError, attempt, MAX_RETRIES)) {
          const delay = getRetryDelay(attempt);
          console.log(`[WIG Service] Retrying after timeout (attempt ${attempt + 1}/${MAX_RETRIES}) after ${delay}ms`);
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
                cache: 'no-store',
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-cache',
                  ...csrfHeaders,
                  ...authHeaders,
                  ...options?.headers,
                },
              },
              async (response) => {
                const data = await response.json();
                resolve(data);
              },
              reject
            );
          });
        }
        
        const apiError = await handleApiError(lastError);
        const friendlyError = getUserFriendlyError(apiError);
        const finalError = new Error(friendlyError.description) as AppError;
        finalError.status = apiError.status;
        finalError.friendlyError = friendlyError;
        throw finalError;
      }

      // Check if error is retryable
      const apiError = await handleApiError(lastError);
      if (!shouldRetry(apiError, attempt, MAX_RETRIES)) {
        const friendlyError = getUserFriendlyError(apiError);
        const finalError = new Error(friendlyError.description) as AppError;
        finalError.status = apiError.status;
        finalError.friendlyError = friendlyError;
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

// Main Plan Objectives
export async function getMainObjectives(): Promise<MainPlanObjective[]> {
  return fetchAPI<MainPlanObjective[]>('/main-objectives');
}

export async function getHierarchicalPlan(): Promise<HierarchicalPlan> {
  return fetchAPI<HierarchicalPlan>('/main-objectives/hierarchy');
}

export async function createMainObjective(data: Omit<MainPlanObjective, 'id' | 'created_at' | 'updated_at'>): Promise<MainPlanObjective> {
  return fetchAPI<MainPlanObjective>('/main-objectives', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMainObjective(id: number, data: Partial<Omit<MainPlanObjective, 'id' | 'created_at' | 'updated_at'>>): Promise<MainPlanObjective> {
  return fetchAPI<MainPlanObjective>(`/main-objectives/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteMainObjective(id: number): Promise<{ success: boolean; deletedRows: number }> {
  return fetchAPI<{ success: boolean; deletedRows: number }>(`/main-objectives/${id}`, {
    method: 'DELETE',
  });
}

// Department Objectives
export async function getDepartmentObjectives(params?: { department_id?: number; department_code?: string }): Promise<DepartmentObjective[]> {
  const queryParams = new URLSearchParams();
  if (params?.department_id) queryParams.append('department_id', params.department_id.toString());
  if (params?.department_code) queryParams.append('department_code', params.department_code);
  
  const query = queryParams.toString();
  return fetchAPI<DepartmentObjective[]>(`/department-objectives${query ? `?${query}` : ''}`);
}

export async function getDepartmentObjectivesByKPI(kpi: string): Promise<DepartmentObjective[]> {
  return fetchAPI<DepartmentObjective[]>(`/department-objectives/by-kpi/${encodeURIComponent(kpi)}`);
}

export async function createDepartmentObjective(data: Omit<DepartmentObjective, 'id' | 'created_at' | 'updated_at' | 'department_name' | 'department_code'>): Promise<DepartmentObjective> {
  return fetchAPI<DepartmentObjective>('/department-objectives', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDepartmentObjective(id: number, data: Partial<Omit<DepartmentObjective, 'id' | 'created_at' | 'updated_at' | 'department_name' | 'department_code'>>): Promise<DepartmentObjective> {
  return fetchAPI<DepartmentObjective>(`/department-objectives/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDepartmentObjective(id: number): Promise<{ success: boolean; deletedRows: number }> {
  return fetchAPI<{ success: boolean; deletedRows: number }>(`/department-objectives/${id}`, {
    method: 'DELETE',
  });
}

export async function updateDepartmentObjectivesOrder(updates: Array<{ id: number; sort_order: number }>): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>('/department-objectives/update-order', {
    method: 'POST',
    body: JSON.stringify({ updates }),
  });
}

// Strategic department objectives (no RASCI)
export async function getStrategicDepartmentObjectives(params?: {
  department_id?: number;
  department_code?: string;
}): Promise<StrategicDepartmentObjective[]> {
  const queryParams = new URLSearchParams();
  if (params?.department_id) queryParams.append('department_id', params.department_id.toString());
  if (params?.department_code) queryParams.append('department_code', params.department_code);
  const query = queryParams.toString();
  return fetchAPI<StrategicDepartmentObjective[]>(`/strategic-department-objectives${query ? `?${query}` : ''}`);
}

export async function createStrategicDepartmentObjective(
  data: Omit<StrategicDepartmentObjective, 'id' | 'created_at' | 'updated_at' | 'department_name' | 'department_code'>
): Promise<StrategicDepartmentObjective> {
  return fetchAPI<StrategicDepartmentObjective>('/strategic-department-objectives', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStrategicDepartmentObjective(
  id: number,
  data: Partial<Omit<StrategicDepartmentObjective, 'id' | 'created_at' | 'updated_at' | 'department_name' | 'department_code'>>
): Promise<StrategicDepartmentObjective> {
  return fetchAPI<StrategicDepartmentObjective>(`/strategic-department-objectives/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteStrategicDepartmentObjective(id: number): Promise<{ success: boolean; deletedRows: number }> {
  return fetchAPI<{ success: boolean; deletedRows: number }>(`/strategic-department-objectives/${id}`, {
    method: 'DELETE',
  });
}

export async function updateStrategicDepartmentObjectivesOrder(
  updates: Array<{ id: number; sort_order: number }>
): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>('/strategic-department-objectives/update-order', {
    method: 'POST',
    body: JSON.stringify({ updates }),
  });
}

export async function getStrategicMonthlyData(strategicDepartmentObjectiveId: number): Promise<StrategicMonthlyData[]> {
  return fetchAPI<StrategicMonthlyData[]>(`/strategic-monthly-data/${strategicDepartmentObjectiveId}`);
}

export async function createOrUpdateStrategicMonthlyData(
  data: Omit<StrategicMonthlyData, 'id' | 'created_at' | 'updated_at'>
): Promise<StrategicMonthlyData> {
  return fetchAPI<StrategicMonthlyData>('/strategic-monthly-data', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getStrategicMainObjectiveLinks(strategicId: number): Promise<StrategicMainObjectiveLink[]> {
  return fetchAPI<StrategicMainObjectiveLink[]>(`/strategic-department-objectives/${strategicId}/main-objectives`);
}

export async function putStrategicMainObjectiveLinks(
  strategicId: number,
  mainObjectiveIds: number[]
): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(`/strategic-department-objectives/${strategicId}/main-objectives`, {
    method: 'PUT',
    body: JSON.stringify({ main_objective_ids: mainObjectiveIds }),
  });
}

// RASCI
export async function getRASCI(): Promise<RASCI[]> {
  return fetchAPI<RASCI[]>('/rasci');
}

export async function getRASCIByKPI(kpi: string): Promise<RASCI[]> {
  return fetchAPI<RASCI[]>(`/rasci/kpi/${encodeURIComponent(kpi)}`);
}

export async function getRASCIByDepartment(departmentCode: string): Promise<RASCIWithExistence[]> {
  return fetchAPI<RASCIWithExistence[]>(`/rasci/department/${encodeURIComponent(departmentCode)}`);
}

export async function createOrUpdateRASCI(data: Omit<RASCI, 'id' | 'created_at' | 'updated_at'>): Promise<RASCI> {
  return fetchAPI<RASCI>('/rasci', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteRASCI(id: number): Promise<{ success: boolean; deletedRows: number }> {
  return fetchAPI<{ success: boolean; deletedRows: number }>(`/rasci/${id}`, {
    method: 'DELETE',
  });
}

// KPIs with RASCI
export async function getKPIsWithRASCI(): Promise<string[]> {
  return fetchAPI<string[]>('/kpis-with-rasci');
}

// KPI Breakdown (optional breakdown_source: BAU dept objectives, Strategic dept objectives, or both summed)
export async function getKPIBreakdown(
  kpi: string,
  breakdownSource: KPIBreakdownSource = 'bau'
): Promise<KPIBreakdownResponse> {
  const qs = new URLSearchParams({ breakdown_source: breakdownSource });
  return fetchAPI<KPIBreakdownResponse>(
    `/kpi-breakdown/${encodeURIComponent(kpi)}?${qs.toString()}`
  );
}

// Departments
export async function getDepartments(): Promise<Department[]> {
  return fetchAPI<Department[]>('/departments');
}

// Strategic topic KPI rows (per-topic table / Gantt / dashboard)
export async function getStrategicTopicKpiRows(strategicTopic: StrategicTopicCode): Promise<StrategicTopicKpiRow[]> {
  const qs = new URLSearchParams({ strategic_topic: strategicTopic });
  return fetchAPI<StrategicTopicKpiRow[]>(`/strategic-topic-kpi-rows?${qs.toString()}`);
}

export async function createStrategicTopicKpiRow(
  data: Omit<StrategicTopicKpiRow, 'id' | 'created_at' | 'updated_at' | 'main_kpi' | 'main_objective' | 'main_pillar'>
): Promise<StrategicTopicKpiRow> {
  return fetchAPI<StrategicTopicKpiRow>('/strategic-topic-kpi-rows', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStrategicTopicKpiRow(
  id: number,
  data: Partial<Omit<StrategicTopicKpiRow, 'id' | 'created_at' | 'updated_at' | 'main_kpi' | 'main_objective' | 'main_pillar'>>
): Promise<StrategicTopicKpiRow> {
  return fetchAPI<StrategicTopicKpiRow>(`/strategic-topic-kpi-rows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteStrategicTopicKpiRow(id: number): Promise<{ success: boolean; deletedRows: number }> {
  return fetchAPI<{ success: boolean; deletedRows: number }>(`/strategic-topic-kpi-rows/${id}`, {
    method: 'DELETE',
  });
}

export async function updateStrategicTopicKpiRowsOrder(payload: {
  strategic_topic: StrategicTopicCode;
  updates: Array<{ id: number; sort_order: number }>;
}): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>('/strategic-topic-kpi-rows/update-order', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// RASCI summary per department (when All Departments is selected)
export interface RASCISummaryByDepartment {
  department: string;
  department_code?: string;
  total_kpis: number;
  exists: number;
  not_exists: number;
  exists_percent: number;
}

// Combined Dashboard Data
export interface DepartmentDashboardData {
  departmentObjectives: DepartmentObjective[];
  mainObjectives: MainPlanObjective[];
  departments: Department[];
  rasci: RASCIWithExistence[];
  hierarchicalPlan: HierarchicalPlan;
  /** Per-department RASCI summary when All Departments is selected */
  rasciSummary?: RASCISummaryByDepartment[];
}

export async function getDepartmentDashboardData(departmentCode?: string): Promise<DepartmentDashboardData> {
  const queryParams = new URLSearchParams();
  if (departmentCode) queryParams.append('department_code', departmentCode);
  
  const query = queryParams.toString();
  return fetchAPI<DepartmentDashboardData>(`/department-dashboard-data${query ? `?${query}` : ''}`);
}

export async function getRASCISummaryByDepartment(): Promise<RASCISummaryByDepartment[]> {
  return fetchAPI<RASCISummaryByDepartment[]>('/rasci/summary-by-department');
}

// Plan Checkers
export async function getPlanChecker(objectiveId: number): Promise<PlanChecker | null> {
  return fetchAPI<PlanChecker | null>(`/checkers/${objectiveId}`);
}

export async function calculatePlanCheckers(): Promise<PlanChecker[]> {
  return fetchAPI<PlanChecker[]>('/checkers/calculate', {
    method: 'POST',
  });
}

// Monthly Data
export async function getMonthlyData(departmentObjectiveId: number): Promise<MonthlyData[]> {
  return fetchAPI<MonthlyData[]>(`/monthly-data/${departmentObjectiveId}`);
}

export async function createOrUpdateMonthlyData(data: Omit<MonthlyData, 'id' | 'created_at' | 'updated_at'>): Promise<MonthlyData> {
  return fetchAPI<MonthlyData>('/monthly-data', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

