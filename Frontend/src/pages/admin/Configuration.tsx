import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, FileText, Users, Database } from 'lucide-react';
import NavigationBar from '@/components/shared/NavigationBar';
import LockRuleList from '@/components/config/LockRuleList';
import LogViewer from '@/components/config/LogViewer';
import PermissionList from '@/components/config/PermissionList';
import DataSourceMappingList from '@/components/config/DataSourceMappingList';

export default function Configuration() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('locks');
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

    setUser(userObj);
  }, [navigate]);

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
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  Back
                </Button>
                <div>
                  <h1 className="text-sm font-bold text-foreground">Configuration</h1>
                  <p className="text-xs text-muted-foreground">
                    Manage field locks, activity logs, and user permissions
                  </p>
                </div>
              </div>
            </div>

            <NavigationBar 
              user={user} 
              activeTab="" 
              onTabChange={() => {}}
            />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-3xl grid-cols-4 mb-6">
            <TabsTrigger value="locks">
              <Lock className="w-4 h-4 mr-2" />
              Lock Management
            </TabsTrigger>
            <TabsTrigger value="logs">
              <FileText className="w-4 h-4 mr-2" />
              Activity Logs
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <Users className="w-4 h-4 mr-2" />
              User Permissions
            </TabsTrigger>
            <TabsTrigger value="mappings">
              <Database className="w-4 h-4 mr-2" />
              DataSource Mapping
            </TabsTrigger>
          </TabsList>

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
        </Tabs>
      </div>
    </div>
  );
}
