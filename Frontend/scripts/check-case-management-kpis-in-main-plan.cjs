#!/usr/bin/env node

/**
 * Script to check if Case Management KPIs exist in main_plan_objectives
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

async function checkCaseManagementKPIs() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Case Management department ID
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE name = 'Case Management'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Case Management department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Case Management department (ID: ${departmentId})\n`);

    // Get all Case Management department objectives with Direct type
    console.log('Getting Case Management Direct objectives...');
    const deptObjsResult = await pool.request()
      .input('department_id', sql.Int, departmentId)
      .query(`
        SELECT DISTINCT kpi, type
        FROM department_objectives 
        WHERE department_id = @department_id AND type = 'Direct'
        ORDER BY kpi
      `);
    
    const caseManagementKPIs = deptObjsResult.recordset.map(row => row.kpi);
    console.log(`✓ Found ${caseManagementKPIs.length} unique Direct KPIs in Case Management\n`);

    // Get all KPIs from main_plan_objectives
    console.log('Getting all KPIs from main_plan_objectives...');
    const mainKPIsResult = await pool.request().query(`
      SELECT DISTINCT kpi FROM main_plan_objectives ORDER BY kpi
    `);
    
    const mainKPIs = new Set(mainKPIsResult.recordset.map(row => row.kpi));
    console.log(`✓ Found ${mainKPIs.size} KPIs in main_plan_objectives\n`);

    // Check which Case Management KPIs are missing
    console.log('Checking which KPIs are missing from main_plan_objectives...\n');
    const missingKPIs = [];
    const existingKPIs = [];

    caseManagementKPIs.forEach(kpi => {
      if (!mainKPIs.has(kpi)) {
        missingKPIs.push(kpi);
      } else {
        existingKPIs.push(kpi);
      }
    });

    console.log(`✓ KPIs that exist in main_plan_objectives: ${existingKPIs.length}`);
    if (existingKPIs.length > 0) {
      console.log('  These KPIs should show in strategic plan:');
      existingKPIs.forEach(kpi => {
        console.log(`    - ${kpi}`);
      });
    }

    console.log(`\n⚠ KPIs missing from main_plan_objectives: ${missingKPIs.length}`);
    if (missingKPIs.length > 0) {
      console.log('  These KPIs need to be added to main_plan_objectives to show in strategic plan:');
      missingKPIs.forEach(kpi => {
        console.log(`    - ${kpi}`);
      });
    }

    // Show sample department objectives for missing KPIs
    if (missingKPIs.length > 0) {
      console.log('\n📋 Sample department objectives for missing KPIs:');
      for (const kpi of missingKPIs.slice(0, 3)) {
        const sampleResult = await pool.request()
          .input('department_id', sql.Int, departmentId)
          .input('kpi', sql.NVarChar, kpi)
          .query(`
            SELECT TOP 1 activity, activity_target, type
            FROM department_objectives
            WHERE department_id = @department_id AND kpi = @kpi AND type = 'Direct'
          `);
        
        if (sampleResult.recordset.length > 0) {
          const sample = sampleResult.recordset[0];
          console.log(`\n  KPI: ${kpi}`);
          console.log(`    Activity: ${sample.activity.substring(0, 60)}...`);
          console.log(`    Target: ${sample.activity_target}`);
          console.log(`    Type: ${sample.type}`);
        }
      }
    }

  } catch (error) {
    console.error('✗ Error:', error.message);
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

checkCaseManagementKPIs();

