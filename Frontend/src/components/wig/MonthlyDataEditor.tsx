import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMonthlyData, createOrUpdateMonthlyData } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import { isAuthenticated } from '@/services/authService';
import type { MonthlyData } from '@/types/wig';
import { Calendar, Loader2 } from 'lucide-react';
import { format, parse, addMonths, startOfMonth } from 'date-fns';

interface MonthlyDataEditorProps {
  departmentObjectiveId: number;
  trigger?: React.ReactNode;
}

const MONTHS = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
];

export default function MonthlyDataEditor({ departmentObjectiveId, trigger }: MonthlyDataEditorProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Map<string, MonthlyData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, departmentObjectiveId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const monthlyData = await getMonthlyData(departmentObjectiveId);
      const dataMap = new Map<string, MonthlyData>();
      
      monthlyData.forEach((item) => {
        const monthKey = item.month.substring(0, 7); // YYYY-MM
        dataMap.set(monthKey, item);
      });
      
      setData(dataMap);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load monthly data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateMonthData = (month: string, field: 'target_value' | 'actual_value', value: string) => {
    const updated = new Map(data);
    const existing = updated.get(month) || {
      id: 0,
      department_objective_id: departmentObjectiveId,
      month: `${month}-01`,
      target_value: null,
      actual_value: null,
    };
    
    updated.set(month, {
      ...existing,
      [field]: value === '' ? null : parseFloat(value) || null,
    });
    
    setData(updated);
  };

  const saveAll = async () => {
    // Check if user is authenticated
    if (!isAuthenticated()) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to save monthly data',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const promises: Promise<MonthlyData>[] = [];
      
      // Save all months, even if they haven't been edited
      MONTHS.forEach((month) => {
        const monthData = data.get(month) || {
          id: 0,
          department_objective_id: departmentObjectiveId,
          month: `${month}-01`,
          target_value: null,
          actual_value: null,
        };
        
        promises.push(
          createOrUpdateMonthlyData({
            department_objective_id: departmentObjectiveId,
            month: `${month}-01`,
            target_value: monthData.target_value,
            actual_value: monthData.actual_value,
          })
        );
      });
      
      await Promise.all(promises);
      
      toast({
        title: 'Success',
        description: 'Monthly data saved successfully',
      });
      
      setOpen(false);
    } catch (err) {
      console.error('Error saving monthly data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save monthly data';
      
      // Provide more helpful error messages
      if (errorMessage.includes('Authentication required') || errorMessage.includes('401')) {
        toast({
          title: 'Authentication Required',
          description: 'Your session may have expired. Please sign in again.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Calendar className="mr-2 h-4 w-4" />
            Edit Monthly Data
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Monthly Data (1/2026 - 6/2027)</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4 p-2 font-medium border-b">
              <div>Month</div>
              <div className="text-right">Target</div>
              <div className="text-right">Actual</div>
              <div className="text-right">Variance</div>
            </div>
            
            {MONTHS.map((month) => {
              const monthData = data.get(month) || {
                id: 0,
                department_objective_id: departmentObjectiveId,
                month: `${month}-01`,
                target_value: null,
                actual_value: null,
              };
              
              const variance =
                monthData.target_value !== null && monthData.actual_value !== null
                  ? monthData.actual_value - monthData.target_value
                  : null;
              
              const monthLabel = format(parse(month, 'yyyy-MM', new Date()), 'MMM yyyy');
              
              return (
                <div key={month} className="grid grid-cols-4 gap-4 p-2 border-b">
                  <div className="font-medium">{monthLabel}</div>
                  <div>
                    <Input
                      type="number"
                      id={`target-${month}`}
                      name={`target-${month}`}
                      autoComplete="off"
                      value={monthData.target_value?.toString() || ''}
                      onChange={(e) => updateMonthData(month, 'target_value', e.target.value)}
                      placeholder="Target"
                      className="text-right"
                      aria-label={`Target value for ${monthLabel}`}
                    />
                  </div>
                  <div>
                    <Input
                      type="number"
                      id={`actual-${month}`}
                      name={`actual-${month}`}
                      autoComplete="off"
                      value={monthData.actual_value?.toString() || ''}
                      onChange={(e) => updateMonthData(month, 'actual_value', e.target.value)}
                      placeholder="Actual"
                      className="text-right"
                      aria-label={`Actual value for ${monthLabel}`}
                    />
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    {variance !== null ? (variance >= 0 ? '+' : '') + variance.toFixed(2) : '-'}
                  </div>
                </div>
              );
            })}
            
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} aria-label="Cancel editing monthly data" title="Cancel">
                Cancel
              </Button>
              <Button type="button" onClick={saveAll} disabled={saving} aria-label="Save all monthly data" title="Save all monthly data">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save All'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

