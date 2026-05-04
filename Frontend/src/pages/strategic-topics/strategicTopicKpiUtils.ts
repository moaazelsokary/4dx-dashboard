import type { StrategicTopicCode, StrategicTopicKpiRow, StrategicTopicKpiStatus } from '@/types/wig';
import type { User } from '@/services/authService';

export const STRATEGIC_TOPIC_CODES: StrategicTopicCode[] = [
  'volunteers',
  'refugees',
  'returnees',
  'relief',
  'awareness',
];

export const STRATEGIC_TOPIC_LABELS: Record<StrategicTopicCode, string> = {
  volunteers: 'Volunteers',
  refugees: 'Refugees',
  returnees: 'Returnees',
  relief: 'Relief',
  awareness: 'Awareness',
};

export const STRATEGIC_TOPIC_STATUSES: StrategicTopicKpiStatus[] = ['Completed', 'In Progress', 'On Hold'];

const DELIM = '||';

export function parsePipeList(value: string | null | undefined): string[] {
  if (value == null || String(value).trim() === '') return [];
  return String(value)
    .split(DELIM)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toPipeList(items: string[]): string {
  return items.map((s) => s.trim()).filter(Boolean).join(DELIM);
}

export function userDepartmentCodes(user: User | null): string[] {
  if (!user?.departments?.length) return [];
  return user.departments.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
}

export function isCeoOrAdmin(user: User | null): boolean {
  const r = user?.role || '';
  return r === 'CEO' || r === 'Admin';
}

export function canEditStrategicTopicRow(user: User | null, row: StrategicTopicKpiRow): boolean {
  if (!user) return false;
  if (isCeoOrAdmin(user)) return true;
  if (user.role !== 'department') return false;
  const rowCodes = parsePipeList(row.associated_departments).map((c) => c.toLowerCase());
  const mine = userDepartmentCodes(user);
  return mine.some((c) => rowCodes.includes(c));
}

export function canDeleteStrategicTopicRow(user: User | null): boolean {
  return isCeoOrAdmin(user);
}

export function canCreateStrategicTopicRow(user: User | null): boolean {
  if (!user) return false;
  if (isCeoOrAdmin(user)) return true;
  return user.role === 'department' && userDepartmentCodes(user).length > 0;
}
