const sql = require('mssql');

async function markSyncJobRunning(pool, jobId) {
  await pool
    .request()
    .input('id', sql.BigInt, BigInt(jobId))
    .query(`
      UPDATE dbo.rb_sync_job
      SET status = N'running', stage = N'extract', started_at = SYSUTCDATETIME()
      WHERE id = @id AND status = N'pending';
    `);
}

async function requeueSyncJob(pool, jobId) {
  await pool
    .request()
    .input('id', sql.BigInt, BigInt(jobId))
    .query(`
      UPDATE dbo.rb_sync_job
      SET status = N'pending', stage = N'queued', started_at = NULL
      WHERE id = @id AND status = N'running';
    `);
}

module.exports = { markSyncJobRunning, requeueSyncJob };
