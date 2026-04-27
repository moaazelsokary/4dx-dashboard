/**
 * CRUD for dbo.powerbi_dashboards (admin). GET list allowed for any authenticated user (embed URLs for /powerbi).
 */
const sql = require('mssql');

const ID_RE = /^[a-z0-9_]{2,64}$/;

const DEFAULT_ROWS = [
  { id: 'volunteers', name: 'Volunteers Dashboard', title: 'Volunteers Dashboard', sort_order: 10 },
  { id: 'humanitarian_aid', name: 'Humanitarian Aid Dashboard', title: 'Humanitarian Aid Dashboard', sort_order: 20 },
  { id: 'sawa', name: 'Sawa Dashboard', title: 'Sawa Dashboard', sort_order: 30 },
  { id: 'frontex', name: 'FRONTEX Dashboard', title: 'FRONTEX Dashboard', sort_order: 40 },
];

function mapRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    embed_url: row.embed_url != null ? String(row.embed_url) : '',
    sort_order: row.sort_order != null ? Number(row.sort_order) : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function seedIfEmpty(pool) {
  const c = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.powerbi_dashboards`);
  const n = c.recordset[0]?.n ?? 0;
  if (n > 0) return;
  for (const r of DEFAULT_ROWS) {
    const req = pool.request();
    req.input('id', sql.NVarChar(64), r.id);
    req.input('name', sql.NVarChar(256), r.name);
    req.input('title', sql.NVarChar(512), r.title);
    req.input('sort_order', sql.Int, r.sort_order);
    await req.query(`
      INSERT INTO dbo.powerbi_dashboards (id, name, title, embed_url, sort_order)
      VALUES (@id, @name, @title, N'', @sort_order)
    `);
  }
}

function validateId(id) {
  if (!id || typeof id !== 'string') return 'id is required';
  const s = id.trim().toLowerCase();
  if (!ID_RE.test(s)) return 'id must be 2–64 chars: lowercase letters, digits, underscore';
  return null;
}

/**
 * @param {object} opts
 * @param {import('mssql').ConnectionPool} opts.pool
 * @param {string} opts.method
 * @param {string|null} opts.slug - dashboard id for PUT/DELETE
 * @param {object} opts.body
 * @param {object} opts.user - JWT user
 * @param {boolean} opts.isAdmin
 */
async function handlePowerbiDashboardsCrud(opts) {
  const { pool, method, slug, body = {}, user, isAdmin } = opts;

  try {
    await seedIfEmpty(pool);
  } catch (e) {
    if (e.message && e.message.includes('Invalid object name')) {
      return {
        statusCode: 503,
        json: { success: false, error: 'powerbi_dashboards table missing. Run database/powerbi-dashboards.sql' },
      };
    }
    throw e;
  }

  if (method === 'GET' && !slug) {
    const result = await pool.request().query(`
      SELECT id, name, title, embed_url, sort_order, created_at, updated_at
      FROM dbo.powerbi_dashboards
      ORDER BY sort_order ASC, id ASC
    `);
    const data = (result.recordset || []).map(mapRow);
    return { statusCode: 200, json: { success: true, data } };
  }

  if (!isAdmin) {
    return { statusCode: 403, json: { success: false, error: 'Admin or CEO role required' } };
  }

  if (method === 'POST' && !slug) {
    const idErr = validateId(body.id);
    if (idErr) return { statusCode: 400, json: { success: false, error: idErr } };
    const nid = String(body.id).trim().toLowerCase();
    if (!body.name || !String(body.name).trim()) {
      return { statusCode: 400, json: { success: false, error: 'name is required' } };
    }
    if (!body.title || !String(body.title).trim()) {
      return { statusCode: 400, json: { success: false, error: 'title is required' } };
    }
    const embed_url = body.embed_url != null ? String(body.embed_url) : '';
    const sort_order =
      body.sort_order !== undefined && body.sort_order !== null ? parseInt(String(body.sort_order), 10) : 999;
    const ins = pool.request();
    ins.input('id', sql.NVarChar(64), nid);
    ins.input('name', sql.NVarChar(256), String(body.name).trim());
    ins.input('title', sql.NVarChar(512), String(body.title).trim());
    ins.input('embed_url', sql.NVarChar(sql.MAX), embed_url);
    ins.input('sort_order', sql.Int, Number.isFinite(sort_order) ? sort_order : 999);
    try {
      const insResult = await ins.query(`
        INSERT INTO dbo.powerbi_dashboards (id, name, title, embed_url, sort_order)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.title, INSERTED.embed_url, INSERTED.sort_order, INSERTED.created_at, INSERTED.updated_at
        VALUES (@id, @name, @title, @embed_url, @sort_order)
      `);
      const row = insResult.recordset[0];
      return { statusCode: 201, json: { success: true, data: mapRow(row) } };
    } catch (e) {
      if (e.number === 2627 || String(e.message).includes('duplicate')) {
        return { statusCode: 409, json: { success: false, error: 'A dashboard with this id already exists' } };
      }
      throw e;
    }
  }

  if ((method === 'PUT' || method === 'PATCH') && slug) {
    const id = decodeURIComponent(slug).trim().toLowerCase();
    const sets = [];
    const req = pool.request();
    req.input('id', sql.NVarChar(64), id);
    if (body.name !== undefined) {
      if (!String(body.name).trim()) return { statusCode: 400, json: { success: false, error: 'name cannot be empty' } };
      req.input('name', sql.NVarChar(256), String(body.name).trim());
      sets.push('name = @name');
    }
    if (body.title !== undefined) {
      if (!String(body.title).trim()) return { statusCode: 400, json: { success: false, error: 'title cannot be empty' } };
      req.input('title', sql.NVarChar(512), String(body.title).trim());
      sets.push('title = @title');
    }
    if (body.embed_url !== undefined) {
      req.input('embed_url', sql.NVarChar(sql.MAX), String(body.embed_url));
      sets.push('embed_url = @embed_url');
    }
    if (body.sort_order !== undefined && body.sort_order !== null) {
      const so = parseInt(String(body.sort_order), 10);
      req.input('sort_order', sql.Int, Number.isFinite(so) ? so : 0);
      sets.push('sort_order = @sort_order');
    }
    if (sets.length === 0) {
      return { statusCode: 400, json: { success: false, error: 'No fields to update' } };
    }
    sets.push('updated_at = SYSUTCDATETIME()');
    const upd = await req.query(`
      UPDATE dbo.powerbi_dashboards SET ${sets.join(', ')}
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.title, INSERTED.embed_url, INSERTED.sort_order, INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id
    `);
    if (!upd.recordset || upd.recordset.length === 0) {
      return { statusCode: 404, json: { success: false, error: 'Dashboard not found' } };
    }
    return { statusCode: 200, json: { success: true, data: mapRow(upd.recordset[0]) } };
  }

  if (method === 'DELETE' && slug) {
    const id = decodeURIComponent(slug).trim().toLowerCase();
    const del = pool.request();
    del.input('id', sql.NVarChar(64), id);
    const result = await del.query(`
      DELETE FROM dbo.powerbi_dashboards OUTPUT DELETED.id WHERE id = @id
    `);
    if (!result.recordset || result.recordset.length === 0) {
      return { statusCode: 404, json: { success: false, error: 'Dashboard not found' } };
    }
    return { statusCode: 200, json: { success: true, data: { id } } };
  }

  return { statusCode: 404, json: { success: false, error: 'Power BI dashboards endpoint not found' } };
}

module.exports = {
  handlePowerbiDashboardsCrud,
  /** For user-accounts validation */
  async getValidPowerbiDashboardIdSet(pool) {
    try {
      await seedIfEmpty(pool);
    } catch {
      return new Set();
    }
    const r = await pool.request().query(`SELECT id FROM dbo.powerbi_dashboards`);
    return new Set((r.recordset || []).map((row) => String(row.id).trim().toLowerCase()));
  },
};
