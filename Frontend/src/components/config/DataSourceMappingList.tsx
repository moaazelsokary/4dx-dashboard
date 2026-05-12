import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import {
  getDepartmentObjectives,
  getStrategicDepartmentObjectives,
  getStrategicTopicKpiRows,
} from '@/services/wigService';
import {
  getMappings,
  createOrUpdateMapping,
  getStrategicMappings,
  createOrUpdateStrategicMapping,
  getTopicKpiMappings,
  createOrUpdateTopicKpiMapping,
  type MappingFormData,
} from '@/services/configService';
import type {
  ObjectiveDataSourceMapping,
  StrategicObjectiveDataSourceMapping,
  TopicKpiDataSourceMapping,
} from '@/types/config';
import { getMetrics, getDistinctProjectsAndMetrics } from '@/services/metricsService';
import { Save, Loader2 } from 'lucide-react';
import type { DepartmentObjective, StrategicDepartmentObjective, StrategicTopicKpiRow } from '@/types/wig';
import { ColumnFilter } from '@/components/ui/column-filter';
import {
  loadFilterState,
  saveFilterState,
  getListSelected,
  type TableFilterState,
} from '@/lib/tableFilterState';
import { STRATEGIC_TOPIC_CODES, STRATEGIC_TOPIC_LABELS } from '@/pages/strategic-topics/strategicTopicKpiUtils';

type MappingTab = 'bau' | 'strategic' | 'topic';

interface MappingRow extends DepartmentObjective {
  /** Topics tab: objective line from topic KPI table (objective_text or main plan objective). */
  topic_objective_label?: string;
  mapping?: ObjectiveDataSourceMapping | StrategicObjectiveDataSourceMapping | TopicKpiDataSourceMapping;
  editedMapping?: Partial<MappingFormData>;
}

const DEFAULT_COLUMN_WIDTHS = {
  department: 160,
  topicObjective: 300,
  activity: 320,
  targetFrom: 140,
  actualFrom: 160,
  pmsProject: 200,
  pmsMetric: 200,
  odooProject: 200,
  derivedProject: 180,
  actions: 100,
};

const DATA_SOURCE_MAPPING_FILTERS_KEY = 'data-source-mapping-filters';

