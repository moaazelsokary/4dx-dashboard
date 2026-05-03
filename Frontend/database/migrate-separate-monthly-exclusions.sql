-- Migration: Separate Monthly Exclusions
-- Changes exclude_monthly (1 column) to exclude_monthly_target and exclude_monthly_actual (2 columns)
-- This allows independent control over monthly target and monthly actual locks

-- Step 1: Add new columns
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'exclude_monthly_target')
BEGIN
    ALTER TABLE field_locks ADD exclude_monthly_target BIT NOT NULL DEFAULT 0;
    PRINT 'Added exclude_monthly_target column';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'exclude_monthly_actual')
BEGIN
    ALTER TABLE field_locks ADD exclude_monthly_actual BIT NOT NULL DEFAULT 0;
    PRINT 'Added exclude_monthly_actual column';
END

-- Step 2: Migrate existing data
-- If exclude_monthly = 1, set both new columns to 1
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'exclude_monthly')
BEGIN
    UPDATE field_locks 
    SET exclude_monthly_target = exclude_monthly,
        exclude_monthly_actual = exclude_monthly
    WHERE exclude_monthly = 1;
    
    PRINT 'Migrated existing exclude_monthly data to new columns';
END

-- Step 3: Drop old column
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('field_locks') AND name = 'exclude_monthly')
BEGIN
    ALTER TABLE field_locks DROP COLUMN exclude_monthly;
    PRINT 'Dropped old exclude_monthly column';
END

PRINT 'Migration completed successfully!';

-- Verify the changes
SELECT 
    id, 
    lock_type, 
    scope_type,
    exclude_monthly_target,
    exclude_monthly_actual,
    exclude_annual_target
FROM field_locks
WHERE is_active = 1;
