/**
 * Metrics API - Fast read API for PMS/Odoo combined data
 * GET: Reads from cache table (fast, 50-200ms)
 * POST /refresh: Runs full PMS/Odoo sync and refills mapped department_monthly_data rows
 */

const { getPool, sql } = require('./db.cjs');
const { syncPmsOdoo } = require('./sync-pms-odoo');
const logger = require('./utils/logger');
const rateLimiter = require('./utils/rate-limiter');
const authMiddleware = require('./utils/auth-middleware');
const { loadMetricsBundleFromPool } = require('./utils/metrics-bundle.cjs');

// GET: Read from cache table (+ derived), same shape as before
async function getMetricsFromCache() {
  const pool = await getPool();
  return loadMetricsBundleFromPool(pool);
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
          await syncPmsOdoo();
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'Refresh completed (cache + mapped monthly rows updated)'
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
