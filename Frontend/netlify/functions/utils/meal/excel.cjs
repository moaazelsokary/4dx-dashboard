/**
 * Excel buffer → string-typed row frames (pandas read_excel dtype=str parity).
 */

const XLSX = require('xlsx');

/** @typedef {{ rows: Record<string, string|null>[], columns: string[] }} Frame */

function isBlankRaw(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === '' || s === 'nan' || s === 'none';
  }
  return false;
}

/**
 * Convert a SheetJS cell value to a trimmed string (or null if blank).
 * Mirrors pandas dtype=str: integers without .0, dates as ISO date strings.
 */
function cellToString(val, cell) {
  if (val === null || val === undefined) return null;

  if (typeof val === 'number') {
    if (cell && cell.t === 'd') {
      const d = XLSX.SSF.parse_date_code(val);
      if (d) {
        const y = d.y;
        const m = String(d.m).padStart(2, '0');
        const day = String(d.d).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
    if (Number.isInteger(val) || Math.abs(val - Math.round(val)) < 1e-9) {
      return String(Math.round(val));
    }
    return String(val);
  }

  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'nan' || s.toLowerCase() === 'none') return null;
  return s;
}

function readWorkbook(buffer) {
  return XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: false });
}

function listSheetNames(buffer) {
  const wb = readWorkbook(buffer);
  return wb.SheetNames.slice();
}

/**
 * Read one sheet into a Frame (header row = first row).
 * @param {Buffer} buffer
 * @param {string} [sheetName]
 * @param {{ maxRows?: number }} [opts]
 * @returns {Frame}
 */
function readSheetAsFrame(buffer, sheetName, opts = {}) {
  const wb = readWorkbook(buffer);
  const name = sheetName || wb.SheetNames[0];
  if (!name) return { rows: [], columns: [] };

  const ws = wb.Sheets[name];
  if (!ws) return { rows: [], columns: [] };

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const maxRow = opts.maxRows != null ? Math.min(range.e.r, range.s.r + opts.maxRows) : range.e.r;

  const headerRow = range.s.r;
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    const cell = ws[addr];
    const raw = cell ? cell.v : null;
    const label = cellToString(raw, cell);
    headers.push(label != null ? label : `Column${c + 1}`);
  }

  const columns = [...headers];
  const rows = [];

  for (let r = headerRow + 1; r <= maxRow; r++) {
    const row = {};
    let hasData = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const colName = headers[c - range.s.c];
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      const raw = cell ? cell.v : null;
      const str = cellToString(raw, cell);
      row[colName] = str;
      if (str != null) hasData = true;
    }
    if (hasData || r <= headerRow + 1) {
      rows.push(row);
    }
  }

  return { rows, columns };
}

/**
 * Probe first N rows of each sheet (for format detection).
 */
function probeSheet(buffer, sheetName, nrows = 12) {
  return readSheetAsFrame(buffer, sheetName, { maxRows: nrows });
}

module.exports = {
  readWorkbook,
  listSheetNames,
  readSheetAsFrame,
  probeSheet,
  cellToString,
  isBlankRaw,
};
