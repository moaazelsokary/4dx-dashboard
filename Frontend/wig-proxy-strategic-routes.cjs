/**
 * Strategic KPI department objectives — parallel to BAU routes; no RASCI validation.
 * Mounted from wig-proxy.cjs before monthly-data routes.
 */
const { normalizeStrategicDbRow } = require('./netlify/functions/utils/normalize-strategic-db-row.cjs');
const { collectJwtSecrets } = require('./netlify/functions/utils/jwt-secrets.cjs');
const strategicTopicKpiRows = require('./netlify/functions/wig-api-strategic-topic-kpi-rows.cjs');

function getAuthorizationHeader(req) {
  if (!req.headers) return null;
  const direct = req.headers.authorization || req.headers.Authorization;
  if (direct) return direct;
  const key = Object.keys(req.headers).find((k) => k.toLowerCase() === 'authorization');
  return key ? req.headers[key] : null;
}

function decodeWigUser(req, jwt) {
  const authHeader = getAuthorizationHeader(req);
  if (!authHeader) {
    if (process.env.WIG_DEBUG_AUTH === '1') console.warn('[wig-proxy strategic] No Authorization header');
    return null;
  }
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token) return null;
  const secrets = collectJwtSecrets();
  let lastErr = null;
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret);
    } catch (err) {
      lastErr = err;
    }
  }
  console.warn('[wig-proxy strategic] JWT verify failed (tried', secrets.length, 'secret(s)):', lastErr?.message || lastErr);
  return null;
}

function parseStrategicTarget(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { activity_target: 0, target_type: 'number' };
  }
  const s = String(raw).trim();
  const isPct = s.includes('%');
  const cleaned = s.replace(/%/g, '').replace(/,/g, '').replace(/</g, '').replace(/>/g, '').trim();
  const num = parseFloat(cleaned);
  const v = Number.isFinite(num) ? Math.round(num * 10) / 10 : 0;
  return { activity_target: v, target_type: isPct ? 'percentage' : 'number' };
}

function normalizeStrategicActivityTarget(body) {
  const raw = body.activity_target;
  let tt = body.target_type;
  if (typeof raw === 'string' || (raw != null && typeof raw !== 'number' && String(raw).includes('%'))) {
    const p = parseStrategicTarget(raw);
    return { activity_target: p.activity_target, target_type: tt || p.target_type };
  }
  const n = parseFloat(raw);
  const v = Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
  return { activity_target: v, target_type: tt || 'number' };
}

function strategicSensitiveColumnsAllowed(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'ceo';
}

function stripStrategicAdminFields(row, role) {
  if (!row || strategicSensitiveColumnsAllowed(role)) return row;
  const o = { ...row };
  o.meeting_notes = null;
  o.me_e = null;
  o.active = null;
  o.notes = null;
  return o;
}

