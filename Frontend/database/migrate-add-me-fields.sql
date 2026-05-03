-- Migration: Add M&E fields to department_objectives table
-- Date: 2024
-- Description: Adds comprehensive M&E tracking fields to department_objectives table

-- Check if columns already exist before adding
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'me_target')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [me_target] DECIMAL(18,2) NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'me_actual')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [me_actual] DECIMAL(18,2) NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'me_frequency')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [me_frequency] NVARCHAR(50) NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'me_start_date')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [me_start_date] DATE NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'me_end_date')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [me_end_date] DATE NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'me_tool')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [me_tool] NVARCHAR(255) NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'me_responsible')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [me_responsible] NVARCHAR(255) NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND name = 'me_folder_link')
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    ADD [me_folder_link] NVARCHAR(500) NULL;
END

