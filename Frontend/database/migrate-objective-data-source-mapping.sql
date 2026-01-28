-- Migration: Create objective_data_source_mapping table
-- This table stores per-objective mapping to PMS/Odoo data sources for locked values

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[objective_data_source_mapping]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[objective_data_source_mapping] (
        [department_objective_id] INT PRIMARY KEY,
        [pms_project_name] NVARCHAR(255) NULL,
        [pms_metric_name] NVARCHAR(255) NULL,
        [actual_source] NVARCHAR(50) NOT NULL CHECK ([actual_source] IN ('pms_actual', 'odoo_services_done')),
        [odoo_project_name] NVARCHAR(255) NULL, -- Used only when actual_source = 'odoo_services_done'
        [created_at] DATETIME NOT NULL DEFAULT GETDATE(),
        [updated_at] DATETIME NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY ([department_objective_id]) REFERENCES [dbo].[department_objectives]([id]) ON DELETE CASCADE
    );
    
    -- Indexes for fast lookups
    CREATE INDEX IX_objective_data_source_mapping_pms_project ON [dbo].[objective_data_source_mapping]([pms_project_name]);
    CREATE INDEX IX_objective_data_source_mapping_pms_metric ON [dbo].[objective_data_source_mapping]([pms_metric_name]);
    CREATE INDEX IX_objective_data_source_mapping_odoo_project ON [dbo].[objective_data_source_mapping]([odoo_project_name]);
    CREATE INDEX IX_objective_data_source_mapping_actual_source ON [dbo].[objective_data_source_mapping]([actual_source]);
    
    PRINT 'Created objective_data_source_mapping table';
END
ELSE
BEGIN
    PRINT 'objective_data_source_mapping table already exists';
END;

-- Add updated_at trigger
IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_objective_data_source_mapping_updated_at')
BEGIN
    EXEC('
    CREATE TRIGGER TR_objective_data_source_mapping_updated_at
    ON [dbo].[objective_data_source_mapping]
    AFTER UPDATE
    AS
    BEGIN
        UPDATE [dbo].[objective_data_source_mapping]
        SET [updated_at] = GETDATE()
        WHERE [department_objective_id] IN (SELECT [department_objective_id] FROM inserted);
    END;
    ');
    PRINT 'Created updated_at trigger for objective_data_source_mapping';
END
ELSE
BEGIN
    PRINT 'updated_at trigger for objective_data_source_mapping already exists';
END;
