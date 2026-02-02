-- Minimal migration: drop old (kpi, department_id, month) unique constraint
-- and add (department_objective_id, month) so each objective has its own row per month.
-- Use this if you already have department_objective_id populated and only need to fix the unique key.
-- Otherwise run the full migrate-monthly-data-to-objective-id.sql.

-- Drop old unique constraint
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_department_monthly_data_kpi_dept_month')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    DROP CONSTRAINT UQ_department_monthly_data_kpi_dept_month;
    PRINT 'Dropped UQ_department_monthly_data_kpi_dept_month';
END;
GO

-- Add new unique constraint
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_department_monthly_data_dept_obj_month')
BEGIN
    ALTER TABLE [dbo].[department_monthly_data]
    ADD CONSTRAINT UQ_department_monthly_data_dept_obj_month
    UNIQUE ([department_objective_id], [month]);
    PRINT 'Added UQ_department_monthly_data_dept_obj_month';
END;
GO

PRINT 'Migration completed: department_monthly_data unique key is now (department_objective_id, month).';
