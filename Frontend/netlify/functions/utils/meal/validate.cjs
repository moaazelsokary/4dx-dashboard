/**
 * MEAL volunteer upload validation — Node port of volunteer_upload_validation.py
 */

const { readSheetAsFrame, listSheetNames, probeSheet } = require('./excel.cjs');
const { applyVolunteerColumnSchema } = require('./schema.cjs');
const {
  looksLikeNrcWideCasePlusService,
  splitNrcCashAssistanceWide,
  loadCasesAndServicesFrames,
} = require('./splitSheet.cjs');

const VALIDATION_ENGINE_VERSION = '2026-06-08-node-port-v1';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function cleanId(x) {
  if (x == null) return null;
  return String(x).trim().replace(/\.0$/, '').replace(/ /g, '');
}

function isBlank(val) {
  if (val == null) return true;
  const s = String(val).trim().toLowerCase();
  return s === '' || s === 'nan' || s === 'none';
}

function parsePositiveAmount(val) {
  if (isBlank(val)) return [null, 'empty'];
  const s = String(val)
    .trim()
    .replace(/,/g, '')
    .replace(/٬/g, '')
    .replace(/\u00a0/g, '');
  const num = Number(s);
  if (Number.isNaN(num)) return [null, 'invalid'];
  if (num <= 0) return [num, 'not_positive'];
  return [num, 'ok'];
}

