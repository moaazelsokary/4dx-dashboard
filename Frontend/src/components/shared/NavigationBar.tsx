import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Layers, Table2, Users, BarChart3, FolderOpen, Power, ArrowUpRight } from 'lucide-react';
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
  const isDepartment = user.role === 'department';
  const isOperations = isDepartment && user.departments?.includes('operations');
  const hasPowerBI = hasPowerBIAccess(user.role, user.departments || []);

  // Determine which pages user can access
  const canAccessWIGPlan = isCEO || isDepartment;
  const canAccessMainPlan = isCEO || isDepartment; // Department users can view (read-only)
  const canAccessDepartmentObjectives = isCEO || isDepartment;
  const canAccessSummary = isCEO || isOperations;
  const canAccessProjectDetails = isCEO || isOperations;
  const canAccessPowerBI = hasPowerBI;

  // For CEO/admin, show all buttons on all pages
  // For other users, show buttons conditionally based on current page
  const shouldShowButton = (path: string) => {
    if (isCEO) return true; // CEO/admin sees all buttons on all pages
    return location.pathname !== path; // Other users: hide button if on that page
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {/* Strategic Plan 2026 - CEO/admin and department users */}
      {canAccessMainPlan && (isCEO || isDepartment || showWIGTabs) && (
        <Button
          variant={location.pathname === '/main-plan' && (activeTab === 'hierarchy' || !showWIGTabs) ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (showWIGTabs) {
              onTabChange?.('hierarchy');
            } else {
              navigate('/main-plan');
            }
          }}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <Layers className="w-3 h-3 mr-1" />
          Strategic Plan 2026
        </Button>
      )}

      {/* Table - CEO/admin and department users */}
      {canAccessMainPlan && (isCEO || isDepartment || showWIGTabs) && (
        <Button
          variant={location.pathname === '/main-plan' && activeTab === 'table' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (showWIGTabs) {
              onTabChange?.('table');
            } else {
              navigate('/main-plan');
            }
          }}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <Table2 className="w-3 h-3 mr-1" />
          Table
        </Button>
      )}

      {/* RASCI - CEO/admin and department users */}
      {canAccessMainPlan && (isCEO || isDepartment || showWIGTabs) && (
        <Button
          variant={location.pathname === '/main-plan' && activeTab === 'rasci' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (showWIGTabs) {
              onTabChange?.('rasci');
            } else {
              navigate('/main-plan');
            }
          }}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <Users className="w-3 h-3 mr-1" />
          RASCI
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
          <Power className="w-3 h-3 mr-1" />
          Power BI Dashboards
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

      {/* Projects Summary */}
      {canAccessSummary && shouldShowButton('/summary') && (
        <Button
          variant={location.pathname === '/summary' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/summary')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <BarChart3 className="w-3 h-3 mr-1" />
          Projects Summary
        </Button>
      )}

      {/* Projects Details */}
      {canAccessProjectDetails && shouldShowButton('/project-details') && (
        <Button
          variant={location.pathname === '/project-details' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/project-details')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <FolderOpen className="w-3 h-3 mr-1" />
          Projects Details
        </Button>
      )}

      {/* Projects Website */}
      {canAccessSummary && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open('https://dashboard.lifemakers.org/', '_blank')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <BarChart3 className="w-3 h-3 mr-1" />
          Projects Website
        </Button>
      )}
    </div>
  );
}

