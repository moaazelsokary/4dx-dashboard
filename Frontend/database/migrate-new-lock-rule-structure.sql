-- Migration: Redesign lock rule structure to support hierarchical selection
-- Users -> KPIs -> Objectives with field-level locking
-- Date: 2025-01-24

-- Step 1: Add new columns to field_locks table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'user_scope')
BEGIN
    ALTER TABLE field_locks 
    ADD user_scope NVARCHAR(20) NOT NULL DEFAULT 'all'; -- 'all', 'specific', 'none'
    PRINT 'Added user_scope column';
END
ELSE
BEGIN
    PRINT 'user_scope column already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'kpi_scope')
BEGIN
    ALTER TABLE field_locks 
    ADD kpi_scope NVARCHAR(20) NOT NULL DEFAULT 'all'; -- 'all', 'specific', 'none'
    PRINT 'Added kpi_scope column';
END
ELSE
BEGIN
    PRINT 'kpi_scope column already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'objective_scope')
BEGIN
    ALTER TABLE field_locks 
    ADD objective_scope NVARCHAR(20) NOT NULL DEFAULT 'all'; -- 'all', 'specific', 'none'
    PRINT 'Added objective_scope column';
END
ELSE
BEGIN
    PRINT 'objective_scope column already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'kpi_ids')
BEGIN
    ALTER TABLE field_locks 
    ADD kpi_ids NVARCHAR(MAX) NULL; -- JSON array of KPI strings
    PRINT 'Added kpi_ids column';
END
ELSE
BEGIN
    PRINT 'kpi_ids column already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'objective_ids')
BEGIN
    ALTER TABLE field_locks 
    ADD objective_ids NVARCHAR(MAX) NULL; -- JSON array of objective IDs
    PRINT 'Added objective_ids column';
END
ELSE
BEGIN
    PRINT 'objective_ids column already exists';
END
GO

-- Step 2: Add new lock field columns
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'lock_annual_target')
BEGIN
    ALTER TABLE field_locks 
    ADD lock_annual_target BIT NOT NULL DEFAULT 0;
    PRINT 'Added lock_annual_target column';
END
ELSE
BEGIN
    PRINT 'lock_annual_target column already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'lock_monthly_target')
BEGIN
    ALTER TABLE field_locks 
    ADD lock_monthly_target BIT NOT NULL DEFAULT 0;
    PRINT 'Added lock_monthly_target column';
END
ELSE
BEGIN
    PRINT 'lock_monthly_target column already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'lock_monthly_actual')
BEGIN
    ALTER TABLE field_locks 
    ADD lock_monthly_actual BIT NOT NULL DEFAULT 0;
    PRINT 'Added lock_monthly_actual column';
END
ELSE
BEGIN
    PRINT 'lock_monthly_actual column already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'lock_all_other_fields')
BEGIN
    ALTER TABLE field_locks 
    ADD lock_all_other_fields BIT NOT NULL DEFAULT 0; -- activity, responsible_person, mov, etc.
    PRINT 'Added lock_all_other_fields column';
END
ELSE
BEGIN
    PRINT 'lock_all_other_fields column already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'lock_add_objective')
BEGIN
    ALTER TABLE field_locks 
    ADD lock_add_objective BIT NOT NULL DEFAULT 0;
    PRINT 'Added lock_add_objective column';
END
ELSE
BEGIN
    PRINT 'lock_add_objective column already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'lock_delete_objective')
BEGIN
    ALTER TABLE field_locks 
    ADD lock_delete_objective BIT NOT NULL DEFAULT 0;
    PRINT 'Added lock_delete_objective column';
END
ELSE
BEGIN
    PRINT 'lock_delete_objective column already exists';
END
GO

-- Step 3: Migrate existing data (if any)
-- Map old scope_type to new structure
-- Only migrate if columns have default values (not yet migrated)
UPDATE field_locks
SET 
    scope_type = 'hierarchical',
    user_scope = CASE 
        WHEN scope_type = 'all_users' OR scope_type = 'all_department_objectives' THEN 'all'
        WHEN scope_type = 'specific_users' THEN 'specific'
        ELSE 'all'
    END,
    kpi_scope = CASE 
        WHEN scope_type = 'specific_kpi' OR scope_type = 'department_kpi' THEN 'specific'
        ELSE 'all'
    END,
    objective_scope = CASE 
        WHEN scope_type = 'specific_objective' THEN 'specific'
        ELSE 'all'
    END,
    kpi_ids = CASE 
        WHEN kpi IS NOT NULL THEN '["' + REPLACE(REPLACE(kpi, '"', '\"'), '''', '''''') + '"]'
        ELSE NULL
    END,
    objective_ids = CASE 
        WHEN department_objective_id IS NOT NULL THEN '[' + CAST(department_objective_id AS NVARCHAR) + ']'
        ELSE NULL
    END,
    lock_annual_target = CASE 
        WHEN lock_type LIKE '%target%' OR lock_type = 'all_department_objectives' THEN 1
        ELSE 0
    END,
    lock_monthly_target = CASE 
        WHEN lock_type LIKE '%monthly_target%' OR lock_type = 'all_department_objectives' THEN 1
        ELSE 0
    END,
    lock_monthly_actual = CASE 
        WHEN lock_type LIKE '%monthly_actual%' OR lock_type = 'all_department_objectives' THEN 1
        ELSE 0
    END,
    lock_all_other_fields = CASE 
        WHEN lock_type = 'all_department_objectives' THEN 1
        ELSE 0
    END
WHERE (user_scope IS NULL OR user_scope = 'all') 
  AND (scope_type IS NULL OR scope_type != 'hierarchical'); -- Only migrate if not already migrated
GO

-- Step 4: Add indexes for performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_field_locks_user_scope' AND object_id = OBJECT_ID('field_locks'))
BEGIN
    CREATE INDEX IX_field_locks_user_scope ON field_locks(user_scope);
    PRINT 'Created index IX_field_locks_user_scope';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_field_locks_kpi_scope' AND object_id = OBJECT_ID('field_locks'))
BEGIN
    CREATE INDEX IX_field_locks_kpi_scope ON field_locks(kpi_scope);
    PRINT 'Created index IX_field_locks_kpi_scope';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_field_locks_objective_scope' AND object_id = OBJECT_ID('field_locks'))
BEGIN
    CREATE INDEX IX_field_locks_objective_scope ON field_locks(objective_scope);
    PRINT 'Created index IX_field_locks_objective_scope';
END
GO

PRINT 'Migration completed successfully';
