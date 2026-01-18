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

interface MEEKPI {
  id?: number;
  me_kpi: string;
  mov: string;
  target?: number | null;
  actual?: number | null;
  frequency?: string;
  start_date?: string;
  end_date?: string;
  tool?: string;
  responsible?: string;
  folder_link?: string;
}

interface MEKPIFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: MEEKPI) => Promise<void>;
  initialData?: MEEKPI;
}

export default function MEKPIFormModal({
  open,
  onOpenChange,
  onSave,
  initialData,
}: MEKPIFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [meKpi, setMeKpi] = useState('');
  const [mov, setMov] = useState('');
  const [target, setTarget] = useState<number | null>(null);
  const [actual, setActual] = useState<number | null>(null);
  const [frequency, setFrequency] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tool, setTool] = useState('');
  const [responsible, setResponsible] = useState('');
  const [folderLink, setFolderLink] = useState('');

  // Initialize form data
  useEffect(() => {
    if (open) {
      if (initialData) {
        setMeKpi(initialData.me_kpi || '');
        setMov(initialData.mov || '');
        setTarget(initialData.target ?? null);
        setActual(initialData.actual ?? null);
        setFrequency(initialData.frequency || '');
        setStartDate(initialData.start_date || '');
        setEndDate(initialData.end_date || '');
        setTool(initialData.tool || '');
        setResponsible(initialData.responsible || '');
        setFolderLink(initialData.folder_link || '');
      } else {
        // Reset form for new entry
        setMeKpi('');
        setMov('');
        setTarget(null);
        setActual(null);
        setFrequency('');
        setStartDate('');
        setEndDate('');
        setTool('');
        setResponsible('');
        setFolderLink('');
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
    if (!meKpi.trim()) {
      newErrors.me_kpi = 'M&E KPI is required';
    }
    if (!mov.trim()) {
      newErrors.mov = 'MOV is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setLoading(true);
      setErrors({});

      const formData: MEEKPI = {
        me_kpi: meKpi.trim(),
        mov: mov.trim(),
        target: target ?? null,
        actual: actual ?? null,
        frequency: frequency && frequency.trim() ? frequency.trim() : undefined,
        start_date: startDate && startDate.trim() ? startDate.trim() : undefined,
        end_date: endDate && endDate.trim() ? endDate.trim() : undefined,
        tool: tool.trim() || undefined,
        responsible: responsible.trim() || undefined,
        folder_link: folderLink.trim() || undefined,
      };

      if (initialData?.id) {
        formData.id = initialData.id;
      }

      await onSave(formData);
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving M&E KPI:', err);
      setErrors({
        submit: err instanceof Error ? err.message : 'Failed to save M&E KPI',
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
          <DialogTitle>{initialData?.id ? 'Edit M&E KPI' : 'Add M&E KPI'}</DialogTitle>
          <DialogDescription>
            {initialData?.id 
              ? 'Update the M&E KPI. Modify the fields as needed.'
              : 'Create a new M&E KPI for this objective. Fill in all required fields.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
            {/* M&E KPI */}
            <div className="space-y-2">
              <Label htmlFor="me_kpi">
                M&E KPI <span className="text-destructive">*</span>
              </Label>
              <Input
                ref={firstInputRef}
                id="me_kpi"
                value={meKpi}
                onChange={(e) => {
                  setMeKpi(e.target.value);
                  if (errors.me_kpi) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.me_kpi;
                      return next;
                    });
                  }
                }}
                placeholder="Enter M&E KPI"
                className={errors.me_kpi ? 'border-destructive' : ''}
              />
              {errors.me_kpi && (
                <p className="text-sm text-destructive">{errors.me_kpi}</p>
              )}
            </div>

            {/* MOV */}
            <div className="space-y-2">
              <Label htmlFor="mov">
                MOV <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="mov"
                value={mov}
                onChange={(e) => {
                  setMov(e.target.value);
                  if (errors.mov) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.mov;
                      return next;
                    });
                  }
                }}
                placeholder="Enter MOV (Means of Verification)"
                className={errors.mov ? 'border-destructive' : ''}
                rows={3}
              />
              {errors.mov && (
                <p className="text-sm text-destructive">{errors.mov}</p>
              )}
            </div>

            {/* Target and Actual */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="target">Target</Label>
                <Input
                  id="target"
                  type="number"
                  value={target?.toString() || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTarget(value === '' ? null : parseFloat(value) || null);
                  }}
                  placeholder="Enter target"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actual">Actual</Label>
                <Input
                  id="actual"
                  type="number"
                  value={actual?.toString() || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setActual(value === '' ? null : parseFloat(value) || null);
                  }}
                  placeholder="Enter actual"
                />
              </div>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency</Label>
              <Select
                value={frequency}
                onValueChange={setFrequency}
              >
                <SelectTrigger id="frequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                  <SelectItem value="Quarterly">Quarterly</SelectItem>
                  <SelectItem value="Annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Start Date and End Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Tool */}
            <div className="space-y-2">
              <Label htmlFor="tool">Tool</Label>
              <Input
                id="tool"
                value={tool}
                onChange={(e) => setTool(e.target.value)}
                placeholder="Enter tool"
              />
            </div>

            {/* Responsible */}
            <div className="space-y-2">
              <Label htmlFor="responsible">Responsible</Label>
              <Input
                id="responsible"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                placeholder="Enter responsible person"
              />
            </div>

            {/* Folder Link */}
            <div className="space-y-2">
              <Label htmlFor="folder_link">Folder Link</Label>
              <Input
                id="folder_link"
                type="url"
                value={folderLink}
                onChange={(e) => setFolderLink(e.target.value)}
                placeholder="Enter folder link (URL)"
              />
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
                'Save M&E KPI'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}