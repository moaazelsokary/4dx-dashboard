import type { User } from '@/services/authService';
import {
  CM_MEAL_PROJECT_CODES,
  type CmMealProjectCode,
  isCmMealProjectCode,
  parseCmMealProjectsPipe,
  ROLE_CM_MEAL_PROJECT,
} from '@/config/cmMealProjects';
import { isMealRole } from '@/config/mealAccess';

export const CM_MEAL_KPIS_PATH = '/cm-meal-kpis';

export function isCmMealProjectRole(role: string | undefined | null): boolean {
  return String(role ?? '').trim().toLowerCase() === ROLE_CM_MEAL_PROJECT;
}

export function userCmMealProjectCodes(user: User | null | undefined): CmMealProjectCode[] {
  if (!user) return [];
  const raw = user.cm_meal_projects ?? user.cmMealProjects;
  return parseCmMealProjectsPipe(raw ?? null);
}

export function canAccessCmMealKpis(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isMealRole(user.role) || isCmMealProjectRole(user.role)) return true;
  const routes = user.allowedRoutes;
  if (routes != null && Array.isArray(routes)) {
    return routes.some((p) => {
      const base = String(p).split('?')[0];
      return base === CM_MEAL_KPIS_PATH;
    });
  }
  return false;
}

export function canManageAllCmMealProjects(user: User | null | undefined): boolean {
  if (!user) return false;
  return isMealRole(user.role);
}

export function allowedCmMealProjectsForUser(user: User | null | undefined): CmMealProjectCode[] {
  if (!user) return [];
  if (canManageAllCmMealProjects(user)) return [...CM_MEAL_PROJECT_CODES];
  if (isCmMealProjectRole(user.role)) return userCmMealProjectCodes(user);
  return [];
}

export function canWriteCmMealKpi(user: User | null | undefined, projectCode: string): boolean {
  if (!user) return false;
  if (canManageAllCmMealProjects(user)) return isCmMealProjectCode(projectCode);
  if (isCmMealProjectRole(user.role)) {
    return userCmMealProjectCodes(user).includes(projectCode as CmMealProjectCode);
  }
  return false;
}

export function defaultCmMealProjectForUser(user: User | null | undefined): CmMealProjectCode | null {
  const allowed = allowedCmMealProjectsForUser(user);
  return allowed.length === 1 ? allowed[0] : allowed[0] ?? null;
}
