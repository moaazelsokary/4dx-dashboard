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

async function ensureAllKPIsRASCI() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Get all KPIs
    console.log('Loading all KPIs...');
    const kpiRequest = pool.request();
    const kpiResult = await kpiRequest.query(`
      SELECT DISTINCT kpi 
      FROM main_plan_objectives 
      ORDER BY kpi
    `);
    const kpis = kpiResult.recordset.map(r => r.kpi);
    console.log(`✅ Found ${kpis.length} KPIs\n`);

    // Get all departments
    console.log('Loading all departments...');
    const deptRequest = pool.request();
    const deptResult = await deptRequest.query('SELECT id, name, code FROM departments ORDER BY name');
    const departments = deptResult.recordset;
    console.log(`✅ Found ${departments.length} departments\n`);

    // Ensure all KPI-Department combinations exist
    console.log('Ensuring all KPI-Department combinations exist...');
    let inserted = 0;
    let skipped = 0;

    for (const kpi of kpis) {
      for (const dept of departments) {
        try {
          // Check if record exists
          const checkRequest = pool.request();
          checkRequest.input('kpi', sql.NVarChar, kpi);
          checkRequest.input('department', sql.NVarChar, dept.name);
          const existing = await checkRequest.query(`
            SELECT id FROM rasci_metrics 
            WHERE kpi = @kpi AND department = @department
          `);

          if (existing.recordset.length === 0) {
            // Insert new record with all false values
            const insertRequest = pool.request();
            insertRequest.input('kpi', sql.NVarChar, kpi);
            insertRequest.input('department', sql.NVarChar, dept.name);
            insertRequest.input('responsible', sql.Bit, false);
            insertRequest.input('accountable', sql.Bit, false);
            insertRequest.input('supportive', sql.Bit, false);
            insertRequest.input('consulted', sql.Bit, false);
            insertRequest.input('informed', sql.Bit, false);

            await insertRequest.query(`
              INSERT INTO rasci_metrics (kpi, department, responsible, accountable, supportive, consulted, informed)
              VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed)
            `);

            inserted++;
            if (inserted % 100 === 0) {
              console.log(`  ✅ Inserted ${inserted} records...`);
            }
          } else {
            skipped++;
          }
        } catch (error) {
          if (!error.message.includes('UNIQUE') && !error.message.includes('duplicate')) {
            console.error(`❌ Error for ${kpi} - ${dept.name}:`, error.message);
          }
        }
      }
    }

    console.log(`\n✅ Process completed!`);
    console.log(`   Inserted: ${inserted} new RASCI records`);
    console.log(`   Skipped: ${skipped} existing records`);
    console.log(`   Total combinations: ${kpis.length * departments.length}`);
    
    // Verify final count
    const countRequest = pool.request();
    const countResult = await countRequest.query('SELECT COUNT(*) as total FROM rasci_metrics');
    console.log(`   Total RASCI records in database: ${countResult.recordset[0].total}`);
    
    await pool.close();
  } catch (error) {
    console.error('❌ Process failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

ensureAllKPIsRASCI();

