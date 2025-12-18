// Inline database connection code (to avoid module resolution issues in Netlify)
const sql = require('mssql');

let pool = null;

// Parse server and port
function getDbConfig() {
  const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
  let server, port;
  if (serverValue.includes(',')) {
    [server, port] = serverValue.split(',').map(s => s.trim());
    port = parseInt(port) || 1433;
  } else {
    server = serverValue;
    port = 1433;
  }

  // Get password - PWD is a system variable in Unix/Linux, use DB_PASSWORD instead
  // Priority: DB_PASSWORD > VITE_PWD > PWD (as fallback, but PWD is usually the working directory)
  let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
  
  // If PWD looks like a path (starts with /), it's the system variable, not our password
  if (password && password.startsWith('/') && password.includes('/')) {
    console.warn('[DB] PWD appears to be system path, not password. Use DB_PASSWORD instead.');
    password = process.env.DB_PASSWORD || process.env.VITE_PWD;
  }
  
  // Log password info for debugging (without exposing the actual password)
  if (password) {
    const passwordSource = process.env.DB_PASSWORD ? 'DB_PASSWORD' : 
                          (process.env.VITE_PWD ? 'VITE_PWD' : 'PWD');
    console.log('[DB] Raw password from env:', {
      source: passwordSource,
      length: password.length,
      firstChar: password[0],
      lastChar: password[password.length - 1],
      first3Chars: password.substring(0, 3),
      last3Chars: password.substring(password.length - 3),
      hasPercent: password.includes('%'),
      hasQuotes: password.includes('"') || password.includes("'"),
      hasAt: password.includes('@'),
      allChars: password.split('').map(c => c.charCodeAt(0)), // Show char codes for debugging
    });
    
    // If password contains URL encoding (%), try to decode it
    if (password.includes('%')) {
      try {
        const decoded = decodeURIComponent(password);
        console.log('[DB] Password was URL-encoded, decoded. New length:', decoded.length);
        console.log('[DB] Decoded first/last:', decoded[0], decoded[decoded.length - 1]);
        password = decoded;
      } catch (e) {
        console.log('[DB] Password decode failed, using as-is');
      }
    }
    
    // Remove quotes if they were added (Netlify might add them)
    if ((password.startsWith('"') && password.endsWith('"')) || 
        (password.startsWith("'") && password.endsWith("'"))) {
      password = password.slice(1, -1);
      console.log('[DB] Removed quotes from password');
    }
    
    // Remove any leading/trailing whitespace
    const trimmed = password.trim();
    if (trimmed !== password) {
      console.log('[DB] Removed whitespace from password');
      password = trimmed;
    }
    
    console.log('[DB] Final password info:', {
      length: password.length,
      firstChar: password[0],
      lastChar: password[password.length - 1],
    });
  } else {
    console.error('[DB] Password is missing!');
  }

  return {
    server: server,
    port: port,
    database: process.env.DATABASE || process.env.VITE_DATABASE,
    user: process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
    password: password,
    options: {
      encrypt: true, // Use encryption for SQL Server
      trustServerCertificate: true, // Set to true for SQL Server
      enableArithAbort: true,
      requestTimeout: 60000, // Increased timeout for external connections
      connectionTimeout: 30000, // Connection timeout
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

async function getPool() {
  if (!pool) {
    try {
      const config = getDbConfig();
      console.log('[DB] Attempting connection:', {
        server: config.server,
        port: config.port,
        database: config.database,
        user: config.user,
        hasPassword: !!config.password,
        passwordLength: config.password ? config.password.length : 0,
        passwordFirstChar: config.password ? config.password[0] : 'none',
        passwordLastChar: config.password ? config.password[config.password.length - 1] : 'none',
      });
      pool = await sql.connect(config);
      console.log('[DB] Connected to SQL Server');
    } catch (error) {
      console.error('[DB] Connection error:', error);
      console.error('[DB] Error code:', error.code);
      console.error('[DB] Error message:', error.message);
      
      // Provide helpful error messages
      if (error.code === 'ETIMEOUT' || error.code === 'ECONNREFUSED') {
        console.error('[DB] Network/Firewall issue: SQL Server is not accessible from Netlify');
        console.error('[DB] Solution: Configure SQL Server firewall to allow external connections');
      } else if (error.code === 'ELOGIN') {
        console.error('[DB] Authentication issue: Check username and password');
        console.error('[DB] Possible causes:');
        console.error('[DB] 1. Password encoding issue (special characters)');
        console.error('[DB] 2. IP whitelist on SQL Server blocking Netlify IPs');
        console.error('[DB] 3. Incorrect password in Netlify environment variables');
      } else if (error.code === 'ESOCKET') {
        console.error('[DB] Socket error: Cannot establish connection to SQL Server');
        console.error('[DB] Check if SQL Server is accessible from the internet');
      }
      
      throw error;
    }
  }
  return pool;
}

exports.handler = async function (event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // Check database environment variables
    const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
    const database = process.env.DATABASE || process.env.VITE_DATABASE;
    const user = process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID;
    // Use DB_PASSWORD (PWD is system variable for current directory)
    const password = process.env.DB_PASSWORD || process.env.VITE_PWD;

    if (!serverValue || !database || !user || !password) {
      console.error('[WIG API] Missing database environment variables:', {
        server: serverValue ? '✓' : '✗',
        database: database ? '✓' : '✗',
        user: user ? '✓' : '✗',
        password: password ? '✓' : '✗',
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Database configuration missing',
          message: 'Required environment variables: SERVER, DATABASE, UID (or DB_USER), DB_PASSWORD (or VITE_PWD)',
          details: process.env.NODE_ENV === 'development' ? {
            server: serverValue || 'missing',
            database: database || 'missing',
            user: user || 'missing',
            password: password ? '***' : 'missing',
          } : undefined,
        }),
      };
    }

    const pool = await getPool();
    const path = event.path.replace('/.netlify/functions/wig-api', '');
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};
    const queryParams = event.queryStringParameters || {};

    // Route handling
    let result;

    // Health check endpoint
    if (path === '/health' && method === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'ok',
          message: 'WIG API is running',
          timestamp: new Date().toISOString(),
          env: {
            server: serverValue ? 'set' : 'missing',
            database: database ? 'set' : 'missing',
            user: user ? 'set' : 'missing',
            password: password ? 'set' : 'missing',
            dbPassword: process.env.DB_PASSWORD ? 'set' : 'missing',
            vitePwd: process.env.VITE_PWD ? 'set' : 'missing',
          },
        }),
      };
    }

    // Main Plan Objectives
    if (path === '/main-objectives' && method === 'GET') {
      result = await getMainObjectives(pool, queryParams);
    } else if (path === '/main-objectives/hierarchy' && method === 'GET') {
      result = await getHierarchicalPlan(pool);
    } else if (path === '/main-objectives' && method === 'POST') {
      result = await createMainObjective(pool, body);
    } else if (path.startsWith('/main-objectives/') && method === 'PUT') {
      const id = parseInt(path.split('/')[2]);
      result = await updateMainObjective(pool, id, body);
    } else if (path.startsWith('/main-objectives/') && method === 'DELETE') {
      const id = parseInt(path.split('/')[2]);
      result = await deleteMainObjective(pool, id);
    }
    // Department Objectives
    else if (path === '/department-objectives' && method === 'GET') {
      result = await getDepartmentObjectives(pool, queryParams);
    } else if (path.startsWith('/department-objectives/by-kpi/') && method === 'GET') {
      const kpi = decodeURIComponent(path.split('/by-kpi/')[1]);
      result = await getDepartmentObjectivesByKPI(pool, kpi);
    } else if (path === '/department-objectives' && method === 'POST') {
      result = await createDepartmentObjective(pool, body);
    } else if (path.startsWith('/department-objectives/') && method === 'PUT') {
      const id = parseInt(path.split('/')[2]);
      result = await updateDepartmentObjective(pool, id, body);
    } else if (path.startsWith('/department-objectives/') && method === 'DELETE') {
      const id = parseInt(path.split('/')[2]);
      result = await deleteDepartmentObjective(pool, id);
    }
    // RASCI Metrics
    else if (path === '/rasci' && method === 'GET') {
      result = await getRASCI(pool, queryParams);
    } else if (path.startsWith('/rasci/kpi/') && method === 'GET') {
      const kpi = decodeURIComponent(path.split('/kpi/')[1]);
      result = await getRASCIByKPI(pool, kpi);
    } else if (path === '/rasci' && method === 'POST') {
      result = await createOrUpdateRASCI(pool, body);
    } else if (path.startsWith('/rasci/') && method === 'DELETE') {
      const id = parseInt(path.split('/')[2]);
      result = await deleteRASCI(pool, id);
    }
    // KPIs with RASCI
    else if (path === '/kpis-with-rasci' && method === 'GET') {
      result = await getKPIsWithRASCI(pool);
    }
    // KPI Breakdown
    else if (path.startsWith('/kpi-breakdown/') && method === 'GET') {
      const kpi = decodeURIComponent(path.split('/kpi-breakdown/')[1]);
      result = await getKPIBreakdown(pool, kpi);
    }
    // Departments
    else if (path === '/departments' && method === 'GET') {
      result = await getDepartments(pool);
    }
    // Plan Checkers
    else if (path.startsWith('/checkers/') && method === 'GET') {
      const objectiveId = parseInt(path.split('/checkers/')[1]);
      result = await getPlanChecker(pool, objectiveId);
    } else if (path === '/checkers/calculate' && method === 'POST') {
      result = await calculatePlanCheckers(pool);
    }
    // Monthly Data
    else if (path.startsWith('/monthly-data/') && method === 'GET') {
      const deptObjId = parseInt(path.split('/monthly-data/')[1]);
      result = await getMonthlyData(pool, deptObjId);
    } else if (path === '/monthly-data' && method === 'POST') {
      result = await createOrUpdateMonthlyData(pool, body);
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Not found' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (error) {
    const path = event.path.replace('/.netlify/functions/wig-api', '');
    console.error('[WIG API] Error:', error);
    console.error('[WIG API] Path:', path);
    console.error('[WIG API] Method:', event.httpMethod);
    console.error('[WIG API] Error stack:', error.stack);
    console.error('[WIG API] Error code:', error.code);
    console.error('[WIG API] Error message:', error.message);
    console.error('[WIG API] Environment check:', {
      SERVER: process.env.SERVER ? 'set' : 'missing',
      DATABASE: process.env.DATABASE ? 'set' : 'missing',
      DB_USER: process.env.DB_USER ? 'set' : 'missing',
      UID: process.env.UID ? 'set' : 'missing',
      DB_PASSWORD: process.env.DB_PASSWORD ? 'set' : 'missing',
      VITE_PWD: process.env.VITE_PWD ? 'set' : 'missing',
    });
    
    // Check if it's a SQL error (table doesn't exist, etc.)
    let sqlError = null;
    if (error.message && error.message.includes('Invalid object name')) {
      sqlError = 'Table does not exist. Please run database initialization script.';
    } else if (error.message && error.message.includes('Cannot find')) {
      sqlError = 'Database object not found.';
    }
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: error.message || 'Internal server error',
        message: error.message,
        code: error.code,
        sqlError: sqlError,
        path: path,
        method: event.httpMethod,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
    };
  }
};

