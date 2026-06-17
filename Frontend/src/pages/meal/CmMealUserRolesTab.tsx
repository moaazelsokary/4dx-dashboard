import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, Plus, RefreshCw, Search, Edit2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import BidirectionalText from '@/components/ui/BidirectionalText';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { getCurrentUser } from '@/services/authService';
import {
  createCmMealUserRoleRow,
  deleteCmMealUserRoleRow,
  updateCmMealUserRoleRow,
  updateCmMealUserRoleRowsOrder,
} from '@/services/wigService';
import type { CmMealRoleSkill, CmMealUserKpiTeamMember, CmMealUserRoleRow } from '@/types/wig';
import {
  canWriteCmMealUserKpiForTarget,
  isCmMealManagerRole,
  showEmployeeScopeFilter,
  userIdFromUser,
} from '@/config/cmMealUserKpiAccess';

type Props = {
  rows: CmMealUserRoleRow[];
  loading: boolean;
  onReload: () => Promise<void>;
  employees: CmMealUserKpiTeamMember[];
  employeeScope: 'all' | number;
  onEmployeeScopeChange: (scope: 'all' | number) => void;
  onRowsChange?: (rows: CmMealUserRoleRow[]) => void;
};

type DraftRole = {
  user_id: string;
  kpi: string;
  job_title: string;
  responsibilities: string;
  tasks: string;
  workload_percent: string;
  technical_skills: CmMealRoleSkill[];
  soft_skills: CmMealRoleSkill[];
};

function emptyDraft(defaultUserId: string): DraftRole {
  return {
    user_id: defaultUserId,
    kpi: '',
    job_title: '',
    responsibilities: '',
    tasks: '',
    workload_percent: '',
    technical_skills: [],
    soft_skills: [],
  };
}

function draftFromRow(row: CmMealUserRoleRow): DraftRole {
  return {
    user_id: String(row.user_id),
    kpi: row.kpi,
    job_title: row.job_title,
    responsibilities: row.responsibilities ?? '',
    tasks: row.tasks ?? '',
    workload_percent: row.workload_percent == null ? '' : String(row.workload_percent),
    technical_skills: [...(row.technical_skills ?? [])],
    soft_skills: [...(row.soft_skills ?? [])],
  };
}

function parseWorkloadPercentInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return Number.NaN;
  if (n <= 0 || n >= 101) return Number.NaN;
  return n;
}

function SkillsCell({ skills }: { skills: CmMealRoleSkill[] }) {
  if (!skills.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {skills.map((s, i) => (
        <Badge
          key={`${s.name}-${i}`}
          variant={s.exists ? 'default' : 'outline'}
          className={cn('text-[10px] font-normal', !s.exists && 'text-muted-foreground')}
        >
          <BidirectionalText>{s.name}</BidirectionalText>
          {!s.exists ? ' · N' : ''}
        </Badge>
      ))}
    </div>
  );
}

