-- Migration script to change department_monthly_data to link with department_objective_id
-- This ensures each objective has unique calendar values independent of KPI

-- Step 1: Ensure department_objective_id column exists and is NOT NULL
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_monthly_data]') AND name = 'department_objective_id')
BEGIN
    -- Update NULL values if any exist
    UPDATE dmd
    SET dmd.department_objective_id = do.id
    FROM [dbo].[department_monthly_data] dmd
    INNER JOIN [dbo].[department_objectives] do 
        ON dmd.kpi = do.kpi AND dmd.department_id = do.department_id
    WHERE dmd.department_objective_id IS NULL;
    
    -- Make it NOT NULL if it's currently nullable
    IF EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[department_monthly_data]') 
        AND name = 'department_objective_id' 
        AND is_nullable = 1
    )
    BEGIN
        ALTER TABLE [dbo].[department_monthly_data]
        ALTER COLUMN [department_objective_id] INT NOT NULL;
    END;
END
ELSE
BEGIN
    -- Add column if it doesn't exist
    ALTER TABLE [dbo].[department_monthly_data]
    ADD [department_objective_id] INT NULL;
    
    -- Populate from existing data
    UPDATE dmd
    SET dmd.department_objective_id = do.id
    FROM [dbo].[department_monthly_data] dmd
    INNER JOIN [dbo].[department_objectives] do 
        ON dmd.kpi = do.kpi AND dmd.department_id = do.department_id
    WHERE dmd.department_objective_id IS NULL;
    
    -- Make it NOT NULL
    ALTER TABLE [dbo].[department_monthly_data]
    ALTER COLUMN [department_objective_id] INT NOT NULL;
END;
GO

-- Step 2: Add foreign key constraint if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_department_monthly_data_department_objective_id')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    ADD CONSTRAINT FK_department_monthly_data_department_objective_id
    FOREIGN KEY ([department_objective_id]) REFERENCES [dbo].[department_objectives]([id]) ON DELETE CASCADE;
END;
GO

-- Step 3: Drop old unique constraint that uses KPI and department
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_department_monthly_data_kpi_dept_month')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    DROP CONSTRAINT UQ_department_monthly_data_kpi_dept_month;
END;
GO

-- Step 4: Create new unique constraint using department_objective_id
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_department_monthly_data_dept_obj_month')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    ADD CONSTRAINT UQ_department_monthly_data_dept_obj_month
    UNIQUE ([department_objective_id], [month]);
END;
GO

-- Step 5: Create index on department_objective_id if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_department_monthly_data_dept_obj_id')
BEGIN
    CREATE INDEX IX_department_monthly_data_dept_obj_id 
    ON [dbo].[department_monthly_data]([department_objective_id]);
END;
GO

-- Step 6: Keep kpi and department_id columns for reference (optional - can be removed if not needed)
-- They remain in the table but are no longer part of the unique constraint

PRINT 'Migration completed: department_monthly_data now uses (department_objective_id, month) for unique calendar values';
