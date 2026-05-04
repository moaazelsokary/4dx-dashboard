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
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function runSqlScript(pool, scriptPath, scriptName) {
  console.log(`\nRunning ${scriptName}...`);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }
  const sqlScript = fs.readFileSync(scriptPath, 'utf8');
  const batches = sqlScript
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await pool.request().query(batch);
    console.log(`  Batch ${i + 1}/${batches.length} OK`);
  }
  console.log(`  ${scriptName} completed`);
}

async function main() {
  if (!config.server || !config.database || !config.user || !config.password) {
    throw new Error('Missing DB env (SERVER, DATABASE, UID/DB_USER, DB_PASSWORD)');
  }
  console.log('Connecting...', config.server, config.database);
  const pool = await sql.connect(config);
  const scriptPath = path.join(__dirname, '../database/strategic-topic-kpi-rows.sql');
  await runSqlScript(pool, scriptPath, 'strategic-topic-kpi-rows.sql');
  await pool.close();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
