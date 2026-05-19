/**
 * Full read-model sync: Odoo -> truncate rb_* -> OPENJSON bulk load -> search + analytics rebuild.
 */

const sql = require('mssql');
const { executeOdooSql, executeOdooSqlSequential, rowVal } = require('./odoo-powerbi-sql.cjs');
const {
  REFUGEES_CASES_SQL,
  SERVICES_SQL,
  EXECUTION_TEAMS_SQL,
  PROBE_CASES_BASE_SQL,
  PROBE_CASES_ACTIVE_SQL,
  PROBE_SERVICES_ACTIVE_SQL,
} = require('./refugees-beneficiaries-data.cjs');

function probeCount(rows) {
  const n = Number(rowVal(rows?.[0], 'cnt', 'CNT', 'count'));
  return Number.isFinite(n) ? n : null;
}

async function diagnoseEmptyOdooExtract(log) {
  try {
    const [base, active, svc] = await executeOdooSqlSequential([
      { query: PROBE_CASES_BASE_SQL, options: { label: 'probe_cases_base', columns: ['cnt'], timeoutMs: 60000 } },
      { query: PROBE_CASES_ACTIVE_SQL, options: { label: 'probe_cases_active', columns: ['cnt'], timeoutMs: 60000 }, gapMs: 1500 },
      {
        query: PROBE_SERVICES_ACTIVE_SQL,
        options: { label: 'probe_services_active', columns: ['cnt'], timeoutMs: 60000 },
        gapMs: 1500,
      },
    ]);
    const diag = {
      casesNationalityOther: probeCount(base),
      casesActiveTrue: probeCount(active),
      servicesActiveTrue: probeCount(svc),
    };
    log.warn && log.warn('[rb-sync] Odoo extract empty — probe counts', diag);
    return diag;
  } catch (e) {
    log.warn && log.warn('[rb-sync] Odoo probe failed', { message: e.message });
    return null;
  }
}

function normStr(v) {
  if (v == null || v === '') return null;
  return String(v).trim();
}

/** Odoo extracts can repeat the same PK row; keep last occurrence (Map key is always string). */
function dedupeByKey(rows, keyFn) {
  const m = new Map();
  for (const r of rows || []) {
    const raw = keyFn(r);
    if (raw == null || raw === '') continue;
    if (typeof raw === 'number' && !Number.isFinite(raw)) continue;
    const k = typeof raw === 'bigint' ? raw.toString() : String(raw);
    m.set(k, r);
  }
  return [...m.values()];
}

function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    /* Odoo IDs mistaken as dates produced 1970-01-01 00:02:33.xxx — reject small numbers. */
    if (v > 0 && v < 1e11) return null;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() < 1990) return null;
  return d;
}

function mapCaseRowsToIndividuals(cases) {
  const out = [];
  for (const r of cases || []) {
    const individualId = Number(rowVal(r, 'ID', 'id'));
    const resCaseId = Number(rowVal(r, 'res_case_id', 'Res_case_id'));
    if (!Number.isFinite(individualId) || !Number.isFinite(resCaseId)) continue;
    out.push({
      individual_id: individualId,
      res_case_id: resCaseId,
      receiver_type: normStr(rowVal(r, 'Reciever_Type', 'reciever_type')) || 'Case',
      display_name: normStr(rowVal(r, 'Name', 'name')),
      case_code: normStr(rowVal(r, 'Case_Code', 'case_code')),
      national_id: normStr(rowVal(r, 'Case_id', 'case_id')),
      pin: normStr(rowVal(r, 'Personal_Number', 'personal_number')),
      file_number: normStr(rowVal(r, 'File_Number', 'file_number')),
      nationality: normStr(rowVal(r, 'Nationality', 'nationality')),
      other_nationality: normStr(rowVal(r, 'Other_Nationality', 'other_nationality')),
      gender: normStr(rowVal(r, 'Gender', 'gender')),
      age: rowVal(r, 'Age', 'age') != null ? Number(rowVal(r, 'Age', 'age')) : null,
      status: normStr(rowVal(r, 'Status', 'status')),
      form_type: normStr(rowVal(r, 'Form', 'form')),
      teams: normStr(rowVal(r, 'Teams', 'teams')),
      on_going_case: normStr(rowVal(r, 'On_Going_Case', 'on_going_case')),
      create_date: parseDate(rowVal(r, 'Create_Date', 'create_date')),
      odoo_write_date: null,
    });
  }
  return out;
}

