import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Department, StrategicTopicCode, StrategicTopicKpiRow } from '@/types/wig';
import { parsePipeList, STRATEGIC_TOPIC_LABELS } from './strategicTopicKpiUtils';
import { format, isPast, parseISO } from 'date-fns';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import BidirectionalText from '@/components/ui/BidirectionalText';
import { cn } from '@/lib/utils';

type Props = {
  rows: StrategicTopicKpiRow[];
  topicTitle: string;
  departments: Department[];
  departmentScope: 'all' | string;
  onDepartmentScopeChange: (scope: 'all' | string) => void;
};

type DrillState =
  | { kind: 'total' }
  | { kind: 'status'; status: 'Completed' | 'In Progress' | 'On Hold' }
  | { kind: 'missing_dates' }
  | { kind: 'overdue' }
  | { kind: 'department'; code: string }
  | { kind: 'row'; id: number };

function mapChartNameToStatus(name: string): DrillState['status'] | null {
  if (name === 'Completed') return 'Completed';
  if (name === 'In Progress') return 'In Progress';
  if (name === 'On Hold') return 'On Hold';
  return null;
}

function safeParseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try {
    const d = parseISO(String(s).slice(0, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatDateShort(s: string | null | undefined): string {
  if (!s) return '—';
  return String(s).slice(0, 10);
}

function objectiveCellText(row: StrategicTopicKpiRow): string {
  return (row.objective_text || row.main_objective || '—').trim() || '—';
}

function displayTopicsPipe(s: string): string {
  return parsePipeList(s)
    .map((c) => STRATEGIC_TOPIC_LABELS[c as StrategicTopicCode] || c)
    .join(', ');
}

function drillRows(rows: StrategicTopicKpiRow[], drill: DrillState): StrategicTopicKpiRow[] {
  const now = new Date();
  switch (drill.kind) {
    case 'total':
      return [...rows];
    case 'status':
      return rows.filter((r) => r.status === drill.status);
    case 'missing_dates':
      return rows.filter((r) => {
        const sd = safeParseDate(r.start_date);
        const ed = safeParseDate(r.end_date);
        return !sd || !ed;
      });
    case 'overdue':
      return rows.filter((r) => {
        const ed = safeParseDate(r.end_date);
        return ed != null && r.status !== 'Completed' && isPast(ed);
      });
    case 'department': {
      const c = drill.code.toLowerCase();
      return rows.filter((r) =>
        parsePipeList(r.associated_departments).some((x) => x.toLowerCase() === c)
      );
    }
    case 'row':
      return rows.filter((r) => r.id === drill.id);
    default:
      return [];
  }
}

function drillTitle(drill: DrillState, count: number): string {
  switch (drill.kind) {
    case 'total':
      return `All activities (${count})`;
    case 'status':
      return `${drill.status} (${count})`;
    case 'missing_dates':
      return `Missing schedule (${count})`;
    case 'overdue':
      return `Overdue — not completed (${count})`;
    case 'department':
      return `Department · ${drill.code.toUpperCase()} (${count})`;
    case 'row':
      return count === 1 ? 'Activity detail' : `Activity (${count})`;
    default:
      return `Details (${count})`;
  }
}

function drillSubtitle(drill: DrillState): string {
  switch (drill.kind) {
    case 'total':
      return 'Full list for this strategic topic. Use Table KPI to edit rows.';
    case 'status':
      return 'Rows matching this status. Click a bar in the chart for the same view.';
    case 'missing_dates':
      return 'Activities without both start and end dates. Add dates in Table KPI to include them on the Gantt.';
    case 'overdue':
      return 'End date is in the past and status is not Completed.';
    case 'department':
      return 'Rows that include this department code in associated departments.';
    case 'row':
      return 'Selected from upcoming deadlines.';
    default:
      return '';
  }
}

type MetricCardProps = {
  title: string;
  value: number;
  hint?: string;
  valueClass?: string;
  onOpen: () => void;
};

function MetricCard({ title, value, hint, valueClass, onOpen }: MetricCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'cursor-pointer transition-all outline-none',
        'hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold tabular-nums tracking-tight', valueClass)}>{value}</div>
        {hint ? <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{hint}</p> : null}
        <p className="text-[11px] text-primary/80 font-medium mt-2">Click to explore →</p>
      </CardContent>
    </Card>
  );
}

