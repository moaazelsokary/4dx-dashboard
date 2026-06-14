/**
 * MEAL Learning points — structured rows linked to dept objectives or strategic topic activities.
 */

const sql = require('mssql');
const { canAccessMeal, isMealRole } = require('./utils/meal-access.cjs');

const VALID_STATUS = new Set(['completed', 'on_hold', 'pending']);
const VALID_LINK_TYPES = new Set(['strategic_topic_kpi', 'department_objective', 'strategic_department_objective']);

function assertRead(user) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  if (!canAccessMeal(user)) {
    const err = new Error('Insufficient permissions');
    err.statusCode = 403;
    throw err;
  }
}

function assertWrite(user) {
  assertRead(user);
  if (!isMealRole(user.role)) {
    const err = new Error('Only CEO, Admin, or M&E can modify learning points');
    err.statusCode = 403;
    throw err;
  }
}

function normalizeStatus(raw) {
  const s = String(raw || 'pending').trim().toLowerCase().replace(/\s+/g, '_');
  if (s === 'onhold') return 'on_hold';
  if (!VALID_STATUS.has(s)) {
    const err = new Error('status must be completed, on_hold, or pending');
    err.statusCode = 400;
    throw err;
  }
  return s;
}

function auditUsername(user) {
  return user?.username ? String(user.username) : null;
}

function mapLinkRow(row) {
  return {
    id: row.link_row_id ?? row.id,
    link_type: row.link_type,
    linked_id: row.linked_id,
    activity_label: row.activity_label ?? null,
    source_label: row.source_label ?? null,
    kpi_label: row.kpi_label ?? null,
  };
}

function mapPointRow(row, links) {
  return {
    id: row.id,
    learning_point: row.learning_point,
    corrective_action: row.corrective_action,
    status: row.status,
    end_date: row.end_date,
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by_username: row.created_by_username,
    updated_by_username: row.updated_by_username,
    activity_links: links || [],
  };
}

async function fetchLinksForPoints(pool, pointIds) {
  const safeIds = (pointIds || []).map((id) => parseInt(String(id), 10)).filter((n) => Number.isFinite(n) && n > 0);
  if (!safeIds.length) return {};
  const idList = safeIds.join(',');
  const result = await pool.request().query(`
    SELECT
      l.id AS link_row_id,
      l.learning_point_id,
      l.link_type,
      l.linked_id,
      CASE
        WHEN l.link_type = 'strategic_topic_kpi' THEN COALESCE(NULLIF(LTRIM(RTRIM(st.objective_text)), N''), NULLIF(LTRIM(RTRIM(m.objective)), N''), NULLIF(LTRIM(RTRIM(m.kpi)), N''), st.activity)
        WHEN l.link_type = 'department_objective' THEN COALESCE(NULLIF(LTRIM(RTRIM(do.kpi)), N''), do.activity)
        WHEN l.link_type = 'strategic_department_objective' THEN COALESCE(NULLIF(LTRIM(RTRIM(sdo.kpi)), N''), sdo.activity)
      END AS activity_label,
      CASE
        WHEN l.link_type = 'strategic_topic_kpi' THEN st.strategic_topic
        WHEN l.link_type = 'department_objective' THEN d1.code
        WHEN l.link_type = 'strategic_department_objective' THEN d2.code
      END AS source_label,
      CASE
        WHEN l.link_type = 'strategic_topic_kpi' THEN COALESCE(NULLIF(LTRIM(RTRIM(m.kpi)), N''), st.objective_text)
        WHEN l.link_type = 'department_objective' THEN do.kpi
        WHEN l.link_type = 'strategic_department_objective' THEN sdo.kpi
      END AS kpi_label
    FROM meal_learning_point_activity_links l
    LEFT JOIN strategic_topic_kpi_rows st ON l.link_type = 'strategic_topic_kpi' AND l.linked_id = st.id
    LEFT JOIN main_plan_objectives m ON st.main_objective_id = m.id
    LEFT JOIN department_objectives do ON l.link_type = 'department_objective' AND l.linked_id = do.id
    LEFT JOIN departments d1 ON do.department_id = d1.id
    LEFT JOIN strategic_department_objectives sdo ON l.link_type = 'strategic_department_objective' AND l.linked_id = sdo.id
    LEFT JOIN departments d2 ON sdo.department_id = d2.id
    WHERE l.learning_point_id IN (${idList})
    ORDER BY l.id ASC
  `);
  const byPoint = {};
  for (const row of result.recordset || []) {
    const pid = row.learning_point_id;
    if (!byPoint[pid]) byPoint[pid] = [];
    byPoint[pid].push(mapLinkRow(row));
  }
  return byPoint;
}

