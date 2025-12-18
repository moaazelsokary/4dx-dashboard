#!/usr/bin/env node

/**
 * Script to add Communication department objectives and monthly data
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

// Activities data for Communication department
const activities = [
  // مستوى الوعي بالعلامة المؤسسية (Brand Awareness)
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'تأسيس موقع خبري (ربحي)', type: 'Direct', target: 1, responsible: 'عصام عبد العزيز', mov: '- موقع خبري\n- عدد زيارات الموقع' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'زيادة نسبة الظهور الإعلامي 20 % عن العام الماضي', type: 'Direct', target: 20, responsible: 'مسؤول الاتصال', mov: '- عدد الظهور الإعلامي\n- تكرار ذكر اسم المؤسسة' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'لتصدير صناع الحياة كمؤسسة رائدة في العمل التنموي والتطوعي', type: 'Direct', target: 1, responsible: 'محمد الموجي', mov: '' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'انتاج 24 قصة نجاح مكتوبة ومرئية ونشرها على الموقع ووسائل التواصل الاجتماعي الخاصة بالمؤسسة', type: 'Direct', target: 24, responsible: 'محمد الموجي - ولاء الدين محمد', mov: '- Engagement rate\n- share rate' },
  
  // حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'لتحسين ظهور صناع الحياة بالصورة المنشودة على محركات البحث وتحقيق عائد ربحي فيما بعد للمؤسسة', type: 'Direct', target: 1, responsible: 'مسؤول الاتصال - عصام عبد العزيز', mov: 'Engagement rate\nFollowers' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'الوصول لمليون شخص عبر منصات التواصل الاجتماعي المختلفة لصناع الحياة', type: 'Direct', target: 1000000, responsible: 'لبنى عصام', mov: 'تقرير فني يوضح:\n- Reach&impression\n- Brand Search Volume\n- Hashtag usage' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'الوصول لمليون شخص عبر منصات التواصل الاجتماعي المختلفة لصناع الحياة', type: 'Direct', target: 1000000, responsible: '', mov: 'تقرير فني يوضح:\n- Reach &engagement' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'الوصول ل 8 شخصيات مؤثرة للمشاركة في الأربع حملات الرئيسية للمؤسسة (شتاء- مدارس- رمضان- أضاحي)', type: 'Direct', target: 8, responsible: 'مسؤول التواصل', mov: '- عدد الحملات التي تم المشاركة فيها من قبل المؤثرين\n- عدد المنشن لصناع الحياة من قبل المؤثرين\n- Reach&engagement على صفحة المؤسسة' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'لزيادة تفاعل المتابعين وزيادة ولائهم', type: 'Direct', target: 1, responsible: 'لبنى عصام', mov: 'Response rate' },
  
  // مؤشر السمعة المؤسسية Net Promoter Score NPS
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: '- إصدار تقرير سنوي لإنجازات المؤسسة\n- إنتاج فيلم عالي الجودة سنوي\n- إصدار تقارير نصف سنوية للشركاء', type: 'Direct', target: 1, responsible: 'مسؤول التواصل', mov: '- تقرير سنوي باللغتين العربية والانجليزية\n- 2 نشرات نصف سنوية للشركاء\n- فيلم وثائقي سنوي' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'تنفيذ ورشة بمعدل نصف سنوي لجميع العاملين وتوحيد درجة وعي جميع العاملين بصناع الحياة', type: 'Direct', target: 2, responsible: 'مديرة الإدارة', mov: '- محتوى الورشة معتمد من الرئيس التنفيذي\n- سجل حضور ورشتين' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'تصدير صناع الحياة كمؤسسة رائدة في مجال التحول الرقمي وتوثيق تجربتها الفريدة في التحول لإقرار ذلك', type: 'Direct', target: 1, responsible: '', mov: '' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: '- إرسال هدية سنوية من انتاج المستفيدين\n- تهنئة بالمناسبات الأساسية في العام\n- تهنئة بالمناسبات الشخصية لكبار الشركاء وأصحاب المصلحة', type: 'Direct', target: 1, responsible: 'مسؤول الاتصال', mov: 'خريطة بأصحاب المصلحة\nقائمة باسماء وبيانات الجهات الشريكة لتاريخه\nقائمة check list بالمنتجات الاعلامية المرسلة' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'الحفاظ على الشركاء مطلعين على أنشطة المؤسسة', type: 'Direct', target: 1, responsible: 'مسؤول الاتصال', mov: 'check list لمختلف المناسبات مصححة بالدعوات' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'للوقوف على صورة المؤسسة بين الجمهور وتعديل اداء المؤسسة ورسالتها للجمهور', type: 'Direct', target: 1, responsible: 'مديرة الإدارة', mov: 'استبيان مخصص للجمهور' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'تحسين الانطباع العام وتقليل التقييمات السيئة المباشرة', type: 'Direct', target: 1, responsible: 'مديرة الادارة', mov: 'تقرير ربع سنوي بتوصيات' },
  
  // عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)
  { kpi: 'عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)', activity: 'ترسيخ فكرة أن صناع الحياة مؤسسة تعتني بذوي الاعاقة ولديها خبرة قائمة على العلم والعمل في هذا المجال', type: 'Direct', target: 1, responsible: 'لبنى عصام', mov: 'Reach & engagement' },
  { kpi: 'عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)', activity: 'تعظيم الاستفادة ودعم الريادة المجتمعية لصناع الحياة في هذا المجال', type: 'Direct', target: 1, responsible: 'مسؤول الاتصال', mov: 'عدد الشركاء المشاركين\nحجم الوصول عبر قنواتهم\nتوثيق التعاون' },
  
  // عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا
  { kpi: 'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا', activity: 'تكوين فرق إعلامية من المتطوعين على نفس درجة المعرفة والعلم للمساعدة في رصد قصص النجاح وأبرز الأحداث في كل محافظة', type: 'Direct', target: 1, responsible: 'مديرة الإدارة', mov: 'كشف اسماء الحضور\nمادة علمية' },
  { kpi: 'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا', activity: 'إشراك الكفاءات المتعددة من ميديا المتطوعين في الانشطة الاعلامية والتسويقية للمؤسسة بالإضافة إلى توفير فرص تطوعية فعالة في مجال الإعلام', type: 'Direct', target: 1, responsible: 'مديرة الإدارة', mov: '' },
  
  // عدد المتطوعين النشطين
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', activity: 'لدعم فكرة أن صناع الحياة بيت لكل متطوع ومؤسسة مرجعية للتطوع', type: 'Direct', target: 10, responsible: 'محمد الموجي - ولاء محمد - عصام عبد العزيز', mov: '10 قصص (فيديو - تحقيق صحفي - قصة مكتوبة)' },
  
  // عدد قصص النجاح
  { kpi: 'عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية', activity: 'اكتشاف المواهب بين المتطوعين وتنمية مهاراتهم الابداعية وترجمة أن صناع الحياة هي بيت لكل متطوع ينميه ويكتشف مواهبة، بالإضافة إلى تعظيم الاستثمار في قدراتهم الابداعية بما ينعكس على صناع الحياة', type: 'Direct', target: 5, responsible: 'عبد الناصر - مسؤول التواصل', mov: 'اكتشاف 5 مواهب على الأقل بين المتقدمين للمسابقة' },
  
  // عدد الأنشطة الترفيهية/الثقافية/الإبداعية السنوية
  { kpi: 'عدد الأنشطة الترفيهية/الثقافية/الإبداعية السنوية (رياضة – مسرح – غناء – ورش إبداع)', activity: 'تعظيم الاستفادة من التجربة التطوعية لمتطوعي صناع الحياة', type: 'Direct', target: 3, responsible: 'مسؤول الاتصال', mov: '3 بروتوكولات تعاون' },
  
  // عدد برامج التبادل التطوعي الدولي المنفذة سنويًا
  { kpi: 'عدد برامج التبادل التطوعي الدولي المنفذة سنويًا', activity: 'تعظيم الاستفادة من التجربة التطوعية لمتطوعي صناع الحياة', type: 'Direct', target: 1, responsible: 'مسؤول الاتصال', mov: '3 بروتوكولات تعاون' },
];

// KPIs that need to be linked (we'll try to match them)
const kpiMapping = {
  'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)': null,
  'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)': null,
  'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء': null,
  'عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)': null,
  'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا': null,
  'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين': null,
  'عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية': null,
  'عدد الأنشطة الترفيهية/الثقافية/الإبداعية السنوية (رياضة – مسرح – غناء – ورش إبداع)': null,
  'عدد برامج التبادل التطوعي الدولي المنفذة سنويًا': null,
};

async function addCommunicationData() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Communication department ID
    console.log('Getting Communication department...');
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE name = 'Communication' OR name LIKE '%Communication%' OR name LIKE '%اتصال%' OR name LIKE '%تواصل%'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Communication department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Communication department (ID: ${departmentId})\n`);

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
        // Normalize both for comparison (remove numeric prefixes)
        const normalizeKPI = (kpi) => kpi.replace(/^\d+(\.\d+)*\s*/, '').trim();
        const normalizedKpiName = normalizeKPI(kpiName).toLowerCase();
        const normalizedDbKpi = normalizeKPI(dbKpi).toLowerCase();
        
        if (normalizedDbKpi === normalizedKpiName || 
            dbKpi.includes(kpiName) || 
            kpiName.includes(dbKpi.split(/\s/)[0])) {
          matchedKPIs.set(kpiName, id);
          found = true;
          console.log(`  ✓ Matched: "${kpiName}" -> "${dbKpi}" (ID: ${id})`);
          break;
        }
      }
      if (!found) {
        // Try partial match
        const kpiWords = kpiName.split(/\s+/).slice(0, 5);
        for (const [dbKpi, id] of kpiMap.entries()) {
          if (kpiWords.some(word => word.length > 3 && dbKpi.includes(word))) {
            matchedKPIs.set(kpiName, id);
            console.log(`  ✓ Partially matched: "${kpiName}" -> "${dbKpi}" (ID: ${id})`);
            break;
          }
        }
      }
    }

    console.log('\nCreating department objectives...\n');
    let inserted = 0;
    let updated = 0;
    const createdObjectives = [];

    for (const activity of activities) {
      // Use the KPI from activity object
      let mainObjectiveId = matchedKPIs.get(activity.kpi) || null;
      const kpi = activity.kpi;

      // If no match found, try to find a KPI that matches
      if (!mainObjectiveId) {
        for (const [dbKpi, id] of kpiMap.entries()) {
          const normalizeKPI = (kpi) => kpi.replace(/^\d+(\.\d+)*\s*/, '').trim();
          const normalizedKpi = normalizeKPI(activity.kpi).toLowerCase();
          const normalizedDbKpi = normalizeKPI(dbKpi).toLowerCase();
          
          if (normalizedDbKpi === normalizedKpi || 
              normalizedDbKpi.includes(normalizedKpi.substring(0, 20)) ||
              normalizedKpi.includes(normalizedDbKpi.substring(0, 20))) {
            mainObjectiveId = id;
            console.log(`  ✓ Auto-matched: "${activity.kpi}" -> "${dbKpi}" (ID: ${id})`);
            break;
          }
        }
      }

      try {
        // Check if department objective already exists
        const checkRequest = pool.request();
        checkRequest.input('department_id', sql.Int, departmentId);
        checkRequest.input('activity', sql.NVarChar, activity.activity);
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
      const monthlyTarget = annualTarget / 12; // Distribute evenly across 12 months

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

addCommunicationData();

