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
import { Loader2 } from 'lucide-react';
import { Selector } from '@/components/ui/selector';
import type { MainPlanObjective } from '@/types/wig';

interface MainPlanObjectiveFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  initialData?: Partial<MainPlanObjective>;
  onSave: (data: Partial<MainPlanObjective>) => Promise<void>;
  uniqueObjectives?: string[];
  uniqueTargets?: string[];
}

export default function MainPlanObjectiveFormModal({
  open,
  onOpenChange,
  mode,
  initialData,
  onSave,
  uniqueObjectives = [],
  uniqueTargets = [],
}: MainPlanObjectiveFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [pillar, setPillar] = useState('');
  const [objective, setObjective] = useState('');
  const [target, setTarget] = useState('');
  const [kpi, setKpi] = useState('');
  const [annualTarget, setAnnualTarget] = useState<number>(0);

  // Initialize form data
  useEffect(() => {
    if (open) {
      if (initialData) {
        setPillar(initialData.pillar || '');
        setObjective(initialData.objective || '');
        setTarget(initialData.target || '');
        setKpi(initialData.kpi || '');
        setAnnualTarget(initialData.annual_target || 0);
      } else {
        // Reset form for add mode
        setPillar('');
        setObjective('');
        setTarget('');
        setKpi('');
        setAnnualTarget(0);
      }
      setErrors({});
      
      // Focus first input when modal opens
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 100);
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const newErrors: Record<string, string> = {};
    if (!pillar.trim()) {
      newErrors.pillar = 'Pillar is required';
    }
    if (!objective.trim()) {
      newErrors.objective = 'Objective is required';
    }
    if (!target.trim()) {
      newErrors.target = 'Target is required';
    }
    if (!kpi.trim()) {
      newErrors.kpi = 'KPI is required';
    }
    if (annualTarget === undefined || annualTarget === null) {
      newErrors.annualTarget = 'Annual target is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setLoading(true);
      setErrors({});

      const formData: Partial<MainPlanObjective> = {
        pillar: pillar.trim(),
        objective: objective.trim(),
        target: target.trim(),
        kpi: kpi.trim(),
        annual_target: parseFloat(annualTarget.toString()) || 0,
      };

      await onSave(formData);
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving main plan objective:', err);
      setErrors({
        submit: err instanceof Error ? err.message : 'Failed to save objective',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add Main Plan Objective' : 'Edit Main Plan Objective'}</DialogTitle>
          <DialogDescription>
            {mode === 'add' 
              ? 'Create a new main plan objective. Fill in all required fields.'
              : 'Update the main plan objective. Modify the fields as needed.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
            {/* Pillar */}
            <div className="space-y-2">
              <Label htmlFor="pillar">
                Pillar <span className="text-destructive">*</span>
              </Label>
              <Input
                ref={firstInputRef}
                id="pillar"
                value={pillar}
                onChange={(e) => {
                  setPillar(e.target.value);
                  if (errors.pillar) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.pillar;
                      return next;
                    });
                  }
                }}
                placeholder="Enter pillar"
                className={errors.pillar ? 'border-destructive' : ''}
              />
              {errors.pillar && (
                <p className="text-sm text-destructive">{errors.pillar}</p>
              )}
            </div>

            {/* Objective */}
            <div className="space-y-2">
              <Label htmlFor="objective">
                Objective <span className="text-destructive">*</span>
              </Label>
              <Selector
                options={uniqueObjectives}
                value={objective}
                onValueChange={(value) => {
                  setObjective(value);
                  if (errors.objective) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.objective;
                      return next;
                    });
                  }
                }}
                placeholder="Select or type objective..."
                allowCustom={true}
              />
              {errors.objective && (
                <p className="text-sm text-destructive">{errors.objective}</p>
              )}
            </div>

            {/* Target */}
            <div className="space-y-2">
              <Label htmlFor="target">
                Target <span className="text-destructive">*</span>
              </Label>
              <Selector
                options={uniqueTargets}
                value={target}
                onValueChange={(value) => {
                  setTarget(value);
                  if (errors.target) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.target;
                      return next;
                    });
                  }
                }}
                placeholder="Select or type target..."
                allowCustom={true}
              />
              {errors.target && (
                <p className="text-sm text-destructive">{errors.target}</p>
              )}
            </div>

            {/* KPI */}
            <div className="space-y-2">
              <Label htmlFor="kpi">
                KPI <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="kpi"
                value={kpi}
                onChange={(e) => {
                  setKpi(e.target.value);
                  if (errors.kpi) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.kpi;
                      return next;
                    });
                  }
                }}
                placeholder="Enter KPI"
                className={errors.kpi ? 'border-destructive' : ''}
                rows={2}
              />
              {errors.kpi && (
                <p className="text-sm text-destructive">{errors.kpi}</p>
              )}
            </div>

            {/* Annual Target */}
            <div className="space-y-2">
              <Label htmlFor="annualTarget">
                Annual Target <span className="text-destructive">*</span>
              </Label>
              <Input
                id="annualTarget"
                type="number"
                step="0.01"
                value={annualTarget.toString()}
                onChange={(e) => {
                  const value = e.target.value;
                  setAnnualTarget(value === '' ? 0 : parseFloat(value) || 0);
                  if (errors.annualTarget) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.annualTarget;
                      return next;
                    });
                  }
                }}
                placeholder="Enter annual target"
                className={errors.annualTarget ? 'border-destructive' : ''}
              />
              {errors.annualTarget && (
                <p className="text-sm text-destructive">{errors.annualTarget}</p>
              )}
            </div>

            {errors.submit && (
              <div className="text-sm text-destructive">{errors.submit}</div>
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
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                mode === 'add' ? 'Add Objective' : 'Update Objective'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
