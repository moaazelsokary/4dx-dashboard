#!/usr/bin/env node

/**
 * Script to clear all monthly data targets and actual values for offices department
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

async function clearOfficesMonthlyData() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Offices department ID
    console.log('Getting Offices department...');
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE code = 'offices'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Offices department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Offices department (ID: ${departmentId})\n`);

    // Clear all monthly data targets and actual values for offices department
    console.log('Clearing monthly data targets and actual values for offices department...');
    const updateRequest = pool.request();
    updateRequest.input('department_id', sql.Int, departmentId);
    
    const result = await updateRequest.query(`
      UPDATE department_monthly_data
      SET target_value = NULL,
          actual_value = NULL
      WHERE department_id = @department_id
    `);

    console.log(`✓ Updated ${result.rowsAffected[0]} monthly data entries`);
    console.log('  - All target_value and actual_value have been set to NULL\n');

    // Verify the update
    console.log('Verifying update...');
    const verifyRequest = pool.request();
    verifyRequest.input('department_id', sql.Int, departmentId);
    const verifyResult = await verifyRequest.query(`
      SELECT 
        COUNT(*) as total_records,
        SUM(CASE WHEN target_value IS NULL THEN 1 ELSE 0 END) as null_targets,
        SUM(CASE WHEN actual_value IS NULL THEN 1 ELSE 0 END) as null_actuals
      FROM department_monthly_data
      WHERE department_id = @department_id
    `);

    const stats = verifyResult.recordset[0];
    console.log(`✓ Verification complete:`);
    console.log(`  - Total records: ${stats.total_records}`);
    console.log(`  - Records with NULL target_value: ${stats.null_targets}`);
    console.log(`  - Records with NULL actual_value: ${stats.null_actuals}\n`);

    console.log('✅ Monthly data cleared successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
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

clearOfficesMonthlyData().catch(console.error);

