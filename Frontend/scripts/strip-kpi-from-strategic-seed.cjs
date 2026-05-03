/**
 * Removes kpi column + value from seed-strategic-kpis-from-sheet.sql INSERTs.
 * Run: node scripts/strip-kpi-from-strategic-seed.cjs
 */
const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, '..', 'database', 'seed-strategic-kpis-from-sheet.sql');

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

function formatTokens(tokens) {
  const lines = [`  ${tokens[0]},`, `  ${tokens[1]},`];
  for (let k = 2; k < tokens.length; k++) {
    const tail = k === tokens.length - 1 ? '' : ',';
    lines.push(`  ${tokens[k]}${tail}`);
  }
  return lines.join('\n');
}

function main() {
  let raw = fs.readFileSync(SEED_PATH, 'utf8');
  raw = raw.replace(/\bdepartment_id\s*,\s*kpi\s*,\s*activity\b/g, 'department_id, activity');

  const re =
    /(\)\s*SELECT\s*)([\s\S]*?)(\s*FROM\s+departments\s+d\s+WHERE\s+d\.code\s*=\s*N'[^']+'\s*;)/gi;

  let lastIndex = 0;
  const out = [];
  let n = 0;
  let m;

  while ((m = re.exec(raw)) !== null) {
    out.push(raw.slice(lastIndex, m.index));
    const inner = m[2];
    const suffix = m[3];

    const tokens = parseSelectTokens(inner);
    if (tokens.length === 16) {
      tokens.splice(1, 1);
    }
    if (tokens.length !== 15) {
      throw new Error(`Expected 15 tokens after strip (or 16 before); got ${tokens.length}`);
    }

    out.push(m[1].trimEnd() + '\n' + formatTokens(tokens) + '\n' + suffix.trimStart());
    lastIndex = re.lastIndex;
    n++;
  }
  out.push(raw.slice(lastIndex));

  fs.writeFileSync(SEED_PATH, out.join(''), 'utf8');
  console.log('Stripped kpi from', SEED_PATH, 'blocks:', n);
}

main();
