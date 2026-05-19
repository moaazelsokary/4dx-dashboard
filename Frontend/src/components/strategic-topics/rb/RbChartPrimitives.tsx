import { useMemo } from 'react';
import type { MouseEvent } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import BidirectionalText from '@/components/ui/BidirectionalText';
import { cn } from '@/lib/utils';

export const AGE_BUCKET_ORDER = ['0–17', '18–29', '30–44', '45–59', '60+', 'Unknown'] as const;

const SERIES_CSS_VARS = [
  '--primary',
  '--secondary',
  '--lead-color',
  '--activity-color',
  '--health-good',
  '--health-warning',
  '--health-critical',
] as const;

export function chartTooltipStyle(): React.CSSProperties {
  return {
    borderRadius: 8,
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    fontSize: 13,
  };
}

function readCssHsl(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  return `hsl(${raw})`;
}

export function getSeriesColors(count: number): string[] {
  const base = SERIES_CSS_VARS.map((v, i) =>
    readCssHsl(v, ['hsl(213 88% 35%)', 'hsl(24 95% 53%)', 'hsl(142 71% 45%)', 'hsl(262 83% 58%)'][i % 4]!)
  );
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(base[i % base.length]!);
  return out;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

export function bucketOthers<T extends { label: string; value: number }>(
  rows: T[],
  limit: number,
  otherLabel = 'Other'
): T[] {
  if (rows.length <= limit) return rows;
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const otherValue = rest.reduce((s, r) => s + r.value, 0);
  if (otherValue <= 0) return head;
  return [...head, { ...head[0]!, label: otherLabel, value: otherValue }];
}

export function sortAgeBuckets<T extends { label: string; value: number }>(rows: T[]): T[] {
  const order = new Map(AGE_BUCKET_ORDER.map((l, i) => [l, i]));
  return [...rows].sort((a, b) => {
    const ai = order.get(a.label as (typeof AGE_BUCKET_ORDER)[number]) ?? 99;
    const bi = order.get(b.label as (typeof AGE_BUCKET_ORDER)[number]) ?? 99;
    return ai - bi;
  });
}

export function axisLabelWidth(labels: string[], min = 120, max = 200): number {
  const longest = labels.reduce((m, l) => Math.max(m, l.length), 0);
  return Math.min(max, Math.max(min, longest * 7));
}

export function truncateLabel(label: string, max = 28): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

type SliceRow = { label: string; value: number };

type BandBgProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { name?: string };
};

function resolveBarRowLabel(data: unknown): string {
  if (data == null || typeof data !== 'object') return '';
  const row = data as { name?: string; payload?: { name?: string } };
  return String(row.payload?.name ?? row.name ?? '').trim();
}

function barSelectHandler(onSelect: (label: string) => void) {
  return (data: unknown, _index?: number, e?: MouseEvent) => {
    const name = resolveBarRowLabel(data);
    if (!name) return;
    e?.stopPropagation();
    onSelect(name);
  };
}

function renderClickableCell(
  name: string,
  fill: string,
  active: string | null | undefined,
  onSelect: (label: string) => void
) {
  const isActive = active === name;
  const dimmed = active && !isActive;
  return (
    <Cell
      key={name}
      fill={fill}
      opacity={dimmed ? 0.35 : 1}
      stroke={isActive ? 'hsl(var(--foreground))' : undefined}
      strokeWidth={isActive ? 2 : 0}
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(name);
      }}
    />
  );
}

type MonthBandPayload = { monthKey?: string };

function monthColumnBackground(
  props: BandBgProps,
  activeMonth: string | null | undefined,
  onMonthSelect: (monthKey: string) => void
) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const monthKey = (payload as MonthBandPayload | undefined)?.monthKey;
  if (!monthKey || width <= 0 || height <= 0) return null;
  const isActive = activeMonth === monthKey;
  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={height}
      fill={isActive ? 'hsl(var(--muted) / 0.28)' : 'hsl(var(--muted) / 0.08)'}
      radius={[4, 4, 0, 0]}
      style={{ cursor: 'pointer' }}
      onClick={(e: MouseEvent<SVGRectElement>) => {
        e.stopPropagation();
        onMonthSelect(monthKey);
      }}
    />
  );
}

