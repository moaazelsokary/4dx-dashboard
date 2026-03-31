/**
 * @deprecated Use SidebarNav + AppLayout instead. All pages have been migrated to the
 * left sidebar navigation. This component is kept for reference only.
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home, Users, BarChart3, History, ArrowUpRight, Settings } from 'lucide-react';
import { PowerBIIcon } from '@/components/icons/PowerBIIcon';
import { OdooIcon } from '@/components/icons/OdooIcon';
import { hasPowerBIAccess } from '@/config/powerbi';

interface NavigationBarProps {
  user: {
    role: string;
    departments?: string[];
  } | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  showWIGTabs?: boolean; // Show Hierarchical, Table, RASCI tabs
}

export default function NavigationBar({ user, activeTab, onTabChange, showWIGTabs = false }: NavigationBarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const isCEO = user.role === 'CEO';
  const isAdmin = user.role === 'Admin';
  const isDepartment = user.role === 'department';
  const isOperations = isDepartment && user.departments?.includes('operations');
  const hasPowerBI = hasPowerBIAccess(user.role, user.departments || []);
  const canAccessAdmin = isCEO || isAdmin;

  // Determine which pages user can access
  const canAccessWIGPlan = isCEO || isDepartment;
  const canAccessMainPlan = isCEO || isDepartment; // Department users can view (read-only)
  const canAccessDepartmentObjectives = isCEO || isDepartment;
  const canAccessSummary = isCEO || isOperations;
  const canAccessPowerBI = hasPowerBI;

  // For CEO/admin, show all buttons on all pages
  // For department users on "My Objectives" page, show all buttons (like CEO)
  // For other users on other pages, show buttons conditionally based on current page
  const shouldShowButton = (path: string) => {
    if (isCEO) return true; // CEO/admin sees all buttons on all pages
    // Department users on department objectives page should see all buttons
    if (isDepartment && location.pathname === '/department-objectives') return true;
    return location.pathname !== path; // Other users: hide button if on that page
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {/* Strategic Plan 2026 */}
      {canAccessMainPlan && (
        <Button
          variant={location.pathname === '/main-plan' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/main-plan')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <Home className="w-3 h-3 mr-1" />
          Strategic Plan 2026
        </Button>
      )}

      {/* Department Objectives */}
      {canAccessDepartmentObjectives && shouldShowButton('/department-objectives') && (
        <Button
          variant={location.pathname === '/department-objectives' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/department-objectives')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <Users className="w-3 h-3 mr-1" />
          {isCEO ? 'Department Objectives' : 'My Objectives'}
        </Button>
      )}

      {/* Power BI Dashboards */}
      {canAccessPowerBI && shouldShowButton('/powerbi') && (
        <Button
          variant={location.pathname === '/powerbi' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/powerbi')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <PowerBIIcon className="w-3 h-3 mr-1" />
          Power BI Dashboards
        </Button>
      )}

      {/* PMS & Odoo Metrics (Admin/CEO only) */}
      {canAccessAdmin && shouldShowButton('/pms-odoo-metrics') && (
        <Button
          variant={location.pathname === '/pms-odoo-metrics' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/pms-odoo-metrics')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <OdooIcon className="w-3 h-3 mr-1" />
          PMS & Odoo Metrics
        </Button>
      )}

      {/* 2025 Plan */}
      {canAccessWIGPlan && shouldShowButton('/wig-plan-2025') && (
        <Button
          variant={location.pathname === '/wig-plan-2025' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/wig-plan-2025')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <BarChart3 className="w-3 h-3 mr-1" />
          2025 Plan
        </Button>
      )}

      {/* Projects Summary and Projects Details hidden from UI */}

      {/* Projects Website */}
      {canAccessSummary && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open('http://pms.lifemakers.org/', '_blank')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <History className="w-3 h-3 mr-1" />
          Projects Website
        </Button>
      )}

      {/* Configuration (Admin/CEO only) */}
      {canAccessAdmin && shouldShowButton('/admin/configuration') && (
        <Button
          variant={location.pathname === '/admin/configuration' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/admin/configuration')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <Settings className="w-3 h-3 mr-1" />
          Configuration
        </Button>
      )}

    </div>
  );
}