function parseDateCell(val) {
  if (isBlank(val)) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;

  const s = String(val).trim();
  // ISO yyyy-mm-dd
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  // dd/mm/yyyy or dd-mm-yyyy (dayfirst)
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(s);
  if (dmy) {
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // mm/dd/yyyy fallback
  const mdy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s);
  if (mdy) {
    const d = new Date(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

function findIsRefugeesColumn(columns) {
  if (columns.includes('IsRefugees')) return 'IsRefugees';
  for (const c of columns) {
    const key = String(c).replace(/ /g, '').replace(/_/g, '').toLowerCase();
    if (key === 'isrefugees' || key === 'isreefuges' || key === 'refugees') return c;
  }
  return null;
}

function classifyIsRefugees(val) {
  if (isBlank(val)) return 'empty';
  const raw = String(val).trim();
  const low = raw.toLowerCase();
  if (['yes', 'y', 'true', '1', 'نعم'].includes(low)) return 'yes';
  if (['no', 'n', 'false', '0', 'لا', 'لأ'].includes(low)) return 'no';
  const ar = raw.replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا').replace(/ى/g, 'ي').trim();
  if (['نعم', 'موافق'].includes(ar)) return 'yes';
  if (['لا', 'لأ', 'لاء'].includes(ar)) return 'no';
  return 'invalid';
}

function phoneIsValidEgyptian(phoneRaw) {
  if (isBlank(phoneRaw)) return [true, null];
  let phone = cleanId(phoneRaw);
  if (!phone) return [true, null];
  if (phone.startsWith('+20')) phone = phone.slice(3);
  if (phone.startsWith('20')) phone = phone.slice(1);
  if (phone.length === 10 && /^\d+$/.test(phone)) phone = '0' + phone;
  if (phone.length === 11 && phone.startsWith('0') && /^\d+$/.test(phone)) return [true, phone];
  return [false, phone];
}

function normHeaderLabel(col) {
  return String(col).trim().toLowerCase().replace(/_/g, ' ');
}

function normalizeValidateMode(mode) {
  const m = (mode || 'both').trim().toLowerCase();
  if (['cases', 'case', 'cases_only', 'cases-only'].includes(m)) return 'cases';
  if (['services', 'service', 'services_only', 'services-only'].includes(m)) return 'services';
  return 'both';
}

// ---------------------------------------------------------------------------
// ValidationIssue
// ---------------------------------------------------------------------------

class ValidationIssue {
  constructor({ severity, code, message_ar, message_en, excel_row, row_index, column, identifiers }) {
    this.severity = severity;
    this.code = code;
    this.message_ar = message_ar;
    this.message_en = message_en;
    this.excel_row = excel_row ?? null;
    this.row_index = row_index ?? null;
    this.column = column ?? null;
    this.identifiers = identifiers || {};
  }

  toDict() {
    return {
      severity: this.severity,
      code: this.code,
      message_ar: this.message_ar,
      message_en: this.message_en,
      excel_row: this.excel_row,
      row_index: this.row_index,
      column: this.column,
      identifiers: this.identifiers,
    };
  }
}

// ---------------------------------------------------------------------------
// Frame normalization
// ---------------------------------------------------------------------------

function normalizeFramesForValidation(casesFrame, servicesFrame, headerRows = 1) {
  const casesRows = casesFrame.rows.map((row, i) => ({
    ...row,
    _excel_row: i + headerRows + 1,
  }));

  let servicesRows = [];
  if (servicesFrame && servicesFrame.rows.length) {
    servicesRows = servicesFrame.rows.map((row, i) => ({
      ...row,
      _excel_row: i + headerRows + 1,
    }));
  }

  return [
    { rows: casesRows, columns: casesFrame.columns },
    { rows: servicesRows, columns: servicesFrame.columns || [] },
  ];
}

// ---------------------------------------------------------------------------
// Column resolvers
// ---------------------------------------------------------------------------

function resolvePersonalIdColumn(columns) {
  if (!columns.length) return null;
  if (columns.includes('personal_identification_number')) return 'personal_identification_number';
  for (const c of columns) {
    if (String(c).startsWith('_')) continue;
    const n = normHeaderLabel(c);
    if (n.includes('passport')) continue;
    if (n.includes('personal identification number')) return c;
    if (n.includes('individual') && n.includes('id')) return c;
    if (n.includes('personal') && n.includes('identification')) return c;
  }
  return null;
}

function resolveNationalIdColumn(columns) {
  if (!columns.length) return null;
  if (columns.includes('national_id')) return 'national_id';
  for (const c of columns) {
    if (String(c).startsWith('_')) continue;
    const sc = String(c);
    if (normHeaderLabel(c).includes('passport')) continue;
    if (sc.includes('قومي')) return c;
    const n = normHeaderLabel(c);
    if (n.includes('nationa id') || (n.includes('national') && n.includes('id') && !n.includes('individual'))) return c;
  }
  return null;
}

function resolvePassportColumn(columns) {
  if (!columns.length) return null;
  if (columns.includes('Passport Number')) return 'Passport Number';
  if (columns.includes('passport_number')) return 'passport_number';
  for (const c of columns) {
    if (String(c).startsWith('_')) continue;
    if (normHeaderLabel(c).includes('passport')) return c;
  }
  return null;
}

function resolvePhoneColumn(columns) {
  if (!columns.length) return null;
  if (columns.includes('phone')) return 'phone';
  for (const c of columns) {
    const sc = String(c);
    if (sc.startsWith('_')) continue;
    if (sc.includes('بديل')) continue;
    const n = normHeaderLabel(c).replace(/-/g, ' ');
    const compact = n.replace(/ /g, '');
    if (compact.includes('phone_alt') || compact.includes('phonenumberalt')) continue;
    if (n.includes('alternate') && n.includes('phone')) continue;
    if (n.includes('phone')) return sc;
  }
  return null;
}

function resolvePhoneAltColumn(columns) {
  if (!columns.length) return null;
  if (columns.includes('phone_alt')) return 'phone_alt';
  for (const c of columns) {
    const sc = String(c);
    if (sc.startsWith('_')) continue;
    const n = normHeaderLabel(c).replace(/-/g, ' ');
    const compact = n.replace(/ /g, '');
    if (sc.includes('بديل') || compact.includes('phone_alt')) return sc;
    if (n.includes('phone') && (n.includes(' alt') || n.endsWith(' alt') || n.includes('alternate'))) return sc;
  }
  return null;
}

function isCaseDemographicColumn(col) {
  const nl = normHeaderLabel(col).replace(/-/g, ' ');
  const compact = nl.replace(/ /g, '');
  if (compact.includes('isrefugees') || nl === 'refugees') return true;
  if (nl.includes('nationality') || col.includes('الجنسية')) return true;
  if (nl.includes('phone') && !nl.includes('product')) return true;
  if (nl.includes('bod') || col.includes('تاريخ الميلاد') || nl.includes('birth')) return true;
  if (nl === 'age' || col.includes('السن')) return true;
  if (nl.includes('gender') || col.includes('النوع الاجتماعي') || nl.includes('social type')) return true;
  if (nl.includes('education') || col.includes('الشهادة')) return true;
  if (nl.includes('social status') || col.includes('الوضع الاجتماعي')) return true;
  if (nl.includes('family member') || col.includes('افراد الاسرة') || col.includes('أفراد الاسرة')) return true;
  if (nl === 'state' || col.includes('المحافظة')) return true;
  if (nl === 'zone' || col.includes('المدينة')) return true;
  if (nl.includes('street') || col.includes('العنوان')) return true;
  if (nl === 'name' || col.trim().toLowerCase() === 'name') return true;
  return false;
}

function isServiceColumn(col) {
  const nl = normHeaderLabel(col).replace(/-/g, ' ');
  if (['Product', 'Actual Amount', 'Actual Date', 'Expected Date'].includes(col)) return true;
  if (nl.includes('product') && !nl.includes('category')) return true;
  if (nl.includes('actual amount') || nl.includes('expected amount')) return true;
  if (nl.includes('actual date') || nl.includes('expected date')) return true;
  if (nl.includes('service') && nl.includes('product')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Null / duplicate helpers
// ---------------------------------------------------------------------------

function seriesBlankMask(rows, col) {
  return rows.map((r) => isBlank(r[col]));
}

function columnNullDetails(rows, maxSampleRows = 45) {
  if (!rows.length) return [];
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => c !== '_excel_row');
  const out = [];
  for (const col of columns) {
    const mask = seriesBlankMask(rows, col);
    const blankRows = rows.filter((_, i) => mask[i]).map((r) => r._excel_row);
    const n = blankRows.length;
    if (n === 0) continue;
    const sorted = [...new Set(blankRows)].sort((a, b) => a - b);
    out.push({
      column: col,
      blank_count: n,
      excel_rows_all: sorted,
      excel_rows_sample: sorted.slice(0, maxSampleRows),
      truncated: sorted.length > maxSampleRows,
    });
  }
  out.sort((a, b) => b.blank_count - a.blank_count || String(a.column).localeCompare(String(b.column)));
  return out;
}

function duplicateCleanedValuesInColumn(rows, col, maxGroups = 80) {
  if (!rows.length || !col) return [[], col];
  const positionsByVal = {};
  rows.forEach((row, pos) => {
    const vid = cleanId(row[col]);
    if (!vid) return;
    if (!positionsByVal[vid]) positionsByVal[vid] = [];
    positionsByVal[vid].push(pos);
  });
  const details = [];
  for (const [vid, positions] of Object.entries(positionsByVal)) {
    if (positions.length < 2) continue;
    const excelRows = [...new Set(positions.map((p) => rows[p]._excel_row))].sort((a, b) => a - b);
    details.push({ value: vid, occurrences: positions.length, excel_rows: excelRows });
  }
  details.sort((a, b) => b.occurrences - a.occurrences || a.value.localeCompare(b.value));
  return [details.slice(0, maxGroups), col];
}

function duplicateBeneficiaryDetails(casesRows) {
  if (!casesRows.length) return [];
  const pinCol = resolvePersonalIdColumn(Object.keys(casesRows[0] || {}));
  const natCol = resolveNationalIdColumn(Object.keys(casesRows[0] || {}));

  const keyPositions = {};
  casesRows.forEach((row, pos) => {
    const pv = pinCol ? cleanId(row[pinCol]) : null;
    const nv = natCol ? cleanId(row[natCol]) : null;
    const key = pv ? `p:${pv}` : nv ? `n:${nv}` : null;
    if (!key) return;
    if (!keyPositions[key]) keyPositions[key] = [];
    keyPositions[key].push(pos);
  });

  const details = [];
  for (const [key, positions] of Object.entries(keyPositions)) {
    if (positions.length < 2) continue;
    const [kt, idVal] = key.split(':');
    const excelRows = [...new Set(positions.map((p) => casesRows[p]._excel_row))].sort((a, b) => a - b);
    details.push({
      key_type: kt,
      id_value: idVal,
      duplicate_row_count: positions.length,
      excel_rows: excelRows,
    });
  }
  details.sort((a, b) => b.duplicate_row_count - a.duplicate_row_count || String(a.id_value).localeCompare(String(b.id_value)));
  return details;
}

function duplicateServiceDetails(servicesRows) {
  if (!servicesRows.length) return [];
  const idCol = 'Individual ID/National ID';
  const prodCol = 'Product';
  if (!servicesRows[0] || !(idCol in servicesRows[0]) || !(prodCol in servicesRows[0])) return [];

  const groups = {};
  for (const row of servicesRows) {
    const oid = cleanId(row[idCol]) || '';
    const pc = row[prodCol] != null ? String(row[prodCol]).trim().toLowerCase() : '';
    if (!oid || !pc || pc === 'nan') continue;
    const k = `${oid}\0${pc}`;
    if (!groups[k]) groups[k] = [];
    groups[k].push(row);
  }

  const details = [];
  for (const grp of Object.values(groups)) {
    if (grp.length < 2) continue;
    const _oid = cleanId(grp[0]['Individual ID/National ID']);
    const _pc = String(grp[0].Product).trim().toLowerCase();
    const excelRows = [...new Set(grp.map((r) => r._excel_row))].sort((a, b) => a - b);
    details.push({
      person_id: _oid,
      product: _pc,
      duplicate_row_count: grp.length,
      excel_rows: excelRows,
    });
  }
  details.sort((a, b) =>
    b.duplicate_row_count - a.duplicate_row_count ||
    String(a.person_id).localeCompare(String(b.person_id)) ||
    String(a.product).localeCompare(String(b.product))
  );
  return details;
}

function dualPinPassportBlankStats(rows) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]);
  const pinCol = resolvePersonalIdColumn(columns);
  const passCol = resolvePassportColumn(columns);
  if (!pinCol && !passCol) return null;

  const dualBlankRows = [];
  rows.forEach((row) => {
    const pinBlank = !pinCol || !cleanId(row[pinCol]);
    const passBlank = !passCol || !cleanId(row[passCol]);
    if (pinBlank && passBlank) dualBlankRows.push(row._excel_row);
  });
  const sorted = [...new Set(dualBlankRows)].sort((a, b) => a - b);
  return {
    personal_id_column: pinCol,
    passport_column: passCol,
    row_count: rows.length,
    dual_blank_count: sorted.length,
    dual_blank_excel_rows: sorted,
    dual_blank_excel_rows_sample: sorted.slice(0, 45),
    sample_truncated: sorted.length > 45,
  };
}

// ---------------------------------------------------------------------------
// Issue collectors
// ---------------------------------------------------------------------------

function validationIssuesFromMissingColumns(missing) {
  return missing.map((m) => {
    const labelsAr = String(m.labels_ar || m.official_header || '');
    const labelsEn = String(m.labels_en || m.official_header || '');
    const official = String(m.official_header || '');
    const sample = m.match_names_sample || [];
    const sampleTxt = sample.slice(0, 6).join(', ');
    const hintAr = sampleTxt ? ` يمكن استخدام أحد المرادفات المعتمدة مثل: ${sampleTxt}.` : '';
    const hintEn = sampleTxt ? ` Accepted synonyms include: ${sampleTxt}.` : '';
    return new ValidationIssue({
      severity: 'error',
      code: 'missing_required_column',
      message_ar: `العمود المطلوب غير موجود: ${labelsAr} (عمود القالب: «${official}»).${hintAr} أضف العمود أو استخدم اسماً مطابقاً للقالب.`,
      message_en: `[MISSING COLUMN] Required column not found: ${labelsEn} (template header: ${JSON.stringify(official)}).${hintEn}`,
      excel_row: null,
      row_index: null,
      column: official || null,
      identifiers: {
        field_id: m.field_id || '',
        official_header: official,
        accepted_aliases_hint: sample,
      },
    });
  });
}

function collectCaseIssues(casesRows) {
  if (!casesRows.length) {
    return [
      new ValidationIssue({
        severity: 'error',
        code: 'empty_sheet',
        message_ar: 'الملف لا يحتوي على صفوف بيانات.',
        message_en: 'The workbook has no data rows.',
        excel_row: null,
        row_index: null,
      }),
    ];
  }

  const columns = Object.keys(casesRows[0]);
  const pinCol = resolvePersonalIdColumn(columns);
  const natCol = resolveNationalIdColumn(columns);
  const nameCol = columns.includes('name') ? 'name' : null;
  const phoneCol = resolvePhoneColumn(columns);
  const phoneAltCol = resolvePhoneAltColumn(columns);
  const fileCol = columns.includes('File Number') ? 'File Number' : null;
  const stateCol = columns.includes('State') ? 'State' : null;
  const nationalityCol = columns.includes('Nationality') ? 'Nationality' : null;
  const isRefCol = findIsRefugeesColumn(columns);

  const issues = [];

  const keyPositions = {};
  casesRows.forEach((row, pos) => {
    const pv = pinCol ? cleanId(row[pinCol]) : null;
    const nv = natCol ? cleanId(row[natCol]) : null;
    const key = pv ? `p:${pv}` : nv ? `n:${nv}` : null;
    if (!key) return;
    if (!keyPositions[key]) keyPositions[key] = [];
    keyPositions[key].push(pos);
  });

  for (const [key, positions] of Object.entries(keyPositions)) {
    if (positions.length < 2) continue;
    const [kt, idVal] = key.split(':');
    const excelRows = [...new Set(positions.map((p) => casesRows[p]._excel_row))].sort((a, b) => a - b);
    const nameVal = nameCol ? casesRows[positions[0]][nameCol] : null;
    const dupCol = (kt === 'p' ? pinCol : natCol) || (kt === 'p' ? 'personal_identification_number' : 'national_id');
    issues.push(
      new ValidationIssue({
        severity: 'error',
        code: 'duplicate_beneficiary_rows',
        column: dupCol,
        message_ar: `المشكلة: تكرار معرّف المستفيد — القيمة «${idVal}» — متكررة ${positions.length} مرات. احذف الصف الزائد أو ادمج البيانات.`,
        message_en: `[DUPLICATE PERSON ID] Same beneficiary identifier ${JSON.stringify(idVal)} repeated ${positions.length} times. Remove or merge duplicate rows.`,
        excel_row: excelRows[0],
        row_index: positions[0],
        identifiers: {
          key_type: kt,
          id_value: idVal,
          excel_rows: excelRows,
          duplicate_row_count: positions.length,
          name: nameVal != null && !isBlank(nameVal) ? String(nameVal) : null,
        },
      })
    );
  }

  casesRows.forEach((row, pos) => {
    const excelRow = row._excel_row;
    const nameVal = nameCol ? row[nameCol] : '';
    const pinVal = pinCol ? cleanId(row[pinCol]) : null;
    const natVal = natCol ? cleanId(row[natCol]) : null;

    const idCtx = {
      personal_identification_number: pinVal,
      national_id: natVal,
      'File Number': !fileCol || isBlank(row[fileCol]) ? null : String(row[fileCol]).trim(),
      name: isBlank(nameVal) ? null : String(nameVal).trim(),
    };
    if (nationalityCol) idCtx.Nationality = isBlank(row[nationalityCol]) ? null : String(row[nationalityCol]).trim();
    if (isRefCol) idCtx.IsRefugees = isBlank(row[isRefCol]) ? null : String(row[isRefCol]).trim();

    if (!pinVal && !natVal) {
      issues.push(
        new ValidationIssue({
          severity: 'error',
          code: 'missing_identifier',
          message_ar: `صف Excel رقم ${excelRow} — عمودا الرقم الشخصي والرقم القومي فارغان؛ يجب إدخال قيمة في أحدهما على الأقل.`,
          message_en: `[MISSING ID] Excel sheet row #${excelRow}: both Individual ID and National ID are empty. Fill at least one.`,
          excel_row: excelRow,
          row_index: pos,
          column: 'personal_identification_number / national_id',
          identifiers: idCtx,
        })
      );
    }

    if (nameCol && !isBlank(nameVal)) {
      const wc = String(nameVal).split(/\s+/).filter(Boolean).length;
      if (wc < 3) {
        issues.push(
          new ValidationIssue({
            severity: 'warning',
            code: 'name_short',
            message_ar: `صف ${excelRow}: الاسم أقل من 3 كلمات (${wc}). تأكد أن الاسم رباعي كما في الوثائق.`,
            message_en: `[SHORT NAME] Excel row ${excelRow}: name has only ${wc} word(s). Expected full 4-part name.`,
            excel_row: excelRow,
            row_index: pos,
            column: 'name',
            identifiers: idCtx,
          })
        );
      }
    } else if (nameCol) {
      issues.push(
        new ValidationIssue({
          severity: 'error',
          code: 'missing_name',
          message_ar: `صف ${excelRow}: الاسم فارغ.`,
          message_en: `[MISSING NAME] Excel row ${excelRow}: name column is empty.`,
          excel_row: excelRow,
          row_index: pos,
          column: 'name',
          identifiers: idCtx,
        })
      );
    }

    if (phoneCol) {
      const raw = row[phoneCol];
      if (isBlank(raw)) {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'missing_phone',
            message_ar: `صف Excel رقم ${excelRow} — عمود التليفون فارغ؛ يجب إدخال رقم في هذا الصف.`,
            message_en: `[MISSING PHONE] Excel sheet row #${excelRow}: phone column is empty.`,
            excel_row: excelRow,
            row_index: pos,
            column: phoneCol,
            identifiers: idCtx,
          })
        );
      } else {
        const [ok, normalized] = phoneIsValidEgyptian(raw);
        if (!ok) {
          issues.push(
            new ValidationIssue({
              severity: 'error',
              code: 'invalid_phone',
              message_ar: `صف Excel رقم ${excelRow} — قيمة التليفون غير صالحة (${normalized}). المتوقع 11 رقم يبدأ بـ 0.`,
              message_en: `[INVALID PHONE] Excel sheet row #${excelRow}: phone value ${JSON.stringify(normalized)} is invalid.`,
              excel_row: excelRow,
              row_index: pos,
              column: phoneCol,
              identifiers: { ...idCtx, phone_raw: String(raw).trim(), phone_normalized_attempt: normalized },
            })
          );
        }
      }
    }

    if (phoneAltCol) {
      const rawAlt = row[phoneAltCol];
      const [okAlt] = phoneIsValidEgyptian(rawAlt);
      if (!isBlank(rawAlt) && !okAlt) {
        issues.push(
          new ValidationIssue({
            severity: 'warning',
            code: 'invalid_phone_alt',
            message_ar: `صف ${excelRow}: رقم التليفون البديل غير صالح.`,
            message_en: `[INVALID ALT PHONE] Excel row ${excelRow}: alternate phone looks invalid.`,
            excel_row: excelRow,
            row_index: pos,
            column: phoneAltCol,
            identifiers: { ...idCtx, phone_raw: String(rawAlt).trim() },
          })
        );
      }
    }

    if (stateCol && isBlank(row[stateCol])) {
      issues.push(
        new ValidationIssue({
          severity: 'error',
          code: 'missing_state',
          message_ar: `صف ${excelRow}: المحافظة (State) فارغة.`,
          message_en: `[MISSING STATE] Excel row ${excelRow}: governorate (State) is empty.`,
          excel_row: excelRow,
          row_index: pos,
          column: 'State',
          identifiers: idCtx,
        })
      );
    }

    if (nationalityCol && isBlank(row[nationalityCol])) {
      issues.push(
        new ValidationIssue({
          severity: 'error',
          code: 'missing_nationality',
          message_ar: `صف ${excelRow}: الجنسية فارغة.`,
          message_en: `[MISSING NATIONALITY] Excel row ${excelRow}: Nationality is empty.`,
          excel_row: excelRow,
          row_index: pos,
          column: 'Nationality',
          identifiers: idCtx,
        })
      );
    }

    if (isRefCol) {
      const ir = row[isRefCol];
      const kind = classifyIsRefugees(ir);
      if (kind === 'empty') {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'missing_is_refugees',
            message_ar: `صف ${excelRow}: حقل لاجئ؟ فارغ — استخدم نعم أو لا.`,
            message_en: `[MISSING IsRefugees] Excel row ${excelRow}: IsRefugees is empty.`,
            excel_row: excelRow,
            row_index: pos,
            column: isRefCol,
            identifiers: idCtx,
          })
        );
      } else if (kind === 'invalid') {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'invalid_is_refugees',
            message_ar: `صف ${excelRow}: قيمة IsRefugees غير مفهومة (${String(ir).trim()}).`,
            message_en: `[INVALID IsRefugees] Excel row ${excelRow}: value ${JSON.stringify(ir)} is not recognized.`,
            excel_row: excelRow,
            row_index: pos,
            column: isRefCol,
            identifiers: { ...idCtx, raw_value: String(ir).trim() },
          })
        );
      }
    }
  });

  return issues;
}

