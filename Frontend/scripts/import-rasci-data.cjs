require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

// Parse server and port
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

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER'),
  password: getEnv('PWD') || getEnv('VITE_PWD'),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

// Department name mapping: RASCI data name -> Database name
const RASCI_TO_DB_DEPARTMENT = {
  'Human Resources (HR)': 'Human Resources',
  'Procurement & Supply Chain': 'Procurement',
  'Operations / Program Implementation': 'Operations',
  'Finance': 'Finance',
  'Administration & Legal Affairs': 'Administration',
  'Information Technology (IT)': 'Information Technology',
  'Communication': 'Communication',
  'Direct Fundraising / Resource Mobilization': 'DFR',
  'Monitoring, Evaluation & Learning (MEL)': 'Monitoring, Evaluation & Learning (MEL)',
  'Case Management': 'Case Management',
  'Business Development': 'Business Development',
  'Volunteer Management': 'Volunteer Management',
  'LMF Community': 'Community',
  'S&S M': 'Security',
  'Offices&P': 'Offices',
  'SiS': 'SiS',
};

// Department name variations (for matching)
const DEPARTMENT_NAME_VARIATIONS = {
  'Human Resources': 'Human Resources (HR)',
  'Human Resources (HR)': 'Human Resources (HR)',
  'Procurement': 'Procurement & Supply Chain',
  'Operations': 'Operations / Program Implementation',
  'Communication': 'Communication',
  'DFR': 'Direct Fundraising / Resource Mobilization',
  'Case Management': 'Case Management',
  'Business Development': 'Business Development',
  'Administration': 'Administration & Legal Affairs',
  'Security': 'S&S M',
  'Offices': 'Offices&P',
  'Community': 'LMF Community',
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

async function importRASCIData() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server');

    // First, get all existing departments
    console.log('Loading existing departments...');
    const deptRequest = pool.request();
    const existingDepts = await deptRequest.query('SELECT id, name, code FROM departments');
    const deptMap = new Map();
    existingDepts.recordset.forEach(dept => {
      deptMap.set(dept.code.toLowerCase(), dept);
      deptMap.set(dept.name.toLowerCase(), dept);
    });
    
    console.log(`✓ Loaded ${existingDepts.recordset.length} existing departments`);

    // RASCI data - parsing from the provided text
    const rasciData = `مؤشرات الأداء الرئيسية (KPIs)	"مستهدفات
 7 - 2027"	Human Resources (HR)		Procurement & Supply Chain		Operations / Program Implementation		Finance		Administration & Legal Affairs		Information Technology (IT)		Communication		Direct Fundraising / Resource Mobilization		Monitoring, Evaluation & Learning (MEL)		Case Management		Business Development		Volunteer Management		LMF Community		S&S M		Offices&P		SiS	
عدد المتطوعين المسجلين تراكميا	35,000					R				S	الجمعيات	S		S		R		I		R				A, R						R			
عدد المتطوعين الذين شاركوا بفرصة تطوعية واحدة على الأقل سنويا ( 60 % )	17,000					R				S	الجمعيات	S		S		R		I		R				A, R		R		S	التصاريح الامنية	A, R			
عدد المتطوعين النشطين ( مشاركة بعدد 5 فرص تطوعية على الأقل كل 3 شهور ولمدة سنة) – 50 % من المشاركين	8,000			R	متطوعو الشراء 	R				S	الجمعيات	S		R	متطوعو الاتصال 	R	متطوعو التمويل 	I		R	متطوعو ادارة الحالة 			A, R		R	متطوعو التنظيم 			A, R			
تمثيل الفئات المهمشة (ذوي الإعاقة) 	0.5%					R				S	الجمعيات	S		S		R		I		R				A, R						A, R			
 معدل رضا المتطوع عن التجربة التطوعية في صناع	70%					R				S	الجمعيات	S		S		R		S		R				A, R						A, R			
نسبة المتطوعين الحاصلين على تدريبات اساسية من المتطوعين النشطين - سنويا	50%					R						S						I, S						A, R						R, A		S, C	
عدد المتطوعين الحاصلين على تدريبات متقدمة من المتطوعين النشطين - سنويا	10%	R	internship	R		R		R				S		R	متطوعو الاتصال 	R	متطوعو التمويل 	R	متطوعو المتابعة 	R	متطوعو ادارة الحالة 			A, R		R	متطوعو التنظيم 			R, A		S, C	
عدد المتطوعين المؤهلين للقيادة التطوعية - سنويا	6%																	I, S						A, R						R, A		R	
عدد الفرص التطوعية المتاحة سنويا	200,000	R		R	متطوعو الشراء 	R				S	الجمعيات	S		R	متطوعو الاتصال 	R	متطوعو التمويل 	I, S		R	متطوعو ادارة الحالة 			A, R		R	متطوعو التنظيم 	S	التصاريح الامنية	A, R			
معدل الفرص التطوعية التي تم تفعيلها من المتاح – 80% من المتاح	80%	R		R		R				S	الجمعيات	S		R		R		I, S		R				A, R		R				A, R			
نسبة الفرص التطوعية التي تمت اتاحتها من خلال شراكات مع جهات أخري فيما عدا المشاريع	10%	R	inernship مع جهات اخرى 											R				I, S						A, R						R	جهات محلية 		
متوسط وقت اسناد الفرصة للمتطوع ( الوقت بين التسجيل على الفرصة وتفعيل المتطوع )بالساعات افضل	7 ايام											S						I, S						A, R						A, R			
عدد الفرص التطوعية المدارة رقميا من خلال صناع الحياة – 20% من المتاح	20%					R						R, S		S				I, S						A, R		R				R			
عدد المبادرات التطوعية المرشحة من متطوعين وتم تبنيها من المؤسسة ( مبادرة يتم تفعيل 10 متطوعين فيها على الأقل )	120									S														A, R						A, R			
القيمة الاقتصادية لساعة التطوع ( عدد ساعات التطوع * قيمة الساعه في السوق )	55																							A, R									
عدد المستفيدين المباشرين من الفرص التطوعية	1M					A, R						S		S		R		I		A, R				A, R						R			
عدد قصص النجاح التي افتخرت صناع الحياة بانتساب متطوعيها لهم خلال مرورهم برحلة التطوع عبر صناع الحياة خلال رحلتهم التطوعية	10					R								R	اصدار قصص النجاح			I, S, R						A, R		R				R			
نسبة رضا المستفيدين عن الخدمات المقدمة من المتطوعين	50%			R		A, R												S, I		A, R				A, R						A, R			
عدد الأنشطة الترفيهية/الثقافية/الإبداعية السنوية (رياضة – مسرح – غناء – ورش إبداع)	20			S										S				I, S						A, R		R		S	التصاريح الامنية				
نسبة المتطوعين المشاركين في الأنشطة غير الرسمية من إجمالي المتطوعين	10%																																
عدد الفرق الرسمية (رياضية/فنية) التابعة للمؤسسة	2			S										S				I, S						A, R		R							
عدد المتطوعين المشاركين في المصيف السنوي	600											S						A, S	استبيان وتحليل علي مدار 3 سنين					A, R		R		S	التصاريح الامنية				
عدد الرحلات السنوية للمتطوعين (داخلية/خارجية	2																																
معدل بقاء المتطوعين أكثر من سنتين	20%											S						I, S						A, R		R				A, R			
معدل رضا المتطوعين عن الأنشطة (استبيان سنوي)	70%																	I, S						A, R		R				A, R			
عدد برامج التبادل التطوعي الدولي المنفذة سنويًا	1													R				I, S						A, R		R							
عدد المتطوعين المصريين الموفدين للتبادل سنويًا	10													R				I, S						A, R		R							
عدد المتطوعين الدوليين المستضافين في مصر سنويًا	5													R				I, S						A, R		R							
عدد الشراكات الدولية مع منظمات تطوعية/مؤسسات في أوروبا	2													R				I, S						A, R		R							
إجمالي حجم الإنفاق على المشروعات التنموية مقابل الخيرية (بالقيمة والنسبة المئوية).	29%					A, R		S		S	التراخيص والتصاريح					A, R		I, S															
عدد المشروعات التنموية 	17					A, R		S		S	التراخيص والتصاريح							I, S														C, S	
عدد المستفيدين من المشروعات التنموية	              1,180,000					A, R				S		S		S		R		I, S		R										R			
عدد المستفيدين من المشروعات الخيرية	              2,405,100					A, R				S				S		R		I, S		R										A, R			
نسبة المتطوعين المشاركين في المشروعات التنموية	40٪					A, R												I, S						A, R						R			
مستوى الوعي بالعلامة المؤسسية (Brand Awareness)				R										A, R		R		S		R				A, R		R				A, R		S	
حجم التفاعل الرقمي (عدد المتابعين – معدلات التفاعل – المشاركات).														A, R				S								R							
مؤشر السمعة المؤسسية Net Promoter Score NPS خلال تقييم دوري للجمهور والشركاء.		A, R	موظفين وبيئة عمل العمل	A, R	الموردين 	A, R	partners  و مستفيدين 	R	بنوك و موردين  و تقارير مالية مع الشركاء 	A, R	النزعات القضائية و الشكاوى 	A, R		A, R		A, R	donors , customer services 	S		A, R	المستفيدين 	A, R	النخيل من ناحية التوثيق و المتبرعبن ، الكلى من ناحية المستفيدين و الشركاء في المقاطعة 	A, R	الانشطة التطوعية و السلوك التطوعي 		بيئة العمل و الايفنتات 			A, R		R	
عدد الشراكات المحلية ( شركات – بنوك - .... )	8					A, R				R				S		R, A		I, S												R	محلية		
عدد الشراكات مع المنظمات الدوليه	10					A, R		S		R				S		S		I, S															
عدد الشراكات مع المنظمات المحلية	7					A, R		S		R				S		R		I, S												R, A			
عدد الشراكات مع المؤسسات الحكومية	15					A, R				R				S				I, S														C, S	
عدد الشراكات القاعدية	300					A, R		S		A, R		S		S				I, S												R		C, S	
عدد رجال الاعمال الداعمين	2													S				I, S												A, R		S	
عدد الشركاء الاستراتيجيين الممولين لأكثر من مشروع	8					A, R		S		S				S		R		I, S															
قيمة التمويل الناتج عن الشراكات  (مليون)	180					A, R		S, I						S		A, R		I, S															
عدد مذكرات التفاهم و اتفاقيات الشراكة الموقعة مع منظمات دولية						A, R		S		S				A, R																			
عدد المستفيدين المباشرين من المشروعات						A, R		S		S								I, S		A, R													
معدل الصرف فى المشروعات  Burn Rate				R		A, R		S																									
حجم التمويل لتلك المنح						A, R		S												A, R													
عدد المساهمات البحثية أو الدراسات أو قصص النجاح المنشورة دوليًا حول تجربة صُنّاع الحياة في ملف اللاجئين																		A, R															
عدد المتطوعين المشاركين						R														R				A, R						A, R			
عدد مذكرات التفاهم أو الخطابات الرسمية المؤيدة / عدد الوزارات أو الجهات الحكومية المشاركة						A, R				S				S						A, R													
عدد الشراكات مع القطاع الخاص فى الملف						R, A				S				R						A, R													
عدد الأشخاص الذين وصلت إليهم رسائل التوعية (مباشر وغير مباشر)						A, R								A, R				I, S						A, R						A, R			
عدد الوظائف و التدريبات الوظيفية التى حصل عليها ذوى الإعاقة		A, R				A, R												I, S															
عدد الفعاليات الدامجة المنفذة على مستوى الجمهورية						A								R				I, S								R							
معدل الصرف فى المشروعات  Burn Rate																		I, S															
حجم التمويل						A, R										A, R		I, S															
عدد المشاركين من ذوى الإعاقة فى مسابقة وطنية سنوية لمواهب ذوى الإعاقة																		I, S															
عدد المتطوعين الذين كونوا صداقات مع ذوى الإعاقة						R												I, S						A, R						A, R			
عدد المتطوعين المشاركين						R												I, S						A, R						A, R			
عدد الشراكات (قطاع خاص – دولى)						A, R				S				R				I															
عدد مذكرات التفاهم أو الخطابات الرسمية المؤيدة / عدد الوزارات أو الجهات الحكومية المشاركة						A, R				S				R				I															
تصميم وتنفيذ حملات وطنية سنوية حول قضايا المجتمع						A, R								S				I, S						R						R			
عدد المواطنين الذين تم الوصول إليهم						A, R								S				I, S						R						R			
عدد المواطنين الذين تم توعيتهم						A, R								S				I, S						R						R			
عدد المتطوعين المدرَّبين على المناصرة والتوعية						A, R								S				I, S						A, R						A, R			
حجم التمويل						A, R												I, S															
عدد المتطوعين المشاركين فى حملات التوعية						A, R												I, S						A, R						A, R			
عدد الشراكات (قطاع خاص – دولى)						A, R				S				S, R				I															
عدد مذكرات التفاهم أو الخطابات الرسمية المؤيدة / عدد الوزارات أو الجهات الحكومية المشاركة						A, R				S				S, R				I															
عدد المشتركيين في كل مستوي 	300 مشترك 																							S									
عدد الشركاء ( مدارس - جامعات - مجتمع صناع الحياة )	5 مدارس 																	R															
نسبة رضا المشتركين 	80% رضا  																	R															
عدد المشاركات في إيفنتات شبابية 	4 ايفنتات 																																
زيادة عدد متابعين الصفحة 	25000													S																			
عمل 2 ايفنت 	بحضور 2000 مشارك																																
عدد قنوات سوشيال ميديا 	2 new platform 													S																			
عدد مشتركين من ذوي الإعاقة 	20مشترك 																																
عدد الجهات المانحة سنويًا (محلية – إقليمية – دولية )	24					A, R				S				S		A, R		I, S															
إجمالي حجم الأعمال السنوى للمؤسسة (مليون جنيه ) غير شامل العينى	550					A, R				S				S		A, R		I, S						R						R			
إجمالي حجم الأعمال السنوى للمؤسسة (مليون جنيه ) شامل العينى	700					A, R				S				S		A, R		I, S						R						R			
حجم التمويل من Unrestricted Funds (أرباح الشركة + العائد من النخيل + العائد من الكلى + فوائد البنوك + مصادر اخرى)	75							A, R		S				S		A, R		I, S				A, R											
حجم التمويل من المنح	250					A, R				S				S		A, R		I, S												R			
حجم التمويل الفردى	300					S				S				S		A, R		I, S						R						R			
حجم التمويل الغير مقيد من أجمالى التمويل الفردى	75					S				S				S		A, R		I, S						R						R			
نسبة المصروفات الإدارية إلى إجمالي العائد/الدخل ( Administrative Expenses Ratio)	13%	R		R		R		A, R				R				R																S, I	
نسبة تغطية المصروفات الإدارية من مساهمات الشركات	30%							S, I																									
زمن إنجاز المعاملات الإدارية الأساسية	4	A, R		A, R				A, R		A, R		A, R		A, R				I, S		A, R						R		A, R		A, R		S	
نسبة امتثال المؤسسة الي تطبيق مفهوم الاستدامة	20%	A, R		A, R		A, R		A, R		A, R		A, R		A, R		A, R		I, S		A, R		A, R		A, R		A, R		R		A, R		S	
نسبة الموظفين الحاصلين على تدريبات أساسية في وظائفهم سنويًا		R		S								S		S				I, S								S						A, R	
نسبة الموظفين الحاصلين على تدريبات متقدمة مرتبطة بمهامهم التشغيلية		R		S								S		S				I, S								S						A, R	
مستوى تطبيق الأنظمة والعمليات الداخلية المعيارية بشكل رقمي SOPs		R		R		R		R		R		R, A		R		R		A, R		R		R		R		R		R		R		C, S	
معدل الأتمتة والرقمنة في العمليات الإدارية والمالية والموارد البشرية.		R		R		R		R		R		A, R		R		R		I, S, A, R		R		R		R		R		R		R			
نسبة القرارات الإدارية المبنية على تحليلات الذكاء الاصطناعي Decision Based on AI		R		R		R		R				A, R		R		R		I, S, A, R															
عدد حلول الذكاء الاصطناعي المدمجة في أنظمة المؤسسة  (Chatbots – Predictive Analytics – Data Visualization												A, R						I, S, R, A															
عدد/نسبة الأقسام التي طبقت SLA	50%									A, R, C								A, R, S, I															
نسبة الالتزام بالتقارير الدورية عن تطبيق الـ SOPs	100%									A, R, C								A, R, S, I															`;

    const lines = rasciData.split('\n').filter(line => line.trim());
    console.log(`Parsing ${lines.length} lines...`);

    // Get department headers from first line
    const headerLine = lines[0];
    const headerParts = headerLine.split('\t').map(p => p.trim());
    
    // Find department columns - use fixed order based on the actual data structure
    // The columns are: KPI | Target | HR | Procurement | Operations | Finance | Admin | IT | Communication | DFR | MEL | Case | BD | Volunteer | LMF | S&S | Offices | SiS
    const departments = [];
    const departmentIndices = new Map(); // Map column index to RASCI department name
    
    const fixedDepartments = [
      'Human Resources (HR)',
      'Procurement & Supply Chain',
      'Operations / Program Implementation',
      'Finance',
      'Administration & Legal Affairs',
      'Information Technology (IT)',
      'Communication',
      'Direct Fundraising / Resource Mobilization',
      'Monitoring, Evaluation & Learning (MEL)',
      'Case Management',
      'Business Development',
      'Volunteer Management',
      'LMF Community',
      'S&S M',
      'Offices&P',
      'SiS'
    ];
    
    // Set indices starting from column 2 (after KPI and target)
    for (let i = 0; i < fixedDepartments.length; i++) {
      const rasciDeptName = fixedDepartments[i];
      if (RASCI_TO_DB_DEPARTMENT[rasciDeptName]) {
        departmentIndices.set(i + 2, rasciDeptName);
        departments.push(rasciDeptName);
      }
    }

    console.log(`Found ${departments.length} departments:`, departments);

    let inserted = 0;
    let skipped = 0;

    // Process data lines (skip header line)
    for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const parts = line.split('\t').map(p => p.trim());
      
      if (parts.length < 3) {
        console.log(`⚠️  Skipping line ${lineIdx + 1} (insufficient columns): ${line.substring(0, 50)}...`);
        skipped++;
        continue;
      }

      const kpi = parts[0] || '';
      
      if (!kpi || kpi === 'مؤشرات الأداء الرئيسية (KPIs)') {
        continue; // Skip header or empty lines
      }

      // Process each department column
      for (const [colIndex, rasciDeptName] of departmentIndices.entries()) {
        if (colIndex >= parts.length) continue;
        
        const rasciValue = parts[colIndex] || '';
        
        // Skip if no RASCI value or if it's just department-related text
        // But allow text that contains RASCI letters (R, A, S, C, I)
        if (!rasciValue || rasciValue.trim() === '') {
          continue;
        }
        
        // Skip if it's just descriptive text without RASCI letters
        const hasRASCI = /[RASCI]/i.test(rasciValue);
        if (!hasRASCI && rasciValue.match(/^(الجمعيات|متطوعو|التصاريح|التراخيص|موظفين|الموردين|partners|بنوك|النزعات|donors|المستفيدين|النخيل|الكلى|الانشطة|بيئة|محلية|جهات|internship|inernship|مشترك|مدارس|رضا|مشاركات|ايفنت|مشارك|متابعين|قنوات|platform|مشتركين)/)) {
          continue;
        }

        // Map RASCI department name to database department name
        const dbDeptName = RASCI_TO_DB_DEPARTMENT[rasciDeptName] || rasciDeptName;
        
        // Verify department exists
        const dept = deptMap.get(dbDeptName.toLowerCase());
        if (!dept) {
          console.log(`⚠️  Skipping ${rasciDeptName} -> ${dbDeptName} (department not found in database)`);
          skipped++;
          continue;
        }

        const rasci = parseRASCI(rasciValue);
        
        // Only insert if at least one role is assigned
        if (rasci.responsible || rasci.accountable || rasci.supportive || rasci.consulted || rasci.informed) {
          try {
            const request = pool.request();
            request.input('kpi', sql.NVarChar, kpi);
            request.input('department', sql.NVarChar, dbDeptName); // Use database department name
            request.input('responsible', sql.Bit, rasci.responsible);
            request.input('accountable', sql.Bit, rasci.accountable);
            request.input('supportive', sql.Bit, rasci.supportive);
            request.input('consulted', sql.Bit, rasci.consulted);
            request.input('informed', sql.Bit, rasci.informed);

            await request.query(`
              MERGE rasci_metrics AS target
              USING (SELECT @kpi AS kpi, @department AS department) AS source
              ON target.kpi = source.kpi AND target.department = source.department
              WHEN MATCHED THEN
                UPDATE SET 
                  responsible = @responsible,
                  accountable = @accountable,
                  supportive = @supportive,
                  consulted = @consulted,
                  informed = @informed
              WHEN NOT MATCHED THEN
                INSERT (kpi, department, responsible, accountable, supportive, consulted, informed)
                VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed);
            `);

            inserted++;
            if (inserted % 50 === 0) {
              console.log(`✅ Inserted ${inserted} RASCI assignments...`);
            }
          } catch (error) {
            console.error(`❌ Error inserting RASCI for ${kpi} - ${dbDeptName}:`, error.message);
            skipped++;
          }
        }
      }
    }

    console.log(`\n✅ Import completed!`);
    console.log(`   Inserted: ${inserted} RASCI assignments`);
    console.log(`   Skipped: ${skipped} entries`);
    
    await pool.close();
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

importRASCIData();

