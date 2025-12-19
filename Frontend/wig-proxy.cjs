require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('./netlify/functions/db.cjs');

const app = express();
const PORT = 3003;

// Enable CORS
app.use(cors({
  origin: function(origin, callback) {
    if (
      !origin ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Import all handler functions - we'll copy the key ones we need
// For now, let's create a simplified version that handles the main endpoints

// Helper to handle errors
function handleError(res, error, message) {
  console.error(`[WIG Proxy] ${message}:`, error);
  res.status(500).json({ 
    error: error.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
}

// Main Plan Objectives Routes
app.get('/api/wig/main-objectives', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request.query('SELECT * FROM main_plan_objectives ORDER BY pillar, objective, target, kpi');
    res.json(result.recordset);
  } catch (error) {
    handleError(res, error, 'Error getting main objectives');
  }
});

app.get('/api/wig/main-objectives/hierarchy', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const objectives = await request.query(`
      SELECT * FROM main_plan_objectives 
      ORDER BY pillar, objective, target, kpi
    `);

    // Group by hierarchy
    const pillars = {};
    objectives.recordset.forEach((obj) => {
      if (!pillars[obj.pillar]) {
        pillars[obj.pillar] = {};
      }
      if (!pillars[obj.pillar][obj.objective]) {
        pillars[obj.pillar][obj.objective] = {};
      }
      if (!pillars[obj.pillar][obj.objective][obj.target]) {
        pillars[obj.pillar][obj.objective][obj.target] = [];
      }
      pillars[obj.pillar][obj.objective][obj.target].push({
        kpi: obj.kpi,
        annual_target: obj.annual_target,
        id: obj.id,
      });
    });

    // Define pillar order: Strategic Themes, Contributors, Strategic Enablers
    const pillarOrder = ['Strategic Themes', 'Contributors', 'Strategic Enablers'];
    const pillarOrderMap = new Map();
    pillarOrder.forEach((p, i) => pillarOrderMap.set(p, i));

    // Transform to hierarchical structure with proper pillar ordering
    const sortedPillars = Object.keys(pillars).sort((a, b) => {
      const aOrder = pillarOrderMap.has(a) ? pillarOrderMap.get(a) : 999;
      const bOrder = pillarOrderMap.has(b) ? pillarOrderMap.get(b) : 999;
      return aOrder - bOrder;
    });

    const result = {
      pillars: sortedPillars.map((pillar) => ({
        pillar,
        objectives: Object.keys(pillars[pillar]).map((objective) => ({
          objective,
          objectiveId: objectives.recordset.find((o) => o.objective === objective && o.pillar === pillar)?.id,
          targets: Object.keys(pillars[pillar][objective]).map((target) => ({
            target,
            kpis: pillars[pillar][objective][target],
          })),
        })),
      })),
    };

    res.json(result);
  } catch (error) {
    handleError(res, error, 'Error getting hierarchical plan');
  }
});

app.post('/api/wig/main-objectives', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('pillar', sql.NVarChar, req.body.pillar);
    request.input('objective', sql.NVarChar, req.body.objective);
    request.input('target', sql.NVarChar, req.body.target);
    request.input('kpi', sql.NVarChar, req.body.kpi);
    request.input('annual_target', sql.Decimal(18, 2), req.body.annual_target);

    const result = await request.query(`
      INSERT INTO main_plan_objectives (pillar, objective, target, kpi, annual_target)
      OUTPUT INSERTED.*
      VALUES (@pillar, @objective, @target, @kpi, @annual_target)
    `);

    res.json(result.recordset[0]);
  } catch (error) {
    handleError(res, error, 'Error creating main objective');
  }
});

app.put('/api/wig/main-objectives/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.Int, parseInt(req.params.id));
    request.input('pillar', sql.NVarChar, req.body.pillar);
    request.input('objective', sql.NVarChar, req.body.objective);
    request.input('target', sql.NVarChar, req.body.target);
    request.input('kpi', sql.NVarChar, req.body.kpi);
    request.input('annual_target', sql.Decimal(18, 2), req.body.annual_target);

    const result = await request.query(`
      UPDATE main_plan_objectives
      SET pillar = @pillar, objective = @objective, target = @target, kpi = @kpi, annual_target = @annual_target
      OUTPUT INSERTED.*
      WHERE id = @id
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    handleError(res, error, 'Error updating main objective');
  }
});

app.delete('/api/wig/main-objectives/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.Int, parseInt(req.params.id));

    const result = await request.query('DELETE FROM main_plan_objectives WHERE id = @id');
    res.json({ success: true, deletedRows: result.rowsAffected[0] });
  } catch (error) {
    handleError(res, error, 'Error deleting main objective');
  }
});

// Department Objectives Routes
app.get('/api/wig/department-objectives', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    // Use SELECT * to avoid issues if M&E columns don't exist yet
    let query = `
      SELECT do.*, d.name as department_name, d.code as department_code
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE 1=1
    `;

    if (req.query.department_id) {
      request.input('department_id', sql.Int, parseInt(req.query.department_id));
      query += ' AND do.department_id = @department_id';
    }

    if (req.query.department_code) {
      request.input('department_code', sql.NVarChar, req.query.department_code);
      query += ' AND d.code = @department_code';
    }

    query += ' ORDER BY do.kpi, do.activity';

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (error) {
    handleError(res, error, 'Error getting department objectives');
  }
});

app.get('/api/wig/department-objectives/by-kpi/:kpi', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('kpi', sql.NVarChar, decodeURIComponent(req.params.kpi));

    const result = await request.query(`
      SELECT do.*, d.name as department_name, d.code as department_code
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE do.kpi = @kpi AND do.type = 'Direct'
      ORDER BY d.name
    `);

    res.json(result.recordset);
  } catch (error) {
    handleError(res, error, 'Error getting department objectives by KPI');
  }
});

app.post('/api/wig/department-objectives', async (req, res) => {
  try {
    const pool = await getPool();
    
    // Skip RASCI validation for M&E type objectives (including M&E MOV)
    if (req.body.type !== 'M&E' && req.body.type !== 'M&E MOV') {
      // Validate KPI(s) have RASCI - handle multiple KPIs separated by ||
      const kpiDelimiter = '||';
      const kpiList = req.body.kpi.includes(kpiDelimiter) 
        ? req.body.kpi.split(kpiDelimiter).map(k => k.trim()).filter(k => k)
        : [req.body.kpi];
      
      for (const kpi of kpiList) {
        const rasciCheck = pool.request();
        rasciCheck.input('kpi', sql.NVarChar, kpi);
        const rasciResult = await rasciCheck.query('SELECT COUNT(*) as count FROM rasci_metrics WHERE kpi = @kpi');
        
        if (rasciResult.recordset[0].count === 0) {
          return res.status(400).json({ error: `KPI "${kpi}" must have at least one RASCI assignment` });
        }
      }
    }

    const request = pool.request();
    request.input('main_objective_id', sql.Int, req.body.main_objective_id || null);
    request.input('department_id', sql.Int, req.body.department_id);
    request.input('kpi', sql.NVarChar, req.body.kpi);
    request.input('activity', sql.NVarChar, req.body.activity);
    request.input('type', sql.NVarChar, req.body.type);
    request.input('activity_target', sql.Decimal(18, 2), req.body.activity_target);
    request.input('responsible_person', sql.NVarChar, req.body.responsible_person);
    request.input('mov', sql.NVarChar, req.body.mov);

    // Only include M&E fields if type is M&E or M&E MOV
    const isME = req.body.type === 'M&E' || req.body.type === 'M&E MOV';
    let meFields = '';
    let meValues = '';

    if (isME) {
      request.input('me_target', sql.Decimal(18, 2), req.body.me_target || null);
      request.input('me_actual', sql.Decimal(18, 2), req.body.me_actual || null);
      request.input('me_frequency', sql.NVarChar, req.body.me_frequency || null);
      request.input('me_start_date', sql.Date, req.body.me_start_date || null);
      request.input('me_end_date', sql.Date, req.body.me_end_date || null);
      request.input('me_tool', sql.NVarChar, req.body.me_tool || null);
      request.input('me_responsible', sql.NVarChar, req.body.me_responsible || null);
      request.input('me_folder_link', sql.NVarChar, req.body.me_folder_link || null);
      
      meFields = ', me_target, me_actual, me_frequency, me_start_date, me_end_date, me_tool, me_responsible, me_folder_link';
      meValues = ', @me_target, @me_actual, @me_frequency, @me_start_date, @me_end_date, @me_tool, @me_responsible, @me_folder_link';
    }

    // Try to insert with M&E fields, fallback to basic insert if columns don't exist
    let result;
    try {
      result = await request.query(`
        INSERT INTO department_objectives (main_objective_id, department_id, kpi, activity, type, activity_target, responsible_person, mov${meFields})
        OUTPUT INSERTED.*
        VALUES (@main_objective_id, @department_id, @kpi, @activity, @type, @activity_target, @responsible_person, @mov${meValues})
      `);
    } catch (error) {
      // If M&E columns don't exist, try without them
      if (isME && error.message && error.message.includes('Invalid column name')) {
        console.warn('[proxy] M&E columns not found, inserting without M&E fields');
        const basicRequest = pool.request();
        basicRequest.input('main_objective_id', sql.Int, req.body.main_objective_id || null);
        basicRequest.input('department_id', sql.Int, req.body.department_id);
        basicRequest.input('kpi', sql.NVarChar, req.body.kpi);
        basicRequest.input('activity', sql.NVarChar, req.body.activity);
        basicRequest.input('type', sql.NVarChar, req.body.type);
        basicRequest.input('activity_target', sql.Decimal(18, 2), req.body.activity_target);
        basicRequest.input('responsible_person', sql.NVarChar, req.body.responsible_person);
        basicRequest.input('mov', sql.NVarChar, req.body.mov);
        
        result = await basicRequest.query(`
          INSERT INTO department_objectives (main_objective_id, department_id, kpi, activity, type, activity_target, responsible_person, mov)
          OUTPUT INSERTED.*
          VALUES (@main_objective_id, @department_id, @kpi, @activity, @type, @activity_target, @responsible_person, @mov)
        `);
      } else {
        throw error;
      }
    }

    res.json(result.recordset[0]);
  } catch (error) {
    handleError(res, error, 'Error creating department objective');
  }
});

app.put('/api/wig/department-objectives/:id', async (req, res) => {
  try {
    const pool = await getPool();
    
    // Validate KPI has RASCI if KPI is being updated
    if (req.body.kpi) {
      const rasciCheck = pool.request();
      rasciCheck.input('kpi', sql.NVarChar, req.body.kpi);
      const rasciResult = await rasciCheck.query('SELECT COUNT(*) as count FROM rasci_metrics WHERE kpi = @kpi');
      
      if (rasciResult.recordset[0].count === 0) {
        return res.status(400).json({ error: 'KPI must have at least one RASCI assignment' });
      }
    }

    const request = pool.request();
    request.input('id', sql.Int, parseInt(req.params.id));
    const updates = [];
    const fields = ['main_objective_id', 'department_id', 'kpi', 'activity', 'type', 'activity_target', 'responsible_person', 'mov'];
    
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'main_objective_id') {
          request.input(field, sql.Int, req.body[field] || null);
        } else if (field === 'department_id' || field === 'activity_target') {
          request.input(field, field === 'department_id' ? sql.Int : sql.Decimal(18, 2), req.body[field]);
        } else {
          request.input(field, sql.NVarChar, req.body[field]);
        }
        updates.push(`${field} = @${field}`);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await request.query(`
      UPDATE department_objectives
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE id = @id
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Department objective not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    handleError(res, error, 'Error updating department objective');
  }
});

