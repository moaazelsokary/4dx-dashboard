/**
 * Scheduled every few minutes: claim one queued admin sync job and run it in the background.
 */

const sql = require('mssql');
const logger = require('./utils/logger');
const { getPool } = require('./db.cjs');
const { claimNextPendingJob } = require('./utils/refugees-beneficiaries-sync-pipeline.cjs');
const { invokeBeneficiarySyncBackground } = require('./utils/refugees-beneficiaries-background-invoke.cjs');

async function requeueJob(pool, jobId) {
  await pool
    .request()
    .input('id', sql.BigInt, BigInt(jobId))
    .query(`
      UPDATE dbo.rb_sync_job
      SET status = N'pending', stage = N'queued', started_at = NULL
      WHERE id = @id AND status = N'running';
    `);
}

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
      await requeueJob(pool, jobId);
      throw invokeErr;
    }
  } catch (e) {
    logger.error('sync-beneficiary-queue failed', { message: e?.message });
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
