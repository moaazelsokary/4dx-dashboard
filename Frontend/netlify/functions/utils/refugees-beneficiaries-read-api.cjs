/**
 * Read model queries for refugees beneficiaries enterprise API.
 */

const sql = require('mssql');
const { SEARCH_RESULT_CAP, KEYSET_DEFAULT_LIMIT } = require('./refugees-beneficiaries-phase0.cjs');
const {
  parseBeneficiarySearchQuery,
  escapeLikePattern,
} = require('./refugees-beneficiaries-search.cjs');

const summaryCache = new Map();
const chartsCache = new Map();
const analyticsCache = new Map();
const filteredBundleCache = new Map();
/* Data changes only after a sync (which calls invalidateAnalyticsCache); long TTL = always-warm dashboard. */
const CACHE_TTL_MS = 15 * 60 * 1000;

function cacheGet(map, key) {
  const e = map.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) {
    map.delete(key);
    return null;
  }
  return e.data;
}

function cacheSet(map, key, data) {
  map.set(key, { data, exp: Date.now() + CACHE_TTL_MS });
  if (map.size > 100) {
    const first = map.keys().next().value;
    map.delete(first);
  }
}

function isPrivileged(role) {
  const r = String(role || '').trim();
  return r === 'Admin' || r === 'CEO';
}

function maskId(s) {
  if (s == null || String(s).length < 4) return '****';
  const x = String(s);
  return `****${x.slice(-4)}`;
}

function b64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64UrlDecode(s) {
  if (!s) return '';
  let b = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  return Buffer.from(b, 'base64').toString('utf8');
}

