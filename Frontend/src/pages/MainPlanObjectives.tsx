import { useEffect, useState, startTransition, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { getHierarchicalPlan, getMainObjectives } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import HierarchicalPlanView from '@/components/wig/HierarchicalPlanView';
import MainPlanTable from '@/components/wig/MainPlanTable';
import RASCIEditor from '@/components/wig/RASCIEditor';
import WBSMindMapView from '@/components/wig/WBSMindMapView';
import type { HierarchicalPlan, MainPlanObjective } from '@/types/wig';
import { LogOut, RefreshCw, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import ExportButton from '@/components/shared/ExportButton';
import { AppLayout } from '@/components/layout/AppLayout';
import type { User } from '@/services/authService';

export default function MainPlanObjectives() {
  const [user, setUser] = useState<User | null>(null);
  const [hierarchicalData, setHierarchicalData] = useState<HierarchicalPlan | null>(null);
  const [tableData, setTableData] = useState<MainPlanObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || '';
  const activeTab = useMemo(() => {
    if (['view', 'wbs', 'rasci', 'table'].includes(tabParam)) return tabParam;
    return 'view';
  }, [tabParam]);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }

    const userObj = JSON.parse(userData);
    // Allow CEO and department users to access, but department users are read-only
    if (userObj.role !== 'CEO' && userObj.role !== 'department') {
      navigate('/access-denied');
      return;
    }

    setUser(userObj as User);
    loadData();
  }, [navigate]);

  const loadData = async (showLoading = true) => {
    // Set loading state immediately for better UX
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [hierarchical, table] = await Promise.all([
        getHierarchicalPlan(),
        getMainObjectives(),
      ]);
      // Use startTransition for non-urgent state updates to prevent blocking
      startTransition(() => {
        setHierarchicalData(hierarchical);
        setTableData(table);
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load plan data',
        variant: 'destructive',
      });
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  // Skeleton loader component
  const MainPlanObjectivesSkeleton = () => (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-6 w-64" />
              </div>
              <div className="space-y-3 pl-11">
                {[...Array(2)].map((_, j) => (
                  <div key={j} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-6 w-12 rounded" />
                      <Skeleton className="h-5 w-96" />
                    </div>
                    <div className="space-y-2 pl-4">
                      {[...Array(2)].map((_, k) => (
                        <div key={k} className="flex items-center gap-3">
                          <Skeleton className="h-5 w-16 rounded" />
                          <Skeleton className="h-4 w-80" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <AppLayout
        user={user}
        headerTitle="Main Plan Objectives"
        headerSubtitle={user?.role === 'CEO' ? 'CEO Dashboard' : 'View Only'}
        onSignOut={handleSignOut}
      >
        <MainPlanObjectivesSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      user={user}
      headerTitle="Main Plan Objectives"
      headerSubtitle={user?.role === 'CEO' ? 'CEO Dashboard' : 'View Only'}
      onSignOut={handleSignOut}
      onRefresh={loadData}
      exportSlot={
        activeTab === 'table' && tableData.length > 0 ? (
          <ExportButton
            asIcon
            data={tableData.map(obj => ({
              'Pillar': obj.pillar || '',
              'Objective': obj.objective || '',
              'Target Number': obj.targetNum || '',
              'Target': obj.target || '',
              'KPI Number': obj.kpiNum || '',
              'KPI': obj.kpi || '',
              'Annual Target': obj.annual_target || 0,
            }))}
            filename={`main-plan-objectives-${new Date().toISOString().split('T')[0]}`}
            title="Main Plan Objectives"
          />
        ) : null
      }
    >
        {/* Content */}
        <Tabs value={activeTab} className="w-full">
          <TabsContent value="view" className="mt-0">
            {hierarchicalData && hierarchicalData.pillars.length > 0 ? (
              <HierarchicalPlanView data={hierarchicalData} />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground py-8">
                    No plan data available. Add objectives in Table View.
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="wbs" className="mt-0">
            {hierarchicalData && hierarchicalData.pillars.length > 0 ? (
              <WBSMindMapView data={hierarchicalData} />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground py-8">
                    No plan data available. Add objectives in Table View.
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="rasci" className="mt-0">
            <RASCIEditor readOnly={user?.role === 'department'} />
          </TabsContent>

          <TabsContent value="table" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Main Plan Objectives</CardTitle>
              </CardHeader>
              <CardContent>
                <MainPlanTable 
                  objectives={tableData} 
                  onUpdate={() => loadData(false)} 
                  readOnly={user?.role === 'department'}
                />
              </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

