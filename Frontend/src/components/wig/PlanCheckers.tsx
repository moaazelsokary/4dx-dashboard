import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getPlanChecker, calculatePlanCheckers } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import type { PlanChecker } from '@/types/wig';
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface PlanCheckersProps {
  objectiveId: number;
}

export default function PlanCheckers({ objectiveId }: PlanCheckersProps) {
  const [checker, setChecker] = useState<PlanChecker | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    loadChecker();
  }, [objectiveId]);

  const loadChecker = async () => {
    try {
      setLoading(true);
      const data = await getPlanChecker(objectiveId);
      setChecker(data);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load plan checker',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    try {
      setCalculating(true);
      await calculatePlanCheckers();
      toast({
        title: 'Success',
        description: 'Plan checkers calculated successfully',
      });
      await loadChecker();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to calculate plan checkers',
        variant: 'destructive',
      });
    } finally {
      setCalculating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!checker) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Plan Checkers</CardTitle>
            <Button onClick={handleCalculate} disabled={calculating} size="sm">
              {calculating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Calculate
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            No checker data available. Click Calculate to generate.
          </div>
        </CardContent>
      </Card>
    );
  }

  const plannedStatusColor = checker.planned_status === 'covered' ? 'bg-green-500' : 'bg-red-500';
  const annualTargetStatusColor =
    checker.annual_target_status === 'ok'
      ? 'bg-green-500'
      : checker.annual_target_status === 'above'
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Plan Checkers</CardTitle>
          <Button onClick={handleCalculate} disabled={calculating} size="sm">
            {calculating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Calculating...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Recalculate
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Planned Status:</span>
              {checker.planned_status === 'covered' ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
            <Badge
              variant={checker.planned_status === 'covered' ? 'default' : 'destructive'}
              className="w-fit"
            >
              {checker.planned_status === 'covered' ? 'Covered' : 'Not Covered'}
            </Badge>
            <div className="text-xs text-muted-foreground">
              All departments with RASCI roles have objectives assigned
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Annual Target Status:</span>
              {checker.annual_target_status === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              )}
            </div>
            <Badge
              variant={
                checker.annual_target_status === 'ok'
                  ? 'default'
                  : checker.annual_target_status === 'above'
                  ? 'secondary'
                  : 'destructive'
              }
              className="w-fit"
            >
              {checker.annual_target_status === 'ok'
                ? 'OK'
                : checker.annual_target_status === 'above'
                ? `Above by ${checker.annual_target_variance?.toLocaleString()}`
                : `Less by ${Math.abs(checker.annual_target_variance || 0).toLocaleString()}`}
            </Badge>
            <div className="text-xs text-muted-foreground">
              Sum of Direct activities compared to annual target
            </div>
          </div>
        </div>

        {checker.last_checked_at && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Last checked: {new Date(checker.last_checked_at).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

