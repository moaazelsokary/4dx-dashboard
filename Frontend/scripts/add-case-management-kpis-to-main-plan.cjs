#!/usr/bin/env node

/**
 * Script to add Case Management KPIs to main_plan_objectives table
 * These KPIs need to exist in main_plan_objectives to show in the strategic plan
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

// Case Management KPIs to add to main_plan_objectives
// We'll calculate annual_target from the sum of all Direct department objectives for each KPI
const kpisToAdd = [
  'عدد المستفيدين من المشروعات الخيرية',
  'عدد المستفيدين من المشروعات التنموية',
  'عدد الفرص التطوعية المتاحة سنويا',
  'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين',
  'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا',
  'حجم التمويل لتلك المنح',
  'عدد مذكرات التفاهم أو الخطابات الرسمية المؤيدة / عدد الوزارات أو الجهات الحكومية المشاركة',
  'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)',
  'عدد الشراكات مع القطاع الخاص فى الملف',
  'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs',
];

async function addCaseManagementKPIsToMainPlan() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Case Management department ID
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE name = 'Case Management'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Case Management department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Case Management department (ID: ${departmentId})\n`);

    // Get existing pillars to determine where to add these KPIs
    const pillarsResult = await pool.request().query(`
      SELECT DISTINCT pillar FROM main_plan_objectives ORDER BY pillar
    `);
    const pillars = pillarsResult.recordset.map(row => row.pillar);
    console.log(`✓ Found ${pillars.length} pillars: ${pillars.join(', ')}\n`);

    // For each KPI, calculate the annual target from department objectives
    console.log('Adding KPIs to main_plan_objectives...\n');
    let added = 0;
    let skipped = 0;

    for (const kpi of kpisToAdd) {
      // Check if KPI already exists
      const existingCheck = await pool.request()
        .input('kpi', sql.NVarChar, kpi)
        .query(`
          SELECT id FROM main_plan_objectives WHERE kpi = @kpi
        `);

      if (existingCheck.recordset.length > 0) {
        console.log(`- Skipped: ${kpi.substring(0, 50)}... (already exists)`);
        skipped++;
        continue;
      }

      // Calculate annual target from sum of all Direct department objectives for this KPI
      const targetResult = await pool.request()
        .input('kpi', sql.NVarChar, kpi)
        .query(`
          SELECT SUM(activity_target) as total_target
          FROM department_objectives
          WHERE kpi = @kpi AND type = 'Direct'
        `);

      const annualTarget = targetResult.recordset[0]?.total_target || 0;

      // Determine pillar, objective, and target based on KPI content
      // This is a best guess - you may need to adjust these
      let pillar = 'Strategic Themes';
      let objective = 'تعزيز القدرات المؤسسية والتنظيمية';
      let target = '1.1 تطوير البنية التحتية المؤسسية';

      // Try to match with existing structure
      if (kpi.includes('متطوع') || kpi.includes('فرصة تطوعية')) {
        pillar = 'Strategic Themes';
        objective = 'تعزيز المشاركة المجتمعية والتطوع';
        target = '1.1 تطوير برامج التطوع والمشاركة المجتمعية';
      } else if (kpi.includes('مستفيد') || kpi.includes('مشروع')) {
        pillar = 'Strategic Themes';
        objective = 'تحسين جودة الخدمات المقدمة';
        target = '1.1 زيادة عدد المستفيدين من الخدمات';
      } else if (kpi.includes('تمويل') || kpi.includes('منح')) {
        pillar = 'Contributors';
        objective = 'تعزيز الموارد المالية';
        target = '2.1 زيادة حجم التمويل';
      } else if (kpi.includes('شراكة') || kpi.includes('مذكرة تفاهم')) {
        pillar = 'Contributors';
        objective = 'تعزيز الشراكات والتعاون';
        target = '2.1 تطوير الشراكات الاستراتيجية';
      } else if (kpi.includes('وعي') || kpi.includes('Brand')) {
        pillar = 'Strategic Enablers';
        objective = 'تعزيز العلامة المؤسسية';
        target = '3.1 زيادة الوعي بالعلامة المؤسسية';
      } else if (kpi.includes('نظام') || kpi.includes('SOP')) {
        pillar = 'Strategic Enablers';
        objective = 'تطوير الأنظمة والعمليات';
        target = '3.1 تطبيق الأنظمة المعيارية';
      }

      // Insert into main_plan_objectives
      try {
        const insertRequest = pool.request();
        insertRequest.input('pillar', sql.NVarChar, pillar);
        insertRequest.input('objective', sql.NVarChar, objective);
        insertRequest.input('target', sql.NVarChar, target);
        insertRequest.input('kpi', sql.NVarChar, kpi);
        insertRequest.input('annual_target', sql.Decimal(18, 2), annualTarget);

        await insertRequest.query(`
          INSERT INTO main_plan_objectives (pillar, objective, target, kpi, annual_target)
          VALUES (@pillar, @objective, @target, @kpi, @annual_target)
        `);

        console.log(`✓ Added: ${kpi.substring(0, 50)}...`);
        console.log(`  Pillar: ${pillar}`);
        console.log(`  Objective: ${objective}`);
        console.log(`  Target: ${target}`);
        console.log(`  Annual Target: ${annualTarget.toLocaleString()}\n`);
        added++;
      } catch (error) {
        console.error(`✗ Error adding ${kpi.substring(0, 50)}...`);
        console.error(`  Error: ${error.message}\n`);
      }
    }

    console.log(`\n✓ Completed!`);
    console.log(`  - Added: ${added} KPIs`);
    console.log(`  - Skipped: ${skipped} KPIs (already exist)`);
    console.log(`\n⚠ Note: Please review the pillar, objective, and target assignments`);
    console.log(`  and update them in the main plan table if needed.`);

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

addCaseManagementKPIsToMainPlan();

