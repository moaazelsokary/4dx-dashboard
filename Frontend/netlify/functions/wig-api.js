// Inline database connection code (to avoid module resolution issues in Netlify)
const sql = require('mssql');
const rateLimiter = require('./utils/rate-limiter');
const authMiddleware = require('./utils/auth-middleware');

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

// Apply auth middleware and rate limiting
// GET requests: optional auth (public read access)
// POST/PUT/DELETE: required auth with appropriate permissions
const handler = rateLimiter('general')(
  authMiddleware({
    optional: true, // Allow GET requests without auth, but check auth if provided
    resource: 'wig', // Resource name for permission checks
  })(
    async function (event, context) {
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

    // Check authentication for write operations
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
      if (!event.user) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            error: 'Authentication required',
            message: 'Please sign in to perform this action',
          }),
        };
      }
      
      // Check permissions based on role
      const userRole = event.user.role || '';
      if (!['CEO', 'Admin', 'department'].includes(userRole)) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: 'Insufficient permissions',
            message: 'You do not have permission to perform this action',
          }),
        };
      }
      
      // Department users can only modify their own department's data
      if (userRole === 'department' && method !== 'GET') {
        // Additional department-specific checks can be added here
        // For now, allow department users to modify data (they're already filtered by department_id)
      }
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
      try {
        result = await updateMainObjective(pool, id, body);
      } catch (error) {
        console.error('[WIG API] Error updating main objective:', error.message);
        console.error('[WIG API] Error code:', error.code);
        console.error('[WIG API] Error number:', error.number);
        throw error;
      }
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
      result = await deleteDepartmentObjective(pool, id, event.user);
    } else if (path === '/department-objectives/update-order' && method === 'POST') {
      result = await updateDepartmentObjectivesOrder(pool, body);
    }
    // RASCI Metrics
    else if (path === '/rasci' && method === 'GET') {
      result = await getRASCI(pool, queryParams);
    } else if (path.startsWith('/rasci/kpi/') && method === 'GET') {
      // Extract KPI from path - handle URL encoding properly
      const kpiPath = path.substring('/rasci/kpi/'.length);
      let kpi;
      try {
        kpi = decodeURIComponent(kpiPath);
      } catch (e) {
        // If decodeURIComponent fails, try alternative decoding
        kpi = decodeURIComponent(decodeURIComponent(kpiPath));
      }
      console.log('[RASCI] Loading RASCI for KPI:', kpi);
      result = await getRASCIByKPI(pool, kpi);
    } else if (path.startsWith('/rasci/department/') && method === 'GET') {
      const departmentCode = decodeURIComponent(path.split('/department/')[1]);
      result = await getRASCIByDepartment(pool, departmentCode);
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
    // Auto-link all department objectives
    else if (path === '/department-objectives/auto-link' && method === 'POST') {
      result = await autoLinkAllDepartmentObjectives(pool);
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
      // Path format: /monthly-data/{department_objective_id}
      const parts = path.split('/monthly-data/')[1].split('/');
      const departmentObjectiveId = parseInt(parts[0]);
      result = await getMonthlyData(pool, departmentObjectiveId);
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
    }
  )
);

exports.handler = handler;

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
  try {
    const request = pool.request();
    request.input('id', sql.Int, id);
    request.input('pillar', sql.NVarChar, body.pillar);
    request.input('objective', sql.NVarChar, body.objective);
    request.input('target', sql.NVarChar, body.target);
    request.input('kpi', sql.NVarChar, body.kpi);
    request.input('annual_target', sql.Decimal(18, 2), body.annual_target);

    // Update the record (without OUTPUT clause due to triggers)
    const updateResult = await request.query(`
      UPDATE main_plan_objectives
      SET pillar = @pillar, objective = @objective, target = @target, kpi = @kpi, annual_target = @annual_target, updated_at = GETDATE()
      WHERE id = @id
    `);

    if (updateResult.rowsAffected[0] === 0) {
      throw new Error('Objective not found');
    }

    // Select the updated record
    const selectRequest = pool.request();
    selectRequest.input('id', sql.Int, id);
    const selectResult = await selectRequest.query(`
      SELECT * FROM main_plan_objectives WHERE id = @id
    `);

    if (selectResult.recordset.length === 0) {
      throw new Error('Objective not found after update');
    }

    return selectResult.recordset[0];
  } catch (error) {
    console.error('[updateMainObjective] Error:', error.message);
    console.error('[updateMainObjective] Error code:', error.code);
    console.error('[updateMainObjective] Error stack:', error.stack);
    throw error;
  }
}

async function deleteMainObjective(pool, id) {
  const request = pool.request();
  request.input('id', sql.Int, id);

  const result = await request.query('DELETE FROM main_plan_objectives WHERE id = @id');
  return { success: true, deletedRows: result.rowsAffected[0] };
}

