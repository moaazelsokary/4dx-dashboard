import type { DeptGridColumn } from './types';

/** Updated each DepartmentObjectives render — avoids context churn for keyboard/paste navigation. */
export const departmentObjectivesSheetNavRef = {
  visibleRowIds: [] as readonly number[],
  columnOrder: [] as readonly DeptGridColumn[],
};
