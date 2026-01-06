require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const getEnv = (key) => {
  const value = process.env[key];
  return value ? value.trim().replace(/^["']|["']$/g, '') : undefined;
};

const serverValue = getEnv('SERVER') || getEnv('VITE_SERVER') || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID'),
  password: getEnv('PWD') || getEnv('VITE_PWD') || getEnv('DB_PASSWORD'),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function createMenuItemsTable() {
  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Check if table exists
    const checkResult = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM sys.tables 
      WHERE name = 'cms_menu_items'
    `);

    if (checkResult.recordset[0].count > 0) {
      console.log('✅ Table cms_menu_items already exists');
      await pool.close();
      return;
    }

    // Create table without foreign key first
    await pool.request().query(`
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
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      );
    `);

    console.log('✅ Table cms_menu_items created');

    // Add foreign key constraint after table is created (if it doesn't exist)
    try {
      await pool.request().query(`
        IF NOT EXISTS (
          SELECT * FROM sys.foreign_keys 
          WHERE name = 'FK_cms_menu_items_parent'
        )
        BEGIN
          ALTER TABLE cms_menu_items
          ADD CONSTRAINT FK_cms_menu_items_parent 
          FOREIGN KEY (parent_id) REFERENCES cms_menu_items(id) ON DELETE CASCADE;
        END
      `);
      console.log('✅ Foreign key constraint added');
    } catch (fkError) {
      if (fkError.message.includes('already exists') || fkError.message.includes('There is already')) {
        console.log('⚠️  Foreign key constraint already exists - this is okay');
      } else {
        console.log('⚠️  Could not add foreign key constraint:', fkError.message.split('\n')[0]);
        console.log('   Table created without foreign key - you can add it manually if needed');
      }
    }

    // Create indexes
    await pool.request().query(`
      CREATE INDEX IX_cms_menu_items_parent ON cms_menu_items(parent_id);
      CREATE INDEX IX_cms_menu_items_order ON cms_menu_items(display_order);
    `);

    console.log('✅ Indexes created');
    console.log('\n✅ cms_menu_items table setup completed successfully!');
    
    await pool.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('already exists')) {
      console.log('⚠️  Table or constraint already exists - this is okay');
    } else {
      process.exit(1);
    }
  }
}

createMenuItemsTable();

