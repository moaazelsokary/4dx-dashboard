import { useMemo, useState, useEffect, useCallback, type ReactNode } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BidirectionalText from '@/components/ui/BidirectionalText';
import { ColumnFilter } from '@/components/ui/column-filter';
import {
  loadFilterState,
  saveFilterState,
  getListSelected,
  getCondition,
  matchesTextCondition,
  type TableFilterState,
} from '@/lib/tableFilterState';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import type { Department, MainPlanObjective, StrategicTopicCode, StrategicTopicKpiRow } from '@/types/wig';
import type { User } from '@/services/authService';
import KPISelector from '@/components/wig/KPISelector';
import {
  STRATEGIC_TOPIC_CODES,
  STRATEGIC_TOPIC_LABELS,
  STRATEGIC_TOPIC_STATUSES,
  parsePipeList,
  toPipeList,
  userDepartmentCodes,
  canEditStrategicTopicRow,
  canDeleteStrategicTopicRow,
  canCreateStrategicTopicRow,
} from './strategicTopicKpiUtils';
import {
  createStrategicTopicKpiRow,
  deleteStrategicTopicKpiRow,
  updateStrategicTopicKpiRow,
  updateStrategicTopicKpiRowsOrder,
} from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import { Pencil, Plus, Trash2, Loader2, Filter, Search, ZoomIn, ZoomOut, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  rows: StrategicTopicKpiRow[];
  strategicTopicCode: StrategicTopicCode;
  mainPlanObjectives: MainPlanObjective[];
  departments: Department[];
  user: User | null;
  onRefresh: () => void;
};

function formatDateShort(s: string | null | undefined): string {
  if (!s) return '—';
  return String(s).slice(0, 10);
}

function stripKpiNumberPrefix(s: string): string {
  return s.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim() || s.trim();
}

function sortedTopicsKey(raw: string): string {
  return parsePipeList(raw)
    .map((c) => c.toLowerCase())
    .sort()
    .join('||');
}

function matchesTextColumnFilter(
  state: TableFilterState,
  columnKey: string,
  cellText: string
): boolean {
  const col = state[columnKey];
  if (!col) return true;
  if (col.mode === 'condition') {
    if (col.operator === 'is_empty') return !String(cellText ?? '').trim();
    return matchesTextCondition(cellText, col.operator, col.value);
  }
  const list = col.selectedValues ?? [];
  return list.length === 0 || list.includes(cellText);
}

function objectiveCellText(row: StrategicTopicKpiRow): string {
  return (row.objective_text || row.main_objective || '—').trim() || '—';
}

function sortRowsForDisplay(rows: StrategicTopicKpiRow[]): StrategicTopicKpiRow[] {
  return [...rows].sort(
    (a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999) || a.id - b.id
  );
}

function StrategicTopicSortableRow({
  row,
  disabled,
  children,
}: {
  row: StrategicTopicKpiRow;
  disabled: boolean;
  children: (dragHandle: ReactNode | null) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id.toString(),
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };
  const dragHandle = (
    <button
      type="button"
      className={cn(
        'cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded-md shrink-0',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
      )}
      {...listeners}
      {...attributes}
      aria-label="Drag to reorder"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <TableRow ref={setNodeRef} style={style} className={cn(!disabled && 'cursor-default')}>
      {children(dragHandle)}
    </TableRow>
  );
}

function kpiFilterValueForRow(row: StrategicTopicKpiRow): string {
  return stripKpiNumberPrefix((row.main_kpi || '—').trim() || '—');
}