// Department Objectives Functions
async function getDepartmentObjectives(pool, queryParams) {
  // Use SELECT * to get all columns including M&E fields
  // This is safer and will work regardless of which columns exist
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

  try {
    const result = await request.query(query);
    // Log first record to debug - especially for M&E type objectives
    if (result.recordset.length > 0) {
      const meObjectives = result.recordset.filter(r => r.type === 'M&E' || r.type === 'M&E MOV');
      if (meObjectives.length > 0) {
        console.log('[getDepartmentObjectives] Found M&E objectives:', meObjectives.length);
        console.log('[getDepartmentObjectives] First M&E objective keys:', Object.keys(meObjectives[0]));
        console.log('[getDepartmentObjectives] First M&E objective full data:', JSON.stringify(meObjectives[0], null, 2));
        console.log('[getDepartmentObjectives] First M&E objective M&E fields:', {
          me_target: meObjectives[0].me_target,
          me_actual: meObjectives[0].me_actual,
          me_frequency: meObjectives[0].me_frequency,
          me_start_date: meObjectives[0].me_start_date,
          me_end_date: meObjectives[0].me_end_date,
          me_tool: meObjectives[0].me_tool,
          me_responsible: meObjectives[0].me_responsible,
          me_folder_link: meObjectives[0].me_folder_link,
        });
      }
      console.log('[getDepartmentObjectives] First record keys:', Object.keys(result.recordset[0]));
    }
    return result.recordset;
  } catch (err) {
    console.error('[getDepartmentObjectives] Query error:', err.message);
    console.error('[getDepartmentObjectives] Query:', query);
    throw err;
  }
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
  // Skip RASCI validation for M&E type objectives (including M&E MOV)
  if (body.type !== 'M&E' && body.type !== 'M&E MOV') {
    // Validate KPI(s) have RASCI - handle multiple KPIs separated by ||
    const kpiDelimiter = '||';
    const kpiList = body.kpi.includes(kpiDelimiter) 
      ? body.kpi.split(kpiDelimiter).map(k => k.trim()).filter(k => k)
      : [body.kpi];
    
    for (const kpi of kpiList) {
      const rasciCheck = pool.request();
      rasciCheck.input('kpi', sql.NVarChar, kpi);
      const rasciResult = await rasciCheck.query('SELECT COUNT(*) as count FROM rasci_metrics WHERE kpi = @kpi');
      
      if (rasciResult.recordset[0].count === 0) {
        throw new Error(`KPI "${kpi}" must have at least one RASCI assignment`);
      }
    }
  }

    // Auto-link to main objective if main_objective_id not provided but KPI matches
    // Uses flexible matching (ignores numeric prefixes like "1.3.1 ")
    let mainObjectiveId = body.main_objective_id || null;
    if (!mainObjectiveId && body.kpi) {
      mainObjectiveId = await findMainObjectiveId(pool, body.kpi);
      if (mainObjectiveId) {
        console.log(`[createDepartmentObjective] Auto-linked KPI "${body.kpi}" to main_objective_id: ${mainObjectiveId}`);
      }
    }

  const request = pool.request();
  request.input('main_objective_id', sql.Int, mainObjectiveId);
  request.input('department_id', sql.Int, body.department_id);
  request.input('kpi', sql.NVarChar, body.kpi);
  request.input('activity', sql.NVarChar, body.activity);
  request.input('type', sql.NVarChar, body.type);
  request.input('activity_target', sql.Decimal(18, 2), body.activity_target);
  request.input('responsible_person', sql.NVarChar, body.responsible_person);
  request.input('mov', sql.NVarChar, body.mov);

  // Only include M&E fields if type is M&E or M&E MOV and columns exist
  const isME = body.type === 'M&E' || body.type === 'M&E MOV';
  let meFields = '';
  let meValues = '';
  let meInputs = '';

  if (isME) {
    request.input('me_target', sql.Decimal(18, 2), body.me_target || null);
    request.input('me_actual', sql.Decimal(18, 2), body.me_actual || null);
    request.input('me_frequency', sql.NVarChar, body.me_frequency || null);
    request.input('me_start_date', sql.Date, body.me_start_date || null);
    request.input('me_end_date', sql.Date, body.me_end_date || null);
    request.input('me_tool', sql.NVarChar, body.me_tool || null);
    request.input('me_responsible', sql.NVarChar, body.me_responsible || null);
    request.input('me_folder_link', sql.NVarChar, body.me_folder_link || null);
    
    meFields = ', me_target, me_actual, me_frequency, me_start_date, me_end_date, me_tool, me_responsible, me_folder_link';
    meValues = ', @me_target, @me_actual, @me_frequency, @me_start_date, @me_end_date, @me_tool, @me_responsible, @me_folder_link';
  }

  // Try to insert with M&E fields, fallback to basic insert if columns don't exist
  let result;
  try {
    const insertQuery = `
      INSERT INTO department_objectives (main_objective_id, department_id, kpi, activity, type, activity_target, responsible_person, mov${meFields})
      OUTPUT INSERTED.*
      VALUES (@main_objective_id, @department_id, @kpi, @activity, @type, @activity_target, @responsible_person, @mov${meValues})
    `;
    console.log('[createDepartmentObjective] Insert query:', insertQuery);
    console.log('[createDepartmentObjective] M&E fields:', meFields);
    console.log('[createDepartmentObjective] M&E values:', meValues);
    console.log('[createDepartmentObjective] Body M&E fields:', {
      me_target: body.me_target,
      me_actual: body.me_actual,
      me_frequency: body.me_frequency,
      me_start_date: body.me_start_date,
      me_end_date: body.me_end_date,
      me_tool: body.me_tool,
      me_responsible: body.me_responsible,
      me_folder_link: body.me_folder_link,
    });
    result = await request.query(insertQuery);
    console.log('[createDepartmentObjective] Insert result:', result.recordset[0]);
  } catch (error) {
    // If M&E columns don't exist, try without them
    if (isME && error.message && error.message.includes('Invalid column name')) {
      console.error('[createDepartmentObjective] ERROR: M&E columns do not exist in database!');
      console.error('[createDepartmentObjective] Please run the migration: Frontend/database/migrate-add-me-fields.sql');
      console.error('[createDepartmentObjective] Error details:', error.message);
      console.warn('[createDepartmentObjective] Falling back to insert without M&E fields - DATA WILL BE LOST!');
      const basicRequest = pool.request();
      basicRequest.input('main_objective_id', sql.Int, mainObjectiveId);
      basicRequest.input('department_id', sql.Int, body.department_id);
      basicRequest.input('kpi', sql.NVarChar, body.kpi);
      basicRequest.input('activity', sql.NVarChar, body.activity);
      basicRequest.input('type', sql.NVarChar, body.type);
      basicRequest.input('activity_target', sql.Decimal(18, 2), body.activity_target);
      basicRequest.input('responsible_person', sql.NVarChar, body.responsible_person);
      basicRequest.input('mov', sql.NVarChar, body.mov);
      
      result = await basicRequest.query(`
        INSERT INTO department_objectives (main_objective_id, department_id, kpi, activity, type, activity_target, responsible_person, mov)
        OUTPUT INSERTED.*
        VALUES (@main_objective_id, @department_id, @kpi, @activity, @type, @activity_target, @responsible_person, @mov)
      `);
      console.warn('[createDepartmentObjective] Saved without M&E fields. M&E data was lost:', {
        me_target: body.me_target,
        me_actual: body.me_actual,
        me_frequency: body.me_frequency,
        me_tool: body.me_tool,
        me_responsible: body.me_responsible,
      });
    } else {
      throw error;
    }
  }

  return result.recordset[0];
}

