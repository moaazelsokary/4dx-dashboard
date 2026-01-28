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
    FROM pms_odoo_cache
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
    FROM pms_odoo_cache
    WHERE source = 'odoo'
    ORDER BY month DESC, project_name
  `);
  
  // Get last updated timestamp
  const lastUpdatedResult = await request.query(`
    SELECT MAX(updated_at) AS last_updated
    FROM pms_odoo_cache
  `);
  
  const lastUpdated = lastUpdatedResult.recordset[0]?.last_updated || null;
  
  return {
    pms: pmsResult.recordset,
    odoo: odooResult.recordset,
    lastUpdated: lastUpdated
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
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
                  lastUpdated: null
                },
                warning: 'Cache table does not exist yet. Run sync first.'
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
