/**
 * Scheduled every few minutes: process one pending beneficiaries sync job (POST /sync 202 queue).
 */

const logger = require('./utils/logger');
const { getPool } = require('./db.cjs');
const { processPendingBeneficiarySyncJobs } = require('./utils/refugees-beneficiaries-sync-pipeline.cjs');

exports.handler = async () => {
  try {
    const pool = await getPool();
    const r = await processPendingBeneficiarySyncJobs(pool, logger, { maxJobs: 10 });
    return { statusCode: 200, body: JSON.stringify({ success: true, ...r }) };
  } catch (e) {
    logger.error('sync-beneficiary-queue failed', { message: e?.message });
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
