import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  LogOut, 
  Calendar,
  Users,
  Building2,
  BarChart3,
  RefreshCw,
  AlertCircle,
  FolderOpen,
  ArrowRight,
  ArrowUpRight
} from "lucide-react";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import LagMetricsCard from "@/components/dashboard/LagMetricsCard";
import LeadMeasuresModal from "@/components/dashboard/LeadMeasuresModal";
import DepartmentHealth from "@/components/dashboard/DepartmentHealth";
import CEODashboard from "@/components/dashboard/CEODashboard";
import { useUserData, useTestConnection } from "@/hooks/useSharePointData";
import { toast } from "@/hooks/use-toast";
import type { LagMetric } from "@/services/sharepointService";
import { getCurrentMonth, getCurrentQuarter, getPreviousMonth } from "@/lib/utils";
import { sharePointCacheService } from "@/services/sharePointCacheService";

interface User {
  username: string;
  role: string;
  departments: string[];
}

// Extend LagMetric locally to include rawData for local filtering
interface LagMetricWithRaw extends LagMetric {
  rawData: string[];
  isLessBetter: boolean;
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState("monthly");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([getCurrentMonth()]);
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([getCurrentQuarter()]);
  const [startMonth, setStartMonth] = useState("2025-01");
  const [endMonth, setEndMonth] = useState(getCurrentMonth());
  const [selectedLag, setSelectedLag] = useState<LagMetric | null>(null);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const navigate = useNavigate();

  // SharePoint data hooks
  const { data: userData, isLoading, error, isCEO, refetch } = useUserData(user);
  const testConnection = useTestConnection();

