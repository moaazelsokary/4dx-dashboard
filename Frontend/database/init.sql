-- WIG Plan System Database Schema
-- SQL Server Database Initialization Script

-- 1. Departments Table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[departments]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[departments] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [name] NVARCHAR(100) NOT NULL UNIQUE,
        [code] NVARCHAR(50) NOT NULL UNIQUE,
        [created_at] DATETIME NOT NULL DEFAULT GETDATE()
    );
    
    CREATE INDEX IX_departments_code ON [dbo].[departments]([code]);
END;

-- 2. Main Plan Objectives Table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[main_plan_objectives]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[main_plan_objectives] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [pillar] NVARCHAR(255) NOT NULL,
        [objective] NVARCHAR(500) NOT NULL,
        [target] NVARCHAR(500) NOT NULL,
        [kpi] NVARCHAR(500) NOT NULL,
        [annual_target] DECIMAL(18,2) NOT NULL,
        [created_at] DATETIME NOT NULL DEFAULT GETDATE(),
        [updated_at] DATETIME NOT NULL DEFAULT GETDATE()
    );
    
    CREATE INDEX IX_main_plan_objectives_pillar ON [dbo].[main_plan_objectives]([pillar]);
    CREATE INDEX IX_main_plan_objectives_objective ON [dbo].[main_plan_objectives]([objective]);
    CREATE INDEX IX_main_plan_objectives_target ON [dbo].[main_plan_objectives]([target]);
    CREATE INDEX IX_main_plan_objectives_kpi ON [dbo].[main_plan_objectives]([kpi]);
END;

-- 3. RASCI Metrics Table (Linked to KPI)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[rasci_metrics]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[rasci_metrics] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [kpi] NVARCHAR(500) NOT NULL,
        [department] NVARCHAR(100) NOT NULL,
        [responsible] BIT NOT NULL DEFAULT 0,
        [accountable] BIT NOT NULL DEFAULT 0,
        [supportive] BIT NOT NULL DEFAULT 0,
        [consulted] BIT NOT NULL DEFAULT 0,
        [informed] BIT NOT NULL DEFAULT 0,
        [created_at] DATETIME NOT NULL DEFAULT GETDATE(),
        [updated_at] DATETIME NOT NULL DEFAULT GETDATE(),
        UNIQUE ([kpi], [department])
    );
    
    CREATE INDEX IX_rasci_metrics_kpi ON [dbo].[rasci_metrics]([kpi]);
    CREATE INDEX IX_rasci_metrics_department ON [dbo].[rasci_metrics]([department]);
END;

-- 4. Department Objectives Table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[department_objectives]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[department_objectives] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [main_objective_id] INT NULL,
        [department_id] INT NOT NULL,
        [kpi] NVARCHAR(500) NOT NULL,
        [activity] NVARCHAR(1000) NOT NULL,
        [type] NVARCHAR(50) NOT NULL CHECK ([type] IN ('Direct', 'In direct')),
        [activity_target] DECIMAL(18,2) NOT NULL,
        [responsible_person] NVARCHAR(255) NOT NULL,
        [mov] NVARCHAR(500) NOT NULL,
        [created_at] DATETIME NOT NULL DEFAULT GETDATE(),
        [updated_at] DATETIME NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY ([main_objective_id]) REFERENCES [dbo].[main_plan_objectives]([id]) ON DELETE SET NULL,
        FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments]([id]) ON DELETE CASCADE
    );
    
    CREATE INDEX IX_department_objectives_main_objective_id ON [dbo].[department_objectives]([main_objective_id]);
    CREATE INDEX IX_department_objectives_department_id ON [dbo].[department_objectives]([department_id]);
    CREATE INDEX IX_department_objectives_kpi ON [dbo].[department_objectives]([kpi]);
    CREATE INDEX IX_department_objectives_type ON [dbo].[department_objectives]([type]);
    CREATE INDEX IX_department_objectives_kpi_type ON [dbo].[department_objectives]([kpi], [type]);
END;

-- 5. Department Monthly Data Table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[department_monthly_data]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[department_monthly_data] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [department_objective_id] INT NOT NULL,
        [month] DATE NOT NULL,
        [target_value] DECIMAL(18,2) NULL,
        [actual_value] DECIMAL(18,2) NULL,
        [created_at] DATETIME NOT NULL DEFAULT GETDATE(),
        [updated_at] DATETIME NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY ([department_objective_id]) REFERENCES [dbo].[department_objectives]([id]) ON DELETE CASCADE,
        UNIQUE ([department_objective_id], [month])
    );
    
    CREATE INDEX IX_department_monthly_data_dept_obj_id ON [dbo].[department_monthly_data]([department_objective_id]);
    CREATE INDEX IX_department_monthly_data_month ON [dbo].[department_monthly_data]([month]);
