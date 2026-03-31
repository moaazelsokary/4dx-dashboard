import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Home, Users, BarChart3, History, Settings, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { PowerBIIcon } from '@/components/icons/PowerBIIcon';
import { OdooIcon } from '@/components/icons/OdooIcon';
import { WBSIcon } from '@/components/icons/WBSIcon';
import { RASCIIcon } from '@/components/icons/RASCIIcon';
import { hasPowerBIAccess } from '@/config/powerbi';
import { cn } from '@/lib/utils';
import { AppLogo } from '@/components/shared/AppLogo';

interface SidebarNavProps {
  user: {
    role: string;
    departments?: string[];
  } | null;
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
          'flex flex-col gap-1 py-2 w-full',
          expanded ? 'w-56' : 'min-w-12',
          className
        )}
      >
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center justify-center p-2 rounded-md hover:bg-primary/10 mb-2 mx-auto min-h-11 min-w-11 w-[52px] h-[52px] transition-transform duration-150 ease-out group-hover/sidebar:scale-[1.08] origin-center"
          aria-label="Home"
        >
          <AppLogo className="w-full h-full" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-current={location.pathname === '/' ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 w-full min-w-0 min-h-10 px-3 py-2 rounded-md text-xs transition-colors text-left hover:bg-primary/10 hover:text-foreground text-muted-foreground'
          )}
        >
          <span
            className={cn(
            'truncate transition-all duration-150 ease-out min-w-0 flex-1',
            expanded ? 'opacity-100' : 'opacity-0 max-w-0 overflow-hidden flex-1 group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-none'
            )}
          >
            Sign in
          </span>
        </button>
      </nav>
    );
  }

  const isCEO = user.role === 'CEO';
  const isAdmin = user.role === 'Admin';
  const isDepartment = user.role === 'department';
  const isOperations = isDepartment && user.departments?.includes('operations');
  const hasPowerBI = hasPowerBIAccess(user.role, user.departments || []);
  const canAccessAdmin = isCEO || isAdmin;

  const canAccessWIGPlan = isCEO || isDepartment;
  const canAccessMainPlan = isCEO || isDepartment;
  const canAccessDepartmentObjectives = isCEO || isAdmin || isDepartment;
  const canAccessSummary = isCEO || isOperations;
  const canAccessPowerBI = hasPowerBI;

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
    Icon?: React.ElementType
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
        {Icon && <Icon className="w-4 h-4 shrink-0" />}
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
    const isParentActive = location.pathname === path || (key === 'configuration' && location.pathname.startsWith('/admin/configuration'));
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

  if (canAccessMainPlan) {
    const mainPlanSub = [
      subNavItem('main-view', '/main-plan', 'view', 'View', true, Home),
      subNavItem('main-wbs', '/main-plan', 'wbs', 'WBS', undefined, WBSIcon),
      subNavItem('main-rasci', '/main-plan', 'rasci', 'RASCI', undefined, RASCIIcon),
      subNavItem('main-table', '/main-plan', 'table', 'Table', undefined, FileSpreadsheet),
    ];
    items.push(navItemWithChildren('main-plan', '/main-plan', 'Strategic Plan 2026', Home, mainPlanSub));
  }
  if (canAccessDepartmentObjectives && shouldShowButton('/department-objectives')) {
    const deptSub = [
      subNavItem('dept-objectives', '/department-objectives', 'objectives', 'Objectives', true, FileSpreadsheet),
      subNavItem('dept-rasci', '/department-objectives', 'rasci', 'RASCI Metrics', undefined, RASCIIcon),
    ];
    items.push(navItemWithChildren('department-objectives', '/department-objectives', isCEO ? 'Department Objectives' : 'My Objectives', Users, deptSub));
  }
  if (canAccessPowerBI && shouldShowButton('/powerbi')) {
    items.push(navItem('powerbi', '/powerbi', 'Power BI Dashboards', PowerBIIcon));
  }
  if (canAccessAdmin && shouldShowButton('/pms-odoo-metrics')) {
    items.push(navItem('pms-odoo-metrics', '/pms-odoo-metrics', 'PMS & Odoo Metrics', OdooIcon));
  }
  if (canAccessWIGPlan && shouldShowButton('/wig-plan-2025')) {
    items.push(navItem('wig-plan-2025', '/wig-plan-2025', '2025 Plan', BarChart3));
  }
  // Projects Summary and Projects Details hidden from UI
  if (canAccessSummary) {
    items.push(
      navItem('projects-website', '/summary', 'Projects Website', History, () => window.open('http://pms.lifemakers.org/', '_blank'))
    );
  }
  if (canAccessAdmin && shouldShowButton('/admin/configuration')) {
    const configSub = [
      subNavItem('config-locks', '/admin/configuration', 'locks', 'Lock Management', true),
      subNavItem('config-logs', '/admin/configuration', 'logs', 'Activity Logs'),
      subNavItem('config-permissions', '/admin/configuration', 'permissions', 'User Permissions'),
      subNavItem('config-mappings', '/admin/configuration', 'mappings', 'DataSource Mapping'),
    ];
    items.push(navItemWithChildren('configuration', '/admin/configuration', 'Configuration', Settings, configSub));
  }
  return (
    <nav
      className={cn(
        'flex flex-col gap-1 py-2 w-full',
        expanded ? 'w-56' : 'min-w-12',
        className
      )}
    >
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        aria-current={location.pathname === '/dashboard' ? 'page' : undefined}
        className="flex items-center justify-center p-2 rounded-md hover:bg-primary/10 mb-2 mx-auto min-h-11 min-w-11 w-[52px] h-[52px] transition-transform duration-150 ease-out group-hover/sidebar:scale-[1.08] origin-center"
        aria-label="Home"
      >
        <AppLogo className="w-full h-full" />
      </button>
      {(title || subtitle) && (
        <div
          className={cn(
            'overflow-hidden transition-all duration-150 ease-out min-w-0',
            expanded
              ? 'opacity-100 w-full px-3 mb-2'
              : 'opacity-0 max-w-0 px-0 mb-0 w-full group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-none group-hover/sidebar:px-3 group-hover/sidebar:mb-2'
          )}
        >
          {title && <h2 className="text-xs font-semibold text-foreground truncate">{title}</h2>}
          {subtitle && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{subtitle}</p>}
        </div>
      )}
      {items}
    </nav>
  );
}
