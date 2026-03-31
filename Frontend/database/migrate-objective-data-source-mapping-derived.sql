-- Add support for derived metrics in data source mapping
-- derived_project_name: project name from derived_metrics (used when target_source or actual_source = 'derived')
-- target_source: allow 'derived'; actual_source: allow 'derived'

-- Add derived_project_name column
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[dbo].[objective_data_source_mapping]')
  AND name = 'derived_project_name'
)
BEGIN
  ALTER TABLE [dbo].[objective_data_source_mapping]
  ADD [derived_project_name] NVARCHAR(255) NULL;
  PRINT 'Added derived_project_name column to objective_data_source_mapping';
END
ELSE
BEGIN
  PRINT 'derived_project_name column already exists';
END;
GO

-- Update target_source constraint to allow 'derived'
DECLARE @TargetConstraintName NVARCHAR(200);
SELECT @TargetConstraintName = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID(N'[dbo].[objective_data_source_mapping]')
  AND name = 'CK_objective_data_source_mapping_target_source';

IF @TargetConstraintName IS NOT NULL
BEGIN
  EXEC('ALTER TABLE [dbo].[objective_data_source_mapping] DROP CONSTRAINT [' + @TargetConstraintName + ']');
  PRINT 'Dropped target_source check constraint';
END

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'[dbo].[objective_data_source_mapping]')
    AND name = 'CK_objective_data_source_mapping_target_source'
)
BEGIN
  ALTER TABLE [dbo].[objective_data_source_mapping]
  ADD CONSTRAINT CK_objective_data_source_mapping_target_source
  CHECK ([target_source] IS NULL OR [target_source] IN ('pms_target', 'derived'));
  PRINT 'Added target_source check constraint including derived';
END;
GO

-- Update actual_source constraint to allow 'derived'
DECLARE @ActualConstraintName NVARCHAR(200);
SELECT @ActualConstraintName = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID(N'[dbo].[objective_data_source_mapping]')
  AND definition LIKE N'%actual_source%';

IF @ActualConstraintName IS NOT NULL
BEGIN
  EXEC('ALTER TABLE [dbo].[objective_data_source_mapping] DROP CONSTRAINT [' + @ActualConstraintName + ']');
  PRINT 'Dropped actual_source check constraint';
END

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'[dbo].[objective_data_source_mapping]')
    AND name = 'CK_objective_data_source_mapping_actual_source'
)
BEGIN
  ALTER TABLE [dbo].[objective_data_source_mapping]
  ADD CONSTRAINT CK_objective_data_source_mapping_actual_source
  CHECK ([actual_source] IN ('manual', 'pms_actual', 'odoo_services_done', 'odoo_services_created', 'derived'));
  PRINT 'Added actual_source check constraint including derived';
END;
