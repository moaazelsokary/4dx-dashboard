/**
 * Main-plan KPI breakdown: aggregate department Direct objectives by KPI match (BAU and/or Strategic).
 */

function normalizeKPI(kpi) {
  if (!kpi) return '';
  return String(kpi).replace(/^\d+(\.\d+)*\s*/, '').trim();
}

function extractKeywords(kpiText) {
  if (!kpiText) return [];
  const commonWords = ['عدد', 'نسبة', 'معدل', 'مستوى', 'حجم', 'من', 'مع', 'في', 'على', 'إلى', 'و', 'أو', 'ال', 'هذا', 'تلك', 'التي', 'الذي'];
  const words = String(kpiText)
    .toLowerCase()
    .replace(/[^\u0600-\u06FF\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !commonWords.includes(w));
  return words;
}

/** Sum activity_target by department for rows whose KPI fuzzy-matches main plan KPI text. */
function accumulateMatchingRows(rows, kpiRaw, normalizedMainKPI, mainKeywords) {
  const departmentMap = new Map();
  const kpiTrim = (kpiRaw || '').trim();

  for (const row of rows || []) {
    const deptKPIOriginal = String(row.kpi || '').trim();
    const deptKPINormalized = normalizeKPI(row.kpi).trim();
    const deptKPIOriginalLower = deptKPIOriginal.toLowerCase();
    const deptKPINormalizedLower = deptKPINormalized.toLowerCase();

    let isMatch = false;

    if (deptKPINormalizedLower === normalizedMainKPI) {
      isMatch = true;
    } else if (deptKPIOriginalLower === kpiTrim.toLowerCase()) {
      isMatch = true;
    } else if (deptKPIOriginalLower === normalizedMainKPI) {
      isMatch = true;
    } else if (deptKPINormalizedLower === kpiTrim.toLowerCase()) {
      isMatch = true;
    } else if (mainKeywords.length > 0) {
      const deptKeywords = extractKeywords(deptKPINormalizedLower);
      const deptKeywordsSet = new Set(deptKeywords);
      const matchingKeywords = mainKeywords.filter(kw => deptKeywordsSet.has(kw));
      const matchRatio = matchingKeywords.length / Math.max(mainKeywords.length, deptKeywords.length);
      if (matchRatio >= 0.6 && matchingKeywords.length >= 3) {
        isMatch = true;
      } else if (matchingKeywords.length === mainKeywords.length && mainKeywords.length >= 2) {
        isMatch = true;
      }
    } else if (normalizedMainKPI.length > 20 && deptKPINormalizedLower.length > 20) {
      if (deptKPINormalizedLower.includes(normalizedMainKPI) || normalizedMainKPI.includes(deptKPINormalizedLower)) {
        const shorter = Math.min(normalizedMainKPI.length, deptKPINormalizedLower.length);
        const longer = Math.max(normalizedMainKPI.length, deptKPINormalizedLower.length);
        if (shorter / longer >= 0.7) {
          isMatch = true;
        }
      }
    }

    if (isMatch) {
      const deptKey = row.department_id;
      if (!departmentMap.has(deptKey)) {
        departmentMap.set(deptKey, {
          department_id: row.department_id,
          department: row.department,
          department_code: row.department_code,
          sum: 0,
          count: 0,
        });
      }
      const dept = departmentMap.get(deptKey);
      dept.sum += parseFloat(row.activity_target) || 0;
      dept.count += 1;
    }
  }

  return departmentMap;
}

function accumulateLinkedStrategicRows(rows) {
  const departmentMap = new Map();
  for (const row of rows || []) {
    const deptKey = row.department_id;
    if (!departmentMap.has(deptKey)) {
      departmentMap.set(deptKey, {
        department_id: row.department_id,
        department: row.department,
        department_code: row.department_code,
        sum: 0,
        count: 0,
      });
    }
    const dept = departmentMap.get(deptKey);
    dept.sum += parseFloat(row.activity_target) || 0;
    dept.count += 1;
  }
  return departmentMap;
}

function cloneDeptMap(m) {
  const out = new Map();
  for (const [k, v] of m) {
    out.set(k, { ...v });
  }
  return out;
}

function mergeDepartmentMaps(mapBau, mapStrategic) {
  const out = cloneDeptMap(mapBau);
  for (const [k, v] of mapStrategic) {
    if (!out.has(k)) {
      out.set(k, {
        department_id: v.department_id,
        department: v.department,
        department_code: v.department_code,
        sum: v.sum,
        count: v.count,
      });
    } else {
      const e = out.get(k);
      e.sum += v.sum;
      e.count += v.count;
    }
  }
  return out;
}

function mapToBreakdown(departmentMap, annualTarget) {
  const breakdown = Array.from(departmentMap.values()).map(dept => ({
    department: dept.department,
    departmentId: dept.department_id,
    departmentCode: dept.department_code,
    sum: dept.sum,
    directSum: dept.sum,
    indirectSum: 0,
    directCount: dept.count,
    indirectCount: 0,
    percentage: annualTarget > 0 ? (dept.sum / annualTarget) * 100 : 0,
  }));
  breakdown.sort((a, b) => String(a.department).localeCompare(String(b.department)));
  return breakdown;
}

async function fetchStrategicRowsLinkedToMain(pool, sql, mainObjectiveId) {
  if (!mainObjectiveId) return [];
  try {
    const r = await pool.request().input('mid', sql.Int, mainObjectiveId).query(`
      SELECT 
        d.id as department_id,
        d.name as department,
        d.code as department_code,
        sdo.kpi,
        sdo.activity_target
      FROM dbo.strategic_department_objectives sdo
      INNER JOIN dbo.departments d ON sdo.department_id = d.id
      WHERE sdo.type = N'Direct'
      AND (
        sdo.main_objective_id = @mid
        OR EXISTS (
          SELECT 1 FROM dbo.strategic_department_objective_main_objectives j
          WHERE j.strategic_department_objective_id = sdo.id AND j.main_objective_id = @mid
        )
      )
    `);
    return r.recordset || [];
  } catch (err) {
    if (err.message && err.message.includes('Invalid object name')) return [];
    throw err;
  }
}

async function fetchAllStrategicDirectRows(pool) {
  try {
    const r = await pool.request().query(`
      SELECT 
        d.id as department_id,
        d.name as department,
        d.code as department_code,
        sdo.kpi,
        sdo.activity_target
      FROM dbo.strategic_department_objectives sdo
      INNER JOIN dbo.departments d ON sdo.department_id = d.id
      WHERE sdo.type = N'Direct'
      ORDER BY d.name, sdo.kpi
    `);
    return r.recordset || [];
  } catch (err) {
    if (err.message && err.message.includes('Invalid object name')) return [];
    throw err;
  }
}

async function fetchAllBauDirectRows(pool) {
  const r = await pool.request().query(`
    SELECT 
      d.id as department_id,
      d.name as department,
      d.code as department_code,
      do.kpi,
      do.activity_target
    FROM department_objectives do
    INNER JOIN departments d ON do.department_id = d.id
    WHERE do.type = 'Direct'
    ORDER BY d.name, do.kpi
  `);
  return r.recordset || [];
}

function parseBreakdownSource(raw) {
  const s = String(raw || 'bau').trim().toLowerCase();
  if (s === 'strategic' || s === 'both') return s;
  return 'bau';
}

async function computeKPIBreakdown(pool, sql, kpi, breakdownSourceRaw) {
  const breakdown_source = parseBreakdownSource(breakdownSourceRaw);

  const mainRequest = pool.request();
  mainRequest.input('kpi', sql.NVarChar, kpi);
  const mainResult = await mainRequest.query(`
    SELECT TOP 1 id, annual_target 
    FROM main_plan_objectives 
    WHERE kpi = @kpi
  `);

  const mainObjective = mainResult.recordset[0];
  const mainObjectiveId = mainObjective?.id || null;
  const annualTarget = mainObjective?.annual_target || 0;

  const normalizedMainKPI = normalizeKPI(kpi).trim().toLowerCase();
  const mainKeywords = extractKeywords(normalizedMainKPI);

  let departmentMap = new Map();

  if (breakdown_source === 'bau' || breakdown_source === 'both') {
    const bauRows = await fetchAllBauDirectRows(pool);
    departmentMap = accumulateMatchingRows(bauRows, kpi, normalizedMainKPI, mainKeywords);
  }

  if (breakdown_source === 'strategic' || breakdown_source === 'both') {
    let stratMap = new Map();
    const linked = await fetchStrategicRowsLinkedToMain(pool, sql, mainObjectiveId);
    if (linked.length > 0) {
      stratMap = accumulateLinkedStrategicRows(linked);
    } else {
      const allS = await fetchAllStrategicDirectRows(pool);
      stratMap = accumulateMatchingRows(allS, kpi, normalizedMainKPI, mainKeywords);
    }

    if (breakdown_source === 'strategic') {
      departmentMap = stratMap;
    } else {
      departmentMap = mergeDepartmentMaps(departmentMap, stratMap);
    }
  }

  const breakdown = mapToBreakdown(departmentMap, annualTarget);

  return {
    kpi,
    annual_target: annualTarget,
    main_objective_id: mainObjectiveId,
    breakdown_source,
    breakdown,
  };
}

module.exports = {
  computeKPIBreakdown,
  normalizeKPI,
};
