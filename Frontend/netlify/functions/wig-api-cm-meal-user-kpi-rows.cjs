/**
 * CM & MEAL user KPI rows — per-employee, date-ranged table data.
 */

const sql = require('mssql');
const {
  isCmMealEmployeeRole,
  isCmMealManagerRole,
  isCmMealUserKpiAdminLike,
  userIdFromUser,
} = require('./utils/cm-meal-user-kpi-access.cjs');
const { getManagedEmployeeIds } = require('./utils/cm-meal-manager-employees.cjs');
const { formatDateOut, parseDateField, sqlDateFromRow } = require('./utils/sql-date.cjs');

function canReadCmMealUserKpis(user) {
  if (!user) return false;
  if (isCmMealUserKpiAdminLike(user.role)) return true;
  if (isCmMealEmployeeRole(user.role) || isCmMealManagerRole(user.role)) return true;
  const routes = user.allowedRoutes ?? user.allowed_routes;
  if (routes != null && Array.isArray(routes) && routes.some((p) => String(p).split('?')[0] === '/cm-meal-kpis')) {
    return true;
  }
  return false;
}

async function visibleUserIdsForCaller(pool, user) {
  if (!user) return [];
  if (isCmMealUserKpiAdminLike(user.role)) {
    const r = await pool.request().query(`
      SELECT id FROM users WHERE LOWER(LTRIM(RTRIM(role))) IN ('cm-meal-employee', 'cm-meal-manager')
      ORDER BY id ASC
    `);
    return (r.recordset || []).map((row) => row.id);
  }
  const selfId = userIdFromUser(user);
  if (!selfId) return [];
  if (isCmMealEmployeeRole(user.role)) return [selfId];
  if (isCmMealManagerRole(user.role)) {
    const team = await getManagedEmployeeIds(pool, selfId);
    return [...new Set([selfId, ...team])];
  }
  return [];
}

async function canWriteCmMealUserKpi(pool, user, targetUserId) {
  if (!user) return false;
  const tid = parseInt(String(targetUserId), 10);
  if (!tid) return false;
  if (isCmMealUserKpiAdminLike(user.role)) return true;
  const selfId = userIdFromUser(user);
  if (!selfId) return false;
  if (isCmMealEmployeeRole(user.role)) return tid === selfId;
  if (isCmMealManagerRole(user.role)) {
    const team = await getManagedEmployeeIds(pool, selfId);
    return tid === selfId || team.includes(tid);
  }
  return false;
}

function parseKpiItemsJson(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        kpi: String(item?.kpi ?? '').trim(),
        target:
          item?.target === '' || item?.target == null || item?.target === undefined
            ? null
            : Number(item.target),
        actual:
          item?.actual === '' || item?.actual == null || item?.actual === undefined
            ? null
            : Number(item.actual),
        notes: item?.notes != null ? String(item.notes).trim() || null : null,
      }))
      .filter((item) => item.kpi);
  } catch {
    return [];
  }
}

function legacyKpiItemsFromRow(row) {
  const kpi = row.kpi != null ? String(row.kpi).trim() : '';
  if (!kpi) return [];
  const target = row.target_value != null ? Number(row.target_value) : null;
  const actual = row.actual_value != null ? Number(row.actual_value) : null;
  return [
    {
      kpi,
      target: target != null && !Number.isNaN(target) ? target : null,
      actual: actual != null && !Number.isNaN(actual) ? actual : null,
      notes: row.notes != null ? String(row.notes).trim() || null : null,
    },
  ];
}

