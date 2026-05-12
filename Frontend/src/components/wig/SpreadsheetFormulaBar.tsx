import React, { useSyncExternalStore } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DeptGridColumn } from '@/lib/departmentObjectivesGrid/types';
import {
  getDeptObjectiveSheetState,
  sheetCancelEdit,
  sheetSetEditDraft,
  subscribeDeptObjectiveSheet,
} from '@/lib/departmentObjectivesGrid/store';
import { departmentObjectivesSheetNavRef } from '@/lib/departmentObjectivesGrid/navRef';
import { useDeptObjectiveSpreadsheet } from '@/components/wig/DeptObjectiveSpreadsheetContext';
import type { StTopicGridColumn } from '@/lib/strategicTopicKpiGrid/types';
import {
  getStTopicSheetState,
  stTopicSheetCancelEdit,
  stTopicSheetSetEditDraft,
  subscribeStTopicSheet,
} from '@/lib/strategicTopicKpiGrid/store';
import { strategicTopicKpiSheetNavRef } from '@/lib/strategicTopicKpiGrid/navRef';
import { useStrategicTopicKpiSpreadsheet } from '@/components/wig/StrategicTopicKpiSpreadsheetContext';

const DEPT_COLUMN_LABELS = {
  activity: 'Activity',
  target: 'Target',
  responsible: 'Responsible',
  mov: 'MOV',
  definition: 'Definition',
  measurement: 'Measurement',
  admin_meeting: 'Meeting notes',
  admin_mee: 'M&E',
  admin_active: 'Active',
  admin_notes: 'Notes',
} as const satisfies Record<DeptGridColumn, string>;

const ST_TOPIC_COLUMN_LABELS = {
  objective: 'Objectives',
  activity: 'Activity / Task',
  duration: 'Duration',
  start: 'Start',
  end: 'End',
  status: 'Status',
  notes: 'Notes',
} as const satisfies Record<StTopicGridColumn, string>;

/**
 * Excel-like formula bar for plain text only (no formula engine).
 * Synced with inline grid editors via the department objectives sheet store.
 */
export function DeptObjectiveFormulaBar({ className }: { className?: string }) {
  const sheet = useDeptObjectiveSpreadsheet();

  const editing = useSyncExternalStore(
    subscribeDeptObjectiveSheet,
    () => getDeptObjectiveSheetState().editing,
    () => null
  );

  const draft = useSyncExternalStore(
    subscribeDeptObjectiveSheet,
    () => getDeptObjectiveSheetState().editDraft,
    () => ''
  );

  if (!editing) return null;

  const ri = departmentObjectivesSheetNavRef.visibleRowIds.indexOf(editing.rowId);
  const rowHint = ri >= 0 ? `#${ri + 1}` : `Row id ${editing.rowId}`;
  const colLabel = DEPT_COLUMN_LABELS[editing.column];

  return (
    <div
      className={cn(
        'flex items-start gap-2 border-b bg-muted/40 px-2 py-2 rounded-t-md',
        className
      )}
      data-spreadsheet-formula-bar
    >
      <span
        className="font-serif italic text-muted-foreground select-none pt-2 shrink-0 w-6 text-center text-sm"
        aria-hidden
      >
        fx
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="text-xs text-muted-foreground truncate" aria-live="polite">
          {rowHint} · {colLabel}
        </div>
        <Textarea
          value={draft}
          onChange={(e) => sheetSetEditDraft(e.target.value)}
          className="min-h-[4.5rem] resize-y font-mono text-sm leading-snug"
          aria-label="Edit cell value"
          spellCheck
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              sheetCancelEdit();
              return;
            }
            if (e.key === 'Enter') {
              if (e.shiftKey) {
                e.preventDefault();
                const el = e.currentTarget;
                const start = el.selectionStart ?? draft.length;
                const end = el.selectionEnd ?? draft.length;
                const next = draft.slice(0, start) + '\n' + draft.slice(end);
                sheetSetEditDraft(next);
                const pos = start + 1;
                queueMicrotask(() => {
                  try {
                    el.setSelectionRange(pos, pos);
                  } catch {
                    /* ignore */
                  }
                });
                return;
              }
              e.preventDefault();
              void sheet.commitActiveEditor();
              return;
            }
          }}
          onBlur={() => {
            requestAnimationFrame(() => {
              const ae = document.activeElement;
              if (ae?.closest('[data-sheet-editor]')) return;
              void sheet.commitActiveEditor();
            });
          }}
        />
        <p className="text-[10px] text-muted-foreground">
          Plain text only · Enter to save · Shift+Enter new line · Escape to cancel
        </p>
      </div>
    </div>
  );
}

/**
 * Formula bar for strategic topic KPI table editing (same behavior as department objectives).
 */
export function StrategicTopicKpiFormulaBar({ className }: { className?: string }) {
  const sheet = useStrategicTopicKpiSpreadsheet();

  const editing = useSyncExternalStore(
    subscribeStTopicSheet,
    () => getStTopicSheetState().editing,
    () => null
  );

  const draft = useSyncExternalStore(
    subscribeStTopicSheet,
    () => getStTopicSheetState().editDraft,
    () => ''
  );

  if (!editing) return null;

  const ri = strategicTopicKpiSheetNavRef.visibleRowIds.indexOf(editing.rowId);
  const rowHint = ri >= 0 ? `#${ri + 1}` : `Row id ${editing.rowId}`;
  const colLabel = ST_TOPIC_COLUMN_LABELS[editing.column];

  return (
    <div
      className={cn(
        'flex items-start gap-2 border-b bg-muted/40 px-2 py-2 rounded-t-md',
        className
      )}
      data-spreadsheet-formula-bar
    >
      <span
        className="font-serif italic text-muted-foreground select-none pt-2 shrink-0 w-6 text-center text-sm"
        aria-hidden
      >
        fx
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="text-xs text-muted-foreground truncate" aria-live="polite">
          {rowHint} · {colLabel}
        </div>
        <Textarea
          value={draft}
          onChange={(e) => stTopicSheetSetEditDraft(e.target.value)}
          className="min-h-[4.5rem] resize-y font-mono text-sm leading-snug"
          aria-label="Edit cell value"
          spellCheck
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              stTopicSheetCancelEdit();
              return;
            }
            if (e.key === 'Enter') {
              if (e.shiftKey) {
                e.preventDefault();
                const el = e.currentTarget;
                const start = el.selectionStart ?? draft.length;
                const end = el.selectionEnd ?? draft.length;
                const next = draft.slice(0, start) + '\n' + draft.slice(end);
                stTopicSheetSetEditDraft(next);
                const pos = start + 1;
                queueMicrotask(() => {
                  try {
                    el.setSelectionRange(pos, pos);
                  } catch {
                    /* ignore */
                  }
                });
                return;
              }
              e.preventDefault();
              void sheet.commitActiveEditor();
              return;
            }
          }}
          onBlur={() => {
            requestAnimationFrame(() => {
              const ae = document.activeElement;
              if (ae?.closest('[data-sheet-editor]') || ae?.closest('[data-st-topic-sheet-editor]'))
                return;
              void sheet.commitActiveEditor();
            });
          }}
        />
        <p className="text-[10px] text-muted-foreground">
          Plain text only · Enter to save · Shift+Enter new line · Escape to cancel
        </p>
      </div>
    </div>
  );
}
