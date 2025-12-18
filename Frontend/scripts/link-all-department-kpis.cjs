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

// Helper function to normalize KPI name (remove numeric prefixes like "1.3.1 ")
function normalizeKPI(kpi) {
  if (!kpi) return '';
  // Remove leading numbers and dots/spaces (e.g., "1.3.1 عدد الفرص..." -> "عدد الفرص...")
  return kpi.replace(/^\d+(\.\d+)*\s*/, '').trim();
}

async function linkAllDepartmentKPIs() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get all department objectives without main_objective_id (or with NULL/0)
    console.log('Getting all department objectives without main_objective_id...');
    const deptObjsResult = await pool.request().query(`
      SELECT 
        do.id,
        do.kpi,
        do.main_objective_id,
        do.type,
        d.name as department_name,
        d.id as department_id
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE do.main_objective_id IS NULL OR do.main_objective_id = 0
      ORDER BY d.name, do.kpi
    `);
    
    console.log(`✓ Found ${deptObjsResult.recordset.length} department objectives to link\n`);

    if (deptObjsResult.recordset.length === 0) {
      console.log('No objectives need linking. All are already linked!\n');
      return;
    }

    // Get all main_plan_objectives KPIs
    console.log('Loading main_plan_objectives KPIs...');
    const mainKPIsResult = await pool.request().query(`
      SELECT id, kpi FROM main_plan_objectives ORDER BY kpi
    `);
    
    // Create maps with both original and normalized KPI names
    const kpiMap = new Map(); // Exact match
    const kpiMapNormalized = new Map(); // Normalized match (without numeric prefix)
    
    mainKPIsResult.recordset.forEach(row => {
      const originalKPI = row.kpi.trim();
      const normalizedKPI = normalizeKPI(originalKPI);
      
      // Store exact match
      if (!kpiMap.has(originalKPI)) {
        kpiMap.set(originalKPI, row.id);
      }
      // Store normalized match (use first match if multiple exist)
      if (!kpiMapNormalized.has(normalizedKPI)) {
        kpiMapNormalized.set(normalizedKPI, row.id);
      }
    });
    
    console.log(`✓ Loaded ${mainKPIsResult.recordset.length} KPIs from main_plan_objectives\n`);

    // Group by department for reporting
    const departmentStats = new Map();
    
    // Link department objectives to main objectives using flexible matching
    console.log('Linking department objectives to main objectives (flexible matching)...\n');
    let linked = 0;
    let notFound = 0;
    const notFoundKPIs = new Set();
    const linkedKPIs = new Map(); // Track which KPIs were linked

    for (const deptObj of deptObjsResult.recordset) {
      const deptKPI = deptObj.kpi.trim();
      const normalizedDeptKPI = normalizeKPI(deptKPI);
      
      // Try exact match first
      let mainId = kpiMap.get(deptKPI);
      
      // If not found, try normalized match
      if (!mainId) {
        mainId = kpiMapNormalized.get(normalizedDeptKPI);
      }
      
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
          
          // Track statistics
          const deptName = deptObj.department_name;
          if (!departmentStats.has(deptName)) {
            departmentStats.set(deptName, { linked: 0, notFound: 0 });
          }
          departmentStats.get(deptName).linked++;
          
          // Track linked KPIs
          if (!linkedKPIs.has(deptKPI)) {
            const mainKPI = mainKPIsResult.recordset.find(r => r.id === mainId)?.kpi || 'unknown';
            linkedKPIs.set(deptKPI, { mainId, mainKPI });
          }
        } catch (error) {
          console.error(`  ✗ Error linking ID ${deptObj.id} ("${deptKPI.substring(0, 50)}..."): ${error.message}`);
        }
      } else {
        notFound++;
        notFoundKPIs.add(deptKPI);
        
        // Track statistics
        const deptName = deptObj.department_name;
        if (!departmentStats.has(deptName)) {
          departmentStats.set(deptName, { linked: 0, notFound: 0 });
        }
        departmentStats.get(deptName).notFound++;
      }
    }

    // Print summary by department
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY BY DEPARTMENT:');
    console.log('='.repeat(80));
    const sortedDepts = Array.from(departmentStats.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    sortedDepts.forEach(([deptName, stats]) => {
      console.log(`\n${deptName}:`);
      console.log(`  ✓ Linked: ${stats.linked}`);
      console.log(`  ⚠ Not found: ${stats.notFound}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('OVERALL SUMMARY:');
    console.log('='.repeat(80));
    console.log(`  ✓ Total linked: ${linked}`);
    console.log(`  ⚠ Total not found: ${notFound}`);
    
    if (notFoundKPIs.size > 0) {
      console.log(`\n⚠ KPIs not found in main_plan_objectives (${notFoundKPIs.size} unique):`);
      Array.from(notFoundKPIs).sort().forEach(kpi => {
        console.log(`    - "${kpi}"`);
      });
    }

    // Show some examples of linked KPIs
    if (linkedKPIs.size > 0) {
      console.log(`\n✓ Examples of linked KPIs (${linkedKPIs.size} unique):`);
      let count = 0;
      for (const [deptKPI, { mainId, mainKPI }] of linkedKPIs.entries()) {
        if (count < 10) {
          console.log(`    "${deptKPI.substring(0, 50)}..." → ID ${mainId} ("${normalizeKPI(mainKPI).substring(0, 50)}...")`);
          count++;
        }
      }
      if (linkedKPIs.size > 10) {
        console.log(`    ... and ${linkedKPIs.size - 10} more`);
      }
    }

    // Check specific KPIs mentioned by user
    console.log('\n' + '='.repeat(80));
    console.log('CHECKING SPECIFIC KPIs:');
    console.log('='.repeat(80));
    
    const specificKPIs = [
      'عدد الفرص التطوعية المتاحة سنويا',
      'عدد المستفيدين من المشروعات الخيرية'
    ];

    for (const specificKPI of specificKPIs) {
      console.log(`\n"${specificKPI}":`);
      const checkResult = await pool.request()
        .input('kpi', sql.NVarChar, specificKPI)
        .query(`
          SELECT 
            do.id,
            do.kpi,
            do.main_objective_id,
            do.type,
            d.name as department_name,
            mpo.id as main_id,
            mpo.kpi as main_kpi
          FROM department_objectives do
          INNER JOIN departments d ON do.department_id = d.id
          LEFT JOIN main_plan_objectives mpo ON do.main_objective_id = mpo.id
          WHERE do.kpi = @kpi AND do.type = 'Direct'
          ORDER BY d.name
        `);
      
      if (checkResult.recordset.length === 0) {
        console.log(`  ⚠ No Direct department objectives found`);
      } else {
        let linkedCount = 0;
        const deptGroups = new Map();
        
        checkResult.recordset.forEach(row => {
          if (!deptGroups.has(row.department_name)) {
            deptGroups.set(row.department_name, { total: 0, linked: 0 });
          }
          const group = deptGroups.get(row.department_name);
          group.total++;
          if (row.main_id) {
            group.linked++;
            linkedCount++;
          }
        });
        
        console.log(`  ✓ Found ${checkResult.recordset.length} Direct objective(s) across ${deptGroups.size} department(s):`);
        for (const [deptName, stats] of deptGroups.entries()) {
          console.log(`    - ${deptName}: ${stats.linked}/${stats.total} linked`);
        }
        console.log(`  Overall: ${linkedCount}/${checkResult.recordset.length} linked`);
        
        if (linkedCount > 0) {
          const firstLinked = checkResult.recordset.find(r => r.main_id);
          console.log(`  ✓ Linked to: Main Objective ID ${firstLinked.main_id} ("${firstLinked.main_kpi}")`);
        }
      }
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

linkAllDepartmentKPIs();

