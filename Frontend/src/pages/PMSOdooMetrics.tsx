import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import NavigationBar from '@/components/shared/NavigationBar';
import { getMetrics, refreshMetrics, type MetricsData, getDistinctProjectsAndMetrics } from '@/services/metricsService';
import { RefreshCw, Calendar, Filter, Download } from 'lucide-react';
import { format } from 'date-fns';

const PMSOdooMetrics = () => {
  const [user, setUser] = useState<any>(null);
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Filters
  const [selectedPmsProject, setSelectedPmsProject] = useState<string>('all');
  const [selectedOdooProject, setSelectedOdooProject] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }

    const userObj = JSON.parse(userData);
    setUser(userObj);
    loadData();
  }, [navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const metricsData = await getMetrics();
      setData(metricsData);
    } catch (err: any) {
      console.error('Error loading metrics:', err);
      setError(err.message || 'Failed to load metrics');
      toast({
        title: 'Error',
        description: err.message || 'Failed to load metrics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshMetrics();
      toast({
        title: 'Success',
        description: 'Refresh started. Data will update shortly.',
      });
      // Wait a bit then reload data
      setTimeout(() => {
        loadData();
      }, 2000);
    } catch (err: any) {
      console.error('Error refreshing metrics:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to refresh metrics',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Get distinct values for filters
  const { pmsProjects, odooProjects } = data ? getDistinctProjectsAndMetrics(data) : { pmsProjects: [], pmsMetrics: [], odooProjects: [] };
  const allMonths = data ? [...new Set([...data.pms.map(m => m.MonthYear), ...data.odoo.map(m => m.Month)])].sort().reverse() : [];

  // Filter data
  const filteredPms = data?.pms.filter(row => {
    if (selectedPmsProject !== 'all' && row.ProjectName !== selectedPmsProject) return false;
    if (selectedMonth !== 'all' && row.MonthYear !== selectedMonth) return false;
    if (searchTerm && !row.ProjectName.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !row.MetricName?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  }) || [];

  const filteredOdoo = data?.odoo.filter(row => {
    if (selectedOdooProject !== 'all' && row.Project !== selectedOdooProject) return false;
    if (selectedMonth !== 'all' && row.Month !== selectedMonth) return false;
    if (searchTerm && !row.Project.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  }) || [];

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(-1)}
                  className="h-7 px-2 text-xs"
                >
                  Back
                </Button>
                <div>
                  <h1 className="text-sm font-bold text-foreground">PMS & Odoo Metrics</h1>
                  <p className="text-xs text-muted-foreground">
                    Combined metrics from PMS and Odoo systems
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {data?.lastUpdated && (
                  <span className="text-xs text-muted-foreground">
                    Last updated: {format(new Date(data.lastUpdated), 'MMM dd, yyyy HH:mm')}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
            <NavigationBar user={user} activeTab="" onTabChange={() => {}} />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Filters */}
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
                <label className="text-xs text-muted-foreground mb-1 block">PMS Project</label>
                <Select value={selectedPmsProject} onValueChange={setSelectedPmsProject}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {pmsProjects.map(project => (
                      <SelectItem key={project} value={project}>{project}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Odoo Project</label>
                <Select value={selectedOdooProject} onValueChange={setSelectedOdooProject}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {odooProjects.map(project => (
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
          <div className="space-y-6">
            {/* PMS Metrics Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>PMS Metrics</span>
                  <Badge variant="secondary">{filteredPms.length} rows</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Metric</TableHead>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPms.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No PMS data found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPms.map((row, index) => (
                          <TableRow key={`pms-${index}`}>
                            <TableCell className="font-medium">{row.ProjectName}</TableCell>
                            <TableCell>{row.MetricName || '-'}</TableCell>
                            <TableCell>{row.MonthYear}</TableCell>
                            <TableCell className="text-right">{row.Target?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-right">{row.Actual?.toLocaleString() || '-'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Odoo Metrics Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Odoo Metrics</span>
                  <Badge variant="secondary">{filteredOdoo.length} rows</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Services Created</TableHead>
                        <TableHead className="text-right">Services Done</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOdoo.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No Odoo data found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredOdoo.map((row, index) => (
                          <TableRow key={`odoo-${index}`}>
                            <TableCell className="font-medium">{row.Project}</TableCell>
                            <TableCell>{row.Month}</TableCell>
                            <TableCell className="text-right">{row.ServicesCreated?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-right">{row.ServicesDone?.toLocaleString() || '-'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default PMSOdooMetrics;
