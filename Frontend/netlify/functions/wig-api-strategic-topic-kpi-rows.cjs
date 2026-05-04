/**
 * Strategic topic KPI rows — shared by wig-api (Netlify) and wig-proxy (local).
 * Permissions: all authenticated CEO/Admin/department can read. CEO/Admin full write.
 * Department: POST if associated_departments intersects user departments; PUT same + cannot strip all user depts.
 * DELETE: CEO/Admin only.
 */

const sql = require('mssql');

const STRATEGIC_TOPICS = ['volunteers', 'refugees', 'returnees', 'relief', 'awareness'];
const ALLOWED_STATUS = ['Completed', 'In Progress', 'On Hold'];
const DELIM = '||';

function parseDelimited(value) {
  if (value == null || value === '') return [];
  const s = String(value).trim();
  if (!s) return [];
  return s
    .split(DELIM)
    .map((t) => t.trim())
    .filter(Boolean);
}

function toDelimited(arr) {
  if (!Array.isArray(arr)) return '';
  return arr
    .map((x) => String(x).trim())
    .filter(Boolean)
    .join(DELIM);
}

function normalizeRole(user) {
  if (!user) return '';
  return String(user.role || user.Role || '').trim();
}

function userDeptCodes(user) {
  const raw = user?.departments;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',').map((d) => d.trim()) : [];
  return arr.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
}

function isCeoOrAdmin(user) {
  const r = normalizeRole(user);
  return r === 'CEO' || r === 'Admin';
}

function deptIntersection(userCodes, rowTokens) {
  const row = rowTokens.map((t) => t.toLowerCase());
  return userCodes.filter((c) => row.includes(c));
}

async function loadValidDepartmentCodes(pool) {
  const r = await pool.request().query('SELECT LOWER(LTRIM(RTRIM(code))) AS code FROM departments');
  return new Set((r.recordset || []).map((x) => String(x.code).toLowerCase()));
}

