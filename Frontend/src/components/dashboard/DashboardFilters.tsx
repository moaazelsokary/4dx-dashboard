import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from "react";
import { getCurrentMonth, getCurrentQuarter, getDefaultMonth } from "@/lib/utils";

interface DashboardFiltersProps {
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;
  selectedMonths: string[];
  setSelectedMonths: (months: string[]) => void;
  selectedQuarters: string[];
  setSelectedQuarters: (quarters: string[]) => void;
  startMonth: string;
  setStartMonth: (month: string) => void;
  endMonth: string;
  setEndMonth: (month: string) => void;
}

const DashboardFilters = ({
  selectedPeriod,
  setSelectedPeriod,
  selectedMonths,
  setSelectedMonths,
  selectedQuarters,
  setSelectedQuarters,
  startMonth,
  setStartMonth,
  endMonth,
  setEndMonth
}: DashboardFiltersProps) => {
  const periods = [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "cumulative", label: "Cumulative" }
  ];

  const months = [
    { value: "2025-01", label: "Jan 2025" },
    { value: "2025-02", label: "Feb 2025" },
    { value: "2025-03", label: "Mar 2025" },
    { value: "2025-04", label: "Apr 2025" },
    { value: "2025-05", label: "May 2025" },
    { value: "2025-06", label: "Jun 2025" },
    { value: "2025-07", label: "Jul 2025" },
    { value: "2025-08", label: "Aug 2025" },
    { value: "2025-09", label: "Sep 2025" },
    { value: "2025-10", label: "Oct 2025" },
    { value: "2025-11", label: "Nov 2025" },
    { value: "2025-12", label: "Dec 2025" }
  ];

  const compactMonths = [
    { value: "2025-01", label: "Jan" },
    { value: "2025-02", label: "Feb" },
    { value: "2025-03", label: "Mar" },
    { value: "2025-04", label: "Apr" },
    { value: "2025-05", label: "May" },
    { value: "2025-06", label: "Jun" },
    { value: "2025-07", label: "Jul" },
    { value: "2025-08", label: "Aug" },
    { value: "2025-09", label: "Sep" },
    { value: "2025-10", label: "Oct" },
    { value: "2025-11", label: "Nov" },
    { value: "2025-12", label: "Dec" }
  ];

  const quarters = [
    { value: "Q1", label: "Quarter 1 (Jan-Mar)" },
    { value: "Q2", label: "Quarter 2 (Apr-Jun)" },
    { value: "Q3", label: "Quarter 3 (Jul-Sep)" },
    { value: "Q4", label: "Quarter 4 (Oct-Dec)" }
  ];

  const toggleMonth = (month: string) => {
    if (selectedMonths.includes(month)) {
      if (selectedMonths.length > 1) {
      setSelectedMonths(selectedMonths.filter(m => m !== month));
      }
    } else {
      setSelectedMonths([...selectedMonths, month]);
    }
  };

  const toggleQuarter = (quarter: string) => {
    if (selectedQuarters.includes(quarter)) {
      if (selectedQuarters.length > 1) {
      setSelectedQuarters(selectedQuarters.filter(q => q !== quarter));
      }
    } else {
      setSelectedQuarters([...selectedQuarters, quarter]);
    }
  };

  // Ensure at least one option is selected when period changes
  useEffect(() => {
    if (selectedPeriod === "monthly" && selectedMonths.length === 0) {
      setSelectedMonths([getDefaultMonth()]); // Default to current month if >10 days, otherwise previous month
    }
    if (selectedPeriod === "quarterly" && selectedQuarters.length === 0) {
      setSelectedQuarters([getCurrentQuarter()]); // Default to current quarter
    }
  }, [selectedPeriod, selectedMonths.length, selectedQuarters.length, setSelectedMonths, setSelectedQuarters]);

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm sm:text-base">Time Period Filters</h3>
        </div>
        
        <div className="space-y-4">
          {/* Period Selection */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Analysis Period
            </label>
            <div className="flex flex-wrap gap-2">
              {periods.map((period) => (
                <Button
                  key={period.value}
                  variant={selectedPeriod === period.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedPeriod(period.value)}
                  className={`${selectedPeriod === period.value ? "bg-primary text-primary-foreground" : ""} text-xs sm:text-sm`}
                >
                  {period.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Monthly Selection */}
          {selectedPeriod === "monthly" && (
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                <Calendar className="w-4 h-4 inline mr-1" />
                Select Months ({selectedMonths.length} selected)
              </label>
              <div className="flex flex-wrap gap-1 sm:gap-2">
                {compactMonths.map((month) => (
                  <Badge
                    key={month.value}
                    variant={selectedMonths.includes(month.value) ? "default" : "outline"}
                    className={`cursor-pointer transition-colors text-xs ${
                      selectedMonths.includes(month.value) 
                        ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                        : "hover:bg-muted"
                    }`}
                    onClick={() => toggleMonth(month.value)}
                  >
                    {month.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Quarterly Selection */}
          {selectedPeriod === "quarterly" && (
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                <Calendar className="w-4 h-4 inline mr-1" />
                Select Quarters ({selectedQuarters.length} selected)
              </label>
              <div className="flex flex-wrap gap-1 sm:gap-2">
                {quarters.map((quarter) => (
                  <Badge
                    key={quarter.value}
                    variant={selectedQuarters.includes(quarter.value) ? "default" : "outline"}
                    className={`cursor-pointer transition-colors text-xs ${
                      selectedQuarters.includes(quarter.value) 
                        ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                        : "hover:bg-muted"
                    }`}
                    onClick={() => toggleQuarter(quarter.value)}
                  >
                    {quarter.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Cumulative Selection */}
          {selectedPeriod === "cumulative" && (
            <div className="bg-muted/30 rounded-lg p-3 sm:p-4 border">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Date Range Selection</span>
              </div>
              
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Start Month
                </label>
                <Select value={startMonth} onValueChange={setStartMonth}>
                    <SelectTrigger className="h-9 border-2 hover:border-primary/50 transition-colors">
                      <SelectValue placeholder="Choose start month" />
                  </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <div className="grid grid-cols-3 gap-1 p-2">
                        {compactMonths.map((month) => (
                          <SelectItem key={month.value} value={month.value} className="cursor-pointer text-center">
                        {month.label}
                      </SelectItem>
                    ))}
                      </div>
                  </SelectContent>
                </Select>
              </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  End Month
                </label>
                <Select value={endMonth} onValueChange={setEndMonth}>
                    <SelectTrigger className="h-9 border-2 hover:border-primary/50 transition-colors">
                      <SelectValue placeholder="Choose end month" />
                  </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <div className="grid grid-cols-3 gap-1 p-2">
                        {compactMonths.map((month) => (
                          <SelectItem key={month.value} value={month.value} className="cursor-pointer text-center">
                        {month.label}
                      </SelectItem>
                    ))}
                      </div>
                  </SelectContent>
                </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardFilters;
