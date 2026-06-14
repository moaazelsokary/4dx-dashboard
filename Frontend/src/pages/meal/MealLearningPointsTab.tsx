import { useCallback, useEffect, useMemo, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
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
const COLUMN_WIDTHS_STORAGE_KEY = 'meal-learning-points-column-widths';

const DEFAULT_COLUMN_WIDTHS = {
  learning_point: 200,
  corrective_action: 180,
  relative_activity: 280,
  topic: 110,
  department: 110,
  status: 90,
  end_date: 95,
} as const;

type LearningColumnKey = keyof typeof DEFAULT_COLUMN_WIDTHS;

function loadColumnWidths(): Record<LearningColumnKey, number> {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLUMN_WIDTHS };
    const parsed = JSON.parse(raw) as Partial<Record<LearningColumnKey, number>>;
    return {
      ...DEFAULT_COLUMN_WIDTHS,
      ...Object.fromEntries(
        Object.entries(parsed).filter(
          ([k, v]) => k in DEFAULT_COLUMN_WIDTHS && typeof v === 'number' && v >= 50
        )
      ),
    } as Record<LearningColumnKey, number>;
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }
}

function colWidthStyle(width: number): React.CSSProperties {
  return { width, minWidth: width, maxWidth: width };
}

function ResizableTableHead({
  columnKey,
  width,
  onResizeStart,
  children,
}: {
  columnKey: LearningColumnKey;
  width: number;
  onResizeStart: (column: LearningColumnKey, e: ReactMouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <TableHead style={{ ...colWidthStyle(width), position: 'relative' }} className="border-r border-border/50">
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${columnKey.replace(/_/g, ' ')} column`}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-10"
        onMouseDown={(e) => onResizeStart(columnKey, e)}
      />
    </TableHead>
  );
}

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
  columnWidths,
  onEdit,
  onDelete,
}: {
  row: MealLearningPoint;
  canWrite: boolean;
  columnWidths: Record<LearningColumnKey, number>;
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
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </TableCell>
      <TableCell className="align-top border-r border-border/50" style={colWidthStyle(columnWidths.learning_point)}>
        <BidirectionalText className="text-xs whitespace-pre-wrap break-words">
          {row.learning_point}
        </BidirectionalText>
      </TableCell>
      <TableCell className="align-top border-r border-border/50" style={colWidthStyle(columnWidths.corrective_action)}>
        <BidirectionalText className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
          {row.corrective_action?.trim() || '—'}
        </BidirectionalText>
      </TableCell>
      <TableCell className="align-top border-r border-border/50" style={colWidthStyle(columnWidths.relative_activity)}>
        <BidirectionalText className="text-xs whitespace-pre-wrap break-words text-muted-foreground leading-snug">
          {activityText}
        </BidirectionalText>
      </TableCell>
      <TableCell className="align-top border-r border-border/50" style={colWidthStyle(columnWidths.topic)}>
        <BidirectionalText className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
          {topicText}
        </BidirectionalText>
      </TableCell>
      <TableCell className="align-top border-r border-border/50" style={colWidthStyle(columnWidths.department)}>
        <BidirectionalText className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
          {departmentText}
        </BidirectionalText>
      </TableCell>
      <TableCell className="align-top border-r border-border/50" style={colWidthStyle(columnWidths.status)}>
        <Badge variant={statusBadgeVariant(row.status)} className="text-[10px] px-1.5 py-0 font-normal">
          {statusText}
        </Badge>
      </TableCell>
      <TableCell className="align-top whitespace-nowrap text-xs border-r border-border/50" style={colWidthStyle(columnWidths.end_date)}>
        {endDateText}
      </TableCell>
      {canWrite ? (
        <TableCell className="align-top w-28">
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={onEdit} aria-label="Edit" className="h-7 w-7 p-0">
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onDelete} aria-label="Delete" className="h-7 w-7 p-0">
              <Trash2 className="h-3.5 w-3.5" />
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
  const [columnWidths, setColumnWidths] = useState<Record<LearningColumnKey, number>>(loadColumnWidths);
  const [resizingColumn, setResizingColumn] = useState<LearningColumnKey | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  const handleResizeStart = useCallback((column: LearningColumnKey, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[column]);
  }, [columnWidths]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingColumn) return;
    const diff = e.clientX - resizeStartX;
    const newWidth = Math.max(50, resizeStartWidth + diff);
    setColumnWidths((prev) => ({ ...prev, [resizingColumn]: newWidth }));
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  const handleResizeEnd = useCallback(() => {
    setResizingColumn(null);
  }, []);

  useEffect(() => {
    if (!resizingColumn) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [resizingColumn, handleResizeMove, handleResizeEnd]);

  useEffect(() => {
    localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

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
    <Card className="text-xs">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Learning points</CardTitle>
            <CardDescription className="text-[11px] leading-snug mt-0.5">
              Capture lessons learned, corrective actions, and link them to strategic topic or department activities.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-52">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-7 h-8 text-xs"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => void loadRows()} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
            {canWrite ? (
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <DndContext collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
              <Table
                className="text-xs [&_td]:px-2 [&_td]:py-1.5 border-collapse"
                style={{ tableLayout: 'fixed', minWidth: '100%' }}
              >
                <TableHeader>
                  <TableRow className="[&_th]:text-xs [&_th]:h-8 [&_th]:px-2 [&_th]:font-medium">
                    {canWrite ? <TableHead className="w-10 border-r border-border/50" /> : null}
                    <ResizableTableHead
                      columnKey="learning_point"
                      width={columnWidths.learning_point}
                      onResizeStart={handleResizeStart}
                    >
                      <div className="flex items-center gap-1 pr-1">
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
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnKey="corrective_action"
                      width={columnWidths.corrective_action}
                      onResizeStart={handleResizeStart}
                    >
                      <div className="flex items-center gap-1 pr-1">
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
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnKey="relative_activity"
                      width={columnWidths.relative_activity}
                      onResizeStart={handleResizeStart}
                    >
                      <div className="flex items-center gap-1 pr-1">
                        Relative objective
                        <ColumnFilter
                          columnKey="relative_activity"
                          columnLabel="Relative objective"
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
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnKey="topic"
                      width={columnWidths.topic}
                      onResizeStart={handleResizeStart}
                    >
                      <div className="flex items-center gap-1 pr-1">
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
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnKey="department"
                      width={columnWidths.department}
                      onResizeStart={handleResizeStart}
                    >
                      <div className="flex items-center gap-1 pr-1">
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
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnKey="status"
                      width={columnWidths.status}
                      onResizeStart={handleResizeStart}
                    >
                      <div className="flex items-center gap-1 pr-1">
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
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnKey="end_date"
                      width={columnWidths.end_date}
                      onResizeStart={handleResizeStart}
                    >
                      <div className="flex items-center gap-1 pr-1">
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
                    </ResizableTableHead>
                    {canWrite ? <TableHead className="w-20">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8 text-xs">
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
                          columnWidths={columnWidths}
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
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
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
