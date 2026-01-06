require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

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

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID'),
  password: getEnv('PWD') || getEnv('VITE_PWD') || getEnv('DB_PASSWORD'),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function checkTables() {
  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    const tablesToCheck = [
      'users',
      'user_roles',
      'role_permissions',
      'cms_pages',
      'cms_images',
      'cms_announcements',
      'cms_menu_items'
    ];

    for (const tableName of tablesToCheck) {
      const result = await pool.request().query(`
        SELECT COUNT(*) as count 
        FROM sys.tables 
        WHERE name = '${tableName}'
      `);
      
      if (result.recordset[0].count > 0) {
        console.log(`✅ Table '${tableName}' exists`);
      } else {
        console.log(`❌ Table '${tableName}' does NOT exist`);
      }
    }

    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkTables();

