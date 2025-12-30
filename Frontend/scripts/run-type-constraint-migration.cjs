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

async function runTypeConstraintMigration() {
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
      path.join(__dirname, '../database/migrate-update-type-constraint.sql'),
      'utf8'
    );

    console.log('Running type constraint migration...\n');

    // Split by GO statements (SQL Server batch separator)
    const batches = migrationScript
      .split(/^\s*GO\s*$/gim)
      .map(batch => batch.trim())
      .filter(batch => batch.length > 0);

    console.log(`Executing ${batches.length} SQL batches...\n`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (batch.trim()) {
        try {
          await pool.request().query(batch);
          console.log(`✅ Batch ${i + 1}/${batches.length} executed successfully`);
        } catch (error) {
          // Some errors are expected (like "constraint does not exist")
          if (error.message.includes('does not exist') || 
              error.message.includes('Cannot drop the constraint')) {
            console.log(`⚠️  Batch ${i + 1}/${batches.length}: ${error.message.split('\n')[0]}`);
          } else {
            console.error(`❌ Error in batch ${i + 1}/${batches.length}:`, error.message);
            throw error;
          }
        }
      }
    }

    console.log('\n✅ Migration completed successfully!\n');

    // Verify the constraint was updated
    console.log('Verifying constraint...');
    const checkRequest = pool.request();
    const checkResult = await checkRequest.query(`
      SELECT 
        cc.name AS constraint_name,
        cc.definition
      FROM sys.check_constraints cc
      INNER JOIN sys.objects o ON cc.parent_object_id = o.object_id
      WHERE o.name = 'department_objectives' 
        AND cc.name = 'CK_department_objectives_type'
    `);

    if (checkResult.recordset.length > 0) {
      console.log('✅ Constraint updated successfully!');
      console.log('Constraint definition:');
      console.log(checkResult.recordset[0].definition);
    } else {
      console.log('⚠️  Warning: Constraint not found (may have been dropped)');
    }

    await pool.close();
    console.log('\n✅ Migration script completed!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (pool) {
      await pool.close();
    }
    process.exit(1);
  }
}

runTypeConstraintMigration();

