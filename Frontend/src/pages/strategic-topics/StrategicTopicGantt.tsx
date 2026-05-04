import { useMemo, useEffect, useState, useCallback } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  format,
  getDate,
  parse,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Department } from '@/types/wig';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import BidirectionalText from '@/components/ui/BidirectionalText';
import type { StrategicTopicCode, StrategicTopicKpiRow } from '@/types/wig';
import { parsePipeList, STRATEGIC_TOPIC_LABELS } from './strategicTopicKpiUtils';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

type Props = {
  rows: StrategicTopicKpiRow[];
  strategicTopicCode: StrategicTopicCode;
  departmentNameByCode: Map<string, string>;
  departments: Department[];
  departmentScope: 'all' | string;
  onDepartmentScopeChange: (scope: 'all' | string) => void;
};

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try {
    const d = parseISO(String(s).slice(0, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function monthKey(d: Date): string {
  return format(startOfMonth(d), 'yyyy-MM');
}

/** Key = first calendar day of the month’s 7-day block (days 1–7 → week 1, 8–14 → week 2, …). */
function weekChunkKeyFromDate(d: Date): string {
  const day = startOfDay(d);
  const m0 = startOfMonth(day);
  const dom = getDate(day);
  const chunkIndex = Math.floor((dom - 1) / 7);
  const chunkStart = addDays(m0, chunkIndex * 7);
  return format(chunkStart, 'yyyy-MM-dd');
}

/** e.g. "Days 1–7 of May 2026" for calendar week chunks within the month. */
function monthChunkRangeLabel(chunkStart: Date): string {
  const mEnd = endOfMonth(chunkStart);
  const nominalEnd = addDays(chunkStart, 6);
  const lastInChunk = nominalEnd > mEnd ? mEnd : nominalEnd;
  return `Days ${getDate(chunkStart)}–${getDate(lastInChunk)} of ${format(chunkStart, 'MMMM yyyy')}`;
}

function parseWeekKeyLocal(wk: string): Date | null {
  try {
    const d = parse(wk, 'yyyy-MM-dd', new Date());
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** One contiguous timeline slice [start,end] inclusive calendar days → fixed pixel width */
type TimelineSeg = { start: Date; end: Date; widthPx: number };

/** Collapsed month/week columns: wider default band (expanded months/weeks still scale locally). */
const COLLAPSED_MONTH_DAY_PX = 3.2;
/** Wide enough for a full “MMM yyyy” label (e.g. September 2026) with chevron + padding. */
const MIN_MONTH_PX = 118;
const WEEK_COLLAPSED_DAY_PX = 15.5;
const MIN_WEEK_PX = 88;
/** Every collapsed week column uses a full 7-day width (first/last chunk same as middle). */
const FULL_WEEK_DAYS = 7;
const DAY_EXPANDED_PX = 30;

type WeekCol = {
  wk: string;
  /** First day of this month chunk (1, 8, 15, 22, or 29 of the month). */
  weekStart: Date;
  label: string;
  widthPx: number;
  expanded: boolean;
  days: Date[];
};

type MonthCol = {
  mk: string;
  mStart: Date;
  widthPx: number;
  expanded: boolean;
  weeks: WeekCol[];
};

function positionAtDayStart(day: Date, segments: TimelineSeg[], totalWidth: number): number {
  const t = startOfDay(day).getTime();
  if (segments.length === 0) return 0;
  let x = 0;
  for (const seg of segments) {
    const s = startOfDay(seg.start).getTime();
    const e = startOfDay(seg.end).getTime();
    const n = differenceInCalendarDays(seg.end, seg.start) + 1;
    if (t < s) return x;
    if (t > e) {
      x += seg.widthPx;
      continue;
    }
    const idx = differenceInCalendarDays(startOfDay(day), seg.start);
    const frac = n > 0 ? idx / n : 0;
    x += frac * seg.widthPx;
    return x;
  }
  return totalWidth;
}

function buildTimeline(
  min: Date,
  max: Date,
  monthsInView: Date[],
  expandedMonths: Set<string>,
  expandedWeeks: Set<string>
): { segments: TimelineSeg[]; monthColumns: MonthCol[]; totalWidth: number } {
  const segments: TimelineSeg[] = [];
  const monthColumns: MonthCol[] = [];
  let totalWidth = 0;

  for (const mStart of monthsInView) {
    const mEnd = endOfMonth(mStart);
    const clipS = mStart < min ? min : mStart;
    const clipE = mEnd > max ? max : mEnd;
    if (clipS > clipE) continue;

    const mk = monthKey(mStart);
    const daysInFullCalendarMonth = differenceInCalendarDays(mEnd, mStart) + 1;
    const monthOpen = expandedMonths.has(mk);

    if (!monthOpen) {
      /** Same width as a full calendar month so first/last partial months match middle months visually. */
      const w = Math.max(MIN_MONTH_PX, daysInFullCalendarMonth * COLLAPSED_MONTH_DAY_PX);
      segments.push({ start: startOfDay(clipS), end: startOfDay(clipE), widthPx: w });
      monthColumns.push({ mk, mStart, widthPx: w, expanded: false, weeks: [] });
      totalWidth += w;
      continue;
    }

    const daysInCalMonth = differenceInCalendarDays(mEnd, mStart) + 1;
    const numWeekChunks = Math.ceil(daysInCalMonth / 7);

    const weekCols: WeekCol[] = [];
    let monthSum = 0;

    for (let chunkIdx = 0; chunkIdx < numWeekChunks; chunkIdx++) {
      const chunkStart = addDays(mStart, chunkIdx * 7);
      const chunkEnd = addDays(chunkStart, 6);
      const chunkEndInMonth = chunkEnd > mEnd ? mEnd : chunkEnd;

      const ws = chunkStart < clipS ? clipS : chunkStart;
      const we = chunkEndInMonth > clipE ? clipE : chunkEndInMonth;
      if (ws > we) continue;

      const wk = format(chunkStart, 'yyyy-MM-dd');
      const daysVisible = differenceInCalendarDays(we, ws) + 1;
      const weekOpen = expandedWeeks.has(wk);
      let ww: number;
      if (!weekOpen) {
        ww = Math.max(MIN_WEEK_PX, FULL_WEEK_DAYS * WEEK_COLLAPSED_DAY_PX);
      } else {
        ww = daysVisible * DAY_EXPANDED_PX;
      }
      segments.push({ start: startOfDay(ws), end: startOfDay(we), widthPx: ww });
      const daysArr = weekOpen
        ? eachDayOfInterval({ start: startOfDay(ws), end: startOfDay(we) })
        : [];
      const label = `Week ${chunkIdx + 1}`;
      weekCols.push({
        wk,
        weekStart: chunkStart,
        label,
        widthPx: ww,
        expanded: weekOpen,
        days: daysArr,
      });
      monthSum += ww;
    }

    monthColumns.push({ mk, mStart, widthPx: monthSum, expanded: true, weeks: weekCols });
    totalWidth += monthSum;
  }

  return { segments, monthColumns, totalWidth };
}

function rowSortKey(r: StrategicTopicKpiRow): number {
  const so = r.sort_order;
  return so != null && Number.isFinite(so) ? so : 1_000_000 + r.id;
}

/** 14px chevron, rotates 90° when expanded (ease-out ~150ms). Parent should use `group`. */
function ExpandChevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronRight
      className={cn(
        'size-[14px] shrink-0 stroke-[2] text-muted-foreground transition-transform duration-150 ease-out',
        'group-hover:text-foreground/85',
        expanded && 'rotate-90',
        'motion-reduce:transition-none'
      )}
      aria-hidden
    />
  );
}

export default function StrategicTopicGantt({
  rows,
  strategicTopicCode,
  departmentNameByCode,
  departments,
  departmentScope,
  onDepartmentScopeChange,
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [entered, setEntered] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const fn = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', fn);
    const t = window.setTimeout(() => setEntered(true), reduceMotion ? 0 : 80);
    return () => {
      mq.removeEventListener('change', fn);
      window.clearTimeout(t);
    };
  }, [reduceMotion]);

  const { datedBars, unscheduled, min, max, lanes, totalDays } = useMemo(() => {
    const unsched: StrategicTopicKpiRow[] = [];
    type Bar = {
      row: StrategicTopicKpiRow;
      dept: string;
      start: Date;
      end: Date;
    };
    const bars: Bar[] = [];
    const laneSet = new Set<string>();

    for (const r of rows) {
      const sd = parseDate(r.start_date);
      const ed = parseDate(r.end_date);
      if (!sd || !ed) {
        unsched.push(r);
        continue;
      }
      if (ed < sd) {
        unsched.push(r);
        continue;
      }
      const depts = parsePipeList(r.associated_departments);
      if (depts.length === 0) {
        unsched.push(r);
        continue;
      }
      for (const d of depts) {
        const code = d.toLowerCase();
        laneSet.add(code);
        bars.push({ row: r, dept: code, start: startOfDay(sd), end: startOfDay(ed) });
      }
    }

    unsched.sort((a, b) => rowSortKey(a) - rowSortKey(b));

    if (bars.length === 0) {
      return {
        datedBars: [] as Bar[],
        unscheduled: unsched,
        min: null as Date | null,
        max: null as Date | null,
        lanes: [] as string[],
        totalDays: 0,
      };
    }

    let minD = bars[0].start;
    let maxD = bars[0].end;
    for (const b of bars) {
      if (b.start < minD) minD = b.start;
      if (b.end > maxD) maxD = b.end;
    }
    minD = addDays(minD, -7);
    maxD = addDays(maxD, 14);
    const total = Math.max(1, differenceInCalendarDays(maxD, minD));
    const laneList = [...laneSet].sort();

    return { datedBars: bars, unscheduled: unsched, min: minD, max: maxD, lanes: laneList, totalDays: total };
  }, [rows]);

  useEffect(() => {
    if (!min || !max) return;
    const now = startOfDay(new Date());
    const mk = monthKey(now);
    const wk = weekChunkKeyFromDate(now);
    setExpandedMonths(new Set([mk]));
    setExpandedWeeks(new Set([wk]));
  }, [min, max]);

  const monthsInView = useMemo(() => {
    if (!min || !max) return [] as Date[];
    return eachMonthOfInterval({ start: startOfMonth(min), end: max });
  }, [min, max]);

  const { segments, monthColumns, totalWidth: timelineWidth } = useMemo(() => {
    if (!min || !max) {
      return { segments: [] as TimelineSeg[], monthColumns: [] as MonthCol[], totalWidth: 720 };
    }
    return buildTimeline(min, max, monthsInView, expandedMonths, expandedWeeks);
  }, [min, max, monthsInView, expandedMonths, expandedWeeks]);

  const showWeekRow = expandedMonths.size > 0;
  const showDayRow = expandedWeeks.size > 0;

  /** Month label can wrap to two lines on small screens; keep room so nothing clips. */
  const headerBlockHeight =
    44 + (showWeekRow ? 32 : 0) + (showDayRow ? 48 : 0);

  const dayStart = useCallback(
    (d: Date) => positionAtDayStart(d, segments, timelineWidth),
    [segments, timelineWidth]
  );

  const barGeometry = useCallback(
    (start: Date, end: Date) => {
      const left = dayStart(start);
      const right = dayStart(addDays(end, 1));
      const w = Math.max(2, right - left);
      return { left, width: w };
    },
    [dayStart]
  );

  const monthStartsXs = useMemo(() => {
    if (!min || !max) return [] as number[];
    return monthsInView.map((m) => dayStart(m < min ? min : m));
  }, [min, max, monthsInView, dayStart]);

  const toggleMonth = useCallback((m: Date) => {
    const k = monthKey(m);
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        next.delete(k);
        setExpandedWeeks((wprev) => {
          const wnext = new Set(wprev);
          for (const wk of wnext) {
            const ws = parseWeekKeyLocal(wk);
            if (ws && monthKey(ws) === k) wnext.delete(wk);
          }
          return wnext;
        });
      } else {
        next.add(k);
      }
      return next;
    });
  }, []);

  const toggleWeek = useCallback((weekStart: Date, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const k = format(startOfDay(weekStart), 'yyyy-MM-dd');
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const monthHeaderKeyDown = useCallback(
    (mStart: Date, expanded: boolean) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleMonth(mStart);
      } else if (e.key === 'ArrowRight' && !expanded) {
        e.preventDefault();
        toggleMonth(mStart);
      } else if (e.key === 'ArrowLeft' && expanded) {
        e.preventDefault();
        toggleMonth(mStart);
      }
    },
    [toggleMonth]
  );

  const weekHeaderKeyDown = useCallback(
    (weekStart: Date, expanded: boolean) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleWeek(weekStart);
      } else if (e.key === 'ArrowRight' && !expanded) {
        e.preventDefault();
        toggleWeek(weekStart);
      } else if (e.key === 'ArrowLeft' && expanded) {
        e.preventDefault();
        toggleWeek(weekStart);
      }
    },
    [toggleWeek]
  );

  const today = startOfDay(new Date());
  const showToday = min && max && today >= min && today <= max;

  const topicLabel = STRATEGIC_TOPIC_LABELS[strategicTopicCode];

  const labelColW = 236;

  const departmentsSorted = useMemo(
    () =>
      [...departments].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [departments]
  );

  const deptFilterTrigger = (
    <Select
      value={departmentScope}
      onValueChange={(v) => onDepartmentScopeChange(v === 'all' ? 'all' : v)}
    >
      <SelectTrigger className="h-9 w-full min-w-0 sm:w-[min(100%,260px)] text-left text-xs sm:text-sm">
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
  );

  const renderTimelineCard = () => (
    <Card className="overflow-hidden border-2 border-border">
      <CardHeader className="flex flex-col gap-3 space-y-0 border-b bg-muted/20 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <button
            type="button"
            id="gantt-timeline-trigger"
            aria-expanded={timelineOpen}
            aria-controls="gantt-timeline-panel"
            aria-label={timelineOpen ? 'Collapse timeline' : 'Expand timeline'}
            onClick={() => setTimelineOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setTimelineOpen((o) => !o);
              } else if (e.key === 'ArrowRight' && !timelineOpen) {
                e.preventDefault();
                setTimelineOpen(true);
              } else if (e.key === 'ArrowLeft' && timelineOpen) {
                e.preventDefault();
                setTimelineOpen(false);
              }
            }}
            className={cn(
              'group inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md mt-0.5',
              'text-muted-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.05]',
              'active:bg-black/[0.08] dark:active:bg-white/[0.08]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
          >
            <ChevronRight
              className={cn(
                'size-[14px] shrink-0 stroke-[2] transition-transform duration-150 ease-out',
                'group-hover:text-foreground/85',
                timelineOpen && 'rotate-90',
                'motion-reduce:transition-none'
              )}
              aria-hidden
            />
          </button>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">
              Timeline{' '}
              <span className="font-normal text-muted-foreground">(Click To Expand 🖱️)</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal mt-0.5">
              {lanes.length} department{lanes.length === 1 ? '' : 's'} · {totalDays} days · click months & weeks in the
              header
            </p>
          </div>
        </div>
        <div className="w-full shrink-0 sm:w-auto sm:max-w-[280px] sm:pt-0.5">{deptFilterTrigger}</div>
      </CardHeader>
      {timelineOpen && (
        <CardContent id="gantt-timeline-panel" role="region" aria-labelledby="gantt-timeline-trigger" className="p-0">
          <div className="overflow-x-auto">
            <div style={{ width: labelColW + timelineWidth }} className="min-w-full">
              <div className="flex border-b bg-muted/40">
                <div
                  className="shrink-0 border-r px-2 py-1 text-xs font-medium text-muted-foreground flex items-end pb-1"
                  style={{ width: labelColW }}
                >
                  Department
                </div>
                <div
                  className="relative flex flex-row shrink-0 border-l border-border/40 bg-muted/20"
                  style={{ width: timelineWidth, minHeight: headerBlockHeight }}
                >
                  {monthColumns.map((mc) => (
                    <div
                      key={mc.mk}
                      className="flex shrink-0 flex-col border-l border-primary/25"
                      style={{ width: mc.widthPx }}
                    >
                      <button
                        type="button"
                        id={`gantt-month-trigger-${mc.mk}`}
                        aria-expanded={mc.expanded}
                        aria-controls={`gantt-month-${mc.mk}-weeks`}
                        title={mc.expanded ? 'Collapse weeks' : 'Expand weeks'}
                        onClick={() => toggleMonth(mc.mStart)}
                        onKeyDown={monthHeaderKeyDown(mc.mStart, mc.expanded)}
                        className={cn(
                          'group relative flex min-h-9 w-full items-center justify-center px-1.5 py-1 rounded-md',
                          'text-[9px] font-semibold leading-snug sm:text-[10px]',
                          'hover:bg-black/[0.05] dark:hover:bg-white/[0.05]',
                          'active:bg-black/[0.08] dark:active:bg-white/[0.08]',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                          mc.expanded ? 'bg-primary/10 text-foreground' : 'bg-transparent text-muted-foreground',
                          monthKey(today) === mc.mk && 'ring-1 ring-inset ring-primary/40'
                        )}
                      >
                        <span
                          className="absolute left-1 top-1/2 z-10 inline-flex h-7 min-w-[28px] -translate-y-1/2 items-center justify-center rounded-md"
                          aria-hidden
                        >
                          <ExpandChevron expanded={mc.expanded} />
                        </span>
                        <span className="block w-full max-w-full pl-8 pr-1.5 text-center leading-tight text-balance whitespace-normal break-words [overflow-wrap:anywhere]">
                          {format(mc.mStart, 'MMM yyyy')}
                        </span>
                      </button>
                      {showWeekRow && (
                        <div
                          id={`gantt-month-${mc.mk}-weeks`}
                          role="region"
                          aria-labelledby={`gantt-month-trigger-${mc.mk}`}
                          className="flex min-h-8 flex-row border-t border-border/40 bg-background/80"
                        >
                          {mc.expanded ? (
                            mc.weeks.map((w) => (
                              <div
                                key={w.wk}
                                className="flex shrink-0 flex-col border-l border-border/40"
                                style={{ width: w.widthPx }}
                              >
                                <button
                                  type="button"
                                  id={`gantt-week-trigger-${w.wk}`}
                                  aria-expanded={w.expanded}
                                  aria-controls={`gantt-week-${w.wk}-days`}
                                  title={
                                    (w.expanded ? 'Hide days. ' : 'Show days. ') +
                                    monthChunkRangeLabel(w.weekStart)
                                  }
                                  onClick={(e) => toggleWeek(w.weekStart, e)}
                                  onKeyDown={weekHeaderKeyDown(w.weekStart, w.expanded)}
                                  className={cn(
                                    'group relative flex min-h-[28px] w-full items-center justify-center px-1 py-0.5 rounded-md',
                                    'text-[8px] font-semibold tabular-nums sm:text-[9px]',
                                    'hover:bg-black/[0.05] dark:hover:bg-white/[0.05]',
                                    'active:bg-black/[0.08] dark:active:bg-white/[0.08]',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                                    w.expanded
                                      ? 'bg-accent/45 text-foreground'
                                      : 'bg-transparent text-muted-foreground',
                                    w.wk === weekChunkKeyFromDate(today) && 'ring-1 ring-inset ring-sky-500/45'
                                  )}
                                >
                                  <span
                                    className="absolute left-0.5 top-1/2 z-10 inline-flex h-7 min-w-[26px] -translate-y-1/2 items-center justify-center rounded-md"
                                    aria-hidden
                                  >
                                    <ExpandChevron expanded={w.expanded} />
                                  </span>
                                  <span className="w-full max-w-full px-6 text-center leading-tight whitespace-normal">
                                    {w.label}
                                  </span>
                                </button>
                                {showDayRow && (
                                  <div
                                    id={`gantt-week-${w.wk}-days`}
                                    role="region"
                                    aria-labelledby={`gantt-week-trigger-${w.wk}`}
                                    className="flex min-h-12 flex-row border-t border-border/30 bg-card/95"
                                  >
                                    {w.expanded ? (
                                      w.days.map((d) => {
                                        const isToday = startOfDay(d).getTime() === today.getTime();
                                        return (
                                          <div
                                            key={d.getTime()}
                                            className={cn(
                                              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-r border-border/35 px-0.5 py-1 text-center',
                                              isToday &&
                                                'bg-sky-500/20 font-semibold text-sky-950 dark:bg-sky-950/40 dark:text-sky-50'
                                            )}
                                            style={{ minWidth: DAY_EXPANDED_PX - 2 }}
                                          >
                                            <span className="text-[8px] font-semibold leading-none sm:text-[9px]">
                                              {format(d, 'EEE')}
                                            </span>
                                            <span className="text-[8px] tabular-nums text-muted-foreground sm:text-[9px]">
                                              {format(d, 'd')}
                                            </span>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="h-12 w-full bg-muted/10" />
                                    )}
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="h-8 w-full bg-muted/10" />
                          )}
                        </div>
                      )}
                      {showDayRow && !mc.expanded && (
                        <div className="h-12 w-full border-t border-transparent bg-muted/5" aria-hidden />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {lanes.map((lane) => {
                let laneBars = datedBars.filter((b) => b.dept === lane);
                laneBars = [...laneBars].sort(
                  (a, b) => rowSortKey(a.row) - rowSortKey(b.row) || a.row.id - b.row.id
                );
                const rowH = showDayRow ? 32 : showWeekRow ? 26 : 24;
                const padTop = 10;
                const laneHeight = Math.max(58, padTop + laneBars.length * rowH + 10);
                return (
                  <div key={lane} className="flex border-b border-border/60" style={{ minHeight: laneHeight }}>
                    <div className="shrink-0 border-r px-2 py-2 text-xs leading-snug" style={{ width: labelColW }}>
                      <div className="font-medium truncate">
                        <BidirectionalText>{departmentNameByCode.get(lane) || lane}</BidirectionalText>
                      </div>
                    </div>
                    <div
                      className="relative shrink-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_calc(100%/12),hsl(var(--border)/0.28)_calc(100%/12),hsl(var(--border)/0.28)_calc(100%/12+1px))]"
                      style={{ width: timelineWidth, minHeight: laneHeight }}
                    >
                      {monthStartsXs.map((leftPx, idx) => (
                        <div
                          key={`grid-${lane}-${idx}`}
                          className="absolute top-0 bottom-0 w-px bg-border/50 pointer-events-none"
                          style={{ left: leftPx }}
                        />
                      ))}
                      {showToday && (
                        <div
                          className="absolute top-0 bottom-0 z-10 w-px bg-rose-500 shadow-[2px_0_8px_rgba(244,63,94,0.35)]"
                          style={{ left: dayStart(today) }}
                          title={`Today ${format(today, 'MMM d, yyyy')}`}
                        />
                      )}
                      <TooltipProvider delayDuration={200}>
                        {laneBars.map((b, idx) => {
                          const { left, width } = barGeometry(b.start, b.end);
                          const st = b.row.status;
                          const endD = b.end;
                          const overdue =
                            st !== 'Completed' && differenceInCalendarDays(today, endD) > 0;
                          const topics = parsePipeList(b.row.associated_strategic_topics)
                            .map((c) => STRATEGIC_TOPIC_LABELS[c as StrategicTopicCode] || c)
                            .join(', ');
                          return (
                            <Tooltip key={`${b.row.id}-${lane}-${idx}`}>
                              <TooltipTrigger asChild>
                                <div
                                  className={cn(
                                    'absolute rounded-md text-[11px] leading-tight px-1.5 py-0.5 overflow-hidden flex items-center shadow-sm border cursor-default',
                                    overdue &&
                                      'bg-red-500/25 border-red-600/70 text-red-950 dark:bg-red-950/35 dark:text-red-50',
                                    !overdue &&
                                      st === 'Completed' &&
                                      'bg-emerald-500/20 border-emerald-600/50 text-emerald-950 dark:text-emerald-100',
                                    !overdue &&
                                      st === 'In Progress' &&
                                      'bg-gradient-to-r from-primary/50 to-primary/25 border-primary/50 text-foreground',
                                    !overdue &&
                                      st === 'On Hold' &&
                                      cn(
                                        'border-dashed border-amber-500/70 bg-amber-500/10 text-amber-950 dark:text-amber-100',
                                        !reduceMotion && 'animate-pulse'
                                      )
                                  )}
                                  style={{
                                    left,
                                    width,
                                    minWidth: 4,
                                    top: padTop + idx * rowH,
                                    height: rowH - 4,
                                  }}
                                >
                                  <span className="truncate font-medium min-w-0">
                                    <BidirectionalText className="truncate">{b.row.activity}</BidirectionalText>
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                align="start"
                                className="max-w-xs border bg-popover px-0 py-0 shadow-lg"
                              >
                                <div className="px-3 pt-3 pb-2">
                                  <div className="font-semibold leading-snug text-foreground text-sm">
                                    <BidirectionalText>{b.row.activity}</BidirectionalText>
                                  </div>
                                </div>
                                <div className="space-y-1.5 border-t border-border/60 bg-muted/30 px-3 py-2.5 text-[11px] text-muted-foreground leading-snug">
                                  {b.row.main_kpi ? (
                                    <div>
                                      <span className="font-medium text-foreground/90">KPI: </span>
                                      <BidirectionalText className="inline">{b.row.main_kpi}</BidirectionalText>
                                    </div>
                                  ) : null}
                                  <div className="tabular-nums">
                                    <span className="font-medium text-foreground/90">Schedule: </span>
                                    {format(b.start, 'PP')} → {format(b.end, 'PP')}
                                  </div>
                                  <div>
                                    <span className="font-medium text-foreground/90">Status: </span>
                                    {st}
                                    {overdue ? (
                                      <span className="ml-1 font-semibold text-red-600 dark:text-red-400">
                                        · Overdue
                                      </span>
                                    ) : null}
                                  </div>
                                  {topics ? (
                                    <div>
                                      <span className="font-medium text-foreground/90">Pillars: </span>
                                      {topics}
                                    </div>
                                  ) : null}
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
      )}
    </Card>
  );

  return (
    <div className={cn('space-y-4', !reduceMotion && entered && 'animate-in fade-in-0 duration-500')}>
      <div>
        <h2 className="text-sm font-semibold leading-tight sm:text-base">Gantt — {topicLabel}</h2>
      </div>

      {datedBars.length === 0 || !min || !max ? (
        <Card className="overflow-hidden border-2 border-border">
          <CardHeader className="flex flex-col gap-3 space-y-0 border-b bg-muted/20 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold">
                Timeline{' '}
                <span className="font-normal text-muted-foreground">(Click To Expand 🖱️)</span>
              </CardTitle>
            </div>
            <div className="w-full shrink-0 sm:w-auto sm:max-w-[280px] sm:pt-0.5">{deptFilterTrigger}</div>
          </CardHeader>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No dated activities yet. Set start and end dates on at least one row with departments assigned.
          </CardContent>
        </Card>
      ) : (
        renderTimelineCard()
      )}

      {unscheduled.length > 0 && (
        <Card className="border-amber-500/25 border-2">
          <Collapsible open={unscheduledOpen} onOpenChange={setUnscheduledOpen}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 py-4 space-y-0">
              <div className="space-y-1 min-w-0">
                <CardTitle className="text-base">Unscheduled</CardTitle>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">{unscheduled.length}</span>
                  {' · '}
                  activities need start and end dates in Table KPI before they appear on the timeline.
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="group shrink-0 gap-2 rounded-md hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                >
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-transform duration-150 ease-out text-muted-foreground',
                      unscheduledOpen && 'rotate-90',
                      'motion-reduce:transition-none'
                    )}
                    aria-hidden
                  />
                  {unscheduledOpen ? 'Hide list' : 'View activity list'}
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
                        className="rounded-md border border-border/60 bg-card px-3 py-2 leading-snug text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          <span className="tabular-nums text-xs text-muted-foreground mr-2">#{r.id}</span>
                          <BidirectionalText>
                            {r.activity.length > 220 ? `${r.activity.slice(0, 220)}…` : r.activity}
                          </BidirectionalText>
                        </span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
                <p className="text-xs text-muted-foreground mt-3">
                  Add start and end dates in the Table KPI tab to show these on the timeline.
                </p>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}
