#!/usr/bin/env node

/**
 * Script to update Case Management department objectives with correct KPIs
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

// KPIs in order (matching the activities order from the original script)
const kpis = [
  'عدد المستفيدين من المشروعات الخيرية', // 1
  'عدد المستفيدين من المشروعات الخيرية', // 2
  'عدد المستفيدين من المشروعات الخيرية', // 3
  'عدد المستفيدين من المشروعات الخيرية', // 4
  'عدد المستفيدين من المشروعات التنموية', // 5
  'عدد المستفيدين من المشروعات التنموية', // 6
  'عدد المستفيدين من المشروعات التنموية', // 7
  'عدد المستفيدين من المشروعات التنموية', // 8
  'عدد المستفيدين من المشروعات التنموية', // 9
  'عدد المستفيدين من المشروعات الخيرية', // 10
  'عدد الفرص التطوعية المتاحة سنويا', // 11
  'عدد الفرص التطوعية المتاحة سنويا', // 12
  'عدد الفرص التطوعية المتاحة سنويا', // 13
  'عدد الفرص التطوعية المتاحة سنويا', // 14
  'عدد الفرص التطوعية المتاحة سنويا', // 15
  'عدد الفرص التطوعية المتاحة سنويا', // 16
  'عدد الفرص التطوعية المتاحة سنويا', // 17
  'عدد الفرص التطوعية المتاحة سنويا', // 18
  'عدد الفرص التطوعية المتاحة سنويا', // 19
  'عدد الفرص التطوعية المتاحة سنويا', // 20
  'عدد الفرص التطوعية المتاحة سنويا', // 21
  'عدد الفرص التطوعية المتاحة سنويا', // 22
  'عدد الفرص التطوعية المتاحة سنويا', // 23
  'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', // 24
  'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', // 25
  'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا', // 26
  'حجم التمويل لتلك المنح', // 27
  'حجم التمويل لتلك المنح', // 28
  'عدد المستفيدين من المشروعات التنموية', // 29
  'عدد مذكرات التفاهم أو الخطابات الرسمية المؤيدة / عدد الوزارات أو الجهات الحكومية المشاركة', // 30
  'عدد المستفيدين من المشروعات التنموية', // 31
  'عدد المستفيدين من المشروعات التنموية', // 32
  'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', // 33
  'عدد الشراكات مع القطاع الخاص فى الملف', // 34
  'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', // 35
  'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا', // 36
];

async function updateCaseManagementKPIs() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Case Management department ID
    console.log('Getting Case Management department...');
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE name = 'Case Management'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Case Management department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Case Management department (ID: ${departmentId})\n`);

    // Get all Case Management department objectives ordered by ID
    console.log('Loading Case Management department objectives...');
    const objectivesResult = await pool.request()
      .input('department_id', sql.Int, departmentId)
      .query(`
        SELECT id, kpi, activity 
        FROM department_objectives 
        WHERE department_id = @department_id
        ORDER BY id
      `);
    
    const objectives = objectivesResult.recordset;
    console.log(`✓ Found ${objectives.length} objectives\n`);

    if (objectives.length !== kpis.length) {
      console.log(`⚠ Warning: Expected ${kpis.length} KPIs but found ${objectives.length} objectives`);
      console.log('  Will update as many as possible...\n');
    }

    console.log('Updating KPIs...\n');
    let updated = 0;
    let errors = 0;

    for (let i = 0; i < Math.min(objectives.length, kpis.length); i++) {
      const objective = objectives[i];
      const newKpi = kpis[i];
      
      // Only update if KPI is different
      if (objective.kpi !== newKpi) {
        try {
          const updateRequest = pool.request();
          updateRequest.input('id', sql.Int, objective.id);
          updateRequest.input('kpi', sql.NVarChar, newKpi);

          await updateRequest.query(`
            UPDATE department_objectives
            SET kpi = @kpi, updated_at = GETDATE()
            WHERE id = @id
          `);
          
          console.log(`✓ Updated objective ${objective.id}:`);
          console.log(`  Old: ${objective.kpi.substring(0, 50)}...`);
          console.log(`  New: ${newKpi.substring(0, 50)}...`);
          updated++;
        } catch (error) {
          console.error(`✗ Error updating objective ${objective.id}:`);
          console.error(`  Error: ${error.message}`);
          errors++;
        }
      } else {
        console.log(`- Skipped objective ${objective.id} (KPI already correct)`);
      }
    }

    console.log(`\n✓ Update completed!`);
    console.log(`  - Updated: ${updated} objectives`);
    console.log(`  - Errors: ${errors}`);
    console.log(`  - Skipped: ${objectives.length - updated - errors} objectives`);

    // Also update monthly data KPIs if they exist
    console.log('\nUpdating monthly data KPIs...');
    let monthlyUpdated = 0;
    
    for (let i = 0; i < Math.min(objectives.length, kpis.length); i++) {
      const objective = objectives[i];
      const newKpi = kpis[i];
      
      if (objective.kpi !== newKpi) {
        try {
          const updateMonthlyRequest = pool.request();
          updateMonthlyRequest.input('old_kpi', sql.NVarChar, objective.kpi);
          updateMonthlyRequest.input('new_kpi', sql.NVarChar, newKpi);
          updateMonthlyRequest.input('department_id', sql.Int, departmentId);

          const result = await updateMonthlyRequest.query(`
            UPDATE department_monthly_data
            SET kpi = @new_kpi, updated_at = GETDATE()
            WHERE kpi = @old_kpi AND department_id = @department_id
          `);
          
          if (result.rowsAffected[0] > 0) {
            monthlyUpdated += result.rowsAffected[0];
          }
        } catch (error) {
          // Ignore errors for monthly data updates
        }
      }
    }

    console.log(`✓ Updated ${monthlyUpdated} monthly data records`);

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

updateCaseManagementKPIs();

