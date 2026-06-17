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

function normalizeSkillsArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ({
      name: String(s?.name ?? '').trim(),
      exists: Boolean(s?.exists),
    }))
    .filter((s) => s.name);
}

function normalizeSkillsInput(raw) {
  if (raw == null) return null;
  if (!Array.isArray(raw)) {
    const err = new Error('skills must be an array');
    err.statusCode = 400;
    throw err;
  }
  const out = normalizeSkillsArray(raw);
  return out.length ? JSON.stringify(out) : null;
}

function parseTaskItemsJson(raw) {
  if (raw == null || raw === '') return [];
  let parsed;
  if (Array.isArray(raw)) {
    parsed = raw;
  } else {
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => ({
      task: String(item?.task ?? '').trim(),
      workload_percent:
        item?.workload_percent === '' || item?.workload_percent == null || item?.workload_percent === undefined
          ? null
          : Number(item.workload_percent),
      technical_skills: normalizeSkillsArray(item?.technical_skills),
      soft_skills: normalizeSkillsArray(item?.soft_skills),
    }))
    .filter((item) => item.task);
}

function reconcileTaskItems(parsedItems, row) {
  const legacyItems = legacyTaskItemsFromRow(row);
  if (!parsedItems.length) return legacyItems;
  if (legacyItems.length <= parsedItems.length) return parsedItems;

  return legacyItems.map((legacy, index) => {
    const current = parsedItems[index];
    if (!current) return legacy;
    return {
      task: legacy.task,
      workload_percent: current.workload_percent ?? legacy.workload_percent,
      technical_skills: current.technical_skills?.length ? current.technical_skills : legacy.technical_skills,
      soft_skills: current.soft_skills?.length ? current.soft_skills : legacy.soft_skills,
    };
  });
}

