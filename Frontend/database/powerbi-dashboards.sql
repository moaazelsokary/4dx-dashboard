-- Catalog of Power BI dashboards (embed URLs and labels). Admins manage rows; users.powerbi_dashboard_ids references id here.
-- Run once against the application database.

IF OBJECT_ID('dbo.powerbi_dashboards', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.powerbi_dashboards (
    id NVARCHAR(64) NOT NULL CONSTRAINT PK_powerbi_dashboards PRIMARY KEY,
    name NVARCHAR(256) NOT NULL,
    title NVARCHAR(512) NOT NULL,
    embed_url NVARCHAR(MAX) NOT NULL CONSTRAINT DF_powerbi_dashboards_embed DEFAULT (''),
    sort_order INT NOT NULL CONSTRAINT DF_powerbi_dashboards_sort DEFAULT (0),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_powerbi_dashboards_created DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_powerbi_dashboards_updated DEFAULT (SYSUTCDATETIME())
  );
END
