require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

// Parse server and port
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

// Department name mapping: Input name -> Database name
const DEPT_MAP = {
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
  'Security&Safety': 'Security',
  'S&S M': 'Security',
  'Offices&P': 'Offices',
  'SiS': 'SiS',
};

// Parse RASCI value
function parseRASCI(value) {
  if (!value || value.trim() === '') {
    return { responsible: false, accountable: false, supportive: false, consulted: false, informed: false };
  }
  
  const cleaned = value.trim().toUpperCase();
  const parts = cleaned.split(',').map(p => p.trim());
  
  return {
    responsible: parts.includes('R'),
    accountable: parts.includes('A'),
    supportive: parts.includes('S'),
    consulted: parts.includes('C'),
    informed: parts.includes('I'),
  };
}

async function importRASCIData() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Keep existing data, we'll update it with MERGE
    console.log('Keeping existing RASCI data, will update assignments...\n');

    // Get all KPIs in order from main_plan_objectives (sorted by target number)
    console.log('Loading KPIs from database...');
    const kpiRequest = pool.request();
    const kpiResult = await kpiRequest.query(`
      SELECT DISTINCT kpi, target
      FROM main_plan_objectives 
      ORDER BY target, kpi
    `);
    const kpis = kpiResult.recordset.map(r => r.kpi);
    console.log(`✅ Found ${kpis.length} KPIs\n`);

    // Get all departments
    const deptRequest = pool.request();
    const deptResult = await deptRequest.query('SELECT id, name, code FROM departments');
    const deptMap = new Map();
    deptResult.recordset.forEach(dept => {
      deptMap.set(dept.name.toLowerCase(), dept);
    });

    // Read data from file if provided, otherwise from command line
    const fs = require('fs');
    let deptData = '';
    
    if (process.argv[2] && fs.existsSync(process.argv[2])) {
      deptData = fs.readFileSync(process.argv[2], 'utf8');
    } else if (process.argv[2]) {
      deptData = process.argv[2];
    } else {
      console.log('⚠️  No data provided. Please provide the RASCI data.');
      console.log('Usage: node import-rasci-by-dept.cjs <data-file-or-string>');
      await pool.close();
      return;
    }

    // Split by department sections (lines starting with number/)
    const sections = deptData.split(/\n(?=\d+\/)/).filter(s => s.trim());
    console.log(`Found ${sections.length} department sections\n`);

    let totalInserted = 0;

    for (const section of sections) {
      const lines = section.trim().split('\n').filter(l => l.trim());
      if (lines.length === 0) continue;

      // First line contains department name
      const headerLine = lines[0];
      const deptMatch = headerLine.match(/^\d+\/(.+?)(?:\t|$)/);
      if (!deptMatch) continue;

      const inputDeptName = deptMatch[1].trim();
      const dbDeptName = DEPT_MAP[inputDeptName] || inputDeptName;
      const dept = deptMap.get(dbDeptName.toLowerCase());

      if (!dept) {
        console.log(`⚠️  Department not found: ${inputDeptName} -> ${dbDeptName}`);
        continue;
      }

      console.log(`Processing ${dbDeptName}...`);

      // Get RASCI values from all data lines (skip header line)
      // Combine all data lines and split by tabs
      const dataLines = lines.slice(1).join('\t');
      const rasciValues = dataLines.split('\t').filter(v => v.trim() !== ''); // Remove empty values

      let deptInserted = 0;
      for (let i = 0; i < Math.min(kpis.length, rasciValues.length); i++) {
        const kpi = kpis[i];
        const rasciValue = rasciValues[i] || '';
        
        // Skip if empty or just descriptive text
        if (!rasciValue || rasciValue.trim() === '' || 
            rasciValue.match(/^(متطوعو|الجمعيات|التصاريح|التراخيص|موظفين|الموردين|partners|بنوك|النزعات|donors|المستفيدين|النخيل|الكلى|الانشطة|بيئة|محلية|جهات|internship|inernship|مشترك|مدارس|رضا|مشاركات|ايفنت|مشارك|متابعين|قنوات|platform|مشتركين|اصدار|استبيان)/)) {
          continue;
        }

        const rasci = parseRASCI(rasciValue);
        
        // Only insert if at least one role is assigned
        if (rasci.responsible || rasci.accountable || rasci.supportive || rasci.consulted || rasci.informed) {
          try {
            const request = pool.request();
            request.input('kpi', sql.NVarChar, kpi);
            request.input('department', sql.NVarChar, dbDeptName);
            request.input('responsible', sql.Bit, rasci.responsible);
            request.input('accountable', sql.Bit, rasci.accountable);
            request.input('supportive', sql.Bit, rasci.supportive);
            request.input('consulted', sql.Bit, rasci.consulted);
            request.input('informed', sql.Bit, rasci.informed);

            await request.query(`
              MERGE rasci_metrics AS target
              USING (SELECT @kpi AS kpi, @department AS department) AS source
              ON target.kpi = source.kpi AND target.department = source.department
              WHEN MATCHED THEN
                UPDATE SET 
                  responsible = @responsible,
                  accountable = @accountable,
                  supportive = @supportive,
                  consulted = @consulted,
                  informed = @informed
              WHEN NOT MATCHED THEN
                INSERT (kpi, department, responsible, accountable, supportive, consulted, informed)
                VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed);
            `);

            deptInserted++;
            totalInserted++;
          } catch (error) {
            if (error.message.includes('UNIQUE') || error.message.includes('duplicate')) {
              // Update instead
              const updateRequest = pool.request();
              updateRequest.input('kpi', sql.NVarChar, kpi);
              updateRequest.input('department', sql.NVarChar, dbDeptName);
              updateRequest.input('responsible', sql.Bit, rasci.responsible);
              updateRequest.input('accountable', sql.Bit, rasci.accountable);
              updateRequest.input('supportive', sql.Bit, rasci.supportive);
              updateRequest.input('consulted', sql.Bit, rasci.consulted);
              updateRequest.input('informed', sql.Bit, rasci.informed);

              await updateRequest.query(`
                UPDATE rasci_metrics 
                SET responsible = @responsible,
                    accountable = @accountable,
                    supportive = @supportive,
                    consulted = @consulted,
                    informed = @informed
                WHERE kpi = @kpi AND department = @department
              `);
              deptInserted++;
              totalInserted++;
            } else {
              console.error(`❌ Error for ${kpi} - ${dbDeptName}:`, error.message);
            }
          }
        }
      }

      console.log(`  ✅ Inserted ${deptInserted} assignments for ${dbDeptName}\n`);
    }

    console.log(`\n✅ Import completed!`);
    console.log(`   Total inserted: ${totalInserted} RASCI assignments`);
    
    await pool.close();
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

importRASCIData();