function parseTaskLines(tasks) {
  if (!tasks?.trim()) return [];
  return String(tasks)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function legacyTaskItemsFromRow(row) {
  const lines = parseTaskLines(row.tasks);
  const technical = parseSkillsJson(row.technical_skills);
  const soft = parseSkillsJson(row.soft_skills);
  const workload = row.workload_percent != null ? Number(row.workload_percent) : null;
  if (!lines.length) {
    if (workload == null && !technical.length && !soft.length) return [];
    return [
      {
        task: '—',
        workload_percent: workload,
        technical_skills: technical,
        soft_skills: soft,
      },
    ];
  }
  return lines.map((task, index) => ({
    task,
    workload_percent: index === 0 ? workload : null,
    technical_skills: index === 0 ? technical : [],
    soft_skills: index === 0 ? soft : [],
  }));
}

function normalizeTaskItemsInput(body) {
  if (body.task_items != null) {
    if (!Array.isArray(body.task_items)) {
      const err = new Error('task_items must be an array');
      err.statusCode = 400;
      throw err;
    }
    const items = body.task_items
      .map((item, index) => {
        const task = String(item?.task ?? '').trim();
        if (!task) {
          if (body.task_items.length > 1) {
            const err = new Error(`Task ${index + 1} requires a name`);
            err.statusCode = 400;
            throw err;
          }
          return null;
        }
        let workload = item?.workload_percent;
        if (workload === '' || workload == null || workload === undefined) workload = null;
        else {
          workload = parseWorkloadPercent(workload);
        }
        return {
          task,
          workload_percent: workload,
          technical_skills: normalizeSkillsArray(item?.technical_skills),
          soft_skills: normalizeSkillsArray(item?.soft_skills),
        };
      })
      .filter(Boolean);
    if (!items.length) {
      const err = new Error('At least one task is required');
      err.statusCode = 400;
      throw err;
    }
    return items;
  }

  const tasks = body.tasks ? parseTaskLines(String(body.tasks)) : [];
  const workload = body.workload_percent !== undefined ? parseWorkloadPercent(body.workload_percent) : null;
  const technical = normalizeSkillsArray(body.technical_skills);
  const soft = normalizeSkillsArray(body.soft_skills);
  if (!tasks.length) {
    const err = new Error('At least one task is required');
    err.statusCode = 400;
    throw err;
  }
  return tasks.map((task, index) => ({
    task,
    workload_percent: index === 0 ? workload : null,
    technical_skills: index === 0 ? technical : [],
    soft_skills: index === 0 ? soft : [],
  }));
}

function taskItemsToJson(items) {
  return JSON.stringify(items);
}

function firstLegacyTaskFields(items) {
  const first = items[0] || {};
  return {
    tasks: items.map((i) => i.task).join('\n') || null,
    workload_percent: first.workload_percent ?? null,
    technical_skills: first.technical_skills?.length ? JSON.stringify(first.technical_skills) : null,
    soft_skills: first.soft_skills?.length ? JSON.stringify(first.soft_skills) : null,
  };
}

function mapRow(row) {
  const taskItems = reconcileTaskItems(parseTaskItemsJson(row.task_items), row);
  const legacy = firstLegacyTaskFields(taskItems);
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username ?? null,
    kpi: String(row.kpi || '').trim(),
    job_title: String(row.job_title || '').trim(),
    responsibilities: row.responsibilities ?? null,
    task_items: taskItems,
    tasks: legacy.tasks,
    workload_percent: legacy.workload_percent,
    technical_skills: parseSkillsJson(legacy.technical_skills ?? row.technical_skills),
    soft_skills: parseSkillsJson(legacy.soft_skills ?? row.soft_skills),
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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
           r.workload_percent, r.technical_skills, r.soft_skills, r.task_items,
           r.sort_order, r.created_at, r.updated_at
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

  const kpi = String(body.kpi || '').trim() || '—';
  const jobTitle = String(body.job_title || '').trim();
  if (!jobTitle) {
    const err = new Error('job_title is required');
    err.statusCode = 400;
    throw err;
  }

  const taskItems = normalizeTaskItemsInput(body);
  const legacy = firstLegacyTaskFields(taskItems);

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
  ins.input('tasks', sql.NVarChar(sql.MAX), legacy.tasks);
  ins.input('workload_percent', sql.Decimal(5, 2), legacy.workload_percent);
  ins.input('technical_skills', sql.NVarChar(sql.MAX), legacy.technical_skills);
  ins.input('soft_skills', sql.NVarChar(sql.MAX), legacy.soft_skills);
  ins.input('task_items', sql.NVarChar(sql.MAX), taskItemsToJson(taskItems));
  ins.input('sort_order', sql.Int, body.sort_order != null ? Number(body.sort_order) : nextSort);

  const result = await ins.query(`
    INSERT INTO dbo.cm_meal_user_role_rows
      (user_id, kpi, job_title, responsibilities, tasks, workload_percent, technical_skills, soft_skills, task_items, sort_order)
    OUTPUT INSERTED.*
    VALUES (@user_id, @kpi, @job_title, @responsibilities, @tasks, @workload_percent, @technical_skills, @soft_skills, @task_items, @sort_order)
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

  const kpi =
    body.kpi !== undefined ? String(body.kpi).trim() || '—' : String(existing.kpi || '—').trim() || '—';
  const jobTitle =
    body.job_title !== undefined ? String(body.job_title).trim() : String(existing.job_title).trim();
  if (!jobTitle) {
    const err = new Error('job_title is required');
    err.statusCode = 400;
    throw err;
  }

  let taskItems;
  if (body.task_items != null || body.tasks !== undefined) {
    taskItems = normalizeTaskItemsInput(body);
  } else {
    taskItems = reconcileTaskItems(parseTaskItemsJson(existing.task_items), existing);
  }
  const legacy = firstLegacyTaskFields(taskItems);

  const responsibilities =
    body.responsibilities !== undefined
      ? body.responsibilities
        ? String(body.responsibilities).trim()
        : null
      : existing.responsibilities;

  const upd = pool.request();
  upd.input('id', sql.Int, rowId);
  upd.input('kpi', sql.NVarChar(1000), kpi);
  upd.input('job_title', sql.NVarChar(500), jobTitle);
  upd.input('responsibilities', sql.NVarChar(sql.MAX), responsibilities);
  upd.input('tasks', sql.NVarChar(sql.MAX), legacy.tasks);
  upd.input('workload_percent', sql.Decimal(5, 2), legacy.workload_percent);
  upd.input('technical_skills', sql.NVarChar(sql.MAX), legacy.technical_skills);
  upd.input('soft_skills', sql.NVarChar(sql.MAX), legacy.soft_skills);
  upd.input('task_items', sql.NVarChar(sql.MAX), taskItemsToJson(taskItems));

  const result = await upd.query(`
    UPDATE dbo.cm_meal_user_role_rows
    SET kpi = @kpi, job_title = @job_title, responsibilities = @responsibilities, tasks = @tasks,
        workload_percent = @workload_percent, technical_skills = @technical_skills, soft_skills = @soft_skills,
        task_items = @task_items, updated_at = SYSUTCDATETIME()
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
