// Power BI: access rules + helpers. Dashboard definitions (names, embed URLs) load from dbo.powerbi_dashboards via API and sync into routingCatalog.
import type { User } from '@/services/authService';
import { getEffectivePowerbiDashboardIds } from '@/services/authService';
import type { PowerbiDashboardRecord } from '@/types/config';

export interface DashboardConfig {
  id: string;
  name: string;
  embedUrl: string;
  title: string;
  accessType: 'all' | 'exclude' | 'include';
  departments?: string[];
  roles?: string[];
}

/** Optional per-id rules for legacy dashboards; new DB rows default to accessType "all". */
const LEGACY_ACCESS: Record<string, Pick<DashboardConfig, 'accessType' | 'departments'>> = {
  volunteers: { accessType: 'exclude', departments: ['hr', 'security'] },
  humanitarian_aid: { accessType: 'include', departments: ['case', 'operations'] },
  sawa: { accessType: 'include', departments: ['case', 'operations'] },
  frontex: { accessType: 'include', departments: ['case'] },
};

/**
 * Merge API rows with legacy access rules.
 */
export function mergePowerbiCatalogRows(rows: PowerbiDashboardRecord[]): DashboardConfig[] {
  return rows.map((row) => {
    const legacy = LEGACY_ACCESS[row.id];
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      embedUrl: (row.embed_url && String(row.embed_url).trim()) || '',
      accessType: legacy?.accessType ?? 'all',
      departments: legacy?.departments,
    };
  });
}

/** Dashboard catalog is sourced from GET /powerbi-dashboards only. */
export const POWERBI_CONFIG = {
  dashboards: [] as DashboardConfig[],
};

/** Updated by GuardedRoute when the catalog API returns — drives route access + labels. */
let routingCatalog: DashboardConfig[] = POWERBI_CONFIG.dashboards;

export function setPowerbiRoutingCatalogFromRecords(rows: PowerbiDashboardRecord[]) {
  routingCatalog = mergePowerbiCatalogRows(rows);
}

export function getPowerbiRoutingCatalog(): DashboardConfig[] {
  return routingCatalog;
}

export function getDashboardFromCatalog(catalog: DashboardConfig[], id: string): DashboardConfig | undefined {
  return catalog.find((d) => d.id === id);
}

export const getDashboardById = (id: string) => {
  return getPowerbiRoutingCatalog().find((dashboard) => dashboard.id === id);
};

export const getAllDashboardNames = () => {
  return getPowerbiRoutingCatalog().map((dashboard) => dashboard.name);
};

export const canAccessDashboard = (
  dashboard: DashboardConfig,
  userRole: string,
  userDepartments: string[]
): boolean => {
  if (userRole === 'CEO') {
    return true;
  }
  if (dashboard.accessType === 'all') {
    return true;
  }
  if (dashboard.accessType === 'exclude' && dashboard.departments) {
    const hasExcludedDepartment = userDepartments.some((dept) =>
      dashboard.departments!.includes(dept.toLowerCase())
    );
    return !hasExcludedDepartment;
  }
  if (dashboard.accessType === 'include' && dashboard.departments) {
    const hasIncludedDepartment = userDepartments.some((dept) =>
      dashboard.departments!.includes(dept.toLowerCase())
    );
    if ((dashboard.id === 'humanitarian_aid' || dashboard.id === 'sawa') && userRole === 'project') {
      return true;
    }
    return hasIncludedDepartment;
  }
  return false;
};

export const getAccessibleDashboards = (
  userRole: string,
  userDepartments: string[],
  catalog: DashboardConfig[] = getPowerbiRoutingCatalog()
): DashboardConfig[] => {
  return catalog.filter((dashboard) => canAccessDashboard(dashboard, userRole, userDepartments));
};

export const hasPowerBIAccess = (
  userRole: string,
  userDepartments: string[],
  catalog: DashboardConfig[] = getPowerbiRoutingCatalog()
): boolean => {
  return getAccessibleDashboards(userRole, userDepartments, catalog).length > 0;
};

export function hasPowerBINavigationAccess(user: User, catalog?: DashboardConfig[]): boolean {
  const cat = catalog ?? getPowerbiRoutingCatalog();
  const ids = getEffectivePowerbiDashboardIds(user);
  if (ids === null || ids === undefined) {
    return hasPowerBIAccess(user.role, user.departments || [], cat);
  }
  return ids.length > 0;
}