module.exports = function registerStrategicWigRoutes(app, { sql, getPool, setNoCacheHeaders, handleError, jwt }) {
  app.get('/api/wig/strategic-department-objectives', async (req, res) => {
    try {
      const pool = await getPool();
      const request = pool.request();
      let query = `
        SELECT s.*, d.name as department_name, d.code as department_code
        FROM strategic_department_objectives s
        INNER JOIN departments d ON s.department_id = d.id
        WHERE 1=1
      `;
      if (req.query.department_id) {
        request.input('department_id', sql.Int, parseInt(req.query.department_id, 10));
        query += ' AND s.department_id = @department_id';
      }
      if (req.query.department_code) {
        request.input('department_code', sql.NVarChar, req.query.department_code);
        query += ' AND d.code = @department_code';
      }
      query += ' ORDER BY d.code, COALESCE(s.sort_order, s.id), s.kpi, s.activity';
      setNoCacheHeaders(res);
      const result = await request.query(query);
      const user = decodeWigUser(req, jwt);
      const role = user?.role ?? user?.Role ?? '';
      res.json(
        result.recordset.map((r) => stripStrategicAdminFields(normalizeStrategicDbRow(r), role))
      );
    } catch (error) {
      handleError(res, error, 'Error getting strategic department objectives');
    }
  });

  app.post('/api/wig/strategic-department-objectives', async (req, res) => {
    try {
      const pool = await getPool();
      const body = req.body || {};
      const t = normalizeStrategicActivityTarget(body);
      const nullableNvarchar = (v) => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        return s === '' ? null : s;
      };
      const activity = nullableNvarchar(body.activity !== undefined ? body.activity : body.kpi);
      const kpi = nullableNvarchar(body.kpi !== undefined ? body.kpi : body.activity);
      const type = body.type || 'Direct';
      const responsible = body.responsible_person != null ? body.responsible_person : '';
      const mov = body.mov != null ? body.mov : '';
      const isME = type === 'M&E' || type === 'M&E MOV';
      let meFields = '';
      let meValues = '';
      const request = pool.request();
      request.input('main_objective_id', sql.Int, body.main_objective_id || null);
      request.input('department_id', sql.Int, body.department_id);
      request.input('kpi', sql.NVarChar, kpi);
      request.input('activity', sql.NVarChar, activity);
      request.input('type', sql.NVarChar, type);
      request.input('activity_target', sql.Decimal(18, 2), t.activity_target);
      request.input('target_type', sql.NVarChar, t.target_type);
      request.input('responsible_person', sql.NVarChar, responsible);
      request.input('mov', sql.NVarChar, mov);
      request.input('definition', sql.NVarChar, body.definition ?? null);
      request.input('measurement_aspect', sql.NVarChar, body.measurement_aspect ?? null);
      request.input('meeting_notes', sql.NVarChar, body.meeting_notes ?? null);
      request.input('me_e', sql.NVarChar, body.me_e ?? null);
      request.input('active', sql.NVarChar, body.active ?? null);
      request.input('notes', sql.NVarChar, body.notes ?? null);

      if (isME) {
        request.input('me_target', sql.Decimal(18, 2), body.me_target || null);
        request.input('me_actual', sql.Decimal(18, 2), body.me_actual || null);
        request.input('me_frequency', sql.NVarChar, body.me_frequency || null);
        request.input('me_start_date', sql.Date, body.me_start_date || null);
        request.input('me_end_date', sql.Date, body.me_end_date || null);
        request.input('me_tool', sql.NVarChar, body.me_tool || null);
        request.input('me_responsible', sql.NVarChar, body.me_responsible || null);
        request.input('me_folder_link', sql.NVarChar, body.me_folder_link || null);
        meFields = ', me_target, me_actual, me_frequency, me_start_date, me_end_date, me_tool, me_responsible, me_folder_link';
        meValues = ', @me_target, @me_actual, @me_frequency, @me_start_date, @me_end_date, @me_tool, @me_responsible, @me_folder_link';
      }

      if (!body.sort_order) {
        const maxSortRequest = pool.request();
        maxSortRequest.input('department_id', sql.Int, body.department_id);
        const maxSortResult = await maxSortRequest.query(`
          SELECT ISNULL(MAX(sort_order), 0) + 1 AS next_sort_order
          FROM strategic_department_objectives WHERE department_id = @department_id
        `);
        request.input('sort_order', sql.Int, maxSortResult.recordset[0].next_sort_order);
      } else {
        request.input('sort_order', sql.Int, body.sort_order);
      }

      const insertResult = await request.query(`
        INSERT INTO strategic_department_objectives (
          main_objective_id, department_id, kpi, activity, type, activity_target, target_type,
          responsible_person, mov, sort_order,
          definition, measurement_aspect, meeting_notes, me_e, active, notes
          ${meFields}
        ) VALUES (
          @main_objective_id, @department_id, @kpi, @activity, @type, @activity_target, @target_type,
          @responsible_person, @mov, @sort_order,
          @definition, @measurement_aspect, @meeting_notes, @me_e, @active, @notes
          ${meValues}
        );
        SELECT SCOPE_IDENTITY() AS id;
      `);
      const newId = insertResult.recordset[0].id;
      const sel = pool.request();
      sel.input('id', sql.Int, newId);
      const row = await sel.query(`
        SELECT s.*, d.name as department_name, d.code as department_code
        FROM strategic_department_objectives s
        INNER JOIN departments d ON s.department_id = d.id
        WHERE s.id = @id
      `);
      const user = decodeWigUser(req, jwt);
      const role = user?.role ?? user?.Role ?? '';
      res.json(stripStrategicAdminFields(normalizeStrategicDbRow(row.recordset[0]), role));
    } catch (error) {
      handleError(res, error, 'Error creating strategic department objective');
    }
  });

  app.put('/api/wig/strategic-department-objectives/:id', async (req, res) => {
    try {
      const pool = await getPool();
      const id = parseInt(req.params.id, 10);
      const request = pool.request();
      request.input('id', sql.Int, id);
      const updates = [];
      const textFields = [
        'kpi', 'activity', 'type', 'target_type', 'responsible_person', 'mov',
        'definition', 'measurement_aspect', 'meeting_notes', 'me_e', 'active', 'notes',
      ];
      const body = req.body || {};
      const nullableNvarcharUpdate = (v) => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        return s === '' ? null : s;
      };
      for (const field of textFields) {
        if (body[field] !== undefined) {
          const val =
            field === 'kpi' || field === 'activity'
              ? nullableNvarcharUpdate(body[field])
              : body[field];
          request.input(field, sql.NVarChar, val);
          updates.push(`${field} = @${field}`);
        }
      }
      if (body.main_objective_id !== undefined) {
        request.input('main_objective_id', sql.Int, body.main_objective_id || null);
        updates.push('main_objective_id = @main_objective_id');
      }
      if (body.department_id !== undefined) {
        request.input('department_id', sql.Int, body.department_id);
        updates.push('department_id = @department_id');
      }
      if (body.activity_target !== undefined) {
        const t = normalizeStrategicActivityTarget({ activity_target: body.activity_target, target_type: body.target_type });
        request.input('activity_target', sql.Decimal(18, 2), t.activity_target);
        updates.push('activity_target = @activity_target');
        if (body.target_type === undefined) {
          request.input('target_type', sql.NVarChar, t.target_type);
          updates.push('target_type = @target_type');
        }
      }
      if (body.sort_order !== undefined) {
        request.input('sort_order', sql.Int, body.sort_order);
        updates.push('sort_order = @sort_order');
      }
      const meFields = ['me_target', 'me_actual', 'me_frequency', 'me_start_date', 'me_end_date', 'me_tool', 'me_responsible', 'me_folder_link'];
      for (const f of meFields) {
        if (body[f] !== undefined) {
          if (f.includes('date')) request.input(f, sql.Date, body[f] || null);
          else if (f === 'me_target' || f === 'me_actual') request.input(f, sql.Decimal(18, 2), body[f] || null);
          else request.input(f, sql.NVarChar, body[f] || null);
          updates.push(`${f} = @${f}`);
        }
      }
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      await request.query(`
        UPDATE strategic_department_objectives SET ${updates.join(', ')}, updated_at = GETDATE() WHERE id = @id
      `);
      const sel = pool.request();
      sel.input('id', sql.Int, id);
      const row = await sel.query(`
        SELECT s.*, d.name as department_name, d.code as department_code
        FROM strategic_department_objectives s
        INNER JOIN departments d ON s.department_id = d.id
        WHERE s.id = @id
      `);
      const user = decodeWigUser(req, jwt);
      const role = user?.role ?? user?.Role ?? '';
      res.json(stripStrategicAdminFields(normalizeStrategicDbRow(row.recordset[0]), role));
    } catch (error) {
      handleError(res, error, 'Error updating strategic department objective');
    }
  });

  app.delete('/api/wig/strategic-department-objectives/:id', async (req, res) => {
    try {
      const user = decodeWigUser(req, jwt);
      const pool = await getPool();
      const id = parseInt(req.params.id, 10);
      if (user && user.role === 'department' && user.departments && user.departments.length > 0) {
        const checkRequest = pool.request();
        checkRequest.input('id', sql.Int, id);
        const checkResult = await checkRequest.query(`
          SELECT s.id, d.code as department_code
          FROM strategic_department_objectives s
          INNER JOIN departments d ON s.department_id = d.id
          WHERE s.id = @id
        `);
        if (checkResult.recordset.length === 0) {
          return res.status(404).json({ error: 'Strategic objective not found', success: false });
        }
        const objectiveDeptCode = checkResult.recordset[0].department_code?.toLowerCase();
        const userDeptCode = user.departments[0]?.toLowerCase();
        if (objectiveDeptCode !== userDeptCode) {
          return res.status(403).json({ error: 'You can only delete objectives from your own department', success: false });
        }
      }
      const request = pool.request();
      request.input('id', sql.Int, id);
      const result = await request.query('DELETE FROM strategic_department_objectives WHERE id = @id');
      res.json({ success: true, deletedRows: result.rowsAffected[0] });
    } catch (error) {
      handleError(res, error, 'Error deleting strategic department objective');
    }
  });

  app.post('/api/wig/strategic-department-objectives/update-order', async (req, res) => {
    try {
      const pool = await getPool();
      const { updates } = req.body || {};
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'Updates array is required' });
      }
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        for (const update of updates) {
          const r = new sql.Request(transaction);
          r.input('id', sql.Int, update.id);
          r.input('sort_order', sql.Int, update.sort_order);
          await r.query('UPDATE strategic_department_objectives SET sort_order = @sort_order, updated_at = GETDATE() WHERE id = @id');
        }
        await transaction.commit();
        res.json({ success: true });
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    } catch (error) {
      handleError(res, error, 'Error updating strategic department objectives order');
    }
  });

  app.get('/api/wig/strategic-monthly-data/:strategicDeptObjId', async (req, res) => {
    try {
      setNoCacheHeaders(res);
      const pool = await getPool();
      const request = pool.request();
      request.input('sid', sql.Int, parseInt(req.params.strategicDeptObjId, 10));
      const result = await request.query(`
        SELECT * FROM strategic_department_monthly_data WHERE strategic_department_objective_id = @sid ORDER BY updated_at DESC, month
      `);
      res.json(result.recordset);
    } catch (error) {
      handleError(res, error, 'Error getting strategic monthly data');
    }
  });

  app.post('/api/wig/strategic-monthly-data', async (req, res) => {
    try {
      const pool = await getPool();
      const request = pool.request();
      request.input('strategic_department_objective_id', sql.Int, req.body.strategic_department_objective_id);
      request.input('month', sql.Date, req.body.month);
      request.input('target_value', sql.Decimal(18, 2), req.body.target_value || null);
      request.input('actual_value', sql.Decimal(18, 2), req.body.actual_value || null);
      const result = await request.query(`
        MERGE strategic_department_monthly_data AS target
        USING (SELECT @strategic_department_objective_id AS sid, @month AS month) AS source
        ON target.strategic_department_objective_id = source.sid AND target.month = source.month
        WHEN MATCHED THEN UPDATE SET target_value = @target_value, actual_value = @actual_value, updated_at = GETDATE()
        WHEN NOT MATCHED THEN INSERT (strategic_department_objective_id, month, target_value, actual_value)
        VALUES (@strategic_department_objective_id, @month, @target_value, @actual_value)
        OUTPUT INSERTED.*;
      `);
      res.json(result.recordset[0]);
    } catch (error) {
      handleError(res, error, 'Error creating/updating strategic monthly data');
    }
  });

  app.get('/api/wig/strategic-department-objectives/:id/main-objectives', async (req, res) => {
    try {
      const pool = await getPool();
      const request = pool.request();
      request.input('sid', sql.Int, parseInt(req.params.id, 10));
      const result = await request.query(`
        SELECT m.main_objective_id, m.sort_order, o.kpi, o.objective, o.target
        FROM strategic_department_objective_main_objectives m
        INNER JOIN main_plan_objectives o ON o.id = m.main_objective_id
        WHERE m.strategic_department_objective_id = @sid
        ORDER BY m.sort_order, m.main_objective_id
      `);
      res.json(result.recordset);
    } catch (error) {
      handleError(res, error, 'Error listing strategic main objective links');
    }
  });

  app.put('/api/wig/strategic-department-objectives/:id/main-objectives', async (req, res) => {
    try {
      const pool = await getPool();
      const sid = parseInt(req.params.id, 10);
      const ids = Array.isArray(req.body.main_objective_ids) ? req.body.main_objective_ids : [];
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const del = new sql.Request(transaction);
        del.input('sid', sql.Int, sid);
        await del.query('DELETE FROM strategic_department_objective_main_objectives WHERE strategic_department_objective_id = @sid');
        let order = 0;
        for (const mid of ids) {
          const ins = new sql.Request(transaction);
          ins.input('sid', sql.Int, sid);
          ins.input('mid', sql.Int, mid);
          ins.input('ord', sql.Int, order++);
          await ins.query(`
            INSERT INTO strategic_department_objective_main_objectives (strategic_department_objective_id, main_objective_id, sort_order)
            VALUES (@sid, @mid, @ord)
          `);
        }
        await transaction.commit();
        res.json({ success: true });
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    } catch (error) {
      handleError(res, error, 'Error updating strategic main objective links');
    }
  });

  function wigUserFromJwt(req) {
    const decoded = decodeWigUser(req, jwt);
    if (!decoded) return null;
    return {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      departments: decoded.departments || [],
    };
  }

  function sendTopicKpiStatus(res, err) {
    const sc = err.statusCode;
    const code = sc >= 400 && sc < 600 ? sc : 500;
    res.status(code).json({ error: err.message || 'Request failed' });
  }

  app.get('/api/wig/strategic-topic-kpi-rows', async (req, res) => {
    try {
      setNoCacheHeaders(res);
      const user = wigUserFromJwt(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const r = user.role || '';
      if (!['CEO', 'Admin', 'department'].includes(r)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      const topic = req.query.strategic_topic;
      if (!topic) {
        return res.status(400).json({ error: 'strategic_topic query parameter is required' });
      }
      const pool = await getPool();
      const rows = await strategicTopicKpiRows.getStrategicTopicKpiRows(pool, topic);
      res.json(rows);
    } catch (error) {
      if (error.statusCode) return sendTopicKpiStatus(res, error);
      handleError(res, error, 'Error loading strategic topic KPI rows');
    }
  });

  app.post('/api/wig/strategic-topic-kpi-rows/update-order', async (req, res) => {
    try {
      setNoCacheHeaders(res);
      const user = wigUserFromJwt(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const pool = await getPool();
      const result = await strategicTopicKpiRows.updateStrategicTopicKpiRowsOrder(pool, req.body, user);
      res.json(result);
    } catch (error) {
      if (error.statusCode) return sendTopicKpiStatus(res, error);
      handleError(res, error, 'Error updating strategic topic KPI order');
    }
  });

  app.post('/api/wig/strategic-topic-kpi-rows', async (req, res) => {
    try {
      const user = wigUserFromJwt(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const pool = await getPool();
      const row = await strategicTopicKpiRows.createStrategicTopicKpiRow(pool, req.body, user);
      res.json(row);
    } catch (error) {
      if (error.statusCode) return sendTopicKpiStatus(res, error);
      handleError(res, error, 'Error creating strategic topic KPI row');
    }
  });

  app.put('/api/wig/strategic-topic-kpi-rows/:id', async (req, res) => {
    try {
      const user = wigUserFromJwt(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid id' });
      }
      const pool = await getPool();
      const row = await strategicTopicKpiRows.updateStrategicTopicKpiRow(pool, id, req.body, user);
      res.json(row);
    } catch (error) {
      if (error.statusCode) return sendTopicKpiStatus(res, error);
      handleError(res, error, 'Error updating strategic topic KPI row');
    }
  });

  app.delete('/api/wig/strategic-topic-kpi-rows/:id', async (req, res) => {
    try {
      const user = wigUserFromJwt(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid id' });
      }
      const pool = await getPool();
      const result = await strategicTopicKpiRows.deleteStrategicTopicKpiRow(pool, id, user);
      res.json(result);
    } catch (error) {
      if (error.statusCode) return sendTopicKpiStatus(res, error);
      handleError(res, error, 'Error deleting strategic topic KPI row');
    }
  });
};
