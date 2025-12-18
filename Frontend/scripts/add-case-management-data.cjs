#!/usr/bin/env node

/**
 * Script to add Case Management department objectives and monthly data
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

// Activities data
const activities = [
  { activity: 'دراسة حالات و تحويلها الى ادارة العمليات للتنفيذ مصريين الاحتياجات الاساسية (حملة رمضان - الاضاحى - المدارس - دفا)', type: 'In direct', target: 26000, responsible: 'خضرى', mov: '6500 أسرة' },
  { activity: 'دراسة حالات و تحويلها الى ادارة العمليات للتنفيذ ( فلسطيينين حملة رمضان )', type: 'In direct', target: 10000, responsible: 'خضرى', mov: '2500 أسرة' },
  { activity: 'دراسة حالات و تحويلها الى ادارة العمليات للتنفيذ المساعدات الانسانية', type: 'In direct', target: 0, responsible: 'خضرى', mov: '' },
  { activity: 'دراسة حالات و تحويلها الى ادارة العمليات للتنفيذ الطوارىيء', type: 'In direct', target: 900, responsible: 'خضرى', mov: '900 اسرة' },
  { activity: 'دراسة حالات و تحويلها الى ادارة العمليات للتنفيذ مشروع قفط', type: 'In direct', target: 2000, responsible: 'خضرى', mov: '500 اسرة' },
  { activity: 'دراسة حالات و تحويلها الى ادارة العمليات للتنفيذ سوا', type: 'In direct', target: 1575, responsible: 'باسم', mov: '1575 مقابله' },
  { activity: 'دراسة حالات و تحويلها الى ادارة العمليات للتنفيذ حصاد المستقبل', type: 'In direct', target: 2300, responsible: 'سند', mov: '2300 طفل' },
  { activity: 'دارسة حالات وت تحويلها الى ادارة العمليات للتنفيذ مشروع دار وسلامة', type: 'In direct', target: 0, responsible: 'خضرى', mov: '' },
  { activity: 'دارسة حالات وت تحويلها الى ادارة العمليات للتنفيذ مشروع steps forword', type: 'In direct', target: 0, responsible: 'خضرى', mov: '' },
  { activity: 'تنفيذ 540 حالة طارئة', type: 'Direct', target: 540, responsible: 'رضا', mov: '540 حالة' },
  { activity: '18000 فرصة تطوعية من خلال النزول الميدانى لدراسة الحالات', type: 'Direct', target: 18000, responsible: 'خضرى', mov: '18000 فرصة' },
  { activity: '540 فرصه تطوعية من خلال تنفيذ حالات الطوارئ', type: 'Direct', target: 900, responsible: 'رضا', mov: '900 فرصة' },
  { activity: '900 فرصه تطوعية من خلال المكالمات والنزول الميدانى للمتابعة والتقييم مشروع فرونتكس', type: 'Direct', target: 900, responsible: 'إيناس أيوب', mov: '900 فرصة' },
  { activity: '300 فرصه تطوعية من خلال 300 مكالمه لتقييم تدخلات مشروع قفط', type: 'Direct', target: 300, responsible: 'إيناس أيوب', mov: '300 فرصة' },
  { activity: '300 فرصه تطوعية من خلال 300 نزول ميدانى لتقييم تدخلات مشروع قفط', type: 'Direct', target: 300, responsible: 'إيناس أيوب', mov: '300 فرصة' },
  { activity: '640 فرصة تطوعية من خلال 640 مكالمه لتقييم تدخلات حملة رمضان', type: 'Direct', target: 640, responsible: 'إيناس أيوب', mov: '640 فرصة' },
  { activity: '400 فرصة تطوعية من خلال 400 مكالمه لتقييم تدخلات حملة الاضاحى', type: 'Direct', target: 400, responsible: 'إيناس أيوب', mov: '400 فرصة' },
  { activity: '700 فرصة تطوعية من خلال 700 مكالمه لتقييم تدخلات حملة المدارس 2026', type: 'Direct', target: 700, responsible: 'إيناس أيوب', mov: '700 فرصة' },
  { activity: '1500 فرصة تطوعية من خلال 1500 مكالمه لتقييم تدخلات دفا 2025و 2026', type: 'Direct', target: 1500, responsible: 'إيناس أيوب', mov: '1500 فرصة' },
  { activity: '1000 فرصة تطوعية من خلال 1000 مكالمه لتقييم تدخلات مشروع سوا', type: 'Direct', target: 1000, responsible: 'إيناس أيوب', mov: '1000 فرصة' },
  { activity: '270 فرصة تطوعية من خلال 270 مكالمة لتقييم تدخلات مشروع المساعدات الانسانية والطوارئ', type: 'Direct', target: 270, responsible: 'إيناس أيوب', mov: '270 فرصة' },
  { activity: '137 فرصه تطوعية من خلال 137 مكالمة لتقييم تدخلات مشروع steps forword', type: 'Direct', target: 137, responsible: 'إيناس أيوب', mov: '137 فرصة' },
  { activity: '137 فرصه تطوعية من خلال 137 زيارة ميدانية لتقييم تدخلات مشروع steps forword', type: 'Direct', target: 137, responsible: 'إيناس أيوب', mov: '137 فرصة' },
  { activity: 'عدد المتطوعين المفعلين خلال النزول الميدانى لدراسة الحالات', type: 'Direct', target: 1000, responsible: 'خضرى', mov: '1000 متطوع' },
  { activity: 'عدد المتطوعين المفعلين خلال مكالمات التقييم والمتابعه', type: 'Direct', target: 185, responsible: 'إيناس أيوب', mov: '185 متطوع' },
  { activity: 'عدد المتطوعين المدربين على ادارة الحالة', type: 'Direct', target: 1000, responsible: 'خضرى', mov: '1000 متطوع' },
  { activity: 'حجم تمويل 67 مليون جنيه من خلال مشروع فرونتكس', type: 'Direct', target: 67000000, responsible: 'ياسمين', mov: '67 مليون جنيه' },
  { activity: 'زيادة التوفير من  8 مليون جنيه الى  28 مليون جنيه من مشروع فرونتكس', type: 'In direct', target: 28000000, responsible: 'ياسمين', mov: '28 مليون جنيه' },
  { activity: 'عدد عائدين تم استقبالهم وفقا للشروط', type: 'Direct', target: 600, responsible: 'نرمين', mov: '600 عائد' },
  { activity: 'تنفيذ برتوكولات تعاون مع الجهات المعنية', type: 'Direct', target: 3, responsible: 'ياسمين', mov: '3 بروتوكولات' },
  { activity: 'عدد حملة كل شهر للتوعية عن الهجرة', type: 'In direct', target: 48, responsible: 'داليا', mov: '48 حملة' },
  { activity: 'بوستات  للتوعية  من خلال السوشيال ميديا', type: 'In direct', target: 24, responsible: 'داليا', mov: '24 بوست' },
  { activity: 'تنفيذ مؤتمر لجميع الشركاء و اصحاب المصلحة تكون صناع الحياة فيه الرائدة في مجال العودة و اعادة الدمج', type: 'Direct', target: 1, responsible: 'ياسمين', mov: '1 مؤتمر' },
  { activity: 'تنفيذ على الاقل شراكة تمتد لنهاية 2026 في كل مجالا من مجالات الخدمات الى يتم التقييم بناء عليها', type: 'Direct', target: 7, responsible: 'ياسمين', mov: '7 شراكات' },
  { activity: 'تحديث الاجراءات القياسية الخاصة بادارة الحالة و برنامج العائدين', type: 'Direct', target: 100, responsible: 'خضري و نرمين', mov: '100%' },
  { activity: 'تدريب 50 متطوع على انشطة الدمج و اعادة الادماج على المستوى المتقدم و المتخصص في الدعم النفسي و الانشطة المتخصصة', type: 'Direct', target: 50, responsible: 'نرمين', mov: '50 متطوع' },
];

// KPIs that need to be linked (we'll try to match them)
const kpiMapping = {
  'عدد المستفيدين من المشروعات الخيرية': null, // Will try to find in main_plan_objectives
  'عدد المستفيدين من المشروعات التنموية': null,
  'عدد الفرص التطوعية المتاحة سنويا': null,
  'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين': null,
  'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا': null,
  'حجم التمويل لتلك المنح': null,
  'عدد مذكرات التفاهم أو الخطابات الرسمية المؤيدة / عدد الوزارات أو الجهات الحكومية المشاركة': null,
  'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)': null,
  'عدد الشراكات مع القطاع الخاص فى الملف': null,
  'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs': null,
};

async function addCaseManagementData() {
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

    // Get all KPIs from main_plan_objectives to try matching
    console.log('Loading KPIs from main_plan_objectives...');
    const kpisResult = await pool.request().query(`
      SELECT id, kpi FROM main_plan_objectives
    `);
    const kpiMap = new Map();
    kpisResult.recordset.forEach(row => {
      kpiMap.set(row.kpi.trim(), row.id);
    });
    console.log(`✓ Loaded ${kpiMap.size} KPIs\n`);

    // Try to match KPIs
    const matchedKPIs = new Map();
    for (const [kpiName, _] of Object.entries(kpiMapping)) {
      // Try exact match first
      let found = false;
      for (const [dbKpi, id] of kpiMap.entries()) {
        if (dbKpi.includes(kpiName) || kpiName.includes(dbKpi.split(/\s/)[0])) {
          matchedKPIs.set(kpiName, id);
          found = true;
          break;
        }
      }
      if (!found) {
        // Try partial match
        const kpiWords = kpiName.split(/\s+/).slice(0, 3);
        for (const [dbKpi, id] of kpiMap.entries()) {
          if (kpiWords.some(word => dbKpi.includes(word))) {
            matchedKPIs.set(kpiName, id);
            break;
          }
        }
      }
    }

    console.log('Creating department objectives...\n');
    let inserted = 0;
    let updated = 0;
    const createdObjectives = [];

    for (const activity of activities) {
      // Try to find matching KPI
      let mainObjectiveId = null;
      let kpi = activity.activity; // Use activity as KPI if no match found
      
      // Try to match with known KPIs
      for (const [kpiName, mainId] of matchedKPIs.entries()) {
        if (activity.activity.includes(kpiName) || kpiName.includes(activity.activity.split(/\s/)[0])) {
          mainObjectiveId = mainId;
          kpi = kpiName;
          break;
        }
      }

      // If no match, try to extract KPI from activity
      if (!mainObjectiveId) {
        // Try to find a KPI that matches the activity
        for (const [dbKpi, id] of kpiMap.entries()) {
          const activityWords = activity.activity.split(/\s+/).slice(0, 5);
          const kpiWords = dbKpi.split(/\s+/).slice(0, 5);
          const commonWords = activityWords.filter(w => kpiWords.includes(w));
          if (commonWords.length >= 2) {
            mainObjectiveId = id;
            kpi = dbKpi;
            break;
          }
        }
      }

      try {
        // Check if department objective already exists
        const checkRequest = pool.request();
        checkRequest.input('department_id', sql.Int, departmentId);
        checkRequest.input('activity', sql.NVarChar, activity.activity);
        const existing = await checkRequest.query(`
          SELECT id FROM department_objectives 
          WHERE department_id = @department_id AND activity = @activity
        `);

        if (existing.recordset.length > 0) {
          // Update existing
          const updateRequest = pool.request();
          updateRequest.input('id', sql.Int, existing.recordset[0].id);
          updateRequest.input('main_objective_id', sql.Int, mainObjectiveId);
          updateRequest.input('kpi', sql.NVarChar, kpi);
          updateRequest.input('type', sql.NVarChar, activity.type);
          updateRequest.input('activity_target', sql.Decimal(18, 2), activity.target);
          updateRequest.input('responsible_person', sql.NVarChar, activity.responsible);
          updateRequest.input('mov', sql.NVarChar, activity.mov);

          await updateRequest.query(`
            UPDATE department_objectives
            SET main_objective_id = @main_objective_id,
                kpi = @kpi,
                type = @type,
                activity_target = @activity_target,
                responsible_person = @responsible_person,
                mov = @mov,
                updated_at = GETDATE()
            WHERE id = @id
          `);
          console.log(`✓ Updated: ${activity.activity.substring(0, 50)}...`);
          updated++;
          createdObjectives.push(existing.recordset[0].id);
        } else {
          // Insert new
          const insertRequest = pool.request();
          insertRequest.input('main_objective_id', sql.Int, mainObjectiveId);
          insertRequest.input('department_id', sql.Int, departmentId);
          insertRequest.input('kpi', sql.NVarChar, kpi);
          insertRequest.input('activity', sql.NVarChar, activity.activity);
          insertRequest.input('type', sql.NVarChar, activity.type);
          insertRequest.input('activity_target', sql.Decimal(18, 2), activity.target);
          insertRequest.input('responsible_person', sql.NVarChar, activity.responsible);
          insertRequest.input('mov', sql.NVarChar, activity.mov);

          const result = await insertRequest.query(`
            INSERT INTO department_objectives (main_objective_id, department_id, kpi, activity, type, activity_target, responsible_person, mov)
            OUTPUT INSERTED.id
            VALUES (@main_objective_id, @department_id, @kpi, @activity, @type, @activity_target, @responsible_person, @mov)
          `);
          const newId = result.recordset[0].id;
          console.log(`✓ Inserted: ${activity.activity.substring(0, 50)}... (ID: ${newId})`);
          inserted++;
          createdObjectives.push(newId);
        }
      } catch (error) {
        console.error(`✗ Error processing: ${activity.activity.substring(0, 50)}...`);
        console.error(`  Error: ${error.message}`);
      }
    }

    console.log(`\n✓ Completed department objectives!`);
    console.log(`  - Inserted: ${inserted} records`);
    console.log(`  - Updated: ${updated} records`);

    // Create monthly data for 2025 (12 months)
    console.log('\nCreating monthly data for 2025...\n');
    let monthlyInserted = 0;
    const months = [
      '2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01',
      '2025-05-01', '2025-06-01', '2025-07-01', '2025-08-01',
      '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01'
    ];

    for (const deptObjId of createdObjectives) {
      // Get the activity target
      const targetRequest = pool.request();
      targetRequest.input('id', sql.Int, deptObjId);
      const targetResult = await targetRequest.query(`
        SELECT activity_target FROM department_objectives WHERE id = @id
      `);
      
      if (targetResult.recordset.length === 0) continue;
      
      const annualTarget = targetResult.recordset[0].activity_target || 0;
      const monthlyTarget = annualTarget / 12; // Distribute evenly across 12 months

      for (const month of months) {
        try {
          const monthlyRequest = pool.request();
          monthlyRequest.input('department_objective_id', sql.Int, deptObjId);
          monthlyRequest.input('month', sql.Date, month);
          monthlyRequest.input('target_value', sql.Decimal(18, 2), monthlyTarget);

          await monthlyRequest.query(`
            IF NOT EXISTS (SELECT 1 FROM department_monthly_data WHERE department_objective_id = @department_objective_id AND month = @month)
            BEGIN
              INSERT INTO department_monthly_data (department_objective_id, month, target_value, actual_value)
              VALUES (@department_objective_id, @month, @target_value, NULL)
            END
          `);
          monthlyInserted++;
        } catch (error) {
          // Ignore duplicate key errors
          if (!error.message.includes('UNIQUE KEY')) {
            console.error(`  Error creating monthly data for objective ${deptObjId}, month ${month}: ${error.message}`);
          }
        }
      }
    }

    console.log(`✓ Created ${monthlyInserted} monthly data entries`);

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

addCaseManagementData();

