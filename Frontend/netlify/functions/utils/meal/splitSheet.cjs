/**
 * Split combined Excel sheets into cases + services frames — port of combined_sheet_split.py
 */

const { readSheetAsFrame, probeSheet, listSheetNames } = require('./excel.cjs');

/** @typedef {{ rows: Record<string, string|null>[], columns: string[] }} Frame */

function blankSeries(rows, col) {
  return rows.map((r) => {
    const v = r[col];
    if (v == null) return true;
    const s = String(v).trim().toLowerCase();
    return s === '' || s === 'nan' || s === 'none';
  });
}

function lowerJoin(col) {
  return String(col).trim().toLowerCase();
}

function findCol(columns, predicate) {
  for (const c of columns) {
    if (predicate(String(c))) return c;
  }
  return null;
}

function findColAllTokens(columns, tokens) {
  return findCol(columns, (name) => {
    const n = lowerJoin(name);
    return tokens.every((t) => n.includes(t));
  });
}

function looksLikeNrcWideCasePlusService(frame) {
  if (!frame || !frame.rows || frame.rows.length === 0) return false;
  const { columns } = frame;

  for (const c of columns) {
    const n = lowerJoin(c);
    if (n.includes('service') && (n.includes('1') || String(c).includes('اول') || String(c).includes('أول') || n.includes('اولي'))) {
      return true;
    }
  }

  const hasProductCol = columns.some((c) => lowerJoin(c) === 'product');
  const hasPersonCol =
    columns.includes('personal_identification_number') ||
    findColAllTokens(columns, ['individual', 'id']) != null;
  const hasAmountCol =
    columns.includes('Actual Amount') ||
    columns.some((c) => lowerJoin(c) === 'actual_amount') ||
    findCol(columns, (x) => lowerJoin(x).includes('amount')) != null;
  const hasActualDate = findColAllTokens(columns, ['actual', 'date']) != null;

  return hasProductCol && hasPersonCol && (hasAmountCol || hasActualDate);
}

function splitByExplicitRowType(frame, rowTypeCol, opts = {}) {
  const svc =
    opts.serviceValues ||
    new Set(['service', 'services', 'خدمة', 'خدمه', 'خدمات', 's']);
  const cas =
    opts.caseValues || new Set(['case', 'cases', 'حالة', 'حالات', 'c']);

  if (!frame.columns.includes(rowTypeCol)) {
    throw new Error(`Column not found: ${rowTypeCol}. Columns: ${frame.columns.join(', ')}`);
  }

  const casesRows = [];
  const servicesRows = [];
  const unknown = [];

  for (const row of frame.rows) {
    const raw = row[rowTypeCol];
    const val = raw != null ? String(raw).trim().toLowerCase() : '';
    if (val === '') casesRows.push(row);
    else if (svc.has(val)) servicesRows.push(row);
    else if (cas.has(val)) casesRows.push(row);
    else unknown.push(raw);
  }

  if (unknown.length) {
    const bad = [...new Set(unknown)].slice(0, 20);
    throw new Error(
      `Found unrecognized row type values: ${JSON.stringify(bad)}${unknown.length > 20 ? '...' : ''}`
    );
  }

  return [
    { rows: casesRows, columns: [...frame.columns] },
    { rows: servicesRows, columns: [...frame.columns] },
  ];
}

function splitByServiceColumns(frame, candidateCols) {
  const cols =
    candidateCols ||
    [
      'Product', 'product', 'نوع الخدمة', 'الخدمة', 'الخدمه', 'Service',
      'service type', 'نوع الخدمه',
    ];
  const present = cols.filter((c) => frame.columns.includes(c));
  if (!present.length) {
    return [
      { rows: frame.rows.map((r) => ({ ...r })), columns: [...frame.columns] },
      { rows: [], columns: [] },
    ];
  }

  const casesRows = [];
  const servicesRows = [];
  for (const row of frame.rows) {
    let isService = false;
    for (const c of present) {
      const v = row[c];
      if (v != null) {
        const s = String(v).trim().toLowerCase();
        if (s !== '' && s !== 'nan' && s !== 'none') {
          isService = true;
          break;
        }
      }
    }
    if (isService) servicesRows.push(row);
    else casesRows.push(row);
  }

  return [
    { rows: casesRows, columns: [...frame.columns] },
    { rows: servicesRows, columns: [...frame.columns] },
  ];
}