function mapServiceRows(services) {
  const out = [];
  for (const r of services || []) {
    const sid = Number(rowVal(r, 'Service_id', 'service_id'));
    const cid = Number(rowVal(r, 'Case_id', 'case_id'));
    if (!Number.isFinite(sid) || !Number.isFinite(cid)) continue;
    out.push({
      service_id: sid,
      res_case_id: cid,
      product_name: normStr(rowVal(r, 'Product', 'product')),
      category_name: normStr(rowVal(r, 'Category', 'category')),
      feedback: normStr(rowVal(r, 'Feedback', 'feedback')),
      create_date: parseDate(rowVal(r, 'Create_date', 'create_date')),
      actual_date: parseDate(rowVal(r, 'Actual_Date', 'actual_date')),
      implementation_state: normStr(rowVal(r, 'Implementation_State', 'implementation_state')),
      implementation_receiver: normStr(rowVal(r, 'Reciever', 'reciever', 'Receiver', 'receiver')),
      expected_date: parseDate(rowVal(r, 'Expected_Date', 'expected_date')),
      service_last_updated_on: parseDate(rowVal(r, 'Service_Last_Updated_On', 'service_last_updated_on')),
      actual_amount:
        rowVal(r, 'Actual_Amount', 'actual_amount') != null
          ? Number(rowVal(r, 'Actual_Amount', 'actual_amount'))
          : null,
      quantity: rowVal(r, 'quantity', 'Quantity') != null ? Number(rowVal(r, 'quantity', 'Quantity')) : null,
      odoo_write_date: null,
    });
  }
  return out;
}

function mapTeamRows(teamRows) {
  const out = [];
  for (const r of teamRows || []) {
    const sid = Number(rowVal(r, 'service_ID', 'service_id', 'SERVICE_ID'));
    const name = normStr(rowVal(r, 'Excusion_Team', 'excusion_team', 'Execution_Team'));
    if (!Number.isFinite(sid) || !name) continue;
    out.push({ service_id: sid, team_name: name });
  }
  return out;
}

async function insertIndividualsOpenJson(transaction, rows) {
  if (!rows.length) return;
  const chunkSize = 2000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const json = JSON.stringify(chunk);
    await new sql.Request(transaction)
      .input('j', sql.NVarChar(sql.MAX), json)
      .query(`
        ;WITH j AS (
          SELECT
            individual_id, res_case_id, receiver_type, display_name, case_code,
            national_id, pin, file_number, nationality, other_nationality, gender, age, status,
            form_type, teams, on_going_case, create_date, odoo_write_date,
            ROW_NUMBER() OVER (
              PARTITION BY individual_id
              ORDER BY create_date DESC, res_case_id DESC
            ) AS rn
          FROM OPENJSON(@j) WITH (
            individual_id BIGINT 'strict $.individual_id',
            res_case_id BIGINT 'strict $.res_case_id',
            receiver_type NVARCHAR(20) 'strict $.receiver_type',
            display_name NVARCHAR(500) '$.display_name',
            case_code NVARCHAR(200) '$.case_code',
            national_id NVARCHAR(200) '$.national_id',
            pin NVARCHAR(200) '$.pin',
            file_number NVARCHAR(200) '$.file_number',
            nationality NVARCHAR(200) '$.nationality',
            other_nationality NVARCHAR(200) '$.other_nationality',
            gender NVARCHAR(50) '$.gender',
            age INT '$.age',
            status NVARCHAR(100) '$.status',
            form_type NVARCHAR(200) '$.form_type',
            teams NVARCHAR(MAX) '$.teams',
            on_going_case NVARCHAR(100) '$.on_going_case',
            create_date DATETIME2 '$.create_date',
            odoo_write_date DATETIME2 '$.odoo_write_date'
          )
        )
        INSERT INTO dbo.rb_case_individual (
          individual_id, res_case_id, receiver_type, display_name, case_code,
          national_id, pin, file_number, nationality, other_nationality, gender, age, status,
          form_type, teams, on_going_case, create_date, odoo_write_date
        )
        SELECT
          individual_id, res_case_id, receiver_type, display_name, case_code,
          national_id, pin, file_number, nationality, other_nationality, gender, age, status,
          form_type, teams, on_going_case, create_date, odoo_write_date
        FROM j WHERE rn = 1;
      `);
  }
}

