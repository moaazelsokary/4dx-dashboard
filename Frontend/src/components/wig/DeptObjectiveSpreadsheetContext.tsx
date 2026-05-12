import React, { createContext, useContext, useMemo, useRef } from 'react';
import type { DeptGridColumn } from '@/lib/departmentObjectivesGrid/types';
import {
  getDeptObjectiveSheetState,
  sheetFinishEdit,
} from '@/lib/departmentObjectivesGrid/store';

export type DeptObjectiveSpreadsheetApi = {
  commitInline: (rowId: number, column: DeptGridColumn, raw: string) => Promise<boolean>;
  /** Commit current edit using store draft (cell + formula bar). Returns whether commit succeeded. */
  commitActiveEditor: (after?: () => void | Promise<void>) => Promise<boolean>;
};

const Ctx = createContext<DeptObjectiveSpreadsheetApi | null>(null);

export function DeptObjectiveSpreadsheetProvider({
  children,
  commitInline,
}: {
  children: React.ReactNode;
  commitInline: (rowId: number, column: DeptGridColumn, raw: string) => Promise<boolean>;
}) {
  const commitRef = useRef(commitInline);
  commitRef.current = commitInline;

  const value = useMemo<DeptObjectiveSpreadsheetApi>(
    () => ({
      commitInline: (rowId, column, raw) => commitRef.current(rowId, column, raw),
      commitActiveEditor: async (after) => {
        const s = getDeptObjectiveSheetState();
        if (!s.editing) return false;
        const raw = s.editDraft;
        const ok = await commitRef.current(s.editing.rowId, s.editing.column, raw);
        sheetFinishEdit();
        if (ok && after) await Promise.resolve(after());
        return ok;
      },
    }),
    []
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeptObjectiveSpreadsheet(): DeptObjectiveSpreadsheetApi {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useDeptObjectiveSpreadsheet must be used inside DeptObjectiveSpreadsheetProvider');
  }
  return v;
}

/** Optional consumer when provider may be absent */
export function useDeptObjectiveSpreadsheetOptional(): DeptObjectiveSpreadsheetApi | null {
  return useContext(Ctx);
}
