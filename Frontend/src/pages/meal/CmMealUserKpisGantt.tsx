import { useCallback, useMemo, useState } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  startOfDay,
} from 'date-fns';
import { ChevronRight } from 'lucide-react';
import type { CmMealUserKpiRow, CmMealUserKpiTeamMember } from '@/types/wig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import BidirectionalText from '@/components/ui/BidirectionalText';
import { cn } from '@/lib/utils';
import { showEmployeeScopeFilter } from '@/config/cmMealUserKpiAccess';
import { getCurrentUser } from '@/services/authService';
import {
  barStateClassName,
  deriveUserKpiBarState,
  employeeKpiLaneKey,
  parseKpiDate,
  rowLaneLabel,
  rowSortKey,
  userKpiBarStateLabel,
} from './cmMealUserKpiGanttUtils';

const DAY_PX = 14;
const LABEL_COL_W = 220;

type Props = {
  rows: CmMealUserKpiRow[];
  employees: CmMealUserKpiTeamMember[];
  employeeScope: 'all' | number;
  onEmployeeScopeChange: (scope: 'all' | number) => void;
};

export default function CmMealUserKpisGantt({
  rows,
  employees,
  employeeScope,
  onEmployeeScopeChange,
}: Props) {
  const user = useMemo(() => getCurrentUser(), []);
  const showFilter = showEmployeeScopeFilter(user);
  const showEmployeeInLane = employeeScope === 'all' && showFilter;
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);

  const scopedRows = useMemo(() => {
    if (employeeScope === 'all') return rows;
    return rows.filter((r) => r.user_id === employeeScope);
  }, [rows, employeeScope]);

  const { datedBars, unscheduled, min, max, lanes } = useMemo(() => {
    type Bar = { row: CmMealUserKpiRow; lane: string; start: Date; end: Date };
    const bars: Bar[] = [];
    const unsched: CmMealUserKpiRow[] = [];
    const laneSet = new Set<string>();

    for (const r of scopedRows) {
      const sd = parseKpiDate(r.start_date);
      const ed = parseKpiDate(r.end_date);
      if (!sd || !ed || ed < sd) {
        unsched.push(r);
        continue;
      }
      const lane = employeeKpiLaneKey(r);
      laneSet.add(lane);
      bars.push({ row: r, lane, start: sd, end: ed });
    }

    unsched.sort((a, b) => rowSortKey(a) - rowSortKey(b));
    const laneList = [...laneSet].sort((a, b) => {
      const ra = bars.find((x) => x.lane === a)?.row;
      const rb = bars.find((x) => x.lane === b)?.row;
      if (!ra || !rb) return a.localeCompare(b);
      const emp = (ra.username || '').localeCompare(rb.username || '');
      if (emp !== 0) return emp;
      const kpi = (ra.kpi || '').localeCompare(rb.kpi || '');
      if (kpi !== 0) return kpi;
      return rowSortKey(ra) - rowSortKey(rb);
    });

    if (bars.length === 0) {
      return {
        datedBars: [] as Bar[],
        unscheduled: unsched,
        min: null as Date | null,
        max: null as Date | null,
        lanes: [] as string[],
      };
    }

    let minD = bars[0].start;
    let maxD = bars[0].end;
    for (const b of bars) {
      if (b.start < minD) minD = b.start;
      if (b.end > maxD) maxD = b.end;
    }
    minD = addDays(minD, -3);
    maxD = addDays(maxD, 7);

    return { datedBars: bars, unscheduled: unsched, min: minD, max: maxD, lanes: laneList };
  }, [scopedRows]);

  const days = useMemo(() => {
    if (!min || !max) return [] as Date[];
    return eachDayOfInterval({ start: min, end: max });
  }, [min, max]);

  const timelineWidth = days.length * DAY_PX;
  const today = startOfDay(new Date());

  const dayOffset = useCallback(
    (d: Date) => {
      if (!min) return 0;
      return differenceInCalendarDays(startOfDay(d), min) * DAY_PX;
    },
    [min]
  );

  const barGeometry = useCallback(
    (start: Date, end: Date) => {
      const left = dayOffset(start);
      const right = dayOffset(addDays(end, 1));
      return { left, width: Math.max(4, right - left) };
    },
    [dayOffset]
  );

  const monthMarkers = useMemo(() => {
    const out: { label: string; left: number }[] = [];
    let lastMonth = '';
    for (const d of days) {
      const mk = format(d, 'yyyy-MM');
      if (mk !== lastMonth) {
        lastMonth = mk;
        out.push({ label: format(d, 'MMM yyyy'), left: dayOffset(d) });
      }
    }
    return out;
  }, [days, dayOffset]);

  const laneLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of datedBars) {
      map.set(b.lane, rowLaneLabel(b.row, showEmployeeInLane));
    }
    return map;
  }, [datedBars, showEmployeeInLane]);

  const timelineSubtitle = `${lanes.length} KPI${lanes.length === 1 ? '' : 's'} · ${datedBars.length} scheduled · ${unscheduled.length} unscheduled`;

  const employeeFilter = showFilter ? (
    <div className="space-y-1.5 min-w-[12rem]">
      <Label className="sr-only">Employee</Label>
      <Select
        value={employeeScope === 'all' ? 'all' : String(employeeScope)}
        onValueChange={(v) => onEmployeeScopeChange(v === 'all' ? 'all' : parseInt(v, 10))}
      >
        <SelectTrigger className="w-[14rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All my team</SelectItem>
          {employees.map((e) => (
            <SelectItem key={e.id} value={String(e.id)}>
              {e.username}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {datedBars.length === 0 || !min || !max ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Timeline</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{timelineSubtitle}</p>
            </div>
            {employeeFilter}
          </CardHeader>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No dated activities yet. Set start and end dates on KPI rows in the Table view.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b bg-muted/20">
            <div>
              <CardTitle className="text-base">Timeline</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{timelineSubtitle}</p>
            </div>
            {employeeFilter}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div style={{ minWidth: LABEL_COL_W + timelineWidth }}>
                <div className="flex border-b bg-muted/40 text-xs">
                  <div className="shrink-0 border-r px-2 py-2 font-medium" style={{ width: LABEL_COL_W }}>
                    {showEmployeeInLane ? 'Employee · KPI' : 'KPI'}
                  </div>
                  <div className="relative shrink-0" style={{ width: timelineWidth, height: 36 }}>
                    {monthMarkers.map((m) => (
                      <div
                        key={`${m.label}-${m.left}`}
                        className="absolute top-0 bottom-0 border-l border-border/50 px-1 py-2 font-medium truncate"
                        style={{ left: m.left, maxWidth: 120 }}
                      >
                        {m.label}
                      </div>
                    ))}
                  </div>
                </div>

                {lanes.map((lane) => {
                  const laneBars = datedBars.filter((b) => b.lane === lane);
                  const firstBar = laneBars[0];
                  if (!firstBar) return null;
                  const barH = 22;
                  const barGap = 4;
                  const padTop = 6;
                  const padBottom = 6;
                  const laneHeight =
                    padTop + laneBars.length * barH + Math.max(0, laneBars.length - 1) * barGap + padBottom;

                  return (
                    <div key={lane} className="flex border-b border-border/60" style={{ minHeight: laneHeight }}>
                      <div
                        className="shrink-0 border-r px-2 py-2 text-xs leading-snug"
                        style={{ width: LABEL_COL_W }}
                      >
                        <div className="font-medium truncate">
                          <BidirectionalText>
                            {laneLabelByKey.get(lane) ?? rowLaneLabel(firstBar.row, showEmployeeInLane)}
                          </BidirectionalText>
                        </div>
                      </div>
                      <div
                        className="relative shrink-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_calc(100%/12),hsl(var(--border)/0.28)_calc(100%/12),hsl(var(--border)/0.28)_calc(100%/12+1px))]"
                        style={{ width: timelineWidth, minHeight: laneHeight }}
                      >
                        {today >= min && today <= max ? (
                          <div
                            className="absolute top-0 bottom-0 z-10 w-px bg-rose-500"
                            style={{ left: dayOffset(today) }}
                            title={`Today ${format(today, 'MMM d, yyyy')}`}
                          />
                        ) : null}
                        <TooltipProvider delayDuration={200}>
                          {laneBars.map((bar, barIndex) => {
                            const { left, width } = barGeometry(bar.start, bar.end);
                            const state = deriveUserKpiBarState(bar.row);
                            const stateLabel = userKpiBarStateLabel(state);
                            const top = padTop + barIndex * (barH + barGap);

                            return (
                              <Tooltip key={bar.row.id}>
                                <TooltipTrigger asChild>
                                  <div
                                    className={cn(
                                      'absolute rounded-md text-[11px] leading-tight px-1.5 py-0.5 overflow-hidden flex items-center shadow-sm border cursor-default',
                                      state !== 'unscheduled' && barStateClassName(state, false)
                                    )}
                                    style={{
                                      left,
                                      width,
                                      minWidth: 4,
                                      top,
                                      height: barH,
                                    }}
                                  >
                                    <span className="truncate font-medium min-w-0">
                                      <BidirectionalText className="truncate">{bar.row.activity}</BidirectionalText>
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  <div className="font-semibold">{bar.row.kpi || 'Untitled KPI'}</div>
                                  <div className="text-muted-foreground">{bar.row.activity}</div>
                                  <div className="text-muted-foreground mt-1 space-y-0.5">
                                    {bar.row.username ? <div>Employee: {bar.row.username}</div> : null}
                                    <div>
                                      Target: {bar.row.target ?? '—'} · Actual: {bar.row.actual ?? '—'}
                                    </div>
                                    <div>
                                      {format(bar.start, 'PP')} → {format(bar.end, 'PP')}
                                    </div>
                                    <div>State: {stateLabel}</div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </TooltipProvider>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {unscheduled.length > 0 ? (
        <Card className="border-amber-500/25 border-2">
          <Collapsible open={unscheduledOpen} onOpenChange={setUnscheduledOpen}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 py-4 space-y-0">
              <div className="space-y-1 min-w-0">
                <CardTitle className="text-base">Unscheduled</CardTitle>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">{unscheduled.length}</span>
                  {' · '}
                  activities need valid start and end dates before they appear on the timeline.
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  <ChevronRight
                    className={cn('h-3.5 w-3.5 transition-transform', unscheduledOpen && 'rotate-90')}
                  />
                  {unscheduledOpen ? 'Hide list' : 'View list'}
                </Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-4">
                <ScrollArea className="h-[40vh] max-h-[22rem] rounded-md border bg-muted/20">
                  <ul className="p-3 space-y-2 text-sm">
                    {unscheduled.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-md border border-border/60 bg-card px-3 py-2 text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          {r.username ? `${r.username} · ` : ''}
                          {r.kpi?.trim() || 'Untitled KPI'}
                          {' — '}
                        </span>
                        <BidirectionalText className="inline">{r.activity}</BidirectionalText>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ) : null}
    </div>
  );
}
