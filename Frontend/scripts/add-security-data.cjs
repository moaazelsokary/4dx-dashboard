#!/usr/bin/env node

/**
 * Script to add Security department objectives and monthly data
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

// Security department activities data
const activities = [
  // تهيئة الظروف الامنية لتحقيق بيئة عمل أفضل داخل و خارج المقرات
  { kpi: 'تهيئة الظروف الامنية لتحقيق بيئة عمل أفضل داخل و خارج المقرات', activity: 'علاقة أمنية موطدة للحصول على 100 % من الموافقات على الأنشطة', target: 100, responsible: '', type: 'Direct', mov: '' },
  { kpi: 'تهيئة الظروف الامنية لتحقيق بيئة عمل أفضل داخل و خارج المقرات', activity: 'زيارة شهرية مع التسجيل بسيستم الإداره', target: 22, responsible: 'مدير الإداره', type: 'Direct', mov: '' },
  { kpi: 'تهيئة الظروف الامنية لتحقيق بيئة عمل أفضل داخل و خارج المقرات', activity: 'تواصل تليفوني مرتين شهريا مع التسجيل بسيستم الإداره', target: 26, responsible: 'مدير الإداره', type: 'Direct', mov: '' },
  { kpi: 'تهيئة الظروف الامنية لتحقيق بيئة عمل أفضل داخل و خارج المقرات', activity: 'سرعه التحقق من الاوراق الثبوتية الخاصة بالعاملين الجدد', target: 100, responsible: 'مدير الإداره', type: 'Direct', mov: '' },
  
  // بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'تهئيه بيئه أمنيه داخل المقر لإجتماعات المتطوعيين ومجلس الإداره', target: 100, responsible: 'محمد رجب- المشرفه', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'تنفيذ الصيانه الوقائيه اليوميه للمبنى فى جميع المجالات', target: 450, responsible: 'حسين -محمود إسماعيل', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'تنفيذ صيانة شهرية للمقرات بدقه بإستخدام فنيين على أعلى كفاءه مع التسجيل بسيستم الإداره', target: 18, responsible: 'محمد رجب - حسين', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'تنفيذ الصيانه النصف سنويه على أعلى مستوى فنى', target: 3, responsible: 'محمدرجب - فنيين', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'تنفيذ صيانه الوقائيه لأجهزه ذوى الهمم بالمبنى', target: 450, responsible: 'حسين -محمود إسماعيل', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'دفع الايجارات و المنافع الشهرية و الربع سنوية في ميعادها والتسجيل بسيستم الإداره', target: 258, responsible: 'رجب - حسين', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'رفع كفاءة الدور الثانى بمقر المعراج', target: null, responsible: 'الإداره', type: 'Direct', mov: 'رفع كفاءه' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'اعمال الخدمات المعاونة بشكل يومي مع التسجيل بسيستم الإداره', target: 450, responsible: 'المشرفه', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'اعمال التأسيس الاسبوعية مع التسجيل بسيستم الإداره', target: 75, responsible: 'المشرفه', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'مراقبة الكاميرات يوميا مع التسجيل بسيستم الإداره', target: 450, responsible: 'مدير الإداره - المراقبين', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'سرعه الاستجابة لاصلاح الاعطال خلال 24 ساعة طبقا للتيكت المسجل على سيستم المؤسسه', target: 216, responsible: 'رجب - حسين', type: 'Direct', mov: '' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'المتابعه بإستكمال أدوات الامن و السلامة ( اسعافات اولية و طفايات حريق ) ربع سنويا', target: null, responsible: 'رجب - حسين', type: 'Direct', mov: 'نسبة اكتمال ادوات الامن و السلامة ربع سنويا' },
  { kpi: 'بيئة عمل آمنة و صحية تعزز زيادة الانتاجية و رضا العاملين', activity: 'تدريب ربع سنوي على اجراءات الأمن و السلامة مع تريب على الإطفاء نصف سنوى', target: null, responsible: 'الإداره', type: 'Direct', mov: 'تدريب' },
];

// Monthly data from 1/2026 to 6/2027 (18 months)
// Each row corresponds to an activity in the same order
const monthlyData = [
  [4, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Activity 1
  [4, 3, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Activity 2
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], // Activity 3 (empty row)
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], // Activity 4 (empty row)
  [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25], // Activity 5
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Activity 6
  [null, null, 1, null, null, null, null, null, 1, null, null, null, null, null, 1, null, null, null], // Activity 7
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], // Activity 8 (empty row)
  [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25], // Activity 9
  [21, 11, 11, 21, 11, 11, 21, 11, 11, 21, 11, 11, 21, 11, 11, 21, 11, 11], // Activity 10
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], // Activity 11 (empty row)
  [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25], // Activity 12
  [5, 4, 3, 4, 4, 4, 4, 5, 4, 5, 4, 4, 5, 4, 4, 4, 4, 4], // Activity 13
  [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25], // Activity 14
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12], // Activity 15
  [1, null, null, 1, null, null, 1, null, null, 1, null, null, 1, null, null, 1, null, null], // Activity 16
  [null, null, null, null, 1, null, null, null, null, null, 1, null, null, null, null, null, 1, null], // Activity 17
];

// Months from 1/2026 to 6/2027 (18 months)
const months = [
  '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01',
  '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01',
  '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01',
  '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01',
  '2027-05-01', '2027-06-01'
];

async function addSecurityData() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get Security department ID
    console.log('Getting Security department...');
    const deptResult = await pool.request().query(`
      SELECT id FROM departments WHERE code = 'security' OR name LIKE '%Security%' OR name LIKE '%أمن%'
    `);
    
    if (deptResult.recordset.length === 0) {
      throw new Error('Security department not found');
    }
    
    const departmentId = deptResult.recordset[0].id;
    console.log(`✓ Found Security department (ID: ${departmentId})\n`);

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

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
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

    // Create monthly data from 1/2026 to 6/2027 (18 months)
    console.log('\nCreating monthly data from 1/2026 to 6/2027...\n');
    let monthlyInserted = 0;

    for (let i = 0; i < createdObjectives.length && i < monthlyData.length; i++) {
      const deptObjId = createdObjectives[i];
      const monthValues = monthlyData[i];
      
      // Get the KPI and department_id
      const targetRequest = pool.request();
      targetRequest.input('id', sql.Int, deptObjId);
      const targetResult = await targetRequest.query(`
        SELECT kpi, department_id FROM department_objectives WHERE id = @id
      `);
      
      if (targetResult.recordset.length === 0) continue;
      
      const kpi = targetResult.recordset[0].kpi;
      const deptId = targetResult.recordset[0].department_id;

      // Create monthly data for each month
      for (let monthIdx = 0; monthIdx < months.length && monthIdx < monthValues.length; monthIdx++) {
        const month = months[monthIdx];
        const targetValue = monthValues[monthIdx];
        
        // Skip if target value is null
        if (targetValue === null || targetValue === undefined) continue;
        
        try {
          const monthlyRequest = pool.request();
          monthlyRequest.input('kpi', sql.NVarChar, kpi);
          monthlyRequest.input('department_id', sql.Int, deptId);
          monthlyRequest.input('month', sql.Date, month);
          monthlyRequest.input('target_value', sql.Decimal(18, 2), targetValue);

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

    console.log('✅ Security department data import completed successfully!');

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

addSecurityData().catch(console.error);

