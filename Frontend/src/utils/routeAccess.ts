import type { User } from '@/services/authService';
import { hasPowerBINavigationAccess } from '@/config/powerbi';
import { isCaseWorkerRole, REFUGEES_CASE_STORY_PATH } from '@/config/refugeesBeneficiaries';
import { isMealRole, MEAL_PATH } from '@/config/mealAccess';
import { CM_MEAL_KPIS_PATH, isCmMealProjectRole } from '@/config/cmMealAccess';
import {
  isCmMealEmployeeRole,
  isCmMealManagerRole,
} from '@/config/cmMealUserKpiAccess';
import { STRATEGIC_TOPIC_PATHS } from '@/config/strategicTopics';
import { isDepartmentLikeRole, isTopicLikeRole } from '@/config/userRoles';

/** Paths that never require the route-override check (handled separately). */
export const PUBLIC_PATHS = new Set(['/', '/privacy-policy', '/terms-of-service']);

/**
 * Routes a user may access under inherited (role + department) rules — mirrors SidebarNav visibility.
 */
export function getInheritedRoutesForUser(user: User): Set<string> {
  const paths = new Set<string>();
  paths.add('/settings');

  if (isCaseWorkerRole(user.role)) {
    paths.add(REFUGEES_CASE_STORY_PATH);
    paths.add('/access-denied');
    return paths;
  }

  paths.add('/dashboard');

  const role = user.role;
  const depts = user.departments || [];
  const isCEO = role === 'CEO';
  const isAdmin = role === 'Admin';
  const isDeptLike = isDepartmentLikeRole(role);
  const isTopicLike = isTopicLikeRole(role);
  const isOps = isDeptLike && depts.includes('operations');

  if (isCEO || isDeptLike || isTopicLike) {
    paths.add('/main-plan');
    for (const p of STRATEGIC_TOPIC_PATHS) paths.add(p);
    paths.add(REFUGEES_CASE_STORY_PATH);
  }
  if (isCEO || isDeptLike) {
    paths.add('/wig-plan-2025');
  }
  if (isCEO || isAdmin || isDeptLike) {
    paths.add('/department-objectives');
  }
  if (isCEO || isOps || role === 'project') {
    paths.add('/summary');
    paths.add('/project-details');
  }
  if (hasPowerBINavigationAccess(user)) {
    paths.add('/powerbi');
  }
  if (isCEO || isAdmin) {
    paths.add('/admin/configuration');
    paths.add('/pms-odoo-metrics');
    paths.add('/test');
  }

  if (isCEO || isAdmin || isMealRole(role)) {
    paths.add(MEAL_PATH);
    paths.add(CM_MEAL_KPIS_PATH);
  }
  if (isCmMealProjectRole(role)) {
    paths.add(CM_MEAL_KPIS_PATH);
  }
  if (isCmMealEmployeeRole(role) || isCmMealManagerRole(role)) {
    paths.add(CM_MEAL_KPIS_PATH);
  }

  paths.add('/access-denied');
  return paths;
}

/**
 * Whether the signed-in user may open this pathname (no query string).
 */
export function canAccessAppPath(pathname: string, user: User): boolean {
  const path = pathname.split('?')[0] || '/';
  if (PUBLIC_PATHS.has(path)) {
    return true;
  }
  /** Always allow landing on access-denied (e.g. after failed route check). */
  if (path === '/access-denied') {
    return true;
  }

  /** Power BI: allow when user has ≥1 dashboard (override or inherit), even if allowedRoutes omits /powerbi. */
  if (path === '/powerbi' && hasPowerBINavigationAccess(user)) {
    return true;
  }

  const override = user.allowedRoutes;
  if (override != null && Array.isArray(override)) {
    return override.includes(path);
  }

  return getInheritedRoutesForUser(user).has(path);
}
