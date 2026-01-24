// Configuration System TypeScript Types

export type LockType = 'target' | 'monthly_target' | 'monthly_actual' | 'all_department_objectives';
export type ScopeType = 'all_users' | 'specific_users' | 'specific_kpi' | 'department_kpi' | 'all_department_objectives';
export type ActionType = 'lock_created' | 'lock_deleted' | 'lock_updated' | 'value_edited' | 'permission_created' | 'permission_updated' | 'permission_deleted';
export type TargetField = 'target' | 'monthly_target' | 'monthly_actual' | 'all_fields';

export interface FieldLock {
  id: number;
  lock_type: LockType;
  scope_type: ScopeType;
  user_ids: number[] | null; // JSON array of user IDs
  kpi: string | null;
  department_id: number | null;
  exclude_monthly_target: boolean; // Separate control for monthly target
  exclude_monthly_actual: boolean; // Separate control for monthly actual
  exclude_annual_target: boolean;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
  // Denormalized fields for display
  created_by_username?: string;
  department_name?: string;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  username: string;
  action_type: ActionType;
  target_field: TargetField | null;
  old_value: number | null;
  new_value: number | null;
  kpi: string | null;
  department_id: number | null;
  department_name: string | null;
  department_objective_id: number | null;
  month: string | null; // YYYY-MM format
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface UserPermission {
  id: number;
  user_id: number;
  department_id: number | null;
  kpi: string | null;
  can_view: boolean;
  can_edit_target: boolean;
  can_edit_monthly_target: boolean;
  can_edit_monthly_actual: boolean;
  can_view_reports: boolean;
  created_at: string;
  updated_at: string;
  // Denormalized fields for display
  username?: string;
  department_name?: string;
}

export interface LockCheckRequest {
  field_type: TargetField;
  department_objective_id: number;
  month?: string; // YYYY-MM format for monthly fields
  user_id?: number;
}

export interface LockCheckResponse {
  is_locked: boolean;
  lock_reason?: string;
  lock_id?: number;
  scope_type?: ScopeType;
}

export interface BatchLockCheckRequest {
  checks: LockCheckRequest[];
}

export interface BatchLockCheckResponse {
  results: Array<LockCheckResponse & { field_type: TargetField; department_objective_id: number; month?: string }>;
}

export interface LockRuleFormData {
  lock_type?: LockType | LockType[]; // For specific field locks
  scope_type: ScopeType;
  user_ids?: number[]; // For specific_users or all_department_objectives
  kpi?: string; // For specific_kpi or department_kpi
  department_id?: number; // For department_kpi
  exclude_monthly_target?: boolean; // For all_department_objectives - exclude monthly target
  exclude_monthly_actual?: boolean; // For all_department_objectives - exclude monthly actual
  exclude_annual_target?: boolean; // For all_department_objectives - exclude annual target
}

export interface LogFilters {
  user_id?: number;
  action_type?: ActionType;
  date_from?: string;
  date_to?: string;
  kpi?: string;
  department_id?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LogStats {
  total_logs: number;
  by_action_type: Record<ActionType, number>;
  by_user: Array<{ user_id: number; username: string; count: number }>;
  recent_activity: ActivityLog[];
}

export interface PermissionFormData {
  user_id: number;
  department_id?: number | null;
  kpi?: string | null;
  can_view: boolean;
  can_edit_target: boolean;
  can_edit_monthly_target: boolean;
  can_edit_monthly_actual: boolean;
  can_view_reports: boolean;
}
