#!/usr/bin/env node

/**
 * Script to clear all data from rasci_metrics table
 * Run with: node scripts/clear-rasci.cjs
 */

require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

// Get environment variables
const getEnv = (key) => {
  const value = process.env[key];
  return value ? value.trim().replace(/^["']|["']$/g, '') : undefined;
};

const serverValue = getEnv('SERVER') || getEnv('VITE_SERVER') || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

// Get password - handle DB_PASSWORD, VITE_PWD, or PWD
let password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD') || getEnv('PWD');

// If PWD looks like a path (starts with /), it's the system variable, not our password
if (password && password.startsWith('/') && password.includes('/')) {
  console.warn('[DB] PWD appears to be system path, not password. Using DB_PASSWORD or VITE_PWD instead.');
  password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD');
}

// If password contains URL encoding (%), try to decode it
if (password && password.includes('%')) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {
    console.log('[DB] Password decode failed, using as-is');
  }
}

// Remove quotes if they were added
if (password && ((password.startsWith('"') && password.endsWith('"')) ||
    (password.startsWith("'") && password.endsWith("'")))) {
  password = password.slice(1, -1);
}

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER'),
  password: password,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function clearRASCI() {
  let pool;
  try {
    console.log('Connecting to database...');
    console.log(`Server: ${config.server}:${config.port}`);
    console.log(`Database: ${config.database}`);
    console.log(`User: ${config.user}`);
    
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    console.log('Clearing rasci_metrics table...');
    const request = pool.request();
    const result = await request.query('DELETE FROM rasci_metrics; SELECT @@ROWCOUNT as rowsDeleted;');
    
    console.log(`✓ Deleted ${result.recordset[0].rowsDeleted} record(s) from rasci_metrics table`);
    console.log('✓ Table is now empty and ready for new data\n');

  } catch (error) {
    console.error('❌ Error clearing table:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('✓ Database connection closed');
    }
  }
}

// Run
clearRASCI().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

