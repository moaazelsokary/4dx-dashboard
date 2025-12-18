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

async function checkBeneficiariesKPI() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    const kpiName = 'عدد المستفيدين من المشروعات الخيرية';
    console.log(`Checking KPI: "${kpiName}"\n`);

    // Check in main_plan_objectives
    console.log('1. Main Plan Objective:');
    const mainResult = await pool.request()
      .input('kpi', sql.NVarChar, kpiName)
      .query(`
        SELECT id, kpi, annual_target
        FROM main_plan_objectives
        WHERE kpi LIKE '%' + @kpi + '%' OR kpi = @kpi
      `);
    
    if (mainResult.recordset.length === 0) {
      console.log('   ✗ KPI NOT FOUND in main_plan_objectives\n');
    } else {
      mainResult.recordset.forEach(row => {
        console.log(`   ✓ ID: ${row.id}`);
        console.log(`     KPI: "${row.kpi}"`);
        console.log(`     Annual Target: ${row.annual_target.toLocaleString()}\n`);
      });
    }

    // Check all department objectives for this KPI
    console.log('2. Department Objectives (Direct type):');
    const deptResult = await pool.request()
      .input('kpi', sql.NVarChar, kpiName)
      .query(`
        SELECT 
          do.id,
          do.kpi,
          do.main_objective_id,
          do.type,
          do.activity_target,
          do.activity,
          d.name as department_name,
          d.id as department_id
        FROM department_objectives do
        INNER JOIN departments d ON do.department_id = d.id
        WHERE do.kpi = @kpi AND do.type = 'Direct'
        ORDER BY d.name, do.id
      `);
    
    if (deptResult.recordset.length === 0) {
      console.log('   ✗ No Direct department objectives found\n');
    } else {
      console.log(`   ✓ Found ${deptResult.recordset.length} Direct objective(s):\n`);
      let totalSum = 0;
      deptResult.recordset.forEach((row, index) => {
        totalSum += parseFloat(row.activity_target) || 0;
        console.log(`   ${index + 1}. ID: ${row.id}`);
        console.log(`      Department: ${row.department_name} (ID: ${row.department_id})`);
        console.log(`      KPI: "${row.kpi}"`);
        console.log(`      Activity: "${row.activity.substring(0, 60)}..."`);
        console.log(`      Activity Target: ${row.activity_target.toLocaleString()}`);
        console.log(`      main_objective_id: ${row.main_objective_id || 'NULL'}`);
        console.log('');
      });
      console.log(`   Total Sum: ${totalSum.toLocaleString()}`);
    }

    // Check breakdown query result
    console.log('\n3. Breakdown Query Result (as API would return):');
    if (mainResult.recordset.length > 0) {
      const mainId = mainResult.recordset[0].id;
      const breakdownResult = await pool.request()
        .input('kpi', sql.NVarChar, kpiName)
        .input('main_objective_id', sql.Int, mainId)
        .query(`
          SELECT 
            d.id as department_id,
            d.name as department,
            d.code as department_code,
            SUM(do.activity_target) as sum,
            COUNT(do.id) as objective_count
          FROM department_objectives do
          INNER JOIN departments d ON do.department_id = d.id
          WHERE do.type = 'Direct' 
            AND (do.kpi = @kpi OR do.main_objective_id = @main_objective_id)
          GROUP BY d.id, d.name, d.code
          ORDER BY d.name
        `);
      
      console.log(`   Found ${breakdownResult.recordset.length} department(s):\n`);
      let totalBreakdownSum = 0;
      breakdownResult.recordset.forEach(row => {
        const sum = parseFloat(row.sum) || 0;
        totalBreakdownSum += sum;
        console.log(`   - ${row.department}: ${sum.toLocaleString()} (${row.objective_count} objectives)`);
      });
      console.log(`\n   Total Breakdown Sum: ${totalBreakdownSum.toLocaleString()}`);
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

checkBeneficiariesKPI();