async function updateDepartmentObjective(pool, id, body) {
  try {
    // Get current objective to check if KPI is actually changing
    const currentRequest = pool.request();
    currentRequest.input('id', sql.Int, id);
    const currentResult = await currentRequest.query(`
      SELECT kpi, main_objective_id, type FROM department_objectives WHERE id = @id
    `);

    if (currentResult.recordset.length === 0) {
      throw new Error('Department objective not found');
    }

    const currentKpi = currentResult.recordset[0].kpi;
    const currentMainObjectiveId = currentResult.recordset[0].main_objective_id;
    const currentType = currentResult.recordset[0].type;
    const newKpi = body.kpi;
    const newType = body.type !== undefined ? body.type : currentType;

    // Only validate RASCI if KPI is actually being changed - handle multiple KPIs separated by ||
    // Skip RASCI validation for M&E type objectives
    if (newKpi !== undefined && newKpi !== currentKpi && newType !== 'M&E') {
      const kpiDelimiter = '||';
      const kpiList = newKpi.includes(kpiDelimiter) 
        ? newKpi.split(kpiDelimiter).map(k => k.trim()).filter(k => k)
        : [newKpi];
      
      for (const kpi of kpiList) {
        const rasciCheck = pool.request();
        rasciCheck.input('kpi', sql.NVarChar, kpi);
        const rasciResult = await rasciCheck.query('SELECT COUNT(*) as count FROM rasci_metrics WHERE kpi = @kpi');
        
        if (rasciResult.recordset[0].count === 0) {
          throw new Error(`KPI "${kpi}" must have at least one RASCI assignment`);
        }
      }
    }

    // Auto-link to main objective if:
    // 1. main_objective_id is not explicitly set in body (or set to null)
    // 2. KPI is being updated or main_objective_id is currently null
    // 3. A matching KPI exists in main_plan_objectives
    // Uses flexible matching (ignores numeric prefixes like "1.3.1 ")
    if (body.main_objective_id === undefined || body.main_objective_id === null) {
      const kpiToCheck = body.kpi !== undefined ? body.kpi : currentKpi;
      if (kpiToCheck && (!currentMainObjectiveId || body.kpi !== undefined)) {
        const foundMainId = await findMainObjectiveId(pool, kpiToCheck);
        if (foundMainId) {
          body.main_objective_id = foundMainId;
          console.log(`[updateDepartmentObjective] Auto-linked KPI "${kpiToCheck}" to main_objective_id: ${body.main_objective_id}`);
        }
      }
    }

    const request = pool.request();
    request.input('id', sql.Int, id);
    const updates = [];
    const fields = ['main_objective_id', 'department_id', 'kpi', 'activity', 'type', 'activity_target', 'responsible_person', 'mov'];
    const meFields = ['me_target', 'me_actual', 'me_frequency', 'me_start_date', 'me_end_date', 'me_tool', 'me_responsible', 'me_folder_link'];
    
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

    // Handle M&E fields
    meFields.forEach((field) => {
      if (body[field] !== undefined) {
        if (field === 'me_target' || field === 'me_actual') {
          request.input(field, sql.Decimal(18, 2), body[field] || null);
        } else if (field === 'me_start_date' || field === 'me_end_date') {
          request.input(field, sql.Date, body[field] || null);
        } else {
          request.input(field, sql.NVarChar, body[field] || null);
        }
        updates.push(`${field} = @${field}`);
      }
    });

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    // Update without OUTPUT clause due to triggers
    const updateResult = await request.query(`
      UPDATE department_objectives
      SET ${updates.join(', ')}, updated_at = GETDATE()
      WHERE id = @id
    `);

    if (updateResult.rowsAffected[0] === 0) {
      throw new Error('Department objective not found');
    }

    // Select the updated record
    const selectRequest = pool.request();
    selectRequest.input('id', sql.Int, id);
    const selectResult = await selectRequest.query(`
      SELECT * FROM department_objectives WHERE id = @id
    `);

    if (selectResult.recordset.length === 0) {
      throw new Error('Department objective not found after update');
    }

    return selectResult.recordset[0];
  } catch (error) {
    console.error('[updateDepartmentObjective] Error:', error.message);
    console.error('[updateDepartmentObjective] Error code:', error.code);
    console.error('[updateDepartmentObjective] Error stack:', error.stack);
    console.error('[updateDepartmentObjective] Body received:', JSON.stringify(body));
    throw error;
  }
}

async function deleteDepartmentObjective(pool, id, user = null) {
  const request = pool.request();
  request.input('id', sql.Int, id);

  // If user is a department user, verify they can only delete their own department's objectives
  if (user && user.role === 'department' && user.departments && user.departments.length > 0) {
    // First check if the objective belongs to the user's department
    const checkRequest = pool.request();
    checkRequest.input('id', sql.Int, id);
    checkRequest.input('department_name', sql.NVarChar, user.departments[0]); // Use first department
    
    const checkResult = await checkRequest.query(`
      SELECT do.id, d.name as department_name
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE do.id = @id
    `);

    if (checkResult.recordset.length === 0) {
      throw new Error('Department objective not found');
    }

    const objectiveDept = checkResult.recordset[0].department_name?.toLowerCase();
    const userDept = user.departments[0]?.toLowerCase();

    if (objectiveDept !== userDept) {
      throw new Error('You can only delete objectives from your own department');
    }
  }

  const result = await request.query('DELETE FROM department_objectives WHERE id = @id');
  return { success: true, deletedRows: result.rowsAffected[0] };
}

async function updateDepartmentObjectivesOrder(pool, body) {
  const { updates } = body; // Array of { id, sort_order }

  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error('Updates array is required');
  }

  // Check if sort_order column exists
  const checkColumnRequest = pool.request();
  const columnCheck = await checkColumnRequest.query(`
    SELECT COUNT(*) as column_exists
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'department_objectives' AND COLUMN_NAME = 'sort_order'
  `);

  const columnExists = columnCheck.recordset[0].column_exists > 0;

  if (!columnExists) {
    throw new Error('sort_order column does not exist. Please run the migration: npm run migrate-order-column');
  }

  // Use a transaction to ensure all updates succeed or fail together
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    console.log('[update-order] Transaction begun, processing', updates.length, 'updates');

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      if (!update.id || update.sort_order === undefined || update.sort_order === null) {
        throw new Error(`Invalid update at index ${i}: id=${update.id}, sort_order=${update.sort_order}`);
      }
      
      const request = new sql.Request(transaction);
      request.input('id', sql.Int, update.id);
      request.input('sort_order', sql.Int, update.sort_order);
      
      const result = await request.query(`
        UPDATE department_objectives 
        SET sort_order = @sort_order, updated_at = GETDATE()
        WHERE id = @id
      `);
      
      if (result.rowsAffected[0] === 0) {
        throw new Error(`No row found with id=${update.id} at index ${i}`);
      }
      
      console.log(`[update-order] Updated id=${update.id} to sort_order=${update.sort_order}`);
    }

    await transaction.commit();
    console.log('[update-order] Transaction committed successfully');
    return { success: true };
  } catch (error) {
    try {
      await transaction.rollback();
      console.log('[update-order] Transaction rolled back');
    } catch (rollbackError) {
      console.error('[update-order] Error during rollback:', rollbackError);
    }
    console.error('[update-order] Transaction error:', error);
    throw error;
  }
}

