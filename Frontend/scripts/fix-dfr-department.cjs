#!/usr/bin/env node

/**
 * Script to fix DFR department:
 * 1. Delete the duplicate DFR row (id=5)
 * 2. Update Direct Fundraising / Resource Mobilization (id=14) to use code 'dfr'
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

async function fixDFRDepartment() {
  let pool;
  try {
    console.log('Connecting to database...');
    console.log(`Server: ${config.server}:${config.port}`);
    console.log(`Database: ${config.database}`);
    console.log(`User: ${config.user}`);
    
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Step 1: Check current state
    console.log('Step 1: Checking current departments...');
    const checkRequest = pool.request();
    const departments = await checkRequest.query(`
      SELECT id, name, code, created_at
      FROM [dbo].[departments]
      WHERE code = 'dfr' OR name LIKE '%Fundraising%' OR name = 'DFR'
      ORDER BY id;
    `);
    
    console.log('Current DFR-related departments:');
    departments.recordset.forEach(dept => {
      console.log(`  ID: ${dept.id}, Name: ${dept.name}, Code: ${dept.code}`);
    });
    console.log('');

    // Step 2: Delete the duplicate DFR row (id=5)
    console.log('Step 2: Deleting duplicate DFR row (id=5)...');
    const deleteRequest = pool.request();
    deleteRequest.input('id', sql.Int, 5);
    const deleteResult = await deleteRequest.query(`
      DELETE FROM [dbo].[departments]
      WHERE id = @id;
      
      SELECT @@ROWCOUNT as rowsDeleted;
    `);
    console.log(`✓ Deleted ${deleteResult.recordset[0].rowsDeleted} row(s)\n`);

    // Step 3: Update Direct Fundraising / Resource Mobilization (id=14) to use code 'dfr'
    console.log('Step 3: Updating Direct Fundraising / Resource Mobilization (id=14) to use code "dfr"...');
    const updateRequest = pool.request();
    updateRequest.input('id', sql.Int, 14);
    updateRequest.input('code', sql.NVarChar, 'dfr');
    const updateResult = await updateRequest.query(`
      UPDATE [dbo].[departments]
      SET code = @code
      WHERE id = @id;
      
      SELECT @@ROWCOUNT as rowsUpdated;
    `);
    console.log(`✓ Updated ${updateResult.recordset[0].rowsUpdated} row(s)\n`);

    // Step 4: Verify the changes
    console.log('Step 4: Verifying changes...');
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest.query(`
      SELECT id, name, code, created_at
      FROM [dbo].[departments]
      WHERE code = 'dfr' OR name LIKE '%Fundraising%' OR name = 'DFR'
      ORDER BY id;
    `);
    
    console.log('Final DFR-related departments:');
    verifyResult.recordset.forEach(dept => {
      console.log(`  ID: ${dept.id}, Name: ${dept.name}, Code: ${dept.code}`);
    });
    
    if (verifyResult.recordset.length === 1 && 
        verifyResult.recordset[0].id === 14 && 
        verifyResult.recordset[0].code === 'dfr') {
      console.log('\n✓ Fix completed successfully!');
      console.log('✓ Only one DFR department exists with code "dfr"');
    } else {
      console.log('\n⚠ Warning: Unexpected result. Please verify manually.');
    }

  } catch (error) {
    console.error('❌ Fix failed:', error.message);
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

// Run fix
fixDFRDepartment().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

