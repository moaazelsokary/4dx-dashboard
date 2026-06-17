import type { User } from '@/services/authService';
import { CM_MEAL_KPIS_PATH, isCmMealProjectRole } from '@/config/cmMealAccess';
import { isMealRole } from '@/config/mealAccess';

export const ROLE_CM_MEAL_EMPLOYEE = 'cm-meal-employee';
export const ROLE_CM_MEAL_MANAGER = 'cm-meal-manager';

/** Default landing URL for cm-meal-employee / cm-meal-manager after sign-in. */
export const CM_MEAL_USER_KPI_DEFAULT_ROUTE = '/cm-meal-kpis?tab=users&view=roles';

/** @deprecated Use CM_MEAL_USER_KPI_DEFAULT_ROUTE */
export const CM_MEAL_EMPLOYEE_DEFAULT_ROUTE = CM_MEAL_USER_KPI_DEFAULT_ROUTE;

export function isCmMealEmployeeRole(role: string | null | undefined): boolean {
  return String(role ?? '').trim().toLowerCase() === ROLE_CM_MEAL_EMPLOYEE;
}

export function isCmMealManagerRole(role: string | null | undefined): boolean {
  return String(role ?? '').trim().toLowerCase() === ROLE_CM_MEAL_MANAGER;
}

export function userIdFromUser(user: User | null | undefined): number | null {
  const id = user?.userId ?? (user as { id?: number } | null)?.id;
  const n = parseInt(String(id ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function canAccessCmMealUserKpis(user: User | null | undefined): boolean {
  if (!user) return false;
  if (
    isCmMealProjectRole(user.role) &&
    !isMealRole(user.role) &&
    !isCmMealEmployeeRole(user.role) &&
    !isCmMealManagerRole(user.role)
  ) {
    return false;
  }
  if (isMealRole(user.role)) return true;
  if (isCmMealEmployeeRole(user.role) || isCmMealManagerRole(user.role)) return true;
  const routes = user.allowedRoutes;
  if (routes != null && Array.isArray(routes)) {
    return routes.some((p) => String(p).split('?')[0] === CM_MEAL_KPIS_PATH);
  }
  return false;
}

export function canWriteCmMealUserKpiForTarget(
  user: User | null | undefined,
  targetUserId: number,
  teamUserIds: number[]
): boolean {
  if (!user) return false;
  if (isMealRole(user.role)) return true;
  const selfId = userIdFromUser(user);
  if (!selfId) return false;
  if (isCmMealEmployeeRole(user.role)) return targetUserId === selfId;
  if (isCmMealManagerRole(user.role)) {
    return targetUserId === selfId || teamUserIds.includes(targetUserId);
  }
  return false;
}

export function showEmployeeScopeFilter(user: User | null | undefined): boolean {
  if (!user) return false;
  return isMealRole(user.role) || isCmMealManagerRole(user.role);
}
