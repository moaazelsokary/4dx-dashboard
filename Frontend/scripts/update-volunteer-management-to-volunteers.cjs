#!/usr/bin/env node

/**
 * Script to update RASCI metrics from "Volunteer Management" to "Volunteers"
 * and remove any RASCI records that were incorrectly added for "Volunteers" department
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

async function updateVolunteerManagementToVolunteers() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Volunteers department
    console.log('Getting Volunteers department...');
    const deptResult = await pool.request().query(`
      SELECT id, name FROM departments WHERE code = 'volunteers'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Volunteers department not found');
    }
    
    const volunteersDeptName = deptResult.recordset[0].name;
    console.log(`✓ Found Volunteers department: ${volunteersDeptName}\n`);

    // Step 1: Remove any RASCI records that were incorrectly added for "Volunteers" department
    console.log('Step 1: Removing incorrectly added RASCI records for "Volunteers"...');
    const deleteRequest = pool.request();
    deleteRequest.input('dept', sql.NVarChar, volunteersDeptName);
    const deleteResult = await deleteRequest.query(`
      DELETE FROM rasci_metrics
      WHERE department = @dept
    `);
    console.log(`✓ Deleted ${deleteResult.rowsAffected[0]} incorrectly added RASCI records\n`);

    // Step 2: Check how many RASCI records exist with "Volunteer Management"
    console.log('Step 2: Checking existing RASCI records for "Volunteer Management"...');
    const checkRequest = pool.request();
    checkRequest.input('oldDept', sql.NVarChar, 'Volunteer Management');
    const checkResult = await checkRequest.query(`
      SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @oldDept
    `);
    const count = checkResult.recordset[0].count;
    console.log(`✓ Found ${count} RASCI records with "Volunteer Management"\n`);

    if (count === 0) {
      console.log('No records to update.');
      return;
    }

    // Step 3: Check for conflicts (records that already exist with the new department name)
    console.log('Step 3: Checking for conflicts...');
    const conflictCheck = pool.request();
    conflictCheck.input('oldDept', sql.NVarChar, 'Volunteer Management');
    conflictCheck.input('newDept', sql.NVarChar, volunteersDeptName);
    const conflictResult = await conflictCheck.query(`
      SELECT r1.kpi, r1.department as old_dept, r2.department as new_dept
      FROM rasci_metrics r1
      INNER JOIN rasci_metrics r2 ON r1.kpi = r2.kpi
      WHERE r1.department = @oldDept AND r2.department = @newDept
    `);
    
    if (conflictResult.recordset.length > 0) {
      console.log(`⚠ Warning: Found ${conflictResult.recordset.length} KPIs that already have RASCI entries for ${volunteersDeptName}`);
      console.log('  These will be skipped. You may need to manually merge the RASCI assignments.\n');
      
      // Update only non-conflicting records
      const updateNonConflict = pool.request();
      updateNonConflict.input('oldDept', sql.NVarChar, 'Volunteer Management');
      updateNonConflict.input('newDept', sql.NVarChar, volunteersDeptName);
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
      console.log('Step 4: Updating RASCI records from "Volunteer Management" to "Volunteers"...\n');
      const updateRequest = pool.request();
      updateRequest.input('oldDept', sql.NVarChar, 'Volunteer Management');
      updateRequest.input('newDept', sql.NVarChar, volunteersDeptName);
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
    verifyRequest.input('newDept', sql.NVarChar, volunteersDeptName);
    const verifyResult = await verifyRequest.query(`
      SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @newDept
    `);
    console.log(`✓ Total RASCI records for ${volunteersDeptName}: ${verifyResult.recordset[0].count}`);

    // Check if any "Volunteer Management" records remain
    const remainingCheck = pool.request();
    remainingCheck.input('oldDept', sql.NVarChar, 'Volunteer Management');
    const remainingResult = await remainingCheck.query(`
      SELECT COUNT(*) as count FROM rasci_metrics WHERE department = @oldDept
    `);
    const remaining = remainingResult.recordset[0].count;
    
    if (remaining > 0) {
      console.log(`⚠ Warning: ${remaining} RASCI records still have "Volunteer Management" (likely due to conflicts)`);
    } else {
      console.log('✓ All "Volunteer Management" records have been updated to "Volunteers"');
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

updateVolunteerManagementToVolunteers().catch(console.error);

