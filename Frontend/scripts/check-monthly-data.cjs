#!/usr/bin/env node

/**
 * Script to check department_monthly_data before migration
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

async function checkData() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Check for NULL values
    const nullCheck = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM department_monthly_data 
      WHERE kpi IS NULL OR department_id IS NULL
    `);
    console.log(`Records with NULL kpi or department_id: ${nullCheck.recordset[0].count}`);

    // Check for invalid department_ids
    const invalidDept = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM dmd
      LEFT JOIN departments d ON dmd.department_id = d.id
      WHERE dmd.department_id IS NOT NULL AND d.id IS NULL
    `);
    console.log(`Records with invalid department_id: ${invalidDept.recordset[0].count}`);

    // Show sample data
    const sample = await pool.request().query(`
      SELECT TOP 5 
        dmd.id,
        dmd.department_objective_id,
        dmd.kpi,
        dmd.department_id,
        d.name as department_name,
        dmd.month
      FROM department_monthly_data dmd
      LEFT JOIN departments d ON dmd.department_id = d.id
    `);
    console.log('\nSample data:');
    console.table(sample.recordset);

  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

checkData();

