/**
 * Shared admin account CRUD for config-api (Netlify) and auth-proxy (local dev).
 * .cjs extension: Frontend/package.json has "type":"module" — CommonJS must use .cjs.
 */
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { getValidPowerbiDashboardIdSet } = require('./powerbi-dashboards-crud.cjs');

const ALLOWED_APP_PATHS = new Set([
  '/dashboard',
  '/wig-plan-2025',
  '/main-plan',
  '/department-objectives',
  '/test',
  '/summary',
  '/project-details',
  '/powerbi',
  '/settings',
  '/admin/configuration',
  '/pms-odoo-metrics',
  '/access-denied',
]);

function parseDepartmentsColumn(raw) {
  let departments = [];
  try {
    if (typeof raw === 'string') {
      if (raw.trim().startsWith('[')) {
        departments = JSON.parse(raw);
      } else {
        departments = raw.split(',').map((d) => d.trim()).filter(Boolean);
      }
    } else if (Array.isArray(raw)) {
      departments = raw;
    }
  } catch {
    departments = raw ? String(raw).split(',').map((d) => d.trim()).filter(Boolean) : [];
  }
  return departments;
}

function parseJsonArrayOrNull(val) {
  if (val == null || val === '') return null;
  if (Array.isArray(val)) return val;
  try {
    const x = typeof val === 'string' ? JSON.parse(val) : val;
    return Array.isArray(x) ? x : null;
  } catch {
    return null;
  }
}

function validateRoutesArray(arr) {
  if (!Array.isArray(arr)) return 'allowed_routes must be an array or null';
  for (const p of arr) {
    if (typeof p !== 'string' || !ALLOWED_APP_PATHS.has(p)) {
      return `Invalid route: ${p}`;
    }
  }
  return null;
}

async function validatePowerbiIds(arr, pool) {
  if (!Array.isArray(arr)) return 'powerbi_dashboard_ids must be an array or null';
  let valid;
  try {
    valid = await getValidPowerbiDashboardIdSet(pool);
  } catch {
    return 'Could not validate Power BI dashboard ids (catalog unavailable)';
  }
  if (valid.size === 0) {
    return 'No Power BI dashboards are defined. Add dashboards in Configuration first.';
  }
  for (const id of arr) {
    const k = typeof id === 'string' ? id.trim().toLowerCase() : '';
    if (!valid.has(k)) {
      return `Invalid Power BI dashboard id: ${id}`;
    }
  }
  return null;
}

function mapUserAccountRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    departments: parseDepartmentsColumn(row.departments),
    is_active: row.is_active,
    default_route: row.default_route || null,
    allowed_routes: parseJsonArrayOrNull(row.allowed_routes),
    powerbi_dashboard_ids: parseJsonArrayOrNull(row.powerbi_dashboard_ids),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @param {object} opts
 * @param {import('mssql').ConnectionPool} opts.pool
 * @param {string} opts.method
 * @param {number|null} opts.accountId
 * @param {object} opts.body - parsed JSON body for POST/PUT
 * @param {object} opts.user - admin user from JWT
 * @param {Function} [opts.logActivity]
 */
