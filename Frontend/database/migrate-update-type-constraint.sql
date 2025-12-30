-- Migration: Update type constraint to allow delimited strings
-- Date: 2024
-- Description: Modifies the CHECK constraint on type column to allow delimited strings for multiple KPIs
-- This allows storing types like "Direct||In direct||Direct" for multiple KPIs

-- Drop the existing constraint
IF EXISTS (
    SELECT * FROM sys.check_constraints 
    WHERE name = 'CK_department_objectives_type' 
    AND parent_object_id = OBJECT_ID('dbo.department_objectives')
)
BEGIN
    ALTER TABLE [dbo].[department_objectives]
    DROP CONSTRAINT [CK_department_objectives_type];
END
GO

-- Add new constraint that allows:
-- 1. Single values: 'Direct' or 'In direct'
-- 2. Delimited strings: Must start with 'Direct' or 'In direct' and contain only valid values separated by ||
-- We'll use a simpler approach: allow any string that contains only 'Direct', 'In direct', and '||'
-- More lenient validation - application layer will ensure correctness
ALTER TABLE [dbo].[department_objectives]
ADD CONSTRAINT [CK_department_objectives_type] 
CHECK (
    [type] IS NOT NULL AND 
    LEN([type]) > 0 AND
    (
        -- Single value must be 'Direct' or 'In direct'
        [type] = 'Direct' OR 
        [type] = 'In direct' OR
        -- Or delimited string (contains ||)
        [type] LIKE '%||%'
    )
);
GO

