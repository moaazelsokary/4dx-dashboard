import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { getDepartmentObjectives } from '@/services/wigService';
import { getMappings, createOrUpdateMapping, type ObjectiveDataSourceMapping, type MappingFormData } from '@/services/configService';
import { getMetrics, getDistinctProjectsAndMetrics } from '@/services/metricsService';
import { Save, Loader2 } from 'lucide-react';
import type { DepartmentObjective } from '@/types/wig';
import { ColumnFilter } from '@/components/ui/column-filter';
import {
  loadFilterState,
  saveFilterState,
  getListSelected,
  type TableFilterState,
} from '@/lib/tableFilterState';

interface MappingRow extends DepartmentObjective {
  mapping?: ObjectiveDataSourceMapping;
  editedMapping?: Partial<MappingFormData>;
}

const DEFAULT_COLUMN_WIDTHS = {
  department: 160,
  kpi: 180,
  activity: 280,
  targetFrom: 140,
  actualFrom: 160,
  pmsProject: 200,
  pmsMetric: 200,
  odooProject: 200,
  actions: 100,
};

const DATA_SOURCE_MAPPING_FILTERS_KEY = 'data-source-mapping-filters';

export default function DataSourceMappingList() {
  const [tableFilterState, setTableFilterState] = useState<TableFilterState>(() =>
    loadFilterState(DATA_SOURCE_MAPPING_FILTERS_KEY)
  );
  const updateColumnFilter = useCallback((columnKey: string, state: TableFilterState[string]) => {
    setTableFilterState((prev) => {
      const next = { ...prev, [columnKey]: state };
      saveFilterState(DATA_SOURCE_MAPPING_FILTERS_KEY, next);
      return next;
    });
  }, []);
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

  // Load department objectives
  const { data: objectives = [], isLoading: objectivesLoading } = useQuery({
    queryKey: ['department-objectives'],
    queryFn: () => getDepartmentObjectives(),
  });

  // Load existing mappings
  const { data: mappings = [], isLoading: mappingsLoading } = useQuery({
    queryKey: ['objective-mappings'],
    queryFn: () => getMappings(),
  });

  // Load metrics data for dropdowns
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics-data'],
    queryFn: () => getMetrics(),
  });

  // Memoized mapping index and derived data
  const mappingIndex = useMemo(() => {
    const index: Record<number, ObjectiveDataSourceMapping> = {};
    mappings.forEach(m => { index[m.department_objective_id] = m; });
    return index;
  }, [mappings]);

  const { pmsProjects, pmsMetrics, odooProjects } = useMemo(
    () => metricsData ? getDistinctProjectsAndMetrics(metricsData) : { pmsProjects: [], pmsMetrics: [], odooProjects: [] },
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
  const rows = useMemo<MappingRow[]>(() =>
    objectives.map(obj => ({
      ...obj,
      mapping: mappingIndex[obj.id],
      editedMapping: editedMappings[obj.id],
    })),
    [objectives, mappingIndex, editedMappings]
  );

  // Distinct values for filter dropdowns (from objectives)
  const filterOptions = useMemo(() => {
    const departments = [...new Set(objectives.map(o => o.department_name).filter(Boolean))].sort() as string[];
    const kpis = [...new Set(objectives.map(o => o.kpi).filter(Boolean))].sort() as string[];
    const activities = [...new Set(objectives.map(o => o.activity).filter(Boolean))].sort() as string[];
    return { departments, kpis, activities };
  }, [objectives]);

  // Effective target/actual source for a row (for filtering)
  const getEffectiveTargetSource = useCallback((row: MappingRow): 'manual' | 'pms_target' => {
    const edited = editedMappings[row.id];
    const current = edited ?? row.mapping;
    return current?.target_source === 'pms_target' ? 'pms_target' : 'manual';
  }, [editedMappings]);

  const getEffectiveActualSource = useCallback((row: MappingRow): 'manual' | 'pms_actual' | 'odoo_services_done' | 'odoo_services_created' => {
    const edited = editedMappings[row.id];
    const current = edited ?? row.mapping;
    if (current?.actual_source === 'pms_actual' || current?.actual_source === 'odoo_services_done' || current?.actual_source === 'odoo_services_created') return current.actual_source;
    return 'manual';
  }, [editedMappings]);

  const filteredRows = useMemo(() => {
    const deptList = getListSelected(tableFilterState, 'department');
    const kpiList = getListSelected(tableFilterState, 'kpi');
    const activityList = getListSelected(tableFilterState, 'activity');
    const targetFromList = getListSelected(tableFilterState, 'targetFrom');
    const actualFromList = getListSelected(tableFilterState, 'actualFrom');
    return rows.filter((row) => {
      if (deptList.length > 0 && !deptList.includes(row.department_name ?? '')) return false;
      if (kpiList.length > 0 && !kpiList.includes(row.kpi ?? '')) return false;
      if (activityList.length > 0 && !activityList.includes(row.activity ?? '')) return false;
      if (targetFromList.length > 0 && !targetFromList.includes(getEffectiveTargetSource(row))) return false;
      if (actualFromList.length > 0 && !actualFromList.includes(getEffectiveActualSource(row))) return false;
      return true;
    });
  }, [rows, tableFilterState, getEffectiveTargetSource, getEffectiveActualSource]);

  const updateMapping = useCallback((objectiveId: number, field: keyof MappingFormData, value: any) => {
    setEditedMappings(prev => {
      const current = prev[objectiveId] || {};
      const mapping = mappingIndex[objectiveId];
      
      // Initialize from existing mapping if available
      const base: Partial<MappingFormData> = mapping ? {
        pms_project_name: mapping.pms_project_name || '',
        pms_metric_name: mapping.pms_metric_name || '',
        target_source: mapping.target_source === 'pms_target' ? 'pms_target' : 'manual',
        // Backend: 'manual' | 'pms_actual' | 'odoo_services_done'; default display Manual
        actual_source: (mapping.actual_source === 'pms_actual' || mapping.actual_source === 'odoo_services_done' || mapping.actual_source === 'odoo_services_created')
          ? mapping.actual_source
          : 'manual',
        odoo_project_name: mapping.odoo_project_name || '',
      } : {
        pms_project_name: '',
        pms_metric_name: '',
        target_source: 'manual',
        actual_source: 'manual',
        odoo_project_name: '',
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
    mutationFn: ({ objectiveId, mappingData }: { objectiveId: number; mappingData: MappingFormData }) =>
      createOrUpdateMapping(objectiveId, mappingData),
    onSuccess: (_data, variables) => {
      const objectiveId = variables.objectiveId;
      setEditedMappings(prev => {
        const next = { ...prev };
        delete next[objectiveId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['objective-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping', objectiveId] });
      queryClient.refetchQueries({ queryKey: ['objective-mappings'] });
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
    if (!['manual', 'pms_actual', 'odoo_services_done', 'odoo_services_created'].includes(actualSource)) {
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
      <CardHeader>
        <CardTitle className="text-sm">Objective Data Source Mapping</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table style={{ tableLayout: 'fixed', width: '100%' }} className="border-collapse">
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: columnWidths.department, minWidth: columnWidths.department, position: 'relative' }} className="border-r border-border/50">
                  <div className="flex items-center gap-2">
                    <span>Department</span>
                    <ColumnFilter
                      columnKey="department"
                      columnLabel="Department"
                      filterId="mapping-department"
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
                <TableHead style={{ width: columnWidths.kpi, minWidth: columnWidths.kpi, position: 'relative' }} className="border-r border-border/50">
                  <div className="flex items-center gap-2">
                    <span>KPI</span>
                    <ColumnFilter
                      columnKey="kpi"
                      columnLabel="KPI"
                      filterId="mapping-kpi"
                      columnType="text"
                      uniqueValues={filterOptions.kpis}
                      selectedValues={getListSelected(tableFilterState, 'kpi')}
                      onListChange={(selected) => updateColumnFilter('kpi', { mode: 'list', selectedValues: selected })}
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                  <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50" onMouseDown={(e) => handleResizeStart('kpi', e)} />
                </TableHead>
                <TableHead style={{ width: columnWidths.activity, minWidth: columnWidths.activity, position: 'relative' }} className="border-r border-border/50">
                  <div className="flex items-center gap-2">
                    <span>Activity</span>
                    <ColumnFilter
                      columnKey="activity"
                      columnLabel="Objective"
                      filterId="mapping-activity"
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
                      filterId="mapping-targetFrom"
                      columnType="text"
                      uniqueValues={['manual', 'pms_target']}
                      selectedValues={getListSelected(tableFilterState, 'targetFrom')}
                      onListChange={(selected) => updateColumnFilter('targetFrom', { mode: 'list', selectedValues: selected })}
                      getLabel={(v) => (v === 'pms_target' ? 'PMS' : 'Manual')}
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
                      filterId="mapping-actualFrom"
                      columnType="text"
                      uniqueValues={['manual', 'pms_actual', 'odoo_services_done', 'odoo_services_created']}
                      selectedValues={getListSelected(tableFilterState, 'actualFrom')}
                      onListChange={(selected) => updateColumnFilter('actualFrom', { mode: 'list', selectedValues: selected })}
                      getLabel={(v) => (v === 'pms_actual' ? 'PMS Actual' : v === 'odoo_services_done' ? 'Odoo ServicesDone' : v === 'odoo_services_created' ? 'Odoo ServicesCreated' : 'Manual')}
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
                <TableHead style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {                filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No objectives found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => {
                  const edited = editedMappings[row.id];
                  const current = edited || row.mapping;
                  const hasChanges = edited !== undefined;
                  const targetSource = edited?.target_source ?? (current?.target_source === 'pms_target' ? 'pms_target' : 'manual');
                  const actualSource = edited?.actual_source ?? (current?.actual_source === 'pms_actual' || current?.actual_source === 'odoo_services_done' || current?.actual_source === 'odoo_services_created' ? current?.actual_source : 'manual');
                  const pmsEnabled = targetSource === 'pms_target' || actualSource === 'pms_actual';
                  const odooEnabled = actualSource === 'odoo_services_done' || actualSource === 'odoo_services_created';
                  const pmsProject = edited?.pms_project_name || current?.pms_project_name || '';
                  const filteredMetrics = pmsProject ? (pmsMetricsByProject[pmsProject] ?? []) : pmsMetrics;

                  return (
                    <TableRow key={row.id}>
                      <TableCell style={{ width: columnWidths.department, minWidth: columnWidths.department }} className="font-medium border-r border-border/50">{row.department_name || '-'}</TableCell>
                      <TableCell style={{ width: columnWidths.kpi, minWidth: columnWidths.kpi }} className="border-r border-border/50">{row.kpi || '-'}</TableCell>
                      <TableCell style={{ width: columnWidths.activity, minWidth: columnWidths.activity }} className="truncate border-r border-border/50" title={row.activity || ''}>{row.activity || '-'}</TableCell>
                      <TableCell style={{ width: columnWidths.targetFrom, minWidth: columnWidths.targetFrom }} className="border-r border-border/50">
                        <Select value={targetSource} onValueChange={(value: 'pms_target' | 'manual') => updateMapping(row.id, 'target_source', value)}>
                          <SelectTrigger className="h-8 min-w-0 w-full max-w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="pms_target">PMS</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell style={{ width: columnWidths.actualFrom, minWidth: columnWidths.actualFrom }} className="border-r border-border/50">
                        <Select value={actualSource} onValueChange={(value: 'manual' | 'pms_actual' | 'odoo_services_done' | 'odoo_services_created') => updateMapping(row.id, 'actual_source', value)}>
                          <SelectTrigger className="h-8 min-w-0 w-full max-w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="pms_actual">PMS Actual</SelectItem>
                            <SelectItem value="odoo_services_done">Odoo ServicesDone</SelectItem>
                            <SelectItem value="odoo_services_created">Odoo ServicesCreated</SelectItem>
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
          <p>• Click <strong>Save</strong> to save changes for each objective.</p>
        </div>
      </CardContent>
    </Card>
  );
}
