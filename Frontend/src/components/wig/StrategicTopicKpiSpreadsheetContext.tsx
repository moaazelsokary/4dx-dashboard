import React, { createContext, useContext, useMemo, useRef } from 'react';
import type { StTopicGridColumn } from '@/lib/strategicTopicKpiGrid/types';
import { getStTopicSheetState, stTopicSheetFinishEdit } from '@/lib/strategicTopicKpiGrid/store';

export type StrategicTopicKpiSpreadsheetApi = {
  commitInline: (rowId: number, column: StTopicGridColumn, raw: string) => Promise<boolean>;
  commitActiveEditor: (after?: () => void | Promise<void>) => Promise<boolean>;
};

const Ctx = createContext<StrategicTopicKpiSpreadsheetApi | null>(null);

export function StrategicTopicKpiSpreadsheetProvider({
  children,
  commitInline,
}: {
  children: React.ReactNode;
  commitInline: (rowId: number, column: StTopicGridColumn, raw: string) => Promise<boolean>;
}) {
  const commitRef = useRef(commitInline);
  commitRef.current = commitInline;

  const value = useMemo<StrategicTopicKpiSpreadsheetApi>(
    () => ({
      commitInline: (rowId, column, raw) => commitRef.current(rowId, column, raw),
      commitActiveEditor: async (after) => {
        const s = getStTopicSheetState();
        if (!s.editing) return false;
        const raw = s.editDraft;
        const ok = await commitRef.current(s.editing.rowId, s.editing.column, raw);
        stTopicSheetFinishEdit();
        if (ok && after) await Promise.resolve(after());
        return ok;
      },
    }),
    []
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStrategicTopicKpiSpreadsheet(): StrategicTopicKpiSpreadsheetApi {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      'useStrategicTopicKpiSpreadsheet must be used inside StrategicTopicKpiSpreadsheetProvider'
    );
  }
  return v;
}

export function useStrategicTopicKpiSpreadsheetOptional(): StrategicTopicKpiSpreadsheetApi | null {
  return useContext(Ctx);
}
