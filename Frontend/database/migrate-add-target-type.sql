-- Migration: Add target_type column to department_objectives table
-- Date: 2024
-- Description: Adds target_type column to support Number vs Percentage display

-- Check if column already exists before adding
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'target_type')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [target_type] NVARCHAR(20) NULL DEFAULT 'number' CHECK ([target_type] IN ('number', 'percentage'));
    
    -- Set default value for existing records
    UPDATE [dbo].[department_objectives]
    SET [target_type] = 'number'
    WHERE [target_type] IS NULL;
END
GO

