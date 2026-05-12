import { useEffect, useRef } from 'react';
import type { StrategicTopicKpiRow } from '@/types/wig';
import type { StTopicGridColumn } from '@/lib/strategicTopicKpiGrid/types';
import {
  getStTopicSheetState,
  stTopicSheetBeginEdit,
  stTopicSheetSetAnchor,
} from '@/lib/strategicTopicKpiGrid/store';
import { parseClipboardGrid } from '@/lib/departmentObjectivesGrid/clipboard';
import { getStTopicEditorSeed, parseStTopicInlineCommit } from '@/lib/strategicTopicKpiGrid/commitParsing';
import { stTopicArrowMove } from '@/lib/strategicTopicKpiGrid/sheetNavigation';
import { strategicTopicKpiSheetNavRef } from '@/lib/strategicTopicKpiGrid/navRef';

export type StTopicSpreadsheetControllerOpts = {
  enabled: boolean;
  getRow: (id: number) => StrategicTopicKpiRow | undefined;
  commitInline: (rowId: number, column: StTopicGridColumn, raw: string) => Promise<boolean>;
};

export function useStrategicTopicKpiSpreadsheetController(opts: StTopicSpreadsheetControllerOpts): void {
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    if (!opts.enabled) return;

    const inStTopicEditor = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.closest('[data-st-topic-sheet-editor]') !== null ||
        t.closest('[data-sheet-editor]') !== null ||
        t.closest('[data-spreadsheet-formula-bar]') !== null);

    const shouldIgnoreTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return true;
      if (t.closest('[data-radix-popper-content-wrapper]') || t.closest('[role="dialog"]'))
        return true;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return !inStTopicEditor(t);
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || (e as unknown as { keyCode?: number }).keyCode === 229) return;
      if (shouldIgnoreTarget(e.target)) return;

      const { visibleRowIds, columnOrder } = strategicTopicKpiSheetNavRef;
      const state = getStTopicSheetState();
      if (state.editing && inStTopicEditor(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (!state.anchor || state.editing) return;
        e.preventDefault();
        const row = ref.current.getRow(state.anchor.rowId);
        if (!row) return;
        const text = getStTopicEditorSeed(state.anchor.column, row);
        void navigator.clipboard.writeText(text).catch(() => {});
        return;
      }

      if (!state.anchor || state.editing) return;

      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        const row = ref.current.getRow(state.anchor.rowId);
        if (!row) return;
        const seed = getStTopicEditorSeed(state.anchor.column, row);
        stTopicSheetBeginEdit(state.anchor, seed);
        return;
      }

      let dir: 'up' | 'down' | 'left' | 'right' | null = null;
      if (e.key === 'ArrowUp') dir = 'up';
      else if (e.key === 'ArrowDown') dir = 'down';
      else if (e.key === 'ArrowLeft') dir = 'left';
      else if (e.key === 'ArrowRight') dir = 'right';

      if (dir) {
        e.preventDefault();
        const next = stTopicArrowMove(state.anchor, dir, visibleRowIds, columnOrder);
        if (next) stTopicSheetSetAnchor(next);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const ci = columnOrder.indexOf(state.anchor.column);
        const ri = visibleRowIds.indexOf(state.anchor.rowId);
        if (ri < 0 || ci < 0) return;
        if (!e.shiftKey) {
          if (ci < columnOrder.length - 1) {
            stTopicSheetSetAnchor({ rowId: visibleRowIds[ri], column: columnOrder[ci + 1] });
          } else if (ri < visibleRowIds.length - 1) {
            stTopicSheetSetAnchor({ rowId: visibleRowIds[ri + 1], column: columnOrder[0] });
          }
        } else {
          if (ci > 0) {
            stTopicSheetSetAnchor({ rowId: visibleRowIds[ri], column: columnOrder[ci - 1] });
          } else if (ri > 0) {
            stTopicSheetSetAnchor({
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
      const state = getStTopicSheetState();
      if (state.editing || !state.anchor) return;

      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();

      const grid = parseClipboardGrid(text);
      if (grid.length === 0) return;

      const { visibleRowIds, columnOrder } = strategicTopicKpiSheetNavRef;
      const { getRow, commitInline } = ref.current;
      const startRi = visibleRowIds.indexOf(state.anchor.rowId);
      const startCi = columnOrder.indexOf(state.anchor.column);
      if (startRi < 0 || startCi < 0) return;

      void (async () => {
        for (let dr = 0; dr < grid.length; dr++) {
          const rowLine = grid[dr];
          if (!rowLine) continue;
          for (let dc = 0; dc < rowLine.length; dc++) {
            const ri = startRi + dr;
            const ci = startCi + dc;
            if (ri >= visibleRowIds.length || ci >= columnOrder.length) continue;
            const rowId = visibleRowIds[ri];
            const column = columnOrder[ci];
            const obj = getRow(rowId);
            if (!obj) continue;
            const raw = rowLine[dc] ?? '';
            const parsed = parseStTopicInlineCommit(column, raw);
            if (parsed.ok === false) continue;
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
