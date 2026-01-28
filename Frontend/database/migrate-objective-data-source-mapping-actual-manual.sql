-- Allow actual_source = 'manual' (edit actual value manually; default for new mappings)
-- Existing CHECK: actual_source IN ('pms_actual', 'odoo_services_done')
-- New CHECK: actual_source IN ('manual', 'pms_actual', 'odoo_services_done')

DECLARE @ConstraintName NVARCHAR(200);

SELECT @ConstraintName = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID(N'[dbo].[objective_data_source_mapping]')
  AND definition LIKE N'%actual_source%';

IF @ConstraintName IS NOT NULL
BEGIN
  EXEC('ALTER TABLE [dbo].[objective_data_source_mapping] DROP CONSTRAINT [' + @ConstraintName + ']');
  PRINT 'Dropped existing actual_source check constraint';
END

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'[dbo].[objective_data_source_mapping]')
    AND name = 'CK_objective_data_source_mapping_actual_source'
)
BEGIN
  ALTER TABLE [dbo].[objective_data_source_mapping]
  ADD CONSTRAINT CK_objective_data_source_mapping_actual_source
  CHECK ([actual_source] IN ('manual', 'pms_actual', 'odoo_services_done'));
  PRINT 'Added actual_source check constraint including manual';
END
