#!/usr/bin/env node

/**
 * Script to add specific HR RASCI assignments
 */

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

// Parse RASCI value
function parseRASCI(value) {
  if (!value || value.trim() === '') {
    return { responsible: false, accountable: false, supportive: false, consulted: false, informed: false };
  }
  
  const cleaned = value.trim().toUpperCase();
  const rasciLetters = cleaned.match(/[RASCI]/g) || [];
  
  return {
    responsible: rasciLetters.includes('R'),
    accountable: rasciLetters.includes('A'),
    supportive: rasciLetters.includes('S'),
    consulted: rasciLetters.includes('C'),
    informed: rasciLetters.includes('I'),
  };
}

// HR RASCI assignments
const hrAssignments = [
  { kpi: '1.2.2', rasci: 'R' },
  { kpi: '1.3.1', rasci: 'R' },
  { kpi: '1.3.2', rasci: 'R' },
  { kpi: '1.3.3', rasci: 'R' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '5.2.2', rasci: 'A, R' },
  { kpi: '7.1.1', rasci: 'R' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '7.1.5', rasci: 'R' },
  { kpi: '7.1.6', rasci: 'R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
  { kpi: '8.1.3', rasci: 'R' },
];

async function addHRRASCI() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get all KPIs from main_plan_objectives to match by KPI number
    console.log('Loading KPIs from database...');
    const kpiRequest = pool.request();
    const kpis = await kpiRequest.query('SELECT id, kpi FROM main_plan_objectives ORDER BY kpi');
    const kpiMap = new Map();
    kpis.recordset.forEach(row => {
      const kpiNum = row.kpi.split(/\s/)[0];
      kpiMap.set(kpiNum, row.kpi);
    });
    console.log(`✓ Loaded ${kpiMap.size} KPIs from database\n`);

    const departmentName = 'Human Resources';
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = [];

    console.log(`Adding HR RASCI assignments for ${hrAssignments.length} KPIs...\n`);

    for (const assignment of hrAssignments) {
      const fullKPI = kpiMap.get(assignment.kpi);
      if (!fullKPI) {
        console.log(`⚠ Skipping KPI ${assignment.kpi} - not found in database`);
        skipped++;
        continue;
      }

      const rasci = parseRASCI(assignment.rasci);
      
      try {
        // Check if record already exists
        const checkRequest = pool.request();
        checkRequest.input('kpi', sql.NVarChar, fullKPI);
        checkRequest.input('department', sql.NVarChar, departmentName);
        const existing = await checkRequest.query(
          'SELECT * FROM rasci_metrics WHERE kpi = @kpi AND department = @department'
        );

        if (existing.recordset && existing.recordset.length > 0) {
          // Update existing record
          const updateRequest = pool.request();
          updateRequest.input('kpi', sql.NVarChar, fullKPI);
          updateRequest.input('department', sql.NVarChar, departmentName);
          updateRequest.input('responsible', sql.Bit, rasci.responsible);
          updateRequest.input('accountable', sql.Bit, rasci.accountable);
          updateRequest.input('supportive', sql.Bit, rasci.supportive);
          updateRequest.input('consulted', sql.Bit, rasci.consulted);
          updateRequest.input('informed', sql.Bit, rasci.informed);

          await updateRequest.query(`
            UPDATE rasci_metrics
            SET 
              responsible = @responsible,
              accountable = @accountable,
              supportive = @supportive,
              consulted = @consulted,
              informed = @informed
            WHERE kpi = @kpi AND department = @department
          `);
          updated++;
          console.log(`✓ Updated: ${assignment.kpi} - ${assignment.rasci}`);
        } else {
          // Insert new record
          const insertRequest = pool.request();
          insertRequest.input('kpi', sql.NVarChar, fullKPI);
          insertRequest.input('department', sql.NVarChar, departmentName);
          insertRequest.input('responsible', sql.Bit, rasci.responsible);
          insertRequest.input('accountable', sql.Bit, rasci.accountable);
          insertRequest.input('supportive', sql.Bit, rasci.supportive);
          insertRequest.input('consulted', sql.Bit, rasci.consulted);
          insertRequest.input('informed', sql.Bit, rasci.informed);

          await insertRequest.query(`
            INSERT INTO rasci_metrics (kpi, department, responsible, accountable, supportive, consulted, informed)
            VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed)
          `);
          inserted++;
          console.log(`✓ Inserted: ${assignment.kpi} - ${assignment.rasci}`);
        }
      } catch (error) {
        errors.push(`KPI ${assignment.kpi}: ${error.message}`);
        console.error(`❌ Error for KPI ${assignment.kpi}: ${error.message}`);
      }
    }

    console.log(`\n✓ Completed!`);
    console.log(`  - Inserted: ${inserted} records`);
    console.log(`  - Updated: ${updated} records`);
    console.log(`  - Skipped: ${skipped} records`);
    if (errors.length > 0) {
      console.log(`  - Errors: ${errors.length}`);
      errors.forEach(err => console.log(`    ${err}`));
    }

  } catch (error) {
    console.error('❌ Failed:', error.message);
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

addHRRASCI().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

