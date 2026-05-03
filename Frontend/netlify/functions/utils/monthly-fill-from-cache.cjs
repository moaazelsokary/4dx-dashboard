/**
 * Load PMS/Odoo cache + derived rows from DB and fill department_monthly_data for one objective.
 * Used by config-api (Netlify) and auth-proxy (local dev). Avoids HTTP fetch to metrics-api on :8888.
 */

const sql = require('mssql');

function norm(s) {
  if (s == null) return '';
  return String(s).trim();
}

/** Calendar month key YYYY-MM — stable across timezones for SQL DATE / ISO strings. */
function normMonth(m) {
  if (m == null || m === '') return '';
  if (Object.prototype.toString.call(m) === '[object Date]' && !isNaN(m.getTime())) {
    return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const s = String(m).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const ymd = /^(\d{4})-(\d{2})-\d{2}/.exec(s);
  if (ymd) return `${ymd[1]}-${ymd[2]}`;
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
  } catch (_) {}
  return s;
}

function getDefaultMonthlyPlanningMonths() {
  const months = [];
  for (let year = 2026; year <= 2027; year++) {
    const endMonth = year === 2027 ? 6 : 12;
    for (let mo = 1; mo <= endMonth; mo++) {
      months.push(`${year}-${String(mo).padStart(2, '0')}`);
    }
  }
  return months;
}

function collectMonthsForMapping(mapping, pms, odoo, derived) {
  const set = new Set(getDefaultMonthlyPlanningMonths());
  const add = (raw) => {
    const k = normMonth(raw);
    if (k && /^\d{4}-\d{2}$/.test(k)) set.add(k);
  };

  const usePms =
    (mapping.target_source === 'pms_target' || mapping.actual_source === 'pms_actual') &&
    mapping.pms_project_name &&
    mapping.pms_metric_name;
  if (usePms) {
    const pn = norm(mapping.pms_project_name);
    const mn = norm(mapping.pms_metric_name);
    for (const r of pms || []) {
      if (norm(r.ProjectName) === pn && norm(r.MetricName) === mn) {
        add(r.MonthYear ?? r.Month ?? r.month);
      }
    }
  }

  const useOdoo =
    (mapping.actual_source === 'odoo_services_done' || mapping.actual_source === 'odoo_services_created') &&
    mapping.odoo_project_name;
  if (useOdoo) {
    const op = norm(mapping.odoo_project_name);
    for (const r of odoo || []) {
      if (norm(r.Project ?? r.project) === op) {
        add(r.Month ?? r.MonthYear ?? r.month);
      }
    }
  }

  const useDerived =
    (mapping.target_source === 'derived' || mapping.actual_source === 'derived') && mapping.derived_project_name;
  if (useDerived) {
    const dp = norm(mapping.derived_project_name);
    for (const r of derived || []) {
      if (norm(r.project) === dp) {
        add(r.month ?? r.Month);
      }
    }
  }

  return [...set].sort();
}

/** True if GET monthly should overlay cache-derived values for at least one axis. */
function mappingUsesAutomatedSources(mapping) {
  if (!mapping) return false;
  const autoTarget = mapping.target_source === 'pms_target' || mapping.target_source === 'derived';
  const autoActual =
    mapping.actual_source === 'pms_actual' ||
    mapping.actual_source === 'odoo_services_done' ||
    mapping.actual_source === 'odoo_services_created' ||
    mapping.actual_source === 'derived';
  return autoTarget || autoActual;
}

/**
 * Resolve target/actual from cache rows for one calendar month (same rules as DB fill).
 * @returns {{ targetLive: number|null|undefined, actualLive: number|null|undefined }}
 * `undefined` on an axis means that axis is not driven by PMS/Odoo/derived (leave DB/manual).
 */
