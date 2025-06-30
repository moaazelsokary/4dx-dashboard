// Dashboard Types

export interface ExcelRow {
  id: number;
  data: string[];
}

export interface DepartmentData {
  department: string;
  data: ExcelRow[];
  lastUpdated: string;
  totalRows: number;
}

export interface LagMetric {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string;
  status: 'on-track' | 'at-risk' | 'off-track';
  trend: 'up' | 'down' | 'stable';
}

export interface LeadMetric {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string;
  status: 'on-track' | 'at-risk' | 'off-track';
  trend: 'up' | 'down' | 'stable';
}

export interface DepartmentHealth {
  department: string;
  lagMetrics: LagMetric[];
  leadMetrics: LeadMetric[];
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
  lastUpdated: string;
}

export interface TimePeriod {
  label: string;
  value: string;
  startDate: string;
  endDate: string;
} 