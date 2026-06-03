/**
 * App role helpers — keep in sync with netlify/functions/utils/user-roles.cjs
 */

/** Stored in users.role — department + strategic topic editor. */
export const ROLE_DEPARTMENT_TOPIC = 'department-topic' as const;

export const ROLE_DEPARTMENT_TOPIC_LABEL = 'Department & Topic';

export function normalizeUserRole(role: string | null | undefined): string {
  return String(role ?? '').trim().toLowerCase();
}

export function isTopicRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === 'topic';
}

export function isDepartmentRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === 'department';
}

export function isDepartmentTopicRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === ROLE_DEPARTMENT_TOPIC;
}

/** May edit strategic topic KPIs for assigned pillars (topic or department-topic). */
export function isTopicLikeRole(role: string | null | undefined): boolean {
  const r = normalizeUserRole(role);
  return r === 'topic' || r === ROLE_DEPARTMENT_TOPIC;
}

/** Has a department assignment for BAU / department objectives (department or department-topic). */
export function isDepartmentLikeRole(role: string | null | undefined): boolean {
  const r = normalizeUserRole(role);
  return r === 'department' || r === ROLE_DEPARTMENT_TOPIC;
}

export function roleRequiresEditableTopics(role: string | null | undefined): boolean {
  return isTopicLikeRole(role);
}

export function roleRequiresDepartment(role: string | null | undefined): boolean {
  return isDepartmentLikeRole(role);
}
