const sql = require('mssql');

let pool = null;
let connecting = null;

// Parse server and port
const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map((s) => s.trim());
  port = parseInt(port, 10) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

// Robust password handling (match other APIs)
let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
if (password && password.startsWith('/')) {
  password = process.env.DB_PASSWORD || process.env.VITE_PWD;
}
if (password && password.includes('%')) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {
    // Keep original if decode fails
  }
}
if (
  (password && password.startsWith('"') && password.endsWith('"')) ||
  (password && password.startsWith("'") && password.endsWith("'"))
) {
  password = password.slice(1, -1);
}
if (password) {
  password = password.trim();
}

const config = {
  server: server,
  port: port,
  database: process.env.DATABASE || process.env.VITE_DATABASE,
  user: process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
  password: password,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 120000,
    connectionTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

function isConnectionError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  const code = err.code || err.originalError?.code || err.originalError?.info?.code;
  return (
    code === 'ESOCKET' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEOUT' ||
    msg.includes('Connection lost') ||
    msg.includes('ECONNRESET') ||
    msg.includes('Connection is closed') ||
    msg.includes('Final state') ||
    msg.includes('LoggedIn state')
  );
}

function attachSharedPoolErrorHandler(p) {
  if (!p || p.__rbSharedPoolErrorHook) return;
  p.__rbSharedPoolErrorHook = true;
  p.on('error', (err) => {
    console.error('[DB] Pool error — resetting pool:', err?.message || err);
    if (pool === p) pool = null;
  });
}

async function resetPool() {
  const p = pool;
  pool = null;
  connecting = null;
  if (p) {
    try {
      await p.close();
    } catch (_) {
      /* ignore */
    }
  }
}

async function connectPool() {
  const p = new sql.ConnectionPool(config);
  await p.connect();
  attachSharedPoolErrorHandler(p);
  return p;
}

async function getPool() {
  if (pool && pool.connected) {
    return pool;
  }
  if (pool && !pool.connected) {
    await resetPool();
  }
  if (!connecting) {
    connecting = (async () => {
      try {
        pool = await connectPool();
        console.log('[DB] Connected to SQL Server');
        return pool;
      } finally {
        connecting = null;
      }
    })();
  }
  return connecting;
}

/** Dedicated pool for long sync — must not use sql.connect() (global singleton; close() kills API pool). */
async function createIsolatedPool() {
  const p = new sql.ConnectionPool(config);
  await p.connect();
  p.on('error', (err) => {
    console.error('[DB] Isolated sync pool error:', err?.message || err);
  });
  return p;
}

async function closePool() {
  await resetPool();
}

/**
 * Run fn(pool); on connection errors reset the shared pool and retry once.
 */
async function withPoolRetry(fn) {
  try {
    const p = await getPool();
    return await fn(p);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    console.warn('[DB] Connection error — reconnecting and retrying once:', err.message);
    await resetPool();
    const p = await getPool();
    return await fn(p);
  }
}

module.exports = {
  getPool,
  createIsolatedPool,
  closePool,
  resetPool,
  withPoolRetry,
  isConnectionError,
  sql,
  dbConfig: config,
};
