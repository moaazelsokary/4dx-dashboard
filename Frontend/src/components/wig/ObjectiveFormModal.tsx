import { useState, useEffect, useRef } from 'react';
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
import { Loader2 } from 'lucide-react';
import KPISelector from '@/components/wig/KPISelector';
import type { DepartmentObjective } from '@/types/wig';
import { cn } from '@/lib/utils';

const KPI_DELIMITER = '||';
const TYPE_DELIMITER = '||';

interface ObjectiveFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  initialData?: Partial<DepartmentObjective>;
  onSave: (data: Partial<DepartmentObjective>) => Promise<void>;
  existingResponsiblePersons?: string[];
}

export default function ObjectiveFormModal({
  open,
  onOpenChange,
  mode,
  initialData,
  onSave,
  existingResponsiblePersons = [],
}: ObjectiveFormModalProps) {
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

  // Parse KPI string to array
  const parseKPIs = (kpiStr: string | undefined): string[] => {
    if (!kpiStr) return [];
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
    }
  }, [open, initialData, mode]);

  // Auto-focus first input when modal opens
  useEffect(() => {
    if (open && firstInputRef.current) {
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // Handle KPI selection change
  const handleKPIChange = (value: string | string[]) => {
    const newKPIs = Array.isArray(value) ? value : [value];
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

    if (kpis.length === 0) {
      newErrors.kpi = 'Please select at least one KPI';
    }

    if (!activity.trim()) {
      newErrors.activity = 'Activity is required';
    }

    if (activityTarget <= 0) {
      newErrors.activityTarget = 'Target must be greater than 0';
    }

    if (!responsiblePerson.trim()) {
      newErrors.responsiblePerson = 'Responsible person is required';
    }

    if (!mov.trim()) {
      newErrors.mov = 'MOV is required';
    }

    // Validate all KPIs have types
    kpis.forEach((_, index) => {
      if (!kpiTypes[index]) {
        newErrors[`kpiType_${index}`] = 'Type is required for each KPI';
      }
    });

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

    setLoading(true);
    try {
      // Build type string: if multiple KPIs, use delimiter; otherwise single value
      const typeString = kpis.length > 1
        ? kpis.map((_, index) => kpiTypes[index] || 'Direct').join(TYPE_DELIMITER)
        : (kpiTypes[0] || 'Direct');

      const saveData: Partial<DepartmentObjective> = {
        kpi: kpis.join(KPI_DELIMITER),
        activity: activity.trim(),
        type: typeString as 'Direct' | 'In direct',
        activity_target: activityTarget,
        target_type: targetType,
        responsible_person: responsiblePerson.trim(),
        mov: mov.trim(),
        ...(initialData?.id && { id: initialData.id }),
        ...(initialData?.main_objective_id !== undefined && { main_objective_id: initialData.main_objective_id }),
        ...(initialData?.department_id !== undefined && { department_id: initialData.department_id }),
      };

      await onSave(saveData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving objective:', error);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              KPI <span className="text-destructive">*</span>
            </Label>
            <KPISelector
              value={kpis}
              onValueChange={handleKPIChange}
              placeholder="Select one or more KPIs"
            />
            {errors.kpi && (
              <p className="text-sm text-destructive">{errors.kpi}</p>
            )}
          </div>

          {/* Per-KPI Type Selection */}
          {kpis.length > 1 && (
            <div className="space-y-2">
              <Label>Type for each KPI <span className="text-destructive">*</span></Label>
              <div className="space-y-3 p-4 border rounded-md bg-muted/50">
                {kpis.map((kpi, index) => (
                  <div key={index} className="flex items-center gap-4" data-field={`kpiType_${index}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" title={kpi}>
                        {kpi}
                      </p>
                    </div>
                    <Select
                      value={kpiTypes[index] || 'Direct'}
                      onValueChange={(value: 'Direct' | 'In direct') => {
                        setKpiTypes({ ...kpiTypes, [index]: value });
                      }}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Direct">Direct</SelectItem>
                        <SelectItem value="In direct">In direct</SelectItem>
                      </SelectContent>
                    </Select>
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
              </Label>
              <Select
                value={kpiTypes[0] || 'Direct'}
                onValueChange={(value: 'Direct' | 'In direct') => {
                  setKpiTypes({ 0: value });
                }}
              >
                <SelectTrigger id="type-selector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Direct">Direct</SelectItem>
                  <SelectItem value="In direct">In direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Activity */}
          <div className="space-y-2" data-field="activity">
            <Label htmlFor="activity">
              Activity <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="activity"
              ref={firstInputRef}
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="Enter activity description"
              rows={3}
              className={cn(errors.activity && 'border-destructive')}
            />
            {errors.activity && (
              <p className="text-sm text-destructive">{errors.activity}</p>
            )}
          </div>

          {/* Target and Target Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2" data-field="activityTarget">
              <Label htmlFor="activity-target">
                Target <span className="text-destructive">*</span>
              </Label>
              <Input
                id="activity-target"
                type="number"
                value={activityTarget || ''}
                onChange={(e) => setActivityTarget(parseFloat(e.target.value) || 0)}
                placeholder="Enter target value"
                className={cn(errors.activityTarget && 'border-destructive')}
              />
              {errors.activityTarget && (
                <p className="text-sm text-destructive">{errors.activityTarget}</p>
              )}
            </div>
            <div className="space-y-2" data-field="targetType">
              <Label htmlFor="target-type">
                Target Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={targetType}
                onValueChange={(value: 'number' | 'percentage') => setTargetType(value)}
              >
                <SelectTrigger id="target-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Responsible Person with Autocomplete */}
          <div className="space-y-2 relative" data-field="responsiblePerson">
            <Label htmlFor="responsible-person">
              Responsible Person <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="responsible-person"
                value={responsiblePerson}
                onChange={(e) => handleResponsiblePersonChange(e.target.value)}
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
                className={cn(errors.responsiblePerson && 'border-destructive')}
              />
              {showResponsibleSuggestions && responsibleSuggestions.length > 0 && (
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
            {errors.responsiblePerson && (
              <p className="text-sm text-destructive">{errors.responsiblePerson}</p>
            )}
          </div>

          {/* MOV */}
          <div className="space-y-2" data-field="mov">
            <Label htmlFor="mov">
              MOV (Means of Verification) <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="mov"
              value={mov}
              onChange={(e) => setMov(e.target.value)}
              placeholder="Enter means of verification"
              rows={3}
              className={cn(errors.mov && 'border-destructive')}
            />
            {errors.mov && (
              <p className="text-sm text-destructive">{errors.mov}</p>
            )}
          </div>
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