async function handleAccountsCrud(opts) {
  const { pool, method, accountId, body = {}, user, logActivity } = opts;

  if (method === 'GET' && !accountId) {
    const result = await pool.request().query(`
      SELECT id, username, role, departments, is_active, default_route, allowed_routes, powerbi_dashboard_ids, created_at, updated_at
      FROM users
      ORDER BY username
    `);
    const data = result.recordset.map(mapUserAccountRow);
    return { statusCode: 200, json: { success: true, data } };
  }

  if (method === 'POST' && !accountId) {
    const {
      username,
      password,
      role,
      departments,
      is_active,
      default_route,
      allowed_routes,
      powerbi_dashboard_ids,
    } = body;

    if (!username || !String(username).trim()) {
      return { statusCode: 400, json: { success: false, error: 'username is required' } };
    }
    if (!password || !String(password).length) {
      return { statusCode: 400, json: { success: false, error: 'password is required for new users' } };
    }
    if (!role || !String(role).trim()) {
      return { statusCode: 400, json: { success: false, error: 'role is required' } };
    }

    let routesJson = null;
    if (allowed_routes !== undefined) {
      if (allowed_routes === null) {
        routesJson = null;
      } else {
        const err = validateRoutesArray(allowed_routes);
        if (err) return { statusCode: 400, json: { success: false, error: err } };
        routesJson = JSON.stringify(allowed_routes);
      }
    }

    let pbiJson = null;
    if (powerbi_dashboard_ids !== undefined) {
      if (powerbi_dashboard_ids === null) {
        pbiJson = null;
      } else {
        const err = await validatePowerbiIds(powerbi_dashboard_ids, pool);
        if (err) return { statusCode: 400, json: { success: false, error: err } };
        pbiJson = JSON.stringify(powerbi_dashboard_ids);
      }
    }

    let defaultRouteVal = null;
    if (default_route !== undefined && default_route !== null && String(default_route).trim()) {
      defaultRouteVal = String(default_route).trim();
      if (!ALLOWED_APP_PATHS.has(defaultRouteVal)) {
        return { statusCode: 400, json: { success: false, error: 'Invalid default_route' } };
      }
    }

    const password_hash = await bcrypt.hash(String(password), 10);
    const deptStr = JSON.stringify(Array.isArray(departments) ? departments : []);

    const checkReq = pool.request();
    checkReq.input('username', sql.NVarChar, String(username).trim());
    const exists = await checkReq.query(`SELECT id FROM users WHERE username = @username`);
    if (exists.recordset.length > 0) {
      return { statusCode: 409, json: { success: false, error: 'Username already exists' } };
    }

    const ins = pool.request();
    ins.input('username', sql.NVarChar, String(username).trim());
    ins.input('password_hash', sql.NVarChar, password_hash);
    ins.input('role', sql.NVarChar, String(role).trim());
    ins.input('departments', sql.NVarChar(sql.MAX), deptStr);
    ins.input('is_active', sql.Bit, is_active === false ? 0 : 1);
    ins.input('default_route', sql.NVarChar(sql.MAX), defaultRouteVal);
    ins.input('allowed_routes', sql.NVarChar(sql.MAX), routesJson);
    ins.input('powerbi_dashboard_ids', sql.NVarChar(sql.MAX), pbiJson);

    const insertResult = await ins.query(`
      INSERT INTO users (username, password_hash, role, departments, is_active, default_route, allowed_routes, powerbi_dashboard_ids)
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.role, INSERTED.departments, INSERTED.is_active, INSERTED.default_route, INSERTED.allowed_routes, INSERTED.powerbi_dashboard_ids, INSERTED.created_at, INSERTED.updated_at
      VALUES (@username, @password_hash, @role, @departments, @is_active, @default_route, @allowed_routes, @powerbi_dashboard_ids)
    `);

    const row = insertResult.recordset[0];
    return { statusCode: 201, json: { success: true, data: mapUserAccountRow(row) } };
  }

  if (method === 'PUT' && accountId) {
    const {
      username,
      password,
      role,
      departments,
      is_active,
      default_route,
      allowed_routes,
      powerbi_dashboard_ids,
    } = body;

    const existingReq = pool.request();
    existingReq.input('id', sql.Int, accountId);
    const existing = await existingReq.query(`SELECT id FROM users WHERE id = @id`);
    if (existing.recordset.length === 0) {
      return { statusCode: 404, json: { success: false, error: 'User not found' } };
    }

    if (username !== undefined) {
      if (!String(username).trim()) {
        return { statusCode: 400, json: { success: false, error: 'username cannot be empty' } };
      }
      const uq = pool.request();
      uq.input('username', sql.NVarChar, String(username).trim());
      uq.input('id', sql.Int, accountId);
      const clash = await uq.query(`SELECT id FROM users WHERE username = @username AND id <> @id`);
      if (clash.recordset.length > 0) {
        return { statusCode: 409, json: { success: false, error: 'Username already exists' } };
      }
    }

    let routesJson = undefined;
    if (allowed_routes !== undefined) {
      if (allowed_routes === null) {
        routesJson = null;
      } else {
        const err = validateRoutesArray(allowed_routes);
        if (err) return { statusCode: 400, json: { success: false, error: err } };
        routesJson = JSON.stringify(allowed_routes);
      }
    }

    let pbiJson = undefined;
    if (powerbi_dashboard_ids !== undefined) {
      if (powerbi_dashboard_ids === null) {
        pbiJson = null;
      } else {
        const err = await validatePowerbiIds(powerbi_dashboard_ids, pool);
        if (err) return { statusCode: 400, json: { success: false, error: err } };
        pbiJson = JSON.stringify(powerbi_dashboard_ids);
      }
    }

    let defaultRouteVal = undefined;
    if (default_route !== undefined) {
      if (default_route === null || default_route === '') {
        defaultRouteVal = null;
      } else {
        defaultRouteVal = String(default_route).trim();
        if (!ALLOWED_APP_PATHS.has(defaultRouteVal)) {
          return { statusCode: 400, json: { success: false, error: 'Invalid default_route' } };
        }
      }
    }

    const upd = pool.request();
    upd.input('id', sql.Int, accountId);
    const sets = [];
    if (username !== undefined) {
      upd.input('username', sql.NVarChar, String(username).trim());
      sets.push('username = @username');
    }
    if (password !== undefined && String(password).length > 0) {
      const password_hash = await bcrypt.hash(String(password), 10);
      upd.input('password_hash', sql.NVarChar, password_hash);
      sets.push('password_hash = @password_hash');
    }
    if (role !== undefined) {
      upd.input('role', sql.NVarChar, String(role).trim());
      sets.push('role = @role');
    }
    if (departments !== undefined) {
      upd.input('departments', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(departments) ? departments : []));
      sets.push('departments = @departments');
    }
    if (is_active !== undefined) {
      upd.input('is_active', sql.Bit, is_active ? 1 : 0);
      sets.push('is_active = @is_active');
    }
    if (default_route !== undefined) {
      upd.input('default_route', sql.NVarChar(sql.MAX), defaultRouteVal);
      sets.push('default_route = @default_route');
    }
    if (allowed_routes !== undefined) {
      upd.input('allowed_routes', sql.NVarChar(sql.MAX), routesJson);
      sets.push('allowed_routes = @allowed_routes');
    }
    if (powerbi_dashboard_ids !== undefined) {
      upd.input('powerbi_dashboard_ids', sql.NVarChar(sql.MAX), pbiJson);
      sets.push('powerbi_dashboard_ids = @powerbi_dashboard_ids');
    }

    if (sets.length === 0) {
      return { statusCode: 400, json: { success: false, error: 'No fields to update' } };
    }

    sets.push('updated_at = GETDATE()');

    const updateResult = await upd.query(`
      UPDATE users SET ${sets.join(', ')}
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.role, INSERTED.departments, INSERTED.is_active, INSERTED.default_route, INSERTED.allowed_routes, INSERTED.powerbi_dashboard_ids, INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id
    `);

    if (!updateResult.recordset || updateResult.recordset.length === 0) {
      return { statusCode: 404, json: { success: false, error: 'User not found' } };
    }

    if (typeof logActivity === 'function' && user) {
      const uid = user.id ?? user.userId;
      await logActivity(pool, {
        user_id: uid,
        username: user.username,
        action_type: 'permission_updated',
        metadata: { account_updated_id: accountId },
      });
    }

    return { statusCode: 200, json: { success: true, data: mapUserAccountRow(updateResult.recordset[0]) } };
  }

  return { statusCode: 404, json: { success: false, error: 'Accounts endpoint not found' } };
}

module.exports = {
  handleAccountsCrud,
  mapUserAccountRow,
  ALLOWED_APP_PATHS,
};
