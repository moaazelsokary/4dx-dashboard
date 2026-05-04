/**
 * Generates seed SQL for strategic_topic_kpi_rows (Refugees topic) from structured sheet data.
 * Run: node scripts/generate-refugees-kpi-seed-sql.cjs > ../database/seed-refugees-strategic-topic-kpi-rows.sql
 *
 * Department mapping (Arabic → departments.code from init.sql):
 *   إدارة البرامج والعمليات → operations
 *   إدارة الحالة → case
 *   الإدارة القانونية والإدارية → admin
 *   مجلس المتطوعين → community
 *   إدارة الاتصال والشراكات → communication
 *   إدارة تنمية الموارد المالية → dfr
 *   إدارة الموارد البشرية → hr
 *   إدارة تكنولوجيا المعلومات → it
 *   إدارة المكاتب والشراكات → offices
 *   إدارة سلاسل الإمداد → procurement
 *
 * Status mapping:
 *   جاري العمل / Done (as progress) → In Progress
 *   معلق / hold → On Hold
 *   تم الانتهاء / Done / DONE (as completion) → Completed
 */

const fs = require('fs');
const path = require('path');

const OBJ = {
  o1: 'التحول إلى شريك وطني استراتيجي (وليس مجرد منفذ) وتوسيع النطاق الجغرافي',
  o2: 'توفير البيانات لدعم اتخاذ القرار وتصميم البرامج (Data-Driven Design).',
  o3: 'الدمج التطوعي (Volunteer Inclusion) وتأهيل كوادر متخصصة في الحماية.',
  o4: 'تغيير السردية (Narrative) وإبراز "النموذج المصري" في التعامل مع اللاجئين.',
  o5: 'الاستدامة المالية وعدم الاعتماد الكلي على المنح الخارجية فقط.',
  o6: 'القيادة بالقدوة (Leading by Example) في التمكين الاقتصادي.',
  o7: 'الامتثال (Compliance) لمتطلبات المانحين الدوليين الصارمة في ملفات الحماية.',
  o8: 'الرقمنة والإتاحة (Visibility).',
  o9: 'اللامركزية والدمج الجغرافي',
  o10:
    'تحويل سلاسل الإمداد إلى "حارس الامتثال اللوجستي"؛ لضمان أن كل مورد ومقدم خدمة هو شريك في حماية اللاجئ والالتزام باشتراطات المانحين الدوليين (مثل المفوضية والاتحاد الأوروبي).',
};

