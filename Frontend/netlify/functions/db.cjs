const sql = require('mssql');

let pool = null;

// Parse server and port
const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

// Robust password handling (match other APIs)
let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
if (password && password.startsWith('/')) {
  password = process.env.DB_PASSWORD || process.env.VITE_PWD;
}
if (password && (password.includes('%'))) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {
    // Keep original if decode fails
  }
}
if ((password && password.startsWith('"') && password.endsWith('"')) || 
    (password && password.startsWith("'") && password.endsWith("'"))) {
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
    requestTimeout: 60000,
    connectionTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

async function getPool() {
  if (!pool) {
    try {
      pool = await sql.connect(config);
      console.log('[DB] Connected to SQL Server');
    } catch (error) {
      console.error('[DB] Connection error:', error);
      throw error;
    }
  }
  return pool;
}

async function closePool() {
  if (pool) {
    try {
      await pool.close();
      pool = null;
      console.log('[DB] Connection pool closed');
    } catch (error) {
      console.error('[DB] Error closing pool:', error);
    }
  }
}

module.exports = {
  getPool,
  closePool,
  sql,
};