function splitNrcCashAssistanceWide(frame) {
  if (!frame.rows.length) {
    return [
      { rows: [], columns: [...frame.columns] },
      { rows: [], columns: [] },
    ];
  }

  const { columns, rows } = frame;

  let individualCol = columns.includes('personal_identification_number')
    ? 'personal_identification_number'
    : findColAllTokens(columns, ['individual', 'id']);

  let passportCol = findColAllTokens(columns, ['passport', 'number']);
  if (!passportCol) passportCol = findColAllTokens(columns, ['passport']);

  let nationalIdCol = columns.includes('national_id') ? 'national_id' : null;
  if (!nationalIdCol) {
    for (const c of columns) {
      const n = lowerJoin(c);
      if (n.includes('passport')) continue;
      if (String(c).includes('قومي')) {
        nationalIdCol = c;
        break;
      }
      if (n.includes('national') && n.includes('id') && !n.includes('individual')) {
        nationalIdCol = c;
        break;
      }
    }
  }

  const fileCol = findColAllTokens(columns, ['file', 'number']);
  const nameCol = findCol(columns, (x) => lowerJoin(x) === 'name');
  const nationalityCol = findColAllTokens(columns, ['nationality']);
  const phoneCols = columns.filter((c) => lowerJoin(c).includes('phone'));
  const phoneCol = phoneCols[0] || null;

  const bodCol = findCol(columns, (x) => lowerJoin(x).includes('bod') || String(x).includes('تاريخ الميلاد'));
  let ageCol = findColAllTokens(columns, ['age']);
  if (!ageCol) ageCol = findCol(columns, (x) => String(x).includes('السن'));

  let genderCol = findColAllTokens(columns, ['gender']);
  if (!genderCol) genderCol = findCol(columns, (x) => String(x).includes('النوع') || String(x).includes('اجتماعي'));

  let eduCol = findColAllTokens(columns, ['education']);
  if (!eduCol) eduCol = findCol(columns, (x) => String(x).includes('شهادة') || String(x).includes('تعليم'));

  const socialCol = findColAllTokens(columns, ['social', 'status']);
  const familyCol = findColAllTokens(columns, ['family', 'member']);

  let stateCol = findColAllTokens(columns, ['state']);
  if (!stateCol) stateCol = findCol(columns, (x) => String(x).includes('محافظ'));

  let zoneCol = findColAllTokens(columns, ['zone']);
  if (!zoneCol) zoneCol = findCol(columns, (x) => String(x).includes('مدين'));

  const streetCol = findColAllTokens(columns, ['street']);
  const interviewCol = findCol(columns, (x) => lowerJoin(x).includes('interview'));
  const isRefCol = findCol(columns, (x) => lowerJoin(x).includes('refugee'));

  let serviceCol = null;
  for (const c of columns) {
    const n = lowerJoin(c);
    if (!n.includes('service')) continue;
    if (/\b1\b/.test(n) || String(c).includes('اول') || String(c).includes('أول') || n.includes('اولي')) {
      serviceCol = c;
      break;
    }
  }
  if (!serviceCol) serviceCol = findCol(columns, (x) => lowerJoin(x).includes('service'));
  if (!serviceCol) {
    if (columns.includes('Product')) serviceCol = 'Product';
    else if (columns.includes('product')) serviceCol = 'product';
  }

  const referralCol = findColAllTokens(columns, ['referral']);
  const intervalCol = findColAllTokens(columns, ['interval']);
  const actualDateCol = findColAllTokens(columns, ['actual', 'date']);
  const expectedDateCol = findColAllTokens(columns, ['expected', 'date']);

  let amountCol = columns.find((c) => {
    const n = lowerJoin(c);
    return n.startsWith('amount') || n === 'amount';
  });
  if (!amountCol) amountCol = findCol(columns, (x) => lowerJoin(x).includes('amount'));

  const renameMap = {};
  const ren = (src, dst) => {
    if (src && columns.includes(src) && src !== dst) renameMap[src] = dst;
  };

  ren(individualCol, 'personal_identification_number');
  ren(passportCol, 'Passport Number');
  ren(nationalIdCol, 'national_id');
  ren(fileCol, 'File Number');
  ren(nameCol, 'name');
  ren(nationalityCol, 'Nationality');
  ren(phoneCol, 'phone');
  ren(bodCol, 'BOD');
  ren(ageCol, 'age');
  ren(genderCol, 'gender');
  ren(eduCol, 'Education Type');
  ren(socialCol, 'Social Status');
  ren(familyCol, 'Family members');
  ren(stateCol, 'State');
  ren(zoneCol, 'Zone');
  ren(streetCol, 'Street');
  ren(interviewCol, 'Interview_date');
  ren(isRefCol, 'IsRefugees');

  if (phoneCols.length > 1) {
    const alt = phoneCols[1];
    if (alt) renameMap[alt] = 'phone_alt';
  }

  const applyRename = (row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[renameMap[k] || k] = v;
    }
    return out;
  };

  const casesRows = rows.map(applyRename);
  const casesColumns = [...new Set(casesRows.flatMap((r) => Object.keys(r)))];

  if (!serviceCol) {
    return [
      { rows: casesRows, columns: casesColumns },
      { rows: [], columns: [] },
    ];
  }

  const cellStr = (v) => {
    if (v == null) return '';
    const s = String(v).trim().toLowerCase();
    if (s === 'nan' || s === 'none') return '';
    return String(v).trim();
  };

  const servicesRows = [];
  for (const row of rows) {
    const svcVal = row[serviceCol];
    if (svcVal == null) continue;
    const s = String(svcVal).trim().toLowerCase();
    if (s === '' || s === 'nan' || s === 'none') continue;

    const nat = nationalIdCol ? cellStr(row[nationalIdCol]) : '';
    const pid = individualCol ? cellStr(row[individualCol]) : '';
    const odooPersonKey = nat || pid;

    const svcRow = {
      'Individual ID/National ID': odooPersonKey || null,
      NAME: nameCol ? row[nameCol] : null,
      Product: row[serviceCol],
    };

    const pass = passportCol ? cellStr(row[passportCol]) : '';
    if (pass) svcRow['Passport Number'] = pass;
    if (actualDateCol && row[actualDateCol] != null) svcRow['Actual Date'] = row[actualDateCol];
    if (expectedDateCol && row[expectedDateCol] != null) svcRow['Expected Date'] = row[expectedDateCol];
    if (amountCol && row[amountCol] != null) svcRow['Actual Amount'] = row[amountCol];
    if (referralCol && row[referralCol] != null) svcRow.Referral = row[referralCol];
    if (intervalCol && row[intervalCol] != null) svcRow.Interval = row[intervalCol];

    servicesRows.push(svcRow);
  }

  const servicesColumns = [...new Set(servicesRows.flatMap((r) => Object.keys(r)))];

  return [
    { rows: casesRows, columns: casesColumns },
    { rows: servicesRows, columns: servicesColumns },
  ];
}

