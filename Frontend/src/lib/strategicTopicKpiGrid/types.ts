/** Editable topic KPI columns (not KPI link, departments, topics, actions). */
export type StTopicGridColumn =
  | 'objective'
  | 'activity'
  | 'duration'
  | 'start'
  | 'end'
  | 'status'
  | 'notes';

export type StTopicSheetCellAddress = { rowId: number; column: StTopicGridColumn };
