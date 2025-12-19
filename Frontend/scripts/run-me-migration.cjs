require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const getEnv = (key) => {
  const value = process.env[key];
  return value ? value.trim().replace(/^["']|["']$/g, '') : undefined;
};

// Parse server and port
const serverValue = getEnv('SERVER') || getEnv('VITE_SERVER') || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER'),
  password: getEnv('PWD') || getEnv('VITE_PWD'),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function runMEMigration() {
  let pool;
  try {
    console.log('Connecting to SQL Server...');
    console.log(`Server: ${config.server}${port ? ':' + port : ''}`);
    console.log(`Database: ${config.database}`);
    console.log(`User: ${config.user}`);
    
    if (!config.server || !config.database || !config.user || !config.password) {
      throw new Error('Missing database connection details. Please check your .env.local file.');
    }

    pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Read the migration script
    const migrationScript = fs.readFileSync(
      path.join(__dirname, '../database/migrate-add-me-fields.sql'),
      'utf8'
    );

    console.log('Running M&E fields migration...\n');

    // Execute the migration script
    // The script uses IF NOT EXISTS, so it's safe to run multiple times
    const result = await pool.request().query(migrationScript);

    console.log('✅ Migration completed successfully!\n');

    // Verify the columns were added
    console.log('Verifying columns...');
    const checkRequest = pool.request();
    const checkResult = await checkRequest.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'department_objectives'
      AND COLUMN_NAME LIKE 'me_%'
      ORDER BY COLUMN_NAME
    `);

    if (checkResult.recordset.length > 0) {
      console.log(`✅ Found ${checkResult.recordset.length} M&E columns:\n`);
      checkResult.recordset.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}, ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'})`);
      });
    } else {
      console.log('⚠️  Warning: No M&E columns found. Migration may have failed.');
    }

    await pool.close();
    console.log('\n✅ Migration script completed!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    if (pool) {
      await pool.close();
    }
    process.exit(1);
  }
}

runMEMigration();