function resolveMappedTargetsAndActuals(mapping, monthStr, pms, odoo, derived) {
  const mapProj = norm;
  const mapMonth = r => normMonth(r?.MonthYear ?? r?.Month ?? r?.month);

  let targetLive = undefined;
  let actualLive = undefined;

  if (mapping.target_source === 'pms_target' && mapping.pms_project_name && mapping.pms_metric_name) {
    const pmsRow = pms.find(
      r =>
        mapProj(r.ProjectName) === mapProj(mapping.pms_project_name) &&
        mapProj(r.MetricName) === mapProj(mapping.pms_metric_name) &&
        mapMonth(r) === monthStr
    );
    targetLive = pmsRow?.Target ?? null;
  } else if (mapping.target_source === 'derived' && mapping.derived_project_name && derived.length) {
    const derivedRow = derived.find(
      r =>
        mapProj(r.project) === mapProj(mapping.derived_project_name) &&
        normMonth(r.month ?? r.Month) === monthStr
    );
    targetLive =
      derivedRow?.target != null
        ? derivedRow.target
        : derivedRow?.Target != null
          ? derivedRow.Target
          : null;
  }

  if (mapping.actual_source === 'pms_actual' && mapping.pms_project_name && mapping.pms_metric_name) {
    const pmsRow = pms.find(
      r =>
        mapProj(r.ProjectName) === mapProj(mapping.pms_project_name) &&
        mapProj(r.MetricName) === mapProj(mapping.pms_metric_name) &&
        mapMonth(r) === monthStr
    );
    actualLive = pmsRow?.Actual ?? null;
  } else if (mapping.actual_source === 'odoo_services_done' && mapping.odoo_project_name) {
    const odooRow = odoo.find(
      r =>
        mapProj(r.Project ?? r.project) === mapProj(mapping.odoo_project_name) &&
        normMonth(r.Month ?? r.MonthYear ?? r.month) === monthStr
    );
    actualLive = odooRow?.ServicesDone ?? null;
  } else if (mapping.actual_source === 'odoo_services_created' && mapping.odoo_project_name) {
    const odooRow = odoo.find(
      r =>
        mapProj(r.Project ?? r.project) === mapProj(mapping.odoo_project_name) &&
        normMonth(r.Month ?? r.MonthYear ?? r.month) === monthStr
    );
    actualLive = odooRow?.ServicesCreated ?? null;
  } else if (mapping.actual_source === 'derived' && mapping.derived_project_name && derived.length) {
    const derivedRow = derived.find(
      r =>
        mapProj(r.project) === mapProj(mapping.derived_project_name) &&
        normMonth(r.month ?? r.Month) === monthStr
    );
    if (derivedRow) {
      const a = derivedRow.actual ?? derivedRow.Actual ?? 0;
      const sd = derivedRow.servicesDone ?? derivedRow.ServicesDone ?? 0;
      actualLive = (Number(a) || 0) + (Number(sd) || 0);
    } else {
      actualLive = null;
    }
  }

  return { targetLive, actualLive };
}

function computeDerivedRows(pms, odoo, derivedDef) {
  const def = Array.isArray(derivedDef.definition)
    ? derivedDef.definition
    : JSON.parse(derivedDef.definition || '[]') || [];
  const hasPms = def.some(d => d.source === 'pms');
  const hasOdoo = def.some(d => d.source === 'odoo');
  const source = hasPms && hasOdoo ? 'odoo & pms' : hasOdoo ? 'odoo' : 'pms';
  const months = new Set();
  for (const d of def) {
    if (d.source === 'pms') {
      (pms || [])
        .filter(r => norm(r.ProjectName) === norm(d.project) && norm(r.MetricName) === norm(d.metric || ''))
        .forEach(r => months.add(normMonth(r.MonthYear)));
    } else if (d.source === 'odoo') {
      (odoo || [])
        .filter(r => norm(r.Project) === norm(d.project))
        .forEach(r => months.add(normMonth(r.Month)));
    }
  }
  const rows = [];
  for (const month of [...months].sort()) {
    let target = null;
    let actual = null;
    let servicesCreated = null;
    let servicesDone = null;
    if (hasPms) {
      for (const d of def) {
        if (d.source !== 'pms') continue;
        const m = (pms || []).find(
          r =>
            norm(r.ProjectName) === norm(d.project) &&
            norm(r.MetricName) === norm(d.metric || '') &&
            normMonth(r.MonthYear) === month
        );
        if (m) {
          target = (target ?? 0) + (m.Target ?? 0);
          actual = (actual ?? 0) + (m.Actual ?? 0);
        }
      }
    }
    if (hasOdoo) {
      for (const d of def) {
        if (d.source !== 'odoo') continue;
        const m = (odoo || []).find(r => norm(r.Project) === norm(d.project) && normMonth(r.Month) === month);
        if (m) {
          servicesCreated = (servicesCreated ?? 0) + (m.ServicesCreated ?? 0);
          servicesDone = (servicesDone ?? 0) + (m.ServicesDone ?? 0);
        }
      }
    }
    rows.push({
      source,
      project: derivedDef.project_name,
      metric: null,
      month,
      target: hasPms ? target : null,
      actual: hasPms ? actual : null,
      servicesCreated: hasOdoo ? servicesCreated : null,
      servicesDone: hasOdoo ? servicesDone : null,
    });
  }
  return rows;
}

