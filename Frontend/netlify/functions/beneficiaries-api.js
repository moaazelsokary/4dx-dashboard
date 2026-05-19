/**
 * Refugees beneficiaries API — enterprise routes (summary, charts, search, journey, async sync).
 */

const rateLimiter = require('./utils/rate-limiter');
const authMiddleware = require('./utils/auth-middleware');
const logger = require('./utils/logger');
const { getPool, withPoolRetry } = require('./db.cjs');
const {
  getDashboardSummary,
  getDashboardCharts,
  getDashboardAnalytics,
  getDashboardFiltered,
  getCategoryProducts,
  searchCases,
  getCaseProfile,
  getCaseServicesKeyset,
  getCaseTimelineKeyset,
  getSyncJob,
  invalidateAnalyticsCache,
} = require('./utils/refugees-beneficiaries-read-api.cjs');
const { runReadModelSync, enqueueSyncJob } = require('./utils/refugees-beneficiaries-sync-pipeline.cjs');
const { validateBeneficiariesEnv } = require('./utils/refugees-beneficiaries-phase0.cjs');

const searchHitStore = new Map();

function jsonHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...extra,
  };
}

function checkSearchBurst(event) {
  const ip =
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers['x-nf-client-connection-ip'] ||
    'unknown';
  const uid = event.user?.userId ?? event.user?.id ?? 'anon';
  const key = `rbsearch:${ip}:${uid}`;
  const now = Date.now();
  const win = 60 * 1000;
  const max = 60;
  let e = searchHitStore.get(key);
  if (!e || e.exp < now) {
    e = { c: 0, exp: now + win };
    searchHitStore.set(key, e);
  }
  if (e.c >= max) {
    return {
      statusCode: 429,
      headers: jsonHeaders(),
      body: JSON.stringify({ ok: false, err: 'rate_limited' }),
    };
  }
  e.c += 1;
  return null;
}

function parsePath(path) {
  const p = path.split('?')[0] || '/';
  if (p === '/' || p === '') return { name: 'legacy' };
  const mSync = p.match(/^\/sync\/(\d+)$/);
  if (mSync) return { name: 'sync-status', jobId: mSync[1] };
  const mCaseSvc = p.match(/^\/(\d+)\/services$/);
  if (mCaseSvc) return { name: 'services', caseId: mCaseSvc[1] };
  const mCaseTl = p.match(/^\/(\d+)\/timeline$/);
  if (mCaseTl) return { name: 'timeline', caseId: mCaseTl[1] };
  const mCaseProf = p.match(/^\/(\d+)\/profile$/);
  if (mCaseProf) return { name: 'profile', caseId: mCaseProf[1] };
  if (p === '/dashboard/summary') return { name: 'summary' };
  if (p === '/dashboard/charts') return { name: 'charts' };
  if (p === '/dashboard/analytics') return { name: 'analytics' };
  if (p === '/dashboard/filtered') return { name: 'filtered' };
  const mCatProd = p.match(/^\/dashboard\/categories\/([^/]+)\/products$/);
  if (mCatProd) return { name: 'category-products', category: decodeURIComponent(mCatProd[1]) };
  if (p.startsWith('/search')) return { name: 'search' };
  if (p === '/sync') return { name: 'sync-post' };
  return { name: 'unknown' };
}

