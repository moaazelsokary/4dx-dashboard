export type ExcelSheetPreview = {
  name: string;
  rows: string[][];
  truncated: boolean;
};

export type ExcelPreviewData = {
  sheets: ExcelSheetPreview[];
};

const MAX_PREVIEW_ROWS = 500;
const MAX_PREVIEW_COLS = 40;

export async function parseExcelBlob(blob: Blob): Promise<ExcelPreviewData> {
  const XLSX = await import('xlsx');
  const buffer = await blob.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    let truncated = false;
    const rows: string[][] = [];

    for (let r = 0; r < raw.length && r < MAX_PREVIEW_ROWS; r++) {
      const row = raw[r] ?? [];
      if (row.length > MAX_PREVIEW_COLS) truncated = true;
      rows.push(
        row.slice(0, MAX_PREVIEW_COLS).map((cell) => (cell == null ? '' : String(cell)))
      );
    }

    if (raw.length > MAX_PREVIEW_ROWS) truncated = true;

    return { name, rows, truncated };
  });

  return { sheets };
}

export function isExcelFile(mimeType?: string | null, filename?: string | null): boolean {
  const mime = (mimeType || '').toLowerCase();
  const ext = (filename || '').split('.').pop()?.toLowerCase() ?? '';
  return (
    mime.includes('excel') ||
    mime.includes('spreadsheet') ||
    mime === 'application/vnd.ms-excel' ||
    ext === 'xls' ||
    ext === 'xlsx'
  );
}
