const sql = require('mssql');
require('dotenv').config({ path: '.env.local' });

const config = {
  user: process.env.UID,
  password: process.env.DB_PASSWORD,
  server: process.env.SERVER,
  database: process.env.DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
};

async function checkKPILinking() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    const kpiName = 'عدد الفرص التطوعية المتاحة سنويا';
    console.log(`Checking KPI: "${kpiName}"\n`);

    // Check in main_plan_objectives
    console.log('1. Checking in main_plan_objectives...');
    const mainResult = await pool.request()
      .input('kpi', sql.NVarChar, kpiName)
      .query(`
        SELECT id, kpi, pillar, objective, target, annual_target
        FROM main_plan_objectives
        WHERE kpi = @kpi
      `);
    
    if (mainResult.recordset.length === 0) {
      console.log('   ✗ KPI NOT FOUND in main_plan_objectives\n');
      
      // Check for similar KPIs
      const similarResult = await pool.request().query(`
        SELECT id, kpi FROM main_plan_objectives
        WHERE kpi LIKE '%فرص%' OR kpi LIKE '%تطوع%'
        ORDER BY kpi
      `);
      console.log('   Similar KPIs found:');
      similarResult.recordset.forEach(row => {
        console.log(`     - ID: ${row.id}, KPI: "${row.kpi}"`);
      });
    } else {
      console.log(`   ✓ Found ${mainResult.recordset.length} record(s) in main_plan_objectives:`);
      mainResult.recordset.forEach(row => {
        console.log(`     - ID: ${row.id}`);
        console.log(`       Pillar: ${row.pillar}`);
        console.log(`       Objective: ${row.objective}`);
        console.log(`       Target: ${row.target}`);
        console.log(`       Annual Target: ${row.annual_target}`);
      });
    }

    // Check in department_objectives for Case Management
    console.log('\n2. Checking in department_objectives (Case Management)...');
    const deptResult = await pool.request()
      .input('kpi', sql.NVarChar, kpiName)
      .query(`
        SELECT 
          do.id,
          do.kpi,
          do.main_objective_id,
          do.type,
          do.activity_target,
          d.name as department_name
        FROM department_objectives do
        INNER JOIN departments d ON do.department_id = d.id
        WHERE do.kpi = @kpi AND d.name = 'Case Management' AND do.type = 'Direct'
      `);
    
    if (deptResult.recordset.length === 0) {
      console.log('   ✗ KPI NOT FOUND in Case Management department objectives\n');
    } else {
      console.log(`   ✓ Found ${deptResult.recordset.length} record(s) in Case Management:`);
      deptResult.recordset.forEach(row => {
        console.log(`     - ID: ${row.id}`);
        console.log(`       KPI: "${row.kpi}"`);
        console.log(`       main_objective_id: ${row.main_objective_id || 'NULL (NOT LINKED!)'}`);
        console.log(`       Type: ${row.type}`);
        console.log(`       Activity Target: ${row.activity_target}`);
      });
    }

    // Check if linking would work
    console.log('\n3. Checking breakdown query...');
    if (mainResult.recordset.length > 0 && deptResult.recordset.length > 0) {
      const mainId = mainResult.recordset[0].id;
      const breakdownResult = await pool.request()
        .input('kpi', sql.NVarChar, kpiName)
        .input('main_objective_id', sql.Int, mainId)
        .query(`
          SELECT 
            d.id as department_id,
            d.name as department,
            do.type,
            SUM(do.activity_target) as sum,
            COUNT(do.id) as objective_count
          FROM department_objectives do
          INNER JOIN departments d ON do.department_id = d.id
          WHERE (do.kpi = @kpi OR do.main_objective_id = @main_objective_id)
            AND do.type = 'Direct'
          GROUP BY d.id, d.name, do.type
        `);
      
      console.log(`   Breakdown query results: ${breakdownResult.recordset.length} department(s)`);
      breakdownResult.recordset.forEach(row => {
        console.log(`     - ${row.department}: ${row.sum} (${row.objective_count} objectives)`);
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

checkKPILinking();

