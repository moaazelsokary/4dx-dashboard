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

function parseSkillsJson(raw) {
  if (raw == null || raw === '') return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseTaskLines(tasks) {
  if (!tasks?.trim()) return [];
  return String(tasks)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function legacyToTaskItems(row) {
  const lines = parseTaskLines(row.tasks);
  const technical = parseSkillsJson(row.technical_skills);
  const soft = parseSkillsJson(row.soft_skills);
  const workload = row.workload_percent != null ? Number(row.workload_percent) : null;

  if (!lines.length) {
    if (workload == null && !technical.length && !soft.length) return null;
    return JSON.stringify([
      {
        task: '—',
        workload_percent: workload,
        technical_skills: technical,
        soft_skills: soft,
      },
    ]);
  }

  return JSON.stringify(
    lines.map((task, index) => ({
      task,
      workload_percent: index === 0 ? workload : null,
      technical_skills: index === 0 ? technical : [],
      soft_skills: index === 0 ? soft : [],
    }))
  );
}

async function main() {
  if (!config.server || !config.database || !config.user || !config.password) {
    throw new Error('Missing DB env (SERVER, DATABASE, UID/DB_USER, DB_PASSWORD)');
  }
  const pool = await sql.connect(config);
  const scriptPath = path.join(__dirname, '../database/cm-meal-user-role-task-items.sql');
  await runSqlScript(pool, scriptPath, 'cm-meal-user-role-task-items.sql');

  const rows = await pool.request().query(`
    SELECT id, tasks, workload_percent, technical_skills, soft_skills, task_items
    FROM dbo.cm_meal_user_role_rows
    WHERE task_items IS NULL OR LTRIM(RTRIM(task_items)) = ''
  `);
  let migrated = 0;
  for (const row of rows.recordset || []) {
    const json = legacyToTaskItems(row);
    if (!json) continue;
    const upd = pool.request();
    upd.input('id', sql.Int, row.id);
    upd.input('task_items', sql.NVarChar(sql.MAX), json);
    await upd.query(`UPDATE dbo.cm_meal_user_role_rows SET task_items = @task_items WHERE id = @id`);
    migrated += 1;
  }
  console.log(`Backfilled task_items on ${migrated} row(s).`);
  await pool.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