function normalizeKpiItemsInput(body) {
  if (body.kpi_items != null) {
    if (!Array.isArray(body.kpi_items)) {
      const err = new Error('kpi_items must be an array');
      err.statusCode = 400;
      throw err;
    }
    const items = body.kpi_items
      .map((item) => {
        const kpi = String(item?.kpi ?? '').trim();
        if (!kpi) return null;
        let target = item?.target;
        if (target === '' || target == null || target === undefined) target = null;
        else {
          target = Number(target);
          if (Number.isNaN(target)) {
            const err = new Error('target must be a number');
            err.statusCode = 400;
            throw err;
          }
        }
        let actual = item?.actual;
        if (actual === '' || actual == null || actual === undefined) actual = null;
        else {
          actual = Number(actual);
          if (Number.isNaN(actual)) {
            const err = new Error('actual must be a number');
            err.statusCode = 400;
            throw err;
          }
        }
        const notes = item?.notes != null ? String(item.notes).trim() || null : null;
        return { kpi, target, actual, notes };
      })
      .filter(Boolean);
    if (!items.length) {
      const err = new Error('At least one KPI is required');
      err.statusCode = 400;
      throw err;
    }
    return items;
  }

  const kpi = body.kpi != null ? String(body.kpi).trim() : '';
  if (!kpi) {
    const err = new Error('At least one KPI is required');
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
  return [
    {
      kpi,
      target,
      actual,
      notes: body.notes ? String(body.notes).trim() : null,
    },
  ];
}

function kpiItemsToJson(items) {
  return JSON.stringify(items);
}

function firstLegacyFields(items) {
  const first = items[0] || {};
  const target = first.target ?? null;
  const actual = first.actual ?? null;
  const difference =
    target != null && actual != null && !Number.isNaN(target) && !Number.isNaN(actual)
      ? target - actual
      : null;
  return {
    kpi: first.kpi || null,
    target,
    actual,
    difference,
    notes: first.notes ?? null,
  };
}

function mapRow(row) {
  let kpiItems = parseKpiItemsJson(row.kpi_items);
  if (!kpiItems.length) kpiItems = legacyKpiItemsFromRow(row);
  const legacy = firstLegacyFields(kpiItems);
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username ?? null,
    activity: row.activity,
    start_date: formatDateOut(row.start_date),
    end_date: formatDateOut(row.end_date),
    kpi_items: kpiItems,
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    kpi: legacy.kpi,
    target: legacy.target,
    actual: legacy.actual,
    difference: legacy.difference,
    responsible: row.responsible,
    notes: legacy.notes,
  };
}

async function getCmMealUserKpiRows(pool, { user_id: filterUserId, user }) {
  if (!canReadCmMealUserKpis(user)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }
  const visible = await visibleUserIdsForCaller(pool, user);
  if (!visible.length) return [];

  let targetIds = visible;
  if (filterUserId != null && String(filterUserId).trim() !== '') {
    const fid = parseInt(String(filterUserId), 10);
    if (!fid || !visible.includes(fid)) {
      const err = new Error('Forbidden: user not in scope');
      err.statusCode = 403;
      throw err;
    }
    targetIds = [fid];
  }

  const idList = targetIds.join(',');
  const result = await pool.request().query(`
    SELECT r.id, r.user_id, u.username, r.kpi, r.activity, r.target_value, r.actual_value,
           r.responsible, r.notes, r.start_date, r.end_date, r.kpi_items, r.sort_order, r.created_at, r.updated_at
    FROM dbo.cm_meal_user_kpi_rows r
    INNER JOIN users u ON u.id = r.user_id
    WHERE r.user_id IN (${idList})
    ORDER BY u.username ASC, r.sort_order ASC, r.id ASC
  `);
  return (result.recordset || []).map(mapRow);
}

