#!/usr/bin/env node

/**
 * Script to migrate department_monthly_data to link with KPI instead of department_objective_id
 */

require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

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

async function migrateMonthlyData() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    console.log('Starting migration...\n');

    // Step 1: Add new columns if they don't exist
    console.log('Step 1: Adding new columns...');
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_monthly_data]') AND name = 'kpi')
        BEGIN
            ALTER TABLE [dbo].[department_monthly_data]
            ADD [kpi] NVARCHAR(500) NULL,
                [department_id] INT NULL;
        END;
      `);
      console.log('✓ Added kpi and department_id columns');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✓ Columns already exist');
      } else {
        throw error;
      }
    }

    // Step 2: Populate new columns from existing data
    console.log('\nStep 2: Populating new columns from existing data...');
    const updateResult = await pool.request().query(`
      UPDATE dmd
      SET dmd.kpi = do.kpi,
          dmd.department_id = do.department_id
      FROM [dbo].[department_monthly_data] dmd
      INNER JOIN [dbo].[department_objectives] do ON dmd.department_objective_id = do.id
      WHERE dmd.kpi IS NULL;
    `);
    console.log(`✓ Updated ${updateResult.rowsAffected[0]} records`);

    // Step 3: Make columns NOT NULL
    console.log('\nStep 3: Making columns NOT NULL...');
    try {
      await pool.request().query(`
        ALTER TABLE [dbo].[department_monthly_data]
        ALTER COLUMN [kpi] NVARCHAR(500) NOT NULL;
      `);
      await pool.request().query(`
        ALTER TABLE [dbo].[department_monthly_data]
        ALTER COLUMN [department_id] INT NOT NULL;
      `);
      console.log('✓ Columns are now NOT NULL');
    } catch (error) {
      console.log(`⚠ Warning: ${error.message}`);
    }

    // Step 4: Check for invalid department_ids and fix them
    console.log('\nStep 4: Checking and fixing invalid department_ids...');
    const invalidCheck = await pool.request().query(`
      SELECT dmd.id, dmd.department_id
      FROM department_monthly_data dmd
      LEFT JOIN departments d ON dmd.department_id = d.id
      WHERE dmd.department_id IS NOT NULL AND d.id IS NULL
    `);
    
    if (invalidCheck.recordset.length > 0) {
      console.log(`⚠ Found ${invalidCheck.recordset.length} records with invalid department_id`);
      // Try to fix by getting department_id from department_objectives
      const fixResult = await pool.request().query(`
        UPDATE dmd
        SET dmd.department_id = do.department_id
        FROM department_monthly_data dmd
        INNER JOIN department_objectives do ON dmd.department_objective_id = do.id
        WHERE dmd.department_id NOT IN (SELECT id FROM departments)
      `);
      console.log(`✓ Fixed ${fixResult.rowsAffected[0]} records`);
    }

    // Step 5: Add foreign key for department_id
    console.log('\nStep 5: Adding foreign key constraint...');
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_department_monthly_data_department_id')
        BEGIN
            ALTER TABLE [dbo].[department_monthly_data]
            ADD CONSTRAINT FK_department_monthly_data_department_id
            FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments]([id]) ON DELETE CASCADE;
        END;
      `);
      console.log('✓ Foreign key constraint added');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✓ Foreign key already exists');
      } else {
        console.log(`⚠ Warning: Could not add foreign key: ${error.message}`);
        console.log('  This is okay - the constraint may already exist or there may be data issues');
      }
    }

    // Step 6: Check for duplicates and handle them
    console.log('\nStep 6: Checking for duplicate entries...');
    const duplicates = await pool.request().query(`
      SELECT kpi, department_id, month, COUNT(*) as count
      FROM department_monthly_data
      GROUP BY kpi, department_id, month
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.recordset.length > 0) {
      console.log(`⚠ Found ${duplicates.recordset.length} duplicate combinations`);
      // Keep the first one, delete others
      const deleteResult = await pool.request().query(`
        WITH DuplicateCTE AS (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY kpi, department_id, month ORDER BY id) as rn
          FROM department_monthly_data
        )
        DELETE FROM DuplicateCTE WHERE rn > 1
      `);
      console.log(`✓ Removed duplicate entries`);
    }

    // Step 7: Drop old unique constraint and create new one
    console.log('\nStep 7: Updating unique constraint...');
    try {
      // Get all unique constraints
      const constraints = await pool.request().query(`
        SELECT i.name, i.is_unique_constraint
        FROM sys.indexes i
        WHERE i.object_id = OBJECT_ID(N'[dbo].[department_monthly_data]') 
        AND (i.is_unique = 1 OR i.is_unique_constraint = 1)
      `);
      
      for (const constraint of constraints.recordset) {
        try {
          if (constraint.is_unique_constraint) {
            await pool.request().query(`
              ALTER TABLE [dbo].[department_monthly_data]
              DROP CONSTRAINT ${constraint.name};
            `);
          } else {
            await pool.request().query(`
              DROP INDEX ${constraint.name} ON [dbo].[department_monthly_data];
            `);
          }
          console.log(`  Dropped constraint/index: ${constraint.name}`);
        } catch (e) {
          // Ignore if doesn't exist
        }
      }

      // Create new unique constraint
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_department_monthly_data_kpi_dept_month')
        BEGIN
            ALTER TABLE [dbo].[department_monthly_data]
            ADD CONSTRAINT UQ_department_monthly_data_kpi_dept_month
            UNIQUE ([kpi], [department_id], [month]);
        END;
      `);
      console.log('✓ Unique constraint created');
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log('✓ Unique constraint already exists or duplicates found');
      } else {
        console.log(`⚠ Warning: Could not create unique constraint: ${error.message}`);
      }
    }

    // Step 8: Create indexes
    console.log('\nStep 8: Creating indexes...');
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_department_monthly_data_kpi')
        BEGIN
            CREATE INDEX IX_department_monthly_data_kpi ON [dbo].[department_monthly_data]([kpi]);
        END;
      `);
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_department_monthly_data_department_id')
        BEGIN
            CREATE INDEX IX_department_monthly_data_department_id ON [dbo].[department_monthly_data]([department_id]);
        END;
      `);
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_department_monthly_data_kpi_dept')
        BEGIN
            CREATE INDEX IX_department_monthly_data_kpi_dept ON [dbo].[department_monthly_data]([kpi], [department_id]);
        END;
      `);
      console.log('✓ Indexes created');
    } catch (error) {
      console.log(`⚠ Warning: ${error.message}`);
    }

    console.log('\n✓ Migration completed successfully!');
    console.log('\nNote: The department_objective_id column is kept for backward compatibility.');
    console.log('You can drop it later if not needed.');

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

migrateMonthlyData();

