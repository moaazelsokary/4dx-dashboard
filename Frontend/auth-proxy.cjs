require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { handleAccountsCrud } = require('./netlify/functions/utils/user-accounts-crud.cjs');
const { handlePowerbiDashboardsCrud } = require('./netlify/functions/utils/powerbi-dashboards-crud.cjs');

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors({
  origin: function (origin, callback) {
    if (
      !origin ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('https://lifemakers.netlify.app')
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Database connection pool
let pool = null;

async function getDbPool() {
  if (pool) return pool;

  const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
  let server, port;
  if (serverValue.includes(',')) {
    [server, port] = serverValue.split(',').map(s => s.trim());
    port = parseInt(port) || 1433;
  } else {
    server = serverValue;
    port = 1433;
  }

  // Robust password handling (match auth-api.js for Netlify)
  let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
  if (password && password.startsWith('/') && password.includes('/')) {
    console.warn('[Auth Proxy] PWD appears to be system path, not password. Use DB_PASSWORD instead.');
    password = process.env.DB_PASSWORD || process.env.VITE_PWD;
  }
  if (password && password.includes('%')) {
    try {
      password = decodeURIComponent(password);
    } catch (e) { /* use as-is */ }
  }
  if (password && ((password.startsWith('"') && password.endsWith('"')) || (password.startsWith("'") && password.endsWith("'")))) {
    password = password.slice(1, -1);
  }
  if (password) password = password.trim();

  const config = {
    user: process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
    password: password,
    server: server,
    port: port,
    database: process.env.DATABASE || process.env.VITE_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: true, // Required for Azure SQL and many dev SQL Server setups
      enableArithAbort: true,
      requestTimeout: 60000,
      connectionTimeout: 30000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  // Validate required config (match auth-api.js)
  const missingConfig = [];
  if (!server) missingConfig.push('SERVER or VITE_SERVER');
  if (!config.database) missingConfig.push('DATABASE or VITE_DATABASE');
  if (!config.user) missingConfig.push('DB_USER, UID, VITE_UID, or VIE_UID');
  if (!password) missingConfig.push('DB_PASSWORD, VITE_PWD, or PWD');

  if (missingConfig.length > 0) {
    const errorMsg = `[Auth Proxy] Missing .env.local variables: ${missingConfig.join(', ')}`;
    console.error(errorMsg);
    throw new Error(`Check Frontend/.env.local. ${missingConfig.join(', ')}`);
  }

  console.log('[Auth Proxy] Attempting database connection:');
  console.log(`- Server: ${config.server}:${config.port}`);
  console.log(`- Database: ${config.database}`);
  console.log(`- User: ${config.user}`);

  try {
    pool = await sql.connect(config);
    console.log('[Auth Proxy] Database connection established');
    return pool;
  } catch (error) {
    console.error('[Auth Proxy] Database connection failed:', error.message);
    if (error.code === 'ELOGIN') {
      console.error('[Auth Proxy] ELOGIN - Check: 1) Password 2) SQL Auth enabled 3) User exists');
    }
    throw error;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || process.env.VITE_JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

// Handle preflight requests
app.options('/api/auth/signin', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.sendStatus(200);
});

// Authentication endpoint
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required'
      });
    }

    // Get database connection
    const dbPool = await getDbPool();

    // Query user from database
    const request = dbPool.request();
    request.input('username', sql.NVarChar, username);

    const result = await request.query(`
      SELECT 
        id,
        username,
        password_hash,
        role,
        departments,
        is_active,
        default_route,
        allowed_routes,
        powerbi_dashboard_ids
      FROM users
      WHERE username = @username
    `);

    if (result.recordset.length === 0) {
      console.warn('[Auth Proxy] Login attempt with invalid username:', username);
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    const user = result.recordset[0];

    // Check if user is active
    if (!user.is_active) {
      console.warn('[Auth Proxy] Login attempt for inactive user:', username);
      return res.status(403).json({
        success: false,
        error: 'Account is disabled'
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      console.warn('[Auth Proxy] Login attempt with invalid password for:', username);
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    // Parse departments (stored as JSON string or comma-separated)
    let departments = [];
    try {
      if (typeof user.departments === 'string') {
        departments = JSON.parse(user.departments);
      } else if (Array.isArray(user.departments)) {
        departments = user.departments;
      }
    } catch {
      // If parsing fails, try comma-separated
      departments = user.departments ? user.departments.split(',').map(d => d.trim()) : [];
    }

    const parseJsonArrayColumn = (val) => {
      if (val == null || val === '') return null;
      try {
        let raw = val;
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(raw)) {
          raw = raw.toString('utf8');
        }
        const x = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(x) ? x : null;
      } catch {
        return null;
      }
    };

    const defaultRoute =
      user.default_route && String(user.default_route).trim()
        ? String(user.default_route).trim()
        : null;
    const allowedRoutes = parseJsonArrayColumn(user.allowed_routes);
    const powerbiDashboardIds = parseJsonArrayColumn(user.powerbi_dashboard_ids);

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        departments: departments,
        defaultRoute: defaultRoute || undefined,
        allowedRoutes: allowedRoutes === null ? null : allowedRoutes,
        powerbiDashboardIds: powerbiDashboardIds === null ? null : powerbiDashboardIds,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    const userData = {
      username: user.username,
      role: user.role,
      departments: departments,
      defaultRoute: defaultRoute || null,
      allowedRoutes,
      powerbiDashboardIds,
    };

    console.log('[Auth Proxy] User signed in successfully:', user.username, 'Role:', user.role);

    res.json({
      success: true,
      user: userData,
      token,
    });
  } catch (error) {
    console.error('[Auth Proxy] Authentication error:', error);
    // In development, include the real error so you can see it in the browser console
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      success: false,
      error: isDev ? (error.message || 'Internal server error') : 'Internal server error',
    });
  }
});

// GET session — Power BI / route overrides from DB (JWT must match current user id)
app.options('/api/auth/session', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.sendStatus(200);
});

