/**
 * CM & MEAL KPI rows — project-scoped, month-scoped table data.
 */

const sql = require('mssql');
const {
  validateCmMealProjectCode,
  userCmMealProjects,
  isCmMealProjectRole,
  isCmMealAdminLike,
  CM_MEAL_PROJECT_CODES,
} = require('./utils/cm-meal-projects.cjs');

function normalizeRole(user) {
  return String(user?.role || user?.Role || '').trim();
}

function canReadCmMealKpis(user) {
  if (!user) return false;
  if (isCmMealAdminLike(user.role)) return true;
  if (isCmMealProjectRole(user.role) && userCmMealProjects(user).length > 0) return true;
  const routes = user.allowedRoutes ?? user.allowed_routes;
  if (routes != null && Array.isArray(routes) && routes.some((p) => String(p).split('?')[0] === '/cm-meal-kpis')) {
    return true;
  }
  return false;
}

function canWriteCmMealKpi(user, projectCode) {
  if (!user) return false;
  const code = validateCmMealProjectCode(projectCode);
  if (isCmMealAdminLike(user.role)) return true;
  if (isCmMealProjectRole(user.role)) {
    return userCmMealProjects(user).includes(code);
  }
  return false;
}

function allowedProjectsForUser(user) {
  if (isCmMealAdminLike(user?.role)) return [...CM_MEAL_PROJECT_CODES];
  if (isCmMealProjectRole(user?.role)) return userCmMealProjects(user);
  return [];
}