// Main Plan Objectives Functions
async function getMainObjectives(pool, queryParams) {
  const request = pool.request();
  const result = await request.query('SELECT * FROM main_plan_objectives ORDER BY pillar, objective, target, kpi');
  return result.recordset;
}

async function getHierarchicalPlan(pool) {
  const request = pool.request();
  const objectives = await request.query(`
    SELECT * FROM main_plan_objectives 
    ORDER BY pillar, objective, target, kpi
  `);

  // Group by hierarchy
  const pillars = {};
  objectives.recordset.forEach((obj) => {
    if (!pillars[obj.pillar]) {
      pillars[obj.pillar] = {};
    }
    if (!pillars[obj.pillar][obj.objective]) {
      pillars[obj.pillar][obj.objective] = {};
    }
    if (!pillars[obj.pillar][obj.objective][obj.target]) {
      pillars[obj.pillar][obj.objective][obj.target] = [];
    }
    pillars[obj.pillar][obj.objective][obj.target].push({
      kpi: obj.kpi,
      annual_target: obj.annual_target,
      id: obj.id,
    });
  });

  // Define pillar order: Strategic Themes, Contributors, Strategic Enablers
  const pillarOrder = ['Strategic Themes', 'Contributors', 'Strategic Enablers'];
  const pillarOrderMap = new Map();
  pillarOrder.forEach((p, i) => pillarOrderMap.set(p, i));

  // Transform to hierarchical structure with proper pillar ordering
  const sortedPillars = Object.keys(pillars).sort((a, b) => {
    const aOrder = pillarOrderMap.has(a) ? pillarOrderMap.get(a) : 999;
    const bOrder = pillarOrderMap.has(b) ? pillarOrderMap.get(b) : 999;
    return aOrder - bOrder;
  });

  const result = {
    pillars: sortedPillars.map((pillar) => ({
      pillar,
      objectives: Object.keys(pillars[pillar]).map((objective) => ({
        objective,
        objectiveId: objectives.recordset.find((o) => o.objective === objective && o.pillar === pillar)?.id,
        targets: Object.keys(pillars[pillar][objective]).map((target) => ({
          target,
          kpis: pillars[pillar][objective][target],
        })),
      })),
    })),
  };

  return result;
}

