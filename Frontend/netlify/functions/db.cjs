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

const config = {
  server: server,
  port: port,
  database: process.env.DATABASE || process.env.VITE_DATABASE,
  user: process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
  password: process.env.PWD || process.env.VITE_PWD,
  options: {
    encrypt: true, // Use encryption for Azure SQL
    trustServerCertificate: true, // Set to true for Azure SQL
    enableArithAbort: true,
    requestTimeout: 30000,
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

