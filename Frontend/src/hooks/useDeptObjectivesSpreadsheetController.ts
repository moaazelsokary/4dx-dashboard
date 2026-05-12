import { useEffect, useRef } from 'react';
import type { DepartmentObjective, StrategicDepartmentObjective } from '@/types/wig';
import type { DeptGridColumn } from '@/lib/departmentObjectivesGrid/types';
import {
  getDeptObjectiveSheetState,
  sheetBeginEdit,
  sheetSetAnchor,
} from '@/lib/departmentObjectivesGrid/store';
import { parseClipboardGrid, serializeSelectionTsv } from '@/lib/departmentObjectivesGrid/clipboard';
import { getInlineEditorSeed, parseInlineCommit } from '@/lib/departmentObjectivesGrid/commitParsing';
import { arrowMove } from '@/lib/departmentObjectivesGrid/sheetNavigation';
import { departmentObjectivesSheetNavRef } from '@/lib/departmentObjectivesGrid/navRef';

export type SpreadsheetControllerOpts = {
  enabled: boolean;
  kpiMode: 'bau' | 'strategic';
  getRow: (id: number) => DepartmentObjective | StrategicDepartmentObjective | undefined;
  commitInline: (rowId: number, column: DeptGridColumn, raw: string) => Promise<boolean>;
};

/**
 * Document-level keyboard + clipboard for spreadsheet UX when not typing in arbitrary inputs.
 * Uses capture phase; skips Radix portals and native inputs outside `[data-sheet-editor]`.
 */
export function useDeptObjectivesSpreadsheetController(opts: SpreadsheetControllerOpts): void {
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    if (!opts.enabled) return;

    const inSheetEditor = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.closest('[data-sheet-editor]') !== null ||
        t.closest('[data-spreadsheet-formula-bar]') !== null);

    const shouldIgnoreTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return true;
      if (t.closest('[data-radix-popper-content-wrapper]') || t.closest('[role="dialog"]')) return true;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return !inSheetEditor(t);
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || (e as unknown as { keyCode?: number }).keyCode === 229) return;
      if (shouldIgnoreTarget(e.target)) return;

      const { visibleRowIds, columnOrder } = departmentObjectivesSheetNavRef;

      const state = getDeptObjectiveSheetState();
      if (state.editing && inSheetEditor(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (!state.anchor || state.editing) return;
        e.preventDefault();
        const row = ref.current.getRow(state.anchor.rowId);
        if (!row) return;
        const text = getInlineEditorSeed(state.anchor.column, row);
        void navigator.clipboard.writeText(text).catch(() => {
          /* fallback unavailable */
        });
        return;
      }

      if (!state.anchor || state.editing) return;

      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        const row = ref.current.getRow(state.anchor.rowId);
        if (!row) return;
        const seed = getInlineEditorSeed(state.anchor.column, row);
        sheetBeginEdit(state.anchor, seed);
        return;
      }

      let dir: 'up' | 'down' | 'left' | 'right' | null = null;
      if (e.key === 'ArrowUp') dir = 'up';
      else if (e.key === 'ArrowDown') dir = 'down';
      else if (e.key === 'ArrowLeft') dir = 'left';
      else if (e.key === 'ArrowRight') dir = 'right';

      if (dir) {
        e.preventDefault();
        const next = arrowMove(state.anchor, dir, visibleRowIds, columnOrder);
        if (next) sheetSetAnchor(next);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const ci = columnOrder.indexOf(state.anchor.column);
        const ri = visibleRowIds.indexOf(state.anchor.rowId);
        if (ri < 0 || ci < 0) return;
        if (!e.shiftKey) {
          if (ci < columnOrder.length - 1) {
            sheetSetAnchor({ rowId: visibleRowIds[ri], column: columnOrder[ci + 1] });
          } else if (ri < visibleRowIds.length - 1) {
            sheetSetAnchor({ rowId: visibleRowIds[ri + 1], column: columnOrder[0] });
          }
        } else {
          if (ci > 0) {
            sheetSetAnchor({ rowId: visibleRowIds[ri], column: columnOrder[ci - 1] });
          } else if (ri > 0) {
            sheetSetAnchor({
              rowId: visibleRowIds[ri - 1],
              column: columnOrder[columnOrder.length - 1],
            });
          }
        }
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!ref.current.enabled) return;
      if (shouldIgnoreTarget(e.target)) return;
      const state = getDeptObjectiveSheetState();
      if (state.editing || !state.anchor) return;

      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();

      const grid = parseClipboardGrid(text);
      if (grid.length === 0) return;

      const { visibleRowIds, columnOrder } = departmentObjectivesSheetNavRef;
      const { getRow, commitInline, kpiMode } = ref.current;
      const startRi = visibleRowIds.indexOf(state.anchor.rowId);
      const startCi = columnOrder.indexOf(state.anchor.column);
      if (startRi < 0 || startCi < 0) return;

      void (async () => {
        for (let dr = 0; dr < grid.length; dr++) {
          const row = grid[dr];
          if (!row) continue;
          for (let dc = 0; dc < row.length; dc++) {
            const ri = startRi + dr;
            const ci = startCi + dc;
            if (ri >= visibleRowIds.length || ci >= columnOrder.length) continue;
            const rowId = visibleRowIds[ri];
            const column = columnOrder[ci];
            const obj = getRow(rowId);
            if (!obj) continue;
            const raw = row[dc] ?? '';
            const parsed = parseInlineCommit(column, raw, obj, kpiMode);
            if (!parsed.ok) continue;
            await commitInline(rowId, column, raw);
          }
        }
      })();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('paste', onPaste, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('paste', onPaste, true);
    };
  }, [opts.enabled]);
}

/** Serialize a rectangular region as TSV for optional multi-copy (future range selection). */
export function serializeRowsForClipboard(
  cells: { rowId: number; column: DeptGridColumn }[],
  rowIds: readonly number[],
  columns: readonly DeptGridColumn[],
  getRow: (id: number) => DepartmentObjective | StrategicDepartmentObjective | undefined
): string {
  if (cells.length === 0) return '';
  const rowIndex = new Map<number, number>();
  rowIds.forEach((id, i) => rowIndex.set(id, i));
  const colIndex = new Map<DeptGridColumn, number>();
  columns.forEach((c, i) => colIndex.set(c, i));

  let minR = Infinity,
    maxR = -1,
    minC = Infinity,
    maxC = -1;
  for (const { rowId, column } of cells) {
    const r = rowIndex.get(rowId);
    const c = colIndex.get(column);
    if (r === undefined || c === undefined) continue;
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  }
  if (!Number.isFinite(minR)) return '';

  const grid: string[][] = [];
  for (let r = minR; r <= maxR; r++) {
    const rowVals: string[] = [];
    const id = rowIds[r];
    const obj = id !== undefined ? getRow(id) : undefined;
    for (let c = minC; c <= maxC; c++) {
      const col = columns[c];
      rowVals.push(obj && col ? getInlineEditorSeed(col, obj) : '');
    }
    grid.push(rowVals);
  }
  return serializeSelectionTsv(grid);
}
