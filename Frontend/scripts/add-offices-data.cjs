#!/usr/bin/env node

/**
 * Script to add Offices department objectives and monthly data
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

// Offices department activities data
// Format: KPI, Activity, Target
const activities = [
  // عدد المتطوعين المسجلين تراكميا
  { kpi: 'عدد المتطوعين المسجلين تراكميا', activity: 'عمل اداة حصر واقعي لعدد المتطوعين الفعالين المسجلين حاليا بعد مراجعتهم', target: 15000 },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', activity: 'عمل اداة موحدة وبسيطة  لتسجيل طلبات التطوع الجديدة', target: null },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', activity: 'تصميم واطلاق حملات مركزية كبيرة لجذب المتطوعين اونلاين', target: null },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', activity: 'تصميم واطلاق حملات ميدانية مركزية لجذب المتطوعين', target: null },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', activity: 'تصميم حملة لمتطوع اليوم الواحد  لضم 3,000 متطوع جديد', target: null },
  
  // عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', activity: 'تنفيذ 1500 معرض ملابس لتوفير 7500 فرصة تطوعة', target: 10000 },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', activity: 'تنفيذ 1500 نشاط توعوي وترفيهي للأطفال لتوفير 7500 فرصة تطوعية', target: null },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', activity: 'تنفيذ 300 قافلة قرية في 300 قرية لتوفير 9000 فرصة تطوعية', target: null },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', activity: 'تنفيذ 400 زيارة لدور الايتام والمسنين لتوفير 2000 فرصة تطوعية', target: null },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', activity: 'تنفيذ 150 قافلة طبية لتوفير 1500 فرصة تطوعية', target: null },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', activity: 'تنظيم 6 ماراثون للتطوع في 6 محافظات مختلفة لتوفير 3000 فرصة تطوعية', target: null },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', activity: 'تنظيم 3 قوافل مركزية في المحافظات الحدودية لتوفير 300 فرصة تطوعية', target: null },
  
  // عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', activity: 'توفير فرص تطوعية متنوعة لتناسب الفئات المختلفة', target: null },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', activity: 'تمكين المتطوعين للادوار القيادية', target: null },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', activity: 'توفير مزايا اضافية من منح تدريبية او حضور فاعليات مركزية او شهادات مشاركة', target: null },
  
  // تمثيل الفئات المهمشة (ذوي الإعاقة)
  { kpi: 'تمثيل الفئات المهمشة (ذوي الإعاقة)', activity: 'اتاحة الفرص التطوعية المناسبة لمشاركة أصحاب الاعاقات المختلفة', target: 42 },
  { kpi: 'تمثيل الفئات المهمشة (ذوي الإعاقة)', activity: ' 4 مقرات من مقرات مكاتب صناع الحياة مؤهلة لإستقبال متطوعين ذى اعاقة', target: null },
  { kpi: 'تمثيل الفئات المهمشة (ذوي الإعاقة)', activity: 'تصميم استمارات تقييم الرضا', target: null },
  
  // نسبة المتطوعين الحاصلين على تدريبات اساسية من المتطوعين النشطين - سنويا
  { kpi: 'نسبة المتطوعين الحاصلين على تدريبات اساسية من المتطوعين النشطين - سنويا', activity: 'تنفيذ 500 تدريب تاهيلي للمتطوعين', target: null },
  
  // عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا
  { kpi: 'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا', activity: 'تصميم برامج تدريبية متقدمة للقادة', target: null },
  
  // عدد المتطوعين المؤهلين للقيادة التطوعية - سنويا
  { kpi: 'عدد المتطوعين المؤهلين للقيادة التطوعية - سنويا', activity: 'تصميم وبناء مسار تطوعي', target: null },
  { kpi: 'عدد المتطوعين المؤهلين للقيادة التطوعية - سنويا', activity: 'وضع معايير الترشح لأدوار قياادية', target: null },
  { kpi: 'عدد المتطوعين المؤهلين للقيادة التطوعية - سنويا', activity: 'تصميم برنامج تدريب لاعداد القادة', target: null },
  { kpi: 'عدد المتطوعين المؤهلين للقيادة التطوعية - سنويا', activity: 'وضع برنامج تدريب ميداني لقادة المحتملين لتدريبهم عمليا', target: null },
  
  // معدل الفرص التطوعية التي تم تفعيلها من المتاح – 80% من المتاح
  { kpi: 'معدل الفرص التطوعية التي تم تفعيلها من المتاح – 80% من المتاح', activity: 'تصميم استمارة متابعة تفعيل المتطوعين بالفرص التطوعية', target: null },
  
  // نسبة الفرص التطوعية التي تمت اتاحتها من خلال شراكات مع جهات أخري فيما عدا المشاريع
  { kpi: 'نسبة الفرص التطوعية التي تمت اتاحتها من خلال شراكات مع جهات أخري فيما عدا المشاريع', activity: 'عمل شراكات محلية داخل المحافظات', target: null },
  
  // متوسط وقت اسناد الفرصة للمتطوع ( الوقت بين التسجيل على الفرصة وتفعيل المتطوع )بالساعات افضل
  { kpi: 'متوسط وقت اسناد الفرصة للمتطوع ( الوقت بين التسجيل على الفرصة وتفعيل المتطوع )بالساعات افضل', activity: 'ارساله رساله ترحيبية مجرد تسجيله, تحديد موعد الاستقبال بعد التسجيل ب 4 ايام, عرض فرص تطوعية مختلفة علي المتطوعين الجدد مجرد وجودهم', target: null },
  
  // عدد الفرص التطوعية المدارة رقميا من خلال صناع الحياة – 20% من المتاح
  { kpi: 'عدد الفرص التطوعية المدارة رقميا من خلال صناع الحياة – 20% من المتاح', activity: 'توفير فرص تطوعية مختلفة لتفعيل المتطوعين بالملفات التي تدار رقمياً كملفات ( تسجيل البيانات, الميديا,....', target: null },
  
  // عدد المبادرات التطوعية المرشحة من متطوعين وتم تبنيها من المؤسسة ( مبادرة يتم تفعيل 10 متطوعين فيها على الأقل )
  { kpi: 'عدد المبادرات التطوعية المرشحة من متطوعين وتم تبنيها من المؤسسة ( مبادرة يتم تفعيل 10 متطوعين فيها على الأقل )', activity: 'تدريب 300 متطوع علي تصميم المبادرات المجتمعية', target: 20 },
  { kpi: 'عدد المبادرات التطوعية المرشحة من متطوعين وتم تبنيها من المؤسسة ( مبادرة يتم تفعيل 10 متطوعين فيها على الأقل )', activity: 'عمل مسابقة بين المحافظة لتقدم بمبادرات محلية', target: null },
  { kpi: 'عدد المبادرات التطوعية المرشحة من متطوعين وتم تبنيها من المؤسسة ( مبادرة يتم تفعيل 10 متطوعين فيها على الأقل )', activity: 'تشكيل لجنة لتقييم المبادرات وتبني افضل 10 مبادرات', target: null },
  
  // عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية
  { kpi: 'عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية', activity: 'اكتشاف القصص عن طريق اطلاق فورم لترشيح النجاحات بشكل شهري', target: null },
  { kpi: 'عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية', activity: 'تدريب القادة و المنسقين علي التقاط القصص', target: null },
  { kpi: 'عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية', activity: 'ابراز القصص و نشرها و الافتخار بها', target: null },
  { kpi: 'عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية', activity: 'نشر قصص قداما صناع الحياة الملهمين و تحويلهم لسفراء', target: null },
  
  // نسبة رضا المستفيدين عن الخدمات المقدمة من المتطوعين
  { kpi: 'نسبة رضا المستفيدين عن الخدمات المقدمة من المتطوعين', activity: 'تصميم استمارات تقييم الرضا', target: null },
  
  // معدل رضا المتطوعين عن الأنشطة (استبيان سنوي)
  { kpi: 'معدل رضا المتطوعين عن الأنشطة (استبيان سنوي)', activity: 'تصميم استمارات تقييم الرضا', target: null },
  
  // عدد الشراكات القاعدية
  { kpi: 'عدد الشراكات القاعدية', activity: 'حصر بخريطة الشركاء المحتملين', target: null },
  { kpi: 'عدد الشراكات القاعدية', activity: 'اعداد دليل لطرق الشراكات والشراكات المتاحة', target: null },
  { kpi: 'عدد الشراكات القاعدية', activity: 'زيارات ميدانية للجمعيات القاعدية المستهدفة', target: null },
  { kpi: 'عدد الشراكات القاعدية', activity: 'ابراز الشراكات', target: null },
  
  // عدد المتطوعين المشاركين
  { kpi: 'عدد المتطوعين المشاركين', activity: '', target: null },
  
  // عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)
  { kpi: 'عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)', activity: '', target: null },
  { kpi: 'عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)', activity: '', target: null },
  
  // عدد الفرص التطوعية المتاحة سنويا
  { kpi: 'عدد الفرص التطوعية المتاحة سنويا', activity: 'تنفيذ 1,500 معرض ملابس لتوفير 7,500 فرصة تطوعة', target: null },
  { kpi: 'عدد الفرص التطوعية المتاحة سنويا', activity: 'تنفيذ 1,500 نشاط توعوي وترفيهي للأطفال لتوفير 7,500 فرصة تطوعية', target: null },
  { kpi: 'عدد الفرص التطوعية المتاحة سنويا', activity: 'تنفيذ 300 قافلة قرية في 300 قرية لتوفير 9,000 فرصة تطوعية', target: null },
  { kpi: 'عدد الفرص التطوعية المتاحة سنويا', activity: 'تنفيذ 400 زيارة لدور الايتام والمسنين لتوفير 2,000 فرصة تطوعية', target: null },
  { kpi: 'عدد الفرص التطوعية المتاحة سنويا', activity: 'تنفيذ 150 قافلة طبية لتوفير 1,500 فرصة تطوعية', target: null },
  { kpi: 'عدد الفرص التطوعية المتاحة سنويا', activity: 'تنظيم 6 ماراثون للتطوع في 6 محافظات مختلفة لتوفير 3و000 فرصة تطوعية', target: null },
  { kpi: 'عدد الفرص التطوعية المتاحة سنويا', activity: 'تنظيم 3 قوافل مركزية في المحافظات الحدودية لتوفير 300 فرصة تطوعية', target: null },
];

async function addOfficesData() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Offices department
    console.log('Getting Offices department...');
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE code = 'offices' OR name LIKE '%Offices%'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Offices department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Offices department (ID: ${departmentId})\n`);

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

    // Normalize KPI function (remove numeric prefixes and extra spaces)
    const normalizeKPI = (kpi) => {
      if (!kpi) return '';
      return kpi.replace(/^\d+(\.\d+)*\s*/, '').trim().toLowerCase();
    };

    // Try to match KPIs
    const matchedKPIs = new Map();
    for (const activity of activities) {
      if (!matchedKPIs.has(activity.kpi)) {
        const normalizedActivityKPI = normalizeKPI(activity.kpi);
        let found = false;
        
        // Try exact match first
        for (const [dbKpi, id] of kpiMap.entries()) {
          if (normalizeKPI(dbKpi) === normalizedActivityKPI) {
            matchedKPIs.set(activity.kpi, id);
            found = true;
            break;
          }
        }
        
        // Try partial match if exact match failed
        if (!found) {
          const activityKeywords = normalizedActivityKPI.split(/\s+/).filter(w => w.length > 2);
          for (const [dbKpi, id] of kpiMap.entries()) {
            const dbNormalized = normalizeKPI(dbKpi);
            const dbKeywords = dbNormalized.split(/\s+/).filter(w => w.length > 2);
            // Check if most keywords match
            const matchingKeywords = activityKeywords.filter(kw => 
              dbKeywords.some(dbKw => dbKw.includes(kw) || kw.includes(dbKw))
            );
            if (matchingKeywords.length >= Math.min(3, activityKeywords.length)) {
              matchedKPIs.set(activity.kpi, id);
              found = true;
              break;
            }
          }
        }
        
        if (!found) {
          console.log(`⚠ Could not match KPI: ${activity.kpi}`);
        }
      }
    }

    console.log(`✓ Matched ${matchedKPIs.size} out of ${new Set(activities.map(a => a.kpi)).size} unique KPIs\n`);

    // Insert department objectives
    console.log('\nCreating department objectives...\n');
    let inserted = 0;
    let updated = 0;
    const createdObjectives = [];

    for (const activity of activities) {
      // Use the KPI from activity object
      let mainObjectiveId = matchedKPIs.get(activity.kpi) || null;
      const kpi = activity.kpi;
      
      // Parse target
      let activityTarget = activity.target;
      if (activityTarget && typeof activityTarget === 'string') {
        // Try to parse as number
        const parsed = parseFloat(activityTarget.replace(/,/g, ''));
        activityTarget = isNaN(parsed) ? null : parsed;
      }
      // Default to 0 if still no target
      activityTarget = activityTarget || 0;

      try {
        // Check if department objective already exists
        const checkRequest = pool.request();
        checkRequest.input('department_id', sql.Int, departmentId);
        checkRequest.input('activity', sql.NVarChar, activity.activity || '');
        checkRequest.input('kpi', sql.NVarChar, kpi);
        const existing = await checkRequest.query(`
          SELECT id FROM department_objectives 
          WHERE department_id = @department_id AND activity = @activity AND kpi = @kpi
        `);

        if (existing.recordset.length > 0) {
          // Update existing
          const updateRequest = pool.request();
          updateRequest.input('id', sql.Int, existing.recordset[0].id);
          updateRequest.input('main_objective_id', sql.Int, mainObjectiveId);
          updateRequest.input('kpi', sql.NVarChar, kpi);
          updateRequest.input('type', sql.NVarChar, null);
          updateRequest.input('activity_target', sql.Decimal(18, 2), activityTarget);
          updateRequest.input('responsible_person', sql.NVarChar, '');
          updateRequest.input('mov', sql.NVarChar, '');

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
          console.log(`✓ Updated: ${(activity.activity || '').substring(0, 50)}...`);
          updated++;
          createdObjectives.push(existing.recordset[0].id);
        } else {
          // Insert new
          const insertRequest = pool.request();
          insertRequest.input('main_objective_id', sql.Int, mainObjectiveId);
          insertRequest.input('department_id', sql.Int, departmentId);
          insertRequest.input('kpi', sql.NVarChar, kpi);
          insertRequest.input('activity', sql.NVarChar, activity.activity || '');
          insertRequest.input('type', sql.NVarChar, null);
          insertRequest.input('activity_target', sql.Decimal(18, 2), activityTarget);
          insertRequest.input('responsible_person', sql.NVarChar, '');
          insertRequest.input('mov', sql.NVarChar, '');

          const result = await insertRequest.query(`
            INSERT INTO department_objectives (main_objective_id, department_id, kpi, activity, type, activity_target, responsible_person, mov)
            OUTPUT INSERTED.id
            VALUES (@main_objective_id, @department_id, @kpi, @activity, @type, @activity_target, @responsible_person, @mov)
          `);
          const newId = result.recordset[0].id;
          console.log(`✓ Inserted: ${(activity.activity || '').substring(0, 50)}... (ID: ${newId})`);
          inserted++;
          createdObjectives.push(newId);
        }
      } catch (error) {
        console.error(`✗ Error processing: ${(activity.activity || '').substring(0, 50)}...`);
        console.error(`  Error: ${error.message}`);
      }
    }

    console.log(`\n✓ Completed department objectives!`);
    console.log(`  - Inserted: ${inserted} records`);
    console.log(`  - Updated: ${updated} records`);

    // Create monthly data for 2026 (12 months)
    console.log('\nCreating monthly data for 2026...\n');
    let monthlyInserted = 0;
    const months = [
      '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01',
      '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01',
      '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'
    ];

    for (const deptObjId of createdObjectives) {
      // Get the activity target, KPI, and department_id
      const targetRequest = pool.request();
      targetRequest.input('id', sql.Int, deptObjId);
      const targetResult = await targetRequest.query(`
        SELECT activity_target, kpi, department_id FROM department_objectives WHERE id = @id
      `);
      
      if (targetResult.recordset.length === 0) continue;
      
      const annualTarget = targetResult.recordset[0].activity_target || 0;
      const kpi = targetResult.recordset[0].kpi;
      const deptId = targetResult.recordset[0].department_id;
      const monthlyTarget = annualTarget > 0 ? annualTarget / 12 : null; // Distribute evenly across 12 months

      for (const month of months) {
        try {
          const monthlyRequest = pool.request();
          monthlyRequest.input('kpi', sql.NVarChar, kpi);
          monthlyRequest.input('department_id', sql.Int, deptId);
          monthlyRequest.input('month', sql.Date, month);
          monthlyRequest.input('target_value', sql.Decimal(18, 2), monthlyTarget);

          await monthlyRequest.query(`
            IF NOT EXISTS (SELECT 1 FROM department_monthly_data WHERE kpi = @kpi AND department_id = @department_id AND month = @month)
            BEGIN
              INSERT INTO department_monthly_data (kpi, department_id, month, target_value, actual_value)
              VALUES (@kpi, @department_id, @month, @target_value, NULL)
            END
          `);
          monthlyInserted++;
        } catch (error) {
          // Ignore duplicate key errors
          if (!error.message.includes('UNIQUE KEY') && !error.message.includes('UNIQUE constraint')) {
            console.error(`  Error creating monthly data for objective ${deptObjId}, month ${month}: ${error.message}`);
          }
        }
      }
    }

    console.log(`✓ Created ${monthlyInserted} monthly data entries`);

    console.log('✅ Offices department data import completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('✓ Database connection closed');
    }
  }
}

addOfficesData().catch(console.error);

