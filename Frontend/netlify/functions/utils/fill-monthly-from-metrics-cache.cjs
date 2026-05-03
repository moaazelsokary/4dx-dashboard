/**
 * Post-sync: refill department_monthly_data for every objective that has a data-source mapping.
 */

const { fillDepartmentObjectiveMonthlyFromCache } = require('./monthly-fill-from-cache.cjs');

async function fillAllMappedDepartmentObjectivesFromCache(pool) {
  const r = await pool.request().query(`
    SELECT DISTINCT department_objective_id FROM dbo.objective_data_source_mapping
  `);
  for (const row of r.recordset || []) {
    const id = row.department_objective_id;
    if (id != null) {
      await fillDepartmentObjectiveMonthlyFromCache(pool, id);
    }
  }
}

module.exports = { fillAllMappedDepartmentObjectivesFromCache };