async function insertServicesOpenJson(transaction, rows) {
  if (!rows.length) return;
  const chunkSize = 2000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const json = JSON.stringify(chunk);
    await new sql.Request(transaction)
      .input('j', sql.NVarChar(sql.MAX), json)
      .query(`
        ;WITH j AS (
          SELECT
            service_id, res_case_id, product_name, category_name, feedback,
            create_date, actual_date, expected_date, service_last_updated_on,
            implementation_state, implementation_receiver, actual_amount, quantity, odoo_write_date,
            ROW_NUMBER() OVER (
              PARTITION BY service_id
              ORDER BY create_date DESC, res_case_id DESC
            ) AS rn
          FROM OPENJSON(@j) WITH (
            service_id BIGINT 'strict $.service_id',
            res_case_id BIGINT 'strict $.res_case_id',
            product_name NVARCHAR(600) '$.product_name',
            category_name NVARCHAR(400) '$.category_name',
            feedback NVARCHAR(120) '$.feedback',
            create_date DATETIME2 '$.create_date',
            actual_date DATETIME2 '$.actual_date',
            expected_date DATETIME2 '$.expected_date',
            service_last_updated_on DATETIME2 '$.service_last_updated_on',
            implementation_state NVARCHAR(120) '$.implementation_state',
            implementation_receiver NVARCHAR(200) '$.implementation_receiver',
            actual_amount DECIMAL(18, 2) '$.actual_amount',
            quantity DECIMAL(18,4) '$.quantity',
            odoo_write_date DATETIME2 '$.odoo_write_date'
          )
        )
        INSERT INTO dbo.rb_case_service (
          service_id, res_case_id, product_name, category_name, feedback,
          create_date, actual_date, expected_date, service_last_updated_on,
          implementation_state, implementation_receiver, actual_amount, quantity, odoo_write_date
        )
        SELECT
          service_id, res_case_id, product_name, category_name, feedback,
          create_date, actual_date, expected_date, service_last_updated_on,
          implementation_state, implementation_receiver, actual_amount, quantity, odoo_write_date
        FROM j WHERE rn = 1;
      `);
  }
}

async function insertTeamsOpenJson(transaction, rows) {
  if (!rows.length) return;
  const chunkSize = 5000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const json = JSON.stringify(chunk);
    await new sql.Request(transaction)
      .input('j', sql.NVarChar(sql.MAX), json)
      .query(`
        ;WITH j AS (
          SELECT
            service_id, team_name,
            ROW_NUMBER() OVER (
              PARTITION BY service_id, team_name
              ORDER BY service_id
            ) AS rn
          FROM OPENJSON(@j) WITH (
            service_id BIGINT 'strict $.service_id',
            team_name NVARCHAR(400) 'strict $.team_name'
          )
        )
        INSERT INTO dbo.rb_case_service_team (service_id, team_name)
        SELECT service_id, team_name
        FROM j WHERE rn = 1;
      `);
  }
}

