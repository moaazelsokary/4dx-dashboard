#!/usr/bin/env node

/**
 * Script to create Administrative department and update RASCI metrics from Administration to Administrative
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

async function createAdministrativeAndUpdateRASCI() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Check if administrative department already exists
    console.log('Checking for Administrative department...');
    const checkDept = pool.request();
    checkDept.input('code', sql.NVarChar, 'administrative');
    const existingDept = await checkDept.query(`
      SELECT id, name, code FROM departments WHERE code = @code
    `);
    
    let adminDeptId, adminDeptName;
    if (existingDept.recordset.length > 0) {
      adminDeptId = existingDept.recordset[0].id;
      adminDeptName = existingDept.recordset[0].name;
      console.log(`✓ Administrative department already exists: ${adminDeptName} (ID: ${adminDeptId})\n`);
    } else {
      // Create the Administrative department
      console.log('Creating Administrative department...');
      const insertDept = pool.request();
      insertDept.input('name', sql.NVarChar, 'Administrative');
      insertDept.input('code', sql.NVarChar, 'administrative');
      const deptResult = await insertDept.query(`
        INSERT INTO departments (name, code)
        OUTPUT INSERTED.id, INSERTED.name
        VALUES (@name, @code)
      `);
      adminDeptId = deptResult.recordset[0].id;
      adminDeptName = deptResult.recordset[0].name;
      console.log(`✓ Created Administrative department: ${adminDeptName} (ID: ${adminDeptId})\n`);
    }

    // Check how many RASCI records exist with "Administration"
    console.log('Checking existing RASCI records...');
    const checkRequest = pool.request();
    checkRequest.input('oldDept', sql.NVarChar, 'Administration');
    const checkResult = await checkRequest.query(`
      SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @oldDept
    `);
    const count = checkResult.recordset[0].count;
    console.log(`✓ Found ${count} RASCI records with "Administration"\n`);

    if (count === 0) {
      console.log('No records to update.');
      return;
    }

    // Check for conflicts (records that already exist with the new department name)
    console.log('Checking for conflicts...');
    const conflictCheck = pool.request();
    conflictCheck.input('oldDept', sql.NVarChar, 'Administration');
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
      updateNonConflict.input('oldDept', sql.NVarChar, 'Administration');
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
      console.log('Updating RASCI records...\n');
      const updateRequest = pool.request();
      updateRequest.input('oldDept', sql.NVarChar, 'Administration');
      updateRequest.input('newDept', sql.NVarChar, adminDeptName);
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

    // Check if any "Administration" records remain
    const remainingCheck = pool.request();
    remainingCheck.input('oldDept', sql.NVarChar, 'Administration');
    const remainingResult = await remainingCheck.query(`
      SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @oldDept
    `);
    const remaining = remainingResult.recordset[0].count;
    
    if (remaining > 0) {
      console.log(`⚠ Warning: ${remaining} RASCI records still have "Administration" (likely due to conflicts)`);
    } else {
      console.log('✓ All "Administration" records have been updated to "Administrative"');
    }

    console.log('\n✅ Update completed successfully!');

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

createAdministrativeAndUpdateRASCI().catch(console.error);

