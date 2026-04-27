import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Home, Users, BarChart3, History, Settings, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { PowerBIIcon } from '@/components/icons/PowerBIIcon';
import { OdooIcon } from '@/components/icons/OdooIcon';
import { RASCIIcon } from '@/components/icons/RASCIIcon';
import { cn } from '@/lib/utils';
import { AppLogo } from '@/components/shared/AppLogo';
import type { User } from '@/services/authService';
import { canAccessAppPath } from '@/utils/routeAccess';

interface SidebarNavProps {
  user: User | null;
  /** When true, always show labels (e.g. in mobile drawer) */
  expanded?: boolean;
  /** Page title - shown in sidebar (from header) */
  title?: string;
  /** Page subtitle - shown in sidebar (from header) */
  subtitle?: string;
  className?: string;
}

export default function SidebarNav({ user, expanded = false, title, subtitle, className }: SidebarNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || '';
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());

  // Auto-expand section when navigating to it or its children
  useEffect(() => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (location.pathname === '/main-plan' || location.pathname.startsWith('/main-plan')) next.add('main-plan');
      if (location.pathname.startsWith('/main-plan/volunteers')
        || location.pathname.startsWith('/main-plan/refugees')
        || location.pathname.startsWith('/main-plan/returnees')
        || location.pathname.startsWith('/main-plan/relief')
        || location.pathname.startsWith('/main-plan/awareness')) {
        next.add('strategic-topics');
      }
      if (location.pathname === '/department-objectives' || location.pathname.startsWith('/department-objectives')) next.add('department-objectives');
      if (location.pathname.startsWith('/admin/configuration')) next.add('configuration');
      return next;
    });
  }, [location.pathname]);

  // When not signed in: show only logo and Sign in link so the left bar is visible on all pages
  if (!user) {
    return (
      <nav
        className={cn(
          'flex h-full min-h-0 max-h-full w-full min-w-0 flex-1 flex-col gap-1 py-2',
          expanded ? 'w-56' : 'min-w-12',
          className
        )}
      >
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mb-2 flex h-[52px] min-h-11 w-[52px] min-w-11 items-center justify-center rounded-md p-2 mx-auto transition-colors duration-150 hover:bg-primary/10"
            aria-label="Home"
          >
            <AppLogo className="h-full w-full" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-app-sidebar">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-current={location.pathname === '/' ? 'page' : undefined}
            className={cn(
              'flex min-h-10 w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground'
            )}
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate transition-all duration-150 ease-out',
                expanded
                  ? 'opacity-100'
                  : 'max-w-0 flex-1 overflow-hidden opacity-0 group-hover/sidebar:max-w-none group-hover/sidebar:opacity-100'
              )}
            >
              Sign in
            </span>
          </button>
        </div>
      </nav>
    );
  }

  const isCEO = user.role === 'CEO';
  const isAdmin = user.role === 'Admin';
  const isDepartment = user.role === 'department';
  const isOperations = isDepartment && user.departments?.includes('operations');
  const canAccessAdmin = isCEO || isAdmin;

  const canAccessWIGPlan = isCEO || isDepartment;
  const canAccessMainPlan = isCEO || isDepartment;
  const canAccessDepartmentObjectives = isCEO || isAdmin || isDepartment;
  const canAccessSummary = isCEO || isOperations;

  const shouldShowButton = (path: string) => {
    if (isCEO || isAdmin) return true;
    if (isDepartment && location.pathname === '/department-objectives') return true;
    return location.pathname !== path;
  };

  const navItem = (
    key: string,
    path: string,
    label: string,
    Icon: React.ElementType,
    customClick?: () => void
  ) => {
    const isActive = location.pathname === path && !currentTab;
    const handleClick = () => (customClick ? customClick() : navigate(path));
    return (
      <button
        key={key}
        type="button"
        onClick={handleClick}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 w-full min-w-0 min-h-10 px-3 py-2 rounded-md text-xs transition-colors text-left',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-primary/10 hover:text-foreground text-muted-foreground'
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span
          className={cn(
            'truncate transition-all duration-150 ease-out min-w-0',
            expanded
              ? 'opacity-100 flex-1'
              : 'opacity-0 max-w-0 overflow-hidden flex-1 group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-none'
          )}
        >
          {label}
        </span>
      </button>
    );
  };

  const subNavItem = (
    key: string,
    path: string,
    tab: string,
    label: string,
    defaultTab?: boolean,
    Icon?: React.ElementType,
    iconSrc?: string,
    iconClassName?: string
  ) => {
    const isActive = location.pathname === path && (currentTab === tab || (defaultTab && !currentTab));
    const handleClick = () => navigate(`${path}${tab ? `?tab=${tab}` : ''}`);
    return (
      <button
        key={key}
        type="button"
        onClick={handleClick}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 w-full min-w-0 min-h-9 pl-3 pr-3 py-1.5 rounded-md text-xs transition-colors text-left mt-0.5',
          'group-hover/sidebar:pl-10',
          isActive
            ? 'bg-primary/20 text-primary font-medium'
            : 'hover:bg-primary/10 hover:text-foreground text-muted-foreground'
        )}
      >
        {iconSrc ? (
          <img
            src={iconSrc}
            alt=""
            aria-hidden="true"
            className={cn('h-6 w-6 shrink-0 object-contain', iconClassName)}
          />
        ) : (
          Icon && <Icon className="w-4 h-4 shrink-0" />
        )}
        <span
          className={cn(
            'truncate transition-all duration-150 ease-out min-w-0 flex-1',
            expanded
              ? 'opacity-100'
              : 'opacity-0 max-w-0 overflow-hidden group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-none'
          )}
        >
          {label}
        </span>
      </button>
    );
  };

  /** Parent button with chevron; children show on click (not hover) */
  const navItemWithChildren = (
    key: string,
    path: string,
    label: string,
    Icon: React.ElementType,
    children: React.ReactNode[]
  ) => {
    const isParentActive =
      location.pathname === path
      || (key === 'configuration' && location.pathname.startsWith('/admin/configuration'))
      || (key === 'strategic-topics'
        && (
          location.pathname.startsWith('/main-plan/volunteers')
          || location.pathname.startsWith('/main-plan/refugees')
          || location.pathname.startsWith('/main-plan/returnees')
          || location.pathname.startsWith('/main-plan/relief')
          || location.pathname.startsWith('/main-plan/awareness')
        ));
    const isExpanded = expandedSections.has(key) || isParentActive;
    const handleClick = () => {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };
    return (
      <div key={key} className="group/parent flex flex-col gap-0">
        <button
          type="button"
          onClick={handleClick}
          aria-expanded={isExpanded}
          className={cn(
            'flex items-center gap-3 w-full min-w-0 min-h-10 px-3 py-2 rounded-md text-xs transition-colors text-left',
            isParentActive && !currentTab
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-primary/10 hover:text-foreground text-muted-foreground'
          )}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span
            className={cn(
              'truncate transition-all duration-150 ease-out min-w-0 flex-1',
              expanded
                ? 'opacity-100'
                : 'opacity-0 max-w-0 overflow-hidden group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-none'
            )}
          >
            {label}
          </span>
          <ChevronRight
            className={cn(
              'w-4 h-4 shrink-0 transition-transform duration-150 ease-out',
              expanded
                ? 'opacity-100'
                : 'opacity-0 max-w-0 overflow-hidden group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-none group-hover/sidebar:ml-0',
              isExpanded && 'rotate-90'
            )}
          />
        </button>
        <div
          className={cn(
            'flex flex-col overflow-hidden transition-[max-height,opacity] duration-150 ease-out mt-1',
            'ml-0 pl-0 border-l-0 group-hover/sidebar:ml-2 group-hover/sidebar:pl-1 group-hover/sidebar:border-l group-hover/sidebar:border-border/60',
            isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          {children}
        </div>
      </div>
    );
  };

  const items: React.ReactNode[] = [];

  if (canAccessMainPlan && canAccessAppPath('/main-plan', user)) {
    const mainPlanSub = [
      subNavItem('main-view', '/main-plan', 'view', 'View', true, Home),
      subNavItem('main-rasci', '/main-plan', 'rasci', 'RASCI', undefined, RASCIIcon),
      subNavItem('main-table', '/main-plan', 'table', 'Table', undefined, FileSpreadsheet),
    ];
    items.push(navItemWithChildren('main-plan', '/main-plan', 'Strategic Plan 2026', Home, mainPlanSub));
  }
  if (canAccessMainPlan && canAccessAppPath('/main-plan/volunteers', user)) {
    const strategicTopicsSub = [
      subNavItem('main-volunteers', '/main-plan/volunteers', '', 'Volunteers', undefined, undefined, '/volunteers.png'),
      subNavItem('main-refugees', '/main-plan/refugees', '', 'Refugees', undefined, undefined, '/Refugees.png'),
      subNavItem(
        'main-returnees',
        '/main-plan/returnees',
        '',
        'Returnees',
        undefined,
        undefined,
        '/Returnees.png',
        '[filter:brightness(0)_saturate(100%)_invert(52%)_sepia(61%)_saturate(654%)_hue-rotate(120deg)_brightness(92%)_contrast(97%)]'
      ),
      subNavItem('main-relief', '/main-plan/relief', '', 'Relief', undefined, undefined, '/Relief.png'),
      subNavItem(
        'main-awareness',
        '/main-plan/awareness',
        '',
        'Awareness',
        undefined,
        undefined,
        '/Awareness.png',
        '[filter:brightness(0)_saturate(100%)_invert(52%)_sepia(61%)_saturate(654%)_hue-rotate(120deg)_brightness(92%)_contrast(97%)]'
      ),
    ];
    items.push(navItemWithChildren('strategic-topics', '/main-plan/volunteers', 'Strategic Topics', Users, strategicTopicsSub));
  }
  if (canAccessDepartmentObjectives && canAccessAppPath('/department-objectives', user) && shouldShowButton('/department-objectives')) {
    const deptSub = [
      subNavItem('dept-objectives', '/department-objectives', 'objectives', 'Objectives', true, FileSpreadsheet),
      subNavItem('dept-rasci', '/department-objectives', 'rasci', 'RASCI Metrics', undefined, RASCIIcon),
    ];
    items.push(navItemWithChildren('department-objectives', '/department-objectives', isCEO ? 'Department Objectives' : 'My Objectives', Users, deptSub));
  }
  if (canAccessAppPath('/powerbi', user) && shouldShowButton('/powerbi')) {
    items.push(navItem('powerbi', '/powerbi', 'Power BI Dashboards', PowerBIIcon));
  }
  if (canAccessAdmin && canAccessAppPath('/pms-odoo-metrics', user) && shouldShowButton('/pms-odoo-metrics')) {
    items.push(navItem('pms-odoo-metrics', '/pms-odoo-metrics', 'PMS & Odoo Metrics', OdooIcon));
  }
  if (canAccessWIGPlan && canAccessAppPath('/wig-plan-2025', user) && shouldShowButton('/wig-plan-2025')) {
    items.push(navItem('wig-plan-2025', '/wig-plan-2025', '2025 Plan', BarChart3));
  }
  // Projects Summary and Projects Details hidden from UI
  if (canAccessSummary) {
    items.push(
      navItem('projects-website', '/summary', 'Projects Website', History, () => window.open('http://pms.lifemakers.org/', '_blank'))
    );
  }
  if (canAccessAdmin && canAccessAppPath('/admin/configuration', user) && shouldShowButton('/admin/configuration')) {
    const configSub = [
      subNavItem('config-locks', '/admin/configuration', 'locks', 'Lock Management', true),
      subNavItem('config-logs', '/admin/configuration', 'logs', 'Activity Logs'),
      subNavItem('config-permissions', '/admin/configuration', 'permissions', 'Objectives permissions'),
      subNavItem('config-users', '/admin/configuration', 'users', 'Users'),
      subNavItem('config-pbi', '/admin/configuration', 'powerbi-dashboards', 'Power BI dashboards'),
      subNavItem('config-mappings', '/admin/configuration', 'mappings', 'DataSource Mapping'),
    ];
    items.push(navItemWithChildren('configuration', '/admin/configuration', 'Configuration', Settings, configSub));
  }
  return (
    <nav
      className={cn(
        'flex h-full min-h-0 max-h-full w-full min-w-0 flex-1 flex-col gap-1 py-2',
        expanded ? 'w-56' : 'min-w-12',
        className
      )}
    >
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => navigate('/main-plan?tab=view')}
          aria-current={location.pathname === '/main-plan' ? 'page' : undefined}
          className="mb-2 flex h-[52px] min-h-11 w-[52px] min-w-11 items-center justify-center rounded-md p-2 mx-auto transition-colors duration-150 hover:bg-primary/10"
          aria-label="Home"
        >
          <AppLogo className="h-full w-full" />
        </button>
        {(title || subtitle) && (
          <div
            className={cn(
              'min-w-0 overflow-hidden transition-all duration-150 ease-out',
              expanded
                ? 'mb-2 w-full px-3 opacity-100'
                : 'mb-0 w-full max-w-0 px-0 opacity-0 group-hover/sidebar:mb-2 group-hover/sidebar:max-w-none group-hover/sidebar:px-3 group-hover/sidebar:opacity-100'
            )}
          >
            {title && <h2 className="truncate text-xs font-semibold text-foreground">{title}</h2>}
            {subtitle && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden scrollbar-app-sidebar">
        {items}
      </div>
    </nav>
  );
}
