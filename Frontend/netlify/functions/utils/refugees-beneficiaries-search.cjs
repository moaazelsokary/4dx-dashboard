/**
 * Case story search rules: name = contains, min 2 words; single token only for IDs/codes.
 */

const MAX_QUERY_LEN = 80;
const MAX_NAME_TOKENS = 8;
const MIN_NAME_TOKENS = 2;

/** Split on any whitespace (Latin, Arabic separators, NBSP). */
function tokenizeSearchQuery(raw) {
  return String(raw || '')
    .trim()
    .split(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** True when a lone token looks like national ID, PIN, file no., or case code — not a single given name. */
function looksLikeIdentifier(token) {
  const s = String(token || '').trim();
  if (!s || s.length > MAX_QUERY_LEN) return false;
  if (/\d/.test(s)) return true;
  if (/^[A-Za-z0-9][A-Za-z0-9\-_.\/]*$/.test(s) && s.length >= 3) return true;
  return false;
}

/**
 * @param {string} rawQ
 * @returns {{ mode: 'none' | 'id' | 'name'; tokens: string[]; idNorm?: string }}
 */
function parseBeneficiarySearchQuery(rawQ) {
  const trimmed = String(rawQ || '').trim();
  if (!trimmed || trimmed.length > MAX_QUERY_LEN) {
    return { mode: 'none', tokens: [] };
  }
  const tokens = tokenizeSearchQuery(trimmed);
  if (tokens.length >= MIN_NAME_TOKENS) {
    return { mode: 'name', tokens: tokens.slice(0, MAX_NAME_TOKENS) };
  }
  if (tokens.length === 1 && looksLikeIdentifier(tokens[0])) {
    return { mode: 'id', tokens, idNorm: tokens[0].toUpperCase() };
  }
  return { mode: 'none', tokens };
}

function escapeLikePattern(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[');
}

module.exports = {
  MIN_NAME_TOKENS,
  MAX_NAME_TOKENS,
  tokenizeSearchQuery,
  looksLikeIdentifier,
  parseBeneficiarySearchQuery,
  escapeLikePattern,
};