function columnBackground(
  props: BandBgProps,
  active: string | null | undefined,
  onSelect: (label: string) => void,
  layout: 'vertical' | 'horizontal' = 'vertical'
) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const name = payload?.name;
  if (!name || width <= 0 || height <= 0) return null;
  const isActive = active === name;
  const radius = layout === 'horizontal' ? ([0, 6, 6, 0] as const) : ([4, 4, 0, 0] as const);
  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={height}
      fill={isActive ? 'hsl(var(--muted) / 0.28)' : 'hsl(var(--muted) / 0.08)'}
      radius={radius}
      style={{ cursor: 'pointer' }}
      onClick={(e: MouseEvent<SVGRectElement>) => {
        e.stopPropagation();
        onSelect(name);
      }}
    />
  );
}

type TooltipPayloadItem = {
  name?: string;
  value?: number;
  dataKey?: string;
  payload?: { name?: string; label?: string; month?: string };
};

/** Row category from a Recharts bar payload (series name is often the dataKey "value"). */
function resolveTooltipCategoryLabel(item: TooltipPayloadItem | undefined): string {
  if (!item) return '';
  const row = item.payload;
  if (row) {
    if (row.name != null && String(row.name).trim()) return String(row.name).trim();
    if (row.label != null && String(row.label).trim()) return String(row.label).trim();
    if (row.month != null && String(row.month).trim()) return String(row.month).trim();
  }
  const series = item.name ?? item.dataKey;
  if (series && series !== 'value') return String(series);
  return '';
}

function SliceTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const label = resolveTooltipCategoryLabel(p) || String(p?.name ?? '');
  const v = Number(p?.value) || 0;
  const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm max-w-xs">
      <BidirectionalText className="font-medium">{label}</BidirectionalText>
      <p className="text-muted-foreground tabular-nums mt-0.5">
        {formatCount(v)} ({pct}%)
      </p>
    </div>
  );
}

function BarTooltipContent({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const label = resolveTooltipCategoryLabel(p);
  const v = Number(p?.value) || 0;
  const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm max-w-xs">
      <BidirectionalText className="font-medium">{label}</BidirectionalText>
      <p className="text-muted-foreground tabular-nums mt-0.5">
        {formatCount(v)} ({pct}%)
      </p>
    </div>
  );
}

