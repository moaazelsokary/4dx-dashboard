/**
 * Background: Odoo → SQL refugees beneficiaries warehouse (up to 15 min on Netlify).
 * Invoked by scheduled cron and queue worker — not by the browser directly.
 */

const logger = require('./utils/logger');
const { getPool } = require('./db.cjs');
const { runReadModelSync } = require('./utils/refugees-beneficiaries-sync-pipeline.cjs');
const { validateBeneficiariesEnv } = require('./utils/refugees-beneficiaries-phase0.cjs');

exports.handler = async (event) => {
  let payload = {};
  try {
    if (event.body) {
      payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
  } catch {
    payload = {};
  }

  const jobId = payload.jobId != null && Number.isFinite(Number(payload.jobId)) ? Number(payload.jobId) : null;
  const source = payload.source || event?.headers?.['x-nf-event'] || 'background';

  try {
    const env = validateBeneficiariesEnv();
    if (!env.ok) {
      logger.error('process-beneficiary-sync-background missing env', { missing: env.missing, source });
      return;
    }

    logger.info('process-beneficiary-sync-background started', { source, jobId });
    const pool = await getPool();
    if (jobId != null) {
      const { markSyncJobRunning } = require('./utils/rb-sync-job.cjs');
      await markSyncJobRunning(pool, jobId);
    }
    const result = await runReadModelSync(pool, logger, jobId != null ? { jobId } : {});
    logger.info('process-beneficiary-sync-background finished', { source, jobId, result });
  } catch (e) {
    logger.error('process-beneficiary-sync-background failed', {
      source,
      jobId,
      message: e?.message,
      stack: e?.stack,
    });
    throw e;
  }
};
