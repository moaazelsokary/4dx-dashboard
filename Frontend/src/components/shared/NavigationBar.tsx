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
  const canAccessMainPlan = isCEO;
  const canAccessDepartmentObjectives = isCEO || isDepartment;
  const canAccessSummary = isCEO || isOperations;
  const canAccessProjectDetails = isCEO || isOperations;
  const canAccessPowerBI = hasPowerBI;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {/* WIG Plan Views - Only show on MainPlanObjectives page */}
      {showWIGTabs && canAccessMainPlan && (
        <>
          <Button
            variant={activeTab === 'hierarchy' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onTabChange?.('hierarchy')}
            className="h-7 px-2 text-xs whitespace-nowrap"
          >
            <Layers className="w-3 h-3 mr-1" />
            Strategic Plan 2026
          </Button>

          <Button
            variant={activeTab === 'table' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onTabChange?.('table')}
            className="h-7 px-2 text-xs whitespace-nowrap"
          >
            <Table2 className="w-3 h-3 mr-1" />
            Table
          </Button>

          <Button
            variant={activeTab === 'rasci' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onTabChange?.('rasci')}
            className="h-7 px-2 text-xs whitespace-nowrap"
          >
            <Users className="w-3 h-3 mr-1" />
            RASCI
          </Button>

          <div className="w-px h-5 bg-border mx-1" />
        </>
      )}

      {/* Main Plan Objectives - CEO only */}
      {canAccessMainPlan && location.pathname !== '/main-plan' && (
        <Button
          variant={location.pathname === '/main-plan' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/main-plan')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <Layers className="w-3 h-3 mr-1" />
          {location.pathname === '/department-objectives' ? 'Strategic Plan 2026' : 'Main Plan'}
        </Button>
      )}

      {/* Department Objectives - Department users only */}
      {canAccessDepartmentObjectives && location.pathname !== '/department-objectives' && (
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

      {/* 2025 WIG Plan - All users with WIG access */}
      {canAccessWIGPlan && location.pathname !== '/wig-plan-2025' && (
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

      {/* Separator before other pages */}
      {(canAccessSummary || canAccessProjectDetails || canAccessPowerBI) && (
        <div className="w-px h-5 bg-border mx-1" />
      )}

      {/* Summary Overview - CEO and Operations */}
      {canAccessSummary && location.pathname !== '/summary' && (
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

      {/* Project Details - CEO and Operations */}
      {canAccessProjectDetails && location.pathname !== '/project-details' && (
        <Button
          variant={location.pathname === '/project-details' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/project-details')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <FolderOpen className="w-3 h-3 mr-1" />
          Projects
        </Button>
      )}

      {/* Power BI Dashboards - Based on access config */}
      {canAccessPowerBI && location.pathname !== '/powerbi' && (
        <Button
          variant={location.pathname === '/powerbi' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/powerbi')}
          className="h-7 px-2 text-xs whitespace-nowrap"
        >
          <Power className="w-3 h-3 mr-1" />
          Power BI
        </Button>
      )}

      {/* Life Makers Project Brief - CEO and Operations */}
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