END;

-- 6. Plan Checkers Table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[plan_checkers]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[plan_checkers] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [objective_id] INT NOT NULL,
        [planned_status] NVARCHAR(50) NOT NULL CHECK ([planned_status] IN ('covered', 'not_covered')),
        [annual_target_status] NVARCHAR(50) NOT NULL CHECK ([annual_target_status] IN ('ok', 'above', 'less')),
        [annual_target_variance] DECIMAL(18,2) NULL,
        [last_checked_at] DATETIME NOT NULL DEFAULT GETDATE(),
        [created_at] DATETIME NOT NULL DEFAULT GETDATE(),
        [updated_at] DATETIME NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY ([objective_id]) REFERENCES [dbo].[main_plan_objectives]([id]) ON DELETE CASCADE,
        UNIQUE ([objective_id])
    );
    
    CREATE INDEX IX_plan_checkers_objective_id ON [dbo].[plan_checkers]([objective_id]);
END;

-- Insert initial departments data
IF NOT EXISTS (SELECT * FROM [dbo].[departments] WHERE [code] = 'hr')
BEGIN
    INSERT INTO [dbo].[departments] ([name], [code]) VALUES
    ('Human Resources', 'hr'),
    ('Information Technology', 'it'),
    ('Operations', 'operations'),
    ('Communication', 'communication'),
    ('DFR', 'dfr'),
    ('Case Management', 'case'),
    ('Business Development', 'bdm'),
    ('Security', 'security'),
    ('Administration', 'admin'),
    ('Procurement', 'procurement'),
    ('Offices', 'offices'),
    ('Community', 'community');
END;

-- Create trigger to update updated_at timestamp
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_main_plan_objectives_updated_at]') AND type = 'TR')
BEGIN
    EXEC('
    CREATE TRIGGER [dbo].[TR_main_plan_objectives_updated_at]
    ON [dbo].[main_plan_objectives]
    AFTER UPDATE
    AS
    BEGIN
        UPDATE [dbo].[main_plan_objectives]
        SET [updated_at] = GETDATE()
        FROM [dbo].[main_plan_objectives] m
        INNER JOIN inserted i ON m.[id] = i.[id]
    END
    ');
END;

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_rasci_metrics_updated_at]') AND type = 'TR')
BEGIN
    EXEC('
    CREATE TRIGGER [dbo].[TR_rasci_metrics_updated_at]
    ON [dbo].[rasci_metrics]
    AFTER UPDATE
    AS
    BEGIN
        UPDATE [dbo].[rasci_metrics]
        SET [updated_at] = GETDATE()
        FROM [dbo].[rasci_metrics] r
        INNER JOIN inserted i ON r.[id] = i.[id]
    END
    ');
END;

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_department_objectives_updated_at]') AND type = 'TR')
BEGIN
    EXEC('
    CREATE TRIGGER [dbo].[TR_department_objectives_updated_at]
    ON [dbo].[department_objectives]
    AFTER UPDATE
    AS
    BEGIN
        UPDATE [dbo].[department_objectives]
        SET [updated_at] = GETDATE()
        FROM [dbo].[department_objectives] d
        INNER JOIN inserted i ON d.[id] = i.[id]
    END
    ');
END;

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_department_monthly_data_updated_at]') AND type = 'TR')
BEGIN
    EXEC('
    CREATE TRIGGER [dbo].[TR_department_monthly_data_updated_at]
    ON [dbo].[department_monthly_data]
    AFTER UPDATE
    AS
    BEGIN
        UPDATE [dbo].[department_monthly_data]
        SET [updated_at] = GETDATE()
        FROM [dbo].[department_monthly_data] d
        INNER JOIN inserted i ON d.[id] = i.[id]
    END
    ');
END;

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_plan_checkers_updated_at]') AND type = 'TR')
BEGIN
    EXEC('
    CREATE TRIGGER [dbo].[TR_plan_checkers_updated_at]
    ON [dbo].[plan_checkers]
    AFTER UPDATE
    AS
    BEGIN
        UPDATE [dbo].[plan_checkers]
        SET [updated_at] = GETDATE()
        FROM [dbo].[plan_checkers] p
        INNER JOIN inserted i ON p.[id] = i.[id]
    END
    ');
END;

