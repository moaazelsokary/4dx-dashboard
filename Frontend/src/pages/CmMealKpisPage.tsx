import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { fetchAuthSession, getCurrentUser, mergeSessionIntoStoredUser } from '@/services/authService';
import type { User } from '@/services/authService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CmMealKpisTab from '@/pages/meal/CmMealKpisTab';
import CmMealUserKpisSection from '@/pages/meal/CmMealUserKpisSection';
import { canAccessCmMealKpis } from '@/config/cmMealAccess';
import { canAccessCmMealUserKpis } from '@/config/cmMealUserKpiAccess';

type MainTab = 'project' | 'users';

function isMainTab(v: string | null): v is MainTab {
  return v === 'project' || v === 'users';
}

export default function CmMealKpisPage() {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const showProject = useMemo(() => (user ? canAccessCmMealKpis(user) : false), [user]);
  const showUsers = useMemo(() => (user ? canAccessCmMealUserKpis(user) : false), [user]);

  const defaultTab: MainTab = showProject ? 'project' : 'users';
  const tabParam = searchParams.get('tab');
  const activeTab: MainTab = isMainTab(tabParam)
    ? tabParam === 'project' && !showProject
      ? 'users'
      : tabParam === 'users' && !showUsers
        ? 'project'
        : tabParam
    : defaultTab;

  const headerSubtitle =
    activeTab === 'users' ? 'Employee KPIs' : 'Project KPIs by month';

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
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    if (!showProject && !showUsers) {
      navigate('/access-denied');
      return;
    }
    if (!isMainTab(tabParam)) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', defaultTab);
      setSearchParams(next, { replace: true });
    }
  }, [user, showProject, showUsers, tabParam, defaultTab, searchParams, setSearchParams, navigate]);

  const handleSignOut = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    navigate('/');
  };

  const setMainTab = (tab: MainTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    if (tab === 'users' && !next.get('view')) next.set('view', 'roles');
    if (tab === 'project') next.delete('view');
    setSearchParams(next, { replace: true });
  };

  if (!user) return null;

  const showBothTabs = showProject && showUsers;

  return (
    <AppLayout
      user={user}
      headerTitle="CM & MEAL KPIs"
      headerSubtitle={headerSubtitle}
      onSignOut={handleSignOut}
    >
      {showBothTabs ? (
        <Tabs value={activeTab} onValueChange={(v) => setMainTab(v as MainTab)} className="space-y-4">
          <TabsList>
            <TabsTrigger value="project">Project KPIs</TabsTrigger>
            <TabsTrigger value="users">Users KPIs</TabsTrigger>
          </TabsList>
          <TabsContent value="project" className="mt-0">
            <CmMealKpisTab />
          </TabsContent>
          <TabsContent value="users" className="mt-0">
            <CmMealUserKpisSection />
          </TabsContent>
        </Tabs>
      ) : showProject ? (
        <CmMealKpisTab />
      ) : (
        <CmMealUserKpisSection />
      )}
    </AppLayout>
  );
}
