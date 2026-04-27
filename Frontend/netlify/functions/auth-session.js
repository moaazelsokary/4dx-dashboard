/**
 * GET /.netlify/functions/auth-session
 * Returns current user's route/Power BI overrides from DB (Bearer JWT).
 * Fixes stale JWT/localStorage after admin updates a user account.
 */
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || process.env.VITE_JWT_SECRET || 'your-secret-key-change-in-production';

let pool = null;

function getDbConfig() {
  const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
  let server;
  let port;
  if (serverValue.includes(',')) {
    [server, port] = serverValue.split(',').map((s) => s.trim());
    port = parseInt(port, 10) || 1433;
  } else {
    server = serverValue;
    port = 1433;
  }

  let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
  if (password && password.startsWith('/')) {
    password = process.env.DB_PASSWORD || process.env.VITE_PWD;
  }
  if (password && password.includes('%')) {
    try {
      password = decodeURIComponent(password);
    } catch (e) {
      /* keep */
    }
  }
  if (
    password &&
    ((password.startsWith('"') && password.endsWith('"')) ||
      (password.startsWith("'") && password.endsWith("'")))
  ) {
    password = password.slice(1, -1);
  }
  if (password) password = password.trim();

  return {
    server,
    port,
    database: process.env.DATABASE || process.env.VITE_DATABASE,
    user: process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
    password,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
      requestTimeout: 60000,
      connectionTimeout: 30000,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

async function getPool() {
  if (!pool) {
    pool = await sql.connect(getDbConfig());
    logger.info('[auth-session] Database connected');
  }
  return pool;
}

function parseJsonArrayColumn(val) {
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

function extractToken(event) {
  const headers = event.headers || {};
  let authHeader =
    headers.authorization || headers.Authorization || headers.AUTHORIZATION;
  if (!authHeader) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'authorization') {
        authHeader = headers[key];
        break;
      }
    }
  }
  if (!authHeader) return null;
  const parts = String(authHeader).split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') return parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  const token = extractToken(event);
  if (!token) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Authentication required' }),
    };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Invalid or expired token' }),
    };
  }

  const userId = decoded.userId ?? decoded.id;
  if (userId == null) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Invalid token payload' }),
    };
  }

  try {
    const p = await getPool();
    const result = await p
      .request()
      .input('id', sql.Int, userId)
      .query(`
        SELECT default_route, allowed_routes, powerbi_dashboard_ids
        FROM users
        WHERE id = @id
      `);

    if (!result.recordset || result.recordset.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    const row = result.recordset[0];
    const defaultRoute =
      row.default_route && String(row.default_route).trim()
        ? String(row.default_route).trim()
        : null;

    const body = {
      success: true,
      user: {
        defaultRoute,
        allowedRoutes: parseJsonArrayColumn(row.allowed_routes),
        powerbiDashboardIds: parseJsonArrayColumn(row.powerbi_dashboard_ids),
      },
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(body),
    };
  } catch (err) {
    logger.error('[auth-session] DB error', { message: err.message });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Failed to load session' }),
    };
  }
};