function SkillsEditor({
  label,
  skills,
  onChange,
}: {
  label: string;
  skills: CmMealRoleSkill[];
  onChange: (next: CmMealRoleSkill[]) => void;
}) {
  const add = () => onChange([...skills, { name: '', exists: true }]);
  const update = (index: number, patch: Partial<CmMealRoleSkill>) => {
    onChange(skills.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const remove = (index: number) => onChange(skills.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      {skills.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No skills yet.</p>
      ) : (
        <div className="space-y-2">
          {skills.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="h-8 text-xs flex-1"
                placeholder="Skill name"
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-xs shrink-0">
                <Checkbox checked={s.exists} onCheckedChange={(v) => update(i, { exists: v === true })} />
                Exists
              </label>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => remove(i)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableRoleRow({
  row,
  index,
  showEmployeeColumn,
  canWrite,
  canReorder,
  deleting,
  onEdit,
  onDelete,
}: {
  row: CmMealUserRoleRow;
  index: number;
  showEmployeeColumn: boolean;
  canWrite: boolean;
  canReorder: boolean;
  deleting: boolean;
  onEdit: (row: CmMealUserRoleRow) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(row.id),
    disabled: !canReorder || !canWrite,
  });

  return (
    <TableRow
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      className={isDragging ? 'bg-muted/40' : undefined}
    >
      <TableCell className="w-9 p-1 align-top">
        {canReorder && canWrite ? (
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </TableCell>
      <TableCell className="text-center bg-primary/10 border-r border-border/50 w-10">
        <span className="text-sm font-semibold text-primary tabular-nums">{index + 1}</span>
      </TableCell>
      {showEmployeeColumn ? (
        <TableCell className="align-top border-r border-border/50 text-xs">
          <BidirectionalText>{row.username?.trim() || row.user_id}</BidirectionalText>
        </TableCell>
      ) : null}
      <TableCell className="align-top border-r border-border/50">
        <Badge variant="outline" className="text-xs font-normal">
          <BidirectionalText>{row.kpi}</BidirectionalText>
        </Badge>
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs">
        <BidirectionalText>{row.job_title}</BidirectionalText>
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs whitespace-normal break-words max-w-[12rem]">
        <BidirectionalText>{row.responsibilities?.trim() || '—'}</BidirectionalText>
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs whitespace-normal break-words max-w-[12rem]">
        <BidirectionalText>{row.tasks?.trim() || '—'}</BidirectionalText>
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs text-right tabular-nums">
        {row.workload_percent == null ? '—' : `${row.workload_percent}%`}
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs min-w-[8rem]">
        <SkillsCell skills={row.technical_skills} />
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs min-w-[8rem]">
        <SkillsCell skills={row.soft_skills} />
      </TableCell>
      <TableCell className="w-[4.5rem] align-top">
        {canWrite ? (
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(row)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 text-destructive"
              disabled={deleting}
              onClick={() => onDelete(row.id)}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export default function CmMealUserRolesTab({
  rows,
  loading,
  onReload,
  employees,
  employeeScope,
  onEmployeeScopeChange,
  onRowsChange,
}: Props) {
  const user = useMemo(() => getCurrentUser(), []);
  const selfId = userIdFromUser(user);
  const teamIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const showEmployeeColumn = showEmployeeScopeFilter(user);
  const canReorder = employeeScope !== 'all';
  const allTeamLabel = isCmMealManagerRole(user?.role) ? 'All my team' : 'All team';

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CmMealUserRoleRow | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  const defaultAddUserId = useMemo(() => {
    if (employeeScope !== 'all') return String(employeeScope);
    if (selfId != null && employees.some((e) => e.id === selfId)) return String(selfId);
    return employees[0] ? String(employees[0].id) : '';
  }, [employeeScope, selfId, employees]);

  const [draft, setDraft] = useState<DraftRole>(() => emptyDraft(defaultAddUserId));

  useEffect(() => {
    setDraft((prev) => (prev.user_id ? prev : emptyDraft(defaultAddUserId)));
  }, [defaultAddUserId]);

  const canWriteForRow = useCallback(
    (row: CmMealUserRoleRow) => canWriteCmMealUserKpiForTarget(user, row.user_id, teamIds),
    [user, teamIds]
  );

  const canWriteAny = useMemo(
    () => rows.some((row) => canWriteForRow(row)) || employees.some((e) => canWriteCmMealUserKpiForTarget(user, e.id, teamIds)),
    [rows, employees, user, teamIds, canWriteForRow]
  );

  const writableEmployees = useMemo(
    () => employees.filter((e) => canWriteCmMealUserKpiForTarget(user, e.id, teamIds)),
    [employees, user, teamIds]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.username,
        row.kpi,
        row.job_title,
        row.responsibilities,
        row.tasks,
        row.technical_skills.map((s) => s.name).join(' '),
        row.soft_skills.map((s) => s.name).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const openAddForm = () => {
    setEditingRow(null);
    setDraft(emptyDraft(defaultAddUserId));
    setFormOpen(true);
  };

  const openEditForm = (row: CmMealUserRoleRow) => {
    setEditingRow(row);
    setDraft(draftFromRow(row));
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingRow(null);
    setDraft(emptyDraft(defaultAddUserId));
  };

  const handleFormSave = async () => {
    const kpi = draft.kpi.trim();
    const jobTitle = draft.job_title.trim();
    if (!kpi) {
      toast({ title: 'KPI is required', variant: 'destructive' });
      return;
    }
    if (!jobTitle) {
      toast({ title: 'Job title is required', variant: 'destructive' });
      return;
    }

    const workload = parseWorkloadPercentInput(draft.workload_percent);
    if (draft.workload_percent.trim() !== '' && Number.isNaN(workload)) {
      toast({
        title: 'Invalid workload %',
        description: 'Enter a number greater than 0 and less than 101.',
        variant: 'destructive',
      });
      return;
    }

    const technical = draft.technical_skills.filter((s) => s.name.trim());
    const soft = draft.soft_skills.filter((s) => s.name.trim());
    const payload = {
      kpi,
      job_title: jobTitle,
      responsibilities: draft.responsibilities.trim() || null,
      tasks: draft.tasks.trim() || null,
      workload_percent: workload,
      technical_skills: technical,
      soft_skills: soft,
    };

    if (editingRow) {
      if (!canWriteForRow(editingRow)) return;
      setSavingForm(true);
      try {
        const updated = await updateCmMealUserRoleRow(editingRow.id, payload);
        const next = rows.map((r) => (r.id === updated.id ? updated : r));
        if (onRowsChange) onRowsChange(next);
        else await onReload();
        closeForm();
        toast({ title: 'Role updated' });
      } catch (e) {
        toast({
          title: 'Could not update role',
          description: e instanceof Error ? e.message : 'Request failed',
          variant: 'destructive',
        });
      } finally {
        setSavingForm(false);
      }
      return;
    }

    const ownerId = Number.parseInt(draft.user_id, 10);
    if (!ownerId || !canWriteCmMealUserKpiForTarget(user, ownerId, teamIds)) {
      toast({ title: 'Cannot add role for this employee', variant: 'destructive' });
      return;
    }

    setSavingForm(true);
    try {
      const created = await createCmMealUserRoleRow({ user_id: ownerId, ...payload });
      if (onRowsChange) onRowsChange([...rows, created]);
      else await onReload();
      closeForm();
      toast({ title: 'Role added' });
    } catch (e) {
      toast({
        title: 'Could not add role',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSavingForm(false);
    }
  };

  const handleDelete = async (id: number) => {
    const target = rows.find((r) => r.id === id);
    if (!target || !canWriteForRow(target)) return;
    setDeletingId(id);
    try {
      const next = rows.filter((r) => r.id !== id);
      if (onRowsChange) onRowsChange(next);
      await deleteCmMealUserRoleRow(id);
      if (!onRowsChange) await onReload();
    } catch (e) {
      if (onRowsChange) onRowsChange(rows);
      toast({
        title: 'Could not delete role',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canReorder || reordering) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => String(r.id) === String(active.id));
    const newIndex = rows.findIndex((r) => String(r.id) === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(rows, oldIndex, newIndex).map((r, idx) => ({
      ...r,
      sort_order: idx + 1,
    }));
    setReordering(true);
    try {
      if (onRowsChange) onRowsChange(reordered);
      await updateCmMealUserRoleRowsOrder(reordered.map((r, idx) => ({ id: r.id, sort_order: idx + 1 })));
      if (!onRowsChange) await onReload();
    } catch (e) {
      if (onRowsChange) onRowsChange(rows);
      toast({
        title: 'Could not reorder rows',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setReordering(false);
    }
  };

  const colCount = 2 + (showEmployeeColumn ? 1 : 0) + 8 + 1;

  return (
    <Card className="text-xs">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Roles & Responsibilities</CardTitle>
            <CardDescription className="text-[11px] leading-snug mt-0.5">
              Define KPIs, job titles, tasks, and skills per employee. KPIs defined here appear in the KPIs tab.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showEmployeeColumn ? (
              <Select
                value={employeeScope === 'all' ? 'all' : String(employeeScope)}
                onValueChange={(v) => onEmployeeScopeChange(v === 'all' ? 'all' : Number.parseInt(v, 10))}
              >
                <SelectTrigger className="h-8 text-xs w-[13rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{allTeamLabel}</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <div className="relative w-full sm:w-52">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-7 h-8 text-xs"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => void onReload()} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
            {canWriteAny ? (
              <Button type="button" size="sm" className="h-8 text-xs" onClick={openAddForm}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add role
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <DndContext collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
              <Table className="text-xs [&_td]:px-2 [&_td]:py-1.5">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-9" />
                    <TableHead className="w-10 text-center">N</TableHead>
                    {showEmployeeColumn ? <TableHead>Employee</TableHead> : null}
                    <TableHead>KPI</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Responsibilities</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead className="text-right">% Workload</TableHead>
                    <TableHead>Technical Skills</TableHead>
                    <TableHead>Soft Skills</TableHead>
                    <TableHead className="w-[4.5rem]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <SortableContext items={filteredRows.map((r) => String(r.id))} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">
                          {rows.length === 0 ? 'No roles yet. Add one to define KPIs for this employee.' : 'No rows match your search.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((row, idx) => (
                        <SortableRoleRow
                          key={row.id}
                          row={row}
                          index={idx}
                          showEmployeeColumn={showEmployeeColumn}
                          canWrite={canWriteForRow(row)}
                          canReorder={canReorder}
                          deleting={deletingId === row.id}
                          onEdit={openEditForm}
                          onDelete={(id) => void handleDelete(id)}
                        />
                      ))
                    )}
                  </TableBody>
                </SortableContext>
              </Table>
            </DndContext>
          </div>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={(open) => (open ? setFormOpen(true) : closeForm())}>
        <DialogContent className="text-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingRow ? 'Edit role' : 'Add role'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {!editingRow && showEmployeeColumn && writableEmployees.length > 1 ? (
              <div className="space-y-1">
                <Label className="text-xs">Employee</Label>
                <Select value={draft.user_id} onValueChange={(v) => setDraft((p) => ({ ...p, user_id: v }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {writableEmployees.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label className="text-xs">KPI</Label>
              <Input className="h-8 text-xs" value={draft.kpi} onChange={(e) => setDraft((p) => ({ ...p, kpi: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Job Title</Label>
              <Input className="h-8 text-xs" value={draft.job_title} onChange={(e) => setDraft((p) => ({ ...p, job_title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Responsibilities</Label>
              <Textarea rows={2} className="text-xs" value={draft.responsibilities} onChange={(e) => setDraft((p) => ({ ...p, responsibilities: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tasks</Label>
              <Textarea rows={2} className="text-xs" value={draft.tasks} onChange={(e) => setDraft((p) => ({ ...p, tasks: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">% of Workload</Label>
              <Input
                className="h-8 text-xs"
                type="number"
                min={0.01}
                max={100.99}
                step="0.01"
                inputMode="decimal"
                value={draft.workload_percent}
                onChange={(e) => setDraft((p) => ({ ...p, workload_percent: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">Must be greater than 0 and less than 101.</p>
            </div>
            <SkillsEditor
              label="Technical skills"
              skills={draft.technical_skills}
              onChange={(technical_skills) => setDraft((p) => ({ ...p, technical_skills }))}
            />
            <SkillsEditor
              label="Soft skills"
              skills={draft.soft_skills}
              onChange={(soft_skills) => setDraft((p) => ({ ...p, soft_skills }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="h-8 text-xs" onClick={() => void handleFormSave()} disabled={savingForm}>
              {savingForm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
