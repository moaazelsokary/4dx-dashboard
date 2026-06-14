import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Edit2,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ColumnFilter } from '@/components/ui/column-filter';
import BidirectionalText from '@/components/ui/BidirectionalText';
import { toast } from '@/hooks/use-toast';
import type { User } from '@/services/authService';
import { canManageMealContent } from '@/config/mealAccess';
import {
  createMealLearningPoint,
  deleteMealLearningPoint,
  getMealLearningPoints,
  updateMealLearningPoint,
  updateMealLearningPointsOrder,
} from '@/services/mealLearningService';
import type { MealLearningPoint, MealLearningPointStatus } from '@/types/mealLearning';
import {
  formatActivityLinksSummary,
  formatDepartmentsFromLinks,
  formatTopicsFromLinks,
  mealLearningStatusLabel,
} from '@/types/mealLearning';
import {
  loadFilterState,
  saveFilterState,
  getListSelected,
  getCondition,
  matchesTextCondition,
  type TableFilterState,
} from '@/lib/tableFilterState';
import MealLearningPointFormModal from './MealLearningPointFormModal';
import { cn } from '@/lib/utils';

const FILTER_STORAGE_KEY = 'meal-learning-points-table-filters';

type Props = {
  user: User;
};

function formatDate(s: string | null | undefined): string {
  if (!s) return '—';
  return String(s).slice(0, 10);
}

function statusBadgeVariant(status: MealLearningPointStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'on_hold') return 'secondary';
  return 'outline';
}

function matchesColumnFilter(
  state: TableFilterState,
  columnKey: string,
  cellText: string,
  columnType: 'text' | 'date' = 'text'
): boolean {
  const col = state[columnKey];
  if (!col) return true;
  if (col.mode === 'condition') {
    if (col.operator === 'is_empty') return !String(cellText ?? '').trim() || cellText === '—';
    if (columnType === 'date') {
      const raw = cellText === '—' ? '' : cellText;
      if (col.operator === 'equals') return raw === col.value;
      if (col.operator === 'before') return raw && col.value ? raw < col.value : false;
      if (col.operator === 'after') return raw && col.value ? raw > col.value : false;
      if (col.operator === 'between') {
        const a = col.value || '';
        const b = col.value2 || '';
        return raw >= a && raw <= b;
      }
      return true;
    }
    return matchesTextCondition(cellText, col.operator, col.value);
  }
  const list = col.selectedValues ?? [];
  return list.length === 0 || list.includes(cellText);
}