export default function StrategicTopicDashboard({
  rows,
  topicTitle,
  departments,
  departmentScope,
  onDepartmentScopeChange,
}: Props) {
  const [drill, setDrill] = useState<DrillState | null>(null);

  const departmentsSorted = useMemo(
    () =>
      [...departments].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [departments]
  );

  const deptNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) {
      m.set(String(d.code).toLowerCase(), d.name);
    }
    return m;
  }, [departments]);

  const displayDepts = (s: string) =>
    parsePipeList(s)
      .map((c) => deptNameByCode.get(c.toLowerCase()) || c)
      .join(', ');

  const stats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let onHold = 0;
    let missingDates = 0;
    let overdue = 0;
    for (const r of rows) {
      if (r.status === 'Completed') completed++;
      else if (r.status === 'In Progress') inProgress++;
      else if (r.status === 'On Hold') onHold++;
      const sd = safeParseDate(r.start_date);
      const ed = safeParseDate(r.end_date);
      if (!sd || !ed) missingDates++;
      else if (r.status !== 'Completed' && isPast(ed)) overdue++;
    }
    const statusChart = [
      { name: 'Completed', count: completed },
      { name: 'In Progress', count: inProgress },
      { name: 'On Hold', count: onHold },
    ];
    const deptCounts = new Map<string, number>();
    for (const r of rows) {
      for (const c of parsePipeList(r.associated_departments)) {
        deptCounts.set(c, (deptCounts.get(c) || 0) + 1);
      }
    }
    const topDepts = [...deptCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([code, count]) => ({ code, count }));
    return { completed, inProgress, onHold, missingDates, overdue, statusChart, topDepts, total: rows.length };
  }, [rows]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return rows
      .map((r) => ({ r, ed: safeParseDate(r.end_date) }))
      .filter((x) => x.ed && x.r.status !== 'Completed')
      .filter((x) => x.ed! >= now)
      .sort((a, b) => (a.ed!.getTime() - b.ed!.getTime()))
      .slice(0, 5);
  }, [rows]);

  const drilled = useMemo(() => (drill ? drillRows(rows, drill) : []), [rows, drill]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-0.5 min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight sm:text-base">{topicTitle} overview</h2>
          <p className="text-sm text-muted-foreground">
            Summary of KPI activities — click any metric to open a detailed panel (2026 execution view).
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-auto sm:max-w-[280px] sm:pt-0.5">
          <Select
            value={departmentScope}
            onValueChange={(v) => onDepartmentScopeChange(v === 'all' ? 'all' : v)}
          >
            <SelectTrigger className="h-9 w-full text-left text-xs sm:text-sm">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departmentsSorted.map((d) => (
                <SelectItem key={d.id} value={String(d.code).toLowerCase()}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard title="Total rows" value={stats.total} onOpen={() => setDrill({ kind: 'total' })} />
        <MetricCard
          title="Completed"
          value={stats.completed}
          valueClass="text-emerald-600 dark:text-emerald-400"
          onOpen={() => setDrill({ kind: 'status', status: 'Completed' })}
        />
        <MetricCard
          title="In progress"
          value={stats.inProgress}
          valueClass="text-sky-600 dark:text-sky-400"
          onOpen={() => setDrill({ kind: 'status', status: 'In Progress' })}
        />
        <MetricCard
          title="On hold"
          value={stats.onHold}
          valueClass="text-amber-600 dark:text-amber-400"
          onOpen={() => setDrill({ kind: 'status', status: 'On Hold' })}
        />
        <MetricCard
          title="Missing schedule"
          value={stats.missingDates}
          hint="No start or end date"
          valueClass="text-amber-600 dark:text-amber-400"
          onOpen={() => setDrill({ kind: 'missing_dates' })}
        />
        <MetricCard
          title="Overdue"
          value={stats.overdue}
          hint="Not completed, past end date"
          valueClass="text-rose-600 dark:text-rose-400"
          onOpen={() => setDrill({ kind: 'overdue' })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By status</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">Click a bar to open the same breakdown.</p>
          </CardHeader>
          <CardContent className="h-56">
            {stats.total === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.statusChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted) / 0.25)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { name: string; count: number };
                      return (
                        <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
                          <div className="font-semibold text-foreground">{p.name}</div>
                          <div className="tabular-nums text-muted-foreground mt-0.5">Count: {p.count}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} cursor="pointer">
                    {stats.statusChart.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill="hsl(var(--primary))"
                        className="cursor-pointer opacity-90 hover:opacity-100 transition-opacity"
                        onClick={() => {
                          const st = mapChartNameToStatus(entry.name);
                          if (st) setDrill({ kind: 'status', status: st });
                        }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming end dates</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcoming.map(({ r, ed }) => (
                  <li
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className="flex justify-between gap-2 border-b border-border/60 pb-2 last:border-0 rounded-sm cursor-pointer hover:bg-muted/50 px-1 -mx-1 transition-colors"
                    onClick={() => setDrill({ kind: 'row', id: r.id })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDrill({ kind: 'row', id: r.id });
                      }
                    }}
                  >
                    <span className="truncate font-medium min-w-0">
                      <BidirectionalText>{r.activity}</BidirectionalText>
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {ed ? format(ed, 'MMM d, yyyy') : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {stats.topDepts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Departments by row count</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">Select a department to see its rows.</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.topDepts.map(({ code, count }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setDrill({ kind: 'department', code })}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium',
                    'hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                >
                  <span className="uppercase tracking-wide text-muted-foreground">{code}</span>
                  <Badge variant="secondary" className="tabular-nums font-semibold">
                    {count}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={drill !== null} onOpenChange={(open) => !open && setDrill(null)}>
        <DialogContent className="w-[min(98vw,105rem)] max-w-[105rem] gap-0 p-0 max-h-[min(82vh,42rem)] overflow-hidden sm:max-w-[min(98vw,105rem)] sm:w-[min(98vw,105rem)] sm:rounded-xl border-2 shadow-xl">
          {drill && (
            <>
              <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/[0.1] via-background to-accent/[0.06] px-4 pt-8 pb-4 sm:px-5">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-10%,hsl(var(--primary)/0.2),transparent)]" />
                <DialogHeader className="relative space-y-1.5 text-left sm:text-left pr-8">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="border-primary/30 bg-background/90 text-[10px] font-semibold">
                      2026 · {topicTitle}
                    </Badge>
                    <Badge variant="secondary" className="tabular-nums text-[10px]">
                      {drilled.length}
                    </Badge>
                  </div>
                  <DialogTitle className="text-base font-semibold leading-snug sm:text-lg">
                    {drillTitle(drill, drilled.length)}
                  </DialogTitle>
                  <DialogDescription className="text-[11px] text-muted-foreground leading-snug">
                    {drillSubtitle(drill)}
                  </DialogDescription>
                </DialogHeader>
              </div>
              <ScrollArea className="max-h-[min(52vh,30rem)] sm:max-h-[min(48vh,28rem)]">
                <div className="p-3 sm:p-4">
                  {drilled.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">No rows in this view.</p>
                  ) : (
                    <div className="rounded-md border bg-card overflow-x-auto">
                      <Table className="text-[10px] sm:text-[11px]">
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50 [&_th]:h-8 [&_th]:py-1">
                            <TableHead className="min-w-[5.5rem] font-semibold whitespace-nowrap">KPI</TableHead>
                            <TableHead className="min-w-[6rem] font-semibold">Objectives</TableHead>
                            <TableHead className="min-w-[7rem] font-semibold">Activity</TableHead>
                            <TableHead className="min-w-[4rem] font-semibold whitespace-nowrap">Duration</TableHead>
                            <TableHead className="min-w-[3.25rem] font-semibold whitespace-nowrap">Start</TableHead>
                            <TableHead className="min-w-[3.25rem] font-semibold whitespace-nowrap">End</TableHead>
                            <TableHead className="min-w-[5rem] font-semibold">Departments</TableHead>
                            <TableHead className="min-w-[5rem] font-semibold">Pillars</TableHead>
                            <TableHead className="min-w-[3.5rem] font-semibold whitespace-nowrap">Status</TableHead>
                            <TableHead className="min-w-[5rem] font-semibold">Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {drilled.map((r) => (
                            <TableRow key={r.id} className="hover:bg-muted/40 [&_td]:py-1.5">
                              <TableCell className="align-top max-w-[7rem]">
                                <BidirectionalText>{r.main_kpi || '—'}</BidirectionalText>
                              </TableCell>
                              <TableCell className="align-top max-w-[8rem]">
                                <BidirectionalText>{objectiveCellText(r)}</BidirectionalText>
                              </TableCell>
                              <TableCell className="align-top font-medium max-w-[9rem]">
                                <BidirectionalText>{r.activity}</BidirectionalText>
                              </TableCell>
                              <TableCell className="align-top text-muted-foreground whitespace-nowrap">
                                {r.expected_duration || '—'}
                              </TableCell>
                              <TableCell className="align-top tabular-nums whitespace-nowrap">
                                {formatDateShort(r.start_date)}
                              </TableCell>
                              <TableCell className="align-top tabular-nums whitespace-nowrap">
                                {formatDateShort(r.end_date)}
                              </TableCell>
                              <TableCell className="align-top max-w-[8rem]">
                                <BidirectionalText>{displayDepts(r.associated_departments)}</BidirectionalText>
                              </TableCell>
                              <TableCell className="align-top max-w-[7rem]">
                                <BidirectionalText>{displayTopicsPipe(r.associated_strategic_topics)}</BidirectionalText>
                              </TableCell>
                              <TableCell className="align-top whitespace-nowrap">
                                <Badge variant="outline" className="font-normal text-[9px] px-1.5 py-0">
                                  {r.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="align-top max-w-[8rem] break-words text-muted-foreground">
                                <BidirectionalText>{r.notes || '—'}</BidirectionalText>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="flex justify-end border-t bg-muted/20 px-3 py-2">
                <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={() => setDrill(null)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