function parseJsonArrayColumnSession(val) {
  if (val == null || val === '') return null;
  if (Array.isArray(val)) return val;
  try {
    let raw = val;
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(raw)) {
      raw = raw.toString('utf8');
    }
    const x = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(x) ? x : null;
  } catch {
    return null;
  }
}

async function handleAuthSession(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId ?? decoded.id;
    if (userId == null) {
      return res.status(401).json({ success: false, error: 'Invalid token payload' });
    }
    const dbPool = await getDbPool();
    const result = await dbPool
      .request()
      .input('id', sql.Int, userId)
      .query(`
        SELECT default_route, allowed_routes, powerbi_dashboard_ids
        FROM users
        WHERE id = @id
      `);
    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const row = result.recordset[0];
    const defaultRoute =
      row.default_route && String(row.default_route).trim()
        ? String(row.default_route).trim()
        : null;
    return res.json({
      success: true,
      user: {
        defaultRoute,
        allowedRoutes: parseJsonArrayColumnSession(row.allowed_routes),
        powerbiDashboardIds: parseJsonArrayColumnSession(row.powerbi_dashboard_ids),
      },
    });
  } catch (e) {
    console.error('[Auth Proxy] session error:', e.message);
    return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  }
}

app.get('/api/auth/session', handleAuthSession);
app.get('/.netlify/functions/auth-session', handleAuthSession);

// Compute derived metric rows from pms/odoo data and definition
function computeDerivedRows(pms, odoo, derivedDef) {
  const def = Array.isArray(derivedDef.definition) ? derivedDef.definition : (JSON.parse(derivedDef.definition || '[]') || []);
  const hasPms = def.some(d => d.source === 'pms');
  const hasOdoo = def.some(d => d.source === 'odoo');
  const source = hasPms && hasOdoo ? 'odoo & pms' : hasOdoo ? 'odoo' : 'pms';
  const months = new Set();
  for (const d of def) {
    if (d.source === 'pms') {
      (pms || []).filter(r => r.ProjectName === d.project && r.MetricName === (d.metric || '')).forEach(r => months.add(r.MonthYear));
    } else if (d.source === 'odoo') {
      (odoo || []).filter(r => r.Project === d.project).forEach(r => months.add(r.Month));
    }
  }
  const rows = [];
  for (const month of [...months].sort()) {
    let target = null, actual = null, servicesCreated = null, servicesDone = null;
    if (hasPms) {
      for (const d of def) {
        if (d.source !== 'pms') continue;
        const m = (pms || []).find(r => r.ProjectName === d.project && r.MetricName === (d.metric || '') && r.MonthYear === month);
        if (m) {
          target = (target ?? 0) + (m.Target ?? 0);
          actual = (actual ?? 0) + (m.Actual ?? 0);
        }
      }
    }
    if (hasOdoo) {
      for (const d of def) {
        if (d.source !== 'odoo') continue;
        const m = (odoo || []).find(r => r.Project === d.project && r.Month === month);
        if (m) {
          servicesCreated = (servicesCreated ?? 0) + (m.ServicesCreated ?? 0);
          servicesDone = (servicesDone ?? 0) + (m.ServicesDone ?? 0);
        }
      }
    }
    rows.push({
      source, project: derivedDef.project_name, metric: null, month: month,
      target: hasPms ? target : null, actual: hasPms ? actual : null,
      servicesCreated: hasOdoo ? servicesCreated : null, servicesDone: hasOdoo ? servicesDone : null
    });
  }
  return rows;
}

// Verify JWT and return user for Admin/CEO routes
function getUserFromRequest(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const uid = decoded.userId ?? decoded.id;
    return {
      id: uid,
      userId: uid,
      username: decoded.username,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

// ---- Metrics API (local dev - same as Netlify metrics-api) ----
app.get('/.netlify/functions/metrics-api', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const p = await getDbPool();
    const [pmsResult, odooResult, lastResult, derivedResult] = await Promise.all([
      p.request().query(`
        SELECT project_name AS ProjectName, metric_name AS MetricName, month AS MonthYear,
               target_value AS Target, actual_value AS Actual, updated_at AS UpdatedAt
        FROM dbo.pms_odoo_cache WHERE source = 'pms'
        ORDER BY project_name, metric_name, month
      `),
      p.request().query(`
        SELECT project_name AS Project, month AS Month, services_created AS ServicesCreated,
               services_done AS ServicesDone, updated_at AS UpdatedAt
        FROM dbo.pms_odoo_cache WHERE source = 'odoo'
        ORDER BY month DESC, project_name
      `),
      p.request().query(`SELECT MAX(updated_at) AS last_updated FROM dbo.pms_odoo_cache`),
      p.request().query(`SELECT id, project_name, source, definition FROM dbo.derived_metrics`).catch(() => ({ recordset: [] }))
    ]);
    const lastUpdated = lastResult.recordset[0]?.last_updated || null;
    const pms = pmsResult.recordset || [];
    const odoo = odooResult.recordset || [];
    const derivedDefs = (derivedResult.recordset != null ? derivedResult.recordset : []) || [];
    let derived = [];
    for (const d of derivedDefs) {
      derived = derived.concat(computeDerivedRows(pms, odoo, d));
    }
    res.json({
      success: true,
      data: {
        pms,
        odoo,
        derived,
        derivedDefinitions: derivedDefs.map(d => ({
          id: d.id, projectName: d.project_name, source: d.source,
          definition: typeof d.definition === 'string' ? JSON.parse(d.definition || '[]') : d.definition
        })),
        lastUpdated
      }
    });
  } catch (err) {
    if (err.message && (err.message.includes('Invalid object name') && (err.message.includes('pms_odoo_cache') || err.message.includes('derived_metrics')))) {
      return res.status(200).json({
        success: true,
        data: { pms: [], odoo: [], derived: [], derivedDefinitions: [], lastUpdated: null },
        warning: 'Cache or derived_metrics table does not exist yet.'
      });
    }
    console.error('[Auth Proxy] Metrics API error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to read from cache', message: err.message });
  }
});
// PMS pool for sync (separate from main DataWarehouse pool)
let pmsPool = null;
function getPmsDbConfig() {
  const serverValue = process.env.PMS_SERVER || process.env.VITE_PMS_SERVER || '';
  let server, port;
  if (serverValue.includes(',')) {
    [server, port] = serverValue.split(',').map(s => s.trim());
    port = parseInt(port) || 1433;
  } else {
    server = serverValue;
    port = 1433;
  }
  let pwd = process.env.PMS_PWD || process.env.VITE_PMS_PWD;
  if (pwd && pwd.includes('%')) { try { pwd = decodeURIComponent(pwd); } catch (e) {} }
  if (pwd && ((pwd.startsWith('"') && pwd.endsWith('"')) || (pwd.startsWith("'") && pwd.endsWith("'")))) pwd = pwd.slice(1, -1);
  if (pwd) pwd = pwd.trim();
  return {
    server, port: port || 1433, database: process.env.PMS_DATABASE || process.env.VITE_PMS_DATABASE,
    user: process.env.PMS_UID || process.env.VITE_PMS_UID, password: pwd,
    options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true, requestTimeout: 60000, connectionTimeout: 30000 },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}
