-- Migration: Create pms_odoo_cache table for storing merged PMS and Odoo data
-- This table is populated by the scheduled sync function and read by metrics-api

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[pms_odoo_cache]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[pms_odoo_cache] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [source] NVARCHAR(10) NOT NULL CHECK ([source] IN ('pms', 'odoo')),
        [project_name] NVARCHAR(255) NOT NULL,
        [metric_name] NVARCHAR(255) NULL, -- NULL for Odoo rows
        [month] NVARCHAR(7) NOT NULL, -- Format: YYYY-MM
        [target_value] DECIMAL(18,2) NULL, -- PMS Target
        [actual_value] DECIMAL(18,2) NULL, -- PMS Actual
        [services_created] INT NULL, -- Odoo ServicesCreated
        [services_done] INT NULL, -- Odoo ServicesDone
        [updated_at] DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_pms_odoo_cache_source_project_metric_month UNIQUE ([source], [project_name], [metric_name], [month])
    );
    
    -- Indexes for fast queries
    CREATE INDEX IX_pms_odoo_cache_source ON [dbo].[pms_odoo_cache]([source]);
    CREATE INDEX IX_pms_odoo_cache_project_name ON [dbo].[pms_odoo_cache]([project_name]);
    CREATE INDEX IX_pms_odoo_cache_month ON [dbo].[pms_odoo_cache]([month]);
    CREATE INDEX IX_pms_odoo_cache_source_project_month ON [dbo].[pms_odoo_cache]([source], [project_name], [month]);
    
    PRINT 'Created pms_odoo_cache table';
END
ELSE
BEGIN
    PRINT 'pms_odoo_cache table already exists';
END;

-- Add updated_at trigger to automatically update timestamp
IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_pms_odoo_cache_updated_at')
BEGIN
    EXEC('
    CREATE TRIGGER TR_pms_odoo_cache_updated_at
    ON [dbo].[pms_odoo_cache]
    AFTER UPDATE
    AS
    BEGIN
        UPDATE [dbo].[pms_odoo_cache]
        SET [updated_at] = GETDATE()
        WHERE [id] IN (SELECT [id] FROM inserted);
    END;
    ');
    PRINT 'Created updated_at trigger for pms_odoo_cache';
END
ELSE
BEGIN
    PRINT 'updated_at trigger for pms_odoo_cache already exists';
END;
