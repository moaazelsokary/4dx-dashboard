import { parseISO, startOfDay } from 'date-fns';
import type { CmMealUserKpiItem, CmMealUserKpiRow } from '@/types/wig';

export type UserKpiBarState = 'done' | 'overdue' | 'in_progress' | 'scheduled';

export function parseKpiDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try {
    const d = parseISO(String(s).slice(0, 10));
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  } catch {
    return null;
  }
}

export function deriveUserKpiBarState(row: CmMealUserKpiRow, item?: CmMealUserKpiItem): UserKpiBarState | 'unscheduled' {
  const sd = parseKpiDate(row.start_date);
  const ed = parseKpiDate(row.end_date);
  if (!sd || !ed || ed < sd) return 'unscheduled';
  const actual = item?.actual ?? row.actual;
  if (actual != null) return 'done';
  const today = startOfDay(new Date());
  if (ed < today) return 'overdue';
  if (today >= sd && today <= ed) return 'in_progress';
  return 'scheduled';
}

export function rowLaneLabel(row: CmMealUserKpiRow, showEmployee: boolean, item?: CmMealUserKpiItem): string {
  const kpi = (item?.kpi || row.kpi || '').trim() || 'Untitled KPI';
  if (showEmployee && row.username) return `${row.username} · ${kpi}`;
  return kpi;
}

export function userKpiBarStateLabel(state: UserKpiBarState | 'unscheduled'): string {
  switch (state) {
    case 'done':
      return 'Done';
    case 'overdue':
      return 'Overdue';
    case 'in_progress':
      return 'In progress';
    case 'scheduled':
      return 'Scheduled';
    default:
      return 'Unscheduled';
  }
}

export function employeeKpiLaneKey(row: CmMealUserKpiRow, item?: CmMealUserKpiItem): string {
  const kpi = (item?.kpi || row.kpi || '').trim() || 'Untitled KPI';
  return `${row.user_id}|${kpi}`;
}

export function rowSortKey(r: CmMealUserKpiRow): number {
  const so = r.sort_order;
  return so != null && Number.isFinite(so) ? so : 1_000_000 + r.id;
}

export function barStateClassName(state: UserKpiBarState, reduceMotion: boolean): string {
  switch (state) {
    case 'done':
      return 'bg-emerald-500/20 border-emerald-600/50 text-emerald-950 dark:text-emerald-100';
    case 'overdue':
      return 'bg-red-500/25 border-red-600/70 text-red-950 dark:bg-red-950/35 dark:text-red-50';
    case 'in_progress':
      return 'bg-gradient-to-r from-primary/50 to-primary/25 border-primary/50 text-foreground';
    case 'scheduled':
      return 'border-dashed border-muted-foreground/50 bg-muted/30 text-muted-foreground';
    default:
      return reduceMotion ? '' : '';
  }
}