const handler = rateLimiter('general')(
  authMiddleware({
    optional: false,
    resource: 'wig',
    action: 'read',
  })(async (event) => {
    const headers = jsonHeaders();
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    const rawPath = event.path || '';
    const base = rawPath.replace('/.netlify/functions/beneficiaries-api', '') || '/';
    const method = event.httpMethod;
    const route = parsePath(base);
    const t0 = Date.now();

    try {
      const pool = await getPool();
      const user = event.user || {};
      const ctx = {
        role: user.role,
        username: user.username,
        userId: user.userId ?? user.id,
      };

      if (method === 'GET' && route.name === 'summary') {
        const payload = await getDashboardSummary(pool);
        const body = JSON.stringify(payload);
        logger.info('beneficiaries_route', { route: 'summary', ms: Date.now() - t0, bytes: body.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'GET' && route.name === 'charts') {
        const payload = await getDashboardCharts(pool, event.queryStringParameters || {});
        const body = JSON.stringify(payload);
        logger.info('beneficiaries_route', { route: 'charts', ms: Date.now() - t0, bytes: body.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'GET' && route.name === 'analytics') {
        const payload = await getDashboardAnalytics(pool, event.queryStringParameters || {});
        const body = JSON.stringify(payload);
        logger.info('beneficiaries_route', { route: 'analytics', ms: Date.now() - t0, bytes: body.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'GET' && route.name === 'filtered') {
        const payload = await getDashboardFiltered(pool, event.queryStringParameters || {});
        const body = JSON.stringify(payload);
        logger.info('beneficiaries_route', { route: 'filtered', ms: Date.now() - t0, bytes: body.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'GET' && route.name === 'category-products') {
        const mode = (event.queryStringParameters?.mode || 'services').toLowerCase() === 'cases' ? 'cases' : 'services';
        const payload = await getCategoryProducts(pool, route.category, mode, event.queryStringParameters || {});
        const body = JSON.stringify(payload);
        logger.info('beneficiaries_route', { route: 'category-products', ms: Date.now() - t0, bytes: body.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'GET' && route.name === 'search') {
        const rl = checkSearchBurst(event);
        if (rl) return rl;
        const qs = event.queryStringParameters || {};
        const q = qs.q || '';
        const payload = await searchCases(pool, q);
        const body = JSON.stringify(payload);
        logger.info('beneficiaries_route', { route: 'search', ms: Date.now() - t0, bytes: body.length, row_count: payload.r?.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'GET' && route.name === 'profile') {
        const payload = await getCaseProfile(pool, route.caseId, ctx);
        const body = JSON.stringify(payload);
        logger.info('beneficiaries_route', { route: 'profile', ms: Date.now() - t0, bytes: body.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'GET' && route.name === 'services') {
        const qs = event.queryStringParameters || {};
        const cursor = qs.cursor || null;
        const limit = qs.limit ? Number(qs.limit) : undefined;
        const payload = await getCaseServicesKeyset(pool, route.caseId, cursor, limit);
        const body = JSON.stringify(payload);
        logger.info('beneficiaries_route', { route: 'services', ms: Date.now() - t0, bytes: body.length, row_count: payload.it?.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'GET' && route.name === 'timeline') {
        const qs = event.queryStringParameters || {};
        const cursor = qs.cursor || null;
        const limit = qs.limit ? Number(qs.limit) : undefined;
        const payload = await getCaseTimelineKeyset(pool, route.caseId, cursor, limit);
        const body = JSON.stringify(payload);
        logger.info('beneficiaries_route', { route: 'timeline', ms: Date.now() - t0, bytes: body.length, row_count: payload.it?.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'GET' && route.name === 'sync-status') {
        const job = await getSyncJob(pool, route.jobId);
        const body = JSON.stringify(job);
        if (!job.ok) {
          return { statusCode: 404, headers, body };
        }
        logger.info('beneficiaries_route', { route: 'sync-status', ms: Date.now() - t0, bytes: body.length });
        return { statusCode: 200, headers, body };
      }

      if (method === 'POST' && route.name === 'sync-post') {
        if (!['Admin', 'CEO'].includes(String(user.role || ''))) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ ok: false, err: 'forbidden' }),
          };
        }
        const env = validateBeneficiariesEnv();
        if (!env.ok) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ ok: false, err: 'config', missing: env.missing }),
          };
        }
        const qs = event.queryStringParameters || {};
        if (qs.immediate === '1') {
          try {
            const syncResult = await runReadModelSync(pool, logger, {});
            invalidateAnalyticsCache();
            let meta = null;
            try {
              const summary = await withPoolRetry((p) => getDashboardSummary(p));
              meta = summary.meta;
            } catch (summaryErr) {
              logger.warn('beneficiaries_route immediate sync summary failed', {
                message: summaryErr?.message,
              });
            }
            const body = JSON.stringify({
              ok: true,
              mode: 'immediate',
              meta,
              sync: syncResult,
              ...(meta ? {} : { warning: 'Sync completed; refresh the page if KPIs are empty.' }),
            });
            logger.info('beneficiaries_route', { route: 'sync-post-immediate', ms: Date.now() - t0, bytes: body.length });
            return {
              statusCode: 200,
              headers,
              body,
            };
          } catch (syncErr) {
            const msg = String(syncErr?.message || syncErr);
            const isOdoo = /odoo/i.test(msg);
            logger.error('beneficiaries_route immediate sync failed', { message: msg });
            return {
              statusCode: isOdoo ? 502 : 500,
              headers,
              body: JSON.stringify({
                ok: false,
                err: msg,
                hint: isOdoo
                  ? 'Odoo failed during extract. Wait a minute and use Queue Odoo sync, or retry Sync now.'
                  : undefined,
              }),
            };
          }
        }
        const jobId = await enqueueSyncJob(pool, user.username);
        const body = JSON.stringify({ ok: true, jobId: String(jobId) });
        logger.info('beneficiaries_route', { route: 'sync-post', status: 202, ms: Date.now() - t0, bytes: body.length });
        return {
          statusCode: 202,
          headers,
          body,
        };
      }

      if (method === 'GET' && route.name === 'legacy') {
        const summary = await getDashboardSummary(pool);
        const charts = await getDashboardCharts(pool);
        const body = JSON.stringify({
          success: true,
          lastUpdated: summary.meta?.lastSyncAt ?? null,
          empty: !summary.meta?.lastSyncAt && summary.kpis.totalIndividuals === 0,
          enterprise: true,
          summary,
          charts,
        });
        logger.info('beneficiaries_route', { route: 'legacy', ms: Date.now() - t0, bytes: body.length });
        return { statusCode: 200, headers, body };
      }

      const nf = { statusCode: 404, headers, body: JSON.stringify({ ok: false, err: 'not_found' }) };
      logger.info('beneficiaries_route', { route: base, ms: Date.now() - t0, bytes: (nf.body && nf.body.length) || 0 });
      return nf;
    } catch (err) {
      logger.error('beneficiaries-api error', { message: err?.message, stack: err?.stack });
      if (err.message && err.message.includes('Invalid object name')) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: false,
            empty: true,
            warning: 'Run database/migration-rb-enterprise-read-model.sql',
          }),
        };
      }
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, err: err.message || 'error' }),
      };
    }
  })
);

module.exports = { handler };

