require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

// Parse server and port
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

async function verifyRASCI() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Get total count
    const countRequest = pool.request();
    const countResult = await countRequest.query('SELECT COUNT(*) as total FROM rasci_metrics');
    console.log(`Total RASCI records: ${countResult.recordset[0].total}\n`);

    // Get count by KPI
    const kpiRequest = pool.request();
    const kpiResult = await kpiRequest.query(`
      SELECT kpi, COUNT(*) as dept_count
      FROM rasci_metrics
      GROUP BY kpi
      ORDER BY kpi
    `);
    
    console.log(`KPIs with RASCI assignments: ${kpiResult.recordset.length}`);
    console.log('\nBreakdown by KPI:');
    kpiResult.recordset.forEach(row => {
      console.log(`  - ${row.kpi.substring(0, 60)}${row.kpi.length > 60 ? '...' : ''}: ${row.dept_count} departments`);
    });

    // Get count by department
    const deptRequest = pool.request();
    const deptResult = await deptRequest.query(`
      SELECT department, COUNT(*) as kpi_count
      FROM rasci_metrics
      GROUP BY department
      ORDER BY department
    `);
    
    console.log(`\nBreakdown by Department:`);
    deptResult.recordset.forEach(row => {
      console.log(`  - ${row.department}: ${row.kpi_count} KPIs`);
    });

    // Sample some records
    console.log('\n\nSample RASCI records (first 10):');
    const sampleRequest = pool.request();
    const sampleResult = await sampleRequest.query(`
      SELECT TOP 10 
        kpi, 
        department,
        CASE WHEN responsible = 1 THEN 'R' ELSE '' END +
        CASE WHEN accountable = 1 THEN 'A' ELSE '' END +
        CASE WHEN supportive = 1 THEN 'S' ELSE '' END +
        CASE WHEN consulted = 1 THEN 'C' ELSE '' END +
        CASE WHEN informed = 1 THEN 'I' ELSE '' END as rasci
      FROM rasci_metrics
      ORDER BY kpi, department
    `);
    
    sampleResult.recordset.forEach(row => {
      console.log(`  KPI: ${row.kpi.substring(0, 50)}...`);
      console.log(`    Department: ${row.department}, RASCI: ${row.rasci || '(none)'}`);
    });

    // Check specific KPIs from the data
    console.log('\n\nChecking specific KPIs from your data:');
    const testKPIs = [
      'عدد المتطوعين المسجلين تراكميا',
      'عدد المستفيدين المباشرين من الفرص التطوعية',
      'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)',
      'عدد الجهات المانحة سنويًا (محلية – إقليمية – دولية )',
    ];

    for (const kpi of testKPIs) {
      const checkRequest = pool.request();
      checkRequest.input('kpi', sql.NVarChar, kpi);
      const checkResult = await checkRequest.query(`
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
      
      console.log(`\n  "${kpi}":`);
      if (checkResult.recordset.length === 0) {
        console.log(`    ❌ NOT FOUND in database`);
      } else {
        console.log(`    ✅ Found ${checkResult.recordset.length} department assignments:`);
        checkResult.recordset.forEach(row => {
          console.log(`      - ${row.department}: ${row.rasci || '(none)'}`);
        });
      }
    }

    await pool.close();
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyRASCI();

