import type { StTopicSheetCellAddress } from './types';

export type StTopicSheetStoreState = {
  anchor: StTopicSheetCellAddress | null;
  editing: StTopicSheetCellAddress | null;
  editDraft: string;
};

const initial: StTopicSheetStoreState = {
  anchor: null,
  editing: null,
  editDraft: '',
};

let state = initial;
const listeners = new Set<() => void>();

export function getStTopicSheetState(): StTopicSheetStoreState {
  return state;
}

export function subscribeStTopicSheet(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  listeners.forEach((l) => l());
}

export function setStTopicSheetState(patch: Partial<StTopicSheetStoreState>): void {
  state = { ...state, ...patch };
  emit();
}

export function resetStTopicSheet(): void {
  state = initial;
  emit();
}

export function stTopicSheetSetAnchor(anchor: StTopicSheetCellAddress | null): void {
  setStTopicSheetState({ anchor, editing: null, editDraft: '' });
}

export function stTopicSheetBeginEdit(addr: StTopicSheetCellAddress, initialDraft: string): void {
  setStTopicSheetState({ anchor: addr, editing: addr, editDraft: initialDraft });
}

export function stTopicSheetSetEditDraft(draft: string): void {
  setStTopicSheetState({ editDraft: draft });
}

export function stTopicSheetCancelEdit(): void {
  setStTopicSheetState({ editing: null, editDraft: '' });
}

export function stTopicSheetFinishEdit(): void {
  setStTopicSheetState({ editing: null, editDraft: '' });
}