  // Debug logging
  useEffect(() => {
    console.log('[Dashboard] User data received:', userData);
    console.log('[Dashboard] Is CEO:', isCEO);
    console.log('[Dashboard] Is loading:', isLoading);
    console.log('[Dashboard] Error:', error);
  }, [userData, isCEO, isLoading, error]);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/");
      return;
    }
    
    const user = JSON.parse(userData);
    
    // Redirect project users to Summary page
    if (user.role === "project") {
      navigate("/summary");
      return;
    }
    
    // Redirect project users to Summary page
    if (user.role === "project") {
      navigate("/summary");
      return;
    }
    
    setUser(user);
  }, [navigate]);

  const handleSignOut = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  const handleLagClick = (lagId: string) => {
    if (!userData) return;
    let lag: LagMetric | undefined;
    
    if (isCEO && typeof userData === 'object') {
      // For CEO view, search in filtered data first
      const filteredData = getFilteredDepartmentData();
      for (const departmentData of Object.values(filteredData)) {
        lag = departmentData.find(l => l.id === lagId);
        if (lag) break;
      }
      
      // If not found in filtered data, search in original data
      if (!lag) {
        for (const departmentData of Object.values(userData)) {
          if (Array.isArray(departmentData)) {
            lag = departmentData.find(l => l.id === lagId);
            if (lag) break;
          }
        }
      }
    } else if (Array.isArray(userData)) {
      // For department view, search in the department's data
      lag = userData.find(l => l.id === lagId);
    }
    
    if (lag) {
      // For CEO view, we need to check if the LAG has leads in the original data
      // For department view, we check in the filtered displayData
      let hasLeads = false;
      if (isCEO && typeof userData === 'object') {
        // Find the LAG in the original data to check for leads
        for (const departmentData of Object.values(userData)) {
          if (Array.isArray(departmentData)) {
            const originalLag = departmentData.find(l => l.id === lagId);
            if (originalLag && originalLag.leads && originalLag.leads.length > 0) {
              hasLeads = true;
              break;
            }
          }
        }
      } else {
        // For department view, check in displayData
        const filteredLag = displayData.find(l => l.id === lag.id);
        hasLeads = filteredLag && filteredLag.leads && filteredLag.leads.length > 0;
      }
      
      if (hasLeads) {
      setSelectedLag(lag);
      setIsLeadModalOpen(true);
      }
      // If no leads, do nothing
    }
  };

  const handleRefreshData = () => {
    // Clear SharePoint cache
    sharePointCacheService.clearCache();
    
    // Refetch data using React Query
    refetch();
    
    toast({
      title: "Data refreshed",
      description: "Latest data has been loaded.",
    });
  };

  // Transform data based on selected time period (local filtering)
  const transformDataForPeriod = (data: LagMetricWithRaw[] | undefined): LagMetricWithRaw[] => {
    if (!data) return [];
    
    // Helper to get month index from 'YYYY-MM' string
    const getMonthIndex = (monthStr: string) => parseInt(monthStr.split('-')[1], 10) - 1;

    // Helper to get indices for a quarter
    const getQuarterIndices = (quarter: string) => {
      switch (quarter) {
        case 'Q1': return [0, 1, 2];
        case 'Q2': return [3, 4, 5];
        case 'Q3': return [6, 7, 8];
        case 'Q4': return [9, 10, 11];
        default: return [];
      }
    };

    // Helper to check if a row is "نسبة" type
    const isPercentageRow = (rowData: string[]): boolean => {
      // Check column index 4 for "التمييز" value
      const tamyeez = rowData[4]?.trim();
      return tamyeez === 'نسبة';
    };

    // Helper to check if a row is "عدد يقل" type (less is better)
    const isLessBetterRow = (rowData: string[]): boolean => {
      // Check column index 4 for "التمييز" value
      const tamyeez = rowData[4]?.trim();
      return tamyeez === 'عدد يقل';
    };

    // Helper to check if a row is "ثابت" type (fixed value)
    const isFixedRow = (rowData: string[]): boolean => {
      const tamyeez = rowData[4]?.trim();
      return tamyeez === 'ثابت';
    };

    // Helper to get the latest non-zero, non-blank value in a period, or fallback to previous
    // Accepts an optional parity argument: 0 for even (target), 1 for odd (achieved)
    const getFixedValueForPeriod = (monthlyData: string[], indices: number[], parity?: 0 | 1): number => {
      // Find the last non-zero, non-blank value in the selected indices
      for (let i = indices.length - 1; i >= 0; i--) {
        const idx = indices[i];
        const val = parseFloat(monthlyData[idx]) || 0;
        if (val !== 0 && monthlyData[idx] !== '' && !isNaN(val)) {
          return val;
        }
      }
      // If all are zero/blank, look backward before the first index, only checking correct parity
      const startIdx = indices.length > 0 ? indices[0] : 0;
      for (let i = startIdx - 1; i >= 0; i--) {
        if (parity !== undefined && i % 2 !== parity) continue;
        const val = parseFloat(monthlyData[i]) || 0;
        if (val !== 0 && monthlyData[i] !== '' && !isNaN(val)) {
          return val;
        }
      }
      // If nothing found, return 0
      return 0;
    };

    // Helper to filter a single metric (LAG, LEAD, or indicator)
    const filterMetric = (metric: LagMetricWithRaw): LagMetricWithRaw => {
      if (!metric.rawData) return metric;
      const rowData = metric.rawData;
      const monthlyData = rowData.slice(12);
      let totalTarget = 0;
      let totalAchieved = 0;
      let monthCount = 0;
      let achievedArr: number[] = [];
      let targetArr: number[] = [];

      // Check if this is a "نسبة" row
      const isPercentage = isPercentageRow(rowData);
      // Check if this is a "عدد يقل" row (less is better)
      const isLessBetter = isLessBetterRow(rowData);
      // Check if this is a "ثابت" row (fixed value)
      const isFixed = isFixedRow(rowData);
      // Both "نسبة" and "عدد يقل" should use average for multiple months
      const shouldUseAverage = isPercentage || isLessBetter;

      if (selectedPeriod === 'monthly' && selectedMonths.length) {
        selectedMonths.forEach(monthStr => {
          const monthIndex = getMonthIndex(monthStr);
          const targetIndex = monthIndex * 2;
          const achievedIndex = monthIndex * 2 + 1;
          if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
            const target = parseFloat(monthlyData[targetIndex]) || 0;
            const achieved = parseFloat(monthlyData[achievedIndex]) || 0;
            if (target > 0) {
              totalTarget += target;
              totalAchieved += achieved;
              monthCount++;
              achievedArr.push(achieved);
              targetArr.push(target);
    }
          }
        });
      } else if (selectedPeriod === 'quarterly' && selectedQuarters.length) {
        selectedQuarters.forEach(quarter => {
          getQuarterIndices(quarter).forEach(i => {
            const targetIndex = i * 2;
            const achievedIndex = i * 2 + 1;
            if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
              const target = parseFloat(monthlyData[targetIndex]) || 0;
              const achieved = parseFloat(monthlyData[achievedIndex]) || 0;
              if (target > 0) {
                totalTarget += target;
                totalAchieved += achieved;
                monthCount++;
                achievedArr.push(achieved);
                targetArr.push(target);
    }
            }
          });
        });
      } else if (selectedPeriod === 'cumulative' && startMonth && endMonth) {
        const startIdx = getMonthIndex(startMonth);
        const endIdx = getMonthIndex(endMonth);
        for (let i = startIdx; i <= endIdx; i++) {
          const targetIndex = i * 2;
          const achievedIndex = i * 2 + 1;
          if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
            const target = parseFloat(monthlyData[targetIndex]) || 0;
            const achieved = parseFloat(monthlyData[achievedIndex]) || 0;
            if (target > 0) {
              totalTarget += target;
              totalAchieved += achieved;
              monthCount++;
              achievedArr.push(achieved);
              targetArr.push(target);
            }
          }
        }
      } else {
        // Default: use all available data
        for (let i = 0; i < monthlyData.length - 1; i += 2) {
          const target = parseFloat(monthlyData[i]) || 0;
          const achieved = parseFloat(monthlyData[i + 1]) || 0;
          if (target > 0) {
            totalTarget += target;
            totalAchieved += achieved;
            monthCount++;
            achievedArr.push(achieved);
            targetArr.push(target);
          }
        }
      }

      // Use average for "نسبة" and "عدد يقل" rows, sum for others
      if (shouldUseAverage && monthCount > 0) {
        console.log('[Dashboard] Using average for نسبة/عدد يقل row:', metric.name, { achievedArr, targetArr });
        totalTarget = targetArr.reduce((a, b) => a + b, 0) / monthCount;
        totalAchieved = achievedArr.reduce((a, b) => a + b, 0) / monthCount;
      }

      // --- Trend calculation (local, matches backend logic) ---
      let previousTarget = 0;
      let previousAchieved = 0;
      if (selectedPeriod === 'monthly' && selectedMonths.length) {
        const currentMonth = parseInt(selectedMonths[0].split('-')[1]);
        const previousMonth = currentMonth - 1;
        if (previousMonth >= 1) {
          const prevIdx = previousMonth - 1;
          const targetIndex = prevIdx * 2;
          const achievedIndex = prevIdx * 2 + 1;
          if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
            previousTarget = parseFloat(monthlyData[targetIndex]) || 0;
            previousAchieved = parseFloat(monthlyData[achievedIndex]) || 0;
          }
        }
      } else if (selectedPeriod === 'quarterly' && selectedQuarters.length) {
        const currentQuarter = selectedQuarters[0];
        let prevStart = 0, prevEnd = 0;
        switch (currentQuarter) {
          case 'Q2': prevStart = 0; prevEnd = 2; break;
          case 'Q3': prevStart = 3; prevEnd = 5; break;
          case 'Q4': prevStart = 6; prevEnd = 8; break;
          default: prevStart = -1; prevEnd = -1;
        }
        if (prevStart >= 0) {
          for (let i = prevStart; i <= prevEnd; i++) {
            const targetIndex = i * 2;
            const achievedIndex = i * 2 + 1;
            if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
              const target = parseFloat(monthlyData[targetIndex]) || 0;
              const achieved = parseFloat(monthlyData[achievedIndex]) || 0;
              if (target > 0) {
                previousTarget += target;
                previousAchieved += achieved;
              }
            }
          }
        }
      } else if (selectedPeriod === 'cumulative' && startMonth && endMonth) {
        const startIdx = getMonthIndex(startMonth);
        const endIdx = getMonthIndex(endMonth);
        const periodLength = endIdx - startIdx + 1;
        const prevStart = Math.max(0, startIdx - periodLength);
        const prevEnd = startIdx - 1;
        if (prevEnd >= prevStart) {
          for (let i = prevStart; i <= prevEnd; i++) {
            const targetIndex = i * 2;
            const achievedIndex = i * 2 + 1;
            if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
              const target = parseFloat(monthlyData[targetIndex]) || 0;
              const achieved = parseFloat(monthlyData[achievedIndex]) || 0;
              if (target > 0) {
                previousTarget += target;
                previousAchieved += achieved;
              }
            }
          }
        }
      }
      // Calculate achievement rates based on whether "less is better"
      const currentRate = totalTarget > 0 ? 
        isLessBetter ? 
          (totalAchieved === 0 ? 0 : (totalTarget / totalAchieved) * 100) : // For "عدد يقل"
          (totalAchieved / totalTarget) * 100 : // For normal metrics
        0;
      
      const previousRate = previousTarget > 0 ? 
        isLessBetter ? 
          (previousAchieved === 0 ? 0 : (previousTarget / previousAchieved) * 100) : // For "عدد يقل"
          (previousAchieved / previousTarget) * 100 : // For normal metrics
        0;
      let trend = 0;
      if ((totalTarget === 0 && totalAchieved === 0) || (previousTarget === 0 && previousAchieved === 0)) {
        trend = 0;
      } else if (previousRate === 0) {
        trend = 0;
      } else {
        trend = Math.round((currentRate - previousRate) * 100) / 100;
      }
      // --- End trend calculation ---

      if (isFixed) {
        // --- ثابت logic ---
        let indices: number[] = [];
        if (selectedPeriod === 'monthly' && selectedMonths.length) {
          indices = selectedMonths.map(monthStr => getMonthIndex(monthStr) * 2);
        } else if (selectedPeriod === 'quarterly' && selectedQuarters.length) {
          selectedQuarters.forEach(quarter => {
            indices.push(...getQuarterIndices(quarter).map(i => i * 2));
          });
        } else if (selectedPeriod === 'cumulative' && startMonth && endMonth) {
          const startIdx = getMonthIndex(startMonth);
          const endIdx = getMonthIndex(endMonth);
          for (let i = startIdx; i <= endIdx; i++) {
            indices.push(i * 2);
          }
        } else {
          // Default: all months
          for (let i = 0; i < monthlyData.length; i += 2) {
            indices.push(i);
          }
        }
        // Sort indices in ascending order (natural month order)
        indices = indices.filter(i => i >= 0).sort((a, b) => a - b);
        // For achieved, indices are +1
        const achievedIndices = indices.map(i => i + 1);
        const target = getFixedValueForPeriod(monthlyData, indices, 0); // even indices for target
        const value = getFixedValueForPeriod(monthlyData, achievedIndices, 1); // odd indices for achieved
        // Trend logic: compare with previous period (use same logic as before, but for fixed)
        let previousTarget = 0;
        let previousValue = 0;
        if (indices.length > 0 && indices[0] > 0) {
          // Previous period is the value just before the first index
          previousTarget = getFixedValueForPeriod(monthlyData, [indices[0] - 2], 0);
          previousValue = getFixedValueForPeriod(monthlyData, [achievedIndices[0] - 2], 1);
        }
        // Calculate achievement rate
        const currentRate = target > 0 ? (value / target) * 100 : 0;
        const previousRate = previousTarget > 0 ? (previousValue / previousTarget) * 100 : 0;
        let trend = 0;
        if ((target === 0 && value === 0) || (previousTarget === 0 && previousValue === 0)) {
          trend = 0;
        } else if (previousRate === 0) {
          trend = 0;
        } else {
          trend = Math.round((currentRate - previousRate) * 100) / 100;
        }
        return {
          ...metric,
          value,
          target,
          trend,
          leads: metric.leads ? metric.leads.map(filterMetric) : [],
          isLessBetter: false // ثابت is not less-better
        };
      }

      return {
        ...metric,
        value: totalAchieved,
        target: totalTarget,
        trend,
        leads: metric.leads ? metric.leads.map(filterMetric) : [],
        isLessBetter
      };
    };

    return data.map(filterMetric);
  };

  // Get the appropriate data based on user role
  const getDisplayData = (): LagMetric[] => {
    if (!userData) return [];
    
    if (isCEO && typeof userData === 'object') {
      // For CEO, combine all departments
      const allLags: LagMetric[] = [];
      Object.entries(userData).forEach(([department, lags]) => {
        if (Array.isArray(lags)) {
          lags.forEach(lag => {
            allLags.push({
              ...lag,
              name: `${getDepartmentDisplayName(department)}: ${lag.name}`,
              id: `${department}_${lag.id}`
            });
          });
        }
      });
      return transformDataForPeriod(allLags);
    } else if (Array.isArray(userData)) {
      // For department users
      return transformDataForPeriod(userData);
    }
    
    return [];
  };

  // Helper function to convert department codes to display names
  const getDepartmentDisplayName = (departmentCode: string): string => {
    const departmentNames: { [key: string]: string } = {
      hr: "Human Resources",
      it: "Information Technology",
      operations: "Program Operations",
      communication: "Communication",
      dfr: "Fundraising",
      case: "Case Management & MEAL",
      bdm: "Bussiness Development Managemnet",
      security: "Safety & Security",
      admin: "Administrative Affairs",
      procurement: "Supply Chain",
      offices: "Offices"
    };
    return departmentNames[departmentCode] || departmentCode.toUpperCase();
  };

  // Get filtered department data for CEO view
  const getFilteredDepartmentData = (): { [key: string]: LagMetric[] } => {
    if (!userData || !isCEO || typeof userData !== 'object') return {};
    
    const filteredData: { [key: string]: LagMetric[] } = {};
    
    Object.entries(userData).forEach(([department, lags]) => {
      if (Array.isArray(lags)) {
        filteredData[department] = transformDataForPeriod(lags);
      }
    });
    
    return filteredData;
  };

  const displayData = getDisplayData();

  // Helper to group LAGs with indicators for rendering
  function groupLagsForDisplay(lags) {
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
        // Calculate average of indicator percentages
        let avgPercentage = null;
        if (indicators.length > 0) {
          const percentages = indicators.map(ind => ind.target === 0 ? 100 : (ind.value / ind.target) * 100);
          avgPercentage = percentages.reduce((sum, pct) => sum + pct, 0) / indicators.length;
        }
        groups.push({ average: { ...lag, avgIndicatorPercentage: avgPercentage }, indicators });
        i = j;
      } else {
        groups.push({ average: lag, indicators: [] });
        i++;
      }
    }
    return groups;
  }

  if (!user) {
    return <div>Loading...</div>;
  }

  const departmentHealth = displayData.length > 0 
    ? Math.min(100, Math.round(displayData.reduce((acc, lag) => {
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
      }, 0) / displayData.length))
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 sm:w-16 sm:h-16 flex items-center justify-center p-2">
                <img 
                  src="/lovable-uploads/5e72745e-18ec-46d6-8375-e9912bdb8bdd.png" 
                  alt="Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-bold text-foreground">
                  {isCEO ? "CEO Dashboard" : "LAG Measures Dashboard"}
                </h1>
                <p className="text-xs text-muted-foreground">Life Makers Foundation - 4DX Methodology</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                {user.role === "CEO" ? (
                  <Badge variant="secondary" className="bg-accent text-accent-foreground w-fit text-xs">
                    <Users className="w-3 h-3 mr-1" />
                    CEO View
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-primary text-primary w-fit text-xs">
                    <Building2 className="w-3 h-3 mr-1" />
                    {getDepartmentDisplayName(user.departments[0])}
                  </Badge>
                )}
                {/* Removed welcome message */}
              </div>
              
              {/* Connection Status - Desktop Only */}
              <div className="hidden sm:flex sm:flex-row sm:items-center gap-2">
                {isLoading && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Syncing...
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="w-3 h-3" />
                    Connection Error
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={handleRefreshData} className="w-auto text-xs">
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Refresh Data
                </Button>
                <Button variant="outline" size="sm" onClick={handleSignOut} className="w-auto text-xs">
                <LogOut className="w-4 h-4 mr-1" />
                Sign Out
              </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 space-y-4 pb-20 sm:pb-4">
        {/* Mobile Buttons - Before Filters */}
        <div className="flex gap-3 sm:hidden">
          <Button variant="outline" size="sm" onClick={handleRefreshData} className="flex-1 text-xs">
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh Data
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="flex-1 text-xs">
            <LogOut className="w-4 h-4 mr-1" />
            Sign Out
          </Button>
        </div>

        {/* Combined Filters and Program Operations Sector Navigation */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Program Operations Sector Navigation - Takes 1/3 of the space, comes first on mobile */}
              {user && (user.role === "CEO" || (user.role === "department" && user.departments.includes("operations"))) && (
                <div className="order-1 lg:order-2 lg:col-span-1">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <FolderOpen className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold text-base">Program Operations Sector</h3>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/summary')}
                      className="justify-start h-auto p-3 w-full hover:bg-primary/5 hover:border-primary/50 transition-all duration-200 group"
                    >
                      <div className="text-left flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <BarChart3 className="w-5 h-5 text-primary group-hover:scale-110 transition-transform duration-200" />
                        </div>
                        <div>
                          <div className="font-medium">Summary Overview</div>
                          <div className="text-xs text-muted-foreground">High-level project summaries</div>
                        </div>
                        <div className="ml-auto flex-shrink-0">
                          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                        </div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/project-details')}
                      className="justify-start h-auto p-3 w-full hover:bg-primary/5 hover:border-primary/50 transition-all duration-200 group"
                    >
                      <div className="text-left flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <FolderOpen className="w-5 h-5 text-primary group-hover:scale-110 transition-transform duration-200" />
                        </div>
                        <div>
                          <div className="font-medium">Project Details</div>
                          <div className="text-xs text-muted-foreground">Detailed project view</div>
                        </div>
                        <div className="ml-auto flex-shrink-0">
                          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                        </div>
                      </div>
                    </Button>

                    {/* Life Makers Project Brief Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://dashboard.lifemakers.org/', '_blank')}
                      className="justify-start h-auto p-3 w-full hover:bg-primary/5 hover:border-primary/50 transition-all duration-200 group"
                    >
                      <div className="text-left flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <BarChart3 className="w-5 h-5 text-primary group-hover:scale-110 transition-transform duration-200" />
                        </div>
                        <div>
                          <div className="font-medium">Life Makers Project Brief</div>
                          <div className="text-xs text-muted-foreground">All Time Documentation</div>
                        </div>
                        <div className="ml-auto flex-shrink-0">
                          <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                        </div>
                      </div>
                    </Button>
                  </div>
                </div>
              )}

              {/* Filters - Takes 2/3 of the space, comes second on mobile */}
              <div className="order-2 lg:order-1 lg:col-span-2">
                <DashboardFilters
                  selectedPeriod={selectedPeriod}
                  setSelectedPeriod={setSelectedPeriod}
                  selectedMonths={selectedMonths}
                  setSelectedMonths={setSelectedMonths}
                  selectedQuarters={selectedQuarters}
                  setSelectedQuarters={setSelectedQuarters}
                  startMonth={startMonth}
                  setStartMonth={setStartMonth}
                  endMonth={endMonth}
                  setEndMonth={setEndMonth}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Loading data from SharePoint...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4" />
                <div>
                  <h3 className="font-semibold">Connection Error</h3>
                  <p className="text-sm text-muted-foreground">
                    Failed to load data from SharePoint. Please check your connection and try again.
                  </p>
                  <p className="text-xs mt-1">{error.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* LAG Metrics Grid */}
        {!isLoading && !error && (
        <div>
            {isCEO ? (
              // CEO Dashboard - Department Health with nested LAGs
              <CEODashboard 
                departmentData={getFilteredDepartmentData()}
                onLagClick={handleLagClick}
              />
            ) : (
              // Department Dashboard - LAGs with indicators
              <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
              <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-lag" />
                <h2 className="text-lg sm:text-xl font-bold text-foreground">LAG Measures</h2>
              </div>
              <Badge variant="outline" className="border-lag text-lag w-fit">
                    {groupLagsForDisplay(displayData).length} Active Measures
            </Badge>
          </div>
          
            {displayData.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {groupLagsForDisplay(displayData).map((group, idx) => (
                      group.indicators.length > 0 ? (
                        <div
                          key={group.average.id}
                          className="border-2 border-primary/30 rounded-xl p-2 bg-white/60 flex flex-col items-center w-full md:col-span-2 lg:col-span-3 xl:col-span-4"
                        >
                          <div className="w-full">
              <LagMetricsCard
                              lag={{ ...group.average, name: group.average.name.replace(/\s*\(Average\)$/, '') }}
                onClick={handleLagClick}
              />
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 w-full mt-2 bg-muted/40 rounded-lg p-2">
                              {group.indicators.map(ind => (
                                <div key={ind.id} className="w-full">
                                  <LagMetricsCard lag={ind} onClick={handleLagClick} small />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <LagMetricsCard key={group.average.id} lag={group.average} onClick={handleLagClick} />
                      )
            ))}
          </div>
            ) : (
            <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground">No LAG measures found for this department.</p>
              </CardContent>
            </Card>
                )}
              </>
            )}
          </div>
        )}
          
        {/* Department Health */}
        {!isLoading && !error && !isCEO && (
          <div>
            <DepartmentHealth 
              department={getDepartmentDisplayName(user.departments[0])}
              healthPercentage={departmentHealth}
            />
          </div>
        )}
      </div>

      {/* Lead Measures Modal */}
      {!isCEO && (
      <LeadMeasuresModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        lagName={selectedLag?.name || ""}
          leads={(() => {
            if (!selectedLag) return [];
            
            // For department view, find the filtered lag in displayData by id
            const filteredLag = displayData.find(l => l.id === selectedLag.id);
            return filteredLag?.leads || [];
          })()}
      />
      )}
    </div>
  );
};

export default Dashboard;