async function loadMetricsBundleFromPool(pool) {
  const [pmsResult, odooResult, lastResult, derivedResult] = await Promise.all([
    pool.request().query(`
      SELECT project_name AS ProjectName, metric_name AS MetricName, month AS MonthYear,
             target_value AS Target, actual_value AS Actual, updated_at AS UpdatedAt
      FROM dbo.pms_odoo_cache WHERE source = 'pms'
      ORDER BY project_name, metric_name, month
    `),
    pool.request().query(`
      SELECT project_name AS Project, month AS Month, services_created AS ServicesCreated,
             services_done AS ServicesDone, updated_at AS UpdatedAt
      FROM dbo.pms_odoo_cache WHERE source = 'odoo'
      ORDER BY month DESC, project_name
    `),
    pool.request().query(`SELECT MAX(updated_at) AS last_updated FROM dbo.pms_odoo_cache`),
    pool.request().query(`SELECT id, project_name, source, definition FROM dbo.derived_metrics`).catch(() => ({ recordset: [] })),
  ]);
  const pms = pmsResult.recordset || [];
  const odoo = odooResult.recordset || [];
  const lastUpdated = lastResult.recordset[0]?.last_updated || null;
  const derivedDefs = (derivedResult.recordset != null ? derivedResult.recordset : []) || [];
  let derived = [];
  for (const d of derivedDefs) {
    derived = derived.concat(computeDerivedRows(pms, odoo, d));
  }
  return { pms, odoo, derived, derivedDefs, lastUpdated };
}

/**
 * Merge mapping-driven target/actual into department_monthly_data for one BAU objective.
 */
async function fillDepartmentObjectiveMonthlyFromCache(pool, objectiveId) {
  const mappingResult = await pool
    .request()
    .input('objective_id', sql.Int, objectiveId)
    .query(`SELECT * FROM objective_data_source_mapping WHERE department_objective_id = @objective_id`);
  const mapping = mappingResult.recordset[0];
  if (!mapping) return;

  const objInfoResult = await pool
    .request()
    .input('objective_id', sql.Int, objectiveId)
    .query(`SELECT kpi, department_id FROM department_objectives WHERE id = @objective_id`);
  const objInfo = objInfoResult.recordset[0];
  if (!objInfo) return;

  const { pms, odoo, derived } = await loadMetricsBundleFromPool(pool);
  const months = collectMonthsForMapping(mapping, pms, odoo, derived);

  for (const monthStr of months) {
    const monthDate = new Date(`${monthStr}-01T12:00:00.000Z`);

    const { targetLive, actualLive } = resolveMappedTargetsAndActuals(mapping, monthStr, pms, odoo, derived);

    let targetValue =
      mapping.target_source === 'pms_target' || mapping.target_source === 'derived'
        ? targetLive !== undefined
          ? targetLive
          : null
        : undefined;

    if (targetValue != null) {
      const wr = pool.request();
      wr.input('department_objective_id', sql.Int, objectiveId);
      wr.input('month', sql.Date, monthDate);
      wr.input('target_value', sql.Decimal(18, 2), targetValue);
      wr.input('kpi', sql.NVarChar, objInfo.kpi);
      wr.input('department_id', sql.Int, objInfo.department_id);
      await wr.query(`
        MERGE department_monthly_data AS target
        USING (SELECT @department_objective_id AS department_objective_id, @month AS month) AS source
        ON target.department_objective_id = source.department_objective_id AND target.month = source.month
        WHEN MATCHED THEN UPDATE SET target_value = @target_value, kpi = @kpi, department_id = @department_id
        WHEN NOT MATCHED THEN INSERT (department_objective_id, month, target_value, kpi, department_id)
        VALUES (@department_objective_id, @month, @target_value, @kpi, @department_id);
      `);
    }

    const actualFromAutomation =
      mapping.actual_source === 'pms_actual' ||
      mapping.actual_source === 'odoo_services_done' ||
      mapping.actual_source === 'odoo_services_created' ||
      mapping.actual_source === 'derived';

    const actualValue = actualFromAutomation
      ? actualLive !== undefined
        ? actualLive
        : null
      : undefined;

    if (actualFromAutomation) {
      const wr = pool.request();
      wr.input('department_objective_id', sql.Int, objectiveId);
      wr.input('month', sql.Date, monthDate);
      wr.input('actual_value', sql.Decimal(18, 2), actualValue);
      wr.input('kpi', sql.NVarChar, objInfo.kpi);
      wr.input('department_id', sql.Int, objInfo.department_id);
      await wr.query(`
        MERGE department_monthly_data AS target
        USING (SELECT @department_objective_id AS department_objective_id, @month AS month) AS source
        ON target.department_objective_id = source.department_objective_id AND target.month = source.month
        WHEN MATCHED THEN UPDATE SET actual_value = @actual_value, kpi = @kpi, department_id = @department_id
        WHEN NOT MATCHED THEN INSERT (department_objective_id, month, actual_value, kpi, department_id)
        VALUES (@department_objective_id, @month, @actual_value, @kpi, @department_id);
      `);
    }
  }
}

