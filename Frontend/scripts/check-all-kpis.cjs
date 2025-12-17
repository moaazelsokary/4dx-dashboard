require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

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

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER'),
  password: getEnv('PWD') || getEnv('VITE_PWD'),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function checkKPIs() {
  try {
    const pool = await sql.connect(config);
    
    // Check for 5.4.x KPIs
    const result = await pool.request().query(`
      SELECT kpi, objective, target, pillar
      FROM main_plan_objectives 
      WHERE objective LIKE '%5.4%' OR target LIKE '%5.4%' OR kpi LIKE '%5.4%'
      ORDER BY kpi
    `);
    
    console.log(`Found ${result.recordset.length} records with 5.4:`);
    result.recordset.forEach(row => {
      console.log(`KPI: ${row.kpi.substring(0, 50)}...`);
      console.log(`  Objective: ${row.objective.substring(0, 50)}...`);
      console.log(`  Target: ${row.target.substring(0, 50)}...`);
      console.log(`  Pillar: ${row.pillar}`);
      console.log('');
    });
    
    // Check unique pillars
    const pillarResult = await pool.request().query(`
      SELECT DISTINCT pillar FROM main_plan_objectives ORDER BY pillar
    `);
    console.log('\nUnique Pillars:');
    pillarResult.recordset.forEach(row => {
      console.log(`  - ${row.pillar}`);
    });
    
    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkKPIs();

