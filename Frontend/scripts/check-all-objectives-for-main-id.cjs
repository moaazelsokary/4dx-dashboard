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

async function checkAllObjectives() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    const mainObjectiveId = 230;
    const kpiName = 'عدد المستفيدين من المشروعات الخيرية';
    
    console.log(`Checking all department objectives linked to main_objective_id: ${mainObjectiveId}\n`);

    // Get all department objectives linked to this main objective
    const allObjsResult = await pool.request()
      .input('main_objective_id', sql.Int, mainObjectiveId)
      .query(`
        SELECT 
          do.id,
          do.kpi,
          do.type,
          do.activity_target,
          do.activity,
          d.name as department_name
        FROM department_objectives do
        INNER JOIN departments d ON do.department_id = d.id
        WHERE do.main_objective_id = @main_objective_id
          AND do.type = 'Direct'
        ORDER BY do.kpi, do.id
      `);
    
    console.log(`Found ${allObjsResult.recordset.length} Direct objective(s) linked to main_objective_id ${mainObjectiveId}:\n`);
    
    let totalSum = 0;
    const kpiGroups = new Map();
    
    allObjsResult.recordset.forEach((row, index) => {
      const sum = parseFloat(row.activity_target) || 0;
      totalSum += sum;
      
      if (!kpiGroups.has(row.kpi)) {
        kpiGroups.set(row.kpi, []);
      }
      kpiGroups.get(row.kpi).push(row);
      
      console.log(`${index + 1}. ID: ${row.id}`);
      console.log(`   Department: ${row.department_name}`);
      console.log(`   KPI: "${row.kpi}"`);
      console.log(`   Activity: "${row.activity.substring(0, 60)}..."`);
      console.log(`   Activity Target: ${row.activity_target.toLocaleString()}`);
      console.log('');
    });
    
    console.log(`Total Sum: ${totalSum.toLocaleString()}\n`);
    
    console.log('Grouped by KPI:');
    for (const [kpi, objs] of kpiGroups.entries()) {
      const kpiSum = objs.reduce((sum, obj) => sum + (parseFloat(obj.activity_target) || 0), 0);
      console.log(`\n  "${kpi}": ${objs.length} objective(s), Total: ${kpiSum.toLocaleString()}`);
      objs.forEach(obj => {
        console.log(`    - ID ${obj.id}: ${obj.activity_target.toLocaleString()} (${obj.department_name})`);
      });
    }
    
    console.log(`\n\nFor KPI "${kpiName}":`);
    const matchingObjs = allObjsResult.recordset.filter(r => r.kpi === kpiName);
    if (matchingObjs.length > 0) {
      const matchingSum = matchingObjs.reduce((sum, obj) => sum + (parseFloat(obj.activity_target) || 0), 0);
      console.log(`  Found ${matchingObjs.length} objective(s) with exact KPI match`);
      console.log(`  Total: ${matchingSum.toLocaleString()}`);
    } else {
      console.log(`  ✗ No objectives found with exact KPI match`);
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

checkAllObjectives();