app.delete('/api/wig/department-objectives/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.Int, parseInt(req.params.id));

    const result = await request.query('DELETE FROM department_objectives WHERE id = @id');
    res.json({ success: true, deletedRows: result.rowsAffected[0] });
  } catch (error) {
    handleError(res, error, 'Error deleting department objective');
  }
});

// RASCI Routes
app.get('/api/wig/rasci', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request.query('SELECT * FROM rasci_metrics ORDER BY kpi, department');
    res.json(result.recordset);
  } catch (error) {
    handleError(res, error, 'Error getting RASCI');
  }
});

app.get('/api/wig/rasci/kpi/:kpi', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('kpi', sql.NVarChar, decodeURIComponent(req.params.kpi));

    const result = await request.query('SELECT * FROM rasci_metrics WHERE kpi = @kpi ORDER BY department');
    res.json(result.recordset);
  } catch (error) {
    handleError(res, error, 'Error getting RASCI by KPI');
  }
});

app.get('/api/wig/rasci/department/:departmentCode', async (req, res) => {
  try {
    const pool = await getPool();
    const departmentCode = decodeURIComponent(req.params.departmentCode);
    
    // First, get the department name from the code
    const deptRequest = pool.request();
    deptRequest.input('code', sql.NVarChar, departmentCode);
    const deptResult = await deptRequest.query('SELECT id, name FROM departments WHERE code = @code');
    
    if (!deptResult.recordset || deptResult.recordset.length === 0) {
      res.json([]);
      return;
    }
    
    const department = deptResult.recordset[0];
    const departmentName = department.name;
    const departmentId = department.id;
    
    // Normalize department name for RASCI lookup (handle DFR case)
    let normalizedDeptName = departmentName;
    if (departmentCode === 'DFR' || departmentName.toLowerCase().includes('direct fundraising') ||
        departmentName.toLowerCase().includes('resource mobilization')) {
      normalizedDeptName = 'Direct Fundraising / Resource Mobilization';
    }
    
    // Get all RASCI metrics for this department
    const rasciRequest = pool.request();
    rasciRequest.input('department', sql.NVarChar, normalizedDeptName);
    rasciRequest.input('oldDepartment', sql.NVarChar, 'DFR');
    const rasciResult = await rasciRequest.query(`
      SELECT * FROM rasci_metrics 
      WHERE department = @department 
         OR (department = @oldDepartment AND @department = 'Direct Fundraising / Resource Mobilization')
      ORDER BY kpi
    `);
    
    // Get all department objectives for this department to check existence
    const deptObjRequest = pool.request();
    deptObjRequest.input('department_id', sql.Int, departmentId);
    const deptObjResult = await deptObjRequest.query(`
      SELECT DISTINCT kpi FROM department_objectives 
      WHERE department_id = @department_id
    `);
    
    // Helper function to normalize KPI
    function normalizeKPI(kpi) {
      if (!kpi) return '';
      return kpi.replace(/^\d+(\.\d+)*\s*/, '').trim();
    }
    
    // Create a set of KPIs that exist in department objectives (normalized for matching)
    // Handle multiple KPIs per objective (delimited by ||)
    const kpiDelimiter = '||';
    const existingKPIs = new Set();
    for (const row of deptObjResult.recordset) {
      // Split multiple KPIs if they exist
      const kpiList = row.kpi.includes(kpiDelimiter) 
        ? row.kpi.split(kpiDelimiter).map(k => k.trim()).filter(k => k)
        : [row.kpi];
      
      // Add each KPI (both normalized and original) to the set
      for (const kpi of kpiList) {
        const normalized = normalizeKPI(kpi).trim().toLowerCase();
        existingKPIs.add(normalized);
        // Also add original for exact matches
        existingKPIs.add(kpi.trim().toLowerCase());
      }
    }
    
    // Format the results with role string and existence check
    const formattedResults = rasciResult.recordset.map(rasci => {
      // Build role string
      const roles = [];
      if (rasci.responsible) roles.push('R');
      if (rasci.accountable) roles.push('A');
      if (rasci.supportive) roles.push('S');
      if (rasci.consulted) roles.push('C');
      if (rasci.informed) roles.push('I');
      const role = roles.join(', ');
      
      // Check if KPI exists in department objectives
      const normalizedRASCIKPI = normalizeKPI(rasci.kpi).trim().toLowerCase();
      const originalRASCIKPI = rasci.kpi.trim().toLowerCase();
      
      let exists_in_activities = false;
      // Check normalized match
      if (existingKPIs.has(normalizedRASCIKPI)) {
        exists_in_activities = true;
      }
      // Check original match
      else if (existingKPIs.has(originalRASCIKPI)) {
        exists_in_activities = true;
      }
      // Check if any department objective KPI matches (fuzzy match)
      // Handle multiple KPIs per objective (delimited by ||)
      else {
        for (const deptKPI of deptObjResult.recordset) {
          // Split multiple KPIs if they exist
          const kpiList = deptKPI.kpi.includes(kpiDelimiter) 
            ? deptKPI.kpi.split(kpiDelimiter).map(k => k.trim()).filter(k => k)
            : [deptKPI.kpi];
          
          // Check each KPI in the list
          for (const kpi of kpiList) {
            const normalizedDeptKPI = normalizeKPI(kpi).trim().toLowerCase();
            const originalDeptKPI = kpi.trim().toLowerCase();
            
            // Exact normalized match
            if (normalizedRASCIKPI === normalizedDeptKPI || originalRASCIKPI === normalizedDeptKPI ||
                normalizedRASCIKPI === originalDeptKPI || originalRASCIKPI === originalDeptKPI) {
              exists_in_activities = true;
              break;
            }
          }
          
          if (exists_in_activities) break;
        }
      }
      
      return {
        ...rasci,
        role: role || '—',
        exists_in_activities: exists_in_activities
      };
    });
    
    res.json(formattedResults);
  } catch (error) {
    handleError(res, error, 'Error getting RASCI by department');
  }
});

