require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

// Get environment variables
const getEnv = (key) => {
  const value = process.env[key];
  return value ? value.trim().replace(/^["']|["']$/g, '') : undefined;
};

const serverValue = getEnv('SERVER') || getEnv('VITE_SERVER') || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

let password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD') || getEnv('PWD');
if (password && password.startsWith('/') && password.includes('/')) {
  password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD');
}
if (password && password.includes('%')) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {}
}
if (password && ((password.startsWith('"') && password.endsWith('"')) ||
    (password.startsWith("'") && password.endsWith("'")))) {
  password = password.slice(1, -1);
}

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER'),
  password: password,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function checkVolunteerKPI() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Search for volunteer-related KPIs in main_plan_objectives
    console.log('Searching for volunteer-related KPIs in main_plan_objectives...\n');
    const result = await pool.request().query(`
      SELECT id, kpi, pillar, objective, target, annual_target
      FROM main_plan_objectives
      WHERE kpi LIKE '%فرص%' 
         OR kpi LIKE '%تطوع%'
         OR kpi LIKE '%متطوع%'
      ORDER BY kpi
    `);
    
    if (result.recordset.length === 0) {
      console.log('✗ No volunteer-related KPIs found in main_plan_objectives\n');
    } else {
      console.log(`✓ Found ${result.recordset.length} volunteer-related KPI(s):\n`);
      result.recordset.forEach(row => {
        console.log(`  ID: ${row.id}`);
        console.log(`  KPI: "${row.kpi}"`);
        console.log(`  Pillar: ${row.pillar}`);
        console.log(`  Objective: ${row.objective}`);
        console.log(`  Target: ${row.target}`);
        console.log(`  Annual Target: ${row.annual_target}`);
        console.log('');
      });
    }

    // Check exact match
    const exactKPI = 'عدد الفرص التطوعية المتاحة سنويا';
    console.log(`\nChecking for exact match: "${exactKPI}"`);
    const exactResult = await pool.request()
      .input('kpi', sql.NVarChar, exactKPI)
      .query(`
        SELECT id, kpi, pillar, objective, target, annual_target
        FROM main_plan_objectives
        WHERE kpi = @kpi
      `);
    
    if (exactResult.recordset.length === 0) {
      console.log('  ✗ Exact match NOT FOUND in main_plan_objectives');
      console.log('  This KPI needs to be added to main_plan_objectives for it to appear in the breakdown!\n');
    } else {
      console.log(`  ✓ Found exact match:`);
      exactResult.recordset.forEach(row => {
        console.log(`    ID: ${row.id}`);
        console.log(`    Pillar: ${row.pillar}`);
        console.log(`    Objective: ${row.objective}`);
        console.log(`    Target: ${row.target}`);
        console.log(`    Annual Target: ${row.annual_target}`);
      });
    }

  } catch (error) {
    console.error('✗ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n✓ Database connection closed');
    }
  }
}

checkVolunteerKPI();

