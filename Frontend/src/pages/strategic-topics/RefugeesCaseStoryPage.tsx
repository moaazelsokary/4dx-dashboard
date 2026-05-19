import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { RbSyncFreshnessBadge } from '@/components/strategic-topics/RbSyncFreshnessBadge';
import { fetchAuthSession, getCurrentUser, mergeSessionIntoStoredUser, signOut } from '@/services/authService';
import type { User } from '@/services/authService';
import { fetchDashboardSummary } from '@/services/beneficiariesService';
import { RefugeesBeneficiariesCaseStoryTab } from './RefugeesBeneficiariesCaseStoryTab';

/** Standalone shareable path for Find a case story (no beneficiaries dashboard). */
export default function RefugeesCaseStoryPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

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
        /* keep stored user */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSignOut = useCallback(() => {
    signOut();
    navigate('/');
  }, [navigate]);

  const summaryQuery = useQuery({
    queryKey: ['rb', 'summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!user) return null;

  const lastSynced = summaryQuery.data?.meta?.lastSyncAt ?? null;

  return (
    <AppLayout
      user={user}
      headerTitle="Find a case story"
      headerSubtitle="Refugees beneficiaries"
      onSignOut={handleSignOut}
      badge={<RbSyncFreshnessBadge at={lastSynced} />}
    >
      <RefugeesBeneficiariesCaseStoryTab />
    </AppLayout>
  );
}
