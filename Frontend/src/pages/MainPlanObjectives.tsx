import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getHierarchicalPlan, getMainObjectives } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import HierarchicalPlanView from '@/components/wig/HierarchicalPlanView';
import MainPlanTable from '@/components/wig/MainPlanTable';
import RASCIEditor from '@/components/wig/RASCIEditor';
import type { HierarchicalPlan, MainPlanObjective } from '@/types/wig';
import { LogOut, RefreshCw, Loader2 } from 'lucide-react';
import NavigationBar from '@/components/shared/NavigationBar';
import ExportButton from '@/components/shared/ExportButton';

export default function MainPlanObjectives() {
  const [user, setUser] = useState<any>(null);
  const [hierarchicalData, setHierarchicalData] = useState<HierarchicalPlan | null>(null);
  const [tableData, setTableData] = useState<MainPlanObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('view');
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

    setUser(userObj);
    loadData();
  }, [navigate]);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const [hierarchical, table] = await Promise.all([
        getHierarchicalPlan(),
        getMainObjectives(),
      ]);
      setHierarchicalData(hierarchical);
      setTableData(table);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5">
      {/* Header with Navigation */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-2">
          <div className="flex flex-col gap-2">
            {/* Top Row: Logo, Title, Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center p-1">
                  <img 
                    src="/lovable-uploads/5e72745e-18ec-46d6-8375-e9912bdb8bdd.png" 
                    alt="Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-foreground">
                    Main Plan Objectives
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {user?.role === 'CEO' ? 'CEO Dashboard' : 'View Only'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {activeTab === 'table' && tableData.length > 0 && (
                  <ExportButton
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
                )}
                <Button variant="outline" size="sm" onClick={loadData} className="h-7 px-2 text-xs">
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleSignOut} className="h-7 px-2 text-xs">
                  <LogOut className="w-3 h-3 mr-1" />
                  Sign Out
                </Button>
              </div>
            </div>

            {/* Navigation Row: All navigation items in one row */}
            <NavigationBar 
              user={user} 
              activeTab={activeTab} 
              onTabChange={setActiveTab}
              showWIGTabs={true}
            />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 space-y-4">
        {/* Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 mb-4">
            <TabsTrigger value="view">View</TabsTrigger>
            <TabsTrigger value="rasci">RASCI</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>

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
      </div>
    </div>
  );
}

