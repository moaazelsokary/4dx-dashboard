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

async function checkKPIRASCI() {
  try {
    const pool = await sql.connect(config);
    
    // Check a specific KPI that should have Finance, Procurement, IT assignments
    const kpi = 'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا';
    const request = pool.request();
    request.input('kpi', sql.NVarChar, kpi);
    const result = await request.query(`
      SELECT department, 
        CASE WHEN responsible = 1 THEN 'R' ELSE '' END +
        CASE WHEN accountable = 1 THEN 'A' ELSE '' END +
        CASE WHEN supportive = 1 THEN 'S' ELSE '' END +
        CASE WHEN consulted = 1 THEN 'C' ELSE '' END +
        CASE WHEN informed = 1 THEN 'I' ELSE '' END as rasci
      FROM rasci_metrics
      WHERE kpi = @kpi
      ORDER BY department
    `);
    
    console.log(`RASCI assignments for: "${kpi}"`);
    console.log(`Found ${result.recordset.length} departments:\n`);
    result.recordset.forEach(row => {
      console.log(`  - ${row.department}: ${row.rasci || '(none)'}`);
    });
    
    // Check all departments
    const deptRequest = pool.request();
    const deptResult = await deptRequest.query(`
      SELECT DISTINCT department 
      FROM rasci_metrics 
      ORDER BY department
    `);
    
    console.log(`\n\nAll departments with RASCI assignments (${deptResult.recordset.length}):`);
    deptResult.recordset.forEach(row => {
      console.log(`  - ${row.department}`);
    });
    
    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkKPIRASCI();

