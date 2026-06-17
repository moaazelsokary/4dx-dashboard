import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, Plus, RefreshCw, Search, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ColumnFilter } from '@/components/ui/column-filter';
import BidirectionalText from '@/components/ui/BidirectionalText';
import { cn } from '@/lib/utils';
import {
  getCondition,
  getListSelected,
  loadFilterState,
  matchesNumberCondition,
  matchesTextCondition,
  saveFilterState,
  type TableFilterState,
} from '@/lib/tableFilterState';
import { toast } from '@/hooks/use-toast';
import { getCurrentUser } from '@/services/authService';
import {
  createCmMealUserKpiRow,
  deleteCmMealUserKpiRow,
  updateCmMealUserKpiRow,
  updateCmMealUserKpiRowsOrder,
} from '@/services/wigService';
import type { CmMealUserKpiRow, CmMealUserKpiTeamMember } from '@/types/wig';
import {
  canWriteCmMealUserKpiForTarget,
  isCmMealManagerRole,
  showEmployeeScopeFilter,
  userIdFromUser,
} from '@/config/cmMealUserKpiAccess';

const FILTER_STORAGE_KEY = 'cm-meal-user-kpis-table-filters';
const COLUMN_WIDTHS_STORAGE_KEY = 'cm-meal-user-kpis-column-widths';

const DEFAULT_COLUMN_WIDTHS = {
  employee: 140,
  kpi: 170,
  activity: 210,
  target: 90,
  actual: 90,
  difference: 95,
  start_date: 100,
  end_date: 100,
  notes: 200,
} as const;

type DataColumnKey = keyof typeof DEFAULT_COLUMN_WIDTHS;

type Props = {
  rows: CmMealUserKpiRow[];
  loading: boolean;
  onReload: () => Promise<void>;
  employees: CmMealUserKpiTeamMember[];
  employeeScope: 'all' | number;
  onEmployeeScopeChange: (scope: 'all' | number) => void;
  onRowsChange?: (rows: CmMealUserKpiRow[]) => void;
  roleKpiOptions?: { value: string; label: string; userId: number }[];
};

type DraftRow = {
  user_id: string;
  kpi: string;
  activity: string;
  target: string;
  actual: string;
  start_date: string;
  end_date: string;
  notes: string;
};

function emptyDraft(defaultUserId: string): DraftRow {
  return {
    user_id: defaultUserId,
    kpi: '',
    activity: '',
    target: '',
    actual: '',
    start_date: '',
    end_date: '',
    notes: '',
  };
}

function normalizeDate(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return raw.slice(0, 10);
}