app.post('/api/wig/rasci', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('kpi', sql.NVarChar, req.body.kpi);
    request.input('department', sql.NVarChar, req.body.department);
    request.input('responsible', sql.Bit, req.body.responsible || false);
    request.input('accountable', sql.Bit, req.body.accountable || false);
    request.input('supportive', sql.Bit, req.body.supportive || false);
    request.input('consulted', sql.Bit, req.body.consulted || false);
    request.input('informed', sql.Bit, req.body.informed || false);

    const result = await request.query(`
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
        VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed)
      OUTPUT INSERTED.*;
    `);

    res.json(result.recordset[0]);
  } catch (error) {
    handleError(res, error, 'Error creating/updating RASCI');
  }
});

app.delete('/api/wig/rasci/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.Int, parseInt(req.params.id));

    const result = await request.query('DELETE FROM rasci_metrics WHERE id = @id');
    res.json({ success: true, deletedRows: result.rowsAffected[0] });
  } catch (error) {
    handleError(res, error, 'Error deleting RASCI');
  }
});

// KPI Routes
app.get('/api/wig/kpis-with-rasci', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request.query(`
      SELECT DISTINCT kpi 
      FROM rasci_metrics 
      ORDER BY kpi
    `);
    res.json(result.recordset.map((r) => r.kpi));
  } catch (error) {
    handleError(res, error, 'Error getting KPIs with RASCI');
  }
});

