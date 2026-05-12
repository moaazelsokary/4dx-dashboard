import type { SheetCellAddress, SheetEditingState } from './types';

export type DeptObjectiveSheetStoreState = {
  anchor: SheetCellAddress | null;
  editing: SheetEditingState;
  /** Plain text only (no formulas); synced with inline cell + formula bar while editing. */
  editDraft: string;
};

const initial: DeptObjectiveSheetStoreState = {
  anchor: null,
  editing: null,
  editDraft: '',
};

let state = initial;
const listeners = new Set<() => void>();

export function getDeptObjectiveSheetState(): DeptObjectiveSheetStoreState {
  return state;
}

export function subscribeDeptObjectiveSheet(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  listeners.forEach((l) => l());
}

export function setDeptObjectiveSheetState(patch: Partial<DeptObjectiveSheetStoreState>): void {
  state = { ...state, ...patch };
  emit();
}

export function resetDeptObjectiveSheet(): void {
  state = initial;
  emit();
}

export function sheetSetAnchor(anchor: SheetCellAddress | null): void {
  setDeptObjectiveSheetState({ anchor, editing: null, editDraft: '' });
}

export function sheetBeginEdit(addr: SheetCellAddress, initialDraft: string): void {
  setDeptObjectiveSheetState({ anchor: addr, editing: addr, editDraft: initialDraft });
}

export function sheetSetEditDraft(draft: string): void {
  setDeptObjectiveSheetState({ editDraft: draft });
}

export function sheetCancelEdit(): void {
  setDeptObjectiveSheetState({ editing: null, editDraft: '' });
}

export function sheetFinishEdit(): void {
  setDeptObjectiveSheetState({ editing: null, editDraft: '' });
}
