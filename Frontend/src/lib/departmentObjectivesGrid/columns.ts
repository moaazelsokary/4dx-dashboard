import type { DeptGridColumn } from './types';

export function getDeptObjectiveGridColumns(
  kpiMode: 'bau' | 'strategic',
  canSeeStrategicAdminColumns: boolean
): DeptGridColumn[] {
  const base: DeptGridColumn[] =
    kpiMode === 'strategic'
      ? ['activity', 'target', 'responsible', 'definition', 'measurement', 'mov']
      : ['activity', 'target', 'responsible', 'mov'];

  if (kpiMode === 'strategic' && canSeeStrategicAdminColumns) {
    base.push('admin_meeting', 'admin_mee', 'admin_active', 'admin_notes');
  }

  return base;
}

export function columnIndex(columns: readonly DeptGridColumn[], col: DeptGridColumn): number {
  return columns.indexOf(col);
}