function validateStrategicTopic(topic) {
  const t = String(topic || '').trim().toLowerCase();
  if (!STRATEGIC_TOPICS.includes(t)) {
    const err = new Error(`Invalid strategic_topic. Must be one of: ${STRATEGIC_TOPICS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  return t;
}

function validateStatus(status) {
  const s = String(status || '').trim();
  if (!ALLOWED_STATUS.includes(s)) {
    const err = new Error(`Invalid status. Must be one of: ${ALLOWED_STATUS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  return s;
}

function validateTopicTags(tokens) {
  for (const t of tokens) {
    const x = String(t).trim().toLowerCase();
    if (!STRATEGIC_TOPICS.includes(x)) {
      const err = new Error(`Invalid associated_strategic_topics token: ${t}`);
      err.statusCode = 400;
      throw err;
    }
  }
  if (tokens.length === 0) {
    const err = new Error('associated_strategic_topics must include at least one topic');
    err.statusCode = 400;
    throw err;
  }
  return tokens.map((t) => String(t).trim().toLowerCase());
}

async function validateDepartmentTokens(pool, tokens) {
  const valid = await loadValidDepartmentCodes(pool);
  const normalized = [];
  for (const t of tokens) {
    const c = String(t).trim().toLowerCase();
    if (!valid.has(c)) {
      const err = new Error(`Invalid department code: ${t}`);
      err.statusCode = 400;
      throw err;
    }
    normalized.push(c);
  }
  if (normalized.length === 0) {
    const err = new Error('associated_departments must include at least one department');
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

async function getStrategicTopicKpiRows(pool, strategicTopic) {
  const topic = validateStrategicTopic(strategicTopic);
  const request = pool.request();
  request.input('topic', sql.NVarChar, topic);
  const result = await request.query(`
    SELECT 
      r.*,
      m.kpi AS main_kpi,
      m.objective AS main_objective,
      m.pillar AS main_pillar
    FROM strategic_topic_kpi_rows r
    LEFT JOIN main_plan_objectives m ON r.main_objective_id = m.id
    WHERE r.strategic_topic = @topic
    ORDER BY COALESCE(r.sort_order, 999999) ASC, r.id ASC
  `);
  return result.recordset || [];
}

function assertDeptUserCanMutateRow(user, deptTokens) {
  const codes = userDeptCodes(user);
  if (deptIntersection(codes, deptTokens).length === 0) {
    const err = new Error('You can only modify rows assigned to your department(s)');
    err.statusCode = 403;
    throw err;
  }
}

async function createStrategicTopicKpiRow(pool, body, user) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  const topic = validateStrategicTopic(body.strategic_topic);
  const status = validateStatus(body.status);
  const activity = String(body.activity || '').trim();
  if (!activity) {
    const err = new Error('activity is required');
    err.statusCode = 400;
    throw err;
  }

  const deptTokens = await validateDepartmentTokens(pool, parseDelimited(body.associated_departments));
  const topicTokens = validateTopicTags(parseDelimited(body.associated_strategic_topics));

  const role = normalizeRole(user);
  if (isCeoOrAdmin(user)) {
    // full access
  } else if (role === 'department') {
    assertDeptUserCanMutateRow(user, deptTokens);
  } else {
    const err = new Error('Insufficient permissions');
    err.statusCode = 403;
    throw err;
  }

  const mainObjectiveId =
    body.main_objective_id === undefined || body.main_objective_id === null || body.main_objective_id === ''
      ? null
      : parseInt(body.main_objective_id, 10);
  if (mainObjectiveId != null && Number.isNaN(mainObjectiveId)) {
    const err = new Error('Invalid main_objective_id');
    err.statusCode = 400;
    throw err;
  }

  const objectiveText = body.objective_text != null ? String(body.objective_text).trim() : null;
  const expectedDuration = body.expected_duration != null ? String(body.expected_duration).trim() : null;
  const notes = body.notes != null ? String(body.notes).trim() : null;

  let startDate = null;
  let endDate = null;
  if (body.start_date) {
    startDate = new Date(body.start_date);
    if (Number.isNaN(startDate.getTime())) {
      const err = new Error('Invalid start_date');
      err.statusCode = 400;
      throw err;
    }
  }
  if (body.end_date) {
    endDate = new Date(body.end_date);
    if (Number.isNaN(endDate.getTime())) {
      const err = new Error('Invalid end_date');
      err.statusCode = 400;
      throw err;
    }
  }

  const rMax = pool.request();
  rMax.input('strategic_topic', sql.NVarChar, topic);
  const nextSort = await rMax.query(`
    SELECT ISNULL(MAX(sort_order), 0) + 1 AS n
    FROM strategic_topic_kpi_rows
    WHERE strategic_topic = @strategic_topic
  `);
  const sortOrder = nextSort.recordset[0]?.n != null ? parseInt(nextSort.recordset[0].n, 10) : 1;
  const insRequest = pool.request();
  insRequest.input('strategic_topic', sql.NVarChar, topic);
  insRequest.input('main_objective_id', sql.Int, mainObjectiveId);
  insRequest.input('objective_text', sql.NVarChar, objectiveText || null);
  insRequest.input('activity', sql.NVarChar, activity);
  insRequest.input('expected_duration', sql.NVarChar, expectedDuration || null);
  insRequest.input('start_date', sql.Date, startDate);
  insRequest.input('end_date', sql.Date, endDate);
  insRequest.input('associated_departments', sql.NVarChar, toDelimited(deptTokens));
  insRequest.input('associated_strategic_topics', sql.NVarChar, toDelimited(topicTokens));
  insRequest.input('status', sql.NVarChar, status);
  insRequest.input('notes', sql.NVarChar, notes || null);
  insRequest.input('sort_order', sql.Int, sortOrder);

  const ins = await insRequest.query(`
    INSERT INTO strategic_topic_kpi_rows (
      strategic_topic, main_objective_id, objective_text, activity, expected_duration,
      start_date, end_date, associated_departments, associated_strategic_topics, status, notes, sort_order
    )
    OUTPUT INSERTED.id
    VALUES (
      @strategic_topic, @main_objective_id, @objective_text, @activity, @expected_duration,
      @start_date, @end_date, @associated_departments, @associated_strategic_topics, @status, @notes, @sort_order
    );
  `);
  const newId = ins.recordset[0].id;
  const rows = await getStrategicTopicKpiRows(pool, topic);
  return rows.find((r) => r.id === newId) || rows[0];
}

async function fetchRowById(pool, id) {
  const request = pool.request();
  request.input('id', sql.Int, id);
  const r = await request.query(
    `SELECT * FROM strategic_topic_kpi_rows WHERE id = @id`
  );
  return r.recordset[0] || null;
}

async function updateStrategicTopicKpiRow(pool, id, body, user) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  const existing = await fetchRowById(pool, id);
  if (!existing) {
    const err = new Error('Row not found');
    err.statusCode = 404;
    throw err;
  }

  const role = normalizeRole(user);
  const existingDepts = parseDelimited(existing.associated_departments);

  if (role === 'department') {
    assertDeptUserCanMutateRow(user, existingDepts);
  } else if (!isCeoOrAdmin(user)) {
    const err = new Error('Insufficient permissions');
    err.statusCode = 403;
    throw err;
  }

  let nextDepts = existingDepts;
  if (body.associated_departments !== undefined) {
    nextDepts = await validateDepartmentTokens(pool, parseDelimited(body.associated_departments));
    if (role === 'department') {
      assertDeptUserCanMutateRow(user, nextDepts);
      if (deptIntersection(userDeptCodes(user), nextDepts).length === 0) {
        const err = new Error('Row must remain assigned to at least one of your departments');
        err.statusCode = 400;
        throw err;
      }
    }
  }

  let nextTopics = parseDelimited(existing.associated_strategic_topics);
  if (body.associated_strategic_topics !== undefined) {
    nextTopics = validateTopicTags(parseDelimited(body.associated_strategic_topics));
  }

  const updates = [];
  const request = pool.request();
  request.input('id', sql.Int, id);

  if (body.main_objective_id !== undefined) {
    const mid =
      body.main_objective_id === null || body.main_objective_id === ''
        ? null
        : parseInt(body.main_objective_id, 10);
    if (mid != null && Number.isNaN(mid)) {
      const err = new Error('Invalid main_objective_id');
      err.statusCode = 400;
      throw err;
    }
    request.input('main_objective_id', sql.Int, mid);
    updates.push('main_objective_id = @main_objective_id');
  }
  if (body.objective_text !== undefined) {
    request.input('objective_text', sql.NVarChar, body.objective_text == null ? null : String(body.objective_text));
    updates.push('objective_text = @objective_text');
  }
  if (body.activity !== undefined) {
    const act = String(body.activity || '').trim();
    if (!act) {
      const err = new Error('activity cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    request.input('activity', sql.NVarChar, act);
    updates.push('activity = @activity');
  }
  if (body.expected_duration !== undefined) {
    request.input('expected_duration', sql.NVarChar, body.expected_duration == null ? null : String(body.expected_duration));
    updates.push('expected_duration = @expected_duration');
  }
  if (body.start_date !== undefined) {
    let sd = null;
    if (body.start_date) {
      sd = new Date(body.start_date);
      if (Number.isNaN(sd.getTime())) {
        const err = new Error('Invalid start_date');
        err.statusCode = 400;
        throw err;
      }
    }
    request.input('start_date', sql.Date, sd);
    updates.push('start_date = @start_date');
  }
  if (body.end_date !== undefined) {
    let ed = null;
    if (body.end_date) {
      ed = new Date(body.end_date);
      if (Number.isNaN(ed.getTime())) {
        const err = new Error('Invalid end_date');
        err.statusCode = 400;
        throw err;
      }
    }
    request.input('end_date', sql.Date, ed);
    updates.push('end_date = @end_date');
  }
  if (body.associated_departments !== undefined) {
    request.input('associated_departments', sql.NVarChar, toDelimited(nextDepts));
    updates.push('associated_departments = @associated_departments');
  }
  if (body.associated_strategic_topics !== undefined) {
    request.input('associated_strategic_topics', sql.NVarChar, toDelimited(nextTopics));
    updates.push('associated_strategic_topics = @associated_strategic_topics');
  }
  if (body.status !== undefined) {
    request.input('status', sql.NVarChar, validateStatus(body.status));
    updates.push('status = @status');
  }
  if (body.notes !== undefined) {
    request.input('notes', sql.NVarChar, body.notes == null ? null : String(body.notes));
    updates.push('notes = @notes');
  }
  if (body.sort_order !== undefined && body.sort_order !== null) {
    const so = parseInt(body.sort_order, 10);
    if (!Number.isFinite(so)) {
      const err = new Error('Invalid sort_order');
      err.statusCode = 400;
      throw err;
    }
    request.input('sort_order', sql.Int, so);
    updates.push('sort_order = @sort_order');
  }

  if (updates.length === 0) {
    const err = new Error('No fields to update');
    err.statusCode = 400;
    throw err;
  }

  updates.push('updated_at = GETDATE()');

  await request.query(`
    UPDATE strategic_topic_kpi_rows
    SET ${updates.join(', ')}
    WHERE id = @id
  `);

  const topic = String(existing.strategic_topic).toLowerCase();
  const all = await getStrategicTopicKpiRows(pool, topic);
  return all.find((r) => r.id === id) || null;
}

async function updateStrategicTopicKpiRowsOrder(pool, body, user) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  const topic = validateStrategicTopic(body.strategic_topic);
  const updates = body.updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    const err = new Error('updates array is required');
    err.statusCode = 400;
    throw err;
  }
  const role = normalizeRole(user);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const u of updates) {
      const id = parseInt(u.id, 10);
      const sortOrder = parseInt(u.sort_order, 10);
      if (!Number.isFinite(id) || !Number.isFinite(sortOrder)) {
        const err = new Error('Each update needs numeric id and sort_order');
        err.statusCode = 400;
        throw err;
      }
      const reqFind = new sql.Request(transaction);
      reqFind.input('id', sql.Int, id);
      const found = await reqFind.query('SELECT * FROM strategic_topic_kpi_rows WHERE id = @id');
      const existing = found.recordset[0];
      if (!existing) {
        const err = new Error(`Row not found: ${id}`);
        err.statusCode = 404;
        throw err;
      }
      if (String(existing.strategic_topic).toLowerCase() !== topic) {
        const err = new Error('Row does not belong to this strategic topic');
        err.statusCode = 400;
        throw err;
      }
      const existingDepts = parseDelimited(existing.associated_departments);
      if (role === 'department') {
        assertDeptUserCanMutateRow(user, existingDepts);
      } else if (!isCeoOrAdmin(user)) {
        const err = new Error('Insufficient permissions');
        err.statusCode = 403;
        throw err;
      }
      const rUp = new sql.Request(transaction);
      rUp.input('id', sql.Int, id);
      rUp.input('sort_order', sql.Int, sortOrder);
      await rUp.query('UPDATE strategic_topic_kpi_rows SET sort_order = @sort_order WHERE id = @id');
    }
    await transaction.commit();
    return { success: true };
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

async function deleteStrategicTopicKpiRow(pool, id, user) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  if (!isCeoOrAdmin(user)) {
    const err = new Error('Only CEO or Admin can delete rows');
    err.statusCode = 403;
    throw err;
  }
  const existing = await fetchRowById(pool, id);
  if (!existing) {
    const err = new Error('Row not found');
    err.statusCode = 404;
    throw err;
  }
  const request = pool.request();
  request.input('id', sql.Int, id);
  const result = await request.query('DELETE FROM strategic_topic_kpi_rows WHERE id = @id');
  return { success: true, deletedRows: result.rowsAffected[0] };
}

module.exports = {
  STRATEGIC_TOPICS,
  ALLOWED_STATUS,
  parseDelimited,
  toDelimited,
  getStrategicTopicKpiRows,
  createStrategicTopicKpiRow,
  updateStrategicTopicKpiRow,
  updateStrategicTopicKpiRowsOrder,
  deleteStrategicTopicKpiRow,
};
