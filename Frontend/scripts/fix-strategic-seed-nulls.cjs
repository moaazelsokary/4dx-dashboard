/**
 * Rewrites seed-strategic-kpis-from-sheet.sql:
 * - Replaces leading NULL activity with text derived from definition / measurement_aspect / mov.
 * - Fills NULL in meeting_notes, me_e, active, notes with defaults when missing.
 * Seed INSERTs omit kpi (column defaults NULL in DB).
 *
 * Run: node scripts/fix-strategic-seed-nulls.cjs
 */
const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, '..', 'database', 'seed-strategic-kpis-from-sheet.sql');

function unwrapSqlString(tok) {
  if (!tok || tok === 'NULL') return '';
  const s = String(tok).trim();
  if (s.startsWith("N'")) {
    const inner = s.slice(2, -1).replace(/''/g, "'");
    return inner;
  }
  if (s.startsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return '';
}

function wrapN(str, maxLen) {
  let t = String(str || '').replace(/'/g, "''");
  if (t.length > maxLen) t = t.slice(0, Math.max(0, maxLen - 1)) + '\u2026';
  return "N'" + t + "'";
}

/** Parse comma-separated tokens after SELECT; handles N'...' with doubled quotes and newlines. */
function parseSelectTokens(inner) {
  const tokens = [];
  let i = 0;
  const len = inner.length;

  while (i < len) {
    while (i < len && /[\s,]/.test(inner[i])) i++;
    if (i >= len) break;

    if (inner.startsWith('d.id', i) && !/[\w.]/.test(inner[i + 4] || '')) {
      tokens.push('d.id');
      i += 4;
      continue;
    }
    if (inner.startsWith('NULL', i) && !/[\w]/.test(inner[i + 4] || '')) {
      tokens.push('NULL');
      i += 4;
      continue;
    }
    if (inner[i] === 'N' && inner[i + 1] === "'") {
      let j = i + 2;
      while (j < len) {
        if (inner[j] === "'" && inner[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (inner[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      tokens.push(inner.slice(i, j));
      i = j;
      continue;
    }
    // numeric
    let j = i;
    while (j < len && /[\d.]/.test(inner[j])) j++;
    if (j > i) {
      tokens.push(inner.slice(i, j));
      i = j;
      continue;
    }
    throw new Error(`Unexpected char at ${i}: ${JSON.stringify(inner.slice(i, i + 40))}`);
  }
  return tokens;
}

function rebuildValues(tokens) {
  if (tokens.length !== 15) {
    throw new Error(`Expected 15 tokens, got ${tokens.length}: ${tokens.slice(0, 5).join(' | ')}`);
  }

  const def = unwrapSqlString(tokens[8]);
  const meas = unwrapSqlString(tokens[9]);
  const movText = unwrapSqlString(tokens[6]);

  let basis = def.trim() || meas.trim() || movText.trim();
  if (!basis) basis = 'Strategic KPI';

  const activitySql = wrapN(basis, 1000);

  tokens[1] = activitySql;

  const measSql = tokens[9];

  if (tokens[10] === 'NULL') {
    tokens[10] = measSql !== 'NULL' ? measSql : wrapN('\u2014', 500);
  }
  if (tokens[11] === 'NULL') {
    tokens[11] = wrapN('\u2014', 500);
  }
  if (tokens[12] === 'NULL') {
    tokens[12] = wrapN('\u0641\u0639\u0627\u0644', 255); // فعال
  }
  if (tokens[13] === 'NULL') {
    tokens[13] = "N''";
  }

  return tokens;
}

function formatTokens(tokens) {
  const lines = [`  ${tokens[0]},`, `  ${tokens[1]},`];
  for (let k = 2; k < tokens.length; k++) {
    const tail = k === tokens.length - 1 ? '' : ',';
    const t = tokens[k];
    if (t.startsWith('N\'') && t.includes('\n')) {
      lines.push(`  ${t}${tail}`);
    } else {
      lines.push(`  ${t}${tail}`);
    }
  }
  return lines.join('\n');
}

function main() {
  const raw = fs.readFileSync(SEED_PATH, 'utf8');
  const re =
    /(\)\s*SELECT\s*)([\s\S]*?)(\s*FROM\s+departments\s+d\s+WHERE\s+d\.code\s*=\s*N'[^']+'\s*;)/gi;

  let m;
  let lastIndex = 0;
  const out = [];
  let n = 0;

  while ((m = re.exec(raw)) !== null) {
    out.push(raw.slice(lastIndex, m.index));
    const prefix = m[1];
    const inner = m[2];
    const suffix = m[3];

    const tokens = parseSelectTokens(inner);
    const fixed = rebuildValues(tokens);
    out.push(prefix + '\n' + formatTokens(fixed) + '\n' + suffix.trimStart());

    lastIndex = re.lastIndex;
    n++;
  }
  out.push(raw.slice(lastIndex));

  fs.writeFileSync(SEED_PATH, out.join(''), 'utf8');
  console.log('Updated', SEED_PATH, 'blocks:', n);
}

main();