async function createMainObjective(pool, body) {
  const request = pool.request();
  request.input('pillar', sql.NVarChar, body.pillar);
  request.input('objective', sql.NVarChar, body.objective);
  request.input('target', sql.NVarChar, body.target);
  request.input('kpi', sql.NVarChar, body.kpi);
  request.input('annual_target', sql.Decimal(18, 2), body.annual_target);

  const result = await request.query(`
    INSERT INTO main_plan_objectives (pillar, objective, target, kpi, annual_target)
    OUTPUT INSERTED.*
    VALUES (@pillar, @objective, @target, @kpi, @annual_target)
  `);

  return result.recordset[0];
}

async function updateMainObjective(pool, id, body) {
  const request = pool.request();
  request.input('id', sql.Int, id);
  request.input('pillar', sql.NVarChar, body.pillar);
  request.input('objective', sql.NVarChar, body.objective);
  request.input('target', sql.NVarChar, body.target);
  request.input('kpi', sql.NVarChar, body.kpi);
  request.input('annual_target', sql.Decimal(18, 2), body.annual_target);

  const result = await request.query(`
    UPDATE main_plan_objectives
    SET pillar = @pillar, objective = @objective, target = @target, kpi = @kpi, annual_target = @annual_target
    OUTPUT INSERTED.*
    WHERE id = @id
  `);

  if (result.recordset.length === 0) {
    throw new Error('Objective not found');
  }

  return result.recordset[0];
}

