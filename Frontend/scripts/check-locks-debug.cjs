const sql = require('mssql');
require('dotenv').config({ path: '.env.local' });

async function checkDatabase() {
  // Robust password handling
  let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
  if (password && password.startsWith('/')) {
    password = process.env.DB_PASSWORD || process.env.VITE_PWD;
  }
  if (password && (password.includes('%'))) {
    try {
      password = decodeURIComponent(password);
    } catch (e) { /* Keep original if decode fails */ }
  }
  if ((password && password.startsWith('"') && password.endsWith('"')) || 
      (password && password.startsWith("'") && password.endsWith("'"))) {
    password = password.slice(1, -1);
  }
  if (password) {
    password = password.trim();
  }

  const config = {
    server: process.env.SERVER?.replace('tcp:', '') || 'localhost',
    port: parseInt(process.env.PORT || '1433'),
    database: process.env.DATABASE || process.env.VITE_DATABASE,
    user: process.env.DB_USER || process.env.UID || process.env.VITE_UID,
    password: password,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
    }
  };

  try {
    console.log('Connecting to database...');
    const pool = await sql.connect(config);
    
    console.log('\n=== FIELD LOCKS ===');
    const locks = await pool.request().query('SELECT TOP 5 * FROM field_locks WHERE is_active = 1 ORDER BY created_at DESC');
    console.log(JSON.stringify(locks.recordset, null, 2));
    
    console.log('\n=== ACTIVITY LOGS (Recent) ===');
    const logs = await pool.request().query('SELECT TOP 5 * FROM activity_logs ORDER BY created_at DESC');
    console.log(JSON.stringify(logs.recordset, null, 2));
    
    console.log('\n=== USER "case" INFO ===');
    const users = await pool.request().query("SELECT id, username FROM users WHERE username = 'case'");
    console.log(JSON.stringify(users.recordset, null, 2));
    
    console.log('\n=== SAMPLE DEPARTMENT OBJECTIVES (for case dept) ===');
    const objs = await pool.request().query(`
      SELECT TOP 3 do.id, do.kpi, do.type, do.activity, do.responsible_person, d.name as dept_name, d.code as dept_code
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE d.code = 'case'
      ORDER BY do.id DESC
    `);
    console.log(JSON.stringify(objs.recordset, null, 2));
    
    await pool.close();
    console.log('\nDatabase check complete');
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

checkDatabase();