async function postCmMealUserKpiRow(pool, body, user) {
  const selfId = userIdFromUser(user);
  let ownerId = body.user_id != null ? parseInt(String(body.user_id), 10) : selfId;
  if (!ownerId) {
    const err = new Error('user_id is required');
    err.statusCode = 400;
    throw err;
  }
  if (!(await canWriteCmMealUserKpi(pool, user, ownerId))) {
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

  const kpiItems = normalizeKpiItemsInput(body);
  const legacy = firstLegacyFields(kpiItems);

  const startDate = body.start_date !== undefined && body.start_date !== null && String(body.start_date).trim() !== ''
    ? parseDateField(body.start_date)
    : null;
  const endDate = body.end_date !== undefined && body.end_date !== null && String(body.end_date).trim() !== ''
    ? parseDateField(body.end_date)
    : null;

  const maxReq = pool.request();
  maxReq.input('user_id', sql.Int, ownerId);
  const maxRes = await maxReq.query(`
    SELECT ISNULL(MAX(sort_order), 0) AS mx FROM dbo.cm_meal_user_kpi_rows WHERE user_id = @user_id
  `);
  const nextSort = Number(maxRes.recordset?.[0]?.mx || 0) + 1;

  const ins = pool.request();
  ins.input('user_id', sql.Int, ownerId);
  ins.input('kpi', sql.NVarChar(1000), legacy.kpi);
  ins.input('activity', sql.NVarChar(sql.MAX), activity);
  ins.input('target_value', sql.Decimal(18, 4), legacy.target);
  ins.input('actual_value', sql.Decimal(18, 4), legacy.actual);
  ins.input('responsible', sql.NVarChar(500), body.responsible ? String(body.responsible).trim() : null);
  ins.input('notes', sql.NVarChar(sql.MAX), legacy.notes);
  ins.input('kpi_items', sql.NVarChar(sql.MAX), kpiItemsToJson(kpiItems));
  ins.input('start_date', sql.Date, startDate);
  ins.input('end_date', sql.Date, endDate);
  ins.input('sort_order', sql.Int, body.sort_order != null ? Number(body.sort_order) : nextSort);

  const result = await ins.query(`
    INSERT INTO dbo.cm_meal_user_kpi_rows
      (user_id, kpi, activity, target_value, actual_value, responsible, notes, kpi_items, start_date, end_date, sort_order)
    OUTPUT INSERTED.*
    VALUES (@user_id, @kpi, @activity, @target_value, @actual_value, @responsible, @notes, @kpi_items, @start_date, @end_date, @sort_order)
  `);
  const row = result.recordset[0];
  const userRes = await pool.request().input('id', sql.Int, ownerId).query(`SELECT username FROM users WHERE id = @id`);
  return mapRow({ ...row, username: userRes.recordset?.[0]?.username });
}

async function putCmMealUserKpiRow(pool, id, body, user) {
  const rowId = parseInt(id, 10);
  if (!rowId) {
    const err = new Error('Invalid id');
    err.statusCode = 400;
    throw err;
  }

  const existingReq = pool.request();
  existingReq.input('id', sql.Int, rowId);
  const existingRes = await existingReq.query(`
    SELECT r.*, u.username FROM dbo.cm_meal_user_kpi_rows r
    INNER JOIN users u ON u.id = r.user_id
    WHERE r.id = @id
  `);
  const existing = existingRes.recordset?.[0];
  if (!existing) {
    const err = new Error('Row not found');
    err.statusCode = 404;
    throw err;
  }

  if (!(await canWriteCmMealUserKpi(pool, user, existing.user_id))) {
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

  let kpiItems;
  if (body.kpi_items != null || body.kpi !== undefined) {
    kpiItems = normalizeKpiItemsInput(body);
  } else {
    kpiItems = parseKpiItemsJson(existing.kpi_items);
    if (!kpiItems.length) kpiItems = legacyKpiItemsFromRow(existing);
  }
  const legacy = firstLegacyFields(kpiItems);

  const startDate =
    body.start_date !== undefined
      ? parseDateField(body.start_date)
      : sqlDateFromRow(existing.start_date);
  const endDate =
    body.end_date !== undefined ? parseDateField(body.end_date) : sqlDateFromRow(existing.end_date);

  const upd = pool.request();
  upd.input('id', sql.Int, rowId);
  upd.input('kpi', sql.NVarChar(1000), legacy.kpi);
  upd.input('activity', sql.NVarChar(sql.MAX), activity);
  upd.input('target_value', sql.Decimal(18, 4), legacy.target);
  upd.input('actual_value', sql.Decimal(18, 4), legacy.actual);
  upd.input('notes', sql.NVarChar(sql.MAX), legacy.notes);
  upd.input('kpi_items', sql.NVarChar(sql.MAX), kpiItemsToJson(kpiItems));
  upd.input('start_date', sql.Date, startDate);
  upd.input('end_date', sql.Date, endDate);

  const result = await upd.query(`
    UPDATE dbo.cm_meal_user_kpi_rows
    SET kpi = @kpi, activity = @activity, target_value = @target_value, actual_value = @actual_value,
        notes = @notes, kpi_items = @kpi_items, start_date = @start_date, end_date = @end_date,
        updated_at = SYSUTCDATETIME()
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  return mapRow({ ...result.recordset[0], username: existing.username });
}

async function deleteCmMealUserKpiRow(pool, id, user) {
  const rowId = parseInt(id, 10);
  if (!rowId) {
    const err = new Error('Invalid id');
    err.statusCode = 400;
    throw err;
  }

  const existingReq = pool.request();
  existingReq.input('id', sql.Int, rowId);
  const existingRes = await existingReq.query(`SELECT user_id FROM dbo.cm_meal_user_kpi_rows WHERE id = @id`);
  const existing = existingRes.recordset?.[0];
  if (!existing) {
    const err = new Error('Row not found');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canWriteCmMealUserKpi(pool, user, existing.user_id))) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  const del = pool.request();
  del.input('id', sql.Int, rowId);
  await del.query(`DELETE FROM dbo.cm_meal_user_kpi_rows WHERE id = @id`);
  return { success: true };
}

async function getCmMealUserKpiTeam(pool, user) {
  if (!canReadCmMealUserKpis(user)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  if (isCmMealManagerRole(user.role)) {
    const selfId = userIdFromUser(user);
    if (!selfId) return [];
    const teamIds = await getManagedEmployeeIds(pool, selfId);
    const allIds = [...new Set([selfId, ...teamIds])];
    const idList = allIds.join(',');
    const result = await pool.request().query(`
      SELECT id, username, role FROM users WHERE id IN (${idList}) ORDER BY username ASC
    `);
    return (result.recordset || []).map((r) => ({
      id: r.id,
      username: r.username,
      role: r.role,
    }));
  }

  const visible = await visibleUserIdsForCaller(pool, user);
  if (!visible.length) return [];
  const idList = visible.join(',');
  const result = await pool.request().query(`
    SELECT id, username, role FROM users WHERE id IN (${idList}) ORDER BY username ASC
  `);
  return (result.recordset || []).map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
  }));
}

async function updateCmMealUserKpiRowsOrder(pool, body, user) {
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
    const existingRes = await existingReq.query(`SELECT user_id FROM dbo.cm_meal_user_kpi_rows WHERE id = @id`);
    const existing = existingRes.recordset?.[0];
    if (!existing) continue;
    if (!(await canWriteCmMealUserKpi(pool, user, existing.user_id))) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }

    const upd = pool.request();
    upd.input('id', sql.Int, rowId);
    upd.input('sort_order', sql.Int, sortOrder);
    await upd.query(`
      UPDATE dbo.cm_meal_user_kpi_rows SET sort_order = @sort_order, updated_at = SYSUTCDATETIME() WHERE id = @id
    `);
  }
  return { success: true };
}

module.exports = {
  canReadCmMealUserKpis,
  canWriteCmMealUserKpi,
  getCmMealUserKpiRows,
  postCmMealUserKpiRow,
  putCmMealUserKpiRow,
  deleteCmMealUserKpiRow,
  getCmMealUserKpiTeam,
  updateCmMealUserKpiRowsOrder,
  visibleUserIdsForCaller,
};