// Helper function to normalize KPI name (remove numeric prefixes like "1.3.1 ")
function normalizeKPI(kpi) {
  if (!kpi) return '';
  return kpi.replace(/^\d+(\.\d+)*\s*/, '').trim();
}

// Helper function to find main objective ID for a KPI using flexible matching
async function findMainObjectiveId(pool, kpi) {
  if (!kpi) return null;
  
  const linkRequest = pool.request();
  linkRequest.input('kpi', sql.NVarChar, kpi);
  
  // Try exact match first
  let linkResult = await linkRequest.query(`
    SELECT TOP 1 id 
    FROM main_plan_objectives 
    WHERE kpi = @kpi
    ORDER BY id
  `);
  
  // If not found, try normalized match (remove numeric prefix)
  if (linkResult.recordset.length === 0) {
    const normalizedKPI = normalizeKPI(kpi);
    if (normalizedKPI && normalizedKPI !== kpi) {
      const linkRequest2 = pool.request();
      linkRequest2.input('kpi', sql.NVarChar, kpi);
      linkRequest2.input('normalizedKPI', sql.NVarChar, normalizedKPI);
      linkResult = await linkRequest2.query(`
        SELECT TOP 1 id 
        FROM main_plan_objectives 
        WHERE kpi = @kpi OR kpi LIKE '%' + @normalizedKPI + '%'
        ORDER BY id
      `);
    }
  }
  
  return linkResult.recordset.length > 0 ? linkResult.recordset[0].id : null;
}

// Auto-link all department objectives that don't have main_objective_id
async function autoLinkAllDepartmentObjectives(pool) {
  try {
    console.log('[autoLinkAllDepartmentObjectives] Starting auto-link process...');
    
    // Get all department objectives without main_objective_id
    const deptObjsResult = await pool.request().query(`
      SELECT 
        do.id,
        do.kpi,
        do.main_objective_id,
        d.name as department_name
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE do.main_objective_id IS NULL OR do.main_objective_id = 0
      ORDER BY d.name, do.kpi
    `);
    
    const totalToLink = deptObjsResult.recordset.length;
    console.log(`[autoLinkAllDepartmentObjectives] Found ${totalToLink} objectives to link`);
    
    if (totalToLink === 0) {
      return {
        success: true,
        message: 'All department objectives are already linked',
        linked: 0,
        notFound: 0,
        total: 0
      };
    }

    // Get all main_plan_objectives KPIs for efficient lookup
    const mainKPIsResult = await pool.request().query(`
      SELECT id, kpi FROM main_plan_objectives ORDER BY kpi
    `);
    
    // Create maps for efficient lookup
    const kpiMap = new Map();
    const kpiMapNormalized = new Map();
    
    mainKPIsResult.recordset.forEach(row => {
      const originalKPI = row.kpi.trim();
      const normalizedKPI = normalizeKPI(originalKPI);
      
      if (!kpiMap.has(originalKPI)) {
        kpiMap.set(originalKPI, row.id);
      }
      if (!kpiMapNormalized.has(normalizedKPI)) {
        kpiMapNormalized.set(normalizedKPI, row.id);
      }
    });
    
    console.log(`[autoLinkAllDepartmentObjectives] Loaded ${mainKPIsResult.recordset.length} main plan KPIs`);
    
    let linked = 0;
    let notFound = 0;
    const notFoundKPIs = new Set();
    const departmentStats = new Map();
    
    // Link each department objective
    for (const deptObj of deptObjsResult.recordset) {
      const deptKPI = deptObj.kpi.trim();
      const normalizedDeptKPI = normalizeKPI(deptKPI);
      
      // Try exact match first
      let mainId = kpiMap.get(deptKPI);
      
      // If not found, try normalized match
      if (!mainId) {
        mainId = kpiMapNormalized.get(normalizedDeptKPI);
      }
      
      if (mainId) {
        try {
          await pool.request()
            .input('id', sql.Int, deptObj.id)
            .input('main_objective_id', sql.Int, mainId)
            .query(`
              UPDATE department_objectives
              SET main_objective_id = @main_objective_id,
                  updated_at = GETDATE()
              WHERE id = @id
            `);
          linked++;
          
          // Track statistics
          const deptName = deptObj.department_name;
          if (!departmentStats.has(deptName)) {
            departmentStats.set(deptName, { linked: 0, notFound: 0 });
          }
          departmentStats.get(deptName).linked++;
        } catch (error) {
          console.error(`[autoLinkAllDepartmentObjectives] Error linking ID ${deptObj.id}: ${error.message}`);
        }
      } else {
        notFound++;
        notFoundKPIs.add(deptKPI);
        
        // Track statistics
        const deptName = deptObj.department_name;
        if (!departmentStats.has(deptName)) {
          departmentStats.set(deptName, { linked: 0, notFound: 0 });
        }
        departmentStats.get(deptName).notFound++;
      }
    }
    
    console.log(`[autoLinkAllDepartmentObjectives] Completed: ${linked} linked, ${notFound} not found`);
    
    return {
      success: true,
      message: `Auto-linked ${linked} out of ${totalToLink} department objectives`,
      linked,
      notFound,
      total: totalToLink,
      departmentStats: Object.fromEntries(departmentStats),
      notFoundKPIs: Array.from(notFoundKPIs).slice(0, 20) // Return first 20 for reference
    };
  } catch (error) {
    console.error('[autoLinkAllDepartmentObjectives] Error:', error.message);
    throw error;
  }
}

