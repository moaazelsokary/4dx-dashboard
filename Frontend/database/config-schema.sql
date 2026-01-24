-- Configuration System Database Schema
-- Creates tables for field locks, activity logs, and user permissions
-- All tables link to existing users and departments tables via FOREIGN KEY constraints

-- 1. Field Locks Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'field_locks')
BEGIN
    CREATE TABLE field_locks (
        id INT IDENTITY(1,1) PRIMARY KEY,
        lock_type NVARCHAR(50) NOT NULL, -- 'target', 'monthly_target', 'monthly_actual', or combinations, or 'all_department_objectives'
        scope_type NVARCHAR(50) NOT NULL, -- 'all_users', 'specific_users', 'specific_kpi', 'department_kpi', 'all_department_objectives'
        user_ids NVARCHAR(MAX) NULL, -- JSON array of user IDs (for specific_users or all_department_objectives scope)
        kpi NVARCHAR(500) NULL, -- For specific_kpi or department_kpi scope
        department_id INT NULL, -- For department_kpi scope - Links to existing departments table
        exclude_monthly BIT NOT NULL DEFAULT 0, -- For all_department_objectives: exclude monthly_target and monthly_actual
        exclude_annual_target BIT NOT NULL DEFAULT 0, -- For all_department_objectives: exclude activity_target (annual target)
        is_active BIT NOT NULL DEFAULT 1,
        created_by INT NOT NULL, -- User who created the lock - Links to existing users table
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (department_id) REFERENCES departments(id), -- Links to existing departments table
        FOREIGN KEY (created_by) REFERENCES users(id) -- Links to existing users table
    );
    
    CREATE INDEX IX_field_locks_scope_type ON field_locks(scope_type);
    CREATE INDEX IX_field_locks_department_id ON field_locks(department_id);
    CREATE INDEX IX_field_locks_kpi ON field_locks(kpi);
    CREATE INDEX IX_field_locks_is_active ON field_locks(is_active);
    CREATE INDEX IX_field_locks_created_by ON field_locks(created_by);
    
    PRINT 'Field locks table created successfully';
END
ELSE
BEGIN
    PRINT 'Field locks table already exists';
END

-- 2. Activity Logs Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'activity_logs')
BEGIN
    CREATE TABLE activity_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL, -- Links to existing users table
        username NVARCHAR(100) NOT NULL, -- Denormalized for performance (from users table)
        action_type NVARCHAR(50) NOT NULL, -- 'lock_created', 'lock_deleted', 'value_edited', etc.
        target_field NVARCHAR(50) NULL, -- 'target', 'monthly_target', 'monthly_actual'
        old_value DECIMAL(18,2) NULL,
        new_value DECIMAL(18,2) NULL,
        kpi NVARCHAR(500) NULL,
        department_id INT NULL, -- Links to existing departments table
        department_name NVARCHAR(100) NULL, -- Denormalized for performance (from departments table)
        department_objective_id INT NULL, -- Links to existing department_objectives table
        month DATE NULL, -- For monthly data edits
        metadata NVARCHAR(MAX) NULL, -- JSON for additional context
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES users(id), -- Links to existing users table
        FOREIGN KEY (department_id) REFERENCES departments(id), -- Links to existing departments table
        FOREIGN KEY (department_objective_id) REFERENCES department_objectives(id) -- Links to existing department_objectives table
    );
    
    CREATE INDEX IX_activity_logs_user_id ON activity_logs(user_id);
    CREATE INDEX IX_activity_logs_action_type ON activity_logs(action_type);
    CREATE INDEX IX_activity_logs_created_at ON activity_logs(created_at);
    CREATE INDEX IX_activity_logs_department_id ON activity_logs(department_id);
    CREATE INDEX IX_activity_logs_kpi ON activity_logs(kpi);
    CREATE INDEX IX_activity_logs_department_objective_id ON activity_logs(department_objective_id);
    
    PRINT 'Activity logs table created successfully';
END
ELSE
BEGIN
    PRINT 'Activity logs table already exists';
END

-- 3. User Permissions Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'user_permissions')
BEGIN
    CREATE TABLE user_permissions (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL, -- Links to existing users table
        department_id INT NULL, -- NULL means all departments - Links to existing departments table
        kpi NVARCHAR(500) NULL, -- NULL means all KPIs
        can_view BIT NOT NULL DEFAULT 1,
        can_edit_target BIT NOT NULL DEFAULT 0,
        can_edit_monthly_target BIT NOT NULL DEFAULT 0,
        can_edit_monthly_actual BIT NOT NULL DEFAULT 0,
        can_view_reports BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES users(id), -- Links to existing users table
        FOREIGN KEY (department_id) REFERENCES departments(id), -- Links to existing departments table
        UNIQUE(user_id, department_id, kpi)
    );
    
    CREATE INDEX IX_user_permissions_user_id ON user_permissions(user_id);
    CREATE INDEX IX_user_permissions_department_id ON user_permissions(department_id);
    CREATE INDEX IX_user_permissions_kpi ON user_permissions(kpi);
    
    PRINT 'User permissions table created successfully';
END
ELSE
BEGIN
    PRINT 'User permissions table already exists';
END