/** @type {{ objKey: keyof typeof OBJ; activity: string; dur: string | null; sd: string | null; ed: string | null; dept: string; status: string; notes: string | null }[]} */
const ROWS = [
  {
    objKey: 'o1',
    activity:
      'كتابة وتقديم 4 مقترحات مشروعات (Proposals) سنوياً متخصصة للمانحين الدوليين',
    dur: '6 شهور',
    sd: '2026-04-01',
    ed: '2026-09-30',
    dept: 'operations',
    status: 'In Progress',
    notes: 'تم كتابة 2 مقترح',
  },
  {
    objKey: 'o1',
    activity: 'تأسيس شراكة رسمية مع وزارة الخارجية والهجرة لترسيخ دور المؤسسة كشريك وطني.',
    dur: 'سنه',
    sd: '2026-05-01',
    ed: '2027-05-30',
    dept: 'operations',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o1',
    activity:
      'فتح ملف اضافي لملف "سبل العيش" (Livelihood) مع المفوضية (UNHCR) كنشاط جديد.',
    dur: 'سنه',
    sd: '2026-05-02',
    ed: '2027-05-31',
    dept: 'operations',
    status: 'In Progress',
    notes: 'Working groups with UNHCR, focal point for every file to attend with UNHCR',
  },
  {
    objKey: 'o1',
    activity: 'تصميم وإطلاق مشروع جديد في أسوان (نظراً لكثافة التواجد هناك).',
    dur: 'سنة',
    sd: '2026-05-02',
    ed: '2027-05-31',
    dept: 'operations',
    status: 'In Progress',
    notes: 'تمت كتابة مقترح في اسوان مع TDH، عمل علاقات مع جهات مانحه في اسوان',
  },
  {
    objKey: 'o1',
    activity: 'تنظيم فعالية كبرى يوم 20 يونيو (يوم اللاجئ العالمي).',
    dur: 'شهر',
    sd: '2026-06-01',
    ed: '2026-06-30',
    dept: 'operations',
    status: 'In Progress',
    notes: 'وضع افكار مع كل فرق المشروعات مع اللاجيئين ومنى وهبه',
  },
  {
    objKey: 'o1',
    activity: 'تنظيم إدارة المعرفة وتجميع ملفات العمل الخاصة باللاجئين',
    dur: '6 شهور',
    sd: '2026-05-01',
    ed: '2026-09-30',
    dept: 'operations',
    status: 'In Progress',
    notes: 'عقد اجتماع مع اسراء والبحث عن المصادر المتاحه داخل المؤسسة',
  },
  {
    objKey: 'o1',
    activity:
      'إعداد تدريبات على مستوى عالي لجميع الإدارات والمديرين لفهم جميع المصطلحات والثقافات المختلفة عن اللاجئين',
    dur: '3 شهور',
    sd: '2026-06-01',
    ed: '2026-08-31',
    dept: 'operations',
    status: 'In Progress',
    notes:
      'التنسيق مع عبد الدايم للتنفيذ، الجلسة التعريفية لكل الموظفين _ والرد على الاشاعات المنتشرة بشكل غير مباشر توضيح وضع مصر وشرح معنى التمكين الاقتصادي',
  },
  {
    objKey: 'o1',
    activity: 'البحث عن الميزة النسبية والتنافسية و اظهارها بشكل واضح',
    dur: null,
    sd: null,
    ed: null,
    dept: 'operations',
    status: 'On Hold',
    notes: 'مقرات اللاجيئين - سبل العيش،نؤجل خطة الاظهار حتى يستقر الوضع الحالي',
  },
  {
    objKey: 'o2',
    activity:
      'إنشاء قاعدة بيانات شاملة (Refugees Database) تصنف اللاجئين (تعليم، صحة، حماية) لتكون مرجعاً للمقترحات.',
    dur: '3 شهور',
    sd: '2026-06-01',
    ed: '2026-08-31',
    dept: 'case',
    status: 'Completed',
    notes: 'جميع بيانات المشروعات التى تعمل مع اللاجيئين مسجلة على سيستم اودو',
  },
  {
    objKey: 'o2',
    activity: 'دراسة عن تقبل المجتمع المصري للاجئين في مصر - الاحتياجات الخاصة باللاجئين',
    dur: null,
    sd: null,
    ed: null,
    dept: 'case',
    status: 'In Progress',
    notes: 'تم الانتهاء من تجميع بيانات الدراسة وفي انتظار موافقة NRC',
  },
  {
    objKey: 'o2',
    activity: 'داش بورد خاصة باللاجئين',
    dur: null,
    sd: '2026-04-15',
    ed: '2026-05-05',
    dept: 'case',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o2',
    activity: 'تدريب العاملين بالادارة على تعريف الحالات وتوحيد المصطلحات مع الهيئات الدولية',
    dur: '1 month',
    sd: '2026-05-01',
    ed: '2026-05-30',
    dept: 'case',
    status: 'In Progress',
    notes:
      'خاضع للنقاش في اجتماع مخصص، في انتظار تحديد اجتماع مع مهندس موسي وياسمين للمناقشة',
  },
  {
    objKey: 'o2',
    activity: 'توحيد الية الشكاوى بجميع مقرات استقبال اللاجئين',
    dur: 'شهر',
    sd: '2026-05-01',
    ed: '2026-05-30',
    dept: 'admin',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o2',
    activity: '(من بطاقة التوجيه): تصميم لوحة بيانات (Dashboard) لتتبع رحلة المستفيد اللاجئ.',
    dur: null,
    sd: '2026-04-15',
    ed: '2026-05-15',
    dept: 'case',
    status: 'In Progress',
    notes: 'بدأ العمل عليها',
  },
  {
    objKey: 'o3',
    activity:
      'تخصيص وتدريب 500 متطوع متخصص في "إدارة ملف اللاجئين" (قوانين الحماية، التعامل النفسي و التعريف باللاجيئين). 500 تدريب معرفي + 200 تدريب عملي on job training',
    dur: '6 شهور',
    sd: '2026-04-01',
    ed: '2026-09-30',
    dept: 'community',
    status: 'On Hold',
    notes: 'كامب صناع الحياة بحضور 300 متطوع orientation session',
  },
  {
    objKey: 'o3',
    activity: 'مراجعة استمارة الجذب وتعديلها لتناسب الجنسيات المختلفة',
    dur: 'شهر',
    sd: '2026-05-01',
    ed: '2026-05-30',
    dept: 'community',
    status: 'In Progress',
    notes: 'مريم',
  },
  {
    objKey: 'o3',
    activity: '50 متطوع مفعل من اللاجيئن',
    dur: '6 شهور',
    sd: '2026-04-01',
    ed: '2026-09-30',
    dept: 'community',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o3',
    activity: 'تنفيذ 3 ماراثونات تطوعية تدمج الشباب المصري مع اللاجئين (Social Cohesion).',
    dur: '6 شهور',
    sd: '2026-04-01',
    ed: '2026-09-30',
    dept: 'community',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o3',
    activity: 'سياسة دمج متطوعين من اللاجئين داخل متطوعي صناع الحياة',
    dur: 'hold',
    sd: null,
    ed: null,
    dept: 'community',
    status: 'On Hold',
    notes: null,
  },
  {
    objKey: 'o3',
    activity:
      'تنسيق ورشة عمل بين مجلس ادارة المتطوعين والقادة المجتمعيين من اللاجيئين لبحث امكانية دمج المتطوعين والوقوف على الانشطة الجاذبة لهم "بدون نشر"',
    dur: 'Done',
    sd: '2026-04-01',
    ed: '2026-04-30',
    dept: 'community',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o4',
    activity: 'إطلاق حملات توعية ضخمة لتصحيح المفاهيم حول اللاجئين وتقليل الاحتقان.',
    dur: null,
    sd: null,
    ed: null,
    dept: 'communication',
    status: 'On Hold',
    notes:
      'تم تعليق كل الانشطة الإعلامية المتعلقة باللاجئين بسبب الأزمة الحالية بالاتفاق مع الرئيس التنفيذي ونائب الرئيس التنفيذي',
  },
  {
    objKey: 'o4',
    activity: 'تفعيل صفحة اللاجئين على السوشيال ميديا وتحقيق نمو 300%.',
    dur: null,
    sd: null,
    ed: null,
    dept: 'communication',
    status: 'On Hold',
    notes: null,
  },
  {
    objKey: 'o4',
    activity: 'لايف عن خدمات اللاجيئين واسباب العمل معهم',
    dur: null,
    sd: null,
    ed: null,
    dept: 'communication',
    status: 'On Hold',
    notes: null,
  },
  {
    objKey: 'o4',
    activity:
      'اضافة جزء من الهوية البصرية الخاصة باللاجيئين داخل مكاتب وجمعيات صناع الحياة خاصة في المحافظات التى بها كثافة مراعاة التعبير عن كل الملفات الاستراتيجية التى تعمل عليها صناع الحياة',
    dur: null,
    sd: null,
    ed: null,
    dept: 'communication',
    status: 'On Hold',
    notes: null,
  },
  {
    objKey: 'o4',
    activity: 'نشر انجازات مشروعات اللاجيئين على صفحات المتطوعين',
    dur: null,
    sd: null,
    ed: null,
    dept: 'communication',
    status: 'On Hold',
    notes: null,
  },
  {
    objKey: 'o4',
    activity: 'التاكد ان اليات الشكوى موجودة على كل المطبوعات',
    dur: null,
    sd: null,
    ed: null,
    dept: 'communication',
    status: 'Completed',
    notes: null,
  },
  {
    objKey: 'o4',
    activity: 'تقرير اعمال عن مشروعات اللاجيئين يعرض على الجهات المانحه',
    dur: null,
    sd: null,
    ed: null,
    dept: 'communication',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o5',
    activity:
      'تخصيص نسبة 2% إلى 5% من التمويل الذاتي (تبرعات أفراد/شركات) لصالح أنشطة اللاجئين، لتغطية الفجوات التي لا تغطيها المنح.',
    dur: null,
    sd: null,
    ed: null,
    dept: 'dfr',
    status: 'In Progress',
    notes: 'مؤشر الأداء (KPI): حجم التمويل الذاتي الموجه للاجئين (Target: 2-5% من المحفظة).',
  },
  {
    objKey: 'o5',
    activity: 'تقديم خدمات موسمية للاجئين (أعياد ومواسم) وربطها بفرص التمويل.',
    dur: null,
    sd: null,
    ed: null,
    dept: 'dfr',
    status: 'In Progress',
    notes: 'مؤشر الأداء (KPI): حجم التمويل الذاتي الموجه للاجئين (Target: 2-5% من المحفظة).',
  },
  {
    objKey: 'o6',
    activity: 'توفير فرص تدريبية (Internships) داخل المشروعات للاجئين.',
    dur: null,
    sd: '2026-07-01',
    ed: '2026-10-30',
    dept: 'hr',
    status: 'In Progress',
    notes:
      'مؤشر الأداء (KPI): عدد الفرص التدريبية للاجيئين داخل المشروعات (Target: 10). (تم تصحيح ترتيب التواريخ: كان 30-Oct-2026 و 1-Jul-2026 في الجدول)',
  },
  {
    objKey: 'o6',
    activity: 'توعية الموظفين عن اللاجيئين والسياسات الخاصة بهم " كورسات اون لاين "',
    dur: null,
    sd: null,
    ed: null,
    dept: 'hr',
    status: 'In Progress',
    notes: 'مؤشر الأداء (KPI): عدد الفرص التدريبية للاجيئين داخل المشروعات (Target: 10).',
  },
  {
    objKey: 'o7',
    activity:
      'تحديث اللوائح والسياسات (Safeguarding, Whistleblowing) لتتوافق مع اشتراطات المنح الدولية الخاصة باللاجئين.',
    dur: 'Done',
    sd: null,
    ed: null,
    dept: 'admin',
    status: 'Completed',
    notes: 'اللوائح محدثة ومتناسبة مع متطلبات المانحين',
  },
  {
    objKey: 'o7',
    activity: 'مراجعة استقبال الشكاوى وطرق الاستجابة لها',
    dur: '2 شهر',
    sd: '2026-05-01',
    ed: '2026-07-01',
    dept: 'admin',
    status: 'In Progress',
    notes: 'وضوح طرق الاستجابة الخاصة بالشكاوى والعمل بها عند كل الادارات التنفيذية',
  },
  {
    objKey: 'o8',
    activity: 'إنشاء قسم خاص (Landing Page/Section) لملف اللاجئين على الموقع الرسمي للمؤسسة.',
    dur: 'Done',
    sd: null,
    ed: null,
    dept: 'it',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o9',
    activity:
      'دمج اللاجئين في أنشطة الفروع العادية (القوافل، المعارض، توزيع الأضاحي) وعدم عزلهم في "مشروعات خاصة" فقط.',
    dur: '7 شهور',
    sd: '2026-06-01',
    ed: '2026-12-31',
    dept: 'offices',
    status: 'In Progress',
    notes:
      'سيتم البدء في توجية المكاتب التي تحتوي على لاجئين ببدء حصرهم واشراكهم الفعلي في الانشطة المناسبة لهم',
  },
  {
    objKey: 'o9',
    activity:
      'تنسيق تدريب لمسئولي المكتب عن التعريف باللاجيئين والسياسات الخاصة بهم في المحافظات التى يوجد بها تجمع للاجيئين',
    dur: '1 شهر',
    sd: '2026-06-16',
    ed: '2026-07-15',
    dept: 'offices',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o9',
    activity: 'مكاتب صناع الحياة واستعدادها لاستقبال اللاجئين والأنشطة الخاصة بهم',
    dur: '7 شهور',
    sd: '2026-06-01',
    ed: '2026-12-31',
    dept: 'offices',
    status: 'In Progress',
    notes: null,
  },
  {
    objKey: 'o9',
    activity: 'تنفيذ تدريب تعريفي عن اللاجيئين في كل محافظة (اسكندرية - دمياط - القاهرة - الجيزة - الشرقية)',
    dur: '1 شهر',
    sd: '2026-06-16',
    ed: '2026-07-15',
    dept: 'offices',
    status: 'In Progress',
    notes: 'مكتب القاهرة فقط',
  },
  {
    objKey: 'o10',
    activity:
      'تأهيل وتوعية الموردين (Supplier Policy Alignment): المراجعه مع الشئون القانونية لضمان التنفيذ -إلزام جميع الموردين بالتوقيع على "ميثاق أخلاقيات المورد" الذي يتضمن سياسات الحماية (Safeguarding) وعدم الاستغلال، نظراً لحساسية التعامل مع فئة اللاجئين المستضعفة. - عقد جلسات توجيهية للموردين (خاصة موردو الوجبات، الكساء، والخدمات الصحية) لفهم "حساسية السياق" وضمان تقديم منتجات تحفظ كرامة اللاجئ وتتفق مع المعايير الدولية.',
    dur: '4 شهور',
    sd: '2026-05-01',
    ed: '2026-08-01',
    dept: 'procurement',
    status: 'In Progress',
    notes:
      'اضافة مختصر للسياسات فورمة مجهزة مرفقة بالعقود للتوقيع بالمعرفة من قبل الموردين - التنسيق مع ادارة المشتريات لتدريب 10 موردين من الاساسين في المؤسسة',
  },
  {
    objKey: 'o10',
    activity:
      'التأكد من تقديم جميع الاوراق القانونية والسجل التجاري قبل اي ترسية - ارسال الارواق للجهة المانحه في حالة الحاجة لها',
    dur: 'DONE',
    sd: null,
    ed: null,
    dept: 'procurement',
    status: 'Completed',
    notes: null,
  },
  {
    objKey: 'o10',
    activity:
      'هندسة التكاليف وتعظيم العائد (Cost Engineering & Social ROI): تحقيق "المعادلة الصعبة" في ملف اللاجئين عبر توفير موارد عالية الجودة بأقل تكلفة، للحفاظ على وعد الـ 13% كمصاريف إدارية، مما يرفع من العائد الاجتماعي على الاستثمار (Social ROI) ويجذب المانحين. - تفعيل "التوطين الشرائي" عبر إعطاء الأولوية للموردين المحليين في مناطق تمركز اللاجئين (مثل 6 أكتوبر وأسوان) لدعم الاقتصاد المحلي وتحقيق الدمج المجتمعي.',
    dur: 'DONE',
    sd: null,
    ed: null,
    dept: 'procurement',
    status: 'Completed',
    notes: 'العمل في اسوان يعتمد على التوريد الكحلي وتم بالفعل عمل عقود مع اللاجيئين العام الماضي',
  },
  {
    objKey: 'o10',
    activity:
      'دعم الوحدات الإنتاجية (Economic Empowerment Support): تسهيل عمليات الشراء واللوجستيات لـ "الوحدات الإنتاجية للاجئين" (مثل مشاغل الخياطة أو المطابخ الإنتاجية) لضمان استمرارية عملهم كجزء من سبل العيش',
    dur: '8 شهور',
    sd: '2026-05-01',
    ed: '2026-12-30',
    dept: 'procurement',
    status: 'In Progress',
    notes:
      'التنسيق مع ادارة المشروعات لاستلام قاعدة بيانات المستفيدين الذين قاموا بتنفيذ مشروعاتهم بالفعل',
  },
];

