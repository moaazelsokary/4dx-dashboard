/**
 * Trigger long-running beneficiaries warehouse sync (Netlify background function, up to 15 min).
 * Scheduled/cron handlers must return within ~30s — do not call runReadModelSync inline there.
 */

const logger = require('./logger');

function siteBaseUrl() {
  const raw = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL || '';
  return String(raw).replace(/\/$/, '');
}

/**
 * @param {{ jobId?: number | null, source?: string }} payload
 * @returns {Promise<{ invoked: boolean, inline?: boolean }>}
 */
async function invokeBeneficiarySyncBackground(payload = {}) {
  const base = siteBaseUrl();
  const path = '/.netlify/functions/process-beneficiary-sync-background';
  const body = JSON.stringify({
    jobId: payload.jobId != null ? Number(payload.jobId) : null,
    source: payload.source || 'invoke',
  });

  if (base) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      logger.info('invokeBeneficiarySyncBackground', {
        status: res.status,
        source: payload.source,
        jobId: payload.jobId ?? null,
      });
      return { invoked: true };
    } catch (e) {
      logger.error('invokeBeneficiarySyncBackground fetch failed', {
        message: e?.message,
        source: payload.source,
      });
      throw e;
    }
  }

  /* Local dev: no SITE_URL — run inline (auth-proxy / netlify dev). */
  logger.warn('invokeBeneficiarySyncBackground: no URL; running sync inline');
  const { getPool } = require('../db.cjs');
  const { runReadModelSync } = require('./refugees-beneficiaries-sync-pipeline.cjs');
  const pool = await getPool();
  await runReadModelSync(pool, logger, { jobId: payload.jobId ?? undefined });
  return { invoked: false, inline: true };
}

module.exports = { invokeBeneficiarySyncBackground, siteBaseUrl };
