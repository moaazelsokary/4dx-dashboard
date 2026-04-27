import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import LockRuleList from '@/components/config/LockRuleList';
import LogViewer from '@/components/config/LogViewer';
import PermissionList from '@/components/config/PermissionList';
import DataSourceMappingList from '@/components/config/DataSourceMappingList';
import UserList from '@/components/config/UserList';
import PowerbiDashboardList from '@/components/config/PowerbiDashboardList';
import type { User } from '@/services/authService';

const CONFIG_TABS = ['locks', 'logs', 'permissions', 'mappings', 'users', 'powerbi-dashboards'] as const;

function isConfigTab(t: string): t is (typeof CONFIG_TABS)[number] {
  return (CONFIG_TABS as readonly string[]).includes(t);
}

export default function Configuration() {
  const [user, setUser] = useState<import('@/services/authService').User | null>(null);
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || '';
  const activeTab = useMemo(() => (isConfigTab(tabParam) ? tabParam : 'locks'), [tabParam]);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }

    const userObj = JSON.parse(userData);
    // Only Admin and CEO can access Configuration
    if (!['Admin', 'CEO'].includes(userObj.role)) {
      navigate('/access-denied');
      return;
    }

    setUser(userObj as User);
  }, [navigate]);

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      user={user}
      headerTitle="Configuration"
      headerSubtitle="Manage Configuration"
      onSignOut={() => { localStorage.removeItem('user'); navigate('/'); }}
    >
        <Tabs value={activeTab} className="w-full">
          <TabsContent value="locks" className="mt-0">
            <LockRuleList />
          </TabsContent>

          <TabsContent value="logs" className="mt-0">
            <LogViewer />
          </TabsContent>

          <TabsContent value="permissions" className="mt-0">
            <PermissionList />
          </TabsContent>

          <TabsContent value="mappings" className="mt-0">
            <DataSourceMappingList />
          </TabsContent>

          <TabsContent value="users" className="mt-0">
            <UserList />
          </TabsContent>

          <TabsContent value="powerbi-dashboards" className="mt-0">
            <PowerbiDashboardList />
          </TabsContent>
        </Tabs>
    </AppLayout>
  );
}
