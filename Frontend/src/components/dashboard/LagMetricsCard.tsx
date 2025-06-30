import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Target } from "lucide-react";
import { formatNumber, getStatusBadge } from "@/lib/utils";

interface LagMetric {
  id: string;
  name: string;
  value: number;
  target: number;
  trend: number;
  isLessBetter: boolean;
  lagNumber?: number; // Sequential LAG number for visual display
  leads: {
    id: string;
    name: string;
    value: number;
    target: number;
    trend: number;
    isLessBetter: boolean;
    lagNumber?: number; // Sequential LAG number for visual display
  }[];
}

interface LagMetricsCardProps {
  lag: LagMetric;
  onClick: (lagId: string) => void;
  small?: boolean;
}

const LagMetricsCard = ({ lag, onClick, small = false }: LagMetricsCardProps) => {
  // Check if this is a "Not Yet" case (no planned activity)
  // "Not Yet" means: target=0 (no planned target)
  const isNotYet = lag.target === 0;
  
  // Calculate achievement rate based on whether "less is better"
  const achievementRate = isNotYet ? 100 : 
    lag.isLessBetter ? 
      (lag.value === 0 ? 0 : (lag.target / lag.value) * 100) : // For "عدد يقل": handle 0 case
      (lag.value / lag.target) * 100;  // For normal metrics: (value / target) * 100
  const isPositiveTrend = lag.trend > 0;

  const statusInfo = getStatusBadge(achievementRate, isNotYet);

  const getDisplayValue = () => {
    if (isNotYet) {
      return 0;
    }
    return formatNumber(lag.value);
  };

  const getDisplayTarget = () => {
    if (isNotYet) {
      return 0;
    }
    return formatNumber(lag.target);
  };

  const getDisplayPercentage = () => {
    if (isNotYet) {
      return 100;
    }
    return achievementRate;
  };

  // Distinguish card type for UI
  const isAverage = lag.id.includes('_average');
  const isIndicator = lag.name.includes('Indicator');

  return (
    <Card 
      className={`border-2 border-lag/20 bg-white/30 backdrop-blur-md border-white/30 shadow-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer ${isAverage ? 'ring-2 ring-primary/60' : ''} ${small ? 'scale-95 text-xs p-1' : ''}`}
      onClick={() => onClick(lag.id)}
    >
      <CardHeader className={`pb-2 ${small ? 'p-2' : ''}`}>
        <CardTitle className={`flex items-center justify-between font-medium gap-2 ${small ? 'text-xs' : 'text-sm'}`}>
          <div className="flex items-center gap-2">
            {/* LAG Number Bracket - only for average cards and normal LAGs, not indicators */}
            {lag.lagNumber && (isAverage || !isIndicator) && (
              <div className="bg-primary text-primary-foreground rounded-lg px-2 py-1 text-xs font-bold shadow-md">
                LAG {lag.lagNumber}
              </div>
            )}
            <span className="text-muted-foreground">{lag.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {isIndicator && <Badge variant="outline" className="border-primary text-primary">Indicator</Badge>}
            <Target className={`text-lag ${small ? 'w-3 h-3' : 'w-4 h-4'}`} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-2 ${small ? 'p-2' : ''}`}>
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            {isAverage ? (
              <>
                <span className={`font-bold text-foreground ${small ? 'text-lg' : 'text-2xl'}`}>{lag.target === 0 ? 100 : Math.round((Number(lag.value.toFixed(2)) / Number(lag.target.toFixed(2))) * 100)}%</span>
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
              </>
            ) : (
              <>
                <span className={`font-bold text-foreground ${small ? 'text-lg' : 'text-2xl'}`}>{getDisplayValue()}/{getDisplayTarget()}</span>
                <span className={`text-muted-foreground ${small ? 'text-xs' : 'text-sm'}`}>({Math.round(getDisplayPercentage())}%)</span>
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
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={isPositiveTrend ? "default" : "destructive"} 
              className={`px-2 py-0.5 ${small ? 'text-[10px]' : 'text-xs'}`}
            >
              {isPositiveTrend ? <TrendingUp className={`mr-1 ${small ? 'w-2 h-2' : 'w-3 h-3'}`} /> : <TrendingDown className={`mr-1 ${small ? 'w-2 h-2' : 'w-3 h-3'}`} />}
              {Math.abs(lag.trend).toFixed(2)}%
            </Badge>
            <span className={`text-muted-foreground ${small ? 'text-[10px]' : 'text-xs'}`}>vs last period</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LagMetricsCard;