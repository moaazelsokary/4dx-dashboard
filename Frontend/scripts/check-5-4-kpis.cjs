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
    const result = await pool.request().query(`
      SELECT kpi, objective, target, pillar
      FROM main_plan_objectives 
      WHERE kpi LIKE '5.4.%' OR kpi LIKE '%5.4.%'
      ORDER BY kpi
    `);
    
    console.log('KPIs 5.4.x:');
    result.recordset.forEach(row => {
      console.log(`KPI: ${row.kpi}`);
      console.log(`  Objective: ${row.objective}`);
      console.log(`  Target: ${row.target}`);
      console.log(`  Pillar: ${row.pillar}`);
      console.log('');
    });
    
    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkKPIs();