async function listMealLearningPoints(pool, user) {
  assertRead(user);
  const result = await pool.request().query(`
    SELECT id, learning_point, corrective_action, status, end_date, sort_order,
           created_at, updated_at, created_by_username, updated_by_username
    FROM meal_learning_points
    ORDER BY sort_order ASC, id ASC
  `);
  const rows = result.recordset || [];
  const linksByPoint = await fetchLinksForPoints(pool, rows.map((r) => r.id));
  return rows.map((r) => mapPointRow(r, linksByPoint[r.id] || []));
}

function parseActivityLinks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const linkType = String(item.link_type || '').trim();
    const linkedId = parseInt(String(item.linked_id ?? ''), 10);
    if (!VALID_LINK_TYPES.has(linkType) || !Number.isFinite(linkedId) || linkedId <= 0) continue;
    out.push({ link_type: linkType, linked_id: linkedId });
  }
  return out;
}

async function replaceActivityLinks(pool, learningPointId, links) {
  const del = pool.request();
  del.input('learning_point_id', sql.Int, learningPointId);
  await del.query(`DELETE FROM meal_learning_point_activity_links WHERE learning_point_id = @learning_point_id`);
  for (const link of links) {
    const ins = pool.request();
    ins.input('learning_point_id', sql.Int, learningPointId);
    ins.input('link_type', sql.NVarChar, link.link_type);
    ins.input('linked_id', sql.Int, link.linked_id);
    await ins.query(`
      INSERT INTO meal_learning_point_activity_links (learning_point_id, link_type, linked_id)
      VALUES (@learning_point_id, @link_type, @linked_id)
    `);
  }
}

async function getNextSortOrder(pool) {
  const r = await pool.request().query(`SELECT ISNULL(MAX(sort_order), 0) + 1 AS next_sort FROM meal_learning_points`);
  return r.recordset?.[0]?.next_sort ?? 1;
}

async function createMealLearningPoint(pool, body, user) {
  assertWrite(user);
  const learningPoint = String(body.learning_point || '').trim();
  if (!learningPoint) {
    const err = new Error('learning_point is required');
    err.statusCode = 400;
    throw err;
  }
  const status = normalizeStatus(body.status);
  const correctiveAction = body.corrective_action != null ? String(body.corrective_action).trim() || null : null;
  const endDate = body.end_date ? String(body.end_date).slice(0, 10) : null;
  const sortOrder = body.sort_order != null ? parseInt(body.sort_order, 10) : await getNextSortOrder(pool);
  const links = parseActivityLinks(body.activity_links);
  const username = auditUsername(user);

  const req = pool.request();
  req.input('learning_point', sql.NVarChar(sql.MAX), learningPoint);
  req.input('corrective_action', sql.NVarChar(sql.MAX), correctiveAction);
  req.input('status', sql.NVarChar, status);
  req.input('end_date', sql.Date, endDate || null);
  req.input('sort_order', sql.Int, Number.isFinite(sortOrder) ? sortOrder : 0);
  req.input('created_by_username', sql.NVarChar, username);
  req.input('updated_by_username', sql.NVarChar, username);

  const ins = await req.query(`
    INSERT INTO meal_learning_points (
      learning_point, corrective_action, status, end_date, sort_order,
      created_by_username, updated_by_username
    )
    OUTPUT INSERTED.id
    VALUES (
      @learning_point, @corrective_action, @status, @end_date, @sort_order,
      @created_by_username, @updated_by_username
    )
  `);
  const newId = ins.recordset[0]?.id;
  await replaceActivityLinks(pool, newId, links);
  const linksByPoint = await fetchLinksForPoints(pool, [newId]);
  const rowRes = await pool.request().input('id', sql.Int, newId).query(`
    SELECT id, learning_point, corrective_action, status, end_date, sort_order,
           created_at, updated_at, created_by_username, updated_by_username
    FROM meal_learning_points WHERE id = @id
  `);
  return mapPointRow(rowRes.recordset[0], linksByPoint[newId] || []);
}

