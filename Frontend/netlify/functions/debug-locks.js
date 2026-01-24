// Diagnostic endpoint to check lock configuration
const sql = require('mssql');

// Database configuration
function getDbConfig() {
  let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
  if (password && password.startsWith('/')) {
    password = process.env.DB_PASSWORD || process.env.VITE_PWD;
  }
  if (password && (password.includes('%'))) {
    try {
      password = decodeURIComponent(password);
    } catch (e) { /* Keep original */ }
  }
  if ((password && password.startsWith('"') && password.endsWith('"')) || 
      (password && password.startsWith("'") && password.endsWith("'"))) {
    password = password.slice(1, -1);
  }
  if (password) {
    password = password.trim();
  }

  return {
    server: process.env.SERVER?.replace('tcp:', '') || 'localhost',
    port: parseInt(process.env.PORT || '1433'),
    database: process.env.DATABASE || process.env.VITE_DATABASE,
    user: process.env.DB_USER || process.env.UID || process.env.VITE_UID,
    password: password,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
      requestTimeout: 60000,
      connectionTimeout: 30000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

let poolPromise = null;
async function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(getDbConfig());
  }
  return await poolPromise;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const pool = await getPool();
    const results = {};

    // Get recent locks
    const locks = await pool.request().query(`
      SELECT TOP 10 
        fl.*,
        u.username as created_by_username
      FROM field_locks fl
      LEFT JOIN users u ON fl.created_by = u.id
      WHERE fl.is_active = 1
      ORDER BY fl.created_at DESC
    `);
    results.locks = locks.recordset.map(lock => ({
      ...lock,
      user_ids: lock.user_ids ? JSON.parse(lock.user_ids) : null,
    }));

    // Get recent activity logs
    const logs = await pool.request().query(`
      SELECT TOP 10 * FROM activity_logs 
      ORDER BY created_at DESC
    `);
    results.logs = logs.recordset;

    // Get user "case" info
    const users = await pool.request().query(`
      SELECT id, username, role FROM users WHERE username = 'case'
    `);
    results.caseUser = users.recordset[0] || null;

    // Get sample objectives for "case" department
    const objs = await pool.request().query(`
      SELECT TOP 5
        do.id,
        do.kpi,
        do.type,
        do.activity,
        do.responsible_person,
        do.mov,
        do.activity_target,
        d.id as dept_id,
        d.name as dept_name,
        d.code as dept_code
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE d.code = 'case' AND do.type = 'Direct'
      ORDER BY do.id DESC
    `);
    results.caseObjectives = objs.recordset;

    // Check if a specific objective is locked
    if (results.caseObjectives.length > 0 && results.caseUser) {
      const testObj = results.caseObjectives[0];
      const userId = results.caseUser.id;
      
      // Simulate lock check for "all_fields"
      const lockCheck = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT * FROM field_locks 
          WHERE is_active = 1
          ORDER BY 
            CASE scope_type 
              WHEN 'specific_users' THEN 1
              WHEN 'department_kpi' THEN 2
              WHEN 'specific_kpi' THEN 3
              WHEN 'all_users' THEN 4
              WHEN 'all_department_objectives' THEN 5
            END
        `);
      
      results.lockCheckSimulation = {
        objectiveId: testObj.id,
        objectiveKpi: testObj.kpi,
        objectiveDeptId: testObj.dept_id,
        userId: userId,
        allActiveLocks: lockCheck.recordset.map(lock => ({
          id: lock.id,
          lock_type: lock.lock_type,
          scope_type: lock.scope_type,
          user_ids: lock.user_ids ? JSON.parse(lock.user_ids) : null,
          kpi: lock.kpi,
          department_id: lock.department_id,
          exclude_monthly: lock.exclude_monthly,
          exclude_annual_target: lock.exclude_annual_target,
        })),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: results,
        message: 'Database diagnostic complete'
      }, null, 2)
    };

  } catch (error) {
    console.error('Debug endpoint error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};
