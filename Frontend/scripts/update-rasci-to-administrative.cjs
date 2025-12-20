#!/usr/bin/env node

/**
 * Script to update RASCI metrics from "Administration & Legal Affairs" to "Administrative" department
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

async function updateRASCIToAdministrative() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // First, get the administrative department name from the database
    console.log('Getting Administrative department...');
    const deptResult = await pool.request().query(`
      SELECT id, name, code FROM departments 
      WHERE code = 'administrative' OR name LIKE '%Administrative%' OR name LIKE '%Administration%'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Administrative department not found in database');
    }
    
    const adminDept = deptResult.recordset[0];
    const adminDeptName = adminDept.name;
    const adminDeptCode = adminDept.code;
    console.log(`✓ Found Administrative department: ${adminDeptName} (code: ${adminDeptCode})\n`);

    // Check how many RASCI records exist with "Administration & Legal Affairs"
    console.log('Checking existing RASCI records...');
    const checkRequest = pool.request();
    checkRequest.input('oldDept', sql.NVarChar, 'Administration & Legal Affairs');
    const checkResult = await checkRequest.query(`
      SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @oldDept
    `);
    const count = checkResult.recordset[0].count;
    console.log(`✓ Found ${count} RASCI records with "Administration & Legal Affairs"\n`);

    if (count === 0) {
      console.log('No records to update.');
      return;
    }

    // Update all RASCI records from "Administration & Legal Affairs" to the administrative department name
    console.log('Updating RASCI records...\n');
    const updateRequest = pool.request();
    updateRequest.input('oldDept', sql.NVarChar, 'Administration & Legal Affairs');
    updateRequest.input('newDept', sql.NVarChar, adminDeptName);
    
    // First, check for conflicts (records that already exist with the new department name)
    const conflictCheck = pool.request();
    conflictCheck.input('oldDept', sql.NVarChar, 'Administration & Legal Affairs');
    conflictCheck.input('newDept', sql.NVarChar, adminDeptName);
    const conflictResult = await conflictCheck.query(`
      SELECT r1.kpi, r1.department as old_dept, r2.department as new_dept
      FROM rasci_metrics r1
      INNER JOIN rasci_metrics r2 ON r1.kpi = r2.kpi
      WHERE r1.department = @oldDept AND r2.department = @newDept
    `);
    
    if (conflictResult.recordset.length > 0) {
      console.log(`⚠ Warning: Found ${conflictResult.recordset.length} KPIs that already have RASCI entries for ${adminDeptName}`);
      console.log('  These will be skipped. You may need to manually merge the RASCI assignments.\n');
      
      // Update only non-conflicting records
      const updateNonConflict = pool.request();
      updateNonConflict.input('oldDept', sql.NVarChar, 'Administration & Legal Affairs');
      updateNonConflict.input('newDept', sql.NVarChar, adminDeptName);
      const updateResult = await updateNonConflict.query(`
        UPDATE r1
        SET department = @newDept,
            updated_at = GETDATE()
        FROM rasci_metrics r1
        WHERE r1.department = @oldDept
        AND NOT EXISTS (
          SELECT 1 FROM rasci_metrics r2 
          WHERE r2.kpi = r1.kpi AND r2.department = @newDept
        )
      `);
      console.log(`✓ Updated ${updateResult.rowsAffected[0]} RASCI records (conflicts skipped)`);
    } else {
      // No conflicts, update all records
      const updateResult = await updateRequest.query(`
        UPDATE rasci_metrics
        SET department = @newDept,
            updated_at = GETDATE()
        WHERE department = @oldDept
      `);
      console.log(`✓ Updated ${updateResult.rowsAffected[0]} RASCI records`);
    }

    // Verify the update
    console.log('\nVerifying update...');
    const verifyRequest = pool.request();
    verifyRequest.input('newDept', sql.NVarChar, adminDeptName);
    const verifyResult = await verifyRequest.query(`
      SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @newDept
    `);
    console.log(`✓ Total RASCI records for ${adminDeptName}: ${verifyResult.recordset[0].count}`);

    // Check if any "Administration & Legal Affairs" records remain
    const remainingCheck = pool.request();
    remainingCheck.input('oldDept', sql.NVarChar, 'Administration & Legal Affairs');
    const remainingResult = await remainingCheck.query(`
      SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @oldDept
    `);
    const remaining = remainingResult.recordset[0].count;
    
    if (remaining > 0) {
      console.log(`⚠ Warning: ${remaining} RASCI records still have "Administration & Legal Affairs" (likely due to conflicts)`);
    } else {
      console.log('✓ All "Administration & Legal Affairs" records have been updated');
    }

    console.log('\n✅ RASCI update completed successfully!');

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

updateRASCIToAdministrative().catch(console.error);

