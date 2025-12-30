#!/usr/bin/env node

/**
 * Script to replace Communication department objectives and monthly data
 * This script deletes all existing activities and replaces them with new ones
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

// Helper function to extract numeric value from target string
function extractNumericTarget(targetStr) {
  if (!targetStr) return 0;
  // Try to find numbers in the string
  const match = targetStr.match(/\d+(?:[.,]\d+)?/);
  if (match) {
    return parseFloat(match[0].replace(',', ''));
  }
  return 0;
}

// Communication department activities data
// Mapping based on the provided KPI list and activities table
const activities = [
  // مستوى الوعي بالعلامة المؤسسية (Brand Awareness) - 6 activities
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'إنشاء موقع إخباري معني بنشر أخبار وقصص نجاح صناع الحياة ومقالات الرأي والتحقيقات الخاصة بالمجتمع المدني', target_to_achieve: 'تأسيس موقع خبري (ربحي)', responsible: 'عصام عبد العزيز', mov: '- موقع خبري\n- عدد زيارات الموقع' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'توحيد وتكثيف الحضور الإعلامي على المنصات الإعلامية المختلفة عبر رسائل واضحة وموحدة', target_to_achieve: 'زيادة نسبة الظهور الإعلامي 20 % عن العام الماضي', responsible: 'مسؤول الاتصال', mov: '- عدد الظهور الإعلامي\n- تكرار ذكر اسم المؤسسة' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'تنفيذ بودكاست صناع الحياة مع كبار الشخصيات الملهمة في العمل العام', target_to_achieve: 'لتصدير صناع الحياة كمؤسسة رائدة في العمل التنموي والتطوعي', responsible: 'محمد الموجي', mov: 'عدد الاستماعات – الإكمال – المتابعين' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'حملات إلكترونية للتوعية بالعلامة المؤسسة لدى الجمهور العام', target_to_achieve: 'الوصول لمليون شخص عبر منصات التواصل الاجتماعي المختلفة لصناع الحياة', responsible: 'لبنى عصام', mov: ':تقرير فني يوضح\n- Reach&impression\n- Brand Search Volume\n- Hashtag usage' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'حملة إلكترونية سنوية بالتعاون مع صفحات المتطوعين في مختلف المحافظات لجذب المتطوعين وتصدير صناع الحياة كمؤسسة رائدة في التطوع', target_to_achieve: 'الوصول لمليون شخص عبر منصات التواصل الاجتماعي المختلفة لصناع الحياة', responsible: '', mov: 'تقرير فني يوضح:\n- Reach &engagement' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'عقد ورشة دورية داخليا مع كل العاملين بصناع الحياة لتوحيد مفاهيم المؤسسة وصورتها الذهنية', target_to_achieve: 'تنفيذ ورشة بمعدل نصف سنوي لجميع العاملين وتوحيد درجة وعي جميع العاملين بصناع الحياة', responsible: 'مديرة الإدارة', mov: '- محتوى الورشة معتمد من الرئيس التنفيذي\n- سجل حضور ورشتين' },
  
  // حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات) - 11 activities
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'إعداد دليل التسويق الرقمي للمنصات', target_to_achieve: 'تنظيم العمل الرقمي وتوضيح المسموح والمرفوض في المحتوى وكذلك توحيد اللغة الرقمية لصناع الحياة', responsible: 'مديرة الادارة- لبنى عصام - مسؤول الاتصال', mov: 'دليل مكتوب وموقّع' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'تحليل جميع منصات صناع الحياة الرقمية (صفحات المحافظات والجامعات)', target_to_achieve: 'الوقوف على الوضع الحالي والحقيقي للقوة الرقمية لصناع الحياة', responsible: 'لبنى عصام', mov: 'تقرير تحليلي بالمنصات' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'إعداد وثيقة "البصمة الإلكترونية" لجميع المنصات الفعالة في صناع الحياة', target_to_achieve: 'حوكمة النشر والمحتوى', responsible: 'مديرة الإدارة', mov: ' توقيع والتزام الفرق' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'إجتماع ربع سنوي للجنة الرقمية لمجتمع صناع الحياة', target_to_achieve: 'لمتابعة الأداء وتحسينه', responsible: 'مديرة الادارة - لبنى عصام - مسؤول الاتصال', mov: '• محاضر اجتماعات\n• قرارات مطبّقة' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'تفعيل قناة اليوتيوب الخاصة بصناع الحياة ونشر 100 فيديو وريل', target_to_achieve: 'لتحسين ظهور صناع الحياة بالصورة المنشودة على محركات البحث وتحقيق عائد ربحي فيما بعد للمؤسسة', responsible: 'مسؤول الاتصال - عصام عبد العزيز', mov: 'Engagement rate\nFollowers' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'التعاون مع المؤثرين والشخصيات الفنية لدعم حملات وبرامج صناع الحياة', target_to_achieve: 'الوصول ل 8 شخصيات مؤثرة للمشاركة في الأربع حملات الرئيسية للمؤسسة (شتاء- مدارس- رمضان- أضاحي)', responsible: 'مسؤول التواصل', mov: '- عدد الحملات التي تم المشاركة فيها من قبل المؤثرين\n- عدد المنشن لصناع الحياة من قبل المؤثرين\n- Reach&engagement على صفحة المؤسسة' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'إدارة ردود وتفاعلات الجمهور في التعليقات (تثبيت التعليقات الايجابية - الرد خلال 24 ساعة)', target_to_achieve: 'لزيادة تفاعل المتابعين وزيادة ولائهم', responsible: 'لبنى عصام', mov: 'Response rate' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'تنفيذ محتوى توعوي تعليمي خاص بذوي الإعاقة على منصات التواصل الاجتماعي بشكل دوري في الأيام العالمية لذوي الإعاقة', target_to_achieve: 'ترسيخ فكرة أن صناع الحياة مؤسسة تعتني بذوي الاعاقة ولديها خبرة قائمة على العلم والعمل في هذا المجال', responsible: 'لبنى عصام', mov: 'Reach & engagement' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'رفع كفاءة ميديا المتطوعين في مختلف المحافظات عبر معسكر تدريبي مكثف', target_to_achieve: 'تكوين فرق إعلامية من المتطوعين على نفس درجة المعرفة والعلم للمساعدة في رصد قصص النجاح وأبرز الأحداث في كل محافظة', responsible: 'مديرة الإدارة', mov: 'كشف اسماء الحضور\nمادة علمية' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'مسابقة "قمة الإبداع" وهي مسابقة بين فرق ميديا المتطوعين كمخرج للتدريب وتنفيذ مجموعة مهام فنية مثل تصميم وتنفيذ حملة تسويقية، وانتاج فيديوهات بالموبايل ثم انتاج فيلم قصير تبدأ عقب رمضان 2026 حتى يونيو 2026 يتداخل فيها إدارة الفاعليات ومجلس إدارة المتطوعين', target_to_achieve: 'إشراك الكفاءات المتعددة من ميديا المتطوعين في الانشطة الاعلامية والتسويقية للمؤسسة بالإضافة إلى توفير فرص تطوعية فعالة في مجال الإعلام', responsible: 'مديرة الإدارة', mov: '' },
  { kpi: 'حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات)', activity: 'رصد وكتابة ونشر قصص نجاح المتطوعين بموجب قصة شهريا بداية من شهر فبراير حتى شهر ديسمبر 2026 بالتعاون مع فرق ميديا المتطوعين', target_to_achieve: 'لدعم فكرة أن صناع الحياة بيت لكل متطوع ومؤسسة مرجعية للتطوع', responsible: 'محمد الموجي - ولاء محمد - عصام عبد العزيز', mov: '10 قصص (فيديو - تحقيق صحفي - قصة مكتوبة)' },
  
  // مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء - 9 activities
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'انتاج قصص نجاح لقياس أثر المؤسسة في المجتمع لربط اسم صناع الحياة بالأثر والتنمية لدى الناس', target_to_achieve: 'انتاج 24 قصة نجاح مكتوبة ومرئية ونشرها على الموقع ووسائل التواصل الاجتماعي الخاصة بالمؤسسة', responsible: 'محمد الموجي - ولاء الدين محمد', mov: '- Engagement rate\n- share rate' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'حصر المشكلات المجتمعية الأكثر انتشارا في المجتمع', target_to_achieve: 'لتحديد الموضوعات الأكثر انتشارا بالتالي الاكثر وصولا وتفاعلا في المجتمع لتصميم حملات مجتمعية موازية تسوق لصناع الحياة كمؤسسة رائدة مجتمعيا', responsible: 'عصام عبد العزيز- عبد الناصر البنا', mov: 'وثيقة بأهم المشكلات المجتمعية - SWOT Analysis' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'تصميم حملات رقمية مجتمعية موازية لترسيخ القيم الايجابية بالتعاون مع صفحات المتطوعين', target_to_achieve: 'قيادة حملات رقمية كبيرة ترسخ فكرة أن صناع الحياة مؤسسة تنموية رائدة - وفي ذات الوقت ضمان الانتشار السريع والاستجابة الإيجابية نحو مشكلات المجتمع', responsible: 'لبنى عصام', mov: 'Reach& Engagement Rates' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'إعداد خريطة الأثر ل 17 مشروع حالي في صناع الحياة تشمل كل خريطة: المدخلات ⟶ الأنشطة ⟶ المخرجات ⟶ النتائج ⟶ الأثر', target_to_achieve: 'بناء قصص نجاح سليمة وخطاب إعلامي دقيق قائم على معرفة كاملة وسليمة بالمشروعات', responsible: 'عصام عبد العزيز', mov: '17 خريطة أثر' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'إصدار منتجات إعلامية استراتيجية تعبر عن انجازات المؤسسة وبرامجها', target_to_achieve: '- إصدار تقرير سنوي لإنجازات المؤسسة\n- إنتاج فيلم عالي الجودة سنوي\n- إصدار تقارير نصف سنوية للشركاء', responsible: 'مسؤول التواصل', mov: '- تقرير سنوي باللغتين العربية والانجليزية\n- 2 نشرات نصف سنوية للشركاء\n- فيلم وثائقي سنوي' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'إعداد دليل تعريفي وهوية لغوية', target_to_achieve: 'توحيد لغة الخطاب', responsible: 'مديرة الإدارة', mov: 'دليل معتمد ومستخدم' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'عقد مؤتمر صحفي بحضور لفيف من الصحفيين والشركاء من أصحاب المصلحة لإبراز صناع الحياة كمؤسسة رائدة للتحول الرقمي', target_to_achieve: 'تصدير صناع الحياة كمؤسسة رائدة في مجال التحول الرقمي وتوثيق تجربتها الفريدة في التحول لإقرار ذلك', responsible: '', mov: '' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'التواصل الدوري مع الشركاء عبر مختلف الوسائل المتاحة', target_to_achieve: '- إرسال هدية سنوية من انتاج المستفيدين\n- تهنئة بالمناسبات الأساسية في العام\n- تهنئة بالمناسبات الشخصية لكبار الشركاء وأصحاب المصلحة', responsible: 'مسؤول الاتصال', mov: 'خريطة بأصحاب المصلحة\nقائمة باسماء وبيانات الجهات الشريكة لتاريخه\nقائمة check list بالمنتجات الاعلامية المرسلة' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'دعوة الشركاء على المناسبات المختلفة بالمؤسسة', target_to_achieve: 'الحفاظ على الشركاء مطلعين على أنشطة المؤسسة', responsible: 'مسؤول الاتصال', mov: 'check list لمختلف المناسبات مصححة بالدعوات' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'استبيان رأي عام نصف سنوي مع الجمهور', target_to_achieve: 'للوقوف على صورة المؤسسة بين الجمهور وتعديل اداء المؤسسة ورسالتها للجمهور', responsible: 'مديرة الإدارة', mov: 'استبيان مخصص للجمهور' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'إدارة السمعة المؤسسية عن طريق رصد ما يقال الكترونيا عن المؤسسة-التدخل السريع في حالات الأزمات- تضخيم المحتوى الايجابي عن المؤسسة وإعادة نشره', target_to_achieve: 'تحسين الانطباع العام وتقليل التقييمات السيئة المباشرة', responsible: 'مديرة الادارة- لبنى عصام - عصام عبد العزيز', mov: 'تقرير ربع سنوي بتوصيات' },
  
  // عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر) - 2 activities
  { kpi: 'عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)', activity: 'تنفيذ محتوى توعوي تعليمي خاص بذوي الإعاقة على منصات التواصل الاجتماعي بشكل دوري في الأيام العالمية لذوي الإعاقة', target_to_achieve: 'ترسيخ فكرة أن صناع الحياة مؤسسة تعتني بذوي الاعاقة ولديها خبرة قائمة على العلم والعمل في هذا المجال', responsible: 'لبنى عصام', mov: 'Reach & engagement' },
  { kpi: 'عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)', activity: 'تنفيذ شراكات محلية ودولية مع مؤسسات معنية بمجال ذوي الإعاقة', target_to_achieve: 'تعظيم الاستفادة ودعم الريادة المجتمعية لصناع الحياة في هذا المجال', responsible: 'مسؤول الاتصال', mov: 'عدد الشركاء المشاركين\nحجم الوصول عبر قنواتهم\nتوثيق التعاون' },
  
  // عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا - 1 activity
  { kpi: 'عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا', activity: 'رفع كفاءة ميديا المتطوعين في مختلف المحافظات عبر معسكر تدريبي مكثف', target_to_achieve: 'تكوين فرق إعلامية من المتطوعين على نفس درجة المعرفة والعلم للمساعدة في رصد قصص النجاح وأبرز الأحداث في كل محافظة', responsible: 'مديرة الإدارة', mov: 'كشف اسماء الحضور\nمادة علمية' },
  
  // عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين - 1 activity
  { kpi: 'عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين', activity: 'رصد وكتابة ونشر قصص نجاح المتطوعين بموجب قصة شهريا بداية من شهر فبراير حتى شهر ديسمبر 2026 بالتعاون مع فرق ميديا المتطوعين', target_to_achieve: 'لدعم فكرة أن صناع الحياة بيت لكل متطوع ومؤسسة مرجعية للتطوع', responsible: 'محمد الموجي - ولاء محمد - عصام عبد العزيز', mov: '10 قصص (فيديو - تحقيق صحفي - قصة مكتوبة)' },
  
  // عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية - 1 activity
  { kpi: 'عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية', activity: 'تنفيذ مسابقة مواهب سنوية لاكتشاف المواهب بين المتطوعين في مجال الغناء والإلقاء والتمثيل', target_to_achieve: 'اكتشاف المواهب بين المتطوعين وتنمية مهاراتهم الابداعية وترجمة أن صناع الحياة هي بيت لكل متطوع ينميه ويكتشف مواهبة، بالإضافة إلى تعظيم الاستثمار في قدراتهم الابداعية بما ينعكس على صناع الحياة', responsible: 'عبد الناصر - مسؤول التواصل', mov: 'اكتشاف 5 مواهب على الأقل بين المتقدمين للمسابقة' },
  
  // عدد الأنشطة الترفيهية/الثقافية/الإبداعية السنوية (رياضة – مسرح – غناء – ورش إبداع) - 1 activity
  { kpi: 'عدد الأنشطة الترفيهية/الثقافية/الإبداعية السنوية (رياضة – مسرح – غناء – ورش إبداع)', activity: 'فتح باب التعاون مع 3 مؤسسات وجهات تطوعية دولية لتنفيذ برامج تبادل ثقافي بين المتطوعين', target_to_achieve: 'تعظيم الاستفادة من التجربة التطوعية لمتطوعي صناع الحياة', responsible: 'مسؤول الاتصال', mov: '3 بروتوكولات تعاون' },
  
  // عدد برامج التبادل التطوعي الدولي المنفذة سنويًا - 1 activity
  { kpi: 'عدد برامج التبادل التطوعي الدولي المنفذة سنويًا', activity: 'فتح باب التعاون مع 3 مؤسسات وجهات تطوعية دولية لتنفيذ برامج تبادل ثقافي بين المتطوعين', target_to_achieve: 'تعظيم الاستفادة من التجربة التطوعية لمتطوعي صناع الحياة', responsible: 'مسؤول الاتصال', mov: '3 بروتوكولات تعاون' },
  
  // Additional activities from the table
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'إعداد دليل للتعامل مع الأزمات (لغة – نبرة – صياغة)', target_to_achieve: 'توحيد الخطاب وتقليل المخاطرورفع درجة الجاهزية وقت الأزمات', responsible: 'مديرة الادارة - مسؤول الاتصال', mov: 'دليل مكتوب ومعتمد' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'تدريب فرق الميديا على دليل الأزمات', target_to_achieve: 'رفع الجاهزية الإعلامية والتشارك في المسؤولية العامة', responsible: 'مديرة الادارة', mov: '• ورش منفذة\n• تقييم قبل/بعد' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'الحصول على موافقات تصوير (خصوصًا الأطفال)', target_to_achieve: 'حماية المؤسسة قانونيًا وأخلاقيًا', responsible: 'محمود صفوت', mov: 'نماذج موافقات موقعة لأي نشاط' },
  { kpi: 'مستوى الوعي بالعلامة المؤسسية (Brand Awareness)', activity: 'اعتماد مرجعيات دينية وعلمية بالحملات الحساسة', target_to_achieve: 'تقليل ردود الفعل السلبية', responsible: 'لبنى عصام', mov: '• توثيق المرجعيات' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'تنفيذ استبيان الشركاء الحاليين والسابقين', target_to_achieve: 'تحسين العلاقات المؤسسية ووالوقوف على نقاط القوة والضعف ومواطن التحسين', responsible: 'مديرة الادارة', mov: 'نتائج محللة وتقارير' },
];

async function replaceCommunicationActivities() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Communication department ID
    console.log('Getting Communication department...');
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE code = 'communication'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Communication department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Communication department (ID: ${departmentId})\n`);

    // DELETE PHASE: Delete all existing monthly data and department objectives
    console.log('Deleting existing monthly data...');
    const deleteMonthlyResult = await pool.request()
      .input('department_id', sql.Int, departmentId)
      .query(`
        DELETE FROM department_monthly_data 
        WHERE department_id = @department_id
      `);
    console.log(`✓ Deleted existing monthly data\n`);

    console.log('Deleting existing department objectives...');
    const deleteObjectivesResult = await pool.request()
      .input('department_id', sql.Int, departmentId)
      .query(`
        DELETE FROM department_objectives 
        WHERE department_id = @department_id
      `);
    console.log(`✓ Deleted existing department objectives\n`);

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

    // INSERT PHASE: Create new department objectives
    console.log('Creating new department objectives...\n');
    let inserted = 0;

    for (const activity of activities) {
      // Try to match KPI to main_plan_objectives
      let mainObjectiveId = null;
      const normalizeKPI = (kpi) => kpi.replace(/^\d+(\.\d+)*\s*/, '').trim().toLowerCase();
      const normalizedKpi = normalizeKPI(activity.kpi);
      
      for (const [dbKpi, id] of kpiMap.entries()) {
        const normalizedDbKpi = normalizeKPI(dbKpi);
        
        if (normalizedDbKpi === normalizedKpi || 
            normalizedDbKpi.includes(normalizedKpi.substring(0, 30)) ||
            normalizedKpi.includes(normalizedDbKpi.substring(0, 30))) {
          mainObjectiveId = id;
          break;
        }
      }

      // Extract numeric target from target_to_achieve
      const activityTarget = extractNumericTarget(activity.target_to_achieve);

      try {
        const insertRequest = pool.request();
        insertRequest.input('main_objective_id', sql.Int, mainObjectiveId);
        insertRequest.input('department_id', sql.Int, departmentId);
        insertRequest.input('kpi', sql.NVarChar, activity.kpi);
        insertRequest.input('activity', sql.NVarChar, activity.activity);
        insertRequest.input('type', sql.NVarChar, 'Direct');
        insertRequest.input('activity_target', sql.Decimal(18, 2), activityTarget);
        insertRequest.input('responsible_person', sql.NVarChar, activity.responsible || '');
        insertRequest.input('mov', sql.NVarChar, activity.mov || '');

        const result = await insertRequest.query(`
          INSERT INTO department_objectives (main_objective_id, department_id, kpi, activity, type, activity_target, responsible_person, mov)
          OUTPUT INSERTED.id
          VALUES (@main_objective_id, @department_id, @kpi, @activity, @type, @activity_target, @responsible_person, @mov)
        `);
        const newId = result.recordset[0].id;
        console.log(`✓ Inserted: ${activity.activity.substring(0, 60)}... (ID: ${newId})`);
        inserted++;
        createdObjectives.push(newId);
      } catch (error) {
        console.error(`✗ Error processing: ${activity.activity.substring(0, 50)}...`);
        console.error(`  Error: ${error.message}`);
      }
    }

    console.log(`\n✓ Completed department objectives!`);
    console.log(`  - Inserted: ${inserted} records`);
    console.log(`\n✓ All monthly data has been removed (deleted in delete phase)`);

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

replaceCommunicationActivities();

