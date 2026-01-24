require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

// Helper to get environment variable (with trimming and quote removal)
function getEnv(key) {
  const value = process.env[key];
  return value ? value.trim().replace(/^["']|["']$/g, '') : undefined;
}

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
  password: getEnv('DB_PASSWORD') || getEnv('VITE_PWD') || getEnv('PWD'),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function runSqlScript(pool, scriptPath, scriptName) {
  try {
    console.log(`\n📄 Running ${scriptName}...`);
    
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script file not found: ${scriptPath}`);
    }

    const sqlScript = fs.readFileSync(scriptPath, 'utf8');
    
    // Split by GO statements (SQL Server batch separator)
    const batches = sqlScript
      .split(/^\s*GO\s*$/gim)
      .map(batch => batch.trim())
      .filter(batch => batch.length > 0);

    console.log(`   Executing ${batches.length} SQL batch(es)...`);

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
              error.message.includes('duplicate key') ||
              error.message.includes('Cannot create index') && error.message.includes('already exists')) {
            console.log(`   ⚠️  Batch ${i + 1}/${batches.length}: ${error.message.split('\n')[0]}`);
          } else {
            console.error(`   ❌ Error in batch ${i + 1}/${batches.length}:`, error.message);
            throw error;
          }
        }
      }
    }

    console.log(`   ✅ ${scriptName} completed successfully`);
  } catch (error) {
    console.error(`   ❌ Failed to run ${scriptName}:`, error.message);
    throw error;
  }
}

async function runConfigSchema() {
  try {
    console.log('Connecting to SQL Server...');
    console.log('Server:', config.server);
    console.log('Database:', config.database);
    console.log('User:', config.user);
    
    if (!config.server || !config.database || !config.user || !config.password) {
      throw new Error('Missing database connection details. Please check your environment variables.');
    }

    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Run the config schema script
    const scriptPath = path.join(__dirname, '../database/config-schema.sql');
    await runSqlScript(pool, scriptPath, 'config-schema.sql');

    console.log('\n✅ Configuration schema setup completed successfully!');
    await pool.close();
  } catch (error) {
    console.error('\n❌ Script execution failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

runConfigSchema();
