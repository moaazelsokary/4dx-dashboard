import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import {
  getMonthlyData,
  createOrUpdateMonthlyData,
  getDepartmentObjectives,
  getStrategicMonthlyData,
  createOrUpdateStrategicMonthlyData,
  getStrategicDepartmentObjectives,
} from '@/services/wigService';
import { getMapping, getStrategicMapping } from '@/services/configService';
import { useBatchLockStatus } from '@/hooks/useLockStatus';
import { createLockCheckRequest } from '@/services/lockService';
import { toast } from '@/hooks/use-toast';
import { isAuthenticated } from '@/services/authService';
import type { MonthlyData, StrategicMonthlyData } from '@/types/wig';
import { Calendar, Loader2, Lock as LockIcon, CheckCircle2, XCircle, AlertCircle, Database, Cloud } from 'lucide-react';
import { format, parse } from 'date-fns';
import { getUserFriendlyError } from '@/utils/errorMessages';

type MonthRow = MonthlyData | StrategicMonthlyData;

function emptyMonthRow(
  departmentObjectiveId: number,
  month: string,
  objectiveKind: 'bau' | 'strategic'
): MonthRow {
  const monthIso = `${month}-01`;
  if (objectiveKind === 'strategic') {
    return {
      id: 0,
      strategic_department_objective_id: departmentObjectiveId,
      month: monthIso,
      target_value: null,
      actual_value: null,
    };
  }
  return {
    id: 0,
    department_objective_id: departmentObjectiveId,
    month: monthIso,
    target_value: null,
    actual_value: null,
  };
}

interface MonthlyDataEditorProps {
  departmentObjectiveId: number;
  /** When strategic, loads/saves strategic_department_monthly_data and uses strategic lock scope. */
  objectiveKind?: 'bau' | 'strategic';
  trigger?: React.ReactNode;
}

const MONTHS = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
];

function errStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const s = (err as { status?: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

export default function MonthlyDataEditor({
  departmentObjectiveId,
  objectiveKind = 'bau',
  trigger,
}: MonthlyDataEditorProps) {
  const isStrategic = objectiveKind === 'strategic';
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Map<string, MonthRow>>(new Map());
  const [originalData, setOriginalData] = useState<Map<string, MonthRow>>(new Map()); // Track original data to detect changes
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Map<string, 'saved' | 'unsaved' | 'error'>>(new Map()); // Track save status per month
  const [failedMonths, setFailedMonths] = useState<Map<string, Error>>(new Map()); // Track failed months for retry
  const [saveProgress, setSaveProgress] = useState(0); // Progress percentage
  const [objectiveType, setObjectiveType] = useState<'Direct' | 'In direct' | 'M&E' | 'M&E MOV' | '' | null>(null);

  // Prepare batch lock checks for all 36 fields (18 months × 2 fields)
  // Note: monthly_target locks work for both Direct and In direct types
  // Note: monthly_actual locks work for Direct type only (backend enforces this)
  const lockChecks = MONTHS.flatMap((month) => [
    createLockCheckRequest('monthly_target', departmentObjectiveId, month, isStrategic ? 'strategic' : 'bau'),
    createLockCheckRequest('monthly_actual', departmentObjectiveId, month, isStrategic ? 'strategic' : 'bau'),
  ]);

  const { getLockStatus } = useBatchLockStatus(lockChecks, open && !!objectiveType);

  // Fetch data source mapping for this objective (for source badges: PMS / Odoo)
  const { data: mapping } = useQuery({
    queryKey: ['mapping', departmentObjectiveId, objectiveKind],
    queryFn: async () => {
      try {
        if (isStrategic) {
          return await getStrategicMapping(departmentObjectiveId);
        }
        return await getMapping(departmentObjectiveId);
      } catch {
        return null;
      }
    },
    enabled: open,
    staleTime: 0,
    retry: false,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch fresh data from server with cache-busting
      const monthlyData = isStrategic
        ? await getStrategicMonthlyData(departmentObjectiveId)
        : await getMonthlyData(departmentObjectiveId);
      const dataMap = new Map<string, MonthRow>();
      const originalMap = new Map<string, MonthRow>();
      
      monthlyData.forEach((item) => {
        const monthKey = item.month.substring(0, 7); // YYYY-MM
        dataMap.set(monthKey, item);
        // Store original data to detect changes
        originalMap.set(monthKey, { ...item });
      });
      
      // Trust server data - with cache-busting and fresh queries, server has latest data
      setData(dataMap);
      setOriginalData(originalMap);
      
      // Initialize save status - all loaded months are saved
      const statusMap = new Map<string, 'saved' | 'unsaved' | 'error'>();
      MONTHS.forEach(month => {
        statusMap.set(month, dataMap.has(month) ? 'saved' : 'unsaved');
      });
      setSaveStatus(statusMap);
      setFailedMonths(new Map());
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load monthly data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [departmentObjectiveId, isStrategic]);

  // Load department objective to check type
  useEffect(() => {
    if (open) {
      const loadObjective = async () => {
        try {
          const objectives = isStrategic
            ? await getStrategicDepartmentObjectives()
            : await getDepartmentObjectives();
          const objective = objectives.find((obj) => obj.id === departmentObjectiveId);
          setObjectiveType(objective?.type || null);
        } catch (error) {
          console.error('Error loading department objective:', error);
        }
      };
      void loadObjective();
      void loadData();
    }
  }, [open, departmentObjectiveId, loadData, isStrategic]);

  const updateMonthData = (month: string, field: 'target_value' | 'actual_value', value: string) => {
    // Check if field is locked
    // Note: Backend enforces that monthly_actual only locks Direct type
    // monthly_target locks both Direct and In direct types
    const fieldType = field === 'target_value' ? 'monthly_target' : 'monthly_actual';
    const lockInfo = getLockStatus(fieldType, departmentObjectiveId, month, isStrategic ? 'strategic' : 'bau');
    if (lockInfo.is_locked) {
      toast({
        title: 'Field Locked',
        description: lockInfo.lock_reason || 'This field is locked and cannot be edited',
        variant: 'destructive',
      });
      return;
    }

    const updated = new Map(data);
    const existing = updated.get(month) || emptyMonthRow(departmentObjectiveId, month, isStrategic ? 'strategic' : 'bau');
    
    const newValue = value === '' ? null : parseFloat(value) || null;
    
    updated.set(month, {
      ...existing,
      [field]: newValue,
    });
    
    setData(updated);
    
    // Mark month as unsaved when data changes
    setSaveStatus(prev => {
      const updated = new Map(prev);
      updated.set(month, 'unsaved');
      return updated;
    });
    
    // Clear any previous error for this month
    setFailedMonths(prev => {
      const updated = new Map(prev);
      updated.delete(month);
      return updated;
    });
  };

  const saveAll = async () => {
    // Prevent multiple simultaneous saves
    if (saving) {
      return;
    }

    // Check if user is authenticated
    if (!isAuthenticated()) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to save monthly data',
        variant: 'destructive',
      });
      return;
    }

    // Check for locked fields before saving
    // Note: Backend enforces that monthly_actual only locks Direct type
    // monthly_target locks both Direct and In direct types
    const lockedFields: string[] = [];
    MONTHS.forEach((month) => {
      const targetLocked = getLockStatus(
        'monthly_target',
        departmentObjectiveId,
        month,
        isStrategic ? 'strategic' : 'bau'
      ).is_locked;
      const actualLocked = getLockStatus(
        'monthly_actual',
        departmentObjectiveId,
        month,
        isStrategic ? 'strategic' : 'bau'
      ).is_locked;
      const monthData = data.get(month);
      const originalMonthData = originalData.get(month);
      
      // Check if field was changed and is locked
      if (monthData && originalMonthData) {
        if (monthData.target_value !== originalMonthData.target_value && targetLocked) {
          lockedFields.push(`${month} target`);
        }
        if (monthData.actual_value !== originalMonthData.actual_value && actualLocked) {
          lockedFields.push(`${month} actual`);
        }
      } else if (monthData) {
        // New data
          if (monthData.target_value !== null && targetLocked) {
            lockedFields.push(`${month} target`);
          }
          if (monthData.actual_value !== null && actualLocked) {
            lockedFields.push(`${month} actual`);
          }
        }
    });

    if (lockedFields.length > 0) {
      toast({
        title: 'Cannot Save',
        description: `The following fields are locked and cannot be edited: ${lockedFields.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const promises: Promise<MonthRow>[] = [];
      const monthsToSave: string[] = [];
      
      // Only save months that have been CHANGED (edited by user)
      // Compare current data with original data to detect changes
      MONTHS.forEach((month) => {
        const monthData = data.get(month);
        const originalMonthData = originalData.get(month);
        
        // Check if this month has been edited (changed from original)
        const hasChanged = monthData && (
          // New month (not in original data) with values
          (!originalMonthData && (monthData.target_value !== null || monthData.actual_value !== null)) ||
          // Existing month with changed values
          (originalMonthData && (
            monthData.target_value !== originalMonthData.target_value ||
            monthData.actual_value !== originalMonthData.actual_value
          ))
        );
        
        if (hasChanged) {
          monthsToSave.push(month);
          const monthIso = `${month}-01`;
          if (isStrategic) {
            promises.push(
              createOrUpdateStrategicMonthlyData({
                strategic_department_objective_id: departmentObjectiveId,
                month: monthIso,
                target_value: monthData.target_value,
                actual_value: monthData.actual_value,
              })
            );
          } else {
            promises.push(
              createOrUpdateMonthlyData({
                department_objective_id: departmentObjectiveId,
                month: monthIso,
                target_value: monthData.target_value,
                actual_value: monthData.actual_value,
              })
            );
          }
        }
      });
      
      if (promises.length === 0) {
        toast({
          title: 'No changes',
          description: 'No data to save. Please enter values before saving.',
        });
        setSaving(false);
        return;
      }
      
      // Track progress
      let completed = 0;
      const progressPromises = promises.map((promise, index) => {
        return promise
          .then(result => {
            completed++;
            setSaveProgress(Math.round((completed / promises.length) * 100));
            return result;
          })
          .catch(error => {
            completed++;
            setSaveProgress(Math.round((completed / promises.length) * 100));
            throw error;
          });
      });
      
      // Save all months in parallel using Promise.allSettled to handle partial failures
      const results = await Promise.allSettled(progressPromises);

      // Process results
      const savedData: MonthRow[] = [];
      const failed: Array<{ month: string; error: Error }> = [];
      
      results.forEach((result, index) => {
        const month = monthsToSave[index];
        if (result.status === 'fulfilled') {
          savedData.push(result.value);
          // Mark as saved
          setSaveStatus(prev => {
            const updated = new Map(prev);
            updated.set(month, 'saved');
            return updated;
          });
          setFailedMonths(prev => {
            const updated = new Map(prev);
            updated.delete(month);
            return updated;
          });
        } else {
          const error = result.reason instanceof Error ? result.reason : new Error('Save failed');
          failed.push({ month, error });
          // Mark as error
          setSaveStatus(prev => {
            const updated = new Map(prev);
            updated.set(month, 'error');
            return updated;
          });
          setFailedMonths(prev => {
            const updated = new Map(prev);
            updated.set(month, error);
            return updated;
          });
        }
      });
      
      // Update originalData and data for successfully saved months
      const updatedOriginal = new Map(originalData);
      const updatedData = new Map(data);
      savedData.forEach((saved) => {
        const monthKey = saved.month.substring(0, 7); // YYYY-MM
        updatedOriginal.set(monthKey, { ...saved });
        updatedData.set(monthKey, { ...saved });
      });
      setOriginalData(updatedOriginal);
      setData(updatedData);
      
      // Update progress
      setSaveProgress(100);
      
      // Show results
      if (failed.length === 0) {
        toast({
          title: 'Success',
          description: `Monthly data saved successfully for ${savedData.length} month(s)`,
        });
        // Close modal after successful save
        setTimeout(() => setOpen(false), 1000);
      } else if (savedData.length > 0) {
        const friendlyErrors = failed.map(f => {
          const apiError = { message: f.error.message, status: errStatus(f.error) };
          return getUserFriendlyError(apiError);
        });
        toast({
          title: 'Partial Success',
          description: `Saved ${savedData.length} month(s), but ${failed.length} failed. Click "Retry Failed" to try again.`,
          variant: 'default',
        });
      } else {
        const friendlyError = getUserFriendlyError({ 
          message: failed[0].error.message, 
          status: errStatus(failed[0].error) 
        });
        toast({
          title: 'Save Failed',
          description: friendlyError.description || 'Failed to save monthly data. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('[MonthlyDataEditor] Error saving monthly data:', err);
      const error = err instanceof Error ? err : new Error('Failed to save monthly data');
      const friendlyError = getUserFriendlyError({ 
        message: error.message, 
        status: errStatus(err) 
      });
      
      toast({
        title: friendlyError.title || 'Error',
        description: friendlyError.description || error.message,
        variant: 'destructive',
      });
      
      // Reset progress
      setSaveProgress(0);
    } finally {
      setSaving(false);
    }
  };

  // Retry failed saves
  const retryFailed = async () => {
    if (failedMonths.size === 0) {
      toast({
        title: 'No Failed Saves',
        description: 'All months have been saved successfully.',
      });
      return;
    }

    try {
      setSaving(true);
      setSaveProgress(0);
      
      const retryPromises: Promise<MonthRow>[] = [];
      const monthsToRetry: string[] = [];
      
      failedMonths.forEach((error, month) => {
        const monthData = data.get(month);
        if (!monthData) return;
        
        const monthIso = `${month}-01`;
        monthsToRetry.push(month);
        if (isStrategic) {
          retryPromises.push(
            createOrUpdateStrategicMonthlyData({
              strategic_department_objective_id: departmentObjectiveId,
              month: monthIso,
              target_value: monthData.target_value,
              actual_value: monthData.actual_value,
            })
          );
        } else {
          retryPromises.push(
            createOrUpdateMonthlyData({
              department_objective_id: departmentObjectiveId,
              month: monthIso,
              target_value: monthData.target_value,
              actual_value: monthData.actual_value,
            })
          );
        }
      });
      
      if (retryPromises.length === 0) {
        setSaving(false);
        return;
      }
      
      const results = await Promise.allSettled(retryPromises);
      
      const saved: MonthRow[] = [];
      const stillFailed: Array<{ month: string; error: Error }> = [];
      
      results.forEach((result, index) => {
        const month = monthsToRetry[index];
        if (result.status === 'fulfilled') {
          saved.push(result.value);
          setSaveStatus(prev => {
            const updated = new Map(prev);
            updated.set(month, 'saved');
            return updated;
          });
          setFailedMonths(prev => {
            const updated = new Map(prev);
            updated.delete(month);
            return updated;
          });
        } else {
          const error = result.reason instanceof Error ? result.reason : new Error('Save failed');
          stillFailed.push({ month, error });
          setFailedMonths(prev => {
            const updated = new Map(prev);
            updated.set(month, error);
            return updated;
          });
        }
      });
      
      // Update data for successfully saved months
      const updatedOriginal = new Map(originalData);
      const updatedData = new Map(data);
      saved.forEach((savedItem) => {
        const monthKey = savedItem.month.substring(0, 7);
        updatedOriginal.set(monthKey, { ...savedItem });
        updatedData.set(monthKey, { ...savedItem });
      });
      setOriginalData(updatedOriginal);
      setData(updatedData);
      
      if (stillFailed.length === 0) {
        toast({
          title: 'Success',
          description: `All failed months have been saved successfully.`,
        });
      } else {
        toast({
          title: 'Partial Success',
          description: `Retried ${saved.length} month(s), but ${stillFailed.length} still failed.`,
          variant: 'default',
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Retry failed');
      const friendlyError = getUserFriendlyError({ 
        message: error.message, 
        status: errStatus(err) 
      });
      toast({
        title: friendlyError.title || 'Error',
        description: friendlyError.description || error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
      setSaveProgress(0);
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
      <DialogContent className="flex max-h-[90vh] w-[min(calc(100vw-1.5rem),52rem)] max-w-[min(calc(100vw-1.5rem),52rem)] flex-col gap-0 overflow-hidden p-0 sm:!max-w-[min(calc(100vw-2rem),52rem)] sm:!w-[min(calc(100vw-2rem),52rem)]">
        <DialogHeader className="flex-shrink-0 space-y-4 border-b px-4 pb-4 pt-4 md:px-6 md:pb-5 md:pt-6">
          <DialogTitle className="text-left text-base md:text-lg">
            Monthly Data (1/2026 - 6/2027)
          </DialogTitle>
          <div
            className="grid grid-cols-4 gap-2 border-t border-border/70 pt-4 font-medium md:gap-6 md:[grid-template-columns:minmax(7rem,1.05fr)_minmax(11rem,1.35fr)_minmax(11rem,1.35fr)_minmax(9rem,1fr)]"
            role="row"
          >
            <div className="min-w-0 self-end text-xs uppercase tracking-wide text-muted-foreground md:text-sm md:normal-case md:tracking-normal">
              Month
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 self-end text-xs text-muted-foreground md:text-sm">
              <span className="font-medium text-foreground">Target</span>
              {mapping?.target_source === 'pms_target' && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                  <Database className="h-3 w-3 shrink-0" aria-hidden />
                  PMS
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 self-end text-xs text-muted-foreground md:text-sm">
              <span className="font-medium text-foreground">Actual</span>
              {mapping?.actual_source === 'pms_actual' && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                  <Database className="h-3 w-3 shrink-0" aria-hidden />
                  PMS
                </span>
              )}
              {(mapping?.actual_source === 'odoo_services_done' ||
                mapping?.actual_source === 'odoo_services_created') && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                  <Cloud className="h-3 w-3 shrink-0" aria-hidden />
                  Odoo
                </span>
              )}
            </div>
            <div className="min-w-0 self-end text-right text-xs uppercase tracking-wide text-muted-foreground md:text-sm md:normal-case md:tracking-normal">
              Variance
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            <>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-6">
              <div className="space-y-1 md:space-y-2">
                {MONTHS.map((month) => {
                  const monthData =
                    data.get(month) || emptyMonthRow(departmentObjectiveId, month, isStrategic ? 'strategic' : 'bau');
                  
                  const variance =
                    monthData.target_value !== null && monthData.actual_value !== null
                      ? monthData.actual_value - monthData.target_value
                      : null;
                  
                  const monthLabel = format(parse(month, 'yyyy-MM', new Date()), 'MMM yyyy');
                  
                  // Check lock status for this month's fields
                  // Note: Backend enforces that monthly_actual only locks Direct type
                  // monthly_target locks both Direct and In direct types
                  const targetLockInfo = getLockStatus(
                    'monthly_target',
                    departmentObjectiveId,
                    month,
                    isStrategic ? 'strategic' : 'bau'
                  );
                  const actualLockInfo = getLockStatus(
                    'monthly_actual',
                    departmentObjectiveId,
                    month,
                    isStrategic ? 'strategic' : 'bau'
                  );
                  const isTargetLocked = targetLockInfo.is_locked;
                  const isActualLocked = actualLockInfo.is_locked;

                  const targetFromPms = mapping?.target_source === 'pms_target' || (isTargetLocked && targetLockInfo.lock_reason?.includes('PMS Target'));
                  const actualFromPms = mapping?.actual_source === 'pms_actual' || (isActualLocked && actualLockInfo.lock_reason?.includes('PMS Actual'));
                  const actualFromOdoo = (mapping?.actual_source === 'odoo_services_done' || mapping?.actual_source === 'odoo_services_created') || (isActualLocked && actualLockInfo.lock_reason?.toLowerCase().includes('odoo'));

                  return (
                    <div
                      key={month}
                      className="grid grid-cols-4 gap-2 border-b border-border/60 py-2 md:gap-6 md:[grid-template-columns:minmax(7rem,1.05fr)_minmax(11rem,1.35fr)_minmax(11rem,1.35fr)_minmax(9rem,1fr)] md:py-2.5"
                    >
                      <div className="min-w-0 font-medium">{monthLabel}</div>
                      <div className="relative flex min-w-0 items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="relative flex-1 min-w-0">
                                <Input
                                  type="number"
                                  id={`target-${month}`}
                                  name={`target-${month}`}
                                  autoComplete="off"
                                  value={monthData.target_value?.toString() || ''}
                                  onChange={(e) => updateMonthData(month, 'target_value', e.target.value)}
                                  placeholder="Target"
                                  className="min-h-11 min-w-0 w-full text-right text-base tabular-nums md:min-h-10"
                                  disabled={isTargetLocked}
                                  readOnly={isTargetLocked}
                                  aria-label={`Target value for ${monthLabel}`}
                                />
                                {isTargetLocked && (
                                  <LockIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            </TooltipTrigger>
                            {isTargetLocked && targetLockInfo.lock_reason && (
                              <TooltipContent>
                                <p>{targetLockInfo.lock_reason}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        {targetFromPms && (
                          <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border border-blue-200 dark:border-blue-700">
                            <Database className="h-3.5 w-3.5" aria-hidden />
                            <span>PMS</span>
                          </span>
                        )}
                      </div>
                      <div className="relative flex min-w-0 items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="relative min-w-0 flex-1">
                                <Input
                                  type="number"
                                  id={`actual-${month}`}
                                  name={`actual-${month}`}
                                  autoComplete="off"
                                  value={monthData.actual_value?.toString() || ''}
                                  onChange={(e) => updateMonthData(month, 'actual_value', e.target.value)}
                                  placeholder="Actual"
                                  className="min-h-11 min-w-0 w-full text-right text-base tabular-nums md:min-h-10"
                                  disabled={isActualLocked}
                                  readOnly={isActualLocked}
                                  aria-label={`Actual value for ${monthLabel}`}
                                />
                                {isActualLocked && (
                                  <LockIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            </TooltipTrigger>
                            {isActualLocked && actualLockInfo.lock_reason && (
                              <TooltipContent>
                                <p>{actualLockInfo.lock_reason}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        {actualFromPms && (
                          <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border border-blue-200 dark:border-blue-700">
                            <Database className="h-3.5 w-3.5" aria-hidden />
                            <span>PMS</span>
                          </span>
                        )}
                        {actualFromOdoo && (
                          <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700">
                            <Cloud className="h-3.5 w-3.5" aria-hidden />
                            <span>Odoo</span>
                          </span>
                        )}
                      </div>
                      <div className="flex min-w-0 items-center justify-end gap-2 text-right text-base tabular-nums text-muted-foreground md:text-sm">
                        <span className="min-w-0 break-all text-right">
                          {variance !== null ? (variance >= 0 ? '+' : '') + variance.toFixed(2) : '-'}
                        </span>
                        {(() => {
                          const status = saveStatus.get(month);
                          if (status === 'saved') {
                            return (
                              <CheckCircle2
                                className="h-4 w-4 shrink-0 text-green-500"
                                aria-label="Saved"
                              />
                            );
                          }
                          if (status === 'error') {
                            return (
                              <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-label="Save failed" />
                            );
                          }
                          if (status === 'unsaved') {
                            return (
                              <AlertCircle
                                className="h-4 w-4 shrink-0 text-yellow-500"
                                aria-label="Unsaved changes"
                              />
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="flex flex-shrink-0 flex-col gap-2 border-t bg-background px-4 pb-6 pt-4 md:px-6">
              {saving && saveProgress > 0 && (
                <div className="w-full">
                  <Progress value={saveProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    Saving... {saveProgress}%
                  </p>
                </div>
              )}
              
              {failedMonths.size > 0 && !saving && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-2">
                  <p className="text-sm text-destructive font-medium">
                    {failedMonths.size} month(s) failed to save. Click "Retry Failed" to try again.
                  </p>
                </div>
              )}
              
              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setOpen(false)} 
                  disabled={saving}
                  aria-label="Close monthly data"
                  title="Close"
                >
                  Close
                </Button>
                {failedMonths.size > 0 && !saving && (
                  <Button 
                    type="button" 
                    onClick={retryFailed}
                    variant="outline"
                    aria-label="Retry failed saves"
                  >
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Retry Failed ({failedMonths.size})
                  </Button>
                )}
                <Button 
                  type="button" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    saveAll();
                  }} 
                  disabled={saving} 
                  aria-label="Save all monthly data" 
                  title="Save all monthly data"
                  variant="secondary"
                >
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
            </>
          </TooltipProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}

