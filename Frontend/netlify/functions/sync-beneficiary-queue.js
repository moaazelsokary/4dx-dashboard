/**
 * Scheduled every few minutes: claim one queued admin sync job and run it in the background.
 */

const logger = require('./utils/logger');
const { getPool } = require('./db.cjs');
const { claimNextPendingJob } = require('./utils/refugees-beneficiaries-sync-pipeline.cjs');
const { invokeBeneficiarySyncBackground } = require('./utils/refugees-beneficiaries-background-invoke.cjs');
const { requeueSyncJob } = require('./utils/rb-sync-job.cjs');

exports.handler = async () => {
  try {
    const pool = await getPool();
    const jobId = await claimNextPendingJob(pool);
    if (jobId == null) {
      return { statusCode: 200, body: JSON.stringify({ success: true, processed: false, jobs: [] }) };
    }

    try {
      const invoke = await invokeBeneficiarySyncBackground({ source: 'queue', jobId });
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          processed: true,
          jobId,
          mode: invoke.invoked ? 'background' : 'inline',
        }),
      };
    } catch (invokeErr) {
      await requeueSyncJob(pool, jobId);
      throw invokeErr;
    }
  } catch (e) {
    logger.error('sync-beneficiary-queue failed', { message: e?.message });
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