/**
 * GET monthly rows for BAU objective: overlay live cache values whenever mapping uses PMS/Odoo/derived
 * so the UI stays current without requiring refill/sync triggers.
 */
async function getDepartmentMonthlyDataWithLiveMapping(pool, departmentObjectiveId) {
  const mappingResult = await pool
    .request()
    .input('objective_id', sql.Int, departmentObjectiveId)
    .query(`SELECT * FROM objective_data_source_mapping WHERE department_objective_id = @objective_id`);
  const mapping = mappingResult.recordset[0];

  const dbResult = await pool
    .request()
    .input('department_objective_id', sql.Int, departmentObjectiveId)
    .query(`
      SELECT * FROM department_monthly_data
      WHERE department_objective_id = @department_objective_id
      ORDER BY month
    `);
  const dbRows = dbResult.recordset || [];

  if (!mappingUsesAutomatedSources(mapping)) {
    return dbRows;
  }

  const objInfoResult = await pool
    .request()
    .input('objective_id', sql.Int, departmentObjectiveId)
    .query(`SELECT kpi, department_id FROM department_objectives WHERE id = @objective_id`);
  const objInfo = objInfoResult.recordset[0];
  if (!objInfo) return dbRows;

  let bundle;
  try {
    bundle = await loadMetricsBundleFromPool(pool);
  } catch (_) {
    return dbRows;
  }
  const { pms, odoo, derived } = bundle;

  const dbByMonth = new Map();
  for (const row of dbRows) {
    const key = normMonth(row.month);
    if (key && /^\d{4}-\d{2}$/.test(key)) dbByMonth.set(key, row);
  }

  const monthSet = new Set(collectMonthsForMapping(mapping, pms, odoo, derived));
  for (const row of dbRows) {
    const k = normMonth(row.month);
    if (k && /^\d{4}-\d{2}$/.test(k)) monthSet.add(k);
  }
  const monthStrs = [...monthSet].sort();

  const autoTarget = mapping.target_source === 'pms_target' || mapping.target_source === 'derived';
  const autoActual =
    mapping.actual_source === 'pms_actual' ||
    mapping.actual_source === 'odoo_services_done' ||
    mapping.actual_source === 'odoo_services_created' ||
    mapping.actual_source === 'derived';

  const out = [];
  for (const monthStr of monthStrs) {
    const dbRow = dbByMonth.get(monthStr);
    const live = resolveMappedTargetsAndActuals(mapping, monthStr, pms, odoo, derived);

    const target_value = autoTarget
      ? live.targetLive !== undefined
        ? live.targetLive
        : null
      : dbRow?.target_value ?? null;

    const actual_value = autoActual
      ? live.actualLive !== undefined
        ? live.actualLive
        : null
      : dbRow?.actual_value ?? null;

    const monthIso = `${monthStr}-01`;

    out.push({
      ...(dbRow || {}),
      id: dbRow?.id ?? 0,
      department_objective_id: departmentObjectiveId,
      month: monthIso,
      target_value,
      actual_value,
      kpi: dbRow?.kpi ?? objInfo.kpi,
      department_id: dbRow?.department_id ?? objInfo.department_id,
    });
  }

  return out;
}

module.exports = {
  norm,
  normMonth,
  getDefaultMonthlyPlanningMonths,
  collectMonthsForMapping,
  mappingUsesAutomatedSources,
  resolveMappedTargetsAndActuals,
  computeDerivedRows,
  loadMetricsBundleFromPool,
  fillDepartmentObjectiveMonthlyFromCache,
  getDepartmentMonthlyDataWithLiveMapping,
};
