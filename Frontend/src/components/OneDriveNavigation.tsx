import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart3, 
  TrendingUp, 
  Target, 
  FolderOpen,
  ArrowLeft
} from 'lucide-react';

interface OneDriveNavigationProps {
  user: { role: string; departments: string[] } | null;
}

const OneDriveNavigation: React.FC<OneDriveNavigationProps> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Only show for Operations department and CEO
  if (!user || (user.role !== 'CEO' && (!user.departments.includes('operations')))) {
    return null;
  }

  const navigationItems = [
    {
      title: 'Summary Overview',
      description: 'High-level project summaries and key metrics',
      icon: BarChart3,
      path: '/onedrive-summary1',
      color: 'bg-blue-500/10 text-blue-600 border-blue-200'
    },
    {
      title: 'Advanced Analytics',
      description: 'Detailed trends, comparisons, and insights',
      icon: TrendingUp,
      path: '/onedrive-summary2',
      color: 'bg-green-500/10 text-green-600 border-green-200'
    },
    {
      title: 'Project Targets',
      description: 'View all project targets and objectives',
      icon: Target,
      path: '/onedrive-targets',
      color: 'bg-orange-500/10 text-orange-600 border-orange-200'
    },
    {
      title: 'Project Details',
      description: 'Detailed view for specific projects',
      icon: FolderOpen,
      path: '/onedrive-project',
      color: 'bg-purple-500/10 text-purple-600 border-purple-200'
    }
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.path}
              className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                isActive(item.path) 
                  ? 'ring-2 ring-primary bg-primary/5' 
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => navigate(item.path)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${item.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default OneDriveNavigation; 