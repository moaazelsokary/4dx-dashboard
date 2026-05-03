-- Database triggers to sync RASCI metrics with main_plan_objectives
-- When a KPI is added to main_plan_objectives, create blank RASCI entries for all departments
-- When a KPI is removed from main_plan_objectives, remove all RASCI entries for that KPI

-- Drop existing triggers if they exist
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_main_plan_objectives_insert_rasci]') AND type = 'TR')
BEGIN
    DROP TRIGGER [dbo].[TR_main_plan_objectives_insert_rasci];
END;

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_main_plan_objectives_delete_rasci]') AND type = 'TR')
BEGIN
    DROP TRIGGER [dbo].[TR_main_plan_objectives_delete_rasci];
END;

-- Trigger to create blank RASCI entries when a new KPI is added
GO
CREATE TRIGGER [dbo].[TR_main_plan_objectives_insert_rasci]
ON [dbo].[main_plan_objectives]
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Insert blank RASCI entries for all departments for each new KPI
    INSERT INTO [dbo].[rasci_metrics] (kpi, department, responsible, accountable, supportive, consulted, informed, created_at, updated_at)
    SELECT 
        i.kpi,
        d.name,
        0, -- responsible = false
        0, -- accountable = false
        0, -- supportive = false
        0, -- consulted = false
        0, -- informed = false
        GETDATE(),
        GETDATE()
    FROM inserted i
    CROSS JOIN [dbo].[departments] d
    WHERE NOT EXISTS (
        SELECT 1 
        FROM [dbo].[rasci_metrics] rm 
        WHERE rm.kpi = i.kpi AND rm.department = d.name
    );
END;
GO

-- Trigger to delete RASCI entries when a KPI is removed
GO
CREATE TRIGGER [dbo].[TR_main_plan_objectives_delete_rasci]
ON [dbo].[main_plan_objectives]
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Delete all RASCI entries for the deleted KPI(s)
    DELETE FROM [dbo].[rasci_metrics]
    WHERE kpi IN (SELECT kpi FROM deleted);
END;
GO

-- Also handle UPDATE case: if KPI name changes, update rasci_metrics accordingly
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_main_plan_objectives_update_rasci]') AND type = 'TR')
BEGIN
    DROP TRIGGER [dbo].[TR_main_plan_objectives_update_rasci];
END;

GO
CREATE TRIGGER [dbo].[TR_main_plan_objectives_update_rasci]
ON [dbo].[main_plan_objectives]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Only process if KPI name actually changed
    IF UPDATE(kpi)
    BEGIN
        BEGIN TRY
            -- Update all RASCI entries with the new KPI name where KPI changed
            UPDATE rm
            SET rm.kpi = i.kpi,
                rm.updated_at = GETDATE()
            FROM [dbo].[rasci_metrics] rm
            INNER JOIN deleted d ON rm.kpi = d.kpi
            INNER JOIN inserted i ON d.id = i.id
            WHERE d.kpi <> i.kpi;
            
            -- For departments that don't have entries for the new KPI, create blank entries
            INSERT INTO [dbo].[rasci_metrics] (kpi, department, responsible, accountable, supportive, consulted, informed, created_at, updated_at)
            SELECT 
                i.kpi,
                d.name,
                0, -- responsible = false
                0, -- accountable = false
                0, -- supportive = false
                0, -- consulted = false
                0, -- informed = false
                GETDATE(),
                GETDATE()
            FROM inserted i
            CROSS JOIN [dbo].[departments] d
            WHERE NOT EXISTS (
                SELECT 1 
                FROM [dbo].[rasci_metrics] rm 
                WHERE rm.kpi = i.kpi AND rm.department = d.name
            )
            AND EXISTS (
                SELECT 1 
                FROM deleted d2 
                WHERE d2.id = i.id AND d2.kpi <> i.kpi
            );
        END TRY
        BEGIN CATCH
            -- Log error but don't fail the update
            -- The trigger should not prevent the main update from succeeding
            PRINT 'Error in RASCI update trigger: ' + ERROR_MESSAGE();
        END CATCH
    END;
END;
GO

PRINT 'RASCI sync triggers created successfully!';

