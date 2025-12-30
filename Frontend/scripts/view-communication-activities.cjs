#!/usr/bin/env node

/**
 * Script to view Communication department activities in the same arrangement as provided
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

// Exact activities array in the order provided by user
const activitiesOrder = [
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'إنشاء موقع إخباري معني بنشر أخبار وقصص نجاح صناع الحياة ومقالات الرأي والتحقيقات الخاصة بالمجتمع المدني' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'توحيد وتكثيف الحضور الإعلامي على المنصات الإعلامية المختلفة عبر رسائل واضحة وموحدة' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'تنفيذ بودكاست صناع الحياة مع كبار الشخصيات الملهمة في العمل العام' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'إعداد دليل التسويق الرقمي للمنصات' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'تحليل جميع منصات صناع الحياة الرقمية (صفحات المحافظات والجامعات)' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'إعداد وثيقة "البصمة الإلكترونية" لجميع المنصات الفعالة في صناع الحياة' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'إجتماع ربع سنوي للجنة الرقمية لمجتمع صناع الحياة' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'انتاج قصص نجاح لقياس أثر المؤسسة في المجتمع لربط اسم صناع الحياة بالأثر والتنمية لدى الناس' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'حصر المشكلات المجتمعية الأكثر انتشارا في المجتمع' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'تصميم حملات رقمية مجتمعية موازية لترسيخ القيم الايجابية بالتعاون مع صفحات المتطوعين' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'تفعيل قناة اليوتيوب الخاصة بصناع الحياة ونشر 100 فيديو وريل' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'حملات إلكترونية للتوعية بالعلامة المؤسسة لدى الجمهور العام' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'حملة إلكترونية سنوية بالتعاون مع صفحات المتطوعين في مختلف المحافظات لجذب المتطوعين وتصدير صناع الحياة كمؤسسة رائدة في التطوع' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'التعاون مع المؤثرين والشخصيات الفنية لدعم حملات وبرامج صناع الحياة' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'إعداد خريطة الأثر ل 17 مشروع حالي في صناع الحياة تشمل كل خريطة: المدخلات ⟶ الأنشطة ⟶ المخرجات ⟶ النتائج ⟶ الأثر' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'انتاج قصص نجاح لقياس أثر المؤسسة في المجتمع لربط اسم صناع الحياة بالأثر والتنمية لدى الناس' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'إصدار منتجات إعلامية استراتيجية تعبر عن انجازات المؤسسة وبرامجها' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'عقد ورشة دورية داخليا مع كل العاملين بصناع الحياة لتوحيد مفاهيم المؤسسة وصورتها الذهنية' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'إعداد دليل تعريفي وهوية لغوية' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'عقد مؤتمر صحفي بحضور لفيف من الصحفيين والشركاء من أصحاب المصلحة لإبراز صناع الحياة كمؤسسة رائدة للتحول الرقمي' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'إدارة ردود وتفاعلات الجمهور في التعليقات (تثبيت التعليقات الايجابية - الرد خلال 24 ساعة)' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'تنفيذ استبيان الشركاء الحاليين والسابقين' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'التواصل الدوري مع الشركاء عبر مختلف الوسائل المتاحة' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'دعوة الشركاء على المناسبات المختلفة بالمؤسسة' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'استبيان رأي عام نصف سنوي مع الجمهور' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'إدارة السمعة المؤسسية عن طريق رصد ما يقال الكترونيا عن المؤسسة-التدخل السريع في حالات الأزمات- تضخيم المحتوى الايجابي عن المؤسسة وإعادة نشره' },
  { kpi: 'عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)', activity: 'تنفيذ محتوى توعوي تعليمي خاص بذوي الإعاقة على منصات التواصل الاجتماعي بشكل دوري في الأيام العالمية لذوي الإعاقة' },
  { kpi: 'عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)', activity: 'تنفيذ شراكات محلية ودولية مع مؤسسات معنية بمجال ذوي الإعاقة' },
  { kpi: 'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا', activity: 'رفع كفاءة ميديا المتطوعين في مختلف المحافظات عبر معسكر تدريبي مكثف' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'مسابقة "قمة الإبداع" وهي مسابقة بين فرق ميديا المتطوعين كمخرج للتدريب وتنفيذ مجموعة مهام فنية مثل تصميم وتنفيذ حملة تسويقية، وانتاج فيديوهات بالموبايل ثم انتاج فيلم قصير تبدأ عقب رمضان 2026 حتى يونيو 2026 يتداخل فيها إدارة الفاعليات ومجلس إدارة المتطوعين' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'رصد وكتابة ونشر قصص نجاح المتطوعين بموجب قصة شهريا بداية من شهر فبراير حتى شهر ديسمبر 2026 بالتعاون مع فرق ميديا المتطوعين' },
  { kpi: 'عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية', activity: 'تنفيذ مسابقة مواهب سنوية لاكتشاف المواهب بين المتطوعين في مجال الغناء والإلقاء والتمثيل' },
  { kpi: 'عدد الأنشطة الترفيهية/الثقافية/الإبداعية السنوية (رياضة – مسرح – غناء – ورش إبداع)', activity: 'فتح باب التعاون مع 3 مؤسسات وجهات تطوعية دولية لتنفيذ برامج تبادل ثقافي بين المتطوعين' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'إعداد دليل للتعامل مع الأزمات (لغة – نبرة – صياغة)' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'تدريب فرق الميديا على دليل الأزمات' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'الحصول على موافقات تصوير (خصوصًا الأطفال)' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'اعتماد مرجعيات دينية وعلمية بالحملات الحساسة' },
];

async function viewCommunicationActivities() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Communication department ID
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE code = 'communication'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Communication department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;

    // Get all activities for communication department
    const result = await pool.request()
      .input('department_id', sql.Int, departmentId)
      .query(`
        SELECT 
          id,
          kpi,
          activity,
          activity_target,
          responsible_person,
          mov,
          type
        FROM department_objectives
        WHERE department_id = @department_id
      `);

    // Create a map of activities from database by activity text
    const dbActivitiesMap = new Map();
    result.recordset.forEach(row => {
      const key = `${row.kpi}|${row.activity}`;
      dbActivitiesMap.set(key, row);
    });

    console.log(`Found ${result.recordset.length} activities\n`);
    console.log('='.repeat(100));
    console.log('COMMUNICATION DEPARTMENT ACTIVITIES');
    console.log('='.repeat(100));
    console.log('');

    let currentKpi = '';
    let kpiCount = 0;
    let totalDisplayed = 0;

    // Display in the exact order from activitiesOrder array
    for (const orderedActivity of activitiesOrder) {
      const key = `${orderedActivity.kpi}|${orderedActivity.activity}`;
      const dbRow = dbActivitiesMap.get(key);
      
      if (!dbRow) {
        // Try to find by partial match if exact match not found
        for (const [mapKey, mapRow] of dbActivitiesMap.entries()) {
          if (mapRow.kpi === orderedActivity.kpi && 
              mapRow.activity.includes(orderedActivity.activity.substring(0, 50))) {
            dbRow = mapRow;
            dbActivitiesMap.delete(mapKey);
            break;
          }
        }
      } else {
        dbActivitiesMap.delete(key);
      }

      if (dbRow) {
        if (dbRow.kpi !== currentKpi) {
          if (currentKpi !== '') {
            console.log('');
          }
          currentKpi = dbRow.kpi;
          kpiCount = 0;
          console.log(`\n[KPI: ${currentKpi}]`);
          console.log('-'.repeat(100));
        }
        
        kpiCount++;
        totalDisplayed++;
        console.log(`\n${kpiCount}. Activity: ${dbRow.activity}`);
        console.log(`   Target to Achieve: ${dbRow.activity_target || 'N/A'}`);
        console.log(`   Responsible: ${dbRow.responsible_person || 'N/A'}`);
        console.log(`   MOV: ${dbRow.mov || 'N/A'}`);
        console.log(`   Type: ${dbRow.type}`);
        console.log(`   ID: ${dbRow.id}`);
      }
    }

    // Display any remaining activities not in the ordered list
    if (dbActivitiesMap.size > 0) {
      console.log('\n\n[Additional Activities Not in Original Order]');
      console.log('-'.repeat(100));
      for (const [key, dbRow] of dbActivitiesMap.entries()) {
        if (dbRow.kpi !== currentKpi) {
          currentKpi = dbRow.kpi;
          kpiCount = 0;
          console.log(`\n[KPI: ${currentKpi}]`);
          console.log('-'.repeat(100));
        }
        kpiCount++;
        totalDisplayed++;
        console.log(`\n${kpiCount}. Activity: ${dbRow.activity}`);
        console.log(`   Target to Achieve: ${dbRow.activity_target || 'N/A'}`);
        console.log(`   Responsible: ${dbRow.responsible_person || 'N/A'}`);
        console.log(`   MOV: ${dbRow.mov || 'N/A'}`);
        console.log(`   Type: ${dbRow.type}`);
        console.log(`   ID: ${dbRow.id}`);
      }
    }

    console.log('\n' + '='.repeat(100));
    console.log(`Total: ${totalDisplayed} activities displayed`);

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

viewCommunicationActivities();

