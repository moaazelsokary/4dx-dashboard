/** Mirrors netlify/functions/utils/refugees-beneficiaries-search.cjs for UI gating. */

const MIN_NAME_TOKENS = 2;

export function tokenizeSearchQuery(raw: string): string[] {
  return String(raw || '')
    .trim()
    .split(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function looksLikeIdentifier(token: string): boolean {
  const s = String(token || '').trim();
  if (!s) return false;
  if (/\d/.test(s)) return true;
  if (/^[A-Za-z0-9][A-Za-z0-9\-_./]*$/.test(s) && s.length >= 3) return true;
  return false;
}

export type BeneficiarySearchMode = 'none' | 'id' | 'name';

export function parseBeneficiarySearchQuery(rawQ: string): {
  mode: BeneficiarySearchMode;
  tokens: string[];
} {
  const trimmed = String(rawQ || '').trim();
  if (!trimmed) return { mode: 'none', tokens: [] };
  const tokens = tokenizeSearchQuery(trimmed);
  if (tokens.length >= MIN_NAME_TOKENS) return { mode: 'name', tokens };
  if (tokens.length === 1 && looksLikeIdentifier(tokens[0])) return { mode: 'id', tokens };
  return { mode: 'none', tokens };
}

export function canRunBeneficiarySearch(rawQ: string): boolean {
  return parseBeneficiarySearchQuery(rawQ).mode !== 'none';
}

export function beneficiarySearchHint(rawQ: string): string {
  const { mode, tokens } = parseBeneficiarySearchQuery(rawQ);
  if (!rawQ.trim()) {
    return 'Search by full name (at least two words), or by national ID, PIN, file number, or case code.';
  }
  if (mode === 'none' && tokens.length === 1) {
    return 'Enter at least two name words (e.g. محمد محمود). Single names are not searched.';
  }
  if (mode === 'none') return 'Enter a valid search.';
  return '';
}
