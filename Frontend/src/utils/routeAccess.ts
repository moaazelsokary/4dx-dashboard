import type { User } from '@/services/authService';
import { hasPowerBINavigationAccess } from '@/config/powerbi';

/** Paths that never require the route-override check (handled separately). */
export const PUBLIC_PATHS = new Set(['/', '/privacy-policy', '/terms-of-service']);

/**
 * Routes a user may access under inherited (role + department) rules — mirrors SidebarNav visibility.
 */
export function getInheritedRoutesForUser(user: User): Set<string> {
  const paths = new Set<string>();
  paths.add('/dashboard');
  paths.add('/settings');

  const role = user.role;
  const depts = user.departments || [];
  const isCEO = role === 'CEO';
  const isAdmin = role === 'Admin';
  const isDept = role === 'department';
  const isOps = isDept && depts.includes('operations');

  if (isCEO || isDept) {
    paths.add('/main-plan');
    paths.add('/main-plan/volunteers');
    paths.add('/main-plan/refugees');
    paths.add('/main-plan/returnees');
    paths.add('/main-plan/relief');
    paths.add('/main-plan/awareness');
    paths.add('/wig-plan-2025');
  }
  if (isCEO || isAdmin || isDept) {
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
