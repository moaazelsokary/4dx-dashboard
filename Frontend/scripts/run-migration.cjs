#!/usr/bin/env node
/**
 * Database Migration Runner
 * Executes the monthly exclusion separation migration
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Parse server and port (same logic as db.cjs)
const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

// Robust password handling (match db.cjs)
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

async function runMigration() {
  console.log('🔄 Starting database migration...\n');
  console.log('📊 Connection Info:');
  console.log(`   Server: ${config.server}:${config.port}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   User: ${config.user}\n`);

  let pool;
  
  try {
    // Connect to database
    console.log('🔌 Connecting to database...');
    pool = await sql.connect(config);
    console.log('✅ Connected successfully!\n');

    // Read migration SQL file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrate-separate-monthly-exclusions.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Migration file loaded\n');

    console.log(`📝 Executing migration in steps...\n`);

    // Step 1: Add exclude_monthly_target column
    console.log('⚙️  Step 1: Adding exclude_monthly_target column...');
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'exclude_monthly_target')
        BEGIN
            ALTER TABLE field_locks ADD exclude_monthly_target BIT NOT NULL DEFAULT 0;
            PRINT 'Added exclude_monthly_target column';
        END
        ELSE
        BEGIN
            PRINT 'Column exclude_monthly_target already exists';
        END
      `);
      console.log('   ✅ Step 1 completed\n');
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      throw error;
    }

    // Step 2: Add exclude_monthly_actual column
    console.log('⚙️  Step 2: Adding exclude_monthly_actual column...');
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'exclude_monthly_actual')
        BEGIN
            ALTER TABLE field_locks ADD exclude_monthly_actual BIT NOT NULL DEFAULT 0;
            PRINT 'Added exclude_monthly_actual column';
        END
        ELSE
        BEGIN
            PRINT 'Column exclude_monthly_actual already exists';
        END
      `);
      console.log('   ✅ Step 2 completed\n');
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      throw error;
    }

    // Step 3: Migrate existing data
    console.log('⚙️  Step 3: Migrating existing exclude_monthly data...');
    try {
      const migrateResult = await pool.request().query(`
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'exclude_monthly')
        BEGIN
            UPDATE field_locks 
            SET exclude_monthly_target = exclude_monthly,
                exclude_monthly_actual = exclude_monthly
            WHERE exclude_monthly = 1;
            
            SELECT @@ROWCOUNT AS rows_updated;
        END
        ELSE
        BEGIN
            SELECT 0 AS rows_updated;
        END
      `);
      const rowsUpdated = migrateResult.recordset[0].rows_updated;
      console.log(`   ✅ Step 3 completed (${rowsUpdated} row(s) migrated)\n`);
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      throw error;
    }

    // Step 4: Drop default constraint on exclude_monthly (if exists)
    console.log('⚙️  Step 4a: Dropping default constraint on exclude_monthly...');
    try {
      await pool.request().query(`
        DECLARE @ConstraintName NVARCHAR(200);
        SELECT @ConstraintName = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
        WHERE c.object_id = OBJECT_ID('field_locks') AND c.name = 'exclude_monthly';
        
        IF @ConstraintName IS NOT NULL
        BEGIN
            DECLARE @SQL NVARCHAR(500) = 'ALTER TABLE field_locks DROP CONSTRAINT ' + @ConstraintName;
            EXEC sp_executesql @SQL;
            PRINT 'Dropped default constraint: ' + @ConstraintName;
        END
        ELSE
        BEGIN
            PRINT 'No default constraint found on exclude_monthly';
        END
      `);
      console.log('   ✅ Step 4a completed\n');
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      // Don't throw - continue even if no constraint
    }

    // Step 4b: Drop old column
    console.log('⚙️  Step 4b: Dropping old exclude_monthly column...');
    try {
      await pool.request().query(`
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'exclude_monthly')
        BEGIN
            ALTER TABLE field_locks DROP COLUMN exclude_monthly;
            PRINT 'Dropped old exclude_monthly column';
        END
        ELSE
        BEGIN
            PRINT 'Column exclude_monthly does not exist (already migrated)';
        END
      `);
      console.log('   ✅ Step 4b completed\n');
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      throw error;
    }

    // Step 5: Verify the changes
    console.log('⚙️  Step 5: Verifying migration...');
    try {
      const verifyResult = await pool.request().query(`
        SELECT 
            id, 
            lock_type, 
            scope_type,
            exclude_monthly_target,
            exclude_monthly_actual,
            exclude_annual_target
        FROM field_locks
        WHERE is_active = 1
      `);
      
      const locks = verifyResult.recordset;
      if (locks && locks.length > 0) {
        console.log('   📊 Current Active Locks:');
        locks.forEach(row => {
          console.log(`      Lock ${row.id} (${row.lock_type}, ${row.scope_type}):`);
          console.log(`         Monthly Target Excluded: ${row.exclude_monthly_target === 1 ? 'Yes' : 'No'}`);
          console.log(`         Monthly Actual Excluded: ${row.exclude_monthly_actual === 1 ? 'Yes' : 'No'}`);
          console.log(`         Annual Target Excluded: ${row.exclude_annual_target === 1 ? 'Yes' : 'No'}`);
        });
      } else {
        console.log('   ℹ️  No active locks found in database');
      }
      console.log('   ✅ Step 5 completed\n');
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      throw error;
    }

    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!\n');
    console.log('✅ Next steps:');
    console.log('   1. Hard refresh your browser (Ctrl + Shift + R)');
    console.log('   2. Go to Configuration → Lock Management');
    console.log('   3. You should see 3 separate checkboxes now\n');

  } catch (error) {
    console.error('❌ MIGRATION FAILED!\n');
    console.error('Error details:');
    console.error(`   Message: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    if (error.stack) {
      console.error(`\nStack trace:\n${error.stack}`);
    }
    process.exit(1);
  } finally {
    // Close connection
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

// Run the migration
runMigration()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
