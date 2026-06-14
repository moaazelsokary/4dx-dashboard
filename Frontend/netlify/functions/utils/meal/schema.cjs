/**
 * Column schema matching — port of volunteer_upload_schema.py
 */

const columnAliases = require('./column_aliases.json');
const defaultSchema = require('./volunteer_validation_schema.json');

const SERVICE_PRODUCT_ALIASES = [
  'Product', 'service', 'service type', 'product', 'type', 'product name', 'service name',
  'الخدمه', 'الخدمة', 'خدمة', 'خدمه', 'نوع الخدمه', 'نوع الخدمة', 'اسم الخدمه', 'اسم الخدمة',
  'المنتج', 'منتج', 'نوع المنتج', 'اسم المنتج', 'صنف', 'البند', 'بند الخدمة', 'بند الخدمه',
  'Service 1', 'Service 1 - الخدمة الاولي', 'Service 1 - الخدمة الأولى',
];

const SERVICE_AMOUNT_ALIASES = [
  'Actual Amount', 'actual amount', 'amount', 'cost', 'paid amount', 'actual_amount',
  'قيمه الدعم', 'قيمة الدعم', 'المبلغ', 'المبلغ الفعلي', 'اجمالي الدعم', 'إجمالي الدعم',
  'Amount', 'Amount - تكلفة التنفيذ',
];

const SERVICE_ACTUAL_DATE_ALIASES = [
  'Actual Date', 'end date', 'implementation date', 'service actual date', 'actual_date',
  'تاريخ التنفيذ الفعلي', 'تاريخ التنفيذ', 'التاريخ الفعلي', 'Actual Date - تاريخ التنفيذ',
];

const SERVICE_EXPECTED_DATE_ALIASES = [
  'Expected Date', 'start date', 'planned date', 'service expected date', 'expected_date',
  'تاريخ التنفيذ المتوقع', 'التاريخ المتوقع', 'تاريخ متوقع',
];

