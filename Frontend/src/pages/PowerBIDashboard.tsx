import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  RefreshCw,
  LogOut,
  Power,
  BarChart3,
  AlertCircle
} from 'lucide-react';
import NavigationBar from '@/components/shared/NavigationBar';
import { POWERBI_CONFIG, getDashboardById, getAccessibleDashboards, type DashboardConfig } from '@/config/powerbi';

const PowerBIDashboard: React.FC = () => {
  const [selectedDashboard, setSelectedDashboard] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const navigate = useNavigate();

  // Get accessible dashboards based on user role and departments
  const dashboards: DashboardConfig[] = user 
    ? getAccessibleDashboards(user.role, user.departments || [])
    : [];

  // Authentication check
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/");
      return;
    }
    
    const userObj = JSON.parse(userData);
    // Check if user is authenticated
    if (!userObj || !userObj.username) {
      navigate("/");
      return;
    }
    
    setUser(userObj);
  }, [navigate]);

  // Set default selected dashboard when dashboards are loaded
  useEffect(() => {
    if (dashboards.length > 0 && !selectedDashboard) {
      setSelectedDashboard(dashboards[0].id);
    } else if (dashboards.length === 0 && user) {
      // User has no accessible dashboards
      setError('You do not have access to any Power BI dashboards');
    }
  }, [dashboards, user, selectedDashboard]);

  // Initialize dashboard when selection changes
  useEffect(() => {
    if (selectedDashboard) {
      console.log('🔄 Loading dashboard:', selectedDashboard);
      loadDashboard();
    }
  }, [selectedDashboard]);

  const loadDashboard = () => {
    const dashboard = dashboards.find(d => d.id === selectedDashboard);
    if (!dashboard || !dashboard.embedUrl) {
      console.error('❌ Dashboard not found or URL not configured:', selectedDashboard);
      setError('Dashboard URL not configured');
      return;
    }

    console.log('✅ Loading dashboard:', dashboard.name, 'URL:', dashboard.embedUrl);
    setError(null);
    setLoading(true);

    // Simulate loading time for better UX
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  };

  const handleSignOut = () => {
    localStorage.removeItem("user");
    navigate("/");
  };



  const handleDashboardChange = (dashboardId: string) => {
    setSelectedDashboard(dashboardId);
  };

  const refreshDashboard = () => {
    loadDashboard();
  };

  const currentDashboard = dashboards.find(d => d.id === selectedDashboard);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5">
      {/* Header */}
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
                    Power BI Dashboards
                  </h1>
                  <p className="text-xs text-muted-foreground">Interactive data visualizations</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={refreshDashboard} className="h-7 px-2 text-xs">
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleSignOut} className="h-7 px-2 text-xs">
                  <LogOut className="w-3 h-3 mr-1" />
                  Sign Out
                </Button>
              </div>
            </div>

            {/* Navigation Row */}
            <NavigationBar user={user} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4">
        {/* Dashboard Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <span>Select Dashboard</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <Select value={selectedDashboard} onValueChange={handleDashboardChange}>
                <SelectTrigger className="w-80">
                  <SelectValue placeholder="Select a dashboard" />
                </SelectTrigger>
                <SelectContent>
                  {dashboards.map((dashboard) => (
                    <SelectItem key={dashboard.id} value={dashboard.id}>
                      {dashboard.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button
                onClick={refreshDashboard}
                disabled={loading}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{currentDashboard?.name || 'Select Dashboard'}</span>
              {loading && (
                <Badge variant="secondary" className="flex items-center space-x-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Loading...</span>
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="text-center py-12">
                <div className="text-red-600 mb-4">
                  <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                  <p className="text-lg font-medium">{error}</p>
                </div>
                <p className="text-gray-600 mb-4">
                  Please check your dashboard configuration or try refreshing.
                </p>
                <Button onClick={refreshDashboard}>
                  Try Again
                </Button>
              </div>
            ) : currentDashboard ? (
              <div className="w-full border border-gray-200 rounded-lg overflow-hidden">
                {loading ? (
                  <div className="h-[600px] flex items-center justify-center">
                    <div className="text-center">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
                      <p className="text-gray-600">Loading Power BI dashboard...</p>
                    </div>
                  </div>
                ) : (
                  <iframe
                    ref={iframeRef}
                    title={currentDashboard.title}
                    src={currentDashboard.embedUrl}
                    width="100%"
                    height="600"
                    frameBorder="0"
                    allowFullScreen={true}
                    className="w-full h-[600px]"
                    onLoad={() => setLoading(false)}
                    onError={() => {
                      setError('Failed to load dashboard');
                      setLoading(false);
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>Please select a dashboard from the dropdown above</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PowerBIDashboard;
