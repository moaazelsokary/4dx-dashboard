#!/usr/bin/env node

/**
 * Script to clear all data from rasci_metrics table
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

// Get password
let password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD') || getEnv('PWD');
if (password && password.startsWith('/') && password.includes('/')) {
  password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD');
}
if (password && password.includes('%')) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {}
}
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

async function clearRASCIMetrics() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Count records before deletion
    const countRequest = pool.request();
    const countResult = await countRequest.query('SELECT COUNT(*) as count FROM rasci_metrics');
    const beforeCount = countResult.recordset[0].count;
    console.log(`Found ${beforeCount} records in rasci_metrics table\n`);

    // Delete all records
    console.log('Deleting all records from rasci_metrics...');
    const deleteRequest = pool.request();
    const deleteResult = await deleteRequest.query('DELETE FROM rasci_metrics; SELECT @@ROWCOUNT as rowsDeleted;');
    console.log(`✓ Deleted ${deleteResult.recordset[0].rowsDeleted} record(s)\n`);

    // Verify
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest.query('SELECT COUNT(*) as count FROM rasci_metrics');
    const afterCount = verifyResult.recordset[0].count;
    
    if (afterCount === 0) {
      console.log('✓ Table cleared successfully!');
    } else {
      console.log(`⚠ Warning: ${afterCount} records still exist`);
    }

  } catch (error) {
    console.error('❌ Clear failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n✓ Database connection closed');
    }
  }
}

clearRASCIMetrics().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