async function deleteMainObjective(pool, id) {
  const request = pool.request();
  request.input('id', sql.Int, id);

  const result = await request.query('DELETE FROM main_plan_objectives WHERE id = @id');
  return { success: true, deletedRows: result.rowsAffected[0] };
}

// Department Objectives Functions
async function getDepartmentObjectives(pool, queryParams) {
  const request = pool.request();
  let query = `
    SELECT do.*, d.name as department_name, d.code as department_code
    FROM department_objectives do
    INNER JOIN departments d ON do.department_id = d.id
    WHERE 1=1
  `;

  if (queryParams.department_id) {
    request.input('department_id', sql.Int, parseInt(queryParams.department_id));
    query += ' AND do.department_id = @department_id';
  }

  if (queryParams.department_code) {
    request.input('department_code', sql.NVarChar, queryParams.department_code);
    query += ' AND d.code = @department_code';
  }

  query += ' ORDER BY do.kpi, do.activity';

  const result = await request.query(query);
  return result.recordset;
}

async function getDepartmentObjectivesByKPI(pool, kpi) {
  const request = pool.request();
  request.input('kpi', sql.NVarChar, kpi);

  const result = await request.query(`
    SELECT do.*, d.name as department_name, d.code as department_code
    FROM department_objectives do
    INNER JOIN departments d ON do.department_id = d.id
    WHERE do.kpi = @kpi AND do.type = 'Direct'
    ORDER BY d.name
  `);

  return result.recordset;
}

