#!/usr/bin/env node
/**
 * Test Lock Rule - Verify lock rule is working for user ID 8
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const sql = require('mssql');

// Database config
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

async function testLockRule() {
  console.log('🔍 Testing Lock Rule for User ID 8\n');
  
  let pool;
  
  try {
    // Connect to database
    console.log('🔌 Connecting to database...');
    pool = await sql.connect(config);
    console.log('✅ Connected successfully!\n');

    // Get lock rule ID 11
    console.log('📋 Getting Lock Rule ID 11...\n');
    const lockResult = await pool.request().query(`
      SELECT * FROM field_locks WHERE id = 11
    `);
    
    if (lockResult.recordset.length === 0) {
      console.log('❌ Lock rule ID 11 not found!\n');
      return;
    }
    
    const lock = lockResult.recordset[0];
    console.log('Lock Rule Details:');
    console.log(`  ID: ${lock.id}`);
    console.log(`  Scope Type: ${lock.scope_type}`);
    console.log(`  User Scope: ${lock.user_scope}`);
    console.log(`  User IDs (raw): ${lock.user_ids} (type: ${typeof lock.user_ids})`);
    console.log(`  KPI Scope: ${lock.kpi_scope}`);
    console.log(`  Objective Scope: ${lock.objective_scope}`);
    console.log(`  Lock Annual Target: ${lock.lock_annual_target}`);
    console.log(`  Lock Monthly Target: ${lock.lock_monthly_target}`);
    console.log(`  Lock All Other Fields: ${lock.lock_all_other_fields}`);
    console.log(`  Is Active: ${lock.is_active}\n`);

    // Parse user_ids
    let userIds = [];
    try {
      if (lock.user_ids) {
        userIds = JSON.parse(lock.user_ids);
        console.log(`  Parsed User IDs: ${JSON.stringify(userIds)} (type: ${Array.isArray(userIds) ? 'array' : typeof userIds})`);
      }
    } catch (err) {
      console.log(`  ❌ Error parsing user_ids: ${err.message}`);
      return;
    }

    // Test user ID 8
    const testUserId = 8;
    console.log(`\n🧪 Testing with User ID: ${testUserId}\n`);
    
    // Check if user ID 8 is in the locked users list
    const lockedUserIds = userIds.map(id => Number(id));
    const currentUserId = Number(testUserId);
    const userMatches = lockedUserIds.includes(currentUserId);
    
    console.log(`  Current User ID: ${currentUserId} (type: ${typeof currentUserId})`);
    console.log(`  Locked User IDs: ${JSON.stringify(lockedUserIds)}`);
    console.log(`  User Matches: ${userMatches ? '✅ YES' : '❌ NO'}\n`);

    if (!userMatches) {
      console.log('❌ PROBLEM: User ID 8 is NOT in the locked users list!');
      console.log(`   Locked users: ${JSON.stringify(lockedUserIds)}`);
      console.log(`   Current user: ${currentUserId}`);
      return;
    }

    // Get user info for ID 8
    console.log('👤 Getting User Info for ID 8...\n');
    const userResult = await pool.request().query(`
      SELECT id, username, role FROM users WHERE id = ${testUserId}
    `);
    
    if (userResult.recordset.length === 0) {
      console.log(`❌ User ID ${testUserId} not found!\n`);
      return;
    }
    
    const user = userResult.recordset[0];
    console.log(`  User ID: ${user.id}`);
    console.log(`  Username: ${user.username}`);
    console.log(`  Role: ${user.role}\n`);

    // Get a sample objective to test lock on
    console.log('📋 Getting Sample Objectives...\n');
    const objResult = await pool.request().query(`
      SELECT TOP 3
        id, kpi, type, department_id, activity
      FROM department_objectives
      WHERE type LIKE '%Direct%'
      ORDER BY id DESC
    `);
    
    if (objResult.recordset.length === 0) {
      console.log('❌ No Direct objectives found to test!\n');
      return;
    }

    console.log('Sample Objectives:');
    objResult.recordset.forEach(obj => {
      console.log(`  - ID: ${obj.id}, KPI: ${obj.kpi}, Type: ${obj.type}`);
    });
    console.log('');

    // Simulate lock check for each objective
    console.log('🔒 Simulating Lock Checks...\n');
    for (const obj of objResult.recordset) {
      console.log(`Objective ID: ${obj.id}`);
      console.log(`  KPI: ${obj.kpi}`);
      console.log(`  Type: ${obj.type}`);
      
      // Check user scope
      let userMatchesCheck = true;
      if (lock.user_scope === 'specific' && lock.user_ids) {
        try {
          const parsedUserIds = JSON.parse(lock.user_ids);
          if (Array.isArray(parsedUserIds) && parsedUserIds.length > 0) {
            const lockedUserIdsCheck = parsedUserIds.map(id => Number(id));
            const currentUserIdCheck = Number(testUserId);
            userMatchesCheck = lockedUserIdsCheck.includes(currentUserIdCheck);
            console.log(`  User Scope Check: ${userMatchesCheck ? '✅ PASS' : '❌ FAIL'} (user ${currentUserIdCheck} in ${JSON.stringify(lockedUserIdsCheck)})`);
          } else {
            userMatchesCheck = false;
            console.log(`  User Scope Check: ❌ FAIL (empty array)`);
          }
        } catch (err) {
          userMatchesCheck = false;
          console.log(`  User Scope Check: ❌ FAIL (parse error: ${err.message})`);
        }
      }
      
      if (!userMatchesCheck) {
        console.log(`  Result: ❌ NOT LOCKED (user scope check failed)\n`);
        continue;
      }

      // Check KPI scope (all = matches all)
      const kpiMatches = lock.kpi_scope === 'all' || lock.kpi_scope === 'none';
      console.log(`  KPI Scope Check: ${kpiMatches ? '✅ PASS' : '❌ FAIL'} (scope: ${lock.kpi_scope})`);
      
      if (!kpiMatches) {
        console.log(`  Result: ❌ NOT LOCKED (KPI scope check failed)\n`);
        continue;
      }

      // Check objective scope (all = matches all)
      const objectiveMatches = lock.objective_scope === 'all' || lock.objective_scope === 'none';
      console.log(`  Objective Scope Check: ${objectiveMatches ? '✅ PASS' : '❌ FAIL'} (scope: ${lock.objective_scope})`);
      
      if (!objectiveMatches) {
        console.log(`  Result: ❌ NOT LOCKED (objective scope check failed)\n`);
        continue;
      }

      // Check field locks
      console.log(`  Field Locks:`);
      console.log(`    - Annual Target: ${lock.lock_annual_target ? '🔒 LOCKED' : '🔓 unlocked'}`);
      console.log(`    - Monthly Target: ${lock.lock_monthly_target ? '🔒 LOCKED' : '🔓 unlocked'}`);
      console.log(`    - All Other Fields: ${lock.lock_all_other_fields ? '🔒 LOCKED' : '🔓 unlocked'}`);
      
      console.log(`  Result: ✅ LOCKED (all checks passed)\n`);
    }

    await pool.close();
    console.log('✅ Test complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    if (pool) await pool.close();
  }
}

testLockRule();
