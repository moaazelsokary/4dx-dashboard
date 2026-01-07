import type {
  MainPlanObjective,
  RASCI,
  RASCIWithExistence,
  Department,
  DepartmentObjective,
  MonthlyData,
  PlanChecker,
  HierarchicalPlan,
  KPIBreakdownResponse,
} from '@/types/wig';
import { getCsrfHeader } from '@/utils/csrf';

// Use local proxy for development, Netlify function for production
const isLocalhost = window.location.hostname === 'localhost';
const API_BASE_URL = isLocalhost
  ? 'http://localhost:3003/api/wig'
  : '/.netlify/functions/wig-api';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // Include CSRF token for POST, PUT, DELETE requests
  const method = options?.method || 'GET';
  const needsCsrf = ['POST', 'PUT', 'DELETE'].includes(method.toUpperCase());
  const csrfHeaders = needsCsrf ? getCsrfHeader() : {};

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || errorMessage;
    } catch {
      // If response is not JSON, try to get text
      try {
        const text = await response.text();
        if (text) errorMessage = text;
      } catch {
        // Keep default error message
      }
    }
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
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

// KPI Breakdown
export async function getKPIBreakdown(kpi: string): Promise<KPIBreakdownResponse> {
  return fetchAPI<KPIBreakdownResponse>(`/kpi-breakdown/${encodeURIComponent(kpi)}`);
}

// Departments
export async function getDepartments(): Promise<Department[]> {
  return fetchAPI<Department[]>('/departments');
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
export async function getMonthlyData(kpi: string, departmentId: number): Promise<MonthlyData[]> {
  const encodedKpi = encodeURIComponent(kpi);
  return fetchAPI<MonthlyData[]>(`/monthly-data/${encodedKpi}/${departmentId}`);
}

export async function createOrUpdateMonthlyData(data: Omit<MonthlyData, 'id' | 'created_at' | 'updated_at'>): Promise<MonthlyData> {
  return fetchAPI<MonthlyData>('/monthly-data', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