function SortableLearningRow({
  row,
  canWrite,
  onEdit,
  onDelete,
}: {
  row: MealLearningPoint;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(row.id),
    disabled: !canWrite,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  const activityText = formatActivityLinksSummary(row.activity_links);
  const topicText = formatTopicsFromLinks(row.activity_links);
  const departmentText = formatDepartmentsFromLinks(row.activity_links);
  const statusText = mealLearningStatusLabel(row.status);
  const endDateText = formatDate(row.end_date);

  return (
    <TableRow ref={setNodeRef} style={style} className={isDragging ? 'bg-muted/40' : undefined}>
      <TableCell className="w-10 p-1">
        {canWrite ? (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
      </TableCell>
      <TableCell className="min-w-[12rem] max-w-[20rem] align-top">
        <BidirectionalText className="text-sm whitespace-pre-wrap break-words">
          {row.learning_point}
        </BidirectionalText>
      </TableCell>
      <TableCell className="min-w-[10rem] max-w-[18rem] align-top">
        <BidirectionalText className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
          {row.corrective_action?.trim() || '—'}
        </BidirectionalText>
      </TableCell>
      <TableCell className="min-w-[16rem] max-w-[32rem] align-top">
        <BidirectionalText className="text-sm whitespace-pre-wrap break-words text-muted-foreground leading-relaxed">
          {activityText}
        </BidirectionalText>
      </TableCell>
      <TableCell className="min-w-[8rem] max-w-[14rem] align-top">
        <BidirectionalText className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
          {topicText}
        </BidirectionalText>
      </TableCell>
      <TableCell className="min-w-[8rem] max-w-[14rem] align-top">
        <BidirectionalText className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
          {departmentText}
        </BidirectionalText>
      </TableCell>
      <TableCell className="align-top">
        <Badge variant={statusBadgeVariant(row.status)}>{statusText}</Badge>
      </TableCell>
      <TableCell className="align-top whitespace-nowrap text-sm">{endDateText}</TableCell>
      {canWrite ? (
        <TableCell className="align-top w-28">
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={onEdit} aria-label="Edit">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onDelete} aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

export default function MealLearningPointsTab({ user }: Props) {
  const canWrite = canManageMealContent(user);
  const [rows, setRows] = useState<MealLearningPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<TableFilterState>(() =>
    loadFilterState(FILTER_STORAGE_KEY)
  );
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MealLearningPoint | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MealLearningPoint | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMealLearningPoints();
      setRows(data);
    } catch (e) {
      toast({
        title: 'Could not load learning points',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    saveFilterState(FILTER_STORAGE_KEY, filterState);
  }, [filterState]);

  const uniqueValues = useMemo(() => {
    const learning = new Set<string>();
    const corrective = new Set<string>();
    const status = new Set<string>();
    const endDate = new Set<string>();
    const topic = new Set<string>();
    const department = new Set<string>();
    const activity = new Set<string>();
    for (const r of rows) {
      learning.add(r.learning_point?.trim() || '—');
      corrective.add(r.corrective_action?.trim() || '—');
      status.add(mealLearningStatusLabel(r.status));
      endDate.add(formatDate(r.end_date));
      topic.add(formatTopicsFromLinks(r.activity_links));
      department.add(formatDepartmentsFromLinks(r.activity_links));
      activity.add(formatActivityLinksSummary(r.activity_links));
    }
    return {
      learning_point: [...learning].sort(),
      corrective_action: [...corrective].sort(),
      status: [...status].sort(),
      end_date: [...endDate].sort(),
      topic: [...topic].sort(),
      department: [...department].sort(),
      relative_activity: [...activity].sort(),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const lp = r.learning_point?.trim() || '—';
      const ca = r.corrective_action?.trim() || '—';
      const st = mealLearningStatusLabel(r.status);
      const ed = formatDate(r.end_date);
      const top = formatTopicsFromLinks(r.activity_links);
      const dept = formatDepartmentsFromLinks(r.activity_links);
      const act = formatActivityLinksSummary(r.activity_links);

      if (
        q &&
        !lp.toLowerCase().includes(q) &&
        !ca.toLowerCase().includes(q) &&
        !st.toLowerCase().includes(q) &&
        !top.toLowerCase().includes(q) &&
        !dept.toLowerCase().includes(q) &&
        !act.toLowerCase().includes(q)
      ) {
        return false;
      }

      if (!matchesColumnFilter(filterState, 'learning_point', lp)) return false;
      if (!matchesColumnFilter(filterState, 'corrective_action', ca)) return false;
      if (!matchesColumnFilter(filterState, 'status', st)) return false;
      if (!matchesColumnFilter(filterState, 'end_date', ed, 'date')) return false;
      if (!matchesColumnFilter(filterState, 'topic', top)) return false;
      if (!matchesColumnFilter(filterState, 'department', dept)) return false;
      if (!matchesColumnFilter(filterState, 'relative_activity', act)) return false;
      return true;
    });
  }, [rows, search, filterState]);

  const sortedIds = useMemo(() => filteredRows.map((r) => String(r.id)), [filteredRows]);

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canWrite || reordering) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rows.findIndex((r) => String(r.id) === active.id);
    const newIndex = rows.findIndex((r) => String(r.id) === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(rows, oldIndex, newIndex).map((r, i) => ({
      ...r,
      sort_order: i + 1,
    }));
    setRows(reordered);
    setReordering(true);
    try {
      await updateMealLearningPointsOrder(
        reordered.map((r, i) => ({ id: r.id, sort_order: i + 1 }))
      );
    } catch (e) {
      await loadRows();
      toast({
        title: 'Could not reorder',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setReordering(false);
    }
  };

  const handleSave = async (payload: Parameters<typeof createMealLearningPoint>[0]) => {
    if (editing) {
      const updated = await updateMealLearningPoint(editing.id, payload);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast({ title: 'Learning point updated' });
    } else {
      const created = await createMealLearningPoint(payload);
      setRows((prev) => [...prev, created]);
      toast({ title: 'Learning point added' });
    }
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMealLearningPoint(deleteTarget.id);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast({ title: 'Learning point deleted' });
      setDeleteTarget(null);
    } catch (e) {
      toast({
        title: 'Could not delete',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const updateListFilter = (columnKey: string, selected: string[]) => {
    setFilterState((prev) => ({
      ...prev,
      [columnKey]: { mode: 'list', selectedValues: selected },
    }));
  };

  const colCount = canWrite ? 9 : 8;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Learning points</CardTitle>
            <CardDescription>
              Capture lessons learned, corrective actions, and link them to strategic topic or department activities.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
            {canWrite ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading…
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <DndContext collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
              <Table>
                <TableHeader>
                  <TableRow>
                    {canWrite ? <TableHead className="w-10" /> : null}
                    <TableHead className="min-w-[12rem]">
                      <div className="flex items-center gap-1">
                        Learning point
                        <ColumnFilter
                          columnKey="learning_point"
                          columnLabel="Learning point"
                          filterId="lp-learning_point"
                          columnType="text"
                          uniqueValues={uniqueValues.learning_point}
                          selectedValues={getListSelected(filterState, 'learning_point')}
                          onListChange={(v) => updateListFilter('learning_point', v)}
                          condition={getCondition(filterState, 'learning_point')}
                          onConditionChange={(c) =>
                            setFilterState((prev) => ({ ...prev, learning_point: { mode: 'condition', ...c } }))
                          }
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[10rem]">
                      <div className="flex items-center gap-1">
                        Corrective action
                        <ColumnFilter
                          columnKey="corrective_action"
                          columnLabel="Corrective action"
                          filterId="lp-corrective_action"
                          columnType="text"
                          uniqueValues={uniqueValues.corrective_action}
                          selectedValues={getListSelected(filterState, 'corrective_action')}
                          onListChange={(v) => updateListFilter('corrective_action', v)}
                          condition={getCondition(filterState, 'corrective_action')}
                          onConditionChange={(c) =>
                            setFilterState((prev) => ({ ...prev, corrective_action: { mode: 'condition', ...c } }))
                          }
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[16rem]">
                      <div className="flex items-center gap-1">
                        Relative activity
                        <ColumnFilter
                          columnKey="relative_activity"
                          columnLabel="Relative activity"
                          filterId="lp-relative_activity"
                          columnType="text"
                          uniqueValues={uniqueValues.relative_activity}
                          selectedValues={getListSelected(filterState, 'relative_activity')}
                          onListChange={(v) => updateListFilter('relative_activity', v)}
                          condition={getCondition(filterState, 'relative_activity')}
                          onConditionChange={(c) =>
                            setFilterState((prev) => ({ ...prev, relative_activity: { mode: 'condition', ...c } }))
                          }
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[8rem]">
                      <div className="flex items-center gap-1">
                        Topic
                        <ColumnFilter
                          columnKey="topic"
                          columnLabel="Topic"
                          filterId="lp-topic"
                          columnType="text"
                          uniqueValues={uniqueValues.topic}
                          selectedValues={getListSelected(filterState, 'topic')}
                          onListChange={(v) => updateListFilter('topic', v)}
                          condition={getCondition(filterState, 'topic')}
                          onConditionChange={(c) =>
                            setFilterState((prev) => ({ ...prev, topic: { mode: 'condition', ...c } }))
                          }
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[8rem]">
                      <div className="flex items-center gap-1">
                        Department
                        <ColumnFilter
                          columnKey="department"
                          columnLabel="Department"
                          filterId="lp-department"
                          columnType="text"
                          uniqueValues={uniqueValues.department}
                          selectedValues={getListSelected(filterState, 'department')}
                          onListChange={(v) => updateListFilter('department', v)}
                          condition={getCondition(filterState, 'department')}
                          onConditionChange={(c) =>
                            setFilterState((prev) => ({ ...prev, department: { mode: 'condition', ...c } }))
                          }
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        Status
                        <ColumnFilter
                          columnKey="status"
                          columnLabel="Status"
                          filterId="lp-status"
                          columnType="text"
                          uniqueValues={uniqueValues.status}
                          selectedValues={getListSelected(filterState, 'status')}
                          onListChange={(v) => updateListFilter('status', v)}
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                          listOnly
                        />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        End date
                        <ColumnFilter
                          columnKey="end_date"
                          columnLabel="End date"
                          filterId="lp-end_date"
                          columnType="date"
                          uniqueValues={uniqueValues.end_date}
                          selectedValues={getListSelected(filterState, 'end_date')}
                          onListChange={(v) => updateListFilter('end_date', v)}
                          condition={getCondition(filterState, 'end_date')}
                          onConditionChange={(c) =>
                            setFilterState((prev) => ({ ...prev, end_date: { mode: 'condition', ...c } }))
                          }
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </TableHead>
                    {canWrite ? <TableHead className="w-28">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={colCount} className="text-center text-muted-foreground py-10">
                          {rows.length === 0
                            ? 'No learning points yet. Add one to get started.'
                            : 'No rows match your filters.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((row) => (
                        <SortableLearningRow
                          key={row.id}
                          row={row}
                          canWrite={canWrite}
                          onEdit={() => {
                            setEditing(row);
                            setFormOpen(true);
                          }}
                          onDelete={() => setDeleteTarget(row)}
                        />
                      ))
                    )}
                  </TableBody>
                </SortableContext>
              </Table>
            </DndContext>
          </div>
        )}
        {reordering ? (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving order…
          </p>
        ) : null}
      </CardContent>

      <MealLearningPointFormModal
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        initial={editing}
        onSave={handleSave}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete learning point?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the learning point and its activity links.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