async function getPmsPool() {
  if (!pmsPool) {
    const config = getPmsDbConfig();
    if (!config.server || !config.database) throw new Error('PMS_SERVER and PMS_DATABASE required for sync');
    pmsPool = await new sql.ConnectionPool(config).connect();
  }
  return pmsPool;
}
async function fetchPmsData() {
  const pool = await getPmsPool();
  const result = await pool.request().query(`
    SELECT p.Name AS ProjectName, m.Name AS MetricName,
           CONCAT(mv.Year, '-', RIGHT('0' + CAST(mv.Month AS VARCHAR(2)), 2)) AS MonthYear,
           mv.Target, mv.Actual
    FROM dbo.Metrics m INNER JOIN dbo.Projects p ON m.ProjectId = p.Id
    INNER JOIN dbo.MetricValues mv ON mv.MetricId = m.Id
    WHERE m.IsDeleted = 0 AND m.IsActive = 1
    ORDER BY p.Name, m.Name, mv.Year, mv.Month
  `);
  return result.recordset;
}
async function fetchOdooData() {
  const token = process.env.ODOO_TOKEN || process.env.VITE_Odoo_Token;
  if (!token) throw new Error('ODOO_TOKEN required for sync');
  const query = `
    SELECT Project, Month, SUM(ServicesCreated) AS ServicesCreated, SUM(ServicesDone) AS ServicesDone
    FROM (
      SELECT implementation_teams.name AS Project, TO_CHAR(case_implementation.create_date, 'YYYY-MM') AS Month,
             COUNT(case_implementation.id) AS ServicesCreated, 0 AS ServicesDone
      FROM case_implementation LEFT JOIN case_implementation_implementation_teams_rel ON case_implementation.id = case_implementation_implementation_teams_rel.case_implementation_id
      LEFT JOIN implementation_teams ON implementation_teams.id = case_implementation_implementation_teams_rel.implementation_teams_id
      WHERE case_implementation.create_date IS NOT NULL AND TO_CHAR(case_implementation.create_date, 'YYYY-MM') >= '2026-01'
        AND implementation_teams.name IN ('Basic Need','Emergency Team','Humanitarian Assistance Team','Dafa 2025','Sawa','NRC','Steps Forward','Qift Project','Palestinians','Ramadan 2026','Dar W Salama Project Team')
      GROUP BY implementation_teams.name, TO_CHAR(case_implementation.create_date, 'YYYY-MM')
      UNION ALL
      SELECT implementation_teams.name AS Project, TO_CHAR(case_implementation.actual_date, 'YYYY-MM') AS Month, 0 AS ServicesCreated, COUNT(case_implementation.id) AS ServicesDone
      FROM case_implementation LEFT JOIN case_implementation_implementation_teams_rel ON case_implementation.id = case_implementation_implementation_teams_rel.case_implementation_id
      LEFT JOIN implementation_teams ON implementation_teams.id = case_implementation_implementation_teams_rel.implementation_teams_id
      WHERE case_implementation.actual_date IS NOT NULL AND TO_CHAR(case_implementation.actual_date, 'YYYY-MM') >= '2026-01'
        AND implementation_teams.name IN ('Basic Need','Emergency Team','Humanitarian Assistance Team','Dafa 2025','Sawa','NRC','Steps Forward','Qift Project','Palestinians','Ramadan 2026','Dar W Salama Project Team')
      GROUP BY implementation_teams.name, TO_CHAR(case_implementation.actual_date, 'YYYY-MM')
    ) AS combined
    GROUP BY Project, Month ORDER BY Month DESC, Project
  `;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60000);
  const response = await fetch('https://lifemakers.odoo.com/powerbi/sql', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'execute', params: { token, query }, id: 1 }),
    signal: controller.signal,
  });
  clearTimeout(t);
  if (!response.ok) throw new Error(`Odoo API error: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Odoo API error: ${JSON.stringify(data.error)}`);
  let result = data.result;
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray(result.rows)) return result.rows;
  if (result && typeof result === 'object' && result.data) return Array.isArray(result.data) ? result.data : [result.data];
  console.warn('[Auth Proxy] Odoo result format unexpected:', typeof result, result ? Object.keys(result) : 'null');
  return [];
}
async function writePmsOdooToCache(pmsData, odooData) {
  const p = await getDbPool();
  const transaction = new sql.Transaction(p);
  await transaction.begin();
  try {
    await new sql.Request(transaction).query('DELETE FROM dbo.pms_odoo_cache');
    const table = new sql.Table('pms_odoo_cache');
    table.columns.add('source', sql.NVarChar(10), { nullable: false });
    table.columns.add('project_name', sql.NVarChar(255), { nullable: false });
    table.columns.add('metric_name', sql.NVarChar(255), { nullable: true });
    table.columns.add('month', sql.NVarChar(7), { nullable: false });
    table.columns.add('target_value', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('actual_value', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('services_created', sql.Int, { nullable: true });
    table.columns.add('services_done', sql.Int, { nullable: true });
    table.columns.add('updated_at', sql.DateTime, { nullable: false });
    const seen = new Set();
    let totalRows = 0;
    for (const row of pmsData || []) {
      const project = row.ProjectName != null ? String(row.ProjectName).trim() : '';
      const month = row.MonthYear != null ? String(row.MonthYear).trim() : '';
      if (!project || !month) continue;
      const key = `pms|${project}|${row.MetricName}|${month}`;
      if (seen.has(key)) continue;
      seen.add(key);
      table.rows.add('pms', project, row.MetricName != null ? String(row.MetricName) : null, month, row.Target, row.Actual, null, null, new Date());
      totalRows++;
    }
    for (const row of odooData || []) {
      const projectRaw = (row && typeof row === 'object' && !Array.isArray(row)) ? (row.Project ?? row.project) : (Array.isArray(row) ? row[0] : null);
      const monthRaw = (row && typeof row === 'object' && !Array.isArray(row)) ? (row.Month ?? row.month) : (Array.isArray(row) ? row[1] : null);
      const project = projectRaw != null && String(projectRaw).trim() ? String(projectRaw).trim() : null;
      const month = monthRaw != null && String(monthRaw).trim() ? String(monthRaw).trim() : null;
      if (!project || !month) continue;
      const sc = (row && typeof row === 'object' && !Array.isArray(row))
        ? (row.ServicesCreated ?? row.servicescreated ?? row.services_created)
        : (Array.isArray(row) ? row[2] : null);
      const sd = (row && typeof row === 'object' && !Array.isArray(row))
        ? (row.ServicesDone ?? row.servicesdone ?? row.services_done)
        : (Array.isArray(row) ? row[3] : null);
      table.rows.add('odoo', project, null, month, null, null, sc != null ? Number(sc) : 0, sd != null ? Number(sd) : 0, new Date());
      totalRows++;
    }
    if (totalRows > 0) {
      await new sql.Request(transaction).bulk(table);
      console.log('[Auth Proxy] Bulk insert completed, total rows:', totalRows);
    } else {
      console.warn('[Auth Proxy] No rows to insert (pms + odoo both empty or filtered)');
    }
    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}
async function syncPmsOdoo() {
  let pmsData = [], odooData = [];
  try { pmsData = await fetchPmsData(); } catch (e) { console.warn('[Auth Proxy] PMS fetch failed:', e.message); }
  try { odooData = await fetchOdooData(); } catch (e) { console.warn('[Auth Proxy] Odoo fetch failed:', e.message); }
  if (pmsData.length === 0 && odooData.length === 0) throw new Error('No data from PMS or Odoo. Check ODOO_TOKEN, PMS_* env vars.');
  const odooProjects = [...new Set(odooData.map(r => {
    const p = (r && typeof r === 'object' && !Array.isArray(r)) ? (r.Project ?? r.project) : (Array.isArray(r) ? r[0] : null);
    return p != null ? String(p).trim() : null;
  }).filter(Boolean))];
  console.log('[Auth Proxy] Sync: pms rows:', pmsData.length, 'odoo rows:', odooData.length, 'odoo projects:', odooProjects.join(', '));
  await writePmsOdooToCache(pmsData, odooData);
  return { pmsRows: pmsData.length, odooRows: odooData.length };
}
app.post('/.netlify/functions/metrics-api/refresh', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    await syncPmsOdoo();
    res.json({ success: true, message: 'Refresh completed' });
  } catch (err) {
    console.error('[Auth Proxy] Metrics refresh error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to start refresh', message: err.message });
  }
});

