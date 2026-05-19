/**
 * Process pending rb_sync_job rows (local dev / ops).
 * Usage: from Frontend folder: npm run sync-beneficiary-queue
 */
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const { getPool } = require('../netlify/functions/db.cjs');
const { processPendingBeneficiarySyncJobs } = require('../netlify/functions/utils/refugees-beneficiaries-sync-pipeline.cjs');

async function main() {
  const pool = await getPool();
  const r = await processPendingBeneficiarySyncJobs(pool, console, { maxJobs: 10 });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.jobs?.some((j) => !j.ok) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
