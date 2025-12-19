export interface MainPlanObjective {
  id: number;
  pillar: string;
  objective: string;
  target: string;
  kpi: string;
  annual_target: number;
  created_at?: string;
  updated_at?: string;
}

export interface RASCI {
  id: number;
  kpi: string;
  department: string;
  responsible: boolean;
  accountable: boolean;
  supportive: boolean;
  consulted: boolean;
  informed: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RASCIWithExistence extends RASCI {
  role: string; // Comma-separated roles like "R, A, S"
  exists_in_activities: boolean;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  created_at?: string;
}

export interface DepartmentObjective {
  id: number;
  main_objective_id: number | null;
  department_id: number;
  department_name?: string;
  department_code?: string;
  kpi: string;
  activity: string;
  type: 'Direct' | 'In direct' | 'M&E' | '';
  activity_target: number;
  responsible_person: string;
  mov: string;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlyData {
  id: number;
  department_objective_id?: number; // Kept for backward compatibility
  kpi: string;
  department_id: number;
  month: string; // YYYY-MM format
  target_value: number | null;
  actual_value: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlanChecker {
  id: number;
  objective_id: number;
  planned_status: 'covered' | 'not_covered';
  annual_target_status: 'ok' | 'above' | 'less';
  annual_target_variance: number | null;
  last_checked_at?: string;
  created_at?: string;
  updated_at?: string;
}

// Hierarchical structure types
export interface HierarchicalPlan {
  pillars: PillarGroup[];
}

export interface PillarGroup {
  pillar: string;
  objectives: ObjectiveGroup[];
}

export interface ObjectiveGroup {
  objective: string;
  objectiveId: number;
  targets: TargetGroup[];
}

export interface TargetGroup {
  target: string;
  kpis: KPIGroup[];
}

export interface KPIGroup {
  kpi: string;
  annual_target: number;
  id: number;
}

export interface DepartmentBreakdown {
  department: string;
  departmentId: number;
  departmentCode: string;
  sum: number; // Total sum (Direct + In direct) of activity_target for this KPI
  directSum: number; // Sum of Direct type activity_target
  indirectSum: number; // Sum of In direct type activity_target
  directCount: number; // Number of Direct objectives
  indirectCount: number; // Number of In direct objectives
  percentage: number; // Percentage of annual_target (based on total sum)
}

export interface KPIBreakdownResponse {
  kpi: string;
  annual_target: number;
  main_objective_id?: number | null; // ID of the main objective this KPI belongs to
  breakdown: DepartmentBreakdown[];
}

