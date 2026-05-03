import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLockStatus } from '@/hooks/useLockStatus';
import { toast } from '@/hooks/use-toast';
import { Loader2, Lock as LockIcon } from 'lucide-react';
import KPISelector from '@/components/wig/KPISelector';
import type { DepartmentObjective, MainPlanObjective } from '@/types/wig';
import { cn } from '@/lib/utils';

const KPI_DELIMITER = '||';
const TYPE_DELIMITER = '||';

function canViewStrategicSensitiveFormFields(role: string | undefined): boolean {
  const r = (role ?? '').trim().toLowerCase();
  return r === 'admin' || r === 'ceo';
}

interface ObjectiveFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  initialData?: Partial<DepartmentObjective> & {
    definition?: string | null;
    measurement_aspect?: string | null;
    meeting_notes?: string | null;
    me_e?: string | null;
    active?: string | null;
    notes?: string | null;
    main_objective_ids?: number[];
  };
  onSave: (data: Partial<DepartmentObjective>) => Promise<void>;
  existingResponsiblePersons?: string[];
  objectiveKind?: 'bau' | 'strategic';
  mainPlanObjectives?: MainPlanObjective[];
  userRole?: string;
}

export default function ObjectiveFormModal({
  open,
  onOpenChange,
  mode,
  initialData,
  onSave,
  existingResponsiblePersons = [],
  objectiveKind = 'bau',
  mainPlanObjectives = [],
  userRole,
}: ObjectiveFormModalProps) {
  const isStrategic = objectiveKind === 'strategic';
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [kpis, setKpis] = useState<string[]>([]);
  const [activity, setActivity] = useState('');
  const [kpiTypes, setKpiTypes] = useState<Record<number, 'Direct' | 'In direct'>>({});
  const [activityTarget, setActivityTarget] = useState<number>(0);
  const [targetType, setTargetType] = useState<'number' | 'percentage'>('number');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [mov, setMov] = useState('');
  const [responsibleSuggestions, setResponsibleSuggestions] = useState<string[]>([]);
  const [showResponsibleSuggestions, setShowResponsibleSuggestions] = useState(false);
  const [definition, setDefinition] = useState('');
  const [measurementAspect, setMeasurementAspect] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meE, setMeE] = useState('');
  const [active, setActive] = useState('');
  const [notes, setNotes] = useState('');
  /** Strategic: single main-plan objective linked to KPI picker */
  const [pickedMainPlanId, setPickedMainPlanId] = useState<number | null>(null);
  
  // Parse KPI string to array
  const parseKPIs = (kpiStr: string | undefined | null): string[] => {
    if (kpiStr == null || kpiStr === '') return [];
    if (kpiStr.includes(KPI_DELIMITER)) {
      return kpiStr.split(KPI_DELIMITER).filter(k => k.trim());
    }
    return [kpiStr];
  };

  // Parse type string to array
  const parseTypes = (typeStr: string | undefined): string[] => {
    if (!typeStr) return [];
    if (typeStr.includes(TYPE_DELIMITER)) {
      return typeStr.split(TYPE_DELIMITER).filter(t => t.trim());
    }
    return [typeStr];
  };

  // Determine objective type directly from initialData using useMemo
  // This ensures lock checks have the correct type from the start
  const objectiveType = useMemo(() => {
    if (!open || !initialData) return null;
    const parsedTypes = parseTypes(initialData.type || '');
    const type = (parsedTypes[0] || initialData.type || 'Direct') as 'Direct' | 'In direct' | 'M&E' | 'M&E MOV' | '';
    console.log('[ObjectiveFormModal] Computed objective type:', {
      open,
      objectiveId: initialData?.id,
      rawType: initialData?.type,
      parsedTypes,
      finalType: type,
    });
    return type;
  }, [open, initialData]);

  // Check lock status for target field (applies to both Direct and In direct types)
  // Note: Target field locks work for both Direct and In direct objectives
  const { isLocked: isTargetLocked, lockInfo: targetLockInfo } = useLockStatus(
    'target',
    initialData?.id || null,
    undefined,
    open && mode === 'edit' && !!initialData?.id && !!objectiveType,
    isStrategic ? 'strategic' : 'bau'
  );

  // Check if ANY field is locked by "All Department Objectives" lock
  // This covers activity, responsible_person, mov, and other fields
  // Note: all_fields locks work for both Direct and In direct objectives
  const { isLocked: isAllFieldsLocked, lockInfo: allFieldsLockInfo } = useLockStatus(
    'all_fields',
    initialData?.id || null,
    undefined,
    open && mode === 'edit' && !!initialData?.id && !!objectiveType,
    isStrategic ? 'strategic' : 'bau'
  );

  // Initialize form data
  useEffect(() => {
    if (open && initialData) {
      const parsedKPIs = parseKPIs(initialData.kpi);
      const parsedTypes = parseTypes(initialData.type || '');
      
      setKpis(parsedKPIs);
      setActivity(initialData.activity || '');
      setActivityTarget(initialData.activity_target || 0);
      setTargetType(initialData.target_type || 'number');
      setResponsiblePerson(initialData.responsible_person || '');
      setMov(initialData.mov || '');
      setDefinition((initialData as { definition?: string }).definition || '');
      setMeasurementAspect((initialData as { measurement_aspect?: string }).measurement_aspect || '');
      setMeetingNotes((initialData as { meeting_notes?: string }).meeting_notes || '');
      setMeE((initialData as { me_e?: string }).me_e || '');
      setActive((initialData as { active?: string }).active || '');
      setNotes((initialData as { notes?: string }).notes || '');
      setPickedMainPlanId(
        isStrategic ? ((initialData.main_objective_id as number | null | undefined) ?? null) : null
      );

      // Initialize KPI types
      const typesMap: Record<number, 'Direct' | 'In direct'> = {};
      parsedKPIs.forEach((kpi, index) => {
        const type = parsedTypes[index] || parsedTypes[0] || 'Direct';
        typesMap[index] = (type === 'Direct' || type === 'In direct') ? type : 'Direct';
      });
      setKpiTypes(typesMap);
    } else if (open && mode === 'add') {
      // Reset form for add mode
      setKpis([]);
      setActivity('');
      setKpiTypes({});
      setActivityTarget(0);
      setTargetType('number');
      setResponsiblePerson('');
      setMov('');
      setDefinition('');
      setMeasurementAspect('');
      setMeetingNotes('');
      setMeE('');
      setActive('');
      setNotes('');
      setPickedMainPlanId(null);
    }
  }, [open, initialData, mode, isStrategic]);

  // Auto-focus first input when modal opens
  useEffect(() => {
    if (open && firstInputRef.current) {
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // Handle KPI selection change
  const handleMainPlanObjectivePick = (m: MainPlanObjective | null) => {
    setPickedMainPlanId(m?.id ?? null);
    if (m) {
      setActivity((prev) => (prev.trim() ? prev : m.objective || ''));
      setActivityTarget((prev) => {
        if (prev > 0) return prev;
        const n = Number(m.annual_target);
        return Number.isFinite(n) ? Math.round(n * 10) / 10 : prev;
      });
      setTargetType(String(m.target).includes('%') ? 'percentage' : 'number');
    }
  };

  const handleKPIChange = (value: string | string[]) => {
    const newKPIs = Array.isArray(value)
      ? value.map((s) => String(s).trim()).filter(Boolean)
      : String(value ?? '').trim()
        ? [String(value).trim()]
        : [];
    setKpis(newKPIs);
    
    // Initialize types for new KPIs
    const newTypes: Record<number, 'Direct' | 'In direct'> = {};
    newKPIs.forEach((_, index) => {
      if (kpiTypes[index] !== undefined) {
        newTypes[index] = kpiTypes[index];
      } else {
        // Use first existing type or default to Direct
        const existingType = Object.values(kpiTypes)[0] || 'Direct';
        newTypes[index] = existingType;
      }
    });
    setKpiTypes(newTypes);
  };

  // Handle responsible person input with autocomplete
  const handleResponsiblePersonChange = (value: string) => {
    setResponsiblePerson(value);
    if (value.trim() && existingResponsiblePersons.length > 0) {
      const filtered = existingResponsiblePersons
        .filter(p => p.toLowerCase().includes(value.toLowerCase()) && p !== value)
        .slice(0, 5);
      setResponsibleSuggestions(filtered);
      setShowResponsibleSuggestions(filtered.length > 0);
    } else {
      setShowResponsibleSuggestions(false);
    }
  };

  const handleSelectResponsibleSuggestion = (suggestion: string) => {
    setResponsiblePerson(suggestion);
    setShowResponsibleSuggestions(false);
  };

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!isStrategic && kpis.length === 0) {
      newErrors.kpi = 'Please select at least one KPI';
    }

    if (!isStrategic && !activity.trim()) {
      newErrors.activity = 'Activity is required';
    }

    if (!isStrategic && activityTarget <= 0) {
      newErrors.activityTarget = 'Target must be greater than 0';
    }
    if (isStrategic && activityTarget < 0) {
      newErrors.activityTarget = 'Target cannot be negative';
    }

    if (!isStrategic && !responsiblePerson.trim()) {
      newErrors.responsiblePerson = 'Responsible person is required';
    }

    if (!isStrategic && !mov.trim()) {
      newErrors.mov = 'MOV is required';
    }

    // Validate all KPIs have types (BAU multi-KPI only)
    if (!isStrategic) {
      kpis.forEach((_, index) => {
        if (!kpiTypes[index]) {
          newErrors[`kpiType_${index}`] = 'Type is required for each KPI';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle save
  const handleSave = async () => {
    if (!validate()) {
      // Scroll to first error
      const firstError = Object.keys(errors)[0];
      if (firstError) {
        const element = document.querySelector(`[data-field="${firstError}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Check for locks before saving (for edit mode, applies to both Direct and In direct)
    if (mode === 'edit') {
      // Check annual target lock separately (respects exclude_annual_target)
      if (isTargetLocked) {
        toast({
          title: 'Cannot Save',
          description: targetLockInfo?.lock_reason || 'The target field is locked and cannot be modified.',
          variant: 'destructive',
        });
        return;
      }
      // Check other fields lock (activity, responsible, mov, etc.)
      if (isAllFieldsLocked) {
        toast({
          title: 'Cannot Save',
          description: allFieldsLockInfo?.lock_reason || 'One or more fields are locked and cannot be modified.',
          variant: 'destructive',
        });
        return;
      }
    }

    setLoading(true);
    try {
      // Build type string: if multiple KPIs, use delimiter; otherwise single value
      const typeString = kpis.length > 1
        ? kpis.map((_, index) => kpiTypes[index] || 'Direct').join(TYPE_DELIMITER)
        : (kpiTypes[0] || 'Direct');

      const saveData: Partial<DepartmentObjective> & {
        definition?: string | null;
        measurement_aspect?: string | null;
        meeting_notes?: string | null;
        me_e?: string | null;
        active?: string | null;
        notes?: string | null;
        main_objective_ids?: number[];
      } = {
        kpi: kpis.join(KPI_DELIMITER),
        activity: activity.trim(),
        type: typeString as 'Direct' | 'In direct',
        activity_target: activityTarget,
        target_type: targetType,
        responsible_person: responsiblePerson.trim(),
        mov: mov.trim(),
        ...(initialData?.id && { id: initialData.id }),
        ...(!isStrategic &&
          initialData?.main_objective_id !== undefined && {
            main_objective_id: initialData.main_objective_id,
          }),
        ...(initialData?.department_id !== undefined && { department_id: initialData.department_id }),
      };

      if (isStrategic) {
        const joined = kpis.join(KPI_DELIMITER);
        saveData.kpi = joined.trim() === '' ? null : joined;
        saveData.activity = activity.trim() === '' ? null : activity.trim();
        saveData.definition = definition.trim() || null;
        saveData.measurement_aspect = measurementAspect.trim() || null;
        saveData.meeting_notes = meetingNotes.trim() || null;
        saveData.me_e = meE.trim() || null;
        saveData.active = active.trim() || null;
        saveData.notes = notes.trim() || null;
        saveData.main_objective_id = pickedMainPlanId ?? null;
        saveData.main_objective_ids = pickedMainPlanId != null ? [pickedMainPlanId] : [];
      }

      await onSave(saveData);
      
      // Show success message before closing
      toast({
        title: 'Success',
        description: mode === 'add' ? 'Objective created successfully' : 'Objective updated successfully',
      });
      
      // Wait a moment to show success, then close
      setTimeout(() => {
        onOpenChange(false);
      }, 500);
    } catch (error) {
      console.error('Error saving objective:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save objective';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      // Don't close modal on error - let user retry
    } finally {
      setLoading(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOpenChange(false);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  // Prevent closing during save
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && loading) {
      toast({
        title: 'Saving in progress',
        description: 'Please wait for the save operation to complete.',
        variant: 'default',
      });
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add Objective' : 'Edit Objective'}</DialogTitle>
          <DialogDescription>
            {mode === 'add' 
              ? 'Create a new department objective. Fill in all required fields.'
              : 'Update the department objective. Modify the fields as needed.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* KPI Selector */}
          <div className="space-y-2" data-field="kpi">
            <Label htmlFor="kpi-selector">
              {isStrategic ? 'KPI (main plan)' : 'KPI'}{' '}
              {!isStrategic && <span className="text-destructive">*</span>}
              {mode === 'edit' && isAllFieldsLocked && (
                <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
              )}
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <KPISelector
                      kpiSource={isStrategic ? 'mainplan' : 'rasci'}
                      mainPlanObjectives={mainPlanObjectives}
                      selectedMainPlanObjectiveId={isStrategic ? pickedMainPlanId : null}
                      onMainPlanObjectiveChange={isStrategic ? handleMainPlanObjectivePick : undefined}
                      multiple={!isStrategic}
                      value={kpis}
                      onValueChange={(value) => {
                        if (mode === 'edit' && isAllFieldsLocked) {
                          toast({
                            title: 'Field Locked',
                            description: allFieldsLockInfo?.lock_reason || 'This field is locked and cannot be edited',
                            variant: 'destructive',
                          });
                          return;
                        }
                        handleKPIChange(value);
                      }}
                      placeholder={
                        isStrategic ? 'Select KPI from main plan objectives' : 'Select one or more KPIs'
                      }
                      disabled={mode === 'edit' && isAllFieldsLocked}
                    />
                    {mode === 'edit' && isAllFieldsLocked && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                        <LockIcon className="w-4 h-4 text-orange-600" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                {mode === 'edit' && isAllFieldsLocked && allFieldsLockInfo?.lock_reason && (
                  <TooltipContent>
                    <p>{allFieldsLockInfo.lock_reason}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {errors.kpi && (
              <p className="text-sm text-destructive">{errors.kpi}</p>
            )}
          </div>

          {/* Per-KPI Type Selection */}
          {kpis.length > 1 && (
            <div className="space-y-2">
              <Label>Type for each KPI <span className="text-destructive">*</span>
                {mode === 'edit' && isAllFieldsLocked && (
                  <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
                )}
              </Label>
              <div className="space-y-3 p-4 border rounded-md bg-muted/50">
                {kpis.map((kpi, index) => (
                  <div key={index} className="flex items-center gap-4" data-field={`kpiType_${index}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" title={kpi}>
                        {kpi}
                      </p>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative">
                            <Select
                              value={kpiTypes[index] || 'Direct'}
                              onValueChange={(value: 'Direct' | 'In direct') => {
                                if (mode === 'edit' && isAllFieldsLocked) {
                                  toast({
                                    title: 'Field Locked',
                                    description: allFieldsLockInfo?.lock_reason || 'This field is locked and cannot be edited',
                                    variant: 'destructive',
                                  });
                                  return;
                                }
                                setKpiTypes({ ...kpiTypes, [index]: value });
                              }}
                              disabled={mode === 'edit' && isAllFieldsLocked}
                            >
                              <SelectTrigger className="w-[150px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Direct">Direct</SelectItem>
                                <SelectItem value="In direct">In direct</SelectItem>
                              </SelectContent>
                            </Select>
                            {mode === 'edit' && isAllFieldsLocked && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                                <LockIcon className="w-4 h-4 text-orange-600" />
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        {mode === 'edit' && isAllFieldsLocked && allFieldsLockInfo?.lock_reason && (
                          <TooltipContent>
                            <p>{allFieldsLockInfo.lock_reason}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                    {errors[`kpiType_${index}`] && (
                      <p className="text-sm text-destructive">{errors[`kpiType_${index}`]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Single KPI Type Selection */}
          {kpis.length === 1 && (
            <div className="space-y-2" data-field="type">
              <Label htmlFor="type-selector">
                Type <span className="text-destructive">*</span>
                {mode === 'edit' && isAllFieldsLocked && (
                  <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
                )}
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative">
                      <Select
                        value={kpiTypes[0] || 'Direct'}
                        onValueChange={(value: 'Direct' | 'In direct') => {
                          if (mode === 'edit' && isAllFieldsLocked) {
                            toast({
                              title: 'Field Locked',
                              description: allFieldsLockInfo?.lock_reason || 'This field is locked and cannot be edited',
                              variant: 'destructive',
                            });
                            return;
                          }
                          setKpiTypes({ 0: value });
                        }}
                        disabled={mode === 'edit' && isAllFieldsLocked}
                      >
                        <SelectTrigger id="type-selector">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Direct">Direct</SelectItem>
                          <SelectItem value="In direct">In direct</SelectItem>
                        </SelectContent>
                      </Select>
                      {mode === 'edit' && isAllFieldsLocked && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                          <LockIcon className="w-4 h-4 text-orange-600" />
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  {mode === 'edit' && isAllFieldsLocked && allFieldsLockInfo?.lock_reason && (
                    <TooltipContent>
                      <p>{allFieldsLockInfo.lock_reason}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Activity */}
          <div className="space-y-2" data-field="activity">
            <Label htmlFor="activity">
              Activity {!isStrategic && <span className="text-destructive">*</span>}
              {mode === 'edit' && isAllFieldsLocked && (
                <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
              )}
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Textarea
                      id="activity"
                      ref={firstInputRef}
                      value={activity}
                      onChange={(e) => {
                        if (mode === 'edit' && isAllFieldsLocked) {
                          toast({
                            title: 'Field Locked',
                            description: allFieldsLockInfo?.lock_reason || 'This field is locked and cannot be edited',
                            variant: 'destructive',
                          });
                          return;
                        }
                        setActivity(e.target.value);
                      }}
                      placeholder="Enter activity description"
                      rows={3}
                      className={cn(
                        errors.activity && 'border-destructive',
                        mode === 'edit' && isAllFieldsLocked && 'pr-10'
                      )}
                      disabled={mode === 'edit' && isAllFieldsLocked}
                      readOnly={mode === 'edit' && isAllFieldsLocked}
                    />
                    {mode === 'edit' && isAllFieldsLocked && (
                      <div className="absolute right-3 top-3 flex items-center gap-1">
                        <LockIcon className="w-4 h-4 text-orange-600" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                {mode === 'edit' && isAllFieldsLocked && allFieldsLockInfo?.lock_reason && (
                  <TooltipContent>
                    <p>{allFieldsLockInfo.lock_reason}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {errors.activity && (
              <p className="text-sm text-destructive">{errors.activity}</p>
            )}
          </div>

          {/* Target and Target Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2" data-field="activityTarget">
              <Label htmlFor="activity-target">
                Target {!isStrategic && <span className="text-destructive">*</span>}
                {mode === 'edit' && isTargetLocked && (
                  <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
                )}
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative">
                      <Input
                        id="activity-target"
                        type="number"
                        value={activityTarget || ''}
                        onChange={(e) => {
                          // Check if locked before allowing edit (applies to both Direct and In direct)
                          // Annual target only checks isTargetLocked (not isAllFieldsLocked) to respect exclude_annual_target
                          if (mode === 'edit' && isTargetLocked) {
                            toast({
                              title: 'Field Locked',
                              description: targetLockInfo?.lock_reason || 'This field is locked and cannot be edited',
                              variant: 'destructive',
                            });
                            return;
                          }
                          setActivityTarget(parseFloat(e.target.value) || 0);
                        }}
                        placeholder="Enter target value"
                        className={cn(
                          errors.activityTarget && 'border-destructive',
                          mode === 'edit' && isTargetLocked && 'pr-10'
                        )}
                        disabled={mode === 'edit' && isTargetLocked}
                        readOnly={mode === 'edit' && isTargetLocked}
                      />
                      {mode === 'edit' && isTargetLocked && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <LockIcon className="w-4 h-4 text-orange-600" />
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  {mode === 'edit' && isTargetLocked && targetLockInfo?.lock_reason && (
                    <TooltipContent>
                      <p>{targetLockInfo.lock_reason}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              {errors.activityTarget && (
                <p className="text-sm text-destructive">{errors.activityTarget}</p>
              )}
            </div>
            <div className="space-y-2" data-field="targetType">
              <Label htmlFor="target-type">
                Target Type {!isStrategic && <span className="text-destructive">*</span>}
                {mode === 'edit' && isTargetLocked && (
                  <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
                )}
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative">
                      <Select
                        value={targetType}
                        onValueChange={(value: 'number' | 'percentage') => {
                          // Check if locked before allowing edit
                          // Target type follows the same lock as annual target (respects exclude_annual_target)
                          if (mode === 'edit' && isTargetLocked) {
                            toast({
                              title: 'Field Locked',
                              description: targetLockInfo?.lock_reason || 'This field is locked and cannot be edited',
                              variant: 'destructive',
                            });
                            return;
                          }
                          setTargetType(value);
                        }}
                        disabled={mode === 'edit' && isTargetLocked}
                      >
                        <SelectTrigger id="target-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="percentage">Percentage</SelectItem>
                        </SelectContent>
                      </Select>
                      {mode === 'edit' && isTargetLocked && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                          <LockIcon className="w-4 h-4 text-orange-600" />
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  {mode === 'edit' && isTargetLocked && targetLockInfo?.lock_reason && (
                    <TooltipContent>
                      <p>{targetLockInfo.lock_reason}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Responsible Person with Autocomplete */}
          <div className="space-y-2 relative" data-field="responsiblePerson">
            <Label htmlFor="responsible-person">
              Responsible Person <span className="text-destructive">*</span>
              {mode === 'edit' && isAllFieldsLocked && (
                <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
              )}
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Input
                      id="responsible-person"
                      value={responsiblePerson}
                      onChange={(e) => {
                        if (mode === 'edit' && isAllFieldsLocked) {
                          toast({
                            title: 'Field Locked',
                            description: allFieldsLockInfo?.lock_reason || 'This field is locked and cannot be edited',
                            variant: 'destructive',
                          });
                          return;
                        }
                        handleResponsiblePersonChange(e.target.value);
                      }}
                      onFocus={() => {
                        if (responsiblePerson.trim() && existingResponsiblePersons.length > 0) {
                          const filtered = existingResponsiblePersons
                            .filter(p => p.toLowerCase().includes(responsiblePerson.toLowerCase()) && p !== responsiblePerson)
                            .slice(0, 5);
                          setResponsibleSuggestions(filtered);
                          setShowResponsibleSuggestions(filtered.length > 0);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow clicking on suggestions
                        setTimeout(() => setShowResponsibleSuggestions(false), 200);
                      }}
                      placeholder="Enter responsible person"
                      className={cn(
                        errors.responsiblePerson && 'border-destructive',
                        mode === 'edit' && isAllFieldsLocked && 'pr-10'
                      )}
                      disabled={mode === 'edit' && isAllFieldsLocked}
                      readOnly={mode === 'edit' && isAllFieldsLocked}
                    />
                    {mode === 'edit' && isAllFieldsLocked && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <LockIcon className="w-4 h-4 text-orange-600" />
                      </div>
                    )}
                    {showResponsibleSuggestions && responsibleSuggestions.length > 0 && !isAllFieldsLocked && (
                      <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-md">
                        {responsibleSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                            onClick={() => handleSelectResponsibleSuggestion(suggestion)}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                {mode === 'edit' && isAllFieldsLocked && allFieldsLockInfo?.lock_reason && (
                  <TooltipContent>
                    <p>{allFieldsLockInfo.lock_reason}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {errors.responsiblePerson && (
              <p className="text-sm text-destructive">{errors.responsiblePerson}</p>
            )}
          </div>

          {/* MOV */}
          <div className="space-y-2" data-field="mov">
            <Label htmlFor="mov">
              MOV (Means of Verification){' '}
              {!isStrategic && <span className="text-destructive">*</span>}
              {mode === 'edit' && isAllFieldsLocked && (
                <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
              )}
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Textarea
                      id="mov"
                      value={mov}
                      onChange={(e) => {
                        if (mode === 'edit' && isAllFieldsLocked) {
                          toast({
                            title: 'Field Locked',
                            description: allFieldsLockInfo?.lock_reason || 'This field is locked and cannot be edited',
                            variant: 'destructive',
                          });
                          return;
                        }
                        setMov(e.target.value);
                      }}
                      placeholder="Enter means of verification"
                      rows={3}
                      className={cn(
                        errors.mov && 'border-destructive',
                        mode === 'edit' && isAllFieldsLocked && 'pr-10'
                      )}
                      disabled={mode === 'edit' && isAllFieldsLocked}
                      readOnly={mode === 'edit' && isAllFieldsLocked}
                    />
                    {mode === 'edit' && isAllFieldsLocked && (
                      <div className="absolute right-3 top-3 flex items-center gap-1">
                        <LockIcon className="w-4 h-4 text-orange-600" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                {mode === 'edit' && isAllFieldsLocked && allFieldsLockInfo?.lock_reason && (
                  <TooltipContent>
                    <p>{allFieldsLockInfo.lock_reason}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {errors.mov && (
              <p className="text-sm text-destructive">{errors.mov}</p>
            )}
          </div>

          {isStrategic && (
            <div className="space-y-4 border-t pt-4 w-full">
              <div className="space-y-2">
                <Label htmlFor="definition">Definition</Label>
                <Textarea
                  id="definition"
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                  rows={3}
                  placeholder="Indicator definition"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="measurement-aspect">Measurement aspect</Label>
                <Textarea
                  id="measurement-aspect"
                  value={measurementAspect}
                  onChange={(e) => setMeasurementAspect(e.target.value)}
                  rows={3}
                  placeholder="What this indicator measures"
                />
              </div>
              {canViewStrategicSensitiveFormFields(userRole) && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="meeting-notes">Meeting notes</Label>
                    <Textarea
                      id="meeting-notes"
                      value={meetingNotes}
                      onChange={(e) => setMeetingNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="me-e">M&amp;E</Label>
                    <Input id="me-e" value={meE} onChange={(e) => setMeE(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="active-field">Active</Label>
                    <Input id="active-field" value={active} onChange={(e) => setActive(e.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="notes-field">Notes</Label>
                    <Textarea id="notes-field" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'add' ? 'Add Objective' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

