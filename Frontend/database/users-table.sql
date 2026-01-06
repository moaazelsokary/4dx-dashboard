-- Users table for secure authentication
-- This table stores user accounts with hashed passwords

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
BEGIN
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(100) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        role NVARCHAR(50) NOT NULL DEFAULT 'Viewer',
        departments NVARCHAR(MAX), -- JSON array or comma-separated list
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        last_login DATETIME2 NULL,
        failed_login_attempts INT NOT NULL DEFAULT 0,
        locked_until DATETIME2 NULL
    );

    -- Index for username lookups
    CREATE INDEX IX_users_username ON users(username);
    
    -- Index for role lookups
    CREATE INDEX IX_users_role ON users(role);
    
    PRINT 'Users table created successfully';
END
ELSE
BEGIN
    PRINT 'Users table already exists';
END

-- User roles table (optional, for more granular permissions)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'user_roles')
BEGIN
    CREATE TABLE user_roles (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        role_name NVARCHAR(50) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, role_name)
    );
    
    CREATE INDEX IX_user_roles_user_id ON user_roles(user_id);
    CREATE INDEX IX_user_roles_role_name ON user_roles(role_name);
    
    PRINT 'User roles table created successfully';
END
ELSE
BEGIN
    PRINT 'User roles table already exists';
END

