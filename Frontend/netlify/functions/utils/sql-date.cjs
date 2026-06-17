/**
 * SQL Server DATE read/write helpers — avoid UTC day-shift in JSON responses.
 */

function formatDateOut(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function parseDateField(raw) {
  if (raw === '' || raw == null || raw === undefined) return null;
  const s = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const err = new Error('Invalid date format (YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }
  return s;
}

function sqlDateFromRow(raw) {
  if (raw == null || raw === '') return null;
  return parseDateField(formatDateOut(raw) || String(raw).slice(0, 10));
}

module.exports = {
  formatDateOut,
  parseDateField,
  sqlDateFromRow,
};
