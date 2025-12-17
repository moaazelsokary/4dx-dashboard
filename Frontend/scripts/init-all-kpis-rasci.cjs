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

async function initAllKPIsRASCI() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Step 1: Clear all existing RASCI data
    console.log('Step 1: Clearing all existing RASCI data...');
    await pool.request().query('DELETE FROM rasci_metrics');
    console.log('✅ Cleared all existing RASCI data\n');

    // Step 2: Get all KPIs from main_plan_objectives (ordered by target number)
    console.log('Step 2: Loading all KPIs from database...');
    const kpiRequest = pool.request();
    const kpiResult = await kpiRequest.query(`
      SELECT DISTINCT kpi 
      FROM main_plan_objectives 
      ORDER BY kpi
    `);
    const kpis = kpiResult.recordset.map(r => r.kpi);
    console.log(`✅ Found ${kpis.length} KPIs\n`);

    // Step 3: Get all departments
    console.log('Step 3: Loading all departments...');
    const deptRequest = pool.request();
    const deptResult = await deptRequest.query('SELECT id, name, code FROM departments ORDER BY name');
    const departments = deptResult.recordset;
    console.log(`✅ Found ${departments.length} departments\n`);

    // Step 4: Insert all KPI-Department combinations with all false values
    console.log('Step 4: Creating RASCI entries for all KPI-Department combinations...');
    console.log(`   Total combinations: ${kpis.length * departments.length}\n`);

    let inserted = 0;
    let errors = 0;

    // Use batch insert for better performance
    const batchSize = 100;
    for (let i = 0; i < kpis.length; i += batchSize) {
      const kpiBatch = kpis.slice(i, i + batchSize);
      
      for (const kpi of kpiBatch) {
        for (const dept of departments) {
          try {
            const request = pool.request();
            request.input('kpi', sql.NVarChar, kpi);
            request.input('department', sql.NVarChar, dept.name);
            request.input('responsible', sql.Bit, false);
            request.input('accountable', sql.Bit, false);
            request.input('supportive', sql.Bit, false);
            request.input('consulted', sql.Bit, false);
            request.input('informed', sql.Bit, false);

            await request.query(`
              INSERT INTO rasci_metrics (kpi, department, responsible, accountable, supportive, consulted, informed)
              VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed)
            `);

            inserted++;
            if (inserted % 500 === 0) {
              console.log(`  ✅ Inserted ${inserted} records...`);
            }
          } catch (error) {
            if (!error.message.includes('UNIQUE') && !error.message.includes('duplicate')) {
              console.error(`❌ Error for ${kpi.substring(0, 30)}... - ${dept.name}:`, error.message);
              errors++;
            }
          }
        }
      }
    }

    console.log(`\n✅ Process completed!`);
    console.log(`   Inserted: ${inserted} RASCI records`);
    if (errors > 0) {
      console.log(`   Errors: ${errors}`);
    }
    
    // Step 5: Verify final count
    console.log('\nStep 5: Verifying data...');
    const countRequest = pool.request();
    const countResult = await countRequest.query('SELECT COUNT(*) as total FROM rasci_metrics');
    const totalRecords = countResult.recordset[0].total;
    const expectedRecords = kpis.length * departments.length;
    
    console.log(`   Total RASCI records in database: ${totalRecords}`);
    console.log(`   Expected records: ${expectedRecords}`);
    
    if (totalRecords === expectedRecords) {
      console.log('   ✅ All KPIs have entries for all departments!');
    } else {
      console.log(`   ⚠️  Mismatch: ${expectedRecords - totalRecords} records missing`);
    }

    // Show breakdown
    const kpiCountRequest = pool.request();
    const kpiCountResult = await kpiCountRequest.query('SELECT COUNT(DISTINCT kpi) as total FROM rasci_metrics');
    const deptCountRequest = pool.request();
    const deptCountResult = await deptCountRequest.query('SELECT COUNT(DISTINCT department) as total FROM rasci_metrics');
    
    console.log(`\n   KPIs with RASCI entries: ${kpiCountResult.recordset[0].total}`);
    console.log(`   Departments with RASCI entries: ${deptCountResult.recordset[0].total}`);
    
    await pool.close();
  } catch (error) {
    console.error('❌ Process failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

initAllKPIsRASCI();

