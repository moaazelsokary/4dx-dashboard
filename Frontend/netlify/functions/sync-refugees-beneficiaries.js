/**
 * Scheduled daily (UTC): enqueue refugees beneficiaries sync if warehouse is stale.
 * sync-beneficiary-queue (every 3 min) claims the job and runs process-beneficiary-sync-background.
 */

const logger = require('./utils/logger');
const { getPool } = require('./db.cjs');
const { validateBeneficiariesEnv } = require('./utils/refugees-beneficiaries-phase0.cjs');
const { ensureDailyBeneficiarySyncEnqueued } = require('./utils/refugees-beneficiaries-sync-pipeline.cjs');

exports.handler = async (event) => {
  try {
    logger.info('sync-refugees-beneficiaries started', { source: event?.source });

    const env = validateBeneficiariesEnv();
    if (!env.ok) {
      logger.error('sync-refugees-beneficiaries skipped: missing env', { missing: env.missing });
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: 'config', missing: env.missing }),
      };
    }

    const pool = await getPool();
    const result = await ensureDailyBeneficiarySyncEnqueued(pool, logger);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (e) {
    logger.error('sync-refugees-beneficiaries failed', { message: e?.message, stack: e?.stack });
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
