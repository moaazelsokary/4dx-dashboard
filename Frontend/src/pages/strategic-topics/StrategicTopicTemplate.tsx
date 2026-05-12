import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { fetchAuthSession, getCurrentUser, mergeSessionIntoStoredUser } from '@/services/authService';
import type { User } from '@/services/authService';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Department, MainPlanObjective, StrategicTopicCode, StrategicTopicKpiRow } from '@/types/wig';
import { getDepartments, getMainObjectives, getStrategicTopicKpiRows } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import { LayoutDashboard, Table2, SquareChartGantt, FolderOpen } from 'lucide-react';
import StrategicTopicDashboard from './StrategicTopicDashboard';
import StrategicTopicKpiTable from './StrategicTopicKpiTable';
import StrategicTopicGantt from './StrategicTopicGantt';
import StrategicTopicContentFolder from './StrategicTopicContentFolder';
import { STRATEGIC_TOPIC_LABELS, parsePipeList } from './strategicTopicKpiUtils';

type StrategicTopicTemplateProps = {
  title: string;
  strategicTopicCode: StrategicTopicCode;
};

const TAB_VALUES = ['dashboard', 'table', 'gantt', 'content'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return v === 'dashboard' || v === 'table' || v === 'gantt' || v === 'content';
}

export default function StrategicTopicTemplate({ title, strategicTopicCode }: StrategicTopicTemplateProps) {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab: TabValue = useMemo(() => {
    const t = searchParams.get('tab');
    return isTabValue(t) ? t : 'table';
  }, [searchParams]);

  const [rows, setRows] = useState<StrategicTopicKpiRow[]>([]);
  const [mainPlanObjectives, setMainPlanObjectives] = useState<MainPlanObjective[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  /** Dashboard + Gantt only; Table KPI always shows all rows. Default: all departments. */
  const [departmentScope, setDepartmentScope] = useState<'all' | string>('all');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stRes, moRes, depRes] = await Promise.allSettled([
        getStrategicTopicKpiRows(strategicTopicCode),
        getMainObjectives(),
        getDepartments(),
      ]);
      const parts: string[] = [];
      if (stRes.status === 'fulfilled') {
        const r = stRes.value;
        setRows(Array.isArray(r) ? r : []);
        if (!Array.isArray(r)) parts.push('Strategic topic KPI rows: unexpected response');
      } else {
        setRows([]);
        parts.push(
          `Strategic topic KPI rows: ${stRes.reason instanceof Error ? stRes.reason.message : String(stRes.reason)}`
        );
      }
      if (moRes.status === 'fulfilled') {
        setMainPlanObjectives(moRes.value);
      } else {
        setMainPlanObjectives([]);
        parts.push(
          `Main plan objectives: ${moRes.reason instanceof Error ? moRes.reason.message : String(moRes.reason)}`
        );
      }
      if (depRes.status === 'fulfilled') {
        setDepartments(depRes.value);
      } else {
        setDepartments([]);
        parts.push(`Departments: ${depRes.reason instanceof Error ? depRes.reason.message : String(depRes.reason)}`);
      }
      if (parts.length > 0) {
        toast({
          title: 'Failed to load some data',
          description: parts.join(' · '),
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({
        title: 'Failed to load data',
        description: e instanceof Error ? e.message : 'Check network and database migration.',
        variant: 'destructive',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [strategicTopicCode]);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate('/');
      return;
    }
    setUser(u);
    let cancelled = false;
    void (async () => {
      try {
        const session = await fetchAuthSession();
        if (cancelled || !session) return;
        const next = mergeSessionIntoStoredUser(session);
        if (!cancelled && next) setUser(next);
      } catch {
        /* ignore — offline or session endpoint unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    void loadAll();
  }, [user, loadAll]);

  const handleSignOut = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    navigate('/');
  };

  const onTabChange = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', v);
    setSearchParams(next, { replace: true });
  };

  const departmentNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) {
      m.set(String(d.code).toLowerCase(), d.name);
    }
    return m;
  }, [departments]);

  const vizRows = useMemo(() => {
    if (departmentScope === 'all') return rows;
    const code = departmentScope.toLowerCase();
    return rows.filter((r) =>
      parsePipeList(r.associated_departments).some((c) => String(c).toLowerCase() === code)
    );
  }, [rows, departmentScope]);

  if (!user) return null;

  const topicLabel = STRATEGIC_TOPIC_LABELS[strategicTopicCode];

  const pageSkeleton = (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full max-w-md" />
      <Card>
        <CardHeader className="space-y-0.5 p-3 pb-2 sm:p-4">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-4 pb-2 border-b">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="grid grid-cols-6 gap-4 py-3 border-b">
                {[...Array(6)].map((_, j) => (
                  <Skeleton key={j} className="h-5 w-full" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const topicTabList = (
    <TabsList className="w-max max-w-[min(100%,72rem)] flex flex-wrap sm:flex-nowrap h-auto min-h-10 gap-1 rounded-xl border border-border/80 bg-muted/60 p-1 shadow-sm justify-center">
      <TabsTrigger
        value="table"
        className="gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm data-[state=inactive]:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
      >
        <Table2 className="h-4 w-4 shrink-0" />
        Table KPI
      </TabsTrigger>
      <TabsTrigger
        value="dashboard"
        className="gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm data-[state=inactive]:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
      >
        <LayoutDashboard className="h-4 w-4 shrink-0" />
        Dashboard
      </TabsTrigger>
      <TabsTrigger
        value="gantt"
        className="gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm data-[state=inactive]:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
      >
        <SquareChartGantt className="h-4 w-4 shrink-0" />
        Gantt
      </TabsTrigger>
      <TabsTrigger
        value="content"
        className="gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm data-[state=inactive]:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
      >
        <FolderOpen className="h-4 w-4 shrink-0" />
        Content folder
      </TabsTrigger>
    </TabsList>
  );

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="flex flex-col flex-1 min-h-0">
      <AppLayout
        user={user}
        headerTitle={title}
        headerSubtitle={`${topicLabel} Dashboard`}
        headerToolbar={topicTabList}
        onSignOut={handleSignOut}
        onRefresh={() => void loadAll()}
      >
        <TabsContent value="table" className="mt-0 sm:mt-1 focus-visible:outline-none">
          {loading ? (
            pageSkeleton
          ) : (
            <StrategicTopicKpiTable
              rows={rows}
              mergeRows={setRows}
              strategicTopicCode={strategicTopicCode}
              mainPlanObjectives={mainPlanObjectives}
              departments={departments}
              user={user}
              onRefresh={() => void loadAll()}
            />
          )}
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4 sm:mt-4 focus-visible:outline-none">
          {loading ? pageSkeleton : (
            <StrategicTopicDashboard
              rows={vizRows}
              topicTitle={topicLabel}
              departments={departments}
              departmentScope={departmentScope}
              onDepartmentScopeChange={setDepartmentScope}
            />
          )}
        </TabsContent>

        <TabsContent value="gantt" className="mt-4 focus-visible:outline-none">
          {loading ? pageSkeleton : (
            <StrategicTopicGantt
              rows={vizRows}
              strategicTopicCode={strategicTopicCode}
              departmentNameByCode={departmentNameByCode}
              departments={departments}
              departmentScope={departmentScope}
              onDepartmentScopeChange={setDepartmentScope}
            />
          )}
        </TabsContent>

        <TabsContent value="content" className="mt-4 focus-visible:outline-none">
          <StrategicTopicContentFolder strategicTopicCode={strategicTopicCode} user={user} />
        </TabsContent>
      </AppLayout>
    </Tabs>
  );
}
