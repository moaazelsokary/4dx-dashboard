import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  getMetrics,
  refreshMetrics,
  createDerivedMetric,
  updateDerivedMetric,
  deleteDerivedMetric,
  type MetricsData,
  type DerivedMetricDefinition,
  type DerivedMetricDefinitionItem,
  getDistinctProjectsAndMetrics,
} from '@/services/metricsService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { RefreshCw, Filter, Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import type { User } from '@/services/authService';

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export type UnifiedMetricRow = {
  source: 'pms' | 'odoo' | 'odoo & pms';
  project: string;
  metric: string | null;
  month: string;
  target: number | null;
  actual: number | null;
  servicesCreated: number | null;
  servicesDone: number | null;
};

function unifyMetrics(data: MetricsData): UnifiedMetricRow[] {
  const pmsRows: UnifiedMetricRow[] = (data.pms || []).map(m => ({
    source: 'pms' as const,
    project: m.ProjectName,
    metric: m.MetricName ?? null,
    month: m.MonthYear,
    target: m.Target ?? null,
    actual: m.Actual ?? null,
    servicesCreated: null,
    servicesDone: null,
  }));
  const odooRows: UnifiedMetricRow[] = (data.odoo || []).map(m => ({
    source: 'odoo' as const,
    project: m.Project,
    metric: null,
    month: m.Month,
    target: null,
    actual: null,
    servicesCreated: m.ServicesCreated ?? null,
    servicesDone: m.ServicesDone ?? null,
  }));
  const derivedRows: UnifiedMetricRow[] = (data.derived || []).map(d => ({
    source: d.source as 'odoo & pms' | 'odoo' | 'pms',
    project: d.project,
    metric: d.metric,
    month: d.month,
    target: d.target ?? null,
    actual: d.actual ?? null,
    servicesCreated: d.servicesCreated ?? null,
    servicesDone: d.servicesDone ?? null,
  }));
  return [...pmsRows, ...odooRows, ...derivedRows];
}

