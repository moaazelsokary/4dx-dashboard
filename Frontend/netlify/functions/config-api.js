// Configuration API - Lock management, activity logs, and user permissions
const sql = require('mssql');
const rateLimiter = require('./utils/rate-limiter');
const authMiddleware = require('./utils/auth-middleware');
const logger = require('./utils/logger');

let pool = null;

// Database connection setup (same as wig-api.js)
function getDbConfig() {
  const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
  let server, port;
  if (serverValue.includes(',')) {
    [server, port] = serverValue.split(',').map(s => s.trim());
    port = parseInt(port) || 1433;
  } else {
    server = serverValue;
    port = 1433;
  }

  let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
  if (password && password.startsWith('/')) {
    password = process.env.DB_PASSWORD || process.env.VITE_PWD;
  }
  if (password && (password.includes('%'))) {
    try {
      password = decodeURIComponent(password);
    } catch (e) {
      // Keep original if decode fails
    }
  }
  if ((password && password.startsWith('"') && password.endsWith('"')) || 
      (password && password.startsWith("'") && password.endsWith("'"))) {
    password = password.slice(1, -1);
  }
  if (password) {
    password = password.trim();
  }

  return {
    server: server,
    port: port,
    database: process.env.DATABASE || process.env.VITE_DATABASE,
    user: process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
    password: password,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
      requestTimeout: 60000,
      connectionTimeout: 30000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

async function getPool() {
  if (!pool) {
    try {
      const config = getDbConfig();
      pool = await sql.connect(config);
      logger.info('Database connection established for config-api');
    } catch (error) {
      logger.error('Database connection failed', error);
      throw error;
    }
  }
  return pool;
}

// Helper function to fill locked values from PMS/Odoo cache
// Called after lock rule is created/updated
async function fillLockedValuesFromCache(pool, lock) {
  try {
    // Only fill if monthly_target or monthly_actual is locked
    if (!lock.lock_monthly_target && !lock.lock_monthly_actual) {
      return; // No monthly fields locked, nothing to fill
    }

    // Resolve affected department_objective_ids based on lock scope
    const request = pool.request();
    let objectivesQuery = `
      SELECT DISTINCT do.id AS department_objective_id
      FROM department_objectives do
      WHERE 1=1
    `;

    // Apply user scope filter
    if (lock.user_scope === 'specific' && lock.user_ids) {
      try {
        const userIds = JSON.parse(lock.user_ids);
        if (Array.isArray(userIds) && userIds.length > 0) {
          request.input('user_ids', sql.NVarChar, JSON.stringify(userIds));
          objectivesQuery += `
            AND do.department_id IN (
              SELECT DISTINCT department_id FROM users WHERE id IN (${userIds.map((_, i) => `@user_id_${i}`).join(',')})
            )
          `;
          userIds.forEach((uid, i) => {
            request.input(`user_id_${i}`, sql.Int, uid);
          });
        }
      } catch (e) {
        logger.error('Error parsing user_ids for fillLockedValues', e);
      }
    }

    // Apply KPI scope filter
    if (lock.kpi_scope === 'specific' && lock.kpi_ids) {
      try {
        const kpiIds = JSON.parse(lock.kpi_ids);
        if (Array.isArray(kpiIds) && kpiIds.length > 0) {
          request.input('kpi_ids', sql.NVarChar, JSON.stringify(kpiIds));
          objectivesQuery += ` AND (${kpiIds.map((_, i) => {
            request.input(`kpi_${i}`, sql.NVarChar, kpiIds[i]);
            return `do.kpi LIKE '%' + @kpi_${i} + '%'`;
          }).join(' OR ')})`;
        }
      } catch (e) {
        logger.error('Error parsing kpi_ids for fillLockedValues', e);
      }
    }

    // Apply objective scope filter
    if (lock.objective_scope === 'specific' && lock.objective_ids) {
      try {
        const objectiveIds = JSON.parse(lock.objective_ids);
        if (Array.isArray(objectiveIds) && objectiveIds.length > 0) {
          request.input('objective_ids', sql.NVarChar, JSON.stringify(objectiveIds));
          objectivesQuery += ` AND do.id IN (${objectiveIds.map((_, i) => {
            request.input(`obj_id_${i}`, sql.Int, objectiveIds[i]);
            return `@obj_id_${i}`;
          }).join(',')})`;
        }
      } catch (e) {
        logger.error('Error parsing objective_ids for fillLockedValues', e);
      }
    }

    const objectivesResult = await request.query(objectivesQuery);
    const objectiveIds = objectivesResult.recordset.map(r => r.department_objective_id);
    
    if (objectiveIds.length === 0) {
      logger.info('No objectives found for lock, skipping value fill');
      return;
    }

    // Load mappings for these objectives
    const mappingRequest = pool.request();
    mappingRequest.input('objective_ids', sql.NVarChar, JSON.stringify(objectiveIds));
    const mappingsResult = await mappingRequest.query(`
      SELECT * FROM objective_data_source_mapping
      WHERE department_objective_id IN (${objectiveIds.map((_, i) => {
        mappingRequest.input(`obj_id_${i}`, sql.Int, objectiveIds[i]);
        return `@obj_id_${i}`;
      }).join(',')})
    `);
    
    const mappings = {};
    mappingsResult.recordset.forEach(m => {
      mappings[m.department_objective_id] = m;
    });

    // Fetch metrics from cache (via metrics-api)
    const metricsApiUrl = process.env.NETLIFY_URL 
      ? `${process.env.NETLIFY_URL}/.netlify/functions/metrics-api`
      : 'http://localhost:8888/.netlify/functions/metrics-api';
    
    const metricsResponse = await fetch(metricsApiUrl);
    if (!metricsResponse.ok) {
      logger.warn('Failed to fetch metrics from cache, skipping value fill');
      return;
    }
    
    const metricsData = await metricsResponse.json();
    if (!metricsData.success || !metricsData.data) {
      logger.warn('Metrics API returned no data, skipping value fill');
      return;
    }

    const { pms, odoo } = metricsData.data;

    // Months to fill (2026-01 to 2027-06)
    const months = [];
    for (let year = 2026; year <= 2027; year++) {
      const startMonth = year === 2026 ? 1 : 1;
      const endMonth = year === 2027 ? 6 : 12;
      for (let month = startMonth; month <= endMonth; month++) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
      }
    }

    // For each objective with mapping, compute and write values
    for (const objectiveId of objectiveIds) {
      const mapping = mappings[objectiveId];
      if (!mapping) continue; // Skip objectives without mapping

      for (const month of months) {
        // Get objective info for logging
        const objInfoRequest = pool.request();
        objInfoRequest.input('objective_id', sql.Int, objectiveId);
        const objInfoResult = await objInfoRequest.query(`
          SELECT kpi, department_id FROM department_objectives WHERE id = @objective_id
        `);
        const objInfo = objInfoResult.recordset[0];
        if (!objInfo) continue;

        // Compute target_value if monthly_target is locked and target_source is PMS (not manual)
        if (lock.lock_monthly_target && mapping.target_source === 'pms_target' && mapping.pms_project_name && mapping.pms_metric_name) {
          const pmsRow = pms.find(r => 
            r.ProjectName === mapping.pms_project_name &&
            r.MetricName === mapping.pms_metric_name &&
            r.MonthYear === month
          );
          
          if (pmsRow && pmsRow.Target !== null && pmsRow.Target !== undefined) {
            // Write directly to department_monthly_data (config-api has database access)
            try {
              const writeRequest = pool.request();
              writeRequest.input('department_objective_id', sql.Int, objectiveId);
              writeRequest.input('month', sql.Date, `${month}-01`);
              writeRequest.input('target_value', sql.Decimal(18, 2), pmsRow.Target);
              writeRequest.input('kpi', sql.NVarChar, objInfo.kpi);
              writeRequest.input('department_id', sql.Int, objInfo.department_id);

              await writeRequest.query(`
                MERGE department_monthly_data AS target
                USING (SELECT @department_objective_id AS department_objective_id, @month AS month) AS source
                ON target.department_objective_id = source.department_objective_id AND target.month = source.month
                WHEN MATCHED THEN
                  UPDATE SET target_value = @target_value, kpi = @kpi, department_id = @department_id
                WHEN NOT MATCHED THEN
                  INSERT (department_objective_id, month, target_value, kpi, department_id)
                  VALUES (@department_objective_id, @month, @target_value, @kpi, @department_id);
              `);
            } catch (e) {
              logger.error(`Failed to write target_value for objective ${objectiveId}, month ${month}`, e);
            }
          }
        }

        // Compute actual_value if monthly_actual is locked
        if (lock.lock_monthly_actual) {
          let actualValue = null;
          
          if (mapping.actual_source === 'pms_actual' && mapping.pms_project_name && mapping.pms_metric_name) {
            const pmsRow = pms.find(r => 
              r.ProjectName === mapping.pms_project_name &&
              r.MetricName === mapping.pms_metric_name &&
              r.MonthYear === month
            );
            actualValue = pmsRow?.Actual;
          } else if (mapping.actual_source === 'odoo_services_done' && mapping.odoo_project_name) {
            const odooRow = odoo.find(r => 
              r.Project === mapping.odoo_project_name &&
              r.Month === month
            );
            actualValue = odooRow?.ServicesDone;
          }

          if (actualValue !== null && actualValue !== undefined) {
            // Write directly to department_monthly_data
            try {
              const writeRequest = pool.request();
              writeRequest.input('department_objective_id', sql.Int, objectiveId);
              writeRequest.input('month', sql.Date, `${month}-01`);
              writeRequest.input('actual_value', sql.Decimal(18, 2), actualValue);
              writeRequest.input('kpi', sql.NVarChar, objInfo.kpi);
              writeRequest.input('department_id', sql.Int, objInfo.department_id);

              await writeRequest.query(`
                MERGE department_monthly_data AS target
                USING (SELECT @department_objective_id AS department_objective_id, @month AS month) AS source
                ON target.department_objective_id = source.department_objective_id AND target.month = source.month
                WHEN MATCHED THEN
                  UPDATE SET actual_value = @actual_value, kpi = @kpi, department_id = @department_id
                WHEN NOT MATCHED THEN
                  INSERT (department_objective_id, month, actual_value, kpi, department_id)
                  VALUES (@department_objective_id, @month, @actual_value, @kpi, @department_id);
              `);
            } catch (e) {
              logger.error(`Failed to write actual_value for objective ${objectiveId}, month ${month}`, e);
            }
          }
        }
      }
    }

    logger.info(`Filled locked values for ${objectiveIds.length} objectives`);
  } catch (error) {
    // Don't fail lock save if value fill fails
    logger.error('Error filling locked values from cache', error);
  }
}

// Helper function to log activity
async function logActivity(pool, logData) {
  try {
    const request = pool.request();
    request.input('user_id', sql.Int, logData.user_id);
    request.input('username', sql.NVarChar, logData.username);
    request.input('action_type', sql.NVarChar, logData.action_type);
    request.input('target_field', sql.NVarChar, logData.target_field || null);
    request.input('old_value', sql.Decimal(18, 2), logData.old_value || null);
    request.input('new_value', sql.Decimal(18, 2), logData.new_value || null);
    request.input('kpi', sql.NVarChar, logData.kpi || null);
    request.input('department_id', sql.Int, logData.department_id || null);
    request.input('department_name', sql.NVarChar, logData.department_name || null);
    request.input('department_objective_id', sql.Int, logData.department_objective_id || null);
    request.input('month', sql.Date, logData.month || null);
    request.input('metadata', sql.NVarChar, logData.metadata ? JSON.stringify(logData.metadata) : null);

    await request.query(`
      INSERT INTO activity_logs 
      (user_id, username, action_type, target_field, old_value, new_value, kpi, department_id, department_name, department_objective_id, month, metadata)
      VALUES 
      (@user_id, @username, @action_type, @target_field, @old_value, @new_value, @kpi, @department_id, @department_name, @department_objective_id, @month, @metadata)
    `);
  } catch (error) {
    logger.error('Failed to log activity', error);
    // Don't throw - logging failures shouldn't break the main operation
  }
}

// Helper function to check lock status for a single field
async function checkLockStatus(pool, fieldType, departmentObjectiveId, userId, month = null) {
  try {
    // Get department objective details including type
    const deptObjRequest = pool.request();
    deptObjRequest.input('id', sql.Int, departmentObjectiveId);
    const deptObjResult = await deptObjRequest.query(`
      SELECT kpi, department_id, type, responsible_person FROM department_objectives WHERE id = @id
    `);
    
    if (deptObjResult.recordset.length === 0) {
      return { is_locked: false };
    }

    const kpi = deptObjResult.recordset[0].kpi;
    const departmentId = deptObjResult.recordset[0].department_id;
    const objectiveType = deptObjResult.recordset[0].type;
    const responsiblePerson = deptObjResult.recordset[0].responsible_person;

    // Exclude M&E objectives from lock matching (same as form: no M&E in KPIs/objectives)
    if (objectiveType === 'M&E' || objectiveType === 'M&E MOV') {
      return { is_locked: false };
    }

    // Type restrictions per field:
    // - monthly_actual: ONLY Direct type can be locked
    // - All other fields: Both Direct and In direct can be locked
    const objectiveHasDirectType = objectiveType && objectiveType.includes('Direct');
    
    if (fieldType === 'monthly_actual' && !objectiveHasDirectType) {
      // monthly_actual can ONLY be locked for Direct type objectives
      return { is_locked: false };
    }

    // Get all active locks, ordered by priority (most specific first)
    const lockRequest = pool.request();
    lockRequest.input('field_type', sql.NVarChar, fieldType);
    lockRequest.input('department_objective_id', sql.Int, departmentObjectiveId);
    lockRequest.input('kpi', sql.NVarChar, kpi);
    lockRequest.input('department_id', sql.Int, departmentId);
    lockRequest.input('user_id', sql.Int, userId);

    const locks = await lockRequest.query(`
      SELECT * FROM field_locks 
      WHERE is_active = 1
      ORDER BY 
        CASE 
          WHEN scope_type = 'hierarchical' AND objective_scope = 'specific' THEN 1
          WHEN scope_type = 'hierarchical' AND kpi_scope = 'specific' THEN 2
          WHEN scope_type = 'hierarchical' AND user_scope = 'specific' THEN 3
          WHEN scope_type = 'hierarchical' THEN 4
          WHEN scope_type = 'specific_objective' THEN 5
          WHEN scope_type = 'specific_users' THEN 6
          WHEN scope_type = 'department_kpi' THEN 7
          WHEN scope_type = 'specific_kpi' THEN 8
          WHEN scope_type = 'all_users' THEN 9
          WHEN scope_type = 'all_department_objectives' THEN 10
          ELSE 11
        END
    `);
    
    // Debug: Log all locks found
    logger.info(`[Lock Check] Found ${locks.recordset.length} active lock(s) for check`, {
      field_type: fieldType,
      objective_id: departmentObjectiveId,
      user_id: userId,
      lock_count: locks.recordset.length,
      lock_ids: locks.recordset.map(l => l.id)
    });

    // Check locks in priority order
    for (const lock of locks.recordset) {
      let matches = false;
      let lockReason = '';

      // Debug: Log lock details for hierarchical locks
      if (lock.scope_type === 'hierarchical') {
        logger.info(`[Lock Check] Processing hierarchical lock: id=${lock.id}, user_scope=${lock.user_scope}, user_ids=${lock.user_ids}, current_user_id=${userId}`);
      }

      // New hierarchical scope type
      if (lock.scope_type === 'hierarchical') {
        // Check user scope - match by USER ID (the current user trying to edit)
        // When user_scope is 'specific', check if the current user (userId) is in the locked users list
        let userMatches = true;
        if (lock.user_scope === 'specific' && lock.user_ids) {
          try {
            const userIds = JSON.parse(lock.user_ids);
            if (Array.isArray(userIds) && userIds.length > 0) {
              // Ensure both userId and array values are numbers for comparison
              const currentUserId = Number(userId);
              const lockedUserIds = userIds.map(id => Number(id));
              // Check if the current user (the one trying to edit) is in the locked users list
              userMatches = lockedUserIds.includes(currentUserId);
              
              // Debug logging
              logger.info(`[Lock Check] User scope check: lock_id=${lock.id}, current_user_id=${currentUserId}, locked_user_ids=${JSON.stringify(lockedUserIds)}, matches=${userMatches}`);
            } else {
              userMatches = false;
            }
          } catch (err) {
            logger.error('Error parsing user_ids in hierarchical lock', err);
            logger.error(`[Lock Check] Failed to parse user_ids: ${lock.user_ids}`, err);
            userMatches = false;
          }
        } else if (lock.user_scope === 'none') {
          // 'none' = skip user filter = match all
          userMatches = true;
        }
        // When user_scope is 'all', userMatches remains true (matches all users)

        if (!userMatches) {
          logger.info(`[Lock Check] Lock ID ${lock.id} skipped: user scope check failed`);
          continue;
        }
        logger.info(`[Lock Check] Lock ID ${lock.id} passed user scope check`);

        // Check KPI scope
        let kpiMatches = true;
        if (lock.kpi_scope === 'specific' && lock.kpi_ids) {
          try {
            const kpiIds = JSON.parse(lock.kpi_ids);
            if (Array.isArray(kpiIds) && kpiIds.length > 0) {
              const objectiveKPIs = kpi.includes('||') ? kpi.split('||').map(k => k.trim()) : [kpi];
              kpiMatches = objectiveKPIs.some(objKpi => kpiIds.includes(objKpi));
            } else {
              kpiMatches = false;
            }
          } catch (err) {
            logger.error('Error parsing kpi_ids in hierarchical lock', err);
            kpiMatches = false;
          }
        } else if (lock.kpi_scope === 'none') {
          // 'none' = skip KPI filter = match all
          kpiMatches = true;
        }

        if (!kpiMatches) {
          logger.info(`[Lock Check] Lock ID ${lock.id} skipped: KPI scope check failed`);
          continue;
        }
        logger.info(`[Lock Check] Lock ID ${lock.id} passed KPI scope check`);

        // Check objective scope
        let objectiveMatches = true;
        if (lock.objective_scope === 'specific' && lock.objective_ids) {
          try {
            const objectiveIds = JSON.parse(lock.objective_ids);
            if (Array.isArray(objectiveIds) && objectiveIds.length > 0) {
              objectiveMatches = objectiveIds.some(id => Number(id) === Number(departmentObjectiveId));
            } else {
              objectiveMatches = false;
            }
          } catch (err) {
            logger.error('Error parsing objective_ids in hierarchical lock', err);
            objectiveMatches = false;
          }
        } else if (lock.objective_scope === 'none') {
          // 'none' = skip objective filter = match all
          objectiveMatches = true;
        }

        if (!objectiveMatches) {
          logger.info(`[Lock Check] Lock ID ${lock.id} skipped: objective scope check failed`);
          continue;
        }
        logger.info(`[Lock Check] Lock ID ${lock.id} passed objective scope check`);

        // Check if objective type is Direct (for monthly_actual)
        if (fieldType === 'monthly_actual' && !objectiveHasDirectType) {
          logger.info(`[Lock Check] Lock ID ${lock.id} skipped: monthly_actual requires Direct type, but objective type is: ${objectiveType}`);
          continue;
        }

        // Check field locks
        logger.info(`[Lock Check] Checking field locks for lock_id=${lock.id}`, {
          field_type: fieldType,
          lock_annual_target: lock.lock_annual_target,
          lock_monthly_target: lock.lock_monthly_target,
          lock_monthly_actual: lock.lock_monthly_actual,
          lock_all_other_fields: lock.lock_all_other_fields,
          objective_has_direct_type: objectiveHasDirectType
        });
        
        if (fieldType === 'target' && (lock.lock_annual_target === true || lock.lock_annual_target === 1)) {
          matches = true;
          lockReason = 'Locked by hierarchical rule (Annual Target)';
          logger.info(`[Lock Check] ✅ MATCH FOUND! Lock ID ${lock.id} matches field type 'target'`);
        } else if (fieldType === 'monthly_target' && (lock.lock_monthly_target === true || lock.lock_monthly_target === 1)) {
          matches = true;
          lockReason = 'Locked by hierarchical rule (Monthly Target)';
          logger.info(`[Lock Check] ✅ MATCH FOUND! Lock ID ${lock.id} matches field type 'monthly_target'`);
        } else if (fieldType === 'monthly_actual' && (lock.lock_monthly_actual === true || lock.lock_monthly_actual === 1)) {
          matches = true;
          lockReason = 'Locked by hierarchical rule (Monthly Actual)';
          logger.info(`[Lock Check] ✅ MATCH FOUND! Lock ID ${lock.id} matches field type 'monthly_actual'`);
        } else if (fieldType === 'all_fields' && (lock.lock_all_other_fields === true || lock.lock_all_other_fields === 1)) {
          matches = true;
          lockReason = 'Locked by hierarchical rule (Other Fields)';
          logger.info(`[Lock Check] ✅ MATCH FOUND! Lock ID ${lock.id} matches field type 'all_fields'`);
        } else {
          logger.info(`[Lock Check] Field type '${fieldType}' does NOT match lock ID ${lock.id} field locks`);
        }

        if (matches) {
          logger.info(`[Lock Check] ✅ Lock matched! Returning locked status. Lock ID: ${lock.id}, Reason: ${lockReason}`);
          return {
            is_locked: true,
            lock_reason: lockReason,
            lock_id: lock.id,
            scope_type: lock.scope_type
          };
        }
        logger.info(`[Lock Check] Lock ID ${lock.id} did not match, continuing to next lock`);
        continue; // Skip to next lock
      }

      // Legacy scope types (backward compatibility)
      switch (lock.scope_type) {
        case 'specific_users':
          // Only lock Direct type objectives (like all_department_objectives)
          if (objectiveHasDirectType && lock.user_ids) {
            const userIds = JSON.parse(lock.user_ids);
            if (Array.isArray(userIds) && userIds.includes(userId)) {
              // Check if lock_type matches field_type
              let lockTypes = [];
              try {
                lockTypes = Array.isArray(JSON.parse(lock.lock_type)) ? JSON.parse(lock.lock_type) : [lock.lock_type];
              } catch {
                lockTypes = [lock.lock_type];
              }
              if (lockTypes.includes(fieldType) || lock.lock_type === 'all_department_objectives') {
                matches = true;
                lockReason = `Locked for specific users`;
              }
            }
          }
          break;

        case 'department_kpi':
          // Only lock Direct type objectives (like all_department_objectives)
          if (objectiveHasDirectType && lock.department_id === departmentId && lock.kpi === kpi) {
            let lockTypes = [];
            try {
              lockTypes = Array.isArray(JSON.parse(lock.lock_type)) ? JSON.parse(lock.lock_type) : [lock.lock_type];
            } catch {
              lockTypes = [lock.lock_type];
            }
            if (lockTypes.includes(fieldType) || lock.lock_type === 'all_department_objectives') {
              matches = true;
              lockReason = `Locked for department KPI`;
            }
          }
          break;

        case 'specific_kpi':
          // Only lock Direct type objectives (like all_department_objectives)
          if (objectiveHasDirectType && lock.kpi === kpi) {
            let lockTypes = [];
            try {
              lockTypes = Array.isArray(JSON.parse(lock.lock_type)) ? JSON.parse(lock.lock_type) : [lock.lock_type];
            } catch {
              lockTypes = [lock.lock_type];
            }
            if (lockTypes.includes(fieldType) || lock.lock_type === 'all_department_objectives') {
              matches = true;
              lockReason = `Locked for KPI`;
            }
          }
          break;

        case 'all_users':
          // Only lock Direct type objectives (like all_department_objectives)
          if (objectiveHasDirectType) {
            let lockTypes = [];
            try {
              lockTypes = Array.isArray(JSON.parse(lock.lock_type)) ? JSON.parse(lock.lock_type) : [lock.lock_type];
            } catch {
              lockTypes = [lock.lock_type];
            }
            if (lockTypes.includes(fieldType) || lock.lock_type === 'all_department_objectives') {
              matches = true;
              lockReason = `Locked for all users`;
            }
          }
          break;

        case 'specific_objective':
          // Lock specific department objective by ID
          // Only lock Direct type objectives
          if (objectiveHasDirectType && lock.department_objective_id === departmentObjectiveId) {
            let lockTypes = [];
            try {
              lockTypes = Array.isArray(JSON.parse(lock.lock_type)) ? JSON.parse(lock.lock_type) : [lock.lock_type];
            } catch {
              lockTypes = [lock.lock_type];
            }
            if (lockTypes.includes(fieldType) || lock.lock_type === 'all_department_objectives') {
              matches = true;
              lockReason = `Locked for specific objective`;
            }
          }
          break;

        case 'all_department_objectives':
          // Only lock Direct type objectives
          if (!objectiveHasDirectType) {
            break;
          }
          // Check user scope
          let userMatches = true;
          if (lock.user_ids) {
            const userIds = JSON.parse(lock.user_ids);
            userMatches = Array.isArray(userIds) && userIds.includes(userId);
          }

          if (userMatches) {
            // Check exclusions (separate for target and actual now)
            // Note: SQL Server BIT values are returned as booleans (true/false), not numbers (0/1)
            // So we check for both false and 0 to handle both cases
            if (fieldType === 'monthly_target') {
              // Lock if NOT excluded (exclude_monthly_target is false or 0)
              if (lock.exclude_monthly_target === false || lock.exclude_monthly_target === 0) {
                matches = true;
                lockReason = `Locked by All Department Objectives`;
              }
            } else if (fieldType === 'monthly_actual') {
              // Lock if NOT excluded (exclude_monthly_actual is false or 0)
              if (lock.exclude_monthly_actual === false || lock.exclude_monthly_actual === 0) {
                matches = true;
                lockReason = `Locked by All Department Objectives`;
              }
            } else if (fieldType === 'target') {
              // Lock if NOT excluded (exclude_annual_target is false or 0)
              if (lock.exclude_annual_target === false || lock.exclude_annual_target === 0) {
                matches = true;
                lockReason = `Locked by All Department Objectives`;
              }
            } else if (fieldType === 'all_fields') {
              // all_fields represents other editable fields (activity, responsible_person, mov, etc.)
              // These are always locked by "All Department Objectives" regardless of exclusions
              matches = true;
              lockReason = `Locked by All Department Objectives`;
            }
          }
          break;
      }

      // Check if this legacy lock matched (after switch statement)
      if (matches) {
        logger.info(`[Lock Check] Legacy lock matched! Returning locked status`, {
          lock_id: lock.id,
          field_type: fieldType,
          objective_id: departmentObjectiveId,
          user_id: userId,
          reason: lockReason
        });
        return {
          is_locked: true,
          lock_reason: lockReason,
          lock_id: lock.id,
          scope_type: lock.scope_type
        };
      }
    }

    // Debug: Log why no lock was found
    logger.info(`[Lock Check] No matching lock found`, {
      field_type: fieldType,
      objective_id: departmentObjectiveId,
      user_id: userId,
      total_locks_checked: locks.recordset.length,
      locks_checked: locks.recordset.map(l => ({
        id: l.id,
        scope_type: l.scope_type,
        user_scope: l.user_scope,
        user_ids: l.user_ids
      }))
    });
    
    return { is_locked: false };
  } catch (error) {
    logger.error('Error checking lock status', error);
    return { is_locked: false, error: error.message };
  }
}

// Main handler
const handler = rateLimiter('general')(
  authMiddleware({
    optional: false, // All config endpoints require auth
    requiredRoles: [], // Role check will be done per-endpoint below
  })(async (event, context) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    try {
      const pool = await getPool();
      const path = event.path.replace('/.netlify/functions/config-api', '');
      const method = event.httpMethod;
      const user = event.user;
      
      // Normalize user ID field (JWT uses userId, but we need id for database)
      // Handle both userId and id fields from JWT token
      // JWT token contains userId, but we need id for consistency
      if (user) {
        // JWT payload has userId, normalize to id
        if (user.userId !== undefined && user.id === undefined) {
          user.id = user.userId;
        } else if (user.id !== undefined && user.userId === undefined) {
          user.userId = user.id;
        }
        // Ensure user.id is a number (handle string conversion)
        if (user.id !== undefined) {
          user.id = Number(user.id);
        }
        if (user.userId !== undefined) {
          user.userId = Number(user.userId);
        }
        
        // Debug logging
        logger.info(`[Config API] User object normalized:`, {
          original_userId: event.user?.userId,
          original_id: event.user?.id,
          normalized_id: user.id,
          normalized_userId: user.userId,
          username: user.username
        });
      }

      // Parse path segments
      const pathParts = path.split('/').filter(p => p);
      const resource = pathParts[0]; // 'locks', 'logs', or 'permissions'
      
      // Determine if pathParts[1] is an ID (number) or an action (string)
      const isNumericId = pathParts[1] && !isNaN(parseInt(pathParts[1]));
      const action = isNumericId ? null : pathParts[1]; // 'check', 'check-batch', 'export', etc.
      const id = isNumericId ? parseInt(pathParts[1]) : (pathParts[2] ? parseInt(pathParts[2]) : null); // ID parameter
      const queryParams = event.queryStringParameters || {};

      // Lock checking endpoints are available to ALL authenticated users
      const isLockCheckEndpoint = resource === 'locks' && (action === 'check' || action === 'check-batch' || action === 'check-operation');
      const isHelperEndpoint = resource === 'locks' && (action === 'kpis-by-users' || action === 'objectives-by-kpis' || action === 'objectives-by-users');
      
      // Debug logging for permission checks
      logger.info(`[Config API] Path parsing:`, {
        originalPath: event.path,
        processedPath: path,
        pathParts,
        resource,
        action,
        isNumericId,
        isLockCheckEndpoint,
        isHelperEndpoint,
        userRole: user.role,
        userId: user.id
      });
      
      // All other endpoints require Admin or CEO role
      if (!isLockCheckEndpoint && !isHelperEndpoint) {
        const isAdmin = user.role === 'Admin' || user.role === 'CEO';
        if (!isAdmin) {
          logger.warn(`[Config API] Access denied:`, {
            resource,
            action,
            userRole: user.role,
            userId: user.id,
            path: event.path
          });
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Access denied. Admin or CEO role required.'
            })
          };
        }
      }

      // ========== HELPER ENDPOINTS FOR HIERARCHICAL LOCKS ==========
      
      if (resource === 'locks' && action === 'kpis-by-users') {
        // GET /api/config/locks/kpis-by-users?user_ids=1,2,3
        // Returns KPIs from department_objectives in the selected users' department(s)
        if (method === 'GET') {
          const userIdsParam = queryParams.user_ids || '';
          const userIds = userIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
          
          if (userIds.length === 0) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'user_ids parameter required' })
            };
          }

          // Get users with their departments (stored as JSON or comma-separated codes)
          const userIdsStr = userIds.join(',');
          const userResult = await pool.request().query(`
            SELECT id, username, departments FROM users WHERE id IN (${userIdsStr})
          `);
          
          if (userResult.recordset.length === 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, data: [] })
            };
          }

          // Collect all department codes from users' departments
          const departmentCodes = new Set();
          for (const u of userResult.recordset) {
            let depts = [];
            try {
              if (typeof u.departments === 'string') {
                if (u.departments.trim().startsWith('[')) {
                  depts = JSON.parse(u.departments);
                } else {
                  depts = u.departments.split(',').map(d => d.trim()).filter(Boolean);
                }
              } else if (Array.isArray(u.departments)) {
                depts = u.departments;
              }
            } catch {
              depts = u.departments ? u.departments.split(',').map(d => d.trim()).filter(Boolean) : [];
            }
            depts.forEach(c => departmentCodes.add(String(c).trim()));
          }

          const codes = Array.from(departmentCodes).filter(Boolean);
          if (codes.length === 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, data: [] })
            };
          }

          // Get department IDs - match both code and name (users.departments may store either)
          const codeConditions = codes.map((_, i) => `(LOWER(RTRIM(code)) = LOWER(RTRIM(@code_${i})) OR LOWER(RTRIM(name)) = LOWER(RTRIM(@code_${i})))`).join(' OR ');
          const deptRequest = pool.request();
          codes.forEach((c, i) => { deptRequest.input(`code_${i}`, sql.NVarChar, c); });
          const deptResult = await deptRequest.query(`
            SELECT id FROM departments WHERE ${codeConditions}
          `);
          const departmentIds = deptResult.recordset.map(r => r.id);
          if (departmentIds.length === 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, data: [] })
            };
          }

          // Get distinct KPIs from department_objectives in those departments (exclude M&E and M&E MOV)
          const deptIdsStr = departmentIds.join(',');
          const kpiResult = await pool.request().query(`
            SELECT DISTINCT kpi FROM department_objectives 
            WHERE department_id IN (${deptIdsStr}) 
              AND type NOT IN ('M&E', 'M&E MOV')
            ORDER BY kpi
          `);
          const kpis = kpiResult.recordset.map(r => r.kpi);
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: kpis })
          };
        }
      }

      if (resource === 'locks' && action === 'objectives-by-users') {
        // GET /api/config/locks/objectives-by-users?user_ids=1,2,3
        // Returns objectives from department_objectives in the selected users' department(s)
        if (method === 'GET') {
          const userIdsParam = queryParams.user_ids || '';
          const userIds = userIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
          
          if (userIds.length === 0) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'user_ids parameter required' })
            };
          }

          // Get users with their departments
          const userIdsStr = userIds.join(',');
          const userResult = await pool.request().query(`
            SELECT id, username, departments FROM users WHERE id IN (${userIdsStr})
          `);
          
          if (userResult.recordset.length === 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, data: [] })
            };
          }

          // Collect all department codes from users' departments
          const departmentCodes = new Set();
          for (const u of userResult.recordset) {
            let depts = [];
            try {
              if (typeof u.departments === 'string') {
                if (u.departments.trim().startsWith('[')) {
                  depts = JSON.parse(u.departments);
                } else {
                  depts = u.departments.split(',').map(d => d.trim()).filter(Boolean);
                }
              } else if (Array.isArray(u.departments)) {
                depts = u.departments;
              }
            } catch {
              depts = u.departments ? u.departments.split(',').map(d => d.trim()).filter(Boolean) : [];
            }
            depts.forEach(c => departmentCodes.add(String(c).trim()));
          }

          const codes = Array.from(departmentCodes).filter(Boolean);
          if (codes.length === 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, data: [] })
            };
          }

          // Get department IDs
          const codeConditions = codes.map((_, i) => `(LOWER(RTRIM(code)) = LOWER(RTRIM(@code_${i})) OR LOWER(RTRIM(name)) = LOWER(RTRIM(@code_${i})))`).join(' OR ');
          const deptRequest = pool.request();
          codes.forEach((c, i) => { deptRequest.input(`code_${i}`, sql.NVarChar, c); });
          const deptResult = await deptRequest.query(`
            SELECT id FROM departments WHERE ${codeConditions}
          `);
          const departmentIds = deptResult.recordset.map(r => r.id);
          if (departmentIds.length === 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, data: [] })
            };
          }

          // Get objectives from department_objectives in those departments (exclude M&E and M&E MOV)
          const deptIdsStr = departmentIds.join(',');
          const objResult = await pool.request().query(`
            SELECT id, activity, kpi, responsible_person, type, department_id
            FROM department_objectives 
            WHERE department_id IN (${deptIdsStr}) 
              AND type NOT IN ('M&E', 'M&E MOV')
            ORDER BY activity
          `);
          
          const objectives = objResult.recordset.map(r => ({
            id: r.id,
            activity: r.activity,
            kpi: r.kpi,
            responsible_person: r.responsible_person,
            type: r.type || '',
            department_id: r.department_id
          }));
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: objectives })
          };
        }
      }

      if (resource === 'locks' && action === 'objectives-by-kpis') {
        // GET /api/config/locks/objectives-by-kpis?kpi_ids=kpi1&kpi_ids=kpi2&user_ids=1,2,3
        // Returns objectives matching selected KPIs, optionally filtered by users
        if (method === 'GET') {
          let kpiIds = [];
          if (Array.isArray(queryParams.kpi_ids)) {
            kpiIds = queryParams.kpi_ids.map(k => decodeURIComponent(String(k).trim())).filter(k => k);
          } else if (queryParams.kpi_ids) {
            kpiIds = String(queryParams.kpi_ids).split(',').map(k => decodeURIComponent(k.trim())).filter(k => k);
          }
          
          if (kpiIds.length === 0) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'kpi_ids parameter required' })
            };
          }

          // Optional user filter
          let departmentIds = null;
          if (queryParams.user_ids) {
            const userIdsParam = queryParams.user_ids;
            const userIds = userIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            
            if (userIds.length > 0) {
              // Get users with their departments
              const userIdsStr = userIds.join(',');
              const userResult = await pool.request().query(`
                SELECT id, username, departments FROM users WHERE id IN (${userIdsStr})
              `);
              
              if (userResult.recordset.length > 0) {
                // Collect all department codes from users' departments
                const departmentCodes = new Set();
                for (const u of userResult.recordset) {
                  let depts = [];
                  try {
                    if (typeof u.departments === 'string') {
                      if (u.departments.trim().startsWith('[')) {
                        depts = JSON.parse(u.departments);
                      } else {
                        depts = u.departments.split(',').map(d => d.trim()).filter(Boolean);
                      }
                    } else if (Array.isArray(u.departments)) {
                      depts = u.departments;
                    }
                  } catch {
                    depts = u.departments ? u.departments.split(',').map(d => d.trim()).filter(Boolean) : [];
                  }
                  depts.forEach(c => departmentCodes.add(String(c).trim()));
                }

                const codes = Array.from(departmentCodes).filter(Boolean);
                if (codes.length > 0) {
                  // Get department IDs
                  const codeConditions = codes.map((_, i) => `(LOWER(RTRIM(code)) = LOWER(RTRIM(@code_${i})) OR LOWER(RTRIM(name)) = LOWER(RTRIM(@code_${i})))`).join(' OR ');
                  const deptRequest = pool.request();
                  codes.forEach((c, i) => { deptRequest.input(`code_${i}`, sql.NVarChar, c); });
                  const deptResult = await deptRequest.query(`
                    SELECT id FROM departments WHERE ${codeConditions}
                  `);
                  departmentIds = deptResult.recordset.map(r => r.id);
                }
              }
            }
          }

          const objRequest = pool.request();
          const kpiConditions = kpiIds.map((_, i) => {
            objRequest.input(`kpi_${i}`, sql.NVarChar, kpiIds[i]);
            return `kpi = @kpi_${i}`;
          }).join(' OR ');
          
          let whereClause = `(${kpiConditions}) AND type NOT IN ('M&E', 'M&E MOV')`;
          if (departmentIds && departmentIds.length > 0) {
            const deptIdsStr = departmentIds.join(',');
            whereClause += ` AND department_id IN (${deptIdsStr})`;
          }
          
          const objResult = await objRequest.query(`
            SELECT id, activity, kpi, responsible_person, type, department_id
            FROM department_objectives 
            WHERE ${whereClause}
            ORDER BY activity
          `);
          
          const objectives = objResult.recordset.map(r => ({
            id: r.id,
            activity: r.activity,
            kpi: r.kpi,
            responsible_person: r.responsible_person,
            type: r.type || '',
            department_id: r.department_id
          }));
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: objectives })
          };
        }
      }

      // ========== LOCK MANAGEMENT ENDPOINTS ==========
      if (resource === 'locks') {
        // GET /api/config/locks - Get all locks
        if (method === 'GET' && !action) {
          const request = pool.request();
          const result = await request.query(`
            SELECT 
              fl.*,
              u.username as created_by_username,
              d.name as department_name,
              do.activity as department_objective_activity
            FROM field_locks fl
            LEFT JOIN users u ON fl.created_by = u.id
            LEFT JOIN departments d ON fl.department_id = d.id
            LEFT JOIN department_objectives do ON fl.department_objective_id = do.id
            WHERE fl.is_active = 1
            ORDER BY fl.created_at DESC
          `);

          const locks = result.recordset.map(lock => {
            const parsed = {
              ...lock,
              user_ids: lock.user_ids ? JSON.parse(lock.user_ids) : null,
              lock_type: lock.lock_type && lock.lock_type.includes && lock.lock_type.includes('[') ? JSON.parse(lock.lock_type) : lock.lock_type
            };
            // Parse new hierarchical fields
            if (lock.kpi_ids) {
              try {
                parsed.kpi_ids = JSON.parse(lock.kpi_ids);
              } catch {
                // Try parsing as single string if JSON parse fails
                try {
                  parsed.kpi_ids = [lock.kpi_ids];
                } catch {
                  parsed.kpi_ids = null;
                }
              }
            }
            if (lock.objective_ids) {
              try {
                parsed.objective_ids = JSON.parse(lock.objective_ids);
              } catch {
                // Try parsing as single number if JSON parse fails
                try {
                  parsed.objective_ids = [parseInt(lock.objective_ids)];
                } catch {
                  parsed.objective_ids = null;
                }
              }
            }
            return parsed;
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: locks })
          };
        }

        // GET /api/config/locks/:id - Get specific lock
        if (method === 'GET' && id) {
          const request = pool.request();
          request.input('id', sql.Int, id);
          const result = await request.query(`
            SELECT 
              fl.*,
              u.username as created_by_username,
              d.name as department_name,
              do.activity as department_objective_activity
            FROM field_locks fl
            LEFT JOIN users u ON fl.created_by = u.id
            LEFT JOIN departments d ON fl.department_id = d.id
            LEFT JOIN department_objectives do ON fl.department_objective_id = do.id
            WHERE fl.id = @id
          `);

          if (result.recordset.length === 0) {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ success: false, error: 'Lock not found' })
            };
          }

          const lock = result.recordset[0];
          lock.user_ids = lock.user_ids ? JSON.parse(lock.user_ids) : null;
          lock.lock_type = lock.lock_type && lock.lock_type.includes && lock.lock_type.includes('[') ? JSON.parse(lock.lock_type) : lock.lock_type;
          // Parse new hierarchical fields
          if (lock.kpi_ids) {
            try {
              lock.kpi_ids = JSON.parse(lock.kpi_ids);
            } catch {
              // Try parsing as single string if JSON parse fails
              try {
                lock.kpi_ids = [lock.kpi_ids];
              } catch {
                lock.kpi_ids = null;
              }
            }
          }
          if (lock.objective_ids) {
            try {
              lock.objective_ids = JSON.parse(lock.objective_ids);
            } catch {
              // Try parsing as single number if JSON parse fails
              try {
                lock.objective_ids = [parseInt(lock.objective_ids)];
              } catch {
                lock.objective_ids = null;
              }
            }
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: lock })
          };
        }

        // GET /api/config/locks/check - Check if field is locked
        if (method === 'GET' && action === 'check') {
          const params = event.queryStringParameters || {};
          const fieldType = params.field_type;
          const departmentObjectiveId = parseInt(params.department_objective_id);
          const userId = user.id;
          const month = params.month || null;

          // Debug logging with full user object details
          logger.info(`[Lock Check API] Request received:`, {
            field_type: fieldType,
            objective_id: departmentObjectiveId,
            user_id: userId,
            user_object: {
              id: user.id,
              userId: user.userId,
              username: user.username,
              role: user.role,
              raw_user: user
            },
            month: month
          });

          if (!fieldType || !departmentObjectiveId) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'field_type and department_objective_id are required' })
            };
          }

          if (!userId) {
            logger.error(`[Lock Check API] No user ID found!`, {
              user_object: user,
              user_keys: Object.keys(user || {}),
              event_user: event.user
            });
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ 
                success: false, 
                error: 'User ID not found in authentication token',
                debug: {
                  user_id: user?.id,
                  user_userId: user?.userId,
                  user_keys: Object.keys(user || {})
                }
              })
            };
          }

          const lockStatus = await checkLockStatus(pool, fieldType, departmentObjectiveId, userId, month);
          
          // Get all active locks for debug info
          const allLocksResult = await pool.request().query(`
            SELECT id, scope_type, user_scope, user_ids, lock_annual_target, lock_monthly_target, lock_all_other_fields, is_active
            FROM field_locks 
            WHERE is_active = 1
          `);
          
          // Add comprehensive debug info to response
          const response = {
            success: true,
            data: {
              ...lockStatus,
              // Add detailed debug info to help troubleshoot
              _debug: {
                user_id_used: userId,
                objective_id: departmentObjectiveId,
                field_type: fieldType,
                total_active_locks: allLocksResult.recordset.length,
                locks_found: allLocksResult.recordset.map(l => ({
                  id: l.id,
                  scope_type: l.scope_type,
                  user_scope: l.user_scope,
                  user_ids: l.user_ids,
                  lock_annual_target: l.lock_annual_target,
                  lock_monthly_target: l.lock_monthly_target,
                  lock_all_other_fields: l.lock_all_other_fields
                }))
              }
            }
          };
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
          };
        }

        // GET /api/config/locks/check-operation - Check if add/delete operation is locked
        if (resource === 'locks' && action === 'check-operation' && method === 'GET') {
          const operation = queryParams.operation; // 'add' or 'delete'
          const kpi = queryParams.kpi || null;
          const departmentId = queryParams.department_id ? parseInt(queryParams.department_id) : null;
          const userId = user.id;
          
          if (!operation || !userId) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'Missing required parameters: operation and user authentication'
              })
            };
          }

          // For add operation without KPI, we can still check if user has any add locks
          // For delete operation, KPI is optional - we can check general locks

          // Import the checkObjectiveOperationLock function from wig-api
          // Since we can't directly import, we'll duplicate the logic here
          // Actually, let's call the wig-api function via HTTP or duplicate the logic
          // For now, let's duplicate a simplified version
          
          try {
            // Get all active hierarchical locks that lock this operation
            const operationLockField = operation === 'add' ? 'lock_add_objective' : 'lock_delete_objective';
            const lockRequest = pool.request();
            const locks = await lockRequest.query(`
              SELECT * FROM field_locks 
              WHERE is_active = 1 
                AND scope_type = 'hierarchical'
                AND (${operationLockField} = 1 OR ${operationLockField} = 'true')
            `);

            let isLocked = false;
            let lockReason = '';

            for (const lock of locks.recordset) {
              // Check user scope
              let userMatches = true;
              if (lock.user_scope === 'specific' && lock.user_ids) {
                try {
                  const userIds = JSON.parse(lock.user_ids);
                  if (Array.isArray(userIds) && userIds.length > 0) {
                    const currentUserId = Number(userId);
                    const lockedUserIds = userIds.map(id => Number(id));
                    userMatches = lockedUserIds.includes(currentUserId);
                  } else {
                    userMatches = false;
                  }
                } catch (err) {
                  userMatches = false;
                }
              } else if (lock.user_scope === 'none') {
                userMatches = true;
              }

              if (!userMatches) continue;

              // Check KPI scope (only if kpi is provided)
              if (kpi) {
                let kpiMatches = true;
                if (lock.kpi_scope === 'specific' && lock.kpi_ids) {
                  try {
                    const kpiIds = JSON.parse(lock.kpi_ids);
                    if (Array.isArray(kpiIds) && kpiIds.length > 0) {
                      const objectiveKPIs = kpi.includes('||') ? kpi.split('||').map(k => k.trim()) : [kpi];
                      kpiMatches = objectiveKPIs.some(objKpi => kpiIds.includes(objKpi));
                    } else {
                      kpiMatches = false;
                    }
                  } catch (err) {
                    kpiMatches = false;
                  }
                } else if (lock.kpi_scope === 'none') {
                  kpiMatches = true;
                }

                if (!kpiMatches) continue;
              } else {
                // If no KPI provided, only match locks with kpi_scope = 'all' or 'none'
                // This allows checking if user has ANY add/delete locks before they select a KPI
                if (lock.kpi_scope === 'specific') {
                  continue; // Skip locks that require specific KPIs if we don't have a KPI
                }
                // For kpi_scope = 'all' or 'none', the lock applies regardless of KPI
              }

              // If we get here, the lock applies
              isLocked = true;
              lockReason = `Cannot ${operation} objective - locked by hierarchical rule`;
              break;
            }

            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: true,
                data: {
                  is_locked: isLocked,
                  lock_reason: lockReason || undefined
                }
              })
            };
          } catch (error) {
            logger.error('[Config API] Error checking operation lock:', error);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'Failed to check operation lock'
              })
            };
          }
        }
        // POST /api/config/locks/check-batch - Batch check locks
        if (method === 'POST' && action === 'check-batch') {
          const body = JSON.parse(event.body || '{}');
          const { checks } = body;

          if (!Array.isArray(checks)) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'checks must be an array' })
            };
          }

          const results = await Promise.all(
            checks.map(check => 
              checkLockStatus(
                pool, 
                check.field_type, 
                check.department_objective_id, 
                user.id, 
                check.month
              ).then(status => ({
                ...status,
                field_type: check.field_type,
                department_objective_id: check.department_objective_id,
                month: check.month
              }))
            )
          );

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: { results } })
          };
        }

        // POST /api/config/locks - Create lock
        if (method === 'POST' && !action) {
          const body = JSON.parse(event.body || '{}');
          const {
            // New hierarchical structure
            scope_type,
            user_scope,
            user_ids,
            kpi_scope,
            kpi_ids,
            objective_scope,
            objective_ids,
            lock_annual_target,
            lock_monthly_target,
            lock_monthly_actual,
            lock_all_other_fields,
            lock_add_objective,
            lock_delete_objective,
            // Legacy fields (for backward compatibility)
            lock_type,
            kpi,
            department_id,
            department_objective_id,
            exclude_monthly_target,
            exclude_monthly_actual,
            exclude_annual_target
          } = body;

          if (!scope_type) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'scope_type is required' })
            };
          }

          // Validate new hierarchical structure
          if (scope_type === 'hierarchical') {
            if (!user_scope || !kpi_scope || !objective_scope) {
              return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'user_scope, kpi_scope, and objective_scope are required for hierarchical locks' })
              };
            }
            // Check at least one field is locked
            const hasFieldLock = lock_annual_target || lock_monthly_target || lock_monthly_actual || 
                                 lock_all_other_fields || lock_add_objective || lock_delete_objective;
            if (!hasFieldLock) {
              return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'At least one field must be locked' })
              };
            }
          }

          const request = pool.request();
          // New hierarchical fields
          request.input('scope_type', sql.NVarChar, scope_type || 'hierarchical');
          request.input('user_scope', sql.NVarChar, user_scope || 'all');
          request.input('user_ids', sql.NVarChar, user_ids ? JSON.stringify(user_ids) : null);
          request.input('kpi_scope', sql.NVarChar, kpi_scope || 'all');
          request.input('kpi_ids', sql.NVarChar, kpi_ids ? JSON.stringify(kpi_ids) : null);
          request.input('objective_scope', sql.NVarChar, objective_scope || 'all');
          request.input('objective_ids', sql.NVarChar, objective_ids ? JSON.stringify(objective_ids) : null);
          request.input('lock_annual_target', sql.Bit, lock_annual_target || false);
          request.input('lock_monthly_target', sql.Bit, lock_monthly_target || false);
          request.input('lock_monthly_actual', sql.Bit, lock_monthly_actual || false);
          request.input('lock_all_other_fields', sql.Bit, lock_all_other_fields || false);
          request.input('lock_add_objective', sql.Bit, lock_add_objective || false);
          request.input('lock_delete_objective', sql.Bit, lock_delete_objective || false);
          // Legacy fields (for backward compatibility). lock_type is NOT NULL - use 'hierarchical' for new hierarchical locks.
          const lockTypeValue = lock_type ? (Array.isArray(lock_type) ? JSON.stringify(lock_type) : lock_type) : (scope_type === 'hierarchical' ? 'hierarchical' : 'all_department_objectives');
          request.input('lock_type', sql.NVarChar, lockTypeValue);
          request.input('kpi', sql.NVarChar, kpi || null);
          request.input('department_id', sql.Int, department_id || null);
          request.input('department_objective_id', sql.Int, department_objective_id || null);
          request.input('exclude_monthly_target', sql.Bit, exclude_monthly_target || false);
          request.input('exclude_monthly_actual', sql.Bit, exclude_monthly_actual || false);
          request.input('exclude_annual_target', sql.Bit, exclude_annual_target || false);
          request.input('created_by', sql.Int, user.id);

          const result = await request.query(`
            INSERT INTO field_locks 
            (scope_type, user_scope, user_ids, kpi_scope, kpi_ids, objective_scope, objective_ids,
             lock_annual_target, lock_monthly_target, lock_monthly_actual, lock_all_other_fields, 
             lock_add_objective, lock_delete_objective,
             lock_type, kpi, department_id, department_objective_id, 
             exclude_monthly_target, exclude_monthly_actual, exclude_annual_target, created_by)
            OUTPUT INSERTED.*
            VALUES 
            (@scope_type, @user_scope, @user_ids, @kpi_scope, @kpi_ids, @objective_scope, @objective_ids,
             @lock_annual_target, @lock_monthly_target, @lock_monthly_actual, @lock_all_other_fields,
             @lock_add_objective, @lock_delete_objective,
             @lock_type, @kpi, @department_id, @department_objective_id,
             @exclude_monthly_target, @exclude_monthly_actual, @exclude_annual_target, @created_by)
          `);

          const newLock = result.recordset[0];
          newLock.user_ids = newLock.user_ids ? JSON.parse(newLock.user_ids) : null;
          newLock.lock_type = newLock.lock_type && newLock.lock_type.includes && newLock.lock_type.includes('[') ? JSON.parse(newLock.lock_type) : newLock.lock_type;

          // Log activity
          await logActivity(pool, {
            user_id: user.id,
            username: user.username,
            action_type: 'lock_created',
            metadata: { lock_id: newLock.id, scope_type, lock_type }
          });

          // Fill locked values from PMS/Odoo cache (non-blocking)
          fillLockedValuesFromCache(pool, newLock).catch(err => {
            logger.error('Background fillLockedValuesFromCache failed', err);
          });

          return {
            statusCode: 201,
            headers,
            body: JSON.stringify({ success: true, data: newLock })
          };
        }

        // PUT /api/config/locks/:id - Update lock
        if (method === 'PUT' && id) {
          const body = JSON.parse(event.body || '{}');
          const request = pool.request();
          request.input('id', sql.Int, id);
          const scopeType = body.scope_type || 'hierarchical';
          
          // New hierarchical structure
          request.input('scope_type', sql.NVarChar, scopeType);
          request.input('user_scope', sql.NVarChar, body.user_scope !== undefined ? body.user_scope : null);
          request.input('user_ids', sql.NVarChar, body.user_ids ? JSON.stringify(body.user_ids) : null);
          request.input('kpi_scope', sql.NVarChar, body.kpi_scope !== undefined ? body.kpi_scope : null);
          request.input('kpi_ids', sql.NVarChar, body.kpi_ids ? JSON.stringify(body.kpi_ids) : null);
          request.input('objective_scope', sql.NVarChar, body.objective_scope !== undefined ? body.objective_scope : null);
          request.input('objective_ids', sql.NVarChar, body.objective_ids ? JSON.stringify(body.objective_ids) : null);
          request.input('lock_annual_target', sql.Bit, body.lock_annual_target !== undefined ? body.lock_annual_target : null);
          request.input('lock_monthly_target', sql.Bit, body.lock_monthly_target !== undefined ? body.lock_monthly_target : null);
          request.input('lock_monthly_actual', sql.Bit, body.lock_monthly_actual !== undefined ? body.lock_monthly_actual : null);
          request.input('lock_all_other_fields', sql.Bit, body.lock_all_other_fields !== undefined ? body.lock_all_other_fields : null);
          request.input('lock_add_objective', sql.Bit, body.lock_add_objective !== undefined ? body.lock_add_objective : null);
          request.input('lock_delete_objective', sql.Bit, body.lock_delete_objective !== undefined ? body.lock_delete_objective : null);
          
          // Legacy fields (for backward compatibility)
          request.input('lock_type', sql.NVarChar, body.lock_type ? (Array.isArray(body.lock_type) ? JSON.stringify(body.lock_type) : body.lock_type) : null);
          request.input('kpi', sql.NVarChar, body.kpi || null);
          request.input('department_id', sql.Int, body.department_id || null);
          request.input('department_objective_id', sql.Int, body.department_objective_id !== undefined ? body.department_objective_id : null);
          request.input('exclude_monthly_target', sql.Bit, body.exclude_monthly_target !== undefined ? body.exclude_monthly_target : null);
          request.input('exclude_monthly_actual', sql.Bit, body.exclude_monthly_actual !== undefined ? body.exclude_monthly_actual : null);
          request.input('exclude_annual_target', sql.Bit, body.exclude_annual_target !== undefined ? body.exclude_annual_target : null);
          request.input('is_active', sql.Bit, body.is_active !== undefined ? body.is_active : null);

          // Build UPDATE query - use COALESCE for optional updates
          const result = await request.query(`
            UPDATE field_locks
            SET 
              scope_type = COALESCE(@scope_type, scope_type),
              user_scope = COALESCE(@user_scope, user_scope),
              user_ids = COALESCE(@user_ids, user_ids),
              kpi_scope = COALESCE(@kpi_scope, kpi_scope),
              kpi_ids = COALESCE(@kpi_ids, kpi_ids),
              objective_scope = COALESCE(@objective_scope, objective_scope),
              objective_ids = COALESCE(@objective_ids, objective_ids),
              lock_annual_target = COALESCE(@lock_annual_target, lock_annual_target),
              lock_monthly_target = COALESCE(@lock_monthly_target, lock_monthly_target),
              lock_monthly_actual = COALESCE(@lock_monthly_actual, lock_monthly_actual),
              lock_all_other_fields = COALESCE(@lock_all_other_fields, lock_all_other_fields),
              lock_add_objective = COALESCE(@lock_add_objective, lock_add_objective),
              lock_delete_objective = COALESCE(@lock_delete_objective, lock_delete_objective),
              lock_type = COALESCE(@lock_type, lock_type),
              kpi = COALESCE(@kpi, kpi),
              department_id = COALESCE(@department_id, department_id),
              department_objective_id = COALESCE(@department_objective_id, department_objective_id),
              exclude_monthly_target = COALESCE(@exclude_monthly_target, exclude_monthly_target),
              exclude_monthly_actual = COALESCE(@exclude_monthly_actual, exclude_monthly_actual),
              exclude_annual_target = COALESCE(@exclude_annual_target, exclude_annual_target),
              is_active = COALESCE(@is_active, is_active),
              updated_at = GETDATE()
            OUTPUT INSERTED.*
            WHERE id = @id
          `);

          if (result.recordset.length === 0) {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ success: false, error: 'Lock not found' })
            };
          }

          const updatedLock = result.recordset[0];
          updatedLock.user_ids = updatedLock.user_ids ? JSON.parse(updatedLock.user_ids) : null;
          updatedLock.lock_type = updatedLock.lock_type.includes('[') ? JSON.parse(updatedLock.lock_type) : updatedLock.lock_type;

          // Log activity
          await logActivity(pool, {
            user_id: user.id,
            username: user.username,
            action_type: 'lock_updated',
            metadata: { lock_id: id }
          });

          // Fill locked values from PMS/Odoo cache (non-blocking)
          fillLockedValuesFromCache(pool, updatedLock).catch(err => {
            logger.error('Background fillLockedValuesFromCache failed', err);
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: updatedLock })
          };
        }

        // DELETE /api/config/locks/:id - Delete/deactivate lock
        if (method === 'DELETE' && id) {
          const request = pool.request();
          request.input('id', sql.Int, id);

          const result = await request.query(`
            UPDATE field_locks
            SET is_active = 0, updated_at = GETDATE()
            OUTPUT INSERTED.*
            WHERE id = @id
          `);

          if (result.recordset.length === 0) {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ success: false, error: 'Lock not found' })
            };
          }

          // Log activity
          await logActivity(pool, {
            user_id: user.id,
            username: user.username,
            action_type: 'lock_deleted',
            metadata: { lock_id: id }
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Lock deactivated' })
          };
        }

        // POST /api/config/locks/bulk - Bulk operations
        if (method === 'POST' && action === 'bulk') {
          const body = JSON.parse(event.body || '{}');
          const { operation, locks } = body; // operation: 'create' or 'delete', locks: array of lock data or IDs

          if (!operation || !Array.isArray(locks)) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'operation and locks array are required' })
            };
          }

          if (operation === 'create') {
            const results = [];
            for (const lockData of locks) {
              const request = pool.request();
              // New hierarchical fields
              request.input('scope_type', sql.NVarChar, lockData.scope_type || 'hierarchical');
              request.input('user_scope', sql.NVarChar, lockData.user_scope || 'all');
              request.input('user_ids', sql.NVarChar, lockData.user_ids ? JSON.stringify(lockData.user_ids) : null);
              request.input('kpi_scope', sql.NVarChar, lockData.kpi_scope || 'all');
              request.input('kpi_ids', sql.NVarChar, lockData.kpi_ids ? JSON.stringify(lockData.kpi_ids) : null);
              request.input('objective_scope', sql.NVarChar, lockData.objective_scope || 'all');
              request.input('objective_ids', sql.NVarChar, lockData.objective_ids ? JSON.stringify(lockData.objective_ids) : null);
              request.input('lock_annual_target', sql.Bit, lockData.lock_annual_target || false);
              request.input('lock_monthly_target', sql.Bit, lockData.lock_monthly_target || false);
              request.input('lock_monthly_actual', sql.Bit, lockData.lock_monthly_actual || false);
              request.input('lock_all_other_fields', sql.Bit, lockData.lock_all_other_fields || false);
              request.input('lock_add_objective', sql.Bit, lockData.lock_add_objective || false);
              request.input('lock_delete_objective', sql.Bit, lockData.lock_delete_objective || false);
              // Legacy fields. lock_type is NOT NULL - use 'hierarchical' for new hierarchical locks.
              const bulkLockType = lockData.lock_type ? (Array.isArray(lockData.lock_type) ? JSON.stringify(lockData.lock_type) : lockData.lock_type) : (lockData.scope_type === 'hierarchical' ? 'hierarchical' : 'all_department_objectives');
              request.input('lock_type', sql.NVarChar, bulkLockType);
              request.input('kpi', sql.NVarChar, lockData.kpi || null);
              request.input('department_id', sql.Int, lockData.department_id || null);
              request.input('department_objective_id', sql.Int, lockData.department_objective_id || null);
              request.input('exclude_monthly_target', sql.Bit, lockData.exclude_monthly_target || false);
              request.input('exclude_monthly_actual', sql.Bit, lockData.exclude_monthly_actual || false);
              request.input('exclude_annual_target', sql.Bit, lockData.exclude_annual_target || false);
              request.input('created_by', sql.Int, user.id);

              const result = await request.query(`
                INSERT INTO field_locks 
                (scope_type, user_scope, user_ids, kpi_scope, kpi_ids, objective_scope, objective_ids,
                 lock_annual_target, lock_monthly_target, lock_monthly_actual, lock_all_other_fields,
                 lock_add_objective, lock_delete_objective,
                 lock_type, kpi, department_id, department_objective_id, 
                 exclude_monthly_target, exclude_monthly_actual, exclude_annual_target, created_by)
                OUTPUT INSERTED.*
                VALUES 
                (@scope_type, @user_scope, @user_ids, @kpi_scope, @kpi_ids, @objective_scope, @objective_ids,
                 @lock_annual_target, @lock_monthly_target, @lock_monthly_actual, @lock_all_other_fields,
                 @lock_add_objective, @lock_delete_objective,
                 @lock_type, @kpi, @department_id, @department_objective_id,
                 @exclude_monthly_target, @exclude_monthly_actual, @exclude_annual_target, @created_by)
              `);
              results.push(result.recordset[0]);
            }

            // Log bulk creation
            await logActivity(pool, {
              user_id: user.id,
              username: user.username,
              action_type: 'lock_created',
              metadata: { bulk: true, count: results.length }
            });

            return {
              statusCode: 201,
              headers,
              body: JSON.stringify({ success: true, data: results })
            };
          } else if (operation === 'delete') {
            const ids = locks.map(id => parseInt(id)).filter(id => !isNaN(id));
            if (ids.length === 0) {
              return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'No valid IDs provided' })
              };
            }

            const request = pool.request();
            request.input('ids', sql.NVarChar, JSON.stringify(ids));

            await request.query(`
              UPDATE field_locks
              SET is_active = 0, updated_at = GETDATE()
              WHERE id IN (SELECT value FROM OPENJSON(@ids))
            `);

            // Log bulk deletion
            await logActivity(pool, {
              user_id: user.id,
              username: user.username,
              action_type: 'lock_deleted',
              metadata: { bulk: true, count: ids.length }
            });

            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, message: `${ids.length} locks deactivated` })
            };
          }
        }
      }

      // ========== OBJECTIVE DATA SOURCE MAPPING ENDPOINTS ==========
      if (resource === 'mappings') {
        // GET /api/config/mappings - Get all mappings
        if (method === 'GET' && !action) {
          const request = pool.request();
          const result = await request.query(`
            SELECT 
              m.department_objective_id,
              do.kpi,
              do.activity,
              do.department_id,
              d.name AS department_name,
              m.pms_project_name,
              m.pms_metric_name,
              m.target_source,
              m.actual_source,
              m.odoo_project_name,
              m.created_at,
              m.updated_at
            FROM objective_data_source_mapping m
            INNER JOIN department_objectives do ON m.department_objective_id = do.id
            LEFT JOIN departments d ON do.department_id = d.id
            ORDER BY do.department_id, do.kpi, do.activity
          `);

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: result.recordset })
          };
        }

        // GET /api/config/mappings/:department_objective_id - Get specific mapping
        if (method === 'GET' && id) {
          const request = pool.request();
          request.input('department_objective_id', sql.Int, id);
          const result = await request.query(`
            SELECT 
              m.department_objective_id,
              do.kpi,
              do.activity,
              do.department_id,
              d.name AS department_name,
              m.pms_project_name,
              m.pms_metric_name,
              m.target_source,
              m.actual_source,
              m.odoo_project_name,
              m.created_at,
              m.updated_at
            FROM objective_data_source_mapping m
            INNER JOIN department_objectives do ON m.department_objective_id = do.id
            LEFT JOIN departments d ON do.department_id = d.id
            WHERE m.department_objective_id = @department_objective_id
          `);

          if (result.recordset.length === 0) {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ success: false, error: 'Mapping not found' })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: result.recordset[0] })
          };
        }

        // PUT /api/config/mappings/:department_objective_id - Create or update mapping
        if (method === 'PUT' && id) {
          const body = JSON.parse(event.body || '{}');
          const {
            pms_project_name,
            pms_metric_name,
            target_source,
            actual_source,
            odoo_project_name
          } = body;

          // target_source: 'pms_target' = fill target from PMS; null/empty = manual
          const targetSourceValue = (target_source === 'pms_target') ? 'pms_target' : null;

          // actual_source: 'manual' | 'pms_actual' | 'odoo_services_done'
          if (!actual_source || !['manual', 'pms_actual', 'odoo_services_done'].includes(actual_source)) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'actual_source is required and must be "manual", "pms_actual", or "odoo_services_done"'
              })
            };
          }

          // Validate: if actual_source is 'odoo_services_done', odoo_project_name is required
          if (actual_source === 'odoo_services_done' && !odoo_project_name) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'odoo_project_name is required when actual_source is "odoo_services_done"'
              })
            };
          }

          // Validate: pms_project_name and pms_metric_name required when target from PMS or actual from PMS
          const needsPms = targetSourceValue === 'pms_target' || actual_source === 'pms_actual';
          if (needsPms && (!pms_project_name || !pms_metric_name)) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'pms_project_name and pms_metric_name are required when Target From is PMS or Actual From is PMS Actual'
              })
            };
          }

          const request = pool.request();
          request.input('department_objective_id', sql.Int, id);
          request.input('pms_project_name', sql.NVarChar, pms_project_name || null);
          request.input('pms_metric_name', sql.NVarChar, pms_metric_name || null);
          request.input('target_source', sql.NVarChar, targetSourceValue);
          request.input('actual_source', sql.NVarChar, actual_source);
          request.input('odoo_project_name', sql.NVarChar, odoo_project_name || null);

          // Use MERGE to handle both insert and update
          await request.query(`
            MERGE objective_data_source_mapping AS target
            USING (SELECT @department_objective_id AS department_objective_id) AS source
            ON target.department_objective_id = source.department_objective_id
            WHEN MATCHED THEN
              UPDATE SET
                pms_project_name = @pms_project_name,
                pms_metric_name = @pms_metric_name,
                target_source = @target_source,
                actual_source = @actual_source,
                odoo_project_name = @odoo_project_name,
                updated_at = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (department_objective_id, pms_project_name, pms_metric_name, target_source, actual_source, odoo_project_name, created_at, updated_at)
              VALUES (@department_objective_id, @pms_project_name, @pms_metric_name, @target_source, @actual_source, @odoo_project_name, GETDATE(), GETDATE());
          `);

          // Log activity
          await logActivity(pool, {
            user_id: user.id,
            username: user.username,
            action_type: 'update_mapping',
            target_field: 'objective_data_source_mapping',
            department_objective_id: id,
            metadata: { pms_project_name, pms_metric_name, target_source: targetSourceValue, actual_source, odoo_project_name }
          });

          // Return updated mapping
          const getRequest = pool.request();
          getRequest.input('department_objective_id', sql.Int, id);
          const getResult = await getRequest.query(`
            SELECT * FROM objective_data_source_mapping WHERE department_objective_id = @department_objective_id
          `);

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: getResult.recordset[0] })
          };
        }
      }

      // ========== ACTIVITY LOGS ENDPOINTS ==========
      if (resource === 'logs') {
        // GET /api/config/logs - Get logs with filters
        if (method === 'GET' && !action) {
          const params = event.queryStringParameters || {};
          const page = parseInt(params.page || '1');
          const limit = parseInt(params.limit || '50');
          const offset = (page - 1) * limit;

          console.log('[Logs API] Request received:', { params, page, limit, offset });

          const request = pool.request();
          request.input('user_id', sql.Int, params.user_id ? parseInt(params.user_id) : null);
          request.input('action_type', sql.NVarChar, params.action_type || null);
          request.input('date_from', sql.Date, params.date_from || null);
          request.input('date_to', sql.Date, params.date_to || null);
          request.input('kpi', sql.NVarChar, params.kpi || null);
          request.input('department_id', sql.Int, params.department_id ? parseInt(params.department_id) : null);
          request.input('search', sql.NVarChar, params.search || null);
          request.input('offset', sql.Int, offset);
          request.input('limit', sql.Int, limit);

          let whereClause = '1=1';
          if (params.user_id) whereClause += ' AND user_id = @user_id';
          if (params.action_type) whereClause += ' AND action_type = @action_type';
          if (params.date_from) whereClause += ' AND created_at >= @date_from';
          if (params.date_to) whereClause += ' AND created_at <= @date_to';
          if (params.kpi) whereClause += ' AND kpi LIKE @kpi';
          if (params.department_id) whereClause += ' AND department_id = @department_id';
          if (params.search) {
            whereClause += ` AND (username LIKE '%' + @search + '%' OR kpi LIKE '%' + @search + '%' OR department_name LIKE '%' + @search + '%')`;
          }

          console.log('[Logs API] Where clause:', whereClause);

          const query = `
            SELECT * FROM activity_logs
            WHERE ${whereClause}
            ORDER BY created_at DESC
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
          `;
          console.log('[Logs API] Executing query:', query);

          const result = await request.query(query);
          console.log('[Logs API] Query result:', { rowCount: result.recordset.length });

          const countResult = await request.query(`
            SELECT COUNT(*) as total FROM activity_logs WHERE ${whereClause}
          `);
          console.log('[Logs API] Total count:', countResult.recordset[0].total);

          const logs = result.recordset.map(log => ({
            ...log,
            metadata: log.metadata ? JSON.parse(log.metadata) : null
          }));

          const response = {
            success: true,
            data: logs,
            pagination: {
              page,
              limit,
              total: countResult.recordset[0].total,
              totalPages: Math.ceil(countResult.recordset[0].total / limit)
            }
          };

          console.log('[Logs API] Sending response:', { logsCount: logs.length, pagination: response.pagination });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
          };
        }

        // GET /api/config/logs/export - Export logs to CSV
        if (method === 'GET' && action === 'export') {
          const params = event.queryStringParameters || {};
          const request = pool.request();
          request.input('user_id', sql.Int, params.user_id ? parseInt(params.user_id) : null);
          request.input('action_type', sql.NVarChar, params.action_type || null);
          request.input('date_from', sql.Date, params.date_from || null);
          request.input('date_to', sql.Date, params.date_to || null);
          request.input('kpi', sql.NVarChar, params.kpi || null);
          request.input('department_id', sql.Int, params.department_id ? parseInt(params.department_id) : null);

          let whereClause = '1=1';
          if (params.user_id) whereClause += ' AND user_id = @user_id';
          if (params.action_type) whereClause += ' AND action_type = @action_type';
          if (params.date_from) whereClause += ' AND created_at >= @date_from';
          if (params.date_to) whereClause += ' AND created_at <= @date_to';
          if (params.kpi) whereClause += ' AND kpi LIKE @kpi';
          if (params.department_id) whereClause += ' AND department_id = @department_id';

          const result = await request.query(`
            SELECT * FROM activity_logs
            WHERE ${whereClause}
            ORDER BY created_at DESC
          `);

          // Convert to CSV format
          const csvHeaders = 'ID,User,Username,Action,Target Field,Old Value,New Value,KPI,Department,Department Objective,Month,Created At\n';
          const csvRows = result.recordset.map(log => {
            return [
              log.id,
              log.user_id,
              `"${log.username}"`,
              log.action_type,
              log.target_field || '',
              log.old_value || '',
              log.new_value || '',
              `"${log.kpi || ''}"`,
              `"${log.department_name || ''}"`,
              log.department_objective_id || '',
              log.month || '',
              log.created_at
            ].join(',');
          }).join('\n');

          return {
            statusCode: 200,
            headers: {
              ...headers,
              'Content-Type': 'text/csv',
              'Content-Disposition': 'attachment; filename="activity_logs.csv"'
            },
            body: csvHeaders + csvRows
          };
        }

        // GET /api/config/logs/stats - Get log statistics
        if (method === 'GET' && action === 'stats') {
          const request = pool.request();
          
          const totalResult = await request.query('SELECT COUNT(*) as total FROM activity_logs');
          const byActionResult = await request.query(`
            SELECT action_type, COUNT(*) as count
            FROM activity_logs
            GROUP BY action_type
          `);
          const byUserResult = await request.query(`
            SELECT user_id, username, COUNT(*) as count
            FROM activity_logs
            GROUP BY user_id, username
            ORDER BY count DESC
            OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY
          `);
          const recentResult = await request.query(`
            SELECT TOP 10 * FROM activity_logs
            ORDER BY created_at DESC
          `);

          const stats = {
            total_logs: totalResult.recordset[0].total,
            by_action_type: {},
            by_user: byUserResult.recordset.map(r => ({
              user_id: r.user_id,
              username: r.username,
              count: r.count
            })),
            recent_activity: recentResult.recordset.map(log => ({
              ...log,
              metadata: log.metadata ? JSON.parse(log.metadata) : null
            }))
          };

          byActionResult.recordset.forEach(r => {
            stats.by_action_type[r.action_type] = r.count;
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: stats })
          };
        }
      }

      // ========== USERS ENDPOINT (for dropdowns) ==========
      if (resource === 'users' && method === 'GET') {
        const request = pool.request();
        const result = await request.query(`
          SELECT id, username, role, is_active
          FROM users
          WHERE is_active = 1
          ORDER BY username
        `);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result.recordset })
        };
      }

      // ========== USER PERMISSIONS ENDPOINTS ==========
      if (resource === 'permissions') {
        // GET /api/config/permissions - Get all permissions
        if (method === 'GET' && !action) {
          const request = pool.request();
          const result = await request.query(`
            SELECT 
              up.*,
              u.username,
              d.name as department_name
            FROM user_permissions up
            LEFT JOIN users u ON up.user_id = u.id
            LEFT JOIN departments d ON up.department_id = d.id
            ORDER BY up.user_id, up.department_id, up.kpi
          `);

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: result.recordset })
          };
        }

        // GET /api/config/permissions/user/:userId - Get permissions for specific user
        if (method === 'GET' && action === 'user' && id) {
          const request = pool.request();
          request.input('user_id', sql.Int, parseInt(id));
          const result = await request.query(`
            SELECT 
              up.*,
              u.username,
              d.name as department_name
            FROM user_permissions up
            LEFT JOIN users u ON up.user_id = u.id
            LEFT JOIN departments d ON up.department_id = d.id
            WHERE up.user_id = @user_id
            ORDER BY up.department_id, up.kpi
          `);

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: result.recordset })
          };
        }

        // POST /api/config/permissions - Create/update permission
        if (method === 'POST' && !action) {
          const body = JSON.parse(event.body || '{}');
          const {
            user_id,
            department_id,
            kpi,
            can_view,
            can_edit_target,
            can_edit_monthly_target,
            can_edit_monthly_actual,
            can_view_reports
          } = body;

          if (!user_id) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'user_id is required' })
            };
          }

          const request = pool.request();
          request.input('user_id', sql.Int, user_id);
          request.input('department_id', sql.Int, department_id || null);
          request.input('kpi', sql.NVarChar, kpi || null);
          request.input('can_view', sql.Bit, can_view !== undefined ? can_view : true);
          request.input('can_edit_target', sql.Bit, can_edit_target || false);
          request.input('can_edit_monthly_target', sql.Bit, can_edit_monthly_target || false);
          request.input('can_edit_monthly_actual', sql.Bit, can_edit_monthly_actual || false);
          request.input('can_view_reports', sql.Bit, can_view_reports || false);

          // Check if permission already exists
          const checkRequest = pool.request();
          checkRequest.input('user_id', sql.Int, user_id);
          checkRequest.input('department_id', sql.Int, department_id || null);
          checkRequest.input('kpi', sql.NVarChar, kpi || null);
          const existing = await checkRequest.query(`
            SELECT id FROM user_permissions
            WHERE user_id = @user_id 
              AND (department_id = @department_id OR (department_id IS NULL AND @department_id IS NULL))
              AND (kpi = @kpi OR (kpi IS NULL AND @kpi IS NULL))
          `);

          let result;
          if (existing.recordset.length > 0) {
            // Update existing
            request.input('id', sql.Int, existing.recordset[0].id);
            result = await request.query(`
              UPDATE user_permissions
              SET 
                can_view = @can_view,
                can_edit_target = @can_edit_target,
                can_edit_monthly_target = @can_edit_monthly_target,
                can_edit_monthly_actual = @can_edit_monthly_actual,
                can_view_reports = @can_view_reports,
                updated_at = GETDATE()
              OUTPUT INSERTED.*
              WHERE id = @id
            `);
          } else {
            // Insert new
            result = await request.query(`
              INSERT INTO user_permissions
              (user_id, department_id, kpi, can_view, can_edit_target, can_edit_monthly_target, can_edit_monthly_actual, can_view_reports)
              OUTPUT INSERTED.*
              VALUES
              (@user_id, @department_id, @kpi, @can_view, @can_edit_target, @can_edit_monthly_target, @can_edit_monthly_actual, @can_view_reports)
            `);
          }

          // Log activity
          await logActivity(pool, {
            user_id: user.id,
            username: user.username,
            action_type: existing.recordset.length > 0 ? 'permission_updated' : 'permission_created',
            metadata: { permission_id: result.recordset[0].id, target_user_id: user_id }
          });

          return {
            statusCode: existing.recordset.length > 0 ? 200 : 201,
            headers,
            body: JSON.stringify({ success: true, data: result.recordset[0] })
          };
        }

        // DELETE /api/config/permissions/:id - Delete permission
        if (method === 'DELETE' && id) {
          const request = pool.request();
          request.input('id', sql.Int, id);

          const result = await request.query(`
            DELETE FROM user_permissions
            OUTPUT DELETED.*
            WHERE id = @id
          `);

          if (result.recordset.length === 0) {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ success: false, error: 'Permission not found' })
            };
          }

          // Log activity
          await logActivity(pool, {
            user_id: user.id,
            username: user.username,
            action_type: 'permission_deleted',
            metadata: { permission_id: id }
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Permission deleted' })
          };
        }

        // POST /api/config/permissions/bulk - Bulk update permissions
        if (method === 'POST' && action === 'bulk') {
          const body = JSON.parse(event.body || '{}');
          const { permissions } = body; // Array of permission objects

          if (!Array.isArray(permissions)) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ success: false, error: 'permissions must be an array' })
            };
          }

          const results = [];
          for (const perm of permissions) {
            const request = pool.request();
            request.input('user_id', sql.Int, perm.user_id);
            request.input('department_id', sql.Int, perm.department_id || null);
            request.input('kpi', sql.NVarChar, perm.kpi || null);
            request.input('can_view', sql.Bit, perm.can_view !== undefined ? perm.can_view : true);
            request.input('can_edit_target', sql.Bit, perm.can_edit_target || false);
            request.input('can_edit_monthly_target', sql.Bit, perm.can_edit_monthly_target || false);
            request.input('can_edit_monthly_actual', sql.Bit, perm.can_edit_monthly_actual || false);
            request.input('can_view_reports', sql.Bit, perm.can_view_reports || false);

            // Check if exists
            const checkRequest = pool.request();
            checkRequest.input('user_id', sql.Int, perm.user_id);
            checkRequest.input('department_id', sql.Int, perm.department_id || null);
            checkRequest.input('kpi', sql.NVarChar, perm.kpi || null);
            const existing = await checkRequest.query(`
              SELECT id FROM user_permissions
              WHERE user_id = @user_id 
                AND (department_id = @department_id OR (department_id IS NULL AND @department_id IS NULL))
                AND (kpi = @kpi OR (kpi IS NULL AND @kpi IS NULL))
            `);

            let result;
            if (existing.recordset.length > 0) {
              request.input('id', sql.Int, existing.recordset[0].id);
              result = await request.query(`
                UPDATE user_permissions
                SET 
                  can_view = @can_view,
                  can_edit_target = @can_edit_target,
                  can_edit_monthly_target = @can_edit_monthly_target,
                  can_edit_monthly_actual = @can_edit_monthly_actual,
                  can_view_reports = @can_view_reports,
                  updated_at = GETDATE()
                OUTPUT INSERTED.*
                WHERE id = @id
              `);
            } else {
              result = await request.query(`
                INSERT INTO user_permissions
                (user_id, department_id, kpi, can_view, can_edit_target, can_edit_monthly_target, can_edit_monthly_actual, can_view_reports)
                OUTPUT INSERTED.*
                VALUES
                (@user_id, @department_id, @kpi, @can_view, @can_edit_target, @can_edit_monthly_target, @can_edit_monthly_actual, @can_view_reports)
              `);
            }
            results.push(result.recordset[0]);
          }

          // Log bulk update
          await logActivity(pool, {
            user_id: user.id,
            username: user.username,
            action_type: 'permission_updated',
            metadata: { bulk: true, count: results.length }
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: results })
          };
        }
      }

      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Endpoint not found' })
      };

    } catch (error) {
      logger.error('Config API error', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: error.message || 'Internal server error'
        })
      };
    }
  })
);

module.exports = { handler };
