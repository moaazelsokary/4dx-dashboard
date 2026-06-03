/**
 * Scheduled daily (UTC): kick off refugees beneficiaries warehouse sync via background function.
 * Netlify scheduled functions must finish in ~30s; full Odoo extract takes several minutes.
 */

const logger = require('./utils/logger');
const { getPool } = require('./db.cjs');
const { validateBeneficiariesEnv } = require('./utils/refugees-beneficiaries-phase0.cjs');
const { invokeBeneficiarySyncBackground } = require('./utils/refugees-beneficiaries-background-invoke.cjs');

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

    const invoke = await invokeBeneficiarySyncBackground({ source: 'scheduled-daily', jobId: null });
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, mode: invoke.invoked ? 'background' : 'inline', ...invoke }),
    };
  } catch (e) {
    logger.error('sync-refugees-beneficiaries failed', { message: e?.message, stack: e?.stack });
    return { statusCode: 500, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
