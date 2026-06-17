/**
 * Manager ↔ employee assignments for CM user KPIs.
 */

const sql = require('mssql');
const { isCmMealManagerRole, isCmMealEmployeeRole } = require('./cm-meal-user-kpi-access.cjs');

async function getManagedEmployeeIds(pool, managerUserId) {
  const id = parseInt(String(managerUserId), 10);
  if (!id) return [];
  const req = pool.request();
  req.input('manager_user_id', sql.Int, id);
  const result = await req.query(`
    SELECT employee_user_id FROM dbo.cm_meal_manager_employees
    WHERE manager_user_id = @manager_user_id
    ORDER BY employee_user_id ASC
  `);
  return (result.recordset || []).map((r) => r.employee_user_id);
}

async function replaceManagedEmployees(pool, managerUserId, employeeIds) {
  const managerId = parseInt(String(managerUserId), 10);
  if (!managerId) {
    const err = new Error('Invalid manager user id');
    err.statusCode = 400;
    throw err;
  }
  const ids = [...new Set((employeeIds || []).map((x) => parseInt(String(x), 10)).filter((n) => n > 0))];

  if (ids.length) {
    const idList = ids.join(',');
    const check = await pool.request().query(`
      SELECT id, role FROM users WHERE id IN (${idList})
    `);
    const rows = check.recordset || [];
    if (rows.length !== ids.length) {
      const err = new Error('One or more employee user ids not found');
      err.statusCode = 400;
      throw err;
    }
    for (const row of rows) {
      if (!isCmMealEmployeeRole(row.role)) {
        const err = new Error('Managed users must have cm-meal-employee role');
        err.statusCode = 400;
        throw err;
      }
    }
  }

  const del = pool.request();
  del.input('manager_user_id', sql.Int, managerId);
  await del.query(`DELETE FROM dbo.cm_meal_manager_employees WHERE manager_user_id = @manager_user_id`);

  for (const empId of ids) {
    if (empId === managerId) continue;
    const ins = pool.request();
    ins.input('manager_user_id', sql.Int, managerId);
    ins.input('employee_user_id', sql.Int, empId);
    await ins.query(`
      INSERT INTO dbo.cm_meal_manager_employees (manager_user_id, employee_user_id)
      VALUES (@manager_user_id, @employee_user_id)
    `);
  }
  return ids;
}

async function enrichAccountsWithManagedEmployees(pool, accounts) {
  const managers = (accounts || []).filter((a) => isCmMealManagerRole(a.role));
  if (!managers.length) return accounts;
  const managerIds = managers.map((m) => m.id);
  const idList = managerIds.join(',');
  const result = await pool.request().query(`
    SELECT manager_user_id, employee_user_id
    FROM dbo.cm_meal_manager_employees
    WHERE manager_user_id IN (${idList})
  `);
  const byManager = {};
  for (const row of result.recordset || []) {
    const mid = row.manager_user_id;
    if (!byManager[mid]) byManager[mid] = [];
    byManager[mid].push(row.employee_user_id);
  }
  return accounts.map((a) => ({
    ...a,
    cm_meal_managed_employee_ids: isCmMealManagerRole(a.role) ? byManager[a.id] || [] : [],
  }));
}

module.exports = {
  getManagedEmployeeIds,
  replaceManagedEmployees,
  enrichAccountsWithManagedEmployees,
};
