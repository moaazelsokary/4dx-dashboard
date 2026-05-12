import React, { memo, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { StTopicGridColumn } from '@/lib/strategicTopicKpiGrid/types';
import {
  stTopicSheetBeginEdit,
  stTopicSheetCancelEdit,
  stTopicSheetSetAnchor,
  stTopicSheetSetEditDraft,
  subscribeStTopicSheet,
  getStTopicSheetState,
} from '@/lib/strategicTopicKpiGrid/store';
import { strategicTopicKpiSheetNavRef } from '@/lib/strategicTopicKpiGrid/navRef';
import {
  stTopicTabMove,
  stTopicEnterMoveDown,
} from '@/lib/strategicTopicKpiGrid/sheetNavigation';
import { strategicTopicKpiInlineAppendRef } from '@/lib/strategicTopicKpiGrid/inlineAppendRef';
import { useStrategicTopicKpiSpreadsheetOptional } from '@/components/wig/StrategicTopicKpiSpreadsheetContext';

export type StrategicTopicKpiSheetCellProps = {
  rowId: number;
  column: StTopicGridColumn;
  editorSeed: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

function useStTopicCellFocused(rowId: number, column: StTopicGridColumn): boolean {
  return useSyncExternalStore(
    subscribeStTopicSheet,
    () => {
      const s = getStTopicSheetState();
      return !!(s.anchor?.rowId === rowId && s.anchor?.column === column && !s.editing);
    },
    () => false
  );
}

function useStTopicCellEditing(rowId: number, column: StTopicGridColumn): boolean {
  return useSyncExternalStore(
    subscribeStTopicSheet,
    () => {
      const s = getStTopicSheetState();
      return !!(s.editing?.rowId === rowId && s.editing?.column === column);
    },
    () => false
  );
}

function useStTopicEditDraft(rowId: number, column: StTopicGridColumn): string {
  return useSyncExternalStore(
    subscribeStTopicSheet,
    () => {
      const s = getStTopicSheetState();
      if (s.editing?.rowId === rowId && s.editing?.column === column) return s.editDraft;
      return '';
    },
    () => ''
  );
}

export const StrategicTopicKpiSheetCell = memo(function StrategicTopicKpiSheetCell({
  rowId,
  column,
  editorSeed,
  children,
  className,
  disabled,
}: StrategicTopicKpiSheetCellProps) {
  const sheet = useStrategicTopicKpiSpreadsheetOptional();
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  const isFocused = useStTopicCellFocused(rowId, column);
  const isEditing = useStTopicCellEditing(rowId, column);
  const editDraft = useStTopicEditDraft(rowId, column);

  useLayoutEffect(() => {
    if (isEditing) {
      committedRef.current = false;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select?.();
      });
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) committedRef.current = false;
  }, [isEditing]);

  const performCommit = async (after?: () => void) => {
    if (!sheet || committedRef.current) return;
    committedRef.current = true;
    const ok = await sheet.commitActiveEditor(after);
    if (!ok) committedRef.current = false;
  };

  if (!sheet || disabled) {
    return <TableCell className={className}>{children}</TableCell>;
  }

  if (isEditing) {
    return (
      <TableCell className={cn('p-0 align-top', className)}>
        <Input
          ref={inputRef}
          data-sheet-editor
          data-st-topic-sheet-editor
          className="min-h-8 rounded-none border-primary shadow-none focus-visible:ring-1 focus-visible:ring-primary text-sm px-2"
          value={editDraft}
          onChange={(e) => stTopicSheetSetEditDraft(e.target.value)}
          onKeyDown={(e) => {
            const { visibleRowIds, columnOrder } = strategicTopicKpiSheetNavRef;
            if (e.key === 'Escape') {
              e.preventDefault();
              committedRef.current = true;
              stTopicSheetCancelEdit();
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              void performCommit(async () => {
                const next = stTopicEnterMoveDown({ rowId, column }, visibleRowIds, columnOrder);
                if (next) {
                  stTopicSheetSetAnchor(next);
                  return;
                }
                const append = strategicTopicKpiInlineAppendRef.appendRowAndBeginEdit;
                if (append) await append();
              });
              return;
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              void performCommit(async () => {
                const next = stTopicTabMove(
                  { rowId, column },
                  visibleRowIds,
                  columnOrder,
                  e.shiftKey
                );
                if (next) {
                  stTopicSheetSetAnchor(next);
                  return;
                }
                if (!e.shiftKey) {
                  const append = strategicTopicKpiInlineAppendRef.appendRowAndBeginEdit;
                  if (append) await append();
                }
              });
            }
          }}
          onBlur={() => {
            if (committedRef.current) return;
            requestAnimationFrame(() => {
              const ae = document.activeElement;
              if (ae?.closest('[data-spreadsheet-formula-bar]')) return;
              if (ae === inputRef.current) return;
              void performCommit();
            });
          }}
        />
      </TableCell>
    );
  }

  return (
    <TableCell
      data-st-topic-sheet-cell
      className={cn(
        'cursor-cell outline-none transition-colors align-top',
        isFocused && 'ring-2 ring-primary ring-inset bg-primary/5',
        className
      )}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation();
        stTopicSheetSetAnchor({ rowId, column });
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        stTopicSheetBeginEdit({ rowId, column }, editorSeed);
      }}
    >
      <div className="min-h-[32px] px-1 py-1 flex items-start">{children}</div>
    </TableCell>
  );
});
