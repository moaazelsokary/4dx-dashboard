// Configuration System TypeScript Types

export type LockType = 'target' | 'monthly_target' | 'monthly_actual' | 'all_department_objectives';
export type ScopeType = 'hierarchical'; // New unified scope type
export type ActionType = 'lock_created' | 'lock_deleted' | 'lock_updated' | 'value_edited' | 'permission_created' | 'permission_updated' | 'permission_deleted';
export type TargetField = 'target' | 'monthly_target' | 'monthly_actual' | 'all_fields';
export type UserScope = 'all' | 'specific' | 'none';
export type KPIScope = 'all' | 'specific' | 'none';
export type ObjectiveScope = 'all' | 'specific' | 'none';

export interface FieldLock {
  id: number;
  // New hierarchical structure
  scope_type: ScopeType; // Always 'hierarchical' for new structure
  user_scope: UserScope; // 'all', 'specific', or 'none'
  user_ids: number[] | null; // JSON array of user IDs (when user_scope = 'specific')
  kpi_scope: KPIScope; // 'all', 'specific', or 'none'
  kpi_ids: string[] | null; // JSON array of KPI strings (when kpi_scope = 'specific')
  objective_scope: ObjectiveScope; // 'all', 'specific', or 'none'
  objective_ids: number[] | null; // JSON array of objective IDs (when objective_scope = 'specific')
  
  // Field locks
  lock_annual_target: boolean;
  lock_monthly_target: boolean;
  lock_monthly_actual: boolean;
  lock_all_other_fields: boolean; // activity, responsible_person, mov, etc.
  lock_add_objective: boolean;
  lock_delete_objective: boolean;
  
  // Legacy fields (for backward compatibility during migration)
  lock_type?: LockType;
  kpi?: string | null;
  department_id?: number | null;
  department_objective_id?: number | null;
  exclude_monthly_target?: boolean;
  exclude_monthly_actual?: boolean;
  exclude_annual_target?: boolean;
  
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
  // Denormalized fields for display
  created_by_username?: string;
  department_name?: string;
  department_objective_activity?: string;
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
  /** Defaults to bau. Use strategic for strategic_department_objectives IDs. */
  objective_kind?: 'bau' | 'strategic';
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
  results: Array<
    LockCheckResponse & {
      field_type: TargetField;
      department_objective_id: number;
      month?: string;
      objective_kind?: 'bau' | 'strategic';
    }
  >;
}

export interface LockRuleFormData {
  scope_type: ScopeType; // Always 'hierarchical'
  user_scope: UserScope; // 'all', 'specific', or 'none'
  user_ids?: number[]; // When user_scope = 'specific'
  kpi_scope: KPIScope; // 'all', 'specific', or 'none'
  kpi_ids?: string[]; // When kpi_scope = 'specific'
  objective_scope: ObjectiveScope; // 'all', 'specific', or 'none'
  objective_ids?: number[]; // When objective_scope = 'specific'
  
  // Field locks
  lock_annual_target?: boolean;
  lock_monthly_target?: boolean;
  lock_monthly_actual?: boolean;
  lock_all_other_fields?: boolean;
  lock_add_objective?: boolean;
  lock_delete_objective?: boolean;
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

/** Same shape as BAU mapping but keyed by strategic_department_objectives.id */
export interface StrategicObjectiveDataSourceMapping {
  strategic_department_objective_id: number;
  pms_project_name: string | null;
  pms_metric_name: string | null;
  target_source: 'pms_target' | 'derived' | null;
  actual_source: 'manual' | 'pms_actual' | 'odoo_services_done' | 'odoo_services_created' | 'derived';
  odoo_project_name: string | null;
  derived_project_name: string | null;
  created_at?: string;
  updated_at?: string;
  kpi?: string;
  activity?: string;
  department_id?: number;
  department_name?: string;
}

export interface ObjectiveDataSourceMapping {
  department_objective_id: number;
  pms_project_name: string | null;
  pms_metric_name: string | null;
  /** 'pms_target' | 'derived' = fill monthly target from source; null = manual (user edits) */
  target_source: 'pms_target' | 'derived' | null;
  /** 'manual' = edit actual manually; 'pms_actual' | 'odoo_services_done' | 'odoo_services_created' | 'derived' = fill from source */
  actual_source: 'manual' | 'pms_actual' | 'odoo_services_done' | 'odoo_services_created' | 'derived';
  odoo_project_name: string | null;
  /** Used when target_source or actual_source is 'derived' (project name from derived_metrics) */
  derived_project_name: string | null;
  created_at?: string;
  updated_at?: string;
  // Denormalized fields for display
  kpi?: string;
  activity?: string;
  department_id?: number;
  department_name?: string;
}

export interface MappingFormData {
  pms_project_name: string;
  pms_metric_name: string;
  /** 'pms_target' | 'derived' = from source; 'manual' or null = Manual (edit manually) */
  target_source: 'pms_target' | 'derived' | 'manual' | null;
  /** 'manual' = edit actual manually (default); 'pms_actual' | 'odoo_services_done' | 'odoo_services_created' | 'derived' = fill from source */
  actual_source: 'manual' | 'pms_actual' | 'odoo_services_done' | 'odoo_services_created' | 'derived';
  odoo_project_name?: string; // Required when actual_source is Odoo-based
  derived_project_name?: string; // Required when target_source or actual_source is derived
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

/** Admin Users tab — full account row from GET /accounts */
export interface AccountUser {
  id: number;
  username: string;
  role: string;
  departments: string[];
  is_active: boolean;
  default_route: string | null;
  allowed_routes: string[] | null;
  powerbi_dashboard_ids: string[] | null;
  created_at?: string;
  updated_at?: string;
}

/** dbo.powerbi_dashboards row — GET /powerbi-dashboards */
export interface PowerbiDashboardRecord {
  id: string;
  name: string;
  title: string;
  embed_url: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

/** POST /powerbi-dashboards body */
export interface PowerbiDashboardPayload {
  id: string;
  name: string;
  title: string;
  embed_url?: string;
  sort_order?: number;
}

/** PUT /powerbi-dashboards/:id body (partial) */
export interface PowerbiDashboardUpdatePayload {
  name?: string;
  title?: string;
  embed_url?: string;
  sort_order?: number;
}

/** POST /accounts or PUT /accounts/:id body */
export interface AccountPayload {
  username?: string;
  password?: string;
  role?: string;
  departments?: string[];
  is_active?: boolean;
  default_route?: string | null;
  allowed_routes?: string[] | null;
  powerbi_dashboard_ids?: string[] | null;
}
