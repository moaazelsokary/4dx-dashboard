import { Fragment, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import type { RbServiceRow } from '@/types/beneficiaries';
import { normStr } from '@/services/beneficiariesService';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

const COLS_PER_ROW = 3;

function safeDateLabel(v: unknown): string | null {
  if (v == null) return null;
  try {
    const d = parseISO(String(v).slice(0, 19));
    if (Number.isNaN(d.getTime())) return null;
    return format(d, 'MMM d, yyyy');
  } catch {
    return null;
  }
}

function serviceStepTiming(s: RbServiceRow): {
  label: string;
  date: string | null;
  note?: string;
} {
  const fb = String(s.fb || '')
    .trim()
    .toLowerCase();
  if (fb === 'done' || fb.includes('done')) {
    return { label: 'actual date', date: safeDateLabel(s.ad) };
  }
  if (fb === 'draft') {
    const expected = safeDateLabel(s.ed);
    return {
      label: 'creation date',
      date: safeDateLabel(s.cd),
      note: expected ? `expected date: ${expected}` : undefined,
    };
  }
  const lastEdit = safeDateLabel(s.lu);
  if (lastEdit) {
    return { label: 'last edit', date: lastEdit };
  }
  return { label: 'creation date', date: safeDateLabel(s.cd) };
}

function feedbackTone(fb: string | null | undefined): string {
  const f = String(fb || '').toLowerCase();
  if (f.includes('done')) return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30';
  if (f.includes('draft')) return 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/30';
  if (f.includes('cancel') || f.includes('reject')) return 'bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/25';
  return 'bg-primary/10 text-primary border-primary/25';
}

function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function StepBadge({ index }: { index: number }) {
  return (
    <span className="absolute -top-2 -start-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md ring-2 ring-background">
      {index + 1}
    </span>
  );
}

function JourneyCard({ step, index }: { step: RbServiceRow; index: number }) {
  const { label, date, note } = serviceStepTiming(step);
  const title = normStr(step.fb) || '—';
  const subtitle = [normStr(step.cat), normStr(step.pn)].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        'relative flex-1 min-w-0 rounded-xl border border-border/50 bg-gradient-to-br from-card via-card/95 to-primary/[0.06]',
        'p-3 shadow-sm backdrop-blur-[2px] transition-all hover:shadow-md hover:border-primary/35',
        'ring-1 ring-inset ring-white/10 dark:ring-white/5'
      )}
      dir="auto"
    >
      <StepBadge index={index} />
      <span
        className={cn(
          'inline-flex mt-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          feedbackTone(step.fb)
        )}
      >
        {title}
      </span>
      {subtitle ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground line-clamp-2">{subtitle}</p>
      ) : null}
      <p className="mt-2 text-[10px] font-medium text-foreground/85">
        {date ? (
          <>
            <span className="text-muted-foreground">{label}: </span>
            {date}
          </>
        ) : (
          '—'
        )}
      </p>
      {note ? <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">{note}</p> : null}
    </div>
  );
}

function BetweenCardsArrow({ rowRtl }: { rowRtl: boolean }) {
  const Icon = rowRtl ? ArrowLeft : ArrowRight;
  return (
    <div className="flex w-9 shrink-0 items-center justify-center self-center py-6" aria-hidden>
      <Icon className="h-5 w-5 text-primary/85" strokeWidth={2.25} />
    </div>
  );
}

function RowTurnArrow({ align }: { align: 'start' | 'end' }) {
  return (
    <div
      className={cn(
        'flex w-full py-1',
        align === 'start' ? 'justify-start' : 'justify-end'
      )}
      aria-hidden
    >
      <div className="flex w-[calc(33.333%-0.5rem)] min-w-[5.5rem] max-w-[12rem] items-center justify-center">
        <ArrowDown className="h-5 w-5 text-primary/85" strokeWidth={2.25} />
      </div>
    </div>
  );
}

export function SerpentineServiceJourney({ services }: { services: RbServiceRow[] }) {
  const steps = useMemo(() => {
    return [...services].sort((a, b) => {
      const da = serviceStepTiming(a).date;
      const db = serviceStepTiming(b).date;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    });
  }, [services]);

  const rows = useMemo(() => chunkRows(steps, COLS_PER_ROW), [steps]);

  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">No services on this journey yet.</p>;
  }

  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-border/40 bg-gradient-to-b from-muted/25 to-muted/10 p-3 sm:p-4">
      <div className="space-y-2">
        {rows.map((rowSteps, rowIdx) => {
          const rowRtl = rowIdx % 2 === 1;
          const isLastRow = rowIdx === rows.length - 1;
          const globalStart = rowIdx * COLS_PER_ROW;
          /** Snake turn: even rows exit right; odd rows exit left (journey still 4→5→6 left-to-right in data). */
          const turnAlign: 'start' | 'end' = rowRtl ? 'start' : 'end';

          return (
            <Fragment key={rowIdx}>
              <div
                className={cn('flex w-full items-stretch gap-0', rowRtl && 'flex-row-reverse')}
              >
                {rowSteps.map((step, colIdx) => {
                  const globalIndex = globalStart + colIdx;
                  const isLastInRow = colIdx === rowSteps.length - 1;
                  return (
                    <Fragment key={step.sid}>
                      <JourneyCard step={step} index={globalIndex} />
                      {!isLastInRow ? <BetweenCardsArrow rowRtl={rowRtl} /> : null}
                    </Fragment>
                  );
                })}
              </div>
              {!isLastRow ? <RowTurnArrow align={turnAlign} /> : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