async function createDepartmentObjective(pool, body) {
  // Validate KPI has RASCI
  const rasciCheck = pool.request();
  rasciCheck.input('kpi', sql.NVarChar, body.kpi);
  const rasciResult = await rasciCheck.query('SELECT COUNT(*) as count FROM rasci_metrics WHERE kpi = @kpi');
  
  if (rasciResult.recordset[0].count === 0) {
    throw new Error('KPI must have at least one RASCI assignment');
  }

  const request = pool.request();
  request.input('main_objective_id', sql.Int, body.main_objective_id || null);
  request.input('department_id', sql.Int, body.department_id);
  request.input('kpi', sql.NVarChar, body.kpi);
  request.input('activity', sql.NVarChar, body.activity);
  request.input('type', sql.NVarChar, body.type);
  request.input('activity_target', sql.Decimal(18, 2), body.activity_target);
  request.input('responsible_person', sql.NVarChar, body.responsible_person);
  request.input('mov', sql.NVarChar, body.mov);

  const result = await request.query(`
    INSERT INTO department_objectives (main_objective_id, department_id, kpi, activity, type, activity_target, responsible_person, mov)
    OUTPUT INSERTED.*
    VALUES (@main_objective_id, @department_id, @kpi, @activity, @type, @activity_target, @responsible_person, @mov)
  `);

  return result.recordset[0];
}

async function updateDepartmentObjective(pool, id, body) {
  // Validate KPI has RASCI if KPI is being updated
  if (body.kpi) {
    const rasciCheck = pool.request();
    rasciCheck.input('kpi', sql.NVarChar, body.kpi);
    const rasciResult = await rasciCheck.query('SELECT COUNT(*) as count FROM rasci_metrics WHERE kpi = @kpi');
    
    if (rasciResult.recordset[0].count === 0) {
      throw new Error('KPI must have at least one RASCI assignment');
    }
  }

  const request = pool.request();
  request.input('id', sql.Int, id);
  const updates = [];
  const fields = ['main_objective_id', 'department_id', 'kpi', 'activity', 'type', 'activity_target', 'responsible_person', 'mov'];
  
  fields.forEach((field) => {
    if (body[field] !== undefined) {
      if (field === 'main_objective_id') {
        request.input(field, sql.Int, body[field] || null);
      } else if (field === 'department_id' || field === 'activity_target') {
        request.input(field, field === 'department_id' ? sql.Int : sql.Decimal(18, 2), body[field]);
      } else {
        request.input(field, sql.NVarChar, body[field]);
      }
      updates.push(`${field} = @${field}`);
    }
  });

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  const result = await request.query(`
    UPDATE department_objectives
    SET ${updates.join(', ')}
    OUTPUT INSERTED.*
    WHERE id = @id
  `);

  if (result.recordset.length === 0) {
    throw new Error('Department objective not found');
  }

  return result.recordset[0];
}

async function deleteDepartmentObjective(pool, id) {
  const request = pool.request();
  request.input('id', sql.Int, id);

  const result = await request.query('DELETE FROM department_objectives WHERE id = @id');
  return { success: true, deletedRows: result.rowsAffected[0] };
}

// RASCI Functions
async function getRASCI(pool, queryParams) {
  try {
    const request = pool.request();
    const result = await request.query('SELECT * FROM rasci_metrics ORDER BY kpi, department');
    return result.recordset;
  } catch (error) {
    console.error('[RASCI] Error in getRASCI:', error);
    throw error;
  }
}

async function getRASCIByKPI(pool, kpi) {
  try {
    const request = pool.request();
    request.input('kpi', sql.NVarChar, kpi);

    const result = await request.query('SELECT * FROM rasci_metrics WHERE kpi = @kpi ORDER BY department');
    return result.recordset;
  } catch (error) {
    console.error('[RASCI] Error in getRASCIByKPI:', error);
    throw error;
  }
}

