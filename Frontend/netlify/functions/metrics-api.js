/**
 * Metrics API - Fast read API for PMS/Odoo combined data
 * GET: Reads from cache table (fast, 50-200ms)
 * POST /refresh: Triggers immediate sync (background)
 */

const { getPool, sql } = require('./db.cjs');
const { syncPmsOdoo } = require('./sync-pms-odoo');
const logger = require('./utils/logger');
const rateLimiter = require('./utils/rate-limiter');
const authMiddleware = require('./utils/auth-middleware');

// Compute derived metric rows from pms/odoo data and definition
function computeDerivedRows(pms, odoo, derivedDef) {
  const def = Array.isArray(derivedDef.definition) ? derivedDef.definition : (JSON.parse(derivedDef.definition || '[]') || []);
  const hasPms = def.some(d => d.source === 'pms');
  const hasOdoo = def.some(d => d.source === 'odoo');
  const source = hasPms && hasOdoo ? 'odoo & pms' : hasOdoo ? 'odoo' : 'pms';
  const months = new Set();
  for (const d of def) {
    if (d.source === 'pms') {
      (pms || []).filter(r => r.ProjectName === d.project && r.MetricName === (d.metric || '')).forEach(r => months.add(r.MonthYear));
    } else if (d.source === 'odoo') {
      (odoo || []).filter(r => r.Project === d.project).forEach(r => months.add(r.Month));
    }
  }
  const rows = [];
  for (const month of [...months].sort()) {
    let target = null, actual = null, servicesCreated = null, servicesDone = null;
    if (hasPms) {
      for (const d of def) {
        if (d.source !== 'pms') continue;
        const m = (pms || []).find(r => r.ProjectName === d.project && r.MetricName === (d.metric || '') && r.MonthYear === month);
        if (m) {
          target = (target ?? 0) + (m.Target ?? 0);
          actual = (actual ?? 0) + (m.Actual ?? 0);
        }
      }
    }
    if (hasOdoo) {
      for (const d of def) {
        if (d.source !== 'odoo') continue;
        const m = (odoo || []).find(r => r.Project === d.project && r.Month === month);
        if (m) {
          servicesCreated = (servicesCreated ?? 0) + (m.ServicesCreated ?? 0);
          servicesDone = (servicesDone ?? 0) + (m.ServicesDone ?? 0);
        }
      }
    }
    rows.push({
      source, project: derivedDef.project_name, metric: null, month: month,
      target: hasPms ? target : null, actual: hasPms ? actual : null,
      servicesCreated: hasOdoo ? servicesCreated : null, servicesDone: hasOdoo ? servicesDone : null
    });
  }
  return rows;
}

// GET: Read from cache table
async function getMetricsFromCache() {
  const pool = await getPool();
  const request = pool.request();

  // Get PMS data
  const pmsResult = await request.query(`
    SELECT 
      project_name AS ProjectName,
      metric_name AS MetricName,
      month AS MonthYear,
      target_value AS Target,
      actual_value AS Actual,
      updated_at AS UpdatedAt
    FROM dbo.pms_odoo_cache
    WHERE source = 'pms'
    ORDER BY project_name, metric_name, month
  `);

  // Get Odoo data
  const odooResult = await request.query(`
    SELECT 
      project_name AS Project,
      month AS Month,
      services_created AS ServicesCreated,
      services_done AS ServicesDone,
      updated_at AS UpdatedAt
    FROM dbo.pms_odoo_cache
    WHERE source = 'odoo'
    ORDER BY month DESC, project_name
  `);

  // Get last updated timestamp
  const lastUpdatedResult = await request.query(`
    SELECT MAX(updated_at) AS last_updated
    FROM dbo.pms_odoo_cache
  `);

  const lastUpdated = lastUpdatedResult.recordset[0]?.last_updated || null;
  const pms = pmsResult.recordset || [];
  const odoo = odooResult.recordset || [];

  // Get derived metrics definitions and compute rows
  let derived = [];
  let derivedDefinitions = [];
  try {
    const derivedResult = await request.query(`
      SELECT id, project_name, source, definition FROM dbo.derived_metrics
    `);
    const derivedDefs = derivedResult.recordset || [];
    for (const d of derivedDefs) {
      derived = derived.concat(computeDerivedRows(pms, odoo, d));
    }
    derivedDefinitions = derivedDefs.map(d => ({
      id: d.id,
      projectName: d.project_name,
      source: d.source,
      definition: typeof d.definition === 'string' ? JSON.parse(d.definition || '[]') : d.definition
    }));
  } catch (e) {
    if (!e.message || !e.message.includes('Invalid object name') || !e.message.includes('derived_metrics')) {
      logger.warn('Could not load derived_metrics', e.message);
    }
  }

  return {
    pms,
    odoo,
    derived,
    derivedDefinitions,
    lastUpdated
  };
}

