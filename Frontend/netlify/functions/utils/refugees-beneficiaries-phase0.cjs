/**
 * Phase-0 assumptions and environment checks for Refugees beneficiaries pipeline.
 * Incremental Odoo sync: validate res_case.write_date / case_implementation.write_date in Odoo before enabling watermarks.
 * Netlify: default function timeout often 10s — sync runs in scheduled function with extended config where available.
 */

const RECOMMENDED_SYNC_FUNCTION_TIMEOUT_SEC = 900;
const KEYSET_DEFAULT_LIMIT = 50;
const SEARCH_RESULT_CAP = 20;

/** Columns to probe in Odoo for incremental sync (document only until validated in Odoo SQL). */
const ODOO_INCREMENTAL_CANDIDATES = {
  res_case: ['write_date', 'create_date'],
  case_implementation: ['write_date', 'create_date'],
};

function validateBeneficiariesEnv() {
  const token = process.env.ODOO_TOKEN || process.env.VITE_Odoo_Token;
  const missing = [];
  if (!token) missing.push('ODOO_TOKEN');
  return { ok: missing.length === 0, missing, incrementalCandidates: ODOO_INCREMENTAL_CANDIDATES };
}

module.exports = {
  RECOMMENDED_SYNC_FUNCTION_TIMEOUT_SEC,
  KEYSET_DEFAULT_LIMIT,
  SEARCH_RESULT_CAP,
  ODOO_INCREMENTAL_CANDIDATES,
  validateBeneficiariesEnv,
};
