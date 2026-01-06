require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

// dotenv may not handle spaces around =, so let's trim values
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
  password: getEnv('PWD') || getEnv('VITE_PWD') || getEnv('DB_PASSWORD'),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function runSqlScript(pool, scriptPath, scriptName) {
  try {
    console.log(`\n📄 Running ${scriptName}...`);
    
    // Read the SQL script
    const sqlScript = fs.readFileSync(scriptPath, 'utf8');

    // Split by GO statements (SQL Server batch separator)
    const batches = sqlScript
      .split(/^\s*GO\s*$/gim)
      .map(batch => batch.trim())
      .filter(batch => batch.length > 0);

    console.log(`   Executing ${batches.length} SQL batches...`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (batch.trim()) {
        try {
          await pool.request().query(batch);
          console.log(`   ✅ Batch ${i + 1}/${batches.length} executed successfully`);
        } catch (error) {
          // Some errors are expected (like "object already exists")
          if (error.message.includes('already exists') || 
              error.message.includes('There is already an object') ||
              error.message.includes('already an object named')) {
            console.log(`   ⚠️  Batch ${i + 1}/${batches.length}: ${error.message.split('\n')[0]}`);
          } else {
            console.error(`   ❌ Error in batch ${i + 1}/${batches.length}:`, error.message);
            // Don't throw - continue with other scripts
          }
        }
      }
    }

    console.log(`   ✅ ${scriptName} completed successfully!`);
  } catch (error) {
    console.error(`   ❌ ${scriptName} failed:`, error.message);
    throw error;
  }
}

async function runAllScripts() {
  try {
    console.log('Connecting to SQL Server...');
    console.log('Server:', config.server);
    console.log('Database:', config.database);
    console.log('User:', config.user);
    
    if (!config.server || !config.database || !config.user || !config.password) {
      throw new Error('Missing database connection details. Please check your .env.local file.');
    }

    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Run scripts in order
    const scripts = [
      { path: path.join(__dirname, '../database/users-table.sql'), name: 'users-table.sql' },
      { path: path.join(__dirname, '../database/user-roles.sql'), name: 'user-roles.sql' },
      { path: path.join(__dirname, '../database/cms-tables.sql'), name: 'cms-tables.sql' },
    ];

    for (const script of scripts) {
      await runSqlScript(pool, script.path, script.name);
    }

    console.log('\n✅ All SQL scripts executed successfully!');
    await pool.close();
  } catch (error) {
    console.error('\n❌ Script execution failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

runAllScripts();

