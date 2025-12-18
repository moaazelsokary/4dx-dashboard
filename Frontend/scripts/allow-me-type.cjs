#!/usr/bin/env node

/**
 * Script to update department_objectives type constraint to allow 'M&E'
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

async function allowMEType() {
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

    // Create new constraint that allows 'Direct', 'In direct', 'M&E', or empty string
    console.log('Creating new constraint allowing M&E type...');
    try {
      await pool.request().query(`
        ALTER TABLE department_objectives
        ADD CONSTRAINT CK_department_objectives_type 
        CHECK (type IN ('Direct', 'In direct', 'M&E', ''))
      `);
      console.log('✓ Created new CHECK constraint allowing M&E type\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠ Constraint already exists, trying to drop and recreate...');
        await pool.request().query(`
          ALTER TABLE department_objectives
          DROP CONSTRAINT CK_department_objectives_type
        `);
        await pool.request().query(`
          ALTER TABLE department_objectives
          ADD CONSTRAINT CK_department_objectives_type 
          CHECK (type IN ('Direct', 'In direct', 'M&E', ''))
        `);
        console.log('✓ Recreated constraint\n');
      } else {
        throw error;
      }
    }

    console.log('✓ Migration completed successfully!');
    console.log('  - Type column now allows: Direct, In direct, M&E, or empty string\n');

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

allowMEType();

