#!/usr/bin/env node

/**
 * Script to import RASCI data organized by department (columns) and KPIs (rows)
 * Data format: Departments as columns, KPIs as rows from 1.1.1 to 9.1.2
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

// Department name mapping: Table name → Database name
const DEPARTMENT_MAP = {
  'Human Resources (HR)': 'Human Resources',
  'Procurement & Supply Chain': 'Procurement',
  'Operations / Program Implementation': 'Operations',
  'Finance': 'Finance',
  'Administration & Legal Affairs': 'Administration',
  'Information Technology (IT)': 'Information Technology',
  'Communication': 'Communication',
  'Direct Fundraising / Resource Mobilization': 'Direct Fundraising / Resource Mobilization',
  'Monitoring, Evaluation & Learning (MEL)': 'Monitoring, Evaluation & Learning (MEL)',
  'Case Management': 'Case Management',
  'Business Development': 'Business Development',
  'Volunteer Management': 'Volunteer Management',
  'LMF Community': 'Community',
  'Security&Safety': 'Security',
  'Offices&P': 'Offices',
  'SiS': 'SiS',
};

// Parse RASCI value (can be "R", "A", "S", "C", "I", or combinations like "A, R", "I, S")
// Also handles Arabic text mixed in - extracts only RASCI letters
function parseRASCI(value) {
  if (!value || value.trim() === '') {
    return { responsible: false, accountable: false, supportive: false, consulted: false, informed: false };
  }
  
  // Extract only RASCI letters (R, A, S, C, I) from the value, ignoring Arabic text
  const cleaned = value.trim().toUpperCase();
  // Remove Arabic characters and keep only English letters R, A, S, C, I
  const rasciLetters = cleaned.match(/[RASCI]/g) || [];
  
  return {
    responsible: rasciLetters.includes('R'),
    accountable: rasciLetters.includes('A'),
    supportive: rasciLetters.includes('S'),
    consulted: rasciLetters.includes('C'),
    informed: rasciLetters.includes('I'),
  };
}

// RASCI data - departments as columns, KPIs as rows
const rasciData = `1/Human Resources (HR)	2/Procurement & Supply Chain	3/Operations / Program Implementation	4/Finance	5/Administration & Legal Affairs	6/Information Technology (IT)	7/Communication	8/Direct Fundraising / Resource Mobilization	9/Monitoring, Evaluation & Learning (MEL)	10/Case Management	11/Business Development	12/Volunteer Management	13/LMF Community	14/Security&Safety	15/Offices&P	16/SiS	
1.1.1		R	internship	R	R	R	inernship مع جهات اخرى 					A, R	موظفين وبيئة عمل العمل					A, R				R		A, R	A, R	R	R	R	R	R	
1.1.2		R	متطوعو الشراء 	R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.1.3		R	متطوعو الشراء 	R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.1.4		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.1.5		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.2.1		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.2.2	R	internship	R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.2.3		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.3.1	R		R	متطوعو الشراء 	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.3.2	R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.3.3	R	inernship مع جهات اخرى 	R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.3.4		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.3.5		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.3.6		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.3.7		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.4.1		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.4.2		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.4.3		R		A, R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.1		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.2		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.3		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.4		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.5		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.6		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.7		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.8		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.9		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.10		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
1.5.11		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	
2.1.1		A, R		S	S	التراخيص والتصاريح		A, R	I, S						
2.1.2		A, R		S	S	التراخيص والتصاريح		I, S					C, S	
2.1.3		A, R		S	S	S		R	I, S		R					R		
2.1.4		A, R		S		S		R	I, S		R					A, R		
2.1.5		A, R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
3.1.1		R		A, R	R	S		R			A, R	R			A, R	S	
3.1.2		A, R		S	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
3.1.3	A, R	موظفين وبيئة عمل العمل	A, R	الموردين 	A, R	partners  و مستفيدين 	R	بنوك و موردين  و تقارير مالية مع الشركاء 	A, R	النزعات القضائية و الشكاوى 	A, R		A, R		A, R	donors , customer services 	S		A, R	المستفيدين 	A, R	النخيل من ناحية التوثيق و المتبرعبن ، الكلى من ناحية المستفيدين و الشركاء في المقاطعة 	A, R	الانشطة التطوعية و السلوك التطوعي 		بيئة العمل و الايفنتات 			A, R		R	
4.1.1		A, R		R		S		R, A		I, S					R	محلية		
4.1.2		A, R		S		R		S		S		I, S						
4.1.3		A, R		S		R		S		R		I, S					R, A		
4.1.4		A, R		R		S			I, S					C, S	
4.1.5		A, R		S		A, R		S		S			I, S					R		C, S	
4.1.6		S		I, S				A, R		S	
4.1.7		A, R		S		S			S		R		I, S						
4.1.8		A, R		S, I		S		A, R		I, S						
5.1.1		A, R		S		S			A, R						
5.1.3		A, R		S		S			I, S		A, R					
5.1.4	R		A, R		S													
5.1.5		A, R		S			A, R					
5.1.6		A, R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.1.7		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.1.8		A, R		S		S			A, R					
5.1.9	R, A		S		R			A, R					
5.2.1		A, R		A, R		I, S		A, R		A, R			
5.2.2	A, R		A, R		I, S						
5.2.3		A		R		I, S				R			
5.2.4		I, S		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.2.5		A, R		A, R		I, S						
5.2.6		I, S		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.2.7		R		I, S		A, R		A, R			
5.2.8		R		I, S		A, R		A, R			
5.2.9		A, R		S		R			I						
5.2.10		A, R		S		R			I						
5.3.1		A, R		S		I, S		R		R			
5.3.2		A, R		S		I, S		R		R			
5.3.3		A, R		S		I, S		R		R			
5.3.4		A, R		S		I, S		A, R		A, R			
5.3.6		A, R		I, S						
5.3.7		A, R		I, S		A, R		A, R			
5.3.8		A, R		S		S, R		I						
5.3.9		A, R		S		S, R		I						
5.4.1		S		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.4.2		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.4.3		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.4.4		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.4.5		S		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.4.6		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.4.7		S		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
5.4.8		R		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
6.1.1		A, R		S		S		A, R		I, S						
6.1.2		A, R		S		S		A, R		I, S		R		R			
6.1.3		A, R		S		S		A, R		I, S		R		R			
6.1.4		A, R		S		S		A, R		I, S		A, R				
6.1.5		A, R		S		S		A, R		I, S			R		
6.1.6		S		S		S		A, R		I, S		R		R			
6.1.7		S		S		S		A, R		I, S		R		R			
7.1.1	R		R		R		A, R			R			R							S, I	
7.1.2		S, I		R	R	R	R	R	R	R	R	R	R	R	R	R	R	R	
7.1.3	A, R		A, R		A, R		A, R		A, R		A, R			I, S		A, R			R		A, R		A, R		S	
7.1.4	A, R		A, R		A, R		A, R		A, R		A, R		A, R		A, R		I, S		A, R		A, R		A, R		A, R		R		A, R		S	
7.1.5	R		S		S		S			I, S			S				A, R	
7.1.6	R		S		S		S			I, S			S				A, R	
8.1.1	R		R		R		R		R		R, A		R		R		A, R		R		R		R		R		R		R		C, S	
8.1.2	R		R		R		R		R		A, R		R		R		I, S, A, R		R		R		R		R		R		R			
8.1.3	R		R		R		R			A, R		R		R		I, S, A, R						
8.1.4		A, R		I, S, R, A						
9.1.1		A, R, C		A, R, S, I						
9.1.2		A, R, C		A, R, S, I						`;

async function importRASCIByDepartment() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Parse the data
    const lines = rasciData.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('Invalid data format: need at least header and one data row');
    }

    // Get department headers from first line
    const headerLine = lines[0];
    const headerParts = headerLine.split('\t').map(p => p.trim());
    
    // Extract department names from headers (format: "1/Human Resources (HR)")
    const departmentHeaders = [];
    const departmentIndices = [];
    
    for (let i = 0; i < headerParts.length; i++) {
      const header = headerParts[i];
      if (header && header.includes('/')) {
        // Extract department name after the slash
        const deptName = header.split('/')[1].trim();
        if (DEPARTMENT_MAP[deptName]) {
          departmentHeaders.push(deptName);
          departmentIndices.push(i);
        }
      }
    }

    console.log(`Found ${departmentHeaders.length} departments to process:\n`);
    departmentHeaders.forEach((h, idx) => {
      console.log(`  ${idx + 1}. ${h} → ${DEPARTMENT_MAP[h]}`);
    });
    console.log('');

    // Get all KPIs from main_plan_objectives to match by KPI number
    console.log('Loading KPIs from database...');
    const kpiRequest = pool.request();
    const kpis = await kpiRequest.query('SELECT id, kpi FROM main_plan_objectives ORDER BY kpi');
    const kpiMap = new Map();
    kpis.recordset.forEach(row => {
      // Extract KPI number (e.g., "1.1.1" from "1.1.1 عدد المتطوعين...")
      const kpiNum = row.kpi.split(/\s/)[0];
      kpiMap.set(kpiNum, row.kpi);
    });
    console.log(`✓ Loaded ${kpiMap.size} KPIs from database\n`);

    // Process data lines (skip header line)
    let inserted = 0;
    let skipped = 0;
    let errors = [];

    console.log('Processing RASCI data...\n');

    for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const parts = line.split('\t').map(p => p.trim());
      
      if (parts.length < 2) {
        skipped++;
        continue;
      }

      // First column is KPI number
      const kpiNum = parts[0];
      
      // Find full KPI from database
      const fullKPI = kpiMap.get(kpiNum);
      if (!fullKPI) {
        console.log(`⚠ Skipping KPI ${kpiNum} - not found in database`);
        skipped++;
        continue;
      }

      // Process each department column
      for (let deptIdx = 0; deptIdx < departmentIndices.length; deptIdx++) {
        const colIdx = departmentIndices[deptIdx];
        const tableDeptName = departmentHeaders[deptIdx];
        const dbDeptName = DEPARTMENT_MAP[tableDeptName];
        const rasciValue = parts[colIdx] || '';

        // Parse RASCI value
        const rasci = parseRASCI(rasciValue);
        
        // Only insert if at least one role is assigned
        if (rasci.responsible || rasci.accountable || rasci.supportive || rasci.consulted || rasci.informed) {
          try {
            const insertRequest = pool.request();
            insertRequest.input('kpi', sql.NVarChar, fullKPI);
            insertRequest.input('department', sql.NVarChar, dbDeptName);
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
          } catch (error) {
            if (error.message && error.message.includes('UNIQUE KEY constraint')) {
              // Duplicate - skip
              skipped++;
            } else {
              errors.push(`KPI ${kpiNum}, Dept ${dbDeptName}: ${error.message}`);
            }
          }
        }
      }
    }

    console.log(`\n✓ Import completed!`);
    console.log(`  - Inserted: ${inserted} records`);
    console.log(`  - Skipped: ${skipped} records`);
    if (errors.length > 0) {
      console.log(`  - Errors: ${errors.length}`);
      errors.slice(0, 10).forEach(err => console.log(`    ${err}`));
      if (errors.length > 10) {
        console.log(`    ... and ${errors.length - 10} more errors`);
      }
    }

    // Verify
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest.query('SELECT COUNT(*) as count FROM rasci_metrics');
    console.log(`\n✓ Total records in rasci_metrics: ${verifyResult.recordset[0].count}`);

  } catch (error) {
    console.error('❌ Import failed:', error.message);
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

importRASCIByDepartment().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

