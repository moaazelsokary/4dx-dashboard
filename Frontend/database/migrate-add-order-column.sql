-- Migration: Add order column to department_objectives table
-- Date: 2024
-- Description: Adds order column to store row arrangement/ordering

-- Check if column already exists before adding
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'sort_order')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [sort_order] INT NULL;
    
    -- Initialize sort_order with current ID values to preserve existing order
    UPDATE [dbo].[department_objectives]
    SET [sort_order] = [id];
    
    -- Create index for better performance when ordering
    CREATE INDEX IX_department_objectives_sort_order ON [dbo].[department_objectives]([sort_order]);
END
GO

