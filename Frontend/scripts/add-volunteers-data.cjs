#!/usr/bin/env node

/**
 * Script to add Volunteers department objectives and monthly data
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

// Volunteers department activities data
// Format: KPI, Target (optional), Activity, Target to Achieve, Responsible, Verification Means
const activities = [
  // عدد المتطوعين المسجلين تراكميا
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تشكيل فريق مركزي ولا مركزي  للجذب والاستقطاب', target_to_achieve: 'تصميم هيكل مركزي للجذب ومتنساب مع حجم العمل على مستوى مصر', responsible: 'مريم محمد', mov: '' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تشكيل فريق مركزي ولا مركزي لاستقبال المتطوعين', target_to_achieve: 'تصميم هيكل مركزي للاستقبال ومتنساب مع حجم العمل على مستوى مصر', responsible: 'مريم محمد', mov: 'تكوين الفريق' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تصميم رحلة المتطوع (Awareness → Registration → Onboarding)', target_to_achieve: 'نظام مصمم للجذب والاستقبال والفرصة التطوعية الاولى', responsible: 'مريم محمد', mov: 'ملف يتضمن تعريف المراحل' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'توحيد نماذج التسجيل وقاعدة البيانات', target_to_achieve: 'نموذج موحد مصمم لتسجيل المتطوعين', responsible: 'مريم محمد', mov: 'نظام رقمي مصمم' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'إعداد دليل إجراءات الجذب والاستقبال', target_to_achieve: 'دليل مصمم يتدرب المتطوعين عليه', responsible: 'مريم محمد', mov: 'دليل مراجع ومعتمد' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تصميم خطة حملات الجذب  الاون لاين والاوف لاين', target_to_achieve: 'خطة رقمية مدمج بها الفرص التطوعية لاطلاق حملات جذب المتطوعين', responsible: 'مريم محمد', mov: 'تقرير بالتنفيذ الخاص بالحملات' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تحديد المستهدف العددي لكل حملة', target_to_achieve: 'مستهدف رقمي موزع على الشهور للاعداد المطلوبة المستهدف تسجيلها', responsible: 'مريم محمد', mov: 'خطة معتمدة' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تنفيذ عدد 15 حملة جذب اون لاين واوف لاين لجذب 40 الف متطوع', target_to_achieve: 'حملات مصممة وتم اطلاقها على السوشيال ميديا وميدانيا', responsible: 'مريم محمد', mov: 'تقرير بالحملات المنفذة' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تسجيل المتطوعين جماعيًا عبر النماذج الموحدة', target_to_achieve: 'قواعد بيانات بها قواعد بيانات صحيحة', responsible: 'مريم محمد', mov: 'داتا المتطوعين محدثة وصحيحة' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'التواصل مع المتطوعين المتقدمين', target_to_achieve: 'قوائم بالمتطوعين المتوق عحضورهم طبقا للتواصل الذي تم معهم مكالمات تليفونية', responsible: 'مريم محمد', mov: 'داتا المتطوعين محدثة وصحيحة' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تجهيز اماكن استقبال المتطوعين بحيث تغطي كل محافظات صناع الحياة', target_to_achieve: 'اماكن مجهزة لاستقبال المتطوعين', responsible: 'مريم محمد', mov: 'قائمة بالاماكن الجاهزة معتمدة' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تنفيذ عدد 1500 جلسة الاستقبال مع المتطوعين الجدد لاستقبال 30 الف متطوع', target_to_achieve: 'جلسات منفذة مسجل بها قائمة الحضور', responsible: 'مريم محمد', mov: 'تقرير بالجلسات' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'تحديث حالة المتطوع على قاعدة البيانات', target_to_achieve: 'قائمة بالمتطوعين محدثة', responsible: 'مريم محمد', mov: 'قواعد بيانات محدثة ومصممة' },
  { kpi: 'عدد المتطوعين المسجلين تراكميا', target: 35000, activity: 'اعداد 300 متطوع لتنفيذ 1500 استقبال مركزي', target_to_achieve: '300 متطوع قادر على تنفيذ جلسة استقبال المتطوعين', responsible: 'مريم محمد', mov: 'قائمة بالمتطوعين الذين تم اعدادهم موزعين جغرافيا' },
  
  // عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'تشكيل فريق مركزي  لإدارة وتفعيل الفرص التطوعية.', target_to_achieve: 'تشكيل فريق مركزي من 5-7 أشخاص.', responsible: 'زهيرة عثمان', mov: 'قائمة أعضاء الفريق المركزي' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'اعداد استمارة لرصد الفرص التطوعية يتم ارسالها للمعنين', target_to_achieve: 'استمارة مصممة مرسلة لكل الفرق المعنية', responsible: 'زهيرة عثمان', mov: 'فرص تطوعية مسجلة مقسمة زمنيا وجغرافيا' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'اعداد استمارة لرصد المشاركة التطوعية للمتطوعين', target_to_achieve: 'استمارة مصممة مرسلة لكل الفرق المعنية', responsible: 'زهيرة عثمان', mov: 'قواعد البيانات الخاصة بالمتطوعين' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'تكوين فريق متابعة هدف تكوينه متابعة تسكين المتطوعين الجدد في المحافظات', target_to_achieve: 'تسكين المتطوعين الجدد في الفرصة التطوعية الاولى', responsible: 'زهيرة عثمان', mov: 'قواعد البيانات الخاصة بالمتطوعين' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'إعداد خطة سنوية للفرص التطوعية موزعة زمنيًا وجغرافيًا.', target_to_achieve: 'اعداد خطة سنوية للفرص التطوعية وتقسيمها على التفرات الزمنية ونطاق عمل الفرص  ( اونلاين - اوفلاين -كلاهما)', responsible: 'زهيرة عثمان', mov: 'نسخة من الخطة السنوية + جدول توزيع الفرص حسب الأشهر والمناطق.' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'الإعلان الدوري والمنظم عن الفرص التطوعية عبر القنوات المعتمدة.', target_to_achieve: 'الاعلان الدوري والمنظم عن الفرص التطوعية عبر القنوات المعتمدة', responsible: 'زهيرة عثمان', mov: 'اطلاق حملة على السوشيال ميديا' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'تسجيل المتطوعين وتأكيد مشاركتهم في الفرص التطوعية.', target_to_achieve: 'متابعة رصد 17000 مشاركة تطوعية', responsible: 'زهيرة عثمان', mov: ' تقرير شهري عن مشاركات المتطوعين' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'توزيع المتطوعين على الفرص المناسبة وفق الاحتياجات.', target_to_achieve: 'مطابقة 100% الاحتياجات العددية والمهارية لكل فرصة', responsible: 'محمود رضا', mov: 'استمارة الفرص' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'تنفيذ الفرص التطوعية ميدانيًا ورقميًا.', target_to_achieve: 'تنفيذ كل فرصة حسب الخطة + حضور ≥75% من المسجلين', responsible: 'محمود رضا', mov: 'خطة الفرص – إعلانات الفرص – استماره المشاركة التطوعيه - قاعدة بيانات الحضور' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'توثيق مشاركة المتطوعين بعد تنفيذ الفرص التطوعية.', target_to_achieve: 'توثيق جميع الفاعليات على القنوات الرسمية', responsible: 'مهند', mov: 'تقارير التنفيذ – كشوف الحضور – صور وأنشطة موثقة - قاعدة البيانات' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'متابعة نسبة التفعيل شهريًا مقارنة بالمستهدف السنوي.', target_to_achieve: 'تغطية المستهدفات الشهرية ومقارنة بمستهدفات السنة', responsible: 'زهيرة عثمان +مريم محمد', mov: 'خطة السنويه - كشوف الحضور - الجدول الزمني' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'تحليل أسباب عدم مشاركة المتطوعين', target_to_achieve: 'تحسين الفرص التطوعية لحل مشكلة تفعيل المتطوعين', responsible: 'زهيرة  عثمان +محمودرضا', mov: 'التقيم والمتابعه - استحداث استمارة الفرص - التواصل و الدعم' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: ' تحفيز المتطوعين النشطين وتعزيز الاستمرارية.', target_to_achieve: 'تصميم اليات تحفيز المتطوعين', responsible: 'زهيرة عثمان +عمرو خالد', mov: 'قناه المتطوعين - جروبات و صفحات المتطوعين - التواصل و الدعم' },
  { kpi: 'عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )', target: 17000, activity: 'تنفيذ 150 قافلة لصناع الحياة مدمج بها انشطة متنوعة', target_to_achieve: '150 قافلة قافلة تم تنفيذها مفعل بهم 15000 متطوع', responsible: 'زهيرة عثمان', mov: 'تقارير تنفيذ قوافل بالانشطة وقواعد بيانات المتطوعين' },
  
  // عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'تحديد تعريف واضح لمستوى "المتطوع النشط" ومعايير قياسه.', target_to_achieve: 'ملف يوضح تصنيفات التطوع داخل صناع الحياة', responsible: 'زهيرة عثمان + اماني الدرولي + احمد عرفة', mov: 'وثيقة التعريف – محضر اعتماد – دليل السياسات - استماره المشاركة التطوعيه' },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'تصميم منظومة متابعة دورية لنشاط المتطوعين وربطها بقاعدة البيانات.', target_to_achieve: 'تشغيل منظومة متابعة دورية مرتبطة بقاعدة بيانات مركزية', responsible: 'محمد بلال', mov: 'قاعدة البيانات – نماذج المتابعة – تقارير التحديث' },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'إعداد خطة ربع سنوية للفرص التطوعية موجهة للمتطوعين النشطين.', target_to_achieve: 'إعداد خطة ربع سنوية تشمل توزيع الفرص حسب النشاط والمستهدفات', responsible: 'زهيرة عثمان +محمود رضا', mov: 'الخطة المعتمدة – الجداول الزمنية – محاضر اعتماد' },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'تخصيص المتطوعين النشطين للفرص المناسبة حسب الاهتمامات والقدرات.', target_to_achieve: 'مطابقة المتطوعين النشطين مع الفرص حسب المهارات و القدراات بنسبة 100%', responsible: 'زهيرة عثمان', mov: 'خطة الفرص – إعلانات الفرص – استماره المشاركة التطوعيه' },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'التواصل المستمر مع المتطوعين النشطين وتذكيرهم بالفرص المتاحة.', target_to_achieve: 'التواصل الدوري مع جميع المتطوعين النشطين وتذكيرهم بالفرص', responsible: 'عمرو خالد', mov: 'سجلات الرسائل – تقارير التفاعل – خطة التواصل' },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'متابعة التزام المتطوعين بعدد المشاركات المطلوبة كل ثلاثة أشهر.', target_to_achieve: 'رصد المتطوعين النشطين', responsible: 'زهيرة عثمان', mov: 'تقارير المتابعه و الالتزام – سجلات التنبيهات – قاعدة البيانات' },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'توثيق مشاركة المتطوعين في كل فرصة تطوعية على قاعدة البيانات.', target_to_achieve: 'توثيق المشاركات في كل فرصة تطوعية', responsible: 'زهيرة عثمان+مهند', mov: 'قاعدة البيانات –  صور/تقارير الأنشطة' },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'تحديث تصنيف المتطوعين بناءً على مستوى النشاط بشكل ربع سنوي.', target_to_achieve: 'تصنيف المتطوعين نشط/غير نشط ربع سنوي', responsible: 'زهيرة عثمان', mov: 'قاعدة البيانات – نماذج المتابعة – سجل التحديث' },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'تطبيق آليات تحفيز واستبقاء للمتطوعين النشطين.', target_to_achieve: 'زيادة الاستمرارية والتحفيز للمتطوعين النشطين', responsible: 'زهيرة عثمان + عمرو خالد', mov: 'وجود اليه للتحفيز من خلال فريق التواصل والدعم' },
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', target: 8000, activity: 'إعداد تقارير ربع سنوية بمستوى النشاط ومعدلات الالتزام.', target_to_achieve: 'إعداد تقارير شاملة كل ربع سنة تبين مستوى النشاط والالتزام', responsible: 'زهيرة+بلال', mov: 'التقارير – لوحات المؤشرات – محاضر العرض والمناقشة' },
];

async function addVolunteersData() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get or create Volunteers department
    console.log('Getting Volunteers department...');
    let deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE code = 'volunteers' OR name LIKE '%Volunteers%' OR name LIKE '%متطوعين%'
    `);
    
    let departmentId;
    if (deptResult.recordset.length === 0) {
      // Create the Volunteers department
      console.log('Creating Volunteers department...');
      const insertDept = pool.request();
      insertDept.input('name', sql.NVarChar, 'Volunteers');
      insertDept.input('code', sql.NVarChar, 'volunteers');
      const deptResult2 = await insertDept.query(`
        INSERT INTO departments (name, code)
        OUTPUT INSERTED.id
        VALUES (@name, @code)
      `);
      departmentId = deptResult2.recordset[0].id;
      console.log(`✓ Created Volunteers department (ID: ${departmentId})\n`);
    } else {
      departmentId = deptResult.recordset[0].id;
      console.log(`✓ Found Volunteers department (ID: ${departmentId})\n`);
    }

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

    // Check if type column allows NULL
    console.log('Checking type column constraint...');
    const constraintResult = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        IS_NULLABLE,
        DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'department_objectives' AND COLUMN_NAME = 'type'
    `);
    
    const allowsNull = constraintResult.recordset.length > 0 && 
                      constraintResult.recordset[0].IS_NULLABLE === 'YES';
    
    // Use NULL if allowed, otherwise use 'In direct' as default
    const defaultType = allowsNull ? null : 'In direct';
    console.log(`✓ Type column ${allowsNull ? 'allows' : 'does not allow'} NULL. Using: ${defaultType || 'NULL'}\n`);

    // Insert department objectives
    console.log('\nCreating department objectives...\n');
    let inserted = 0;
    let updated = 0;
    const createdObjectives = [];

    for (const activity of activities) {
      // Use the KPI from activity object
      let mainObjectiveId = matchedKPIs.get(activity.kpi) || null;
      const kpi = activity.kpi;
      
      // Parse target - use target_to_achieve if target is not a number
      let activityTarget = activity.target;
      if (activityTarget && typeof activityTarget === 'string') {
        // Try to parse as number
        const parsed = parseFloat(activityTarget.replace(/,/g, ''));
        activityTarget = isNaN(parsed) ? null : parsed;
      }
      if (!activityTarget && activity.target_to_achieve) {
        // If no numeric target, try to extract number from target_to_achieve
        const match = activity.target_to_achieve.match(/(\d+(?:,\d+)*)/);
        if (match) {
          activityTarget = parseFloat(match[1].replace(/,/g, ''));
        }
      }
      // Default to 0 if still no target
      activityTarget = activityTarget || 0;

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
          updateRequest.input('type', sql.NVarChar, defaultType);
          updateRequest.input('activity_target', sql.Decimal(18, 2), activityTarget);
          updateRequest.input('responsible_person', sql.NVarChar, activity.responsible || '');
          updateRequest.input('mov', sql.NVarChar, activity.mov || '');

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
          insertRequest.input('type', sql.NVarChar, defaultType);
          insertRequest.input('activity_target', sql.Decimal(18, 2), activityTarget);
          insertRequest.input('responsible_person', sql.NVarChar, activity.responsible || '');
          insertRequest.input('mov', sql.NVarChar, activity.mov || '');

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

    console.log('✅ Volunteers department data import completed successfully!');

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

addVolunteersData().catch(console.error);

