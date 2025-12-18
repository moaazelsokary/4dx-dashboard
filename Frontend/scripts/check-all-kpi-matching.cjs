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

function normalizeKPI(kpi) {
  if (!kpi) return '';
  return kpi.replace(/^\d+(\.\d+)*\s*/, '').trim();
}

async function checkKPIMatching() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get the specific KPI
    const testKPI = '5.1.1 عدد مذكرات التفاهم و اتفاقيات الشراكة الموقعة مع منظمات دولية';
    console.log(`Testing KPI: "${testKPI}"\n`);

    // Get all main plan KPIs
    console.log('Getting all main plan KPIs...');
    const mainKPIsResult = await pool.request().query(`
      SELECT id, kpi FROM main_plan_objectives ORDER BY kpi
    `);
    console.log(`✓ Found ${mainKPIsResult.recordset.length} main plan KPIs\n`);

    // Get all Direct department objectives
    console.log('Getting all Direct department objectives...');
    const deptObjsResult = await pool.request().query(`
      SELECT 
        do.id,
        do.kpi,
        do.activity_target,
        d.name as department_name
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE do.type = 'Direct'
      ORDER BY do.kpi
    `);
    console.log(`✓ Found ${deptObjsResult.recordset.length} Direct department objectives\n`);

    // Test matching for the specific KPI
    console.log('='.repeat(80));
    console.log('TESTING MATCHING FOR SPECIFIC KPI:');
    console.log('='.repeat(80));
    const normalizedMainKPI = normalizeKPI(testKPI).trim().toLowerCase();
    console.log(`Main KPI: "${testKPI}"`);
    console.log(`Normalized: "${normalizedMainKPI}"\n`);

    const matches = [];
    for (const deptObj of deptObjsResult.recordset) {
      const deptKPI = deptObj.kpi;
      const normalizedDeptKPI = normalizeKPI(deptKPI).trim().toLowerCase();
      
      const isMatch = normalizedDeptKPI === normalizedMainKPI || 
                      deptKPI.trim().toLowerCase() === testKPI.trim().toLowerCase() ||
                      normalizedDeptKPI === testKPI.trim().toLowerCase() ||
                      deptKPI.trim().toLowerCase() === normalizedMainKPI;
      
      if (isMatch) {
        matches.push(deptObj);
        console.log(`✓ MATCH FOUND:`);
        console.log(`  Department: ${deptObj.department_name}`);
        console.log(`  KPI: "${deptKPI}"`);
        console.log(`  Normalized: "${normalizedDeptKPI}"`);
        console.log(`  Activity Target: ${deptObj.activity_target}`);
        console.log('');
      }
    }

    if (matches.length === 0) {
      console.log('✗ NO MATCHES FOUND\n');
      console.log('Searching for similar KPIs...\n');
      
      // Find similar KPIs
      const searchTerms = normalizedMainKPI.split(' ').filter(w => w.length > 3);
      console.log(`Search terms: ${searchTerms.join(', ')}\n`);
      
      const similar = [];
      for (const deptObj of deptObjsResult.recordset) {
        const deptKPI = deptObj.kpi.toLowerCase();
        const matchCount = searchTerms.filter(term => deptKPI.includes(term)).length;
        if (matchCount >= Math.min(2, searchTerms.length)) {
          similar.push({ ...deptObj, matchCount });
        }
      }
      
      if (similar.length > 0) {
        console.log('Similar department KPIs found:');
        similar.sort((a, b) => b.matchCount - a.matchCount);
        similar.slice(0, 5).forEach(obj => {
          console.log(`  - "${obj.kpi}" (${obj.matchCount} matching terms)`);
        });
      }
    }

    // Check all main KPIs for matching issues
    console.log('\n' + '='.repeat(80));
    console.log('CHECKING ALL MAIN KPIs FOR MATCHING:');
    console.log('='.repeat(80));
    
    let noMatches = 0;
    let hasMatches = 0;
    const noMatchKPIs = [];

    for (const mainKPI of mainKPIsResult.recordset) {
      const mainKPINormalized = normalizeKPI(mainKPI.kpi).trim().toLowerCase();
      let foundMatch = false;

      for (const deptObj of deptObjsResult.recordset) {
        const deptKPINormalized = normalizeKPI(deptObj.kpi).trim().toLowerCase();
        
        if (deptKPINormalized === mainKPINormalized ||
            deptObj.kpi.trim().toLowerCase() === mainKPI.kpi.trim().toLowerCase() ||
            deptKPINormalized === mainKPI.kpi.trim().toLowerCase() ||
            deptObj.kpi.trim().toLowerCase() === mainKPINormalized) {
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        noMatches++;
        noMatchKPIs.push(mainKPI.kpi);
      } else {
        hasMatches++;
      }
    }

    console.log(`\nSummary:`);
    console.log(`  KPIs with matches: ${hasMatches}`);
    console.log(`  KPIs without matches: ${noMatches}`);
    
    if (noMatchKPIs.length > 0) {
      console.log(`\nKPIs without matches (first 10):`);
      noMatchKPIs.slice(0, 10).forEach(kpi => {
        console.log(`  - "${kpi}"`);
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

checkKPIMatching();

