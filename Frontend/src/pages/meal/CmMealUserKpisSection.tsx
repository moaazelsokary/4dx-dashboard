import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import { Loader2 } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { toast } from '@/hooks/use-toast';

import { getCurrentUser } from '@/services/authService';

import { getCmMealUserKpiRows, getCmMealUserKpiTeam, getCmMealUserRoleRows } from '@/services/wigService';

import type { CmMealUserKpiRow, CmMealUserKpiTeamMember, CmMealUserRoleRow } from '@/types/wig';

import { showEmployeeScopeFilter, userIdFromUser, isCmMealManagerRole } from '@/config/cmMealUserKpiAccess';

import CmMealUserKpisTab from './CmMealUserKpisTab';

import CmMealUserKpisGantt from './CmMealUserKpisGantt';

import CmMealUserRolesTab from './CmMealUserRolesTab';



type ViewTab = 'kpis' | 'gantt' | 'roles';



function normalizeView(v: string | null): ViewTab {

  if (v === 'gantt') return 'gantt';

  if (v === 'roles') return 'roles';

  if (v === 'table') return 'kpis';

  if (v === 'kpis') return 'kpis';

  return 'roles';

}



export default function CmMealUserKpisSection() {

  const user = useMemo(() => getCurrentUser(), []);

  const [searchParams, setSearchParams] = useSearchParams();

  const activeView = normalizeView(searchParams.get('view'));



  const [rows, setRows] = useState<CmMealUserKpiRow[]>([]);

  const [roleRows, setRoleRows] = useState<CmMealUserRoleRow[]>([]);

  const [employees, setEmployees] = useState<CmMealUserKpiTeamMember[]>([]);

  const [loading, setLoading] = useState(true);

  const [employeeScope, setEmployeeScope] = useState<'all' | number>('all');



  const loadAll = useCallback(async () => {

    setLoading(true);

    try {

      const filterUserId = employeeScope === 'all' ? undefined : employeeScope;

      const [rowData, roleData, team] = await Promise.all([

        getCmMealUserKpiRows(filterUserId),

        getCmMealUserRoleRows(filterUserId),

        getCmMealUserKpiTeam(),

      ]);

      setRows(rowData);

      setRoleRows(roleData);

      setEmployees(team);

    } catch (e) {

      toast({

        title: 'Could not load employee KPIs',

        description: e instanceof Error ? e.message : 'Request failed',

        variant: 'destructive',

      });

    } finally {

      setLoading(false);

    }

  }, [employeeScope]);



  useEffect(() => {

    void loadAll();

  }, [loadAll]);



  useEffect(() => {

    if (isCmMealManagerRole(user?.role) || (showEmployeeScopeFilter(user) && !isCmMealManagerRole(user?.role))) {

      setEmployeeScope('all');

      return;

    }

    if (!showEmployeeScopeFilter(user)) {

      const selfId = userIdFromUser(user);

      if (selfId) setEmployeeScope(selfId);

    }

  }, [user]);



  const setView = (view: ViewTab) => {

    const next = new URLSearchParams(searchParams);

    next.set('tab', 'users');

    next.set('view', view);

    setSearchParams(next, { replace: true });

  };



  return (

    <Tabs value={activeView} onValueChange={(v) => setView(v as ViewTab)} className="space-y-4">

      <TabsList>
        <TabsTrigger value="roles">Roles & Responsibilities</TabsTrigger>
        <TabsTrigger value="kpis">KPIs</TabsTrigger>
        <TabsTrigger value="gantt">Gantt</TabsTrigger>
      </TabsList>
      <TabsContent value="roles" className="mt-0">
        <CmMealUserRolesTab
          rows={roleRows}
          loading={loading}
          onReload={loadAll}
          employees={employees}
          employeeScope={employeeScope}
          onEmployeeScopeChange={setEmployeeScope}
          onRowsChange={setRoleRows}
        />
      </TabsContent>
      <TabsContent value="kpis" className="mt-0">

        <CmMealUserKpisTab

          rows={rows}

          loading={loading}

          onReload={loadAll}

          employees={employees}

          roleRows={roleRows}

          employeeScope={employeeScope}

          onEmployeeScopeChange={setEmployeeScope}

          onRowsChange={setRows}

        />

      </TabsContent>

      <TabsContent value="gantt" className="mt-0">

        {loading ? (

          <div className="flex items-center justify-center py-16 text-muted-foreground">

            <Loader2 className="h-6 w-6 animate-spin mr-2" />

            Loading…

          </div>

        ) : (

          <CmMealUserKpisGantt

            rows={rows}

            employees={employees}

            employeeScope={employeeScope}

            onEmployeeScopeChange={setEmployeeScope}

          />

        )}

      </TabsContent>
    </Tabs>

  );

}