/** Single-row read — every field is materialized at sync time. */
async function getSyncMetadata(pool) {
  const hasKpiCol = await poolHasColumn(pool, 'rb_sync_metadata', 'kpi_services_completed');
  const kpiSel = hasKpiCol ? ', kpi_services_completed' : '';
  const r = await pool.request().query(`
    SELECT TOP (1) last_sync_at, last_duration_ms, rows_cases, rows_services, rows_individuals, last_job_id, updated_at${kpiSel}
    FROM dbo.rb_sync_metadata WHERE id = 1;
  `);
  if (!r.recordset.length) return null;
  const row = r.recordset[0];
  return {
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    lastDurationMs: row.last_duration_ms,
    rowsCases: row.rows_cases,
    rowsServices: row.rows_services,
    rowsIndividuals: row.rows_individuals,
    kpiServicesCompleted: row.kpi_services_completed != null ? Number(row.kpi_services_completed) : null,
    lastJobId: row.last_job_id != null ? Number(row.last_job_id) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

const _colCheckCache = new Map();
async function poolHasColumn(pool, table, column) {
  const key = `${table}.${column}`;
  if (_colCheckCache.has(key)) return _colCheckCache.get(key);
  try {
    const r = await pool
      .request()
      .input('tbl', sql.NVarChar(200), `dbo.${table}`)
      .input('col', sql.NVarChar(200), column)
      .query(`SELECT COL_LENGTH(@tbl, @col) AS has_col;`);
    const has = r.recordset[0]?.has_col != null;
    _colCheckCache.set(key, has);
    return has;
  } catch {
    _colCheckCache.set(key, false);
    return false;
  }
}

async function poolHasTable(pool, table) {
  const key = `tbl:${table}`;
  if (_colCheckCache.has(key)) return _colCheckCache.get(key);
  try {
    const r = await pool
      .request()
      .input('tbl', sql.NVarChar(200), `dbo.${table}`)
      .query(`SELECT OBJECT_ID(@tbl, 'U') AS oid;`);
    const has = r.recordset[0]?.oid != null;
    _colCheckCache.set(key, has);
    return has;
  } catch {
    _colCheckCache.set(key, false);
    return false;
  }
}

/**
 * O(1) summary read — every KPI is precomputed in `rb_sync_metadata` during sync.
 * Falls back to live COUNT only if the warehouse hasn't been resynced after the perf migration.
 */
async function getDashboardSummary(pool) {
  const ck = 'summary:v2';
  const hit = cacheGet(summaryCache, ck);
  if (hit) return hit;

  const meta = await getSyncMetadata(pool);
  let servicesCompleted = meta?.kpiServicesCompleted;
  if (servicesCompleted == null) {
    /* First load after migration / before next sync — compute once then cache for 15 min. */
    const r = await pool.request().query(
      `SELECT COUNT_BIG(*) AS c FROM dbo.rb_case_service WHERE actual_date IS NOT NULL OPTION (MAXDOP 0);`
    );
    servicesCompleted = Number(r.recordset[0]?.c) || 0;
  }
  const payload = {
    ok: true,
    meta,
    kpis: {
      totalIndividuals: Number(meta?.rowsIndividuals) || 0,
      totalServices: Number(meta?.rowsServices) || 0,
      primaryCases: Number(meta?.rowsCases) || 0,
      servicesCompleted,
    },
  };
  cacheSet(summaryCache, ck, payload);
  return payload;
}

/** Tiny payload: ≈24 monthly rows + handful of feedback rows. Read from precomputed analytics. */
async function getDashboardCharts(pool, qs = {}) {
  const filters = parseAnalyticsFilters(qs);
  const filtered = hasActiveFilters(filters);
  const ck = filtered ? `charts:v3:${JSON.stringify(filters)}` : 'charts:v2';
  const hit = cacheGet(chartsCache, ck);
  if (hit) return hit;

  if (filtered) {
    const [fb, dy, kpis] = await Promise.all([
      queryFilteredFeedback(pool, filters),
      queryFilteredMonthly(pool, filters),
      getFilteredKpis(pool, filters),
    ]);
    const payload = { ok: true, fb, dy, kpis, filters };
    cacheSet(chartsCache, ck, payload);
    return payload;
  }

  const hasMonthly = await poolHasTable(pool, 'rb_analytics_monthly');
  const [fb, monthly] = await Promise.all([
    pool.request().query(
      `SELECT TOP (40) feedback AS n, cnt AS v FROM dbo.rb_analytics_feedback ORDER BY v DESC;`
    ),
    hasMonthly
      ? pool.request().query(
          `SELECT TOP (24)
             CONVERT(CHAR(7), month_start, 126) AS m,
             services_created AS c,
             services_completed AS d
           FROM dbo.rb_analytics_monthly
           ORDER BY month_start DESC;`
        )
      : pool.request().query(
          `SELECT TOP (24) m, SUM(c) AS c, SUM(d) AS d FROM (
             SELECT CONVERT(CHAR(7), day, 126) AS m,
                    services_created AS c,
                    services_completed AS d
             FROM dbo.rb_analytics_daily
           ) x GROUP BY m ORDER BY m DESC;`
        ),
  ]);

  /* Chart wants ascending months. */
  const dy = monthly.recordset.slice().reverse().map((r) => ({ m: r.m, c: Number(r.c) || 0, d: Number(r.d) || 0 }));

  const payload = {
    ok: true,
    fb: fb.recordset.map((r) => ({ n: r.n, v: Number(r.v) || 0 })),
    dy,
  };
  cacheSet(chartsCache, ck, payload);
  return payload;
}

const AGE_BUCKET_EXPR = `CASE
  WHEN i.age IS NULL THEN N'Unknown'
  WHEN i.age < 18 THEN N'0–17'
  WHEN i.age < 30 THEN N'18–29'
  WHEN i.age < 45 THEN N'30–44'
  WHEN i.age < 60 THEN N'45–59'
  ELSE N'60+'
END`;

function parseAnalyticsFilters(qs = {}) {
  const pick = (k) => {
    const v = qs[k];
    if (v == null || v === '') return null;
    return String(v);
  };
  return {
    nationality: pick('nationality'),
    gender: pick('gender'),
    age: pick('age') || pick('ageGroup'),
    team: pick('team'),
    category: pick('category'),
    month: pick('month'),
    feedback: pick('feedback'),
  };
}

function hasActiveFilters(filters) {
  return Object.values(filters).some(Boolean);
}

function appendIndividualFilters(filters, req, exclude = {}) {
  const clauses = [];
  if (filters.nationality && !exclude.nationality) {
    req.input('fNat', sql.NVarChar(200), filters.nationality);
    clauses.push(`COALESCE(NULLIF(LTRIM(RTRIM(i.nationality)), N''), N'(blank)') = @fNat`);
  }
  if (filters.gender && !exclude.gender) {
    req.input('fGen', sql.NVarChar(50), filters.gender);
    clauses.push(`COALESCE(NULLIF(LTRIM(RTRIM(i.gender)), N''), N'(blank)') = @fGen`);
  }
  if (filters.age && !exclude.age) {
    req.input('fAge', sql.NVarChar(50), filters.age);
    clauses.push(`(${AGE_BUCKET_EXPR}) = @fAge`);
  }
  if (filters.team && !exclude.team) {
    req.input('fTeam', sql.NVarChar(400), filters.team);
    clauses.push(`EXISTS (
      SELECT 1 FROM dbo.rb_case_service s
      INNER JOIN dbo.rb_case_service_team t ON t.service_id = s.service_id
      WHERE s.res_case_id = i.res_case_id
        AND COALESCE(NULLIF(LTRIM(RTRIM(t.team_name)), N''), N'(no team)') = @fTeam
    )`);
  }
  if (filters.category && !exclude.category) {
    req.input('fCat', sql.NVarChar(400), filters.category);
    clauses.push(`EXISTS (
      SELECT 1 FROM dbo.rb_case_service s
      WHERE s.res_case_id = i.res_case_id
        AND COALESCE(NULLIF(LTRIM(RTRIM(s.category_name)), N''), N'(uncategorized)') = @fCat
    )`);
  }
  if (filters.feedback && !exclude.feedback) {
    req.input('fFb', sql.NVarChar(400), filters.feedback);
    clauses.push(`EXISTS (
      SELECT 1 FROM dbo.rb_case_service s
      WHERE s.res_case_id = i.res_case_id
        AND COALESCE(NULLIF(LTRIM(RTRIM(s.feedback)), N''), N'(blank)') = @fFb
    )`);
  }
  if (filters.month && !exclude.month) {
    req.input('fMonth', sql.Char(7), filters.month);
    clauses.push(`EXISTS (
      SELECT 1 FROM dbo.rb_case_service s
      WHERE s.res_case_id = i.res_case_id
        AND (
          CONVERT(CHAR(7), s.create_date, 126) = @fMonth
          OR CONVERT(CHAR(7), s.actual_date, 126) = @fMonth
        )
    )`);
  }
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

function serviceScopedIndividualExists(filters, req, exclude = {}) {
  const indWhere = appendIndividualFilters(filters, req, exclude);
  return `EXISTS (
    SELECT 1 FROM dbo.rb_case_individual i
    WHERE i.res_case_id = s.res_case_id${indWhere}
  )`;
}

async function getFilteredKpis(pool, filters) {
  const req = pool.request();
  const indWhere = appendIndividualFilters(filters, req);
  const svcExists = `EXISTS (
    SELECT 1 FROM dbo.rb_case_individual i
    WHERE i.res_case_id = s.res_case_id${indWhere}
  )`;
  const r = await req.query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.rb_case_individual i WHERE 1=1${indWhere}) AS individuals,
      (SELECT COUNT(*) FROM dbo.rb_case_individual i WHERE i.receiver_type = N'Case'${indWhere}) AS primary_cases,
      (SELECT COUNT(*) FROM dbo.rb_case_service s WHERE ${svcExists}) AS total_services,
      (SELECT COUNT(*) FROM dbo.rb_case_service s
        WHERE s.actual_date IS NOT NULL AND ${svcExists}) AS services_completed;
  `);
  const row = r.recordset[0] || {};
  return {
    totalIndividuals: Number(row.individuals) || 0,
    primaryCases: Number(row.primary_cases) || 0,
    totalServices: Number(row.total_services) || 0,
    servicesCompleted: Number(row.services_completed) || 0,
  };
}

async function queryFilteredFeedback(pool, filters) {
  const req = pool.request();
  const exists = serviceScopedIndividualExists(filters, req, { feedback: !!filters.feedback });
  const r = await req.query(`
    SELECT TOP (40)
      COALESCE(NULLIF(LTRIM(RTRIM(s.feedback)), N''), N'(blank)') AS n,
      COUNT(*) AS v
    FROM dbo.rb_case_service s
    WHERE ${exists}
    GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(s.feedback)), N''), N'(blank)')
    ORDER BY v DESC;
  `);
  return r.recordset.map((row) => ({ n: row.n, v: Number(row.v) || 0 }));
}

async function queryFilteredMonthly(pool, filters) {
  const req = pool.request();
  const exists = serviceScopedIndividualExists(filters, req, { month: !!filters.month });
  const r = await req.query(`
    WITH filtered AS (
      SELECT s.create_date, s.actual_date
      FROM dbo.rb_case_service s
      WHERE ${exists}
    ),
    c AS (
      SELECT DATEFROMPARTS(YEAR(create_date), MONTH(create_date), 1) AS m, COUNT(*) AS cnt
      FROM filtered
      WHERE create_date IS NOT NULL
      GROUP BY DATEFROMPARTS(YEAR(create_date), MONTH(create_date), 1)
    ),
    x AS (
      SELECT DATEFROMPARTS(YEAR(actual_date), MONTH(actual_date), 1) AS m, COUNT(*) AS cnt
      FROM filtered
      WHERE actual_date IS NOT NULL
      GROUP BY DATEFROMPARTS(YEAR(actual_date), MONTH(actual_date), 1)
    ),
    u AS (SELECT m FROM c UNION SELECT m FROM x)
    SELECT TOP (24)
      CONVERT(CHAR(7), u.m, 126) AS m,
      ISNULL(c.cnt, 0) AS c,
      ISNULL(x.cnt, 0) AS d
    FROM u
    LEFT JOIN c ON c.m = u.m
    LEFT JOIN x ON x.m = u.m
    ORDER BY u.m DESC;
  `);
  return r.recordset.slice().reverse().map((row) => ({
    m: row.m,
    c: Number(row.c) || 0,
    d: Number(row.d) || 0,
  }));
}

async function queryIndividualDimension(pool, dimension, filters) {
  const exclude = { [dimension]: true };
  const req = pool.request();
  const whereExtra = appendIndividualFilters(filters, req, exclude);
  let groupExpr;
  if (dimension === 'nationality') {
    groupExpr = `COALESCE(NULLIF(LTRIM(RTRIM(i.nationality)), N''), N'(blank)')`;
  } else if (dimension === 'gender') {
    groupExpr = `COALESCE(NULLIF(LTRIM(RTRIM(i.gender)), N''), N'(blank)')`;
  } else if (dimension === 'age') {
    groupExpr = AGE_BUCKET_EXPR;
  } else {
    return [];
  }
  const r = await req.query(`
    SELECT TOP (40) ${groupExpr} AS label, COUNT(*) AS cnt
    FROM dbo.rb_case_individual i
    WHERE 1=1${whereExtra}
    GROUP BY ${groupExpr}
    ORDER BY cnt DESC;
  `);
  return r.recordset.map((row) => ({ label: row.label, value: Number(row.cnt) || 0 }));
}

async function queryTeamsFiltered(pool, filters) {
  const req = pool.request();
  const indWhere = appendIndividualFilters(filters, req, { team: true });
  const r = await req.query(`
    SELECT TOP (40)
      COALESCE(NULLIF(LTRIM(RTRIM(t.team_name)), N''), N'(no team)') AS label,
      COUNT(DISTINCT s.res_case_id) AS cases,
      COUNT(*) AS services
    FROM dbo.rb_case_service_team t
    INNER JOIN dbo.rb_case_service s ON s.service_id = t.service_id
    INNER JOIN dbo.rb_case_individual i ON i.res_case_id = s.res_case_id
    WHERE 1=1${indWhere}
    GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(t.team_name)), N''), N'(no team)')
    ORDER BY services DESC;
  `);
  return r.recordset.map((row) => ({
    label: row.label,
    cases: Number(row.cases) || 0,
    services: Number(row.services) || 0,
  }));
}

async function queryCategoriesFiltered(pool, filters) {
  const req = pool.request();
  const indWhere = appendIndividualFilters(filters, req, { category: !!filters.category });
  const r = await req.query(`
    SELECT TOP (50)
      COALESCE(NULLIF(LTRIM(RTRIM(s.category_name)), N''), N'(uncategorized)') AS label,
      COUNT(DISTINCT s.res_case_id) AS cases,
      COUNT(*) AS services
    FROM dbo.rb_case_service s
    WHERE EXISTS (
      SELECT 1 FROM dbo.rb_case_individual i
      WHERE i.res_case_id = s.res_case_id${indWhere}
    )
    GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(s.category_name)), N''), N'(uncategorized)')
    ORDER BY services DESC;
  `);
  return r.recordset.map((row) => ({
    label: row.label,
    cases: Number(row.cases) || 0,
    services: Number(row.services) || 0,
  }));
}

/**
 * Demographics, teams, categories — optional cross-filters via query string.
 */
async function getDashboardAnalytics(pool, qs = {}) {
  const filters = parseAnalyticsFilters(qs);
  const hasFilter = hasActiveFilters(filters);
  const ck = `analytics:v1:${JSON.stringify(filters)}`;
  const hit = cacheGet(analyticsCache, ck);
  if (hit) return hit;

  const hasDemo = await poolHasTable(pool, 'rb_analytics_demographic');
  if (!hasDemo) {
    return { ok: true, nationality: [], gender: [], age: [], teams: [], categories: [] };
  }

  let nationality;
  let gender;
  let age;
  let teams;
  let categories;

  if (hasFilter) {
    [nationality, gender, age, teams, categories] = await Promise.all([
      queryIndividualDimension(pool, 'nationality', filters),
      queryIndividualDimension(pool, 'gender', filters),
      queryIndividualDimension(pool, 'age', filters),
      queryTeamsFiltered(pool, filters),
      queryCategoriesFiltered(pool, filters),
    ]);
  } else {
    const [demo, teamRows, catRows] = await Promise.all([
      pool.request().query(
        `SELECT dimension, label, cnt FROM dbo.rb_analytics_demographic ORDER BY cnt DESC;`
      ),
      pool.request().query(
        `SELECT TOP (40) team_name AS label, case_cnt AS cases, service_cnt AS services
         FROM dbo.rb_analytics_team ORDER BY service_cnt DESC;`
      ),
      pool.request().query(
        `SELECT TOP (50) category_name AS label, case_cnt AS cases, service_cnt AS services
         FROM dbo.rb_analytics_category ORDER BY service_cnt DESC;`
      ),
    ]);
    const byDim = (d) =>
      demo.recordset
        .filter((r) => r.dimension === d)
        .slice(0, 40)
        .map((r) => ({ label: r.label, value: Number(r.cnt) || 0 }));
    nationality = byDim('nationality');
    gender = byDim('gender');
    age = byDim('age');
    teams = teamRows.recordset.map((r) => ({
      label: r.label,
      cases: Number(r.cases) || 0,
      services: Number(r.services) || 0,
    }));
    categories = catRows.recordset.map((r) => ({
      label: r.label,
      cases: Number(r.cases) || 0,
      services: Number(r.services) || 0,
    }));
  }

  const payload = { ok: true, nationality, gender, age, teams, categories, filters };
  cacheSet(analyticsCache, ck, payload);
  return payload;
}

/** One round-trip for cross-filtered analytics + charts (server runs both in parallel). */
async function getDashboardFiltered(pool, qs = {}) {
  const filters = parseAnalyticsFilters(qs);
  const ck = `filtered:v1:${JSON.stringify(filters)}`;
  const hit = cacheGet(filteredBundleCache, ck);
  if (hit) return hit;

  const [analytics, charts] = await Promise.all([
    getDashboardAnalytics(pool, qs),
    getDashboardCharts(pool, qs),
  ]);
  const payload = { ok: true, analytics, charts, filters };
  cacheSet(filteredBundleCache, ck, payload);
  return payload;
}

async function getCategoryProducts(pool, categoryName, mode = 'services', qs = {}) {
  const filters = parseAnalyticsFilters(qs);
  const hasFilter = hasActiveFilters(filters);

  if (hasFilter) {
    const req = pool.request();
    req.input('cat', sql.NVarChar(400), categoryName);
    const indWhere = appendIndividualFilters(filters, req, { category: true });
    const r = await req.query(`
      SELECT TOP (60)
        COALESCE(NULLIF(LTRIM(RTRIM(s.product_name)), N''), N'(unnamed)') AS label,
        COUNT(DISTINCT s.res_case_id) AS cases,
        COUNT(*) AS services
      FROM dbo.rb_case_service s
      WHERE COALESCE(NULLIF(LTRIM(RTRIM(s.category_name)), N''), N'(uncategorized)') = @cat
        AND EXISTS (
          SELECT 1 FROM dbo.rb_case_individual i
          WHERE i.res_case_id = s.res_case_id${indWhere}
        )
      GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(s.product_name)), N''), N'(unnamed)')
      ORDER BY ${mode === 'cases' ? 'cases' : 'services'} DESC;
    `);
    const products = r.recordset.map((row) => ({
      label: row.label,
      cases: Number(row.cases) || 0,
      services: Number(row.services) || 0,
    }));
    return { ok: true, category: categoryName, mode, products };
  }

  const has = await poolHasTable(pool, 'rb_analytics_product');
  if (!has) return { ok: true, products: [] };
  const r = await pool.request().input('cat', sql.NVarChar(400), categoryName).query(`
      SELECT product_name AS label, case_cnt AS cases, service_cnt AS services
      FROM dbo.rb_analytics_product
      WHERE category_name = @cat;
    `);
  const products = r.recordset
    .map((row) => ({
      label: row.label,
      cases: Number(row.cases) || 0,
      services: Number(row.services) || 0,
    }))
    .sort((a, b) => (mode === 'cases' ? b.cases - a.cases : b.services - a.services))
    .slice(0, 60);
  return { ok: true, category: categoryName, mode, products };
}

function invalidateAnalyticsCache() {
  summaryCache.clear();
  chartsCache.clear();
  analyticsCache.clear();
  filteredBundleCache.clear();
  _colCheckCache.clear();
}

async function searchCasesByIdentifier(pool, idNorm) {
  const q = idNorm;
  const r = await pool
    .request()
    .input('q', sql.NVarChar(200), q)
    .input('cap', sql.Int, SEARCH_RESULT_CAP)
    .query(`
      SELECT TOP (@cap)
        s.res_case_id AS id,
        s.res_case_id AS iid,
        s.primary_name AS match_nm,
        N'Case' AS rt,
        s.primary_name AS case_nm,
        c.status AS case_st,
        c.on_going_case AS on_going,
        c.form_type AS match_form,
        c.nationality AS match_nat,
        s.case_code AS cc,
        (
          CASE WHEN s.national_id_norm = @q THEN 1000 ELSE 0 END +
          CASE WHEN s.case_code_norm = @q THEN 950 ELSE 0 END +
          CASE WHEN s.pin_norm = @q THEN 920 ELSE 0 END +
          CASE WHEN s.file_number_norm = @q THEN 900 ELSE 0 END +
          CASE WHEN s.national_id_norm LIKE @q + N'%' AND s.national_id_norm <> @q THEN 300 ELSE 0 END +
          CASE WHEN s.case_code_norm LIKE @q + N'%' AND s.case_code_norm <> @q THEN 280 ELSE 0 END +
          CASE WHEN s.pin_norm LIKE @q + N'%' AND s.pin_norm <> @q THEN 260 ELSE 0 END +
          CASE WHEN s.file_number_norm LIKE @q + N'%' AND s.file_number_norm <> @q THEN 240 ELSE 0 END +
          CASE WHEN (
            s.national_id_norm LIKE N'%' + @q + N'%' OR s.case_code_norm LIKE N'%' + @q + N'%' OR
            s.pin_norm LIKE N'%' + @q + N'%' OR s.file_number_norm LIKE N'%' + @q + N'%'
          ) THEN 40 ELSE 0 END
        ) AS sc
      FROM dbo.rb_case_search s
      LEFT JOIN dbo.rb_case_individual c
        ON c.res_case_id = s.res_case_id AND c.receiver_type = N'Case'
      WHERE
        s.national_id_norm = @q OR s.case_code_norm = @q OR s.pin_norm = @q OR s.file_number_norm = @q OR
        s.national_id_norm LIKE @q + N'%' OR s.case_code_norm LIKE @q + N'%' OR s.pin_norm LIKE @q + N'%' OR s.file_number_norm LIKE @q + N'%' OR
        s.national_id_norm LIKE N'%' + @q + N'%' OR s.case_code_norm LIKE N'%' + @q + N'%' OR s.pin_norm LIKE N'%' + @q + N'%' OR s.file_number_norm LIKE N'%' + @q + N'%'
      ORDER BY sc DESC, s.updated_at DESC;
    `);
  return r.recordset;
}

/** Name search: every token must appear in the same individual's display_name (contains). */
async function searchCasesByName(pool, tokens) {
  const req = pool.request().input('cap', sql.Int, SEARCH_RESULT_CAP);
  const likeClauses = [];
  tokens.forEach((tok, i) => {
    const key = `tok${i}`;
    req.input(key, sql.NVarChar(200), `%${escapeLikePattern(tok)}%`);
    likeClauses.push(`i.display_name LIKE @${key} ESCAPE N'\\'`);
  });
  const r = await req.query(`
      SELECT TOP (@cap)
        i.res_case_id AS id,
        i.individual_id AS iid,
        i.display_name AS match_nm,
        i.receiver_type AS rt,
        c.display_name AS case_nm,
        c.status AS case_st,
        c.on_going_case AS on_going,
        c.case_code AS cc,
        c.form_type AS match_form,
        c.nationality AS match_nat
      FROM dbo.rb_case_individual i
      INNER JOIN dbo.rb_case_individual c
        ON c.res_case_id = i.res_case_id AND c.receiver_type = N'Case'
      WHERE i.display_name IS NOT NULL
        AND ${likeClauses.join(' AND ')}
      ORDER BY i.create_date DESC, i.individual_id DESC;
    `);
  return r.recordset;
}

function mapSearchRows(recordset) {
  return {
    ok: true,
    r: (recordset || []).map((row) => ({
      id: String(row.id),
      iid: row.iid != null ? String(row.iid) : String(row.id),
      mn: row.match_nm,
      cn: row.case_nm,
      rt: row.rt,
      og: row.on_going,
      st: row.case_st,
      cc: row.cc,
      mf: row.match_form,
      nt: row.match_nat,
    })),
  };
}

async function searchCases(pool, rawQ) {
  const parsed = parseBeneficiarySearchQuery(rawQ);
  if (parsed.mode === 'none') {
    return { ok: true, r: [] };
  }
  if (parsed.mode === 'name') {
    const rows = await searchCasesByName(pool, parsed.tokens);
    return mapSearchRows(rows);
  }
  const rows = await searchCasesByIdentifier(pool, parsed.idNorm);
  return mapSearchRows(rows);
}

async function insertAudit(pool, { username, userId, resCaseId, route }) {
  try {
    await pool
      .request()
      .input('u', sql.NVarChar(256), username || null)
      .input('uid', sql.Int, userId != null ? Number(userId) : null)
      .input('cid', sql.BigInt, BigInt(resCaseId))
      .input('rt', sql.NVarChar(120), route)
      .query(`
        INSERT INTO dbo.rb_beneficiary_audit_log (username, user_id, res_case_id, route)
        VALUES (@u, @uid, @cid, @rt);
      `);
  } catch (_) {
    /* non-fatal */
  }
}

async function getCaseProfile(pool, resCaseId, ctx) {
  const id = BigInt(resCaseId);
  const r = await pool.request().input('id', sql.BigInt, id).query(`
    SELECT COUNT(*) AS household FROM dbo.rb_case_individual WHERE res_case_id = @id;
  `);
  const rows = await pool.request().input('id', sql.BigInt, id).query(`
    SELECT individual_id, receiver_type, display_name, case_code, national_id, pin, file_number,
      nationality, other_nationality, gender, age, status, form_type, teams, on_going_case, create_date
    FROM dbo.rb_case_individual WHERE res_case_id = @id ORDER BY CASE WHEN receiver_type = N'Case' THEN 0 ELSE 1 END, individual_id;
  `);
  const priv = isPrivileged(ctx.role);
  const hh = rows.recordset.map((row) => ({
    iid: String(row.individual_id),
    rt: row.receiver_type,
    nm: row.display_name,
    cc: row.case_code,
    nid: priv ? row.national_id : row.national_id ? maskId(row.national_id) : null,
    pin: priv ? row.pin : row.pin ? maskId(row.pin) : null,
    fn: priv ? row.file_number : row.file_number ? maskId(row.file_number) : null,
    nat: row.nationality,
    onat: row.other_nationality,
    gen: row.gender,
    age: row.age,
    ft: row.form_type,
    tm: row.teams,
    og: row.on_going_case,
    cd: row.create_date ? new Date(row.create_date).toISOString() : null,
  }));
  await insertAudit(pool, {
    username: ctx.username,
    userId: ctx.userId,
    resCaseId,
    route: 'profile',
  });
  return {
    ok: true,
    id: String(resCaseId),
    hc: Number(r.recordset[0].household) || 0,
    hh,
  };
}

function decodeSvcCursor(cursor) {
  if (!cursor) return { cd: null, sid: null };
  try {
    const j = JSON.parse(b64UrlDecode(cursor));
    return { cd: j.cd ? new Date(j.cd) : null, sid: j.sid != null ? Number(j.sid) : null };
  } catch {
    return { cd: null, sid: null };
  }
}

function encodeSvcCursor(row) {
  const payload = {
    cd: row.create_date ? new Date(row.create_date).toISOString() : null,
    sid: Number(row.service_id),
  };
  return b64UrlEncode(JSON.stringify(payload));
}

async function getCaseServicesKeyset(pool, resCaseId, cursor, limit) {
  const lim = Math.min(Math.max(Number(limit) || KEYSET_DEFAULT_LIMIT, 1), 100);
  const { cd, sid } = decodeSvcCursor(cursor);
  const id = BigInt(resCaseId);
  const req = pool.request().input('id', sql.BigInt, id).input('lim', sql.Int, lim);
  let where = '';
  if (cd && Number.isFinite(sid)) {
    req.input('cd', sql.DateTime2, cd);
    req.input('sid', sql.BigInt, BigInt(sid));
    where = `AND (s.create_date < @cd OR (s.create_date = @cd AND s.service_id < @sid))`;
  }
  const q = `
    SELECT TOP (@lim)
      s.service_id,
      s.product_name,
      s.category_name,
      s.feedback,
      s.create_date,
      s.actual_date,
      s.expected_date,
      s.service_last_updated_on,
      s.implementation_state,
      s.implementation_receiver,
      s.actual_amount,
      s.quantity,
      (
        SELECT STRING_AGG(CAST(t.team_name AS NVARCHAR(MAX)), N', ')
        WITHIN GROUP (ORDER BY t.team_name)
        FROM dbo.rb_case_service_team t WHERE t.service_id = s.service_id
      ) AS team_names
    FROM dbo.rb_case_service s
    WHERE s.res_case_id = @id ${where}
    ORDER BY s.create_date DESC, s.service_id DESC;
  `;
  const r = await req.query(q);
  const items = r.recordset.map((row) => ({
    sid: String(row.service_id),
    pn: row.product_name,
    cat: row.category_name,
    fb: row.feedback,
    cd: row.create_date ? new Date(row.create_date).toISOString() : null,
    ad: row.actual_date ? new Date(row.actual_date).toISOString() : null,
    ed: row.expected_date ? new Date(row.expected_date).toISOString() : null,
    lu: row.service_last_updated_on ? new Date(row.service_last_updated_on).toISOString() : null,
    rcv: row.implementation_receiver,
    ist: row.implementation_state,
    amt: row.actual_amount != null ? Number(row.actual_amount) : null,
    qty: row.quantity,
    tn: row.team_names ? String(row.team_names).split(',').map((x) => x.trim()).filter(Boolean) : [],
  }));
  const last = r.recordset[r.recordset.length - 1];
  const nextCursor =
    r.recordset.length === lim && last
      ? encodeSvcCursor({ create_date: last.create_date, service_id: last.service_id })
      : null;
  return { ok: true, it: items, nc: nextCursor, hm: r.recordset.length === lim };
}

function decodeTlCursor(cursor) {
  if (!cursor) return { ts: null, tk: null };
  try {
    const j = JSON.parse(b64UrlDecode(cursor));
    return { ts: j.ts ? new Date(j.ts) : null, tk: j.tk != null ? String(j.tk) : null };
  } catch {
    return { ts: null, tk: null };
  }
}

function encodeTlCursor(row) {
  return b64UrlEncode(
    JSON.stringify({ ts: row.ts ? new Date(row.ts).toISOString() : null, tk: String(row.tk) })
  );
}

async function getCaseTimelineKeyset(pool, resCaseId, cursor, limit) {
  const lim = Math.min(Math.max(Number(limit) || KEYSET_DEFAULT_LIMIT, 1), 100);
  const { ts, tk } = decodeTlCursor(cursor);
  const id = BigInt(resCaseId);
  const req = pool.request().input('id', sql.BigInt, id).input('lim', sql.Int, lim);
  let where = '';
  if (ts && tk) {
    req.input('ts', sql.DateTime2, ts);
    req.input('tk', sql.NVarChar(80), tk);
    where = `AND (u.ts < @ts OR (u.ts = @ts AND u.tk < @tk))`;
  }
  const q = `
    SELECT TOP (@lim) u.ts, u.tk, u.typ, u.det
    FROM (
      SELECT i.create_date AS ts,
        (N'I' + CAST(i.individual_id AS NVARCHAR(32))) AS tk,
        N'register' AS typ, i.display_name AS det
      FROM dbo.rb_case_individual i WHERE i.res_case_id = @id
      UNION ALL
      SELECT s.create_date,
        (N'S' + CAST(s.service_id AS NVARCHAR(32)) + N':R'),
        N'service', s.product_name
      FROM dbo.rb_case_service s WHERE s.res_case_id = @id
      UNION ALL
      SELECT s.actual_date,
        (N'S' + CAST(s.service_id AS NVARCHAR(32)) + N':C'),
        N'completed', s.product_name
      FROM dbo.rb_case_service s WHERE s.res_case_id = @id AND s.actual_date IS NOT NULL
    ) u
    WHERE u.ts IS NOT NULL ${where}
    ORDER BY u.ts DESC, u.tk DESC;
  `;
  const r = await req.query(q);
  const items = r.recordset.map((row) => ({
    ts: row.ts ? new Date(row.ts).toISOString() : null,
    ty: row.typ,
    de: row.det,
  }));
  const last = r.recordset[r.recordset.length - 1];
  const nextCursor =
    r.recordset.length === lim && last
      ? encodeTlCursor({ ts: last.ts, tk: last.tk })
      : null;
  return { ok: true, it: items, nc: nextCursor, hm: r.recordset.length === lim };
}

async function getSyncJob(pool, jobId) {
  const r = await pool
    .request()
    .input('id', sql.BigInt, BigInt(jobId))
    .query(
      `SELECT id, status, stage, error_message, duration_ms, rows_individuals, rows_services, created_at, started_at, finished_at FROM dbo.rb_sync_job WHERE id = @id`
    );
  if (!r.recordset.length) return { ok: false, err: 'not_found' };
  const row = r.recordset[0];
  return {
    ok: true,
    j: {
      id: String(row.id),
      st: row.status,
      sg: row.stage,
      er: row.error_message,
      du: row.duration_ms,
      ri: row.rows_individuals,
      rs: row.rows_services,
      ca: row.created_at ? new Date(row.created_at).toISOString() : null,
      sa: row.started_at ? new Date(row.started_at).toISOString() : null,
      fa: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    },
  };
}

module.exports = {
  getDashboardSummary,
  getDashboardCharts,
  getDashboardAnalytics,
  getDashboardFiltered,
  getCategoryProducts,
  searchCases,
  getCaseProfile,
  getCaseServicesKeyset,
  getCaseTimelineKeyset,
  getSyncJob,
  getSyncMetadata,
  invalidateAnalyticsCache,
  insertAudit,
};