app.get('/api/wig/kpi-breakdown/:kpi', async (req, res) => {
  try {
    const pool = await getPool();
    const kpi = decodeURIComponent(req.params.kpi);
    
    const request = pool.request();
    request.input('kpi', sql.NVarChar, kpi);

    // Get main objective info (ID and annual target) for this KPI
    const mainRequest = pool.request();
    mainRequest.input('kpi', sql.NVarChar, kpi);
    const mainResult = await mainRequest.query(`
      SELECT TOP 1 id, annual_target 
      FROM main_plan_objectives 
      WHERE kpi = @kpi
    `);

    const mainObjective = mainResult.recordset[0];
    const mainObjectiveId = mainObjective?.id || null;
    const annualTarget = mainObjective?.annual_target || 0;

    // Normalize the strategic plan KPI by removing numeric prefix and trimming
    function normalizeKPI(kpi) {
      if (!kpi) return '';
      return kpi.replace(/^\d+(\.\d+)*\s*/, '').trim();
    }
    
    // Normalize both the strategic plan KPI and prepare for comparison
    // Normalization removes numeric prefixes (e.g., "1.3.1 " or "2.1.3 ")
    // This handles both directions: main has prefix/dept doesn't, and vice versa
    const mainKPIOriginal = kpi.trim();
    const mainKPINormalized = normalizeKPI(kpi).trim();
    const normalizedMainKPI = mainKPINormalized.toLowerCase();

    // Get ALL Direct department objectives and match them in JavaScript
    // This gives us full control over the matching logic and ensures accuracy
    const allDeptObjsResult = await pool.request().query(`
      SELECT 
        d.id as department_id,
        d.name as department,
        d.code as department_code,
        do.kpi,
        do.activity_target
      FROM department_objectives do
      INNER JOIN departments d ON do.department_id = d.id
      WHERE do.type = 'Direct'
      ORDER BY d.name, do.kpi
    `);

    // Helper function to extract meaningful words from KPI (removes common words)
    function extractKeywords(kpiText) {
      if (!kpiText) return [];
      // Remove common Arabic words and keep meaningful terms
      const commonWords = ['عدد', 'نسبة', 'معدل', 'مستوى', 'حجم', 'من', 'مع', 'في', 'على', 'إلى', 'و', 'أو', 'ال', 'هذا', 'تلك', 'التي', 'الذي'];
      const words = kpiText.toLowerCase()
        .replace(/[^\u0600-\u06FF\s]/g, ' ') // Keep only Arabic and spaces
        .split(/\s+/)
        .filter(w => w.length > 2 && !commonWords.includes(w));
      return words;
    }

    // Extract keywords from main KPI
    const mainKeywords = extractKeywords(normalizedMainKPI);
    const mainKeywordsSet = new Set(mainKeywords);
    
    // Group matching objectives by department
    const departmentMap = new Map();
    
    for (const row of allDeptObjsResult.recordset) {
      const deptKPIOriginal = row.kpi.trim();
      const deptKPINormalized = normalizeKPI(row.kpi).trim();
      const deptKPIOriginalLower = deptKPIOriginal.toLowerCase();
      const deptKPINormalizedLower = deptKPINormalized.toLowerCase();
      
      // Try multiple matching strategies - handles both directions:
      // 1. Main has prefix, dept doesn't: "1.3.1 عدد..." matches "عدد..."
      // 2. Main doesn't have prefix, dept has: "عدد..." matches "1.3.1 عدد..."
      // 3. Both have prefixes: "1.3.1 عدد..." matches "1.3.1 عدد..." (exact)
      // 4. Neither has prefix: "عدد..." matches "عدد..." (exact)
      let isMatch = false;
      
      // Strategy 1: Exact normalized match (handles prefix differences in both directions)
      // This is the primary strategy - removes prefixes from both and compares
      // Works for: "1.3.1 عدد..." vs "عدد..." AND "عدد..." vs "1.3.1 عدد..."
      if (deptKPINormalizedLower === normalizedMainKPI) {
        isMatch = true;
      }
      // Strategy 2: Exact match (original vs original) - both have same format
      else if (deptKPIOriginalLower === mainKPIOriginal.toLowerCase()) {
        isMatch = true;
      }
      // Strategy 3: Cross-match - normalized main vs original dept (main has prefix, dept doesn't)
      // Example: "1.3.1 عدد..." (normalized to "عدد...") matches "عدد..."
      else if (deptKPIOriginalLower === normalizedMainKPI) {
        isMatch = true;
      }
      // Strategy 4: Reverse cross-match - original main vs normalized dept (dept has prefix, main doesn't)
      // Example: "عدد..." matches "1.3.1 عدد..." (normalized to "عدد...")
      else if (deptKPINormalizedLower === mainKPIOriginal.toLowerCase()) {
        isMatch = true;
      }
      // Strategy 5: Keyword-based matching (if significant overlap)
      // Use normalized versions for keyword extraction to ignore prefixes
      else if (mainKeywords.length > 0) {
        const deptKeywords = extractKeywords(deptKPINormalizedLower);
        const deptKeywordsSet = new Set(deptKeywords);
        
        // Count matching keywords
        const matchingKeywords = mainKeywords.filter(kw => deptKeywordsSet.has(kw));
        const matchRatio = matchingKeywords.length / Math.max(mainKeywords.length, deptKeywords.length);
        
        // Match if at least 60% of keywords match and at least 3 keywords match
        if (matchRatio >= 0.6 && matchingKeywords.length >= 3) {
          isMatch = true;
        }
        // Also match if all main keywords are found in department KPI (even if department has more)
        else if (matchingKeywords.length === mainKeywords.length && mainKeywords.length >= 2) {
          isMatch = true;
        }
      }
      // Strategy 6: Substring match for longer KPIs (if normalized main KPI is contained in dept KPI or vice versa)
      else if (normalizedMainKPI.length > 20 && deptKPINormalizedLower.length > 20) {
        if (deptKPINormalizedLower.includes(normalizedMainKPI) || 
            normalizedMainKPI.includes(deptKPINormalizedLower)) {
          // Ensure significant overlap (at least 70% of shorter string)
          const shorter = Math.min(normalizedMainKPI.length, deptKPINormalizedLower.length);
          const longer = Math.max(normalizedMainKPI.length, deptKPINormalizedLower.length);
          if (shorter / longer >= 0.7) {
            isMatch = true;
          }
        }
      }
      
      if (isMatch) {
        const deptKey = row.department_id;
        if (!departmentMap.has(deptKey)) {
          departmentMap.set(deptKey, {
            department_id: row.department_id,
            department: row.department,
            department_code: row.department_code,
            sum: 0,
            count: 0
          });
        }
        
        const dept = departmentMap.get(deptKey);
        dept.sum += parseFloat(row.activity_target) || 0;
        dept.count += 1;
      }
    }

    // Convert map to array format
    const breakdown = Array.from(departmentMap.values()).map((dept) => {
      return {
        department: dept.department,
        departmentId: dept.department_id,
        departmentCode: dept.department_code,
        sum: dept.sum,
        directSum: dept.sum,
        indirectSum: 0,
        directCount: dept.count,
        indirectCount: 0,
        percentage: annualTarget > 0 ? (dept.sum / annualTarget) * 100 : 0,
      };
    });

    res.json({
      kpi,
      annual_target: annualTarget,
      main_objective_id: mainObjectiveId,
      breakdown,
    });
  } catch (error) {
    handleError(res, error, 'Error getting KPI breakdown');
  }
});