function collectServiceIssues(servicesRows) {
  if (!servicesRows.length) return [];
  const issues = [];
  const idCol = 'Individual ID/National ID';
  const prodCol = 'Product';
  const columns = Object.keys(servicesRows[0] || {});

  servicesRows.forEach((row, pos) => {
    const excelRow = row._excel_row;
    const oid = columns.includes(idCol) ? cleanId(row[idCol]) : null;
    const prod = columns.includes(prodCol) ? row[prodCol] : null;
    const idsCtx = {
      'Individual ID/National ID': oid,
      Product: isBlank(prod) ? null : String(prod).trim(),
    };

    if (!oid) {
      issues.push(
        new ValidationIssue({
          severity: 'error',
          code: 'service_missing_person_id',
          message_ar: `صف Excel رقم ${excelRow} — صف خدمة لكن معرّف الشخص فارغ.`,
          message_en: `[SERVICE MISSING ID] Excel sheet row #${excelRow}: service row has empty Individual/National ID.`,
          excel_row: excelRow,
          row_index: pos,
          column: idCol,
          identifiers: idsCtx,
        })
      );
    }

    if (isBlank(prod)) {
      issues.push(
        new ValidationIssue({
          severity: 'error',
          code: 'service_missing_product',
          message_ar: `صف ${excelRow}: نوع الخدمة فارغ.`,
          message_en: `[SERVICE MISSING TYPE] Excel row ${excelRow}: service/product column is empty.`,
          excel_row: excelRow,
          row_index: pos,
          column: prodCol,
          identifiers: idsCtx,
        })
      );
    }

    const amtCol = columns.includes('Actual Amount') ? 'Actual Amount' : null;
    const actDateCol = columns.includes('Actual Date') ? 'Actual Date' : null;
    const expDateCol = columns.includes('Expected Date') ? 'Expected Date' : null;

    if (amtCol) {
      const rawAmt = row[amtCol];
      const [amtVal, amtSt] = parsePositiveAmount(rawAmt);
      if (amtSt === 'empty') {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'missing_actual_amount',
            message_ar: `صف ${excelRow}: التكلفة الفعلية فارغة.`,
            message_en: `[MISSING AMOUNT] Excel row ${excelRow}: Actual Amount is empty.`,
            excel_row: excelRow,
            row_index: pos,
            column: amtCol,
            identifiers: idsCtx,
          })
        );
      } else if (amtSt === 'invalid') {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'invalid_actual_amount',
            message_ar: `صف ${excelRow}: قيمة التكلفة غير رقمية: ${rawAmt}.`,
            message_en: `[INVALID AMOUNT] Excel row ${excelRow}: Actual Amount is not valid: ${JSON.stringify(rawAmt)}.`,
            excel_row: excelRow,
            row_index: pos,
            column: amtCol,
            identifiers: { ...idsCtx, raw_value: String(rawAmt).trim() },
          })
        );
      } else if (amtSt === 'not_positive') {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'actual_amount_not_positive',
            message_ar: `صف ${excelRow}: التكلفة يجب أن تكون أكبر من صفر (${amtVal}).`,
            message_en: `[AMOUNT NOT > 0] Excel row ${excelRow}: Actual Amount must be > 0 (got ${amtVal}).`,
            excel_row: excelRow,
            row_index: pos,
            column: amtCol,
            identifiers: { ...idsCtx, amount: amtVal },
          })
        );
      }
    }

    if (actDateCol) {
      const rawAd = row[actDateCol];
      if (isBlank(rawAd)) {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'missing_actual_date',
            message_ar: `صف ${excelRow}: تاريخ التنفيذ الفعلي فارغ.`,
            message_en: `[MISSING ACTUAL DATE] Excel row ${excelRow}: Actual Date is empty.`,
            excel_row: excelRow,
            row_index: pos,
            column: actDateCol,
            identifiers: idsCtx,
          })
        );
      } else if (!parseDateCell(rawAd)) {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'invalid_actual_date',
            message_ar: `صف ${excelRow}: تاريخ التنفيذ غير صالح: ${rawAd}.`,
            message_en: `[INVALID ACTUAL DATE] Excel row ${excelRow}: cannot parse Actual Date: ${JSON.stringify(rawAd)}.`,
            excel_row: excelRow,
            row_index: pos,
            column: actDateCol,
            identifiers: { ...idsCtx, raw_value: String(rawAd).trim() },
          })
        );
      }
    }

    if (expDateCol) {
      const rawEd = row[expDateCol];
      if (isBlank(rawEd)) {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'missing_expected_date',
            message_ar: `صف ${excelRow}: التاريخ المتوقع فارغ.`,
            message_en: `[MISSING EXPECTED DATE] Excel row ${excelRow}: Expected Date is empty.`,
            excel_row: excelRow,
            row_index: pos,
            column: expDateCol,
            identifiers: idsCtx,
          })
        );
      } else if (!parseDateCell(rawEd)) {
        issues.push(
          new ValidationIssue({
            severity: 'error',
            code: 'invalid_expected_date',
            message_ar: `صف ${excelRow}: التاريخ المتوقع غير صالح: ${rawEd}.`,
            message_en: `[INVALID EXPECTED DATE] Excel row ${excelRow}: cannot parse Expected Date: ${JSON.stringify(rawEd)}.`,
            excel_row: excelRow,
            row_index: pos,
            column: expDateCol,
            identifiers: { ...idsCtx, raw_value: String(rawEd).trim() },
          })
        );
      }
    }
  });

  const groups = {};
  for (const row of servicesRows) {
    const oid = cleanId(row[idCol]) || '';
    const pc = row[prodCol] != null ? String(row[prodCol]).trim().toLowerCase() : '';
    if (!oid || !pc || pc === 'nan') continue;
    const k = `${oid}\0${pc}`;
    if (!groups[k]) groups[k] = [];
    groups[k].push(row);
  }

  for (const grp of Object.values(groups)) {
    if (grp.length < 2) continue;
    const _oid = cleanId(grp[0][idCol]);
    const _pc = String(grp[0][prodCol]).trim().toLowerCase();
    const excelRows = [...new Set(grp.map((r) => r._excel_row))].sort((a, b) => a - b);
    issues.push(
      new ValidationIssue({
        severity: 'warning',
        code: 'duplicate_service_same_person',
        message_ar: `تكرار خدمة «${_pc}» للمعرّف «${_oid}». صفوف Excel: ${excelRows.join(', ')}.`,
        message_en: `[DUPLICATE SERVICE] Same service ${JSON.stringify(_pc)} for person ${JSON.stringify(_oid)}. Rows: ${excelRows.join(', ')}.`,
        excel_row: excelRows[0],
        row_index: null,
        identifiers: {
          person_key: _oid,
          product: _pc,
          excel_rows: excelRows,
          duplicate_row_count: grp.length,
        },
      })
    );
  }

  return issues;
}

