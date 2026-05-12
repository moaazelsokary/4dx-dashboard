import React, { memo, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DeptGridColumn } from '@/lib/departmentObjectivesGrid/types';
import {
  sheetBeginEdit,
  sheetCancelEdit,
  sheetSetAnchor,
  sheetSetEditDraft,
  subscribeDeptObjectiveSheet,
  getDeptObjectiveSheetState,
} from '@/lib/departmentObjectivesGrid/store';
import { departmentObjectivesSheetNavRef } from '@/lib/departmentObjectivesGrid/navRef';
import { tabMove, enterMoveDown } from '@/lib/departmentObjectivesGrid/sheetNavigation';
import { useDeptObjectiveSpreadsheetOptional } from '@/components/wig/DeptObjectiveSpreadsheetContext';

export type DeptObjectiveSheetCellProps = {
  rowId: number;
  column: DeptGridColumn;
  editorSeed: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
};

/** Narrow subscriptions: each cell only re-renders when its focused/editing flags change. */
function useCellFocused(rowId: number, column: DeptGridColumn): boolean {
  return useSyncExternalStore(
    subscribeDeptObjectiveSheet,
    () => {
      const s = getDeptObjectiveSheetState();
      return !!(s.anchor?.rowId === rowId && s.anchor?.column === column && !s.editing);
    },
    () => false
  );
}

function useCellEditing(rowId: number, column: DeptGridColumn): boolean {
  return useSyncExternalStore(
    subscribeDeptObjectiveSheet,
    () => {
      const s = getDeptObjectiveSheetState();
      return !!(s.editing?.rowId === rowId && s.editing?.column === column);
    },
    () => false
  );
}

function useDeptEditDraft(rowId: number, column: DeptGridColumn): string {
  return useSyncExternalStore(
    subscribeDeptObjectiveSheet,
    () => {
      const s = getDeptObjectiveSheetState();
      if (s.editing?.rowId === rowId && s.editing?.column === column) return s.editDraft;
      return '';
    },
    () => ''
  );
}

/**
 * Inline-edit shell: single-click select, double-click to edit.
 * Uses external store + nav ref so anchor moves don't re-render the whole table.
 */
const DeptObjectiveSheetCellInner = memo(function DeptObjectiveSheetCellInner({
  rowId,
  column,
  editorSeed,
  children,
  className,
  style,
  disabled,
}: DeptObjectiveSheetCellProps) {
  const sheet = useDeptObjectiveSpreadsheetOptional();
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  const isFocused = useCellFocused(rowId, column);
  const isEditing = useCellEditing(rowId, column);
  const editDraft = useDeptEditDraft(rowId, column);

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

  const onPointerDownCapture = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  if (!sheet || disabled) {
    return (
      <TableCell className={className} style={style}>
        {children}
      </TableCell>
    );
  }

  if (isEditing) {
    return (
      <TableCell
        data-sheet-cell
        className={cn('p-0 align-middle', className)}
        style={style}
        onPointerDownCapture={onPointerDownCapture}
      >
        <Input
          ref={inputRef}
          data-sheet-editor
          className="h-8 rounded-none border-primary shadow-none focus-visible:ring-1 focus-visible:ring-primary text-sm px-2"
          value={editDraft}
          onChange={(e) => sheetSetEditDraft(e.target.value)}
          onKeyDown={(e) => {
            const { visibleRowIds, columnOrder } = departmentObjectivesSheetNavRef;
            if (e.key === 'Escape') {
              e.preventDefault();
              committedRef.current = true;
              sheetCancelEdit();
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              void performCommit(() => {
                const next = enterMoveDown({ rowId, column }, visibleRowIds, columnOrder);
                if (next) sheetSetAnchor(next);
              });
              return;
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              void performCommit(() => {
                const next = tabMove(
                  { rowId, column },
                  visibleRowIds,
                  columnOrder,
                  e.shiftKey
                );
                if (next) sheetSetAnchor(next);
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
      data-sheet-cell
      className={cn(
        'cursor-cell outline-none transition-colors',
        isFocused && 'ring-2 ring-primary ring-inset bg-primary/5',
        className
      )}
      style={style}
      tabIndex={-1}
      onPointerDownCapture={onPointerDownCapture}
      onClick={(e) => {
        e.stopPropagation();
        sheetSetAnchor({ rowId, column });
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        sheetBeginEdit({ rowId, column }, editorSeed);
      }}
    >
      <div className="min-h-[32px] px-2 py-1.5 flex items-center">{children}</div>
    </TableCell>
  );
});

export const DeptObjectiveSheetCell = DeptObjectiveSheetCellInner;