async function rebuildSearchAndAnalytics(transaction) {
  await new sql.Request(transaction).query(`DELETE FROM dbo.rb_case_search;`);
  await new sql.Request(transaction).query(`
    INSERT INTO dbo.rb_case_search (res_case_id, case_code, primary_name, national_id_norm, pin_norm, file_number_norm, case_code_norm, updated_at)
    SELECT
      i.res_case_id,
      MAX(CASE WHEN i.receiver_type = N'Case' THEN i.case_code END),
      MAX(CASE WHEN i.receiver_type = N'Case' THEN i.display_name END),
      MAX(NULLIF(i.national_id_norm, N'')),
      MAX(NULLIF(i.pin_norm, N'')),
      MAX(NULLIF(i.file_number_norm, N'')),
      MAX(NULLIF(i.case_code_norm, N'')),
      SYSUTCDATETIME()
    FROM dbo.rb_case_individual i
    GROUP BY i.res_case_id;
  `);

  await new sql.Request(transaction).query(`DELETE FROM dbo.rb_analytics_feedback;`);
  await new sql.Request(transaction).query(`
    INSERT INTO dbo.rb_analytics_feedback (feedback, cnt)
    SELECT COALESCE(NULLIF(LTRIM(RTRIM(feedback)), N''), N'(blank)'), COUNT(*)
    FROM dbo.rb_case_service
    GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(feedback)), N''), N'(blank)');
  `);

  await new sql.Request(transaction).query(`DELETE FROM dbo.rb_analytics_daily;`);
  await new sql.Request(transaction).query(`
    WITH c AS (
      SELECT CAST(create_date AS DATE) AS d, COUNT(*) AS cnt
      FROM dbo.rb_case_service
      WHERE create_date IS NOT NULL
      GROUP BY CAST(create_date AS DATE)
    ),
    x AS (
      SELECT CAST(actual_date AS DATE) AS d, COUNT(*) AS cnt
      FROM dbo.rb_case_service
      WHERE actual_date IS NOT NULL
      GROUP BY CAST(actual_date AS DATE)
    ),
    u AS (
      SELECT d FROM c
      UNION
      SELECT d FROM x
    )
    INSERT INTO dbo.rb_analytics_daily (day, services_created, services_completed)
    SELECT u.d, ISNULL(c.cnt, 0), ISNULL(x.cnt, 0)
    FROM u
    LEFT JOIN c ON c.d = u.d
    LEFT JOIN x ON x.d = u.d;
  `);

  /* Tiny precomputed monthly chart (≈24 rows) so /dashboard/charts payload is constant size. */
  await new sql.Request(transaction).query(`
    IF OBJECT_ID('dbo.rb_analytics_monthly', 'U') IS NOT NULL
    BEGIN
      DELETE FROM dbo.rb_analytics_monthly;
      WITH c AS (
        SELECT DATEFROMPARTS(YEAR(create_date), MONTH(create_date), 1) AS m, COUNT(*) AS cnt
        FROM dbo.rb_case_service
        WHERE create_date IS NOT NULL
        GROUP BY DATEFROMPARTS(YEAR(create_date), MONTH(create_date), 1)
      ),
      x AS (
        SELECT DATEFROMPARTS(YEAR(actual_date), MONTH(actual_date), 1) AS m, COUNT(*) AS cnt
        FROM dbo.rb_case_service
        WHERE actual_date IS NOT NULL
        GROUP BY DATEFROMPARTS(YEAR(actual_date), MONTH(actual_date), 1)
      ),
      u AS (SELECT m FROM c UNION SELECT m FROM x)
      INSERT INTO dbo.rb_analytics_monthly (month_start, services_created, services_completed)
      SELECT u.m, ISNULL(c.cnt, 0), ISNULL(x.cnt, 0)
      FROM u
      LEFT JOIN c ON c.m = u.m
      LEFT JOIN x ON x.m = u.m;
    END
  `);

  await new sql.Request(transaction).query(`
    IF OBJECT_ID('dbo.rb_analytics_demographic', 'U') IS NOT NULL
    BEGIN
      DELETE FROM dbo.rb_analytics_demographic;
      INSERT INTO dbo.rb_analytics_demographic (dimension, label, cnt)
      SELECT N'nationality', COALESCE(NULLIF(LTRIM(RTRIM(nationality)), N''), N'(blank)'), COUNT(*)
      FROM dbo.rb_case_individual GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(nationality)), N''), N'(blank)');
      INSERT INTO dbo.rb_analytics_demographic (dimension, label, cnt)
      SELECT N'gender', COALESCE(NULLIF(LTRIM(RTRIM(gender)), N''), N'(blank)'), COUNT(*)
      FROM dbo.rb_case_individual GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(gender)), N''), N'(blank)');
      INSERT INTO dbo.rb_analytics_demographic (dimension, label, cnt)
      SELECT N'age', ag, COUNT(*) FROM (
        SELECT CASE
          WHEN age IS NULL THEN N'Unknown'
          WHEN age < 18 THEN N'0–17'
          WHEN age < 30 THEN N'18–29'
          WHEN age < 45 THEN N'30–44'
          WHEN age < 60 THEN N'45–59'
          ELSE N'60+'
        END AS ag
        FROM dbo.rb_case_individual
      ) x GROUP BY ag;
    END
  `);

  await new sql.Request(transaction).query(`
    IF OBJECT_ID('dbo.rb_analytics_team', 'U') IS NOT NULL
    BEGIN
      DELETE FROM dbo.rb_analytics_team;
      INSERT INTO dbo.rb_analytics_team (team_name, case_cnt, service_cnt)
      SELECT
        COALESCE(NULLIF(LTRIM(RTRIM(t.team_name)), N''), N'(no team)'),
        COUNT(DISTINCT s.res_case_id),
        COUNT(*)
      FROM dbo.rb_case_service_team t
      INNER JOIN dbo.rb_case_service s ON s.service_id = t.service_id
      GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(t.team_name)), N''), N'(no team)');
    END
  `);

  await new sql.Request(transaction).query(`
    IF OBJECT_ID('dbo.rb_analytics_category', 'U') IS NOT NULL
    BEGIN
      DELETE FROM dbo.rb_analytics_category;
      INSERT INTO dbo.rb_analytics_category (category_name, case_cnt, service_cnt)
      SELECT
        COALESCE(NULLIF(LTRIM(RTRIM(category_name)), N''), N'(uncategorized)'),
        COUNT(DISTINCT res_case_id),
        COUNT(*)
      FROM dbo.rb_case_service
      GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(category_name)), N''), N'(uncategorized)');
    END
  `);

  await new sql.Request(transaction).query(`
    IF OBJECT_ID('dbo.rb_analytics_product', 'U') IS NOT NULL
    BEGIN
      DELETE FROM dbo.rb_analytics_product;
      INSERT INTO dbo.rb_analytics_product (category_name, product_name, case_cnt, service_cnt)
      SELECT
        COALESCE(NULLIF(LTRIM(RTRIM(category_name)), N''), N'(uncategorized)'),
        COALESCE(NULLIF(LTRIM(RTRIM(product_name)), N''), N'(blank)'),
        COUNT(DISTINCT res_case_id),
        COUNT(*)
      FROM dbo.rb_case_service
      GROUP BY
        COALESCE(NULLIF(LTRIM(RTRIM(category_name)), N''), N'(uncategorized)'),
        COALESCE(NULLIF(LTRIM(RTRIM(product_name)), N''), N'(blank)');
    END
  `);
}

