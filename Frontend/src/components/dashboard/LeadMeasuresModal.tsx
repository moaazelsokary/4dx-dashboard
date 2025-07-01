import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatNumber, getStatusBadge } from "@/lib/utils";

interface LeadMeasure {
  id: string;
  name: string;
  value: number;
  target: number;
  trend: number;
  leadNumber?: number;
  avgIndicatorPercentage?: number;
}

interface LeadMeasuresModalProps {
  isOpen: boolean;
  onClose: () => void;
  lagName: string;
  leads: LeadMeasure[];
}

const LeadMeasuresModal = ({ isOpen, onClose, lagName, leads }: LeadMeasuresModalProps) => {
  // Group LEADs for display: if a lead has '(Average)', group it with following '_indicator' leads
  function groupLeadsForDisplay(leads) {
    const groups = [];
    let i = 0;
    while (i < leads.length) {
      const lead = leads[i];
      const isAverage = lead.name.includes('(Average)');
      if (isAverage) {
        // Collect all following indicators
        const indicators = [];
        let j = i + 1;
        while (j < leads.length && leads[j].name && leads[j].id.includes('_indicator')) {
          indicators.push(leads[j]);
          j++;
        }
        // Calculate average of indicator percentages
        let avgPercentage = null;
        if (indicators.length > 0) {
          const percentages = indicators.map(ind => ind.target === 0 ? 100 : (ind.value / ind.target) * 100);
          avgPercentage = percentages.reduce((sum, pct) => sum + pct, 0) / indicators.length;
        }
        groups.push({ average: { ...lead, avgIndicatorPercentage: avgPercentage }, indicators });
        i = j;
      } else {
        groups.push({ average: lead, indicators: [] });
        i++;
      }
    }
    return groups;
  }
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Lead Measures for: {lagName}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 mt-4">
          {groupLeadsForDisplay(leads).map((group, idx) => (
            group.indicators.length > 0 ? (
              <div
                key={group.average.id}
                className="border-2 border-primary/30 rounded-xl p-2 bg-white/60 flex flex-col items-center w-full"
              >
                {/* Remove '(Average)' from display name, keep badge */}
                <LeadCard
                  lead={{ ...group.average, name: group.average.name.replace(/\s*\(Average\)$/, '') }}
                  isAverage
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full mt-2 bg-muted/40 rounded-lg p-2">
                  {group.indicators.map(ind => (
                    <div key={ind.id} className="w-full">
                      <LeadCard lead={ind} isIndicator />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <LeadCard key={group.average.id} lead={group.average} />
            )
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Extracted LeadCard for reuse
function LeadCard({ lead, isAverage, isIndicator }: { lead: LeadMeasure; isAverage?: boolean; isIndicator?: boolean }) {
  const displayAchievementRate =
    typeof lead.avgIndicatorPercentage === 'number'
      ? lead.avgIndicatorPercentage
      : (lead.target === 0 ? 100 : (lead.value / lead.target) * 100);
  const isPositiveTrend = lead.trend > 0;
  const statusInfo = getStatusBadge(displayAchievementRate);
  return (
    <Card className={`border-2 border-lead/20 bg-white/30 backdrop-blur-md border-white/30 shadow-lg ${isAverage ? 'ring-2 ring-primary/60' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium gap-2">
          <div className="flex items-center gap-2">
            {/* LEAD Number Bracket - only for main LEAD cards, not indicators */}
            {lead.leadNumber && (!isIndicator) && (
              <div className="bg-primary text-primary-foreground rounded-lg px-2 py-1 text-xs font-bold shadow-md">
                LEAD {lead.leadNumber}
              </div>
            )}
            <span className="text-muted-foreground">{lead.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {isAverage && <Badge variant="default" className="bg-primary text-white">Average</Badge>}
            {isIndicator && <Badge variant="outline" className="border-primary text-primary">Indicator</Badge>}
            <TrendingUp className="w-5 h-5 text-lead" />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            {isAverage ? (
              <>
                <span className="text-2xl font-bold text-foreground">{Math.round(displayAchievementRate)}%</span>
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
                <span className="text-2xl font-bold text-foreground">
                  {formatNumber(lead.value)}/{formatNumber(lead.target)}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({Math.round(displayAchievementRate)}%)
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
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={isPositiveTrend ? "default" : "destructive"} 
              className="text-xs px-2 py-0.5"
            >
              {isPositiveTrend ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {Math.abs(lead.trend).toFixed(2)}%
            </Badge>
            <span className="text-xs text-muted-foreground">vs last period</span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{Math.round(displayAchievementRate)}%</span>
          </div>
          <Progress 
            value={Math.min(displayAchievementRate, 100)} 
            className="h-2"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default LeadMeasuresModal;
