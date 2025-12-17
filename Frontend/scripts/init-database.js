require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const config = {
  server: process.env.SERVER || process.env.VITE_SERVER,
  database: process.env.DATABASE || process.env.VITE_DATABASE,
  user: process.env.UID || process.env.VITE_UID,
  password: process.env.PWD || process.env.VITE_PWD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
};

async function initDatabase() {
  try {
    console.log('Connecting to SQL Server...');
    console.log('Server:', config.server);
    console.log('Database:', config.database);
    console.log('User:', config.user);
    
    if (!config.server || !config.database || !config.user || !config.password) {
      throw new Error('Missing database connection details. Please check your .env.local file.');
    }

    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server');

    // Read the SQL script
    const sqlScript = fs.readFileSync(
      path.join(__dirname, '../database/init.sql'),
      'utf8'
    );

    // Split by GO statements (SQL Server batch separator)
    const batches = sqlScript
      .split(/^\s*GO\s*$/gim)
      .map(batch => batch.trim())
      .filter(batch => batch.length > 0);

    console.log(`Executing ${batches.length} SQL batches...`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (batch.trim()) {
        try {
          await pool.request().query(batch);
          console.log(`✅ Batch ${i + 1}/${batches.length} executed successfully`);
        } catch (error) {
          // Some errors are expected (like "object already exists")
          if (error.message.includes('already exists') || 
              error.message.includes('There is already an object')) {
            console.log(`⚠️  Batch ${i + 1}/${batches.length}: ${error.message.split('\n')[0]}`);
          } else {
            console.error(`❌ Error in batch ${i + 1}/${batches.length}:`, error.message);
            throw error;
          }
        }
      }
    }

    console.log('\n✅ Database initialization completed successfully!');
    await pool.close();
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

initDatabase();

