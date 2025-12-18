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

// Get password
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

async function fixKPILinking() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Case Management department ID
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE name = 'Case Management'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Case Management department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Case Management department (ID: ${departmentId})\n`);

    // Get all Case Management department objectives with Direct type that don't have main_objective_id
    console.log('Getting Case Management Direct objectives without main_objective_id...');
    const deptObjsResult = await pool.request()
      .input('department_id', sql.Int, departmentId)
      .query(`
        SELECT id, kpi, main_objective_id
        FROM department_objectives
        WHERE department_id = @department_id 
          AND type = 'Direct'
          AND (main_objective_id IS NULL OR main_objective_id = 0)
        ORDER BY kpi
      `);
    
    console.log(`✓ Found ${deptObjsResult.recordset.length} objectives to link\n`);

    if (deptObjsResult.recordset.length === 0) {
      console.log('No objectives need linking. All are already linked!\n');
      return;
    }

    // Get all main_plan_objectives KPIs
    console.log('Loading main_plan_objectives KPIs...');
    const mainKPIsResult = await pool.request().query(`
      SELECT id, kpi FROM main_plan_objectives
    `);
    
    const kpiMap = new Map();
    mainKPIsResult.recordset.forEach(row => {
      const kpiKey = row.kpi.trim();
      if (!kpiMap.has(kpiKey)) {
        kpiMap.set(kpiKey, row.id);
      }
    });
    console.log(`✓ Loaded ${kpiMap.size} KPIs from main_plan_objectives\n`);

    // Link department objectives to main objectives by KPI name
    console.log('Linking department objectives to main objectives...\n');
    let linked = 0;
    let notFound = 0;
    const notFoundKPIs = [];

    for (const deptObj of deptObjsResult.recordset) {
      const kpiKey = deptObj.kpi.trim();
      const mainId = kpiMap.get(kpiKey);
      
      if (mainId) {
        try {
          await pool.request()
            .input('id', sql.Int, deptObj.id)
            .input('main_objective_id', sql.Int, mainId)
            .query(`
              UPDATE department_objectives
              SET main_objective_id = @main_objective_id,
                  updated_at = GETDATE()
              WHERE id = @id
            `);
          linked++;
          console.log(`  ✓ Linked: "${kpiKey.substring(0, 50)}..." → main_objective_id: ${mainId}`);
        } catch (error) {
          console.error(`  ✗ Error linking "${kpiKey}": ${error.message}`);
        }
      } else {
        notFound++;
        notFoundKPIs.push(kpiKey);
        console.log(`  ⚠ Not found in main_plan_objectives: "${kpiKey}"`);
      }
    }

    console.log(`\n✓ Summary:`);
    console.log(`  - Linked: ${linked}`);
    console.log(`  - Not found: ${notFound}`);
    
    if (notFoundKPIs.length > 0) {
      console.log(`\n⚠ KPIs not found in main_plan_objectives:`);
      notFoundKPIs.forEach(kpi => {
        console.log(`    - "${kpi}"`);
      });
    }

    // Check the specific KPI mentioned by user
    const specificKPI = 'عدد الفرص التطوعية المتاحة سنويا';
    console.log(`\nChecking specific KPI: "${specificKPI}"`);
    const checkResult = await pool.request()
      .input('kpi', sql.NVarChar, specificKPI)
      .input('department_id', sql.Int, departmentId)
      .query(`
        SELECT 
          do.id,
          do.kpi,
          do.main_objective_id,
          do.type,
          mpo.id as main_id,
          mpo.kpi as main_kpi
        FROM department_objectives do
        LEFT JOIN main_plan_objectives mpo ON do.main_objective_id = mpo.id
        WHERE do.kpi = @kpi 
          AND do.department_id = @department_id
          AND do.type = 'Direct'
      `);
    
    if (checkResult.recordset.length > 0) {
      console.log(`  ✓ Found ${checkResult.recordset.length} record(s):`);
      checkResult.recordset.forEach(row => {
        console.log(`    - Department Objective ID: ${row.id}`);
        console.log(`      main_objective_id: ${row.main_objective_id || 'NULL'}`);
        if (row.main_id) {
          console.log(`      ✓ Linked to Main Objective ID: ${row.main_id}`);
        } else {
          console.log(`      ✗ NOT LINKED - This is why it's not showing in breakdown!`);
        }
      });
    } else {
      console.log(`  ✗ KPI not found in Case Management department objectives`);
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

fixKPILinking();