function formatDate(value: string | null | undefined): string {
  return normalizeDate(value) ?? '—';
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function rowDifference(row: CmMealUserKpiRow): number | null {
  if (row.difference != null) return row.difference;
  if (row.target == null || row.actual == null) return null;
  return row.target - row.actual;
}

function loadColumnWidths(): Record<DataColumnKey, number> {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLUMN_WIDTHS };
    const parsed = JSON.parse(raw) as Partial<Record<DataColumnKey, number>>;
    return {
      ...DEFAULT_COLUMN_WIDTHS,
      ...Object.fromEntries(
        Object.entries(parsed).filter(
          ([k, v]) => k in DEFAULT_COLUMN_WIDTHS && typeof v === 'number' && v >= 60
        )
      ),
    } as Record<DataColumnKey, number>;
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
  columnKey: DataColumnKey;
  width: number;
  onResizeStart: (column: DataColumnKey, e: ReactMouseEvent) => void;
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

function matchesFilter(
  state: TableFilterState,
  columnKey: string,
  cellText: string,
  columnType: 'text' | 'number' | 'date',
  numericValue?: number | null
): boolean {
  const col = state[columnKey];
  if (!col) return true;

  if (col.mode === 'condition') {
    if (col.operator === 'is_empty') return !String(cellText ?? '').trim() || cellText === '—';
    if (columnType === 'number') {
      return matchesNumberCondition(numericValue, col.operator, col.value, col.value2);
    }
    if (columnType === 'date') {
      const raw = cellText === '—' ? '' : cellText;
      if (col.operator === 'equals') return raw === (col.value ?? '');
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

function draftFromRow(row: CmMealUserKpiRow): DraftRow {
  return {
    user_id: String(row.user_id),
    kpi: row.kpi ?? '',
    activity: row.activity,
    target: row.target == null ? '' : String(row.target),
    actual: row.actual == null ? '' : String(row.actual),
    start_date: normalizeDate(row.start_date) ?? '',
    end_date: normalizeDate(row.end_date) ?? '',
    notes: row.notes ?? '',
  };
}

function SortableKpiRow({
  row,
  index,
  showEmployeeColumn,
  canWrite,
  canReorder,
  columnWidths,
  deleting,
  onEdit,
  onDelete,
}: {
  row: CmMealUserKpiRow;
  index: number;
  showEmployeeColumn: boolean;
  canWrite: boolean;
  canReorder: boolean;
  columnWidths: Record<DataColumnKey, number>;
  deleting: boolean;
  onEdit: (row: CmMealUserKpiRow) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(row.id),
    disabled: !canReorder || !canWrite,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className={isDragging ? 'bg-muted/40' : undefined}>
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
      <TableCell
        className="text-center bg-primary/10 border-r border-border/50"
        style={colWidthStyle(36)}
      >
        <span className="text-sm font-semibold text-primary tabular-nums">{index + 1}</span>
      </TableCell>
      {showEmployeeColumn ? (
        <TableCell className="align-top border-r border-border/50" style={colWidthStyle(columnWidths.employee)}>
          <BidirectionalText className="text-xs">{row.username?.trim() || row.user_id}</BidirectionalText>
        </TableCell>
      ) : null}
      <TableCell className="align-top border-r border-border/50" style={colWidthStyle(columnWidths.kpi)}>
        {row.kpi?.trim() ? (
          <Badge variant="outline" className="text-xs font-normal">
            <BidirectionalText>{row.kpi}</BidirectionalText>
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="align-top border-r border-border/50" style={colWidthStyle(columnWidths.activity)}>
        <BidirectionalText className="text-xs whitespace-normal break-words">{row.activity || '—'}</BidirectionalText>
      </TableCell>
      <TableCell
        className="align-top border-r border-border/50 text-right tabular-nums text-xs"
        style={colWidthStyle(columnWidths.target)}
      >
        {formatNumber(row.target)}
      </TableCell>
      <TableCell
        className="align-top border-r border-border/50 text-right tabular-nums text-xs"
        style={colWidthStyle(columnWidths.actual)}
      >
        {formatNumber(row.actual)}
      </TableCell>
      <TableCell
        className="align-top border-r border-border/50 text-right tabular-nums text-xs text-muted-foreground"
        style={colWidthStyle(columnWidths.difference)}
      >
        {formatNumber(rowDifference(row))}
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs tabular-nums" style={colWidthStyle(columnWidths.start_date)}>
        {formatDate(row.start_date)}
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs tabular-nums" style={colWidthStyle(columnWidths.end_date)}>
        {formatDate(row.end_date)}
      </TableCell>
      <TableCell className="align-top border-r border-border/50 text-xs whitespace-normal break-words" style={colWidthStyle(columnWidths.notes)}>
        <BidirectionalText>{row.notes?.trim() || '—'}</BidirectionalText>
      </TableCell>
      <TableCell className="w-[4.5rem] align-top">
        {canWrite ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onEdit(row)}
              aria-label="Edit KPI row"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 text-destructive"
              disabled={deleting}
              onClick={() => onDelete(row.id)}
              aria-label="Delete KPI row"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export default function CmMealUserKpisTab({
  rows,
  loading,
  onReload,
  employees,
  employeeScope,
  onEmployeeScopeChange,
  onRowsChange,
  roleKpiOptions = [],
}: Props) {
  const user = useMemo(() => getCurrentUser(), []);
  const selfId = userIdFromUser(user);
  const teamIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const showEmployeeColumn = showEmployeeScopeFilter(user);
  const canReorder = employeeScope !== 'all';

  const [search, setSearch] = useState('');
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<TableFilterState>(() => loadFilterState(FILTER_STORAGE_KEY));
  const [columnWidths, setColumnWidths] = useState<Record<DataColumnKey, number>>(loadColumnWidths);
  const [resizingColumn, setResizingColumn] = useState<DataColumnKey | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [reordering, setReordering] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CmMealUserKpiRow | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const allTeamLabel = isCmMealManagerRole(user?.role) ? 'All my team' : 'All team';

  const defaultAddUserId = useMemo(() => {
    if (employeeScope !== 'all') return String(employeeScope);
    if (selfId != null && employees.some((e) => e.id === selfId)) return String(selfId);
    return employees[0] ? String(employees[0].id) : '';
  }, [employeeScope, selfId, employees]);

  const [draft, setDraft] = useState<DraftRow>(() => emptyDraft(defaultAddUserId));

  useEffect(() => {
    setDraft((prev) => (prev.user_id ? prev : emptyDraft(defaultAddUserId)));
  }, [defaultAddUserId]);

  const openAddForm = useCallback(() => {
    setEditingRow(null);
    setDraft(emptyDraft(defaultAddUserId));
    setFormOpen(true);
  }, [defaultAddUserId]);

  const openEditForm = useCallback((row: CmMealUserKpiRow) => {
    setEditingRow(row);
    setDraft(draftFromRow(row));
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditingRow(null);
    setDraft(emptyDraft(defaultAddUserId));
  }, [defaultAddUserId]);

  const handleResizeStart = useCallback((column: DataColumnKey, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[column]);
  }, [columnWidths]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingColumn) return;
    const diff = e.clientX - resizeStartX;
    const newWidth = Math.max(60, resizeStartWidth + diff);
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

  useEffect(() => {
    saveFilterState(FILTER_STORAGE_KEY, filterState);
  }, [filterState]);

  const canWriteForRow = useCallback(
    (row: CmMealUserKpiRow) => canWriteCmMealUserKpiForTarget(user, row.user_id, teamIds),
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

  const kpiOptionsForDraft = useMemo(() => {
    const ownerId = Number.parseInt(draft.user_id, 10);
    if (!ownerId) return roleKpiOptions;
    return roleKpiOptions.filter((o) => o.userId === ownerId);
  }, [roleKpiOptions, draft.user_id]);

  const uniqueValues = useMemo(() => {
    const employee = new Set<string>();
    const kpi = new Set<string>();
    const activity = new Set<string>();
    const target = new Set<string>();
    const actual = new Set<string>();
    const difference = new Set<string>();
    const startDate = new Set<string>();
    const endDate = new Set<string>();
    const notes = new Set<string>();

    for (const row of rows) {
      employee.add(row.username?.trim() || String(row.user_id));
      kpi.add(row.kpi?.trim() || '—');
      activity.add(row.activity?.trim() || '—');
      target.add(formatNumber(row.target));
      actual.add(formatNumber(row.actual));
      difference.add(formatNumber(rowDifference(row)));
      startDate.add(formatDate(row.start_date));
      endDate.add(formatDate(row.end_date));
      notes.add(row.notes?.trim() || '—');
    }

    return {
      employee: [...employee].sort(),
      kpi: [...kpi].sort(),
      activity: [...activity].sort(),
      target: [...target].sort(),
      actual: [...actual].sort(),
      difference: [...difference].sort(),
      start_date: [...startDate].sort(),
      end_date: [...endDate].sort(),
      notes: [...notes].sort(),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const employeeText = row.username?.trim() || String(row.user_id);
      const kpiText = row.kpi?.trim() || '—';
      const activityText = row.activity?.trim() || '—';
      const targetText = formatNumber(row.target);
      const actualText = formatNumber(row.actual);
      const diffNum = rowDifference(row);
      const differenceText = formatNumber(diffNum);
      const startDateText = formatDate(row.start_date);
      const endDateText = formatDate(row.end_date);
      const notesText = row.notes?.trim() || '—';

      if (
        q &&
        !employeeText.toLowerCase().includes(q) &&
        !kpiText.toLowerCase().includes(q) &&
        !activityText.toLowerCase().includes(q) &&
        !targetText.toLowerCase().includes(q) &&
        !actualText.toLowerCase().includes(q) &&
        !differenceText.toLowerCase().includes(q) &&
        !startDateText.toLowerCase().includes(q) &&
        !endDateText.toLowerCase().includes(q) &&
        !notesText.toLowerCase().includes(q)
      ) {
        return false;
      }

      if (showEmployeeColumn && !matchesFilter(filterState, 'employee', employeeText, 'text')) return false;
      if (!matchesFilter(filterState, 'kpi', kpiText, 'text')) return false;
      if (!matchesFilter(filterState, 'activity', activityText, 'text')) return false;
      if (!matchesFilter(filterState, 'target', targetText, 'number', row.target)) return false;
      if (!matchesFilter(filterState, 'actual', actualText, 'number', row.actual)) return false;
      if (!matchesFilter(filterState, 'difference', differenceText, 'number', diffNum)) return false;
      if (!matchesFilter(filterState, 'start_date', startDateText, 'date')) return false;
      if (!matchesFilter(filterState, 'end_date', endDateText, 'date')) return false;
      if (!matchesFilter(filterState, 'notes', notesText, 'text')) return false;

      return true;
    });
  }, [rows, search, showEmployeeColumn, filterState]);

  const filteredIds = useMemo(() => filteredRows.map((r) => String(r.id)), [filteredRows]);

  const updateListFilter = (columnKey: string, selected: string[]) => {
    setFilterState((prev) => ({
      ...prev,
      [columnKey]: { mode: 'list', selectedValues: selected },
    }));
  };

  const handleFormSave = async () => {
    const activity = draft.activity.trim();
    if (!activity) {
      toast({ title: 'Activity is required', variant: 'destructive' });
      return;
    }
    const kpi = draft.kpi.trim();
    if (!kpi) {
      toast({ title: 'KPI is required', description: 'Choose a KPI from Roles & Responsibilities.', variant: 'destructive' });
      return;
    }

    const target = draft.target.trim() === '' ? null : Number(draft.target);
    const actual = draft.actual.trim() === '' ? null : Number(draft.actual);
    if (draft.target.trim() !== '' && Number.isNaN(target)) {
      toast({ title: 'Target must be a number', variant: 'destructive' });
      return;
    }
    if (draft.actual.trim() !== '' && Number.isNaN(actual)) {
      toast({ title: 'Actual must be a number', variant: 'destructive' });
      return;
    }

    const payload = {
      kpi,
      activity,
      target,
      actual,
      notes: draft.notes.trim() || null,
      start_date: normalizeDate(draft.start_date),
      end_date: normalizeDate(draft.end_date),
    };

    if (editingRow) {
      if (!canWriteForRow(editingRow)) return;

      const previousRows = rows;
      const optimisticRows = rows.map((r) => (r.id === editingRow.id ? { ...r, ...payload } : r));

      setSavingForm(true);
      try {
        if (onRowsChange) onRowsChange(optimisticRows);
        const updated = await updateCmMealUserKpiRow(editingRow.id, payload);
        if (onRowsChange) {
          onRowsChange(optimisticRows.map((r) => (r.id === updated.id ? updated : r)));
        } else {
          await onReload();
        }
        closeForm();
        toast({ title: 'KPI updated' });
      } catch (e) {
        if (onRowsChange) onRowsChange(previousRows);
        toast({
          title: 'Could not update KPI',
          description: e instanceof Error ? e.message : 'Request failed',
          variant: 'destructive',
        });
        if (!onRowsChange) await onReload();
      } finally {
        setSavingForm(false);
      }
      return;
    }

    const ownerId = Number.parseInt(draft.user_id, 10);
    if (!ownerId || !canWriteCmMealUserKpiForTarget(user, ownerId, teamIds)) {
      toast({ title: 'Cannot add KPI for this employee', variant: 'destructive' });
      return;
    }

    setSavingForm(true);
    try {
      const created = await createCmMealUserKpiRow({
        user_id: ownerId,
        ...payload,
        responsible: null,
      });

      if (onRowsChange) {
        onRowsChange([...rows, created]);
      } else {
        await onReload();
      }

      closeForm();
      toast({ title: 'KPI added' });
    } catch (e) {
      toast({
        title: 'Could not add KPI',
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

    const previousRows = rows;
    const nextRows = rows.filter((r) => r.id !== id);

    setDeletingId(id);
    try {
      if (onRowsChange) onRowsChange(nextRows);
      await deleteCmMealUserKpiRow(id);
      if (!onRowsChange) await onReload();
    } catch (e) {
      if (onRowsChange) onRowsChange(previousRows);
      toast({
        title: 'Could not delete KPI row',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
      if (!onRowsChange) await onReload();
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

    const previousRows = rows;
    const reordered = arrayMove(rows, oldIndex, newIndex).map((r, idx) => ({
      ...r,
      sort_order: idx + 1,
    }));

    setReordering(true);
    try {
      if (onRowsChange) onRowsChange(reordered);
      await updateCmMealUserKpiRowsOrder(
        reordered.map((r, idx) => ({ id: r.id, sort_order: idx + 1 }))
      );
      if (!onRowsChange) await onReload();
    } catch (e) {
      if (onRowsChange) onRowsChange(previousRows);
      toast({
        title: 'Could not reorder KPI rows',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
      await onReload();
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
            <CardTitle className="text-sm font-semibold">Employee KPIs</CardTitle>
            <CardDescription className="text-[11px] leading-snug mt-0.5">
              Track KPI progress per employee. Use Edit to update rows, filters to narrow the list, and drag to reorder.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showEmployeeColumn ? (
              <div className="w-full sm:w-[13rem]">
                <Select
                  value={employeeScope === 'all' ? 'all' : String(employeeScope)}
                  onValueChange={(v) => onEmployeeScopeChange(v === 'all' ? 'all' : Number.parseInt(v, 10))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Employee scope" />
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
              </div>
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
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                onClick={openAddForm}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add KPI
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
              <Table className="text-xs [&_td]:px-2 [&_td]:py-1.5 border-collapse" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                <TableHeader>
                  <TableRow className="[&_th]:text-xs [&_th]:h-8 [&_th]:px-2 [&_th]:font-medium">
                    <TableHead className="w-9 border-r border-border/50" />
                    <TableHead className="w-9 border-r border-border/50">N</TableHead>
                    {showEmployeeColumn ? (
                      <ResizableTableHead columnKey="employee" width={columnWidths.employee} onResizeStart={handleResizeStart}>
                        <div className="flex items-center gap-1 pr-1">
                          Employee
                          <ColumnFilter
                            columnKey="employee"
                            columnLabel="Employee"
                            filterId="cm-user-kpi-employee"
                            columnType="text"
                            uniqueValues={uniqueValues.employee}
                            selectedValues={getListSelected(filterState, 'employee')}
                            onListChange={(v) => updateListFilter('employee', v)}
                            condition={getCondition(filterState, 'employee')}
                            onConditionChange={(c) => setFilterState((prev) => ({ ...prev, employee: { mode: 'condition', ...c } }))}
                            openFilterId={openFilterId}
                            onOpenFilterChange={setOpenFilterId}
                          />
                        </div>
                      </ResizableTableHead>
                    ) : null}
                    <ResizableTableHead columnKey="kpi" width={columnWidths.kpi} onResizeStart={handleResizeStart}>
                      <div className="flex items-center gap-1 pr-1">
                        KPI
                        <ColumnFilter
                          columnKey="kpi"
                          columnLabel="KPI"
                          filterId="cm-user-kpi-kpi"
                          columnType="text"
                          uniqueValues={uniqueValues.kpi}
                          selectedValues={getListSelected(filterState, 'kpi')}
                          onListChange={(v) => updateListFilter('kpi', v)}
                          condition={getCondition(filterState, 'kpi')}
                          onConditionChange={(c) => setFilterState((prev) => ({ ...prev, kpi: { mode: 'condition', ...c } }))}
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </ResizableTableHead>
                    <ResizableTableHead columnKey="activity" width={columnWidths.activity} onResizeStart={handleResizeStart}>
                      <div className="flex items-center gap-1 pr-1">
                        Activity
                        <ColumnFilter
                          columnKey="activity"
                          columnLabel="Activity"
                          filterId="cm-user-kpi-activity"
                          columnType="text"
                          uniqueValues={uniqueValues.activity}
                          selectedValues={getListSelected(filterState, 'activity')}
                          onListChange={(v) => updateListFilter('activity', v)}
                          condition={getCondition(filterState, 'activity')}
                          onConditionChange={(c) => setFilterState((prev) => ({ ...prev, activity: { mode: 'condition', ...c } }))}
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </ResizableTableHead>
                    <ResizableTableHead columnKey="target" width={columnWidths.target} onResizeStart={handleResizeStart}>
                      <div className="flex items-center gap-1 pr-1">
                        Target
                        <ColumnFilter
                          columnKey="target"
                          columnLabel="Target"
                          filterId="cm-user-kpi-target"
                          columnType="number"
                          uniqueValues={uniqueValues.target}
                          selectedValues={getListSelected(filterState, 'target')}
                          onListChange={(v) => updateListFilter('target', v)}
                          condition={getCondition(filterState, 'target')}
                          onConditionChange={(c) => setFilterState((prev) => ({ ...prev, target: { mode: 'condition', ...c } }))}
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </ResizableTableHead>
                    <ResizableTableHead columnKey="actual" width={columnWidths.actual} onResizeStart={handleResizeStart}>
                      <div className="flex items-center gap-1 pr-1">
                        Actual
                        <ColumnFilter
                          columnKey="actual"
                          columnLabel="Actual"
                          filterId="cm-user-kpi-actual"
                          columnType="number"
                          uniqueValues={uniqueValues.actual}
                          selectedValues={getListSelected(filterState, 'actual')}
                          onListChange={(v) => updateListFilter('actual', v)}
                          condition={getCondition(filterState, 'actual')}
                          onConditionChange={(c) => setFilterState((prev) => ({ ...prev, actual: { mode: 'condition', ...c } }))}
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </ResizableTableHead>
                    <ResizableTableHead columnKey="difference" width={columnWidths.difference} onResizeStart={handleResizeStart}>
                      <div className="flex items-center gap-1 pr-1">
                        Difference
                        <ColumnFilter
                          columnKey="difference"
                          columnLabel="Difference"
                          filterId="cm-user-kpi-difference"
                          columnType="number"
                          uniqueValues={uniqueValues.difference}
                          selectedValues={getListSelected(filterState, 'difference')}
                          onListChange={(v) => updateListFilter('difference', v)}
                          condition={getCondition(filterState, 'difference')}
                          onConditionChange={(c) => setFilterState((prev) => ({ ...prev, difference: { mode: 'condition', ...c } }))}
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </ResizableTableHead>
                    <ResizableTableHead columnKey="start_date" width={columnWidths.start_date} onResizeStart={handleResizeStart}>
                      <div className="flex items-center gap-1 pr-1">
                        Start date
                        <ColumnFilter
                          columnKey="start_date"
                          columnLabel="Start date"
                          filterId="cm-user-kpi-start-date"
                          columnType="date"
                          uniqueValues={uniqueValues.start_date}
                          selectedValues={getListSelected(filterState, 'start_date')}
                          onListChange={(v) => updateListFilter('start_date', v)}
                          condition={getCondition(filterState, 'start_date')}
                          onConditionChange={(c) => setFilterState((prev) => ({ ...prev, start_date: { mode: 'condition', ...c } }))}
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </ResizableTableHead>
                    <ResizableTableHead columnKey="end_date" width={columnWidths.end_date} onResizeStart={handleResizeStart}>
                      <div className="flex items-center gap-1 pr-1">
                        End date
                        <ColumnFilter
                          columnKey="end_date"
                          columnLabel="End date"
                          filterId="cm-user-kpi-end-date"
                          columnType="date"
                          uniqueValues={uniqueValues.end_date}
                          selectedValues={getListSelected(filterState, 'end_date')}
                          onListChange={(v) => updateListFilter('end_date', v)}
                          condition={getCondition(filterState, 'end_date')}
                          onConditionChange={(c) => setFilterState((prev) => ({ ...prev, end_date: { mode: 'condition', ...c } }))}
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </ResizableTableHead>
                    <ResizableTableHead columnKey="notes" width={columnWidths.notes} onResizeStart={handleResizeStart}>
                      <div className="flex items-center gap-1 pr-1">
                        Notes
                        <ColumnFilter
                          columnKey="notes"
                          columnLabel="Notes"
                          filterId="cm-user-kpi-notes"
                          columnType="text"
                          uniqueValues={uniqueValues.notes}
                          selectedValues={getListSelected(filterState, 'notes')}
                          onListChange={(v) => updateListFilter('notes', v)}
                          condition={getCondition(filterState, 'notes')}
                          onConditionChange={(c) => setFilterState((prev) => ({ ...prev, notes: { mode: 'condition', ...c } }))}
                          openFilterId={openFilterId}
                          onOpenFilterChange={setOpenFilterId}
                        />
                      </div>
                    </ResizableTableHead>
                    <TableHead className="w-[4.5rem]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <SortableContext items={filteredIds} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8 text-xs">
                          {rows.length === 0 ? 'No KPI rows yet. Add one to get started.' : 'No rows match your filters.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((row, idx) => (
                        <SortableKpiRow
                          key={row.id}
                          row={row}
                          index={idx}
                          showEmployeeColumn={showEmployeeColumn}
                          canWrite={canWriteForRow(row)}
                          canReorder={canReorder}
                          columnWidths={columnWidths}
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
        {reordering ? (
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving order…
          </p>
        ) : null}
      </CardContent>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
          else setFormOpen(true);
        }}
      >
        <DialogContent className="text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingRow ? 'Edit KPI' : 'Add KPI'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {editingRow ? (
              showEmployeeColumn ? (
                <div className="space-y-1">
                  <Label className="text-xs">Employee</Label>
                  <p className="text-xs text-muted-foreground py-1.5">
                    {editingRow.username?.trim() || editingRow.user_id}
                  </p>
                </div>
              ) : null
            ) : showEmployeeColumn && writableEmployees.length > 1 ? (
              <div className="space-y-1">
                <Label className="text-xs">Employee</Label>
                <Select
                  value={draft.user_id}
                  onValueChange={(value) => setDraft((prev) => ({ ...prev, user_id: value }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select employee" />
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
              {kpiOptionsForDraft.length > 0 ? (
                <Select
                  value={draft.kpi || '__none__'}
                  onValueChange={(v) => setDraft((prev) => ({ ...prev, kpi: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select KPI from roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Select KPI —</SelectItem>
                    {editingRow?.kpi?.trim() &&
                    !kpiOptionsForDraft.some((o) => o.value === editingRow.kpi?.trim()) ? (
                      <SelectItem value={editingRow.kpi.trim()}>{editingRow.kpi.trim()}</SelectItem>
                    ) : null}
                    {kpiOptionsForDraft.map((o) => (
                      <SelectItem key={`${o.userId}-${o.value}`} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input
                    className="h-8 text-xs"
                    value={draft.kpi}
                    onChange={(e) => setDraft((prev) => ({ ...prev, kpi: e.target.value }))}
                    disabled
                    placeholder="Add roles in Roles & Responsibilities first"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Define KPIs in the Roles & Responsibilities tab for this employee first.
                  </p>
                </>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Activity</Label>
              <Input
                className="h-8 text-xs"
                value={draft.activity}
                onChange={(e) => setDraft((prev) => ({ ...prev, activity: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Target</Label>
                <Input
                  className="h-8 text-xs"
                  inputMode="decimal"
                  value={draft.target}
                  onChange={(e) => setDraft((prev) => ({ ...prev, target: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Actual</Label>
                <Input
                  className="h-8 text-xs"
                  inputMode="decimal"
                  value={draft.actual}
                  onChange={(e) => setDraft((prev) => ({ ...prev, actual: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start date</Label>
                <Input
                  className="h-8 text-xs"
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => setDraft((prev) => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End date</Label>
                <Input
                  className="h-8 text-xs"
                  type="date"
                  value={draft.end_date}
                  onChange={(e) => setDraft((prev) => ({ ...prev, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={3}
                className="text-xs"
                value={draft.notes}
                onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
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