// Derived metrics CRUD (Admin/CEO only)
function requireAdminOrCeo(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user || !['Admin', 'CEO'].includes(user.role)) {
    return res.status(403).json({ success: false, error: 'Unauthorized - Admin or CEO role required' });
  }
  req.derivedUser = user;
  next();
}

app.post('/.netlify/functions/metrics-api/derived', requireAdminOrCeo, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { projectName, definition } = req.body || {};
    if (!projectName || !Array.isArray(definition) || definition.length < 2) {
      return res.status(400).json({ success: false, error: 'projectName and definition (array of 2+ items) required' });
    }
    const hasPms = definition.some(d => d.source === 'pms');
    const hasOdoo = definition.some(d => d.source === 'odoo');
    const source = hasPms && hasOdoo ? 'odoo & pms' : hasOdoo ? 'odoo' : 'pms';
    const p = await getDbPool();
    const r = await p.request()
      .input('project_name', sql.NVarChar, String(projectName).trim())
      .input('source', sql.NVarChar, source)
      .input('definition', sql.NVarChar, JSON.stringify(definition))
      .input('created_by', sql.NVarChar, req.derivedUser?.username || null)
      .query(`
        INSERT INTO dbo.derived_metrics (project_name, source, definition, created_by)
        OUTPUT INSERTED.id VALUES (@project_name, @source, @definition, @created_by)
      `);
    const id = r.recordset[0]?.id;
    res.status(201).json({ success: true, id, message: 'Derived metric created' });
  } catch (err) {
    if (err.message && err.message.includes('Invalid object name') && err.message.includes('derived_metrics')) {
      return res.status(500).json({ success: false, error: 'derived_metrics table does not exist. Run migration first.' });
    }
    console.error('[Auth Proxy] Create derived metric error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/.netlify/functions/metrics-api/derived/:id', requireAdminOrCeo, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1) return res.status(400).json({ success: false, error: 'Invalid id' });
    const { projectName, definition } = req.body || {};
    if (!projectName || !Array.isArray(definition) || definition.length < 2) {
      return res.status(400).json({ success: false, error: 'projectName and definition (array of 2+ items) required' });
    }
    const hasPms = definition.some(d => d.source === 'pms');
    const hasOdoo = definition.some(d => d.source === 'odoo');
    const source = hasPms && hasOdoo ? 'odoo & pms' : hasOdoo ? 'odoo' : 'pms';
    const p = await getDbPool();
    const r = await p.request()
      .input('id', sql.Int, id)
      .input('project_name', sql.NVarChar, String(projectName).trim())
      .input('source', sql.NVarChar, source)
      .input('definition', sql.NVarChar, JSON.stringify(definition))
      .query(`
        UPDATE dbo.derived_metrics SET project_name = @project_name, source = @source, definition = @definition
        WHERE id = @id
      `);
    if (r.rowsAffected[0] === 0) return res.status(404).json({ success: false, error: 'Derived metric not found' });
    res.json({ success: true, message: 'Derived metric updated' });
  } catch (err) {
    if (err.message && err.message.includes('Invalid object name') && err.message.includes('derived_metrics')) {
      return res.status(500).json({ success: false, error: 'derived_metrics table does not exist. Run migration first.' });
    }
    console.error('[Auth Proxy] Update derived metric error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/.netlify/functions/metrics-api/derived/:id', requireAdminOrCeo, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1) return res.status(400).json({ success: false, error: 'Invalid id' });
    const p = await getDbPool();
    const r = await p.request().input('id', sql.Int, id).query(`DELETE FROM dbo.derived_metrics WHERE id = @id`);
    if (r.rowsAffected[0] === 0) return res.status(404).json({ success: false, error: 'Derived metric not found' });
    res.json({ success: true, message: 'Derived metric deleted' });
  } catch (err) {
    if (err.message && err.message.includes('Invalid object name') && err.message.includes('derived_metrics')) {
      return res.status(500).json({ success: false, error: 'derived_metrics table does not exist.' });
    }
    console.error('[Auth Proxy] Delete derived metric error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Local stub for config-api lock checks (Netlify config-api runs only in production)
// Returns "not locked" so Department Objectives works locally without full config-api
app.get('/.netlify/functions/config-api/locks/check-operation', (req, res) => {
  res.json({ success: true, data: { is_locked: false } });
});
app.get('/.netlify/functions/config-api/locks/check', (req, res) => {
  res.json({ success: true, data: { is_locked: false } });
});
app.post('/.netlify/functions/config-api/locks/check-batch', (req, res) => {
  const body = req.body || {};
  const results = (body.checks || []).map((c) => ({
    is_locked: false,
    field_type: c.field_type,
    department_objective_id: c.department_objective_id,
    month: c.month,
  }));
  res.json({ success: true, data: { results } });
});

// Config-api mappings (local dev - mirrors Netlify config-api for Data Source Mapping)
function requireConfigAuth(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  req.configUser = user;
  next();
}

app.get('/.netlify/functions/config-api/mappings', requireConfigAuth, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const user = req.configUser;
  if (user.role !== 'Admin' && user.role !== 'CEO') {
    return res.status(403).json({ success: false, error: 'Access denied. Admin or CEO role required.' });
  }
  try {
    const p = await getDbPool();
    let rows;
    try {
      const result = await p.request().query(`
        SELECT m.department_objective_id, do.kpi, do.activity, do.department_id, d.name AS department_name,
               m.pms_project_name, m.pms_metric_name, m.target_source, m.actual_source,
               m.odoo_project_name, m.derived_project_name, m.created_at, m.updated_at
        FROM objective_data_source_mapping m
        INNER JOIN department_objectives do ON m.department_objective_id = do.id
        LEFT JOIN departments d ON do.department_id = d.id
        ORDER BY do.department_id, do.kpi, do.activity
      `);
      rows = result.recordset;
    } catch (colErr) {
      if (colErr.message && colErr.message.includes('derived_project_name')) {
        const result = await p.request().query(`
          SELECT m.department_objective_id, do.kpi, do.activity, do.department_id, d.name AS department_name,
                 m.pms_project_name, m.pms_metric_name, m.target_source, m.actual_source,
                 m.odoo_project_name, m.created_at, m.updated_at
          FROM objective_data_source_mapping m
          INNER JOIN department_objectives do ON m.department_objective_id = do.id
          LEFT JOIN departments d ON do.department_id = d.id
          ORDER BY do.department_id, do.kpi, do.activity
        `);
        rows = (result.recordset || []).map(r => ({ ...r, derived_project_name: null }));
      } else throw colErr;
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    if (err.message && err.message.includes('Invalid object name') && err.message.includes('objective_data_source_mapping')) {
      return res.json({ success: true, data: [] });
    }
    console.error('[Auth Proxy] GET mappings error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/.netlify/functions/config-api/mappings/:id', requireConfigAuth, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    const p = await getDbPool();
    let row;
    try {
      const r = await p.request().input('department_objective_id', sql.Int, id).query(`
        SELECT m.department_objective_id, do.kpi, do.activity, do.department_id, d.name AS department_name,
               m.pms_project_name, m.pms_metric_name, m.target_source, m.actual_source,
               m.odoo_project_name, m.derived_project_name, m.created_at, m.updated_at
        FROM objective_data_source_mapping m
        INNER JOIN department_objectives do ON m.department_objective_id = do.id
        LEFT JOIN departments d ON do.department_id = d.id
        WHERE m.department_objective_id = @department_objective_id
      `);
      if (r.recordset.length === 0) return res.status(404).json({ success: false, error: 'Mapping not found' });
      row = r.recordset[0];
    } catch (colErr) {
      if (colErr.message && colErr.message.includes('derived_project_name')) {
        const r = await p.request().input('department_objective_id', sql.Int, id).query(`
          SELECT m.department_objective_id, do.kpi, do.activity, do.department_id, d.name AS department_name,
                 m.pms_project_name, m.pms_metric_name, m.target_source, m.actual_source,
                 m.odoo_project_name, m.created_at, m.updated_at
          FROM objective_data_source_mapping m
          INNER JOIN department_objectives do ON m.department_objective_id = do.id
          LEFT JOIN departments d ON do.department_id = d.id
          WHERE m.department_objective_id = @department_objective_id
        `);
        if (r.recordset.length === 0) return res.status(404).json({ success: false, error: 'Mapping not found' });
        row = { ...r.recordset[0], derived_project_name: null };
      } else throw colErr;
    }
    res.json({ success: true, data: row });
  } catch (err) {
    if (err.message && err.message.includes('Invalid object name') && err.message.includes('objective_data_source_mapping')) {
      return res.status(404).json({ success: false, error: 'Mapping not found' });
    }
    console.error('[Auth Proxy] GET mapping error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/.netlify/functions/config-api/mappings/:id', requireConfigAuth, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const user = req.configUser;
  if (user.role !== 'Admin' && user.role !== 'CEO') {
    return res.status(403).json({ success: false, error: 'Access denied. Admin or CEO role required.' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  const body = req.body || {};
  const { pms_project_name, pms_metric_name, target_source, actual_source, odoo_project_name, derived_project_name } = body;

  const targetSourceValue = (target_source === 'pms_target' || target_source === 'derived') ? target_source : null;
  if (!actual_source || !['manual', 'pms_actual', 'odoo_services_done', 'odoo_services_created', 'derived'].includes(actual_source)) {
    return res.status(400).json({ success: false, error: 'actual_source is required and must be "manual", "pms_actual", "odoo_services_done", "odoo_services_created", or "derived"' });
  }
  if ((actual_source === 'odoo_services_done' || actual_source === 'odoo_services_created') && !odoo_project_name) {
    return res.status(400).json({ success: false, error: 'odoo_project_name is required when Actual From is Odoo ServicesDone or Odoo ServicesCreated' });
  }
  const needsDerived = targetSourceValue === 'derived' || actual_source === 'derived';
  if (needsDerived && !derived_project_name) {
    return res.status(400).json({ success: false, error: 'derived_project_name is required when Target From or Actual From is Derived' });
  }
  const needsPms = targetSourceValue === 'pms_target' || actual_source === 'pms_actual';
  if (needsPms && (!pms_project_name || !pms_metric_name)) {
    return res.status(400).json({ success: false, error: 'pms_project_name and pms_metric_name are required when Target From is PMS or Actual From is PMS Actual' });
  }

  try {
    const p = await getDbPool();
    if (needsDerived) {
      await p.request()
        .input('department_objective_id', sql.Int, id)
        .input('pms_project_name', sql.NVarChar, pms_project_name || null)
        .input('pms_metric_name', sql.NVarChar, pms_metric_name || null)
        .input('target_source', sql.NVarChar, targetSourceValue)
        .input('actual_source', sql.NVarChar, actual_source)
        .input('odoo_project_name', sql.NVarChar, odoo_project_name || null)
        .input('derived_project_name', sql.NVarChar, derived_project_name || null)
        .query(`
          MERGE objective_data_source_mapping AS target
          USING (SELECT @department_objective_id AS department_objective_id) AS source
          ON target.department_objective_id = source.department_objective_id
          WHEN MATCHED THEN UPDATE SET
            pms_project_name = @pms_project_name, pms_metric_name = @pms_metric_name,
            target_source = @target_source, actual_source = @actual_source,
            odoo_project_name = @odoo_project_name, derived_project_name = @derived_project_name,
            updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT (department_objective_id, pms_project_name, pms_metric_name, target_source, actual_source, odoo_project_name, derived_project_name, created_at, updated_at)
          VALUES (@department_objective_id, @pms_project_name, @pms_metric_name, @target_source, @actual_source, @odoo_project_name, @derived_project_name, GETDATE(), GETDATE());
        `);
    } else {
      await p.request()
        .input('department_objective_id', sql.Int, id)
        .input('pms_project_name', sql.NVarChar, pms_project_name || null)
        .input('pms_metric_name', sql.NVarChar, pms_metric_name || null)
        .input('target_source', sql.NVarChar, targetSourceValue)
        .input('actual_source', sql.NVarChar, actual_source)
        .input('odoo_project_name', sql.NVarChar, odoo_project_name || null)
        .query(`
          MERGE objective_data_source_mapping AS target
          USING (SELECT @department_objective_id AS department_objective_id) AS source
          ON target.department_objective_id = source.department_objective_id
          WHEN MATCHED THEN UPDATE SET
            pms_project_name = @pms_project_name, pms_metric_name = @pms_metric_name,
            target_source = @target_source, actual_source = @actual_source,
            odoo_project_name = @odoo_project_name,
            updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT (department_objective_id, pms_project_name, pms_metric_name, target_source, actual_source, odoo_project_name, created_at, updated_at)
          VALUES (@department_objective_id, @pms_project_name, @pms_metric_name, @target_source, @actual_source, @odoo_project_name, GETDATE(), GETDATE());
        `);
    }
    let row;
    try {
      const r = await p.request().input('department_objective_id', sql.Int, id).query(`
        SELECT m.department_objective_id, do.kpi, do.activity, do.department_id, d.name AS department_name,
               m.pms_project_name, m.pms_metric_name, m.target_source, m.actual_source,
               m.odoo_project_name, m.derived_project_name, m.created_at, m.updated_at
        FROM objective_data_source_mapping m
        INNER JOIN department_objectives do ON m.department_objective_id = do.id
        LEFT JOIN departments d ON do.department_id = d.id
        WHERE m.department_objective_id = @department_objective_id
      `);
      row = r.recordset[0];
    } catch (selErr) {
      if (selErr.message && selErr.message.includes('derived_project_name')) {
        const r = await p.request().input('department_objective_id', sql.Int, id).query(`
          SELECT m.department_objective_id, do.kpi, do.activity, do.department_id, d.name AS department_name,
                 m.pms_project_name, m.pms_metric_name, m.target_source, m.actual_source,
                 m.odoo_project_name, m.created_at, m.updated_at
          FROM objective_data_source_mapping m
          INNER JOIN department_objectives do ON m.department_objective_id = do.id
          LEFT JOIN departments d ON do.department_id = d.id
          WHERE m.department_objective_id = @department_objective_id
        `);
        row = { ...r.recordset[0], derived_project_name: null };
      } else throw selErr;
    }
    res.json({ success: true, data: row });
  } catch (err) {
    if (err.message && (err.message.includes('derived_project_name') || err.message.includes('Invalid column name'))) {
      return res.status(400).json({ success: false, error: 'To use Derived, run migrate-objective-data-source-mapping-derived.sql first.' });
    }
    if (err.message && err.message.includes('Invalid object name') && err.message.includes('objective_data_source_mapping')) {
      return res.status(400).json({ success: false, error: 'objective_data_source_mapping table does not exist. Run migrations first.' });
    }
    console.error('[Auth Proxy] PUT mapping error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Config-api accounts (local dev — mirrors Netlify config-api)
function requireAccountsAdmin(req, res, next) {
  const u = getUserFromRequest(req);
  if (!u) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  if (u.role !== 'Admin' && u.role !== 'CEO') {
    return res.status(403).json({ success: false, error: 'Access denied. Admin or CEO role required.' });
  }
  req.accountsUser = u;
  next();
}

app.options('/.netlify/functions/config-api/accounts', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.sendStatus(200);
});
app.options('/.netlify/functions/config-api/accounts/:id', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.sendStatus(200);
});

app.get('/.netlify/functions/config-api/accounts', requireAccountsAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const pool = await getDbPool();
    const result = await handleAccountsCrud({
      pool,
      method: 'GET',
      accountId: null,
      body: {},
      user: req.accountsUser,
      logActivity: null,
    });
    res.status(result.statusCode).json(result.json);
  } catch (err) {
    console.error('[Auth Proxy] GET accounts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/.netlify/functions/config-api/accounts', requireAccountsAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const pool = await getDbPool();
    const result = await handleAccountsCrud({
      pool,
      method: 'POST',
      accountId: null,
      body: req.body || {},
      user: req.accountsUser,
      logActivity: null,
    });
    res.status(result.statusCode).json(result.json);
  } catch (err) {
    console.error('[Auth Proxy] POST accounts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/.netlify/functions/config-api/accounts/:id', requireAccountsAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    const pool = await getDbPool();
    const result = await handleAccountsCrud({
      pool,
      method: 'PUT',
      accountId: id,
      body: req.body || {},
      user: req.accountsUser,
      logActivity: null,
    });
    res.status(result.statusCode).json(result.json);
  } catch (err) {
    console.error('[Auth Proxy] PUT accounts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.options('/.netlify/functions/config-api/powerbi-dashboards', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.sendStatus(200);
});
app.options('/.netlify/functions/config-api/powerbi-dashboards/:slug', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.sendStatus(200);
});

app.get('/.netlify/functions/config-api/powerbi-dashboards', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const u = getUserFromRequest(req);
  if (!u) return res.status(401).json({ success: false, error: 'Authentication required' });
  try {
    const pool = await getDbPool();
    const isAdmin = u.role === 'Admin' || u.role === 'CEO';
    const result = await handlePowerbiDashboardsCrud({
      pool,
      method: 'GET',
      slug: null,
      body: {},
      user: u,
      isAdmin,
    });
    res.status(result.statusCode).json(result.json);
  } catch (err) {
    console.error('[Auth Proxy] GET powerbi-dashboards error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/.netlify/functions/config-api/powerbi-dashboards', requireAccountsAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const pool = await getDbPool();
    const u = req.accountsUser;
    const isAdmin = u.role === 'Admin' || u.role === 'CEO';
    const result = await handlePowerbiDashboardsCrud({
      pool,
      method: 'POST',
      slug: null,
      body: req.body || {},
      user: u,
      isAdmin,
    });
    res.status(result.statusCode).json(result.json);
  } catch (err) {
    console.error('[Auth Proxy] POST powerbi-dashboards error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/.netlify/functions/config-api/powerbi-dashboards/:slug', requireAccountsAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const slug = req.params.slug;
  if (!slug) return res.status(400).json({ success: false, error: 'Missing slug' });
  try {
    const pool = await getDbPool();
    const u = req.accountsUser;
    const isAdmin = u.role === 'Admin' || u.role === 'CEO';
    const result = await handlePowerbiDashboardsCrud({
      pool,
      method: 'PUT',
      slug,
      body: req.body || {},
      user: u,
      isAdmin,
    });
    res.status(result.statusCode).json(result.json);
  } catch (err) {
    console.error('[Auth Proxy] PUT powerbi-dashboards error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/.netlify/functions/config-api/powerbi-dashboards/:slug', requireAccountsAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const slug = req.params.slug;
  if (!slug) return res.status(400).json({ success: false, error: 'Missing slug' });
  try {
    const pool = await getDbPool();
    const u = req.accountsUser;
    const isAdmin = u.role === 'Admin' || u.role === 'CEO';
    const result = await handlePowerbiDashboardsCrud({
      pool,
      method: 'DELETE',
      slug,
      body: {},
      user: u,
      isAdmin,
    });
    res.status(result.statusCode).json(result.json);
  } catch (err) {
    console.error('[Auth Proxy] DELETE powerbi-dashboards error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// RASCI summary by department (for All Departments - mirrors wig-proxy)
app.get('/api/wig/rasci/summary-by-department', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const pool = await getDbPool();
    const kpiDelimiter = '||';
    function normalizeKPI(kpi) {
      if (!kpi) return '';
      return (String(kpi).replace(/^\d+(\.\d+)*\s*/, '').trim() || kpi).trim().toLowerCase();
    }
    function matchKPI(rasciKpi, deptKpis) {
      if (!rasciKpi || !deptKpis || !Array.isArray(deptKpis)) return false;
      const rNorm = normalizeKPI(rasciKpi);
      const rOrig = String(rasciKpi || '').trim().toLowerCase();
      for (const d of deptKpis) {
        if (d == null) continue;
        const parts = String(d).includes(kpiDelimiter) ? String(d).split(kpiDelimiter).map((k) => (k || '').trim()).filter(Boolean) : [d];
        for (const p of parts) {
          if (p == null) continue;
          const dNorm = normalizeKPI(p);
          const dOrig = String(p).trim().toLowerCase();
          if (rNorm === dNorm || rOrig === dNorm || rNorm === dOrig || rOrig === dOrig) return true;
        }
      }
      return false;
    }
    const [deptResult, rasciResult, deptObjResult] = await Promise.all([
      pool.request().query('SELECT id, name, code FROM departments ORDER BY name'),
      pool.request().query(`
        SELECT DISTINCT kpi, department
        FROM rasci_metrics
        WHERE responsible = 1 OR accountable = 1 OR supportive = 1 OR consulted = 1 OR informed = 1
        ORDER BY department
      `),
      pool.request().query(`
        SELECT do.department_id, do.kpi
        FROM department_objectives do
        INNER JOIN departments d ON do.department_id = d.id
      `)
    ]);
    const EXCLUDED_DEPTS = ['Administration', 'Volunteer Management'];
    const departments = (deptResult?.recordset || []).filter(
      (d) => !EXCLUDED_DEPTS.includes(String(d?.name || '').trim())
    );
    const rasciRows = rasciResult?.recordset || [];
    const deptObjRows = deptObjResult?.recordset || [];
    const deptObjByDeptId = {};
    for (const row of deptObjRows) {
      if (row?.department_id == null) continue;
      if (!deptObjByDeptId[row.department_id]) deptObjByDeptId[row.department_id] = [];
      if (row.kpi != null) deptObjByDeptId[row.department_id].push(row.kpi);
    }
    const rasciByDeptId = {};
    for (const d of departments) {
      rasciByDeptId[d.id] = { name: d.name, kpis: [] };
    }
    function rasciDeptMatchesDb(rasciDept, dbDept) {
      const r = String(rasciDept || '').trim().toLowerCase();
      const n = String(dbDept.name || '').toLowerCase();
      const c = String(dbDept.code || '').toLowerCase();
      if (r === n || r === c) return true;
      if (c === 'dfr') {
        return r.includes('direct fundraising') || r.includes('resource mobilization') || r === 'dfr';
      }
      return false;
    }
    for (const row of rasciRows) {
      const rasciDept = String(row.department || '').trim();
      const dbDept = departments.find((d) => rasciDeptMatchesDb(rasciDept, d));
      if (!dbDept) continue;
      const entry = rasciByDeptId[dbDept.id];
      if (!entry.kpis.includes(row.kpi)) entry.kpis.push(row.kpi);
    }
    const summary = departments.map((d) => {
      const { name, kpis } = rasciByDeptId[d.id];
      const totalKPIs = kpis.length;
      const deptKpis = deptObjByDeptId[d.id] || [];
      const exists = kpis.filter((k) => matchKPI(k, deptKpis)).length;
      const notExists = totalKPIs - exists;
      const existsPercent = totalKPIs > 0 ? Math.round((exists / totalKPIs) * 100) : 0;
      return {
        department: name,
        department_code: d.code,
        total_kpis: totalKPIs,
        exists,
        not_exists: notExists,
        exists_percent: existsPercent
      };
    });
    res.json(summary);
  } catch (error) {
    console.error('[Auth Proxy] rasci/summary-by-department error:', error?.message);
    res.status(500).json({ success: false, error: error?.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Auth proxy server is running', port: PORT });
});

app.listen(PORT, () => {
  console.log(`🔐 Auth proxy server running on http://localhost:${PORT}`);
  console.log(`📡 Handling authentication requests`);
  console.log(`💡 Make sure database credentials are set in .env.local`);
});
