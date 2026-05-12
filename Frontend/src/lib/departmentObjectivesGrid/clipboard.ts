/** Excel / Sheets paste: rows separated by newline, cells by tab */
export function parseClipboardGrid(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.trim()) return [];
  return normalized.split('\n').map((line) => line.split('\t'));
}

export function serializeSelectionTsv(rows: string[][]): string {
  return rows.map((r) => r.join('\t')).join('\n');
}
