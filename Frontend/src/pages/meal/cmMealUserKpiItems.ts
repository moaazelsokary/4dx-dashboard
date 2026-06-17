import type { CmMealUserKpiItem, CmMealUserKpiRow } from '@/types/wig';

export function getKpiItems(row: CmMealUserKpiRow): CmMealUserKpiItem[] {
  if (row.kpi_items?.length) return row.kpi_items;
  const kpi = row.kpi?.trim();
  if (!kpi) return [];
  return [
    {
      kpi,
      target: row.target ?? null,
      actual: row.actual ?? null,
      notes: row.notes?.trim() || null,
    },
  ];
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function itemDifference(item: CmMealUserKpiItem): number | null {
  if (item.target == null || item.actual == null) return null;
  return item.target - item.actual;
}

export function rowSearchText(row: CmMealUserKpiRow): string {
  const items = getKpiItems(row);
  return [
    row.username,
    row.activity,
    row.start_date,
    row.end_date,
    ...items.flatMap((i) => [i.kpi, i.notes, i.target, i.actual]),
  ]
    .join(' ')
    .toLowerCase();
}
