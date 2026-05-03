-- Migration: Create derived_metrics table for manually-defined sum metrics
-- Admin users can define metrics that sum 2+ existing PMS or Odoo metrics

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[derived_metrics]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[derived_metrics] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [project_name] NVARCHAR(255) NOT NULL,
        [source] NVARCHAR(20) NOT NULL CHECK ([source] IN ('odoo', 'pms', 'odoo & pms')),
        [definition] NVARCHAR(MAX) NOT NULL, -- JSON: [{ source, project, metric? }]
        [created_at] DATETIME NOT NULL DEFAULT GETDATE(),
        [created_by] NVARCHAR(100) NULL
    );

    CREATE INDEX IX_derived_metrics_project_name ON [dbo].[derived_metrics]([project_name]);
    CREATE INDEX IX_derived_metrics_source ON [dbo].[derived_metrics]([source]);

    PRINT 'Created derived_metrics table';
END
ELSE
BEGIN
    PRINT 'derived_metrics table already exists';
END;
