require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

function getEnv(key) {
  const value = process.env[key];
  return value ? String(value).trim().replace(/^["']|["']$/g, '') : undefined;
}

const serverValue = getEnv('SERVER') || getEnv('VITE_SERVER') || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map((s) => s.trim());
  port = parseInt(port, 10) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

const config = {
  server,
  port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER') || getEnv('DB_USER'),
  password: getEnv('DB_PASSWORD') || getEnv('VITE_PWD') || getEnv('PWD'),
  options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
};

async function runSqlScript(pool, scriptPath, scriptName) {
  console.log(`\nRunning ${scriptName}...`);
  const sqlScript = fs.readFileSync(scriptPath, 'utf8');
  const batches = sqlScript.split(/^\s*GO\s*$/gim).map((b) => b.trim()).filter(Boolean);
  for (let i = 0; i < batches.length; i++) {
    await pool.request().query(batches[i]);
    console.log(`  Batch ${i + 1}/${batches.length} OK`);
  }
}

function legacyToItems(row) {
  const kpi = row.kpi != null ? String(row.kpi).trim() : '';
  if (!kpi) return null;
  return JSON.stringify([
    {
      kpi,
      target: row.target_value != null ? Number(row.target_value) : null,
      actual: row.actual_value != null ? Number(row.actual_value) : null,
      notes: row.notes != null ? String(row.notes).trim() : null,
    },
  ]);
}

async function main() {
  if (!config.server || !config.database || !config.user || !config.password) {
    throw new Error('Missing DB env (SERVER, DATABASE, UID/DB_USER, DB_PASSWORD)');
  }
  const pool = await sql.connect(config);
  const scriptPath = path.join(__dirname, '../database/cm-meal-user-kpi-kpi-items.sql');
  await runSqlScript(pool, scriptPath, 'cm-meal-user-kpi-kpi-items.sql');

  const rows = await pool.request().query(`
    SELECT id, kpi, target_value, actual_value, notes, kpi_items
    FROM dbo.cm_meal_user_kpi_rows
    WHERE kpi_items IS NULL OR LTRIM(RTRIM(kpi_items)) = ''
  `);
  let migrated = 0;
  for (const row of rows.recordset || []) {
    const json = legacyToItems(row);
    if (!json) continue;
    const upd = pool.request();
    upd.input('id', sql.Int, row.id);
    upd.input('kpi_items', sql.NVarChar(sql.MAX), json);
    await upd.query(`UPDATE dbo.cm_meal_user_kpi_rows SET kpi_items = @kpi_items WHERE id = @id`);
    migrated += 1;
  }
  console.log(`Backfilled kpi_items on ${migrated} row(s).`);
  await pool.close();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