// RASCI Functions
async function getRASCI(pool, queryParams) {
  try {
    const request = pool.request();
    const result = await request.query('SELECT * FROM rasci_metrics ORDER BY kpi, department');
    return result.recordset || [];
  } catch (error) {
    console.error('[RASCI] Error in getRASCI:', error);
    console.error('[RASCI] Error message:', error.message);
    console.error('[RASCI] Error code:', error.code);
    
    // If table doesn't exist, return empty array instead of error
    if (error.message && error.message.includes('Invalid object name')) {
      console.warn('[RASCI] Table rasci_metrics does not exist. Returning empty array.');
      return [];
    }
    
    throw error;
  }
}

async function getRASCIByKPI(pool, kpi) {
  try {
    console.log('[RASCI] getRASCIByKPI called with KPI:', kpi);
    console.log('[RASCI] KPI length:', kpi ? kpi.length : 0);
    console.log('[RASCI] KPI type:', typeof kpi);
    
    const request = pool.request();
    request.input('kpi', sql.NVarChar, kpi);

    const result = await request.query('SELECT * FROM rasci_metrics WHERE kpi = @kpi ORDER BY department');
    console.log('[RASCI] Query returned', result.recordset ? result.recordset.length : 0, 'records');
    return result.recordset || [];
  } catch (error) {
    console.error('[RASCI] Error in getRASCIByKPI:', error);
    console.error('[RASCI] Error message:', error.message);
    console.error('[RASCI] Error stack:', error.stack);
    console.error('[RASCI] KPI that caused error:', kpi);
    
    // If table doesn't exist, return empty array instead of error
    if (error.message && error.message.includes('Invalid object name')) {
      console.warn('[RASCI] Table rasci_metrics does not exist. Returning empty array.');
      return [];
    }
    
    throw error;
  }
}

async function createOrUpdateRASCI(pool, body) {
  try {
    if (!body.kpi || !body.department) {
      throw new Error('KPI and department are required');
    }
    
    // Normalize department name - always use "Direct Fundraising / Resource Mobilization" for DFR
    let departmentName = body.department;
    if (departmentName === 'DFR' || departmentName.toLowerCase() === 'dfr' ||
        departmentName.toLowerCase().includes('direct fundraising') ||
        departmentName.toLowerCase().includes('resource mobilization')) {
      departmentName = 'Direct Fundraising / Resource Mobilization';
    }
    
    // Check if all roles are false - if so, delete the record instead
    const hasAnyRole = body.responsible || body.accountable || body.supportive || body.consulted || body.informed;
    
    // First check if record exists - check both old "DFR" and new "Direct Fundraising / Resource Mobilization"
    const checkRequest = pool.request();
    checkRequest.input('kpi', sql.NVarChar, body.kpi);
    checkRequest.input('department', sql.NVarChar, departmentName);
    checkRequest.input('oldDepartment', sql.NVarChar, 'DFR');
    const existing = await checkRequest.query(
      `SELECT * FROM rasci_metrics 
       WHERE kpi = @kpi 
       AND (department = @department OR (department = @oldDepartment AND @department = 'Direct Fundraising / Resource Mobilization'))`
    );

    if (existing.recordset && existing.recordset.length > 0) {
      // Record exists
      if (!hasAnyRole) {
        // Delete if all roles are false
        const deleteRequest = pool.request();
        deleteRequest.input('kpi', sql.NVarChar, body.kpi);
        deleteRequest.input('department', sql.NVarChar, body.department);
        const deleteResult =         // Delete both old "DFR" and new "Direct Fundraising / Resource Mobilization" if they exist
        await deleteRequest.query(
          `DELETE FROM rasci_metrics 
           WHERE kpi = @kpi 
           AND (department = @department OR (department = @oldDepartment AND @department = 'Direct Fundraising / Resource Mobilization'))`
        );
        console.log(`[RASCI] Deleted record via createOrUpdateRASCI: kpi=${body.kpi}, department=${departmentName}, rows affected: ${deleteResult.rowsAffected[0]}`);
        return { deleted: true, id: existing.recordset[0].id };
      } else {
        // Update existing record - also handle migration from "DFR" to "Direct Fundraising / Resource Mobilization"
        const updateRequest = pool.request();
        updateRequest.input('kpi', sql.NVarChar, body.kpi);
        updateRequest.input('department', sql.NVarChar, departmentName);
        updateRequest.input('oldDepartment', sql.NVarChar, existing.recordset[0].department);
        updateRequest.input('responsible', sql.Bit, body.responsible || false);
        updateRequest.input('accountable', sql.Bit, body.accountable || false);
        updateRequest.input('supportive', sql.Bit, body.supportive || false);
        updateRequest.input('consulted', sql.Bit, body.consulted || false);
        updateRequest.input('informed', sql.Bit, body.informed || false);

        // Update the record, and migrate department name if it's "DFR"
        await updateRequest.query(`
          UPDATE rasci_metrics
          SET 
            department = @department,
            responsible = @responsible,
            accountable = @accountable,
            supportive = @supportive,
            consulted = @consulted,
            informed = @informed
          WHERE kpi = @kpi AND (department = @department OR department = @oldDepartment)
        `);

        // Fetch updated record
        const fetchRequest = pool.request();
        fetchRequest.input('kpi', sql.NVarChar, body.kpi);
        fetchRequest.input('department', sql.NVarChar, departmentName);
        const fetchResult = await fetchRequest.query(
          'SELECT * FROM rasci_metrics WHERE kpi = @kpi AND department = @department'
        );

        return fetchResult.recordset[0];
      }
    } else {
      // Record doesn't exist
      if (!hasAnyRole) {
        // Don't create a record with all false values
        return { id: 0, kpi: body.kpi, department: body.department, responsible: false, accountable: false, supportive: false, consulted: false, informed: false };
      }
      
      // Insert new record
      const insertRequest = pool.request();
      insertRequest.input('kpi', sql.NVarChar, body.kpi);
      insertRequest.input('department', sql.NVarChar, departmentName);
      insertRequest.input('responsible', sql.Bit, body.responsible || false);
      insertRequest.input('accountable', sql.Bit, body.accountable || false);
      insertRequest.input('supportive', sql.Bit, body.supportive || false);
      insertRequest.input('consulted', sql.Bit, body.consulted || false);
      insertRequest.input('informed', sql.Bit, body.informed || false);

      await insertRequest.query(`
        INSERT INTO rasci_metrics (kpi, department, responsible, accountable, supportive, consulted, informed)
        VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed)
      `);

      // Fetch inserted record
      const fetchRequest = pool.request();
      fetchRequest.input('kpi', sql.NVarChar, body.kpi);
      fetchRequest.input('department', sql.NVarChar, departmentName);
      const fetchResult = await fetchRequest.query(
        'SELECT * FROM rasci_metrics WHERE kpi = @kpi AND department = @department'
      );

      return fetchResult.recordset[0];
    }
  } catch (error) {
    console.error('[RASCI] Error in createOrUpdateRASCI:', error);
    console.error('[RASCI] Error message:', error.message);
    console.error('[RASCI] Body received:', JSON.stringify(body));
    
    // If table doesn't exist, provide helpful error message
    if (error.message && error.message.includes('Invalid object name')) {
      const helpfulError = new Error('Table rasci_metrics does not exist. Please run database initialization script.');
      helpfulError.code = 'TABLE_NOT_FOUND';
      throw helpfulError;
    }
    
    throw error;
  }
}

