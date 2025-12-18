#!/usr/bin/env node

/**
 * Script to make department_objective_id nullable in department_monthly_data table
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

async function makeDeptObjIdNullable() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    console.log('Making department_objective_id nullable...');
    
    // Check if column exists and is NOT NULL
    const checkResult = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        IS_NULLABLE,
        DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'department_monthly_data' 
      AND COLUMN_NAME = 'department_objective_id'
    `);

    if (checkResult.recordset.length === 0) {
      console.log('⚠ Column department_objective_id does not exist');
      return;
    }

    const isNullable = checkResult.recordset[0].IS_NULLABLE === 'YES';
    
    if (isNullable) {
      console.log('✓ Column department_objective_id is already nullable');
      return;
    }

    // Make the column nullable
    await pool.request().query(`
      ALTER TABLE department_monthly_data
      ALTER COLUMN department_objective_id INT NULL;
    `);

    console.log('✓ Column department_objective_id is now nullable');

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

makeDeptObjIdNullable();

