import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { fetchAuthSession, getCurrentUser, mergeSessionIntoStoredUser } from '@/services/authService';
import type { User } from '@/services/authService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardCheck, FileBarChart, GraduationCap, Wrench } from 'lucide-react';
import MealDataValidationTab from './MealDataValidationTab';
import MealContentFolderTab from './MealContentFolderTab';
import MealLearningPointsTab from './MealLearningPointsTab';

type TabValue = 'validation' | 'tools' | 'reports' | 'learning';

const TAB_VALUES = new Set<TabValue>(['validation', 'tools', 'reports', 'learning']);

function isTabValue(v: string | null): v is TabValue {
  return v != null && TAB_VALUES.has(v as TabValue);
}

export default function MealPageTemplate() {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab: TabValue = useMemo(() => {
    const t = searchParams.get('tab');
    if (t === 'cm-kpis') return 'validation';
    return isTabValue(t) ? t : 'validation';
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get('tab') === 'cm-kpis') {
      navigate('/cm-meal-kpis', { replace: true });
    }
  }, [searchParams, navigate]);

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

  const handleSignOut = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    navigate('/');
  };

  const onTabChange = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', v);
    next.delete('folder');
    setSearchParams(next, { replace: true });
  };

  if (!user) return null;

  const tabTriggerClass =
    'gap-1 rounded-md px-2 py-0.5 text-[11px] leading-snug font-medium sm:px-2.5 sm:py-1 sm:text-xs data-[state=inactive]:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm';

  const mealTabList = (
    <TabsList className="w-max max-w-[min(100%,72rem)] flex flex-wrap sm:flex-nowrap h-auto min-h-7 gap-0.5 rounded-lg border border-border/80 bg-muted/60 p-0.5 shadow-sm justify-start">
      <TabsTrigger value="validation" className={tabTriggerClass}>
        <ClipboardCheck className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        Data Validation
      </TabsTrigger>
      <TabsTrigger value="tools" className={tabTriggerClass}>
        <Wrench className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        M&E Tools
      </TabsTrigger>
      <TabsTrigger value="reports" className={tabTriggerClass}>
        <FileBarChart className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        Reports
      </TabsTrigger>
      <TabsTrigger value="learning" className={tabTriggerClass}>
        <GraduationCap className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        Learning
      </TabsTrigger>
    </TabsList>
  );

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="flex flex-col flex-1 min-h-0">
      <AppLayout
        user={user}
        headerTitle="MEAL"
        headerSubtitle="Monitoring, Evaluation, Accountability & Learning"
        headerToolbar={mealTabList}
        onSignOut={handleSignOut}
      >
        <TabsContent value="validation" className="mt-0 sm:mt-1 focus-visible:outline-none">
          <MealDataValidationTab />
        </TabsContent>

        <TabsContent value="tools" className="mt-4 focus-visible:outline-none">
          <MealContentFolderTab
            category="tools"
            title="M&E Tools"
            description="Templates, checklists, and tools for monitoring and evaluation. Create folders to organize content."
            user={user}
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-4 focus-visible:outline-none">
          <MealContentFolderTab
            category="reports"
            title="Reports"
            description="MEAL reports and related documents. Organize by project, period, or type using nested folders."
            user={user}
          />
        </TabsContent>

        <TabsContent value="learning" className="mt-4 focus-visible:outline-none">
          <MealLearningPointsTab user={user} />
        </TabsContent>
      </AppLayout>
    </Tabs>
  );
}
