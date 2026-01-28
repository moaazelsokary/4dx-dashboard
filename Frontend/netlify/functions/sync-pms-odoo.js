/**
 * Scheduled sync function for PMS and Odoo data
 * Runs on a schedule (every 5-10 minutes) to fetch data from PMS SQL Server and Odoo,
 * merge it, and write to the cache table for fast reads
 */

const sql = require('mssql');
const logger = require('./utils/logger');

// PMS Database connection pool
let pmsPool = null;
// Main DataWarehouse connection pool (for cache table)
let cachePool = null;

// Get PMS database config
function getPmsDbConfig() {
  const serverValue = process.env.PMS_SERVER || process.env.VITE_PMS_SERVER || '';
  let server, port;
  if (serverValue.includes(',')) {
    [server, port] = serverValue.split(',').map(s => s.trim());
    port = parseInt(port) || 1433;
  } else {
    server = serverValue;
    port = 1433;
  }

  let password = process.env.PMS_PWD || process.env.VITE_PMS_PWD;
  if (password && password.includes('%')) {
    try {
      password = decodeURIComponent(password);
    } catch (e) {
      // Keep original if decode fails
    }
  }
  if ((password && password.startsWith('"') && password.endsWith('"')) || 
      (password && password.startsWith("'") && password.endsWith("'"))) {
    password = password.slice(1, -1);
  }
  if (password) {
    password = password.trim();
  }

  return {
    server: server,
    port: port,
    database: process.env.PMS_DATABASE || process.env.VITE_PMS_DATABASE,
    user: process.env.PMS_UID || process.env.VITE_PMS_UID,
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

// Get main DataWarehouse config (for cache table)
function getCacheDbConfig() {
  const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
  let server, port;
  if (serverValue.includes(',')) {
    [server, port] = serverValue.split(',').map(s => s.trim());
    port = parseInt(port) || 1433;
  } else {
    server = serverValue;
    port = 1433;
  }

  let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
  if (password && password.startsWith('/')) {
    password = process.env.DB_PASSWORD || process.env.VITE_PWD;
  }
  if (password && password.includes('%')) {
    try {
      password = decodeURIComponent(password);
    } catch (e) {
      // Keep original if decode fails
    }
  }
  if ((password && password.startsWith('"') && password.endsWith('"')) || 
      (password && password.startsWith("'") && password.endsWith("'"))) {
    password = password.slice(1, -1);
  }
  if (password) {
    password = password.trim();
  }

  return {
    server: server,
    port: port,
    database: process.env.DATABASE || process.env.VITE_DATABASE,
    user: process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
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

async function getPmsPool() {
  if (!pmsPool) {
    try {
      const config = getPmsDbConfig();
      pmsPool = await sql.connect(config);
      logger.info('Connected to PMS SQL Server', { server: config.server, database: config.database });
    } catch (error) {
      logger.error('PMS database connection error', error);
      throw error;
    }
  }
  return pmsPool;
}

async function getCachePool() {
  if (!cachePool) {
    try {
      const config = getCacheDbConfig();
      cachePool = await sql.connect(config);
      logger.info('Connected to DataWarehouse for cache', { server: config.server, database: config.database });
    } catch (error) {
      logger.error('Cache database connection error', error);
      throw error;
    }
  }
  return cachePool;
}

// Fetch data from PMS
async function fetchPmsData() {
  const pool = await getPmsPool();
  const request = pool.request();
  
  const query = `
    SELECT
        p.Id                AS ProjectId,
        p.Name              AS ProjectName,
        m.Name              AS MetricName,
        m.Unit              AS MetricUnit,
        mv.Year             AS [Year],
        mv.Month            AS [Month],
        CONCAT(mv.Year, '-', RIGHT('0' + CAST(mv.Month AS VARCHAR(2)), 2)) AS [MonthYear],
        mv.Target,
        mv.Actual
    FROM dbo.Metrics m
    INNER JOIN dbo.Projects p
        ON m.ProjectId = p.Id
    INNER JOIN dbo.MetricValues mv
        ON mv.MetricId = m.Id
    WHERE m.IsDeleted = 0
      AND m.IsActive = 1
    ORDER BY
        p.Name,
        m.Name,
        mv.Year,
        mv.Month;
  `;
  
  const result = await request.query(query);
  logger.info('Fetched PMS data', { rowCount: result.recordset.length });
  return result.recordset;
}

// Fetch data from Odoo
async function fetchOdooData() {
  const token = process.env.ODOO_TOKEN || process.env.VITE_Odoo_Token;
  if (!token) {
    throw new Error('ODOO_TOKEN or VITE_Odoo_Token environment variable is required');
  }

  const query = `
    SELECT
        Project,
        Month,
        SUM(ServicesCreated) AS ServicesCreated,
        SUM(ServicesDone) AS ServicesDone
    FROM
        (SELECT 
            implementation_teams.name AS Project,
            TO_CHAR(case_implementation.create_date, 'YYYY-MM') AS Month,
            COUNT(case_implementation.id) AS ServicesCreated,
            0 AS ServicesDone
        FROM case_implementation 
        LEFT JOIN case_implementation_implementation_teams_rel 
            ON case_implementation.id = case_implementation_implementation_teams_rel.case_implementation_id 
        LEFT JOIN implementation_teams 
            ON implementation_teams.id = case_implementation_implementation_teams_rel.implementation_teams_id
        WHERE (case_implementation.create_date IS NOT NULL AND TO_CHAR(case_implementation.create_date, 'YYYY-MM') >= '2026-01')
        AND implementation_teams.name IN ('Basic Need','Emergency Team','Humanitarian Assistance Team', 'Dafa 2025', 'Sawa','NRC','Steps Forward','Qift Project')
        GROUP BY implementation_teams.name, TO_CHAR(case_implementation.create_date, 'YYYY-MM')

        UNION ALL
        
        SELECT 
            implementation_teams.name AS Project,
            TO_CHAR(case_implementation.actual_date, 'YYYY-MM') AS Month,
            0 AS ServicesCreated,
            COUNT(case_implementation.id) AS ServicesDone
        FROM case_implementation 
        LEFT JOIN case_implementation_implementation_teams_rel 
            ON case_implementation.id = case_implementation_implementation_teams_rel.case_implementation_id 
        LEFT JOIN implementation_teams 
            ON implementation_teams.id = case_implementation_implementation_teams_rel.implementation_teams_id
        WHERE (case_implementation.actual_date IS NOT NULL AND TO_CHAR(case_implementation.actual_date, 'YYYY-MM') >= '2026-01')
        AND implementation_teams.name IN ('Basic Need','Emergency Team','Humanitarian Assistance Team', 'Dafa 2025', 'Sawa','NRC','Steps Forward','Qift Project')
        GROUP BY implementation_teams.name, TO_CHAR(case_implementation.actual_date, 'YYYY-MM')
    ) AS combined
    GROUP BY Project, Month
    ORDER BY Month DESC, Project
  `;

  const payload = {
    jsonrpc: '2.0',
    method: 'execute',
    params: {
      token: token,
      query: query
    },
    id: 1
  };

  // Use AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const response = await fetch('https://lifemakers.odoo.com/powerbi/sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Odoo API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Odoo API error: ${JSON.stringify(data.error)}`);
  }

  const result = data.result || [];
  logger.info('Fetched Odoo data', { rowCount: result.length });
  return result;
}

// Write data to cache table
async function writeToCache(pmsData, odooData) {
  const pool = await getCachePool();
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    
    // Clear existing cache
    const clearRequest = new sql.Request(transaction);
    await clearRequest.query('DELETE FROM dbo.pms_odoo_cache');
    logger.info('Cleared existing cache');
    
    // Insert PMS data
    if (pmsData && pmsData.length > 0) {
      for (const row of pmsData) {
        const insertRequest = new sql.Request(transaction);
        insertRequest.input('source', sql.NVarChar, 'pms');
        insertRequest.input('project_name', sql.NVarChar, row.ProjectName);
        insertRequest.input('metric_name', sql.NVarChar, row.MetricName);
        insertRequest.input('month', sql.NVarChar, row.MonthYear);
        insertRequest.input('target_value', sql.Decimal(18, 2), row.Target);
        insertRequest.input('actual_value', sql.Decimal(18, 2), row.Actual);
        
        await insertRequest.query(`
          INSERT INTO dbo.pms_odoo_cache (source, project_name, metric_name, month, target_value, actual_value, updated_at)
          VALUES (@source, @project_name, @metric_name, @month, @target_value, @actual_value, GETDATE())
        `);
      }
      logger.info('Inserted PMS data', { rowCount: pmsData.length });
    }
    
    // Insert Odoo data
    if (odooData && odooData.length > 0) {
      for (const row of odooData) {
        const insertRequest = new sql.Request(transaction);
        insertRequest.input('source', sql.NVarChar, 'odoo');
        insertRequest.input('project_name', sql.NVarChar, row.Project);
        insertRequest.input('metric_name', sql.NVarChar, null);
        insertRequest.input('month', sql.NVarChar, row.Month);
        insertRequest.input('services_created', sql.Int, row.ServicesCreated || 0);
        insertRequest.input('services_done', sql.Int, row.ServicesDone || 0);
        
        await insertRequest.query(`
          INSERT INTO dbo.pms_odoo_cache (source, project_name, metric_name, month, services_created, services_done, updated_at)
          VALUES (@source, @project_name, @metric_name, @month, @services_created, @services_done, GETDATE())
        `);
      }
      logger.info('Inserted Odoo data', { rowCount: odooData.length });
    }
    
    await transaction.commit();
    logger.info('Cache update completed successfully');
    
    return {
      pmsRows: pmsData ? pmsData.length : 0,
      odooRows: odooData ? odooData.length : 0
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Error writing to cache', { message: error?.message, code: error?.code, stack: error?.stack });
    if (error.message && error.message.includes('Invalid object name') && error.message.includes('pms_odoo_cache')) {
      throw new Error('Table pms_odoo_cache does not exist. Run migration: Frontend/database/migrate-pms-odoo-cache.sql on the DataWarehouse database.');
    }
    throw error;
  }
}

// Main sync function – fetch each source independently so one failure doesn't block the other
async function syncPmsOdoo() {
  logger.info('Starting PMS/Odoo sync');

  let pmsData = [];
  let odooData = [];

  try {
    pmsData = await fetchPmsData();
  } catch (error) {
    logger.error('PMS fetch failed (will write Odoo only if available)', { message: error?.message, code: error?.code, stack: error?.stack });
  }

  try {
    odooData = await fetchOdooData();
  } catch (error) {
    logger.error('Odoo fetch failed (will write PMS only if available)', { message: error?.message, code: error?.code, stack: error?.stack });
  }

  if (pmsData.length === 0 && odooData.length === 0) {
    const msg = 'No data from PMS or Odoo – check env (PMS_*, ODOO_TOKEN), migration, and Netlify logs.';
    logger.warn(msg);
    throw new Error(msg);
  }

  const result = await writeToCache(pmsData, odooData);
  logger.info('PMS/Odoo sync completed', result);
  return result;
}

exports.handler = async (event, context) => {
  try {
    logger.info('Sync PMS/Odoo scheduled function started');
    
    // Verify this is a scheduled event (optional check)
    if (event.source && event.source !== 'aws.events') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Unauthorized - not a scheduled event' }),
      };
    }
    
    const result = await syncPmsOdoo();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Sync completed successfully',
        ...result
      }),
    };
  } catch (error) {
    logger.error('Scheduled sync failed', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Sync failed',
      }),
    };
  }
};

// Export sync function for use in metrics-api refresh endpoint
module.exports.syncPmsOdoo = syncPmsOdoo;
