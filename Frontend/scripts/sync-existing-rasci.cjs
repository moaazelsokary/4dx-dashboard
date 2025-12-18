#!/usr/bin/env node

/**
 * Script to sync existing KPIs with blank RASCI entries for all departments
 * This ensures all current KPIs have RASCI entries (even if blank)
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

async function syncExistingRASCI() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    console.log('Syncing existing KPIs with blank RASCI entries...\n');

    // Insert blank RASCI entries for all KPIs and departments that don't exist yet
    const result = await pool.request().query(`
      INSERT INTO [dbo].[rasci_metrics] (kpi, department, responsible, accountable, supportive, consulted, informed, created_at, updated_at)
      SELECT 
          mpo.kpi,
          d.name,
          0,
          0,
          0,
          0,
          0,
          GETDATE(),
          GETDATE()
      FROM [dbo].[main_plan_objectives] mpo
      CROSS JOIN [dbo].[departments] d
      WHERE NOT EXISTS (
          SELECT 1 
          FROM [dbo].[rasci_metrics] rm 
          WHERE rm.kpi = mpo.kpi AND rm.department = d.name
      )
    `);

    const insertedCount = result.rowsAffected[0];
    console.log(`✓ Synced ${insertedCount} RASCI entries`);
    console.log('\nAll existing KPIs now have blank RASCI entries for all departments.');

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

syncExistingRASCI();

