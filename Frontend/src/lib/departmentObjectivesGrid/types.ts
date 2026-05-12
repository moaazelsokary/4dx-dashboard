/** Editable data columns only (not KPI / Type / index / actions). */
export type DeptGridColumn =
  | 'activity'
  | 'target'
  | 'responsible'
  | 'mov'
  | 'definition'
  | 'measurement'
  | 'admin_meeting'
  | 'admin_mee'
  | 'admin_active'
  | 'admin_notes';

export type SheetCellAddress = { rowId: number; column: DeptGridColumn };

export type SheetEditingState = SheetCellAddress | null;
