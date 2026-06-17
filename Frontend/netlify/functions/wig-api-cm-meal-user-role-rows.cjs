/**
 * CM & MEAL user role rows — per-employee roles & responsibilities.
 */

const sql = require('mssql');
const {
  canReadCmMealUserKpis,
  canWriteCmMealUserKpi,
  visibleUserIdsForCaller,
} = require('./wig-api-cm-meal-user-kpi-rows.cjs');

function parseSkillsJson(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeSkillsInput(raw) {
  if (raw == null) return null;
  if (!Array.isArray(raw)) {
    const err = new Error('skills must be an array');
    err.statusCode = 400;
    throw err;
  }
  const out = raw
    .map((s) => ({
      name: String(s?.name ?? '').trim(),
      exists: Boolean(s?.exists),
    }))
    .filter((s) => s.name);
  return out.length ? JSON.stringify(out) : null;
}

function parseWorkloadPercent(raw) {
  if (raw === '' || raw == null || raw === undefined) return null;
  const n = Number(raw);
  if (Number.isNaN(n)) {
    const err = new Error('workload_percent must be a number');
    err.statusCode = 400;
    throw err;
  }
  if (n <= 0 || n >= 101) {
    const err = new Error('workload_percent must be greater than 0 and less than 101');
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function mapRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username ?? null,
    kpi: String(row.kpi || '').trim(),
    job_title: String(row.job_title || '').trim(),
    responsibilities: row.responsibilities ?? null,
    tasks: row.tasks ?? null,
    workload_percent: row.workload_percent != null ? Number(row.workload_percent) : null,
    technical_skills: parseSkillsJson(row.technical_skills),
    soft_skills: parseSkillsJson(row.soft_skills),
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getCmMealUserRoleRows(pool, { user_id: filterUserId, user }) {
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
    SELECT r.id, r.user_id, u.username, r.kpi, r.job_title, r.responsibilities, r.tasks,
           r.workload_percent, r.technical_skills, r.soft_skills, r.sort_order, r.created_at, r.updated_at
    FROM dbo.cm_meal_user_role_rows r
    INNER JOIN users u ON u.id = r.user_id
    WHERE r.user_id IN (${idList})
    ORDER BY u.username ASC, r.sort_order ASC, r.id ASC
  `);
  return (result.recordset || []).map(mapRow);
}

async function postCmMealUserRoleRow(pool, body, user) {
  const selfId = require('./utils/cm-meal-user-kpi-access.cjs').userIdFromUser(user);
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

  const kpi = String(body.kpi || '').trim();
  const jobTitle = String(body.job_title || '').trim();
  if (!kpi) {
    const err = new Error('kpi is required');
    err.statusCode = 400;
    throw err;
  }
  if (!jobTitle) {
    const err = new Error('job_title is required');
    err.statusCode = 400;
    throw err;
  }

  const workload = parseWorkloadPercent(body.workload_percent);

  const maxReq = pool.request();
  maxReq.input('user_id', sql.Int, ownerId);
  const maxRes = await maxReq.query(`
    SELECT ISNULL(MAX(sort_order), 0) AS mx FROM dbo.cm_meal_user_role_rows WHERE user_id = @user_id
  `);
  const nextSort = Number(maxRes.recordset?.[0]?.mx || 0) + 1;

  const ins = pool.request();
  ins.input('user_id', sql.Int, ownerId);
  ins.input('kpi', sql.NVarChar(1000), kpi);
  ins.input('job_title', sql.NVarChar(500), jobTitle);
  ins.input('responsibilities', sql.NVarChar(sql.MAX), body.responsibilities ? String(body.responsibilities).trim() : null);
  ins.input('tasks', sql.NVarChar(sql.MAX), body.tasks ? String(body.tasks).trim() : null);
  ins.input('workload_percent', sql.Decimal(5, 2), workload);
  ins.input('technical_skills', sql.NVarChar(sql.MAX), normalizeSkillsInput(body.technical_skills));
  ins.input('soft_skills', sql.NVarChar(sql.MAX), normalizeSkillsInput(body.soft_skills));
  ins.input('sort_order', sql.Int, body.sort_order != null ? Number(body.sort_order) : nextSort);

  const result = await ins.query(`
    INSERT INTO dbo.cm_meal_user_role_rows
      (user_id, kpi, job_title, responsibilities, tasks, workload_percent, technical_skills, soft_skills, sort_order)
    OUTPUT INSERTED.*
    VALUES (@user_id, @kpi, @job_title, @responsibilities, @tasks, @workload_percent, @technical_skills, @soft_skills, @sort_order)
  `);
  const row = result.recordset[0];
  const userRes = await pool.request().input('id', sql.Int, ownerId).query(`SELECT username FROM users WHERE id = @id`);
  return mapRow({ ...row, username: userRes.recordset?.[0]?.username });
}

async function putCmMealUserRoleRow(pool, id, body, user) {
  const rowId = parseInt(id, 10);
  if (!rowId) {
    const err = new Error('Invalid id');
    err.statusCode = 400;
    throw err;
  }

  const existingReq = pool.request();
  existingReq.input('id', sql.Int, rowId);
  const existingRes = await existingReq.query(`
    SELECT r.*, u.username FROM dbo.cm_meal_user_role_rows r
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

  const kpi = body.kpi !== undefined ? String(body.kpi).trim() : String(existing.kpi).trim();
  const jobTitle =
    body.job_title !== undefined ? String(body.job_title).trim() : String(existing.job_title).trim();
  if (!kpi) {
    const err = new Error('kpi is required');
    err.statusCode = 400;
    throw err;
  }
  if (!jobTitle) {
    const err = new Error('job_title is required');
    err.statusCode = 400;
    throw err;
  }

  let workload = existing.workload_percent;
  if (body.workload_percent !== undefined) {
    workload = parseWorkloadPercent(body.workload_percent);
  }

  const responsibilities =
    body.responsibilities !== undefined
      ? body.responsibilities
        ? String(body.responsibilities).trim()
        : null
      : existing.responsibilities;
  const tasks =
    body.tasks !== undefined ? (body.tasks ? String(body.tasks).trim() : null) : existing.tasks;
  const technicalSkills =
    body.technical_skills !== undefined
      ? normalizeSkillsInput(body.technical_skills)
      : existing.technical_skills;
  const softSkills =
    body.soft_skills !== undefined ? normalizeSkillsInput(body.soft_skills) : existing.soft_skills;

  const upd = pool.request();
  upd.input('id', sql.Int, rowId);
  upd.input('kpi', sql.NVarChar(1000), kpi);
  upd.input('job_title', sql.NVarChar(500), jobTitle);
  upd.input('responsibilities', sql.NVarChar(sql.MAX), responsibilities);
  upd.input('tasks', sql.NVarChar(sql.MAX), tasks);
  upd.input('workload_percent', sql.Decimal(5, 2), workload);
  upd.input('technical_skills', sql.NVarChar(sql.MAX), technicalSkills);
  upd.input('soft_skills', sql.NVarChar(sql.MAX), softSkills);

  const result = await upd.query(`
    UPDATE dbo.cm_meal_user_role_rows
    SET kpi = @kpi, job_title = @job_title, responsibilities = @responsibilities, tasks = @tasks,
        workload_percent = @workload_percent, technical_skills = @technical_skills, soft_skills = @soft_skills,
        updated_at = SYSUTCDATETIME()
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  return mapRow({ ...result.recordset[0], username: existing.username });
}

async function deleteCmMealUserRoleRow(pool, id, user) {
  const rowId = parseInt(id, 10);
  if (!rowId) {
    const err = new Error('Invalid id');
    err.statusCode = 400;
    throw err;
  }

  const existingReq = pool.request();
  existingReq.input('id', sql.Int, rowId);
  const existingRes = await existingReq.query(`SELECT user_id FROM dbo.cm_meal_user_role_rows WHERE id = @id`);
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
  await del.query(`DELETE FROM dbo.cm_meal_user_role_rows WHERE id = @id`);
  return { success: true };
}

async function updateCmMealUserRoleRowsOrder(pool, body, user) {
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
    const existingRes = await existingReq.query(`SELECT user_id FROM dbo.cm_meal_user_role_rows WHERE id = @id`);
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
      UPDATE dbo.cm_meal_user_role_rows SET sort_order = @sort_order, updated_at = SYSUTCDATETIME() WHERE id = @id
    `);
  }
  return { success: true };
}

module.exports = {
  getCmMealUserRoleRows,
  postCmMealUserRoleRow,
  putCmMealUserRoleRow,
  deleteCmMealUserRoleRow,
  updateCmMealUserRoleRowsOrder,
};
