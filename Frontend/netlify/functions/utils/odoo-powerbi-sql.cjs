/**
 * Execute read-only SQL against Odoo PowerBI endpoint (same contract as sync-pms-odoo).
 * Odoo often returns rows as arrays; column names must be parsed from the SELECT list.
 */

const ODOO_SQL_URL = 'https://lifemakers.odoo.com/powerbi/sql';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse column aliases from the first SELECT in a SQL string (supports UNION — columns match first SELECT).
 */
function parseSelectColumns(sqlQuery) {
  if (!sqlQuery || typeof sqlQuery !== 'string') return [];
  const selectMatch = sqlQuery.match(/SELECT\s+(?:DISTINCT\s+)?([\s\S]*?)\s+FROM/i);
  if (!selectMatch) return [];

  const selectPart = selectMatch[1];
  const columns = [];
  let current = '';
  let depth = 0;

  for (const char of selectPart) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      const name = extractColumnAlias(current.trim());
      if (name) columns.push(name);
      current = '';
      continue;
    }
    current += char;
  }
  const last = extractColumnAlias(current.trim());
  if (last) columns.push(last);
  return columns;
}

function extractColumnAlias(col) {
  if (!col) return '';
  const asParts = col.split(/\s+AS\s+/i);
  if (asParts.length > 1) {
    return asParts[asParts.length - 1].trim().split('.').pop().replace(/["']/g, '');
  }
  return col.trim().split('.').pop().replace(/["']/g, '');
}

/** Add lowercase keys so rowVal finds Service_id / service_id interchangeably. */
function normalizeOdooObject(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const out = { ...row };
  for (const [k, v] of Object.entries(row)) {
    const lower = k.toLowerCase();
    if (!(lower in out)) out[lower] = v;
  }
  return out;
}

/**
 * @param {unknown} result
 * @param {string[]} [columns]
 * @returns {Record<string, unknown>[]}
 */
function normalizeOdooRows(result, columns = []) {
  if (result == null) return [];

  if (!Array.isArray(result)) {
    if (typeof result === 'object' && Array.isArray(result.rows)) {
      const cols =
        (Array.isArray(result.columns) && result.columns.length ? result.columns : columns) || [];
      return normalizeOdooRows(result.rows, cols.map((c) => String(c)));
    }
    return [];
  }

  if (result.length === 0) return [];

  const first = result[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    return result.map((r) => normalizeOdooObject(r));
  }

  if (Array.isArray(first)) {
    const cols = columns || [];
    return result.map((row) => {
      const o = {};
      for (let i = 0; i < cols.length && i < row.length; i++) {
        o[cols[i]] = row[i];
      }
      return normalizeOdooObject(o);
    });
  }

  return [];
}

function formatOdooHttpError(status, statusText, bodyText) {
  const snippet = String(bodyText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  if (snippet.includes('KeyError') || snippet.includes('ir.config_parameter')) {
    return `Odoo server error (${status}): internal session/config failure — retry in a minute or use Queue Odoo sync. Odoo often fails when several SQL requests run at once.`;
  }
  if (snippet) {
    return `Odoo API error (${status} ${statusText}): ${snippet}`;
  }
  return `Odoo API error: ${status} ${statusText}`;
}

function isRetryableOdooError(err, httpStatus) {
  if (httpStatus != null && httpStatus >= 500) return true;
  const msg = String(err?.message || err || '');
  return (
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('abort') ||
    msg.includes('fetch failed') ||
    msg.includes('Odoo server error')
  );
}

async function parseOdooResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(formatOdooHttpError(response.status, response.statusText, text));
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Odoo returned non-JSON (${response.status}). ${String(text).slice(0, 200)}`
    );
  }
  if (data.error) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : data.error.message || data.error.data?.message || JSON.stringify(data.error);
    throw new Error(`Odoo SQL error: ${msg}`);
  }
  return data;
}

/**
 * @param {string} query
 * @param {{ timeoutMs?: number, label?: string, columns?: string[], retries?: number, retryDelayMs?: number }} [options]
 */
async function executeOdooSql(query, options = {}) {
  const timeoutMs = options.timeoutMs ?? 180000;
  const maxAttempts = Math.max(1, options.retries ?? 3);
  const retryDelayMs = options.retryDelayMs ?? 2500;
  const token = process.env.ODOO_TOKEN || process.env.VITE_Odoo_Token;
  if (!token) {
    throw new Error('ODOO_TOKEN or VITE_Odoo_Token environment variable is required');
  }

  const payload = {
    jsonrpc: '2.0',
    method: 'execute',
    params: { token, query },
    id: 1,
  };

  const columns = options.columns ?? parseSelectColumns(query);
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(ODOO_SQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await parseOdooResponse(response);

      if (data.result == null) {
        throw new Error(
          'Odoo SQL returned null result (no rows and no error). Check query syntax, especially active filters and UNION.'
        );
      }

      const rows = normalizeOdooRows(data.result, columns);
      if (rows.length === 0 && options.label) {
        console.warn(`[odoo-sql] ${options.label}: 0 rows`);
      }
      return rows;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;
      const retryable = isRetryableOdooError(err);
      if (attempt < maxAttempts && retryable) {
        const wait = retryDelayMs * attempt;
        console.warn(
          `[odoo-sql] ${options.label || 'query'} attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${wait}ms…`
        );
        await sleep(wait);
        continue;
      }
      if (err.name === 'AbortError') {
        throw new Error(
          `Odoo SQL timed out after ${Math.round(timeoutMs / 1000)}s${options.label ? ` (${options.label})` : ''}`
        );
      }
      throw err;
    }
  }

  throw lastErr || new Error('Odoo SQL failed');
}

/** Run extracts one after another — Odoo often 500s when multiple powerbi/sql calls run in parallel. */
async function executeOdooSqlSequential(jobs) {
  const out = [];
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (i > 0) {
      await sleep(job.gapMs ?? 2000);
    }
    const rows = await executeOdooSql(job.query, job.options);
    out.push(rows);
  }
  return out;
}

function rowVal(row, ...keys) {
  if (row == null) return undefined;
  if (Array.isArray(row)) {
    return undefined;
  }
  if (typeof row !== 'object') return undefined;
  for (const k of keys) {
    if (k in row && row[k] != null) return row[k];
  }
  const lowerMap = {};
  for (const rk of Object.keys(row)) {
    lowerMap[rk.toLowerCase()] = row[rk];
  }
  for (const k of keys) {
    const v = lowerMap[String(k).toLowerCase()];
    if (v != null) return v;
  }
  return undefined;
}

module.exports = {
  executeOdooSql,
  executeOdooSqlSequential,
  rowVal,
  parseSelectColumns,
  normalizeOdooRows,
  normalizeOdooObject,
};
