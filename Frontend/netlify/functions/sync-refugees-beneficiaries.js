/**
 * Scheduled: refresh refugees beneficiaries snapshot from Odoo once per day.
 */

const logger = require('./utils/logger');
const { getPool } = require('./db.cjs');
const { processPendingBeneficiarySyncJobs } = require('./utils/refugees-beneficiaries-sync-pipeline.cjs');
const { syncRefugeesBeneficiariesSnapshot } = require('./utils/refugees-beneficiaries-data.cjs');

exports.handler = async (event) => {
  try {
    logger.info('sync-refugees-beneficiaries started', { source: event?.source });
    const pool = await getPool();
    await processPendingBeneficiarySyncJobs(pool, logger, { maxJobs: 10 });
    const result = await syncRefugeesBeneficiariesSnapshot(logger);
    return { statusCode: 200, body: JSON.stringify({ success: true, result }) };
  } catch (e) {
    logger.error('sync-refugees-beneficiaries failed', { message: e?.message, stack: e?.stack });
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
