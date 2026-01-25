#!/usr/bin/env node
/**
 * Direct API Test - Test lock check API directly to verify it's working
 * This simulates what the frontend does when checking locks
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

// Import the checkLockStatus function logic directly
async function testLockCheckDirectly() {
  console.log('🧪 Testing Lock Check Logic Directly\n');
  
  let pool;
  
  try {
    // Connect to database
    console.log('🔌 Connecting to database...');
    pool = await sql.connect(config);
    console.log('✅ Connected successfully!\n');

    // Test parameters
    const testUserId = 8; // User "case"
    const testObjectiveId = 485; // A Direct objective
    const testFieldType = 'target';

    console.log('Test Parameters:');
    console.log(`  User ID: ${testUserId}`);
    console.log(`  Objective ID: ${testObjectiveId}`);
    console.log(`  Field Type: ${testFieldType}\n`);

    // Get objective details
    console.log('📋 Getting Objective Details...\n');
    const deptObjRequest = pool.request();
    deptObjRequest.input('id', sql.Int, testObjectiveId);
    const deptObjResult = await deptObjRequest.query(`
      SELECT kpi, department_id, type, responsible_person FROM department_objectives WHERE id = @id
    `);
    
    if (deptObjResult.recordset.length === 0) {
      console.log('❌ Objective not found!\n');
      return;
    }

    const obj = deptObjResult.recordset[0];
    console.log('Objective Details:');
    console.log(`  KPI: ${obj.kpi}`);
    console.log(`  Department ID: ${obj.department_id}`);
    console.log(`  Type: ${obj.type}`);
    console.log(`  Responsible Person: ${obj.responsible_person}\n`);

    // Get all active locks
    console.log('🔒 Getting Active Locks...\n');
    const locks = await pool.request().query(`
      SELECT * FROM field_locks 
      WHERE is_active = 1
      ORDER BY 
        CASE 
          WHEN scope_type = 'hierarchical' AND objective_scope = 'specific' THEN 1
          WHEN scope_type = 'hierarchical' AND kpi_scope = 'specific' THEN 2
          WHEN scope_type = 'hierarchical' AND user_scope = 'specific' THEN 3
          WHEN scope_type = 'hierarchical' THEN 4
          ELSE 11
        END
    `);

    console.log(`Found ${locks.recordset.length} active lock(s)\n`);

    // Check each lock
    for (const lock of locks.recordset) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Lock ID: ${lock.id}`);
      console.log(`Scope Type: ${lock.scope_type}`);
      console.log(`User Scope: ${lock.user_scope}`);
      console.log(`User IDs (raw): ${lock.user_ids} (type: ${typeof lock.user_ids})`);
      console.log(`KPI Scope: ${lock.kpi_scope}`);
      console.log(`Objective Scope: ${lock.objective_scope}`);
      console.log(`Lock Annual Target: ${lock.lock_annual_target}`);
      console.log(`Lock Monthly Target: ${lock.lock_monthly_target}`);
      console.log(`Lock All Other Fields: ${lock.lock_all_other_fields}`);
      console.log(`Is Active: ${lock.is_active}`);

      if (lock.scope_type === 'hierarchical') {
        // Check user scope
        let userMatches = true;
        if (lock.user_scope === 'specific' && lock.user_ids) {
          try {
            const userIds = JSON.parse(lock.user_ids);
            console.log(`\n  Parsed User IDs: ${JSON.stringify(userIds)}`);
            if (Array.isArray(userIds) && userIds.length > 0) {
              const currentUserId = Number(testUserId);
              const lockedUserIds = userIds.map(id => Number(id));
              userMatches = lockedUserIds.includes(currentUserId);
              console.log(`  User Match Check:`);
              console.log(`    Current User ID: ${currentUserId}`);
              console.log(`    Locked User IDs: ${JSON.stringify(lockedUserIds)}`);
              console.log(`    Match: ${userMatches ? '✅ YES' : '❌ NO'}`);
            } else {
              userMatches = false;
              console.log(`  User Match: ❌ NO (empty array)`);
            }
          } catch (err) {
            console.log(`  User Match: ❌ NO (parse error: ${err.message})`);
            userMatches = false;
          }
        } else if (lock.user_scope === 'none') {
          userMatches = true;
          console.log(`  User Match: ✅ YES (scope is 'none', matches all)`);
        } else {
          console.log(`  User Match: ✅ YES (scope is 'all', matches all)`);
        }

        if (!userMatches) {
          console.log(`\n  ❌ Lock does NOT apply (user scope check failed)`);
          continue;
        }

        // Check KPI scope
        let kpiMatches = true;
        if (lock.kpi_scope === 'specific' && lock.kpi_ids) {
          try {
            const kpiIds = JSON.parse(lock.kpi_ids);
            const objectiveKPIs = obj.kpi.includes('||') ? obj.kpi.split('||').map(k => k.trim()) : [obj.kpi];
            kpiMatches = objectiveKPIs.some(objKpi => kpiIds.includes(objKpi));
            console.log(`  KPI Match: ${kpiMatches ? '✅ YES' : '❌ NO'}`);
          } catch (err) {
            kpiMatches = false;
            console.log(`  KPI Match: ❌ NO (parse error)`);
          }
        } else {
          console.log(`  KPI Match: ✅ YES (scope is '${lock.kpi_scope}', matches all)`);
        }

        if (!kpiMatches) {
          console.log(`\n  ❌ Lock does NOT apply (KPI scope check failed)`);
          continue;
        }

        // Check objective scope
        let objectiveMatches = true;
        if (lock.objective_scope === 'specific' && lock.objective_ids) {
          try {
            const objectiveIds = JSON.parse(lock.objective_ids);
            objectiveMatches = objectiveIds.some(id => Number(id) === Number(testObjectiveId));
            console.log(`  Objective Match: ${objectiveMatches ? '✅ YES' : '❌ NO'}`);
          } catch (err) {
            objectiveMatches = false;
            console.log(`  Objective Match: ❌ NO (parse error)`);
          }
        } else {
          console.log(`  Objective Match: ✅ YES (scope is '${lock.objective_scope}', matches all)`);
        }

        if (!objectiveMatches) {
          console.log(`\n  ❌ Lock does NOT apply (objective scope check failed)`);
          continue;
        }

        // Check field locks
        console.log(`\n  ✅ ALL SCOPE CHECKS PASSED!`);
        console.log(`  Checking field locks...`);
        
        const objectiveHasDirectType = obj.type && obj.type.includes('Direct');
        console.log(`    Objective has Direct type: ${objectiveHasDirectType ? '✅ YES' : '❌ NO'}`);

        if (testFieldType === 'target' && (lock.lock_annual_target === true || lock.lock_annual_target === 1)) {
          console.log(`\n  🔒 RESULT: FIELD IS LOCKED!`);
          console.log(`    Reason: Locked by hierarchical rule (Annual Target)`);
          console.log(`    Lock ID: ${lock.id}`);
          return { is_locked: true, lock_id: lock.id, reason: 'Locked by hierarchical rule (Annual Target)' };
        } else if (testFieldType === 'monthly_target' && (lock.lock_monthly_target === true || lock.lock_monthly_target === 1)) {
          console.log(`\n  🔒 RESULT: FIELD IS LOCKED!`);
          console.log(`    Reason: Locked by hierarchical rule (Monthly Target)`);
          console.log(`    Lock ID: ${lock.id}`);
          return { is_locked: true, lock_id: lock.id, reason: 'Locked by hierarchical rule (Monthly Target)' };
        } else if (testFieldType === 'all_fields' && (lock.lock_all_other_fields === true || lock.lock_all_other_fields === 1)) {
          console.log(`\n  🔒 RESULT: FIELD IS LOCKED!`);
          console.log(`    Reason: Locked by hierarchical rule (Other Fields)`);
          console.log(`    Lock ID: ${lock.id}`);
          return { is_locked: true, lock_id: lock.id, reason: 'Locked by hierarchical rule (Other Fields)' };
        } else {
          console.log(`    Field type '${testFieldType}' is NOT locked by this lock rule`);
        }
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n  🔓 RESULT: FIELD IS NOT LOCKED`);
    console.log(`    No matching lock rules found`);

    await pool.close();
    return { is_locked: false };
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    if (pool) await pool.close();
    return { is_locked: false, error: error.message };
  }
}

testLockCheckDirectly().then(result => {
  console.log('\n\n=== FINAL RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.is_locked ? 0 : 1);
});
