
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

interface User {
  username: string;
  role: string;
  departments: string[];
}

interface FourDXChartProps {
  user: User;
  selectedMonths: string[];
}

const FourDXChart = ({ user, selectedMonths }: FourDXChartProps) => {
  // Mock data for the chart - in real app, this would come from SharePoint
  const chartData = selectedMonths.map((month, index) => ({
    month: new Date(month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    wig: 75 + Math.random() * 20,
    lag: 70 + Math.random() * 25,
    lead: 80 + Math.random() * 15,
    activity: 140 + Math.random() * 30
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          4DX Performance Trends
          {user.role === "department" && (
            <span className="text-sm font-normal text-muted-foreground">
              - {user.departments[0]} Department
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Chart Legend */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-wig" />
              <span className="text-sm text-muted-foreground">WIG</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-lag" />
              <span className="text-sm text-muted-foreground">LAG</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-lead" />
              <span className="text-sm text-muted-foreground">LEAD</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-activity" />
              <span className="text-sm text-muted-foreground">Activity</span>
            </div>
          </div>

          {/* Simple Bar Chart Visualization */}
          <div className="space-y-4">
            {chartData.map((data, index) => (
              <div key={index} className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">{data.month}</div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <div className="text-xs text-wig font-medium">WIG</div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div 
                        className="h-3 bg-wig rounded-full transition-all duration-500"
                        style={{ width: `${data.wig}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">{Math.round(data.wig)}%</div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs text-lag font-medium">LAG</div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div 
                        className="h-3 bg-lag rounded-full transition-all duration-500"
                        style={{ width: `${data.lag}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">{Math.round(data.lag)}%</div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs text-lead font-medium">LEAD</div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div 
                        className="h-3 bg-lead rounded-full transition-all duration-500"
                        style={{ width: `${data.lead}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">{Math.round(data.lead)}%</div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs text-activity font-medium">Activity</div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div 
                        className="h-3 bg-activity rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(data.activity/2, 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">{Math.round(data.activity)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FourDXChart;
