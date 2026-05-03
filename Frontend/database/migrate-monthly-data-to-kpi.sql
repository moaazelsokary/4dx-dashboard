-- Migration script to change department_monthly_data to link with KPI instead of department_objective_id
-- This allows monthly data to be tracked per KPI and department combination

-- Step 1: Add new columns
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_monthly_data]') AND name = 'kpi')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    ADD [kpi] NVARCHAR(500) NULL,
        [department_id] INT NULL;
END;
GO

-- Step 2: Populate new columns from existing data
UPDATE dmd
SET dmd.kpi = do.kpi,
    dmd.department_id = do.department_id
FROM [dbo].[department_monthly_data] dmd
INNER JOIN [dbo].[department_objectives] do ON dmd.department_objective_id = do.id
WHERE dmd.kpi IS NULL;
GO

-- Step 3: Make new columns NOT NULL
ALTER TABLE [dbo].[department_monthly_data]
ALTER COLUMN [kpi] NVARCHAR(500) NOT NULL;
GO

ALTER TABLE [dbo].[department_monthly_data]
ALTER COLUMN [department_id] INT NOT NULL;
GO

-- Step 4: Add foreign key for department_id
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_department_monthly_data_department_id')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    ADD CONSTRAINT FK_department_monthly_data_department_id
    FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments]([id]) ON DELETE CASCADE;
END;
GO

-- Step 5: Drop old foreign key and column
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_department_monthly_data_department_objective_id')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    DROP CONSTRAINT FK_department_monthly_data_department_objective_id;
END;
GO

-- Step 6: Update unique constraint to use KPI and department instead
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ__departme__UNIQUE_DEPT_OBJ_MONTH')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    DROP CONSTRAINT UQ__departme__UNIQUE_DEPT_OBJ_MONTH;
END;
GO

-- Create new unique constraint
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_department_monthly_data_kpi_dept_month')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    ADD CONSTRAINT UQ_department_monthly_data_kpi_dept_month
    UNIQUE ([kpi], [department_id], [month]);
END;
GO

-- Step 7: Drop old column (optional - keep for now for backward compatibility)
-- ALTER TABLE [dbo].[department_monthly_data]
-- DROP COLUMN [department_objective_id];
-- GO

-- Step 8: Create indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_department_monthly_data_kpi')
BEGIN
    CREATE INDEX IX_department_monthly_data_kpi ON [dbo].[department_monthly_data]([kpi]);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_department_monthly_data_department_id')
BEGIN
    CREATE INDEX IX_department_monthly_data_department_id ON [dbo].[department_monthly_data]([department_id]);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_department_monthly_data_kpi_dept')
BEGIN
    CREATE INDEX IX_department_monthly_data_kpi_dept ON [dbo].[department_monthly_data]([kpi], [department_id]);
END;
GO

PRINT 'Migration completed: department_monthly_data now links with KPI and department_id';

