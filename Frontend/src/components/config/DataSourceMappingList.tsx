import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { getDepartmentObjectives } from '@/services/wigService';
import { getMappings, createOrUpdateMapping, type ObjectiveDataSourceMapping, type MappingFormData } from '@/services/configService';
import { getMetrics, getDistinctProjectsAndMetrics } from '@/services/metricsService';
import { Save, Loader2, Filter } from 'lucide-react';
import type { DepartmentObjective } from '@/types/wig';

interface MappingRow extends DepartmentObjective {
  mapping?: ObjectiveDataSourceMapping;
  editedMapping?: Partial<MappingFormData>;
}

export default function DataSourceMappingList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterKpi, setFilterKpi] = useState('');
  const [filterObjective, setFilterObjective] = useState('');
  const [filterTargetForm, setFilterTargetForm] = useState('');
  const [filterActualForm, setFilterActualForm] = useState('');
  const [editedMappings, setEditedMappings] = useState<Record<number, Partial<MappingFormData>>>({});
  const queryClient = useQueryClient();

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

  const getEffectiveActualSource = useCallback((row: MappingRow): 'manual' | 'pms_actual' | 'odoo_services_done' => {
    const edited = editedMappings[row.id];
    const current = edited ?? row.mapping;
    if (current?.actual_source === 'pms_actual' || current?.actual_source === 'odoo_services_done') return current.actual_source;
    return 'manual';
  }, [editedMappings]);

  // Filter by search + department, KPI, objective, target form, actual form
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const match =
          row.kpi?.toLowerCase().includes(term) ||
          row.activity?.toLowerCase().includes(term) ||
          row.department_name?.toLowerCase().includes(term) ||
          row.mapping?.pms_project_name?.toLowerCase().includes(term) ||
          row.mapping?.pms_metric_name?.toLowerCase().includes(term) ||
          row.mapping?.odoo_project_name?.toLowerCase().includes(term);
        if (!match) return false;
      }
      if (filterDepartment && row.department_name !== filterDepartment) return false;
      if (filterKpi && row.kpi !== filterKpi) return false;
      if (filterObjective && row.activity !== filterObjective) return false;
      if (filterTargetForm && getEffectiveTargetSource(row) !== filterTargetForm) return false;
      if (filterActualForm && getEffectiveActualSource(row) !== filterActualForm) return false;
      return true;
    });
  }, [rows, searchTerm, filterDepartment, filterKpi, filterObjective, filterTargetForm, filterActualForm, getEffectiveTargetSource, getEffectiveActualSource]);

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
        actual_source: (mapping.actual_source === 'pms_actual' || mapping.actual_source === 'odoo_services_done')
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
        if (value === 'odoo_services_done' && !updated.odoo_project_name) {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['objective-mappings'] });
      toast({
        title: 'Success',
        description: 'Mapping saved successfully',
      });
      // Clear edited state for saved mapping
      setEditedMappings(prev => {
        const newState = { ...prev };
        // Find which objective was saved (we'll need to track this)
        return newState;
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
    if (!['manual', 'pms_actual', 'odoo_services_done'].includes(actualSource)) {
      toast({
        title: 'Error',
        description: 'Actual From is required',
        variant: 'destructive',
      });
      return;
    }

    if (actualSource === 'odoo_services_done' && !edited.odoo_project_name) {
      toast({
        title: 'Error',
        description: 'Odoo Project is required when Actual From is "Odoo ServicesDone"',
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

    // Clear edited state after save
    setEditedMappings(prev => {
      const newState = { ...prev };
      delete newState[objectiveId];
      return newState;
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
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Objective Data Source Mapping</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search objectives..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 w-64"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={filterDepartment || 'all'} onValueChange={(v) => setFilterDepartment(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {filterOptions.departments.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterKpi || 'all'} onValueChange={(v) => setFilterKpi(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder="KPI" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All KPIs</SelectItem>
              {filterOptions.kpis.map(k => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterObjective || 'all'} onValueChange={(v) => setFilterObjective(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="Objective" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All objectives</SelectItem>
              {filterOptions.activities.map(a => (
                <SelectItem key={a} value={a}>{a.length > 40 ? a.slice(0, 40) + '…' : a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterTargetForm || 'all'} onValueChange={(v) => setFilterTargetForm(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue placeholder="Target From" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="pms_target">PMS</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterActualForm || 'all'} onValueChange={(v) => setFilterActualForm(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder="Actual From" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="pms_actual">PMS Actual</SelectItem>
              <SelectItem value="odoo_services_done">Odoo ServicesDone</SelectItem>
            </SelectContent>
          </Select>
          {(filterDepartment || filterKpi || filterObjective || filterTargetForm || filterActualForm) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setFilterDepartment('');
                setFilterKpi('');
                setFilterObjective('');
                setFilterTargetForm('');
                setFilterActualForm('');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>KPI</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Target From</TableHead>
                <TableHead>Actual From</TableHead>
                <TableHead>PMS Project</TableHead>
                <TableHead>PMS Metric</TableHead>
                <TableHead>Odoo Project</TableHead>
                <TableHead>Actions</TableHead>
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
                  const actualSource = edited?.actual_source ?? (current?.actual_source === 'pms_actual' || current?.actual_source === 'odoo_services_done' ? current?.actual_source : 'manual');
                  const pmsEnabled = targetSource === 'pms_target' || actualSource === 'pms_actual';
                  const odooEnabled = actualSource === 'odoo_services_done';
                  const pmsProject = edited?.pms_project_name || current?.pms_project_name || '';
                  const filteredMetrics = pmsProject ? (pmsMetricsByProject[pmsProject] ?? []) : pmsMetrics;

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.department_name || '-'}</TableCell>
                      <TableCell>{row.kpi || '-'}</TableCell>
                      <TableCell className="max-w-xs truncate">{row.activity || '-'}</TableCell>
                      <TableCell>
                        <Select
                          value={targetSource}
                          onValueChange={(value: 'pms_target' | 'manual') => updateMapping(row.id, 'target_source', value)}
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="pms_target">PMS</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={actualSource}
                          onValueChange={(value: 'manual' | 'pms_actual' | 'odoo_services_done') => updateMapping(row.id, 'actual_source', value)}
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="pms_actual">PMS Actual</SelectItem>
                            <SelectItem value="odoo_services_done">Odoo ServicesDone</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edited?.pms_project_name || current?.pms_project_name || ''}
                          onValueChange={(value) => updateMapping(row.id, 'pms_project_name', value)}
                          disabled={!pmsEnabled}
                        >
                          <SelectTrigger className="h-8 w-48">
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {pmsProjects.map(project => (
                              <SelectItem key={project} value={project}>{project}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edited?.pms_metric_name || current?.pms_metric_name || ''}
                          onValueChange={(value) => updateMapping(row.id, 'pms_metric_name', value)}
                          disabled={!pmsEnabled || (!edited?.pms_project_name && !current?.pms_project_name)}
                        >
                          <SelectTrigger className="h-8 w-48">
                            <SelectValue placeholder="Select metric" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredMetrics.map(metric => (
                              <SelectItem key={metric} value={metric}>{metric}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edited?.odoo_project_name || current?.odoo_project_name || ''}
                          onValueChange={(value) => updateMapping(row.id, 'odoo_project_name', value)}
                          disabled={!odooEnabled}
                        >
                          <SelectTrigger className="h-8 w-48">
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {odooProjects.map(project => (
                              <SelectItem key={project} value={project}>{project}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
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
          <p>• <strong>Odoo Project</strong> is editable and required only when Actual From = Odoo ServicesDone.</p>
          <p>• Click <strong>Save</strong> to save changes for each objective.</p>
        </div>
      </CardContent>
    </Card>
  );
}
