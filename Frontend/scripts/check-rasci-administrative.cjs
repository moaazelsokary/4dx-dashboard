#!/usr/bin/env node

/**
 * Script to check RASCI records for Administration/Administrative departments
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

async function checkRASCIAdministrative() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get all departments
    console.log('Getting all departments...');
    const deptResult = await pool.request().query(`
      SELECT id, name, code FROM departments ORDER BY name
    `);
    console.log(`✓ Found ${deptResult.recordset.length} departments:\n`);
    deptResult.recordset.forEach(dept => {
      console.log(`  - ${dept.name} (code: ${dept.code})`);
    });

    // Check for RASCI records with Administration-related names
    console.log('\n\nChecking RASCI records for Administration-related departments...\n');
    const rasciResult = await pool.request().query(`
      SELECT DISTINCT department, COUNT(*) as count
      FROM rasci_metrics
      WHERE department LIKE '%Admin%' OR department LIKE '%Legal%'
      GROUP BY department
      ORDER BY department
    `);
    
    if (rasciResult.recordset.length === 0) {
      console.log('No RASCI records found with Administration or Legal in the name.');
    } else {
      console.log(`Found ${rasciResult.recordset.length} department name(s) in RASCI:\n`);
      rasciResult.recordset.forEach(row => {
        console.log(`  - ${row.department}: ${row.count} records`);
      });
    }

    // Check if there's an "administrative" department
    const adminDeptResult = await pool.request().query(`
      SELECT id, name, code FROM departments 
      WHERE code = 'administrative' OR name LIKE '%Administrative%'
    `);
    
    if (adminDeptResult.recordset.length > 0) {
      console.log(`\n✓ Found Administrative department: ${adminDeptResult.recordset[0].name} (code: ${adminDeptResult.recordset[0].code})`);
      
      // Check if there are any RASCI records for this department
      const adminRasciResult = await pool.request().query(`
        SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @deptName
      `);
      const adminRasciRequest = pool.request();
      adminRasciRequest.input('deptName', sql.NVarChar, adminDeptResult.recordset[0].name);
      const adminRasciCount = await adminRasciRequest.query(`
        SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @deptName
      `);
      console.log(`  RASCI records for this department: ${adminRasciCount.recordset[0].count}`);
    } else {
      console.log('\n⚠ No department found with code "administrative"');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
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

checkRASCIAdministrative().catch(console.error);

