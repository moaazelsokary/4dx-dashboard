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

// Mapping of old KPI text to new indexed KPI
const KPI_UPDATES = {
  'عدد المشتركيين في كل مستوي': '5.4.1\tعدد المشتركيين في كل مستوي',
  'عدد الشركاء ( مدارس - جامعات - مجتمع صناع الحياة )': '5.4.2\tعدد الشركاء ( مدارس - جامعات - مجتمع صناع الحياة )',
  'نسبة رضا المشتركين': '5.4.3\tنسبة رضا المشتركين',
  'عدد المشاركات في إيفنتات شبابية': '5.4.4\tعدد المشاركات في إيفنتات شبابية',
  'زيادة عدد متابعين الصفحة': '5.4.5\tزيادة عدد متابعين الصفحة',
  'عمل 2 ايفنت': '5.4.6\tعمل 2 ايفنت',
  'عدد قنوات سوشيال ميديا': '5.4.7\tعدد قنوات سوشيال ميديا',
  'عدد مشتركين من ذوي الإعاقة': '5.4.8\tعدد مشتركين من ذوي الإعاقة',
};

async function updateRASCIKPIs() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    let updated = 0;

    for (const [oldKpi, newKpi] of Object.entries(KPI_UPDATES)) {
      const updateRequest = pool.request();
      updateRequest.input('oldKpi', sql.NVarChar, oldKpi);
      updateRequest.input('newKpi', sql.NVarChar, newKpi);
      
      const result = await updateRequest.query(`
        UPDATE rasci_metrics 
        SET kpi = @newKpi 
        WHERE kpi = @oldKpi
      `);

      if (result.rowsAffected[0] > 0) {
        console.log(`✅ Updated ${result.rowsAffected[0]} RASCI records: "${oldKpi}" -> "${newKpi}"`);
        updated += result.rowsAffected[0];
      }
    }

    console.log(`\n✅ Update completed! Updated ${updated} RASCI records`);
    
    await pool.close();
  } catch (error) {
    console.error('❌ Update failed:', error.message);
    process.exit(1);
  }
}

updateRASCIKPIs();

