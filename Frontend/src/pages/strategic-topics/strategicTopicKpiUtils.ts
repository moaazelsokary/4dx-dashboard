import type { Department, StrategicTopicKpiRow, StrategicTopicKpiStatus } from '@/types/wig';
import type { User } from '@/services/authService';
import {
  STRATEGIC_TOPIC_CODES,
  STRATEGIC_TOPIC_LABELS,
  type StrategicTopicCode,
  isStrategicTopicCode,
} from '@/config/strategicTopics';
import { isDepartmentLikeRole, isDepartmentTopicRole, isDepartmentRole, isTopicLikeRole } from '@/config/userRoles';

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

/** Only Admin may change end_date on existing strategic topic KPI rows. */
export function canEditStrategicTopicEndDate(user: User | null): boolean {
  return user?.role === 'Admin';
}

/** Topic / department-topic role: pillars this user may edit (`||`-delimited in DB / JWT). */
export function topicRoleEditableCodes(user: User | null): StrategicTopicCode[] {
  if (!user || !isTopicLikeRole(user.role)) return [];
  const u = user as User & { editable_strategic_topic?: string | null };
  const raw = user.editableStrategicTopic ?? u.editable_strategic_topic;
  return parsePipeList(raw)
    .map((c) => c.toLowerCase())
    .filter((c): c is StrategicTopicCode => isStrategicTopicCode(c));
}

/** First editable topic (e.g. default landing). */
export function topicRoleEditableCode(user: User | null): StrategicTopicCode | null {
  const codes = topicRoleEditableCodes(user);
  return codes[0] ?? null;
}

export function topicRoleCanEditTopic(user: User | null, topic: StrategicTopicCode): boolean {
  if (!user) return false;
  if (isCeoOrAdmin(user)) return true;
  if (!isTopicLikeRole(user.role)) return false;
  return topicRoleEditableCodes(user).includes(topic);
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
  if (isTopicLikeRole(user.role)) {
    const rt = rowStrategicTopicLower(row);
    const editTopics = topicRoleEditableCodes(user);
    if (rt && editTopics.includes(rt as StrategicTopicCode)) return true;
    if (pageTopic && editTopics.includes(pageTopic) && !rt) return true;
    if (isDepartmentTopicRole(user.role)) {
      const rowCodes = parsePipeList(row.associated_departments).map((c) => c.toLowerCase());
      const mine = userDepartmentCodes(user);
      if (mine.some((c) => rowCodes.includes(c))) return true;
    }
    return false;
  }
  if (!isDepartmentRole(user.role)) return false;
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
  if (isTopicLikeRole(user.role)) {
    return topicRoleCanEditTopic(user, pageTopic);
  }
  return isDepartmentRole(user.role) && userDepartmentCodes(user).length > 0;
}

/** Upload, replace, or delete files in the topic Content Folder (CEO/Admin or topic lead for this pillar). */
export function canManageStrategicTopicContent(user: User | null, pageTopic: StrategicTopicCode): boolean {
  if (!user) return false;
  if (isCeoOrAdmin(user)) return true;
  return topicRoleCanEditTopic(user, pageTopic);
}

const ME_PARENT_PREFIX = '[M&E-PARENT:';

export function isTopicMeKpiRow(row: StrategicTopicKpiRow): boolean {
  const rt = String(row.row_type ?? '').trim();
  if (rt === 'M&E' || rt === 'M&E MOV') return true;
  return String(row.activity ?? '').startsWith(ME_PARENT_PREFIX);
}

export function isTopicActivityKpiRow(row: StrategicTopicKpiRow): boolean {
  return !isTopicMeKpiRow(row);
}

/** Objective / KPI text for a strategic topic row (not the activity column). */
export function topicObjectiveDisplayText(row: StrategicTopicKpiRow): string {
  return (row.objective_text || row.main_objective || row.main_kpi || '').trim();
}

function topicObjectiveDedupeKey(row: StrategicTopicKpiRow): string {
  const text = topicObjectiveDisplayText(row).toLowerCase();
  const mainId = row.main_objective_id ?? 0;
  return `${mainId}::${text}`;
}

/** One pickable row per distinct topic objective (multiple activity rows may share an objective). */
export function uniqueTopicObjectiveRows(rows: StrategicTopicKpiRow[]): StrategicTopicKpiRow[] {
  const seen = new Set<string>();
  const out: StrategicTopicKpiRow[] = [];
  for (const row of rows.filter(isTopicActivityKpiRow)) {
    const label = topicObjectiveDisplayText(row);
    if (!label) continue;
    const key = topicObjectiveDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function topicMeKpisForParent(rows: StrategicTopicKpiRow[], parentId: number): StrategicTopicKpiRow[] {
  const prefix = `${ME_PARENT_PREFIX}${parentId}]`;
  return rows.filter(
    (r) => isTopicMeKpiRow(r) && String(r.activity ?? '').startsWith(prefix)
  );
}

export function topicMeKpiDisplayName(row: StrategicTopicKpiRow): string {
  const fromActivity = String(row.activity ?? '').replace(/^\[M&E-PARENT:\d+\]\s*/, '').trim();
  return (row.objective_text || fromActivity || row.activity || '—').trim();
}

/** Only CEO can add/edit/delete topic M&E KPIs (matches department objectives). */
export function canModifyTopicMeKpis(user: User | null): boolean {
  return user?.role === 'CEO';
}

/** Default department pipe tokens for an inline-created row (department users: own dept only). */
export function pickDefaultDeptCodesForNewRow(user: User | null, departments: Department[]): string[] {
  const sorted = [...departments]
    .map((d) => String(d.code || '').trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) return [];
  if (!user) return [sorted[0]];
  if (isDepartmentLikeRole(user.role)) {
    const mine = userDepartmentCodes(user);
    const hit = sorted.find((c) => mine.includes(c));
    return hit ? [hit] : [];
  }
  if (isTopicLikeRole(user.role)) {
    return sorted[0] ? [sorted[0]] : [];
  }
  return [sorted[0]];
}
