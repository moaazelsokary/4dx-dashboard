#!/usr/bin/env node

/**
 * Script to import RASCI data from the provided table
 * Department mapping:
 * - Human Resources (HR) → Human Resources
 * - Procurement & Supply Chain → Procurement
 * - Operations / Program Implementation → Operations
 * - Finance → Finance
 * - Administration & Legal Affairs → Administration
 * - Information Technology (IT) → Information Technology
 * - Communication → Communication
 * - Direct Fundraising / Resource Mobilization → Direct Fundraising / Resource Mobilization
 * - Monitoring, Evaluation & Learning (MEL) → Monitoring, Evaluation & Learning (MEL)
 * - Case Management → Case Management
 * - Business Development → Business Development
 * - Volunteer Management → Volunteer Management
 * - LMF Community → Community
 * - Security&Safety → Security
 * - Offices&P → Offices
 * - SiS → SiS
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

// Department name mapping: Table name → Database name
const DEPARTMENT_MAP = {
  'Human Resources (HR)': 'Human Resources',
  'Procurement & Supply Chain': 'Procurement',
  'Operations / Program Implementation': 'Operations',
  'Finance': 'Finance',
  'Administration & Legal Affairs': 'Administration',
  'Information Technology (IT)': 'Information Technology',
  'Communication': 'Communication',
  'Direct Fundraising / Resource Mobilization': 'Direct Fundraising / Resource Mobilization',
  'Monitoring, Evaluation & Learning (MEL)': 'Monitoring, Evaluation & Learning (MEL)',
  'Case Management': 'Case Management',
  'Business Development': 'Business Development',
  'Volunteer Management': 'Volunteer Management',
  'LMF Community': 'Community',
  'Security&Safety': 'Security',
  'Offices&P': 'Offices',
  'SiS': 'SiS',
};

// Parse RASCI value (can be "R", "A", "S", "C", "I", or combinations like "A, R", "I, S")
function parseRASCI(value) {
  if (!value || value.trim() === '') {
    return { responsible: false, accountable: false, supportive: false, consulted: false, informed: false };
  }
  
  const cleaned = value.trim().toUpperCase();
  const parts = cleaned.split(',').map(p => p.trim());
  
  return {
    responsible: parts.includes('R'),
    accountable: parts.includes('A'),
    supportive: parts.includes('S'),
    consulted: parts.includes('C'),
    informed: parts.includes('I'),
  };
}

// RASCI data from the table
const rasciData = `Human Resources (HR)		Procurement & Supply Chain		Operations / Program Implementation		Finance		Administration & Legal Affairs		Information Technology (IT)		Communication		Direct Fundraising / Resource Mobilization		Monitoring, Evaluation & Learning (MEL)		Case Management		Business Development		Volunteer Management		LMF Community		Security&Safety		Offices&P		SiS	
1.1.1	عدد المتطوعين المسجلين تراكميا					R				S	الجمعيات	S		S		R		I		R				A, R						R			
1.1.2	عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )					R				S	الجمعيات	S		S		R		I		R				A, R		R		S	التصاريح الامنية	A, R			
1.1.3	عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين			R	متطوعو الشراء 	R				S	الجمعيات	S		R	متطوعو الاتصال 	R	متطوعو التمويل 	I		R	متطوعو ادارة الحالة 			A, R		R	متطوعو التنظيم 			A, R			
1.1.4	تمثيل الفئات المهمشة (ذوي الإعاقة)					R				S	الجمعيات	S		S		R		I		R				A, R						A, R			
1.1.5	معدل رضا المتطوع عن التجربة التطوعية في صناع					R				S	الجمعيات	S		S		R		S		R				A, R						A, R			
1.2.1	نسبة المتطوعين الحاصلين على تدريبات اساسية من المتطوعين النشطين - سنويا					R						S						I, S						A, R						R, A		S, C	
1.2.2	عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا	R	internship	R		R		R				S		R	متطوعو الاتصال 	R	متطوعو التمويل 	R	متطوعو المتابعة 	R	متطوعو ادارة الحالة 			A, R		R	متطوعو التنظيم 			R, A		S, C	
1.2.3	عدد المتطوعين المؤهلين للقيادة التطوعية - سنويا																	I, S						A, R						R, A		R	
1.3.1	عدد الفرص التطوعية المتاحة سنويا	R		R	متطوعو الشراء 	R				S	الجمعيات	S		R	متطوعو الاتصال 	R	متطوعو التمويل 	I, S		R	متطوعو ادارة الحالة 			A, R		R	متطوعو التنظيم 	S	التصاريح الامنية	A, R			
1.3.2	معدل الفرص التطوعية التي تم تفعيلها من المتاح – 80% من المتاح	R		R		R				S	الجمعيات	S		R		R		I, S		R				A, R		R				A, R			
1.3.3	نسبة الفرص التطوعية التي تمت اتاحتها من خلال شراكات مع جهات أخري فيما عدا المشاريع	R	inernship مع جهات اخرى 											R				I, S						A, R						R	جهات محلية 		
1.3.4	متوسط وقت اسناد الفرصة للمتطوع ( الوقت بين التسجيل على الفرصة وتفعيل المتطوع )بالساعات افضل											S						I, S						A, R						A, R			
1.3.5	عدد الفرص التطوعية المدارة رقميا من خلال صناع الحياة – 20% من المتاح					R						R, S		S				I, S						A, R		R				R			
1.3.6	عدد المبادرات التطوعية المرشحة من متطوعين وتم تبنيها من المؤسسة ( مبادرة يتم تفعيل 10 متطوعين فيها على الأقل )									S														A, R						A, R			
1.3.7	القيمة الاقتصادية لساعة التطوع ( عدد ساعات التطوع * قيمة الساعه في السوق )																							A, R									
1.4.1	عدد المستفيدين المباشرين من الفرص التطوعية					A, R						S		S		R		I		A, R				A, R						R			
1.4.2	عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية					R								R	اصدار قصص النجاح			I, S, R						A, R		R				R			
1.4.3	نسبة رضا المستفيدين عن الخدمات المقدمة من المتطوعين			R		A, R												S, I		A, R				A, R						A, R			
1.5.1	عدد الأنشطة الترفيهية/الثقافية/الإبداعية السنوية (رياضة – مسرح – غناء – ورش إبداع)			S										S				I, S						A, R		R		S	التصاريح الامنية				
1.5.2	نسبة المتطوعين المشاركين في الأنشطة غير الرسمية من إجمالي المتطوعين																																
1.5.3	عدد الفرق الرسمية (رياضية/فنية) التابعة للمؤسسة			S										S				I, S						A, R		R							
1.5.4	عدد المتطوعين المشاركين في المصيف السنوي											S						A, S	استبيان وتحليل علي مدار 3 سنين					A, R		R		S	التصاريح الامنية				
1.5.5	عدد الرحلات السنوية للمتطوعين (داخلية/خارجية																																
1.5.6	معدل بقاء المتطوعين أكثر من سنتين											S						I, S						A, R		R				A, R			
1.5.7	معدل رضا المتطوعين عن الأنشطة (استبيان سنوي)																	I, S						A, R		R				A, R			
1.5.8	عدد برامج التبادل التطوعي الدولي المنفذة سنويًا													R				I, S						A, R		R							
1.5.9	عدد المتطوعين المصريين الموفدين للتبادل سنويًا													R				I, S						A, R		R							
1.5.10	عدد المتطوعين الدوليين المستضافين في مصر سنويًا													R				I, S						A, R		R							
1.5.11	عدد الشراكات الدولية مع منظمات تطوعية/مؤسسات في أوروبا													R				I, S						A, R		R							
2.1.1	إجمالي حجم الإنفاق على المشروعات التنموية مقابل الخيرية (بالقيمة والنسبة المئوية).					A, R		S		S	التراخيص والتصاريح					A, R		I, S															
2.1.2	عدد المشروعات التنموية					A, R		S		S	التراخيص والتصاريح							I, S														C, S	
2.1.3	عدد المستفيدين من المشروعات التنموية					A, R				S		S		S		R		I, S		R										R			
2.1.4	عدد المستفيدين من المشروعات الخيرية					A, R				S				S		R		I, S		R										A, R			
2.1.5	نسبة المتطوعين المشاركين في المشروعات التنموية					A, R												I, S						A, R						R			
3.1.1	مستوى الوعي بالعلامة المؤسسية (Brand Awareness)			R										A, R		R		S		R				A, R		R				A, R		S	
3.1.2	حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات).													A, R				S								R							
3.1.3	مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء.	A, R	موظفين وبيئة عمل العمل	A, R	الموردين 	A, R	partners  و مستفيدين 	R	بنوك و موردين  و تقارير مالية مع الشركاء 	A, R	النزعات القضائية و الشكاوى 	A, R		A, R		A, R	donors , customer services 	S		A, R	المستفيدين 	A, R	النخيل من ناحية التوثيق و المتبرعبن ، الكلى من ناحية المستفيدين و الشركاء في المقاطعة 	A, R	الانشطة التطوعية و السلوك التطوعي 		بيئة العمل و الايفنتات 			A, R		R	
4.1.1	عدد الشراكات المحلية ( شركات – بنوك - .... )					A, R				R				S		R, A		I, S												R	محلية		
4.1.2	عدد الشراكات مع المنظمات الدوليه					A, R		S		R				S		S		I, S															
4.1.3	عدد الشراكات مع المنظمات المحلية					A, R		S		R				S		R		I, S												R, A			
4.1.4	عدد الشراكات مع المؤسسات الحكومية					A, R				R				S				I, S														C, S	
4.1.5	عدد الشراكات القاعدية					A, R		S		A, R		S		S				I, S												R		C, S	
4.1.6	عدد رجال الاعمال الداعمين													S				I, S												A, R		S	
4.1.7	عدد الشركاء الاستراتيجيين الممولين لأكثر من مشروع					A, R		S		S				S		R		I, S															
4.1.8	قيمة التمويل الناتج عن الشراكات  (مليون)					A, R		S, I						S		A, R		I, S															
5.1.1	عدد مذكرات التفاهم و اتفاقيات الشراكة الموقعة مع منظمات دولية					A, R		S		S				A, R																			
5.1.3	عدد المستفيدين المباشرين من المشروعات					A, R		S		S								I, S		A, R													
5.1.4	معدل الصرف فى المشروعات  Burn Rate			R		A, R		S																									
5.1.5	حجم التمويل لتلك المنح					A, R		S												A, R													
5.1.6	عدد المساهمات البحثية أو الدراسات أو قصص النجاح المنشورة دوليًا حول تجربة صُنّاع الحياة في ملف اللاجئين																	A, R															
5.1.7	عدد المتطوعين المشاركين					R														R				A, R						A, R			
5.1.8	عدد مذكرات التفاهم أو الخطابات الرسمية المؤيدة / عدد الوزارات أو الجهات الحكومية المشاركة					A, R				S				S						A, R													
5.1.9	عدد الشراكات مع القطاع الخاص فى الملف					R, A				S				R						A, R													
5.2.1	عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)					A, R								A, R				I, S						A, R						A, R			
5.2.2	عدد الوظائف و التدريبات الوظيفية التى حصل عليها ذوى الإعاقة	A, R				A, R												I, S															
5.2.3	عدد الفعاليات الدامجة المنفذة على مستوى الجمهورية					A								R				I, S								R							
5.2.4	معدل الصرف فى المشروعات  Burn Rate																	I, S															
5.2.5	حجم التمويل					A, R										A, R		I, S															
5.2.6	عدد المشاركين من ذوى الإعاقة فى مسابقة وطنية سنوية لمواهب ذوى الإعاقة																	I, S															
5.2.7	عدد المتطوعين الذين كونوا صداقات مع ذوى الإعاقة					R												I, S						A, R						A, R			
5.2.8	عدد المتطوعين المشاركين					R												I, S						A, R						A, R			
5.2.9	عدد الشراكات (قطاع خاص – دولى)					A, R				S				R				I															
5.2.10	عدد مذكرات التفاهم أو الخطابات الرسمية المؤيدة / عدد الوزارات أو الجهات الحكومية المشاركة					A, R				S				R				I															
5.3.1	تصميم وتنفيذ حملات وطنية سنوية حول قضايا المجتمع					A, R								S				I, S						R						R			
5.3.2	عدد المواطنين الذين تم الوصول إليهم					A, R								S				I, S						R						R			
5.3.3	عدد المواطنين الذين تم توعيتهم					A, R								S				I, S						R						R			
5.3.4	عدد المتطوعين المدرَّبين على المناصرة والتوعية					A, R								S				I, S						A, R						A, R			
5.3.6	حجم التمويل					A, R												I, S															
5.3.7	عدد المتطوعين المشاركين فى حملات التوعية					A, R												I, S						A, R						A, R			
5.3.8	عدد الشراكات (قطاع خاص – دولى)					A, R				S				S, R				I															
5.3.9	عدد مذكرات التفاهم أو الخطابات الرسمية المؤيدة / عدد الوزارات أو الجهات الحكومية المشاركة					A, R				S				S, R				I															
5.4.1	عدد المشتركيين في كل مستوي																							S									
5.4.2	عدد الشركاء ( مدارس - جامعات - مجتمع صناع الحياة )																	R															
5.4.3	نسبة رضا المشتركين																	R															
5.4.4	عدد المشاركات في إيفنتات شبابية																																
5.4.5	زيادة عدد متابعين الصفحة													S																			
5.4.6	عمل 2 ايفنت																																
5.4.7	عدد قنوات سوشيال ميديا													S																			
5.4.8	عدد مشتركين من ذوي الإعاقة																																
6.1.1	عدد الجهات المانحة سنويًا (محلية – إقليمية – دولية )					A, R				S				S		A, R		I, S															
6.1.2	إجمالي حجم الأعمال السنوى للمؤسسة (مليون جنيه ) غير شامل العينى					A, R				S				S		A, R		I, S						R						R			
6.1.3	إجمالي حجم الأعمال السنوى للمؤسسة (مليون جنيه ) شامل العينى					A, R				S				S		A, R		I, S						R						R			
6.1.4	حجم التمويل من Unrestricted Funds (أرباح الشركة + العائد من النخيل + العائد من الكلى + فوائد البنوك + مصادر اخرى)							A, R		S				S		A, R		I, S				A, R											
6.1.5	حجم التمويل من المنح					A, R				S				S		A, R		I, S												R			
6.1.6	حجم التمويل الفردى					S				S				S		A, R		I, S						R						R			
6.1.7	حجم التمويل الغير مقيد من أجمالى التمويل الفردى					S				S				S		A, R		I, S						R						R			
7.1.1	نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)	R		R		R		A, R				R				R																S, I	
7.1.2	نسبة تغطية المصروفات الإدارية من مساهمات الشركات							S, I																									
7.1.3	زمن إنجاز المعاملات الإدارية الأساسية	A, R		A, R				A, R		A, R		A, R		A, R				I, S		A, R						R		A, R		A, R		S	
7.1.4	نسبة امتثال المؤسسة الي تطبيق مفهوم الاستدامة	A, R		A, R		A, R		A, R		A, R		A, R		A, R		A, R		I, S		A, R		A, R		A, R		A, R		R		A, R		S	
7.1.5	نسبة الموظفين الحاصلين على تدريبات أساسية في وظائفهم سنويًا	R		S								S		S				I, S								S						A, R	
7.1.6	نسبة الموظفين الحاصلين على تدريبات متقدمة مرتبطة بمهامهم التشغيلية	R		S								S		S				I, S								S						A, R	
8.1.1	مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs	R		R		R		R		R		R, A		R		R		A, R		R		R		R		R		R		R		C, S	
8.1.2	معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية.	R		R		R		R		R		A, R		R		R		I, S, A, R		R		R		R		R		R		R			
8.1.3	نسبة القرارات الإدارية المبنية على تحليلات الذكاء الاصطناعي Decision Based on AI	R		R		R		R				A, R		R		R		I, S, A, R															
8.1.4	عدد حلول الذكاء الاصطناعي المدمجة في أنظمة المؤسسة  (Chatbots – Predictive Analytics – Data Visualization											A, R						I, S, R, A															
9.1.1	عدد/نسبة الأقسام التي طبقت SLA									A, R, C								A, R, S, I															
9.1.2	نسبة الالتزام بالتقارير الدورية عن تطبيق الـ SOPs									A, R, C								A, R, S, I															`;

async function importRASCIFromTable() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Parse the data
    const lines = rasciData.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('Invalid data format: need at least header and one data row');
    }

    // Get department headers from first line
    const headerLine = lines[0];
    const headerParts = headerLine.split('\t').map(p => p.trim());
    
    // Find department columns - skip first two columns (empty and KPI number/name)
    const departmentHeaders = [];
    const departmentIndices = [];
    
    for (let i = 2; i < headerParts.length; i++) {
      const header = headerParts[i];
      if (header && DEPARTMENT_MAP[header]) {
        departmentHeaders.push(header);
        departmentIndices.push(i);
      }
    }

    console.log(`Found ${departmentHeaders.length} departments to process:\n`);
    departmentHeaders.forEach((h, idx) => {
      console.log(`  ${idx + 1}. ${h} → ${DEPARTMENT_MAP[h]}`);
    });
    console.log('');

    // Get all KPIs from main_plan_objectives to match by KPI number
    console.log('Loading KPIs from database...');
    const kpiRequest = pool.request();
    const kpis = await kpiRequest.query('SELECT id, kpi FROM main_plan_objectives ORDER BY kpi');
    const kpiMap = new Map();
    kpis.recordset.forEach(row => {
      // Extract KPI number (e.g., "1.1.1" from "1.1.1 عدد المتطوعين...")
      const kpiNum = row.kpi.split(/\s/)[0];
      kpiMap.set(kpiNum, row.kpi);
    });
    console.log(`✓ Loaded ${kpiMap.size} KPIs from database\n`);

    // Process data lines (skip header line)
    let inserted = 0;
    let skipped = 0;
    let errors = [];

    console.log('Processing RASCI data...\n');

    for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const parts = line.split('\t').map(p => p.trim());
      
      if (parts.length < 3) {
        skipped++;
        continue;
      }

      // First column is KPI number, second is KPI name (Arabic)
      const kpiNum = parts[0];
      const kpiName = parts[1];
      
      // Find full KPI from database
      const fullKPI = kpiMap.get(kpiNum);
      if (!fullKPI) {
        console.log(`⚠ Skipping KPI ${kpiNum} - not found in database`);
        skipped++;
        continue;
      }

      // Process each department column
      for (let deptIdx = 0; deptIdx < departmentIndices.length; deptIdx++) {
        const colIdx = departmentIndices[deptIdx];
        const tableDeptName = departmentHeaders[deptIdx];
        const dbDeptName = DEPARTMENT_MAP[tableDeptName];
        const rasciValue = parts[colIdx] || '';

        // Parse RASCI value
        const rasci = parseRASCI(rasciValue);
        
        // Only insert if at least one role is assigned
        if (rasci.responsible || rasci.accountable || rasci.supportive || rasci.consulted || rasci.informed) {
          try {
            const insertRequest = pool.request();
            insertRequest.input('kpi', sql.NVarChar, fullKPI);
            insertRequest.input('department', sql.NVarChar, dbDeptName);
            insertRequest.input('responsible', sql.Bit, rasci.responsible);
            insertRequest.input('accountable', sql.Bit, rasci.accountable);
            insertRequest.input('supportive', sql.Bit, rasci.supportive);
            insertRequest.input('consulted', sql.Bit, rasci.consulted);
            insertRequest.input('informed', sql.Bit, rasci.informed);

            await insertRequest.query(`
              INSERT INTO rasci_metrics (kpi, department, responsible, accountable, supportive, consulted, informed)
              VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed)
            `);

            inserted++;
          } catch (error) {
            if (error.message && error.message.includes('UNIQUE KEY constraint')) {
              // Duplicate - skip
              skipped++;
            } else {
              errors.push(`KPI ${kpiNum}, Dept ${dbDeptName}: ${error.message}`);
            }
          }
        }
      }
    }

    console.log(`\n✓ Import completed!`);
    console.log(`  - Inserted: ${inserted} records`);
    console.log(`  - Skipped: ${skipped} records`);
    if (errors.length > 0) {
      console.log(`  - Errors: ${errors.length}`);
      errors.slice(0, 10).forEach(err => console.log(`    ${err}`));
      if (errors.length > 10) {
        console.log(`    ... and ${errors.length - 10} more errors`);
      }
    }

    // Verify
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest.query('SELECT COUNT(*) as count FROM rasci_metrics');
    console.log(`\n✓ Total records in rasci_metrics: ${verifyResult.recordset[0].count}`);

  } catch (error) {
    console.error('❌ Import failed:', error.message);
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

importRASCIFromTable().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

