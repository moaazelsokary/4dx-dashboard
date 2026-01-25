-- Follow-up Migration: Fix and complete hierarchical lock rule structure
-- This script should be run AFTER migrate-new-lock-rule-structure.sql
-- It fixes issues from the original migration and ensures all records are properly migrated
-- Date: 2025-01-24

PRINT 'Starting follow-up migration fixes...';
GO

-- Step 1: Update scope_type to 'hierarchical' for records that were migrated but still have old scope_type
-- This handles the case where the original migration didn't update scope_type
UPDATE field_locks
SET scope_type = 'hierarchical'
WHERE scope_type IN ('all_users', 'specific_users', 'specific_kpi', 'department_kpi', 'all_department_objectives', 'specific_objective')
  AND (user_scope IS NOT NULL OR kpi_scope IS NOT NULL OR objective_scope IS NOT NULL);
GO

PRINT 'Step 1: Updated scope_type to hierarchical for migrated records';
GO

-- Step 2: Fix JSON formatting for kpi_ids if needed
-- The original migration used JSON_QUERY which might not work correctly
-- We need to ensure kpi_ids is a proper JSON array
UPDATE field_locks
SET kpi_ids = CASE 
    -- If kpi_ids exists but doesn't start with '[', wrap it in array
    WHEN kpi_ids IS NOT NULL AND kpi_ids NOT LIKE '[%' THEN '["' + REPLACE(REPLACE(kpi_ids, '"', '\"'), '''', '''''') + '"]'
    -- If kpi exists but kpi_ids is NULL, create array from kpi
    WHEN kpi IS NOT NULL AND (kpi_ids IS NULL OR kpi_ids = '') THEN '["' + REPLACE(REPLACE(kpi, '"', '\"'), '''', '''''') + '"]'
    ELSE kpi_ids
END
WHERE (kpi_ids IS NOT NULL AND kpi_ids NOT LIKE '[%') 
   OR (kpi IS NOT NULL AND (kpi_ids IS NULL OR kpi_ids = ''));
GO

PRINT 'Step 2: Fixed kpi_ids JSON formatting';
GO

-- Step 3: Fix JSON formatting for objective_ids if needed
UPDATE field_locks
SET objective_ids = CASE 
    -- If objective_ids exists but doesn't start with '[', wrap it in array
    WHEN objective_ids IS NOT NULL AND objective_ids NOT LIKE '[%' THEN '[' + objective_ids + ']'
    -- If department_objective_id exists but objective_ids is NULL, create array from it
    WHEN department_objective_id IS NOT NULL AND (objective_ids IS NULL OR objective_ids = '') THEN '[' + CAST(department_objective_id AS NVARCHAR) + ']'
    ELSE objective_ids
END
WHERE (objective_ids IS NOT NULL AND objective_ids NOT LIKE '[%')
   OR (department_objective_id IS NOT NULL AND (objective_ids IS NULL OR objective_ids = ''));
GO

PRINT 'Step 3: Fixed objective_ids JSON formatting';
GO

-- Step 4: Ensure all migrated records have scope_type = 'hierarchical'
-- Handle any edge cases where scope_type might be NULL
UPDATE field_locks
SET scope_type = 'hierarchical'
WHERE scope_type IS NULL 
  AND (user_scope IS NOT NULL OR kpi_scope IS NOT NULL OR objective_scope IS NOT NULL);
GO

PRINT 'Step 4: Set scope_type for any NULL records';
GO

-- Step 5: Verify migration status
PRINT 'Step 5: Migration verification...';
SELECT 
    COUNT(*) as total_locks,
    SUM(CASE WHEN scope_type = 'hierarchical' THEN 1 ELSE 0 END) as hierarchical_locks,
    SUM(CASE WHEN scope_type IN ('all_users', 'specific_users', 'specific_kpi', 'department_kpi', 'all_department_objectives', 'specific_objective') THEN 1 ELSE 0 END) as legacy_locks,
    SUM(CASE WHEN user_scope IS NOT NULL THEN 1 ELSE 0 END) as has_user_scope,
    SUM(CASE WHEN kpi_scope IS NOT NULL THEN 1 ELSE 0 END) as has_kpi_scope,
    SUM(CASE WHEN objective_scope IS NOT NULL THEN 1 ELSE 0 END) as has_objective_scope,
    SUM(CASE WHEN lock_annual_target = 1 THEN 1 ELSE 0 END) as has_annual_target_lock,
    SUM(CASE WHEN lock_add_objective = 1 THEN 1 ELSE 0 END) as has_add_objective_lock,
    SUM(CASE WHEN lock_delete_objective = 1 THEN 1 ELSE 0 END) as has_delete_objective_lock
FROM field_locks;
GO

PRINT 'Follow-up migration completed successfully!';
PRINT 'Please review the verification query results above to ensure all records were migrated correctly.';