// Department Routes
app.get('/api/wig/departments', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request.query('SELECT * FROM departments ORDER BY name');
    res.json(result.recordset);
  } catch (error) {
    handleError(res, error, 'Error getting departments');
  }
});

// Plan Checker Routes
app.get('/api/wig/checkers/:objectiveId', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('objective_id', sql.Int, parseInt(req.params.objectiveId));

    const result = await request.query('SELECT * FROM plan_checkers WHERE objective_id = @objective_id');
    res.json(result.recordset[0] || null);
  } catch (error) {
    handleError(res, error, 'Error getting plan checker');
  }
});

app.post('/api/wig/checkers/calculate', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const objectives = await request.query('SELECT * FROM main_plan_objectives');

    const results = [];

    for (const objective of objectives.recordset) {
      // Check Planned status
      const rasciRequest = pool.request();
      rasciRequest.input('kpi', sql.NVarChar, objective.kpi);
      const rasciDepts = await rasciRequest.query(`
        SELECT DISTINCT department 
        FROM rasci_metrics 
        WHERE kpi = @kpi 
        AND (responsible = 1 OR accountable = 1 OR supportive = 1 OR consulted = 1 OR informed = 1)
      `);

      const deptObjectivesRequest = pool.request();
      deptObjectivesRequest.input('kpi', sql.NVarChar, objective.kpi);
      const deptObjectives = await deptObjectivesRequest.query(`
        SELECT DISTINCT d.code 
        FROM department_objectives do
        INNER JOIN departments d ON do.department_id = d.id
        WHERE do.kpi = @kpi
      `);

      const requiredDepts = rasciDepts.recordset.map((r) => r.department);
      const coveredDepts = deptObjectives.recordset.map((r) => r.code);
      const allCovered = requiredDepts.every((dept) => coveredDepts.includes(dept));

      // Check Annual Target (Direct only)
      const sumRequest = pool.request();
      sumRequest.input('kpi', sql.NVarChar, objective.kpi);
      const sumResult = await sumRequest.query(`
        SELECT SUM(activity_target) as total
        FROM department_objectives
        WHERE kpi = @kpi AND type = 'Direct'
      `);

      const total = parseFloat(sumResult.recordset[0]?.total || 0);
      const annualTarget = parseFloat(objective.annual_target);
      const variance = total - annualTarget;
      const tolerance = annualTarget * 0.01; // 1% tolerance

      let status = 'ok';
      if (Math.abs(variance) > tolerance) {
        status = variance > 0 ? 'above' : 'less';
      }

      // Upsert plan checker
      const upsertRequest = pool.request();
      upsertRequest.input('objective_id', sql.Int, objective.id);
      upsertRequest.input('planned_status', sql.NVarChar, allCovered ? 'covered' : 'not_covered');
      upsertRequest.input('annual_target_status', sql.NVarChar, status);
      upsertRequest.input('annual_target_variance', sql.Decimal(18, 2), variance);

      await upsertRequest.query(`
        MERGE plan_checkers AS target
        USING (SELECT @objective_id AS objective_id) AS source
        ON target.objective_id = source.objective_id
        WHEN MATCHED THEN
          UPDATE SET 
            planned_status = @planned_status,
            annual_target_status = @annual_target_status,
            annual_target_variance = @annual_target_variance,
            last_checked_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (objective_id, planned_status, annual_target_status, annual_target_variance, last_checked_at)
          VALUES (@objective_id, @planned_status, @annual_target_status, @annual_target_variance, GETDATE());
      `);

      results.push({
        objective_id: objective.id,
        planned_status: allCovered ? 'covered' : 'not_covered',
        annual_target_status: status,
        annual_target_variance: variance,
      });
    }

    res.json(results);
  } catch (error) {
    handleError(res, error, 'Error calculating plan checkers');
  }
});