function loadCasesAndServicesFrames(buffer, opts = {}) {
  const {
    casesSheet,
    servicesSheet,
    mixedSheet,
    mixedSheetFrame,
    rowTypeCol,
  } = opts;

  if (casesSheet && servicesSheet) {
    return [readSheetAsFrame(buffer, casesSheet), readSheetAsFrame(buffer, servicesSheet)];
  }

  if (mixedSheet) {
    const raw = mixedSheetFrame || readSheetAsFrame(buffer, mixedSheet);
    if (looksLikeNrcWideCasePlusService(raw)) return splitNrcCashAssistanceWide(raw);
    if (rowTypeCol) return splitByExplicitRowType(raw, rowTypeCol);
    return splitByServiceColumns(raw);
  }

  const names = listSheetNames(buffer);
  const namesLower = Object.fromEntries(names.map((n) => [n.toLowerCase(), n]));

  const pick = (...options) => {
    for (const o of options) {
      const key = o.toLowerCase();
      if (namesLower[key]) return namesLower[key];
    }
    return null;
  };

  const cname = pick('cases', 'case', 'الحالات', 'sheet1');
  const sname = pick('services', 'service', 'الخدمات', 'sheet2');

  if (cname && sname && cname !== sname) {
    return [readSheetAsFrame(buffer, cname), readSheetAsFrame(buffer, sname)];
  }

  for (const sheet of names) {
    const probe = probeSheet(buffer, sheet, 2);
    if (looksLikeNrcWideCasePlusService(probe)) {
      const raw = readSheetAsFrame(buffer, sheet);
      return splitNrcCashAssistanceWide(raw);
    }
  }

  if (names.length === 1) {
    const raw = readSheetAsFrame(buffer, names[0]);
    if (looksLikeNrcWideCasePlusService(raw)) return splitNrcCashAssistanceWide(raw);
    if (rowTypeCol) return splitByExplicitRowType(raw, rowTypeCol);
    return splitByServiceColumns(raw);
  }

  throw new Error(
    `Could not infer sheets. Pass cases_sheet and services_sheet, or mixed_sheet. Available: ${names.join(', ')}`
  );
}

module.exports = {
  looksLikeNrcWideCasePlusService,
  splitNrcCashAssistanceWide,
  splitByServiceColumns,
  splitByExplicitRowType,
  loadCasesAndServicesFrames,
};
