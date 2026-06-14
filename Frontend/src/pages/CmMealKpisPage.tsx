import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { fetchAuthSession, getCurrentUser, mergeSessionIntoStoredUser } from '@/services/authService';
import type { User } from '@/services/authService';
import CmMealKpisTab from '@/pages/meal/CmMealKpisTab';

export default function CmMealKpisPage() {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

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

  if (!user) return null;

  return (
    <AppLayout
      user={user}
      headerTitle="CM & MEAL KPIs"
      headerSubtitle="Project KPIs by month"
      onSignOut={handleSignOut}
    >
      <CmMealKpisTab />
    </AppLayout>
  );
}