async function updateMealLearningPoint(pool, id, body, user) {
  assertWrite(user);
  const existing = await pool.request().input('id', sql.Int, id).query(`
    SELECT id FROM meal_learning_points WHERE id = @id
  `);
  if (!existing.recordset?.[0]) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }

  const updates = [];
  const req = pool.request();
  req.input('id', sql.Int, id);
  const username = auditUsername(user);

  if (body.learning_point !== undefined) {
    const lp = String(body.learning_point || '').trim();
    if (!lp) {
      const err = new Error('learning_point cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    req.input('learning_point', sql.NVarChar(sql.MAX), lp);
    updates.push('learning_point = @learning_point');
  }
  if (body.corrective_action !== undefined) {
    const ca = body.corrective_action == null ? null : String(body.corrective_action).trim() || null;
    req.input('corrective_action', sql.NVarChar(sql.MAX), ca);
    updates.push('corrective_action = @corrective_action');
  }
  if (body.status !== undefined) {
    req.input('status', sql.NVarChar, normalizeStatus(body.status));
    updates.push('status = @status');
  }
  if (body.end_date !== undefined) {
    const ed = body.end_date ? String(body.end_date).slice(0, 10) : null;
    req.input('end_date', sql.Date, ed);
    updates.push('end_date = @end_date');
  }
  if (body.sort_order !== undefined) {
    req.input('sort_order', sql.Int, parseInt(body.sort_order, 10));
    updates.push('sort_order = @sort_order');
  }

  if (updates.length > 0) {
    req.input('updated_by_username', sql.NVarChar, username);
    updates.push('updated_at = SYSUTCDATETIME()');
    updates.push('updated_by_username = @updated_by_username');
    await req.query(`UPDATE meal_learning_points SET ${updates.join(', ')} WHERE id = @id`);
  }

  if (body.activity_links !== undefined) {
    await replaceActivityLinks(pool, id, parseActivityLinks(body.activity_links));
  }

  if (updates.length === 0 && body.activity_links === undefined) {
    const err = new Error('No fields to update');
    err.statusCode = 400;
    throw err;
  }

  const linksByPoint = await fetchLinksForPoints(pool, [id]);
  const rowRes = await pool.request().input('id', sql.Int, id).query(`
    SELECT id, learning_point, corrective_action, status, end_date, sort_order,
           created_at, updated_at, created_by_username, updated_by_username
    FROM meal_learning_points WHERE id = @id
  `);
  return mapPointRow(rowRes.recordset[0], linksByPoint[id] || []);
}

async function deleteMealLearningPoint(pool, id, user) {
  assertWrite(user);
  const req = pool.request();
  req.input('id', sql.Int, id);
  const r = await req.query(`DELETE FROM meal_learning_points WHERE id = @id`);
  if (r.rowsAffected?.[0] === 0) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  return { success: true };
}

async function updateMealLearningPointsOrder(pool, body, user) {
  assertWrite(user);
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
    const upd = pool.request();
    upd.input('id', sql.Int, rowId);
    upd.input('sort_order', sql.Int, sortOrder);
    await upd.query(`
      UPDATE meal_learning_points SET sort_order = @sort_order, updated_at = SYSUTCDATETIME() WHERE id = @id
    `);
  }
  return { success: true };
}

module.exports = {
  listMealLearningPoints,
  createMealLearningPoint,
  updateMealLearningPoint,
  deleteMealLearningPoint,
  updateMealLearningPointsOrder,
};