/** One scan to materialize every KPI; reads at request time become 1-row lookups. */
async function computePrecomputedKpis(transaction) {
  const r = await new sql.Request(transaction).query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.rb_case_service WHERE actual_date IS NOT NULL) AS completed,
      (SELECT COUNT(*) FROM dbo.rb_case_individual WHERE receiver_type = N'Case') AS primary_cases,
      (SELECT COUNT(*) FROM dbo.rb_case_individual) AS individuals;
  `);
  const row = r.recordset[0] || {};
  return {
    servicesCompleted: Number(row.completed) || 0,
    primaryCases: Number(row.primary_cases) || 0,
    individuals: Number(row.individuals) || 0,
  };
}

/**
 * @param {import('mssql').ConnectionPool} pool
 * @param {*} logger
 * @param {{ jobId?: number }} [opts]
 */
async function runReadModelSync(pool, logger, opts = {}) {
  const log = logger && typeof logger.info === 'function' ? logger : console;
  const t0 = Date.now();
  log.info && log.info('[rb-sync] Fetching Odoo…');
  const odooOpts = { timeoutMs: 300000, retries: 3, retryDelayMs: 3000 };
  const [casesRaw, servicesRaw, teamRowsRaw] = await executeOdooSqlSequential([
    { query: REFUGEES_CASES_SQL, options: { ...odooOpts, label: 'refugees_cases' } },
    { query: SERVICES_SQL, options: { ...odooOpts, label: 'refugees_services' }, gapMs: 2500 },
    { query: EXECUTION_TEAMS_SQL, options: { ...odooOpts, label: 'refugees_teams' }, gapMs: 2500 },
  ]);
  log.info &&
    log.info('[rb-sync] Odoo raw row counts', {
      cases: casesRaw.length,
      services: servicesRaw.length,
      teams: teamRowsRaw.length,
    });

  if (casesRaw.length === 0 && servicesRaw.length === 0) {
    const diag = await diagnoseEmptyOdooExtract(log);
    const allowEmpty = String(process.env.RB_SYNC_ALLOW_EMPTY || '').toLowerCase() === '1';
    if (!allowEmpty) {
      const hint =
        diag?.casesNationalityOther != null && diag.casesActiveTrue === 0
          ? `There are ${diag.casesNationalityOther} refugee cases (nationality=other) but 0 with partner.active = 'TRUE'. Check partner archive status or try active = true if Odoo stores booleans.`
          : diag?.casesActiveTrue != null && diag.casesActiveTrue > 0
            ? `Odoo has ${diag.casesActiveTrue} cases with partner.active = 'TRUE' but the full extract returned 0 rows — check UNION filters (partner.active, family.active, case_implementation.active).`
            : 'Odoo returned no case or service rows. Check ODOO_TOKEN, SQL filters (nationality=other, partner.active / family.active / case_implementation.active), and auth-proxy logs.';
      throw new Error(`Odoo extract returned 0 individuals and 0 services. ${hint}`);
    }
  }
  const individualsMapped = mapCaseRowsToIndividuals(casesRaw);
  const servicesMapped = mapServiceRows(servicesRaw);
  const teamsMapped = mapTeamRows(teamRowsRaw);
  const individuals = dedupeByKey(individualsMapped, (r) => String(r.individual_id));
  const services = dedupeByKey(servicesMapped, (r) => String(r.service_id));
  const teams = dedupeByKey(teamsMapped, (r) => `${r.service_id}\t${r.team_name}`);
  if (
    individualsMapped.length !== individuals.length ||
    servicesMapped.length !== services.length ||
    teamsMapped.length !== teams.length
  ) {
    log.warn &&
      log.warn('[rb-sync] Deduped Odoo duplicates before insert', {
        individuals: { before: individualsMapped.length, after: individuals.length },
        services: { before: servicesMapped.length, after: services.length },
        teams: { before: teamsMapped.length, after: teams.length },
      });
  }
  log.info && log.info('[rb-sync] Odoo rows', { individuals: individuals.length, services: services.length, teams: teams.length });

  const { createIsolatedPool } = require('../db.cjs');
  const syncPool = await createIsolatedPool();
  let transaction;
  try {
    transaction = new sql.Transaction(syncPool);
    await transaction.begin();
    await new sql.Request(transaction).query(`
      TRUNCATE TABLE dbo.rb_case_service_team;
      TRUNCATE TABLE dbo.rb_case_service;
      TRUNCATE TABLE dbo.rb_case_individual;
      TRUNCATE TABLE dbo.rb_case_search;
      TRUNCATE TABLE dbo.rb_analytics_feedback;
      TRUNCATE TABLE dbo.rb_analytics_daily;
    `);

    await insertIndividualsOpenJson(transaction, individuals);
    await insertServicesOpenJson(transaction, services);
    await insertTeamsOpenJson(transaction, teams);
    await rebuildSearchAndAnalytics(transaction);
    const kpis = await computePrecomputedKpis(transaction);

    const duration = Date.now() - t0;
    /* Detect kpi_services_completed column availability so this works pre/post-migration. */
    const colCheck = await new sql.Request(transaction).query(
      `SELECT COL_LENGTH('dbo.rb_sync_metadata', 'kpi_services_completed') AS has_col;`
    );
    const hasKpiCol = colCheck.recordset[0]?.has_col != null;
    const kpiAssignMatched = hasKpiCol ? ', kpi_services_completed = @kpi_completed' : '';
    const kpiColInsert = hasKpiCol ? ', kpi_services_completed' : '';
    const kpiValInsert = hasKpiCol ? ', @kpi_completed' : '';
    const mergeReq = new sql.Request(transaction)
      .input('duration', sql.Int, duration)
      .input('rows_cases', sql.Int, kpis.primaryCases)
      .input('rows_ind', sql.Int, kpis.individuals)
      .input('rows_svc', sql.Int, services.length)
      .input('jobId', sql.BigInt, opts.jobId != null ? BigInt(opts.jobId) : null);
    if (hasKpiCol) {
      mergeReq.input('kpi_completed', sql.Int, kpis.servicesCompleted);
    }
    await mergeReq.query(`
      MERGE dbo.rb_sync_metadata AS t
      USING (SELECT 1 AS id) AS s ON t.id = s.id
      WHEN MATCHED THEN UPDATE SET
        last_sync_at = SYSUTCDATETIME(),
        last_duration_ms = @duration,
        rows_individuals = @rows_ind,
        rows_services = @rows_svc,
        rows_cases = @rows_cases,
        last_job_id = @jobId,
        updated_at = SYSUTCDATETIME()
        ${kpiAssignMatched}
      WHEN NOT MATCHED THEN
        INSERT (id, last_sync_at, last_duration_ms, rows_individuals, rows_services, rows_cases, last_job_id, updated_at${kpiColInsert})
        VALUES (1, SYSUTCDATETIME(), @duration, @rows_ind, @rows_svc, @rows_cases, @jobId, SYSUTCDATETIME()${kpiValInsert});
    `);

    if (opts.jobId != null) {
      await new sql.Request(transaction)
        .input('id', sql.BigInt, BigInt(opts.jobId))
        .input('duration', sql.Int, duration)
        .input('rows_ind', sql.Int, individuals.length)
        .input('rows_svc', sql.Int, services.length)
        .query(`
          UPDATE dbo.rb_sync_job SET
            status = N'succeeded',
            stage = N'done',
            finished_at = SYSUTCDATETIME(),
            duration_ms = @duration,
            rows_individuals = @rows_ind,
            rows_services = @rows_svc,
            error_message = NULL
          WHERE id = @id;
        `);
    }

    await transaction.commit();
    log.info && log.info('[rb-sync] Committed', { durationMs: duration });
    try {
      const { invalidateAnalyticsCache } = require('./refugees-beneficiaries-read-api.cjs');
      invalidateAnalyticsCache();
    } catch (_) {
      /* optional */
    }
    return {
      durationMs: duration,
      individuals: kpis.individuals,
      services: services.length,
      primaryCases: kpis.primaryCases,
    };
  } catch (e) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    if (opts.jobId != null) {
      try {
        const { getPool } = require('../db.cjs');
        const jobPool = await getPool();
        const errMsg = String(e.message || e).slice(0, 3900);
        await jobPool
          .request()
          .input('id', sql.BigInt, BigInt(opts.jobId))
          .input('msg', sql.NVarChar(sql.MAX), errMsg)
          .query(`
            UPDATE dbo.rb_sync_job SET status = N'failed', finished_at = SYSUTCDATETIME(), error_message = @msg, stage = N'error'
            WHERE id = @id;
          `);
      } catch (_) {
        /* ignore */
      }
    }
    throw e;
  } finally {
    try {
      await syncPool.close();
    } catch (_) {
      /* ignore */
    }
  }
}

async function enqueueSyncJob(pool, username) {
  const r = await pool
    .request()
    .input('u', sql.NVarChar(256), username || null)
    .query(`
      INSERT INTO dbo.rb_sync_job (status, stage, created_by_username)
      OUTPUT INSERTED.id AS id
      VALUES (N'pending', N'queued', @u);
    `);
  return Number(r.recordset[0].id);
}

async function claimNextPendingJob(pool) {
  const r = await pool.request().query(`
    WITH pick AS (
      SELECT TOP (1) id
      FROM dbo.rb_sync_job WITH (ROWLOCK, READPAST)
      WHERE status = N'pending'
      ORDER BY id ASC
    )
    UPDATE j SET
      status = N'running',
      stage = N'extract',
      started_at = SYSUTCDATETIME()
    OUTPUT inserted.id AS id
    FROM dbo.rb_sync_job j
    INNER JOIN pick ON pick.id = j.id;
  `);
  if (!r.recordset.length) return null;
  return Number(r.recordset[0].id);
}

/**
 * Drain pending queue (up to maxJobs). Scheduled worker + local dev should call this.
 */
async function processPendingBeneficiarySyncJobs(pool, logger, opts = {}) {
  const maxJobs = Math.min(Math.max(Number(opts.maxJobs) || 5, 1), 20);
  const jobs = [];
  for (let n = 0; n < maxJobs; n += 1) {
    const id = await claimNextPendingJob(pool);
    if (id == null) break;
    try {
      await runReadModelSync(pool, logger, { jobId: id });
      jobs.push({ jobId: id, ok: true });
    } catch (e) {
      logger.error && logger.error('[rb-sync] job failed', { jobId: id, message: e.message });
      jobs.push({ jobId: id, ok: false, error: e.message });
    }
  }
  return { processed: jobs.length > 0, jobs };
}

module.exports = {
  runReadModelSync,
  enqueueSyncJob,
  processPendingBeneficiarySyncJobs,
  mapCaseRowsToIndividuals,
};