async function deleteRASCI(pool, id) {
  try {
    const request = pool.request();
    request.input('id', sql.Int, id);

    const result = await request.query('DELETE FROM rasci_metrics WHERE id = @id');
    console.log(`[RASCI] Deleted record id=${id}, rows affected: ${result.rowsAffected[0]}`);
    return { success: true, deletedRows: result.rowsAffected[0], id: id };
  } catch (error) {
    console.error('[RASCI] Error in deleteRASCI:', error);
    console.error('[RASCI] Error message:', error.message);
    throw error;
  }
}

async function getRASCIByDepartment(pool, departmentCode) {
  try {
    // First, get the department name from the code
    const deptRequest = pool.request();
    deptRequest.input('code', sql.NVarChar, departmentCode);
    const deptResult = await deptRequest.query('SELECT id, name FROM departments WHERE code = @code');
    
    if (!deptResult.recordset || deptResult.recordset.length === 0) {
      return [];
    }
    
    const department = deptResult.recordset[0];
    const departmentName = department.name;
    const departmentId = department.id;
    
    // Normalize department name for RASCI lookup (handle DFR case)
    let normalizedDeptName = departmentName;
    if (departmentCode === 'DFR' || departmentName.toLowerCase().includes('direct fundraising') ||
        departmentName.toLowerCase().includes('resource mobilization')) {
      normalizedDeptName = 'Direct Fundraising / Resource Mobilization';
    }
    
    // Get all RASCI metrics for this department
    const rasciRequest = pool.request();
    rasciRequest.input('department', sql.NVarChar, normalizedDeptName);
    rasciRequest.input('oldDepartment', sql.NVarChar, 'DFR');
    const rasciResult = await rasciRequest.query(`
      SELECT * FROM rasci_metrics 
      WHERE department = @department 
         OR (department = @oldDepartment AND @department = 'Direct Fundraising / Resource Mobilization')
      ORDER BY kpi
    `);
    
    // Get all department objectives for this department to check existence
    const deptObjRequest = pool.request();
    deptObjRequest.input('department_id', sql.Int, departmentId);
    const deptObjResult = await deptObjRequest.query(`
      SELECT DISTINCT kpi FROM department_objectives 
      WHERE department_id = @department_id
    `);
    
    // Create a set of KPIs that exist in department objectives (normalized for matching)
    // Handle multiple KPIs per objective (delimited by ||)
    const kpiDelimiter = '||';
    const existingKPIs = new Set();
    for (const row of deptObjResult.recordset) {
      // Split multiple KPIs if they exist
      const kpiList = row.kpi.includes(kpiDelimiter) 
        ? row.kpi.split(kpiDelimiter).map(k => k.trim()).filter(k => k)
        : [row.kpi];
      
      // Add each KPI (both normalized and original) to the set
      for (const kpi of kpiList) {
        const normalized = normalizeKPI(kpi).trim().toLowerCase();
        existingKPIs.add(normalized);
        // Also add original for exact matches
        existingKPIs.add(kpi.trim().toLowerCase());
      }
    }
    
    // Format the results with role string and existence check
    const formattedResults = rasciResult.recordset.map(rasci => {
      // Build role string
      const roles = [];
      if (rasci.responsible) roles.push('R');
      if (rasci.accountable) roles.push('A');
      if (rasci.supportive) roles.push('S');
      if (rasci.consulted) roles.push('C');
      if (rasci.informed) roles.push('I');
      const role = roles.join(', ');
      
      // Check if KPI exists in department objectives
      const normalizedRASCIKPI = normalizeKPI(rasci.kpi).trim().toLowerCase();
      const originalRASCIKPI = rasci.kpi.trim().toLowerCase();
      
      let exists_in_activities = false;
      // Check normalized match
      if (existingKPIs.has(normalizedRASCIKPI)) {
        exists_in_activities = true;
      }
      // Check original match
      else if (existingKPIs.has(originalRASCIKPI)) {
        exists_in_activities = true;
      }
      // Check if any department objective KPI matches (fuzzy match)
      // Handle multiple KPIs per objective (delimited by ||)
      else {
        for (const deptKPI of deptObjResult.recordset) {
          // Split multiple KPIs if they exist
          const kpiList = deptKPI.kpi.includes(kpiDelimiter) 
            ? deptKPI.kpi.split(kpiDelimiter).map(k => k.trim()).filter(k => k)
            : [deptKPI.kpi];
          
          // Check each KPI in the list
          for (const kpi of kpiList) {
            const normalizedDeptKPI = normalizeKPI(kpi).trim().toLowerCase();
            const originalDeptKPI = kpi.trim().toLowerCase();
            
            // Exact normalized match
            if (normalizedRASCIKPI === normalizedDeptKPI || originalRASCIKPI === normalizedDeptKPI ||
                normalizedRASCIKPI === originalDeptKPI || originalRASCIKPI === originalDeptKPI) {
              exists_in_activities = true;
              break;
            }
          }
          
          if (exists_in_activities) break;
        }
      }
      
      return {
        ...rasci,
        role: role || '—',
        exists_in_activities: exists_in_activities
      };
    });
    
    return formattedResults;
  } catch (error) {
    console.error('[RASCI] Error in getRASCIByDepartment:', error);
    console.error('[RASCI] Error message:', error.message);
    
    // If table doesn't exist, return empty array instead of error
    if (error.message && error.message.includes('Invalid object name')) {
      console.warn('[RASCI] Table rasci_metrics does not exist. Returning empty array.');
      return [];
    }
    
    throw error;
  }
}

