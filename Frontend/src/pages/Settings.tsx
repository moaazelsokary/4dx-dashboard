import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CookiePreferences from '@/components/shared/CookiePreferences';
import { AppLayout } from '@/components/layout/AppLayout';
import type { User } from '@/services/authService';

export default function Settings() {
  const [user, setUser] = useState<User | null>(null);
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }

    const userObj = JSON.parse(userData);
    setUser(userObj as User);
  }, [navigate]);

  return (
    <AppLayout
      user={user}
      headerTitle="Settings"
      headerSubtitle="Manage your preferences and account settings"
      onSignOut={() => { localStorage.removeItem('user'); navigate('/'); }}
    >
      <div className="max-w-4xl mx-auto">
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
    </AppLayout>
  );
}

