-- Extend users table for per-user default route, route overrides, and Power BI dashboard overrides
-- Run once against the application database.

IF COL_LENGTH('dbo.users', 'default_route') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD default_route NVARCHAR(512) NULL;
END

IF COL_LENGTH('dbo.users', 'allowed_routes') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD allowed_routes NVARCHAR(MAX) NULL;
END

IF COL_LENGTH('dbo.users', 'powerbi_dashboard_ids') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD powerbi_dashboard_ids NVARCHAR(MAX) NULL;
END
