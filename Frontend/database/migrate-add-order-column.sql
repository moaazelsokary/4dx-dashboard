-- Migration: Add order column to department_objectives table
-- Date: 2024
-- Description: Adds order column to store row arrangement/ordering

-- Check if column already exists before adding
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'sort_order')
BEGIN
    -- First, add the column
    ALTER TABLE [dbo].[department_objectives]
    ADD [sort_order] INT NULL;
END
GO

-- Initialize sort_order with current ID values to preserve existing order (only if column was just added)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'sort_order')
BEGIN
    -- Only update if sort_order is NULL (newly added column)
    UPDATE [dbo].[department_objectives]
    SET [sort_order] = [id]
    WHERE [sort_order] IS NULL;
END
GO

-- Create index for better performance when ordering (only if it doesn't exist)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_department_objectives_sort_order' AND object_id = OBJECT_ID(N'[dbo].[department_objectives]'))
BEGIN
    CREATE INDEX IX_department_objectives_sort_order ON [dbo].[department_objectives]([sort_order]);
END
GO

