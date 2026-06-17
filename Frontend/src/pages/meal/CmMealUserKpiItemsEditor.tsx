import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TableCell } from '@/components/ui/table';
import BidirectionalText from '@/components/ui/BidirectionalText';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';
import type { CmMealUserKpiItem } from '@/types/wig';
import { formatNumber } from './cmMealUserKpiItems';
import {
  AlignedStack,
  HorizontalIndent,
  NestedTreeItemCard,
} from './cmMealNestedTree';

export type DraftKpiItem = {
  kpi: string;
  target: string;
  actual: string;
  notes: string;
};

export function emptyDraftKpiItem(): DraftKpiItem {
  return { kpi: '', target: '', actual: '', notes: '' };
}

export function draftItemsFromRow(items: CmMealUserKpiItem[]): DraftKpiItem[] {
  if (!items.length) return [emptyDraftKpiItem()];
  return items.map((item) => ({
    kpi: item.kpi,
    target: item.target == null ? '' : String(item.target),
    actual: item.actual == null ? '' : String(item.actual),
    notes: item.notes ?? '',
  }));
}

export function parseDraftKpiItems(items: DraftKpiItem[]): CmMealUserKpiItem[] | { error: string } {
  const out: CmMealUserKpiItem[] = [];
  for (const item of items) {
    const kpi = item.kpi.trim();
    if (!kpi) continue;
    const target = item.target.trim() === '' ? null : Number(item.target);
    const actual = item.actual.trim() === '' ? null : Number(item.actual);
    if (item.target.trim() !== '' && Number.isNaN(target)) {
      return { error: 'Target must be a number' };
    }
    if (item.actual.trim() !== '' && Number.isNaN(actual)) {
      return { error: 'Actual must be a number' };
    }
    out.push({
      kpi,
      target,
      actual,
      notes: item.notes.trim() || null,
    });
  }
  if (!out.length) return { error: 'At least one KPI is required' };
  return out;
}

export function KpiItemsTableCells({
  items,
  columnWidths,
  colWidthStyle,
}: {
  items: CmMealUserKpiItem[];
  columnWidths: { kpi: number; target: number; actual: number; notes: number };
  colWidthStyle: (width: number) => CSSProperties;
}) {
  const count = items.length;
  const cellClass = 'align-top border-r border-border/50 text-xs py-2';

  const kpiBody = !count ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <div className="space-y-2 py-0.5">
      {items.map((item, idx) => (
        <HorizontalIndent key={`${item.kpi}-${idx}`}>
          <NestedTreeItemCard>
            <p className="text-xs font-medium leading-snug text-foreground">
              <BidirectionalText>{item.kpi}</BidirectionalText>
            </p>
          </NestedTreeItemCard>
        </HorizontalIndent>
      ))}
    </div>
  );

  return (
    <>
      <TableCell className={cellClass} style={colWidthStyle(columnWidths.kpi)}>
        {kpiBody}
      </TableCell>
      <TableCell className={cn(cellClass, 'tabular-nums')} style={colWidthStyle(columnWidths.target)}>
        <AlignedStack count={count} render={(idx) => formatNumber(items[idx].target)} />
      </TableCell>
      <TableCell className={cn(cellClass, 'tabular-nums')} style={colWidthStyle(columnWidths.actual)}>
        <AlignedStack count={count} render={(idx) => formatNumber(items[idx].actual)} />
      </TableCell>
      <TableCell className={cellClass} style={colWidthStyle(columnWidths.notes)}>
        <AlignedStack
          count={count}
          render={(idx) => {
            const notes = items[idx].notes?.trim();
            return notes ? (
              <BidirectionalText className="whitespace-normal break-words text-foreground">
                {notes}
              </BidirectionalText>
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          }}
        />
      </TableCell>
    </>
  );
}

export function KpiItemsEditor({
  items,
  onChange,
}: {
  items: DraftKpiItem[];
  onChange: (next: DraftKpiItem[]) => void;
}) {
  const add = () => onChange([...items, emptyDraftKpiItem()]);
  const update = (index: number, patch: Partial<DraftKpiItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">KPIs</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
          <Plus className="h-3 w-3 mr-1" />
          Add KPI
        </Button>
      </div>
      {items.map((item, index) => (
        <div key={index} className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">KPI {index + 1}</span>
            {items.length > 1 ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => remove(index)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">KPI</Label>
            <Input
              className="h-8 text-xs"
              value={item.kpi}
              placeholder="Enter KPI"
              onChange={(e) => update(index, { kpi: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Target</Label>
              <Input
                className="h-8 text-xs"
                inputMode="decimal"
                value={item.target}
                onChange={(e) => update(index, { target: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Actual</Label>
              <Input
                className="h-8 text-xs"
                inputMode="decimal"
                value={item.actual}
                onChange={(e) => update(index, { actual: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              className="text-xs"
              value={item.notes}
              onChange={(e) => update(index, { notes: e.target.value })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