function normalizeColumnName(colName) {
  if (colName == null || (typeof colName === 'number' && Number.isNaN(colName))) return '';
  let normalized = String(colName).trim().toLowerCase();
  normalized = normalized.replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا');
  normalized = normalized.replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه');
  normalized = normalized.replace(/[^\w\s/]/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function uniquePreserve(seq) {
  const seen = new Set();
  const out = [];
  for (const x of seq) {
    if (!x || !String(x).trim()) continue;
    const s = String(x).trim();
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function loadVolunteerSchema(schemaPath) {
  if (schemaPath) {
    try {
      const data = require(schemaPath);
      if (!data.columns) return { columns: [], merge_column_aliases_json: false };
      return data;
    } catch {
      return { columns: [], merge_column_aliases_json: false };
    }
  }
  return defaultSchema;
}

function aliasIndicatesPersonalOrIndividualId(n, s) {
  if (s.includes('الرقم الشخصي') || n.includes('الرقم الشخصي') || s.includes('الرقم الشخصى')) return true;
  if (n.includes('individual') || n.includes('personal identification') || n.includes('personal id')) return true;
  if (n.split(/\s+/).includes('pid')) return true;
  if (n.includes('id number') || n.includes('رقم الهويه') || n.includes('رقم الهوية')) return true;
  if (s.includes('رقم شخصي') || n.includes('رقم شخصي')) return true;
  return false;
}

function aliasStronglyPassport(label) {
  if (!label || label == null) return false;
  const s = String(label);
  const n = normalizeColumnName(s);
  const hasPassportWord = n.includes('passport') || s.includes('باسبور') || s.includes('جواز');
  if (!hasPassportWord) return false;
  if (aliasIndicatesPersonalOrIndividualId(n, s)) return false;
  return true;
}

function expandColumnDef(colDef, columnAliasesRoot) {
  const names = [...(colDef.match_names || [])];
  const sid = colDef.id;
  let keys = colDef.merge_aliases_from_json_keys || [];
  if (colDef.merge_aliases_from_json_keys == null && columnAliasesRoot) {
    const single = colDef.merge_aliases_from_json_key;
    if (single) keys = [single];
  }

  for (const k of keys) {
    const extra = columnAliasesRoot[k];
    if (Array.isArray(extra)) {
      for (const x of extra) {
        const xs = String(x);
        if (
          (sid === 'individual_id' || sid === 'personal_identification_number') &&
          aliasStronglyPassport(xs)
        ) {
          continue;
        }
        names.push(xs);
      }
    }
  }

  if (sid === 'service_1') names.push(...SERVICE_PRODUCT_ALIASES);
  else if (sid === 'amount') names.push(...SERVICE_AMOUNT_ALIASES);
  else if (sid === 'actual_date') names.push(...SERVICE_ACTUAL_DATE_ALIASES);
  else if (sid === 'expected_date') names.push(...SERVICE_EXPECTED_DATE_ALIASES);

  const official = colDef.official_header || (names[0] || '');
  if (official && !names.includes(official)) names.unshift(official);

  return { ...colDef, match_names: uniquePreserve(names), official_header: official };
}

function prepareSchema(schema) {
  const mergeRoot = schema.merge_column_aliases_json !== false ? columnAliases : {};
  const columns = [];
  for (const c of schema.columns || []) {
    if (c && typeof c === 'object') columns.push(expandColumnDef({ ...c }, mergeRoot));
  }
  return columns;
}

/**
 * @param {{ rows: Record<string, string|null>[], columns: string[] }} frame
 * @param {string} [schemaPath]
 */
function applyVolunteerColumnSchema(frame, schemaPath) {
  const schema = loadVolunteerSchema(schemaPath);
  const columnDefs = prepareSchema(schema);

  if (!columnDefs.length) {
    return { frame: { rows: frame.rows.map((r) => ({ ...r })), columns: [...frame.columns] }, missing: [], meta: { rename_map: {}, skipped: true } };
  }

  const renameMap = {};
  const takenCols = new Set();

  for (const colDef of columnDefs) {
    const official = colDef.official_header || '';
    if (!official) continue;
    const aliasNorms = new Set(
      (colDef.match_names || []).map(normalizeColumnName).filter((x) => x)
    );

    let matchedCol = null;
    for (const col of frame.columns) {
      if (takenCols.has(col)) continue;
      if (aliasNorms.has(normalizeColumnName(col))) {
        matchedCol = col;
        break;
      }
    }

    if (matchedCol != null) {
      takenCols.add(matchedCol);
      if (matchedCol !== official) renameMap[matchedCol] = official;
    }
  }

  const renamedRows = frame.rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      const nk = renameMap[k] || k;
      out[nk] = v;
    }
    return out;
  });

  const newColumns = frame.columns.map((c) => renameMap[c] || c);
  const uniqueCols = [...new Set(newColumns)];

  const missing = [];
  for (const colDef of columnDefs) {
    if (!colDef.required) continue;
    const official = colDef.official_header || '';
    if (!official) continue;
    const hasCol = uniqueCols.includes(official) || renamedRows.some((r) => official in r);
    if (!hasCol) {
      missing.push({
        field_id: colDef.id || '',
        official_header: official,
        labels_ar: colDef.labels_ar || official,
        labels_en: colDef.labels_en || official,
        match_names_sample: (colDef.match_names || []).slice(0, 8),
      });
    }
  }

  const meta = {
    rename_map: renameMap,
    original_columns: [...frame.columns],
    columns_after_rename: uniqueCols,
    schema_path: schemaPath || 'bundled',
  };

  return {
    frame: { rows: renamedRows, columns: uniqueCols },
    missing,
    meta,
  };
}

module.exports = {
  normalizeColumnName,
  loadVolunteerSchema,
  prepareSchema,
  applyVolunteerColumnSchema,
};
