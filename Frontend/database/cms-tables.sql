-- CMS (Content Management System) tables
-- Stores pages, content, images, and announcements

-- Pages table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cms_pages')
BEGIN
    CREATE TABLE cms_pages (
        id INT IDENTITY(1,1) PRIMARY KEY,
        slug NVARCHAR(255) NOT NULL UNIQUE,
        title NVARCHAR(500) NOT NULL,
        content NVARCHAR(MAX), -- HTML content
        meta_description NVARCHAR(500),
        meta_keywords NVARCHAR(500),
        is_published BIT NOT NULL DEFAULT 0,
        published_at DATETIME2 NULL,
        created_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_by INT NULL,
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (updated_by) REFERENCES users(id)
    );

    CREATE INDEX IX_cms_pages_slug ON cms_pages(slug);
    CREATE INDEX IX_cms_pages_published ON cms_pages(is_published);
    
    PRINT 'CMS pages table created successfully';
END
ELSE
BEGIN
    PRINT 'CMS pages table already exists';
END

-- Images table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cms_images')
BEGIN
    CREATE TABLE cms_images (
        id INT IDENTITY(1,1) PRIMARY KEY,
        filename NVARCHAR(500) NOT NULL,
        original_filename NVARCHAR(500) NOT NULL,
        file_path NVARCHAR(1000) NOT NULL,
        file_size INT NOT NULL,
        mime_type NVARCHAR(100) NOT NULL,
        width INT NULL,
        height INT NULL,
        alt_text NVARCHAR(500),
        uploaded_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );

    CREATE INDEX IX_cms_images_filename ON cms_images(filename);
    CREATE INDEX IX_cms_images_uploaded_by ON cms_images(uploaded_by);
    
    PRINT 'CMS images table created successfully';
END
ELSE
BEGIN
    PRINT 'CMS images table already exists';
END

-- Announcements/Banners table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cms_announcements')
BEGIN
    CREATE TABLE cms_announcements (
        id INT IDENTITY(1,1) PRIMARY KEY,
        title NVARCHAR(500) NOT NULL,
        content NVARCHAR(MAX),
        image_id INT NULL,
        link_url NVARCHAR(1000),
        link_text NVARCHAR(200),
        start_date DATETIME2 NULL,
        end_date DATETIME2 NULL,
        is_active BIT NOT NULL DEFAULT 1,
        display_order INT NOT NULL DEFAULT 0,
        created_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_by INT NULL,
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (image_id) REFERENCES cms_images(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (updated_by) REFERENCES users(id)
    );

    CREATE INDEX IX_cms_announcements_active ON cms_announcements(is_active);
    CREATE INDEX IX_cms_announcements_dates ON cms_announcements(start_date, end_date);
    
    PRINT 'CMS announcements table created successfully';
END
ELSE
BEGIN
    PRINT 'CMS announcements table already exists';
END

-- Navigation menu items table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cms_menu_items')
BEGIN
    CREATE TABLE cms_menu_items (
        id INT IDENTITY(1,1) PRIMARY KEY,
        label NVARCHAR(200) NOT NULL,
        url NVARCHAR(1000) NOT NULL,
        icon NVARCHAR(100),
        parent_id INT NULL,
        display_order INT NOT NULL DEFAULT 0,
        is_active BIT NOT NULL DEFAULT 1,
        target_blank BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (parent_id) REFERENCES cms_menu_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_cms_menu_items_parent ON cms_menu_items(parent_id);
    CREATE INDEX IX_cms_menu_items_order ON cms_menu_items(display_order);
    
    PRINT 'CMS menu items table created successfully';
END
ELSE
BEGIN
    PRINT 'CMS menu items table already exists';
END

