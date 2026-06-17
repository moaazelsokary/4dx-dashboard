import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, Plus, RefreshCw, Search, Edit2, Trash2 } from 'lucide-react';
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
import type { CmMealUserKpiTeamMember, CmMealUserRoleRow } from '@/types/wig';
import {
  canWriteCmMealUserKpiForTarget,
  isCmMealManagerRole,
  showEmployeeScopeFilter,
  userIdFromUser,
} from '@/config/cmMealUserKpiAccess';
import { AlignedStack, NestedTreeItemCard } from './cmMealNestedTree';
import { getRoleTaskItems, roleRowSearchText } from './cmMealRoleTasks';
import {
  TaskItemsEditor,
  SkillChip,
  draftItemsFromRow,
  emptyDraftTaskItem,
  parseDraftTaskItems,
  type DraftTaskItem,
} from './CmMealRoleTaskItemsEditor';

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
  job_title: string;
  responsibilities: string;
  task_items: DraftTaskItem[];
};

function emptyDraft(defaultUserId: string): DraftRole {
  return {
    user_id: defaultUserId,
    job_title: '',
    responsibilities: '',
    task_items: [emptyDraftTaskItem()],
  };
}

function draftFromRow(row: CmMealUserRoleRow): DraftRole {
  return {
    user_id: String(row.user_id),
    job_title: row.job_title,
    responsibilities: row.responsibilities ?? '',
    task_items: draftItemsFromRow(getRoleTaskItems(row)),
  };
}

function RoleTaskDetailsTableCells({ row }: { row: CmMealUserRoleRow }) {
  const items = getRoleTaskItems(row);
  const count = items.length;
  const cellClass = 'align-top border-r border-border/50 text-xs py-2';
  const nestUnderResponsibilities = Boolean(row.responsibilities?.trim()) && count > 0;
  const nestClass = nestUnderResponsibilities ? 'ml-2 pl-3 border-l-2 border-primary/25' : '';

  if (!count) {
    return (
      <>
        <TableCell className={cellClass} style={{ minWidth: 140 }}>
          <span className="text-muted-foreground">—</span>
        </TableCell>
        <TableCell className={cn(cellClass, 'tabular-nums')} style={{ minWidth: 90 }}>
          <span className="text-muted-foreground">—</span>
        </TableCell>
        <TableCell className={cellClass} style={{ minWidth: 160 }}>
          <span className="text-muted-foreground">—</span>
        </TableCell>
        <TableCell className={cellClass} style={{ minWidth: 160 }}>
          <span className="text-muted-foreground">—</span>
        </TableCell>
      </>
    );
  }

  return (
    <>
      <TableCell className={cellClass} style={{ minWidth: 140 }}>
        <div className={cn('space-y-2 py-0.5', nestClass)}>
          {items.map((item, idx) => (
            <NestedTreeItemCard key={`task-${idx}`} className="min-h-0">
              <BidirectionalText className="text-xs whitespace-normal break-words">{item.task}</BidirectionalText>
            </NestedTreeItemCard>
          ))}
        </div>
      </TableCell>
      <TableCell className={cn(cellClass, 'tabular-nums')} style={{ minWidth: 90 }}>
        <div className={cn('py-0.5', nestClass)}>
          <AlignedStack
            count={count}
            render={(idx) =>
              items[idx].workload_percent == null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="font-medium text-foreground">{items[idx].workload_percent}%</span>
              )
            }
          />
        </div>
      </TableCell>
      <TableCell className={cellClass} style={{ minWidth: 160 }}>
        <div className={cn('py-0.5', nestClass)}>
          <AlignedStack
            count={count}
            render={(idx) =>
              items[idx].technical_skills.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {items[idx].technical_skills.map((skill, i) => (
                    <SkillChip key={`${skill.name}-${i}`} skill={skill} />
                  ))}
                </div>
              )
            }
          />
        </div>
      </TableCell>
      <TableCell className={cellClass} style={{ minWidth: 160 }}>
        <div className={cn('py-0.5', nestClass)}>
          <AlignedStack
            count={count}
            render={(idx) =>
              items[idx].soft_skills.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {items[idx].soft_skills.map((skill, i) => (
                    <SkillChip key={`${skill.name}-${i}`} skill={skill} />
                  ))}
                </div>
              )
            }
          />
        </div>
      </TableCell>
    </>
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
      className={cn(isDragging && 'bg-muted/40', 'group')}
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
      <TableCell className="align-top border-r border-border/50 text-xs">
        <BidirectionalText>{row.job_title}</BidirectionalText>
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs whitespace-normal break-words bg-muted/[0.06] group-hover:bg-muted/10">
        <BidirectionalText className="font-medium text-foreground">
          {row.responsibilities?.trim() || '—'}
        </BidirectionalText>
      </TableCell>
      <RoleTaskDetailsTableCells row={row} />
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
    return rows.filter((row) => roleRowSearchText(row).includes(q));
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
    const jobTitle = draft.job_title.trim();
    if (!jobTitle) {
      toast({ title: 'Job title is required', variant: 'destructive' });
      return;
    }

    const parsedItems = parseDraftTaskItems(draft.task_items);
    if ('error' in parsedItems) {
      toast({ title: parsedItems.error, variant: 'destructive' });
      return;
    }

    const payload = {
      kpi: '—',
      job_title: jobTitle,
      responsibilities: draft.responsibilities.trim() || null,
      task_items: parsedItems,
    };

    if (editingRow) {
      if (!canWriteForRow(editingRow)) return;
      setSavingForm(true);
      try {
        await updateCmMealUserRoleRow(editingRow.id, payload);
        await onReload();
        closeForm();
        toast({ title: 'Saved' });
      } catch (e) {
        toast({
          title: 'Could not save',
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
      await createCmMealUserRoleRow({ user_id: ownerId, ...payload });
      await onReload();
      closeForm();
      toast({ title: 'Saved' });
    } catch (e) {
      toast({
        title: 'Could not save',
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

  const colCount = 2 + (showEmployeeColumn ? 1 : 0) + 6 + 1;

  return (
    <Card className="text-xs">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Roles & Responsibilities</CardTitle>
            <CardDescription className="text-[11px] leading-snug mt-0.5">
              Define job titles, responsibilities, tasks, workload, and skills per employee.
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
                          {rows.length === 0 ? 'No roles yet. Add one to get started.' : 'No rows match your search.'}
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
              <Label className="text-xs">Job Title</Label>
              <Input className="h-8 text-xs" value={draft.job_title} onChange={(e) => setDraft((p) => ({ ...p, job_title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Responsibilities</Label>
              <Textarea rows={2} className="text-xs" value={draft.responsibilities} onChange={(e) => setDraft((p) => ({ ...p, responsibilities: e.target.value }))} />
            </div>
            <TaskItemsEditor
              items={draft.task_items}
              onChange={(task_items) => setDraft((p) => ({ ...p, task_items }))}
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