async function createOrUpdateRASCI(pool, body) {
  try {
    if (!body.kpi || !body.department) {
      throw new Error('KPI and department are required');
    }
    
    const request = pool.request();
    request.input('kpi', sql.NVarChar, body.kpi);
    request.input('department', sql.NVarChar, body.department);
    request.input('responsible', sql.Bit, body.responsible || false);
    request.input('accountable', sql.Bit, body.accountable || false);
    request.input('supportive', sql.Bit, body.supportive || false);
    request.input('consulted', sql.Bit, body.consulted || false);
    request.input('informed', sql.Bit, body.informed || false);

    const result = await request.query(`
      MERGE rasci_metrics AS target
      USING (SELECT @kpi AS kpi, @department AS department) AS source
      ON target.kpi = source.kpi AND target.department = source.department
      WHEN MATCHED THEN
        UPDATE SET 
          responsible = @responsible,
          accountable = @accountable,
          supportive = @supportive,
          consulted = @consulted,
          informed = @informed
      WHEN NOT MATCHED THEN
        INSERT (kpi, department, responsible, accountable, supportive, consulted, informed)
        VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed)
      OUTPUT INSERTED.*;
    `);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error('Failed to create or update RASCI metric');
    }

    return result.recordset[0];
  } catch (error) {
    console.error('[RASCI] Error in createOrUpdateRASCI:', error);
    console.error('[RASCI] Body received:', JSON.stringify(body));
    throw error;
  }
}

async function deleteRASCI(pool, id) {
  const request = pool.request();
  request.input('id', sql.Int, id);

  const result = await request.query('DELETE FROM rasci_metrics WHERE id = @id');
  return { success: true, deletedRows: result.rowsAffected[0] };
}

// KPI Functions
async function getKPIsWithRASCI(pool) {
  const request = pool.request();
  const result = await request.query(`
    SELECT DISTINCT kpi 
    FROM rasci_metrics 
    ORDER BY kpi
  `);
  return result.recordset.map((r) => r.kpi);
}

async function getKPIBreakdown(pool, kpi) {
  const request = pool.request();
  request.input('kpi', sql.NVarChar, kpi);

  // Get main objective annual target for this KPI
  const mainRequest = pool.request();
  mainRequest.input('kpi', sql.NVarChar, kpi);
  const mainResult = await mainRequest.query(`
    SELECT TOP 1 annual_target 
    FROM main_plan_objectives 
    WHERE kpi = @kpi
  `);

  const annualTarget = mainResult.recordset[0]?.annual_target || 0;

  // Get department sums (Direct only)
  const deptResult = await request.query(`
    SELECT 
      d.id as department_id,
      d.name as department,
      d.code as department_code,
      SUM(do.activity_target) as sum
    FROM department_objectives do
    INNER JOIN departments d ON do.department_id = d.id
    WHERE do.kpi = @kpi AND do.type = 'Direct'
    GROUP BY d.id, d.name, d.code
    ORDER BY d.name
  `);

  const breakdown = deptResult.recordset.map((row) => ({
    department: row.department,
    departmentId: row.department_id,
    departmentCode: row.department_code,
    sum: parseFloat(row.sum) || 0,
    percentage: annualTarget > 0 ? ((parseFloat(row.sum) || 0) / annualTarget) * 100 : 0,
  }));

  return {
    kpi,
    annual_target: annualTarget,
    breakdown,
  };
}

// Department Functions
async function getDepartments(pool) {
  const request = pool.request();
  const result = await request.query('SELECT * FROM departments ORDER BY name');
  return result.recordset;
}

// Plan Checker Functions
async function getPlanChecker(pool, objectiveId) {
  const request = pool.request();
  request.input('objective_id', sql.Int, objectiveId);

  const result = await request.query('SELECT * FROM plan_checkers WHERE objective_id = @objective_id');
  return result.recordset[0] || null;
}

