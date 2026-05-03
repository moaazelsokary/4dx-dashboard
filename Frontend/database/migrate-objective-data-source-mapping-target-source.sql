-- Add target_source to objective_data_source_mapping
-- target_source: 'pms_target' = fill monthly target from PMS; NULL = manual (user edits)

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[dbo].[objective_data_source_mapping]')
  AND name = 'target_source'
)
BEGIN
  ALTER TABLE [dbo].[objective_data_source_mapping]
  ADD [target_source] NVARCHAR(50) NULL;

  PRINT 'Added target_source column to objective_data_source_mapping';
END
ELSE
BEGIN
  PRINT 'target_source column already exists';
END;
GO

-- Add constraint in a separate batch so the new column is visible
IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = 'CK_objective_data_source_mapping_target_source'
)
BEGIN
  ALTER TABLE [dbo].[objective_data_source_mapping]
  ADD CONSTRAINT CK_objective_data_source_mapping_target_source
  CHECK ([target_source] IS NULL OR [target_source] = 'pms_target');

  PRINT 'Added target_source check constraint';
END
ELSE
BEGIN
  PRINT 'target_source check constraint already exists';
END;
