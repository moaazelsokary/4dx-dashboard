import { Component, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import type { User } from '@/services/authService';
import {
  buildDashboardStats,
  enqueueBeneficiariesSync,
  fetchBeneficiariesSyncJob,
  fetchDashboardCharts,
  fetchDashboardSummary,
  refreshBeneficiariesImmediate,
} from '@/services/beneficiariesService';
import type { RbDashboardStats } from '@/types/beneficiaries';
import { cn } from '@/lib/utils';
import { BookOpen, LayoutDashboard, RefreshCw } from 'lucide-react';
import { RefugeesBeneficiariesAnalyticsTab } from './RefugeesBeneficiariesAnalyticsTab';
import { RefugeesBeneficiariesCaseStoryTab } from './RefugeesBeneficiariesCaseStoryTab';

type Props = {
  user: User;
};

type PanelEbProps = { label: string; children: ReactNode };
type PanelEbState = { err: Error | null };

class PanelErrorBoundary extends Component<PanelEbProps, PanelEbState> {
  constructor(props: PanelEbProps) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err: Error): PanelEbState {
    return { err };
  }

  componentDidCatch(err: Error) {
    console.error(`[Beneficiaries panel: ${this.props.label}]`, err);
  }

  render() {
    if (this.state.err) {
      return (
        <Alert variant="destructive">
          <AlertTitle>{this.props.label} unavailable</AlertTitle>
          <AlertDescription>
            This panel hit an unexpected render error. Try reloading the page if the issue persists.
          </AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

export default function RefugeesBeneficiariesDashboard({ user }: Props) {
  const qc = useQueryClient();
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [syncImmediate, setSyncImmediate] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ['rb', 'summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: (p) => p,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const chartsQuery = useQuery({
    queryKey: ['rb', 'charts', {}],
    queryFn: () => fetchDashboardCharts(),
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    enabled: !!summaryQuery.data?.ok,
    placeholderData: (p) => p,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const stats = useMemo(
    (): RbDashboardStats | null => buildDashboardStats(summaryQuery.data, chartsQuery.data),
    [summaryQuery.data, chartsQuery.data]
  );

  const globalStats = stats;

  const emptyWarehouse = useMemo(() => {
    const k = summaryQuery.data?.kpis;
    if (!k) return false;
    return !summaryQuery.data?.meta?.lastSyncAt && k.totalIndividuals === 0 && k.totalServices === 0;
  }, [summaryQuery.data]);

  useEffect(() => {
    if (!syncJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (attempt: number) => {
      try {
        const body = await fetchBeneficiariesSyncJob(syncJobId);
        if (cancelled) return;
        if (!body.ok) {
          toast({
            title: 'Sync job not found',
            description: 'The job may have expired or the id was invalid.',
            variant: 'destructive',
          });
          setSyncJobId(null);
          return;
        }
        const st = body.j.st;
        if (st === 'succeeded') {
          toast({
            title: 'Warehouse sync finished',
            description:
              body.j.du != null ? `Duration about ${Math.round(Number(body.j.du) / 1000)}s.` : 'Data is up to date.',
          });
          await qc.invalidateQueries({ queryKey: ['rb'] });
          setSyncJobId(null);
          return;
        }
        if (st === 'failed') {
          toast({
            title: 'Sync failed',
            description: body.j.er || 'See server logs for details.',
            variant: 'destructive',
          });
          setSyncJobId(null);
          return;
        }
        const delay = Math.min(25_000, 1200 + attempt * 600);
        timer = window.setTimeout(() => void poll(attempt + 1), delay);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: 'Sync status error',
            description: e instanceof Error ? e.message : String(e),
            variant: 'destructive',
          });
          setSyncJobId(null);
        }
      }
    };

    void poll(0);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [syncJobId, qc]);

  const onQueueSync = useCallback(async () => {
    try {
      const { jobId } = await enqueueBeneficiariesSync();
      setSyncJobId(jobId);
      toast({
        title: 'Sync queued',
        description: 'Odoo extract runs in the background. This page will refresh when the job completes.',
      });
    } catch (e) {
      toast({
        title: 'Could not queue sync',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }, []);

  const onImmediateSync = useCallback(async () => {
    try {
      setSyncImmediate(true);
      await refreshBeneficiariesImmediate();
      await qc.invalidateQueries({ queryKey: ['rb'] });
      toast({
        title: 'Snapshot refreshed',
        description: 'Odoo data was merged into the read model in this request.',
      });
    } catch (e) {
      toast({
        title: 'Refresh failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSyncImmediate(false);
    }
  }, [qc]);

  const canAdminRefresh = user.role === 'Admin' || user.role === 'CEO';
  const syncBusy = !!syncJobId || syncImmediate;
  const summaryFetching = summaryQuery.isFetching && !summaryQuery.isPlaceholderData;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Beneficiaries</h2>
        </div>
        {canAdminRefresh && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void onQueueSync()} disabled={syncBusy}>
              <RefreshCw className={cn('h-4 w-4', syncJobId && 'animate-spin')} />
              Queue Odoo sync
            </Button>
            <Button variant="outline" size="sm" onClick={() => void onImmediateSync()} disabled={syncBusy}>
              Sync now (wait)
            </Button>
          </div>
        )}
      </div>

      {summaryQuery.isError && (
        <Alert variant="destructive">
          <AlertTitle>Summary unavailable</AlertTitle>
          <AlertDescription>
            {summaryQuery.error instanceof Error ? summaryQuery.error.message : String(summaryQuery.error)}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="story" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Find a case story
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 mt-0">
          {(summaryQuery.isLoading || chartsQuery.isLoading) && !stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          )}

          {!summaryQuery.isLoading && !chartsQuery.isLoading && emptyWarehouse && (
            <Alert>
              <AlertTitle>Warehouse empty</AlertTitle>
              <AlertDescription>
                Run the enterprise migration, set Odoo credentials, then use Queue Odoo sync or Sync now (Admin/CEO).
              </AlertDescription>
            </Alert>
          )}

          {!summaryQuery.isLoading && !emptyWarehouse && stats && (
            <PanelErrorBoundary label="Dashboard analytics">
              <RefugeesBeneficiariesAnalyticsTab
                stats={stats}
                globalStats={globalStats}
                loading={summaryQuery.isLoading || (chartsQuery.isLoading && !chartsQuery.data)}
                emptyWarehouse={emptyWarehouse}
              />
            </PanelErrorBoundary>
          )}
        </TabsContent>

        <TabsContent value="story" className="mt-0">
          <PanelErrorBoundary label="Case story">
            <RefugeesBeneficiariesCaseStoryTab />
          </PanelErrorBoundary>
        </TabsContent>
      </Tabs>

      {summaryFetching && !summaryQuery.isLoading && (
        <p className="text-xs text-muted-foreground text-center">Refreshing summary…</p>
      )}
    </div>
  );
}
