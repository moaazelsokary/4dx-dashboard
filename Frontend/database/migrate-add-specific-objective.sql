-- Migration: Add department_objective_id column for specific_objective scope type
-- This allows locking a specific department objective in a specific department

-- Check if column already exists
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('field_locks') 
    AND name = 'department_objective_id'
)
BEGIN
    ALTER TABLE field_locks 
    ADD department_objective_id INT NULL;
    
    -- Add foreign key constraint
    ALTER TABLE field_locks
    ADD CONSTRAINT FK_field_locks_department_objective_id 
    FOREIGN KEY (department_objective_id) REFERENCES department_objectives(id);
    
    -- Add index for performance
    CREATE INDEX IX_field_locks_department_objective_id 
    ON field_locks(department_objective_id);
    
    PRINT 'Added department_objective_id column to field_locks table';
END
ELSE
BEGIN
    PRINT 'department_objective_id column already exists in field_locks table';
END
