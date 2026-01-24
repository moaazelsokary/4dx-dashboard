#!/usr/bin/env node
/**
 * Lock Status Diagnostic Tool
 * Checks lock configuration and why a lock may not be working
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const sql = require('mssql');

// Database config (same as run-migration.cjs)
const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
if (password && password.startsWith('/')) {
  password = process.env.DB_PASSWORD || process.env.VITE_PWD;
}
if (password && (password.includes('%'))) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {
    // Keep original if decode fails
  }
}
if ((password && password.startsWith('"') && password.endsWith('"')) || 
    (password && password.startsWith("'") && password.endsWith("'"))) {
  password = password.slice(1, -1);
}
if (password) {
  password = password.trim();
}

const config = {
  server: server,
  port: port,
  database: process.env.DATABASE || process.env.VITE_DATABASE,
  user: process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
  password: password,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 60000,
    connectionTimeout: 30000,
  },
};

async function checkLockStatus() {
  console.log('🔍 Lock Status Diagnostic Tool\n');
  console.log('📊 Connection Info:');
  console.log(`   Server: ${config.server}:${config.port}`);
  console.log(`   Database: ${config.database}\n`);

  let pool;
  
  try {
    // Connect to database
    console.log('🔌 Connecting to database...');
    pool = await sql.connect(config);
    console.log('✅ Connected successfully!\n');

    // Get "case" user ID
    console.log('👤 Looking up "case" user...');
    const userResult = await pool.request().query(`
      SELECT id, username, role FROM users WHERE username = 'case'
    `);
    
    if (userResult.recordset.length === 0) {
      console.log('❌ User "case" not found!\n');
      return;
    }
    
    const caseUser = userResult.recordset[0];
    console.log(`✅ Found user: ${caseUser.username} (ID: ${caseUser.id}, Role: ${caseUser.role})\n`);

    // Get all active locks
    console.log('🔒 Active Locks in Database:\n');
    const locksResult = await pool.request().query(`
      SELECT 
        id, 
        lock_type, 
        scope_type,
        user_ids,
        kpi,
        department_id,
        exclude_monthly_target,
        exclude_monthly_actual,
        exclude_annual_target,
        created_at
      FROM field_locks
      WHERE is_active = 1
      ORDER BY created_at DESC
    `);

    if (locksResult.recordset.length === 0) {
      console.log('   ⚠️  No active locks found!\n');
      return;
    }

    locksResult.recordset.forEach(lock => {
      console.log(`   Lock ID: ${lock.id}`);
      console.log(`   Type: ${lock.lock_type}`);
      console.log(`   Scope: ${lock.scope_type}`);
      
      if (lock.user_ids) {
        try {
          const userIds = JSON.parse(lock.user_ids);
          console.log(`   User IDs: ${userIds.join(', ')}`);
          console.log(`   Applies to "case" (ID ${caseUser.id}): ${userIds.includes(caseUser.id) ? '✅ YES' : '❌ NO'}`);
        } catch (e) {
          console.log(`   User IDs: ${lock.user_ids} (parse error)`);
        }
      } else {
        console.log(`   User IDs: All users (null)`);
        console.log(`   Applies to "case": ✅ YES (all users)`);
      }
      
      if (lock.kpi) {
        console.log(`   KPI: ${lock.kpi}`);
      }
      
      if (lock.department_id) {
        console.log(`   Department ID: ${lock.department_id}`);
      }

      console.log(`   Exclusions:`);
      console.log(`     - Monthly Target: ${lock.exclude_monthly_target === 1 ? '✅ Excluded' : '❌ Not excluded (LOCKED)'}`);
      console.log(`     - Monthly Actual: ${lock.exclude_monthly_actual === 1 ? '✅ Excluded' : '❌ Not excluded (LOCKED)'}`);
      console.log(`     - Annual Target: ${lock.exclude_annual_target === 1 ? '✅ Excluded' : '❌ Not excluded (LOCKED)'}`);
      console.log(`   Created: ${lock.created_at}`);
      console.log('');
    });

    // Get sample objectives for "case" user's department
    console.log('\n📋 Sample Objectives for Testing:\n');
    const objectivesResult = await pool.request().query(`
      SELECT TOP 5
        do.id,
        do.activity,
        do.type,
        do.kpi,
        do.department_id,
        do.activity_target,
        do.responsible_person,
        d.name as department_name
      FROM department_objectives do
      LEFT JOIN departments d ON do.department_id = d.id
      ORDER BY do.id DESC
    `);

    objectivesResult.recordset.forEach(obj => {
      console.log(`   Objective ID: ${obj.id}`);
      console.log(`   Activity: ${obj.activity}`);
      console.log(`   Type: ${obj.type}`);
      console.log(`   Has "Direct": ${obj.type && obj.type.includes('Direct') ? '✅ YES' : '❌ NO'}`);
      console.log(`   KPI: ${obj.kpi}`);
      console.log(`   Department: ${obj.department_name} (ID: ${obj.department_id})`);
      console.log(`   Target: ${obj.activity_target}`);
      console.log('');
    });

    console.log('\n💡 Testing Tips:\n');
    console.log('1. Log in as "case" user');
    console.log('2. Open browser console (F12)');
    console.log('3. Try to edit one of the objectives above');
    console.log('4. Look for "[Lock Check]" messages in console');
    console.log('5. Fields should show lock icon 🔒 and be disabled\n');
    console.log('❗ Remember: Monthly Actual ONLY locks Direct type objectives!\n');

  } catch (error) {
    console.error('❌ ERROR!\n');
    console.error(`   Message: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    if (error.stack) {
      console.error(`\n   Stack: ${error.stack}`);
    }
    process.exit(1);
  } finally {
    if (pool) {
      try {
        await pool.close();
        console.log('🔌 Database connection closed');
      } catch (error) {
        console.error('Error closing connection:', error.message);
      }
    }
  }
}

// Run the diagnostic
checkLockStatus()
  .then(() => {
    console.log('\n✅ Diagnostic complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
