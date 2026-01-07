import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import CookiePreferences from '@/components/shared/CookiePreferences';
import NavigationBar from '@/components/shared/NavigationBar';

export default function Settings() {
  const [user, setUser] = useState<any>(null);
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }

    const userObj = JSON.parse(userData);
    setUser(userObj);
  }, [navigate]);

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
                  <h1 className="text-sm font-bold text-foreground">Settings</h1>
                  <p className="text-xs text-muted-foreground">
                    Manage your preferences and account settings
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

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="space-y-6">
          {/* Cookie Preferences */}
          <Card>
            <CardHeader>
              <CardTitle>Privacy & Cookies</CardTitle>
              <CardDescription>
                Manage your cookie preferences and privacy settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Cookie Preferences</h3>
                  <p className="text-sm text-muted-foreground">
                    Control which cookies are used on this website
                  </p>
                </div>
                <Button onClick={() => setCookieDialogOpen(true)}>
                  Manage Cookies
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Account Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Manage your account information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Username</p>
                  <p className="text-sm text-muted-foreground">{user?.username || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Role</p>
                  <p className="text-sm text-muted-foreground">{user?.role || 'N/A'}</p>
                </div>
                {user?.departments && user.departments.length > 0 && (
                  <div>
                    <p className="text-sm font-medium">Departments</p>
                    <p className="text-sm text-muted-foreground">
                      {Array.isArray(user.departments) 
                        ? user.departments.join(', ') 
                        : user.departments}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <CookiePreferences 
        open={cookieDialogOpen} 
        onOpenChange={setCookieDialogOpen} 
      />
    </div>
  );
}

