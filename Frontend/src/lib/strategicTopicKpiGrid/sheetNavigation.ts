import type { StTopicGridColumn } from './types';
import type { StTopicSheetCellAddress } from './types';

export function stTopicTabMove(
  anchor: StTopicSheetCellAddress,
  rowIds: readonly number[],
  columns: readonly StTopicGridColumn[],
  shiftKey: boolean
): StTopicSheetCellAddress | null {
  const ri = rowIds.indexOf(anchor.rowId);
  const ci = columns.indexOf(anchor.column);
  if (ri < 0 || ci < 0) return null;

  if (!shiftKey) {
    if (ci < columns.length - 1) return { rowId: rowIds[ri], column: columns[ci + 1] };
    if (ri < rowIds.length - 1) return { rowId: rowIds[ri + 1], column: columns[0] };
    return null;
  }
  if (ci > 0) return { rowId: rowIds[ri], column: columns[ci - 1] };
  if (ri > 0) return { rowId: rowIds[ri - 1], column: columns[columns.length - 1] };
  return null;
}

export function stTopicArrowMove(
  anchor: StTopicSheetCellAddress,
  dir: 'up' | 'down' | 'left' | 'right',
  rowIds: readonly number[],
  columns: readonly StTopicGridColumn[]
): StTopicSheetCellAddress | null {
  const ri = rowIds.indexOf(anchor.rowId);
  const ci = columns.indexOf(anchor.column);
  if (ri < 0 || ci < 0) return null;
  let nr = ri;
  let nc = ci;
  if (dir === 'up') nr--;
  if (dir === 'down') nr++;
  if (dir === 'left') nc--;
  if (dir === 'right') nc++;
  if (nr < 0 || nr >= rowIds.length || nc < 0 || nc >= columns.length) return null;
  return { rowId: rowIds[nr], column: columns[nc] };
}

export function stTopicEnterMoveDown(
  anchor: StTopicSheetCellAddress,
  rowIds: readonly number[],
  columns: readonly StTopicGridColumn[]
): StTopicSheetCellAddress | null {
  return stTopicArrowMove(anchor, 'down', rowIds, columns);
}