function mapRow(row) {
  const target = row.target_value != null ? Number(row.target_value) : null;
  const actual = row.actual_value != null ? Number(row.actual_value) : null;
  const difference =
    target != null && actual != null && !Number.isNaN(target) && !Number.isNaN(actual)
      ? target - actual
      : null;
  return {
    id: row.id,
    project_code: row.project_code,
    month_year: row.month_year,
    activity: row.activity,
    target: target,
    actual: actual,
    difference,
    responsible: row.responsible,
    notes: row.notes,
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateMonthYear(raw) {
  const m = String(raw || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) {
    const err = new Error('month_year must be YYYY-MM');
    err.statusCode = 400;
    throw err;
  }
  return m;
}

async function getCmMealKpiRows(pool, { project, month, user }) {
  const projectCode = validateCmMealProjectCode(project);
  const monthYear = validateMonthYear(month);
  const allowed = allowedProjectsForUser(user);
  if (!allowed.includes(projectCode)) {
    const err = new Error('Forbidden: project not assigned to this user');
    err.statusCode = 403;
    throw err;
  }

  const req = pool.request();
  req.input('project_code', sql.NVarChar(64), projectCode);
  req.input('month_year', sql.NVarChar(7), monthYear);
  const result = await req.query(`
    SELECT id, project_code, month_year, activity, target_value, actual_value,
           responsible, notes, sort_order, created_at, updated_at
    FROM dbo.cm_meal_kpi_rows
    WHERE project_code = @project_code AND month_year = @month_year
    ORDER BY sort_order ASC, id ASC
  `);
  return (result.recordset || []).map(mapRow);
}

async function postCmMealKpiRow(pool, body, user) {
  const projectCode = validateCmMealProjectCode(body.project_code || body.project);
  const monthYear = validateMonthYear(body.month_year || body.month);
  if (!canWriteCmMealKpi(user, projectCode)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  const activity = String(body.activity || '').trim();
  if (!activity) {
    const err = new Error('activity is required');
    err.statusCode = 400;
    throw err;
  }

  const targetRaw = body.target ?? body.target_value;
  const actualRaw = body.actual ?? body.actual_value;
  const target =
    targetRaw === '' || targetRaw == null || targetRaw === undefined ? null : Number(targetRaw);
  const actual =
    actualRaw === '' || actualRaw == null || actualRaw === undefined ? null : Number(actualRaw);
  if (target != null && Number.isNaN(target)) {
    const err = new Error('target must be a number');
    err.statusCode = 400;
    throw err;
  }
  if (actual != null && Number.isNaN(actual)) {
    const err = new Error('actual must be a number');
    err.statusCode = 400;
    throw err;
  }

  const maxReq = pool.request();
  maxReq.input('project_code', sql.NVarChar(64), projectCode);
  maxReq.input('month_year', sql.NVarChar(7), monthYear);
  const maxRes = await maxReq.query(`
    SELECT ISNULL(MAX(sort_order), 0) AS mx FROM dbo.cm_meal_kpi_rows
    WHERE project_code = @project_code AND month_year = @month_year
  `);
  const nextSort = Number(maxRes.recordset?.[0]?.mx || 0) + 1;

  const ins = pool.request();
  ins.input('project_code', sql.NVarChar(64), projectCode);
  ins.input('month_year', sql.NVarChar(7), monthYear);
  ins.input('activity', sql.NVarChar(sql.MAX), activity);
  ins.input('target_value', sql.Decimal(18, 4), target);
  ins.input('actual_value', sql.Decimal(18, 4), actual);
  ins.input('responsible', sql.NVarChar(500), body.responsible ? String(body.responsible).trim() : null);
  ins.input('notes', sql.NVarChar(sql.MAX), body.notes ? String(body.notes).trim() : null);
  ins.input('sort_order', sql.Int, body.sort_order != null ? Number(body.sort_order) : nextSort);

  const result = await ins.query(`
    INSERT INTO dbo.cm_meal_kpi_rows
      (project_code, month_year, activity, target_value, actual_value, responsible, notes, sort_order)
    OUTPUT INSERTED.*
    VALUES (@project_code, @month_year, @activity, @target_value, @actual_value, @responsible, @notes, @sort_order)
  `);
  return mapRow(result.recordset[0]);
}

async function putCmMealKpiRow(pool, id, body, user) {
  const rowId = parseInt(id, 10);
  if (!rowId) {
    const err = new Error('Invalid id');
    err.statusCode = 400;
    throw err;
  }

  const existingReq = pool.request();
  existingReq.input('id', sql.Int, rowId);
  const existingRes = await existingReq.query(`
    SELECT id, project_code, month_year, activity, target_value, actual_value, responsible, notes, sort_order
    FROM dbo.cm_meal_kpi_rows WHERE id = @id
  `);
  const existing = existingRes.recordset?.[0];
  if (!existing) {
    const err = new Error('Row not found');
    err.statusCode = 404;
    throw err;
  }

  if (!canWriteCmMealKpi(user, existing.project_code)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  const activity = body.activity !== undefined ? String(body.activity).trim() : existing.activity;
  if (!activity) {
    const err = new Error('activity is required');
    err.statusCode = 400;
    throw err;
  }

  let target = existing.target_value;
  if (body.target !== undefined || body.target_value !== undefined) {
    const raw = body.target ?? body.target_value;
    target = raw === '' || raw == null ? null : Number(raw);
    if (target != null && Number.isNaN(target)) {
      const err = new Error('target must be a number');
      err.statusCode = 400;
      throw err;
    }
  }

  let actual = existing.actual_value;
  if (body.actual !== undefined || body.actual_value !== undefined) {
    const raw = body.actual ?? body.actual_value;
    actual = raw === '' || raw == null ? null : Number(raw);
    if (actual != null && Number.isNaN(actual)) {
      const err = new Error('actual must be a number');
      err.statusCode = 400;
      throw err;
    }
  }

  const responsible =
    body.responsible !== undefined
      ? body.responsible
        ? String(body.responsible).trim()
        : null
      : existing.responsible;
  const notes =
    body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes;

  const upd = pool.request();
  upd.input('id', sql.Int, rowId);
  upd.input('activity', sql.NVarChar(sql.MAX), activity);
  upd.input('target_value', sql.Decimal(18, 4), target);
  upd.input('actual_value', sql.Decimal(18, 4), actual);
  upd.input('responsible', sql.NVarChar(500), responsible);
  upd.input('notes', sql.NVarChar(sql.MAX), notes);

  const result = await upd.query(`
    UPDATE dbo.cm_meal_kpi_rows
    SET activity = @activity, target_value = @target_value, actual_value = @actual_value,
        responsible = @responsible, notes = @notes, updated_at = SYSUTCDATETIME()
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  return mapRow(result.recordset[0]);
}

async function deleteCmMealKpiRow(pool, id, user) {
  const rowId = parseInt(id, 10);
  if (!rowId) {
    const err = new Error('Invalid id');
    err.statusCode = 400;
    throw err;
  }

  const existingReq = pool.request();
  existingReq.input('id', sql.Int, rowId);
  const existingRes = await existingReq.query(`SELECT project_code FROM dbo.cm_meal_kpi_rows WHERE id = @id`);
  const existing = existingRes.recordset?.[0];
  if (!existing) {
    const err = new Error('Row not found');
    err.statusCode = 404;
    throw err;
  }
  if (!canWriteCmMealKpi(user, existing.project_code)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  const del = pool.request();
  del.input('id', sql.Int, rowId);
  await del.query(`DELETE FROM dbo.cm_meal_kpi_rows WHERE id = @id`);
  return { success: true };
}

async function updateCmMealKpiRowsOrder(pool, body, user) {
  const items = body.items || body.order || [];
  if (!Array.isArray(items) || !items.length) {
    const err = new Error('items array required');
    err.statusCode = 400;
    throw err;
  }

  for (const item of items) {
    const rowId = parseInt(item.id, 10);
    const sortOrder = parseInt(item.sort_order, 10);
    if (!rowId || Number.isNaN(sortOrder)) continue;

    const existingReq = pool.request();
    existingReq.input('id', sql.Int, rowId);
    const existingRes = await existingReq.query(`SELECT project_code FROM dbo.cm_meal_kpi_rows WHERE id = @id`);
    const existing = existingRes.recordset?.[0];
    if (!existing) continue;
    if (!canWriteCmMealKpi(user, existing.project_code)) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }

    const upd = pool.request();
    upd.input('id', sql.Int, rowId);
    upd.input('sort_order', sql.Int, sortOrder);
    await upd.query(`
      UPDATE dbo.cm_meal_kpi_rows SET sort_order = @sort_order, updated_at = SYSUTCDATETIME() WHERE id = @id
    `);
  }
  return { success: true };
}

module.exports = {
  canReadCmMealKpis,
  canWriteCmMealKpi,
  getCmMealKpiRows,
  postCmMealKpiRow,
  putCmMealKpiRow,
  deleteCmMealKpiRow,
  updateCmMealKpiRowsOrder,
};