export function ChartCard({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('border-border/80 shadow-sm', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function verticalBarBody(
  chartData: { name: string; value: number }[],
  colors: string[],
  total: number,
  active: string | null | undefined,
  onSelect: (label: string) => void,
  height: number
) {
  return (
    <div style={{ height }} role="img" aria-label="Bar chart">
      {chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ left: 8, right: 8, bottom: 56, top: 4 }}
            onClick={(state) => {
              const label = state?.activeLabel;
              if (label != null && String(label) !== '') onSelect(String(label));
            }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              angle={-32}
              textAnchor="end"
              height={56}
              interval={0}
              tickFormatter={(v) => truncateLabel(String(v), 14)}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
              content={<BarTooltipContent total={total} />}
              labelFormatter={() => ''}
            />
            <Bar
              dataKey="value"
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
              cursor="pointer"
              background={(bg) => columnBackground(bg as BandBgProps, active, onSelect, 'vertical')}
              onClick={barSelectHandler(onSelect)}
            >
              {chartData.map((entry, i) =>
                renderClickableCell(entry.name, colors[i % colors.length]!, active, onSelect)
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Vertical column chart (categories on X axis). */
export function RankedVerticalBarChart({
  title,
  data,
  active,
  onSelect,
  limit = 15,
  hint = 'Click the bar or column area to filter other charts',
  height = 280,
  embedded = false,
}: {
  title: string;
  data: SliceRow[];
  active?: string | null;
  onSelect: (label: string) => void;
  limit?: number;
  hint?: string;
  height?: number;
  embedded?: boolean;
}) {
  const chartData = useMemo(() => {
    const bucketed = bucketOthers(data, limit);
    return bucketed.map((d) => ({ name: d.label, value: d.value }));
  }, [data, limit]);
  const colors = useMemo(() => getSeriesColors(chartData.length), [chartData.length]);
  const total = useMemo(() => chartData.reduce((s, d) => s + d.value, 0), [chartData]);

  const body = verticalBarBody(chartData, colors, total, active, onSelect, height);

  if (embedded) return body;
  return (
    <ChartCard title={title} hint={hint}>
      {body}
    </ChartCard>
  );
}

export function RankedHorizontalBarChart({
  title,
  data,
  active,
  onSelect,
  limit = 15,
  hint = 'Click the bar or column area to filter other charts',
  height = 280,
  embedded = false,
}: {
  title: string;
  data: SliceRow[];
  active?: string | null;
  onSelect: (label: string) => void;
  limit?: number;
  hint?: string;
  height?: number;
  embedded?: boolean;
}) {
  const chartData = useMemo(() => {
    const bucketed = bucketOthers(data, limit);
    return bucketed.map((d) => ({ name: d.label, value: d.value }));
  }, [data, limit]);
  const colors = useMemo(() => getSeriesColors(chartData.length), [chartData.length]);
  const total = useMemo(() => chartData.reduce((s, d) => s + d.value, 0), [chartData]);
  const yWidth = axisLabelWidth(chartData.map((d) => d.name));

  const body = (
    <div style={{ height }} role="img" aria-label={title || 'Chart'}>
      {chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
            onClick={(state) => {
              const label = state?.activeLabel;
              if (label != null && String(label) !== '') onSelect(String(label));
            }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={yWidth}
              tick={({ x, y, payload }) => (
                <g transform={`translate(${x},${y})`}>
                  <text x={-4} y={0} dy={4} textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))">
                    {truncateLabel(String(payload?.value ?? ''))}
                  </text>
                </g>
              )}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
              content={<BarTooltipContent total={total} />}
              labelFormatter={() => ''}
            />
            <Bar
              dataKey="value"
              radius={[0, 6, 6, 0]}
              isAnimationActive={false}
              cursor="pointer"
              background={(bg) => columnBackground(bg as BandBgProps, active, onSelect, 'horizontal')}
              onClick={barSelectHandler(onSelect)}
            >
              {chartData.map((entry, i) =>
                renderClickableCell(entry.name, colors[i % colors.length]!, active, onSelect)
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  if (embedded) return body;
  return (
    <ChartCard title={title} hint={hint}>
      {body}
    </ChartCard>
  );
}

export function GenderDonutChart({
  title,
  data,
  active,
  onSelect,
  hint = 'Click the chart or legend to filter other charts',
}: {
  title: string;
  data: SliceRow[];
  active?: string | null;
  onSelect: (label: string) => void;
  hint?: string;
}) {
  const chartData = useMemo(() => data.map((d) => ({ name: d.label, value: d.value })), [data]);
  const colors = useMemo(() => getSeriesColors(chartData.length), [chartData.length]);
  const total = useMemo(() => chartData.reduce((s, d) => s + d.value, 0), [chartData]);

  return (
    <ChartCard title={title} hint={hint}>
      <div className="h-64 flex gap-2" role="img" aria-label={title}>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={72}
                    paddingAngle={2}
                    onClick={(_, idx) => onSelect(chartData[idx]?.name ?? '')}
                    cursor="pointer"
                  >
                    {chartData.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={colors[i % colors.length]}
                        opacity={active && active !== entry.name ? 0.35 : 1}
                        stroke={active === entry.name ? 'hsl(var(--foreground))' : undefined}
                        strokeWidth={active === entry.name ? 2 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<SliceTooltip total={total} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-[42%] max-w-[11rem] shrink-0 flex flex-col justify-center gap-1.5 py-1" aria-label="Gender legend">
              {chartData.map((entry, i) => {
                const v = entry.value;
                const pct = total > 0 ? ((v / total) * 100).toFixed(0) : '0';
                const isActive = active === entry.name;
                const dimmed = active && !isActive;
                return (
                  <li key={entry.name}>
                    <button
                      type="button"
                      onClick={() => onSelect(entry.name)}
                      className={cn(
                        'w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/80',
                        isActive && 'bg-muted ring-1 ring-foreground/20',
                        dimmed && 'opacity-50'
                      )}
                      aria-pressed={isActive}
                      aria-label={`Filter by ${entry.name}, ${formatCount(v)} (${pct} percent)`}
                    >
                      <span className="flex items-start gap-2">
                        <span
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: colors[i % colors.length] }}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <BidirectionalText className="block font-medium leading-tight">{entry.name}</BidirectionalText>
                          <span className="text-muted-foreground tabular-nums">
                            {formatCount(v)} ({pct}%)
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </ChartCard>
  );
}

export function OrderedAgeBarChart({
  title,
  data,
  active,
  onSelect,
}: {
  title: string;
  data: SliceRow[];
  active?: string | null;
  onSelect: (label: string) => void;
}) {
  const ordered = useMemo(() => sortAgeBuckets(data), [data]);
  return (
    <RankedHorizontalBarChart
      title={title}
      data={ordered}
      active={active}
      onSelect={onSelect}
      limit={AGE_BUCKET_ORDER.length}
      hint="Ordered age bands. Click the bar or row area to filter."
      height={240}
    />
  );
}

export function ServicesTrendChart({
  data,
  fromYear = 2026,
  activeMonth,
  onMonthSelect,
}: {
  data: { month: string; monthKey: string; created: number; completed: number }[];
  fromYear?: number;
  activeMonth?: string | null;
  onMonthSelect?: (monthKey: string) => void;
}) {
  const chartData = useMemo(() => data, [data]);
  const createdColor = readCssHsl('--primary', 'hsl(213 88% 35%)');
  const completedColor = readCssHsl('--lead-color', 'hsl(142 71% 45%)');
  const interactive = !!onMonthSelect;

  return (
    <ChartCard
      title="Services by month"
      hint={
        interactive
          ? `Created vs completed from ${fromYear}. Click a month bar or column to filter.`
          : `Created vs completed from ${fromYear} (warehouse months)`
      }
    >
      <div className="h-72" role="img" aria-label="Services by month">
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No monthly data</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ left: 8, right: 8, bottom: 8 }}
              onClick={
                interactive
                  ? (state) => {
                      const label = state?.activeLabel;
                      const row = chartData.find((d) => d.month === label);
                      if (row?.monthKey) onMonthSelect(row.monthKey);
                    }
                  : undefined
              }
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="created"
                name="Created"
                fill={createdColor}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                cursor={interactive ? 'pointer' : undefined}
                background={
                  interactive && onMonthSelect
                    ? (bg) => monthColumnBackground(bg as BandBgProps, activeMonth, onMonthSelect)
                    : undefined
                }
                onClick={
                  interactive && onMonthSelect
                    ? (data: unknown, _i?: number, e?: MouseEvent) => {
                        const row = data as { payload?: { monthKey?: string } } | undefined;
                        const monthKey = row?.payload?.monthKey;
                        if (!monthKey) return;
                        e?.stopPropagation();
                        onMonthSelect(monthKey);
                      }
                    : undefined
                }
              >
                {interactive && onMonthSelect
                  ? chartData.map((entry) => (
                      <Cell
                        key={`c-${entry.monthKey}`}
                        fill={createdColor}
                        opacity={activeMonth && activeMonth !== entry.monthKey ? 0.35 : 1}
                        stroke={activeMonth === entry.monthKey ? 'hsl(var(--foreground))' : undefined}
                        strokeWidth={activeMonth === entry.monthKey ? 1 : 0}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMonthSelect(entry.monthKey);
                        }}
                      />
                    ))
                  : null}
              </Bar>
              <Bar
                dataKey="completed"
                name="Completed"
                fill={completedColor}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                cursor={interactive ? 'pointer' : undefined}
                onClick={
                  interactive && onMonthSelect
                    ? (data: unknown, _i?: number, e?: MouseEvent) => {
                        const row = data as { payload?: { monthKey?: string } } | undefined;
                        const monthKey = row?.payload?.monthKey;
                        if (!monthKey) return;
                        e?.stopPropagation();
                        onMonthSelect(monthKey);
                      }
                    : undefined
                }
              >
                {interactive && onMonthSelect
                  ? chartData.map((entry) => (
                      <Cell
                        key={`d-${entry.monthKey}`}
                        fill={completedColor}
                        opacity={activeMonth && activeMonth !== entry.monthKey ? 0.35 : 1}
                        stroke={activeMonth === entry.monthKey ? 'hsl(var(--foreground))' : undefined}
                        strokeWidth={activeMonth === entry.monthKey ? 1 : 0}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMonthSelect(entry.monthKey);
                        }}
                      />
                    ))
                  : null}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

export function FeedbackBarChart({
  data,
  active,
  onSelect,
}: {
  data: SliceRow[];
  active?: string | null;
  onSelect?: (label: string) => void;
}) {
  const chartData = useMemo(() => {
    const bucketed = bucketOthers(data, 12);
    return bucketed.map((d) => ({ name: d.label, value: d.value }));
  }, [data]);
  const colors = useMemo(() => getSeriesColors(chartData.length), [chartData.length]);
  const total = useMemo(() => chartData.reduce((s, d) => s + d.value, 0), [chartData]);
  const yWidth = axisLabelWidth(chartData.map((d) => d.name), 100, 180);

  const interactive = !!onSelect;

  return (
    <ChartCard
      title="Service feedback"
      hint={
        interactive
          ? 'Click the bar or row area to filter other charts'
          : 'Top feedback values'
      }
    >
      <div className="h-72" role="img" aria-label="Service feedback breakdown">
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No feedback data</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 4, right: 12 }}
              onClick={
                interactive
                  ? (state) => {
                      const label = state?.activeLabel;
                      if (label != null && String(label) !== '') onSelect(String(label));
                    }
                  : undefined
              }
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={yWidth}
                tick={({ x, y, payload }) => (
                  <g transform={`translate(${x},${y})`}>
                    <text x={-4} y={0} dy={4} textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))">
                      {truncateLabel(String(payload?.value ?? ''), 24)}
                    </text>
                  </g>
                )}
              />
              <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
              content={<BarTooltipContent total={total} />}
              labelFormatter={() => ''}
            />
              <Bar
                dataKey="value"
                radius={[0, 6, 6, 0]}
                isAnimationActive={false}
                cursor={interactive ? 'pointer' : undefined}
                background={
                  interactive && onSelect
                    ? (bg) => columnBackground(bg as BandBgProps, active, onSelect, 'horizontal')
                    : undefined
                }
                onClick={interactive && onSelect ? barSelectHandler(onSelect) : undefined}
              >
                {chartData.map((entry, i) =>
                  interactive && onSelect
                    ? renderClickableCell(entry.name, colors[i % colors.length]!, active, onSelect)
                    : (
                        <Cell
                          key={entry.name}
                          fill={colors[i % colors.length]}
                          opacity={active && active !== entry.name ? 0.35 : 1}
                          stroke={active === entry.name ? 'hsl(var(--foreground))' : undefined}
                          strokeWidth={active === entry.name ? 2 : 0}
                        />
                      )
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

export function MetricToggle({
  value,
  onChange,
}: {
  value: 'cases' | 'services';
  onChange: (v: 'cases' | 'services') => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5 text-xs" role="group" aria-label="Count mode">
      {(['cases', 'services'] as const).map((m) => (
        <button
          key={m}
          type="button"
          className={cn(
            'rounded px-2.5 py-1 capitalize transition-colors',
            value === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => onChange(m)}
          aria-pressed={value === m}
        >
          {m === 'cases' ? 'Cases' : 'Services'}
        </button>
      ))}
    </div>
  );
}

export function DualMetricBarChart({
  title,
  rows,
  mode,
  active,
  onSelect,
  hint,
  height = 320,
  embedded = false,
}: {
  title: string;
  rows: { label: string; cases: number; services: number }[];
  mode: 'cases' | 'services';
  active?: string | null;
  onSelect: (label: string) => void;
  hint?: string;
  height?: number;
  embedded?: boolean;
}) {
  const data = useMemo(
    () => rows.map((r) => ({ label: r.label, value: mode === 'cases' ? r.cases : r.services })),
    [rows, mode]
  );
  return (
    <RankedVerticalBarChart
      title={title}
      data={data}
      active={active}
      onSelect={onSelect}
      limit={15}
      hint={hint}
      height={height}
      embedded={embedded}
    />
  );
}
