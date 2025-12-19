#!/usr/bin/env node

/**
 * Script to add IT department objectives and monthly data
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

// IT department activities data
const activities = [
  // عدد الفرص التطوعية المدارة رقميا من خلال صناع الحياة – 20% من المتاح
  { kpi: 'عدد الفرص التطوعية المدارة رقميا من خلال صناع الحياة – 20% من المتاح', activity: 'Volunteer Mobile APP + Emergency Meeting room', target: 100, responsible: 'Mohamed Salah', type: 'In direct', mov: 'صدور التطبيق' },
  { kpi: 'عدد الفرص التطوعية المدارة رقميا من خلال صناع الحياة – 20% من المتاح', activity: 'تفعيل مشروع منصه التعليم الاليكترونى ل 100 متطوع', target: 100, responsible: 'Mohamed Salah', type: 'In direct', mov: 'حصولهم على شهادات' },
  
  // مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'متابعه تطوير الويب سايت بنسبه 100 % بهدف جمع التبرعات ونشر الاخبار الخاصه بالمؤسسه', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'صدور الويب سايت' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'متابعه اداه يلا جيف 3,373,407 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'التواصل المستمر الموثق مع المنصه الاماراتيه' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'توفير منحة عينية للأصول الالكترونية ( ايميلات و برامج و نظم تشغيل ) بقيمة 3,846,650', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'التواصل المستمر الموثق مع مايكروسوفت' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'الحصول على منحة اوفيس 365 لعدد 450 مستخدم بقيمه 3240000 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'التواصل المستمر الموثق مع مايكروسوفت' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'الحصول على منحه السيرفرات الاون لاين بقيمه 200000 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'التواصل المستمر الموثق مع مايكروسوفت' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'الحصول على منحه الانتى فيرس بقيمه 44650 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'التواصل المستمر الموثق مع مايكروسوفت' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'توفير مبلغ 70000 سنويا لتأمين الفايرول للفرع الرئيسى سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'التواصل المستمر الموثق مع مايكروسوفت' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'توفير نسخه متطوره من الايميلات لعدد 10 مستخدمين بقيمه 132000 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'التواصل المستمر الموثق مع مايكروسوفت' },
  { kpi: 'مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء', activity: 'توفير رخص لويندوز لعدد 200 رخصه لتفعيل الويندوز بقيمه 160000 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'التواصل المستمر الموثق مع مايكروسوفت' },
  
  // نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)
  { kpi: 'نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)', activity: 'متابعه اداه يلا جيف', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'الحصول على المنحه وثيقه' },
  { kpi: 'نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)', activity: 'توفير منحة عينية للأصول الالكترونية ( ايميلات و برامج و نظم تشغيل ) بقيمة 3,846,650', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'الحصول على المنحه وثيقه' },
  { kpi: 'نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)', activity: 'الحصول على منحة اوفيس 365 لعدد 450 مستخدم بقيمه 3240000 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'الحصول على المنحه وثيقه' },
  { kpi: 'نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)', activity: 'الحصول على منحه السيرفرات الاون لاين بقيمه 200000 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'الحصول على المنحه وثيقه' },
  { kpi: 'نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)', activity: 'الحصول على منحه الانتى فيرس بقيمه 44650 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'الحصول على المنحه وثيقه' },
  { kpi: 'نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)', activity: 'توفير مبلغ 70000 سنويا لتأمين الفايرول للفرع الرئيسى سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'الحصول على المنحه وثيقه' },
  { kpi: 'نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)', activity: 'توفير نسخه متطوره من الايميلات لعدد 10 مستخدمين بقيمه 132000 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'الحصول على المنحه وثيقه' },
  { kpi: 'نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)', activity: 'توفير رخص لويندوز لعدد 200 رخصه لتفعيل الويندوز بقيمه 160000 سنويا', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'الحصول على المنحه وثيقه' },
  { kpi: 'نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)', activity: 'متابعه مشروع التحصيل بماكينات ال POS بنسبه 100 %', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: '0 Down Time' },
  
  // زمن إنجاز المعاملات الإدارية الأساسية
  { kpi: 'زمن إنجاز المعاملات الإدارية الأساسية', activity: 'Internal Phone System Installation (Miraj)', target: 100, responsible: 'Islam Ali', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'زمن إنجاز المعاملات الإدارية الأساسية', activity: 'Food Screen Project', target: 100, responsible: 'Islam Ali', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'زمن إنجاز المعاملات الإدارية الأساسية', activity: 'Offices System', target: 100, responsible: 'Ibrahim', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'زمن إنجاز المعاملات الإدارية الأساسية', activity: 'In-Kind volunteers System', target: 100, responsible: 'Ibrahim', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  
  // نسبة امتثال المؤسسة الي تطبيق مفهوم الاستدامة
  { kpi: 'نسبة امتثال المؤسسة الي تطبيق مفهوم الاستدامة', activity: 'Camps Devices Pakcage', target: 100, responsible: 'Ibrahim', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'نسبة امتثال المؤسسة الي تطبيق مفهوم الاستدامة', activity: 'Cameras control Room', target: 100, responsible: 'Mohamed HAmed', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'نسبة امتثال المؤسسة الي تطبيق مفهوم الاستدامة', activity: 'Meerage 2nd Floor', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'نسبة امتثال المؤسسة الي تطبيق مفهوم الاستدامة', activity: 'IT Stock - Asset System', target: 100, responsible: 'Mohamed Hamed', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'نسبة امتثال المؤسسة الي تطبيق مفهوم الاستدامة', activity: 'برنامج تكنولوجيا صناع', target: 100, responsible: 'Ibrahim', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'نسبة امتثال المؤسسة الي تطبيق مفهوم الاستدامة', activity: 'Final Update to IT Policy', target: 100, responsible: 'Mohamed Salah', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  
  // مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'Inventory customized system from Mostafa', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: '70 % على الاقل من الطلبات تم تلبيتها خلال 24 ساعة', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'عمل جرد وفحص دقيق للاجهزه وعمل تحديثات - شهريا', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'توزيع الموارد بما يتناسب مع طبيعة الاعمال بنسبة 70 % ربع سنويا', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'تلبيه جميع طلبات المؤسسه من طلبات هارد وير وسوفت وير عدد 50 جهاز كمبيوتر + 31 لاب توب + 30 كاميرا + 1 طابعه بشكل يومي', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: '(8 PC + 31 Laptop + 10 printer ) ( مقر الصعيد )تلبيه جميع طلبات المؤسسه من طلبات هارد وير وسوفت وير', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'تلبيه جميع طلبات مكاتب الصعيد عددهم 4 مكتب', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'متابعه مخزن تكنولوجيا المعلومات أسبوعيا', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'تلبيه جميع طلبات المكاتب عددهم 15 مكتب من طلبات هارد وير وسوفت وير 11 جهاز كمبيوتر + تروس 4 جهاز كمبيوتر + 7 لابتوب + مقر المقاطعه 5 كمبيوتر فى خلال 24 ساعه كحد أقصى', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'الفحص الاسبوعى لجميع كاميرات المؤسسه (3 مقرات رئيسيه + 15 مكتب + 21 يوث) = 160 كاميرا', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'متابعه يوم بيوم جدران الحمايه ونظام تتبع الفيروسات (firewalls . Bitdefender end point) + انظمه التخزين Nas Storage (PR4100 , QNAP )', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'متابعه خدمات الانترنت يوميا - Uptime 98 %', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'السيرفرات و السيستم 99', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'تلبييه جميع طلبات المؤسسه على نظام ال ERP System لوحدات ( الحسابات - المشتريات - المخازن- الموراد البشريه- التكيت سيستم- الادمن الخاص بهم) خلال 24 ساعة', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'تلبييه جميع طلبات المؤسسه على نظام ال ERP System لوحدات ( التمويل - اداره الحاله - الادمن الخاص بهم )', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'تلبيه جميع طلبات المؤسسه على نظام اودو ( نخيل - كلى - ستور - متطوعين وحملات)', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'تفعيل نظام الارشفة على الادرات بنسبة 100 خلال العام بواقع ادارة كل شهر', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'تلبيه اى طلبات خاصه بمشروع ال website .. استخراج اى تقارير مطلوبه من اداره التمويل', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'متابعه سيرفرات أودو والتدخل العاجل عند وجود مشكله ( Microsoft Azure )', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'متابعه سيرفرات مشروع ال POS و التدخل العاجل عند وجود مشكله ( Microsoft Azure )', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'منابعه سيرفرات مشروع ويب سايت التبرعات والتدخل العاجل عند وجود مشكله (Microsoft Azure )', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'منابعه سيرفرات مشروع تتبع الحالات والتدخل العاجل عند وجود مشكله (Microsoft Azure )', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'تفعيل نظام باكب يومى على جميع مستويات قواعد البيانات ( اودو - ويب سايت - تتبع الحالات - POS - جدران الحمايه - نظام الاتصالات ) ( Microsoft Azure )', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'حل مشاكل اكشاك التبرعات Kiosks ( سوفت وير )', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  { kpi: 'مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs', activity: 'ارسال جميع حملات الرسائل المجمعه بعد الطلب ب 24 ساعه بحد أقصى', target: null, responsible: '', type: 'In direct', mov: 'Ticket System' },
  
  // معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية
  { kpi: 'معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية', activity: 'Odoo Upgrade 17 to 18', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية', activity: 'Odoo Palm Project Delivery', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية', activity: 'Odoo Outside . Kidney Units Project', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية', activity: 'Odoo System with Bank Masr POS Integration', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية', activity: 'Pos Installaments', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية', activity: 'ZK Benefcireis System', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية', activity: 'Booths System Upgrade', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  
  // نسبة القرارات الإدارية المبنية على تحليلات الذكاء الاصطناعي Decision Based on AI
  { kpi: 'نسبة القرارات الإدارية المبنية على تحليلات الذكاء الاصطناعي Decision Based on AI', activity: 'Report Per Department (13 Full Detailed Report)', target: null, responsible: '', type: 'In direct', mov: 'صدور التقرير' },
  { kpi: 'نسبة القرارات الإدارية المبنية على تحليلات الذكاء الاصطناعي Decision Based on AI', activity: 'اجتماع مع كل ادارة ربع سنويا لتطوير الاداوت', target: null, responsible: '', type: 'In direct', mov: 'مسوده الاجتماع' },
  
  // عدد حلول الذكاء الاصطناعي المدمجة في أنظمة المؤسسة
  { kpi: 'عدد حلول الذكاء الاصطناعي المدمجة في أنظمة المؤسسة  (Chatbots – Predictive Analytics – Data Visualization', activity: 'AI for CallCenter Solution', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'عدد حلول الذكاء الاصطناعي المدمجة في أنظمة المؤسسة  (Chatbots – Predictive Analytics – Data Visualization', activity: 'AI Policy and Awareness', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
  { kpi: 'عدد حلول الذكاء الاصطناعي المدمجة في أنظمة المؤسسة  (Chatbots – Predictive Analytics – Data Visualization', activity: '5 AI new Systems for enhanced Efficiency', target: null, responsible: '', type: 'In direct', mov: 'انهاء المشروع وصدور السيستم' },
];

async function addITData() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get IT department ID
    console.log('Getting IT department...');
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE code = 'it' OR name LIKE '%Information Technology%' OR name LIKE '%IT%'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('IT department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found IT department (ID: ${departmentId})\n`);

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
          updateRequest.input('activity_target', sql.Decimal(18, 2), activity.target || 0);
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
          insertRequest.input('type', sql.NVarChar, activity.type);
          insertRequest.input('activity_target', sql.Decimal(18, 2), activity.target || 0);
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

    console.log('✅ IT department data import completed successfully!');

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

addITData().catch(console.error);

