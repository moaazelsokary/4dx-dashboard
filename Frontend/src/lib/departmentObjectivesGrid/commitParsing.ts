import type { DepartmentObjective, StrategicDepartmentObjective } from '@/types/wig';
import type { DeptGridColumn } from './types';

export type CommitResult =
  | { ok: true; patch: Partial<DepartmentObjective & StrategicDepartmentObjective> }
  | { ok: false; error: string };

function normStrategicText(raw: string): string | null {
  const t = raw.trim();
  return t.length === 0 ? null : t;
}

export function parseInlineCommit(
  column: DeptGridColumn,
  raw: string,
  row: DepartmentObjective | StrategicDepartmentObjective,
  kpiMode: 'bau' | 'strategic'
): CommitResult {
  switch (column) {
    case 'activity':
      return kpiMode === 'strategic'
        ? { ok: true, patch: { activity: raw.trim() || null } }
        : { ok: true, patch: { activity: raw.trim() } };
    case 'responsible':
      return { ok: true, patch: { responsible_person: raw.trim() } };
    case 'mov':
      return { ok: true, patch: { mov: raw.trim() } };
    case 'definition':
      return { ok: true, patch: { definition: normStrategicText(raw) } };
    case 'measurement':
      return { ok: true, patch: { measurement_aspect: normStrategicText(raw) } };
    case 'admin_meeting':
      return { ok: true, patch: { meeting_notes: normStrategicText(raw) } };
    case 'admin_mee':
      return { ok: true, patch: { me_e: normStrategicText(raw) } };
    case 'admin_active':
      return { ok: true, patch: { active: normStrategicText(raw) } };
    case 'admin_notes':
      return { ok: true, patch: { notes: normStrategicText(raw) } };
    case 'target': {
      const t = raw.trim().replace(/,/g, '');
      const stripped = t.endsWith('%') ? t.slice(0, -1).trim() : t;
      const num = parseFloat(stripped);
      if (Number.isNaN(num)) {
        return { ok: false, error: 'Enter a valid number for Target.' };
      }
      const isPct = row.target_type === 'percentage' || t.endsWith('%');
      return {
        ok: true,
        patch: {
          activity_target: num,
          ...(isPct ? { target_type: 'percentage' as const } : {}),
        },
      };
    }
    default:
      return { ok: false, error: 'Unknown column.' };
  }
}

/** Value shown in the editor (not necessarily equal to display formatting). */
export function getInlineEditorSeed(
  column: DeptGridColumn,
  row: DepartmentObjective | StrategicDepartmentObjective
): string {
  switch (column) {
    case 'activity':
      return row.activity ?? '';
    case 'responsible':
      return row.responsible_person ?? '';
    case 'mov':
      return row.mov ?? '';
    case 'definition':
      return (row as StrategicDepartmentObjective).definition ?? '';
    case 'measurement':
      return (row as StrategicDepartmentObjective).measurement_aspect ?? '';
    case 'admin_meeting':
      return (row as StrategicDepartmentObjective).meeting_notes ?? '';
    case 'admin_mee':
      return (row as StrategicDepartmentObjective).me_e ?? '';
    case 'admin_active':
      return (row as StrategicDepartmentObjective).active ?? '';
    case 'admin_notes':
      return (row as StrategicDepartmentObjective).notes ?? '';
    case 'target':
      if (row.target_type === 'percentage') {
        return `${row.activity_target}`;
      }
      return `${row.activity_target}`;
    default:
      return '';
  }
}
