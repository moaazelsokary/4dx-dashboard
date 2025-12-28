#!/usr/bin/env node

/**
 * Script to allow NULL type for volunteers department and update all records
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

async function allowNullTypeForVolunteers() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Find and drop existing CHECK constraint
    console.log('Finding existing CHECK constraint...');
    const constraintResult = await pool.request().query(`
      SELECT name FROM sys.check_constraints 
      WHERE parent_object_id = OBJECT_ID('department_objectives') 
      AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('department_objectives'), 'type', 'ColumnId')
    `);
    
    if (constraintResult.recordset.length > 0) {
      const constraintName = constraintResult.recordset[0].name;
      console.log(`✓ Found constraint: ${constraintName}`);
      console.log('Dropping existing constraint...');
      
      await pool.request().query(`
        ALTER TABLE department_objectives
        DROP CONSTRAINT ${constraintName}
      `);
      console.log('✓ Dropped existing constraint\n');
    } else {
      console.log('⚠ No CHECK constraint found\n');
    }

    // Make type column nullable
    console.log('Making type column nullable...');
    try {
      await pool.request().query(`
        ALTER TABLE department_objectives
        ALTER COLUMN type NVARCHAR(50) NULL
      `);
      console.log('✓ Type column is now nullable\n');
    } catch (error) {
      console.log('⚠ Error making column nullable:', error.message);
      // Check if it's already nullable
      const colResult = await pool.request().query(`
        SELECT IS_NULLABLE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'department_objectives' AND COLUMN_NAME = 'type'
      `);
      if (colResult.recordset.length > 0 && colResult.recordset[0].IS_NULLABLE === 'YES') {
        console.log('✓ Type column is already nullable\n');
      } else {
        throw error;
      }
    }

    // Create new constraint that allows NULL, 'Direct', 'In direct', 'M&E', 'M&E MOV', or empty string
    console.log('Creating new constraint allowing NULL...');
    try {
      await pool.request().query(`
        ALTER TABLE department_objectives
        ADD CONSTRAINT CK_department_objectives_type 
        CHECK (type IS NULL OR type IN ('Direct', 'In direct', 'M&E', 'M&E MOV', ''))
      `);
      console.log('✓ Created new CHECK constraint allowing NULL\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠ Constraint already exists, trying to drop and recreate...');
        try {
          await pool.request().query(`
            ALTER TABLE department_objectives
            DROP CONSTRAINT CK_department_objectives_type
          `);
        } catch (dropError) {
          // Ignore if constraint doesn't exist
        }
        await pool.request().query(`
          ALTER TABLE department_objectives
          ADD CONSTRAINT CK_department_objectives_type 
          CHECK (type IS NULL OR type IN ('Direct', 'In direct', 'M&E', 'M&E MOV', ''))
        `);
        console.log('✓ Recreated constraint\n');
      } else {
        throw error;
      }
    }

    // Get Volunteers department ID
    console.log('Getting Volunteers department...');
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE code = 'volunteers'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Volunteers department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Volunteers department (ID: ${departmentId})\n`);

    // Update all volunteers department objectives to have NULL type
    console.log('Updating volunteers department objectives to have NULL type...');
    const updateRequest = pool.request();
    updateRequest.input('department_id', sql.Int, departmentId);
    
    const result = await updateRequest.query(`
      UPDATE department_objectives
      SET type = NULL,
          updated_at = GETDATE()
      WHERE department_id = @department_id
    `);

    console.log(`✓ Updated ${result.rowsAffected[0]} volunteers department objectives`);
    console.log('  - All type values have been set to NULL\n');

    console.log('✅ Migration completed successfully!');
    console.log('  - Type column now allows: NULL, Direct, In direct, M&E, M&E MOV, or empty string\n');

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

allowNullTypeForVolunteers().catch(console.error);