export default function StrategicTopicKpiTable({
  rows,
  strategicTopicCode,
  mainPlanObjectives,
  departments,
  user,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StrategicTopicKpiRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const FILTERS_KEY = `strategic-topic-kpi-${strategicTopicCode}`;
  const [tableFilterState, setTableFilterState] = useState<TableFilterState>(() => loadFilterState(FILTERS_KEY));
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [tableZoom, setTableZoom] = useState(0.85);

  const handleZoomIn = () => setTableZoom((z) => Math.min(1.5, Math.round((z + 0.05) * 100) / 100));
  const handleZoomOut = () => setTableZoom((z) => Math.max(0.5, Math.round((z - 0.05) * 100) / 100));
  const handleZoomReset = () => setTableZoom(0.85);

  const updateColumnFilter = useCallback(
    (columnKey: string, state: TableFilterState[string]) => {
      setTableFilterState((prev) => {
        const next = { ...prev, [columnKey]: state };
        saveFilterState(FILTERS_KEY, next);
        return next;
      });
    },
    [FILTERS_KEY]
  );

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setTableFilterState({});
    saveFilterState(FILTERS_KEY, {});
    setOpenFilter(null);
  }, [FILTERS_KEY]);

  const deptNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) {
      m.set(String(d.code).toLowerCase(), d.name);
    }
    return m;
  }, [departments]);

  const [mainPlanObjectiveId, setMainPlanObjectiveId] = useState<number | null>(null);
  const [objectiveText, setObjectiveText] = useState('');
  const [activity, setActivity] = useState('');
  const [expectedDuration, setExpectedDuration] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDeptCodes, setSelectedDeptCodes] = useState<string[]>([]);
  const [selectedTopicCodes, setSelectedTopicCodes] = useState<StrategicTopicCode[]>([]);
  const [status, setStatus] = useState<(typeof STRATEGIC_TOPIC_STATUSES)[number]>('In Progress');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setEditing(null);
    setMainPlanObjectiveId(null);
    setObjectiveText('');
    setActivity('');
    setExpectedDuration('');
    setStartDate('');
    setEndDate('');
    setSelectedDeptCodes([]);
    setSelectedTopicCodes([strategicTopicCode]);
    setStatus('In Progress');
    setNotes('');
  };

  const openCreate = () => {
    resetForm();
    const mine = user?.departments?.map((c) => String(c).toLowerCase()) || [];
    if (user?.role === 'department' && mine.length > 0) {
      setSelectedDeptCodes([mine[0]]);
    }
    setSelectedTopicCodes([strategicTopicCode]);
    setOpen(true);
  };

  const openEdit = (row: StrategicTopicKpiRow) => {
    setEditing(row);
    setMainPlanObjectiveId(row.main_objective_id ?? null);
    setObjectiveText(row.objective_text || '');
    setActivity(row.activity || '');
    setExpectedDuration(row.expected_duration || '');
    setStartDate(row.start_date ? String(row.start_date).slice(0, 10) : '');
    setEndDate(row.end_date ? String(row.end_date).slice(0, 10) : '');
    setSelectedDeptCodes(parsePipeList(row.associated_departments).map((c) => c.toLowerCase()));
    const topics = parsePipeList(row.associated_strategic_topics).map(
      (c) => c.toLowerCase() as StrategicTopicCode
    );
    setSelectedTopicCodes(
      topics.filter((c): c is StrategicTopicCode => STRATEGIC_TOPIC_CODES.includes(c as StrategicTopicCode))
    );
    setStatus(row.status);
    setNotes(row.notes || '');
    setOpen(true);
  };

  const selectedMainPlan = useMemo(
    () => mainPlanObjectives.find((m) => m.id === mainPlanObjectiveId) || null,
    [mainPlanObjectives, mainPlanObjectiveId]
  );

  useEffect(() => {
    if (selectedMainPlan && !objectiveText.trim()) {
      setObjectiveText(selectedMainPlan.objective || '');
    }
  }, [selectedMainPlan, objectiveText]);

  const toggleDept = (code: string, checked: boolean) => {
    const c = code.toLowerCase();
    setSelectedDeptCodes((prev) => {
      if (checked) return prev.includes(c) ? prev : [...prev, c];
      if (user?.role === 'department') {
        const mine = userDepartmentCodes(user);
        const remaining = prev.filter((x) => x !== c);
        const stillHasMine = remaining.some((x) => mine.includes(x));
        if (mine.includes(c) && !stillHasMine) return prev;
      }
      return prev.filter((x) => x !== c);
    });
  };

  const toggleTopic = (code: StrategicTopicCode, checked: boolean) => {
    setSelectedTopicCodes((prev) => {
      if (checked) return prev.includes(code) ? prev : [...prev, code];
      return prev.filter((x) => x !== code);
    });
  };

  const handleSave = async () => {
    if (!activity.trim()) {
      toast({ title: 'Activity required', variant: 'destructive' });
      return;
    }
    if (selectedDeptCodes.length === 0) {
      toast({ title: 'Departments required', description: 'Pick at least one department.', variant: 'destructive' });
      return;
    }
    if (selectedTopicCodes.length === 0) {
      toast({ title: 'Strategic pillars required', description: 'Pick at least one topic.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        strategic_topic: strategicTopicCode,
        main_objective_id: mainPlanObjectiveId,
        objective_text: objectiveText.trim() || null,
        activity: activity.trim(),
        expected_duration: expectedDuration.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        associated_departments: toPipeList(selectedDeptCodes),
        associated_strategic_topics: toPipeList(selectedTopicCodes),
        status,
        notes: notes.trim() || null,
      };
      if (editing) {
        await updateStrategicTopicKpiRow(editing.id, payload);
        toast({ title: 'Saved' });
      } else {
        await createStrategicTopicKpiRow(
          payload as Omit<StrategicTopicKpiRow, 'id' | 'created_at' | 'updated_at' | 'main_kpi' | 'main_objective' | 'main_pillar'>
        );
        toast({ title: 'Created' });
      }
      setOpen(false);
      resetForm();
      onRefresh();
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: StrategicTopicKpiRow) => {
    if (!canDeleteStrategicTopicRow(user)) return;
    if (!window.confirm('Delete this row?')) return;
    setSaving(true);
    try {
      await deleteStrategicTopicKpiRow(row.id);
      toast({ title: 'Deleted' });
      onRefresh();
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const displayDepts = useCallback(
    (s: string) =>
      parsePipeList(s)
        .map((c) => deptNameByCode.get(c.toLowerCase()) || c)
        .join(', '),
    [deptNameByCode]
  );

  const displayTopics = useCallback(
    (s: string) =>
      parsePipeList(s)
        .map((c) => STRATEGIC_TOPIC_LABELS[c as StrategicTopicCode] || c)
        .join(', '),
    []
  );

  const {
    uniqueKpis,
    uniqueObjectives,
    uniqueActivities,
    uniqueDurations,
    uniqueStarts,
    uniqueEnds,
    uniqueDeptCodes,
    uniqueTopicKeys,
    uniqueStatuses,
    uniqueNotes,
  } = useMemo(() => {
    const kpis = new Set<string>();
    const objs = new Set<string>();
    const acts = new Set<string>();
    const durs = new Set<string>();
    const starts = new Set<string>();
    const ends = new Set<string>();
    const depts = new Set<string>();
    const topics = new Set<string>();
    const stats = new Set<string>();
    const notes = new Set<string>();
    for (const r of rows) {
      kpis.add(kpiFilterValueForRow(r));
      objs.add(objectiveCellText(r));
      if (r.activity?.trim()) acts.add(r.activity.trim());
      durs.add((r.expected_duration || '—').trim());
      starts.add(formatDateShort(r.start_date));
      ends.add(formatDateShort(r.end_date));
      for (const c of parsePipeList(r.associated_departments)) {
        depts.add(c.toLowerCase());
      }
      topics.add(sortedTopicsKey(r.associated_strategic_topics));
      stats.add(r.status);
      notes.add((r.notes || '—').trim() || '—');
    }
    return {
      uniqueKpis: [...kpis].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      uniqueObjectives: [...objs].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      uniqueActivities: [...acts].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      uniqueDurations: [...durs].sort(),
      uniqueStarts: [...starts].sort(),
      uniqueEnds: [...ends].sort(),
      uniqueDeptCodes: [...depts].sort(),
      uniqueTopicKeys: [...topics].filter(Boolean).sort(),
      uniqueStatuses: [...stats].sort(),
      uniqueNotes: [...notes].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    };
  }, [rows]);

  const orderedRows = useMemo(() => sortRowsForDisplay(rows), [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return orderedRows.filter((row) => {
      if (q) {
        const hay = [
          row.main_kpi,
          row.objective_text,
          row.main_objective,
          row.activity,
          row.expected_duration,
          row.notes,
          displayDepts(row.associated_departments),
          displayTopics(row.associated_strategic_topics),
          row.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (!matchesTextColumnFilter(tableFilterState, 'kpi', kpiFilterValueForRow(row))) return false;
      if (!matchesTextColumnFilter(tableFilterState, 'objective', objectiveCellText(row))) return false;
      if (!matchesTextColumnFilter(tableFilterState, 'activity', row.activity.trim())) return false;
      if (!matchesTextColumnFilter(tableFilterState, 'duration', (row.expected_duration || '—').trim())) return false;
      if (!matchesTextColumnFilter(tableFilterState, 'start', formatDateShort(row.start_date))) return false;
      if (!matchesTextColumnFilter(tableFilterState, 'end', formatDateShort(row.end_date))) return false;

      const deptCol = tableFilterState.department;
      if (deptCol) {
        const codes = parsePipeList(row.associated_departments).map((c) => c.toLowerCase());
        if (deptCol.mode === 'condition') {
          const deptLabel = displayDepts(row.associated_departments);
          if (deptCol.operator === 'is_empty') {
            if (codes.length > 0) return false;
          } else if (!matchesTextCondition(deptLabel, deptCol.operator, deptCol.value)) return false;
        } else {
          const deptSel = deptCol.selectedValues ?? [];
          if (deptSel.length && !deptSel.some((d) => codes.includes(d.toLowerCase()))) return false;
        }
      }

      const topicKey = sortedTopicsKey(row.associated_strategic_topics);
      const topicCol = tableFilterState.topics;
      if (topicCol) {
        if (topicCol.mode === 'condition') {
          const topicLabel = displayTopics(row.associated_strategic_topics);
          if (topicCol.operator === 'is_empty') {
            if (topicKey.length > 0) return false;
          } else if (!matchesTextCondition(topicLabel, topicCol.operator, topicCol.value)) return false;
        } else {
          const topicSel = topicCol.selectedValues ?? [];
          if (topicSel.length && !topicSel.includes(topicKey)) return false;
        }
      }

      if (!matchesTextColumnFilter(tableFilterState, 'status', row.status)) return false;
      if (!matchesTextColumnFilter(tableFilterState, 'notes', (row.notes || '—').trim() || '—')) return false;

      return true;
    });
  }, [orderedRows, searchQuery, tableFilterState, displayDepts, displayTopics]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    Object.keys(tableFilterState).some((k) => {
      const col = tableFilterState[k];
      if (!col) return false;
      if (col.mode === 'list') return (col.selectedValues?.length ?? 0) > 0;
      if (col.mode === 'condition') {
        if (col.operator === 'is_empty') return true;
        return Boolean((col.value ?? '').trim() || (col.value2 ?? '').trim());
      }
      return false;
    });

  const reorderAllowed =
    canCreateStrategicTopicRow(user) && !hasActiveFilters && searchQuery.trim() === '';

  const handleTopicDragEnd = async (event: DragEndEvent) => {
    if (!reorderAllowed || orderSaving) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedRows.findIndex((r) => r.id === Number(active.id));
    const newIndex = orderedRows.findIndex((r) => r.id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(orderedRows, oldIndex, newIndex);
    const updates = reordered.map((r, i) => ({ id: r.id, sort_order: i + 1 }));
    setOrderSaving(true);
    try {
      await updateStrategicTopicKpiRowsOrder({ strategic_topic: strategicTopicCode, updates });
      toast({ title: 'Order updated' });
      onRefresh();
    } catch (e) {
      toast({
        title: 'Could not save order',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setOrderSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-0.5 p-3 pb-2 sm:p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
              <CardTitle className="shrink-0 text-sm font-semibold leading-tight sm:text-base">Table KPI</CardTitle>
              {rows.length > 0 && (
                <Badge variant="secondary" className="font-normal text-xs shrink-0">
                  Showing {filteredRows.length} of {rows.length}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0 justify-end">
              <div className="flex h-11 max-w-fit shrink-0 items-center gap-0.5 rounded-md border px-1 sm:h-8 sm:gap-1 sm:px-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleZoomOut}
                  disabled={tableZoom <= 0.5}
                  title="Zoom Out"
                  className="h-11 w-11 shrink-0 p-0 sm:h-8 sm:w-8"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="flex h-11 w-9 shrink-0 items-center justify-center text-center text-xs font-medium tabular-nums leading-none sm:h-8 sm:w-10 sm:text-sm">
                  {Math.round(tableZoom * 100)}%
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleZoomIn}
                  disabled={tableZoom >= 1.5}
                  title="Zoom In"
                  className="h-11 w-11 shrink-0 p-0 sm:h-8 sm:w-8"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleZoomReset}
                  title="Reset Zoom"
                  className="h-11 min-w-0 shrink-0 px-2 text-[11px] sm:h-8 sm:px-1.5 sm:text-xs"
                >
                  Reset
                </Button>
              </div>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearAllFilters}
                  className="h-11 shrink-0 gap-1.5 px-3 text-xs sm:h-8 sm:px-2.5"
                >
                  <Filter className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                  Clear filters
                </Button>
              )}
              {canCreateStrategicTopicRow(user) && (
                <Button
                  type="button"
                  size="sm"
                  onClick={openCreate}
                  className="h-11 shrink-0 gap-1.5 px-3 text-xs sm:h-8 sm:px-2.5"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                  Add row
                </Button>
              )}
            </div>
          </div>
          {rows.length > 0 && (
            <div className="relative max-w-full sm:max-w-md pt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
              <Input
                type="search"
                placeholder="Search KPI, objectives, activity, departments, notes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-11 text-xs sm:h-8"
                aria-label="Search table"
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div
            className="border rounded-md overflow-x-auto"
            style={{
              zoom: tableZoom,
              WebkitTransform: `scale(${tableZoom})`,
              transform: `scale(${tableZoom})`,
              transformOrigin: 'top left',
              width: tableZoom < 1 ? `${100 / tableZoom}%` : '100%',
              minHeight: tableZoom < 1 ? `${100 / tableZoom}%` : 'auto',
            }}
          >
            <Table className="border-collapse w-full min-w-[1240px] table-auto">
              <TableHeader>
                <TableRow>
                  <TableHead className="bg-primary/10 border-r border-border/50 text-center align-bottom w-16 min-w-16 max-w-20">
                    #
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 align-bottom min-w-[12rem] max-w-[22rem] w-[18%]">
                    <div className="flex items-center gap-2">
                      <span>KPI</span>
                      <ColumnFilter
                        columnKey="kpi"
                        columnLabel="KPI"
                        filterId="st-kpi"
                        columnType="text"
                        uniqueValues={uniqueKpis}
                        selectedValues={getListSelected(tableFilterState, 'kpi')}
                        onListChange={(selected) => updateColumnFilter('kpi', { mode: 'list', selectedValues: selected })}
                        condition={getCondition(tableFilterState, 'kpi')}
                        onConditionChange={(c) => updateColumnFilter('kpi', c)}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 align-bottom min-w-[11rem] max-w-[24rem] w-[16%]">
                    <div className="flex items-center gap-2">
                      <span>Objectives</span>
                      <ColumnFilter
                        columnKey="objective"
                        columnLabel="Objectives"
                        filterId="st-objective"
                        columnType="text"
                        uniqueValues={uniqueObjectives}
                        selectedValues={getListSelected(tableFilterState, 'objective')}
                        onListChange={(selected) =>
                          updateColumnFilter('objective', { mode: 'list', selectedValues: selected })
                        }
                        condition={getCondition(tableFilterState, 'objective')}
                        onConditionChange={(c) => updateColumnFilter('objective', c)}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                        scrollMaxHeight="max-h-64"
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 align-bottom min-w-[14rem] w-[22%]">
                    <div className="flex items-center gap-2">
                      <span>Activity / Task</span>
                      <ColumnFilter
                        columnKey="activity"
                        columnLabel="Activity"
                        filterId="st-activity"
                        columnType="text"
                        uniqueValues={uniqueActivities}
                        selectedValues={getListSelected(tableFilterState, 'activity')}
                        onListChange={(selected) =>
                          updateColumnFilter('activity', { mode: 'list', selectedValues: selected })
                        }
                        condition={getCondition(tableFilterState, 'activity')}
                        onConditionChange={(c) => updateColumnFilter('activity', c)}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                        scrollMaxHeight="max-h-64"
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 whitespace-nowrap align-bottom min-w-[6.5rem] w-[8%]">
                    <div className="flex items-center gap-2">
                      <span>Expected duration</span>
                      <ColumnFilter
                        columnKey="duration"
                        columnLabel="Expected duration"
                        filterId="st-duration"
                        columnType="text"
                        uniqueValues={uniqueDurations}
                        selectedValues={getListSelected(tableFilterState, 'duration')}
                        onListChange={(selected) =>
                          updateColumnFilter('duration', { mode: 'list', selectedValues: selected })
                        }
                        condition={getCondition(tableFilterState, 'duration')}
                        onConditionChange={(c) => updateColumnFilter('duration', c)}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 whitespace-nowrap align-bottom min-w-[5.5rem] w-[6%]">
                    <div className="flex items-center gap-2">
                      <span>Start</span>
                      <ColumnFilter
                        columnKey="start"
                        columnLabel="Start"
                        filterId="st-start"
                        columnType="text"
                        uniqueValues={uniqueStarts}
                        selectedValues={getListSelected(tableFilterState, 'start')}
                        onListChange={(selected) => updateColumnFilter('start', { mode: 'list', selectedValues: selected })}
                        condition={getCondition(tableFilterState, 'start')}
                        onConditionChange={(c) => updateColumnFilter('start', c)}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 whitespace-nowrap align-bottom min-w-[5.5rem] w-[6%]">
                    <div className="flex items-center gap-2">
                      <span>End</span>
                      <ColumnFilter
                        columnKey="end"
                        columnLabel="End"
                        filterId="st-end"
                        columnType="text"
                        uniqueValues={uniqueEnds}
                        selectedValues={getListSelected(tableFilterState, 'end')}
                        onListChange={(selected) => updateColumnFilter('end', { mode: 'list', selectedValues: selected })}
                        condition={getCondition(tableFilterState, 'end')}
                        onConditionChange={(c) => updateColumnFilter('end', c)}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 align-bottom min-w-[10rem] w-[12%]">
                    <div className="flex items-center gap-2">
                      <span>Departments</span>
                      <ColumnFilter
                        columnKey="department"
                        columnLabel="Departments"
                        filterId="st-dept"
                        columnType="text"
                        uniqueValues={uniqueDeptCodes}
                        selectedValues={getListSelected(tableFilterState, 'department')}
                        onListChange={(selected) =>
                          updateColumnFilter('department', { mode: 'list', selectedValues: selected })
                        }
                        condition={getCondition(tableFilterState, 'department')}
                        onConditionChange={(c) => updateColumnFilter('department', c)}
                        getLabel={(code) => deptNameByCode.get(code.toLowerCase()) || code}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 align-bottom min-w-[9rem] w-[10%]">
                    <div className="flex items-center gap-2">
                      <span>Strategic pillars</span>
                      <ColumnFilter
                        columnKey="topics"
                        columnLabel="Strategic pillars"
                        filterId="st-topics"
                        columnType="text"
                        uniqueValues={uniqueTopicKeys}
                        selectedValues={getListSelected(tableFilterState, 'topics')}
                        onListChange={(selected) =>
                          updateColumnFilter('topics', { mode: 'list', selectedValues: selected })
                        }
                        condition={getCondition(tableFilterState, 'topics')}
                        onConditionChange={(c) => updateColumnFilter('topics', c)}
                        getLabel={(key) =>
                          key
                            ? parsePipeList(key)
                                .map((c) => STRATEGIC_TOPIC_LABELS[c as StrategicTopicCode] || c)
                                .join(' · ')
                            : '—'
                        }
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                        scrollMaxHeight="max-h-56"
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 whitespace-nowrap align-bottom min-w-[6rem] w-[7%]">
                    <div className="flex items-center gap-2">
                      <span>Status</span>
                      <ColumnFilter
                        columnKey="status"
                        columnLabel="Status"
                        filterId="st-status"
                        columnType="text"
                        uniqueValues={uniqueStatuses}
                        selectedValues={getListSelected(tableFilterState, 'status')}
                        onListChange={(selected) =>
                          updateColumnFilter('status', { mode: 'list', selectedValues: selected })
                        }
                        condition={getCondition(tableFilterState, 'status')}
                        onConditionChange={(c) => updateColumnFilter('status', c)}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 border-r border-border/50 align-bottom min-w-[8rem] w-[10%]">
                    <div className="flex items-center gap-2">
                      <span>Notes</span>
                      <ColumnFilter
                        columnKey="notes"
                        columnLabel="Notes"
                        filterId="st-notes"
                        columnType="text"
                        uniqueValues={uniqueNotes}
                        selectedValues={getListSelected(tableFilterState, 'notes')}
                        onListChange={(selected) =>
                          updateColumnFilter('notes', { mode: 'list', selectedValues: selected })
                        }
                        condition={getCondition(tableFilterState, 'notes')}
                        onConditionChange={(c) => updateColumnFilter('notes', c)}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                        scrollMaxHeight="max-h-48"
                      />
                    </div>
                  </TableHead>
                  <TableHead className="bg-primary/10 text-right align-bottom w-[5.5rem] min-w-[5.5rem] whitespace-nowrap">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-12">
                      No rows yet. Add a row to get started.
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-12">
                      No rows match your filters or search. Try clearing filters.
                    </TableCell>
                  </TableRow>
                ) : reorderAllowed ? (
                  <DndContext collisionDetection={closestCenter} onDragEnd={handleTopicDragEnd}>
                    <SortableContext
                      items={filteredRows.map((r) => r.id.toString())}
                      strategy={verticalListSortingStrategy}
                    >
                      {filteredRows.map((row, rowIndex) => {
                        const canEdit = canEditStrategicTopicRow(user, row);
                        const canDel = canDeleteStrategicTopicRow(user);
                        const displayOrder =
                          row.sort_order != null && Number.isFinite(row.sort_order)
                            ? row.sort_order
                            : rowIndex + 1;

                        const indexCell = (dragHandle: React.ReactNode | null) => (
                          <TableCell className="align-top text-sm border-r border-border/50 min-w-0 w-16 text-center bg-primary/10">
                            <div className="flex items-center justify-center gap-0.5">
                              {dragHandle}
                              <span className="tabular-nums text-sm font-semibold text-primary min-w-6">
                                {displayOrder}
                              </span>
                            </div>
                          </TableCell>
                        );

                        const restCells = (
                          <>
                            <TableCell className="align-top text-sm border-r border-border/50 min-w-0">
                              <div className="flex flex-wrap gap-1">
                                <Badge variant="outline" className="text-xs font-normal max-w-full">
                                  <BidirectionalText className="break-words">{row.main_kpi || '—'}</BidirectionalText>
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-sm border-r border-border/50 min-w-0">
                              <BidirectionalText>{objectiveCellText(row)}</BidirectionalText>
                            </TableCell>
                            <TableCell className="align-top text-sm font-medium border-r border-border/50 min-w-0">
                              <BidirectionalText>{row.activity}</BidirectionalText>
                            </TableCell>
                            <TableCell className="align-top text-sm whitespace-nowrap text-muted-foreground border-r border-border/50">
                              {row.expected_duration || '—'}
                            </TableCell>
                            <TableCell className="align-top text-sm whitespace-nowrap tabular-nums border-r border-border/50">
                              {formatDateShort(row.start_date)}
                            </TableCell>
                            <TableCell className="align-top text-sm whitespace-nowrap tabular-nums border-r border-border/50">
                              {formatDateShort(row.end_date)}
                            </TableCell>
                            <TableCell className="align-top text-xs border-r border-border/50 min-w-0">
                              <BidirectionalText>{displayDepts(row.associated_departments)}</BidirectionalText>
                            </TableCell>
                            <TableCell className="align-top text-xs border-r border-border/50 min-w-0">
                              <BidirectionalText>{displayTopics(row.associated_strategic_topics)}</BidirectionalText>
                            </TableCell>
                            <TableCell className="align-top text-sm whitespace-nowrap border-r border-border/50">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'font-normal',
                                  row.status === 'Completed' &&
                                    'border-emerald-500/50 text-emerald-800 dark:text-emerald-200',
                                  row.status === 'On Hold' && 'border-amber-500/50 text-amber-900 dark:text-amber-200',
                                  row.status === 'In Progress' && 'border-sky-500/50 text-sky-900 dark:text-sky-200'
                                )}
                              >
                                {row.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top text-xs border-r border-border/50 min-w-0 break-words">
                              <BidirectionalText>{row.notes || '—'}</BidirectionalText>
                            </TableCell>
                            <TableCell className="align-top text-right space-x-1 whitespace-nowrap" data-no-drag>
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEdit(row)}
                                  aria-label="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canDel && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => handleDelete(row)}
                                  aria-label="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </>
                        );

                        return (
                          <StrategicTopicSortableRow key={row.id} row={row} disabled={orderSaving}>
                            {(dragHandle) => (
                              <>
                                {indexCell(dragHandle)}
                                {restCells}
                              </>
                            )}
                          </StrategicTopicSortableRow>
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                ) : (
                  <>
                    {filteredRows.map((row, rowIndex) => {
                      const canEdit = canEditStrategicTopicRow(user, row);
                      const canDel = canDeleteStrategicTopicRow(user);
                      const displayOrder =
                        row.sort_order != null && Number.isFinite(row.sort_order)
                          ? row.sort_order
                          : rowIndex + 1;

                      const indexCellPlain = (
                        <TableCell className="align-top text-sm border-r border-border/50 min-w-0 w-16 text-center bg-primary/10">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="tabular-nums text-sm font-semibold text-primary min-w-6">
                              {displayOrder}
                            </span>
                          </div>
                        </TableCell>
                      );

                      const restCellsPlain = (
                        <>
                          <TableCell className="align-top text-sm border-r border-border/50 min-w-0">
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-xs font-normal max-w-full">
                                <BidirectionalText className="break-words">{row.main_kpi || '—'}</BidirectionalText>
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm border-r border-border/50 min-w-0">
                            <BidirectionalText>{objectiveCellText(row)}</BidirectionalText>
                          </TableCell>
                          <TableCell className="align-top text-sm font-medium border-r border-border/50 min-w-0">
                            <BidirectionalText>{row.activity}</BidirectionalText>
                          </TableCell>
                          <TableCell className="align-top text-sm whitespace-nowrap text-muted-foreground border-r border-border/50">
                            {row.expected_duration || '—'}
                          </TableCell>
                          <TableCell className="align-top text-sm whitespace-nowrap tabular-nums border-r border-border/50">
                            {formatDateShort(row.start_date)}
                          </TableCell>
                          <TableCell className="align-top text-sm whitespace-nowrap tabular-nums border-r border-border/50">
                            {formatDateShort(row.end_date)}
                          </TableCell>
                          <TableCell className="align-top text-xs border-r border-border/50 min-w-0">
                            <BidirectionalText>{displayDepts(row.associated_departments)}</BidirectionalText>
                          </TableCell>
                          <TableCell className="align-top text-xs border-r border-border/50 min-w-0">
                            <BidirectionalText>{displayTopics(row.associated_strategic_topics)}</BidirectionalText>
                          </TableCell>
                          <TableCell className="align-top text-sm whitespace-nowrap border-r border-border/50">
                            <Badge
                              variant="outline"
                              className={cn(
                                'font-normal',
                                row.status === 'Completed' &&
                                  'border-emerald-500/50 text-emerald-800 dark:text-emerald-200',
                                row.status === 'On Hold' && 'border-amber-500/50 text-amber-900 dark:text-amber-200',
                                row.status === 'In Progress' && 'border-sky-500/50 text-sky-900 dark:text-sky-200'
                              )}
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top text-xs border-r border-border/50 min-w-0 break-words">
                            <BidirectionalText>{row.notes || '—'}</BidirectionalText>
                          </TableCell>
                          <TableCell className="align-top text-right space-x-1 whitespace-nowrap">
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEdit(row)}
                                aria-label="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canDel && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleDelete(row)}
                                aria-label="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </>
                      );

                      return (
                        <TableRow
                          key={row.id}
                          className="cursor-default border-b border-border/50 hover:bg-primary/5 transition-colors"
                        >
                          {indexCellPlain}
                          {restCellsPlain}
                        </TableRow>
                      );
                    })}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit row' : 'Add row'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>KPI (main plan)</Label>
              <KPISelector
                kpiSource="mainplan"
                mainPlanObjectives={mainPlanObjectives}
                selectedMainPlanObjectiveId={mainPlanObjectiveId}
                onMainPlanObjectiveChange={(m) => {
                  setMainPlanObjectiveId(m?.id ?? null);
                  if (m?.objective) setObjectiveText(m.objective);
                }}
                value={selectedMainPlan ? [selectedMainPlan.kpi] : []}
                onValueChange={() => {}}
                multiple={false}
                placeholder="Select main-plan KPI"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-obj">Objectives</Label>
              <Textarea id="st-obj" value={objectiveText} onChange={(e) => setObjectiveText(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-act">Activity / task</Label>
              <Input id="st-act" value={activity} onChange={(e) => setActivity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-dur">Expected duration</Label>
              <Input id="st-dur" value={expectedDuration} onChange={(e) => setExpectedDuration(e.target.value)} placeholder="e.g. 3 months" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="st-sd">Start date</Label>
                <Input id="st-sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-ed">End date</Label>
                <Input id="st-ed" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Associated departments</Label>
              <div className="rounded-md border p-3 max-h-40 overflow-y-auto space-y-2">
                {departments.map((d) => {
                  const c = String(d.code).toLowerCase();
                  return (
                    <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={selectedDeptCodes.includes(c)} onCheckedChange={(v) => toggleDept(d.code, !!v)} />
                      <span>{d.name}</span>
                      <span className="text-muted-foreground text-xs">({d.code})</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Associated strategic pillars (topics)</Label>
              <div className="rounded-md border p-3 space-y-2">
                {STRATEGIC_TOPIC_CODES.map((code) => (
                  <label key={code} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedTopicCodes.includes(code)}
                      onCheckedChange={(v) => toggleTopic(code, !!v)}
                    />
                    {STRATEGIC_TOPIC_LABELS[code]}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIC_TOPIC_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-notes">Notes</Label>
              <Textarea id="st-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
