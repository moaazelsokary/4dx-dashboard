import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Building2, BarChart3, ChevronDown, ChevronRight, X } from "lucide-react";
import LagMetricsCard from "./LagMetricsCard";
import LeadMeasuresModal from "./LeadMeasuresModal";
import type { LagMetric } from "@/services/sharepointService";

interface CEODashboardProps {
  departmentData: { [key: string]: LagMetric[] };
  onLagClick: (lagId: string) => void;
}

const CEODashboard = ({ departmentData, onLagClick }: CEODashboardProps) => {
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);
  const [selectedLag, setSelectedLag] = useState<LagMetric | null>(null);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  // Debug: Log departments being loaded
  console.log('[CEO Dashboard] Department data received:', departmentData);
  console.log('[CEO Dashboard] Departments available:', Object.keys(departmentData));
  console.log('[CEO Dashboard] Expected departments:', ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices']);

  // Helper to get department display name
  const getDepartmentDisplayName = (departmentCode: string): string => {
    const departmentNames: { [key: string]: string } = {
      'hr': 'Human Resources',
      'it': 'Information Technology',
      'operations': 'Operations',
      'communication': 'Communication',
      'dfr': 'DFR',
      'case': 'Case Management',
      'bdm': 'Business Development',
      'security': 'Security',
      'admin': 'Administration',
      'procurement': 'Procurement',
      'offices': 'Offices'
    };
    return departmentNames[departmentCode] || departmentCode.toUpperCase();
  };

  // Helper to group LAGs with indicators for rendering
  function groupLagsForDisplay(lags: LagMetric[]) {
    const groups = [];
    let i = 0;
    while (i < lags.length) {
      const lag = lags[i];
      const isAverage = lag.name.includes('(Average)');
      if (isAverage) {
        // Collect all following indicators
        const indicators = [];
        let j = i + 1;
        while (j < lags.length && lags[j].name && lags[j].id.includes('_indicator')) {
          indicators.push(lags[j]);
          j++;
        }
        groups.push({ average: lag, indicators });
        i = j;
      } else {
        groups.push({ average: lag, indicators: [] });
        i++;
      }
    }
    return groups;
  }

  // Calculate department health
  const calculateDepartmentHealth = (lags: LagMetric[]): number => {
    if (lags.length === 0) return 0;
    
    return Math.min(100, Math.round(lags.reduce((acc, lag) => {
      // Handle "Not Yet" cases (target = 0)
      if (lag.target === 0) {
        return acc + 100; // Treat as 100% for health calculation
      }
      // Calculate percentage based on whether "less is better"
      const percentage = Math.min(100, 
        lag.isLessBetter ? 
          (lag.value === 0 ? 0 : (lag.target / lag.value) * 100) : // For "عدد يقل": handle 0 case
          (lag.value / lag.target) * 100   // For normal metrics: (value / target) * 100
      );
      return acc + percentage;
    }, 0) / lags.length));
  };

  // Get health color and status
  const getHealthColor = (percentage: number) => {
    if (percentage >= 80) return "text-health-good";
    if (percentage >= 60) return "text-health-warning";
    return "text-health-critical";
  };

  const getHealthStatus = (percentage: number) => {
    if (percentage >= 80) return "Excellent";
    if (percentage >= 60) return "Good";
    if (percentage >= 40) return "Fair";
    return "Needs Attention";
  };

  const getBloodColor = (percentage: number) => {
    if (percentage >= 80) return "#10b981"; // green
    if (percentage >= 60) return "#f59e0b"; // yellow
    return "#ef4444"; // red
  };

  // Handle department click
  const handleDepartmentClick = (departmentCode: string) => {
    setSelectedDepartment(departmentCode);
    setIsDepartmentModalOpen(true);
  };

  // Handle LAG click - same as department dashboard
  const handleLagClick = (lagId: string) => {
    // Find the LAG in the department data
    let lag: LagMetric | undefined;
    for (const deptData of Object.values(departmentData)) {
      lag = deptData.find(l => l.id === lagId);
      if (lag) break;
    }
    
    if (lag && lag.leads && lag.leads.length > 0) {
      setSelectedLag(lag);
      setIsLeadModalOpen(true);
    }
  };

  // Close department modal
  const closeDepartmentModal = () => {
    setIsDepartmentModalOpen(false);
    setSelectedDepartment(null);
  };

  return (
    <div className="space-y-6">
      {/* Department Health Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {(() => {
          // Expected departments
          const expectedDepartments = ['hr', 'it', 'operations', 'communication', 'dfr', 'case', 'bdm', 'security', 'admin', 'procurement', 'offices'];
          
          // Show all expected departments, even if some don't have data
          return expectedDepartments.map(departmentCode => {
            const lags = departmentData[departmentCode] || [];
            const healthPercentage = calculateDepartmentHealth(lags);
            const departmentName = getDepartmentDisplayName(departmentCode);
            const lagGroups = groupLagsForDisplay(lags);
            
            return (
              <Card 
                key={departmentCode} 
                className={`border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  lags.length === 0 ? 'opacity-60' : ''
                }`}
                onClick={() => handleDepartmentClick(departmentCode)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base sm:text-lg">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                      <span className="text-sm sm:text-base">{departmentName}</span>
                    </div>
                    {lags.length === 0 && (
                      <Badge variant="outline" className="text-xs">
                        No Data
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Heart Visual */}
                  <div className="flex flex-col items-center space-y-3">
                    <div className="relative">
                      <svg 
                        width="80" 
                        height="72" 
                        viewBox="0 0 24 24" 
                        className="w-16 h-16 sm:w-20 sm:h-20"
                      >
                        {/* Heart outline */}
                        <path
                          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                          fill="none"
                          stroke={getBloodColor(healthPercentage)}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        
                        {/* Heart fill based on percentage */}
                        <defs>
                          <clipPath id={`heart-clip-${departmentCode}`}>
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                          </clipPath>
                          <linearGradient id={`fillGradient-${departmentCode}`} x1="0%" y1="100%" x2="0%" y2="0%">
                            <stop offset="0%" stopColor={getBloodColor(healthPercentage)} stopOpacity="0.8" />
                            <stop offset={`${100 - healthPercentage}%`} stopColor={getBloodColor(healthPercentage)} stopOpacity="0.8" />
                            <stop offset={`${100 - healthPercentage}%`} stopColor="transparent" stopOpacity="0" />
                            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        
                        <rect
                          x="0"
                          y="0"
                          width="24"
                          height="24"
                          fill={`url(#fillGradient-${departmentCode})`}
                          clipPath={`url(#heart-clip-${departmentCode})`}
                          className="health-heart"
                        />
                      </svg>
                      
                      {/* Blood flow animation */}
                      <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2">
                        <div 
                          className="w-1.5 h-8 health-blood rounded-full opacity-70"
                          style={{ backgroundColor: getBloodColor(healthPercentage) }}
                        />
                      </div>
                    </div>
                    
                    <div className="text-center space-y-1">
                      <div className={`text-2xl font-bold ${getHealthColor(healthPercentage)}`}>
                        {healthPercentage}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Health Score
                      </div>
                      <div className={`text-sm font-semibold ${getHealthColor(healthPercentage)}`}>
                        {getHealthStatus(healthPercentage)}
                      </div>
                    </div>
                  </div>

                  {/* LAG Count Badge */}
                  <div className="flex justify-center">
                    <Badge variant="outline" className="border-lag text-lag">
                      <BarChart3 className="w-3 h-3 mr-1" />
                      {lagGroups.length} LAG Measures
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          });
        })()}
      </div>

      {/* Department LAGs Modal */}
      {isDepartmentModalOpen && selectedDepartment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                {getDepartmentDisplayName(selectedDepartment)} LAG Measures
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeDepartmentModal}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
              {(() => {
                const lags = departmentData[selectedDepartment];
                const lagGroups = groupLagsForDisplay(lags);
                
                if (lagGroups.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      No LAG measures found for this department.
                    </div>
                  );
                }
                
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                    {lagGroups.map((group, idx) => (
                      group.indicators.length > 0 ? (
                        <div
                          key={group.average.id}
                          className="border-2 border-primary/30 rounded-xl p-2 bg-white/60 flex flex-col items-center col-span-1 md:col-span-2 xl:col-span-4 w-full"
                        >
                          <LagMetricsCard
                            lag={{ ...group.average, name: group.average.name.replace(/\s*\(Average\)$/, '') }}
                            onClick={handleLagClick}
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 w-full mt-2 bg-muted/40 rounded-lg p-2">
                            {group.indicators.map(ind => (
                              <div key={ind.id} className="w-full">
                                <LagMetricsCard 
                                  lag={ind} 
                                  onClick={handleLagClick} 
                                  small 
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <LagMetricsCard 
                          key={group.average.id} 
                          lag={group.average} 
                          onClick={handleLagClick} 
                        />
                      )
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Lead Measures Modal - Same as department dashboard */}
      <LeadMeasuresModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        lagName={selectedLag?.name || ""}
        leads={selectedLag?.leads || []}
      />
    </div>
  );
};

export default CEODashboard;