import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DualMetricBarChart,
  FeedbackBarChart,
  GenderDonutChart,
  MetricToggle,
  OrderedAgeBarChart,
  RankedVerticalBarChart,
  ServicesTrendChart,
} from '@/components/strategic-topics/rb/RbChartPrimitives';
import {
  fetchCategoryProducts,
  fetchDashboardAnalytics,
  fetchDashboardCharts,
  formatMonthLabel,
  hasAnalyticsFilters,
} from '@/services/beneficiariesService';
import type { RbAnalyticsFilters, RbChartsResponse, RbDashboardStats } from '@/types/beneficiaries';
import { cn } from '@/lib/utils';
import { ArrowLeft, CheckCircle2, Layers, UserRound, Users, X } from 'lucide-react';

type CrossFilter = RbAnalyticsFilters;

type Props = {
  stats: RbDashboardStats | null;
  globalStats: RbDashboardStats | null;
  loading: boolean;
  emptyWarehouse: boolean;
};

function KpiTile({
  label,
  hint,
  value,
  icon,
  iconClass,
  filtered,
}: {
  label: string;
  hint: string;
  value: number;
  icon: React.ReactNode;
  iconClass?: string;
  filtered?: boolean;
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
        <div className={cn('h-4 w-4', iconClass)} aria-hidden>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {filtered ? <span className="text-primary font-medium">Filtered · </span> : null}
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}

function FilterChips({
  filters,
  onClear,
  onClearAll,
}: {
  filters: CrossFilter;
  onClear: (key: keyof CrossFilter) => void;
  onClearAll: () => void;
}) {
  const entries = (
    ['nationality', 'gender', 'age', 'team', 'category', 'month', 'feedback'] as const
  ).filter((k) => filters[k]);
  if (!entries.length) return null;
  const chipLabel = (k: keyof CrossFilter) => {
    if (k === 'month' && filters.month) return formatMonthLabel(filters.month);
    return String(filters[k] ?? '');
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Active filters:</span>
      {entries.map((k) => (
        <Badge key={k} variant="secondary" className="gap-1 pr-1 max-w-[min(100%,20rem)]">
          <span className="capitalize shrink-0">{k}</span>
          <span className="truncate">{chipLabel(k)}</span>
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-muted shrink-0"
            onClick={() => onClear(k)}
            aria-label={`Clear ${k} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}

function buildMonthlyRows(
  charts: RbChartsResponse | undefined,
  stats: RbDashboardStats | null | undefined
) {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mapRow = (ym: string, c: number, d: number) => {
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    const monthKey = ym.length >= 7 ? ym.slice(0, 7) : ym;
    const month =
      Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12
        ? `${names[m - 1]} ${String(y).slice(2)}`
        : ym;
    return { month, monthKey, created: c, completed: d, year: y };
  };

  if (charts?.ok) {
    return charts.dy
      .map((x) => mapRow(x.m || '', Number(x.c) || 0, Number(x.d) || 0))
      .filter((row) => row.year >= 2026)
      .map(({ month, monthKey, created, completed }) => ({ month, monthKey, created, completed }));
  }

  return (stats?.servicesByMonthChart ?? [])
    .map((row) => {
      const parts = row.month.split(' ');
      const yr = parts.length >= 2 ? 2000 + Number(parts[1]) : 0;
      const monthIdx = names.findIndex((n) => n === parts[0]);
      const monthKey =
        monthIdx >= 0 && Number.isFinite(yr) ? `${yr}-${String(monthIdx + 1).padStart(2, '0')}` : '';
      return { ...row, monthKey, year: yr };
    })
    .filter((row) => row.year >= 2026)
    .map(({ month, monthKey, created, completed }) => ({ month, monthKey, created, completed }));
}

export function RefugeesBeneficiariesAnalyticsTab({ stats, globalStats, loading, emptyWarehouse }: Props) {
  const [filters, setFilters] = useState<CrossFilter>({});
  const deferredFilters = useDeferredValue(filters);
  const [metricMode, setMetricMode] = useState<'cases' | 'services'>('services');
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const filtered = hasAnalyticsFilters(filters);
  const queryFilters = hasAnalyticsFilters(deferredFilters) ? deferredFilters : filters;

  const analyticsQuery = useQuery({
    queryKey: ['rb', 'analytics', queryFilters],
    queryFn: () => fetchDashboardAnalytics(queryFilters),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !emptyWarehouse,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const chartsQuery = useQuery({
    queryKey: ['rb', 'charts', queryFilters],
    queryFn: () => fetchDashboardCharts(queryFilters),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !emptyWarehouse,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const drillTarget = drillCategory ?? filters.category ?? null;

  const productsQuery = useQuery({
    queryKey: ['rb', 'category-products', drillTarget, metricMode, deferredFilters],
    queryFn: () => fetchCategoryProducts(drillTarget!, metricMode, deferredFilters),
    enabled: !!drillTarget,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const chartsSource = chartsQuery.data?.ok ? chartsQuery.data : undefined;

  const displayStats = useMemo((): RbDashboardStats | null => {
    if (!stats) return null;
    if (!filtered) return stats;
    const k = chartsQuery.data?.kpis;
    if (!k) return stats;
    return {
      ...stats,
      totalPrimaryCases: k.primaryCases,
      totalIndividuals: k.totalIndividuals,
      totalServices: k.totalServices,
      servicesWithActualDate: k.servicesCompleted,
    };
  }, [stats, filtered, chartsQuery.data?.kpis]);

  const feedbackData = useMemo(() => {
    if (chartsSource?.ok) {
      return chartsSource.fb.map((x) => ({ label: x.n || '—', value: Number(x.v) || 0 }));
    }
    return stats?.feedbackChart.map((x) => ({ label: x.name, value: x.value })) ?? [];
  }, [chartsSource, stats?.feedbackChart]);

  const monthlyFromCharts = useMemo(
    () => buildMonthlyRows(chartsSource, stats),
    [chartsSource, stats]
  );

  const analyticsPayload = analyticsQuery.data;

  const teamBarData = useMemo(() => {
    const teams = analyticsPayload?.teams ?? [];
    return teams.map((r) => ({ label: r.label, value: r.services }));
  }, [analyticsPayload?.teams]);

  const toggleFilter = useCallback((key: keyof CrossFilter, label: string) => {
    setFilters((prev) => {
      const cur = prev[key];
      if (cur === label) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: label };
    });
    if (key === 'category') setDrillCategory(null);
  }, []);

  const clearFilter = useCallback((key: keyof CrossFilter) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (key === 'category') setDrillCategory(null);
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
    setDrillCategory(null);
  }, []);

  const onCategorySelect = useCallback((label: string) => {
    toggleFilter('category', label);
  }, [toggleFilter]);

  const onCategoryDrill = useCallback(() => {
    const cat = filters.category;
    if (cat) setDrillCategory(cat);
  }, [filters.category]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (emptyWarehouse || !stats || !displayStats) {
    return null;
  }

  const data = analyticsPayload;

  const chartsBusy =
    (analyticsQuery.isFetching || chartsQuery.isFetching) && filters !== deferredFilters;
  const chartsRefreshing = filtered && (analyticsQuery.isFetching || chartsQuery.isFetching);
  const analyticsInitialLoading =
    !data && (analyticsQuery.isLoading || chartsQuery.isLoading) && !analyticsQuery.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Primary cases"
          hint="Receiver type = Case"
          value={displayStats.totalPrimaryCases}
          icon={<UserRound className="h-4 w-4" />}
          iconClass="text-primary"
          filtered={filtered}
        />
        <KpiTile
          label="Individuals"
          hint="Case holders and dependants"
          value={displayStats.totalIndividuals}
          icon={<Users className="h-4 w-4" />}
          iconClass="text-emerald-600 dark:text-emerald-400"
          filtered={filtered}
        />
        <KpiTile
          label="Services"
          hint="All service records in scope"
          value={displayStats.totalServices}
          icon={<Layers className="h-4 w-4" />}
          iconClass="text-secondary"
          filtered={filtered}
        />
        <KpiTile
          label="Completed"
          hint="Services with an actual date"
          value={displayStats.servicesWithActualDate}
          icon={<CheckCircle2 className="h-4 w-4" />}
          iconClass="text-[hsl(var(--lead-color))]"
          filtered={filtered}
        />
      </div>

      {filtered && globalStats && (
        <p className="text-xs text-muted-foreground">
          Warehouse total: {globalStats.totalIndividuals.toLocaleString()} individuals,{' '}
          {globalStats.totalServices.toLocaleString()} services
        </p>
      )}

      <FilterChips filters={filters} onClear={clearFilter} onClearAll={clearAllFilters} />

      {(analyticsQuery.isError || chartsQuery.isError) && (
        <Alert variant="destructive">
          <AlertTitle>Analytics unavailable</AlertTitle>
          <AlertDescription>
            {analyticsQuery.error instanceof Error
              ? analyticsQuery.error.message
              : chartsQuery.error instanceof Error
                ? chartsQuery.error.message
                : 'Request failed'}
          </AlertDescription>
        </Alert>
      )}

      {analyticsInitialLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <div
          className={cn(
            'space-y-6 transition-opacity duration-150',
            (chartsBusy || chartsRefreshing) && 'opacity-80'
          )}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <RankedVerticalBarChart
              title="Nationality"
              data={data.nationality}
              active={filters.nationality}
              onSelect={(label) => toggleFilter('nationality', label)}
            />
            <GenderDonutChart
              title="Gender"
              data={data.gender}
              active={filters.gender}
              onSelect={(label) => toggleFilter('gender', label)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <OrderedAgeBarChart
              title="Age group"
              data={data.age}
              active={filters.age}
              onSelect={(label) => toggleFilter('age', label)}
            />
            <RankedVerticalBarChart
              title="Execution team"
              data={teamBarData}
              active={filters.team}
              onSelect={(label) => toggleFilter('team', label)}
              hint="Service count by team. Click a column to filter."
              height={280}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ServicesTrendChart
              data={monthlyFromCharts}
              fromYear={2026}
              activeMonth={filters.month}
              onMonthSelect={(monthKey) => toggleFilter('month', monthKey)}
            />
            <FeedbackBarChart
              data={feedbackData}
              active={filters.feedback}
              onSelect={(label) => toggleFilter('feedback', label)}
            />
          </div>
        </div>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Product categories</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Click anywhere in the column to filter. Use View products to drill into items for the selected category.
            </p>
          </div>
          <MetricToggle value={metricMode} onChange={setMetricMode} />
        </CardHeader>
        <CardContent className="space-y-4">
          {filters.category && !drillCategory && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={onCategoryDrill}>
                View products in {filters.category}
              </Button>
            </div>
          )}

          {drillCategory && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setDrillCategory(null)}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                All categories
              </Button>
              <Badge variant="outline" className="max-w-md truncate">
                {drillCategory}
              </Badge>
            </div>
          )}

          {!drillCategory ? (
            <DualMetricBarChart
              title="Categories"
              embedded
              rows={data?.categories ?? []}
              mode={metricMode}
              active={filters.category}
              onSelect={onCategorySelect}
              hint="Click to filter by category"
              height={320}
            />
          ) : productsQuery.isLoading ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : (
            <DualMetricBarChart
              title="Products"
              embedded
              rows={productsQuery.data?.products ?? []}
              mode={metricMode}
              onSelect={() => {}}
              hint="Product breakdown for the selected category"
              height={360}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