export default function DataSourceMappingList() {
  const [mappingTab, setMappingTab] = useState<MappingTab>('bau');
  const filtersKey = `${DATA_SOURCE_MAPPING_FILTERS_KEY}-${mappingTab}`;

  const [tableFilterState, setTableFilterState] = useState<TableFilterState>(() =>
    loadFilterState(`${DATA_SOURCE_MAPPING_FILTERS_KEY}-bau`)
  );

  useEffect(() => {
    setTableFilterState(loadFilterState(filtersKey));
  }, [filtersKey]);

  useEffect(() => {
    setEditedMappings({});
  }, [mappingTab]);

  const updateColumnFilter = useCallback(
    (columnKey: string, state: TableFilterState[string]) => {
      setTableFilterState((prev) => {
        const next = { ...prev, [columnKey]: state };
        saveFilterState(filtersKey, next);
        return next;
      });
    },
    [filtersKey]
  );
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [editedMappings, setEditedMappings] = useState<Record<number, Partial<MappingFormData>>>({});
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [resizingColumn, setResizingColumn] = useState<keyof typeof DEFAULT_COLUMN_WIDTHS | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const queryClient = useQueryClient();

  const handleResizeStart = (column: keyof typeof DEFAULT_COLUMN_WIDTHS, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[column]);
  };
  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingColumn) return;
    const diff = e.clientX - resizeStartX;
    setColumnWidths(prev => ({ ...prev, [resizingColumn]: Math.max(80, resizeStartWidth + diff) }));
  }, [resizingColumn, resizeStartX, resizeStartWidth]);
  const handleResizeEnd = useCallback(() => { setResizingColumn(null); }, []);
  useEffect(() => {
    if (!resizingColumn) return;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [resizingColumn, handleResizeMove, handleResizeEnd]);

  // Load objectives / strategic objectives / topic KPI rows
  const { data: rawObjectives = [], isLoading: objectivesLoading } = useQuery({
    queryKey: ['data-source-mapping-objectives', mappingTab],
    queryFn: async () => {
      if (mappingTab === 'bau') return getDepartmentObjectives();
      if (mappingTab === 'strategic') return getStrategicDepartmentObjectives();
      const chunks = await Promise.all(STRATEGIC_TOPIC_CODES.map((t) => getStrategicTopicKpiRows(t)));
      return chunks.flat();
    },
  });

  const { data: mappings = [], isLoading: mappingsLoading } = useQuery({
    queryKey: ['data-source-mapping-mappings', mappingTab],
    queryFn: () => {
      if (mappingTab === 'bau') return getMappings();
      if (mappingTab === 'strategic') return getStrategicMappings();
      return getTopicKpiMappings();
    },
  });

  // Load metrics data for dropdowns (force fetch to include derived definitions)
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics-data'],
    queryFn: () => getMetrics(true),
  });

  // Memoized mapping index and derived data
  const mappingIndex = useMemo(() => {
    const index: Record<
      number,
      ObjectiveDataSourceMapping | StrategicObjectiveDataSourceMapping | TopicKpiDataSourceMapping
    > = {};
    mappings.forEach((m) => {
      const rec = m as Record<string, unknown>;
      const id =
        mappingTab === 'bau'
          ? Number(rec.department_objective_id)
          : mappingTab === 'strategic'
            ? Number(rec.strategic_department_objective_id)
            : Number(rec.strategic_topic_kpi_row_id);
      if (Number.isFinite(id)) index[id] = m as ObjectiveDataSourceMapping;
    });
    return index;
  }, [mappings, mappingTab]);

  const { pmsProjects, pmsMetrics, odooProjects, derivedProjects } = useMemo(
    () => metricsData ? getDistinctProjectsAndMetrics(metricsData) : { pmsProjects: [], pmsMetrics: [], odooProjects: [], derivedProjects: [] },
    [metricsData]
  );

  // Precomputed PMS metrics by project for fast per-row lookup (avoids recalc every render)
  const pmsMetricsByProject = useMemo(() => {
    if (!metricsData?.pms) return {} as Record<string, string[]>;
    const byProject: Record<string, string[]> = {};
    for (const m of metricsData.pms) {
      const name = m.ProjectName ?? '';
      if (!byProject[name]) byProject[name] = [];
      if (m.MetricName) byProject[name].push(m.MetricName);
    }
    Object.keys(byProject).forEach(p => { byProject[p] = [...new Set(byProject[p])].sort(); });
    return byProject;
  }, [metricsData]);

  const getFilteredPmsMetrics = useCallback((selectedProject: string | undefined) => {
    if (!selectedProject || selectedProject === '') return pmsMetrics;
    return pmsMetricsByProject[selectedProject] ?? [];
  }, [pmsMetrics, pmsMetricsByProject]);

  // Combine objectives with mappings (memoized)
  const rows = useMemo<MappingRow[]>(() => {
    if (mappingTab === 'bau') {
      return (rawObjectives as DepartmentObjective[]).map((obj) => ({
        ...obj,
        mapping: mappingIndex[obj.id],
        editedMapping: editedMappings[obj.id],
      }));
    }
    if (mappingTab === 'strategic') {
      return (rawObjectives as StrategicDepartmentObjective[]).map((obj) => ({
        ...(obj as unknown as DepartmentObjective),
        kpi: obj.kpi || '',
        activity: obj.activity || '',
        mapping: mappingIndex[obj.id],
        editedMapping: editedMappings[obj.id],
      }));
    }
    return (rawObjectives as StrategicTopicKpiRow[]).map((obj) => ({
      id: obj.id,
      main_objective_id: obj.main_objective_id,
      department_id: 0,
      department_name: STRATEGIC_TOPIC_LABELS[obj.strategic_topic] || obj.strategic_topic,
      kpi: '',
      topic_objective_label: (obj.objective_text || obj.main_objective || '—').trim() || '—',
      activity: obj.activity,
      type: 'Direct',
      activity_target: 0,
      responsible_person: '—',
      mov: '—',
      mapping: mappingIndex[obj.id],
      editedMapping: editedMappings[obj.id],
    })) as MappingRow[];
  }, [rawObjectives, mappingIndex, editedMappings, mappingTab]);

  const filterOptions = useMemo(() => {
    const departments = [...new Set(rows.map((o) => o.department_name).filter(Boolean))].sort() as string[];
    const topicObjectives =
      mappingTab === 'topic'
        ? ([...new Set(rows.map((o) => o.topic_objective_label).filter(Boolean))].sort() as string[])
        : [];
    const activities = [...new Set(rows.map((o) => o.activity).filter(Boolean))].sort() as string[];
    return { departments, topicObjectives, activities };
  }, [rows, mappingTab]);

  // Effective target/actual source for a row (for filtering)
  const getEffectiveTargetSource = useCallback((row: MappingRow): 'manual' | 'pms_target' | 'derived' => {
    const edited = editedMappings[row.id];
    const current = edited ?? row.mapping;
    return current?.target_source === 'derived' ? 'derived' : current?.target_source === 'pms_target' ? 'pms_target' : 'manual';
  }, [editedMappings]);

  const getEffectiveActualSource = useCallback((row: MappingRow): 'manual' | 'pms_actual' | 'odoo_services_done' | 'odoo_services_created' | 'derived' => {
    const edited = editedMappings[row.id];
    const current = edited ?? row.mapping;
    if (current?.actual_source === 'pms_actual' || current?.actual_source === 'odoo_services_done' || current?.actual_source === 'odoo_services_created' || current?.actual_source === 'derived') return current.actual_source;
    return 'manual';
  }, [editedMappings]);

  const filteredRows = useMemo(() => {
    const deptList = getListSelected(tableFilterState, 'department');
    const topicObjectiveList =
      mappingTab === 'topic' ? getListSelected(tableFilterState, 'topicObjective') : [];
    const activityList = getListSelected(tableFilterState, 'activity');
    const targetFromList = getListSelected(tableFilterState, 'targetFrom');
    const actualFromList = getListSelected(tableFilterState, 'actualFrom');
    return rows.filter((row) => {
      if (deptList.length > 0 && !deptList.includes(row.department_name ?? '')) return false;
      if (
        mappingTab === 'topic' &&
        topicObjectiveList.length > 0 &&
        !topicObjectiveList.includes(row.topic_objective_label ?? '')
      ) {
        return false;
      }
      if (activityList.length > 0 && !activityList.includes(row.activity ?? '')) return false;
      if (targetFromList.length > 0 && !targetFromList.includes(getEffectiveTargetSource(row))) return false;
      if (actualFromList.length > 0 && !actualFromList.includes(getEffectiveActualSource(row))) return false;
      return true;
    });
  }, [rows, tableFilterState, getEffectiveTargetSource, getEffectiveActualSource, mappingTab]);

  const updateMapping = useCallback(<K extends keyof MappingFormData>(objectiveId: number, field: K, value: MappingFormData[K]) => {
    setEditedMappings(prev => {
      const current = prev[objectiveId] || {};
      const mapping = mappingIndex[objectiveId];
      
      // Initialize from existing mapping if available
      const base: Partial<MappingFormData> = mapping ? {
        pms_project_name: mapping.pms_project_name || '',
        pms_metric_name: mapping.pms_metric_name || '',
        target_source: mapping.target_source === 'derived' ? 'derived' : mapping.target_source === 'pms_target' ? 'pms_target' : 'manual',
        actual_source: (mapping.actual_source === 'pms_actual' || mapping.actual_source === 'odoo_services_done' || mapping.actual_source === 'odoo_services_created' || mapping.actual_source === 'derived')
          ? mapping.actual_source
          : 'manual',
        odoo_project_name: mapping.odoo_project_name || '',
        derived_project_name: mapping.derived_project_name || '',
      } : {
        pms_project_name: '',
        pms_metric_name: '',
        target_source: 'manual',
        actual_source: 'manual',
        odoo_project_name: '',
        derived_project_name: '',
      };

      const updated = { ...base, ...current, [field]: value };
      
      // If actual_source changed to 'odoo_services_done', ensure odoo_project_name is set
      // If actual_source changed to 'pms_actual', clear odoo_project_name requirement
      if (field === 'actual_source') {
        if ((value === 'odoo_services_done' || value === 'odoo_services_created') && !updated.odoo_project_name) {
          updated.odoo_project_name = '';
        }
      }

      // If pms_project_name changed, reset pms_metric_name if it's not valid for new project
      if (field === 'pms_project_name') {
        const validMetrics = getFilteredPmsMetrics(value);
        if (updated.pms_metric_name && !validMetrics.includes(updated.pms_metric_name)) {
          updated.pms_metric_name = '';
        }
      }

      return { ...prev, [objectiveId]: updated };
    });
  }, [mappingIndex, getFilteredPmsMetrics]);

  const saveMutation = useMutation({
    mutationFn: ({ objectiveId, mappingData }: { objectiveId: number; mappingData: MappingFormData }) => {
      if (mappingTab === 'bau') return createOrUpdateMapping(objectiveId, mappingData);
      if (mappingTab === 'strategic') return createOrUpdateStrategicMapping(objectiveId, mappingData);
      return createOrUpdateTopicKpiMapping(objectiveId, mappingData);
    },
    onSuccess: (_data, variables) => {
      const objectiveId = variables.objectiveId;
      setEditedMappings((prev) => {
        const next = { ...prev };
        delete next[objectiveId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['data-source-mapping-mappings', mappingTab] });
      const okind = mappingTab === 'bau' ? 'bau' : mappingTab === 'strategic' ? 'strategic' : 'topic_kpi';
      queryClient.invalidateQueries({ queryKey: ['mapping', objectiveId, okind] });
      queryClient.refetchQueries({ queryKey: ['data-source-mapping-mappings', mappingTab] });
      toast({
        title: 'Success',
        description: 'Mapping saved successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save mapping',
        variant: 'destructive',
      });
    },
  });

  const handleSave = (objectiveId: number) => {
    const edited = editedMappings[objectiveId];
    if (!edited) return;

    const actualSource = edited.actual_source ?? 'manual';
    if (!['manual', 'pms_actual', 'odoo_services_done', 'odoo_services_created', 'derived'].includes(actualSource)) {
      toast({
        title: 'Error',
        description: 'Actual From is required',
        variant: 'destructive',
      });
      return;
    }

    if ((actualSource === 'odoo_services_done' || actualSource === 'odoo_services_created') && !edited.odoo_project_name) {
      toast({
        title: 'Error',
        description: 'Odoo Project is required when Actual From is Odoo ServicesDone or Odoo ServicesCreated',
        variant: 'destructive',
      });
      return;
    }

    const needsDerived = edited.target_source === 'derived' || actualSource === 'derived';
    if (needsDerived && !edited.derived_project_name) {
      toast({
        title: 'Error',
        description: 'Derived project is required when Target From or Actual From is Derived',
        variant: 'destructive',
      });
      return;
    }

    const needsPms = edited.target_source === 'pms_target' || actualSource === 'pms_actual';
    if (needsPms && (!edited.pms_project_name || !edited.pms_metric_name)) {
      toast({
        title: 'Error',
        description: 'PMS Project and Metric are required when Target From is PMS or Actual From is PMS Actual',
        variant: 'destructive',
      });
      return;
    }

    saveMutation.mutate({
      objectiveId,
      mappingData: edited as MappingFormData
    });
  };

  const isLoading = objectivesLoading || mappingsLoading || metricsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading mappings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm">Data source mapping</CardTitle>
          <Tabs value={mappingTab} onValueChange={(v) => setMappingTab(v as MappingTab)}>
            <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:min-w-[22rem]">
              <TabsTrigger value="bau">BAU KPIs</TabsTrigger>
              <TabsTrigger value="strategic">Strategic KPIs</TabsTrigger>
              <TabsTrigger value="topic">Topics KPIs</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table style={{ tableLayout: 'fixed', width: '100%' }} className="border-collapse">
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: columnWidths.department, minWidth: columnWidths.department, position: 'relative' }} className="border-r border-border/50">
                  <div className="flex items-center gap-2">
                    <span>{mappingTab === 'topic' ? 'Topic' : 'Department'}</span>
                    <ColumnFilter
                      columnKey="department"
                      columnLabel={mappingTab === 'topic' ? 'Topic' : 'Department'}
                      filterId={`mapping-department-${mappingTab}`}
                      columnType="text"
                      uniqueValues={filterOptions.departments}
                      selectedValues={getListSelected(tableFilterState, 'department')}
                      onListChange={(selected) => updateColumnFilter('department', { mode: 'list', selectedValues: selected })}
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                  <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50" onMouseDown={(e) => handleResizeStart('department', e)} />
                </TableHead>
                {mappingTab === 'topic' ? (
                  <TableHead
                    style={{ width: columnWidths.topicObjective, minWidth: columnWidths.topicObjective, position: 'relative' }}
                    className="border-r border-border/50"
                  >
                    <div className="flex items-center gap-2">
                      <span>Objective</span>
                      <ColumnFilter
                        columnKey="topicObjective"
                        columnLabel="Objective"
                        filterId={`mapping-topicObjective-${mappingTab}`}
                        columnType="text"
                        uniqueValues={filterOptions.topicObjectives}
                        selectedValues={getListSelected(tableFilterState, 'topicObjective')}
                        onListChange={(selected) => updateColumnFilter('topicObjective', { mode: 'list', selectedValues: selected })}
                        getLabel={(a) => (a.length > 60 ? a.slice(0, 60) + '…' : a)}
                        openFilterId={openFilter}
                        onOpenFilterChange={setOpenFilter}
                        listOnly
                      />
                    </div>
                    <div
                      className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50"
                      onMouseDown={(e) => handleResizeStart('topicObjective', e)}
                    />
                  </TableHead>
                ) : null}
                <TableHead style={{ width: columnWidths.activity, minWidth: columnWidths.activity, position: 'relative' }} className="border-r border-border/50">
                  <div className="flex items-center gap-2">
                    <span>Activity</span>
                    <ColumnFilter
                      columnKey="activity"
                      columnLabel="Activity"
                      filterId={`mapping-activity-${mappingTab}`}
                      columnType="text"
                      uniqueValues={filterOptions.activities}
                      selectedValues={getListSelected(tableFilterState, 'activity')}
                      onListChange={(selected) => updateColumnFilter('activity', { mode: 'list', selectedValues: selected })}
                      getLabel={(a) => (a.length > 50 ? a.slice(0, 50) + '…' : a)}
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                  <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50" onMouseDown={(e) => handleResizeStart('activity', e)} />
                </TableHead>
                <TableHead style={{ width: columnWidths.targetFrom, minWidth: columnWidths.targetFrom, position: 'relative' }} className="border-r border-border/50">
                  <div className="flex items-center gap-2">
                    <span>Target From</span>
                    <ColumnFilter
                      columnKey="targetFrom"
                      columnLabel="Target From"
                      filterId={`mapping-targetFrom-${mappingTab}`}
                      columnType="text"
                      uniqueValues={['manual', 'pms_target', 'derived']}
                      selectedValues={getListSelected(tableFilterState, 'targetFrom')}
                      onListChange={(selected) => updateColumnFilter('targetFrom', { mode: 'list', selectedValues: selected })}
                      getLabel={(v) => (v === 'pms_target' ? 'PMS' : v === 'derived' ? 'Derived' : 'Manual')}
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                  <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50" onMouseDown={(e) => handleResizeStart('targetFrom', e)} />
                </TableHead>
                <TableHead style={{ width: columnWidths.actualFrom, minWidth: columnWidths.actualFrom, position: 'relative' }} className="border-r border-border/50">
                  <div className="flex items-center gap-2">
                    <span>Actual From</span>
                    <ColumnFilter
                      columnKey="actualFrom"
                      columnLabel="Actual From"
                      filterId={`mapping-actualFrom-${mappingTab}`}
                      columnType="text"
                      uniqueValues={['manual', 'pms_actual', 'odoo_services_done', 'odoo_services_created', 'derived']}
                      selectedValues={getListSelected(tableFilterState, 'actualFrom')}
                      onListChange={(selected) => updateColumnFilter('actualFrom', { mode: 'list', selectedValues: selected })}
                      getLabel={(v) => (v === 'pms_actual' ? 'PMS Actual' : v === 'odoo_services_done' ? 'Odoo ServicesDone' : v === 'odoo_services_created' ? 'Odoo ServicesCreated' : v === 'derived' ? 'Derived' : 'Manual')}
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                  <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50" onMouseDown={(e) => handleResizeStart('actualFrom', e)} />
                </TableHead>
                <TableHead style={{ width: columnWidths.pmsProject, minWidth: columnWidths.pmsProject, position: 'relative' }} className="border-r border-border/50">PMS Project
                  <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50" onMouseDown={(e) => handleResizeStart('pmsProject', e)} />
                </TableHead>
                <TableHead style={{ width: columnWidths.pmsMetric, minWidth: columnWidths.pmsMetric, position: 'relative' }} className="border-r border-border/50">PMS Metric
                  <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50" onMouseDown={(e) => handleResizeStart('pmsMetric', e)} />
                </TableHead>
                <TableHead style={{ width: columnWidths.odooProject, minWidth: columnWidths.odooProject, position: 'relative' }} className="border-r border-border/50">Odoo Project
                  <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50" onMouseDown={(e) => handleResizeStart('odooProject', e)} />
                </TableHead>
                <TableHead style={{ width: columnWidths.derivedProject, minWidth: columnWidths.derivedProject, position: 'relative' }} className="border-r border-border/50">Derived Project
                  <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50" onMouseDown={(e) => handleResizeStart('derivedProject', e)} />
                </TableHead>
                <TableHead style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {                filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={mappingTab === 'topic' ? 10 : 9} className="text-center text-muted-foreground py-8">
                    No objectives found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => {
                  const edited = editedMappings[row.id];
                  const current = edited || row.mapping;
                  const hasChanges = edited !== undefined;
                  const targetSource = edited?.target_source ?? (current?.target_source === 'derived' ? 'derived' : current?.target_source === 'pms_target' ? 'pms_target' : 'manual');
                  const actualSource = edited?.actual_source ?? (current?.actual_source === 'pms_actual' || current?.actual_source === 'odoo_services_done' || current?.actual_source === 'odoo_services_created' || current?.actual_source === 'derived' ? current?.actual_source : 'manual');
                  const pmsEnabled = targetSource === 'pms_target' || actualSource === 'pms_actual';
                  const odooEnabled = actualSource === 'odoo_services_done' || actualSource === 'odoo_services_created';
                  const derivedEnabled = targetSource === 'derived' || actualSource === 'derived';
                  const pmsProject = edited?.pms_project_name || current?.pms_project_name || '';
                  const filteredMetrics = pmsProject ? (pmsMetricsByProject[pmsProject] ?? []) : pmsMetrics;

                  return (
                    <TableRow key={row.id}>
                      <TableCell style={{ width: columnWidths.department, minWidth: columnWidths.department }} className="font-medium border-r border-border/50">{row.department_name || '-'}</TableCell>
                      {mappingTab === 'topic' ? (
                        <TableCell
                          style={{ width: columnWidths.topicObjective, minWidth: columnWidths.topicObjective }}
                          className="text-sm min-w-0 border-r border-border/50 break-words [overflow-wrap:anywhere]"
                          title={row.topic_objective_label || ''}
                        >
                          {row.topic_objective_label || '—'}
                        </TableCell>
                      ) : null}
                      <TableCell
                        style={{ width: columnWidths.activity, minWidth: columnWidths.activity }}
                        className="text-sm min-w-0 border-r border-border/50 break-words [overflow-wrap:anywhere]"
                        title={row.activity || ''}
                      >
                        {row.activity || '-'}
                      </TableCell>
                      <TableCell style={{ width: columnWidths.targetFrom, minWidth: columnWidths.targetFrom }} className="border-r border-border/50">
                        <Select value={targetSource} onValueChange={(value: 'pms_target' | 'derived' | 'manual') => updateMapping(row.id, 'target_source', value)}>
                          <SelectTrigger className="h-8 min-w-0 w-full max-w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="pms_target">PMS</SelectItem>
                            <SelectItem value="derived">Derived</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell style={{ width: columnWidths.actualFrom, minWidth: columnWidths.actualFrom }} className="border-r border-border/50">
                        <Select value={actualSource} onValueChange={(value: 'manual' | 'pms_actual' | 'odoo_services_done' | 'odoo_services_created' | 'derived') => updateMapping(row.id, 'actual_source', value)}>
                          <SelectTrigger className="h-8 min-w-0 w-full max-w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="pms_actual">PMS Actual</SelectItem>
                            <SelectItem value="odoo_services_done">Odoo ServicesDone</SelectItem>
                            <SelectItem value="odoo_services_created">Odoo ServicesCreated</SelectItem>
                            <SelectItem value="derived">Derived</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell style={{ width: columnWidths.pmsProject, minWidth: columnWidths.pmsProject }} className="border-r border-border/50">
                        <Select value={edited?.pms_project_name || current?.pms_project_name || ''} onValueChange={(value) => updateMapping(row.id, 'pms_project_name', value)} disabled={!pmsEnabled}>
                          <SelectTrigger className="h-8 min-w-0 w-full max-w-full">
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {pmsProjects.map(project => (
                              <SelectItem key={project} value={project}>{project}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell style={{ width: columnWidths.pmsMetric, minWidth: columnWidths.pmsMetric }} className="border-r border-border/50">
                        <Select value={edited?.pms_metric_name || current?.pms_metric_name || ''} onValueChange={(value) => updateMapping(row.id, 'pms_metric_name', value)} disabled={!pmsEnabled || (!edited?.pms_project_name && !current?.pms_project_name)}>
                          <SelectTrigger className="h-8 min-w-0 w-full max-w-full">
                            <SelectValue placeholder="Select metric" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredMetrics.map(metric => (
                              <SelectItem key={metric} value={metric}>{metric}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell style={{ width: columnWidths.odooProject, minWidth: columnWidths.odooProject }} className="border-r border-border/50">
                        <Select value={edited?.odoo_project_name || current?.odoo_project_name || ''} onValueChange={(value) => updateMapping(row.id, 'odoo_project_name', value)} disabled={!odooEnabled}>
                          <SelectTrigger className="h-8 min-w-0 w-full max-w-full">
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {odooProjects.map(project => (
                              <SelectItem key={project} value={project}>{project}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell style={{ width: columnWidths.derivedProject, minWidth: columnWidths.derivedProject }} className="border-r border-border/50">
                        <Select value={edited?.derived_project_name ?? current?.derived_project_name ?? ''} onValueChange={(value) => updateMapping(row.id, 'derived_project_name', value)} disabled={!derivedEnabled}>
                          <SelectTrigger className="h-8 min-w-0 w-full max-w-full">
                            <SelectValue placeholder="Select derived" />
                          </SelectTrigger>
                          <SelectContent>
                            {derivedProjects.map(project => (
                              <SelectItem key={project} value={project}>{project}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}>
                        {hasChanges && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSave(row.id)}
                            disabled={saveMutation.isPending}
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                        )}
                        {current && !hasChanges && (
                          <Badge variant="secondary" className="text-xs">Mapped</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          <p>• Choose <strong>Target From</strong> first (default Manual), then <strong>Actual From</strong> (default Manual).</p>
          <p>• <strong>PMS Project &amp; Metric</strong> are editable when Target From = PMS or Actual From = PMS Actual; required when either is from PMS.</p>
          <p>• <strong>Odoo Project</strong> is editable and required when Actual From = Odoo ServicesDone or Odoo ServicesCreated.</p>
          <p>• <strong>Derived Project</strong> is editable and required when Target From or Actual From = Derived (use metrics created on PMS &amp; Odoo Metrics page).</p>
          <p>• Click <strong>Save</strong> to save changes for each objective.</p>
        </div>
      </CardContent>
    </Card>
  );
}