const PMSOdooMetrics = () => {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Filters: source (all | pms | odoo), project, month, search
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }

    const userObj = JSON.parse(userData);
    setUser(userObj as User);
    loadData();
  }, [navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const metricsData = await getMetrics(true);
      setData(metricsData);
    } catch (err: unknown) {
      console.error('Error loading metrics:', err);
      const msg = errMessage(err, 'Failed to load metrics');
      setError(msg);
      toast({
        title: 'Error',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      await refreshMetrics();
      await loadData();
      toast({
        title: 'Success',
        description: 'Refresh completed. Data updated.',
      });
    } catch (err: unknown) {
      console.error('Error refreshing metrics:', err);
      toast({
        title: 'Error',
        description: errMessage(err, 'Failed to refresh metrics'),
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const openAddModal = () => {
    setEditingDef(null);
    setFormProjectName('');
    setFormPmsSelected([]);
    setFormOdooSelected([]);
    setAddModalOpen(true);
  };

  const openEditModal = (def: DerivedMetricDefinition) => {
    setEditingDef(def);
    setFormProjectName(def.projectName);
    const pms = (def.definition || []).filter(d => d.source === 'pms');
    const odoo = (def.definition || []).filter(d => d.source === 'odoo');
    setFormPmsSelected(pms);
    setFormOdooSelected(odoo);
    setAddModalOpen(true);
  };

  const togglePms = (item: DerivedMetricDefinitionItem) => {
    const key = `${item.project}|${item.metric ?? ''}`;
    const exists = formPmsSelected.some(d => `${d.project}|${d.metric ?? ''}` === key);
    if (exists) {
      setFormPmsSelected(formPmsSelected.filter(d => `${d.project}|${d.metric ?? ''}` !== key));
    } else {
      setFormPmsSelected([...formPmsSelected, item]);
    }
  };

  const toggleOdoo = (project: string) => {
    const item = { source: 'odoo' as const, project };
    const exists = formOdooSelected.some(d => d.project === project);
    if (exists) {
      setFormOdooSelected(formOdooSelected.filter(d => d.project !== project));
    } else {
      setFormOdooSelected([...formOdooSelected, item]);
    }
  };

  const handleSaveDerived = async () => {
    const definition = [...formPmsSelected, ...formOdooSelected];
    if (!formProjectName.trim()) {
      toast({ title: 'Error', description: 'Project name is required', variant: 'destructive' });
      return;
    }
    if (definition.length < 2) {
      toast({ title: 'Error', description: 'Select at least 2 metrics to sum', variant: 'destructive' });
      return;
    }
    setFormSaving(true);
    try {
      if (editingDef) {
        await updateDerivedMetric(editingDef.id, formProjectName.trim(), definition);
        toast({ title: 'Success', description: 'Derived metric updated.' });
      } else {
        await createDerivedMetric(formProjectName.trim(), definition);
        toast({ title: 'Success', description: 'Derived metric created.' });
      }
      setAddModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      toast({ title: 'Error', description: errMessage(err, 'Failed to save'), variant: 'destructive' });
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteDerived = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDerivedMetric(deleteTarget.id);
      toast({ title: 'Success', description: 'Derived metric deleted.' });
      setDeleteTarget(null);
      await loadData();
    } catch (err: unknown) {
      toast({ title: 'Error', description: errMessage(err, 'Failed to delete'), variant: 'destructive' });
    }
  };

  const unified = data ? unifyMetrics(data) : [];
  const { pmsProjects, pmsMetrics, odooProjects, derivedProjects } = data
    ? getDistinctProjectsAndMetrics(data)
    : { pmsProjects: [], pmsMetrics: [], odooProjects: [], derivedProjects: [] };
  const allProjects = [...new Set([...pmsProjects, ...odooProjects, ...derivedProjects])].sort();
  const pmsMetricPairs = pmsProjects.flatMap(p =>
    (pmsMetrics || []).map(m => ({ source: 'pms' as const, project: p, metric: m }))
  );

  const isAdmin = user?.role === 'Admin' || user?.role === 'CEO';

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<DerivedMetricDefinition | null>(null);
  const [formProjectName, setFormProjectName] = useState('');
  const [formPmsSelected, setFormPmsSelected] = useState<DerivedMetricDefinitionItem[]>([]);
  const [formOdooSelected, setFormOdooSelected] = useState<DerivedMetricDefinitionItem[]>([]);
  const [formSaving, setFormSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DerivedMetricDefinition | null>(null);
  const allMonths = [...new Set(unified.map(r => r.month))].sort().reverse();

  const filteredRows = unified.filter(row => {
    if (selectedSource !== 'all' && row.source !== selectedSource) return false;
    if (selectedProject !== 'all' && row.project !== selectedProject) return false;
    if (selectedMonth !== 'all' && row.month !== selectedMonth) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchProject = row.project?.toLowerCase().includes(term);
      const matchMetric = row.metric?.toLowerCase().includes(term);
      if (!matchProject && !matchMetric) return false;
    }
    return true;
  });

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      user={user}
      headerTitle="PMS & Odoo Metrics"
      headerSubtitle="PMS & Odoo Metrics"
      onSignOut={() => { localStorage.removeItem('user'); navigate('/'); }}
      onRefresh={handleRefresh}
      status={refreshing ? 'loading' : null}
      badge={data?.lastUpdated ? (
        <span className="text-xs text-muted-foreground">
          Last updated: {format(new Date(data.lastUpdated), 'MMM dd, yyyy HH:mm')}
        </span>
      ) : undefined}
    >
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Search</label>
                <Input
                  placeholder="Search projects or metrics..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Source</label>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pms">PMS</SelectItem>
                    <SelectItem value="odoo">Odoo</SelectItem>
                    <SelectItem value="odoo & pms">Odoo & PMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Project</label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {allProjects.map(project => (
                      <SelectItem key={project} value={project}>{project}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Month</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All months" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {allMonths.map(month => (
                      <SelectItem key={month} value={month}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading metrics...</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button onClick={loadData} className="mt-4" variant="outline">
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {isAdmin && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Derived Metrics</span>
                    <Button size="sm" onClick={openAddModal}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Metric
                    </Button>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Sum 2+ existing metrics (PMS or Odoo). Source is derived automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(!data?.derivedDefinitions || data.derivedDefinitions.length === 0) ? (
                    <p className="text-sm text-muted-foreground">No derived metrics yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.derivedDefinitions.map(def => (
                        <div
                          key={def.id}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <Badge variant={def.source === 'odoo & pms' ? 'outline' : def.source === 'pms' ? 'default' : 'secondary'}>
                            {def.source.toUpperCase()}
                          </Badge>
                          <span className="font-medium">{def.projectName}</span>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditModal(def)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(def)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Metrics</span>
                <Badge variant="secondary">{filteredRows.length} rows</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Metric</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Services Created</TableHead>
                      <TableHead className="text-right">Services Done</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No data found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((row, index) => (
                        <TableRow key={`${row.source}-${index}-${row.project}-${row.month}`}>
                          <TableCell>
                            <Badge
                              variant={
                                row.source === 'pms' ? 'default' : row.source === 'odoo & pms' ? 'outline' : 'secondary'
                              }
                            >
                              {row.source.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{row.project}</TableCell>
                          <TableCell>{row.metric ?? '-'}</TableCell>
                          <TableCell>{row.month}</TableCell>
                          <TableCell className="text-right">
                            {row.target != null ? row.target.toLocaleString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.actual != null ? row.actual.toLocaleString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.servicesCreated != null ? row.servicesCreated.toLocaleString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.servicesDone != null ? row.servicesDone.toLocaleString() : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          </>
        )}

        <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingDef ? 'Edit' : 'Add'} Derived Metric</DialogTitle>
              <DialogDescription>
                Select 2+ metrics to sum. Project name is entered manually. Source is derived automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Project name</label>
                <Input
                  placeholder="e.g. Combined Services"
                  value={formProjectName}
                  onChange={e => setFormProjectName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">PMS metrics (Project + Metric)</label>
                <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
                  {pmsMetricPairs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No PMS data available.</p>
                  ) : (
                    pmsMetricPairs.map((item, i) => {
                      const key = `${item.project}|${item.metric ?? ''}`;
                      const checked = formPmsSelected.some(d => `${d.project}|${d.metric ?? ''}` === key);
                      return (
                        <label key={i} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox checked={checked} onCheckedChange={() => togglePms(item)} />
                          <span>
                            {item.project} / {item.metric}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Odoo projects</label>
                <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
                  {odooProjects.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No Odoo data available.</p>
                  ) : (
                    odooProjects.map(proj => (
                      <label key={proj} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={formOdooSelected.some(d => d.project === proj)}
                          onCheckedChange={() => toggleOdoo(proj)}
                        />
                        <span>{proj}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Selected: {formPmsSelected.length + formOdooSelected.length} (min 2 required)
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveDerived} disabled={formSaving}>
                {formSaving ? 'Saving...' : editingDef ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete derived metric?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget && `This will remove "${deleteTarget.projectName}". This action cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteDerived} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </AppLayout>
  );
};

export default PMSOdooMetrics;
