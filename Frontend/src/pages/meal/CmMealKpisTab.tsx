import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { getCurrentUser } from '@/services/authService';
import {
  createCmMealKpiRow,
  deleteCmMealKpiRow,
  getCmMealKpiRows,
  updateCmMealKpiRow,
} from '@/services/wigService';
import type { CmMealKpiRow } from '@/types/wig';
import {
  CM_MEAL_PROJECT_CODES,
  CM_MEAL_PROJECT_LABELS,
  type CmMealProjectCode,
} from '@/config/cmMealProjects';
import {
  allowedCmMealProjectsForUser,
  canManageAllCmMealProjects,
  canWriteCmMealKpi,
  defaultCmMealProjectForUser,
} from '@/config/cmMealAccess';
import { getDefaultMonth } from '@/lib/utils';

function buildMonthOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = -12; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    out.push(`${y}-${m}`);
  }
  return [...new Set(out)].sort().reverse();
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${names[idx]} ${y}` : month;
}

function formatDiff(target: number | null, actual: number | null): string {
  if (target == null || actual == null) return '—';
  const d = target - actual;
  if (Number.isInteger(d)) return String(d);
  return d.toFixed(2).replace(/\.?0+$/, '');
}

type DraftRow = {
  kpi: string;
  activity: string;
  target: string;
  actual: string;
  responsible: string;
  notes: string;
};

const emptyDraft = (): DraftRow => ({
  kpi: '',
  activity: '',
  target: '',
  actual: '',
  responsible: '',
  notes: '',
});

export default function CmMealKpisTab() {
  const user = useMemo(() => getCurrentUser(), []);
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const allowedProjects = useMemo(() => allowedCmMealProjectsForUser(user), [user]);
  const canPickProject = canManageAllCmMealProjects(user);

  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth());
  const [selectedProject, setSelectedProject] = useState<CmMealProjectCode | ''>(
    () => defaultCmMealProjectForUser(user) ?? allowedProjects[0] ?? ''
  );
  const [rows, setRows] = useState<CmMealKpiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<DraftRow>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const projectLocked = !canPickProject && allowedProjects.length === 1;
  const canWrite = selectedProject
    ? canWriteCmMealKpi(user, selectedProject)
    : false;

  useEffect(() => {
    if (projectLocked && allowedProjects[0]) {
      setSelectedProject(allowedProjects[0]);
    }
  }, [projectLocked, allowedProjects]);

  const loadRows = useCallback(async () => {
    if (!selectedProject || !selectedMonth) return;
    setLoading(true);
    try {
      const data = await getCmMealKpiRows(selectedProject, selectedMonth);
      setRows(data);
    } catch (e) {
      toast({
        title: 'Could not load KPIs',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedProject, selectedMonth]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const handleAdd = async () => {
    if (!selectedProject || !selectedMonth) return;
    const activity = draft.activity.trim();
    if (!activity) {
      toast({ title: 'Activity required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createCmMealKpiRow({
        project_code: selectedProject,
        month_year: selectedMonth,
        kpi: draft.kpi.trim() || null,
        activity,
        target: draft.target.trim() === '' ? null : Number(draft.target),
        actual: draft.actual.trim() === '' ? null : Number(draft.actual),
        responsible: draft.responsible.trim() || null,
        notes: draft.notes.trim() || null,
      });
      setAddOpen(false);
      setDraft(emptyDraft());
      await loadRows();
      toast({ title: 'KPI added', description: `Saved for ${formatMonthLabel(selectedMonth)}.` });
    } catch (e) {
      toast({
        title: 'Could not add KPI',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCellBlur = async (
    row: CmMealKpiRow,
    field: 'kpi' | 'activity' | 'target' | 'actual' | 'responsible' | 'notes',
    raw: string
  ) => {
    if (!canWrite) return;
    const patch: Record<string, string | number | null> = {};
    if (field === 'kpi' || field === 'activity') {
      const v = raw.trim();
      const prev = field === 'kpi' ? row.kpi : row.activity;
      if (field === 'activity' && !v) return;
      if (v === (prev ?? '')) return;
      patch[field] = v || null;
    } else if (field === 'target' || field === 'actual') {
      const trimmed = raw.trim();
      const next = trimmed === '' ? null : Number(trimmed);
      if (trimmed !== '' && Number.isNaN(next)) return;
      const prev = row[field];
      if (prev === next) return;
      patch[field] = next;
    } else {
      const v = raw.trim() || null;
      const prev = row[field];
      if (prev === v) return;
      patch[field] = v;
    }
    try {
      const updated = await updateCmMealKpiRow(row.id, patch);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
      await loadRows();
    }
  };

  const handleDelete = async (id: number) => {
    if (!canWrite) return;
    setDeletingId(id);
    try {
      await deleteCmMealKpiRow(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast({
        title: 'Could not delete',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (!user || allowedProjects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>CM & MEAL KPIs</CardTitle>
          <CardDescription>You do not have access to any CM & MEAL project.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">CM & MEAL KPIs</CardTitle>
          <CardDescription>
            Track activities by project and month. New rows are saved only for the selected month.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5 min-w-[10rem]">
            <Label>Month</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[11rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMonthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[12rem]">
            <Label>Project</Label>
            <Select
              value={selectedProject}
              onValueChange={(v) => setSelectedProject(v as CmMealProjectCode)}
              disabled={projectLocked}
            >
              <SelectTrigger className="w-[14rem]">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {(canPickProject ? CM_MEAL_PROJECT_CODES : allowedProjects).map((code) => (
                  <SelectItem key={code} value={code}>
                    {CM_MEAL_PROJECT_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canWrite ? (
            <Button type="button" onClick={() => setAddOpen(true)} disabled={!selectedProject}>
              <Plus className="h-4 w-4" />
              Add KPI
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">N</TableHead>
                    <TableHead className="min-w-[8rem]">Project</TableHead>
                    <TableHead className="min-w-[10rem]">KPI</TableHead>
                    <TableHead className="min-w-[12rem]">Activity</TableHead>
                    <TableHead className="w-24 text-right">Target</TableHead>
                    <TableHead className="w-24 text-right">Actual</TableHead>
                    <TableHead className="w-24 text-right">Difference</TableHead>
                    <TableHead className="min-w-[8rem]">Responsible</TableHead>
                    <TableHead className="min-w-[10rem]">Notes</TableHead>
                    {canWrite ? <TableHead className="w-12" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={canWrite ? 10 : 9}
                        className="text-center text-muted-foreground py-8"
                      >
                        No KPIs for {formatMonthLabel(selectedMonth)}.
                        {canWrite ? ' Use Add KPI to create one.' : ''}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, idx) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {CM_MEAL_PROJECT_LABELS[row.project_code as CmMealProjectCode] ??
                            row.project_code}
                        </TableCell>
                        <EditableCell
                          value={row.kpi ?? ''}
                          disabled={!canWrite}
                          onCommit={(v) => void handleCellBlur(row, 'kpi', v)}
                        />
                        <EditableCell
                          value={row.activity}
                          disabled={!canWrite}
                          onCommit={(v) => void handleCellBlur(row, 'activity', v)}
                        />
                        <EditableCell
                          value={row.target != null ? String(row.target) : ''}
                          disabled={!canWrite}
                          align="right"
                          inputMode="decimal"
                          onCommit={(v) => void handleCellBlur(row, 'target', v)}
                        />
                        <EditableCell
                          value={row.actual != null ? String(row.actual) : ''}
                          disabled={!canWrite}
                          align="right"
                          inputMode="decimal"
                          onCommit={(v) => void handleCellBlur(row, 'actual', v)}
                        />
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatDiff(row.target, row.actual)}
                        </TableCell>
                        <EditableCell
                          value={row.responsible ?? ''}
                          disabled={!canWrite}
                          onCommit={(v) => void handleCellBlur(row, 'responsible', v)}
                        />
                        <EditableCell
                          value={row.notes ?? ''}
                          disabled={!canWrite}
                          multiline
                          onCommit={(v) => void handleCellBlur(row, 'notes', v)}
                        />
                        {canWrite ? (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              disabled={deletingId === row.id}
                              onClick={() => void handleDelete(row.id)}
                              aria-label="Delete row"
                            >
                              {deletingId === row.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add KPI — {formatMonthLabel(selectedMonth)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Project</Label>
              <Input
                readOnly
                value={
                  selectedProject
                    ? CM_MEAL_PROJECT_LABELS[selectedProject as CmMealProjectCode]
                    : ''
                }
              />
            </div>
            <div className="space-y-1">
              <Label>KPI</Label>
              <Input
                value={draft.kpi}
                onChange={(e) => setDraft((d) => ({ ...d, kpi: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Activity</Label>
              <Input
                value={draft.activity}
                onChange={(e) => setDraft((d) => ({ ...d, activity: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Target</Label>
                <Input
                  inputMode="decimal"
                  value={draft.target}
                  onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Actual</Label>
                <Input
                  inputMode="decimal"
                  value={draft.actual}
                  onChange={(e) => setDraft((d) => ({ ...d, actual: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Responsible</Label>
              <Input
                value={draft.responsible}
                onChange={(e) => setDraft((d) => ({ ...d, responsible: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleAdd()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditableCell({
  value,
  disabled,
  align,
  inputMode,
  multiline,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  inputMode?: 'decimal' | 'text';
  multiline?: boolean;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  if (disabled) {
    return (
      <TableCell className={align === 'right' ? 'text-right' : undefined}>
        {value || '—'}
      </TableCell>
    );
  }

  return (
    <TableCell className="p-1">
      {multiline ? (
        <Textarea
          className="min-h-[2.5rem] text-xs"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => onCommit(local)}
        />
      ) : (
        <Input
          className={`h-8 text-xs ${align === 'right' ? 'text-right' : ''}`}
          inputMode={inputMode}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => onCommit(local)}
        />
      )}
    </TableCell>
  );
}
