import type { Department, StrategicTopicKpiRow, StrategicTopicKpiStatus } from '@/types/wig';
import type { User } from '@/services/authService';
import {
  STRATEGIC_TOPIC_CODES,
  STRATEGIC_TOPIC_LABELS,
  type StrategicTopicCode,
  isStrategicTopicCode,
} from '@/config/strategicTopics';

export type { StrategicTopicCode };
export { STRATEGIC_TOPIC_CODES, STRATEGIC_TOPIC_LABELS, isStrategicTopicCode };

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

export function topicRoleEditableCode(user: User | null): StrategicTopicCode | null {
  if (!user || String(user.role || '').trim().toLowerCase() !== 'topic') return null;
  const u = user as User & { editable_strategic_topic?: string | null };
  const raw = user.editableStrategicTopic ?? u.editable_strategic_topic;
  const t = String(raw ?? '').trim().toLowerCase();
  return STRATEGIC_TOPIC_CODES.includes(t as StrategicTopicCode) ? (t as StrategicTopicCode) : null;
}

/** Row pillar from API (mssql may vary key casing). */
export function rowStrategicTopicLower(row: StrategicTopicKpiRow): string {
  const r = row as unknown as Record<string, unknown>;
  const v =
    r.strategic_topic ?? r.Strategic_Topic ?? r.strategicTopic ?? r.STRATEGIC_TOPIC ?? r.StrategicTopic;
  return String(v ?? '').trim().toLowerCase();
}

/**
 * @param pageTopic Current page pillar (e.g. refugees). Used when row.strategic_topic is missing on the client
 * but rows were loaded for that topic only.
 */
export function canEditStrategicTopicRow(
  user: User | null,
  row: StrategicTopicKpiRow,
  pageTopic?: StrategicTopicCode
): boolean {
  if (!user) return false;
  if (isCeoOrAdmin(user)) return true;
  const topicHome = topicRoleEditableCode(user);
  if (topicHome) {
    const rt = rowStrategicTopicLower(row);
    if (rt === topicHome) return true;
    if (pageTopic && topicHome === pageTopic && !rt) return true;
    return false;
  }
  if (user.role !== 'department') return false;
  const rowCodes = parsePipeList(row.associated_departments).map((c) => c.toLowerCase());
  const mine = userDepartmentCodes(user);
  return mine.some((c) => rowCodes.includes(c));
}

export function canDeleteStrategicTopicRow(user: User | null): boolean {
  return isCeoOrAdmin(user);
}

export function canCreateStrategicTopicRow(user: User | null, pageTopic: StrategicTopicCode): boolean {
  if (!user) return false;
  if (isCeoOrAdmin(user)) return true;
  const topicHome = topicRoleEditableCode(user);
  if (topicHome) return topicHome === pageTopic;
  return user.role === 'department' && userDepartmentCodes(user).length > 0;
}

/** Upload, replace, or delete files in the topic Content Folder (CEO/Admin or topic lead for this pillar). */
export function canManageStrategicTopicContent(user: User | null, pageTopic: StrategicTopicCode): boolean {
  if (!user) return false;
  if (isCeoOrAdmin(user)) return true;
  const topicHome = topicRoleEditableCode(user);
  return Boolean(topicHome && topicHome === pageTopic);
}

/** Default department pipe tokens for an inline-created row (department users: own dept only). */
export function pickDefaultDeptCodesForNewRow(user: User | null, departments: Department[]): string[] {
  const sorted = [...departments]
    .map((d) => String(d.code || '').trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) return [];
  if (!user) return [sorted[0]];
  if (user.role === 'department') {
    const mine = userDepartmentCodes(user);
    const hit = sorted.find((c) => mine.includes(c));
    return hit ? [hit] : [];
  }
  if (String(user.role || '').trim().toLowerCase() === 'topic') {
    return sorted[0] ? [sorted[0]] : [];
  }
  return [sorted[0]];
}