async function calculatePlanCheckers(pool) {
  const request = pool.request();
  const objectives = await request.query('SELECT * FROM main_plan_objectives');

  const results = [];

  for (const objective of objectives.recordset) {
    // Check Planned status
    const rasciRequest = pool.request();
    rasciRequest.input('kpi', sql.NVarChar, objective.kpi);
    const rasciDepts = await rasciRequest.query(`
      SELECT DISTINCT department 
      FROM rasci_metrics 
      WHERE kpi = @kpi 
      AND (responsible = 1 OR accountable = 1 OR supportive = 1 OR consulted = 1 OR informed = 1)
    `);

    const deptObjectivesRequest = pool.request();
    deptObjectivesRequest.input('kpi', sql.NVarChar, objective.kpi);
    const deptObjectives = await deptObjectivesRequest.query(`
      SELECT DISTINCT d.code 
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE do.kpi = @kpi
    `);

    const requiredDepts = rasciDepts.recordset.map((r) => r.department);
    const coveredDepts = deptObjectives.recordset.map((r) => r.code);
    const allCovered = requiredDepts.every((dept) => coveredDepts.includes(dept));

    // Check Annual Target (Direct only)
    const sumRequest = pool.request();
    sumRequest.input('kpi', sql.NVarChar, objective.kpi);
    const sumResult = await sumRequest.query(`
      SELECT SUM(activity_target) as total
      FROM department_objectives
      WHERE kpi = @kpi AND type = 'Direct'
    `);

    const total = parseFloat(sumResult.recordset[0]?.total || 0);
    const annualTarget = parseFloat(objective.annual_target);
    const variance = total - annualTarget;
    const tolerance = annualTarget * 0.01; // 1% tolerance

    let status = 'ok';
    if (Math.abs(variance) > tolerance) {
      status = variance > 0 ? 'above' : 'less';
    }

    // Upsert plan checker
    const upsertRequest = pool.request();
    upsertRequest.input('objective_id', sql.Int, objective.id);
    upsertRequest.input('planned_status', sql.NVarChar, allCovered ? 'covered' : 'not_covered');
    upsertRequest.input('annual_target_status', sql.NVarChar, status);
    upsertRequest.input('annual_target_variance', sql.Decimal(18, 2), variance);

    await upsertRequest.query(`
      MERGE plan_checkers AS target
      USING (SELECT @objective_id AS objective_id) AS source
      ON target.objective_id = source.objective_id
      WHEN MATCHED THEN
        UPDATE SET 
          planned_status = @planned_status,
          annual_target_status = @annual_target_status,
          annual_target_variance = @annual_target_variance,
          last_checked_at = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (objective_id, planned_status, annual_target_status, annual_target_variance, last_checked_at)
        VALUES (@objective_id, @planned_status, @annual_target_status, @annual_target_variance, GETDATE());
    `);

    results.push({
      objective_id: objective.id,
      planned_status: allCovered ? 'covered' : 'not_covered',
      annual_target_status: status,
      annual_target_variance: variance,
    });
  }

  return results;
}

// Monthly Data Functions
async function getMonthlyData(pool, deptObjId) {
  const request = pool.request();
  request.input('dept_obj_id', sql.Int, deptObjId);

  const result = await request.query(`
    SELECT * FROM department_monthly_data 
    WHERE department_objective_id = @dept_obj_id 
    ORDER BY month
  `);

  return result.recordset;
}

async function createOrUpdateMonthlyData(pool, body) {
  const request = pool.request();
  request.input('department_objective_id', sql.Int, body.department_objective_id);
  request.input('month', sql.Date, body.month);
  request.input('target_value', sql.Decimal(18, 2), body.target_value || null);
  request.input('actual_value', sql.Decimal(18, 2), body.actual_value || null);

  const result = await request.query(`
    MERGE department_monthly_data AS target
    USING (SELECT @department_objective_id AS dept_obj_id, @month AS month) AS source
    ON target.department_objective_id = source.dept_obj_id AND target.month = source.month
    WHEN MATCHED THEN
      UPDATE SET 
        target_value = @target_value,
        actual_value = @actual_value
    WHEN NOT MATCHED THEN
      INSERT (department_objective_id, month, target_value, actual_value)
      VALUES (@department_objective_id, @month, @target_value, @actual_value)
    OUTPUT INSERTED.*;
  `);

  return result.recordset[0];
}

