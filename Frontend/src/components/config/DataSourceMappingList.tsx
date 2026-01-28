import { useState, useEffect } from 'react';
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
import { getMetrics, getDistinctProjectsAndMetrics, type MetricsData } from '@/services/metricsService';
import { Save, Search, Loader2 } from 'lucide-react';
import type { DepartmentObjective } from '@/types/wig';

interface MappingRow extends DepartmentObjective {
  mapping?: ObjectiveDataSourceMapping;
  editedMapping?: Partial<MappingFormData>;
}

export default function DataSourceMappingList() {
  const [searchTerm, setSearchTerm] = useState('');
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

  // Create mapping index
  const mappingIndex: Record<number, ObjectiveDataSourceMapping> = {};
  mappings.forEach(m => {
    mappingIndex[m.department_objective_id] = m;
  });

  // Combine objectives with mappings
  const rows: MappingRow[] = objectives.map(obj => ({
    ...obj,
    mapping: mappingIndex[obj.id],
    editedMapping: editedMappings[obj.id]
  }));

  // Filter by search term
  const filteredRows = rows.filter(row => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      row.kpi?.toLowerCase().includes(term) ||
      row.activity?.toLowerCase().includes(term) ||
      row.department_name?.toLowerCase().includes(term) ||
      row.mapping?.pms_project_name?.toLowerCase().includes(term) ||
      row.mapping?.pms_metric_name?.toLowerCase().includes(term) ||
      row.mapping?.odoo_project_name?.toLowerCase().includes(term)
    );
  });

  // Get distinct values for dropdowns
  const { pmsProjects, pmsMetrics, odooProjects } = metricsData 
    ? getDistinctProjectsAndMetrics(metricsData) 
    : { pmsProjects: [], pmsMetrics: [], odooProjects: [] };

  // Filter PMS metrics by selected project
  const getFilteredPmsMetrics = (selectedProject: string | undefined) => {
    if (!selectedProject || selectedProject === '') return pmsMetrics;
    if (!metricsData) return [];
    return [...new Set(
      metricsData.pms
        .filter(m => m.ProjectName === selectedProject)
        .map(m => m.MetricName)
        .filter(Boolean)
    )].sort();
  };

  const updateMapping = (objectiveId: number, field: keyof MappingFormData, value: any) => {
    setEditedMappings(prev => {
      const current = prev[objectiveId] || {};
      const mapping = mappingIndex[objectiveId];
      
      // Initialize from existing mapping if available
      const base: Partial<MappingFormData> = mapping ? {
        pms_project_name: mapping.pms_project_name || '',
        pms_metric_name: mapping.pms_metric_name || '',
        actual_source: mapping.actual_source,
        odoo_project_name: mapping.odoo_project_name || '',
      } : {
        pms_project_name: '',
        pms_metric_name: '',
        actual_source: 'pms_actual' as const,
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
  };

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

    // Validate required fields
    if (!edited.pms_project_name || !edited.pms_metric_name) {
      toast({
        title: 'Error',
        description: 'PMS Project and Metric are required',
        variant: 'destructive',
      });
      return;
    }

    if (!edited.actual_source) {
      toast({
        title: 'Error',
        description: 'Actual source is required',
        variant: 'destructive',
      });
      return;
    }

    if (edited.actual_source === 'odoo_services_done' && !edited.odoo_project_name) {
      toast({
        title: 'Error',
        description: 'Odoo Project is required when Actual source is "Odoo ServicesDone"',
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
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>KPI</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>PMS Project</TableHead>
                <TableHead>PMS Metric</TableHead>
                <TableHead>Actual From</TableHead>
                <TableHead>Odoo Project</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No objectives found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => {
                  const edited = editedMappings[row.id];
                  const current = edited || row.mapping;
                  const hasChanges = edited !== undefined;
                  const filteredMetrics = getFilteredPmsMetrics(edited?.pms_project_name || current?.pms_project_name || undefined);

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.department_name || '-'}</TableCell>
                      <TableCell>{row.kpi || '-'}</TableCell>
                      <TableCell className="max-w-xs truncate">{row.activity || '-'}</TableCell>
                      <TableCell>
                        <Select
                          value={edited?.pms_project_name || current?.pms_project_name || ''}
                          onValueChange={(value) => updateMapping(row.id, 'pms_project_name', value)}
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
                          disabled={!edited?.pms_project_name && !current?.pms_project_name}
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
                          value={edited?.actual_source || current?.actual_source || 'pms_actual'}
                          onValueChange={(value: 'pms_actual' | 'odoo_services_done') => updateMapping(row.id, 'actual_source', value)}
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pms_actual">PMS Actual</SelectItem>
                            <SelectItem value="odoo_services_done">Odoo ServicesDone</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edited?.odoo_project_name || current?.odoo_project_name || ''}
                          onValueChange={(value) => updateMapping(row.id, 'odoo_project_name', value)}
                          disabled={(edited?.actual_source || current?.actual_source || 'pms_actual') !== 'odoo_services_done'}
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
          <p>• <strong>PMS Project & Metric:</strong> Used for Target (PMS Target) and optionally for Actual (if Actual From = PMS Actual)</p>
          <p>• <strong>Actual From:</strong> Choose whether Actual comes from PMS Actual or Odoo ServicesDone</p>
          <p>• <strong>Odoo Project:</strong> Required only when Actual From = Odoo ServicesDone</p>
          <p>• Click <strong>Save</strong> to save changes for each objective</p>
        </div>
      </CardContent>
    </Card>
  );
}
