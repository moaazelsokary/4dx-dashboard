/**
 * Canonical app paths for per-user route overrides (must match server user-accounts-crud.cjs).
 */
export const APP_ROUTE_OPTIONS: { path: string; label: string }[] = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/wig-plan-2025', label: '2025 Plan' },
  { path: '/main-plan', label: 'Strategic Plan' },
  { path: '/main-plan/volunteers', label: 'Strategic Topics - Volunteers' },
  { path: '/main-plan/refugees', label: 'Strategic Topics - Refugees' },
  { path: '/main-plan/returnees', label: 'Strategic Topics - Returnees' },
  { path: '/main-plan/relief', label: 'Strategic Topics - Relief' },
  { path: '/main-plan/awareness', label: 'Strategic Topics - Awareness' },
  { path: '/department-objectives', label: 'Department objectives' },
  { path: '/test', label: 'Test connection' },
  { path: '/summary', label: 'Projects summary' },
  { path: '/project-details', label: 'Project details' },
  { path: '/powerbi', label: 'Power BI' },
  { path: '/settings', label: 'Settings' },
  { path: '/admin/configuration', label: 'Configuration' },
  { path: '/pms-odoo-metrics', label: 'PMS & Odoo metrics' },
  { path: '/access-denied', label: 'Access denied' },
];

export const APP_ROUTE_PATHS = APP_ROUTE_OPTIONS.map((o) => o.path);
