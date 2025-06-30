
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

interface DepartmentHealthProps {
  department: string;
  healthPercentage: number;
}

const DepartmentHealth = ({ department, healthPercentage }: DepartmentHealthProps) => {
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

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="w-5 h-5 text-primary" />
          {department} Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Heart Visual */}
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <svg 
              width="120" 
              height="108" 
              viewBox="0 0 24 24" 
              className="w-30 h-30"
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
                <clipPath id="heart-clip">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </clipPath>
                <linearGradient id="fillGradient" x1="0%" y1="100%" x2="0%" y2="0%">
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
                fill="url(#fillGradient)"
                clipPath="url(#heart-clip)"
                className="health-heart"
              />
            </svg>
            
            {/* Blood flow animation */}
            <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2">
              <div 
                className="w-2 h-12 health-blood rounded-full opacity-70"
                style={{ backgroundColor: getBloodColor(healthPercentage) }}
              />
            </div>
          </div>
          
          <div className="text-center space-y-2">
            <div className={`text-4xl font-bold ${getHealthColor(healthPercentage)}`}>
              {healthPercentage}%
            </div>
            <div className="text-sm text-muted-foreground">
              Health Score
            </div>
            <div className={`text-lg font-semibold ${getHealthColor(healthPercentage)}`}>
              {getHealthStatus(healthPercentage)}
            </div>
          </div>
        </div>

        {/* Health Metrics */}
        <div className="space-y-3">
          <div className="text-sm font-medium text-muted-foreground">Health Indicators</div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">LAG Performance</span>
              <span className="text-sm font-medium">{healthPercentage}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-1000 ${
                  healthPercentage >= 80 ? 'bg-health-good' :
                  healthPercentage >= 60 ? 'bg-health-warning' :
                  'bg-health-critical'
                }`}
                style={{ width: `${healthPercentage}%` }}
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg">
            <strong>Health Calculation:</strong> Based on average LAG measures performance. 
            Higher scores indicate better alignment with 4DX methodology and achievement of Wildly Important Goals.
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DepartmentHealth;
