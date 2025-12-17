require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

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

// Department name mapping: RASCI data name -> Database name
const RASCI_TO_DB_DEPARTMENT = {
  'Human Resources (HR)': 'Human Resources',
  'Procurement & Supply Chain': 'Procurement',
  'Operations / Program Implementation': 'Operations',
  'Finance': 'Finance',
  'Administration & Legal Affairs': 'Administration',
  'Information Technology (IT)': 'Information Technology',
  'Communication': 'Communication',
  'Direct Fundraising / Resource Mobilization': 'DFR',
  'Monitoring, Evaluation & Learning (MEL)': 'Monitoring, Evaluation & Learning (MEL)',
  'Case Management': 'Case Management',
  'Business Development': 'Business Development',
  'Volunteer Management': 'Volunteer Management',
  'LMF Community': 'Community',
  'S&S M': 'Security',
  'Offices&P': 'Offices',
  'SiS': 'SiS',
};

async function cleanRASCI() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Get all RASCI records
    const allRequest = pool.request();
    const allRecords = await allRequest.query('SELECT * FROM rasci_metrics');
    console.log(`Found ${allRecords.recordset.length} RASCI records\n`);

    // Update department names to match database
    let updated = 0;
    let deleted = 0;

    for (const record of allRecords.recordset) {
      const rasciDeptName = record.department;
      const dbDeptName = RASCI_TO_DB_DEPARTMENT[rasciDeptName];
      
      if (dbDeptName && dbDeptName !== rasciDeptName) {
        // Check if record with DB name already exists
        const checkRequest = pool.request();
        checkRequest.input('kpi', sql.NVarChar, record.kpi);
        checkRequest.input('db_dept', sql.NVarChar, dbDeptName);
        const existing = await checkRequest.query(`
          SELECT id FROM rasci_metrics 
          WHERE kpi = @kpi AND department = @db_dept
        `);

        if (existing.recordset.length > 0) {
          // Delete duplicate
          const deleteRequest = pool.request();
          deleteRequest.input('id', sql.Int, record.id);
          await deleteRequest.query('DELETE FROM rasci_metrics WHERE id = @id');
          deleted++;
        } else {
          // Update to DB name
          const updateRequest = pool.request();
          updateRequest.input('id', sql.Int, record.id);
          updateRequest.input('db_dept', sql.NVarChar, dbDeptName);
          await updateRequest.query('UPDATE rasci_metrics SET department = @db_dept WHERE id = @id');
          updated++;
        }
      }
    }

    console.log(`✅ Cleanup completed!`);
    console.log(`   Updated: ${updated} records`);
    console.log(`   Deleted: ${deleted} duplicate records`);
    
    await pool.close();
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

cleanRASCI();