// KPI Functions
async function getKPIsWithRASCI(pool) {
  try {
    const request = pool.request();
    const result = await request.query(`
      SELECT DISTINCT kpi 
      FROM rasci_metrics 
      ORDER BY kpi
    `);
    return result.recordset ? result.recordset.map((r) => r.kpi) : [];
  } catch (error) {
    console.error('[RASCI] Error in getKPIsWithRASCI:', error);
    console.error('[RASCI] Error message:', error.message);
    
    // If table doesn't exist, return empty array instead of error
    if (error.message && error.message.includes('Invalid object name')) {
      console.warn('[RASCI] Table rasci_metrics does not exist. Returning empty array.');
      return [];
    }
    
    throw error;
  }
}

async function getKPIBreakdown(pool, kpi) {
  const request = pool.request();
  request.input('kpi', sql.NVarChar, kpi);

  // Get main objective info (ID and annual target) for this KPI
  const mainRequest = pool.request();
  mainRequest.input('kpi', sql.NVarChar, kpi);
  const mainResult = await mainRequest.query(`
    SELECT TOP 1 id, annual_target 
    FROM main_plan_objectives 
    WHERE kpi = @kpi
  `);

  const mainObjective = mainResult.recordset[0];
  const mainObjectiveId = mainObjective?.id || null;
  const annualTarget = mainObjective?.annual_target || 0;

  // Normalize the strategic plan KPI by removing numeric prefix and trimming
  // This is what we'll compare against
  const normalizedMainKPI = normalizeKPI(kpi).trim().toLowerCase();

  // Get ALL Direct department objectives and match them in JavaScript
  // This gives us full control over the matching logic and ensures accuracy
  const allDeptObjsRequest = pool.request();
  const allDeptObjsResult = await allDeptObjsRequest.query(`
    SELECT 
      d.id as department_id,
      d.name as department,
      d.code as department_code,
      do.kpi,
      do.activity_target
    FROM department_objectives do
    INNER JOIN departments d ON do.department_id = d.id
    WHERE do.type = 'Direct'
    ORDER BY d.name, do.kpi
  `);

  // Helper function to extract meaningful words from KPI (removes common words)
  function extractKeywords(kpiText) {
    if (!kpiText) return [];
    // Remove common Arabic words and keep meaningful terms
    const commonWords = ['عدد', 'نسبة', 'معدل', 'مستوى', 'حجم', 'من', 'مع', 'في', 'على', 'إلى', 'و', 'أو', 'ال', 'هذا', 'تلك', 'التي', 'الذي'];
    const words = kpiText.toLowerCase()
      .replace(/[^\u0600-\u06FF\s]/g, ' ') // Keep only Arabic and spaces
      .split(/\s+/)
      .filter(w => w.length > 2 && !commonWords.includes(w));
    return words;
  }

  // Extract keywords from main KPI
  const mainKeywords = extractKeywords(normalizedMainKPI);
  const mainKeywordsSet = new Set(mainKeywords);
  
  // Group matching objectives by department
  const departmentMap = new Map();
  
  for (const row of allDeptObjsResult.recordset) {
    const deptKPIOriginal = row.kpi.trim();
    const deptKPINormalized = normalizeKPI(row.kpi).trim();
    const deptKPIOriginalLower = deptKPIOriginal.toLowerCase();
    const deptKPINormalizedLower = deptKPINormalized.toLowerCase();
    
    // Try multiple matching strategies - handles both directions:
    // 1. Main has prefix, dept doesn't: "1.3.1 عدد..." matches "عدد..."
    // 2. Main doesn't have prefix, dept has: "عدد..." matches "1.3.1 عدد..."
    // 3. Both have prefixes: "1.3.1 عدد..." matches "1.3.1 عدد..." (exact)
    // 4. Neither has prefix: "عدد..." matches "عدد..." (exact)
    let isMatch = false;
    
    // Strategy 1: Exact normalized match (handles prefix differences in both directions)
    // This is the primary strategy - removes prefixes from both and compares
    // Works for: "1.3.1 عدد..." vs "عدد..." AND "عدد..." vs "1.3.1 عدد..."
    if (deptKPINormalizedLower === normalizedMainKPI) {
      isMatch = true;
    }
    // Strategy 2: Exact match (original vs original) - both have same format
    else if (deptKPIOriginalLower === kpi.trim().toLowerCase()) {
      isMatch = true;
    }
    // Strategy 3: Cross-match - normalized main vs original dept (main has prefix, dept doesn't)
    // Example: "1.3.1 عدد..." (normalized to "عدد...") matches "عدد..."
    else if (deptKPIOriginalLower === normalizedMainKPI) {
      isMatch = true;
    }
    // Strategy 4: Reverse cross-match - original main vs normalized dept (dept has prefix, main doesn't)
    // Example: "عدد..." matches "1.3.1 عدد..." (normalized to "عدد...")
    else if (deptKPINormalizedLower === kpi.trim().toLowerCase()) {
      isMatch = true;
    }
    // Strategy 5: Keyword-based matching (if significant overlap)
    // Use normalized versions for keyword extraction to ignore prefixes
    else if (mainKeywords.length > 0) {
      const deptKeywords = extractKeywords(deptKPINormalizedLower);
      const deptKeywordsSet = new Set(deptKeywords);
      
      // Count matching keywords
      const matchingKeywords = mainKeywords.filter(kw => deptKeywordsSet.has(kw));
      const matchRatio = matchingKeywords.length / Math.max(mainKeywords.length, deptKeywords.length);
      
      // Match if at least 60% of keywords match and at least 3 keywords match
      if (matchRatio >= 0.6 && matchingKeywords.length >= 3) {
        isMatch = true;
      }
      // Also match if all main keywords are found in department KPI (even if department has more)
      else if (matchingKeywords.length === mainKeywords.length && mainKeywords.length >= 2) {
        isMatch = true;
      }
    }
    // Strategy 6: Substring match for longer KPIs (if normalized main KPI is contained in dept KPI or vice versa)
    else if (normalizedMainKPI.length > 20 && deptKPINormalizedLower.length > 20) {
      if (deptKPINormalizedLower.includes(normalizedMainKPI) || 
          normalizedMainKPI.includes(deptKPINormalizedLower)) {
        // Ensure significant overlap (at least 70% of shorter string)
        const shorter = Math.min(normalizedMainKPI.length, deptKPINormalizedLower.length);
        const longer = Math.max(normalizedMainKPI.length, deptKPINormalizedLower.length);
        if (shorter / longer >= 0.7) {
          isMatch = true;
        }
      }
    }
    
    if (isMatch) {
      const deptKey = row.department_id;
      if (!departmentMap.has(deptKey)) {
        departmentMap.set(deptKey, {
          department_id: row.department_id,
          department: row.department,
          department_code: row.department_code,
          sum: 0,
          count: 0
        });
      }
      
      const dept = departmentMap.get(deptKey);
      dept.sum += parseFloat(row.activity_target) || 0;
      dept.count += 1;
    }
  }

  // Convert map to array format
  const breakdown = Array.from(departmentMap.values()).map((dept) => {
    return {
      department: dept.department,
      departmentId: dept.department_id,
      departmentCode: dept.department_code,
      sum: dept.sum,
      directSum: dept.sum,
      indirectSum: 0,
      directCount: dept.count,
      indirectCount: 0,
      percentage: annualTarget > 0 ? (dept.sum / annualTarget) * 100 : 0,
    };
  });

  // Breakdown is already created above in the JavaScript matching logic

  return {
    kpi,
    annual_target: annualTarget,
    main_objective_id: mainObjectiveId,
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
async function getMonthlyData(pool, departmentObjectiveId) {
  // Query by department_objective_id to get calendar for this specific objective
  // Each department objective should have its own calendar
  const request = pool.request();
  request.input('department_objective_id', sql.Int, departmentObjectiveId);

  const result = await request.query(`
    SELECT * FROM department_monthly_data 
    WHERE department_objective_id = @department_objective_id
    ORDER BY month
  `);

  return result.recordset;
}

async function createOrUpdateMonthlyData(pool, body) {
  try {
    // Validate required fields
    if (!body.department_objective_id || !body.month) {
      throw new Error('Missing required fields: department_objective_id or month');
    }

    // First, get the kpi and department_id from department_objectives
    const deptObjRequest = pool.request();
    deptObjRequest.input('department_objective_id', sql.Int, body.department_objective_id);
    const deptObjResult = await deptObjRequest.query(`
      SELECT kpi, department_id 
      FROM department_objectives 
      WHERE id = @department_objective_id
    `);

    if (deptObjResult.recordset.length === 0) {
      throw new Error(`Department objective with id ${body.department_objective_id} not found`);
    }

    const kpi = deptObjResult.recordset[0].kpi;
    const department_id = deptObjResult.recordset[0].department_id;

    if (!kpi || !department_id) {
      throw new Error(`Department objective ${body.department_objective_id} is missing kpi or department_id`);
    }

    const request = pool.request();
    request.input('kpi', sql.NVarChar, kpi);
    request.input('department_id', sql.Int, department_id);
    request.input('department_objective_id', sql.Int, body.department_objective_id);
    request.input('month', sql.Date, body.month);
    request.input('target_value', sql.Decimal(18, 2), body.target_value || null);
    request.input('actual_value', sql.Decimal(18, 2), body.actual_value || null);

    // Use MERGE to handle both update and insert, and handle unique constraint
    // First try to update by department_objective_id
    const updateByDeptObjResult = await request.query(`
      UPDATE department_monthly_data
      SET target_value = @target_value,
          actual_value = @actual_value,
          kpi = @kpi,
          department_id = @department_id,
          updated_at = GETDATE()
      WHERE department_objective_id = @department_objective_id AND month = @month
    `);

    if (updateByDeptObjResult.rowsAffected[0] === 0) {
      // No record found with this department_objective_id and month
      // Check if a record exists with same kpi, department_id, and month (unique constraint)
      const checkRequest = pool.request();
      checkRequest.input('kpi', sql.NVarChar, kpi);
      checkRequest.input('department_id', sql.Int, department_id);
      checkRequest.input('month', sql.Date, body.month);
      
      const existingRecord = await checkRequest.query(`
        SELECT id, department_objective_id 
        FROM department_monthly_data 
        WHERE kpi = @kpi AND department_id = @department_id AND month = @month
      `);

      if (existingRecord.recordset.length > 0) {
        // Update existing record to use this department_objective_id
        const updateExistingRequest = pool.request();
        updateExistingRequest.input('kpi', sql.NVarChar, kpi);
        updateExistingRequest.input('department_id', sql.Int, department_id);
        updateExistingRequest.input('department_objective_id', sql.Int, body.department_objective_id);
        updateExistingRequest.input('month', sql.Date, body.month);
        updateExistingRequest.input('target_value', sql.Decimal(18, 2), body.target_value || null);
        updateExistingRequest.input('actual_value', sql.Decimal(18, 2), body.actual_value || null);
        
        await updateExistingRequest.query(`
          UPDATE department_monthly_data
          SET target_value = @target_value,
              actual_value = @actual_value,
              department_objective_id = @department_objective_id,
              updated_at = GETDATE()
          WHERE kpi = @kpi AND department_id = @department_id AND month = @month
        `);
      } else {
        // No existing record, safe to insert
        const insertRequest = pool.request();
        insertRequest.input('kpi', sql.NVarChar, kpi);
        insertRequest.input('department_id', sql.Int, department_id);
        insertRequest.input('department_objective_id', sql.Int, body.department_objective_id);
        insertRequest.input('month', sql.Date, body.month);
        insertRequest.input('target_value', sql.Decimal(18, 2), body.target_value || null);
        insertRequest.input('actual_value', sql.Decimal(18, 2), body.actual_value || null);
        
        await insertRequest.query(`
          INSERT INTO department_monthly_data (kpi, department_id, department_objective_id, month, target_value, actual_value)
          VALUES (@kpi, @department_id, @department_objective_id, @month, @target_value, @actual_value)
        `);
      }
    }

    // Select the updated/inserted record using department_objective_id
    const selectRequest = pool.request();
    selectRequest.input('department_objective_id', sql.Int, body.department_objective_id);
    selectRequest.input('month', sql.Date, body.month);
    const selectResult = await selectRequest.query(`
      SELECT * FROM department_monthly_data 
      WHERE department_objective_id = @department_objective_id AND month = @month
    `);

    if (selectResult.recordset.length === 0) {
      throw new Error('Failed to retrieve saved monthly data');
    }

    return selectResult.recordset[0];
  } catch (error) {
    console.error('[createOrUpdateMonthlyData] Error:', error.message);
    console.error('[createOrUpdateMonthlyData] Body:', JSON.stringify(body));
    console.error('[createOrUpdateMonthlyData] Error stack:', error.stack);
    throw error;
  }
}