function esc(s) {
  if (s == null) return null;
  return String(s).replace(/'/g, "''");
}

function trunc500(s) {
  const t = String(s);
  return t.length <= 500 ? t : t.slice(0, 497) + '...';
}

function sqlVal(s) {
  if (s == null) return 'NULL';
  return "N'" + esc(s) + "'";
}

function sqlDate(d) {
  if (d == null) return 'NULL';
  return "'" + d + "'";
}

const lines = [];
lines.push(`-- Seed: Refugees strategic topic KPI rows (from user sheet)`);
lines.push(`-- Review department mapping if your DB uses different department codes.`);
lines.push(`-- main_objective_id is NULL (no KPI id in sheet); link KPIs in the app if needed.`);
lines.push(`SET NOCOUNT ON;`);
lines.push(``);

for (const r of ROWS) {
  const obj = trunc500(OBJ[r.objKey]);
  const act = (r.activity && r.activity.trim()) || '—';
  const topics = 'refugees'; // sheet pillar text mapped to Refugees topic code for this seed
  lines.push(`INSERT INTO strategic_topic_kpi_rows (`);
  lines.push(
    `  strategic_topic, main_objective_id, objective_text, activity, expected_duration, start_date, end_date, associated_departments, associated_strategic_topics, status, notes`
  );
  lines.push(`) VALUES (`);
  lines.push(`  N'refugees',`);
  lines.push(`  NULL,`);
  lines.push(`  ${sqlVal(obj)},`);
  lines.push(`  ${sqlVal(act)},`);
  lines.push(`  ${sqlVal(r.dur)},`);
  lines.push(`  ${sqlDate(r.sd)},`);
  lines.push(`  ${sqlDate(r.ed)},`);
  lines.push(`  N'${esc(r.dept)}',`);
  lines.push(`  N'${esc(topics)}',`);
  lines.push(`  N'${esc(r.status)}',`);
  lines.push(`  ${sqlVal(r.notes)}`);
  lines.push(`);`);
  lines.push(``);
}

const outPath = path.join(__dirname, '../database/seed-refugees-strategic-topic-kpi-rows.sql');
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log('Wrote', outPath, 'rows:', ROWS.length);
