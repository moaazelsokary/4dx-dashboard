#!/usr/bin/env node

/**
 * Migration script to update DFR to Direct Fundraising / Resource Mobilization
 * Run with: node scripts/migrate-dfr.cjs
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

// Get password - handle DB_PASSWORD, VITE_PWD, or PWD
let password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD') || getEnv('PWD');

// If PWD looks like a path (starts with /), it's the system variable, not our password
if (password && password.startsWith('/') && password.includes('/')) {
  console.warn('[DB] PWD appears to be system path, not password. Using DB_PASSWORD or VITE_PWD instead.');
  password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD');
}

// If password contains URL encoding (%), try to decode it
if (password && password.includes('%')) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {
    console.log('[DB] Password decode failed, using as-is');
  }
}

// Remove quotes if they were added
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

async function migrateDFR() {
  let pool;
  try {
    console.log('Connecting to database...');
    console.log(`Server: ${config.server}:${config.port}`);
    console.log(`Database: ${config.database}`);
    console.log(`User: ${config.user}`);
    
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Step 1: Check and update departments table
    console.log('Step 1: Checking departments table...');
    const checkDeptRequest = pool.request();
    const deptCheck = await checkDeptRequest.query(`
      SELECT [name], [code] 
      FROM [dbo].[departments] 
      WHERE [code] = 'dfr';
    `);
    
    if (deptCheck.recordset.length > 0) {
      const dept = deptCheck.recordset[0];
      console.log(`  Found department with code 'dfr': ${dept.name}`);
      
      if (dept.name === 'DFR') {
        // Check if "Direct Fundraising / Resource Mobilization" already exists
        const checkFullName = pool.request();
        const fullNameCheck = await checkFullName.query(`
          SELECT [name], [code] 
          FROM [dbo].[departments] 
          WHERE [name] = 'Direct Fundraising / Resource Mobilization';
        `);
        
        if (fullNameCheck.recordset.length > 0) {
          console.log('  ⚠ "Direct Fundraising / Resource Mobilization" already exists as a separate department');
          console.log('  → Will update rasci_metrics to use existing department name\n');
        } else {
          // Update DFR to full name
          const deptRequest = pool.request();
          const deptResult = await deptRequest.query(`
            UPDATE [dbo].[departments]
            SET [name] = 'Direct Fundraising / Resource Mobilization'
            WHERE [code] = 'dfr' AND [name] = 'DFR';
            
            SELECT @@ROWCOUNT as rowsAffected;
          `);
          console.log(`  ✓ Updated ${deptResult.recordset[0].rowsAffected} department record(s)\n`);
        }
      } else if (dept.name === 'Direct Fundraising / Resource Mobilization') {
        console.log('  ✓ Department already has correct name\n');
      } else {
        console.log(`  ⚠ Department has unexpected name: ${dept.name}\n`);
      }
    } else {
      console.log('  ⚠ No department found with code "dfr"\n');
    }

    // Step 2: Check for duplicates in rasci_metrics
    console.log('Step 2: Checking for duplicate DFR records in rasci_metrics...');
    const checkRequest = pool.request();
    const duplicates = await checkRequest.query(`
      SELECT kpi, 
             SUM(CASE WHEN department = 'DFR' THEN 1 ELSE 0 END) as dfr_count,
             SUM(CASE WHEN department = 'Direct Fundraising / Resource Mobilization' THEN 1 ELSE 0 END) as fullname_count
      FROM rasci_metrics
      WHERE department IN ('DFR', 'Direct Fundraising / Resource Mobilization')
      GROUP BY kpi
      HAVING SUM(CASE WHEN department = 'DFR' THEN 1 ELSE 0 END) > 0
         AND SUM(CASE WHEN department = 'Direct Fundraising / Resource Mobilization' THEN 1 ELSE 0 END) > 0;
    `);
    
    if (duplicates.recordset.length > 0) {
      console.log(`⚠ Found ${duplicates.recordset.length} KPIs with both DFR and full name records:`);
      duplicates.recordset.forEach(row => {
        console.log(`  - KPI: ${row.kpi.substring(0, 50)}... (DFR: ${row.dfr_count}, Full: ${row.fullname_count})`);
      });
      console.log('\n⚠ These duplicates need manual review. The migration will update DFR records, but you may need to merge them manually.\n');
    } else {
      console.log('✓ No duplicates found\n');
    }

    // Step 3: Merge duplicate records first, then update remaining DFR records
    console.log('Step 3: Merging duplicate DFR records...');
    
    // First, merge duplicates by combining roles (OR logic - if either has a role, keep it)
    const mergeRequest = pool.request();
    const mergeResult = await mergeRequest.query(`
      -- Merge duplicates: combine roles from DFR and Direct Fundraising / Resource Mobilization
      UPDATE target
      SET 
        responsible = CASE WHEN target.responsible = 1 OR source.responsible = 1 THEN 1 ELSE 0 END,
        accountable = CASE WHEN target.accountable = 1 OR source.accountable = 1 THEN 1 ELSE 0 END,
        supportive = CASE WHEN target.supportive = 1 OR source.supportive = 1 THEN 1 ELSE 0 END,
        consulted = CASE WHEN target.consulted = 1 OR source.consulted = 1 THEN 1 ELSE 0 END,
        informed = CASE WHEN target.informed = 1 OR source.informed = 1 THEN 1 ELSE 0 END
      FROM rasci_metrics target
      INNER JOIN rasci_metrics source 
        ON target.kpi = source.kpi
        AND target.department = 'Direct Fundraising / Resource Mobilization'
        AND source.department = 'DFR';
      
      SELECT @@ROWCOUNT as rowsMerged;
    `);
    console.log(`  ✓ Merged ${mergeResult.recordset[0].rowsMerged} duplicate record(s)\n`);
    
    // Step 4: Delete the DFR records that were merged
    console.log('Step 4: Deleting merged DFR records...');
    const deleteRequest = pool.request();
    const deleteResult = await deleteRequest.query(`
      DELETE FROM rasci_metrics
      WHERE department = 'DFR'
        AND EXISTS (
          SELECT 1 FROM rasci_metrics r2
          WHERE r2.kpi = rasci_metrics.kpi
            AND r2.department = 'Direct Fundraising / Resource Mobilization'
        );
      
      SELECT @@ROWCOUNT as rowsDeleted;
    `);
    console.log(`  ✓ Deleted ${deleteResult.recordset[0].rowsDeleted} merged DFR record(s)\n`);
    
    // Step 5: Update remaining DFR records (those without duplicates)
    console.log('Step 5: Updating remaining DFR records...');
    const rasciRequest = pool.request();
    const rasciResult = await rasciRequest.query(`
      UPDATE [dbo].[rasci_metrics]
      SET [department] = 'Direct Fundraising / Resource Mobilization'
      WHERE [department] = 'DFR';
      
      SELECT @@ROWCOUNT as rowsAffected;
    `);
    console.log(`  ✓ Updated ${rasciResult.recordset[0].rowsAffected} remaining RASCI record(s)\n`);

    // Step 6: Verify migration
    console.log('Step 6: Verifying migration...');
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest.query(`
      SELECT DISTINCT department 
      FROM rasci_metrics 
      WHERE department LIKE '%Fundraising%' OR department = 'DFR';
    `);
    
    console.log('Remaining department names in rasci_metrics:');
    verifyResult.recordset.forEach(row => {
      console.log(`  - ${row.department}`);
    });
    
    if (verifyResult.recordset.some(r => r.department === 'DFR')) {
      console.log('\n⚠ Warning: Some "DFR" records still exist. Please check manually.');
    } else {
      console.log('\n✓ Migration completed successfully!');
      console.log('✓ All DFR records have been updated to "Direct Fundraising / Resource Mobilization"');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
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

// Run migration
migrateDFR().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

