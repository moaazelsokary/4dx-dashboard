import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { fetchCategoryProducts, fetchDashboardAnalytics } from '@/services/beneficiariesService';
import type { RbAnalyticsFilters, RbDashboardStats } from '@/types/beneficiaries';
import { cn } from '@/lib/utils';
import { ArrowLeft, UserRound, Users, X } from 'lucide-react';

const CHART_COLORS = ['#6366f1', '#22c55e', '#f97316', '#ec4899', '#14b8a6', '#a855f7', '#eab308', '#0ea5e9'];

type CrossFilter = RbAnalyticsFilters;

type Props = {
  stats: RbDashboardStats | null;
  loading: boolean;
  emptyWarehouse: boolean;
};

function KpiCard({
  label,
  hint,
  value,
  icon,
  iconClass,
}: {
  label: string;
  hint: string;
  value: number;
  icon: React.ReactNode;
  iconClass?: string;
}) {
  return (
    <Card className="border-border/80 shadow-sm bg-gradient-to-b from-card to-card/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
        <div className={cn('h-4 w-4', iconClass)}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</div>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

function chartTooltipStyle() {
  return {
    borderRadius: 8,
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
  };
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
  const entries = (['nationality', 'gender', 'age', 'team'] as const).filter((k) => filters[k]);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Active filters:</span>
      {entries.map((k) => (
        <Badge key={k} variant="secondary" className="gap-1 pr-1">
          <span className="capitalize">{k}</span>: {filters[k]}
          <button type="button" className="rounded-full p-0.5 hover:bg-muted" onClick={() => onClear(k)} aria-label={`Clear ${k}`}>
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

function DemographicPie({
  title,
  data,
  active,
  onSelect,
}: {
  title: string;
  data: { label: string; value: number }[];
  active?: string | null;
  onSelect: (label: string) => void;
}) {
  const chartData = data.map((d) => ({ name: d.label, value: d.value }));
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">Click a segment to filter other charts</p>
      </CardHeader>
      <CardContent className="h-64">
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={1}
                onClick={(_, idx) => onSelect(chartData[idx]?.name ?? '')}
                cursor="pointer"
              >
                {chartData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    opacity={active && active !== entry.name ? 0.35 : 1}
                    stroke={active === entry.name ? 'hsl(var(--foreground))' : undefined}
                    strokeWidth={active === entry.name ? 2 : 0}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle()} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function DemographicBar({
  title,
  data,
  active,
  onSelect,
  layout = 'vertical',
}: {
  title: string;
  data: { label: string; value: number }[];
  active?: string | null;
  onSelect: (label: string) => void;
  layout?: 'vertical' | 'horizontal';
}) {
  const chartData = data.map((d) => ({ name: d.label, value: d.value }));
  const vertical = layout === 'vertical';
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">Click a bar to filter other charts</p>
      </CardHeader>
      <CardContent className="h-64">
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout={vertical ? 'vertical' : 'horizontal'}
              margin={vertical ? { left: 8, right: 16 } : { bottom: 8, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={!vertical} vertical={vertical} />
              {vertical ? (
                <>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                </>
              ) : (
                <>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={56} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                </>
              )}
              <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} contentStyle={chartTooltipStyle()} />
              <Bar
                dataKey="value"
                radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]}
                isAnimationActive={false}
                onClick={(d) => onSelect(String(d.name ?? ''))}
                cursor="pointer"
              >
                {chartData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    opacity={active && active !== entry.name ? 0.35 : 1}
                    stroke={active === entry.name ? 'hsl(var(--foreground))' : undefined}
                    strokeWidth={active === entry.name ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function RefugeesBeneficiariesAnalyticsTab({ stats, loading, emptyWarehouse }: Props) {
  const [filters, setFilters] = useState<CrossFilter>({});
  const [categoryMode, setCategoryMode] = useState<'cases' | 'services'>('cases');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const analyticsQuery = useQuery({
    queryKey: ['rb', 'analytics', filters],
    queryFn: () => fetchDashboardAnalytics(filters),
    staleTime: 5 * 60 * 1000,
    enabled: !emptyWarehouse,
    placeholderData: (p) => p,
    refetchOnWindowFocus: false,
  });

  const productsQuery = useQuery({
    queryKey: ['rb', 'category-products', selectedCategory, categoryMode],
    queryFn: () => fetchCategoryProducts(selectedCategory!, categoryMode),
    enabled: !!selectedCategory,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

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
    setSelectedCategory(null);
  }, []);

  const clearFilter = useCallback((key: keyof CrossFilter) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
    setSelectedCategory(null);
  }, []);

  const categoryChartData = useMemo(() => {
    const rows = analyticsQuery.data?.categories ?? [];
    const key = categoryMode === 'cases' ? 'cases' : 'services';
    return rows.map((r) => ({ name: r.label, value: r[key] }));
  }, [analyticsQuery.data?.categories, categoryMode]);

  const productChartData = useMemo(() => {
    const rows = productsQuery.data?.products ?? [];
    const key = categoryMode === 'cases' ? 'cases' : 'services';
    return rows.map((r) => ({ name: r.label, value: r[key] }));
  }, [productsQuery.data?.products, categoryMode]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (emptyWarehouse || !stats) {
    return null;
  }

  const data = analyticsQuery.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard
          label="Primary cases"
          hint="Individuals with receiver type = Case"
          value={stats.totalPrimaryCases}
          icon={<UserRound className="h-4 w-4" />}
          iconClass="text-primary"
        />
        <KpiCard
          label="Individuals"
          hint="Case holders and dependants in the register"
          value={stats.totalIndividuals}
          icon={<Users className="h-4 w-4" />}
          iconClass="text-emerald-500"
        />
      </div>

      <FilterChips filters={filters} onClear={clearFilter} onClearAll={clearAllFilters} />

      {analyticsQuery.isError && (
        <Alert variant="destructive">
          <AlertTitle>Analytics unavailable</AlertTitle>
          <AlertDescription>
            {analyticsQuery.error instanceof Error ? analyticsQuery.error.message : String(analyticsQuery.error)}
          </AlertDescription>
        </Alert>
      )}

      {analyticsQuery.isLoading && !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <DemographicPie
            title="Nationality"
            data={data.nationality}
            active={filters.nationality}
            onSelect={(label) => toggleFilter('nationality', label)}
          />
          <DemographicPie
            title="Gender"
            data={data.gender}
            active={filters.gender}
            onSelect={(label) => toggleFilter('gender', label)}
          />
          <DemographicBar
            title="Age group"
            data={data.age}
            active={filters.age}
            onSelect={(label) => toggleFilter('age', label)}
            layout="horizontal"
          />
          <DemographicBar
            title="Execution team"
            data={data.teams.map((t) => ({ label: t.label, value: t.services }))}
            active={filters.team}
            onSelect={(label) => toggleFilter('team', label)}
          />
        </div>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Product categories</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Click a category to drill into products. Toggle between counting distinct cases or total services.
            </p>
          </div>
          <ToggleGroup
            type="single"
            value={categoryMode}
            onValueChange={(v) => {
              if (v === 'cases' || v === 'services') setCategoryMode(v);
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="cases" aria-label="Cases per category" className="text-xs">
              Cases per category
            </ToggleGroupItem>
            <ToggleGroupItem value="services" aria-label="Services per category" className="text-xs">
              Services per category
            </ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedCategory && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedCategory(null)}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                All categories
              </Button>
              <Badge variant="outline">{selectedCategory}</Badge>
            </div>
          )}

          {!selectedCategory ? (
            <div className="h-80">
              {categoryChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No category data</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData} margin={{ left: 8, right: 8, bottom: 64 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={72} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} contentStyle={chartTooltipStyle()} />
                    <Bar
                      dataKey="value"
                      radius={[6, 6, 0, 0]}
                      isAnimationActive={false}
                      cursor="pointer"
                      onClick={(d) => setSelectedCategory(String(d.name ?? ''))}
                    >
                      {categoryChartData.map((entry, i) => (
                        <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : productsQuery.isLoading ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : (
            <div className="h-80">
              {productChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products in this category</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} contentStyle={chartTooltipStyle()} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                      {productChartData.map((entry, i) => (
                        <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
