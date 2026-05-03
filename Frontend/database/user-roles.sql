-- User roles extension
-- Extends the users table to support Admin, Editor, Viewer roles

-- Update users table if needed (add role column if it doesn't exist)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'role')
BEGIN
    ALTER TABLE users ADD role NVARCHAR(50) NOT NULL DEFAULT 'Viewer';
    PRINT 'Role column added to users table';
END
ELSE
BEGIN
    PRINT 'Role column already exists';
END

-- Create role permissions table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'role_permissions')
BEGIN
    CREATE TABLE role_permissions (
        id INT IDENTITY(1,1) PRIMARY KEY,
        role_name NVARCHAR(50) NOT NULL,
        permission_name NVARCHAR(100) NOT NULL,
        resource NVARCHAR(100) NOT NULL,
        can_create BIT NOT NULL DEFAULT 0,
        can_read BIT NOT NULL DEFAULT 1,
        can_update BIT NOT NULL DEFAULT 0,
        can_delete BIT NOT NULL DEFAULT 0,
        UNIQUE(role_name, permission_name, resource)
    );

    CREATE INDEX IX_role_permissions_role ON role_permissions(role_name);
    
    -- Insert default permissions
    -- Admin: Full access
    INSERT INTO role_permissions (role_name, permission_name, resource, can_create, can_read, can_update, can_delete)
    VALUES 
        ('Admin', 'all', 'all', 1, 1, 1, 1),
        ('Admin', 'users', 'users', 1, 1, 1, 1),
        ('Admin', 'content', 'cms', 1, 1, 1, 1),
        ('Admin', 'settings', 'system', 1, 1, 1, 1);
    
    -- Editor: Can edit content
    INSERT INTO role_permissions (role_name, permission_name, resource, can_create, can_read, can_update, can_delete)
    VALUES 
        ('Editor', 'content', 'cms', 1, 1, 1, 0),
        ('Editor', 'pages', 'cms_pages', 1, 1, 1, 0),
        ('Editor', 'announcements', 'cms_announcements', 1, 1, 1, 0);
    
    -- Viewer: Read-only
    INSERT INTO role_permissions (role_name, permission_name, resource, can_create, can_read, can_update, can_delete)
    VALUES 
        ('Viewer', 'content', 'cms', 0, 1, 0, 0),
        ('Viewer', 'pages', 'cms_pages', 0, 1, 0, 0),
        ('Viewer', 'announcements', 'cms_announcements', 0, 1, 0, 0);
    
    -- CEO: Full access (same as Admin)
    INSERT INTO role_permissions (role_name, permission_name, resource, can_create, can_read, can_update, can_delete)
    SELECT 'CEO', permission_name, resource, can_create, can_read, can_update, can_delete
    FROM role_permissions WHERE role_name = 'Admin';
    
    PRINT 'Role permissions table created and populated';
END
ELSE
BEGIN
    PRINT 'Role permissions table already exists';
END

