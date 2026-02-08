/**
 * Filter state shape and persistence for Excel-like column filters.
 * Supports list mode (multi-select) and condition mode (operator + value).
 */

export type ColumnFilterMode = 'list' | 'condition';

export interface ListFilterState {
  mode: 'list';
  selectedValues: string[];
}

export interface ConditionFilterState {
  mode: 'condition';
  operator: string;
  value?: string;
  value2?: string;
}

export type ColumnFilterState = ListFilterState | ConditionFilterState;

export type TableFilterState = Record<string, ColumnFilterState>;

const STORAGE_PREFIX = 'table-filters-';

export function loadFilterState(storageKey: string): TableFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TableFilterState;
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveFilterState(storageKey: string, state: TableFilterState): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(state));
  } catch {
    // ignore quota or parse errors
  }
}

export function getColumnFilterState(
  tableState: TableFilterState,
  columnKey: string
): ColumnFilterState | undefined {
  return tableState[columnKey];
}

export function getListSelected(state: TableFilterState, columnKey: string): string[] {
  const col = state[columnKey];
  if (!col || col.mode !== 'list') return [];
  return col.selectedValues ?? [];
}

export function getCondition(state: TableFilterState, columnKey: string): ConditionFilterState | undefined {
  const col = state[columnKey];
  if (!col || col.mode !== 'condition') return undefined;
  return {
    mode: 'condition',
    operator: col.operator ?? 'equals',
    value: col.value,
    value2: col.value2,
  };
}

// --- Condition matchers (for applying filters in table pages) ---

export function matchesTextCondition(
  cellValue: string | null | undefined,
  operator: string,
  value?: string,
  _value2?: string
): boolean {
  const str = (cellValue ?? '').toString().trim();
  const v = (value ?? '').trim();
  switch (operator) {
    case 'contains':
      return v ? str.toLowerCase().includes(v.toLowerCase()) : true;
    case 'equals':
      return v ? str.toLowerCase() === v.toLowerCase() : str === '';
    case 'not_equals':
      return v ? str.toLowerCase() !== v.toLowerCase() : str !== '';
    case 'starts_with':
      return v ? str.toLowerCase().startsWith(v.toLowerCase()) : true;
    case 'ends_with':
      return v ? str.toLowerCase().endsWith(v.toLowerCase()) : true;
    case 'is_empty':
      return str === '';
    default:
      return true;
  }
}

export function matchesNumberCondition(
  cellValue: number | string | null | undefined,
  operator: string,
  value?: string,
  value2?: string
): boolean {
  const num = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue ?? '').trim());
  const isNaN = Number.isNaN(num);
  const v = value?.trim() ? parseFloat(value) : NaN;
  const v2 = value2?.trim() ? parseFloat(value2) : NaN;
  switch (operator) {
    case 'equals':
      return !Number.isNaN(v) && !isNaN && num === v;
    case 'not_equals':
      return !Number.isNaN(v) && (isNaN || num !== v);
    case 'greater_than':
      return !Number.isNaN(v) && !isNaN && num > v;
    case 'greater_than_or_equal':
      return !Number.isNaN(v) && !isNaN && num >= v;
    case 'less_than':
      return !Number.isNaN(v) && !isNaN && num < v;
    case 'less_than_or_equal':
      return !Number.isNaN(v) && !isNaN && num <= v;
    case 'between':
      return (
        !Number.isNaN(v) &&
        !Number.isNaN(v2) &&
        !isNaN &&
        num >= Math.min(v, v2) &&
        num <= Math.max(v, v2)
      );
    case 'is_empty':
      return isNaN;
    default:
      return true;
  }
}

export function matchesDateCondition(
  cellValue: string | number | Date | null | undefined,
  operator: string,
  value?: string,
  value2?: string
): boolean {
  const d = cellValue == null ? NaN : new Date(cellValue).getTime();
  const isNaN = Number.isNaN(d);
  const v = value?.trim() ? new Date(value).getTime() : NaN;
  const v2 = value2?.trim() ? new Date(value2).getTime() : NaN;
  switch (operator) {
    case 'equals':
      return !Number.isNaN(v) && !isNaN && d === v;
    case 'before':
      return !Number.isNaN(v) && !isNaN && d < v;
    case 'after':
      return !Number.isNaN(v) && !isNaN && d > v;
    case 'between':
      return (
        !Number.isNaN(v) &&
        !Number.isNaN(v2) &&
        !isNaN &&
        d >= Math.min(v, v2) &&
        d <= Math.max(v, v2)
      );
    case 'is_empty':
      return isNaN;
    default:
      return true;
  }
}