// Monthly Data Routes
app.get('/api/wig/monthly-data/:deptObjId', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('dept_obj_id', sql.Int, parseInt(req.params.deptObjId));

    const result = await request.query(`
      SELECT * FROM department_monthly_data 
      WHERE department_objective_id = @dept_obj_id 
      ORDER BY month
    `);

    res.json(result.recordset);
  } catch (error) {
    handleError(res, error, 'Error getting monthly data');
  }
});

app.post('/api/wig/monthly-data', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('department_objective_id', sql.Int, req.body.department_objective_id);
    request.input('month', sql.Date, req.body.month);
    request.input('target_value', sql.Decimal(18, 2), req.body.target_value || null);
    request.input('actual_value', sql.Decimal(18, 2), req.body.actual_value || null);

    const result = await request.query(`
      MERGE department_monthly_data AS target
      USING (SELECT @department_objective_id AS dept_obj_id, @month AS month) AS source
      ON target.department_objective_id = source.dept_obj_id AND target.month = source.month
      WHEN MATCHED THEN
        UPDATE SET 
          target_value = @target_value,
          actual_value = @actual_value
      WHEN NOT MATCHED THEN
        INSERT (department_objective_id, month, target_value, actual_value)
        VALUES (@department_objective_id, @month, @target_value, @actual_value)
      OUTPUT INSERTED.*;
    `);

    res.json(result.recordset[0]);
  } catch (error) {
    handleError(res, error, 'Error creating/updating monthly data');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'wig-proxy' });
});

app.listen(PORT, () => {
  console.log(`[WIG Proxy] Server running on http://localhost:${PORT}`);
  console.log(`[WIG Proxy] API endpoint: http://localhost:${PORT}/api/wig`);
});
