import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { formatNumber, getStatusBadge } from "@/lib/utils";

interface MetricsCardProps {
  title: string;
  value: number;
  target: number;
  trend: number;
  icon: LucideIcon;
  color: "wig" | "lag" | "lead" | "activity";
  unit: string;
  isLessBetter?: boolean;
}

const MetricsCard = ({ title, value, target, trend, icon: Icon, color, unit, isLessBetter = false }: MetricsCardProps) => {
  const colorClasses = {
    wig: "text-wig border-wig/20 bg-wig/5",
    lag: "text-lag border-lag/20 bg-lag/5",
    lead: "text-lead border-lead/20 bg-lead/5",
    activity: "text-activity border-activity/20 bg-activity/5"
  };

  const isNotYet = target === 0;

  const isPositiveTrend = trend > 0;
  const achievementRate = isNotYet ? 100 : 
    isLessBetter ? 
      (value === 0 ? 0 : (target / value) * 100) :
      (value / target) * 100;

  const statusInfo = getStatusBadge(achievementRate, isNotYet);

  const getDisplayValue = () => {
    if (isNotYet) {
      return 0;
    }
    return formatNumber(value);
  };

  const getDisplayTarget = () => {
    if (isNotYet) {
      return 0;
    }
    return formatNumber(target);
  };

  const getDisplayPercentage = () => {
    if (isNotYet) {
      return 100;
    }
    return achievementRate;
  };

  return (
    <Card className={`border-2 ${colorClasses[color]} transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="text-muted-foreground">{title}</span>
          <Icon className={`w-4 h-4 ${color === 'wig' ? 'text-wig' : color === 'lag' ? 'text-lag' : color === 'lead' ? 'text-lead' : 'text-activity'}`} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {getDisplayValue()}{unit}
            </span>
            <span className="text-sm text-muted-foreground">
              / {getDisplayTarget()}{unit}
            </span>
            <Badge 
              variant={statusInfo.variant} 
              className={
                statusInfo.text === 'Perfect' || statusInfo.text === 'Over Target'
                  ? 'bg-green-500 text-white'
                  : statusInfo.className
              }
            >
              {statusInfo.text}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge 
              variant={isPositiveTrend ? "default" : "destructive"} 
              className="text-xs px-2 py-0.5"
            >
              {isPositiveTrend ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {Math.abs(trend)}{unit}
            </Badge>
            <span className="text-xs text-muted-foreground">vs last period</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{Math.round(getDisplayPercentage())}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div 
              className={`h-1.5 rounded-full transition-all duration-500 ${
                color === 'wig' ? 'bg-wig' : 
                color === 'lag' ? 'bg-lag' : 
                color === 'lead' ? 'bg-lead' : 
                'bg-activity'
              }`}
              style={{ width: `${Math.min(getDisplayPercentage(), 100)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MetricsCard;