function dropDuplicateServiceIfSameRowsAsDuplicatePerson(issues) {
  const dupPersonMap = {};
  for (const i of issues) {
    if (i.code !== 'duplicate_beneficiary_rows') continue;
    const oid = i.identifiers.id_value;
    const rows = i.identifiers.excel_rows || [];
    if (oid != null && rows.length) dupPersonMap[String(oid)] = new Set(rows.map(Number));
  }
  return issues.filter((i) => {
    if (i.code !== 'duplicate_service_same_person') return true;
    const oid = String(i.identifiers.person_key || '');
    const rows = new Set((i.identifiers.excel_rows || []).map(Number));
    if (dupPersonMap[oid]) {
      const personRows = dupPersonMap[oid];
      let same = rows.size === personRows.size;
      if (same) for (const r of rows) if (!personRows.has(r)) { same = false; break; }
      if (same) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Report formatting (simplified column report — preserves contract)
// ---------------------------------------------------------------------------

const ISSUE_TAG_BLANKS = new Set([
  'empty_sheet', 'missing_identifier', 'missing_name', 'missing_phone', 'missing_state',
  'missing_nationality', 'missing_is_refugees', 'service_missing_person_id', 'service_missing_product',
  'missing_actual_amount', 'missing_actual_date', 'missing_expected_date',
]);
const ISSUE_TAG_NOT_FOUND = new Set(['missing_required_column']);
const ISSUE_TAG_DUPLICATION = new Set(['duplicate_beneficiary_rows', 'duplicate_service_same_person']);

function issueReportTagPair(code) {
  if (ISSUE_TAG_NOT_FOUND.has(code)) return ['غير موجود', 'NOT_FOUND'];
  if (ISSUE_TAG_BLANKS.has(code)) return ['فراغات', 'BLANKS'];
  if (ISSUE_TAG_DUPLICATION.has(code)) return ['تكرار', 'DUPLICATION'];
  return ['قيمة خاطئة', 'WRONG'];
}

function orderedDataColumns(casesRows, servicesRows) {
  const out = [];
  const seen = new Set();
  const walk = (rows) => {
    if (!rows.length) return;
    for (const k of Object.keys(rows[0])) {
      if (k === '_excel_row' || k.startsWith('_')) continue;
      if (!seen.has(k)) { seen.add(k); out.push(k); }
    }
  };
  walk(casesRows);
  walk(servicesRows);
  return out;
}

function groupIssuesByColumn(issues, casesRows, servicesRows) {
  const buckets = {};
  const resolveTargets = (issue) => {
    if (issue.code === 'empty_sheet') return ['__general__'];
    if (issue.code === 'missing_required_column') {
      return [String(issue.identifiers.official_header || issue.column || '__general__')];
    }
    if (issue.code === 'duplicate_beneficiary_rows') {
      const kt = issue.identifiers.key_type;
      if (kt === 'p') return [resolvePersonalIdColumn(Object.keys(casesRows[0] || {})) || 'personal_identification_number'];
      if (kt === 'n') return [resolveNationalIdColumn(Object.keys(casesRows[0] || {})) || 'national_id'];
      return ['__identifiers__'];
    }
    if (issue.code === 'duplicate_service_same_person') {
      return servicesRows.length && 'Product' in servicesRows[0] ? ['Product'] : ['__services__'];
    }
    return issue.column ? [issue.column] : ['__general__'];
  };

  for (const i of issues) {
    for (const col of resolveTargets(i)) {
      if (!buckets[col]) buckets[col] = [];
      buckets[col].push(i);
    }
  }
  return buckets;
}

function mergedNullLookup(nullMeta) {
  const out = {};
  const ingest = (rows, skipCaseDup) => {
    for (const r of rows || []) {
      const col = String(r.column || '');
      if (!col) continue;
      if (skipCaseDup && out[col]) continue;
      if (!out[col]) out[col] = { blank_count: 0, excel_rows_all: [] };
      out[col].blank_count += Number(r.blank_count || 0);
      out[col].excel_rows_all.push(...(r.excel_rows_all || []));
    }
  };
  ingest(nullMeta.cases, false);
  const caseCols = new Set((nullMeta.cases || []).map((r) => r.column));
  ingest(
    (nullMeta.services || []).filter((r) => !caseCols.has(r.column)),
    false
  );
  for (const o of Object.values(out)) {
    o.excel_rows_all = [...new Set(o.excel_rows_all.map(Number))].sort((a, b) => a - b);
    o.excel_rows_sample = o.excel_rows_all.slice(0, 45);
    o.truncated = o.excel_rows_all.length > o.excel_rows_sample.length;
  }
  return out;
}

function formatNullSummaryArEn(casesRows, servicesRows) {
  const cDetails = columnNullDetails(casesRows);
  const sDetails = columnNullDetails(servicesRows);
  const caseColumnNames = new Set(cDetails.map((d) => d.column));
  const meta = {
    cases: cDetails,
    services: sDetails,
    cases_null_aggregated: cDetails,
    cases_null_detailed: cDetails,
    services_null_aggregated: sDetails.filter((d) => !caseColumnNames.has(d.column)),
    services_null_detailed: sDetails.filter((d) => !caseColumnNames.has(d.column)),
    null_summary_services_columns_omitted_as_duplicate_of_cases: [...caseColumnNames].filter((c) =>
      sDetails.some((d) => d.column === c)
    ),
  };
  return ['', '', meta];
}

function formatDuplicationSummaryArEn(casesRows, servicesRows) {
  const pinCol = resolvePersonalIdColumn(Object.keys(casesRows[0] || {}));
  const nidCol = resolveNationalIdColumn(Object.keys(casesRows[0] || {}));
  const [pidDups, pidUsed] = duplicateCleanedValuesInColumn(casesRows, pinCol);
  const [nidDups, nidUsed] = duplicateCleanedValuesInColumn(casesRows, nidCol);
  const meta = {
    personal_id_column: pidUsed,
    duplicate_personal_id_values: pidDups,
    national_id_column: nidUsed,
    duplicate_national_id_values: nidDups,
    duplicate_beneficiary_groups: duplicateBeneficiaryDetails(casesRows),
    duplicate_service_groups: duplicateServiceDetails(servicesRows),
  };
  return ['', '', meta];
}

function formatIdentifierDualBlankPreambleArEn(stats) {
  if (!stats || Number(stats.dual_blank_count || 0) <= 0) return [[], []];
  const n = Number(stats.row_count || 0);
  const bn = Number(stats.dual_blank_count);
  const pct = n ? (100 * bn) / n : 0;
  const pinLbl = stats.personal_id_column || 'personal_identification_number';
  const passLbl = stats.passport_column || 'Passport Number';
  const ar = [
    '▌ معرّف المستفيد — الرقم الشخصي وجواز السفر معاً',
    `  [فراغات] ${bn} صفاً بدون «${pinLbl}» ولا «${passLbl}» معاً من أصل ${n} صفاً (${pct.toFixed(1)}%).`,
  ];
  const en = [
    '▌ Beneficiary ID — both personal ID and passport empty',
    `  [BLANKS] ${bn} row(s) with both ${JSON.stringify(pinLbl)} and ${JSON.stringify(passLbl)} empty (~${n} rows, ${pct.toFixed(1)}%).`,
  ];
  const sample = stats.dual_blank_excel_rows_sample || [];
  if (sample.length) {
    const extra = stats.sample_truncated ? ` … (+${bn - sample.length} more)` : '';
    ar.push(`  [فراغات] أمثلة صفوف Excel: ${sample}${extra}.`);
    en.push(`  [BLANKS] Sample Excel rows: ${sample}${extra}.`);
  }
  return [ar, en];
}

function formatValidationMessagesByColumnArEn(
  issues,
  casesRows,
  servicesRows,
  nullMeta,
  dupMeta,
  validateMode,
  identifierBlankStats
) {
  const mode = normalizeValidateMode(validateMode);
  let ordered = orderedDataColumns(casesRows, servicesRows);
  if (mode === 'services') ordered = ordered.filter((c) => !isCaseDemographicColumn(c));
  else if (mode === 'cases') ordered = ordered.filter((c) => !isServiceColumn(c));

  const byCol = groupIssuesByColumn(issues, casesRows, servicesRows);
  const nullLookup = mergedNullLookup(nullMeta);

  const modeNoteAr = {
    both: 'التحقق: الحالات والخدمات معاً.',
    cases: 'التحقق: الحالات فقط.',
    services: 'التحقق: الخدمات فقط.',
  }[mode];
  const modeNoteEn = {
    both: 'Validation scope: cases and services.',
    cases: 'Validation scope: cases only.',
    services: 'Validation scope: services only.',
  }[mode];

  const linesAr = ['── تقرير بالأعمدة: [غير موجود] / [فراغات] / [تكرار] / [قيمة خاطئة] ──'];
  const linesEn = ['── Column report: [NOT_FOUND] / [BLANKS] / [DUPLICATION] / [WRONG] ──'];
  const structured = { validate_mode: mode, identifier_dual_blank: identifierBlankStats, columns: [] };

  const emitSection = (col, colIssues, nullInfo) => {
    const bn = nullInfo ? Number(nullInfo.blank_count || 0) : 0;
    const hasIssues = colIssues.length > 0;
    const showNull = bn > 0 && !(colIssues.length && colIssues.every((x) => x.code === 'missing_required_column'));
    if (!showNull && !hasIssues) return null;

    const titleAr = col === '__general__' ? '▌ عام — الملف ككل' : `▌ عمود «${col}»`;
    const titleEn = col === '__general__' ? '▌ General — whole sheet' : `▌ Column ${JSON.stringify(col)}`;
    const secAr = [titleAr];
    const secEn = [titleEn];

    if (showNull && nullInfo) {
      const nRows = casesRows.length || servicesRows.length || 1;
      const pct = (100 * bn) / nRows;
      secAr.push(`  [فراغات] ${bn} خلية فارغة (~${nRows} صف، ${pct.toFixed(1)}%).`);
      secEn.push(`  [BLANKS] ${bn} empty/null cells (~${nRows} rows, ${pct.toFixed(1)}%).`);
    }

    const issueRowsStruct = [];
    for (const i of colIssues) {
      const [tagAr, tagEn] = issueReportTagPair(i.code);
      const rowPartAr = i.code === 'missing_required_column'
        ? 'العمود غير موجود في الشيت'
        : i.excel_row != null ? `صف Excel ${i.excel_row}` : 'بدون صف';
      const rowPartEn = i.code === 'missing_required_column'
        ? 'Column not found in workbook'
        : i.excel_row != null ? `Excel row ${i.excel_row}` : 'no row';
      secAr.push(`  [${tagAr}] ${rowPartAr} — ${i.message_ar.split('—').pop()?.trim() || i.message_ar}`);
      secEn.push(`  [${tagEn}] ${rowPartEn} — ${i.message_en}`);
      issueRowsStruct.push({
        code: i.code,
        severity: i.severity,
        excel_row: i.excel_row,
        row_index: i.row_index,
        identifiers: i.identifiers,
      });
    }

    linesAr.push('', ...secAr);
    linesEn.push('', ...secEn);
    structured.columns.push({
      column: col,
      blanks: showNull ? nullInfo : null,
      blank_count: showNull ? bn : 0,
      issue_codes: colIssues.map((x) => x.code),
      issue_count: colIssues.length,
      issues: issueRowsStruct,
    });
    return true;
  };

  const openingCols = ['Individual ID/National ID', 'personal_identification_number', 'national_id', '__identifiers__'];
  const emitted = new Set();
  for (const col of openingCols) {
    if (byCol[col]?.length || nullLookup[col]) {
      emitSection(col, byCol[col] || [], nullLookup[col]);
      emitted.add(col);
    }
  }

  linesAr.push(modeNoteAr);
  linesEn.push(modeNoteEn);

  const [idAr, idEn] = formatIdentifierDualBlankPreambleArEn(identifierBlankStats);
  if (idAr.length) { linesAr.push('', ...idAr); linesEn.push('', ...idEn); }

  for (const col of ordered) {
    if (emitted.has(col)) continue;
    if (mode === 'services' && isCaseDemographicColumn(col)) continue;
    if (mode === 'cases' && isServiceColumn(col)) continue;
    emitSection(col, byCol[col] || [], nullLookup[col]);
  }

  for (const col of Object.keys(byCol)) {
    if (emitted.has(col) || ordered.includes(col)) continue;
    emitSection(col, byCol[col], nullLookup[col]);
  }

  if (dupMeta.duplicate_service_groups?.length) {
    const col = 'Product';
    if (!emitted.has(col)) {
      const ar = ['  [تكرار] نفس المنتج لنفس المعرّف في أكثر من صف:'];
      const en = ['  [DUPLICATION] Same product for same person on multiple rows:'];
      for (const d of dupMeta.duplicate_service_groups) {
        ar.push(`    [تكرار] «${d.person_id}» + «${d.product}» — ${d.duplicate_row_count} صف`);
        en.push(`    [DUPLICATION] ${JSON.stringify(d.person_id)} + ${JSON.stringify(d.product)} — ${d.duplicate_row_count} rows`);
      }
      linesAr.push('', `▌ عمود «${col}»`, ...ar);
      linesEn.push('', `▌ Column ${JSON.stringify(col)}`, ...en);
    }
  }

  let blobAr = linesAr.join('\n');
  let blobEn = linesEn.join('\n');
  if (!structured.columns.length) {
    blobAr += '\n\n(لا توجد ملاحظات مسجّلة حسب العمود.)';
    blobEn += '\n\n(No per-column issues to report.)';
  }
  return [blobAr, blobEn, structured];
}

function summaryAr(errors, warnings) {
  if (errors === 0 && warnings === 0) return 'الملف يمر على التحقق الأولي. يمكن المتابعة لخطوة Odoo عند جاهزيتك.';
  const parts = [];
  if (errors) parts.push(`${errors} خطأ يجب إصلاحه`);
  if (warnings) parts.push(`${warnings} تنبيه`);
  return parts.join('، ') + '.';
}

function summaryEn(errors, warnings) {
  if (errors === 0 && warnings === 0) return 'Validation passed (no errors or warnings). You can proceed to the Odoo step when ready.';
  const parts = [];
  if (errors) parts.push(`${errors} error(s) to fix`);
  if (warnings) parts.push(`${warnings} warning(s)`);
  return parts.join(', ') + '.';
}

function dataframeForNullReport(rows, validateMode) {
  if (!rows.length) return rows;
  if (normalizeValidateMode(validateMode) !== 'services') return rows;
  return rows.map((row) => {
    const out = { _excel_row: row._excel_row };
    for (const [k, v] of Object.entries(row)) {
      if (k === '_excel_row' || !isCaseDemographicColumn(k)) out[k] = v;
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

function validateVolunteerUpload(buffer, opts = {}) {
  const sheetName = opts.sheetName || opts.sheet_name || null;
  const headerRows = opts.headerRows ?? 1;
  const validateMode = normalizeValidateMode(opts.validateMode || opts.validate_mode);
  const schemaPath = opts.schemaPath || null;

  let rawFrame;
  let resolvedSheet = sheetName;

  if (sheetName) {
    rawFrame = readSheetAsFrame(buffer, sheetName);
    resolvedSheet = sheetName;
  } else {
    const names = listSheetNames(buffer);
    let chosen = null;
    for (const cand of names) {
      const probe = probeSheet(buffer, cand, 12);
      if (looksLikeNrcWideCasePlusService(probe)) {
        chosen = cand;
        break;
      }
    }
    if (chosen) {
      rawFrame = readSheetAsFrame(buffer, chosen);
      resolvedSheet = chosen;
    } else {
      rawFrame = readSheetAsFrame(buffer, names[0]);
      resolvedSheet = names[0] || null;
    }
  }

  const { frame: rawMapped, missing, meta: colMeta } = applyVolunteerColumnSchema(rawFrame, schemaPath);
  const schemaIssues = validationIssuesFromMissingColumns(missing);

  let casesFrame;
  let servicesFrame;

  if (looksLikeNrcWideCasePlusService(rawMapped)) {
    [casesFrame, servicesFrame] = splitNrcCashAssistanceWide(rawMapped);
  } else {
    const effectiveSheet = sheetName || resolvedSheet;
    if (effectiveSheet) {
      [casesFrame, servicesFrame] = loadCasesAndServicesFrames(buffer, {
        mixedSheet: effectiveSheet,
        mixedSheetFrame: rawMapped,
      });
    } else {
      [casesFrame, servicesFrame] = loadCasesAndServicesFrames(buffer);
    }
  }

  const [casesFrameNorm, servicesFrameNorm] = normalizeFramesForValidation(
    casesFrame,
    servicesFrame,
    headerRows
  );
  const casesRows = casesFrameNorm.rows;
  const servicesRows = servicesFrameNorm.rows;

  const caseIssues = validateMode === 'services' ? [] : collectCaseIssues(casesRows);
  const serviceIssues = validateMode === 'cases' ? [] : collectServiceIssues(servicesRows);

  let issues = [...schemaIssues, ...caseIssues, ...serviceIssues];
  issues = dropDuplicateServiceIfSameRowsAsDuplicatePerson(issues);

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  const statsRows = validateMode !== 'services' ? casesRows : servicesRows;
  const identifierBlankStats = dualPinPassportBlankStats(statsRows);

  const casesForNull = validateMode === 'services' ? [] : casesRows;
  const svcForNull = validateMode === 'cases' ? [] : servicesRows;

  const [, , nullMeta] = formatNullSummaryArEn(
    dataframeForNullReport(casesForNull, validateMode),
    dataframeForNullReport(svcForNull, validateMode)
  );
  const [, , dupMeta] = formatDuplicationSummaryArEn(
    validateMode === 'services' ? [] : casesRows,
    validateMode === 'cases' ? [] : servicesRows
  );

  const casesRep = validateMode === 'services' ? [] : casesRows;
  const svcRep = validateMode === 'cases' ? [] : servicesRows;

  const [messagesAr, messagesEn, columnReport] = formatValidationMessagesByColumnArEn(
    issues,
    casesRep,
    svcRep,
    nullMeta,
    dupMeta,
    validateMode,
    identifierBlankStats
  );

  const out = {
    engine_version: VALIDATION_ENGINE_VERSION,
    validate_mode: validateMode,
    ok: errors.length === 0,
    errors_count: errors.length,
    warnings_count: warnings.length,
    issues: issues.map((i) => i.toDict()),
    messages_ar: messagesAr,
    messages_en: messagesEn,
    column_report: columnReport,
    summary_ar: summaryAr(errors.length, warnings.length),
    summary_en: summaryEn(errors.length, warnings.length),
    null_summary_ar: '',
    null_summary_en: '',
    duplication_summary_ar: '',
    duplication_summary_en: '',
    data_quality: { nulls: nullMeta, duplicates: dupMeta },
  };

  if (!colMeta.skipped) out.column_validation = colMeta;
  if (missing.length) out.missing_required_columns = missing;
  return out;
}

module.exports = {
  VALIDATION_ENGINE_VERSION,
  validateVolunteerUpload,
};
