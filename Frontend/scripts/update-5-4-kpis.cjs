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

// Mapping of KPI text to index
const KPI_UPDATES = {
  'عدد المشتركيين في كل مستوي': '5.4.1',
  'عدد الشركاء ( مدارس - جامعات - مجتمع صناع الحياة )': '5.4.2',
  'نسبة رضا المشتركين': '5.4.3',
  'عدد المشاركات في إيفنتات شبابية': '5.4.4',
  'زيادة عدد متابعين الصفحة': '5.4.5',
  'عمل 2 ايفنت': '5.4.6',
  'عدد قنوات سوشيال ميديا': '5.4.7',
  'عدد مشتركين من ذوي الإعاقة': '5.4.8',
};

async function updateKPIs() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    let updated = 0;

    for (const [kpiText, index] of Object.entries(KPI_UPDATES)) {
      // Find records with this KPI text (without the index)
      const findRequest = pool.request();
      findRequest.input('kpiText', sql.NVarChar, kpiText);
      const findResult = await findRequest.query(`
        SELECT id, kpi FROM main_plan_objectives 
        WHERE kpi = @kpiText OR kpi LIKE @kpiText + '%'
      `);

      for (const record of findResult.recordset) {
        // Check if it already has the index
        if (record.kpi.startsWith(index)) {
          console.log(`✓ KPI already has index: ${record.kpi}`);
          continue;
        }

        // Update with index prefix
        const newKpi = `${index}\t${kpiText}`;
        const updateRequest = pool.request();
        updateRequest.input('id', sql.Int, record.id);
        updateRequest.input('newKpi', sql.NVarChar, newKpi);
        
        await updateRequest.query(`
          UPDATE main_plan_objectives 
          SET kpi = @newKpi 
          WHERE id = @id
        `);

        console.log(`✅ Updated KPI ${record.id}: "${record.kpi}" -> "${newKpi}"`);
        updated++;
      }
    }

    console.log(`\n✅ Update completed! Updated ${updated} records`);
    
    await pool.close();
  } catch (error) {
    console.error('❌ Update failed:', error.message);
    process.exit(1);
  }
}

updateKPIs();

