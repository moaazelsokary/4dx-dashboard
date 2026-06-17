import type { CmMealUserRoleRow } from '@/types/wig';

/** Unique responsibilities from Roles & Responsibilities rows for one employee. */
export function responsibilitiesForUser(roleRows: CmMealUserRoleRow[], userId: number): string[] {
  const set = new Set<string>();
  for (const row of roleRows) {
    if (row.user_id !== userId) continue;
    const text = row.responsibilities?.trim();
    if (text) set.add(text);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Options for KPI form — includes current value when editing legacy rows. */
export function responsibilityOptionsForUser(
  roleRows: CmMealUserRoleRow[],
  userId: number,
  currentValue?: string
): string[] {
  const options = responsibilitiesForUser(roleRows, userId);
  const current = currentValue?.trim();
  if (current && !options.includes(current)) {
    return [current, ...options];
  }
  return options;
}
