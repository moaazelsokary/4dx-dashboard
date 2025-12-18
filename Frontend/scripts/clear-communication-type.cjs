#!/usr/bin/env node

/**
 * Script to clear the type column for Communication department objectives
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

async function clearCommunicationType() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Communication department ID
    console.log('Getting Communication department...');
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE name = 'Communication'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Communication department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Communication department (ID: ${departmentId})\n`);

    // First, drop the CHECK constraint if it exists
    console.log('Modifying type constraint to allow empty strings...\n');
    try {
      await pool.request().query(`
        ALTER TABLE department_objectives
        DROP CONSTRAINT CK__department__type__44952D46
      `);
      console.log('✓ Dropped existing CHECK constraint\n');
    } catch (error) {
      // Try to find the constraint name dynamically
      const constraintResult = await pool.request().query(`
        SELECT name FROM sys.check_constraints 
        WHERE parent_object_id = OBJECT_ID('department_objectives') 
        AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('department_objectives'), 'type', 'ColumnId')
      `);
      
      if (constraintResult.recordset.length > 0) {
        const constraintName = constraintResult.recordset[0].name;
        await pool.request().query(`
          ALTER TABLE department_objectives
          DROP CONSTRAINT ${constraintName}
        `);
        console.log(`✓ Dropped CHECK constraint: ${constraintName}\n`);
      } else {
        console.log('⚠ No CHECK constraint found (may have been dropped already)\n');
      }
    }

    // Create new constraint that allows 'Direct', 'In direct', or empty string
    try {
      await pool.request().query(`
        ALTER TABLE department_objectives
        ADD CONSTRAINT CK_department_objectives_type 
        CHECK (type IN ('Direct', 'In direct', ''))
      `);
      console.log('✓ Created new CHECK constraint allowing empty strings\n');
    } catch (error) {
      console.log('⚠ Could not create new constraint (may already exist):', error.message);
    }

    // Update type to empty string for all Communication department objectives
    console.log('Clearing type column for Communication department objectives...\n');
    const updateRequest = pool.request();
    updateRequest.input('department_id', sql.Int, departmentId);
    
    const result = await updateRequest.query(`
      UPDATE department_objectives
      SET type = '',
          updated_at = GETDATE()
      WHERE department_id = @department_id
    `);

    console.log(`✓ Updated ${result.rowsAffected[0]} Communication department objectives`);
    console.log('  - All type values have been set to blank (empty string)\n');

  } catch (error) {
    console.error('✗ Error:', error.message);
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

clearCommunicationType();