// Handler with auth middleware
const handler = rateLimiter('general')(
  authMiddleware({
    optional: true, // Allow GET without auth, but check if provided
    required: false // POST requires auth (Admin/CEO)
  })(async (event, context) => {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: ''
      };
    }

    try {
      const path = event.path.replace('/.netlify/functions/metrics-api', '') || '/';
      const method = event.httpMethod;

      // GET: Read from cache
      if (method === 'GET' && path === '/') {
        try {
          const data = await getMetricsFromCache();
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              data: data
            })
          };
        } catch (error) {
          logger.error('Error reading from cache', error);
          
          // If cache is empty (first run), return empty data
          if (error.message && error.message.includes('Invalid object name')) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: true,
                data: {
                  pms: [],
                  odoo: [],
                  derived: [],
                  derivedDefinitions: [],
                  lastUpdated: null
                },
                warning: 'Cache or derived_metrics table does not exist yet. Run migration and sync first.'
              })
            };
          }
          
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Failed to read from cache',
              message: error.message
            })
          };
        }
      }

      // POST /refresh: Trigger immediate sync
      if (method === 'POST' && path === '/refresh') {
        // Check auth for refresh (Admin/CEO only) – user is set by auth middleware on event
        const user = event.user;
        if (!user || !['Admin', 'CEO'].includes(user.role)) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Unauthorized - Admin or CEO role required'
            })
          };
        }

        try {
          // Run sync in background (don't wait for completion)
          syncPmsOdoo().catch(err => {
            logger.error('Background sync failed', err);
          });
          
          // Return immediately
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'Refresh started in background'
            })
          };
        } catch (error) {
          logger.error('Error starting refresh', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Failed to start refresh',
              message: error.message
            })
          };
        }
      }

      // POST /derived: Create derived metric (Admin/CEO only)
      if (method === 'POST' && path === '/derived') {
        const user = event.user;
        if (!user || !['Admin', 'CEO'].includes(user.role)) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ success: false, error: 'Unauthorized - Admin or CEO role required' })
          };
        }
        try {
          const body = JSON.parse(event.body || '{}');
          const { projectName, definition } = body;
          if (!projectName || !Array.isArray(definition) || definition.length < 2) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'projectName and definition (array of 2+ items) required' })
            };
          }
          const hasPms = definition.some(d => d.source === 'pms');
          const hasOdoo = definition.some(d => d.source === 'odoo');
          const source = hasPms && hasOdoo ? 'odoo & pms' : hasOdoo ? 'odoo' : 'pms';
          const pool = await getPool();
          const r = await pool.request()
            .input('project_name', sql.NVarChar, String(projectName).trim())
            .input('source', sql.NVarChar, source)
            .input('definition', sql.NVarChar, JSON.stringify(definition))
            .input('created_by', sql.NVarChar, user.username || null)
            .query(`
              INSERT INTO dbo.derived_metrics (project_name, source, definition, created_by)
              OUTPUT INSERTED.id VALUES (@project_name, @source, @definition, @created_by)
            `);
          const id = r.recordset[0]?.id;
          return {
            statusCode: 201,
            headers,
            body: JSON.stringify({ success: true, id, message: 'Derived metric created' })
          };
        } catch (err) {
          logger.error('Create derived metric error', err);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: err.message || 'Failed to create' })
          };
        }
      }

      // PUT /derived/:id: Update derived metric (Admin/CEO only)
      const putDerivedMatch = path && path.match(/^\/derived\/(\d+)$/);
      if (method === 'PUT' && putDerivedMatch) {
        const user = event.user;
        if (!user || !['Admin', 'CEO'].includes(user.role)) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ success: false, error: 'Unauthorized - Admin or CEO role required' })
          };
        }
        const id = parseInt(putDerivedMatch[1], 10);
        try {
          const body = JSON.parse(event.body || '{}');
          const { projectName, definition } = body;
          if (!projectName || !Array.isArray(definition) || definition.length < 2) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'projectName and definition (array of 2+ items) required' })
            };
          }
          const hasPms = definition.some(d => d.source === 'pms');
          const hasOdoo = definition.some(d => d.source === 'odoo');
          const source = hasPms && hasOdoo ? 'odoo & pms' : hasOdoo ? 'odoo' : 'pms';
          const pool = await getPool();
          const r = await pool.request()
            .input('id', sql.Int, id)
            .input('project_name', sql.NVarChar, String(projectName).trim())
            .input('source', sql.NVarChar, source)
            .input('definition', sql.NVarChar, JSON.stringify(definition))
            .query(`
              UPDATE dbo.derived_metrics SET project_name = @project_name, source = @source, definition = @definition
              WHERE id = @id
            `);
          if (r.rowsAffected[0] === 0) {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ success: false, error: 'Derived metric not found' })
            };
          }
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Derived metric updated' }) };
        } catch (err) {
          logger.error('Update derived metric error', err);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: err.message || 'Failed to update' })
          };
        }
      }

      // DELETE /derived/:id (Admin/CEO only)
      const delDerivedMatch = path && path.match(/^\/derived\/(\d+)$/);
      if (method === 'DELETE' && delDerivedMatch) {
        const user = event.user;
        if (!user || !['Admin', 'CEO'].includes(user.role)) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ success: false, error: 'Unauthorized - Admin or CEO role required' })
          };
        }
        const id = parseInt(delDerivedMatch[1], 10);
        try {
          const pool = await getPool();
          const r = await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.derived_metrics WHERE id = @id');
          if (r.rowsAffected[0] === 0) {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ success: false, error: 'Derived metric not found' })
            };
          }
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Derived metric deleted' }) };
        } catch (err) {
          logger.error('Delete derived metric error', err);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: err.message || 'Failed to delete' })
          };
        }
      }

      // 404 for unknown paths
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Not found'
        })
      };
    } catch (error) {
      logger.error('Metrics API error', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Internal server error',
          message: error.message
        })
      };
    }
  })
);

exports.handler = handler;
