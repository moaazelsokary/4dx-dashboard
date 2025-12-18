#!/usr/bin/env node

/**
 * Script to add additional RASCI assignments for specific departments
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

// Additional Offices&P assignments
const additionalOfficesAssignments = [
  { kpi: '1.1.1', rasci: 'R' },
  { kpi: '1.1.2', rasci: 'A, R' },
  { kpi: '1.1.3', rasci: 'A, R' },
  { kpi: '1.1.4', rasci: 'A, R' },
  { kpi: '1.1.5', rasci: 'A, R' },
  { kpi: '1.2.1', rasci: 'R, A' },
  { kpi: '1.2.2', rasci: 'R, A' },
  { kpi: '1.2.3', rasci: 'R, A' },
  { kpi: '1.3.1', rasci: 'A, R' },
  { kpi: '1.3.2', rasci: 'A, R' },
  { kpi: '1.3.3', rasci: 'R' },
  { kpi: '1.3.4', rasci: 'A, R' },
  { kpi: '1.3.5', rasci: 'R' },
  { kpi: '1.3.6', rasci: 'A, R' },
  { kpi: '1.4.1', rasci: 'R' },
  { kpi: '1.4.2', rasci: 'R' },
  { kpi: '1.4.3', rasci: 'A, R' },
  { kpi: '1.5.6', rasci: 'A, R' },
  { kpi: '1.5.7', rasci: 'A, R' },
  { kpi: '2.1.3', rasci: 'R' },
  { kpi: '2.1.4', rasci: 'A, R' },
  { kpi: '2.1.5', rasci: 'R' },
  { kpi: '3.1.1', rasci: 'A, R' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '4.1.1', rasci: 'R' },
  { kpi: '4.1.3', rasci: 'R, A' },
  { kpi: '4.1.5', rasci: 'R' },
  { kpi: '4.1.6', rasci: 'A, R' },
  { kpi: '5.1.7', rasci: 'A, R' },
  { kpi: '5.2.1', rasci: 'A, R' },
  { kpi: '5.2.7', rasci: 'A, R' },
  { kpi: '5.2.8', rasci: 'A, R' },
  { kpi: '5.3.1', rasci: 'A, R' },
  { kpi: '5.3.2', rasci: 'A, R' },
  { kpi: '5.3.3', rasci: 'R' },
  { kpi: '5.3.4', rasci: 'R' },
  { kpi: '5.3.7', rasci: 'R' },
  { kpi: '6.1.2', rasci: 'A, R' },
  { kpi: '6.1.3', rasci: 'A, R' },
  { kpi: '6.1.5', rasci: 'R' },
  { kpi: '6.1.6', rasci: 'R' },
  { kpi: '6.1.7', rasci: 'R' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
];

// Additional Communication assignments
const additionalCommunicationAssignments = [
  { kpi: '5.4.5', rasci: 'S' },
  { kpi: '5.4.7', rasci: 'S' },
];

// Additional MEL assignments
const additionalMelAssignments = [
  { kpi: '5.4.2', rasci: 'R' },
  { kpi: '5.4.3', rasci: 'R' },
];

// Additional Volunteer Management assignments
const additionalVolunteerManagementAssignments = [
  { kpi: '5.4.1', rasci: 'S' },
];

// Helper function to parse RASCI string
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

// Process a single assignment
async function processAssignment(assignment, departmentName, kpiMap, pool) {
  const fullKPI = kpiMap.get(assignment.kpi);
  if (!fullKPI) {
    console.log(`⚠ Skipping KPI ${assignment.kpi} - not found in database`);
    return { inserted: 0, updated: 0, skipped: 1, error: null };
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
      console.log(`✓ Updated: ${departmentName} - ${assignment.kpi} - ${assignment.rasci}`);
      return { inserted: 0, updated: 1, skipped: 0, error: null };
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
      console.log(`✓ Inserted: ${departmentName} - ${assignment.kpi} - ${assignment.rasci}`);
      return { inserted: 1, updated: 0, skipped: 0, error: null };
    }
  } catch (error) {
    return { inserted: 0, updated: 0, skipped: 0, error: error.message };
  }
}

async function addAdditionalRASCI() {
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

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const errors = [];

    // Process additional Offices&P assignments
    console.log('Processing additional Offices&P assignments...\n');
    const officesDept = 'Offices&P';
    for (const assignment of additionalOfficesAssignments) {
      const result = await processAssignment(assignment, officesDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process additional Communication assignments
    console.log('\nProcessing additional Communication assignments...\n');
    const communicationDept = 'Communication';
    for (const assignment of additionalCommunicationAssignments) {
      const result = await processAssignment(assignment, communicationDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process additional MEL assignments
    console.log('\nProcessing additional Monitoring, Evaluation & Learning (MEL) assignments...\n');
    const melDept = 'Monitoring, Evaluation & Learning (MEL)';
    for (const assignment of additionalMelAssignments) {
      const result = await processAssignment(assignment, melDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process additional Volunteer Management assignments
    console.log('\nProcessing additional Volunteer Management assignments...\n');
    const vmDept = 'Volunteer Management';
    for (const assignment of additionalVolunteerManagementAssignments) {
      const result = await processAssignment(assignment, vmDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    console.log('\n✓ Completed!');
    console.log(`  - Inserted: ${totalInserted} records`);
    console.log(`  - Updated: ${totalUpdated} records`);
    console.log(`  - Skipped: ${totalSkipped} records`);
    
    if (errors.length > 0) {
      console.log(`\n⚠ Errors: ${errors.length}`);
      errors.forEach(err => console.log(`  - ${err}`));
    }

  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n✓ Database connection closed');
    }
  }
}

addAdditionalRASCI();

