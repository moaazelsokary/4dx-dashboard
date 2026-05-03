/**
 * Candidate JWT signing secrets — auth-proxy, wig-proxy, and Netlify auth must agree.
 * Optional WIG_JWT_SECRETS=comma,separated,extras for local dev when .env split across files.
 */
function collectJwtSecrets() {
  const extra = process.env.WIG_JWT_SECRETS
    ? String(process.env.WIG_JWT_SECRETS)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const candidates = [
    ...extra,
    process.env.JWT_SECRET,
    process.env.VITE_JWT_SECRET,
    'your-secret-key-change-in-production',
  ];
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    if (c == null || c === '') continue;
    const t = String(c).trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

module.exports = { collectJwtSecrets };
